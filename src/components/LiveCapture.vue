<template>
  <div class="live-capture-wrapper" :class="{ 'show-selector': showInterfaceSelector }">
    <!-- Connecting State (in header bar) -->
    <div v-if="!isCapturing && !isLoadingPcap && !loadedPcapFile && !showInterfaceSelector && !showStoppedBar" class="controls">
      <div v-if="!isConnected">
        <pf-button variant="secondary" @click="connect">
          Connecting to backend...
        </pf-button>
      </div>

      <div v-else class="selection-group">
        <n-select
          v-model:value="selectedInterface"
          :options="interfaces.map(i => ({ label: i, value: i }))"
          size="small"
          style="width: 180px;"
          placeholder="Interface"
        />
        <pf-button @click="startCapture">
          <span class="icon">●</span> Start
        </pf-button>
        <pf-button class="btn-file" @click="openFileBrowser" title="Open capture file">
          📂 Open
        </pf-button>
      </div>
    </div>

    <!-- Interface Selector (Landing Page) - shown in main content area -->
    <Teleport to="#interface-selector-container" v-if="showInterfaceSelector">
      <div class="interface-selector-wrapper">
        <InterfaceSelector
          :ws-connection="ws"
          :default-interface="selectedInterface"
          @select="onInterfaceSelect"
          @start-capture="onSelectorStartCapture"
          @join-approved="onJoinApproved"
        />
        <div class="open-file-section">
          <span class="or-text">or</span>
          <pf-button class="btn-file-large" @click="openFileBrowser" title="Open capture file">
            📂 Open Capture File
          </pf-button>
        </div>
      </div>
    </Teleport>

    <!-- Loading Pcap State -->
    <div v-if="isLoadingPcap" class="status-bar loading-pcap">
      <span class="loading-indicator">
        <n-spin :size="14" stroke="#3b82f6" />
        Loading {{ loadingPcapFilename }}...
      </span>
      <span class="progress-count" v-if="loadPcapProgress > 0">
        {{ loadPcapProgress.toLocaleString() }} packets
      </span>
      <n-progress
        v-if="loadPcapProgress > 0"
        type="line"
        :percentage="100"
        :show-indicator="false"
        :height="3"
        :border-radius="2"
        processing
        status="info"
        style="width: 120px; margin-left: 8px;"
      />
    </div>

    <!-- Loaded Pcap File State -->
    <div v-else-if="loadedPcapFile" class="status-bar loaded-pcap">
      <span class="file-indicator">📄 {{ loadedPcapFilename }}</span>
      <span class="packet-count">{{ packets.length.toLocaleString() }} packets</span>
      <pf-button variant="secondary" @click="closePcapFile" title="Close file">
        Close
      </pf-button>
      <pf-button class="btn-file" @click="openFileBrowser" title="Open another file">
        📂 Open
      </pf-button>
    </div>

    <!-- Capturing State -->
    <div v-else-if="isCapturing" class="status-bar">
      <span class="recording-indicator">● Capture</span>
      <n-popover trigger="hover" placement="bottom" :disabled="!activeIfaceDetails">
        <template #trigger>
          <span class="interface-tag-wrapper">
            <pf-label color="cyan" compact>on {{ selectedInterface }}</pf-label>
          </span>
        </template>
        <div v-if="activeIfaceDetails" class="iface-popover">
          <div v-if="activeIfaceDetails.driver" class="iface-popover-row"><span class="iface-popover-label">Driver</span> {{ activeIfaceDetails.driver }}</div>
          <div v-if="activeIfaceDetails.mac" class="iface-popover-row"><span class="iface-popover-label">MAC</span> {{ activeIfaceDetails.mac }}</div>
          <div v-if="activeIfaceDetails.ip" class="iface-popover-row"><span class="iface-popover-label">IPv4</span> {{ activeIfaceDetails.ip }}</div>
          <div v-if="activeIfaceDetails.ipv6" class="iface-popover-row"><span class="iface-popover-label">IPv6</span> {{ activeIfaceDetails.ipv6 }}</div>
          <div v-if="activeIfaceDetails.speed" class="iface-popover-row"><span class="iface-popover-label">Speed</span> {{ activeIfaceDetails.speed }} Mbps</div>
        </div>
      </n-popover>

      <div v-if="isSessionOwner || !sessionId" class="capture-controls">
        <pf-tooltip content="Restart Capture">
          <button @click="confirmRestartCapture" class="ctrl-btn ctrl-restart">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
        </pf-tooltip>
        <pf-tooltip content="Stop Capture">
          <button @click="stopCapture" class="ctrl-btn ctrl-stop">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
        </pf-tooltip>
      </div>
      <pf-button v-else variant="secondary" @click="stopCapture">
        Leave
      </pf-button>
    </div>

    <!-- Stopped Capture State -->
    <div v-else-if="showStoppedBar" class="status-bar stopped-bar">
      <n-select
        v-model:value="selectedInterface"
        :options="interfaces.map(i => ({ label: i + (interfaceDetails[i] ? formatIfaceOption(interfaceDetails[i]) : ''), value: i }))"
        size="small"
        style="width: 260px;"
        placeholder="Interface"
      />
      <div class="capture-controls">
        <pf-tooltip content="Start Capture">
          <button @click="resumeCaptureOnSameInterface" class="ctrl-btn ctrl-play">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,3 20,12 6,21"/>
            </svg>
            Start
          </button>
        </pf-tooltip>
        <slot name="stopped-actions" />
      </div>
    </div>

    <!-- Session info (viewer follow toggle) -->
    <span v-if="isCapturing && sessionId && !isSessionOwner" class="session-info" :title="'Session: ' + sessionId">
      <label class="follow-toggle" title="Follow owner's view (selected packet, scroll, filter)">
        <input type="checkbox" v-model="followOwner" />
        <span class="follow-label">Follow</span>
      </label>
    </span>

    <!-- Join Request Popup (for owner) -->
    <div v-if="pendingJoinRequests.length > 0" class="join-request-popup">
      <div v-for="req in pendingJoinRequests" :key="req.requestId" class="join-request-item">
        <span class="request-text">Someone wants to join your session</span>
        <div class="request-actions">
          <pf-button class="btn-approve" @click="approveJoinRequest(req.requestId)">Approve</pf-button>
          <pf-button danger class="btn-reject" @click="rejectJoinRequest(req.requestId)">Reject</pf-button>
        </div>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="error-toast">
      {{ error }}
      <button @click="error = null">×</button>
    </div>

    <!-- Save Confirmation Dialog -->
    <ConfirmDialog
      ref="saveConfirmDialog"
      title="Save Capture"
      message="Do you want to save the current capture before restarting?"
      yesText="Save"
      noText="Don't Save"
      @yes="onSaveConfirmYes"
      @no="onSaveConfirmNo"
      @cancel="onSaveConfirmCancel"
    />

    <!-- Save Success Toast -->
    <div v-if="saveToast" class="save-toast">
      {{ saveToast }}
    </div>

    <!-- Session Notification Toast -->
    <div v-if="sessionNotification" class="session-notification">
      {{ sessionNotification }}
    </div>

    <!-- Save Progress Indicator -->
    <SaveProgressIndicator ref="saveProgressIndicator" />
  </div>
