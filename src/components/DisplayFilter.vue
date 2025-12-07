<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { manager } from "../globals";
import FilterApplyIcon from "./icons/FilterApplyIcon.vue";

// Common Wireshark display filter expressions
const filterSuggestions = [
  // Frame
  { field: "frame.number", desc: "Frame number" },
  { field: "frame.time", desc: "Frame timestamp" },
  { field: "frame.len", desc: "Frame length" },
  { field: "frame.protocols", desc: "Protocols in frame" },
  // Ethernet
  { field: "eth", desc: "Ethernet protocol" },
  { field: "eth.addr", desc: "Ethernet address" },
  { field: "eth.src", desc: "Ethernet source" },
  { field: "eth.dst", desc: "Ethernet destination" },
  { field: "eth.type", desc: "Ethernet type" },
  // ARP
  { field: "arp", desc: "ARP protocol" },
  { field: "arp.opcode", desc: "ARP opcode" },
  { field: "arp.src.proto_ipv4", desc: "ARP sender IP" },
  { field: "arp.dst.proto_ipv4", desc: "ARP target IP" },
  { field: "arp.src.hw_mac", desc: "ARP sender MAC" },
  { field: "arp.dst.hw_mac", desc: "ARP target MAC" },
  // IP
  { field: "ip", desc: "IPv4 protocol" },
  { field: "ip.addr", desc: "IPv4 address" },
  { field: "ip.src", desc: "IPv4 source" },
  { field: "ip.dst", desc: "IPv4 destination" },
  { field: "ip.proto", desc: "IPv4 protocol number" },
  { field: "ip.ttl", desc: "IPv4 TTL" },
  { field: "ip.len", desc: "IPv4 total length" },
  { field: "ip.flags", desc: "IPv4 flags" },
  { field: "ip.flags.df", desc: "Don't Fragment" },
  { field: "ip.flags.mf", desc: "More Fragments" },
  { field: "ip.frag_offset", desc: "Fragment offset" },
  { field: "ip.id", desc: "IPv4 identification" },
  { field: "ip.checksum", desc: "IPv4 checksum" },
  // IPv6
  { field: "ipv6", desc: "IPv6 protocol" },
  { field: "ipv6.addr", desc: "IPv6 address" },
  { field: "ipv6.src", desc: "IPv6 source" },
  { field: "ipv6.dst", desc: "IPv6 destination" },
  { field: "ipv6.hlim", desc: "IPv6 hop limit" },
  { field: "ipv6.nxt", desc: "IPv6 next header" },
  { field: "ipv6.plen", desc: "IPv6 payload length" },
  // TCP
  { field: "tcp", desc: "TCP protocol" },
  { field: "tcp.port", desc: "TCP port" },
  { field: "tcp.srcport", desc: "TCP source port" },
  { field: "tcp.dstport", desc: "TCP destination port" },
  { field: "tcp.seq", desc: "Sequence number" },
  { field: "tcp.ack", desc: "Acknowledgment number" },
  { field: "tcp.len", desc: "TCP segment length" },
  { field: "tcp.window_size", desc: "Window size" },
  { field: "tcp.flags", desc: "TCP flags" },
  { field: "tcp.flags.syn", desc: "SYN flag" },
  { field: "tcp.flags.ack", desc: "ACK flag" },
  { field: "tcp.flags.fin", desc: "FIN flag" },
  { field: "tcp.flags.rst", desc: "RST flag" },
  { field: "tcp.flags.push", desc: "PSH flag" },
  { field: "tcp.flags.urg", desc: "URG flag" },
  { field: "tcp.stream", desc: "TCP stream index" },
  { field: "tcp.analysis.retransmission", desc: "Retransmission" },
  { field: "tcp.analysis.duplicate_ack", desc: "Duplicate ACK" },
  { field: "tcp.analysis.zero_window", desc: "Zero window" },
  // UDP
  { field: "udp", desc: "UDP protocol" },
  { field: "udp.port", desc: "UDP port" },
  { field: "udp.srcport", desc: "UDP source port" },
  { field: "udp.dstport", desc: "UDP destination port" },
  { field: "udp.length", desc: "UDP length" },
  { field: "udp.checksum", desc: "UDP checksum" },
  { field: "udp.stream", desc: "UDP stream index" },
  // ICMP
  { field: "icmp", desc: "ICMP protocol" },
  { field: "icmp.type", desc: "ICMP type" },
  { field: "icmp.code", desc: "ICMP code" },
  { field: "icmp.checksum", desc: "ICMP checksum" },
  { field: "icmp.ident", desc: "ICMP identifier" },
  { field: "icmp.seq", desc: "ICMP sequence" },
  // ICMPv6
  { field: "icmpv6", desc: "ICMPv6 protocol" },
  { field: "icmpv6.type", desc: "ICMPv6 type" },
  { field: "icmpv6.code", desc: "ICMPv6 code" },
  // DNS
  { field: "dns", desc: "DNS protocol" },
  { field: "dns.qry.name", desc: "Query name" },
  { field: "dns.qry.type", desc: "Query type" },
  { field: "dns.resp.name", desc: "Response name" },
  { field: "dns.resp.type", desc: "Response type" },
  { field: "dns.flags.response", desc: "Is response" },
  { field: "dns.flags.rcode", desc: "Response code" },
  { field: "dns.a", desc: "A record" },
  { field: "dns.aaaa", desc: "AAAA record" },
  { field: "dns.cname", desc: "CNAME record" },
  { field: "dns.mx", desc: "MX record" },
  // HTTP
  { field: "http", desc: "HTTP protocol" },
  { field: "http.request", desc: "HTTP request" },
  { field: "http.response", desc: "HTTP response" },
  { field: "http.request.method", desc: "HTTP method" },
  { field: "http.request.uri", desc: "Request URI" },
  { field: "http.request.full_uri", desc: "Full URI" },
  { field: "http.host", desc: "Host header" },
  { field: "http.user_agent", desc: "User agent" },
  { field: "http.response.code", desc: "Response code" },
  { field: "http.content_type", desc: "Content type" },
  { field: "http.content_length", desc: "Content length" },
  { field: "http.cookie", desc: "Cookie" },
  { field: "http.set_cookie", desc: "Set-Cookie" },
  { field: "http.referer", desc: "Referer" },
  { field: "http.location", desc: "Location" },
  // TLS/SSL
  { field: "tls", desc: "TLS protocol" },
  { field: "tls.handshake", desc: "TLS handshake" },
  { field: "tls.handshake.type", desc: "Handshake type" },
  { field: "tls.record.version", desc: "TLS version" },
  { field: "tls.handshake.extensions_server_name", desc: "SNI" },
  { field: "ssl", desc: "SSL/TLS (legacy)" },
  // DHCP
  { field: "dhcp", desc: "DHCP protocol" },
  { field: "dhcp.type", desc: "Message type" },
  { field: "dhcp.hw.mac_addr", desc: "Client MAC" },
  { field: "dhcp.ip.your", desc: "Your IP" },
  { field: "dhcp.ip.server", desc: "Server IP" },
  // QUIC
  { field: "quic", desc: "QUIC protocol" },
  { field: "quic.version", desc: "QUIC version" },
  { field: "quic.connection.number", desc: "Connection number" },
  // Other
  { field: "data", desc: "Raw data" },
  { field: "data.len", desc: "Data length" },
];

