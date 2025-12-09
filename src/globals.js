import { ref, shallowRef, triggerRef } from "vue";

// Packets array - holds packet summaries received from server
export const packets = shallowRef([]);

// All packets (unfiltered) - stored separately when filter is active
export const allPackets = shallowRef([]);

// Currently selected packet index
export const activePacketIndex = ref(null);

// Currently selected packet details (fetched on demand from server)
export const activePacketDetails = shallowRef(null);

// Display filter state
export const displayFilter = ref('');
export const filterError = ref(null);
export const filterLoading = ref(false);  // True while filter is being applied
export const filterProgress = ref(0);     // Number of matching packets found so far

// WebSocket reference for sending messages
export const websocket = ref(null);

// Version info
export const nodeVersion = ref('');
export const backendPort = ref(null);

// Backend connection status: 'disconnected' | 'connecting' | 'connected'
export const backendStatus = ref('disconnected');

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

// Clear all packets
export const clearPackets = () => {
  packets.value = [];
  allPackets.value = [];
  activePacketIndex.value = null;
  activePacketDetails.value = null;
  displayFilter.value = '';
  filterError.value = null;
  bytesReceived.value = 0;
  bytesSent.value = 0;
  bytesFetched.value = 0;
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
