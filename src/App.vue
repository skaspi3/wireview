<script setup>
import { onMounted, ref } from 'vue';
import { manager, frameDisplayOffset, captureStats } from './globals';
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

// Master buffer to hold captured packets (rolling window)
let masterBuffer = new Uint8Array(0);
let lastProcessedSize = 0;  // Track last processed buffer size
let captureEpoch = 0;  // Incremented on each clear to invalidate stale operations

// Reactive state for UI (trim popup only - stats moved to globals.captureStats)
const trimNotification = ref(null);   // { count: number } when showing trim popup
let trimNotificationTimeout = null;

// Rolling buffer settings
const MAX_BUFFER_SIZE = 20 * 1024 * 1024;  // Trim when exceeds 20MB
const TRIM_TO_SIZE = 12 * 1024 * 1024;     // Trim down to 12MB
const PCAP_GLOBAL_HEADER_SIZE = 24;
const PCAP_PACKET_HEADER_SIZE = 16;

// Trim old packets from buffer, keeping valid pcap format
const trimBuffer = (buffer) => {
  if (buffer.length <= MAX_BUFFER_SIZE) return buffer;

  // Target: keep roughly TRIM_TO_SIZE of recent data
  const targetStart = buffer.length - TRIM_TO_SIZE;

  // Walk through packets to find a boundary after targetStart
  let offset = PCAP_GLOBAL_HEADER_SIZE;
  let packetsSkipped = 0;

  while (offset < targetStart && offset + PCAP_PACKET_HEADER_SIZE <= buffer.length) {
    // Read captured length from packet header (bytes 8-11, little-endian)
    const capturedLen = buffer[offset + 8] |
                        (buffer[offset + 9] << 8) |
                        (buffer[offset + 10] << 16) |
                        (buffer[offset + 11] << 24);

    // Sanity check - if length seems wrong, bail out
    if (capturedLen < 0 || capturedLen > 65535) {
      console.warn("trimBuffer: invalid packet length, skipping trim");
      return buffer;
    }

    const nextOffset = offset + PCAP_PACKET_HEADER_SIZE + capturedLen;
    if (nextOffset > targetStart) break;
    offset = nextOffset;
    packetsSkipped++;
  }

  // Create new buffer: global header + packets from offset onwards
  const dataToKeep = buffer.length - offset;
  const newSize = PCAP_GLOBAL_HEADER_SIZE + dataToKeep;
  const trimmed = new Uint8Array(newSize);
  trimmed.set(buffer.slice(0, PCAP_GLOBAL_HEADER_SIZE)); // Copy global header
  trimmed.set(buffer.slice(offset), PCAP_GLOBAL_HEADER_SIZE); // Copy recent packets

  captureStats.totalDropped.value += packetsSkipped;
  frameDisplayOffset.value += packetsSkipped;  // Shift display numbers to keep them continuous
  console.log(`Trimmed buffer: ${buffer.length} → ${trimmed.length} bytes, dropped ${packetsSkipped} old packets (total dropped: ${captureStats.totalDropped.value})`);

  // Show trim notification popup
  if (trimNotificationTimeout) clearTimeout(trimNotificationTimeout);
  trimNotification.value = { count: packetsSkipped };
  trimNotificationTimeout = setTimeout(() => {
    trimNotification.value = null;
  }, 2500);

  return trimmed;
};

const handleClear = async () => {
  captureEpoch++;  // Invalidate all in-progress operations
  const myEpoch = captureEpoch;

  masterBuffer = new Uint8Array(0);
  lastProcessedSize = 0;
  captureStats.isProcessing.value = false;  // Allow new processing immediately
  captureStats.totalDropped.value = 0;  // Reset dropped packet counter
  captureStats.totalCaptured.value = 0;  // Reset total packets counter
  frameDisplayOffset.value = 0;  // Reset display offset

  // Clear any pending trim notification
  if (trimNotificationTimeout) clearTimeout(trimNotificationTimeout);
  trimNotification.value = null;

  // Restart worker to guarantee clean state and cancel any in-flight operations
  await manager.closeFile({ restartWorker: true });
  console.log("Capture cleared with worker restart, epoch:", myEpoch);
};

