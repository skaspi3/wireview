<template>
  <div class="live-capture-wrapper">
    <!-- Connecting / Interface Selection State -->
    <div v-if="!isCapturing && !isLoadingPcap && !loadedPcapFile" class="controls">
      <div v-if="!isConnected">
        <button @click="connect" class="btn btn-secondary">
          Connect to Backend
        </button>
      </div>

      <div v-else class="selection-group">
        <select v-model="selectedInterface" class="interface-select">
          <option v-for="iface in interfaces" :key="iface" :value="iface">
            {{ iface }}
          </option>
        </select>
        <button @click="startCapture" class="btn btn-primary">
          <span class="icon">●</span> Start
        </button>
        <button @click="openFileBrowser" class="btn btn-file" title="Open capture file">
          📂 Open
        </button>
      </div>
    </div>

    <!-- Loading Pcap State -->
    <div v-if="isLoadingPcap" class="status-bar loading-pcap">
      <span class="loading-indicator">
        <span class="spinner-small"></span>
        Loading {{ loadingPcapFilename }}...
      </span>
      <span class="progress-count" v-if="loadPcapProgress > 0">
        {{ loadPcapProgress.toLocaleString() }} packets
      </span>
    </div>

    <!-- Loaded Pcap File State -->
    <div v-else-if="loadedPcapFile" class="status-bar loaded-pcap">
      <span class="file-indicator">📄 {{ loadedPcapFilename }}</span>
      <span class="packet-count">{{ packets.length.toLocaleString() }} packets</span>
      <button @click="closePcapFile" class="btn btn-secondary" title="Close file">
        Close
      </button>
      <button @click="openFileBrowser" class="btn btn-file" title="Open another file">
        📂 Open
      </button>
    </div>

    <!-- Capturing State -->
    <div v-else-if="isCapturing" class="status-bar">
      <span class="recording-indicator">● Capture</span>
      <span class="interface-tag">on {{ selectedInterface }}</span>

      <button @click="restartCapture" class="btn btn-warning" title="Restart Capture">
        ↺
      </button>
      <button @click="stopCapture" class="btn btn-danger">
        Stop
      </button>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="error-toast">
      {{ error }}
      <button @click="error = null">×</button>
    </div>
  </div>
</template>

<script setup>
import { ref, triggerRef, onUnmounted, onMounted, computed } from 'vue';
import { nodeVersion, backendPort, backendStatus, certInfo, packets, allPackets, websocket, displayFilter, filterError, filterLoading, filterProgress, trackReceived, trackSent, activePacketIndex, hostIP } from '../globals';

const emit = defineEmits(['clear', 'stop', 'openFileBrowser']);

const ws = ref(null);
const isConnected = ref(false);
const isCapturing = ref(false);
const interfaces = ref([]);
const selectedInterface = ref('');

const error = ref(null);

// Pcap file loading state
const isLoadingPcap = ref(false);
const loadPcapProgress = ref(0);
const loadedPcapFile = ref(null);
const loadingPcapFilename = ref('');

const loadedPcapFilename = computed(() => {
  if (!loadedPcapFile.value) return '';
  const parts = loadedPcapFile.value.split('/');
  return parts[parts.length - 1];
});

// Batched update for performance
let pendingUpdate = false;
const scheduleUpdate = () => {
  if (pendingUpdate) return;
  pendingUpdate = true;
  requestAnimationFrame(() => {
    triggerRef(packets);
    pendingUpdate = false;
  });
};

// WebSocket proxied through Vite - same origin, /ws path
const WS_URL = `wss://${window.location.host}/ws`;

// Expose ws for packet details requests
const getWebSocket = () => ws.value;

const closeSocket = () => {
  if (ws.value) {
    ws.value.onclose = null; // Prevent loops
    ws.value.close();
    ws.value = null;
  }
};

// Helper to send and track bytes
const sendMessage = (data) => {
  if (!ws.value) return;
  const msg = JSON.stringify(data);
  trackSent(msg.length);
  ws.value.send(msg);
};

