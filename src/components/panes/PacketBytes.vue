<script setup>
import { computed } from "vue";
import { activePacketIndex, activePacketRawHex, highlightedByteRange } from "../../globals";
import { isFetchingBatch } from "../../packetCache";

// Parse raw hex into bytes array
const bytes = computed(() => {
  if (!activePacketRawHex.value) return [];
  const result = [];
  const hex = activePacketRawHex.value;
  for (let i = 0; i < hex.length; i += 2) {
    result.push(hex.substr(i, 2));
  }
  return result;
});

// Group bytes into rows of 16
const hexRows = computed(() => {
  const rows = [];
  const byteArray = bytes.value;
  for (let offset = 0; offset < byteArray.length; offset += 16) {
    const chunk = byteArray.slice(offset, offset + 16);
    rows.push({
      offset,
      bytes: chunk,
      ascii: chunk.map(b => {
        const code = parseInt(b, 16);
        return (code >= 32 && code < 127) ? String.fromCharCode(code) : '.';
      }).join('')
    });
  }
  return rows;
});

// Check if a byte is in the highlighted range
const isHighlighted = (byteIndex) => {
  const range = highlightedByteRange.value;
  if (!range) return false;
  return byteIndex >= range.start && byteIndex < range.end;
};

// Format offset as hex
const formatOffset = (offset) => {
  return offset.toString(16).padStart(4, '0');
};

// Handle mouse enter on a byte
const onByteHover = (byteIndex) => {
  // When hovering on a single byte, highlight just that byte
  highlightedByteRange.value = { start: byteIndex, end: byteIndex + 1 };
};

// Handle mouse leave from hex area
const onHexLeave = () => {
  highlightedByteRange.value = null;
};
</script>

<template>
  <div class="packet-bytes-wrapper">
    <div v-if="activePacketIndex === null" class="no-selection">
      Select a packet to view hex dump
    </div>
    <div v-else-if="isFetchingBatch && bytes.length === 0" class="loading">
      <div class="spinner"></div>
    </div>
    <div v-else-if="bytes.length === 0" class="no-selection">
      No hex data available
    </div>
    <div v-else class="hex-display" @mouseleave="onHexLeave">
      <div v-for="row in hexRows" :key="row.offset" class="hex-row">
        <!-- Offset column -->
        <span class="offset">{{ formatOffset(row.offset) }}</span>

        <!-- Hex bytes - first 8 -->
        <span class="hex-group">
          <span
            v-for="(byte, i) in row.bytes.slice(0, 8)"
            :key="i"
            class="hex-byte"
            :class="{ highlighted: isHighlighted(row.offset + i) }"
            @mouseenter="onByteHover(row.offset + i)"
          >{{ byte }}</span>
        </span>

        <!-- Separator between groups -->
        <span class="hex-separator"></span>

        <!-- Hex bytes - second 8 -->
        <span class="hex-group">
          <span
            v-for="(byte, i) in row.bytes.slice(8, 16)"
            :key="i + 8"
            class="hex-byte"
            :class="{ highlighted: isHighlighted(row.offset + 8 + i) }"
            @mouseenter="onByteHover(row.offset + 8 + i)"
          >{{ byte }}</span>
        </span>

        <!-- ASCII column -->
        <span class="ascii">
          <span
            v-for="(char, i) in row.ascii"
            :key="i"
            class="ascii-char"
            :class="{ highlighted: isHighlighted(row.offset + i) }"
            @mouseenter="onByteHover(row.offset + i)"
          >{{ char }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.packet-bytes-wrapper {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: #1e1e1e;
  overflow: auto;
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

.hex-display {
  margin: 0;
  padding: 8px;
  font-family: var(--ws-font-family-monospace);
  font-size: 12px;
  line-height: 1.5;
  color: #ccc;
}

.hex-row {
  display: flex;
  white-space: nowrap;
}

.offset {
  color: #808080;
  margin-right: 12px;
  user-select: none;
}

.hex-group {
  display: inline-flex;
}

.hex-byte {
  padding: 1px 2px;
  margin: 0 1px;
  cursor: pointer;
  border-radius: 2px;
}

.hex-byte:hover {
  background: #3a3a3a;
}

.hex-byte.highlighted {
  background: #264f78;
  color: #fff;
}

.hex-separator {
  width: 8px;
}

.ascii {
  margin-left: 16px;
  color: #9cdcfe;
}

.ascii-char {
  padding: 1px 0;
  cursor: pointer;
}

.ascii-char:hover {
  background: #3a3a3a;
}

.ascii-char.highlighted {
  background: #264f78;
  color: #fff;
}
</style>
