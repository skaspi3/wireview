<script setup>
import { ref, watch } from "vue";
import { packets, activePacketIndex, trackFetched, trackSent } from "../../globals";

// Hex dump content
const hexDump = ref('');
const isLoading = ref(false);

// Fetch hex dump when selection changes
watch(activePacketIndex, async (index) => {
  if (index === null || index < 0 || index >= packets.value.length) {
    hexDump.value = '';
    return;
  }

  const packet = packets.value[index];
  if (!packet) {
    hexDump.value = '';
    return;
  }

  isLoading.value = true;
  try {
    const url = `/api/packet/hex?frame=${packet.number}`;
    trackSent(url.length);
    const response = await fetch(url);
    if (response.ok) {
      const text = await response.text();
      trackFetched(text.length);
      hexDump.value = text;
    } else {
      hexDump.value = 'Failed to load hex dump';
    }
  } catch (e) {
    console.error("Failed to fetch hex dump:", e);
    hexDump.value = 'Error loading hex dump';
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="packet-bytes-wrapper">
    <div v-if="activePacketIndex === null" class="no-selection">
      Select a packet to view hex dump
    </div>
    <div v-else-if="isLoading" class="loading">
      <div class="spinner"></div>
    </div>
    <pre v-else class="hex-display">{{ hexDump }}</pre>
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
  color: #888;
  text-align: center;
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
