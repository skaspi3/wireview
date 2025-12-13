<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { packets, activeStream, websocket } from '../globals';

const emit = defineEmits(['close']);

// View mode: 'hex', 'ascii', 'packets'
const viewMode = ref('ascii');

// Streaming state
const streaming = ref(false);
const error = ref(null);

// Accumulated segments from WebSocket stream
const segments = ref([]);
const flowStats = ref(null);

// Flow definition from activeStream
const flow = computed(() => activeStream.value);

// Client-side filtered packets (instant)
const flowPackets = computed(() => {
  if (!flow.value) return [];

  return packets.value.filter(p => {
    const ipMatch = (p.src === flow.value.srcIp && p.dst === flow.value.dstIp) ||
                    (p.src === flow.value.dstIp && p.dst === flow.value.srcIp);

    if (flow.value.srcPort && flow.value.dstPort) {
      const portPattern = new RegExp(`(${flow.value.srcPort}|${flow.value.dstPort})`);
      return ipMatch && portPattern.test(p.info);
    }

    return ipMatch;
  });
});

// Summary stats (from flowPackets for instant display)
const stats = computed(() => {
  const pkts = flowPackets.value;
  if (!pkts.length) return null;

  const totalBytes = pkts.reduce((sum, p) => sum + (p.length || 0), 0);
  const firstTime = pkts[0]?.time || 0;
  const lastTime = pkts[pkts.length - 1]?.time || 0;

  return {
    packetCount: pkts.length,
    totalBytes,
    duration: lastTime - firstTime
  };
});

// Format bytes
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

// Get direction indicator
const getDirection = (pkt) => {
  if (!flow.value) return '';
  if (pkt.src === flow.value.srcIp) return '→';
  return '←';
};

// WebSocket message handler
const handleWsMessage = (event) => {
  try {
    const data = JSON.parse(event.data);

    if (data.type === 'streamPacket') {
      // Add segment to array incrementally
      segments.value = [...segments.value, data.segment];
    } else if (data.type === 'streamComplete') {
      streaming.value = false;
      flowStats.value = data.flow;
    } else if (data.type === 'streamError') {
      streaming.value = false;
      error.value = data.error;
    }
  } catch (e) {
    // Ignore non-stream messages
  }
};

// Start streaming via WebSocket
const startStreaming = () => {
  if (!flow.value || !websocket.value || websocket.value.readyState !== WebSocket.OPEN) {
    error.value = 'Not connected to backend';
    return;
  }

  streaming.value = true;
  error.value = null;
  segments.value = [];
  flowStats.value = null;

  websocket.value.send(JSON.stringify({
    type: 'followStream',
    srcIp: flow.value.srcIp,
    dstIp: flow.value.dstIp,
    srcPort: flow.value.srcPort || null,
    dstPort: flow.value.dstPort || null
  }));
};

// Setup WebSocket listener
onMounted(() => {
  if (websocket.value) {
    websocket.value.addEventListener('message', handleWsMessage);
  }
});

onUnmounted(() => {
  if (websocket.value) {
    websocket.value.removeEventListener('message', handleWsMessage);
  }
});

// Start streaming when flow changes
watch(flow, (newFlow) => {
  if (newFlow) {
    startStreaming();
  }
}, { immediate: true });

// Close handler
const close = () => {
  activeStream.value = null;
  emit('close');
};

// Convert hex string to ASCII
const hexToAscii = (hex) => {
  if (!hex) return '';
  let ascii = '';
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substr(i, 2), 16);
    ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
  }
  return ascii;
};

// Format hex with spaces
const formatHex = (hex) => {
  if (!hex) return '';
  return hex.match(/.{1,2}/g)?.join(' ') || hex;
};
</script>

