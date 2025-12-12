<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { packets } from '../globals';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { PieChart, BarChart, LineChart, TreeChart, ChordChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components';
import VChart from 'vue-echarts';

// Register ECharts components
use([
  CanvasRenderer,
  PieChart,
  BarChart,
  LineChart,
  TreeChart,
  ChordChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
]);

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

// ECharts options for protocol pie chart
const protocolPieOption = computed(() => {
  if (!protocols.value.length) return null;
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 4,
        borderColor: '#1f2937',
        borderWidth: 2
      },
      label: {
        color: '#e5e7eb',
        fontSize: 11
      },
      data: protocols.value.slice(0, 8).map(p => ({
        name: p.protocol,
        value: p.packet_count
      }))
    }]
  };
});

// ECharts options for top talkers bar chart
const talkersBarOption = computed(() => {
  if (!talkers.value.length) return null;
  const top10 = talkers.value.slice(0, 10);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (val) => {
          if (val >= 1024 * 1024) return (val / 1024 / 1024).toFixed(1) + 'M';
          if (val >= 1024) return (val / 1024).toFixed(0) + 'K';
          return val;
        }
      },
      splitLine: { lineStyle: { color: '#374151' } }
    },
    yAxis: {
      type: 'category',
      data: top10.map(t => t.ip_address).reverse(),
      axisLabel: { color: '#9ca3af', fontSize: 10 }
    },
    series: [{
      type: 'bar',
      data: top10.map(t => t.total_bytes).reverse(),
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#60a5fa' }
          ]
        },
        borderRadius: [0, 4, 4, 0]
      }
    }]
  };
});

// ECharts options for timeline line chart
const timelineLineOption = computed(() => {
  if (!timeline.value.length) return null;
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timeline.value.map(t => t.bucket + 's'),
      axisLabel: { color: '#9ca3af', fontSize: 10 },
      axisLine: { lineStyle: { color: '#374151' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#9ca3af' },
      splitLine: { lineStyle: { color: '#374151' } }
    },
    series: [{
      type: 'line',
      data: timeline.value.map(t => t.packet_count),
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#3b82f6', width: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
          ]
        }
      }
    }]
  };
});

// Top 10 conversations computed
const top10Conversations = computed(() => {
  if (!conversations.value.length) return [];
  // Sort by total frames and take top 10
  return [...conversations.value]
    .sort((a, b) => b.framesTotal - a.framesTotal)
    .slice(0, 10);
});

// ECharts chord diagram option for conversations (ECharts 6.0 series-chord)
const conversationsChordOption = computed(() => {
  if (!top10Conversations.value.length) return null;

  // Build unique list of IPs (nodes)
  const ipSet = new Set();
  top10Conversations.value.forEach(conv => {
    ipSet.add(conv.addressA);
    ipSet.add(conv.addressB);
  });
  const ips = Array.from(ipSet);
  const ipIndex = new Map(ips.map((ip, i) => [ip, i]));

  // Build matrix (n x n) where matrix[i][j] = traffic from i to j
  const n = ips.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  top10Conversations.value.forEach(conv => {
    const i = ipIndex.get(conv.addressA);
    const j = ipIndex.get(conv.addressB);
    matrix[i][j] = conv.framesAtoB;
    matrix[j][i] = conv.framesBtoA;
  });

  // Create data array with distinct colors
  const data = ips.map((ip, index) => ({
    name: ip,
    itemStyle: {
      color: `hsl(${(index * 360 / n)}, 70%, 55%)`
    }
  }));

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (params.dataType === 'edge') {
          return `${params.data.source} → ${params.data.target}<br/>Frames: ${params.value.toLocaleString()}`;
        }
        return params.name;
      }
    },
    series: [{
      type: 'chord',
      data: data,
      matrix: matrix,
      label: {
        show: true,
        color: '#e5e7eb',
        fontSize: 11
      },
      emphasis: {
        focus: 'adjacency',
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.3)'
        }
      },
      lineStyle: {
        color: 'source',
        opacity: 0.6
      }
    }]
  };
});

// Build hierarchy tree from protocol hierarchy data
const buildHierarchyTree = (hierarchy) => {
  if (!hierarchy || !hierarchy.length) return null;

  const root = {
    name: 'Capture',
    children: []
  };

  const stack = [root];
  let lastLevel = -1;

  hierarchy.forEach(item => {
    const node = {
      name: item.protocol,
      value: item.frames,
      children: []
    };

    // Adjust stack based on level
    while (stack.length > item.level + 1) {
      stack.pop();
    }

    // Add to parent
    const parent = stack[stack.length - 1];
    parent.children.push(node);
    stack.push(node);
    lastLevel = item.level;
  });

  // Clean up empty children arrays
  const cleanTree = (node) => {
    if (node.children && node.children.length === 0) {
      delete node.children;
    } else if (node.children) {
      node.children.forEach(cleanTree);
    }
    return node;
  };

  return cleanTree(root);
};

