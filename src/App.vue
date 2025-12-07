<script setup>
import { ref } from 'vue';
import { DEBUG, clearPackets, packets, activePacketIndex } from './globals';
import DefaultLayout from './components/layouts/DefaultLayout.vue';
import PacketList from './components/panes/PacketList.vue';
import PacketDetails from './components/panes/PacketDetails.vue';
import PacketBytes from './components/panes/PacketBytes.vue';
import IconRibbon from './components/IconRibbon.vue';
import StatusBar from './components/StatusBar.vue';

// =====================================================================
// THIN CLIENT MODE - No Wiregasm/WASM, packets processed on server
// =====================================================================

// Row height for packet list (used for virtual scrolling)
const rowHeight = ref(20);

const handleClear = () => {
  clearPackets();
  if (DEBUG) console.log("Capture cleared");
};

const handleStop = () => {
  if (DEBUG) console.log("Capture stopped");
};

// Auto-scroll to bottom when new packets arrive
const autoScrollEnabled = ref(true);
</script>

<template>
  <div class="app-layout">
    <!-- Main UI -->
    <div class="main-content">
      <IconRibbon @clear="handleClear" @stop="handleStop" />

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
</style>