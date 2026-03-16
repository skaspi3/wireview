<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { packets, allPackets, nodeVersion, tsharkLuaVersion, tsharkLibraries, backendStatus, backendPort, certInfo, displayFilter, bytesReceived, bytesFetched, pcapDirUsage, appVersion, wsEventLog, captureIncludePort443 } from "../globals";
import GitHubIcon from "./icons/GitHubIcon.vue";

const showFilterPopup = ref(false);
const showCertPopup = ref(false);
const showReleaseNotes = ref(false);
const showNotices = ref(false);
const showFeedback = ref(false);
const showBackendPopup = ref(false);
const showLedPopup = ref(false);
const showThinClientPopup = ref(false);
const showWssPopup = ref(false);
const showActionsMenu = ref(false);
const cveScanState = ref('idle');
const cveScanError = ref('');
const cveScanReport = ref(null);
const wssEvents = computed(() => wsEventLog.value);

const OSV_QUERY_URL = 'https://api.osv.dev/v1/query';
const NVD_CVE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const DONATE_URL = (import.meta.env.VITE_DONATE_URL || 'https://github.com/sponsors/skaspi3').trim();
const DONATE_LABEL = (import.meta.env.VITE_DONATE_LABEL || 'Donate $5').trim();

const backendNoticePackages = [
  { name: 'ws', version: '8.18.3', license: 'MIT', url: 'https://www.npmjs.com/package/ws', ecosystem: 'npm' },
  { name: '@mongodb-js/zstd', version: '7.0', license: 'Apache-2.0', url: 'https://www.npmjs.com/package/@mongodb-js/zstd', ecosystem: 'npm' },
  { name: 'dotenv', version: '17.3.1', license: 'BSD-2-Clause', url: 'https://www.npmjs.com/package/dotenv', ecosystem: 'npm' },
];

const frontendNoticePackages = [
  { name: 'vue', version: '3.5.18', license: 'MIT', url: 'https://www.npmjs.com/package/vue', ecosystem: 'npm' },
  { name: '@vueuse/core', version: '14.2.1', license: 'MIT', url: 'https://www.npmjs.com/package/@vueuse/core', ecosystem: 'npm' },
  { name: 'fzstd', version: '0.1', license: 'MIT', url: 'https://www.npmjs.com/package/fzstd', ecosystem: 'npm' },
  { name: 'vite', version: '6.4.1', license: 'MIT', url: 'https://www.npmjs.com/package/vite', ecosystem: 'npm' },
  { name: '@vitejs/plugin-vue', version: '5.2.4', license: 'MIT', url: 'https://www.npmjs.com/package/@vitejs/plugin-vue', ecosystem: 'npm' },
];

const allNoticePackages = computed(() => [...backendNoticePackages, ...frontendNoticePackages]);

const withTimeoutFetch = async (url, init = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const extractCveAliases = (osvVuln) => {
  const aliases = Array.isArray(osvVuln.aliases) ? [...osvVuln.aliases] : [];
  if (osvVuln.id && osvVuln.id.startsWith('CVE-') && !aliases.includes(osvVuln.id)) {
    aliases.push(osvVuln.id);
  }
  return aliases.filter((id) => id.startsWith('CVE-'));
};

const pickNvdCvss = (nvdVuln) => {
  const metrics = nvdVuln?.cve?.metrics || {};
  return (
    metrics.cvssMetricV31?.[0]?.cvssData ||
    metrics.cvssMetricV30?.[0]?.cvssData ||
    metrics.cvssMetricV2?.[0]?.cvssData ||
    null
  );
};

const queryOsv = async (pkg) => {
  return await withTimeoutFetch(OSV_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package: { ecosystem: pkg.ecosystem, name: pkg.name },
      version: pkg.version,
    }),
  });
};

const queryNvdByCveId = async (cveId) => {
  const data = await withTimeoutFetch(`${NVD_CVE_URL}?cveId=${encodeURIComponent(cveId)}`);
  const vuln = Array.isArray(data.vulnerabilities) ? data.vulnerabilities[0] : null;
  if (!vuln) return null;

  const cvss = pickNvdCvss(vuln);
  return {
    cveId,
    published: vuln.cve?.published || null,
    severity: cvss?.baseSeverity || null,
    score: cvss?.baseScore ?? null,
  };
};

const formatScanDate = (isoDate) => {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleString();
  } catch {
    return isoDate;
  }
};

const packageScanStatus = (pkgResult) => {
  if (pkgResult.error) return 'Error';
  if ((pkgResult.cves?.length || 0) > 0 || (pkgResult.osvCount || 0) > 0) return 'Affected';
  return 'No known CVEs';
};

const packageScanStatusClass = (pkgResult) => {
  const status = packageScanStatus(pkgResult);
  if (status === 'Affected') return 'affected';
  if (status === 'Error') return 'error';
  return 'ok';
};

