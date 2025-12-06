<script setup>
import { onMounted, ref } from 'vue';
import { manager } from './globals';
import DefaultLayout from './components/layouts/DefaultLayout.vue';
import PacketList from './components/panes/PacketList.vue';
import PacketDetails from './components/panes/PacketDetails.vue';
import PacketBytes from './components/panes/PacketBytes.vue';
import IconRibbon from './components/IconRibbon.vue';
import DisplayFilter from './components/DisplayFilter.vue';
import StatusBar from './components/StatusBar.vue';
import FindFrameBar from './components/FindFrameBar.vue';
import Welcome from './components/Welcome.vue';
import LiveCapture from './components/LiveCapture.vue';

// Master buffer to hold all captured packets
let masterBuffer = new Uint8Array(0);
let isProcessing = false;
let pendingBuffer = null;

const handleClear = async () => {
  masterBuffer = new Uint8Array(0);
  pendingBuffer = null;
  await manager.closeFile();
  console.log("Capture cleared");
};

const handleStop = () => {
  // Cancel any pending updates
  pendingBuffer = null;
  console.log("Capture stopped - clearing pending updates");
};

const handleLiveStream = async (newBytes) => {
  // Combine buffers
  const newMaster = new Uint8Array(masterBuffer.length + newBytes.length);
  newMaster.set(masterBuffer);
  newMaster.set(newBytes, masterBuffer.length);
  masterBuffer = newMaster;

  // Debounce/Queue updates to prevent overlapping loads which might crash the worker
  if (isProcessing) {
    pendingBuffer = masterBuffer;
    return;
  }

  await processBuffer(masterBuffer);
};

const processBuffer = async (buffer) => {
  isProcessing = true;
  const startTime = Date.now();
  
  try {
    const file = new File([buffer], "live_capture.pcap", { type: 'application/vnd.tcpdump.pcap' });
    
    // Race against a timeout to prevent hanging forever
    const timeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Worker timed out")), 60000)
    );

    // Use reloadFile for seamless update
    const oldFrameCount = manager.frameCount;
    await Promise.race([
      manager.reloadFile(file),
      timeout
    ]);
    
    // Auto-scroll to the bottom if new frames arrived
    if (manager.frameCount > oldFrameCount) {
      // Small timeout to allow Vue to render the new rows
      setTimeout(() => {
        manager.setActiveFrameIndex(manager.frameCount - 1);
      }, 10);
    }
  } catch (e) {
    console.error("Error updating live capture:", e);
    
    // If worker timed out, it might be stuck. Restart it.
    if (e.message === "Worker timed out") {
      console.warn("Restarting worker due to timeout...");
      manager.deinitialize();
      manager.initialize();
      // Wait a bit for init
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    isProcessing = false;
    const duration = Date.now() - startTime;
    
    // Fixed minimal delay for responsiveness
    console.log(`Processed in ${duration}ms`);

    // If more data came in while processing, run again immediately (with small yield)
    if (pendingBuffer) {
      const nextBuff = pendingBuffer;
      pendingBuffer = null;
      setTimeout(() => processBuffer(nextBuff), 50);
    }
  }
};

onMounted(() => {
  manager.initialize();
});
</script>

<template>
  <div class="app-layout">
    <!-- Header / Toolbar -->
    <header class="toolbar">
      <div class="logo-area">
        <h1>Wireview</h1>
      </div>
      <div class="live-control">
        <LiveCapture @stream-data="handleLiveStream" @clear="handleClear" @stop="handleStop" />
      </div>
    </header>

    <!-- Main UI -->
    <div class="main-content">
      <IconRibbon />
      <DisplayFilter />
      <FindFrameBar v-if="!manager.findFrameBarHidden" />
      
      <div class="workspace">
        <DefaultLayout v-if="manager.sessionInfo"
          :style="{
            '--ws-row-height': manager.rowHeight + 'px',
            '--ws-font-size-monospace': manager.fontSize + 'px',
          }"
        >
          <template #slot1><PacketList /></template>
          <template #slot2><PacketDetails /></template>
          <template #slot3><PacketBytes /></template>
        </DefaultLayout>
        <Welcome v-else />
      </div>
    </div>
    
    <StatusBar />
    
    <!-- Debug Overlay -->
    <div v-if="isProcessing || manager.packetCount > 0" 
         style="position: fixed; bottom: 30px; right: 10px; background: rgba(0,0,0,0.8); color: lime; padding: 5px; font-size: 10px; z-index: 9999; pointer-events: none;">
      Proc: {{ isProcessing }} | Pkts: {{ manager.packetCount }} | Frames: {{ manager.frameCount }}
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.toolbar {
  flex-shrink: 0;
  height: 40px;
  background: var(--ws-lighter-gray);
  border-bottom: var(--ws-pane-border);
  color: var(--ws-text-color);
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 20px;
}

.logo-area h1 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: var(--ws-text-color);
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

/* Override default Welcome width to fit nicely */
:deep(.welcome-container) {
  width: 100%;
  padding: 2rem;
}
</style>