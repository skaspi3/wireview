<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { packets } from '../globals';

const emit = defineEmits(['close']);

// Panel state
const isLoading = ref(false);
const error = ref(null);
const activeTab = ref('summary');

// Stats data
const summary = ref(null);
const protocols = ref([]);
const talkers = ref([]);
const timeline = ref([]);
const flows = ref([]);

// tshark analysis data
const expert = ref(null);
const conversations = ref([]);
const protocolHierarchy = ref([]);
const expertLoading = ref(false);
const conversationsLoading = ref(false);
const hierarchyLoading = ref(false);

// Auto-refresh interval
let refreshInterval = null;
const autoRefresh = ref(true);

// Fetch all stats from backend
const fetchStats = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    const response = await fetch('/api/stats');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    summary.value = data.summary;
    protocols.value = data.protocols || [];
    talkers.value = data.talkers || [];
    timeline.value = data.timeline || [];
    flows.value = data.flows || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
};

// Format bytes for display
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

// Format duration
const formatDuration = (seconds) => {
  if (!seconds || seconds === 0) return '0s';
  if (seconds < 60) return seconds.toFixed(1) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
};

// Protocol chart data (simple bar chart using CSS)
const protocolChartData = computed(() => {
  if (!protocols.value.length) return [];
  const maxCount = Math.max(...protocols.value.map(p => p.packet_count));
  return protocols.value.slice(0, 10).map(p => ({
    ...p,
    percentage: (p.packet_count / maxCount) * 100
  }));
});

// Top talkers chart data
const talkerChartData = computed(() => {
  if (!talkers.value.length) return [];
  const maxBytes = Math.max(...talkers.value.map(t => t.total_bytes));
  return talkers.value.slice(0, 10).map(t => ({
    ...t,
    percentage: (t.total_bytes / maxBytes) * 100
  }));
});

// Timeline for sparkline
const timelineSparkline = computed(() => {
  if (!timeline.value.length) return '';
  const maxCount = Math.max(...timeline.value.map(t => t.packet_count));
  if (maxCount === 0) return '';

  // Create SVG path for sparkline
  const width = 100;
  const height = 30;
  const points = timeline.value.map((t, i) => {
    const x = (i / Math.max(1, timeline.value.length - 1)) * width;
    const y = height - (t.packet_count / maxCount) * height;
    return `${x},${y}`;
  });

  return `M ${points.join(' L ')}`;
});

