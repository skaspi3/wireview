<script setup>
import { ref } from 'vue';
import { clearPackets, filterLoading } from './globals';
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
      <div class="filter-spinner"></div>
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

.filter-spinner {
  width: 80px;
  height: 80px;
  border: 6px solid transparent;
  border-top: 6px solid #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>