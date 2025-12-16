<template>
  <div class="interface-selector">
    <div class="header">
      <h3>Network Interfaces</h3>
      <button class="refresh-btn" @click="fetchInterfaces" :disabled="loading">
        <span v-if="loading">...</span>
        <span v-else>Refresh</span>
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="interfaces.length === 0 && !loading" class="no-interfaces">
      No network interfaces found
    </div>

    <div class="interface-list">
      <div
        v-for="iface in interfaces"
        :key="iface.name"
        class="interface-row"
        :class="{ selected: selectedInterface === iface.name }"
        @click="selectInterface(iface)"
      >
        <div class="interface-info">
          <div class="interface-name">
            <span class="name">{{ iface.name }}</span>
            <span v-if="iface.driver" class="driver">({{ iface.driver }})</span>
            <span v-if="iface.speed" class="speed">{{ formatSpeed(iface.speed) }}</span>
          </div>
          <div class="interface-details">
            <span v-if="iface.ip" class="ip">{{ iface.ip }}</span>
            <span v-if="iface.mac" class="mac">{{ iface.mac }}</span>
          </div>
        </div>
        <div class="interface-activity">
          <Sparkline
            :data="getActivityData(iface.name)"
            :width="180"
            :height="28"
            :line-color="getSparklineColor(iface)"
            :fill-color="getSparklineFill(iface)"
          />
          <div class="rate-display">
            <span class="rx" title="Receive">
              {{ formatRate(getCurrentRate(iface.name, 'rx')) }}
            </span>
            <span class="tx" title="Transmit">
              {{ formatRate(getCurrentRate(iface.name, 'tx')) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedInterface" class="actions">
      <button class="start-capture-btn" @click="startCapture">
        Start Capture on {{ selectedInterface }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import Sparkline from './Sparkline.vue'

const props = defineProps({
  wsConnection: {
    type: Object,
    default: null
  },
  defaultInterface: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select', 'start-capture'])

const interfaces = ref([])
const selectedInterface = ref('')
const loading = ref(false)
const error = ref(null)

// Store activity history for each interface (last 60 samples)
const activityHistory = reactive({})  // { ifaceName: [{ rx, tx }, ...] }
const MAX_HISTORY = 60

// Initialize history for an interface
const initHistory = (ifaceName) => {
  if (!activityHistory[ifaceName]) {
    activityHistory[ifaceName] = []
  }
}

// Add a data point to history
const addToHistory = (ifaceName, rx, tx) => {
  initHistory(ifaceName)
  activityHistory[ifaceName].push({ rx, tx })
  // Keep only last MAX_HISTORY points
  if (activityHistory[ifaceName].length > MAX_HISTORY) {
    activityHistory[ifaceName].shift()
  }
}

// Get combined activity data (rx + tx) for sparkline
const getActivityData = (ifaceName) => {
  const history = activityHistory[ifaceName] || []
  return history.map(h => h.rx + h.tx)
}

// Get current rate for an interface
const getCurrentRate = (ifaceName, direction) => {
  const history = activityHistory[ifaceName]
  if (!history || history.length === 0) return 0
  const last = history[history.length - 1]
  return direction === 'rx' ? last.rx : last.tx
}

// Format bytes per second as human-readable
const formatRate = (bytesPerSec) => {
  if (bytesPerSec === 0) return '0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
}

// Format interface speed
const formatSpeed = (mbps) => {
  if (mbps >= 1000) return `${mbps / 1000}G`
  return `${mbps}M`
}

// Get sparkline color based on interface state
const getSparklineColor = (iface) => {
  // Active interface with traffic
  const history = activityHistory[iface.name]
  if (history && history.length > 0) {
    const last = history[history.length - 1]
    if (last.rx + last.tx > 0) return '#4caf50'  // Green when active
  }
  return '#4fc3f7'  // Blue when no traffic
}

const getSparklineFill = (iface) => {
  const history = activityHistory[iface.name]
  if (history && history.length > 0) {
    const last = history[history.length - 1]
    if (last.rx + last.tx > 0) return 'rgba(76, 175, 80, 0.2)'
  }
  return 'rgba(79, 195, 247, 0.2)'
}

// Fetch interfaces from API
const fetchInterfaces = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await fetch('/api/interfaces')
    if (!response.ok) throw new Error('Failed to fetch interfaces')
    const data = await response.json()
    interfaces.value = data.interfaces || []

    // Initialize history for all interfaces
    for (const iface of interfaces.value) {
      initHistory(iface.name)
    }

    // Don't auto-select - user must click to select
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Handle interface selection
const selectInterface = (iface) => {
  selectedInterface.value = iface.name
  emit('select', iface)
}

// Start capture on selected interface
const startCapture = () => {
  if (selectedInterface.value) {
    emit('start-capture', selectedInterface.value)
  }
}

// Handle WebSocket messages for interface stats
const handleWsMessage = (event) => {
  try {
    const data = JSON.parse(event.data)
    if (data.type === 'interfaceStats') {
      for (const stat of data.stats) {
        addToHistory(stat.name, stat.rxBytesPerSec, stat.txBytesPerSec)
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
}

// Setup WebSocket listener
const setupWsListener = () => {
  if (props.wsConnection) {
    props.wsConnection.addEventListener('message', handleWsMessage)
  }
}

const cleanupWsListener = () => {
  if (props.wsConnection) {
    props.wsConnection.removeEventListener('message', handleWsMessage)
  }
}

onMounted(() => {
  fetchInterfaces()
  setupWsListener()
})

onUnmounted(() => {
  cleanupWsListener()
})

// Watch for wsConnection changes
import { watch } from 'vue'
watch(() => props.wsConnection, (newWs, oldWs) => {
  if (oldWs) {
    oldWs.removeEventListener('message', handleWsMessage)
  }
  if (newWs) {
    newWs.addEventListener('message', handleWsMessage)
  }
})

// Expose method to refresh
defineExpose({ fetchInterfaces })
</script>

<style scoped>
.interface-selector {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 16px;
  max-width: 600px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #e0e0e0;
}

.refresh-btn {
  background: #333;
  border: 1px solid #444;
  color: #aaa;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.refresh-btn:hover:not(:disabled) {
  background: #444;
  color: #fff;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  background: #4a1515;
  color: #ff8a80;
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 13px;
}

.no-interfaces {
  color: #888;
  text-align: center;
  padding: 20px;
  font-size: 14px;
}

.interface-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.interface-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #252525;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.interface-row:hover {
  background: #2a2a2a;
  border-color: #444;
}

.interface-row.selected {
  background: #1a3a4a;
  border-color: #4fc3f7;
}

.interface-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;
}

.interface-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.interface-name .name {
  font-weight: 500;
  color: #e0e0e0;
  font-size: 14px;
}

.interface-name .driver {
  color: #888;
  font-size: 12px;
}

.interface-name .speed {
  color: #4fc3f7;
  font-size: 11px;
  background: #1a3a4a;
  padding: 1px 4px;
  border-radius: 2px;
}

.interface-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.interface-details .ip {
  color: #81c784;
}

.interface-details .mac {
  color: #64b5f6;
  font-family: monospace;
  font-weight: 500;
}

.interface-activity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.rate-display {
  display: flex;
  gap: 12px;
  font-size: 11px;
  font-family: monospace;
}

.rate-display .rx {
  color: #4caf50;
}

.rate-display .rx::before {
  content: '\2193 ';  /* Down arrow */
}

.rate-display .tx {
  color: #ff9800;
}

.rate-display .tx::before {
  content: '\2191 ';  /* Up arrow */
}

.actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.start-capture-btn {
  background: #4fc3f7;
  color: #000;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: background 0.15s ease;
}

.start-capture-btn:hover {
  background: #81d4fa;
}
</style>