</template>

<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import '@patternfly/elements/pf-tooltip/pf-tooltip.js';
import '@patternfly/elements/pf-badge/pf-badge.js';
import '@patternfly/elements/pf-label/pf-label.js';
import '@patternfly/elements/pf-clipboard-copy/pf-clipboard-copy.js';
import { ref, triggerRef, onUnmounted, onMounted, computed, watch } from 'vue';
import { NSpin, NPopover, NProgress, NSelect } from 'naive-ui';
import { nodeVersion, tsharkLuaVersion, tsharkLibraries, backendPort, backendStatus, certInfo, packets, allPackets, websocket, displayFilter, filterError, filterLoading, filterProgress, trackReceived, trackSent, activePacketIndex, hostIP, captureActive, stoppedCapture, captureIncludePort443, sessionId, isSessionOwner as globalIsSessionOwner, followOwner, notifyOwnerStateChange, resolveWsRequest, clearPendingWsRequests, pcapDirUsage, idleCountdownSeconds, setCancelIdleCountdown, linkSpeedMbps, savedCapturesCount, addWsEvent, clientId, apiFetch } from '../globals';
import { decompress as zstdDecompress } from 'fzstd';
import ConfirmDialog from './ConfirmDialog.vue';
import InterfaceSelector from './InterfaceSelector.vue';
import SaveProgressIndicator from './SaveProgressIndicator.vue';

const emit = defineEmits(['clear', 'stop', 'openFileBrowser']);

const ws = ref(null);
const isConnected = ref(false);
const isCapturing = ref(false);
const loadingBarActive = ref(false); // True while top loading bar is running (waiting for first packets)
const interfaces = ref([]);
const selectedInterface = ref('');
const interfaceDetails = ref({});
const activeIfaceDetails = computed(() => {
  const d = interfaceDetails.value[selectedInterface.value];
  if (!d) return null;
  if (!d.driver && !d.mac && !d.ip && !d.ipv6) return null;
  return d;
});

// Format interface details for dropdown option text
const formatIfaceOption = (details) => {
  const parts = [];
  if (details.driver) parts.push(details.driver);
  if (details.ip) parts.push(details.ip);
  if (details.speed) parts.push(details.speed >= 1000 ? `${details.speed / 1000}G` : `${details.speed}M`);
  return parts.length > 0 ? ` — ${parts.join(', ')}` : '';
};

const error = ref(null);
let pcapDirUsageInterval = null;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 10000;
const WS_RECONNECT_BASE_DELAY_MS = 1000;
const WS_RECONNECT_MAX_DELAY_MS = 30000;
let heartbeatInterval = null;
let heartbeatTimeout = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let allowReconnect = true;
let isUnmounting = false;

// Idle kill-switch
const IDLE_TIMEOUT_S = 60;
let idleTimeout = null;
let countdownInterval = null;

