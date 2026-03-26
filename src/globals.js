import { ref, shallowRef } from "vue";

const CLIENT_ID_STORAGE_KEY = 'webpcap_client_id';
const createClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const clientId = (() => {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const next = createClientId();
    sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
    return next;
  } catch (e) {
    return createClientId();
  }
})();

export const apiUrl = (rawUrl) => {
  const asString = String(rawUrl || '');
  const isAbsolute = /^https?:\/\//i.test(asString);
  const parsed = isAbsolute
    ? new URL(asString)
    : new URL(asString, window.location.origin);

  if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
    if (!parsed.searchParams.has('clientId')) {
      parsed.searchParams.set('clientId', clientId);
    }
  }

  if (isAbsolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

export const apiFetch = (input, init) => fetch(apiUrl(input), init);

// Packets array - holds packet summaries received from server
export const packets = shallowRef([]);

// All packets (unfiltered) - stored separately when filter is active
export const allPackets = shallowRef([]);

// Currently selected packet index
export const activePacketIndex = ref(null);

// Currently selected packet details (fetched on demand from server)
export const activePacketDetails = shallowRef(null);

// Currently selected packet hex dump (fetched together with details)
export const activePacketHex = ref('');

// Raw hex bytes for the active packet (unparsed hex string)
export const activePacketRawHex = ref('');

// Highlighted byte range in hex dump {start: number, end: number} or null
export const highlightedByteRange = ref(null);

// Display filter state
export const displayFilter = ref('');
export const filterError = ref(null);
export const filterLoading = ref(false);  // True while filter is being applied
export const filterProgress = ref(0);     // Number of matching packets found so far

// WebSocket reference for sending messages
export const websocket = ref(null);

// Version info
export const nodeVersion = ref('');
export const tsharkLuaVersion = ref('');
export const tsharkLibraries = ref([]);
export const backendPort = ref(null);

// Host IP (the IP of the capture interface)
export const hostIP = ref(null);

// Backend connection status: 'disconnected' | 'connecting' | 'connected'
export const backendStatus = ref('disconnected');

// WebSocket event log for status-bar hover diagnostics
const WS_EVENT_LOG_LIMIT = 200;
export const wsEventLog = shallowRef([]);
const formatWsEventTime = (date = new Date()) => date.toTimeString().slice(0, 8);
export const addWsEvent = (message) => {
  if (!message) return;
  const next = [...wsEventLog.value, { time: formatWsEventTime(), message }];
  if (next.length > WS_EVENT_LOG_LIMIT) {
    next.splice(0, next.length - WS_EVENT_LOG_LIMIT);
  }
  wsEventLog.value = next;
};

// Capture state: true when live capture or file is actively being loaded/viewed
export const captureActive = ref(false);

// True when user explicitly stopped a live capture (not when loading/closing files)
export const stoppedCapture = ref(false);
// Capture option: when true, port 443 is included in capture BPF
export const captureIncludePort443 = ref(false);

// Saved captures count (incremented on save complete, reset on new capture)
export const savedCapturesCount = ref(0);

// Idle kill-switch state
export const idleCountdownSeconds = ref(0); // Remaining seconds (0 = not counting)
let cancelIdleCountdownFn = () => {};
export const cancelIdleCountdown = () => cancelIdleCountdownFn();
export const setCancelIdleCountdown = (fn) => { cancelIdleCountdownFn = fn; };

// Session collaborative viewing state
export const sessionId = ref(null);              // Current session ID
export const isSessionOwner = ref(false);       // True if we are the session owner
export const followOwner = ref(true);           // True if viewer wants to follow owner's actions
export const ownerState = shallowRef(null);     // Latest state received from owner

// Broadcast owner state change (called by owner components)
export const broadcastOwnerState = (stateUpdate) => {
  if (!isSessionOwner.value || !websocket.value || websocket.value.readyState !== WebSocket.OPEN) {
    return;
  }
  const msg = JSON.stringify({
    type: 'ownerState',
    state: stateUpdate
  });
  websocket.value.send(msg);
};

// Callback for owner state changes (set by components that need to react)
let ownerStateCallbacks = [];
export const onOwnerStateChange = (callback) => {
  ownerStateCallbacks.push(callback);
  return () => {
    ownerStateCallbacks = ownerStateCallbacks.filter(cb => cb !== callback);
  };
};
export const notifyOwnerStateChange = (state) => {
  ownerStateCallbacks.forEach(cb => cb(state));
};

// TLS certificate info
export const certInfo = ref(null);

// Pcap live-capture buffer usage stats
export const pcapDirUsage = ref(null); // { used, total, free, fsType, usagePercent, level, startAllowed, shouldAutoStop, ... }

// Active interface link speed (Mbps), 0 = unknown
export const linkSpeedMbps = ref(0);

// Data transfer tracking (bytes)
export const bytesReceived = ref(0);
export const bytesSent = ref(0);
export const bytesFetched = ref(0);  // On-demand fetches (packet details, hex dump)

// Helper to track received data (streaming)
export const trackReceived = (bytes) => {
  bytesReceived.value += bytes;
};

// Helper to track sent data
export const trackSent = (bytes) => {
  bytesSent.value += bytes;
};

// Helper to track fetched data (on-demand requests)
export const trackFetched = (bytes) => {
  bytesFetched.value += bytes;
};

// App version
export const appVersion = ref('');
fetch('/VERSION', { cache: 'no-store' })
  .then(res => res.text())
  .then(text => { const build = text.trim(); if (build) appVersion.value = `v1.0.${build}`; })
  .catch(() => {});

// Auth user state (populated by App.vue after login)
export const authUser = ref(null); // { userId, shortId, username, email }

// Fetch certificate info and other initial data (called after auth succeeds)
export const fetchInitialData = () => {
  apiFetch('/api/cert-info')
    .then(res => res.json())
    .then(data => { if (data && !data.error) certInfo.value = data; })
    .catch(() => {});
  apiFetch('/api/saved-captures')
    .then(res => res.json())
    .then(data => { if (data && data.files) savedCapturesCount.value = data.files.length; })
    .catch(() => {});
};

// WebSocket request/response dispatcher
// Sends a message with a unique reqId, returns a promise that resolves when the response arrives
const pendingRequests = new Map(); // reqId -> { resolve, reject }
let nextReqId = 1;

export const wsRequest = (type, payload) => {
  return new Promise((resolve, reject) => {
    const ws = websocket.value;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not connected'));
      return;
    }
    const reqId = nextReqId++;
    pendingRequests.set(reqId, { resolve, reject });
    const msg = JSON.stringify({ type, reqId, ...payload });
    trackSent(msg.length);
    ws.send(msg);
  });
};

