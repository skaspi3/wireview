<template>
  <div class="live-capture-wrapper" :class="{ 'show-selector': showInterfaceSelector }">
    <!-- Connecting State (in header bar) -->
    <div v-if="!isCapturing && !isLoadingPcap && !loadedPcapFile && !showInterfaceSelector" class="controls">
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
          <button @click="openFileBrowser" class="btn btn-file-large" title="Open capture file">
            📂 Open Capture File
          </button>
        </div>
      </div>
    </Teleport>

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

      <!-- Session info -->
      <span v-if="sessionId" class="session-info" :title="'Session: ' + sessionId">
        <span class="session-badge">{{ sessionClientCount }} viewer{{ sessionClientCount !== 1 ? 's' : '' }}</span>
        <button v-if="isSessionOwner" @click="showShareDialog = true" class="btn btn-share" title="Share capture session">
          🔗 Share
        </button>
        <!-- Follow Owner toggle for viewers -->
        <label v-if="!isSessionOwner" class="follow-toggle" title="Follow owner's view (selected packet, scroll, filter)">
          <input type="checkbox" v-model="followOwner" />
          <span class="follow-label">Follow</span>
        </label>
      </span>

      <button v-if="isSessionOwner || !sessionId" @click="confirmRestartCapture" class="btn btn-warning" title="Restart Capture">
        ↺
      </button>
      <button v-if="isSessionOwner || !sessionId" @click="stopCapture" class="btn btn-danger">
        Stop
      </button>
      <button v-else @click="stopCapture" class="btn btn-secondary">
        Leave
      </button>
    </div>

    <!-- Share Dialog -->
    <div v-if="showShareDialog" class="share-dialog-overlay" @click.self="showShareDialog = false">
      <div class="share-dialog">
        <h3>Share Capture Session</h3>
        <p>Others can view this live capture by opening this link:</p>
        <div class="share-url-container">
          <input type="text" :value="getShareUrl()" readonly class="share-url-input" />
          <button @click="copyShareUrl" class="btn btn-primary">Copy</button>
        </div>
        <p class="share-note">Session ID: <code>{{ sessionId }}</code></p>
        <button @click="showShareDialog = false" class="btn btn-secondary">Close</button>
      </div>
    </div>

    <!-- Join Request Popup (for owner) -->
    <div v-if="pendingJoinRequests.length > 0" class="join-request-popup">
      <div v-for="req in pendingJoinRequests" :key="req.requestId" class="join-request-item">
        <span class="request-text">Someone wants to join your session</span>
        <div class="request-actions">
          <button @click="approveJoinRequest(req.requestId)" class="btn btn-approve">Approve</button>
          <button @click="rejectJoinRequest(req.requestId)" class="btn btn-reject">Reject</button>
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
import { ref, triggerRef, onUnmounted, onMounted, computed } from 'vue';
import { nodeVersion, tsharkLuaVersion, tsharkLibraries, backendPort, backendStatus, certInfo, packets, allPackets, websocket, displayFilter, filterError, filterLoading, filterProgress, trackReceived, trackSent, activePacketIndex, hostIP, captureActive, stoppedCapture, isSessionOwner as globalIsSessionOwner, followOwner, notifyOwnerStateChange } from '../globals';
import { decompress as zstdDecompress } from 'fzstd';
import ConfirmDialog from './ConfirmDialog.vue';
import InterfaceSelector from './InterfaceSelector.vue';
import SaveProgressIndicator from './SaveProgressIndicator.vue';

const emit = defineEmits(['clear', 'stop', 'openFileBrowser']);

const ws = ref(null);
const isConnected = ref(false);
const isCapturing = ref(false);
const interfaces = ref([]);
const selectedInterface = ref('');

const error = ref(null);

// Session sharing state
const sessionId = ref(null);
const isSessionOwner = ref(false);
const sessionClientCount = ref(0);
const pendingSessionJoin = ref(null);  // Session ID from URL to join after connect
const showShareDialog = ref(false);
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
  myViewerId.value = data.viewerId;
  selectedInterface.value = data.interface;
  isCapturing.value = data.isCapturing;
  emit('clear');
};

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

// Show interface selector when connected but not capturing/loading
const showInterfaceSelector = computed(() => {
  return isConnected.value && !isCapturing.value && !isLoadingPcap.value && !loadedPcapFile.value;
});

// Handle interface selection from selector
const onInterfaceSelect = (iface) => {
  selectedInterface.value = iface.name;
};