const connect = () => {
  closeSocket(); // Ensure no duplicates
  error.value = null;
  backendStatus.value = 'connecting';
  try {
    ws.value = new WebSocket(WS_URL);

    ws.value.onopen = () => {
      isConnected.value = true;
      backendStatus.value = 'connected';
      websocket.value = ws.value; // Store in global for filter requests
    };

    ws.value.onmessage = (event) => {
      // Track received bytes
      const dataSize = typeof event.data === 'string' ? event.data.length : event.data.size;
      trackReceived(dataSize);

      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'interfaces') {
          interfaces.value = msg.list;
          if (msg.default && msg.list.includes(msg.default)) {
            selectedInterface.value = msg.default;
          } else if (msg.list.length > 0) {
            selectedInterface.value = msg.list[0];
          }
          if (msg.nodeVersion) {
            nodeVersion.value = msg.nodeVersion;
          }
          if (msg.backendPort) {
            backendPort.value = msg.backendPort;
          }
          if (msg.certInfo) {
            certInfo.value = msg.certInfo;
          }
          if (msg.hostIP) {
            hostIP.value = msg.hostIP;
          }
        }

        // Handle packet summaries from server
        if (msg.type === 'packet') {
          if (!isCapturing.value) return;
          // When no filter active: add to both arrays and update UI
          // When filter active: only add to allPackets (no UI update, wait for filteredPacket)
          if (!displayFilter.value) {
            packets.value.push(msg.data);
            allPackets.value.push(msg.data);
            scheduleUpdate();
          } else {
            allPackets.value.push(msg.data);
          }
        }

        // Handle packet details response
        if (msg.type === 'packetDetails') {
          // This will be handled by the requesting component via a callback
          if (window._packetDetailsCallback) {
            window._packetDetailsCallback(msg.frame, msg.details);
          }
        }

        if (msg.type === 'stopped') {
          // Capture stopped by server
        }

        // Handle filter validation response
        if (msg.type === 'filterValidation') {
          if (window._filterValidationCallback) {
            window._filterValidationCallback(msg.filter, msg.valid, msg.error);
          }
        }

        // Handle filter progress updates
        if (msg.type === 'filterProgress') {
          filterProgress.value = msg.count;
        }

        // Handle filter cancelled
        if (msg.type === 'filterCancelled') {
          filterLoading.value = false;
          filterProgress.value = 0;
        }

        // Handle single filtered packet (real-time match during active filter)
        if (msg.type === 'filteredPacket') {
          if (displayFilter.value && msg.data) {
            packets.value.push(msg.data);
            scheduleUpdate();
          }
        }

        // Handle filtered packets from server
        if (msg.type === 'filteredPackets') {
          filterLoading.value = false;  // Hide loading spinner
          filterProgress.value = 0;     // Reset progress

          // Handle cancelled state - just close the popup, don't change filter
          if (msg.cancelled) {
            return;
          }

          if (msg.error) {
            filterError.value = msg.error;
          } else {
            filterError.value = null;
            displayFilter.value = msg.filter || '';

            // If filter is empty, restore all packets
            if (!msg.filter) {
              // allPackets contains the full list, restore it
              if (allPackets.value.length > 0) {
                packets.value = [...allPackets.value];
              }
            } else {
              // Store current packets as allPackets if not already saved
              if (allPackets.value.length === 0 && packets.value.length > 0) {
                allPackets.value = [...packets.value];
              }
              // Replace with filtered packets (create new array to ensure separation)
              packets.value = [...msg.packets];
            }
            triggerRef(packets);
          }
        }

        // Handle pcap file loading messages
        if (msg.type === 'loadPcapStart') {
          isLoadingPcap.value = true;
          loadPcapProgress.value = 0;
          loadingPcapFilename.value = msg.filename;
          packets.value = [];
          allPackets.value = [];
          activePacketIndex.value = null;
          triggerRef(packets);
        }

        if (msg.type === 'loadPcapProgress') {
          loadPcapProgress.value = msg.count;
        }

        if (msg.type === 'loadPcapComplete') {
          isLoadingPcap.value = false;
          loadPcapProgress.value = 0;
          loadedPcapFile.value = msg.path;
          packets.value = [...msg.packets];
          allPackets.value = [...msg.packets];
          triggerRef(packets);
        }

        if (msg.type === 'loadPcapError') {
          isLoadingPcap.value = false;
          loadPcapProgress.value = 0;
          loadingPcapFilename.value = '';
          error.value = msg.error;
        }

        if (msg.type === 'error') {
          error.value = msg.message;
          stopCapture();
        }
      } catch (e) {
        console.warn("Protocol error:", e);
      }
    };

    ws.value.onerror = (e) => {
      console.error(e);
      error.value = "Connection failed";
      isConnected.value = false;
      isCapturing.value = false;
      backendStatus.value = 'disconnected';
    };

    ws.value.onclose = () => {
      isConnected.value = false;
      isCapturing.value = false;
      backendStatus.value = 'disconnected';
    };
  } catch (e) {
    error.value = e.message;
    backendStatus.value = 'disconnected';
  }
};