const isFilterValid = ref(null);
const displayFilterInput = ref("");
const inputRef = useTemplateRef("dfilter");
const showSuggestions = ref(false);
const selectedIndex = ref(0);

// Get the current word being typed (for autocomplete matching) - must be computed for reactivity
const currentWord = computed(() => {
  const input = displayFilterInput.value;
  if (!input) return "";

  // Find the start of current token (after space, &&, ||, !, (, ))
  const separators = /[\s&|!()]/;
  let start = input.length;
  for (let i = input.length - 1; i >= 0; i--) {
    if (separators.test(input[i])) {
      start = i + 1;
      break;
    }
    if (i === 0) start = 0;
  }
  return input.slice(start).toLowerCase();
});

// Filtered suggestions based on current input
const filteredSuggestions = computed(() => {
  const word = currentWord.value;
  if (!word || word.length < 1) return [];

  // Prioritize startsWith matches, then include contains matches
  const startsWithMatches = filterSuggestions.filter(s =>
    s.field.toLowerCase().startsWith(word)
  );
  const containsMatches = filterSuggestions.filter(s =>
    !s.field.toLowerCase().startsWith(word) && s.field.toLowerCase().includes(word)
  );

  return [...startsWithMatches, ...containsMatches].slice(0, 10);
});

// Insert selected suggestion
const insertSuggestion = (suggestion) => {
  const input = displayFilterInput.value;
  const word = currentWord.value;

  // Replace the current word with the suggestion
  const beforeWord = input.slice(0, input.length - word.length);
  displayFilterInput.value = beforeWord + suggestion.field;

  showSuggestions.value = false;
  selectedIndex.value = 0;
  inputRef.value.focus();
};

