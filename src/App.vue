<script setup>
import { onMounted, ref } from 'vue';
import { manager, frameDisplayOffset, captureStats, crashLog, wiregasmVersion, DEBUG } from './globals';
import DefaultLayout from './components/layouts/DefaultLayout.vue';
import PacketList from './components/panes/PacketList.vue';
import PacketDetails from './components/panes/PacketDetails.vue';
import PacketBytes from './components/panes/PacketBytes.vue';
import IconRibbon from './components/IconRibbon.vue';
import DisplayFilter from './components/DisplayFilter.vue';
import StatusBar from './components/StatusBar.vue';
import FindFrameBar from './components/FindFrameBar.vue';

// Master buffer to hold captured packets (rolling window)
let masterBuffer = new Uint8Array(0);
let lastProcessedSize = 0;  // Track last processed buffer size
let captureEpoch = 0;  // Incremented on each clear to invalidate stale operations
let reloadCount = 0;  // Track reloads to proactively restart worker

// Restart worker every N successful reloads to prevent WASM memory accumulation
const WORKER_RESTART_INTERVAL = 100;

// Reactive state for UI (trim popup only - stats moved to globals.captureStats)
const trimNotification = ref(null);   // { count: number } when showing trim popup
let trimNotificationTimeout = null;

// Recovery state for crash handler
const recoveryState = ref(null);  // { countdown: number } when recovering
let recoveryInterval = null;

// Engine preparing state (shown during worker restart)
const enginePreparing = ref(false);

const startRecovery = (seconds = 5) => {
  // Only record crash if not already in recovery (prevent duplicate entries)
  const isNewCrash = !recoveryState.value;

  // Clear any existing recovery interval
  if (recoveryInterval) clearInterval(recoveryInterval);

  // Record crash to log (only for new crashes, not repeated calls)
  if (isNewCrash) {
    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 8);  // HH:MM:SS
    const packetCount = captureStats.totalCaptured.value;
    crashLog.value.push({ timestamp, packetCount });
  }

  recoveryState.value = { countdown: seconds };

  recoveryInterval = setInterval(() => {
    if (recoveryState.value && recoveryState.value.countdown > 1) {
      recoveryState.value = { countdown: recoveryState.value.countdown - 1 };
    } else {
      // Countdown finished, clear recovery state
      clearInterval(recoveryInterval);
      recoveryInterval = null;
      recoveryState.value = null;
    }
  }, 1000);
};

const clearRecovery = () => {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
  recoveryState.value = null;
};

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
  if (DEBUG) console.log(`Trimmed buffer: ${buffer.length} → ${trimmed.length} bytes, dropped ${packetsSkipped} old packets (total dropped: ${captureStats.totalDropped.value})`);

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
  reloadCount = 0;
  captureStats.isProcessing.value = false;  // Allow new processing immediately
  captureStats.totalDropped.value = 0;  // Reset dropped packet counter
  captureStats.totalCaptured.value = 0;  // Reset total packets counter
  frameDisplayOffset.value = 0;  // Reset display offset

  // Clear any pending notifications
  if (trimNotificationTimeout) clearTimeout(trimNotificationTimeout);
  trimNotification.value = null;
  clearRecovery();

  // Restart worker to guarantee clean state and cancel any in-flight operations
  enginePreparing.value = true;
  await manager.closeFile({ restartWorker: true });
  enginePreparing.value = false;
  if (DEBUG) console.log("Capture cleared with worker restart, epoch:", myEpoch);
};

const handleStop = () => {
  // No pending queue to clear anymore - we use lastProcessedSize tracking
  if (DEBUG) console.log("Capture stopped");
};

// Minimum buffer size before attempting to parse (header + at least one packet)
const MIN_BUFFER_SIZE = 100;

const handleLiveStream = async (newBytes) => {
  // Combine buffers
  const newMaster = new Uint8Array(masterBuffer.length + newBytes.length);
  newMaster.set(masterBuffer);
  newMaster.set(newBytes, masterBuffer.length);
  masterBuffer = newMaster;

  // Apply rolling buffer - trim old packets if exceeding limit
  masterBuffer = trimBuffer(masterBuffer);

  // Don't try to parse until we have enough data
  if (masterBuffer.length < MIN_BUFFER_SIZE) {
    return;
  }

  // If already processing, just return - the finally block will check if buffer grew
  if (captureStats.isProcessing.value) {
    return;
  }

  await processBuffer(masterBuffer);
};