// Handle start capture from selector
const onSelectorStartCapture = (ifaceName) => {
  selectedInterface.value = ifaceName;
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
    // Use arraybuffer for binary messages (more efficient than blob)
    ws.value.binaryType = 'arraybuffer';

    ws.value.onopen = () => {
      isConnected.value = true;
      backendStatus.value = 'connected';
      websocket.value = ws.value; // Store in global for filter requests
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
          isCapturing.value = true;
          captureActive.value = true;
          stoppedCapture.value = false;
          emit('clear');
        }

        // Session joined - we are a viewer
        if (msg.type === 'sessionJoined') {
          sessionId.value = msg.sessionId;
          isSessionOwner.value = false;
          globalIsSessionOwner.value = false;
          followOwner.value = true;  // Default to following owner
          myViewerId.value = msg.viewerId;
          selectedInterface.value = msg.interface;
          isCapturing.value = msg.isCapturing;
          captureActive.value = msg.isCapturing;
          stoppedCapture.value = false;
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
          if (!isSessionOwner.value) {
            showSessionNotification('Session owner stopped the capture', 5000);
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
          // When no filter active: add to both arrays and update UI
          // When filter active: only add to allPackets (no UI update, wait for filteredPacket)
          if (!displayFilter.value) {
            packets.value.push(msg.data);
            allPackets.value.push(msg.data);
            scheduleUpdate();
            scheduleAllPacketsUpdate();  // Also trigger allPackets for live count
          } else {
            allPackets.value.push(msg.data);
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

            // If filter is empty, restore all packets from backend
            if (!msg.filter) {
              // Backend sends all buffered packets when filter is cleared
              packets.value = [...msg.packets];
              // Update allPackets to keep them in sync
              allPackets.value = [...msg.packets];
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
        }

        if (msg.type === 'loadPcapProgress') {
          loadPcapProgress.value = msg.count;
        }

        // Handle incremental packet batches during loading
        if (msg.type === 'loadPcapBatch') {
          // Append batch to packets array
          packets.value.push(...msg.packets);
          allPackets.value.push(...msg.packets);
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
        }

        if (msg.type === 'loadPcapError') {
          isLoadingPcap.value = false;
          loadPcapProgress.value = 0;
          loadingPcapFilename.value = '';
          error.value = msg.error;
        }

        // Handle save progress updates
        if (msg.type === 'saveProgress') {
          if (saveProgressIndicator.value) {
            saveProgressIndicator.value.updateSaveProgress(msg);
          }
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

  // Always create a shared session for captures
  sendMessage({
    type: 'createSession',
    interface: selectedInterface.value
  });

  // State will be updated when sessionCreated message is received
};

const stopCapture = () => {
  if (ws.value && isConnected.value) {
    try {
      if (sessionId.value) {
        // Stop session capture
        sendMessage({ type: 'stopSession' });
        sendMessage({ type: 'leaveSession' });
      } else {
        sendMessage({ type: 'stop' });
      }
    } catch (e) {}
  }

  isCapturing.value = false;
  captureActive.value = false;
  stoppedCapture.value = true;
  sessionId.value = null;
  isSessionOwner.value = false;
  sessionClientCount.value = 0;
  emit('stop');
};

// Get shareable URL for current session
const getShareUrl = () => {
  if (!sessionId.value) return '';
  return `${window.location.origin}${window.location.pathname}?session=${sessionId.value}`;
};

// Copy share URL to clipboard
const copyShareUrl = () => {
  const url = getShareUrl();
  navigator.clipboard.writeText(url).then(() => {
    // Show brief feedback
    showShareDialog.value = false;
  });
};

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
            interface: selectedInterface.value
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
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `${timestamp}_webcap.pcapng.zst`;
};

const onSaveConfirmYes = async () => {
  // Auto-save to /tmp/wireview with default filename
  const filename = generateDefaultFilename();
  const savePath = `/tmp/wireview/${filename}`;

  try {
    const response = await fetch('/api/save-pcap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: savePath })
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

  // Clear current state
  loadedPcapFile.value = null;
  captureActive.value = false;
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

defineExpose({ getWebSocket, loadPcapFile, goBackToInterfaces });

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
  background: #6366f1;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: background 0.15s ease;
}

.btn-file-large:hover {
  background: #818cf8;
}

/* Session sharing styles */
.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid #4b5563;
}

.session-badge {
  background: #065f46;
  color: #d1fae5;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: 500;
}

.btn-share {
  background: #8b5cf6;
  color: white;
  padding: 4px 10px;
  font-size: 0.85em;
}

.btn-share:hover {
  background: #a78bfa;
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

.share-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.share-dialog {
  background: #1f2937;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.share-dialog h3 {
  margin: 0 0 16px 0;
  color: #f9fafb;
  font-size: 1.2em;
}

.share-dialog p {
  color: #9ca3af;
  margin: 0 0 12px 0;
  font-size: 0.95em;
}

.share-url-container {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.share-url-input {
  flex: 1;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 12px;
  color: #e5e7eb;
  font-family: monospace;
  font-size: 0.9em;
}

.share-url-input:focus {
  outline: none;
  border-color: #6366f1;
}

.share-note {
  color: #6b7280;
  font-size: 0.85em;
}

.share-note code {
  background: #374151;
  padding: 2px 6px;
  border-radius: 4px;
  color: #a5b4fc;
}

.share-dialog .btn {
  margin-top: 8px;
}

.share-dialog .btn-secondary {
  width: 100%;
  justify-content: center;
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

.btn-approve {
  background: #22c55e;
  color: white;
  padding: 6px 14px;
  font-size: 13px;
}

.btn-approve:hover {
  background: #16a34a;
}

.btn-reject {
  background: #ef4444;
  color: white;
  padding: 6px 14px;
  font-size: 13px;
}

.btn-reject:hover {
  background: #dc2626;
}
</style>