const stopIdleDetection = () => {
  if (idleTimeout) { clearTimeout(idleTimeout); idleTimeout = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  idleCountdownSeconds.value = 0;
  document.removeEventListener('mousemove', onUserActivity);
  document.removeEventListener('keydown', onUserActivity);
  document.removeEventListener('visibilitychange', onVisibilityChange);
};

const startCountdown = () => {
  if (countdownInterval) return; // Already counting
  let remaining = IDLE_TIMEOUT_S;
  idleCountdownSeconds.value = remaining;
  countdownInterval = setInterval(() => {
    remaining--;
    idleCountdownSeconds.value = remaining;
    if (remaining <= 0) {
      stopIdleDetection();
      stopCapture();
    }
  }, 1000);
};

const resetIdleTimer = () => {
  if (idleTimeout) clearTimeout(idleTimeout);
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  idleCountdownSeconds.value = 0;
  if (!isCapturing.value || stoppedCapture.value) return;
  idleTimeout = setTimeout(startCountdown, IDLE_TIMEOUT_S * 1000);
};

const onUserActivity = () => {
  if (document.visibilityState === 'visible' && isCapturing.value && !stoppedCapture.value) {
    resetIdleTimer();
  }
};

const onVisibilityChange = () => {
  if (!isCapturing.value || stoppedCapture.value) return;
  if (document.visibilityState === 'hidden') {
    // Tab hidden — start countdown immediately
    if (idleTimeout) { clearTimeout(idleTimeout); idleTimeout = null; }
    startCountdown();
  } else {
    // Tab visible again — treat as activity
    resetIdleTimer();
  }
};

const startIdleDetection = () => {
  document.addEventListener('mousemove', onUserActivity);
  document.addEventListener('keydown', onUserActivity);
  document.addEventListener('visibilitychange', onVisibilityChange);
  resetIdleTimer();
};

setCancelIdleCountdown(() => onUserActivity());

// Session sharing state (sessionId imported from globals)
const isSessionOwner = ref(false);
const sessionClientCount = ref(0);
const pendingSessionJoin = ref(null);  // Session ID from URL to join after connect
const sessionNotification = ref(null);  // Toast notification for session events
const myViewerId = ref(null);  // This client's viewer ID
const pendingJoinRequests = ref([]);  // Array of { requestId, sessionId } for owner

// Show session notification toast
const showSessionNotification = (message, duration = 3000) => {
  sessionNotification.value = message;
  setTimeout(() => {
    sessionNotification.value = null;
  }, duration);
};

// Approve join request (owner only)
const approveJoinRequest = (requestId) => {
  if (!ws.value || !isConnected.value) return;
  sendMessage({ type: 'approveJoinRequest', requestId });
  pendingJoinRequests.value = pendingJoinRequests.value.filter(r => r.requestId !== requestId);
};

// Reject join request (owner only)
const rejectJoinRequest = (requestId) => {
  if (!ws.value || !isConnected.value) return;
  sendMessage({ type: 'rejectJoinRequest', requestId });
  pendingJoinRequests.value = pendingJoinRequests.value.filter(r => r.requestId !== requestId);
};

// Handle join approved (when user's request was approved)
const onJoinApproved = (data) => {
  sessionId.value = data.sessionId;
  isSessionOwner.value = false;
  globalIsSessionOwner.value = false;
  followOwner.value = true;
  myViewerId.value = data.viewerId;
  selectedInterface.value = data.interface;
  setIncludePort443(data.includePort443 === true);
  setResolvePublicIps(data.resolvePublicIps !== false);
  setEnableNtopng(data.enableNtopng === true);
  isCapturing.value = data.isCapturing;
  captureActive.value = data.isCapturing;
  stoppedCapture.value = false;
  emit('clear');
};

// Pcap file loading state
const isLoadingPcap = ref(false);
const loadPcapProgress = ref(0);
const loadedPcapFile = ref(null);
const loadingPcapFilename = ref('');
const includePort443 = ref(captureIncludePort443.value);
const resolvePublicIps = ref(true);
const enableNtopng = ref(false);
const setIncludePort443 = (value) => {
  includePort443.value = value === true;
  captureIncludePort443.value = includePort443.value;
};
const setResolvePublicIps = (value) => {
  resolvePublicIps.value = value !== false;
};
const setEnableNtopng = (value) => {
  enableNtopng.value = value === true;
};

const loadedPcapFilename = computed(() => {
  if (!loadedPcapFile.value) return '';
  const parts = loadedPcapFile.value.split('/');
  return parts[parts.length - 1];
});

// Show stopped-capture bar (capture ended but packets still displayed)
const showStoppedBar = computed(() => {
  return stoppedCapture.value && packets.value.length > 0 && !isCapturing.value && !isLoadingPcap.value && !loadedPcapFile.value && isConnected.value;
});

// Show interface selector when connected but not capturing/loading
const showInterfaceSelector = computed(() => {
  return isConnected.value && !isCapturing.value && !isLoadingPcap.value && !loadedPcapFile.value && !showStoppedBar.value;
});

// Handle interface selection from selector
const onInterfaceSelect = (iface) => {
  selectedInterface.value = iface.name;
};

// Handle start capture from selector
const onSelectorStartCapture = (payload) => {
  if (typeof payload === 'string') {
    selectedInterface.value = payload;
    setIncludePort443(false);
    setResolvePublicIps(true);
    setEnableNtopng(false);
  } else {
    selectedInterface.value = payload?.interface || '';
    setIncludePort443(payload?.includePort443 === true);
    setResolvePublicIps(payload?.resolvePublicIps !== false);
    setEnableNtopng(payload?.enableNtopng === true);
  }
  startCapture();
};

// Save dialogs refs
const saveConfirmDialog = ref(null);
const saveToast = ref(null);
const saveProgressIndicator = ref(null);

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

// Batched update for allPackets (for live count when filter is active)
let pendingAllPacketsUpdate = false;
const scheduleAllPacketsUpdate = () => {
  if (pendingAllPacketsUpdate) return;
  pendingAllPacketsUpdate = true;
  requestAnimationFrame(() => {
    triggerRef(allPackets);
    pendingAllPacketsUpdate = false;
  });
};

// WebSocket proxied through Vite - same origin, /ws path
const WS_URL = `wss://${window.location.host}/ws?clientId=${encodeURIComponent(clientId)}`;

// Expose ws for packet details requests
const getWebSocket = () => ws.value;

const clearHeartbeatTimers = () => {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (heartbeatTimeout) { clearTimeout(heartbeatTimeout); heartbeatTimeout = null; }
};

const clearReconnectTimer = () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
};

