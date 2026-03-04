<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { packets, allPackets, nodeVersion, tsharkLuaVersion, tsharkLibraries, backendStatus, backendPort, certInfo, displayFilter, bytesReceived, bytesFetched, pcapDirUsage, appVersion } from "../globals";
import GitHubIcon from "./icons/GitHubIcon.vue";

const showFilterPopup = ref(false);
const showCertPopup = ref(false);
const showReleaseNotes = ref(false);
const showNotices = ref(false);
const showFeedback = ref(false);
const showBackendPopup = ref(false);
const showLedPopup = ref(false);
const showThinClientPopup = ref(false);

// Removed system stats - no longer needed for Go backend

// Reduction ratio - updated periodically
const reductionRatio = ref(0);

const updateReductionRatio = () => {
  // Calculate reduction ratio
  const pkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
  const observed = pkts.reduce((sum, pkt) => sum + (pkt.length || 0), 0);
  if (observed === 0) {
    reductionRatio.value = 0;
  } else {
    const transferred = bytesReceived.value + bytesFetched.value;
    const ratio = (observed - transferred) / observed;
    reductionRatio.value = Math.max(0, Math.min(100, ratio * 100));
  }
};

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

const totalCapturedBytes = computed(() => {
  const pkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
  return pkts.reduce((sum, pkt) => sum + (pkt.length || 0), 0);
});

// Update reduction ratio periodically
let reductionRatioInterval = null;

const formatBytes = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

onMounted(() => {
  updateReductionRatio();
  reductionRatioInterval = setInterval(updateReductionRatio, 1000);
});

onUnmounted(() => {
  if (reductionRatioInterval) clearInterval(reductionRatioInterval);
});

const statusTitle = computed(() => {
  switch (backendStatus.value) {
    case 'connected': return 'Backend connected (thin-client mode)';
    case 'connecting': return 'Connecting to backend...';
    default: return 'Backend disconnected';
  }
});


// Format bytes for memory display
const formatMemory = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Parse certificate subject/issuer into readable key-value pairs
const parseCertField = (field) => {
  if (!field) return [];
  // Format: "CN = example.com, O = Org, C = US" or similar
  const parts = field.split(/,\s*(?=[A-Z]+\s*=)/);
  return parts.map(part => {
    const match = part.match(/^\s*([A-Za-z]+)\s*=\s*(.+?)\s*$/);
    if (match) {
      const labels = {
        'CN': 'Common Name',
        'O': 'Organization',
        'OU': 'Org Unit',
        'C': 'Country',
        'ST': 'State',
        'L': 'Locality',
        'emailAddress': 'Email'
      };
      return { key: labels[match[1]] || match[1], value: match[2] };
    }
    return null;
  }).filter(Boolean);
};

const certSubject = computed(() => parseCertField(certInfo.value?.subject));
const certIssuer = computed(() => parseCertField(certInfo.value?.issuer));

// Format date for display
const formatCertDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Check if certificate is self-signed
const isSelfSigned = computed(() => {
  if (!certInfo.value) return false;
  return certInfo.value.subject === certInfo.value.issuer;
});

// Check if certificate is expired
const isExpired = computed(() => {
  if (!certInfo.value?.validTo) return false;
  return new Date(certInfo.value.validTo) < new Date();
});