<template>
  <div class="stream-overlay" @click.self="close">
    <div class="stream-panel">
      <!-- Header -->
      <div class="panel-header">
        <h2>
          Follow {{ flow?.protocol || 'UDP' }} Stream
        </h2>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <!-- Flow Info -->
      <div class="flow-info">
        <div class="flow-endpoints">
          <span class="endpoint">{{ flow?.srcIp }}:{{ flow?.srcPort || '?' }}</span>
          <span class="arrow">↔</span>
          <span class="endpoint">{{ flow?.dstIp }}:{{ flow?.dstPort || '?' }}</span>
        </div>
        <div class="flow-stats">
          <span class="stat">{{ segments.length }} segments</span>
          <span v-if="stats" class="stat">{{ stats.packetCount }} packets</span>
          <span v-if="stats" class="stat">{{ formatBytes(stats.totalBytes) }}</span>
          <span v-if="streaming" class="streaming-indicator">Streaming...</span>
        </div>
      </div>

      <!-- View Mode Tabs -->
      <div class="view-tabs">
        <button :class="{ active: viewMode === 'ascii' }" @click="viewMode = 'ascii'">ASCII</button>
        <button :class="{ active: viewMode === 'hex' }" @click="viewMode = 'hex'">Hex</button>
        <button :class="{ active: viewMode === 'packets' }" @click="viewMode = 'packets'">Packets</button>
      </div>

      <!-- Content -->
      <div class="panel-content">
        <!-- Error -->
        <div v-if="error" class="error-state">
          <p>{{ error }}</p>
          <button @click="startStreaming">Retry</button>
        </div>

        <!-- Packets View (client-side filtered, instant) -->
        <div v-else-if="viewMode === 'packets'" class="packets-view">
          <table class="packets-table">
            <thead>
              <tr>
                <th class="col-dir">Dir</th>
                <th class="col-no">No.</th>
                <th class="col-time">Time</th>
                <th class="col-len">Length</th>
                <th class="col-info">Info</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pkt in flowPackets" :key="pkt.number">
                <td class="col-dir" :class="getDirection(pkt) === '→' ? 'dir-out' : 'dir-in'">
                  {{ getDirection(pkt) }}
                </td>
                <td class="col-no">{{ pkt.number }}</td>
                <td class="col-time">{{ pkt.time.toFixed(6) }}</td>
                <td class="col-len">{{ pkt.length }}</td>
                <td class="col-info">{{ pkt.info }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="!flowPackets.length" class="empty-state">
            No packets found for this flow
          </div>
        </div>

        <!-- ASCII View (streamed from backend) -->
        <div v-else-if="viewMode === 'ascii'" class="payload-view">
          <div v-if="segments.length" class="segments">
            <div
              v-for="(seg, idx) in segments"
              :key="idx"
              class="segment"
              :class="seg.direction === 'AtoB' ? 'dir-out' : 'dir-in'"
            >
              <div class="segment-header">
                <span class="segment-dir">{{ seg.direction === 'AtoB' ? '→' : '←' }}</span>
                <span class="segment-frame">#{{ seg.frame }}</span>
                <span class="segment-len">{{ seg.length }} bytes</span>
              </div>
              <pre class="segment-data">{{ seg.ascii || hexToAscii(seg.payload) }}</pre>
            </div>
          </div>
          <div v-else-if="streaming" class="loading-state">
            <div class="spinner"></div>
            <p>Loading stream data...</p>
          </div>
          <div v-else class="empty-state">
            No payload data available
          </div>
        </div>

        <!-- Hex View (streamed from backend) -->
        <div v-else-if="viewMode === 'hex'" class="payload-view">
          <div v-if="segments.length" class="segments">
            <div
              v-for="(seg, idx) in segments"
              :key="idx"
              class="segment"
              :class="seg.direction === 'AtoB' ? 'dir-out' : 'dir-in'"
            >
              <div class="segment-header">
                <span class="segment-dir">{{ seg.direction === 'AtoB' ? '→' : '←' }}</span>
                <span class="segment-frame">#{{ seg.frame }}</span>
                <span class="segment-len">{{ seg.length }} bytes</span>
              </div>
              <pre class="segment-data hex">{{ formatHex(seg.payload) }}</pre>
            </div>
          </div>
          <div v-else-if="streaming" class="loading-state">
            <div class="spinner"></div>
            <p>Loading stream data...</p>
          </div>
          <div v-else class="empty-state">
            No payload data available
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stream-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.stream-panel {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 12px;
  width: 90%;
  max-width: 1000px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #374151;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #f3f4f6;
}

.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 24px;
  cursor: pointer;
  padding: 0 8px;
  line-height: 1;
}

.close-btn:hover {
  color: #f3f4f6;
}

.flow-info {
  padding: 12px 20px;
  background: #111827;
  border-bottom: 1px solid #374151;
}

.flow-endpoints {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: monospace;
  font-size: 14px;
}

.endpoint {
  color: #60a5fa;
}

.arrow {
  color: #9ca3af;
}

.flow-stats {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  align-items: center;
}

.stat {
  color: #9ca3af;
  font-size: 13px;
}

.streaming-indicator {
  color: #22c55e;
  font-size: 13px;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.view-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid #374151;
  background: #111827;
}

.view-tabs button {
  padding: 8px 16px;
  background: transparent;
  color: #9ca3af;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.view-tabs button:hover {
  background: #374151;
  color: #e5e7eb;
}

.view-tabs button.active {
  background: #3b82f6;
  color: #fff;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 300px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #9ca3af;
  gap: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #374151;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-state button {
  padding: 8px 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* Packets Table */
.packets-view {
  overflow-x: auto;
}

.packets-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: monospace;
}

.packets-table th {
  background: #111827;
  color: #9ca3af;
  font-weight: 500;
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid #374151;
  position: sticky;
  top: 0;
}

.packets-table td {
  padding: 6px 12px;
  color: #e5e7eb;
  border-bottom: 1px solid #1f2937;
}

.packets-table tr:hover td {
  background: #111827;
}

.packets-table .col-dir {
  width: 40px;
  text-align: center;
  font-weight: bold;
}

.packets-table .col-no {
  width: 60px;
  text-align: right;
}

.packets-table .col-time {
  width: 120px;
}

.packets-table .col-len {
  width: 60px;
  text-align: right;
}

.dir-out {
  color: #ef4444 !important;
}

.dir-in {
  color: #22c55e !important;
}

/* Payload View */
.payload-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segments {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.segment {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 6px;
  overflow: hidden;
}

.segment.dir-out {
  border-left: 3px solid #ef4444;
}

.segment.dir-in {
  border-left: 3px solid #22c55e;
}

.segment-header {
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  background: #0f172a;
  border-bottom: 1px solid #374151;
  font-size: 12px;
}

.segment-dir {
  font-weight: bold;
}

.segment.dir-out .segment-dir {
  color: #ef4444;
}

.segment.dir-in .segment-dir {
  color: #22c55e;
}

.segment-frame {
  color: #60a5fa;
}

.segment-len {
  color: #9ca3af;
}

.segment-data {
  margin: 0;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  color: #e5e7eb;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.segment-data.hex {
  color: #a78bfa;
}
</style>
