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
</style>
