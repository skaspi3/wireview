<script setup>
import { computed, ref } from "vue";
import { manager, captureStats, crashLog, wiregasmVersion, nodeVersion, backendPort } from "../globals";
import GitHubIcon from "./icons/GitHubIcon.vue";

const showFilterPopup = ref(false);
const showCrashLogPopup = ref(false);

// BPF filter explanation (matches backend server.js filter)
const bpfFilter = {
  raw: "not port 3000 and not port 22 and not port 5173 and not port 443",
  excluded: [
    { port: 3000, description: "Backend WebSocket" },
    { port: 22, description: "SSH" },
    { port: 5173, description: "Vite dev server" },
    { port: 443, description: "HTTPS" },
  ]
};

const statsInfo = computed(() => {
  const total = captureStats.totalCaptured.value;
  const visible = manager.frameCount;
  const trimmed = captureStats.totalDropped.value;

  // If no capture activity, show simple state
  if (total === 0 && !captureStats.isProcessing.value) return `No Packets`;

  return `Total: ${total.toLocaleString()} pkt | Visible: ${visible.toLocaleString()} pkt | Trimmed: ${trimmed.toLocaleString()} pkt`;
});

const toggleFilterPopup = () => {
  showFilterPopup.value = !showFilterPopup.value;
  if (showFilterPopup.value) showCrashLogPopup.value = false;
};

const toggleCrashLogPopup = () => {
  showCrashLogPopup.value = !showCrashLogPopup.value;
  if (showCrashLogPopup.value) showFilterPopup.value = false;
};
</script>
<template>
  <div class="status-bar">
    <div class="bpf-filter-link" @click="toggleFilterPopup">
      Current BPF filter
    </div>

    <div class="link-separator">|</div>

    <div class="bpf-filter-link" @click="toggleCrashLogPopup">
      Crash Log ({{ crashLog.length }})
    </div>

    <!-- BPF Filter Popup -->
    <div v-if="showFilterPopup" class="filter-popup">
      <div class="filter-popup-header">
        <strong>Excluded from capture:</strong>
        <button class="close-btn" @click="showFilterPopup = false">&times;</button>
      </div>
      <ul class="filter-list">
        <li v-for="item in bpfFilter.excluded" :key="item.port">
          Port {{ item.port }} – {{ item.description }}
        </li>
      </ul>
      <div class="filter-raw">
        <code>{{ bpfFilter.raw }}</code>
      </div>
    </div>

    <!-- Crash Log Popup -->
    <div v-if="showCrashLogPopup" class="filter-popup crash-log-popup">
      <div class="filter-popup-header">
        <strong>Crash Log</strong>
        <div class="header-buttons">
          <button v-if="crashLog.length > 0" class="clear-btn" @click="crashLog = []">Clear</button>
          <button class="close-btn" @click="showCrashLogPopup = false">&times;</button>
        </div>
      </div>
      <div v-if="crashLog.length === 0" class="no-crashes">
        No crashes recorded
      </div>
      <ul v-else class="crash-list">
        <li v-for="(crash, index) in crashLog" :key="index">
          {{ crash.timestamp }} – {{ crash.packetCount.toLocaleString() }} packets
        </li>
      </ul>
    </div>

    <div style="flex-grow: 1"></div>
    <div class="stats-info">
      {{ statsInfo }}
    </div>
    <div style="flex-grow: 1"></div>
    <span v-if="wiregasmVersion" class="version-info">
      Wiregasm {{ wiregasmVersion }}
    </span>
    <span v-if="nodeVersion" class="version-info">
      Node.js {{ nodeVersion }}
    </span>
    <span v-if="backendPort" class="version-info">
      [WSS: {{ backendPort }}]
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
</template>

<style scoped>
.status-bar {
  display: flex;
  padding: 2px 5px;
  position: relative;
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
.link-separator {
  color: #6b7280;
  margin: 0 8px;
  font-size: 13px;
}
.filter-popup {
  position: absolute;
  bottom: 100%;
  left: 5px;
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
.crash-log-popup {
  left: 120px;
}
.crash-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  color: #d1d5db;
  max-height: 200px;
  overflow-y: auto;
}
.crash-list li {
  margin: 4px 0;
  padding: 4px 8px;
  background: #374151;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}
.no-crashes {
  color: #9ca3af;
  font-style: italic;
}
.header-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clear-btn {
  background: #374151;
  border: 1px solid #4b5563;
  color: #9ca3af;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.clear-btn:hover {
  background: #4b5563;
  color: #f3f4f6;
}
.stats-info {
  font-family: monospace;
  font-size: 13px;
  color: #22c55e;
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
</style>
