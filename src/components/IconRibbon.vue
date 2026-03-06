<script setup>
import { ref, useTemplateRef, computed, onMounted, onUnmounted } from 'vue';
import { displayFilter, packets, stoppedCapture, allPackets, idleCountdownSeconds, cancelIdleCountdown, captureActive, linkSpeedMbps, hostIP, apiFetch } from '../globals';
import LiveCapture from "./LiveCapture.vue";
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GaugeChart } from 'echarts/charts';
import { TitleComponent } from 'echarts/components';
import VChart from 'vue-echarts';

use([CanvasRenderer, GaugeChart, TitleComponent]);

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

// Bandwidth gauge
const showBwPopup = ref(false);
let bwPopupLeaveTimer = null;
const onBwEnter = () => {
  if (bwPopupLeaveTimer) { clearTimeout(bwPopupLeaveTimer); bwPopupLeaveTimer = null; }
  showBwPopup.value = true;
};
const onBwLeave = () => {
  bwPopupLeaveTimer = setTimeout(() => { showBwPopup.value = false; }, 150);
};
const downRate = ref(0); // bytes/s
const upRate = ref(0);   // bytes/s
let prevPacketCount = 0;
let prevDownBytes = 0;
let prevUpBytes = 0;
let bwInterval = null;

const formatRate = (bytesPerSec) => {
  const bits = bytesPerSec * 8;
  if (bits < 1000) return bits.toFixed(0) + ' bps';
  if (bits < 1000000) return (bits / 1000).toFixed(1) + ' Kbps';
  if (bits < 1000000000) return (bits / 1000000).toFixed(2) + ' Mbps';
  return (bits / 1000000000).toFixed(2) + ' Gbps';
};

// Link capacity in bytes/s (from Mbps)
const linkCapacityBps = computed(() => {
  const mbps = linkSpeedMbps.value;
  if (mbps > 0) return mbps * 1000000 / 8; // Mbps -> bytes/s
  return 125000000; // default 1Gbps
});

const linkSpeedLabel = computed(() => {
  const mbps = linkSpeedMbps.value || 1000;
  if (mbps >= 1000) return `${mbps / 1000}G`;
  return `${mbps}M`;
});

const makeGaugeOption = (value, label, color) => {
  const maxVal = linkCapacityBps.value;
  const pct = maxVal > 0 ? (value / maxVal * 100) : 0;
  return {
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      center: ['50%', '60%'],
      radius: '90%',
      min: 0,
      max: 100,
      splitNumber: 5,
      axisLine: {
        lineStyle: {
          width: 8,
          color: [
            [0.3, '#67e0e3'],
            [0.7, color],
            [1, '#fd666d']
          ]
        }
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '55%',
        width: 8,
        offsetCenter: [0, '-10%'],
        itemStyle: { color: 'auto' }
      },
      axisTick: {
        length: 6,
        lineStyle: { color: 'auto', width: 1 }
      },
      splitLine: {
        length: 12,
        lineStyle: { color: 'auto', width: 2 }
      },
      axisLabel: {
        color: '#999',
        fontSize: 12,
        distance: -40,
        rotate: 'tangential',
        formatter: (v) => {
          if (v === 0) return '';
          const mbps = linkSpeedMbps.value || 1000;
          const val = v / 100 * mbps;
          if (val >= 1000) return (val / 1000).toFixed(0) + 'G';
          return val.toFixed(0) + 'M';
        }
      },
      title: {
        offsetCenter: [0, '28%'],
        fontSize: 13,
        color: '#ccc',
        fontWeight: 'bold'
      },
      detail: {
        fontSize: 12,
        offsetCenter: [0, '52%'],
        valueAnimation: true,
        formatter: () => formatRate(value),
        color: 'inherit'
      },
      data: [{ value: Math.min(pct, 100), name: `${label} (${linkSpeedLabel.value})` }]
    }]
  };
};

const downGaugeOption = computed(() => {
  return makeGaugeOption(downRate.value, 'DOWN', '#37a2da');
});

const upGaugeOption = computed(() => {
  return makeGaugeOption(upRate.value, 'UP', '#ffa726');
});

