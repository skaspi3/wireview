<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import '@patternfly/elements/pf-tooltip/pf-tooltip.js';
import { ref, useTemplateRef, computed, onMounted, onUnmounted } from 'vue';
import { displayFilter, packets, stoppedCapture, allPackets, idleCountdownSeconds, cancelIdleCountdown, apiFetch, authUser } from '../globals';
import LiveCapture from "./LiveCapture.vue";

const props = defineProps({
  hideInsights: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['clear', 'stop', 'openFileBrowser', 'openInsights', 'saveFiltered', 'signOut']);

const liveCaptureRef = useTemplateRef('live-capture');

// Idle countdown formatting
const idleCountdownFormatted = computed(() => {
  const s = idleCountdownSeconds.value;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
});
const resumeCapture = () => cancelIdleCountdown();

// Save dialog state
const showSaveDialog = ref(false);
const saveDialogMode = ref('all'); // 'all' or 'filtered'
const saveFilename = ref('');
const saveError = ref(null);
const saveSaving = ref(false);
// Show save button when user clicked Stop and has packets (and no filter active)
const showSaveButton = computed(() => {
  return stoppedCapture.value && packets.value.length > 0 && !displayFilter.value;
});

const loadPcapFile = (filePath) => {
  liveCaptureRef.value?.loadPcapFile(filePath);
};

// Generate save filename with optional filter prefix
const generateSaveFilename = (mode) => {
  const filter = displayFilter.value?.trim();
  if (filter) {
    const sanitized = filter.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
    return sanitized;
  }
  return 'capture';
};

// Open save dialog for all packets
const openSaveAllDialog = () => {
  saveFilename.value = generateSaveFilename('all');
  saveError.value = null;
  saveDialogMode.value = 'all';
  showSaveDialog.value = true;
};

// Open save dialog for filtered packets
const openSaveFilteredDialog = () => {
  saveFilename.value = generateSaveFilename('filtered');
  saveError.value = null;
  saveDialogMode.value = 'filtered';
  showSaveDialog.value = true;
};

const closeSaveDialog = () => {
  showSaveDialog.value = false;
  saveError.value = null;
};

const savePackets = async () => {
  if (!saveFilename.value.trim()) {
    saveError.value = 'Please enter a filename';
    return;
  }

  // Get frame numbers based on mode
  let frameNumbers;
  if (saveDialogMode.value === 'filtered') {
    // Filtered mode: save currently visible (filtered) packets
    frameNumbers = packets.value.map(pkt => pkt.number).filter(n => n > 0);
  } else {
    // All mode: save all packets (use allPackets if available, else packets)
    const pkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
    frameNumbers = pkts.map(pkt => pkt.number).filter(n => n > 0);
  }

  if (frameNumbers.length === 0) {
    saveError.value = 'No packets to save';
    return;
  }

  let filename = saveFilename.value.trim();

  // Handle extension logic
  if (!filename.endsWith('.pcap') && !filename.endsWith('.pcapng') &&
      !filename.endsWith('.pcap.zst') && !filename.endsWith('.pcapng.zst')) {
    filename += '.pcapng.zst';
  }

  saveSaving.value = true;
  saveError.value = null;

  try {
    const response = await apiFetch('/api/save-filtered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, frameNumbers })
    });

    const data = await response.json();

    if (data.success && data.jobId) {
      // Add job to progress indicator (via LiveCapture component)
      if (liveCaptureRef.value?.saveProgressIndicator) {
        liveCaptureRef.value.saveProgressIndicator.addSaveJob(data.jobId);
      }
      closeSaveDialog();
    } else if (data.error) {
      saveError.value = data.error;
    }
  } catch (e) {
    saveError.value = e.message || 'Failed to save file';
  } finally {
    saveSaving.value = false;
  }
};

// User avatar menu
const showAvatarMenu = ref(false);
const avatarMenuRef = ref(null);
const userInitial = computed(() => {
  const name = authUser.value?.username || '?';
  return name.charAt(0).toUpperCase();
});

const toggleAvatarMenu = () => { showAvatarMenu.value = !showAvatarMenu.value; };
const closeAvatarMenu = (e) => {
  if (avatarMenuRef.value && !avatarMenuRef.value.contains(e.target)) {
    showAvatarMenu.value = false;
  }
};
onMounted(() => document.addEventListener('click', closeAvatarMenu));
onUnmounted(() => document.removeEventListener('click', closeAvatarMenu));

const signOut = async () => {
  showAvatarMenu.value = false;
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  emit('signOut');
};

