<script setup>
import { ref, useTemplateRef, computed } from 'vue';
import { displayFilter, packets, stoppedCapture, allPackets } from '../globals';
import LiveCapture from "./LiveCapture.vue";

const props = defineProps({
  hideInsights: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['clear', 'stop', 'openFileBrowser', 'openInsights', 'saveFiltered']);

const liveCaptureRef = useTemplateRef('live-capture');

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

// Show back button when user clicked Stop
const showBackButton = computed(() => {
  return stoppedCapture.value && packets.value.length > 0;
});

const loadPcapFile = (filePath) => {
  liveCaptureRef.value?.loadPcapFile(filePath);
};

const goBack = () => {
  liveCaptureRef.value?.goBackToInterfaces();
};

// Open save dialog for all packets
const openSaveAllDialog = () => {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  saveFilename.value = `capture_${timestamp}`;
  saveError.value = null;
  saveDialogMode.value = 'all';
  showSaveDialog.value = true;
};

// Open save dialog for filtered packets
const openSaveFilteredDialog = () => {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  saveFilename.value = `filtered_${timestamp}`;
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
    const response = await fetch('/api/save-filtered', {
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
    <template v-if="!hideInsights">
      <div class="separator"></div>
      <button class="insights-btn" @click="emit('openInsights')" title="Capture Insights">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
        </svg>
        Insights
      </button>
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
      <!-- Back button - shown when capture stopped -->
      <button v-if="showBackButton" class="back-btn" @click="goBack" title="Back to interface list">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
        Back
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
  background: var(--ws-lighter-gray);
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 1px;
  border-bottom: var(--ws-pane-border);
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
  font-size: 12px;
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
  font-size: 12px;
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

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  margin-left: 6px;
  background: linear-gradient(135deg, #6b7280, #4b5563);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: linear-gradient(135deg, #9ca3af, #6b7280);
  transform: translateY(-1px);
}

.back-btn:active {
  transform: translateY(0);
}

.back-btn svg {
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
</style>
