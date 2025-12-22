<script setup>
import { ref, useTemplateRef, computed } from 'vue';
import { clearPackets, filterLoading, filterProgress, cancelFilter, packets, allPackets, captureActive } from './globals';
import './packetCache';  // Initialize packet cache (registers clearer callback)
import DefaultLayout from './components/layouts/DefaultLayout.vue';
import PacketList from './components/panes/PacketList.vue';
import PacketDetails from './components/panes/PacketDetails.vue';
import PacketBytes from './components/panes/PacketBytes.vue';
import IconRibbon from './components/IconRibbon.vue';
import DisplayFilter from './components/DisplayFilter.vue';
import StatusBar from './components/StatusBar.vue';
import FileBrowser from './components/FileBrowser.vue';
import InsightsPanel from './components/InsightsPanel.vue';

// Show landing page when no packets and not actively using the app
const showLandingPage = computed(() => packets.value.length === 0);

// Row height for packet list (used for virtual scrolling)
const rowHeight = ref(20);

// References for file browser
const fileBrowserRef = useTemplateRef('file-browser');
const iconRibbonRef = useTemplateRef('icon-ribbon');

// Insights panel visibility
const showInsights = ref(false);

const handleClear = () => {
  clearPackets();
};

const handleStop = () => {
  // Capture stopped
};

const handleOpenFileBrowser = () => {
  fileBrowserRef.value?.open();
};

const handleFileSelect = (filePath) => {
  iconRibbonRef.value?.loadPcapFile(filePath);
};

const handleOpenInsights = () => {
  showInsights.value = true;
};

// Total packet count (from allPackets when filter is active, otherwise from packets)
const totalPacketCount = computed(() => {
  return allPackets.value.length > 0 ? allPackets.value.length : packets.value.length;
});

// Show packet counter only when capturing or has packets
const showPacketCounter = computed(() => {
  return captureActive.value || packets.value.length > 0;
});
</script>

<template>
  <div class="app-layout">
    <!-- Filter Loading Overlay -->
    <div v-if="filterLoading" class="filter-loading-overlay">
      <div class="filter-loading-popup">
        <div class="filter-loading-text">Applying filter...</div>
        <div class="filter-spinner"></div>
        <div v-if="filterProgress > 0" class="filter-progress">
          {{ filterProgress }} packets found
        </div>
        <button class="filter-cancel-btn" @click="cancelFilter">Cancel</button>
      </div>
    </div>

    <!-- File Browser Modal -->
    <FileBrowser ref="file-browser" @select="handleFileSelect" />

    <!-- Insights Panel Modal -->
    <InsightsPanel v-if="showInsights" @close="showInsights = false" />

    <!-- Main UI -->
    <div class="main-content">
      <IconRibbon ref="icon-ribbon" :hide-insights="showLandingPage" @clear="handleClear" @stop="handleStop" @openFileBrowser="handleOpenFileBrowser" @openInsights="handleOpenInsights" />
      <DisplayFilter />

      <!-- Landing Page with Interface Selector (teleport target) -->
      <!-- Always render container for Teleport, use v-show to hide -->
      <div class="landing-page" :class="{ 'landing-hidden': !showLandingPage }">
        <div id="interface-selector-container"></div>
      </div>

      <!-- Workspace (shown when packets available or hidden when landing page) -->
      <div class="workspace" :class="{ 'workspace-hidden': showLandingPage }">
        <DefaultLayout
          :style="{
            '--ws-row-height': rowHeight + 'px',
            '--ws-font-size-monospace': '12px',
          }"
        >
          <template #slot1><PacketList /></template>
          <template #slot2><PacketDetails /></template>
          <template #slot3><PacketBytes /></template>
        </DefaultLayout>
      </div>
    </div>

    <!-- Packet Counter (bottom-center) -->
    <div v-if="showPacketCounter" class="packet-counter">
      {{ totalPacketCount.toLocaleString() }} packets
    </div>

    <StatusBar />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Critical for flex scrolling */
}

.workspace {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: var(--ws-almost-white);
}

.workspace-hidden {
  display: none;
}

.landing-page {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f4fc 0%, #d4e9f7 50%, #c5e0f5 100%);
  min-height: 0;
  overflow: auto;
}

.landing-hidden {
  display: none;
}

.filter-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.filter-loading-popup {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 30px 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.filter-loading-text {
  color: #e5e7eb;
  font-size: 16px;
  font-weight: 500;
}

.filter-spinner {
  width: 60px;
  height: 60px;
  border: 5px solid transparent;
  border-top: 5px solid #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.filter-progress {
  color: #9ca3af;
  font-size: 14px;
  font-family: monospace;
}

.filter-cancel-btn {
  margin-top: 10px;
  padding: 8px 24px;
  background: #4b5563;
  color: #e5e7eb;
  border: 1px solid #6b7280;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.filter-cancel-btn:hover {
  background: #6b7280;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Packet Counter - bottom center */
.packet-counter {
  position: fixed;
  bottom: 28px;  /* Above status bar */
  left: 50%;
  transform: translateX(-50%);
  background: rgba(134, 239, 172, 0.9);  /* Light green/salad */
  color: #166534;  /* Dark green text */
  padding: 4px 16px;
  border-radius: 12px;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 100;
  pointer-events: none;
}
</style>