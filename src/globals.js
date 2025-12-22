import { ref, shallowRef, triggerRef } from "vue";

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
export const backendPort = ref(null);

// Host IP (the IP of the capture interface)
export const hostIP = ref(null);

// Backend connection status: 'disconnected' | 'connecting' | 'connected'
export const backendStatus = ref('disconnected');

// Capture state: true when live capture or file is actively being loaded/viewed
export const captureActive = ref(false);

// True when user explicitly stopped a live capture (not when loading/closing files)
export const stoppedCapture = ref(false);

// Session collaborative viewing state
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

// Fetch certificate info from Vite API
fetch('/api/cert-info')
  .then(res => res.json())
  .then(data => { if (data) certInfo.value = data; })
  .catch(() => {});

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
  displayFilter.value = '';
  filterError.value = null;
  captureActive.value = false;
  stoppedCapture.value = false;
  bytesReceived.value = 0;
  bytesSent.value = 0;
  bytesFetched.value = 0;
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
