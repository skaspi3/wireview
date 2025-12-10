<script setup>
import { activePacketIndex, activePacketHex } from "../../globals";
import { isFetchingBatch } from "../../packetCache";
</script>

<template>
  <div class="packet-bytes-wrapper">
    <div v-if="activePacketIndex === null" class="no-selection">
      Select a packet to view hex dump
    </div>
    <div v-else-if="isFetchingBatch && !activePacketHex" class="loading">
      <div class="spinner"></div>
    </div>
    <div v-else-if="!activePacketHex" class="no-selection">
      No hex data available
    </div>
    <pre v-else class="hex-display">{{ activePacketHex }}</pre>
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
  line-height: 1.4;
  white-space: pre;
  overflow: auto;
  color: #ccc;
}
</style>
