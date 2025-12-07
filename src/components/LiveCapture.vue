<template>
  <div class="live-capture-wrapper">
    <!-- Connecting / Interface Selection State -->
    <div v-if="!isCapturing" class="controls">
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
      </div>
    </div>

    <!-- Capturing State -->
    <div v-else class="status-bar">
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
import { ref, onUnmounted, onMounted } from 'vue';
import { DEBUG, nodeVersion, backendPort, backendStatus, certInfo, packets, captureStats } from '../globals';

const emit = defineEmits(['clear', 'stop']);

const ws = ref(null);
const isConnected = ref(false);
const isCapturing = ref(false);
const interfaces = ref([]);
const selectedInterface = ref('');

const error = ref(null);

// WebSocket proxied through Vite - same origin, /ws path
const WS_URL = `wss://${window.location.host}/ws`;

// Expose ws for packet details requests
const getWebSocket = () => ws.value;
defineExpose({ getWebSocket });

const closeSocket = () => {
  if (ws.value) {
    ws.value.onclose = null; // Prevent loops
    ws.value.close();
    ws.value = null;
  }
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
      if (DEBUG) console.log("WS Connected (thin-client mode)");
    };

    ws.value.onmessage = (event) => {
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
        }

        // Handle packet summaries from server
        if (msg.type === 'packet') {
          if (!isCapturing.value) return;

          packets.value.push(msg.data);
          captureStats.totalCaptured.value++;

          // Limit packets in memory (rolling buffer)
          const MAX_PACKETS = 10000;
          if (packets.value.length > MAX_PACKETS) {
            const dropped = packets.value.length - MAX_PACKETS;
            packets.value = packets.value.slice(dropped);
            captureStats.totalDropped.value += dropped;
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
          if (DEBUG) console.log("Capture stopped by server");
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
  ws.value.send(JSON.stringify({
    type: 'start',
    interface: selectedInterface.value
  }));

  isCapturing.value = true;
  emit('clear');
};

const stopCapture = () => {
  if (ws.value && isConnected.value) {
    try {
      ws.value.send(JSON.stringify({ type: 'stop' }));
    } catch (e) {}
  }

  isCapturing.value = false;
  emit('stop');
};

const restartCapture = () => {
  isCapturing.value = false;

  // Send stop command to backend
  if (ws.value && isConnected.value) {
    try {
      ws.value.send(JSON.stringify({ type: 'stop' }));
    } catch (e) {}
  }

  emit('clear');

  // Wait for backend to stop/reset, then start again
  setTimeout(() => {
    if (ws.value && isConnected.value) {
      ws.value.send(JSON.stringify({
        type: 'start',
        interface: selectedInterface.value
      }));
      isCapturing.value = true;
    }
  }, 200);
};

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
</style>