const scheduleReconnect = () => {
  if (!allowReconnect || isUnmounting || reconnectTimeout) return;

  const attempt = reconnectAttempts + 1;
  const delay = Math.min(WS_RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttempts), WS_RECONNECT_MAX_DELAY_MS);
  addWsEvent(`Reconnect scheduled in ${Math.round(delay / 1000)}s (attempt ${attempt})`);
  reconnectAttempts += 1;
  backendStatus.value = 'reconnecting';

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect({ isReconnect: true });
  }, delay);
};

const closeSocket = ({ disableReconnect = false } = {}) => {
  if (disableReconnect) {
    allowReconnect = false;
    clearReconnectTimer();
  }
  clearHeartbeatTimers();
  if (pcapDirUsageInterval) { clearInterval(pcapDirUsageInterval); pcapDirUsageInterval = null; }
  if (ws.value) {
    ws.value.onclose = null; // Prevent loops
    ws.value.close();
    ws.value = null;
  }
  clearPendingWsRequests();
};

// Helper to send and track bytes
const sendMessage = (data) => {
  if (!ws.value) return;
  const msg = JSON.stringify(data);
  trackSent(msg.length);
  ws.value.send(msg);
};

const sendHeartbeat = () => {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return;
  sendMessage({ type: 'ping', ts: Date.now() });
  if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
  heartbeatTimeout = setTimeout(() => {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      addWsEvent('Heartbeat timeout (no pong in 10s), forcing reconnect');
      ws.value.close();
    }
  }, HEARTBEAT_TIMEOUT_MS);
};

const startHeartbeat = () => {
  clearHeartbeatTimers();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  sendHeartbeat();
};

