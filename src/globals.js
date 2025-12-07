import { ref, shallowRef, triggerRef } from "vue";

// Packets array - holds packet summaries received from server
export const packets = shallowRef([]);

// Currently selected packet index
export const activePacketIndex = ref(null);

// Currently selected packet details (fetched on demand from server)
export const activePacketDetails = shallowRef(null);

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
  activePacketIndex.value = null;
  activePacketDetails.value = null;
};
