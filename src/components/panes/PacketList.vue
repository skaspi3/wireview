<script setup>
import { computed, ref, watch, onMounted, useTemplateRef } from "vue";
import { useResizeObserver, useScroll } from "@vueuse/core";
import { packets, activePacketIndex, displayFilter, allPackets } from "../../globals";

// Row height for virtual scrolling
const rowHeight = 20;
const headerHeight = 24;

// Sorting state
const sortColumn = ref(null);  // 'number', 'time', 'src', 'dst', 'protocol', 'length'
const sortAscending = ref(true);

// Get sorted packets - returns sorted copy only when sorting is active
const getSortedPackets = () => {
  if (!sortColumn.value || packets.value.length === 0) {
    return packets.value;
  }

  const sorted = [...packets.value];
  const col = sortColumn.value;
  const asc = sortAscending.value;

  sorted.sort((a, b) => {
    let valA, valB;

    switch (col) {
      case 'number':
        valA = a.number;
        valB = b.number;
        break;
      case 'time':
        valA = a.time;
        valB = b.time;
        break;
      case 'src':
        valA = a.src || '';
        valB = b.src || '';
        return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      case 'dst':
        valA = a.dst || '';
        valB = b.dst || '';
        return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      case 'protocol':
        valA = a.protocol || '';
        valB = b.protocol || '';
        return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      case 'length':
        valA = a.length;
        valB = b.length;
        break;
      default:
        return 0;
    }

    if (valA < valB) return asc ? -1 : 1;
    if (valA > valB) return asc ? 1 : -1;
    return 0;
  });

  return sorted;
};

// Handle column sort click
const handleSort = (column) => {
  // Clear display filter when sorting
  if (displayFilter.value) {
    displayFilter.value = '';
    // Restore all packets
    if (allPackets.value.length > 0) {
      packets.value = [...allPackets.value];
    }
  }

  if (sortColumn.value === column) {
    // Toggle direction
    sortAscending.value = !sortAscending.value;
  } else {
    // New column, start ascending
    sortColumn.value = column;
    sortAscending.value = true;
  }
};

// Clear sort when packets change significantly (new capture)
watch(() => packets.value.length, (newLen, oldLen) => {
  if (newLen === 0 || (oldLen > 0 && newLen < oldLen / 2)) {
    sortColumn.value = null;
    sortAscending.value = true;
  }
});

// State
const clientHeight = ref(400);
const clientWidth = ref(800);
const scrollY = ref(0);

// Template ref for scrollable element
const scrollableEl = useTemplateRef("packet-list-scrollable");

// Computed values
const visibleRowCount = computed(() => {
  const available = Math.max(0, clientHeight.value - headerHeight);
  return Math.floor(available / rowHeight);
});

const extraRows = computed(() => {
  // Use packets.value.length directly to maintain reactivity with shallowRef
  return Math.max(0, packets.value.length - visibleRowCount.value);
});

const firstRowIndex = computed(() => {
  return Math.min(scrollY.value, extraRows.value);
});

const visiblePackets = computed(() => {
  const start = firstRowIndex.value;
  const end = start + visibleRowCount.value + 1;
  // Apply sorting only when displaying
  const displayPackets = getSortedPackets();
  return displayPackets.slice(start, end);
});

// Resize observer
onMounted(() => {
  if (scrollableEl.value) {
    clientHeight.value = scrollableEl.value.clientHeight || 400;
    clientWidth.value = scrollableEl.value.clientWidth || 800;
  }
});

useResizeObserver(scrollableEl, (entries) => {
  const entry = entries[0];
  if (entry.contentRect.height > 0) clientHeight.value = entry.contentRect.height;
  if (entry.contentRect.width > 0) clientWidth.value = entry.contentRect.width;
});

// Scroll handling
const { y: scrollYPos } = useScroll(scrollableEl);
watch(scrollYPos, (val) => {
  scrollY.value = Math.floor(val);
});

// Handle mousewheel
const handleWheel = (event) => {
  if (!event.deltaY) return;
  event.preventDefault();
  scrollY.value = Math.max(0, Math.min(extraRows.value, scrollY.value + Math.round(event.deltaY / rowHeight)));
  if (scrollableEl.value) {
    scrollableEl.value.scrollTop = scrollY.value;
  }
};