// Handle keyboard navigation in suggestions
const handleKeydown = (event) => {
  if (!showSuggestions.value || filteredSuggestions.value.length === 0) {
    return;
  }

  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % filteredSuggestions.value.length;
      break;
    case "ArrowUp":
      event.preventDefault();
      selectedIndex.value = selectedIndex.value <= 0
        ? filteredSuggestions.value.length - 1
        : selectedIndex.value - 1;
      break;
    case "Enter":
      if (filteredSuggestions.value.length > 0) {
        event.preventDefault();
        insertSuggestion(filteredSuggestions.value[selectedIndex.value]);
      }
      break;
    case "Escape":
      event.preventDefault();
      showSuggestions.value = false;
      break;
    case "Tab":
      if (filteredSuggestions.value.length > 0) {
        event.preventDefault();
        insertSuggestion(filteredSuggestions.value[selectedIndex.value]);
      }
      break;
  }
};

// Show/hide suggestions based on input
const handleInput = () => {
  const word = currentWord.value;
  showSuggestions.value = word.length >= 1 && filteredSuggestions.value.length > 0;
  selectedIndex.value = 0;
};

const handleFocus = () => {
  const word = currentWord.value;
  if (word.length >= 1 && filteredSuggestions.value.length > 0) {
    showSuggestions.value = true;
  }
};

const handleBlur = () => {
  // Delay hide to allow click on suggestion
  setTimeout(() => {
    showSuggestions.value = false;
  }, 150);
};

watch(
  () => displayFilterInput.value,
  async (filter) => {
    handleInput();

    if (filter === "") {
      isFilterValid.value = null;
      return;
    }

    const result = await manager.checkFilter(filter);
    isFilterValid.value = result.ok;
  }
);

const handleSubmit = () => {
  showSuggestions.value = false;
  manager.setDisplayFilter(displayFilterInput.value);
};

const clearFilter = () => {
  displayFilterInput.value = "";
  manager.setDisplayFilter("");
  showSuggestions.value = false;
};

// Ctrl-/ or Command-/
const handleGlobalKeydown = (event) => {
  if (event.key === "/" && !event.shiftKey && event.ctrlKey ^ event.metaKey) {
    event.preventDefault();
    inputRef.value.focus();
  }
};
onMounted(() => document.body.addEventListener("keydown", handleGlobalKeydown));
onBeforeUnmount(() =>
  document.body.removeEventListener("keydown", handleGlobalKeydown)
);
</script>
<template>
  <div class="filter-container" :class="{ disabled: !manager.sessionInfo }">
    <form class="filter-bar" @submit.prevent="handleSubmit">
      <div class="input-wrapper">
        <input
          type="text"
          name="dfilter"
          ref="dfilter"
          v-model="displayFilterInput"
          @keydown="handleKeydown"
          @focus="handleFocus"
          @blur="handleBlur"
          autocomplete="off"
          :placeholder="
            manager.displayFilter
              ? `Current filter: ${manager.displayFilter}`
              : 'Apply a display filter ... <Ctrl-/>'
          "
          :disabled="!manager.sessionInfo"
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
        <div v-if="showSuggestions && filteredSuggestions.length > 0" class="suggestions-dropdown">
          <div
            v-for="(suggestion, index) in filteredSuggestions"
            :key="suggestion.field"
            class="suggestion-item"
            :class="{ selected: index === selectedIndex }"
            @mousedown.prevent="insertSuggestion(suggestion)"
            @mouseenter="selectedIndex = index"
          >
            <span class="suggestion-field">{{ suggestion.field }}</span>
            <span class="suggestion-desc">{{ suggestion.desc }}</span>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="clear-filter"
        title="Clear display filter"
        v-if="displayFilterInput"
        @click="clearFilter"
      >
        ✕
      </button>
      <button
        type="submit"
        class="apply-filter"
        title="Apply display filter"
        :disabled="
          isFilterValid === false ||
          manager.displayFilter === displayFilterInput
        "
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
.filter-container.disabled .filter-bar {
  filter: saturate(0);
  border: var(--ws-pane-border);
  opacity: 0.75;
  pointer-events: none;
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
  color: #e0e0e0;
  opacity: 1;
}
.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--ws-almost-white);
  border: 1px solid var(--ws-darker-gray);
  border-top: none;
  border-radius: 0 0 3px 3px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  max-height: 300px;
  overflow-y: auto;
}
.suggestion-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}
.suggestion-item:hover,
.suggestion-item.selected {
  background-color: var(--ws-light-blue);
}
.suggestion-field {
  font-weight: 500;
  color: var(--ws-text-color);
  font-family: monospace;
}
.suggestion-desc {
  color: var(--ws-darkest-gray);
  font-size: 11px;
  margin-left: 12px;
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