// Lifecycle
onMounted(() => {
  fetchStats();
  if (autoRefresh.value) {
    refreshInterval = setInterval(fetchStats, 2000);
  }
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

// Watch for packet changes to refresh
watch(() => packets.value.length, () => {
  if (autoRefresh.value && !isLoading.value) {
    fetchStats();
  }
});

// Toggle auto-refresh
const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) {
    refreshInterval = setInterval(fetchStats, 2000);
  } else if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

// Fetch expert analysis (on-demand, not auto-refreshed)
const fetchExpert = async () => {
  if (expertLoading.value) return;
  try {
    expertLoading.value = true;
    const response = await fetch('/api/stats/expert');
    const data = await response.json();
    expert.value = data.expert;
  } catch (e) {
    console.error('Failed to fetch expert info:', e);
  } finally {
    expertLoading.value = false;
  }
};

// Fetch conversations (on-demand)
const fetchConversations = async () => {
  if (conversationsLoading.value) return;
  try {
    conversationsLoading.value = true;
    const response = await fetch('/api/stats/conversations');
    const data = await response.json();
    conversations.value = data.conversations || [];
  } catch (e) {
    console.error('Failed to fetch conversations:', e);
  } finally {
    conversationsLoading.value = false;
  }
};

// Fetch protocol hierarchy (on-demand)
const fetchProtocolHierarchy = async () => {
  if (hierarchyLoading.value) return;
  try {
    hierarchyLoading.value = true;
    const response = await fetch('/api/stats/protocols-hierarchy');
    const data = await response.json();
    protocolHierarchy.value = data.hierarchy || [];
  } catch (e) {
    console.error('Failed to fetch protocol hierarchy:', e);
  } finally {
    hierarchyLoading.value = false;
  }
};

// Watch tab changes to load data on-demand
watch(activeTab, (newTab) => {
  if (newTab === 'expert' && !expert.value && !expertLoading.value) {
    fetchExpert();
  } else if (newTab === 'conversations' && !conversations.value.length && !conversationsLoading.value) {
    fetchConversations();
  } else if (newTab === 'hierarchy' && !protocolHierarchy.value.length && !hierarchyLoading.value) {
    fetchProtocolHierarchy();
  }
});

// Count total expert items
const expertTotalCount = computed(() => {
  if (!expert.value) return 0;
  return (expert.value.errors?.length || 0) +
         (expert.value.warnings?.length || 0) +
         (expert.value.notes?.length || 0) +
         (expert.value.chats?.length || 0);
});

// Get severity color for expert items
const getSeverityColor = (severity) => {
  switch (severity) {
    case 'errors': return '#ef4444';
    case 'warnings': return '#f59e0b';
    case 'notes': return '#3b82f6';
    case 'chats': return '#22c55e';
    default: return '#9ca3af';
  }
};

// Get severity label
const getSeverityLabel = (severity) => {
  switch (severity) {
    case 'errors': return 'Error';
    case 'warnings': return 'Warning';
    case 'notes': return 'Note';
    case 'chats': return 'Chat';
    default: return severity;
  }
};
</script>

<template>
  <div class="insights-overlay" @click.self="emit('close')">
    <div class="insights-panel">
      <!-- Header -->
      <div class="panel-header">
        <h2>Capture Insights</h2>
        <div class="header-controls">
          <button
            class="refresh-btn"
            :class="{ active: autoRefresh }"
            @click="toggleAutoRefresh"
            title="Toggle auto-refresh"
          >
            <span class="refresh-icon" :class="{ spinning: autoRefresh && isLoading }">&#x21bb;</span>
            {{ autoRefresh ? 'Auto' : 'Manual' }}
          </button>
          <button v-if="!autoRefresh" class="refresh-btn" @click="fetchStats" :disabled="isLoading">
            Refresh
          </button>
          <button class="close-btn" @click="emit('close')">&times;</button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button
          :class="{ active: activeTab === 'summary' }"
          @click="activeTab = 'summary'"
        >Summary</button>
        <button
          :class="{ active: activeTab === 'expert' }"
          @click="activeTab = 'expert'"
        >Expert</button>
        <button
          :class="{ active: activeTab === 'conversations' }"
          @click="activeTab = 'conversations'"
        >Conversations</button>
        <button
          :class="{ active: activeTab === 'hierarchy' }"
          @click="activeTab = 'hierarchy'"
        >Hierarchy</button>
        <button
          :class="{ active: activeTab === 'protocols' }"
          @click="activeTab = 'protocols'"
        >Protocols</button>
        <button
          :class="{ active: activeTab === 'talkers' }"
          @click="activeTab = 'talkers'"
        >Top Talkers</button>
        <button
          :class="{ active: activeTab === 'flows' }"
          @click="activeTab = 'flows'"
        >Flows</button>
      </div>

      <!-- Content -->
      <div class="panel-content">
        <!-- Error State -->
        <div v-if="error" class="error-state">
          <p>Failed to load stats: {{ error }}</p>
          <button @click="fetchStats">Retry</button>
        </div>

        <!-- Loading State -->
        <div v-else-if="isLoading && !summary" class="loading-state">
          <div class="spinner"></div>
          <p>Loading statistics...</p>
        </div>

        <!-- Summary Tab -->
        <div v-else-if="activeTab === 'summary'" class="tab-content summary-tab">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{{ summary?.totalPackets?.toLocaleString() || 0 }}</div>
              <div class="stat-label">Total Packets</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ formatBytes(summary?.totalBytes) }}</div>
              <div class="stat-label">Total Traffic</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ summary?.uniqueIps || 0 }}</div>
              <div class="stat-label">Unique IPs</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ summary?.flowCount || 0 }}</div>
              <div class="stat-label">Flows</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ summary?.protocolCount || 0 }}</div>
              <div class="stat-label">Protocols</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ formatDuration(summary?.timeRange?.duration) }}</div>
              <div class="stat-label">Duration</div>
            </div>
          </div>

          <!-- Timeline Sparkline -->
          <div v-if="timeline.length > 1" class="timeline-section">
            <h3>Traffic Timeline</h3>
            <svg class="sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
              <path :d="timelineSparkline" fill="none" stroke="#3b82f6" stroke-width="1.5" />
            </svg>
            <div class="timeline-labels">
              <span>{{ formatDuration(summary?.timeRange?.start || 0) }}</span>
              <span>{{ formatDuration(summary?.timeRange?.end || 0) }}</span>
            </div>
          </div>
        </div>

        <!-- Expert Tab -->
        <div v-else-if="activeTab === 'expert'" class="tab-content expert-tab">
          <div v-if="expertLoading" class="loading-state">
            <div class="spinner"></div>
            <p>Analyzing capture...</p>
          </div>
          <div v-else-if="!expert || expertTotalCount === 0" class="empty-state">
            No expert info available (capture may be too short or have no issues)
          </div>
          <div v-else class="expert-content">
            <!-- Errors Section -->
            <div v-if="expert.errors?.length" class="expert-section">
              <h3 class="expert-section-title" :style="{ color: getSeverityColor('errors') }">
                Errors ({{ expert.errors.length }})
              </h3>
              <div class="expert-items">
                <div v-for="(item, idx) in expert.errors" :key="'err-' + idx" class="expert-item">
                  <span class="expert-freq">{{ item.frequency }}x</span>
                  <span class="expert-protocol">{{ item.protocol }}</span>
                  <span class="expert-summary">{{ item.summary }}</span>
                </div>
              </div>
            </div>

            <!-- Warnings Section -->
            <div v-if="expert.warnings?.length" class="expert-section">
              <h3 class="expert-section-title" :style="{ color: getSeverityColor('warnings') }">
                Warnings ({{ expert.warnings.length }})
              </h3>
              <div class="expert-items">
                <div v-for="(item, idx) in expert.warnings" :key="'warn-' + idx" class="expert-item">
                  <span class="expert-freq">{{ item.frequency }}x</span>
                  <span class="expert-protocol">{{ item.protocol }}</span>
                  <span class="expert-summary">{{ item.summary }}</span>
                </div>
              </div>
            </div>

            <!-- Notes Section -->
            <div v-if="expert.notes?.length" class="expert-section">
              <h3 class="expert-section-title" :style="{ color: getSeverityColor('notes') }">
                Notes ({{ expert.notes.length }})
              </h3>
              <div class="expert-items">
                <div v-for="(item, idx) in expert.notes" :key="'note-' + idx" class="expert-item">
                  <span class="expert-freq">{{ item.frequency }}x</span>
                  <span class="expert-protocol">{{ item.protocol }}</span>
                  <span class="expert-summary">{{ item.summary }}</span>
                </div>
              </div>
            </div>

            <!-- Chats Section -->
            <div v-if="expert.chats?.length" class="expert-section">
              <h3 class="expert-section-title" :style="{ color: getSeverityColor('chats') }">
                Chats ({{ expert.chats.length }})
              </h3>
              <div class="expert-items">
                <div v-for="(item, idx) in expert.chats" :key="'chat-' + idx" class="expert-item">
                  <span class="expert-freq">{{ item.frequency }}x</span>
                  <span class="expert-protocol">{{ item.protocol }}</span>
                  <span class="expert-summary">{{ item.summary }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conversations Tab -->
        <div v-else-if="activeTab === 'conversations'" class="tab-content conversations-tab">
          <div v-if="conversationsLoading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading conversations...</p>
          </div>
          <div v-else-if="!conversations.length" class="empty-state">No conversation data available</div>
          <table v-else class="conversations-table">
            <thead>
              <tr>
                <th>Address A</th>
                <th>Address B</th>
                <th>Frames A→B</th>
                <th>Bytes A→B</th>
                <th>Frames B→A</th>
                <th>Bytes B→A</th>
                <th>Total</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(conv, idx) in conversations" :key="idx">
                <td class="ip-cell">{{ conv.addressA }}</td>
                <td class="ip-cell">{{ conv.addressB }}</td>
                <td class="num-cell">{{ conv.framesAtoB }}</td>
                <td class="num-cell">{{ conv.bytesAtoB }}</td>
                <td class="num-cell">{{ conv.framesBtoA }}</td>
                <td class="num-cell">{{ conv.bytesBtoA }}</td>
                <td class="num-cell">{{ conv.bytesTotal }}</td>
                <td class="num-cell">{{ conv.duration.toFixed(2) }}s</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Protocol Hierarchy Tab -->
        <div v-else-if="activeTab === 'hierarchy'" class="tab-content hierarchy-tab">
          <div v-if="hierarchyLoading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading protocol hierarchy...</p>
          </div>
          <div v-else-if="!protocolHierarchy.length" class="empty-state">No protocol hierarchy data available</div>
          <div v-else class="hierarchy-tree">
            <div
              v-for="(item, idx) in protocolHierarchy"
              :key="idx"
              class="hierarchy-item"
              :style="{ paddingLeft: (item.level * 20 + 12) + 'px' }"
            >
              <span class="hierarchy-protocol">{{ item.protocol }}</span>
              <span class="hierarchy-stats">
                <span class="hierarchy-frames">{{ item.frames.toLocaleString() }} frames</span>
                <span class="hierarchy-bytes">{{ formatBytes(item.bytes) }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Protocols Tab -->
        <div v-else-if="activeTab === 'protocols'" class="tab-content">
          <div v-if="!protocolChartData.length" class="empty-state">No protocol data available</div>
          <div v-else class="chart-list">
            <div v-for="proto in protocolChartData" :key="proto.protocol" class="chart-row">
              <div class="chart-label">{{ proto.protocol }}</div>
              <div class="chart-bar-container">
                <div class="chart-bar" :style="{ width: proto.percentage + '%' }"></div>
              </div>
              <div class="chart-value">{{ proto.packet_count.toLocaleString() }}</div>
              <div class="chart-bytes">{{ formatBytes(proto.total_bytes) }}</div>
            </div>
          </div>
        </div>

        <!-- Top Talkers Tab -->
        <div v-else-if="activeTab === 'talkers'" class="tab-content">
          <div v-if="!talkerChartData.length" class="empty-state">No IP data available</div>
          <div v-else class="chart-list">
            <div v-for="talker in talkerChartData" :key="talker.ip_address" class="chart-row">
              <div class="chart-label ip-label">{{ talker.ip_address }}</div>
              <div class="chart-bar-container">
                <div class="chart-bar talker-bar" :style="{ width: talker.percentage + '%' }"></div>
              </div>
              <div class="chart-value">{{ formatBytes(talker.total_bytes) }}</div>
              <div class="chart-packets">{{ talker.packets_sent + talker.packets_received }} pkts</div>
            </div>
          </div>
        </div>

        <!-- Flows Tab -->
        <div v-else-if="activeTab === 'flows'" class="tab-content flows-tab">
          <div v-if="!flows.length" class="empty-state">No flow data available</div>
          <table v-else class="flows-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Destination</th>
                <th>Protocol</th>
                <th>Packets</th>
                <th>Bytes</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="flow in flows" :key="`${flow.src_ip}-${flow.dst_ip}-${flow.src_port}-${flow.dst_port}`">
                <td class="ip-cell">{{ flow.src_ip }}<span v-if="flow.src_port">:{{ flow.src_port }}</span></td>
                <td class="ip-cell">{{ flow.dst_ip }}<span v-if="flow.dst_port">:{{ flow.dst_port }}</span></td>
                <td>{{ flow.protocol }}</td>
                <td class="num-cell">{{ flow.packet_count.toLocaleString() }}</td>
                <td class="num-cell">{{ formatBytes(flow.total_bytes) }}</td>
                <td class="num-cell">{{ formatDuration(flow.duration) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.insights-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.insights-panel {
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #374151;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #f3f4f6;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-btn {
  padding: 6px 12px;
  background: #374151;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.refresh-btn:hover {
  background: #4b5563;
}

.refresh-btn.active {
  background: #1d4ed8;
  border-color: #3b82f6;
}

.refresh-icon {
  font-size: 16px;
}

.refresh-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 24px;
  cursor: pointer;
  padding: 0 8px;
  line-height: 1;
}

.close-btn:hover {
  color: #f3f4f6;
}

.tab-nav {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid #374151;
  background: #111827;
}

.tab-nav button {
  padding: 8px 16px;
  background: transparent;
  color: #9ca3af;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-nav button:hover {
  background: #374151;
  color: #e5e7eb;
}

.tab-nav button.active {
  background: #3b82f6;
  color: #fff;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-content {
  min-height: 300px;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #9ca3af;
  gap: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #374151;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.error-state button {
  padding: 8px 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* Summary Tab */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #3b82f6;
  font-family: monospace;
}

.stat-label {
  font-size: 13px;
  color: #9ca3af;
  margin-top: 4px;
}

.timeline-section {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 16px;
}

.timeline-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #e5e7eb;
}

.sparkline {
  width: 100%;
  height: 60px;
  background: #0f172a;
  border-radius: 4px;
}

.timeline-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6b7280;
  margin-top: 6px;
}

/* Chart List (Protocols & Talkers) */
.chart-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chart-row {
  display: grid;
  grid-template-columns: 100px 1fr 80px 80px;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  background: #111827;
  border-radius: 6px;
}

.chart-label {
  font-size: 13px;
  font-weight: 500;
  color: #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-label.ip-label {
  font-family: monospace;
  font-size: 12px;
}

.chart-bar-container {
  height: 20px;
  background: #1f2937;
  border-radius: 4px;
  overflow: hidden;
}

.chart-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.chart-bar.talker-bar {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.chart-value,
.chart-bytes,
.chart-packets {
  font-size: 12px;
  font-family: monospace;
  color: #9ca3af;
  text-align: right;
}

.chart-bytes {
  color: #60a5fa;
}

/* Flows Table */
.flows-tab {
  overflow-x: auto;
}

.flows-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.flows-table th {
  background: #111827;
  color: #9ca3af;
  font-weight: 500;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #374151;
}

.flows-table td {
  padding: 8px 12px;
  color: #e5e7eb;
  border-bottom: 1px solid #1f2937;
}

.flows-table tr:hover td {
  background: #111827;
}

.ip-cell {
  font-family: monospace;
  font-size: 12px;
}

.ip-cell span {
  color: #6b7280;
}

.num-cell {
  text-align: right;
  font-family: monospace;
}

/* Expert Tab */
.expert-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.expert-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.expert-section {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  overflow: hidden;
}

.expert-section-title {
  margin: 0;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 600;
  background: #0f172a;
  border-bottom: 1px solid #374151;
}

.expert-items {
  display: flex;
  flex-direction: column;
}

.expert-item {
  display: grid;
  grid-template-columns: 50px 100px 1fr;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #1f2937;
  font-size: 13px;
  align-items: center;
}

.expert-item:last-child {
  border-bottom: none;
}

.expert-item:hover {
  background: #1f2937;
}

.expert-freq {
  font-family: monospace;
  font-size: 12px;
  color: #9ca3af;
  background: #374151;
  padding: 2px 6px;
  border-radius: 4px;
  text-align: center;
}

.expert-protocol {
  font-weight: 500;
  color: #60a5fa;
  font-size: 12px;
}

.expert-summary {
  color: #e5e7eb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Conversations Tab */
.conversations-tab {
  overflow-x: auto;
}

.conversations-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 700px;
}

.conversations-table th {
  background: #111827;
  color: #9ca3af;
  font-weight: 500;
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #374151;
  white-space: nowrap;
}

.conversations-table td {
  padding: 8px 12px;
  color: #e5e7eb;
  border-bottom: 1px solid #1f2937;
}

.conversations-table tr:hover td {
  background: #111827;
}

/* Protocol Hierarchy Tab */
.hierarchy-tab {
  display: flex;
  flex-direction: column;
}

.hierarchy-tree {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  overflow: hidden;
}

.hierarchy-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #1f2937;
  font-size: 13px;
}

.hierarchy-item:last-child {
  border-bottom: none;
}

.hierarchy-item:hover {
  background: #1f2937;
}

.hierarchy-protocol {
  font-weight: 500;
  color: #e5e7eb;
}

.hierarchy-stats {
  display: flex;
  gap: 16px;
  font-family: monospace;
  font-size: 12px;
}

.hierarchy-frames {
  color: #9ca3af;
}

.hierarchy-bytes {
  color: #60a5fa;
}
</style>
