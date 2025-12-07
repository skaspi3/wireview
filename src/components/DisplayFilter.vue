<script setup>
import { ref, watch, computed } from "vue";
import { packets } from "../globals";
import FilterApplyIcon from "./icons/FilterApplyIcon.vue";

// Display filter state
const displayFilterInput = ref("");
const activeFilter = ref("");
const isFilterValid = ref(null);

// Filtered packets (exported for use by PacketList)
const filteredPackets = defineModel('filteredPackets', { default: null });

// Simple filter validation and application
// Supports: protocol names, ip addresses, port numbers
const validateFilter = (filter) => {
  if (!filter.trim()) return true;

  // Basic syntax check - allow common filter patterns
  const validPatterns = [
    /^(tcp|udp|icmp|arp|dns|http|tls|ip|ipv6|ethernet)$/i,
    /^ip\s*(==|!=|contains)\s*[\d.]+$/i,
    /^port\s*(==|!=)\s*\d+$/i,
    /^src\s*(==|!=|contains)\s*.+$/i,
    /^dst\s*(==|!=|contains)\s*.+$/i,
    /^protocol\s*(==|!=)\s*\w+$/i,
    /^.+\s+(and|or|&&|\|\|)\s+.+$/i,
  ];

  return validPatterns.some(p => p.test(filter.trim()));
};

// Apply filter to packets
const applyFilter = (filter, pkts) => {
  if (!filter.trim()) return pkts;

  const f = filter.trim().toLowerCase();

  return pkts.filter(pkt => {
    // Protocol filter
    if (/^(tcp|udp|icmp|arp|dns|http|tls|ip|ipv6)$/i.test(f)) {
      return pkt.protocol.toLowerCase() === f;
    }

    // Contains search (default behavior for simple strings)
    const searchStr = f;
    return (
      pkt.protocol.toLowerCase().includes(searchStr) ||
      pkt.src.toLowerCase().includes(searchStr) ||
      pkt.dst.toLowerCase().includes(searchStr) ||
      pkt.info.toLowerCase().includes(searchStr)
    );
  });
};

// Watch input for validation
watch(displayFilterInput, (filter) => {
  if (!filter.trim()) {
    isFilterValid.value = null;
    return;
  }
  isFilterValid.value = validateFilter(filter);
});

// Handle filter submission
const handleSubmit = () => {
  if (isFilterValid.value === false) return;
  activeFilter.value = displayFilterInput.value.trim();
};

// Clear filter
const clearFilter = () => {
  displayFilterInput.value = "";
  activeFilter.value = "";
  isFilterValid.value = null;
};

// Export active filter for parent to use
defineExpose({ activeFilter, applyFilter });
</script>

<template>
  <div class="filter-container">
    <form class="filter-bar" @submit.prevent="handleSubmit">
      <div class="input-wrapper">
        <input
          type="text"
          name="dfilter"
          v-model="displayFilterInput"
          autocomplete="off"
          :placeholder="
            activeFilter
              ? `Current filter: ${activeFilter}`
              : 'Apply a display filter ... (e.g. tcp, udp, 192.168)'
          "
          :style="{
            '--ws-display-filter-bg':
              isFilterValid === null
                ? 'transparent'
                : isFilterValid
                ? 'var(--ws-ugly-green)'
                : 'var(--ws-ugly-red)',
            color: isFilterValid !== null ? '#ffffff' : 'var(--ws-text-color)',
          }"
        />
      </div>
      <button
        type="button"
        class="clear-filter"
        title="Clear display filter"
        v-if="displayFilterInput || activeFilter"
        @click="clearFilter"
      >
        ✕
      </button>
      <button
        type="submit"
        class="apply-filter"
        title="Apply display filter"
        :disabled="isFilterValid === false || activeFilter === displayFilterInput"
      >
        <FilterApplyIcon />
      </button>
    </form>
  </div>
</template>

<style scoped>
.filter-container {
  display: flex;
  padding: 4px;
  border-top: var(--ws-pane-border);
  border-bottom: var(--ws-pane-border);
}

.filter-container .filter-bar {
  flex-grow: 1;
  display: flex;
  background-color: var(--ws-almost-white);
  border: 1px solid var(--ws-darker-gray);
  border-radius: 3px;
}

.input-wrapper {
  flex-grow: 1;
  position: relative;
  display: flex;
}

.filter-container .filter-bar input[type="text"] {
  flex-grow: 1;
  outline: none;
  border: none;
  background-color: var(--ws-display-filter-bg);
  color: var(--ws-text-color);
  padding: 4px 7px;
}

.filter-container .filter-bar input[type="text"]::placeholder {
  color: #999;
  opacity: 1;
}

.apply-filter {
  border: none;
  background: none;
  padding: 0;
  outline: none;
  height: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  align-self: center;
  margin: 0 5px;
  filter: brightness(1.75);
  opacity: 0.9;
  cursor: pointer;
}

.apply-filter:disabled {
  pointer-events: none;
  opacity: 0.5;
}

.apply-filter:hover {
  filter: brightness(1.25);
}

.apply-filter:active {
  filter: brightness(1);
}

.apply-filter svg {
  height: 100%;
}

.clear-filter {
  border: none;
  background: none;
  padding: 0 5px;
  outline: none;
  cursor: pointer;
  color: var(--ws-darkest-gray);
  font-weight: bold;
  font-size: 1.1em;
  display: flex;
  align-items: center;
}

.clear-filter:hover {
  color: var(--ws-text-color);
  background-color: var(--ws-dark-gray);
}
</style>
