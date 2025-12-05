<template>
  <div class="live-capture-wrapper">
    <!-- Start Button -->
    <button 
      v-if="!isConnected" 
      @click="startCapture" 
      class="btn btn-primary"
    >
      <span class="icon">🔴</span> Start Live Capture
    </button>

    <!-- Stop Button & Status -->
    <div v-else class="status-bar">
      <span class="recording-indicator">● Rec</span>
      <span class="stats">{{ packetCount }} chunks ({{ totalBytes }} B)</span>
      <span v-if="interfaceName" class="interface-tag">on {{ interfaceName }}</span>
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
import { ref, onUnmounted } from 'vue';

const emit = defineEmits(['stream-data']);

const ws = ref(null);
const isConnected = ref(false);
const packetCount = ref(0);
const totalBytes = ref(0);
const interfaceName = ref('');
const error = ref(null);
let chunkBuffer = [];
let flushInterval = null;

const WS_URL = `wss://${window.location.hostname}:3000`;

const startCapture = () => {
  error.value = null;
  chunkBuffer = [];
  packetCount.value = 0;
  totalBytes.value = 0;
  interfaceName.value = '';

  try {
    ws.value = new WebSocket(WS_URL);
    ws.value.binaryType = "arraybuffer";

    ws.value.onopen = () => {
      isConnected.value = true;
      console.log("WS Connected");
      // Flush buffer to Wiregasm more frequently (50ms) for smoother updates
      flushInterval = setInterval(flushToEngine, 50);
    };

    ws.value.onmessage = (event) => {
      // Handle text messages (metadata)
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "metadata") {
            interfaceName.value = msg.interface;
          }
        } catch (e) {
          console.warn("Received non-JSON text message:", event.data);
        }
        return;
      }

      // Handle binary data (pcap chunks)
      if (event.data) {
        chunkBuffer.push(event.data);
        packetCount.value++;
        totalBytes.value += event.data.byteLength;
        // Optional: Trigger flush immediately for very low latency if volume is low?
        // But the 50ms interval is already very fast.
      }
    };

    ws.value.onerror = (e) => {
      console.error(e);
      error.value = "Connection failed. Is backend running?";
      stopCapture();
    };

    ws.value.onclose = () => {
      stopCapture();
    };
  } catch (e) {
    error.value = e.message;
  }
};

const stopCapture = () => {
  isConnected.value = false;
  if (ws.value) {
    ws.value.close();
    ws.value = null;
  }
  if (flushInterval) {
    clearInterval(flushInterval);
  }
  flushToEngine(); // Final flush
};

const flushToEngine = () => {
  if (chunkBuffer.length === 0) return;

  // Merge all small chunks into one large Uint8Array
  let totalSize = 0;
  for (const chunk of chunkBuffer) {
    totalSize += chunk.byteLength;
  }

  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunkBuffer) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  // Send to App.vue
  emit('stream-data', combined);
  
  // NOTE: In a real "streaming" engine we would clear the buffer here.
  // But since Wiregasm usually expects a FULL file reload, we might need 
  // to keep appending to a master buffer in App.vue. 
  // For this implementation, we just send the *new* chunks.
  chunkBuffer = []; 
};

onUnmounted(() => {
  stopCapture();
});
</script>

<style scoped>
.live-capture-wrapper {
  display: flex;
  align-items: center;
  margin-left: 10px;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-danger {
  background-color: #ef4444;
  color: white;
  margin-left: 10px;
}

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
}

.interface-tag {
  color: #9ca3af;
  margin-left: 10px;
  font-size: 0.9em;
  border-left: 1px solid #374151;
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