onMounted(() => {
  const pkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
  prevPacketCount = pkts.length;
  // Compute cumulative bytes so far
  const hip = hostIP.value;
  let db = 0, ub = 0;
  for (const pkt of pkts) {
    const len = pkt.length || 0;
    if (hip && pkt.src === hip) ub += len;
    else db += len;
  }
  prevDownBytes = db;
  prevUpBytes = ub;

  bwInterval = setInterval(() => {
    const curPkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
    const hip = hostIP.value;
    // Only process new packets since last tick
    let db = prevDownBytes, ub = prevUpBytes;
    for (let i = prevPacketCount; i < curPkts.length; i++) {
      const pkt = curPkts[i];
      const len = pkt.length || 0;
      if (hip && pkt.src === hip) ub += len;
      else db += len;
    }
    downRate.value = Math.max(0, db - prevDownBytes);
    upRate.value = Math.max(0, ub - prevUpBytes);
    prevDownBytes = db;
    prevUpBytes = ub;
    prevPacketCount = curPkts.length;
  }, 1000);
});

onUnmounted(() => {
  if (bwInterval) clearInterval(bwInterval);
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
    <!-- Bandwidth gauge badge -->
    <div v-if="captureActive" class="bw-badge" @mouseenter="onBwEnter" @mouseleave="onBwLeave">
      <svg class="bw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <span class="bw-label">BW</span>
      <Transition name="bw-dropdown">
        <div v-if="showBwPopup" class="bw-popup">
          <div class="bw-popup-title">Bandwidth Monitor</div>
          <div class="bw-gauges">
            <v-chart class="bw-gauge" :option="downGaugeOption" autoresize />
            <v-chart class="bw-gauge" :option="upGaugeOption" autoresize />
          </div>
        </div>
      </Transition>
    </div>
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

/* Bandwidth gauge badge */
.bw-badge {
  position: absolute;
  left: calc(50% + 130px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  z-index: 10;
  background: linear-gradient(90deg,
    rgba(55, 162, 218, 0.15) 0%,
    rgba(103, 224, 227, 0.25) 25%,
    rgba(255, 167, 38, 0.2) 50%,
    rgba(103, 224, 227, 0.25) 75%,
    rgba(55, 162, 218, 0.15) 100%
  );
  background-size: 200% 100%;
  animation: bw-shimmer 3s linear infinite;
  border: 1px solid rgba(103, 224, 227, 0.3);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.bw-badge:hover {
  border-color: rgba(103, 224, 227, 0.7);
  box-shadow: 0 0 12px rgba(103, 224, 227, 0.3);
}
@keyframes bw-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.bw-icon {
  width: 18px;
  height: 18px;
  color: #67e0e3;
  filter: drop-shadow(0 0 3px rgba(103, 224, 227, 0.5));
}
.bw-label {
  font-size: 11px;
  font-weight: 700;
  color: #67e0e3;
  letter-spacing: 1px;
  text-shadow: 0 0 6px rgba(103, 224, 227, 0.4);
}

/* Dropdown popup */
.bw-popup {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, #1a1d23, #111318);
  border: 1px solid rgba(103, 224, 227, 0.3);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(103, 224, 227, 0.1);
  z-index: 2000;
  width: 580px;
}
.bw-popup::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 12px;
  height: 12px;
  background: #1a1d23;
  border-left: 1px solid rgba(103, 224, 227, 0.3);
  border-top: 1px solid rgba(103, 224, 227, 0.3);
}
.bw-popup-title {
  color: #67e0e3;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}
.bw-gauges {
  display: flex;
  gap: 8px;
}
.bw-gauge {
  width: 270px;
  height: 220px;
}

/* Slide-down transition */
.bw-dropdown-enter-active {
  animation: bw-slide-down 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.bw-dropdown-leave-active {
  animation: bw-slide-down 0.25s cubic-bezier(0.16, 1, 0.3, 1) reverse;
}
@keyframes bw-slide-down {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
    clip-path: inset(0 0 100% 0);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    clip-path: inset(0 0 0 0);
  }
}


</style>
