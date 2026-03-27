<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import '@patternfly/elements/pf-tooltip/pf-tooltip.js';
import { ref, useTemplateRef, computed, getCurrentInstance, watch, onMounted } from 'vue';
import { clearPackets, packets, allPackets, captureActive, stoppedCapture, displayFilter, filterLoading, filterProgress, cancelFilter, savedCapturesCount, apiFetch, apiUrl, fetchInitialData, authUser } from './globals';
import { getSentryConsent, enableSentry, disableSentry } from './sentry';
import './packetCache';  // Initialize packet cache (registers clearer callback)
import { NSpin, NProgress } from 'naive-ui';
import NaiveProvider from './components/NaiveProvider.vue';
import DefaultLayout from './components/layouts/DefaultLayout.vue';
import PacketList from './components/panes/PacketList.vue';
import PacketDetails from './components/panes/PacketDetails.vue';
import PacketBytes from './components/panes/PacketBytes.vue';
import IconRibbon from './components/IconRibbon.vue';
import DisplayFilter from './components/DisplayFilter.vue';
import StatusBar from './components/StatusBar.vue';
import FileBrowser from './components/FileBrowser.vue';
import LoginPage from './components/LoginPage.vue';
import ChangePasswordDialog from './components/ChangePasswordDialog.vue';

// Auth state
const authChecked = ref(false);
const isAuthenticated = ref(false);
const passwordChanged = ref(true); // true = password already changed (no forced change needed)

onMounted(async () => {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    isAuthenticated.value = !!data.authenticated;
    if (data.authenticated) {
      authUser.value = { username: data.username || 'webpcap' };
      passwordChanged.value = !!data.passwordChanged;
    }
  } catch {
    isAuthenticated.value = false;
  }
  authChecked.value = true;
  if (isAuthenticated.value && passwordChanged.value) {
    fetchInitialData();
  }
});

const onLoginSuccess = ({ user, passwordChanged: pwChanged }) => {
  isAuthenticated.value = true;
  authUser.value = { username: user?.username || 'webpcap' };
  passwordChanged.value = !!pwChanged;
  if (pwChanged) {
    fetchInitialData();
    setTimeout(() => { if (window.$message) window.$message.success(`Welcome, ${user?.username || 'webpcap'}`); }, 300);
  }
};

const onPasswordChanged = () => {
  passwordChanged.value = true;
  fetchInitialData();
};

const onSignOut = () => {
  isAuthenticated.value = false;
  passwordChanged.value = true;
  authUser.value = null;
  clearPackets();
};

// Show landing page when no packets and not actively using the app
const showLandingPage = computed(() => packets.value.length === 0 && allPackets.value.length === 0);

// Row height for packet list (used for virtual scrolling)
const rowHeight = ref(20);

// References for file browser
const fileBrowserRef = useTemplateRef('file-browser');
const iconRibbonRef = useTemplateRef('icon-ribbon');

const handleClear = () => {
  clearPackets();
};

const handleStop = () => {
  // Capture stopped
};

const handleOpenFileBrowser = () => {
  fileBrowserRef.value?.open();
};

const handleFileSelect = (filePath) => {
  iconRibbonRef.value?.loadPcapFile(filePath);
};

const handleOpenInsights = () => {
  const insightsWindow = window.open('/insights/', '_blank', 'noopener');
  if (insightsWindow && typeof insightsWindow.focus === 'function') {
    insightsWindow.focus();
  }
};

// Total packet count (from allPackets when filter is active, otherwise from packets)
const totalPacketCount = computed(() => {
  return allPackets.value.length > 0 ? allPackets.value.length : packets.value.length;
});

// Show packet counter only when capturing or has packets
const showPacketCounter = computed(() => {
  return captureActive.value || packets.value.length > 0 || allPackets.value.length > 0;
});

// Sentry consent banner
const showSentryBanner = ref(getSentryConsent() === null);
const app = getCurrentInstance()?.appContext.app;

const onSentryEnable = () => {
  enableSentry(app);
  showSentryBanner.value = false;
};

const onSentryDismiss = () => {
  disableSentry();
  showSentryBanner.value = false;
};

// Saved captures popup
const showSavedCaptures = ref(false);
const savedFiles = ref([]);
const savedCapturesGlow = ref(false);
const sortColumn = ref('created'); // 'name', 'size', 'created'
const sortAsc = ref(false);
const localClientHint = ref(null);