const packageTopSeverity = (pkgResult) => {
  if (pkgResult.error) return 'Error';
  if (!pkgResult.nvd || pkgResult.nvd.length === 0) return '—';

  const rank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  let top = null;
  for (const finding of pkgResult.nvd) {
    if (!finding || !finding.severity) continue;
    if (!top || (rank[finding.severity] || 0) > (rank[top.severity] || 0)) {
      top = finding;
    }
  }

  if (!top) return 'No CVSS';
  return top.score !== null ? `${top.severity} (${top.score})` : top.severity;
};

const downloadCveReport = () => {
  if (!cveScanReport.value) return;
  const content = JSON.stringify(cveScanReport.value, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `client-cve-scan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const runBrowserCveScan = async () => {
  if (cveScanState.value === 'running') return;

  cveScanState.value = 'running';
  cveScanError.value = '';
  cveScanReport.value = null;

  const nvdCache = new Map();
  const packageResults = [];

  for (const pkg of allNoticePackages.value) {
    try {
      const osv = await queryOsv(pkg);
      const osvVulns = Array.isArray(osv.vulns) ? osv.vulns : [];
      const cves = [...new Set(osvVulns.flatMap(extractCveAliases))];
      const nvd = [];

      for (const cveId of cves) {
        if (!nvdCache.has(cveId)) {
          try {
            nvdCache.set(cveId, await queryNvdByCveId(cveId));
          } catch (e) {
            nvdCache.set(cveId, { cveId, error: e.message, severity: null, score: null });
          }
        }
        nvd.push(nvdCache.get(cveId));
      }

      packageResults.push({
        name: pkg.name,
        version: pkg.version,
        osvCount: osvVulns.length,
        osvIds: osvVulns.map((v) => v.id).filter(Boolean),
        cves,
        nvd,
        error: null,
      });
    } catch (e) {
      packageResults.push({
        name: pkg.name,
        version: pkg.version,
        osvCount: 0,
        osvIds: [],
        cves: [],
        nvd: [],
        error: e.message,
      });
    }
  }

  const totals = {
    packageCount: packageResults.length,
    vulnerablePackages: packageResults.filter((pkg) => pkg.cves.length > 0 || pkg.osvCount > 0).length,
    cveCount: packageResults.reduce((sum, pkg) => sum + pkg.cves.length, 0),
    queryErrors: packageResults.filter((pkg) => Boolean(pkg.error)).length,
  };

  cveScanReport.value = {
    generatedAt: new Date().toISOString(),
    sources: { osv: OSV_QUERY_URL, nvd: NVD_CVE_URL },
    totals,
    packages: packageResults,
  };

  cveScanState.value = 'done';
  if (totals.queryErrors > 0) {
    cveScanError.value = 'Some API queries failed (network/CORS/rate-limit). See table rows marked Error.';
  }
};

// Removed system stats - no longer needed for Go backend

// Reduction ratio - updated periodically
const reductionRatio = ref(0);

const updateReductionRatio = () => {
  // Calculate reduction ratio
  const pkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
  const observed = pkts.reduce((sum, pkt) => sum + (pkt.length || 0), 0);
  if (observed === 0) {
    reductionRatio.value = 0;
  } else {
    const transferred = bytesReceived.value + bytesFetched.value;
    const ratio = (observed - transferred) / observed;
    reductionRatio.value = Math.max(0, Math.min(100, ratio * 100));
  }
};

const backendCapturePort = computed(() => Number(backendPort.value) || 3000);

// BPF filter explanation (matches backend/server.js)
const bpfFilter = computed(() => {
  const excluded = [
    { port: backendCapturePort.value, description: "Backend WebSocket" },
    { port: 22, description: "SSH" },
  ];
  if (!captureIncludePort443.value) {
    excluded.push({ port: 443, description: "HTTPS" });
  }
  excluded.push({ range: "169.254.0.0/16", description: "Link-local addresses" });

  const rawParts = [
    `not port ${backendCapturePort.value}`,
    'not port 22',
    ...(captureIncludePort443.value ? [] : ['not port 443']),
    'not net 169.254.0.0/16',
  ];

  return {
    raw: rawParts.join(' and '),
    excluded,
  };
});

// Total packets count (from allPackets when filter is active, otherwise from packets)
const totalPackets = computed(() => {
  if (displayFilter.value && allPackets.value.length > 0) {
    return allPackets.value.length;
  }
  return packets.value.length;
});

// Displayed packets count (filtered)
const displayedPackets = computed(() => {
  return packets.value.length;
});

const statsInfo = computed(() => {
  const count = totalPackets.value;
  if (count === 0) return 'No Packets';
  return `Packets: ${count.toLocaleString()}`;
});

const displayedInfo = computed(() => {
  if (!displayFilter.value) return null;
  return `Displayed: ${displayedPackets.value.toLocaleString()}`;
});

const reductionRatioRounded = computed(() => Math.round(reductionRatio.value * 10) / 10);
const showThinClientBadge = computed(() => reductionRatioRounded.value > 0);

const toggleActionsMenu = () => {
  showActionsMenu.value = !showActionsMenu.value;
};

const closeActionsMenu = () => {
  showActionsMenu.value = false;
};

const openFeedback = () => {
  closeActionsMenu();
  showFeedback.value = true;
};

const openReleaseNotes = () => {
  closeActionsMenu();
  showReleaseNotes.value = true;
};

const openNotices = () => {
  closeActionsMenu();
  showNotices.value = true;
};

const openExcludedTraffic = () => {
  closeActionsMenu();
  showFilterPopup.value = true;
};

const onDocumentClick = () => closeActionsMenu();

const totalCapturedBytes = computed(() => {
  const pkts = allPackets.value.length > 0 ? allPackets.value : packets.value;
  return pkts.reduce((sum, pkt) => sum + (pkt.length || 0), 0);
});

// Update reduction ratio periodically
let reductionRatioInterval = null;

const formatBytes = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

const pcapDirUsageRowClass = computed(() => {
  const level = pcapDirUsage.value?.level || 'ok';
  if (level === 'exhausted' || level === 'critical') return 'pcap-dir-critical';
  if (level === 'warning') return 'pcap-dir-warning';
  return '';
});

const pcapDirUsageHint = computed(() => {
  const usage = pcapDirUsage.value;
  if (!usage) return '';
  if (usage.level === 'exhausted') return 'capture auto-stop threshold reached';
  if (usage.level === 'critical') return 'new captures blocked';
  if (usage.level === 'warning') return 'capture RAM running high';
  return '';
});

const pcapDirBadgeClass = computed(() => {
  const level = pcapDirUsage.value?.level || 'ok';
  if (level === 'exhausted' || level === 'critical') return 'pcap-dir-badge-critical';
  if (level === 'warning') return 'pcap-dir-badge-warning';
  return '';
});

onMounted(() => {
  updateReductionRatio();
  reductionRatioInterval = setInterval(updateReductionRatio, 1000);
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  if (reductionRatioInterval) clearInterval(reductionRatioInterval);
  document.removeEventListener('click', onDocumentClick);
});

const statusTitle = computed(() => {
  switch (backendStatus.value) {
    case 'connected': return 'Backend connected (thin-client mode)';
    case 'connecting': return 'Connecting to backend...';
    default: return 'Backend disconnected';
  }
});


// Format bytes for memory display
const formatMemory = (bytes) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Parse certificate subject/issuer into readable key-value pairs
const parseCertField = (field) => {
  if (!field) return [];
  // Format: "CN = example.com, O = Org, C = US" or similar
  const parts = field.split(/,\s*(?=[A-Z]+\s*=)/);
  return parts.map(part => {
    const match = part.match(/^\s*([A-Za-z]+)\s*=\s*(.+?)\s*$/);
    if (match) {
      const labels = {
        'CN': 'Common Name',
        'O': 'Organization',
        'OU': 'Org Unit',
        'C': 'Country',
        'ST': 'State',
        'L': 'Locality',
        'emailAddress': 'Email'
      };
      return { key: labels[match[1]] || match[1], value: match[2] };
    }
    return null;
  }).filter(Boolean);
};

const certSubject = computed(() => parseCertField(certInfo.value?.subject));
const certIssuer = computed(() => parseCertField(certInfo.value?.issuer));

// Format date for display
const formatCertDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

// Check if certificate is self-signed
const isSelfSigned = computed(() => {
  if (!certInfo.value) return false;
  return certInfo.value.subject === certInfo.value.issuer;
});

// Check if certificate is expired
const isExpired = computed(() => {
  if (!certInfo.value?.validTo) return false;
  return new Date(certInfo.value.validTo) < new Date();
});

// Certificate is fully valid: not self-signed and not expired
const isCertValid = computed(() => {
  if (!certInfo.value) return false;
  return !isSelfSigned.value && !isExpired.value;
});
</script>
<template>
  <div class="status-bar">
    <div class="left-section">
      <div class="app-actions-group" @click.stop>
        <button
          class="app-actions-trigger"
          @click.stop="toggleActionsMenu"
          aria-label="Open quick actions menu"
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
        <Transition name="actions-slide-up">
          <div v-if="showActionsMenu" class="app-actions-menu" @click.stop>
            <button class="app-actions-item" @click="openFeedback">Feedback</button>
            <button class="app-actions-item" @click="openReleaseNotes">Changelog</button>
            <button class="app-actions-item" @click="openNotices">3-rd Party Libs</button>
            <button class="app-actions-item" @click="openExcludedTraffic">Excluded Traffic</button>
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

      <!-- Release Notes Popup -->
      <div v-if="showReleaseNotes" class="release-overlay" @click.self="showReleaseNotes = false">
        <div class="release-popup changelog-popup">
          <div class="release-header">
            <span class="release-title">WebPCAP</span>
            <span class="release-ver">{{ appVersion }}</span>
            <button class="release-close" @click="showReleaseNotes = false">&times;</button>
          </div>
          <ul class="release-list">
            <li>Live packet capture with tshark — real-time streaming via WebSocket</li>
            <li>Thin Client architecture — zstd-compressed packet delivery with up to 95% bandwidth reduction</li>
            <li>Display filters — apply Wireshark-compatible filters during live or stopped capture</li>
            <li>Session sharing — invite viewers to watch your capture in real-time</li>
            <li>Capture Insights — proxied ntopng visibility for interfaces started with ntopng Analyze</li>
            <li>Save &amp; export — pcapng with optional zstd compression, filtered or full capture</li>
            <li>RAM-backed storage — pcap files written to tmpfs for minimal disk I/O</li>
            <li>Idle kill-switch — auto-stops capture after inactivity to protect system resources</li>
            <li>File browser — load and analyze existing pcap/pcapng files from the server</li>
            <li>Custom Lua dissector support for proprietary protocol analysis</li>
          </ul>
        </div>
      </div>

      <!-- Open Source Notices Popup -->
      <div v-if="showNotices" class="release-overlay" @click.self="showNotices = false">
        <div class="notices-popup">
          <div class="release-header">
            <span class="release-title">3-rd Party Libs</span>
            <button class="release-close" @click="showNotices = false">&times;</button>
          </div>
          <div class="cve-scan-panel">
            <div class="cve-scan-actions">
              <button class="cve-scan-btn" :disabled="cveScanState === 'running'" @click="runBrowserCveScan">
                {{ cveScanState === 'running' ? 'Scanning CVEs...' : 'Run CVE Scan (Browser)' }}
              </button>
              <button v-if="cveScanReport" class="cve-scan-btn secondary" @click="downloadCveReport">
                Download JSON
              </button>
            </div>
            <div class="cve-scan-meta">
              Runs in your browser against OSV + NVD APIs (no backend proxy).
            </div>
            <div v-if="cveScanError" class="cve-scan-error">{{ cveScanError }}</div>
            <div v-if="cveScanReport" class="cve-scan-summary">
              <span>Scanned: {{ cveScanReport.totals.packageCount }}</span>
              <span>Affected: {{ cveScanReport.totals.vulnerablePackages }}</span>
              <span>CVEs: {{ cveScanReport.totals.cveCount }}</span>
              <span>Errors: {{ cveScanReport.totals.queryErrors }}</span>
              <span>At: {{ formatScanDate(cveScanReport.generatedAt) }}</span>
            </div>
          </div>
          <div class="notices-content">
            <div v-if="cveScanReport" class="notices-section">
              <div class="notices-section-title">Live CVE Scan Results</div>
              <table class="notices-table cve-results-table">
                <thead><tr><th>Package</th><th>Version</th><th>Status</th><th>CVEs</th><th>Top NVD Severity</th></tr></thead>
                <tbody>
                  <tr v-for="pkg in cveScanReport.packages" :key="`scan-${pkg.name}`">
                    <td>{{ pkg.name }}</td>
                    <td>{{ pkg.version }}</td>
                    <td :class="['scan-status', packageScanStatusClass(pkg)]">{{ packageScanStatus(pkg) }}</td>
                    <td>{{ pkg.cves.length > 0 ? pkg.cves.join(', ') : '—' }}</td>
                    <td>{{ packageTopSeverity(pkg) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="notices-section">
              <div class="notices-section-title">Backend (Node.js)</div>
              <table class="notices-table">
                <thead><tr><th>Package</th><th>Version</th><th>License</th></tr></thead>
                <tbody>
                  <tr v-for="pkg in backendNoticePackages" :key="`backend-${pkg.name}`">
                    <td><a :href="pkg.url" target="_blank">{{ pkg.name }}</a></td>
                    <td>{{ pkg.version }}</td>
                    <td>{{ pkg.license }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="notices-section">
              <div class="notices-section-title">Frontend (Vue.js)</div>
              <table class="notices-table">
                <thead><tr><th>Package</th><th>Version</th><th>License</th></tr></thead>
                <tbody>
                  <tr v-for="pkg in frontendNoticePackages" :key="`frontend-${pkg.name}`">
                    <td><a :href="pkg.url" target="_blank">{{ pkg.name }}</a></td>
                    <td>{{ pkg.version }}</td>
                    <td>{{ pkg.license }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Feedback Popup (placeholder) -->
      <div v-if="showFeedback" class="release-overlay" @click.self="showFeedback = false">
        <div class="release-popup">
          <div class="release-header">
            <span class="release-title">Feedback</span>
            <button class="release-close" @click="showFeedback = false">&times;</button>
          </div>
          <div class="feedback-placeholder">Coming soon</div>
        </div>
      </div>

      <!-- BPF Filter Popup -->
      <div v-if="showFilterPopup" class="filter-popup">
        <div class="filter-popup-header">
          <strong>Excluded from capture:</strong>
          <button class="close-btn" @click="showFilterPopup = false">&times;</button>
        </div>
        <ul class="filter-list">
          <li v-for="item in bpfFilter.excluded" :key="item.port || item.range">
            <template v-if="item.port">Port {{ item.port }}</template>
            <template v-else>{{ item.range }}</template>
            – {{ item.description }}
          </li>
        </ul>
        <div class="filter-raw">
          <code>{{ bpfFilter.raw }}</code>
        </div>
      </div>
    </div>

    <!-- Right section -->
    <div class="right-section">
      <span
        v-if="showThinClientBadge"
        class="version-info thin-client-badge"
        @mouseenter="showThinClientPopup = true"
        @mouseleave="showThinClientPopup = false"
      >
        Thin Client
        <div v-if="showThinClientPopup" class="thin-client-popup">
          <div class="popup-row reduction-row">Reduction Ratio: {{ reductionRatioRounded.toFixed(1) }}%</div>
          <div class="popup-row">Captured on interface: {{ formatBytes(totalCapturedBytes) }}</div>
          <div class="popup-row">Sent to browser: {{ formatBytes(bytesReceived + bytesFetched) }}</div>
        </div>
      </span>
      <span class="version-info wss-info">
        | <span
            class="version-info backend-status-badge"
            @mouseenter="showBackendPopup = true"
            @mouseleave="showBackendPopup = false"
          >
            Backend Status:
            <div v-if="showBackendPopup" :class="['backend-popup', { 'tshark-libraries': tsharkLibraries.length > 0 }]">
              <div class="popup-row">Node.js: {{ nodeVersion || 'unknown' }}</div>
              <div v-if="tsharkLibraries.length > 0" class="libs-section">
                <div class="libs-title">tshark libraries:</div>
                <div class="libs-grid">
                  <span v-for="(lib, i) in tsharkLibraries" :key="lib.name" class="lib-entry">{{ lib.name }}<template v-if="lib.version"> {{ lib.version }}</template><template v-if="i < tsharkLibraries.length - 1">, </template></span>
                </div>
              </div>
              <div v-else class="popup-row">tshark Lua: {{ tsharkLuaVersion || 'N/A' }}</div>
              <div v-if="pcapDirUsage" :class="['popup-row', 'pcap-dir-row', pcapDirUsageRowClass]">
                {{ pcapDirUsage.fsType === 'tmpfs' ? 'RAM' : 'Disk' }}: {{ formatBytes(pcapDirUsage.used) }} / {{ formatBytes(pcapDirUsage.total) }} <span v-if="pcapDirUsage.usagePercent !== undefined">({{ pcapDirUsage.usagePercent.toFixed(1) }}%)</span><span v-if="pcapDirUsageHint"> — {{ pcapDirUsageHint }}</span>
              </div>
            </div>
          </span>
          <span
            class="led"
            :class="backendStatus"
            @mouseenter="showLedPopup = true"
            @mouseleave="showLedPopup = false"
          >
            <div v-if="showLedPopup" class="led-popup" :class="{ 'led-popup-red': backendStatus === 'disconnected' }">
              {{ backendStatus === 'disconnected' ? 'Disconnected' : 'OK — Healthy' }}
            </div>
          </span>
        <span
            v-if="pcapDirUsage && pcapDirUsage.level !== 'ok'"
            :class="['version-info', 'pcap-dir-badge', pcapDirBadgeClass]"
          >
            {{ pcapDirUsage.fsType === 'tmpfs' ? 'RAM' : 'Capture' }} {{ Math.round(pcapDirUsage.usagePercent || 0) }}%
          </span>
        | <span
            class="version-info wss-label-wrap"
            @mouseenter="showWssPopup = true"
            @mouseleave="showWssPopup = false"
          >
            <span class="version-info wss-label">WSS:</span>
            <div v-if="showWssPopup" class="wss-popup">
              <div class="wss-popup-title">WSS Event Log</div>
              <table class="wss-events-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="wssEvents.length === 0">
                    <td>--:--:--</td>
                    <td>No events yet</td>
                  </tr>
                  <tr v-for="(event, idx) in wssEvents" :key="`wss-event-${idx}-${event.time}`">
                    <td>{{ event.time }}</td>
                    <td>{{ event.message }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </span>
          <span class="lock-icon" :class="{ 'lock-valid': isCertValid, 'lock-warning': !isCertValid }" @mouseenter="showCertPopup = true" @mouseleave="showCertPopup = false">
            🔒
            <div v-if="showCertPopup" class="cert-popup">
              <div class="cert-header">
                <span class="cert-title">WSS Certificate</span>
                <span v-if="isSelfSigned" class="cert-self-signed">Self-Signed</span>
              </div>
              <template v-if="certInfo">
                <div class="cert-section">
                  <div class="cert-section-title">Subject</div>
                  <div v-for="item in certSubject" :key="'s-'+item.key" class="cert-row">
                    <span class="cert-label">{{ item.key }}:</span>
                    <span class="cert-value">{{ item.value }}</span>
                  </div>
                </div>
                <div v-if="!isSelfSigned" class="cert-section">
                  <div class="cert-section-title">Issuer</div>
                  <div v-for="item in certIssuer" :key="'i-'+item.key" class="cert-row">
                    <span class="cert-label">{{ item.key }}:</span>
                    <span class="cert-value">{{ item.value }}</span>
                  </div>
                </div>
                <div class="cert-section">
                  <div class="cert-section-title">Validity</div>
                  <div class="cert-row">
                    <span class="cert-label">From:</span>
                    <span class="cert-value">{{ formatCertDate(certInfo.validFrom) }}</span>
                  </div>
                  <div class="cert-row">
                    <span class="cert-label">To:</span>
                    <span class="cert-value">{{ formatCertDate(certInfo.validTo) }}</span>
                  </div>
                </div>
                <div v-if="certInfo.fingerprint" class="cert-section">
                  <div class="cert-section-title">SHA-256 Fingerprint</div>
                  <div class="cert-fingerprint">{{ certInfo.fingerprint }}</div>
                </div>
              </template>
              <template v-else>
                <div class="cert-no-info">Certificate info not available</div>
              </template>
            </div>
          </span>
      </span>
      <a
        class="github"
        href="https://github.com/skaspi3/webpcap"
        aria-label="Visit the WebPCAP project page on GitHub"
        target="_blank"
        rel="noopener noreferrer"
      >
        <GitHubIcon />
      </a>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  padding: 2px 5px;
  position: relative;
  align-items: center;
}
.left-section {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}
.center-section {
  position: fixed;
  bottom: 28px;  /* Above the packet counter */
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
}
.right-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.release-overlay {
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
.release-popup {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 24px 28px;
  min-width: 460px;
  max-width: 560px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}
.release-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #374151;
}
.release-title {
  font-size: 20px;
  font-weight: 700;
  color: #f9fafb;
}
.release-ver {
  font-size: 14px;
  font-family: monospace;
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.1);
  padding: 2px 10px;
  border-radius: 12px;
}
.release-close {
  margin-left: auto;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.release-close:hover {
  color: #f9fafb;
}
.release-list {
  margin: 0;
  padding-left: 20px;
  color: #d1d5db;
  font-size: 14px;
  line-height: 1.8;
}
.release-list li {
  margin: 4px 0;
}
.release-list li::marker {
  color: #60a5fa;
}
.changelog-popup {
  font-size: 16.5px;
}
.changelog-popup .release-title {
  font-size: 22.5px;
}
.changelog-popup .release-ver {
  font-size: 16.5px;
}
.changelog-popup .release-close {
  font-size: 24.5px;
}
.changelog-popup .release-list {
  font-size: 16.5px;
}
.notices-link {
  margin-left: auto;
  margin-right: 8px;
  color: #60a5fa;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s;
}
.notices-link:hover {
  color: #93c5fd;
  text-decoration: underline;
}
.notices-popup {
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 15px;
  padding: 30px 35px;
  min-width: 650px;
  max-width: 775px;
  max-height: 86vh;
  overflow-y: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  font-size: 15.5px;
}
.notices-popup .release-title {
  font-size: 22.5px;
}
.notices-popup .release-close {
  font-size: 24.5px;
}
.notices-content {
  display: flex;
  flex-direction: column;
  gap: 25px;
}
.cve-scan-panel {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 13px;
  margin-bottom: 20px;
}
.cve-scan-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cve-scan-btn {
  background: #2563eb;
  border: 1px solid #1d4ed8;
  color: #fff;
  font-size: 14.5px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.cve-scan-btn:hover:not(:disabled) {
  background: #1d4ed8;
}
.cve-scan-btn:disabled {
  cursor: default;
  opacity: 0.65;
}
.cve-scan-btn.secondary {
  background: transparent;
  border-color: #4b5563;
  color: #d1d5db;
}
.cve-scan-meta {
  color: #9ca3af;
  font-size: 14.5px;
  margin-top: 8px;
}
.cve-scan-summary {
  margin-top: 8px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  color: #cbd5e1;
  font-size: 14.5px;
}
.cve-scan-error {
  margin-top: 8px;
  color: #fca5a5;
  font-size: 14.5px;
}
.scan-status.ok {
  color: #86efac;
}
.scan-status.affected {
  color: #fca5a5;
  font-weight: 600;
}
.scan-status.error {
  color: #fbbf24;
  font-weight: 600;
}
.notices-section-title {
  color: #9ca3af;
  font-size: 13.5px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  margin-bottom: 8px;
}
.notices-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15.5px;
}
.notices-table th {
  text-align: left;
  color: #6b7280;
  font-weight: 600;
  font-size: 13.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 9px 13px;
  border-bottom: 1px solid #374151;
}
.notices-table td {
  padding: 10px 13px;
  color: #d1d5db;
  border-bottom: 1px solid #1f2937;
}
.notices-table tr:hover td {
  background: rgba(96, 165, 250, 0.05);
}
.notices-table a {
  color: #60a5fa;
  text-decoration: none;
}
.notices-table a:hover {
  text-decoration: underline;
}
.app-actions-group {
  position: relative;
  display: inline-flex;
  align-items: center;
  z-index: 80;
}
.app-actions-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 44px;
  height: 44px;
  border: 1px solid #67e8f9;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #1f3552 0%, #13263e 42%, #0b1524 100%);
  color: #dbeafe;
  cursor: pointer;
  filter: brightness(1.06);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.2), 0 5px 14px rgba(14, 165, 233, 0.34);
  transition: transform 0.15s, filter 0.15s;
}
.app-actions-trigger:active {
  transform: scale(0.98);
}
.app-actions-trigger::after {
  content: "";
  position: absolute;
  inset: -2px;
  pointer-events: none;
  border-radius: 50%;
  border: 1px solid rgba(103, 232, 249, 0.65);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.45);
  opacity: 1;
}
.app-actions-trigger-icon {
  width: 24px;
  height: 24px;
}
.app-actions-trigger-icon .ring {
  fill: none;
  stroke: #a5f3fc;
  stroke-width: 1.35;
}
.app-actions-trigger-icon .core {
  fill: rgba(14, 116, 144, 0.22);
}
.app-actions-trigger-icon .menu-line {
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.85;
  stroke-linecap: round;
}
.app-actions-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
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
.actions-slide-up-enter-active {
  animation: actions-slide-up 0.2s ease-out;
}
.actions-slide-up-leave-active {
  animation: actions-slide-up 0.16s ease-in reverse;
}
@keyframes actions-slide-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.filter-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 12px;
  min-width: 280px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  color: #e5e7eb;
  font-size: 13px;
}
.filter-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #f3f4f6;
}
.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}
.close-btn:hover {
  color: #f3f4f6;
}
.filter-list {
  margin: 0;
  padding-left: 20px;
  color: #d1d5db;
}
.filter-list li {
  margin: 4px 0;
}
.filter-raw {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #374151;
}
.filter-raw code {
  font-family: monospace;
  font-size: 11px;
  color: #9ca3af;
  word-break: break-all;
}
.stats-info {
  font-family: monospace;
  font-size: 13px;
  color: #22c55e;
  font-weight: 500;
}
.displayed-info {
  font-family: monospace;
  font-size: 13px;
  color: #60a5fa;
  font-weight: 500;
}
.filtered-count {
  font-family: monospace;
  font-size: 13px;
  color: #fbbf24;
  font-weight: 500;
  background: rgba(251, 191, 36, 0.1);
  padding: 2px 10px;
  border-radius: 4px;
}
.github {
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.github svg {
  height: 100%;
}
.version-info {
  font-size: 11px;
  color: #9ca3af;
  margin-right: 10px;
  font-family: monospace;
}
.thin-client-badge {
  color: #60a5fa;
  font-weight: bold;
  font-size: 14.5px;
  cursor: pointer;
  position: relative;
}
.thin-client-popup {
  position: absolute;
  bottom: 24px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 14px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 14px;
  font-weight: normal;
  color: #d1d5db;
  line-height: 1.5;
}
.thin-client-popup .popup-row {
  margin: 2px 0;
}
.thin-client-popup .reduction-row {
  color: #22c55e;
  font-weight: 500;
}
.thin-client-popup .pcap-dir-row {
  color: #9ca3af;
  font-size: 13px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #374151;
}
.thin-client-popup .compression-row {
  color: #9ca3af;
  font-size: 13px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #374151;
}
.backend-status-badge {
  color: #60a5fa;
  font-weight: bold;
  font-size: 14.5px;
  cursor: pointer;
  position: relative;
}
.led-popup {
  position: absolute;
  bottom: 20px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 6px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 13px;
  color: #22c55e;
  font-weight: 600;
  white-space: nowrap;
}
.wss-label {
  color: #60a5fa;
  font-weight: bold;
  font-size: 14.5px;
}
.wss-label-wrap {
  position: relative;
  cursor: default;
}
.wss-popup {
  position: absolute;
  bottom: 24px;
  right: -6px;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 12px;
  min-width: 470px;
  max-width: 620px;
  max-height: 260px;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  color: #d1d5db;
  font-size: 13.5px;
  line-height: 1.45;
}
.wss-popup-title {
  color: #ffffff;
  font-weight: 700;
  margin-bottom: 6px;
}
.wss-events-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.wss-events-table th {
  text-align: left;
  color: #93c5fd;
  font-size: 11.5px;
  padding: 5px 8px;
  border-bottom: 1px solid #374151;
}
.wss-events-table td {
  padding: 5px 8px;
  border-bottom: 1px solid #2a3441;
  vertical-align: top;
}
.wss-events-table td:first-child {
  color: #9ca3af;
  font-family: monospace;
  white-space: nowrap;
  width: 90px;
}
.wss-events-table td:last-child {
  color: #d1d5db;
  word-break: break-word;
}
.led-popup-red {
  color: #ef4444;
}
.wss-info {
  display: flex;
  align-items: center;
  gap: 4px;
}
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 3px currentColor;
  cursor: pointer;
  position: relative;
}
.led.disconnected {
  background-color: #ef4444;
  color: #ef4444;
}
.led.connecting {
  background-color: #f59e0b;
  color: #f59e0b;
  animation: pulse-led 1s infinite;
}
.led.reconnecting {
  background-color: #f59e0b;
  color: #f59e0b;
  animation: pulse-led 1s infinite;
}
.led.connected {
  background-color: #22c55e;
  color: #22c55e;
}
@keyframes pulse-led {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.backend-popup {
  position: absolute;
  bottom: 20px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 16px;
  color: #d1d5db;
  max-height: 400px;
  overflow-y: auto;
}
.backend-popup.tshark-libraries {
  min-width: 400px;
  max-width: 700px;
}
.popup-row {
  margin: 2px 0;
}
.pcap-dir-row.pcap-dir-warning {
  color: #fbbf24;
}
.pcap-dir-row.pcap-dir-critical {
  color: #f87171;
  font-weight: 700;
}
.pcap-dir-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.2px;
}
.pcap-dir-badge-warning {
  background: rgba(251, 191, 36, 0.18);
  border: 1px solid rgba(251, 191, 36, 0.38);
  color: #fbbf24;
}
.pcap-dir-badge-critical {
  background: rgba(248, 113, 113, 0.18);
  border: 1px solid rgba(248, 113, 113, 0.38);
  color: #fca5a5;
}
.libs-section {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid #374151;
}
.libs-title {
  color: #9ca3af;
  font-size: 14px;
  margin-bottom: 3px;
}
.libs-grid {
  display: inline;
  line-height: 1.6;
}
.lib-entry {
  font-size: 14px;
  color: #a5b4c8;
  font-family: monospace;
  word-wrap: break-word;
  white-space: normal;
}
.loading-row {
  color: #9ca3af;
  font-style: italic;
}
.lock-icon {
  font-size: 18px;
  position: relative;
  cursor: pointer;
}
.lock-icon.lock-valid {
  filter: hue-rotate(60deg) saturate(2) brightness(1.2);
  opacity: 1;
}
.lock-icon.lock-warning {
  filter: hue-rotate(-10deg) saturate(3) brightness(1);
  opacity: 1;
}
.cert-popup {
  position: absolute;
  bottom: 24px;
  right: 0;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 14px;
  min-width: 280px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  font-size: 14.5px;
  color: #d1d5db;
}
.cert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #374151;
}
.cert-title {
  font-weight: 600;
  color: #ffffff;
  font-size: 15.5px;
}
.cert-self-signed {
  color: #f59e0b;
  font-size: 12.5px;
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}
.cert-section {
  margin-bottom: 10px;
}
.cert-section:last-child {
  margin-bottom: 0;
}
.cert-section-title {
  font-size: 12.5px;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.cert-row {
  display: flex;
  font-size: 13.5px;
  margin: 2px 0;
  white-space: nowrap;
}
.cert-label {
  color: #9ca3af;
  min-width: 90px;
}
.cert-value {
  color: #e5e7eb;
}
.cert-fingerprint {
  font-family: monospace;
  font-size: 11.5px;
  color: #9ca3af;
  word-break: break-all;
  line-height: 1.4;
  white-space: normal;
}
.cert-no-info {
  color: #6b7280;
  font-style: italic;
}
.feedback-placeholder {
  color: #6b7280;
  font-size: 15px;
  text-align: center;
  padding: 20px 0;
  font-style: italic;
}
</style>
