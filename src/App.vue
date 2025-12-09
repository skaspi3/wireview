<script setup>
import { ref } from 'vue';
import { clearPackets, filterLoading, filterProgress, cancelFilter } from './globals';
import DefaultLayout from './components/layouts/DefaultLayout.vue';
import PacketList from './components/panes/PacketList.vue';
import PacketDetails from './components/panes/PacketDetails.vue';
import PacketBytes from './components/panes/PacketBytes.vue';
import IconRibbon from './components/IconRibbon.vue';
import DisplayFilter from './components/DisplayFilter.vue';
import StatusBar from './components/StatusBar.vue';

// Row height for packet list (used for virtual scrolling)
const rowHeight = ref(20);

const handleClear = () => {
  clearPackets();
};

const handleStop = () => {
  // Capture stopped
};
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

    <!-- Main UI -->
    <div class="main-content">
      <IconRibbon @clear="handleClear" @stop="handleStop" />
      <DisplayFilter />

      <div class="workspace">
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
</style>