const connect = ({ isReconnect = false } = {}) => {
  allowReconnect = true;
  clearReconnectTimer();
  closeSocket(); // Ensure no duplicates
  error.value = null;
  backendStatus.value = isReconnect ? 'reconnecting' : 'connecting';
  addWsEvent(isReconnect ? 'Attempting WebSocket reconnect' : 'Opening WebSocket connection');
  try {
    ws.value = new WebSocket(WS_URL);
    // Use arraybuffer for binary messages (more efficient than blob)
    ws.value.binaryType = 'arraybuffer';

    ws.value.onopen = () => {
      reconnectAttempts = 0;
      clearReconnectTimer();
      isConnected.value = true;
      backendStatus.value = 'connected';
      addWsEvent(isReconnect ? 'WebSocket reconnected' : 'WebSocket connected');
      if (isReconnect && window.$message) window.$message.success('Reconnected to backend');
      websocket.value = ws.value; // Store in global for filter requests
      startHeartbeat();

      // Poll pcap dir usage every 3 seconds
      if (pcapDirUsageInterval) clearInterval(pcapDirUsageInterval);
      pcapDirUsageInterval = setInterval(() => {
        sendMessage({ type: 'getPcapDirUsage' });
      }, 3000);
      sendMessage({ type: 'getPcapDirUsage' }); // Initial request
    };

    ws.value.onmessage = async (event) => {
      // Track received bytes
      const dataSize = typeof event.data === 'string' ? event.data.length : event.data.byteLength || event.data.length;
      trackReceived(dataSize);

      try {
        let msg;

        // Check if data is compressed (ArrayBuffer) or plain JSON string
        if (event.data instanceof ArrayBuffer) {
          // Compressed zstd data - decompress it
          const compressedArray = new Uint8Array(event.data);
          const decompressed = zstdDecompress(compressedArray);
          const jsonStr = new TextDecoder().decode(decompressed);
          msg = JSON.parse(jsonStr);
        } else {
          // Plain JSON string (uncompressed)
          msg = JSON.parse(event.data);
        }

        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }

        if (msg.type === 'pong') {
          return;
        }

        // Dispatch responses to pending WebSocket requests (packet batches, field positions)
        if (msg.reqId !== undefined) {
          resolveWsRequest(msg.reqId, msg);
        }

        if (msg.type === 'interfaces') {
          interfaces.value = msg.list;
          if (msg.details) interfaceDetails.value = msg.details;
          if (msg.default && msg.list.includes(msg.default)) {
            selectedInterface.value = msg.default;
          } else if (msg.list.length > 0) {
            selectedInterface.value = msg.list[0];
          }
          if (msg.nodeVersion) {
            nodeVersion.value = msg.nodeVersion;
          }
          if (msg.tsharkLuaVersion) {
            tsharkLuaVersion.value = msg.tsharkLuaVersion;
          }
          if (msg.tsharkLibraries) {
            tsharkLibraries.value = msg.tsharkLibraries;
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

          // If we have a pending session to join from URL, do it now
          if (pendingSessionJoin.value) {
            sendMessage({ type: 'joinSession', sessionId: pendingSessionJoin.value });
            pendingSessionJoin.value = null;
          }
        }

        // Session created - we are the owner
        if (msg.type === 'sessionCreated') {
          sessionId.value = msg.sessionId;
          isSessionOwner.value = true;
          globalIsSessionOwner.value = true;
          sessionClientCount.value = 1;
          myViewerId.value = 'Owner';
          selectedInterface.value = msg.interface;
          setIncludePort443(msg.includePort443 === true);
          setResolvePublicIps(msg.resolvePublicIps !== false);
          setEnableNtopng(msg.enableNtopng === true);
          isCapturing.value = true;
          captureActive.value = true;
          stoppedCapture.value = false;
          // Set link speed from interface details
          const ifaceInfo = interfaceDetails.value[msg.interface];
          linkSpeedMbps.value = ifaceInfo?.speed || 0;
          // Do NOT reset savedCapturesCount — saved files persist on disk across sessions
          emit('clear');
          if (window.$message) window.$message.success(`Capturing on ${msg.interface}`);
          if (window.$loadingBar) window.$loadingBar.start();
          loadingBarActive.value = true;
        }

        // Session joined - we are a viewer
        if (msg.type === 'sessionJoined') {
          sessionId.value = msg.sessionId;
          isSessionOwner.value = false;
          globalIsSessionOwner.value = false;
          followOwner.value = true;  // Default to following owner
          myViewerId.value = msg.viewerId;
          selectedInterface.value = msg.interface;
          setIncludePort443(msg.includePort443 === true);
          setResolvePublicIps(msg.resolvePublicIps !== false);
          setEnableNtopng(msg.enableNtopng === true);
          isCapturing.value = msg.isCapturing;
          captureActive.value = msg.isCapturing;
          stoppedCapture.value = false;
          const jIfaceInfo = interfaceDetails.value[msg.interface];
          linkSpeedMbps.value = jIfaceInfo?.speed || 0;
          emit('clear');
          // Clear URL parameter
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Owner state update (collaborative viewing)
        if (msg.type === 'ownerState') {
          // Notify all subscribed components about state change
          notifyOwnerStateChange(msg.state);
        }

        // Session catch-up packets (when joining existing session)
        if (msg.type === 'sessionCatchUp') {
          packets.value.push(...msg.packets);
          allPackets.value.push(...msg.packets);
          scheduleUpdate();
        }

        // Session client count update
        if (msg.type === 'sessionClientUpdate') {
          sessionClientCount.value = msg.clientCount;

          // Show notification based on action
          if (msg.action === 'joined' && msg.viewerId !== myViewerId.value) {
            showSessionNotification(`${msg.viewerId} joined the session`);
          } else if (msg.action === 'left' && msg.viewerId !== myViewerId.value) {
            showSessionNotification(`${msg.viewerId} left the session`);
          } else if (msg.action === 'ownerLeft') {
            showSessionNotification('Session owner disconnected', 5000);
          }
        }

        // Session restarting - owner is restarting capture
        if (msg.type === 'sessionRestarting') {
          if (!isSessionOwner.value) {
            showSessionNotification('Owner is restarting capture...', 2000);
          }
          // Clear packets for all clients
          emit('clear');
        }

        // Session restarted - capture restarted
        if (msg.type === 'sessionRestarted') {
          selectedInterface.value = msg.interface;
          setIncludePort443(msg.includePort443 === true);
          setResolvePublicIps(msg.resolvePublicIps !== false);
          setEnableNtopng(msg.enableNtopng === true);
          isCapturing.value = true;
          captureActive.value = true;
          stoppedCapture.value = false;
          if (!isSessionOwner.value) {
            showSessionNotification('Capture restarted');
          }
        }

        // Session stopped
        if (msg.type === 'sessionStopped') {
          isCapturing.value = false;
          captureActive.value = false;
          stoppedCapture.value = true;
          if (loadingBarActive.value) {
            loadingBarActive.value = false;
            if (window.$loadingBar) window.$loadingBar.finish();
          }
          if (msg.reason === 'pcapStorageFull') {
            showSessionNotification('Capture stopped because the live RAM buffer is full', 5000);
            if (window.$notification) window.$notification.warning({ title: 'Capture Stopped', content: 'Live RAM buffer is full.', duration: 5000 });
          } else if (!isSessionOwner.value) {
            showSessionNotification('Session owner stopped the capture', 5000);
          } else {
            if (window.$message) window.$message.info('Capture stopped');
          }
          emit('stop');
        }

        // Session error
        if (msg.type === 'sessionError') {
          error.value = msg.error;
          pendingSessionJoin.value = null;
          // Clear URL parameter
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Session left
        if (msg.type === 'sessionLeft') {
          sessionId.value = null;
          isSessionOwner.value = false;
          globalIsSessionOwner.value = false;
          sessionClientCount.value = 0;
          myViewerId.value = null;
          pendingJoinRequests.value = [];
        }

        // Join request from someone wanting to join (owner only)
        if (msg.type === 'joinRequest') {
          pendingJoinRequests.value.push({
            requestId: msg.requestId,
            sessionId: msg.sessionId
          });
        }

        // Handle packet summaries from server
        if (msg.type === 'packet') {
          if (!isCapturing.value) return;
          // Finish loading bar once first packets appear
          if (loadingBarActive.value) {
            loadingBarActive.value = false;
            if (window.$loadingBar) window.$loadingBar.finish();
          }
          // When no filter active: add to both arrays and update UI
          // When filter active: only add to allPackets (no UI update, wait for filteredPacket)
          if (!displayFilter.value) {
            packets.value.push(msg.data);
            allPackets.value.push(msg.data);
            if (packets.value.length > 101000) {
              packets.value = packets.value.slice(-100000);
            }
            if (allPackets.value.length > 101000) {
              allPackets.value = allPackets.value.slice(-100000);
            }
            scheduleUpdate();
            scheduleAllPacketsUpdate();  // Also trigger allPackets for live count
          } else {
            allPackets.value.push(msg.data);
            if (allPackets.value.length > 101000) {
              allPackets.value = allPackets.value.slice(-100000);
            }
            scheduleAllPacketsUpdate();  // Trigger reactivity for live packet count
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
          isCapturing.value = false;
          captureActive.value = false;
          stoppedCapture.value = true;
          emit('stop');
        }

        if (msg.type === 'pcapDirUsage') {
          const { type, ...usage } = msg;
          pcapDirUsage.value = usage;
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
            if (window.$message) window.$message.error(`Filter error: ${msg.error}`);
          } else {
            filterError.value = null;
            displayFilter.value = msg.filter || '';
            if (window.$message) {
              if (msg.filter) {
                window.$message.info(`Filter matched ${(msg.packets?.length || 0).toLocaleString()} packets`);
              } else {
                window.$message.info('Filter cleared');
              }
            }

            // If filter is empty, restore all packets from local cache
            if (!msg.filter) {
              // Use our local allPackets which has been maintained with all received packets
              // (backend buffer may be truncated by MAX_PACKET_BUFFER cap)
              packets.value = [...allPackets.value];
            } else {
              // Store current packets as allPackets before filtering (first time only)
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
          if (window.$loadingBar) window.$loadingBar.start();
        }

        if (msg.type === 'loadPcapProgress') {
          loadPcapProgress.value = msg.count;
        }

        // Handle incremental packet batches during loading
        if (msg.type === 'loadPcapBatch') {
          // Append batch to packets array
          packets.value.push(...msg.packets);
          allPackets.value.push(...msg.packets);
          if (packets.value.length > 101000) {
            packets.value = packets.value.slice(-100000);
          }
          if (allPackets.value.length > 101000) {
            allPackets.value = allPackets.value.slice(-100000);
          }
          loadPcapProgress.value = msg.total;
          triggerRef(packets);
        }

        if (msg.type === 'loadPcapComplete') {
          isLoadingPcap.value = false;
          loadPcapProgress.value = 0;
          loadedPcapFile.value = msg.path;
          captureActive.value = true;
          // Packets already loaded via batches, just trigger final update
          triggerRef(packets);
          if (window.$loadingBar) window.$loadingBar.finish();
          if (window.$message) window.$message.success(`Loaded ${packets.value.length.toLocaleString()} packets`);
        }

        if (msg.type === 'loadPcapError') {
          isLoadingPcap.value = false;
          loadPcapProgress.value = 0;
          loadingPcapFilename.value = '';
          error.value = msg.error;
          if (window.$loadingBar) window.$loadingBar.error();
          if (window.$message) window.$message.error(msg.error || 'Failed to load file');
        }

        // Handle save progress updates
        if (msg.type === 'saveProgress') {
          if (saveProgressIndicator.value) {
            saveProgressIndicator.value.updateSaveProgress(msg);
          }
          if (msg.status === 'complete') {
            savedCapturesCount.value++;
            if (window.$message) window.$message.success(`Capture saved: ${msg.filename || 'capture'}`);
          }
        }

        if (msg.type === 'error') {
          error.value = msg.message;
          if (window.$notification) window.$notification.error({ title: 'Error', content: msg.message, duration: 6000 });
          if (isCapturing.value) {
            stopCapture();
          }
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
      addWsEvent('WebSocket error');
      if (loadingBarActive.value) {
        loadingBarActive.value = false;
        if (window.$loadingBar) window.$loadingBar.error();
      }
    };

    ws.value.onclose = () => {
      clearHeartbeatTimers();
      isConnected.value = false;
      isCapturing.value = false;
      websocket.value = null;
      addWsEvent('WebSocket closed');
      backendStatus.value = allowReconnect && !isUnmounting ? 'reconnecting' : 'disconnected';
      if (allowReconnect && !isUnmounting) {
        scheduleReconnect();
      }
    };
  } catch (e) {
    error.value = e.message;
    addWsEvent(`WebSocket connect exception: ${e.message}`);
    backendStatus.value = allowReconnect && !isUnmounting ? 'reconnecting' : 'disconnected';
    if (allowReconnect && !isUnmounting) {
      scheduleReconnect();
    }
  }
};

const startCapture = () => {
  if (!ws.value || !isConnected.value) return;

  // Always create a shared session for captures
  sendMessage({
    type: 'createSession',
    interface: selectedInterface.value,
    includePort443: includePort443.value,
    resolvePublicIps: resolvePublicIps.value,
    enableNtopng: enableNtopng.value
  });

  // State will be updated when sessionCreated message is received
};

const stopCapture = () => {
  if (ws.value && isConnected.value) {
    try {
      if (sessionId.value) {
        // Stop session capture — stay in session so pcap file remains accessible
        sendMessage({ type: 'stopSession' });
      } else {
        sendMessage({ type: 'stop' });
      }
    } catch (e) {}
  }

  isCapturing.value = false;
  captureActive.value = false;
  stoppedCapture.value = true;
  if (loadingBarActive.value) {
    loadingBarActive.value = false;
    if (window.$loadingBar) window.$loadingBar.finish();
  }
  emit('stop');
};

// Resume capture on the same interface (from stopped state)
const resumeCaptureOnSameInterface = () => {
  if (!ws.value || !isConnected.value || !selectedInterface.value) return;
  displayFilter.value = '';
  filterError.value = null;
  stoppedCapture.value = false;

  // Stop existing session if any, then start fresh
  if (sessionId.value) {
    sendMessage({ type: 'restartSession' });
  } else {
    try { sendMessage({ type: 'stop' }); } catch (e) {}
    emit('clear');
    setTimeout(() => {
      if (ws.value && isConnected.value) {
        sendMessage({
          type: 'createSession',
          interface: selectedInterface.value,
          includePort443: includePort443.value,
          resolvePublicIps: resolvePublicIps.value,
          enableNtopng: enableNtopng.value
        });
      }
    }, 200);
  }
};

// Start/stop idle detection based on capture state
watch(isCapturing, (capturing) => {
  if (capturing && !stoppedCapture.value) {
    startIdleDetection();
  } else {
    stopIdleDetection();
  }
});

const restartCapture = () => {
  // Clear any active filter
  displayFilter.value = '';
  filterError.value = null;

  if (ws.value && isConnected.value) {
    if (sessionId.value && isSessionOwner.value) {
      // Use session restart - backend handles everything
      sendMessage({ type: 'restartSession' });
    } else {
      // Non-session restart (legacy)
      isCapturing.value = false;
      try {
        sendMessage({ type: 'stop' });
      } catch (e) {}

      emit('clear');

      // Wait for backend to stop/reset, then start again
      setTimeout(() => {
        if (ws.value && isConnected.value) {
          sendMessage({
            type: 'start',
            interface: selectedInterface.value,
            includePort443: includePort443.value,
            resolvePublicIps: resolvePublicIps.value,
            enableNtopng: enableNtopng.value
          });
          isCapturing.value = true;
        }
      }, 200);
    }
  }
};

// Save confirmation flow for restart
const confirmRestartCapture = () => {
  // Only ask to save if there are packets captured
  if (packets.value.length > 0) {
    saveConfirmDialog.value?.open();
  } else {
    // No packets to save, just restart
    restartCapture();
  }
};

const generateDefaultFilename = () => {
  return `webcap.pcapng.zst`;
};

const onSaveConfirmYes = async () => {
  // Auto-save with default filename via save-pcap endpoint (saves to captures dir)
  const filename = generateDefaultFilename();

  try {
    const response = await apiFetch('/api/save-pcap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filename, useCaptures: true, packetCount: packets.value.length })
    });

    const text = await response.text();
    if (text) {
      const data = JSON.parse(text);
      if (data.success && data.jobId) {
        // Add job to progress indicator
        if (saveProgressIndicator.value) {
          saveProgressIndicator.value.addSaveJob(data.jobId);
        }
      }
    }
  } catch (e) {
    // Silently fail - proceed with restart anyway
  }

  // Proceed with restart
  restartCapture();
};

const onSaveConfirmNo = () => {
  // User doesn't want to save - proceed with restart
  restartCapture();
};

const onSaveConfirmCancel = () => {
  // User cancelled - don't do anything, just close dialog
};

// Open file browser
const openFileBrowser = () => {
  emit('openFileBrowser');
};

// Load pcap file from server
const loadPcapFile = (filePath) => {
  if (!ws.value || !isConnected.value) return;

  // Stop session capture if running
  if (sessionId.value) {
    try { sendMessage({ type: 'stopSession' }); } catch (e) {}
    try { sendMessage({ type: 'leaveSession' }); } catch (e) {}
  }
  sessionId.value = null;
  isSessionOwner.value = false;
  sessionClientCount.value = 0;

  // Clear current state
  loadedPcapFile.value = null;
  isCapturing.value = false;
  captureActive.value = false;
  stoppedCapture.value = false;
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
  captureActive.value = false;
  packets.value = [];
  allPackets.value = [];
  displayFilter.value = '';
  filterError.value = null;
  triggerRef(packets);
  emit('clear');
};

// Go back to interface list (clears current capture state)
const goBackToInterfaces = () => {
  // Leave session if in one (triggers cleanup on backend)
  if (sessionId.value && ws.value && isConnected.value) {
    try { sendMessage({ type: 'leaveSession' }); } catch (e) {}
  }
  sessionId.value = null;
  isSessionOwner.value = false;
  sessionClientCount.value = 0;

  loadedPcapFile.value = null;
  isCapturing.value = false;
  captureActive.value = false;
  stoppedCapture.value = false;
  packets.value = [];
  allPackets.value = [];
  displayFilter.value = '';
  filterError.value = null;
  activePacketIndex.value = null;
  triggerRef(packets);
  emit('clear');
};

defineExpose({ getWebSocket, loadPcapFile, goBackToInterfaces, saveProgressIndicator });

// Auto-connect on mount
onMounted(() => {
  // Check URL for session parameter to join
  const urlParams = new URLSearchParams(window.location.search);
  const joinSession = urlParams.get('session');
  if (joinSession) {
    pendingSessionJoin.value = joinSession;
  }

  connect();
});

onUnmounted(() => {
  isUnmounting = true;
  clearReconnectTimer();
  clearHeartbeatTimers();
  if (pcapDirUsageInterval) clearInterval(pcapDirUsageInterval);
  stopIdleDetection();
  addWsEvent('WebSocket shutdown (component unmounted)');
  closeSocket({ disableReconnect: true });
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

.controls pf-button, .status-bar pf-button {
  --pf-c-button--FontWeight: bold;
  --pf-c-button--FontSize: 0.9em;
}

.btn-file {
  --pf-c-button--m-primary--BackgroundColor: #6366f1;
  --pf-c-button--m-primary--hover--BackgroundColor: #818cf8;
}

.btn-approve {
  --pf-c-button--m-primary--BackgroundColor: #22c55e;
  --pf-c-button--m-primary--hover--BackgroundColor: #16a34a;
}

/* Combined capture control button */
.capture-controls {
  display: flex;
  margin-left: 10px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.ctrl-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  padding: 7px 12px;
  overflow: hidden;
  transition: filter 0.2s, transform 0.1s;
}

.ctrl-btn svg {
  width: 16px;
  height: 16px;
  position: relative;
  z-index: 1;
}

.ctrl-restart {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  border-right: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 8px 0 0 8px;
}

.ctrl-stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  border-radius: 0 8px 8px 0;
}

.ctrl-play {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.ctrl-play svg {
  width: 14px;
  height: 14px;
}

.stopped-indicator {
  color: #9ca3af;
  margin-right: 10px;
  font-size: 1.1em;
  font-weight: bold;
}

.stopped-bar {
  background: #1a2332;
}

.stopped-interface-select {
  background: #111827;
  color: #e5e7eb;
  border: 1px solid #374151;
  padding: 5px 10px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 13px;
  margin-right: 10px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.stopped-interface-select:hover {
  border-color: #22c55e;
}

.stopped-interface-select:focus {
  border-color: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

/* Shimmer/glitter overlay on hover */
.ctrl-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    120deg,
    transparent 0%,
    transparent 30%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 70%,
    transparent 100%
  );
  z-index: 2;
  transition: none;
}

.ctrl-btn:hover::before {
  left: 100%;
  transition: left 0.5s ease;
}

.ctrl-btn:hover {
  filter: brightness(1.2);
}

.ctrl-btn:active {
  transform: scale(0.93);
  filter: brightness(0.95);
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
  font-size: 1.1em;
  font-weight: bold;
}

.interface-tag-wrapper {
  position: relative;
}

.interface-tag {
  color: #d1d5db;
  margin-left: 10px;
  font-size: 1.1em;
  border-left: 1px solid #6b7280;
  padding-left: 10px;
  cursor: default;
}

.iface-popover {
  font-size: 12px;
  font-family: monospace;
}

.iface-popover-row {
  padding: 2px 0;
  color: #e5e7eb;
}

.iface-popover-label {
  color: #9ca3af;
  margin-right: 8px;
  min-width: 40px;
  display: inline-block;
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

.save-toast {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #065f46;
  color: #d1fae5;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  15% { opacity: 1; transform: translateX(-50%) translateY(0); }
  85% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
}

/* Interface Selector Landing Page Styles */
.interface-selector-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 40px 20px;
}

.open-file-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.or-text {
  color: #555;
  font-size: 15px;
}

.btn-file-large {
  --pf-c-button--m-primary--BackgroundColor: #6366f1;
  --pf-c-button--m-primary--hover--BackgroundColor: #818cf8;
  --pf-c-button--FontSize: 15px;
  --pf-c-button--FontWeight: 500;
}

/* Session sharing styles */
.session-info {
  position: absolute;
  right: 100px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Follow Owner toggle */
.follow-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  margin-left: 8px;
  padding: 3px 8px;
  background: #374151;
  border-radius: 12px;
  font-size: 0.8em;
  user-select: none;
}

.follow-toggle input[type="checkbox"] {
  cursor: pointer;
  accent-color: #3b82f6;
}

.follow-toggle .follow-label {
  color: #9ca3af;
}

.follow-toggle:has(input:checked) .follow-label {
  color: #93c5fd;
}

/* Session notification toast */
.session-notification {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #1e40af;
  color: #dbeafe;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 2000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* Join request popup */
.join-request-popup {
  position: fixed;
  top: 70px;
  right: 20px;
  z-index: 2500;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.join-request-item {
  background: #1f2937;
  border: 1px solid #8b5cf6;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.request-text {
  display: block;
  color: #e5e7eb;
  font-size: 14px;
  margin-bottom: 10px;
}

.request-actions {
  display: flex;
  gap: 8px;
}

.request-actions pf-button {
  --pf-c-button--FontSize: 13px;
}
</style>