const startCapture = () => {
  if (!ws.value || !isConnected.value) return;

  // Send start command
  sendMessage({
    type: 'start',
    interface: selectedInterface.value
  });

  isCapturing.value = true;
  emit('clear');
};

const stopCapture = () => {
  if (ws.value && isConnected.value) {
    try {
      sendMessage({ type: 'stop' });
    } catch (e) {}
  }

  isCapturing.value = false;
  emit('stop');
};

const restartCapture = () => {
  isCapturing.value = false;

  // Clear any active filter
  displayFilter.value = '';
  filterError.value = null;

  // Send stop command to backend
  if (ws.value && isConnected.value) {
    try {
      sendMessage({ type: 'stop' });
    } catch (e) {}
  }

  emit('clear');

  // Wait for backend to stop/reset, then start again
  setTimeout(() => {
    if (ws.value && isConnected.value) {
      sendMessage({
        type: 'start',
        interface: selectedInterface.value
      });
      isCapturing.value = true;
    }
  }, 200);
};

// Open file browser
const openFileBrowser = () => {
  emit('openFileBrowser');
};

// Load pcap file from server
const loadPcapFile = (filePath) => {
  if (!ws.value || !isConnected.value) return;

  // Clear current state
  loadedPcapFile.value = null;
  displayFilter.value = '';
  filterError.value = null;

  emit('clear');

  sendMessage({
    type: 'loadPcap',
    path: filePath
  });
};

// Close loaded pcap file
const closePcapFile = () => {
  loadedPcapFile.value = null;
  packets.value = [];
  allPackets.value = [];
  displayFilter.value = '';
  filterError.value = null;
  triggerRef(packets);
  emit('clear');
};

defineExpose({ getWebSocket, loadPcapFile });

// Auto-connect on mount
onMounted(() => {
  connect();
});

onUnmounted(() => {
  if (ws.value) ws.value.close();
});
</script>

<style scoped>
.live-capture-wrapper {
  display: flex;
  align-items: center;
  margin-left: 10px;
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.selection-group {
  display: flex;
  gap: 10px;
  align-items: center;
  background: #374151;
  padding: 4px;
  border-radius: 4px;
}

.interface-select {
  background: #1f2937;
  color: white;
  border: 1px solid #4b5563;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
}

.btn {
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
}

.btn-primary { background-color: #3b82f6; color: white; }
.btn-secondary { background-color: #4b5563; color: white; }
.btn-danger { background-color: #ef4444; color: white; margin-left: 10px; padding: 8px 16px; font-size: 1.0em; }
.btn-warning { background-color: #f59e0b; color: white; margin-left: 10px; padding: 8px 14px; font-size: 1.1em; }
.btn-file { background-color: #6366f1; color: white; }

.status-bar {
  display: flex;
  align-items: center;
  background: #1f2937;
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-family: monospace;
}

.recording-indicator {
  color: #ef4444;
  animation: pulse 1.5s infinite;
  margin-right: 10px;
  font-size: 1.1em;
  font-weight: bold;
}

.interface-tag {
  color: #9ca3af;
  margin-left: 10px;
  font-size: 1.0em;
  border-left: 1px solid #6b7280;
  padding-left: 10px;
}

.error-toast {
  position: absolute;
  top: 60px;
  right: 20px;
  background: #fee2e2;
  color: #b91c1c;
  padding: 10px;
  border-radius: 4px;
  z-index: 1000;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

/* Loading and Loaded pcap styles */
.loading-pcap, .loaded-pcap {
  gap: 12px;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #93c5fd;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.progress-count {
  color: #9ca3af;
  font-size: 0.9em;
}

.file-indicator {
  color: #93c5fd;
  font-weight: bold;
}

.packet-count {
  color: #9ca3af;
  border-left: 1px solid #4b5563;
  padding-left: 12px;
  margin-left: 8px;
}

.loaded-pcap .btn {
  margin-left: 8px;
  padding: 4px 10px;
  font-size: 0.85em;
}
</style>