const isLoopbackHostname = () => {
  const hostname = String(window.location.hostname || '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
};

const disableSavedCaptureDownload = computed(() => {
  if (typeof localClientHint.value === 'boolean') return localClientHint.value;
  return isLoopbackHostname();
});

const displayCaptureName = (name) => String(name || '').replace(/\.zst$/i, '');

const applySavedCapturesPayload = (data) => {
  savedFiles.value = data?.files || [];
  if (typeof data?.isLocalClient === 'boolean') {
    localClientHint.value = data.isLocalClient;
  }
};

const sortedFiles = computed(() => {
  const col = sortColumn.value;
  const asc = sortAsc.value;
  return [...savedFiles.value].sort((a, b) => {
    let cmp = 0;
    if (col === 'name') cmp = a.name.localeCompare(b.name);
    else if (col === 'packets') cmp = (a.packets || 0) - (b.packets || 0);
    else if (col === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (col === 'created') cmp = new Date(a.created || 0) - new Date(b.created || 0);
    return asc ? cmp : -cmp;
  });
});

const toggleSort = (col) => {
  if (sortColumn.value === col) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortColumn.value = col;
    sortAsc.value = true;
  }
};

watch(savedCapturesCount, (newVal, oldVal) => {
  if (newVal > oldVal) {
    savedCapturesGlow.value = true;
    setTimeout(() => { savedCapturesGlow.value = false; }, 2000);
  }
});

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const formatTimestamp = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
};

const renamingFile = ref(null);
const renameInput = ref('');

const openSavedCaptures = async () => {
  try {
    const res = await apiFetch('/api/saved-captures');
    const data = await res.json();
    applySavedCapturesPayload(data);
  } catch (e) {
    savedFiles.value = [];
  }
  showSavedCaptures.value = true;
};

const refreshSavedCaptures = async () => {
  try {
    const res = await apiFetch('/api/saved-captures');
    const data = await res.json();
    applySavedCapturesPayload(data);
    savedCapturesCount.value = savedFiles.value.length;
  } catch (e) {}
};

const deleteCapture = async (name) => {
  try {
    await apiFetch('/api/saved-captures/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    await refreshSavedCaptures();
  } catch (e) {}
};

const startRename = (file) => {
  renamingFile.value = file.name;
  renameInput.value = file.name;
};

const confirmRename = async (oldName) => {
  if (!renameInput.value.trim() || renameInput.value === oldName) {
    renamingFile.value = null;
    return;
  }
  try {
    await apiFetch('/api/saved-captures/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName: renameInput.value.trim() })
    });
    await refreshSavedCaptures();
  } catch (e) {}
  renamingFile.value = null;
};

const downloadCapture = (name) => {
  const a = document.createElement('a');
  a.href = apiUrl(`/api/saved-captures/download/${encodeURIComponent(name)}`);
  a.download = name;
  a.click();
};

// Open in Browser
const pendingOpenPath = ref(null);
const showOpenConfirm = ref(false);

const openCaptureRemotely = (filePath) => {
  // If live capture is running (not stopped), warn user
  if (captureActive.value && !stoppedCapture.value) {
    pendingOpenPath.value = filePath;
    showOpenConfirm.value = true;
  } else {
    doOpenCapture(filePath);
  }
};

const doOpenCapture = (filePath) => {
  showSavedCaptures.value = false;
  showOpenConfirm.value = false;
  iconRibbonRef.value?.loadPcapFile(filePath);
};

const confirmOpenYes = () => {
  doOpenCapture(pendingOpenPath.value);
  pendingOpenPath.value = null;
};

const confirmOpenNo = () => {
  showOpenConfirm.value = false;
  pendingOpenPath.value = null;
};
</script>

