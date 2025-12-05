importScripts("/wiregasm.js");

const fetchBuffer = async (url) => {
  const response = await fetch(url);
  return await response.arrayBuffer();
};

const vecToArray = (vec) =>
  Array.from({ length: vec.size() }, (_, i) => vec.get(i));

const devectorize = (obj) => {
  if (obj === null) return null;

  if (obj?.constructor?.name?.startsWith("Vector"))
    // need to devectorize again because of nested Vectors
    obj = devectorize(vecToArray(obj));

  // check if iterable
  if (obj?.entries?.()?.[Symbol.iterator] === "function")
    for (const [i, item] of obj.entries()) obj[i] = devectorize(item);
  else if (typeof obj === "object")
    for (const [i, item] of Object.entries(obj)) obj[i] = devectorize(item);

  return obj;
};

let sharky = null;
let session = null;

// Initialize Wiregasm and store the promise
const initPromise = loadWiregasm({
  locateFile: (path, prefix) => {
    console.log("locateFile", path, prefix);
    if (path.endsWith(".data")) return "/wiregasm.bmp";
    if (path.endsWith(".wasm")) return "/wiregasm.wasm";
    return prefix + path;
  },
}).then((result) => {
  result.init();
  sharky = result;
  console.log("Worker: Wiregasm initialized");
  const columns = vecToArray(sharky.getColumns());
  postMessage({ type: "init", columns, success: true });
  return result;
}).catch((error) => {
  console.error("Worker: Wiregasm failed to load", error);
  postMessage({ type: "init", error: error.toString(), success: false });
  throw error;
});

self.addEventListener("message", async ({ data }) => {
  // Wait for initialization
  if (!sharky) {
    try {
      await initPromise;
    } catch (e) {
      return; // Already handled in catch above
    }
  }

  console.debug("ahoy, worker got a message", data);

  if (data.type === "frame") {
    if (!session) {
      return postMessage({ id: data.id, frame: null, error: "No session" });
    }
    const frame = devectorize(session.getFrame(data.number));
    return postMessage({
      id: data.id,
      frame,
    });
  }

  if (data.type === "frames") {
    if (!session) {
      return postMessage({ id: data.id, frames: [], error: "No session" });
    }
    console.log(`Worker: getFrames filter='${data.filter}' skip=${data.skip} limit=${data.limit}`);
    const framesVec = session.getFrames(
      data.filter ?? "",
      data.skip ?? 0,
      data.limit ?? 0
    );
    const frames = devectorize(framesVec.frames);

    return postMessage({
      id: data.id,
      frames,
    });
  }

  if (data.type === "find") {
    return postMessage({
      id: data.id,
      result: session.findFrame(data.params),
    });
  }

  if (data.type === "check-filter") {
    return postMessage({
      id: data.id,
      result: sharky.checkFilter(data.filter),
    });
  }

  if (data.type === "open") {
    try {
      const filePath = `/uploads/${data.file.name}`;
      const arrayBuffer = await data.file.arrayBuffer();
      sharky.FS.writeFile(filePath, new Uint8Array(arrayBuffer));

      // Clean up old session if exists
      if (session) {
        try { session.delete(); } catch(e) {}
      }

      session = new sharky.DissectSession(filePath);
      console.log("Worker: Created session for", data.file.name, "size:", arrayBuffer.byteLength);

      const result = session.load();
      console.log("Worker: session.load() result:", result);

      return postMessage({
        id: data.id,
        result,
      });
    } catch (err) {
      console.error("Worker: Error in open:", err);
      return postMessage({
        id: data.id,
        result: { code: 500, error: err.toString() }
      });
    }
  }

  if (data.type === "close") {
    session?.delete();
    session = null;
    return postMessage({
      id: data.id,
      success: true,
    });
  }
});