// Select packet - find original index in packets array
const selectPacket = (sortedIndex) => {
  const sorted = getSortedPackets();
  const pkt = sorted[sortedIndex];
  if (!pkt) return;

  // Find original index in packets array
  const originalIndex = packets.value.findIndex(p => p.number === pkt.number);
  if (originalIndex !== -1) {
    activePacketIndex.value = originalIndex;
  }
};

// Helper: find current position in sorted list
const getCurrentSortedIndex = () => {
  if (activePacketIndex.value === null) return -1;
  const selectedNumber = packets.value[activePacketIndex.value]?.number;
  const sorted = getSortedPackets();
  return sorted.findIndex(p => p.number === selectedNumber);
};

// Helper: select packet by sorted index
const selectBySortedIndex = (sortedIdx) => {
  const sorted = getSortedPackets();
  if (sortedIdx < 0 || sortedIdx >= sorted.length) return;
  const pkt = sorted[sortedIdx];
  const originalIdx = packets.value.findIndex(p => p.number === pkt.number);
  if (originalIdx !== -1) {
    activePacketIndex.value = originalIdx;
  }
};

// Keyboard navigation
const handleKeydown = (event) => {
  if (packets.value.length === 0) return;

  const currentSortedIdx = getCurrentSortedIndex();
  const sorted = getSortedPackets();

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (currentSortedIdx === -1) {
      selectBySortedIndex(0);
    } else if (currentSortedIdx < sorted.length - 1) {
      selectBySortedIndex(currentSortedIdx + 1);
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (currentSortedIdx === -1) {
      selectBySortedIndex(0);
    } else if (currentSortedIdx > 0) {
      selectBySortedIndex(currentSortedIdx - 1);
    }
  } else if (event.key === 'Home') {
    event.preventDefault();
    selectBySortedIndex(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    selectBySortedIndex(sorted.length - 1);
  } else if (event.key === 'PageDown') {
    event.preventDefault();
    if (currentSortedIdx === -1) {
      selectBySortedIndex(0);
    } else {
      selectBySortedIndex(Math.min(sorted.length - 1, currentSortedIdx + visibleRowCount.value));
    }
  } else if (event.key === 'PageUp') {
    event.preventDefault();
    if (currentSortedIdx === -1) {
      selectBySortedIndex(0);
    } else {
      selectBySortedIndex(Math.max(0, currentSortedIdx - visibleRowCount.value));
    }
  }
};

// Auto-scroll to bottom when new packets arrive (only if not sorting)
watch(() => packets.value.length, (newLen, oldLen) => {
  if (!sortColumn.value && newLen > oldLen && scrollY.value >= oldLen - visibleRowCount.value - 1) {
    // Was at bottom, stay at bottom
    scrollY.value = Math.max(0, newLen - visibleRowCount.value);
    if (scrollableEl.value) {
      scrollableEl.value.scrollTop = scrollY.value;
    }
  }
});

// Ensure active packet is visible (use sorted index when sorting)
watch(activePacketIndex, (index) => {
  if (index === null) return;

  // Find position in sorted list
  const sortedIdx = getCurrentSortedIndex();
  if (sortedIdx === -1) return;

  if (sortedIdx < firstRowIndex.value) {
    scrollY.value = sortedIdx;
  } else if (sortedIdx >= firstRowIndex.value + visibleRowCount.value) {
    scrollY.value = sortedIdx - visibleRowCount.value + 1;
  }
  if (scrollableEl.value) {
    scrollableEl.value.scrollTop = scrollY.value;
  }
});

// Protocol colors (Wireshark light-style)
const getProtocolColor = (protocol) => {
  const colors = {
    'TCP': '#e7e6ff',
    'UDP': '#daeeff',
    'MDNS': '#daeeff',    // mDNS - light blue (same as UDP)
    'DNS': '#daffe7',
    'DHCP': '#daffe7',
    'DHCPv6': '#daffe7',  // DHCPv6 - light green (same as DNS/DHCP)
    'HTTP': '#a0ffa0',
    'TLS': '#e7e6ff',
    'ICMP': '#fce0ff',
    'ICMPv4': '#fce0ff',
    'ICMPv6': '#fce0ff',
    'IGMP': '#fce0ff',
    'IGMPv1': '#fce0ff',
    'IGMPv2': '#fce0ff',
    'IGMPv3': '#fce0ff',
    'ARP': '#faf0d7',
    'IPv6': '#e0e0e0',
    'IP': '#e0e0e0',
  };
  return colors[protocol] || '#ffffff';
};

// Format time
const formatTime = (time) => {
  if (typeof time !== 'number') return '0.000000';
  return time.toFixed(6);
};
</script>

<template>
  <div
    class="packet-list-scrollable"
    ref="packet-list-scrollable"
    tabindex="0"
    @wheel="handleWheel"
    @keydown="handleKeydown"
  >
    <div class="content">
      <table class="packet-table">
        <thead>
          <tr>
            <th class="col-no sortable" @click="handleSort('number')">
              No.<span v-if="sortColumn === 'number'" class="sort-indicator">{{ sortAscending ? '▲' : '▼' }}</span>
            </th>
            <th class="col-time sortable" @click="handleSort('time')">
              Time<span v-if="sortColumn === 'time'" class="sort-indicator">{{ sortAscending ? '▲' : '▼' }}</span>
            </th>
            <th class="col-src sortable" @click="handleSort('src')">
              Source<span v-if="sortColumn === 'src'" class="sort-indicator">{{ sortAscending ? '▲' : '▼' }}</span>
            </th>
            <th class="col-dst sortable" @click="handleSort('dst')">
              Destination<span v-if="sortColumn === 'dst'" class="sort-indicator">{{ sortAscending ? '▲' : '▼' }}</span>
            </th>
            <th class="col-proto sortable" @click="handleSort('protocol')">
              Protocol<span v-if="sortColumn === 'protocol'" class="sort-indicator">{{ sortAscending ? '▲' : '▼' }}</span>
            </th>
            <th class="col-len sortable" @click="handleSort('length')">
              Length<span v-if="sortColumn === 'length'" class="sort-indicator">{{ sortAscending ? '▲' : '▼' }}</span>
            </th>
            <th class="col-info">Info</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(pkt, i) in visiblePackets"
            :key="pkt.number"
            :class="{ selected: activePacketIndex !== null && packets[activePacketIndex]?.number === pkt.number }"
            :style="{ backgroundColor: getProtocolColor(pkt.protocol) }"
            @click="selectPacket(firstRowIndex + i)"
          >
            <td class="col-no">{{ pkt.number }}</td>
            <td class="col-time">{{ formatTime(pkt.time) }}</td>
            <td class="col-src">{{ pkt.src }}</td>
            <td class="col-dst">{{ pkt.dst }}</td>
            <td class="col-proto">{{ pkt.protocol }}</td>
            <td class="col-len">{{ pkt.length }}</td>
            <td class="col-info">{{ pkt.info }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Spacer for scrolling -->
    <div :style="{ height: extraRows + 'px' }"></div>
  </div>
</template>

<style scoped>
.packet-list-scrollable {
  flex-grow: 1;
  position: relative;
  overflow-y: scroll;
  overflow-x: auto;
  height: 100%;
  width: 100%;
  background: #e8f4fc;
  outline: none;
}

.packet-list-scrollable:focus {
  outline: 2px solid #3875d7;
  outline-offset: -2px;
}

.content {
  position: sticky;
  top: 0;
  width: 100%;
}

.packet-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--ws-font-family-monospace);
  font-size: 12px;
  color: #000;
}

.packet-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

.packet-table th {
  background: #2d2d30;
  border: 1px solid #3e3e42;
  padding: 4px 8px;
  text-align: left;
  font-weight: normal;
  white-space: nowrap;
  color: #e5e5e5;
  font-size: 13px;
}

.packet-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.packet-table th.sortable:hover {
  background: #3d3d40;
  color: #fff;
}

.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
  color: #60a5fa;
}

.packet-table td {
  border: none;
  padding: 2px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 20px;
  line-height: 20px;
}

.packet-table tbody tr {
  cursor: pointer;
}

.packet-table tbody tr:hover {
  filter: brightness(0.95);
}

.packet-table tbody tr.selected {
  background-color: #3875d7 !important;
  color: #fff;
}

.col-no { width: 60px; text-align: right; }
.col-time { width: 100px; }
.col-src { width: 150px; }
.col-dst { width: 150px; }
.col-proto { width: 70px; }
.col-len { width: 60px; text-align: right; }
.col-info { flex: 1; }
</style>