<template>
  <NaiveProvider>
  <div class="app-layout">
    <!-- Auth gate -->
    <template v-if="!authChecked" />
    <LoginPage v-else-if="!isAuthenticated" @login-success="onLoginSuccess" />
    <ChangePasswordDialog v-else-if="!passwordChanged" :first-run="true" @password-changed="onPasswordChanged" />
    <template v-else>

    <!-- Filter Loading Overlay -->
    <div v-if="filterLoading" class="filter-loading-overlay">
      <div class="filter-loading-popup">
        <n-spin size="large" :stroke-width="14" stroke="#3b82f6">
          <template #description>
            <div class="filter-loading-text">Applying filter...</div>
          </template>
        </n-spin>
        <div v-if="filterProgress > 0" class="filter-progress">
          {{ filterProgress.toLocaleString() }} packets found
        </div>
        <n-progress
          v-if="filterProgress > 0 && allPackets.length > 0"
          type="line"
          :percentage="Math.min(100, Math.round((filterProgress / allPackets.length) * 100))"
          :show-indicator="false"
          :height="4"
          :border-radius="2"
          style="width: 200px; margin-top: 8px;"
        />
        <pf-button variant="secondary" class="filter-cancel-btn" @click="cancelFilter">Cancel</pf-button>
      </div>
    </div>

    <!-- File Browser Modal -->
    <FileBrowser ref="file-browser" @select="handleFileSelect" />

    <!-- Main UI -->
    <div class="main-content">
      <IconRibbon ref="icon-ribbon" :hide-insights="showLandingPage" @clear="handleClear" @stop="handleStop" @openFileBrowser="handleOpenFileBrowser" @openInsights="handleOpenInsights" @sign-out="onSignOut" />
      <DisplayFilter v-if="!showLandingPage" />

      <!-- Landing Page with Interface Selector (teleport target) -->
      <!-- Always render container for Teleport, use v-show to hide -->
      <div class="landing-page" :class="{ 'landing-hidden': !showLandingPage }">
        <div id="interface-selector-container"></div>
        <!-- Sentry consent banner -->
        <div v-if="showSentryBanner && showLandingPage" class="sentry-banner">
          <span class="sentry-banner-text">Help improve WebPCAP — automatically send crash reports to help fix bugs. No personal data is collected.</span>
          <pf-button class="sentry-btn" size="small" @click="onSentryEnable">Enable</pf-button>
          <pf-button variant="secondary" class="sentry-btn" size="small" @click="onSentryDismiss">No thanks</pf-button>
        </div>
      </div>

      <!-- Workspace (shown when packets available or hidden when landing page) -->
      <div class="workspace" :class="{ 'workspace-hidden': showLandingPage }">
        <DefaultLayout
          :style="{
            '--ws-row-height': rowHeight + 'px',
            '--ws-font-size-monospace': '12px',
          }"
        >
          <template #slot1><PacketList /></template>
          <template #slot2><PacketDetails /></template>
          <template #slot3><PacketBytes /></template>
        </DefaultLayout>
      </div>
    </div>

    <!-- Packet Counter (bottom-center) -->
    <div v-if="showPacketCounter" class="packet-counter">
      Packets: {{ totalPacketCount.toLocaleString() }}<template v-if="displayFilter && allPackets.length > 0"> &bull; Displayed: {{ packets.length.toLocaleString() }}</template>
    </div>

    <!-- Saved Captures label -->
    <div v-if="savedCapturesCount > 0 && !showLandingPage" class="saved-captures-label" @click="openSavedCaptures">
      <svg class="sc-folder-icon" :class="{ 'sc-folder-glow': savedCapturesGlow }" viewBox="0 0 24 24" fill="#f59e0b" stroke="#b45309" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Saved Captures ({{ savedCapturesCount }})
    </div>

    <!-- Saved Captures popup -->
    <div v-if="showSavedCaptures" class="saved-captures-overlay" @click.self="showSavedCaptures = false">
      <div class="saved-captures-popup">
        <div class="saved-captures-header">
          <span class="saved-captures-title">Saved Captures</span>
          <span class="saved-captures-count">{{ savedFiles.length }} file{{ savedFiles.length !== 1 ? 's' : '' }}</span>
          <button class="saved-captures-close" @click="showSavedCaptures = false">&times;</button>
        </div>
        <div v-if="savedFiles.length === 0" class="saved-captures-empty">No saved captures</div>
        <div v-else class="saved-captures-table-wrap">
          <table class="saved-captures-table">
            <thead>
              <tr>
                <th class="sc-th-sort" @click="toggleSort('name')">File Name <span class="sc-sort-arrow">{{ sortColumn === 'name' ? (sortAsc ? '▲' : '▼') : '⇅' }}</span></th>
                <th class="sc-th-sort" @click="toggleSort('packets')">#Packets <span class="sc-sort-arrow">{{ sortColumn === 'packets' ? (sortAsc ? '▲' : '▼') : '⇅' }}</span></th>
                <th class="sc-th-sort" @click="toggleSort('size')">Size <span class="sc-sort-arrow">{{ sortColumn === 'size' ? (sortAsc ? '▲' : '▼') : '⇅' }}</span></th>
                <th class="sc-th-sort" @click="toggleSort('created')">Time <span class="sc-sort-arrow">{{ sortColumn === 'created' ? (sortAsc ? '▲' : '▼') : '⇅' }}</span></th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in sortedFiles" :key="file.name">
                <td class="sc-td-name">
                  <template v-if="renamingFile === file.name">
                    <input
                      class="saved-captures-rename-input"
                      v-model="renameInput"
                      @keyup.enter="confirmRename(file.name)"
                      @keyup.escape="renamingFile = null"
                      @blur="confirmRename(file.name)"
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <span class="saved-captures-name" :title="displayCaptureName(file.name)">{{ displayCaptureName(file.name) }}</span>
                  </template>
                </td>
                <td class="sc-td-packets">{{ file.packets ? file.packets.toLocaleString() : '—' }}</td>
                <td class="sc-td-size">{{ formatFileSize(file.size) }}</td>
                <td class="sc-td-time">{{ formatTimestamp(file.created) }}</td>
                <td class="sc-td-action">
                  <div class="saved-captures-actions">
                    <pf-tooltip content="Open in Browser">
                      <button class="sc-action-btn sc-open" @click="openCaptureRemotely(file.path)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </button>
                    </pf-tooltip>
                    <pf-tooltip :content="disableSavedCaptureDownload ? 'Local client: download not needed' : 'Download'">
                      <button
                        class="sc-action-btn sc-download"
                        :class="{ 'sc-action-disabled': disableSavedCaptureDownload }"
                        :disabled="disableSavedCaptureDownload"
                        @click="downloadCapture(file.name)"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </button>
                    </pf-tooltip>
                    <pf-tooltip content="Rename">
                      <button class="sc-action-btn sc-rename" @click="startRename(file)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    </pf-tooltip>
                    <pf-tooltip content="Delete">
                      <button class="sc-action-btn sc-delete" @click="deleteCapture(file.name)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </pf-tooltip>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Open in Browser confirm dialog -->
    <div v-if="showOpenConfirm" class="saved-captures-overlay" @click.self="confirmOpenNo">
      <div class="open-confirm-dialog">
        <div class="open-confirm-title">Open Capture</div>
        <div class="open-confirm-msg">The current live capture will be lost (unsaved data). Continue?</div>
        <div class="open-confirm-actions">
          <pf-button class="open-confirm-btn" @click="confirmOpenYes">Yes, Open</pf-button>
          <pf-button variant="secondary" class="open-confirm-btn" @click="confirmOpenNo">Cancel</pf-button>
        </div>
      </div>
    </div>

    <StatusBar v-if="!showLandingPage" />

    </template><!-- end auth gate -->
  </div>
  </NaiveProvider>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Critical for flex scrolling */
}

