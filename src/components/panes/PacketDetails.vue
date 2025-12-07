<script setup>
import { ref, watch, computed } from "vue";
import { packets, activePacketIndex, activePacketDetails, DEBUG } from "../../globals";

// Collapsed state for tree nodes
const collapsed = ref({});

// Toggle collapse state
const toggleCollapse = (path) => {
  collapsed.value[path] = !collapsed.value[path];
};

// Check if collapsed
const isCollapsed = (path) => collapsed.value[path] !== false;

// Fetch packet details when selection changes
watch(activePacketIndex, async (index) => {
  if (index === null || index < 0 || index >= packets.value.length) {
    activePacketDetails.value = null;
    return;
  }

  const packet = packets.value[index];
  if (!packet) {
    activePacketDetails.value = null;
    return;
  }

  try {
    // Fetch detailed packet info from server
    const response = await fetch(`/api/packet?frame=${packet.number}`);
    if (response.ok) {
      const data = await response.json();
      activePacketDetails.value = data;
      collapsed.value = {};  // Reset collapsed state for new packet
    } else {
      activePacketDetails.value = null;
    }
  } catch (e) {
    console.error("Failed to fetch packet details:", e);
    activePacketDetails.value = null;
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
    <div v-if="!activePacketDetails" class="no-selection">
      Select a packet to view details
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
  background-color: #f5f5f5;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 20px;
}

.no-selection {
  padding: 20px;
  color: #666;
  text-align: center;
}

.tree {
  padding: 4px;
}

.layer-header {
  padding: 2px 4px;
  background: #e0e0e0;
  cursor: pointer;
  font-weight: bold;
  user-select: none;
}

.layer-header:hover {
  background: #d0d0d0;
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
  background: #e8e8e8;
}

.nested-children {
  padding-left: 20px;
}

.field {
  padding: 1px 4px;
}

.field:hover {
  background: #e0e8f0;
}

.field-name {
  color: #333;
}

.field-value {
  color: #0066cc;
  margin-left: 8px;
}
</style>