defineExpose({ loadPcapFile });
</script>

<template>
  <div class="ribbon">
    <LiveCapture
      ref="live-capture"
      @clear="() => emit('clear')"
      @stop="() => emit('stop')"
      @openFileBrowser="() => emit('openFileBrowser')"
    />
    <img
      v-if="!hideInsights"
      src="/webpcap-logo.png"
      alt="WebPCAP"
      class="ribbon-logo"
      loading="eager"
      fetchpriority="high"
      decoding="sync"
    />
    <!-- Idle countdown warning -->
    <div v-if="idleCountdownSeconds > 0 && !stoppedCapture" class="idle-countdown">
      <div class="idle-countdown-inner">
        <svg class="idle-clock" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <div class="idle-text">
          <div class="idle-title">Capture stopping in</div>
          <div class="idle-timer">{{ idleCountdownFormatted }}</div>
        </div>
        <button class="idle-resume-btn" @click="resumeCapture">Resume</button>
      </div>
    </div>
    <template v-if="!hideInsights">
      <div class="separator"></div>
      <pf-tooltip content="Open ntopng Insights">
        <button class="insights-btn" @click="emit('openInsights')">
          <img src="/ntopng-insights-icon.svg" alt="" class="insights-btn__icon" />
          Insights
        </button>
      </pf-tooltip>
      <!-- Save button - shown when capture stopped and has packets -->
      <pf-tooltip v-if="showSaveButton" content="Save capture">
        <button class="save-btn" @click="openSaveAllDialog">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
      </pf-tooltip>
      <!-- Save Selected button - shown when filter is active -->
      <pf-tooltip v-if="displayFilter" content="Save filtered packets">
        <button class="save-selected-btn" @click="openSaveFilteredDialog">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save Selected
        </button>
      </pf-tooltip>
    </template>

    <!-- Save Dialog -->
    <div v-if="showSaveDialog" class="save-dialog-overlay" @click.self="closeSaveDialog">
      <div class="save-dialog">
        <h3>{{ saveDialogMode === 'filtered' ? 'Save Filtered Packets' : 'Save Capture' }}</h3>
        <p>Enter filename for the capture:</p>
        <div class="save-input-container">
          <input
            type="text"
            v-model="saveFilename"
            class="save-filename-input"
            placeholder="filename"
            @keyup.enter="savePackets"
          />
          <span class="extension-hint">.pcapng</span>
        </div>
        <div v-if="saveError" class="save-error">{{ saveError }}</div>
        <div class="save-actions">
          <pf-button class="btn-save" @click="savePackets" :disabled="saveSaving || undefined" :loading="saveSaving || undefined">
            {{ saveSaving ? 'Saving...' : 'Save' }}
          </pf-button>
          <pf-button variant="secondary" @click="closeSaveDialog">Cancel</pf-button>
        </div>
      </div>
    </div>

    <!-- User Avatar + Name -->
    <div v-if="authUser" ref="avatarMenuRef" class="avatar-container">
      <button class="avatar-trigger" @click.stop="toggleAvatarMenu">
        <span class="avatar-name">{{ authUser.username }}</span>
        <span class="avatar-btn">{{ userInitial }}</span>
      </button>
      <div v-if="showAvatarMenu" class="avatar-menu">
        <div class="avatar-menu-header">
          <div class="avatar-menu-name">{{ authUser.username }}</div>
          <div class="avatar-menu-email">{{ authUser.email }}</div>
        </div>
        <div class="avatar-menu-sep"></div>
        <button class="avatar-menu-item avatar-menu-signout" @click="signOut">Sign Out</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ribbon {
  position: relative;
  background: var(--ws-lighter-gray);
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 1px;
  border-bottom: var(--ws-pane-border);
  min-height: 47px;
  box-sizing: border-box;
}
.ribbon-logo {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  height: 47px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
  opacity: 0.9;
}
.icon {
  padding: 3px;
  display: flex;
  border: 1px solid transparent;
  border-radius: 4px;
}
.icon:hover {
  background: var(--ws-dark-gray);
  border-color: var(--ws-darker-gray);
}
.icon:active {
  background: var(--ws-selected-bg);
}
.icon.disabled,
.icon:has(input[disabled]) {
  pointer-events: none;
  filter: saturate(0);
  opacity: 0.5;
}
.icon input[type="file"] {
  display: none;
}
.separator {
  margin: 0 2px 0 3px;
  width: 2px;
  height: 16px;
  background-color: var(--ws-dark-gray);
  border-right: 1px solid var(--ws-gray);
}

