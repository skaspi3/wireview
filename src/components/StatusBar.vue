<script setup>
import { computed, ref } from "vue";
import { packets, allPackets, nodeVersion, backendStatus, backendPort, certInfo, displayFilter } from "../globals";
import GitHubIcon from "./icons/GitHubIcon.vue";

const showFilterPopup = ref(false);
const showCertPopup = ref(false);
const showBackendPopup = ref(false);

// BPF filter explanation (matches backend server.js filter)
const bpfFilter = {
  raw: "not port 3000 and not port 22 and not port 5173 and not port 443 and not net 169.254.0.0/16",
  excluded: [
    { port: 3000, description: "Backend WebSocket" },
    { port: 22, description: "SSH" },
    { port: 5173, description: "Vite dev server" },
    { port: 443, description: "HTTPS" },
    { range: "169.254.0.0/16", description: "Link-local addresses" },
  ]
};

// Total packets count (from allPackets when filter is active, otherwise from packets)
const totalPackets = computed(() => {
  if (displayFilter.value && allPackets.value.length > 0) {
    return allPackets.value.length;
  }
  return packets.value.length;
});

// Displayed packets count (filtered)
const displayedPackets = computed(() => {
  return packets.value.length;
});

const statsInfo = computed(() => {
  const count = totalPackets.value;
  if (count === 0) return 'No Packets';
  return `Packets: ${count.toLocaleString()}`;
});

const displayedInfo = computed(() => {
  if (!displayFilter.value) return null;
  return `Displayed: ${displayedPackets.value.toLocaleString()}`;
});

const toggleFilterPopup = () => {
  showFilterPopup.value = !showFilterPopup.value;
};

const statusTitle = computed(() => {
  switch (backendStatus.value) {
    case 'connected': return 'Backend connected (thin-client mode)';
    case 'connecting': return 'Connecting to backend...';
    default: return 'Backend disconnected';
  }
});
</script>
<template>
  <div class="status-bar">
    <div class="left-section">
      <div class="bpf-filter-link" @click="toggleFilterPopup">
        Current BPF filter
      </div>

      <!-- BPF Filter Popup -->
      <div v-if="showFilterPopup" class="filter-popup">
        <div class="filter-popup-header">
          <strong>Excluded from capture:</strong>
          <button class="close-btn" @click="showFilterPopup = false">&times;</button>
        </div>
        <ul class="filter-list">
          <li v-for="item in bpfFilter.excluded" :key="item.port || item.range">
            <template v-if="item.port">Port {{ item.port }}</template>
            <template v-else>{{ item.range }}</template>
            – {{ item.description }}
          </li>
        </ul>
        <div class="filter-raw">
          <code>{{ bpfFilter.raw }}</code>
        </div>
      </div>
    </div>

    <!-- Center section - packet counts -->
    <div class="center-section">
      <span class="stats-info">{{ statsInfo }}</span>
      <span v-if="displayedInfo" class="displayed-info">{{ displayedInfo }}</span>
    </div>

    <!-- Right section -->
    <div class="right-section">
      <span class="version-info thin-client-badge">
        Thin Client Mode
      </span>
      <span class="version-info wss-info">
        | <span
            class="led"
            :class="backendStatus"
            @mouseenter="showBackendPopup = true"
            @mouseleave="showBackendPopup = false"
          >
            <div v-if="showBackendPopup" class="backend-popup">
              <div class="popup-row">Backend running on 127.0.0.1:{{ backendPort || 3000 }}</div>
              <div class="popup-row">Node.js: {{ nodeVersion || 'unknown' }}</div>
            </div>
          </span>
        | <span class="lock-icon" @mouseenter="showCertPopup = true" @mouseleave="showCertPopup = false">
            🔒
            <div v-if="showCertPopup" class="cert-popup">
              <template v-if="certInfo">
                <div class="cert-title">TLS Certificate</div>
                <div v-if="certInfo.subject === certInfo.issuer" class="cert-self-signed">Self-Signed</div>
              </template>
              <template v-else>
                <div class="cert-title">TLS Certificate</div>
              </template>
            </div>
          </span>
      </span>
      <a
        class="github"
        href="https://github.com/radiantly/Wireview"
        aria-label="Visit the Wireview project page on GitHub"
        target="_blank"
      >
        <GitHubIcon />
      </a>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  padding: 2px 5px;
  position: relative;
  align-items: center;
}
.left-section {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}
.center-section {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}
.right-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.bpf-filter-link {
  color: #3b82f6;
  cursor: pointer;
  text-decoration: underline;
  font-size: 13px;
}
.bpf-filter-link:hover {
  color: #60a5fa;
}
.filter-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 12px;
  min-width: 280px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  color: #e5e7eb;
  font-size: 13px;
}
.filter-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #f3f4f6;
}
.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}
.close-btn:hover {
  color: #f3f4f6;
}
.filter-list {
  margin: 0;
  padding-left: 20px;
  color: #d1d5db;
}
.filter-list li {
  margin: 4px 0;
}
.filter-raw {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #374151;
}
.filter-raw code {
  font-family: monospace;
  font-size: 11px;
  color: #9ca3af;
  word-break: break-all;
}
.stats-info {
  font-family: monospace;
  font-size: 13px;
  color: #22c55e;
  font-weight: 500;
}
.displayed-info {
  font-family: monospace;
  font-size: 13px;
  color: #60a5fa;
  font-weight: 500;
}
.github {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.github svg {
  height: 100%;
}
.version-info {
  font-size: 11px;
  color: #9ca3af;
  margin-right: 10px;
  font-family: monospace;
}
.thin-client-badge {
  color: #60a5fa;
  font-weight: bold;
}
.wss-info {
  display: flex;
  align-items: center;
  gap: 4px;
}
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 3px currentColor;
  cursor: pointer;
  position: relative;
}
.led.disconnected {
  background-color: #ef4444;
  color: #ef4444;
}
.led.connecting {
  background-color: #f59e0b;
  color: #f59e0b;
  animation: pulse-led 1s infinite;
}
.led.connected {
  background-color: #22c55e;
  color: #22c55e;
}
@keyframes pulse-led {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.backend-popup {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 8px 12px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 11px;
  color: #d1d5db;
}
.popup-row {
  margin: 2px 0;
}
.lock-icon {
  font-size: 14px;
  filter: grayscale(100%);
  opacity: 0.8;
  position: relative;
  cursor: pointer;
}
.cert-popup {
  position: absolute;
  bottom: 24px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 8px 12px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 11px;
  color: #d1d5db;
}
.cert-title {
  font-weight: 600;
  color: #ffffff;
  font-size: 12px;
}
.cert-self-signed {
  color: #f59e0b;
  font-size: 11px;
  margin-top: 4px;
}
</style>