const handleStop = () => {
  // No pending queue to clear anymore - we use lastProcessedSize tracking
  console.log("Capture stopped");
};

const handleLiveStream = async (newBytes) => {
  // Combine buffers
  const newMaster = new Uint8Array(masterBuffer.length + newBytes.length);
  newMaster.set(masterBuffer);
  newMaster.set(newBytes, masterBuffer.length);
  masterBuffer = newMaster;

  // Apply rolling buffer - trim old packets if exceeding limit
  masterBuffer = trimBuffer(masterBuffer);

  // If already processing, just return - the finally block will check if buffer grew
  if (captureStats.isProcessing.value) {
    return;
  }

  await processBuffer(masterBuffer);
};

const processBuffer = async (buffer, epoch = captureEpoch) => {
  // Check if this operation is stale (capture was cleared while queued)
  if (epoch !== captureEpoch) {
    console.log("Discarding stale buffer processing, epoch mismatch:", epoch, "vs", captureEpoch);
    return;
  }

  captureStats.isProcessing.value = true;
  const startTime = Date.now();
  let success = false;

  try {
    const file = new File([buffer], "live_capture.pcap", { type: 'application/vnd.tcpdump.pcap' });

    // Race against a timeout to prevent hanging forever (30s with smaller buffer limit)
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Worker timed out")), 30000)
    );

    // Use reloadFile for seamless update
    const oldFrameCount = manager.frameCount;
    const reloadResult = await Promise.race([
      manager.reloadFile(file),
      timeout
    ]);

    // Check again after async operation - epoch may have changed during processing
    if (epoch !== captureEpoch) {
      console.log("Discarding stale result after processing, epoch mismatch");
      return;
    }

    // Check if reload actually succeeded using the return value
    if (reloadResult && reloadResult.success) {
      success = true;
      const newFrameCount = reloadResult.frameCount || manager.frameCount;

      // Update total packets captured (always increases: visible + dropped)
      captureStats.totalCaptured.value = Math.max(
        captureStats.totalCaptured.value,
        newFrameCount + captureStats.totalDropped.value
      );

      // Auto-scroll to the bottom if new frames arrived
      if (newFrameCount > oldFrameCount) {
        // Small timeout to allow Vue to render the new rows
        setTimeout(() => {
          if (epoch === captureEpoch) {  // Check epoch before auto-scroll
            manager.setActiveFrameIndex(manager.frameCount - 1);
          }
        }, 10);
      }
    } else {
      const reason = reloadResult?.reason || 'unknown';
      console.warn(`reloadFile failed: ${reason}`);
    }
  } catch (e) {
    console.error("Error updating live capture:", e);

    // If worker timed out or cancelled, restart it cleanly
    if (e.message === "Worker timed out" || e.cancelled) {
      console.warn("Restarting worker due to timeout/cancel...");
      await manager.closeFile({ restartWorker: true });
    }
  } finally {
    captureStats.isProcessing.value = false;
    const duration = Date.now() - startTime;
    console.log(`Processed in ${duration}ms, buffer size: ${buffer.length}, success: ${success}`);

    // Only update lastProcessedSize and schedule reprocess on SUCCESS
    // This prevents infinite retry loops when pcap parsing fails
    if (success) {
      lastProcessedSize = buffer.length;

      // If more data came in while processing, run again immediately (with small yield)
      if (epoch === captureEpoch && masterBuffer.length > lastProcessedSize) {
        console.log(`Buffer grew from ${lastProcessedSize} to ${masterBuffer.length}, scheduling reprocess`);
        setTimeout(() => processBuffer(masterBuffer, epoch), 50);
      }
    } else {
      // On failure, still update lastProcessedSize to avoid retrying the exact same buffer
      // But don't schedule reprocess - wait for new data to come in
      lastProcessedSize = buffer.length;
      console.warn("Processing failed, not scheduling reprocess");
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

    <!-- Trim Notification Popup -->
    <Transition name="fade">
      <div v-if="trimNotification" class="trim-popup">
        Trimming {{ trimNotification.count.toLocaleString() }} old packets
      </div>
    </Transition>
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

/* Trim notification popup */
.trim-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fbbf24;
  padding: 16px 28px;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 500;
  z-index: 10000;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(251, 191, 36, 0.3);
}

/* Fade transition for popup */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>