const processBuffer = async (buffer, epoch = captureEpoch) => {
  // Check if this operation is stale (capture was cleared while queued)
  if (epoch !== captureEpoch) {
    if (DEBUG) console.log("Discarding stale buffer processing, epoch mismatch:", epoch, "vs", captureEpoch);
    return;
  }

  captureStats.isProcessing.value = true;
  const startTime = Date.now();
  let success = false;

  try {
    const file = new File([buffer], "live_capture.pcap", { type: 'application/vnd.tcpdump.pcap' });

    // Race against a timeout to prevent hanging forever
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Worker timed out")), 60000)
    );

    // Use reloadFile for seamless update
    const oldFrameCount = manager.frameCount;
    const reloadResult = await Promise.race([
      manager.reloadFile(file),
      timeout
    ]);

    // Check again after async operation - epoch may have changed during processing
    if (epoch !== captureEpoch) {
      if (DEBUG) console.log("Discarding stale result after processing, epoch mismatch");
      return;
    }

    // Check if reload actually succeeded using the return value
    if (reloadResult && reloadResult.success) {
      success = true;
      reloadCount++;

      // Clear recovery message on first successful packet after crash
      if (recoveryState.value) {
        clearRecovery();
      }

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

      // Proactively restart worker to prevent WASM memory accumulation
      if (reloadCount >= WORKER_RESTART_INTERVAL) {
        reloadCount = 0;
        console.log("Proactive worker restart after", WORKER_RESTART_INTERVAL, "reloads");
        enginePreparing.value = true;
        await manager.closeFile({ restartWorker: true });
        enginePreparing.value = false;
      }
    } else {
      const reason = reloadResult?.reason || 'unknown';
      if (DEBUG) console.warn(`reloadFile failed: ${reason}`);

      // Show recovery message for cancelled/failed operations
      if (reason === 'cancelled' || reason === 'epoch_changed') {
        startRecovery(13);
      }
    }
  } catch (e) {
    console.error("Error updating live capture:", e);

    // If worker timed out or cancelled, restart it cleanly
    if (e.message === "Worker timed out" || e.cancelled) {
      console.warn("Restarting worker due to timeout/cancel...");
      startRecovery(13);  // Show recovery message with 13 second countdown
      enginePreparing.value = true;
      await manager.closeFile({ restartWorker: true });
      enginePreparing.value = false;
    }
  } finally {
    captureStats.isProcessing.value = false;
    const duration = Date.now() - startTime;
    if (DEBUG) console.log(`Processed in ${duration}ms, buffer size: ${buffer.length}, success: ${success}`);

    // Only update lastProcessedSize and schedule reprocess on SUCCESS
    // This prevents infinite retry loops when pcap parsing fails
    if (success) {
      lastProcessedSize = buffer.length;

      // If more data came in while processing, run again immediately (with small yield)
      if (epoch === captureEpoch && masterBuffer.length > lastProcessedSize) {
        if (DEBUG) console.log(`Buffer grew from ${lastProcessedSize} to ${masterBuffer.length}, scheduling reprocess`);
        setTimeout(() => processBuffer(masterBuffer, epoch), 50);
      }
    } else {
      // On failure, still update lastProcessedSize to avoid retrying the exact same buffer
      // But don't schedule reprocess - wait for new data to come in
      lastProcessedSize = buffer.length;
      // Only warn if not due to intentional restart (epoch change)
      if (DEBUG && epoch === captureEpoch) {
        console.warn("Processing failed, not scheduling reprocess");
      }
    }
  }
};

onMounted(async () => {
  // Note: manager.initialize() is now called in globals.js at module load time
  // to start Wiregasm initialization as early as possible

  // Fetch Wiregasm version
  try {
    const response = await fetch('/wiregasm-version.txt');
    if (response.ok) {
      wiregasmVersion.value = (await response.text()).trim();
    }
  } catch (e) {
    // Ignore errors fetching version
  }
});
</script>

<template>
  <div class="app-layout">
    <!-- Main UI -->
    <div class="main-content">
      <IconRibbon @stream-data="handleLiveStream" @clear="handleClear" @stop="handleStop" />
      <DisplayFilter />
      <FindFrameBar v-if="!manager.findFrameBarHidden" />
      
      <div class="workspace">
        <DefaultLayout
          :style="{
            '--ws-row-height': manager.rowHeight + 'px',
            '--ws-font-size-monospace': manager.fontSize + 'px',
          }"
        >
          <template #slot1><PacketList /></template>
          <template #slot2><PacketDetails /></template>
          <template #slot3><PacketBytes /></template>
        </DefaultLayout>
      </div>
    </div>
    
    <StatusBar />

    <!-- Trim Notification Popup -->
    <Transition name="fade">
      <div v-if="trimNotification" class="trim-popup">
        Trimming {{ trimNotification.count.toLocaleString() }} old packets
      </div>
    </Transition>

    <!-- Recovery Notification Popup -->
    <Transition name="fade">
      <div v-if="recoveryState" class="recovery-popup">
        Recovering from unexpected error... wait {{ recoveryState.countdown }} sec
      </div>
    </Transition>

    <!-- Engine Preparing Popup (hidden during recovery to avoid overlap) -->
    <Transition name="fade">
      <div v-if="enginePreparing && !recoveryState" class="engine-popup">
        Engine preparing to start...
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

/* Recovery notification popup */
.recovery-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  color: #f87171;
  padding: 20px 32px;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 500;
  z-index: 10001;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(248, 113, 113, 0.4);
}

/* Engine preparing popup */
.engine-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.9);
  color: #60a5fa;
  padding: 20px 32px;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 500;
  z-index: 10001;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(96, 165, 250, 0.4);
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