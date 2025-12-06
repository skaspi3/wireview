<script setup>
import { computed, ref } from "vue";
import { manager, captureStats } from "../globals";
import GitHubIcon from "./icons/GitHubIcon.vue";

const showFilterPopup = ref(false);

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

// Rolling buffer limit (must match App.vue MAX_BUFFER_SIZE)
const MAX_BUFFER_MB = 20;

const statsInfo = computed(() => {
  const total = captureStats.totalCaptured.value;
  const visible = manager.frameCount;
  const trimmed = captureStats.totalDropped.value;

  // If no capture activity, show simple state
  if (total === 0 && !captureStats.isProcessing.value) return `Max. Window: ${MAX_BUFFER_MB}MB | No Packets`;

  return `Max. Window: ${MAX_BUFFER_MB}MB | Total: ${total.toLocaleString()} pkt | Visible: ${visible.toLocaleString()} pkt | Trimmed: ${trimmed.toLocaleString()} pkt`;
});

const toggleFilterPopup = () => {
  showFilterPopup.value = !showFilterPopup.value;
};
</script>
<template>
  <div class="status-bar">
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
        <li v-for="item in bpfFilter.excluded" :key="item.port">
          Port {{ item.port }} – {{ item.description }}
        </li>
      </ul>
      <div class="filter-raw">
        <code>{{ bpfFilter.raw }}</code>
      </div>
    </div>

    <div style="flex-grow: 1"></div>
    <div class="stats-info">
      {{ statsInfo }}
    </div>
    <div style="flex-grow: 1"></div>
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
</style>
