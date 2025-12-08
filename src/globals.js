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

// WebSocket reference for sending messages
export const websocket = ref(null);

// Version info
export const nodeVersion = ref('');
export const backendPort = ref(null);

// Backend connection status: 'disconnected' | 'connecting' | 'connected'
export const backendStatus = ref('disconnected');

// TLS certificate info
export const certInfo = ref(null);

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
};

// Apply filter by sending request to backend
export const applyDisplayFilter = (filter) => {
  if (!websocket.value || websocket.value.readyState !== WebSocket.OPEN) {
    filterError.value = 'Not connected to backend';
    return;
  }
  websocket.value.send(JSON.stringify({
    type: 'applyFilter',
    filter: filter
  }));
};
