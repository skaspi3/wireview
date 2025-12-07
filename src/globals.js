import { ref, shallowRef } from "vue";
export { DEBUG } from "./debug";

// =====================================================================
// THIN CLIENT MODE - No Wiregasm, packets processed on server
// =====================================================================

// Packets array - holds packet summaries received from server
// Each packet: { number, time, src, dst, protocol, length, info }
export const packets = shallowRef([]);

// Currently selected packet index
export const activePacketIndex = ref(null);

// Currently selected packet details (fetched on demand from server)
export const activePacketDetails = shallowRef(null);

// Live capture stats (reactive for status bar display)
export const captureStats = {
  totalCaptured: ref(0),   // Ever-increasing counter of all packets seen
  totalDropped: ref(0),    // How many packets have been trimmed
};

// Version info (displayed in status bar)
export const nodeVersion = ref('');
export const backendPort = ref(null);

// Backend connection status: 'disconnected' | 'connecting' | 'connected'
export const backendStatus = ref('disconnected');

// TLS certificate info (displayed on hover over lock icon)
export const certInfo = ref(null);  // { subject, issuer, validFrom, validTo, fingerprint }

// Fetch certificate info from Vite API
fetch('/api/cert-info')
  .then(res => res.json())
  .then(data => { if (data) certInfo.value = data; })
  .catch(() => {});

// Clear all packets (called on capture restart)
export const clearPackets = () => {
  packets.value = [];
  activePacketIndex.value = null;
  activePacketDetails.value = null;
  captureStats.totalCaptured.value = 0;
  captureStats.totalDropped.value = 0;
};
