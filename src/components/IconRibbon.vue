<script setup>
import { ref, useTemplateRef, computed, onMounted, onUnmounted } from 'vue';
import { displayFilter, packets, stoppedCapture, allPackets, idleCountdownSeconds, cancelIdleCountdown, apiFetch } from '../globals';
import LiveCapture from "./LiveCapture.vue";

const props = defineProps({
  hideInsights: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['clear', 'stop', 'openFileBrowser', 'openInsights', 'saveFiltered']);

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
const showActionsMenu = ref(false);

const DONATE_URL = (import.meta.env.VITE_DONATE_URL || 'https://github.com/sponsors/skaspi3').trim();
const DONATE_LABEL = (import.meta.env.VITE_DONATE_LABEL || 'Donate $5').trim();
const OPEN_FEEDBACK_EVENT = 'webpcap:open-feedback';
const OPEN_CHANGELOG_EVENT = 'webpcap:open-changelog';
const OPEN_THIRD_PARTY_EVENT = 'webpcap:open-third-party';

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

const toggleActionsMenu = () => {
  showActionsMenu.value = !showActionsMenu.value;
};

const closeActionsMenu = () => {
  showActionsMenu.value = false;
};

const dispatchStatusBarAction = (eventName) => {
  closeActionsMenu();
  window.dispatchEvent(new CustomEvent(eventName));
};

const openFeedback = () => dispatchStatusBarAction(OPEN_FEEDBACK_EVENT);
const openChangelog = () => dispatchStatusBarAction(OPEN_CHANGELOG_EVENT);
const openThirdParty = () => dispatchStatusBarAction(OPEN_THIRD_PARTY_EVENT);

const onDocumentClick = () => closeActionsMenu();

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

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});

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
      <button class="insights-btn" @click="emit('openInsights')" title="Capture Insights">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
        </svg>
        Insights
      </button>
      <div class="app-actions-group">
        <button
          class="app-actions-trigger"
          @click.stop="toggleActionsMenu"
          aria-label="Open actions menu"
          title="Quick Actions"
        >
          <svg class="app-actions-trigger-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.7" class="ring" />
            <circle cx="12" cy="12" r="6.4" class="core" />
            <path class="menu-line" d="M8.2 9.3h7.6" />
            <path class="menu-line" d="M8.2 12h7.6" />
            <path class="menu-line" d="M8.2 14.7h7.6" />
          </svg>
        </button>
        <Transition name="actions-slide-down">
          <div v-if="showActionsMenu" class="app-actions-menu" @click.stop>
            <button class="app-actions-item" @click="openFeedback">Feedback</button>
            <button class="app-actions-item" @click="openChangelog">Changelog</button>
            <button class="app-actions-item" @click="openThirdParty">3-rd Party Libs</button>
            <a
              class="app-actions-item donate"
              :href="DONATE_URL"
              :aria-label="DONATE_LABEL"
              target="_blank"
              rel="noopener noreferrer"
              @click="closeActionsMenu"
            >
              {{ DONATE_LABEL }}
            </a>
          </div>
        </Transition>
      </div>
      <!-- Save button - shown when capture stopped and has packets -->
      <button v-if="showSaveButton" class="save-btn" @click="openSaveAllDialog" title="Save capture">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save
      </button>
      <!-- Save Selected button - shown when filter is active -->
      <button v-if="displayFilter" class="save-selected-btn" @click="openSaveFilteredDialog" title="Save filtered packets">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Save Selected
      </button>
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
          <button @click="savePackets" class="btn btn-save" :disabled="saveSaving">
            {{ saveSaving ? 'Saving...' : 'Save' }}
          </button>
          <button @click="closeSaveDialog" class="btn btn-cancel">Cancel</button>
        </div>
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
  gap: 6px;
  padding: 4px 10px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.insights-btn:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  transform: translateY(-1px);
}

.insights-btn:active {
  transform: translateY(0);
}

.insights-btn svg {
  width: 16px;
  height: 16px;
}

.app-actions-group {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  z-index: 80;
}

.app-actions-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 44px;
  height: 44px;
  border: 1px solid #2d4665;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #1f3552 0%, #13263e 42%, #0b1524 100%);
  color: #dbeafe;
  cursor: pointer;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.16), 0 2px 8px rgba(2, 6, 23, 0.55);
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s, filter 0.15s;
}

.app-actions-trigger:hover {
  border-color: #67e8f9;
  filter: brightness(1.06);
  transform: translateY(-1px) scale(1.03);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.2), 0 5px 14px rgba(14, 165, 233, 0.34);
}

.app-actions-trigger:active {
  transform: translateY(0) scale(0.98);
}

.app-actions-trigger::after {
  content: "";
  position: absolute;
  inset: -2px;
  pointer-events: none;
  border-radius: 50%;
  border: 1px solid rgba(103, 232, 249, 0.65);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.45);
  opacity: 0;
  transition: opacity 0.16s ease-out;
}

.app-actions-trigger:hover::after {
  opacity: 1;
}

.app-actions-trigger-icon {
  width: 24px;
  height: 24px;
}

.app-actions-trigger-icon .ring {
  fill: none;
  stroke: #7dd3fc;
  stroke-width: 1.35;
}

.app-actions-trigger-icon .core {
  fill: rgba(14, 116, 144, 0.22);
}

.app-actions-trigger-icon .menu-line {
  fill: none;
  stroke: #e0f2fe;
  stroke-width: 1.85;
  stroke-linecap: round;
}

.app-actions-trigger:hover .app-actions-trigger-icon .ring {
  stroke: #a5f3fc;
}

.app-actions-trigger:hover .app-actions-trigger-icon .menu-line {
  stroke: #ffffff;
}

.app-actions-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 210px;
  padding: 8px;
  border: 1px solid #374151;
  border-radius: 10px;
  background: #111827;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.app-actions-item {
  display: block;
  width: 100%;
  background: #1f2937;
  border: 1px solid #374151;
  color: #d1d5db;
  border-radius: 6px;
  padding: 7px 10px;
  font-family: monospace;
  font-size: 13px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.app-actions-item:hover {
  background: #243244;
  border-color: #4b5563;
  color: #f3f4f6;
}

.app-actions-item.donate {
  background: linear-gradient(180deg, #f59e0b, #d97706);
  border-color: #7c2d12;
  color: #111827;
  font-weight: 700;
}

.app-actions-item.donate:hover {
  filter: brightness(1.05);
}

.actions-slide-down-enter-active {
  animation: actions-slide-down 0.2s ease-out;
}

.actions-slide-down-leave-active {
  animation: actions-slide-down 0.16s ease-in reverse;
}

@keyframes actions-slide-down {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.save-dialog .btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-save {
  background: #22c55e;
  color: white;
}

.btn-save:hover:not(:disabled) {
  background: #16a34a;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background: #4b5563;
  color: #e5e7eb;
}

.btn-cancel:hover {
  background: #6b7280;
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


</style>
