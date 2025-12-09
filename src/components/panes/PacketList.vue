<script setup>
import { computed, ref, watch, onMounted, useTemplateRef } from "vue";
import { useResizeObserver, useScroll } from "@vueuse/core";
import { packets, activePacketIndex } from "../../globals";

// Row height for virtual scrolling
const rowHeight = 20;
const headerHeight = 24;

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
  return Math.max(0, packets.value.length - visibleRowCount.value);
});

const firstRowIndex = computed(() => {
  return Math.min(scrollY.value, extraRows.value);
});

const visiblePackets = computed(() => {
  const start = firstRowIndex.value;
  const end = start + visibleRowCount.value + 1;
  return packets.value.slice(start, end);
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

// Select packet
const selectPacket = (index) => {
  activePacketIndex.value = index;
};

// Keyboard navigation
const handleKeydown = (event) => {
  if (packets.value.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (activePacketIndex.value === null) {
      activePacketIndex.value = 0;
    } else if (activePacketIndex.value < packets.value.length - 1) {
      activePacketIndex.value++;
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (activePacketIndex.value === null) {
      activePacketIndex.value = 0;
    } else if (activePacketIndex.value > 0) {
      activePacketIndex.value--;
    }
  } else if (event.key === 'Home') {
    event.preventDefault();
    activePacketIndex.value = 0;
  } else if (event.key === 'End') {
    event.preventDefault();
    activePacketIndex.value = packets.value.length - 1;
  } else if (event.key === 'PageDown') {
    event.preventDefault();
    if (activePacketIndex.value === null) {
      activePacketIndex.value = 0;
    } else {
      activePacketIndex.value = Math.min(packets.value.length - 1, activePacketIndex.value + visibleRowCount.value);
    }
  } else if (event.key === 'PageUp') {
    event.preventDefault();
    if (activePacketIndex.value === null) {
      activePacketIndex.value = 0;
    } else {
      activePacketIndex.value = Math.max(0, activePacketIndex.value - visibleRowCount.value);
    }
  }
};

// Auto-scroll to bottom when new packets arrive
watch(() => packets.value.length, (newLen, oldLen) => {
  if (newLen > oldLen && scrollY.value >= oldLen - visibleRowCount.value - 1) {
    // Was at bottom, stay at bottom
    scrollY.value = Math.max(0, newLen - visibleRowCount.value);
    if (scrollableEl.value) {
      scrollableEl.value.scrollTop = scrollY.value;
    }
  }
});

// Ensure active packet is visible
watch(activePacketIndex, (index) => {
  if (index === null) return;
  if (index < firstRowIndex.value) {
    scrollY.value = index;
  } else if (index >= firstRowIndex.value + visibleRowCount.value) {
    scrollY.value = index - visibleRowCount.value + 1;
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
    'DNS': '#daffe7',
    'HTTP': '#a0ffa0',
    'TLS': '#e7e6ff',
    'ICMP': '#fce0ff',
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
            <th class="col-no">No.</th>
            <th class="col-time">Time</th>
            <th class="col-src">Source</th>
            <th class="col-dst">Destination</th>
            <th class="col-proto">Protocol</th>
            <th class="col-len">Length</th>
            <th class="col-info">Info</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(pkt, i) in visiblePackets"
            :key="pkt.number"
            :class="{ selected: activePacketIndex === firstRowIndex + i }"
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
  color: #ccc;
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