// ECharts Tree option for protocol hierarchy
const hierarchyTreeOption = computed(() => {
  if (!protocolHierarchy.value.length) return null;

  const treeData = buildHierarchyTree(protocolHierarchy.value);
  if (!treeData) return null;

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (params.data.value) {
          return `${params.data.name}<br/>Frames: ${params.data.value}`;
        }
        return params.data.name;
      }
    },
    series: [{
      type: 'tree',
      data: [treeData],
      orient: 'LR',
      top: '5%',
      left: '10%',
      bottom: '5%',
      right: '20%',
      symbolSize: 10,
      symbol: 'circle',
      initialTreeDepth: 3,
      expandAndCollapse: true,
      animationDuration: 550,
      animationDurationUpdate: 750,
      label: {
        position: 'left',
        verticalAlign: 'middle',
        align: 'right',
        fontSize: 11,
        color: '#e5e7eb',
        formatter: (params) => {
          if (params.data.value) {
            return `${params.data.name} (${params.data.value})`;
          }
          return params.data.name;
        }
      },
      leaves: {
        label: {
          position: 'right',
          verticalAlign: 'middle',
          align: 'left'
        }
      },
      lineStyle: {
        color: '#4b5563',
        width: 1.5
      },
      itemStyle: {
        color: '#3b82f6',
        borderColor: '#1e40af'
      },
      emphasis: {
        focus: 'descendant'
      }
    }]
  };
});
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
          class="disabled"
          disabled
          title="Expert analysis temporarily disabled"
        >Expert</button>
        <button
          :class="{ active: activeTab === 'conversations' }"
          @click="activeTab = 'conversations'"
        >Conversations</button>
        <button
          :class="{ active: activeTab === 'hierarchy' }"
          @click="activeTab = 'hierarchy'"
        >Hierarchy</button>
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

          <!-- Charts Row -->
          <div class="charts-row">
            <!-- Protocol Distribution Pie Chart -->
            <div v-if="protocolPieOption" class="chart-container">
              <h3>Protocol Distribution</h3>
              <v-chart class="chart" :option="protocolPieOption" autoresize />
            </div>

            <!-- Top Talkers Bar Chart -->
            <div v-if="talkersBarOption" class="chart-container">
              <h3>Top Talkers (Bytes)</h3>
              <v-chart class="chart" :option="talkersBarOption" autoresize />
            </div>
          </div>

          <!-- Timeline Chart -->
          <div v-if="timelineLineOption" class="timeline-chart-container">
            <h3>Traffic Timeline (Packets/sec)</h3>
            <v-chart class="timeline-chart" :option="timelineLineOption" autoresize />
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
          <div v-else class="conversations-content">
            <!-- Circular graph (chord-like) for traffic flow -->
            <div v-if="conversationsChordOption" class="chord-container">
              <h3>Traffic Flow (Top 10)</h3>
              <v-chart class="chord-chart" :option="conversationsChordOption" autoresize />
            </div>

            <!-- Table with top 10 -->
            <table class="conversations-table">
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
                <tr v-for="(conv, idx) in top10Conversations" :key="idx">
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
        </div>

        <!-- Protocol Hierarchy Tab -->
        <div v-else-if="activeTab === 'hierarchy'" class="tab-content hierarchy-tab">
          <div v-if="hierarchyLoading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading protocol hierarchy...</p>
          </div>
          <div v-else-if="!protocolHierarchy.length" class="empty-state">No protocol hierarchy data available</div>
          <div v-else-if="hierarchyTreeOption" class="hierarchy-tree-container">
            <v-chart class="hierarchy-tree-chart" :option="hierarchyTreeOption" autoresize />
          </div>
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

.tab-nav button.disabled {
  color: #4b5563;
  cursor: not-allowed;
  opacity: 0.5;
}

.tab-nav button.disabled:hover {
  background: transparent;
  color: #4b5563;
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

/* ECharts containers */
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-container {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 16px;
}

.chart-container h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #e5e7eb;
}

.chart {
  height: 200px;
}

.timeline-chart-container {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 16px;
}

.timeline-chart-container h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #e5e7eb;
}

.timeline-chart {
  height: 150px;
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

.conversations-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.chord-container {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 16px;
}

.chord-container h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #e5e7eb;
}

.chord-chart {
  height: 350px;
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

.hierarchy-tree-container {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 16px;
}

.hierarchy-tree-chart {
  height: 400px;
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