// Certificate is fully valid: not self-signed and not expired
const isCertValid = computed(() => {
  if (!certInfo.value) return false;
  return !isSelfSigned.value && !isExpired.value;
});
</script>
<template>
  <div class="status-bar">
    <div class="left-section">
      <div class="bpf-filter-link" @click="toggleFilterPopup">
        Current BPF filter
      </div>

      <!-- Release Notes Popup -->
      <div v-if="showReleaseNotes" class="release-overlay" @click.self="showReleaseNotes = false">
        <div class="release-popup">
          <div class="release-header">
            <span class="release-title">WebPCAP</span>
            <span class="release-ver">{{ appVersion }}</span>
            <button class="release-close" @click="showReleaseNotes = false">&times;</button>
          </div>
          <ul class="release-list">
            <li>Live packet capture with tshark — real-time streaming via WebSocket</li>
            <li>Thin Client architecture — zstd-compressed packet delivery with up to 95% bandwidth reduction</li>
            <li>Display filters — apply Wireshark-compatible filters during live or stopped capture</li>
            <li>Session sharing — invite viewers to watch your capture in real-time</li>
            <li>Capture Insights — protocol hierarchy, top talkers, traffic timeline charts</li>
            <li>Save &amp; export — pcapng with optional zstd compression, filtered or full capture</li>
            <li>RAM-backed storage — pcap files written to tmpfs for minimal disk I/O</li>
            <li>Idle kill-switch — auto-stops capture after inactivity to protect system resources</li>
            <li>File browser — load and analyze existing pcap/pcapng files from the server</li>
            <li>Custom Lua dissector support for proprietary protocol analysis</li>
          </ul>
        </div>
      </div>

      <!-- Open Source Notices Popup -->
      <div v-if="showNotices" class="release-overlay" @click.self="showNotices = false">
        <div class="notices-popup">
          <div class="release-header">
            <span class="release-title">3rd-Party Software</span>
            <button class="release-close" @click="showNotices = false">&times;</button>
          </div>
          <div class="notices-content">
            <div class="notices-section">
              <div class="notices-section-title">Backend (Node.js)</div>
              <table class="notices-table">
                <thead><tr><th>Package</th><th>Version</th><th>License</th></tr></thead>
                <tbody>
                  <tr><td><a href="https://www.npmjs.com/package/ws" target="_blank">ws</a></td><td>8.18</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/@mongodb-js/zstd" target="_blank">@mongodb-js/zstd</a></td><td>7.0</td><td>Apache-2.0</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/sql.js" target="_blank">sql.js</a></td><td>1.13</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/dotenv" target="_blank">dotenv</a></td><td>16.6</td><td>BSD-2-Clause</td></tr>
                </tbody>
              </table>
            </div>
            <div class="notices-section">
              <div class="notices-section-title">Frontend (Vue.js)</div>
              <table class="notices-table">
                <thead><tr><th>Package</th><th>Version</th><th>License</th></tr></thead>
                <tbody>
                  <tr><td><a href="https://www.npmjs.com/package/vue" target="_blank">vue</a></td><td>3.5</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/@vueuse/core" target="_blank">@vueuse/core</a></td><td>13.6</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/echarts" target="_blank">echarts</a></td><td>6.0</td><td>Apache-2.0</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/vue-echarts" target="_blank">vue-echarts</a></td><td>8.0</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/fzstd" target="_blank">fzstd</a></td><td>0.1</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/vite" target="_blank">vite</a></td><td>6.3</td><td>MIT</td></tr>
                  <tr><td><a href="https://www.npmjs.com/package/@vitejs/plugin-vue" target="_blank">@vitejs/plugin-vue</a></td><td>5.2</td><td>MIT</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Feedback Popup (placeholder) -->
      <div v-if="showFeedback" class="release-overlay" @click.self="showFeedback = false">
        <div class="release-popup">
          <div class="release-header">
            <span class="release-title">Feedback</span>
            <button class="release-close" @click="showFeedback = false">&times;</button>
          </div>
          <div class="feedback-placeholder">Coming soon</div>
        </div>
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

    <!-- Right section -->
    <div class="right-section">
      <span
        class="version-info thin-client-badge"
        @mouseenter="showThinClientPopup = true"
        @mouseleave="showThinClientPopup = false"
      >
        Thin Client
        <div v-if="showThinClientPopup" class="thin-client-popup">
          <div class="popup-row reduction-row">Reduction Ratio: {{ reductionRatio.toFixed(1) }}%</div>
          <div class="popup-row">Captured on interface: {{ formatBytes(totalCapturedBytes) }}</div>
          <div class="popup-row">Sent to browser: {{ formatBytes(bytesReceived + bytesFetched) }}</div>
        </div>
      </span>
      <span class="version-info wss-info">
        | <span
            class="version-info backend-status-badge"
            @mouseenter="showBackendPopup = true"
            @mouseleave="showBackendPopup = false"
          >
            Backend Status:
            <div v-if="showBackendPopup" :class="['backend-popup', { 'tshark-libraries': tsharkLibraries.length > 0 }]">
              <div class="popup-row">Node.js: {{ nodeVersion || 'unknown' }}</div>
              <div v-if="tsharkLibraries.length > 0" class="libs-section">
                <div class="libs-title">tshark libraries:</div>
                <div class="libs-grid">
                  <span v-for="(lib, i) in tsharkLibraries" :key="lib.name" class="lib-entry">{{ lib.name }}<template v-if="lib.version"> {{ lib.version }}</template><template v-if="i < tsharkLibraries.length - 1">, </template></span>
                </div>
              </div>
              <div v-else class="popup-row">tshark Lua: {{ tsharkLuaVersion || 'N/A' }}</div>
              <div v-if="pcapDirUsage" class="popup-row pcap-dir-row">
                {{ pcapDirUsage.fsType === 'tmpfs' ? 'RAM' : 'Disk' }}: {{ formatBytes(pcapDirUsage.used) }} / {{ formatBytes(pcapDirUsage.total) }}
              </div>
            </div>
          </span>
          <span
            class="led"
            :class="backendStatus"
            @mouseenter="showLedPopup = true"
            @mouseleave="showLedPopup = false"
          >
            <div v-if="showLedPopup" class="led-popup" :class="{ 'led-popup-red': backendStatus === 'disconnected' }">
              {{ backendStatus === 'disconnected' ? 'Disconnected' : 'OK — Healthy' }}
            </div>
          </span>
        | <span class="version-info wss-label">WSS:</span> <span class="lock-icon" :class="{ 'lock-valid': isCertValid, 'lock-warning': !isCertValid }" @mouseenter="showCertPopup = true" @mouseleave="showCertPopup = false">
            🔒
            <div v-if="showCertPopup" class="cert-popup">
              <div class="cert-header">
                <span class="cert-title">WSS Certificate</span>
                <span v-if="isSelfSigned" class="cert-self-signed">Self-Signed</span>
              </div>
              <template v-if="certInfo">
                <div class="cert-section">
                  <div class="cert-section-title">Subject</div>
                  <div v-for="item in certSubject" :key="'s-'+item.key" class="cert-row">
                    <span class="cert-label">{{ item.key }}:</span>
                    <span class="cert-value">{{ item.value }}</span>
                  </div>
                </div>
                <div v-if="!isSelfSigned" class="cert-section">
                  <div class="cert-section-title">Issuer</div>
                  <div v-for="item in certIssuer" :key="'i-'+item.key" class="cert-row">
                    <span class="cert-label">{{ item.key }}:</span>
                    <span class="cert-value">{{ item.value }}</span>
                  </div>
                </div>
                <div class="cert-section">
                  <div class="cert-section-title">Validity</div>
                  <div class="cert-row">
                    <span class="cert-label">From:</span>
                    <span class="cert-value">{{ formatCertDate(certInfo.validFrom) }}</span>
                  </div>
                  <div class="cert-row">
                    <span class="cert-label">To:</span>
                    <span class="cert-value">{{ formatCertDate(certInfo.validTo) }}</span>
                  </div>
                </div>
                <div v-if="certInfo.fingerprint" class="cert-section">
                  <div class="cert-section-title">SHA-256 Fingerprint</div>
                  <div class="cert-fingerprint">{{ certInfo.fingerprint }}</div>
                </div>
              </template>
              <template v-else>
                <div class="cert-no-info">Certificate info not available</div>
              </template>
            </div>
          </span>
      </span>
      <a
        class="github"
        href="https://github.com/skaspi3/webpcap"
        aria-label="Visit the WebPCAP project page on GitHub"
        target="_blank"
      >
        <GitHubIcon />
      </a>
    </div>
    <div v-if="appVersion" class="app-version-group">
      <span class="app-version-link" @click="showFeedback = true">Feedback</span>
      <span class="app-version-sep">|</span>
      <span class="app-version-link" @click="showReleaseNotes = true">{{ appVersion }}</span>
      <span class="app-version-sep">|</span>
      <span class="app-version-link" @click="showNotices = true">Notices</span>
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
  position: fixed;
  bottom: 28px;  /* Above the packet counter */
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
}
.right-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.app-version-group {
  position: absolute;
  left: 25%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: monospace;
  font-size: 14.5px;
}
.app-version-link {
  color: #60a5fa;
  cursor: pointer;
  transition: color 0.15s;
}
.app-version-link:hover {
  color: #93c5fd;
  text-decoration: underline;
}
.app-version-sep {
  color: #4b5563;
  user-select: none;
}
.release-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.release-popup {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px 28px;
  min-width: 460px;
  max-width: 560px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.release-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #374151;
}
.release-title {
  font-size: 20px;
  font-weight: 700;
  color: #f9fafb;
}
.release-ver {
  font-size: 14px;
  font-family: monospace;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
  padding: 2px 10px;
  border-radius: 12px;
}
.release-close {
  margin-left: auto;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.release-close:hover {
  color: #f9fafb;
}
.release-list {
  margin: 0;
  padding-left: 20px;
  color: #d1d5db;
  font-size: 14px;
  line-height: 1.8;
}
.release-list li {
  margin: 4px 0;
}
.release-list li::marker {
  color: #60a5fa;
}
.notices-link {
  margin-left: auto;
  margin-right: 8px;
  color: #60a5fa;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s;
}
.notices-link:hover {
  color: #93c5fd;
  text-decoration: underline;
}
.notices-popup {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px 28px;
  min-width: 520px;
  max-width: 620px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.notices-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.notices-section-title {
  color: #9ca3af;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  margin-bottom: 8px;
}
.notices-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.notices-table th {
  text-align: left;
  color: #6b7280;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 10px;
  border-bottom: 1px solid #374151;
}
.notices-table td {
  padding: 7px 10px;
  color: #d1d5db;
  border-bottom: 1px solid #1f2937;
}
.notices-table tr:hover td {
  background: rgba(96, 165, 250, 0.05);
}
.notices-table a {
  color: #60a5fa;
  text-decoration: none;
}
.notices-table a:hover {
  text-decoration: underline;
}
.bpf-filter-link {
  color: #3b82f6;
  cursor: pointer;
  text-decoration: underline;
  font-size: 14.5px;
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
.filtered-count {
  font-family: monospace;
  font-size: 13px;
  color: #fbbf24;
  font-weight: 500;
  background: rgba(251, 191, 36, 0.1);
  padding: 2px 10px;
  border-radius: 4px;
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
  font-size: 14.5px;
  cursor: pointer;
  position: relative;
}
.thin-client-popup {
  position: absolute;
  bottom: 24px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 14px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 14px;
  font-weight: normal;
  color: #d1d5db;
  line-height: 1.5;
}
.thin-client-popup .popup-row {
  margin: 2px 0;
}
.thin-client-popup .reduction-row {
  color: #22c55e;
  font-weight: 500;
}
.thin-client-popup .pcap-dir-row {
  color: #9ca3af;
  font-size: 13px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #374151;
}
.thin-client-popup .compression-row {
  color: #9ca3af;
  font-size: 13px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #374151;
}
.backend-status-badge {
  color: #60a5fa;
  font-weight: bold;
  font-size: 14.5px;
  cursor: pointer;
  position: relative;
}
.led-popup {
  position: absolute;
  bottom: 20px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 6px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 13px;
  color: #22c55e;
  font-weight: 600;
  white-space: nowrap;
}
.wss-label {
  color: #60a5fa;
  font-weight: bold;
  font-size: 14.5px;
}
.led-popup-red {
  color: #ef4444;
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
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 16px;
  color: #d1d5db;
  max-height: 400px;
  overflow-y: auto;
}
.backend-popup.tshark-libraries {
  min-width: 400px;
  max-width: 700px;
}
.popup-row {
  margin: 2px 0;
}
.libs-section {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #374151;
}
.libs-title {
  color: #9ca3af;
  font-size: 14px;
  margin-bottom: 3px;
}
.libs-grid {
  display: inline;
  line-height: 1.6;
}
.lib-entry {
  font-size: 14px;
  color: #a5b4c8;
  font-family: monospace;
  word-wrap: break-word;
  white-space: normal;
}
.loading-row {
  color: #9ca3af;
  font-style: italic;
}
.lock-icon {
  font-size: 18px;
  position: relative;
  cursor: pointer;
}
.lock-icon.lock-valid {
  filter: hue-rotate(60deg) saturate(2) brightness(1.2);
  opacity: 1;
}
.lock-icon.lock-warning {
  filter: hue-rotate(-10deg) saturate(3) brightness(1);
  opacity: 1;
}
.cert-popup {
  position: absolute;
  bottom: 24px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 14px;
  min-width: 280px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 14.5px;
  color: #d1d5db;
}
.cert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #374151;
}
.cert-title {
  font-weight: 600;
  color: #ffffff;
  font-size: 15.5px;
}
.cert-self-signed {
  color: #f59e0b;
  font-size: 12.5px;
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}
.cert-section {
  margin-bottom: 10px;
}
.cert-section:last-child {
  margin-bottom: 0;
}
.cert-section-title {
  font-size: 12.5px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.cert-row {
  display: flex;
  font-size: 13.5px;
  margin: 2px 0;
  white-space: nowrap;
}
.cert-label {
  color: #9ca3af;
  min-width: 90px;
}
.cert-value {
  color: #e5e7eb;
}
.cert-fingerprint {
  font-family: monospace;
  font-size: 11.5px;
  color: #9ca3af;
  word-break: break-all;
  line-height: 1.4;
  white-space: normal;
}
.cert-no-info {
  color: #6b7280;
  font-style: italic;
}
.feedback-placeholder {
  color: #6b7280;
  font-size: 15px;
  text-align: center;
  padding: 20px 0;
  font-style: italic;
}
</style>