.insights-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px 3px 4px;
  background: linear-gradient(180deg, #232a35, #171c24);
  color: #f3f4f6;
  border: 1px solid #364152;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.insights-btn:hover {
  background: linear-gradient(180deg, #2b3442, #1e2530);
  border-color: #4b5563;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.22);
  transform: translateY(-1px);
}

.insights-btn:active {
  transform: translateY(0);
}

.insights-btn__icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  flex: 0 0 auto;
  display: block;
}

.save-selected-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-left: 6px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.save-selected-btn:hover {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  transform: translateY(-1px);
}

.save-selected-btn:active {
  transform: translateY(0);
}

.save-selected-btn svg {
  width: 16px;
  height: 16px;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-left: 6px;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn:hover {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  transform: translateY(-1px);
}

.save-btn:active {
  transform: translateY(0);
}

.save-btn svg {
  width: 16px;
  height: 16px;
}

/* Save Dialog */
.save-dialog-overlay {
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

.save-dialog {
  background: #1f2937;
  border-radius: 12px;
  padding: 24px;
  min-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.save-dialog h3 {
  margin: 0 0 12px 0;
  color: #f9fafb;
  font-size: 1.2em;
}

.save-dialog p {
  color: #9ca3af;
  margin: 0 0 16px 0;
  font-size: 0.95em;
}

.save-input-container {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
}

.save-filename-input {
  flex: 1;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 12px;
  color: #e5e7eb;
  font-family: monospace;
  font-size: 14px;
}

.save-filename-input:focus {
  outline: none;
  border-color: #22c55e;
}

.extension-hint {
  color: #6b7280;
  font-family: monospace;
  font-size: 14px;
}

.save-error {
  color: #ef4444;
  font-size: 13px;
  margin-bottom: 12px;
}

.save-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.save-actions pf-button {
  --pf-c-button--FontSize: 14px;
  --pf-c-button--FontWeight: 500;
}

.btn-save {
  --pf-c-button--m-primary--BackgroundColor: #22c55e;
  --pf-c-button--m-primary--hover--BackgroundColor: #16a34a;
}

/* Idle kill-switch countdown */
.idle-countdown {
  position: absolute;
  left: calc(50% + 168px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  animation: idle-slide-in 0.3s ease-out;
}
@keyframes idle-slide-in {
  from { opacity: 0; transform: translateY(-50%) translateX(-10px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}
.idle-countdown-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(135deg, #1c1a17, #2a2520);
  border: 1px solid #b45309;
  border-radius: 8px;
  padding: 6px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 8px rgba(245, 158, 11, 0.15);
  white-space: nowrap;
}
.idle-clock {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  animation: idle-pulse 1s ease-in-out infinite;
}
@keyframes idle-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
.idle-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.idle-title {
  color: #d6d3d1;
  font-size: 11px;
  font-weight: 500;
}
.idle-timer {
  color: #fbbf24;
  font-size: 16px;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 1px;
}
.idle-resume-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 5px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  margin-left: 4px;
}
.idle-resume-btn:hover {
  background: linear-gradient(135deg, #4ade80, #22c55e);
  transform: scale(1.05);
}
.idle-resume-btn:active {
  transform: scale(0.95);
}

/* User Avatar */
.avatar-container {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5000;
}
.avatar-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px;
}
.avatar-name {
  color: #d1d5db;
  font-size: 13px;
  font-weight: 500;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avatar-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid #4b5563;
  background: #374151;
  color: #e5e7eb;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.15s, background 0.15s;
}
.avatar-trigger:hover .avatar-btn {
  border-color: #6b7280;
  background: #4b5563;
}
.avatar-trigger:hover .avatar-name {
  color: #f9fafb;
}
.avatar-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 10px;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 5001;
  overflow: hidden;
}
.avatar-menu-header {
  padding: 12px 16px;
}
.avatar-menu-name {
  color: #f9fafb;
  font-size: 16px;
  font-weight: 600;
}
.avatar-menu-email {
  color: #93c5fd;
  font-size: 16px;
  margin-top: 2px;
}
.avatar-menu-sep {
  height: 1px;
  background: #374151;
}
.avatar-menu-item {
  display: block;
  width: 100%;
  padding: 12px 18px;
  background: none;
  border: none;
  color: #d1d5db;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}
.avatar-menu-item:hover {
  background: #1f2937;
}
.avatar-menu-signout {
  color: #ef4444;
}
.avatar-menu-signout:hover {
  background: rgba(239, 68, 68, 0.1);
}
</style>
