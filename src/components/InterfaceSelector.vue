<template>
  <div class="interface-selector">
    <!-- Active Sessions Section -->
    <div v-if="activeSessions.length > 0" class="active-sessions">
      <div class="section-header">
        <h3>Active Sessions</h3>
      </div>
      <div class="session-list">
        <div v-for="session in activeSessions" :key="session.id" class="session-row">
          <div class="session-info">
            <div class="session-interface">
              <span class="recording-dot">●</span>
              <span class="name">{{ session.interface }}</span>
            </div>
            <div class="session-details">
              <span class="packets">{{ session.packetCount.toLocaleString() }} packets</span>
              <span class="viewers">{{ session.clientCount }} viewer{{ session.clientCount !== 1 ? 's' : '' }}</span>
            </div>
          </div>
          <div class="session-actions">
            <button
              v-if="!pendingJoinRequest"
              class="join-btn"
              @click="requestJoin(session.id)"
            >
              Request to Join
            </button>
            <span v-else-if="pendingJoinRequest === session.id" class="pending-status">
              Waiting for approval...
              <button class="cancel-btn" @click="cancelJoinRequest">Cancel</button>
            </span>
          </div>
        </div>
      </div>
      <div class="divider">
        <span>or start your own capture</span>
      </div>
    </div>

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

const emit = defineEmits(['select', 'start-capture', 'join-approved'])

const interfaces = ref([])
const selectedInterface = ref('')
const loading = ref(false)
const error = ref(null)

// Active sessions
const activeSessions = ref([])
const pendingJoinRequest = ref(null)  // sessionId if we have a pending request

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

// Fetch active sessions
const fetchSessions = () => {
  if (props.wsConnection && props.wsConnection.readyState === WebSocket.OPEN) {
    props.wsConnection.send(JSON.stringify({ type: 'listSessions' }))
  }
}

// Request to join a session
const requestJoin = (sessionId) => {
  if (props.wsConnection && props.wsConnection.readyState === WebSocket.OPEN) {
    props.wsConnection.send(JSON.stringify({
      type: 'requestJoinSession',
      sessionId: sessionId
    }))
    pendingJoinRequest.value = sessionId
  }
}

// Cancel join request
const cancelJoinRequest = () => {
  if (props.wsConnection && props.wsConnection.readyState === WebSocket.OPEN) {
    props.wsConnection.send(JSON.stringify({ type: 'cancelJoinRequest' }))
  }
  pendingJoinRequest.value = null
}

// Handle WebSocket messages for interface stats and sessions
const handleWsMessage = (event) => {
  try {
    const data = JSON.parse(event.data)
    if (data.type === 'interfaceStats') {
      for (const stat of data.stats) {
        addToHistory(stat.name, stat.rxBytesPerSec, stat.txBytesPerSec)
      }
    }
    // Session list response
    if (data.type === 'sessionList') {
      activeSessions.value = data.sessions || []
    }
    // Join request sent confirmation
    if (data.type === 'joinRequestSent') {
      pendingJoinRequest.value = data.sessionId
    }
    // Join request approved
    if (data.type === 'joinRequestApproved') {
      pendingJoinRequest.value = null
      emit('join-approved', data)
    }
    // Join request rejected
    if (data.type === 'joinRequestRejected') {
      pendingJoinRequest.value = null
      error.value = 'Join request was rejected by session owner'
      setTimeout(() => { error.value = null }, 3000)
    }
    // Join request cancelled
    if (data.type === 'joinRequestCancelled') {
      pendingJoinRequest.value = null
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

// Session polling interval
let sessionPollInterval = null

onMounted(() => {
  fetchInterfaces()
  setupWsListener()
  // Fetch sessions after a short delay to ensure WS is ready
  setTimeout(() => {
    fetchSessions()
  }, 500)
  // Poll for session updates every 5 seconds
  sessionPollInterval = setInterval(fetchSessions, 5000)
})

onUnmounted(() => {
  cleanupWsListener()
  if (sessionPollInterval) {
    clearInterval(sessionPollInterval)
  }
})

// Watch for wsConnection changes
import { watch } from 'vue'
watch(() => props.wsConnection, (newWs, oldWs) => {
  if (oldWs) {
    oldWs.removeEventListener('message', handleWsMessage)
  }
  if (newWs) {
    newWs.addEventListener('message', handleWsMessage)
    // Fetch sessions when connection is established
    setTimeout(fetchSessions, 100)
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

/* Active Sessions Styles */
.active-sessions {
  margin-bottom: 16px;
}

.section-header {
  margin-bottom: 8px;
}

.section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #e0e0e0;
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #2a1a1a;
  border: 1px solid #4a2a2a;
  border-radius: 4px;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-interface {
  display: flex;
  align-items: center;
  gap: 8px;
}

.recording-dot {
  color: #ef4444;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.session-interface .name {
  font-weight: 500;
  color: #e0e0e0;
  font-size: 14px;
}

.session-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.session-details .packets {
  color: #81c784;
}

.session-details .viewers {
  color: #64b5f6;
}

.session-actions {
  display: flex;
  align-items: center;
}

.join-btn {
  background: #8b5cf6;
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s ease;
}

.join-btn:hover {
  background: #a78bfa;
}

.pending-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fbbf24;
  font-size: 13px;
}

.cancel-btn {
  background: #4b5563;
  color: #d1d5db;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.cancel-btn:hover {
  background: #6b7280;
}

.divider {
  display: flex;
  align-items: center;
  margin: 16px 0;
  color: #6b7280;
  font-size: 13px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #374151;
}

.divider span {
  padding: 0 12px;
}
</style>
