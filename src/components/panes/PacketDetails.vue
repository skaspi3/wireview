<script setup>
import { ref, watch, computed } from "vue";
import { packets, activePacketIndex, activePacketDetails, activePacketHex } from "../../globals";
import { getPacketWithPrefetch, getCachedPacket, isFetchingBatch } from "../../packetCache";

// Collapsed state for tree nodes
const collapsed = ref({});
const isLoading = ref(false);

// Toggle collapse state
const toggleCollapse = (path) => {
  collapsed.value[path] = !collapsed.value[path];
};

// Check if collapsed
const isCollapsed = (path) => collapsed.value[path] !== false;

// Fetch packet details and hex when selection changes
watch(activePacketIndex, async (index) => {
  if (index === null || index < 0 || index >= packets.value.length) {
    activePacketDetails.value = null;
    activePacketHex.value = '';
    isLoading.value = false;
    return;
  }

  const packet = packets.value[index];
  if (!packet) {
    activePacketDetails.value = null;
    activePacketHex.value = '';
    isLoading.value = false;
    return;
  }

  const frameNumber = packet.number;

  // Check cache first for instant display
  const cached = getCachedPacket(frameNumber);
  if (cached && cached.details) {
    activePacketDetails.value = cached.details;
    activePacketHex.value = cached.hex || '';
    collapsed.value = {};
    isLoading.value = false;

    // Trigger background prefetch of adjacent packets
    getPacketWithPrefetch(frameNumber, packets.value.length);
    return;
  }

  // Not in cache - show loading and fetch with prefetch
  isLoading.value = true;
  activePacketDetails.value = null;
  activePacketHex.value = '';

  try {
    const data = await getPacketWithPrefetch(frameNumber, packets.value.length);
    if (data && data.details) {
      activePacketDetails.value = data.details;
      activePacketHex.value = data.hex || '';
      collapsed.value = {};
    } else {
      activePacketDetails.value = null;
      activePacketHex.value = '';
    }
  } catch (e) {
    console.error("Failed to fetch packet data:", e);
    activePacketDetails.value = null;
    activePacketHex.value = '';
  } finally {
    isLoading.value = false;
  }
});

// Parse tshark JSON into tree structure
const detailsTree = computed(() => {
  if (!activePacketDetails.value) return [];

  const details = activePacketDetails.value;
  const layers = details._source?.layers || details.layers || {};

  const tree = [];
  for (const [layerName, layerData] of Object.entries(layers)) {
    if (typeof layerData !== 'object' || layerData === null) continue;

    const node = {
      name: formatLayerName(layerName),
      path: layerName,
      children: parseLayerFields(layerData, layerName),
    };
    tree.push(node);
  }
  return tree;
});

// Format layer name for display
const formatLayerName = (name) => {
  const names = {
    frame: 'Frame',
    eth: 'Ethernet II',
    ip: 'Internet Protocol Version 4',
    ipv6: 'Internet Protocol Version 6',
    tcp: 'Transmission Control Protocol',
    udp: 'User Datagram Protocol',
    dns: 'Domain Name System',
    http: 'Hypertext Transfer Protocol',
    tls: 'Transport Layer Security',
    arp: 'Address Resolution Protocol',
    icmp: 'Internet Control Message Protocol',
  };
  return names[name] || name.toUpperCase();
};

// Parse layer fields into tree nodes
const parseLayerFields = (data, prefix) => {
  const fields = [];
  for (const [key, value] of Object.entries(data)) {
    const path = `${prefix}.${key}`;

    // Format field name (remove prefix like "tcp_tcp_")
    let displayName = key;
    const prefixPattern = new RegExp(`^${prefix}_${prefix}_`);
    displayName = displayName.replace(prefixPattern, '');
    displayName = displayName.replace(/_/g, ' ');

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      fields.push({
        name: displayName,
        path,
        children: parseLayerFields(value, path),
      });
    } else {
      fields.push({
        name: displayName,
        value: String(value),
        path,
      });
    }
  }
  return fields;
};
</script>

<template>
  <div class="details-container">
    <div v-if="activePacketIndex === null" class="no-selection">
      Select a packet to view details
    </div>
    <div v-else-if="isLoading" class="loading">
      <div class="spinner"></div>
    </div>
    <div v-else-if="!activePacketDetails" class="no-selection">
      No details available
    </div>
    <div v-else class="tree">
      <template v-for="layer in detailsTree" :key="layer.path">
        <div
          class="layer-header"
          :class="{ collapsed: isCollapsed(layer.path) }"
          @click="toggleCollapse(layer.path)"
        >
          <span class="toggle">{{ isCollapsed(layer.path) ? '▶' : '▼' }}</span>
          {{ layer.name }}
        </div>
        <div v-if="!isCollapsed(layer.path)" class="children">
          <template v-for="field in layer.children" :key="field.path">
            <div v-if="field.children" class="field-parent">
              <div
                class="field-header"
                :class="{ collapsed: isCollapsed(field.path) }"
                @click="toggleCollapse(field.path)"
              >
                <span class="toggle">{{ isCollapsed(field.path) ? '▶' : '▼' }}</span>
                {{ field.name }}
              </div>
              <div v-if="!isCollapsed(field.path)" class="nested-children">
                <div v-for="child in field.children" :key="child.path" class="field">
                  <span class="field-name">{{ child.name }}:</span>
                  <span class="field-value">{{ child.value }}</span>
                </div>
              </div>
            </div>
            <div v-else class="field">
              <span class="field-name">{{ field.name }}:</span>
              <span class="field-value">{{ field.value }}</span>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.details-container {
  flex-grow: 1;
  overflow: auto;
  min-width: 0;
  min-height: 0;
  background-color: #1e1e1e;
  font-family: var(--ws-font-family-monospace);
  font-size: 12px;
  line-height: 20px;
  color: #ccc;
}

.no-selection {
  padding: 20px;
  color: #b0b0b0;
  text-align: center;
  font-size: 15px;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 100px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid transparent;
  border-top: 4px solid #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.tree {
  padding: 4px;
}

.layer-header {
  padding: 2px 4px;
  background: #2d2d30;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
  color: #ccc;
}

.layer-header:hover {
  background: #3e3e42;
}

.toggle {
  display: inline-block;
  width: 16px;
  text-align: center;
  font-size: 10px;
}

.children {
  padding-left: 20px;
}

.field-parent {
  margin: 2px 0;
}

.field-header {
  cursor: pointer;
  user-select: none;
}

.field-header:hover {
  background: #3e3e42;
}

.nested-children {
  padding-left: 20px;
}

.field {
  padding: 1px 4px;
}

.field:hover {
  background: #3e3e42;
}

.field-name {
  color: #ccc;
}

.field-value {
  color: #3794ff;
  margin-left: 8px;
}
</style>