// Called by LiveCapture.vue onmessage to resolve pending requests
export const resolveWsRequest = (reqId, data) => {
  const pending = pendingRequests.get(reqId);
  if (pending) {
    pendingRequests.delete(reqId);
    pending.resolve(data);
  }
};

// Clear pending requests (on disconnect/reconnect)
export const clearPendingWsRequests = () => {
  for (const [, pending] of pendingRequests) {
    pending.reject(new Error('WebSocket disconnected'));
  }
  pendingRequests.clear();
  nextReqId = 1;
};

// Callback for clearing packet cache (set by packetCache.js to avoid circular import)
let clearPacketCacheCallback = null;
export const setPacketCacheClearer = (callback) => {
  clearPacketCacheCallback = callback;
};

// Clear all packets
export const clearPackets = () => {
  packets.value = [];
  allPackets.value = [];
  activePacketIndex.value = null;
  activePacketDetails.value = null;
  activePacketHex.value = '';
  activePacketRawHex.value = '';
  highlightedByteRange.value = null;
  displayFilter.value = '';
  filterError.value = null;
  filterLoading.value = false;
  filterProgress.value = 0;
  captureActive.value = false;
  stoppedCapture.value = false;
  bytesReceived.value = 0;
  bytesSent.value = 0;
  bytesFetched.value = 0;
  // Note: savedCapturesCount is NOT reset here — it persists across restarts
  // and is synced from backend via /api/saved-captures
  // Clear packet details cache
  if (clearPacketCacheCallback) {
    clearPacketCacheCallback();
  }
};

// Apply filter by sending request to backend
export const applyDisplayFilter = (filter) => {
  if (!websocket.value || websocket.value.readyState !== WebSocket.OPEN) {
    filterError.value = 'Not connected to backend';
    return;
  }
  filterLoading.value = true;  // Show loading spinner
  filterProgress.value = 0;    // Reset progress
  const msg = JSON.stringify({
    type: 'applyFilter',
    filter: filter
  });
  trackSent(msg.length);
  websocket.value.send(msg);

  // Broadcast filter to viewers if owner (they will apply locally when results arrive)
  if (isSessionOwner.value) {
    broadcastOwnerState({ displayFilter: filter });
  }
};

// Cancel filter operation
export const cancelFilter = () => {
  if (!websocket.value || websocket.value.readyState !== WebSocket.OPEN) {
    filterLoading.value = false;
    return;
  }
  const msg = JSON.stringify({ type: 'cancelFilter' });
  trackSent(msg.length);
  websocket.value.send(msg);
};