.workspace {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: var(--ws-almost-white);
}

.workspace-hidden {
  display: none;
}

.landing-page {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f4fc 0%, #d4e9f7 50%, #c5e0f5 100%);
  min-height: 0;
  overflow: auto;
}

.landing-hidden {
  display: none;
}

/* Filter Loading Overlay */
.filter-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.filter-loading-popup {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 30px 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.filter-loading-text {
  color: #e5e7eb;
  font-size: 16px;
  font-weight: 500;
  margin-top: 12px;
}
.filter-progress {
  color: #9ca3af;
  font-size: 14px;
  font-family: monospace;
  margin-top: 8px;
}
.filter-cancel-btn {
  margin-top: 14px;
  --pf-c-button--FontSize: 14px;
}

/* Packet Counter - bottom edge center */
.packet-counter {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(134, 239, 172, 0.95);  /* Light green/salad */
  color: #166534;  /* Dark green text */
  padding: 3px 20px;
  border-radius: 8px 8px 0 0;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  pointer-events: none;
}

/* Saved Captures label */
.saved-captures-label {
  position: fixed;
  bottom: 2px;
  right: calc(50% - 310px);
  transform: translateX(50%);
  display: flex;
  align-items: center;
  gap: 5px;
  color: #60a5fa;
  font-family: monospace;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  z-index: 1001;
  transition: color 0.15s;
}
.saved-captures-label:hover {
  color: #93c5fd;
  text-decoration: underline;
}
.sc-folder-icon {
  width: 16px;
  height: 16px;
  transition: filter 0.3s;
}
.sc-folder-glow {
  animation: sc-glow-pulse 0.5s ease-in-out 4;
  filter: drop-shadow(0 0 6px #60a5fa);
}
@keyframes sc-glow-pulse {
  0%, 100% { filter: drop-shadow(0 0 2px #60a5fa); transform: scale(1); }
  50% { filter: drop-shadow(0 0 10px #93c5fd) drop-shadow(0 0 20px #60a5fa); transform: scale(1.2); }
}

/* Saved Captures popup */
.saved-captures-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.saved-captures-popup {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px 28px;
  width: min(94vw, 1080px);
  min-width: 760px;
  max-width: 1080px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.saved-captures-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #374151;
}
.saved-captures-title {
  font-size: 20px;
  font-weight: 700;
  color: #f9fafb;
}
.saved-captures-count {
  font-size: 15px;
  color: #6b7280;
  font-family: monospace;
}
.saved-captures-close {
  margin-left: auto;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.saved-captures-close:hover {
  color: #f9fafb;
}
.saved-captures-empty {
  color: #6b7280;
  font-size: 16px;
  text-align: center;
  padding: 24px 0;
  font-style: italic;
}
.saved-captures-table-wrap {
  max-height: 62vh;
  overflow-y: auto;
}
.saved-captures-table {
  width: 100%;
  border-collapse: collapse;
  font-family: monospace;
  font-size: 15px;
}
.saved-captures-table thead th {
  text-align: left;
  color: #d1d5db;
  font-size: 15px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 6px 10px;
  border-bottom: 1px solid #374151;
  user-select: none;
}
.sc-th-sort {
  cursor: pointer;
  transition: color 0.15s;
}
.sc-th-sort:hover {
  color: #60a5fa;
}
.sc-sort-arrow {
  font-size: 16px;
  color: #9ca3af;
  margin-left: 4px;
}
.saved-captures-table tbody tr {
  transition: background 0.15s;
}
.saved-captures-table tbody tr:hover {
  background: #1f2937;
}
.saved-captures-table td {
  padding: 9px 12px;
  border-bottom: 1px solid #1f2937;
  vertical-align: middle;
}
.sc-td-name {
  max-width: 520px;
}
.saved-captures-name {
  color: #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.sc-td-packets {
  color: #60a5fa;
  font-size: 14px;
  white-space: nowrap;
  text-align: right;
}
.sc-td-size {
  color: #9ca3af;
  font-size: 14px;
  white-space: nowrap;
}
.sc-td-time {
  color: #9ca3af;
  font-size: 14px;
  white-space: nowrap;
}
.sc-td-action {
  white-space: nowrap;
}
.saved-captures-rename-input {
  width: 100%;
  background: #1f2937;
  border: 1px solid #3b82f6;
  border-radius: 4px;
  padding: 5px 10px;
  color: #e5e7eb;
  font-family: monospace;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
}
.saved-captures-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sc-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: transparent;
  transition: background 0.15s, transform 0.1s;
}
.sc-action-btn svg {
  width: 18px;
  height: 18px;
}
.sc-action-btn:hover {
  transform: scale(1.1);
}
.sc-action-btn:active {
  transform: scale(0.95);
}
.sc-action-btn:disabled,
.sc-action-disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none !important;
}
.sc-action-btn:disabled:hover {
  background: transparent !important;
}
.sc-open {
  color: #22c55e;
}
.sc-open:hover {
  background: rgba(34, 197, 94, 0.15);
}
.sc-download {
  color: #3b82f6;
}
.sc-download:hover {
  background: rgba(59, 130, 246, 0.15);
}
.sc-rename {
  color: #f59e0b;
}
.sc-rename:hover {
  background: rgba(245, 158, 11, 0.15);
}
.sc-delete {
  color: #ef4444;
}
.sc-delete:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Open confirm dialog */
.open-confirm-dialog {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px;
  min-width: 380px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  text-align: center;
}
.open-confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: #f9fafb;
  margin-bottom: 12px;
}
.open-confirm-msg {
  color: #d1d5db;
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.5;
}
.open-confirm-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.open-confirm-btn {
  --pf-c-button--FontSize: 14px;
  --pf-c-button--FontWeight: 600;
}

/* Sentry consent banner */
.sentry-banner {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(30, 41, 59, 0.95);
  border: 1px solid #374151;
  border-radius: 10px;
  padding: 14px 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  max-width: 780px;
  z-index: 100;
}
.sentry-banner-text {
  color: #d1d5db;
  font-size: 15px;
  line-height: 1.4;
}
.sentry-btn {
  --pf-c-button--FontSize: 12px;
  --pf-c-button--FontWeight: 600;
  white-space: nowrap;
}
</style>
