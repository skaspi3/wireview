<script setup>
import { computed, reactive } from "vue";
import { manager, captureStats } from "../globals";
import GitHubIcon from "./icons/GitHubIcon.vue";
import { useInterval } from "../composables.js";

const state = reactive({
  bridgeLoader: null,

  // computed
  statsInfo: null,
});

state.statsInfo = computed(() => {
  const proc = captureStats.isProcessing.value;
  const total = captureStats.totalCaptured.value;
  const visible = manager.frameCount;
  const trimmed = captureStats.totalDropped.value;

  // If no capture activity, show simple state
  if (total === 0 && !proc) return "No Packets";

  return `Proc: ${proc} | Total: ${total.toLocaleString()} | Visible: ${visible.toLocaleString()} | Trimmed: ${trimmed.toLocaleString()}`;
});

const generateDescription = (request) => {
  if (request.type === "frames") {
    if (manager.displayFilter)
      return `Loading frames for display filter '${manager.displayFilter}'`;
    return "Loading frames";
  }

  if (request.type === "open") return "Parsing frames from file";
  return "Loading";
};

const updateLoader = () => {
  const request = manager.activeBridgeRequest;
  if (request === null) {
    state.bridgeLoader = null;
    return;
  }

  const timeTaken = Date.now() - request.timestamp;
  if (timeTaken < 1000) {
    state.bridgeLoader = null;
    return;
  }

  const description = generateDescription(request);
  state.bridgeLoader = `${description}... ${Math.round(timeTaken / 1000)}s`;
};

useInterval(updateLoader, 1000);
</script>
<template>
  <div class="status-bar">
    <div>{{ state.bridgeLoader || "Wireview by radiantly" }}</div>
    <div style="flex-grow: 1"></div>
    <div class="stats-info">
      {{ state.statsInfo }}
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
