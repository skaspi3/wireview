<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import '@patternfly/elements/pf-tooltip/pf-tooltip.js';
import { ref, useTemplateRef, computed, getCurrentInstance, watch, onMounted, onBeforeUnmount, h } from 'vue';
import { clearPackets, packets, allPackets, captureActive, stoppedCapture, displayFilter, filterLoading, filterProgress, cancelFilter, savedCapturesCount, apiFetch, apiUrl, fetchInitialData, authUser } from './globals';
import { getSentryConsent, enableSentry, disableSentry } from './sentry';
import './packetCache';  // Initialize packet cache (registers clearer callback)
import { NSpin, NProgress, NDataTable, NIcon, NTooltip } from 'naive-ui';
import { DownloadOutline, CreateOutline, InformationCircleOutline, TrashOutline, OpenOutline } from '@vicons/ionicons5';
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
import ParticlesBackground from './components/ParticlesBackground.vue';

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

const doSignOut = async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  isAuthenticated.value = false;
  passwordChanged.value = true;
  authUser.value = null;
  clearPackets();
};

const onSignOut = () => {
  if (captureActive.value && !stoppedCapture.value && window.$dialog) {
    window.$dialog.warning({
      title: 'Sign Out',
      content: 'A live capture is in progress. Signing out will stop the capture and discard unsaved data. Continue?',
      positiveText: 'Yes, Sign Out',
      negativeText: 'Cancel',
      onPositiveClick: () => { doSignOut(); },
    });
  } else {
    doSignOut();
  }
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

const actionCol = (title, icon, color, clickFn, disabledFn) => ({
  title,
  key: 'act_' + title.toLowerCase(),
  width: 52,
  align: 'center',
  render(row) {
    const dis = disabledFn ? disabledFn(row) : false;
    return h(NTooltip, { trigger: 'hover' }, {
      trigger: () => h('span', {
        class: 'sc-icon-cell' + (dis ? ' sc-icon-disabled' : ''),
        style: `color: ${dis ? '#4b5563' : color}`,
        onClick: dis ? undefined : () => clickFn(row),
      }, [h(NIcon, { size: 22 }, { default: () => h(icon) })]),
      default: () => title,
    });
  },
});

const savedCapturesColumns = computed(() => [
  {
    title: 'File Name',
    key: 'name',
    sorter: (a, b) => a.name.localeCompare(b.name),
    ellipsis: { tooltip: true },
    resizable: true,
    minWidth: 160,
    render(row) {
      if (renamingFile.value === row.name) {
        return h('div', { class: 'sc-rename-row' }, [
          h('input', {
            class: 'saved-captures-rename-input',
            value: renameInput.value,
            autofocus: true,
            onInput: (e) => { renameInput.value = e.target.value; },
            onKeyup: (e) => {
              if (e.key === 'Enter') confirmRename(row.name);
              if (e.key === 'Escape') { renamingFile.value = null; }
            },
            onBlur: () => confirmRename(row.name),
          }),
          h('span', { class: 'sc-rename-ext' }, getFileExtension(row.name)),
        ]);
      }
      return h('span', { class: 'saved-captures-name', title: displayCaptureName(row.name) }, displayCaptureName(row.name));
    },
  },
  {
    title: '#Packets',
    key: 'packets',
    width: 100,
    align: 'right',
    sorter: (a, b) => (a.packets || 0) - (b.packets || 0),
    render(row) {
      return row.packets ? row.packets.toLocaleString() : '—';
    },
  },
  {
    title: 'Size',
    key: 'size',
    width: 100,
    sorter: (a, b) => (a.size || 0) - (b.size || 0),
    render(row) {
      return formatFileSize(row.size);
    },
  },
  {
    title: 'Time',
    key: 'created',
    width: 170,
    defaultSortOrder: 'descend',
    sorter: (a, b) => new Date(a.created || 0) - new Date(b.created || 0),
    render(row) {
      return formatTimestamp(row.created);
    },
  },
  {
    title: 'Status',
    key: 'status',
    width: 80,
    align: 'center',
    sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
    render(row) {
      if (row.status === 'OK') return h('span', { style: 'color:#22c55e;font-weight:700' }, 'OK');
      if (row.status === 'WARN') return h('span', { style: 'color:#f59e0b;font-weight:700;font-size:16px' }, '\u26A0');
      if (row.status === 'BAD') return h('span', { style: 'color:#ef4444;font-weight:700' }, 'BAD');
      if (checkingStatus.value === row.name) return h('span', { style: 'color:#9ca3af;font-size:13px' }, '...');
      return h('a', {
        href: '#',
        style: 'color:#60a5fa;font-size:13px;text-decoration:none;cursor:pointer',
        onClick: (e) => { e.preventDefault(); checkFileStatus(row.name); },
        onMouseover: (e) => { e.target.style.textDecoration = 'underline'; },
        onMouseout: (e) => { e.target.style.textDecoration = 'none'; },
      }, 'Check');
    },
  },
  actionCol('Open', OpenOutline, '#22c55e', (row) => openCaptureRemotely(row.path)),
  actionCol('Download', DownloadOutline, '#3b82f6', (row) => downloadCapture(row.name)),
  actionCol('Info', InformationCircleOutline, '#06b6d4', (row) => fetchFileInfo(row.name), (row) => fileInfoLoading.value === row.name),
  actionCol('Rename', CreateOutline, '#f59e0b', (row) => startRename(row)),
  actionCol('Delete', TrashOutline, '#ef4444', (row) => deleteCapture(row.name)),
]);

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

const fileInfoLoading = ref(null);
const fileInfoData = ref(null);
const showFileInfo = ref(false);

const fetchFileInfo = async (name) => {
  fileInfoLoading.value = name;
  try {
    const res = await apiFetch(`/api/saved-captures/info?file=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (data.error) {
      if (window.$message) window.$message.error(data.error);
    } else {
      fileInfoData.value = data;
      showFileInfo.value = true;
      refreshSavedCaptures();
    }
  } catch (e) {
    if (window.$message) window.$message.error('Failed to fetch file info');
  }
  fileInfoLoading.value = null;
};

const checkingStatus = ref(null);
const checkFileStatus = async (name) => {
  checkingStatus.value = name;
  try {
    const res = await apiFetch(`/api/saved-captures/info?file=${encodeURIComponent(name)}`);
    const data = await res.json();
    if (data.error) {
      if (window.$message) window.$message.error(data.error);
    } else {
      refreshSavedCaptures();
    }
  } catch (e) {
    if (window.$message) window.$message.error('Status check failed');
  }
  checkingStatus.value = null;
};

const fixingCapture = ref(false);
const fixTruncatedCapture = async () => {
  if (!fileInfoData.value) return;
  fixingCapture.value = true;
  try {
    const res = await apiFetch('/api/saved-captures/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fileInfoData.value.fileName }),
    });
    const data = await res.json();
    if (data.error) {
      if (window.$message) window.$message.error(data.error);
    } else {
      if (window.$message) window.$message.success('File repaired');
      // Re-run info to refresh modal data
      await fetchFileInfo(fileInfoData.value.fileName);
    }
  } catch (e) {
    if (window.$message) window.$message.error('Repair failed');
  }
  fixingCapture.value = false;
};

const renamingFile = ref(null);
const renameInput = ref('');

const openSavedCaptures = async () => {
  try {
    const res = await apiFetch('/api/saved-captures');
    const data = await res.json();
    applySavedCapturesPayload(data);
    savedCapturesCount.value = savedFiles.value.length;
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

const clearAllCaptures = () => {
  if (!window.$dialog) return;
  window.$dialog.warning({
    title: 'Clear All Captures',
    content: `Delete all ${savedFiles.value.length} saved capture${savedFiles.value.length !== 1 ? 's' : ''}? This cannot be undone.`,
    positiveText: 'Yes, Delete All',
    negativeText: 'Cancel',
    onPositiveClick: async () => {
      try {
        await apiFetch('/api/saved-captures/clear-all', { method: 'POST' });
        await refreshSavedCaptures();
        if (window.$message) window.$message.success('All captures deleted');
      } catch (e) {
        if (window.$message) window.$message.error('Failed to clear captures');
      }
    },
  });
};



const getFileExtension = (name) => {
  const s = String(name || '');
  const m = s.match(/(\.pcapng\.zst|\.pcap\.zst|\.pcapng|\.pcap|\.cap)$/i);
  return m ? m[1] : '';
};
const getFileBaseName = (name) => {
  const ext = getFileExtension(name);
  return ext ? String(name).slice(0, -ext.length) : String(name);
};

const startRename = (file) => {
  renamingFile.value = file.name;
  renameInput.value = getFileBaseName(file.name);
};

const confirmRename = async (oldName) => {
  const base = renameInput.value.trim();
  const ext = getFileExtension(oldName);
  const newName = base + ext;
  if (!base || newName === oldName) {
    renamingFile.value = null;
    return;
  }
  try {
    await apiFetch('/api/saved-captures/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName })
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
const doOpenCapture = (filePath) => {
  showSavedCaptures.value = false;
  iconRibbonRef.value?.loadPcapFile(filePath);
};

const openCaptureRemotely = (filePath) => {
  // If live capture is running (not stopped), warn user
  if (captureActive.value && !stoppedCapture.value) {
    if (!window.$dialog) return;
    window.$dialog.warning({
      title: 'Open Capture',
      content: 'The current live capture will be lost (unsaved data). Continue?',
      positiveText: 'Yes, Open',
      negativeText: 'Cancel',
      onPositiveClick: () => { doOpenCapture(filePath); },
    });
  } else {
    doOpenCapture(filePath);
  }
};

// Warn on browser reload/close during live capture
const beforeUnloadHandler = (e) => {
  if (captureActive.value && !stoppedCapture.value) {
    e.preventDefault();
    e.returnValue = '';
  }
};
window.addEventListener('beforeunload', beforeUnloadHandler);
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
});
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
      <IconRibbon ref="icon-ribbon" @clear="handleClear" @stop="handleStop" @openFileBrowser="handleOpenFileBrowser" @sign-out="onSignOut" />
      <DisplayFilter v-if="!showLandingPage" />

      <!-- Landing Page with Interface Selector (teleport target) -->
      <!-- Always render container for Teleport, use v-show to hide -->
      <div class="landing-page" :class="{ 'landing-hidden': !showLandingPage }">
        <ParticlesBackground v-if="showLandingPage" id="landing-particles" color="#94a3b8" link-color="#94a3b8" :count="70" :speed="0.8" :link-distance="160" :opacity="0.35" />
        <div id="interface-selector-container" class="landing-content"></div>
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
          <div class="sc-header-actions">
            <button v-if="savedFiles.length > 0" class="sc-header-link sc-clear-link" @click="clearAllCaptures">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Clear All
            </button>
          </div>
          <button class="saved-captures-close" @click="showSavedCaptures = false">&times;</button>
        </div>
        <div v-if="savedFiles.length === 0" class="saved-captures-empty">No saved captures</div>
        <n-data-table
          v-else
          :columns="savedCapturesColumns"
          :data="savedFiles"
          :row-key="(row) => row.name"
          :max-height="'62vh'"
          :scroll-x="950"
          size="small"
          class="sc-data-table"
        />
      </div>
    </div>

    <!-- File Info modal -->
    <div v-if="showFileInfo && fileInfoData" class="saved-captures-overlay" @click.self="showFileInfo = false">
      <div class="file-info-popup">
        <button class="fi-close-btn" @click="showFileInfo = false">&times;</button>
        <div class="saved-captures-header">
          <span class="saved-captures-title">File Info</span>
          <span class="saved-captures-count">{{ fileInfoData.fileName }}</span>
        </div>
        <div class="file-info-body">
          <table class="file-info-meta">
            <tbody>
              <tr v-if="fileInfoData.magic"><td class="fi-label">Magic</td><td class="fi-value fi-mono">{{ fileInfoData.magic }} <span class="fi-dim">({{ fileInfoData.magicDesc }})</span></td></tr>
              <tr><td class="fi-label">Format</td><td class="fi-value">{{ fileInfoData.format || '—' }}</td></tr>
              <tr v-if="fileInfoData.version"><td class="fi-label">Version</td><td class="fi-value">{{ fileInfoData.version }}</td></tr>
              <tr v-if="fileInfoData.thiszone"><td class="fi-label">Timezone</td><td class="fi-value fi-mono">{{ fileInfoData.thiszone }}</td></tr>
              <tr v-if="fileInfoData.sigfigs"><td class="fi-label">Sigfigs</td><td class="fi-value fi-mono">{{ fileInfoData.sigfigs }}</td></tr>
              <tr><td class="fi-label">File Size</td><td class="fi-value">{{ formatFileSize(fileInfoData.fileSize || 0) }}<span v-if="fileInfoData.compressedSize" class="fi-dim"> ({{ formatFileSize(fileInfoData.compressedSize) }} on disk, zstd)</span></td></tr>
              <tr><td class="fi-label">Snap Length</td><td class="fi-value">{{ fileInfoData.snaplen?.toLocaleString() }}</td></tr>
              <tr><td class="fi-label">Link Type</td><td class="fi-value">{{ fileInfoData.linktypeDesc }} ({{ fileInfoData.linktype }})</td></tr>
              <tr><td class="fi-label">Total Packets</td><td class="fi-value">{{ fileInfoData.totalPackets?.toLocaleString() }}</td></tr>
              <tr><td class="fi-label">Result</td><td class="fi-value"><span :class="fileInfoData.badPackets > 0 ? 'fi-bad' : fileInfoData.warnPackets > 0 ? 'fi-warn' : 'fi-ok'">{{ fileInfoData.badPackets > 0 ? 'BAD' : fileInfoData.warnPackets > 0 ? 'WARN' : 'OK' }}</span><span v-if="fileInfoData.badPackets > 0" class="fi-bad-count"> — {{ fileInfoData.badPackets.toLocaleString() }} error{{ fileInfoData.badPackets !== 1 ? 's' : '' }}</span><span v-if="fileInfoData.warnPackets > 0" class="fi-warn-count"> — {{ fileInfoData.warnPackets.toLocaleString() }} warning{{ fileInfoData.warnPackets !== 1 ? 's' : '' }}</span></td></tr>
              <tr v-if="fileInfoData.compressed"><td class="fi-label">Compressed</td><td class="fi-value">zstd</td></tr>
              <tr v-if="fileInfoData.loopError"><td class="fi-label">Read Error</td><td class="fi-value fi-bad">{{ fileInfoData.loopError }} <button v-if="fileInfoData.loopError.toLowerCase().includes('truncat')" class="fi-fix-btn" :disabled="fixingCapture" @click="fixTruncatedCapture">{{ fixingCapture ? 'Fixing...' : 'Fix' }}</button></td></tr>
            </tbody>
          </table>
          <div v-if="fileInfoData.packets && fileInfoData.packets.length > 0" class="fi-packets-section">
            <div class="fi-packets-title">Packets ({{ fileInfoData.totalPackets?.toLocaleString() }}{{ fileInfoData.packetsTruncated ? ' — showing first ' + fileInfoData.packets.length.toLocaleString() : '' }})</div>
            <div class="fi-packets-wrap">
              <table class="fi-packets-table">
                <thead>
                  <tr>
                    <th>Packet</th>
                    <th>OrigLen</th>
                    <th>CapLen</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pkt in fileInfoData.packets" :key="pkt.n" :class="{ 'fi-row-bad': pkt.sev === 'b', 'fi-row-warn': pkt.sev === 'w' }">
                    <td>{{ pkt.n }}</td>
                    <td>{{ pkt.ol }}</td>
                    <td>{{ pkt.cl }}</td>
                    <td><span :class="pkt.sev === 'b' ? 'fi-bad' : pkt.sev === 'w' ? 'fi-warn' : 'fi-ok'">{{ pkt.sev === 'b' ? 'BAD' : pkt.sev === 'w' ? 'WARN' : 'OK' }}</span><span v-if="pkt.msg" class="fi-bad-reason"> {{ pkt.msg }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
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
  background: #f5f7fa;
  min-height: 0;
  overflow: auto;
  position: relative;
}
.landing-content {
  position: relative;
  z-index: 1;
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
  bottom: 0;
  right: calc(50% - 310px);
  transform: translateX(50%);
  display: flex;
  align-items: center;
  gap: 5px;
  height: 22px;
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
  z-index: 1500;
}
.saved-captures-popup {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px 28px;
  width: min(96vw, 1200px);
  min-width: 860px;
  max-width: 1200px;
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
.sc-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}
.sc-header-link {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  font-family: monospace;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}
.sc-header-link svg {
  width: 15px;
  height: 15px;
}
.sc-header-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sc-clear-link {
  color: #ef4444;
}
.sc-clear-link:hover {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}
.saved-captures-close {
  margin-left: 12px;
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
.saved-captures-name {
  color: #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.sc-data-table {
  font-family: monospace;
  font-size: 14px;
  --n-th-color: transparent;
  --n-td-color: transparent;
  --n-th-color-hover: transparent;
  --n-td-color-hover: #1f293780;
  --n-border-color: #1f2937;
  --n-th-text-color: #d1d5db;
  --n-td-text-color: #c0c6d0;
  --n-th-font-weight: 600;
}
.sc-rename-row {
  display: flex;
  align-items: center;
}
.saved-captures-rename-input {
  flex: 1;
  min-width: 0;
  background: #1f2937;
  border: 1px solid #3b82f6;
  border-radius: 4px 0 0 4px;
  padding: 5px 10px;
  color: #e5e7eb;
  font-family: monospace;
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
}
.sc-rename-ext {
  background: #111827;
  border: 1px solid #3b82f6;
  border-left: none;
  border-radius: 0 4px 4px 0;
  padding: 5px 8px;
  color: #6b7280;
  font-family: monospace;
  font-size: 15px;
  white-space: nowrap;
  user-select: none;
}
.sc-icon-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.1s, background 0.15s;
}
.sc-icon-cell:hover {
  transform: scale(1.2);
  background: rgba(255, 255, 255, 0.08);
}
.sc-icon-cell:active {
  transform: scale(0.9);
}
.sc-icon-disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}
.sc-data-table :deep(.n-data-table-th) {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sc-data-table :deep(.n-data-table-td) {
  padding: 10px 12px;
}

/* File Info modal */
.fi-close-btn {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 32px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  z-index: 2;
  transition: color 0.15s;
}
.fi-close-btn:hover {
  color: #f9fafb;
}
.file-info-popup {
  position: relative;
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px 28px;
  width: min(92vw, 680px);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.file-info-body {
  overflow-y: auto;
  max-height: 70vh;
}
.file-info-meta {
  width: 100%;
  border-collapse: collapse;
  font-family: monospace;
  font-size: 14px;
}
.file-info-meta td {
  padding: 6px 12px;
  border-bottom: 1px solid #1f2937;
}
.fi-label {
  color: #9ca3af;
  width: 140px;
  white-space: nowrap;
  font-weight: 600;
}
.fi-value {
  color: #e5e7eb;
}
.fi-ok {
  color: #22c55e;
  font-weight: 700;
}
.fi-warn {
  color: #f59e0b;
  font-weight: 700;
}
.fi-bad {
  color: #ef4444;
  font-weight: 700;
}
.fi-bad-count {
  color: #9ca3af;
  font-weight: 400;
}
.fi-warn-count {
  color: #9ca3af;
  font-weight: 400;
}
.fi-mono {
  font-family: monospace;
  letter-spacing: 0.5px;
}
.fi-dim {
  color: #6b7280;
}
.fi-packets-section {
  margin-top: 16px;
}
.fi-packets-title {
  color: #60a5fa;
  font-size: 14px;
  font-weight: 700;
  font-family: monospace;
  margin-bottom: 8px;
}
.fi-packets-wrap {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid #374151;
  border-radius: 6px;
}
.fi-packets-table {
  width: 100%;
  border-collapse: collapse;
  font-family: monospace;
  font-size: 13px;
}
.fi-packets-table thead th {
  text-align: left;
  color: #d1d5db;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 5px 10px;
  border-bottom: 1px solid #374151;
  background: #111318;
  position: sticky;
  top: 0;
  z-index: 1;
}
.fi-packets-table tbody td {
  padding: 3px 10px;
  border-bottom: 1px solid #1f2937;
  color: #e5e7eb;
}
.fi-packets-table tbody tr:hover {
  background: #1f2937;
}
.fi-row-bad {
  background: rgba(239, 68, 68, 0.06);
}
.fi-row-warn {
  background: rgba(245, 158, 11, 0.06);
}
.fi-bad-reason {
  color: #9ca3af;
  font-size: 12px;
  margin-left: 6px;
}
.fi-fix-btn {
  margin-left: 10px;
  background: #b45309;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  vertical-align: middle;
}
.fi-fix-btn:hover:not(:disabled) {
  background: #d97706;
}
.fi-fix-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
