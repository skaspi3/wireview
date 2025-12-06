import { computed, reactive, shallowReactive } from "vue";
import SharkWorker from "../worker.js?no-inline&url";

class Bridge {
  #core;
  #state;
  #shallowState;

  constructor() {
    this.#core = {
      worker: null,
      callbacks: new Map(),
    };

    this.#state = reactive({
      activeRequests: new Map(),

      // computed
      activeRequest: null,
      initialized: false,
      initializationError: "",
      columns: [],
    });

    this.#shallowState = shallowReactive({
      initializationResult: null,
    });

    this.#state.activeRequest = computed(
      () => this.#state.activeRequests.values().next().value ?? null
    );

    this.#state.initialized = computed(
      () => this.#shallowState.initializationResult?.success ?? false
    );
    this.#state.initializationError = computed(
      () => this.#shallowState.initializationResult?.error ?? "Unknown"
    );
    this.#state.columns = computed(
      () => this.#shallowState.initializationResult?.columns ?? []
    );
  }

  get initialized() {
    return this.#state.initialized;
  }

  get initializationError() {
    return this.#state.initializationError;
  }

  get columns() {
    return this.#state.columns;
  }

  get activeRequest() {
    return this.#state.activeRequest;
  }

  initialize() {
    this.#core.worker = new Worker(SharkWorker);
    this.#core.worker.addEventListener("message", (e) =>
      this.#processMessage(e)
    );
  }

  deinitialize() {
    this.#core.worker.terminate();
    this.#shallowState.initializationResult = null;
  }

  // Forcefully restart the worker - use when you need to cancel all pending operations
  async restart() {
    console.log("Bridge: Restarting worker...");

    // Reject all pending callbacks
    for (const [id, callback] of this.#core.callbacks) {
      callback({ id, error: "Worker restarted", cancelled: true });
    }
    this.#core.callbacks.clear();
    this.#state.activeRequests.clear();

    // Terminate the old worker
    if (this.#core.worker) {
      this.#core.worker.terminate();
    }
    this.#shallowState.initializationResult = null;

    // Create a new worker
    this.#core.worker = new Worker(SharkWorker);
    this.#core.worker.addEventListener("message", (e) =>
      this.#processMessage(e)
    );

    // Wait for initialization to complete
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Worker init timeout"));
      }, 30000);

      const checkInit = () => {
        if (this.#state.initialized) {
          clearTimeout(timeout);
          console.log("Bridge: Worker restarted successfully");
          resolve();
        } else if (this.#shallowState.initializationResult?.error) {
          clearTimeout(timeout);
          reject(new Error(this.#state.initializationError));
        } else {
          setTimeout(checkInit, 100);
        }
      };
      checkInit();
    });
  }

  #processMessage({ data }) {
    const req = this.#state.activeRequests.get(data.id);
    if (req) {
      const timeTaken = Date.now() - req.timestamp;
      this.#state.activeRequests.delete(data.id);
      console.log(timeTaken + "ms", data);
    } else console.log(data);

    if (data.type === "init") this.#shallowState.initializationResult = data;

    this.#core.callbacks.get(data.id)?.(data);
    this.#core.callbacks.delete(data.id);
  }

  #postMessage(data) {
    data.id = crypto.randomUUID();
    const req = { timestamp: Date.now(), type: data.type };
    this.#state.activeRequests.set(data.id, req);
    const promise = new Promise((resolve) =>
      this.#core.callbacks.set(data.id, resolve)
    );
    this.#core.worker.postMessage(data);
    return promise;
  }

  async getFrame(number) {
    const { frame } = await this.#postMessage({
      type: "frame",
      number,
    });
    return frame;
  }

  async getFrames(filter, skip, limit) {
    const response = await this.#postMessage({
      type: "frames",
      filter,
      skip,
      limit,
    });
    // Handle cancelled operations
    if (response.cancelled) {
      return [];
    }
    return response.frames;
  }

  async findFrame(params) {
    const { result } = await this.#postMessage({
      type: "find",
      params,
    });
    return result;
  }

  async checkFilter(filter) {
    const { result } = await this.#postMessage({
      type: "check-filter",
      filter,
    });
    return result;
  }

  async createSession(file) {
    const response = await this.#postMessage({ type: "open", file });
    // Handle cancelled operations (worker was restarted)
    if (response.cancelled) {
      return { cancelled: true };
    }
    return response.result;
  }

  async closeSession() {
    const response = await this.#postMessage({ type: "close" });
    // Ignore if cancelled
    return response.cancelled ? { cancelled: true } : response;
  }
}

export default Bridge;
