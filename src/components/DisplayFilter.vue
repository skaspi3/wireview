<script setup>
import { ref, watch, computed, onBeforeUnmount, onMounted, useTemplateRef, nextTick } from "vue";
import { displayFilter, filterError, applyDisplayFilter, websocket } from "../globals";
import FilterApplyIcon from "./icons/FilterApplyIcon.vue";

// Comprehensive Wireshark display filter expressions for autocomplete
const filterSuggestions = [
  // Frame
  { field: "frame.number", desc: "Frame number" },
  { field: "frame.len", desc: "Frame length" },
  { field: "frame.time", desc: "Frame timestamp" },
  { field: "frame.time_relative", desc: "Time since first frame" },
  { field: "frame.time_delta", desc: "Time since previous frame" },
  { field: "frame.protocols", desc: "Protocols in frame" },

  // Ethernet
  { field: "eth", desc: "Ethernet protocol" },
  { field: "eth.addr", desc: "Ethernet address (src or dst)" },
  { field: "eth.src", desc: "Ethernet source" },
  { field: "eth.dst", desc: "Ethernet destination" },
  { field: "eth.type", desc: "Ethernet type" },

  // IP
  { field: "ip", desc: "IPv4 protocol" },
  { field: "ip.addr", desc: "IPv4 address (src or dst)" },
  { field: "ip.src", desc: "IPv4 source" },
  { field: "ip.dst", desc: "IPv4 destination" },
  { field: "ip.proto", desc: "IPv4 protocol number" },
  { field: "ip.len", desc: "IPv4 total length" },
  { field: "ip.ttl", desc: "IPv4 time to live" },
  { field: "ip.id", desc: "IPv4 identification" },
  { field: "ip.flags", desc: "IPv4 flags" },
  { field: "ip.frag_offset", desc: "IPv4 fragment offset" },
  { field: "ip.version", desc: "IPv4 version" },

  // IPv6
  { field: "ipv6", desc: "IPv6 protocol" },
  { field: "ipv6.addr", desc: "IPv6 address (src or dst)" },
  { field: "ipv6.src", desc: "IPv6 source" },
  { field: "ipv6.dst", desc: "IPv6 destination" },
  { field: "ipv6.hlim", desc: "IPv6 hop limit" },
  { field: "ipv6.nxt", desc: "IPv6 next header" },

  // TCP
  { field: "tcp", desc: "TCP protocol" },
  { field: "tcp.port", desc: "TCP port (src or dst)" },
  { field: "tcp.srcport", desc: "TCP source port" },
  { field: "tcp.dstport", desc: "TCP destination port" },
  { field: "tcp.seq", desc: "TCP sequence number" },
  { field: "tcp.ack", desc: "TCP acknowledgment number" },
  { field: "tcp.len", desc: "TCP segment length" },
  { field: "tcp.window_size", desc: "TCP window size" },
  { field: "tcp.flags", desc: "TCP flags" },
  { field: "tcp.flags.syn", desc: "TCP SYN flag" },
  { field: "tcp.flags.ack", desc: "TCP ACK flag" },
  { field: "tcp.flags.fin", desc: "TCP FIN flag" },
  { field: "tcp.flags.rst", desc: "TCP RST flag" },
  { field: "tcp.flags.push", desc: "TCP PSH flag" },
  { field: "tcp.flags.urg", desc: "TCP URG flag" },
  { field: "tcp.stream", desc: "TCP stream index" },
  { field: "tcp.analysis.retransmission", desc: "TCP retransmission" },
  { field: "tcp.analysis.duplicate_ack", desc: "TCP duplicate ACK" },
  { field: "tcp.analysis.zero_window", desc: "TCP zero window" },

  // UDP
  { field: "udp", desc: "UDP protocol" },
  { field: "udp.port", desc: "UDP port (src or dst)" },
  { field: "udp.srcport", desc: "UDP source port" },
  { field: "udp.dstport", desc: "UDP destination port" },
  { field: "udp.length", desc: "UDP length" },
  { field: "udp.stream", desc: "UDP stream index" },

  // ICMP
  { field: "icmp", desc: "ICMP protocol" },
  { field: "icmp.type", desc: "ICMP type" },
  { field: "icmp.code", desc: "ICMP code" },
  { field: "icmp.ident", desc: "ICMP identifier" },
  { field: "icmp.seq", desc: "ICMP sequence" },

  // ICMPv6
  { field: "icmpv6", desc: "ICMPv6 protocol" },
  { field: "icmpv6.type", desc: "ICMPv6 type" },
  { field: "icmpv6.code", desc: "ICMPv6 code" },

  // DNS
  { field: "dns", desc: "DNS protocol" },
  { field: "dns.qry.name", desc: "DNS query name" },
  { field: "dns.qry.type", desc: "DNS query type" },
  { field: "dns.resp.name", desc: "DNS response name" },
  { field: "dns.resp.type", desc: "DNS response type" },
  { field: "dns.a", desc: "DNS A record" },
  { field: "dns.aaaa", desc: "DNS AAAA record" },
  { field: "dns.cname", desc: "DNS CNAME record" },
  { field: "dns.mx", desc: "DNS MX record" },
  { field: "dns.flags.response", desc: "DNS is response" },
  { field: "dns.flags.rcode", desc: "DNS response code" },

  // HTTP
  { field: "http", desc: "HTTP protocol" },
  { field: "http.request", desc: "HTTP request" },
  { field: "http.response", desc: "HTTP response" },
  { field: "http.request.method", desc: "HTTP method (GET, POST...)" },
  { field: "http.request.uri", desc: "HTTP request URI" },
  { field: "http.request.full_uri", desc: "HTTP full URI" },
  { field: "http.host", desc: "HTTP host header" },
  { field: "http.user_agent", desc: "HTTP user agent" },
  { field: "http.response.code", desc: "HTTP response code" },
  { field: "http.content_type", desc: "HTTP content type" },
  { field: "http.content_length", desc: "HTTP content length" },
  { field: "http.cookie", desc: "HTTP cookie" },
  { field: "http.set_cookie", desc: "HTTP set-cookie" },
  { field: "http.referer", desc: "HTTP referer" },
  { field: "http.location", desc: "HTTP location header" },

  // HTTP/2
  { field: "http2", desc: "HTTP/2 protocol" },
  { field: "http2.stream", desc: "HTTP/2 stream" },
  { field: "http2.header", desc: "HTTP/2 header" },

  // TLS/SSL
  { field: "tls", desc: "TLS protocol" },
  { field: "tls.handshake", desc: "TLS handshake" },
  { field: "tls.handshake.type", desc: "TLS handshake type" },
  { field: "tls.record.content_type", desc: "TLS record type" },
  { field: "tls.record.version", desc: "TLS version" },
  { field: "tls.handshake.extensions_server_name", desc: "TLS SNI" },
  { field: "ssl", desc: "SSL protocol (alias for tls)" },
  { field: "ssl.handshake", desc: "SSL handshake" },

  // ARP
  { field: "arp", desc: "ARP protocol" },
  { field: "arp.opcode", desc: "ARP opcode" },
  { field: "arp.src.hw_mac", desc: "ARP sender MAC" },
  { field: "arp.src.proto_ipv4", desc: "ARP sender IP" },
  { field: "arp.dst.hw_mac", desc: "ARP target MAC" },
  { field: "arp.dst.proto_ipv4", desc: "ARP target IP" },

  // DHCP
  { field: "dhcp", desc: "DHCP protocol" },
  { field: "dhcp.type", desc: "DHCP message type" },
  { field: "dhcp.hw.mac_addr", desc: "DHCP client MAC" },
  { field: "dhcp.ip.client", desc: "DHCP client IP" },
  { field: "dhcp.ip.your", desc: "DHCP your IP" },
  { field: "dhcp.ip.server", desc: "DHCP server IP" },
  { field: "bootp", desc: "BOOTP/DHCP protocol" },

  // VLAN
  { field: "vlan", desc: "VLAN protocol" },
  { field: "vlan.id", desc: "VLAN ID" },
  { field: "vlan.priority", desc: "VLAN priority" },

  // STP
  { field: "stp", desc: "Spanning Tree Protocol" },
  { field: "stp.root.hw", desc: "STP root bridge" },

  // OSPF
  { field: "ospf", desc: "OSPF protocol" },
  { field: "ospf.msg", desc: "OSPF message type" },

  // BGP
  { field: "bgp", desc: "BGP protocol" },
  { field: "bgp.type", desc: "BGP message type" },

  // SSH
  { field: "ssh", desc: "SSH protocol" },
  { field: "ssh.protocol", desc: "SSH protocol version" },

  // FTP
  { field: "ftp", desc: "FTP protocol" },
  { field: "ftp.request.command", desc: "FTP command" },
  { field: "ftp.response.code", desc: "FTP response code" },
  { field: "ftp-data", desc: "FTP data transfer" },

  // SMTP
  { field: "smtp", desc: "SMTP protocol" },
  { field: "smtp.req.command", desc: "SMTP command" },
  { field: "smtp.response.code", desc: "SMTP response code" },

  // POP
  { field: "pop", desc: "POP protocol" },
  { field: "pop.request.command", desc: "POP command" },

  // IMAP
  { field: "imap", desc: "IMAP protocol" },
  { field: "imap.request", desc: "IMAP request" },

  // NTP
  { field: "ntp", desc: "NTP protocol" },
  { field: "ntp.flags.mode", desc: "NTP mode" },

  // SNMP
  { field: "snmp", desc: "SNMP protocol" },
  { field: "snmp.version", desc: "SNMP version" },
  { field: "snmp.community", desc: "SNMP community" },

  // LDAP
  { field: "ldap", desc: "LDAP protocol" },
  { field: "ldap.filter", desc: "LDAP filter" },

  // Kerberos
  { field: "kerberos", desc: "Kerberos protocol" },
  { field: "kerberos.msg_type", desc: "Kerberos message type" },

  // SMB
  { field: "smb", desc: "SMB protocol" },
  { field: "smb.cmd", desc: "SMB command" },
  { field: "smb2", desc: "SMB2 protocol" },
  { field: "smb2.cmd", desc: "SMB2 command" },

  // RDP
  { field: "rdp", desc: "RDP protocol" },

  // MySQL
  { field: "mysql", desc: "MySQL protocol" },
  { field: "mysql.query", desc: "MySQL query" },

  // PostgreSQL
  { field: "pgsql", desc: "PostgreSQL protocol" },

  // MongoDB
  { field: "mongo", desc: "MongoDB protocol" },

  // Redis
  { field: "redis", desc: "Redis protocol" },

  // QUIC
  { field: "quic", desc: "QUIC protocol" },
  { field: "quic.version", desc: "QUIC version" },

  // Websocket
  { field: "websocket", desc: "WebSocket protocol" },
  { field: "websocket.opcode", desc: "WebSocket opcode" },

  // SIP
  { field: "sip", desc: "SIP protocol" },
  { field: "sip.Method", desc: "SIP method" },
  { field: "sip.Status-Code", desc: "SIP status code" },

  // RTP
  { field: "rtp", desc: "RTP protocol" },
  { field: "rtp.ssrc", desc: "RTP SSRC" },
  { field: "rtp.payload_type", desc: "RTP payload type" },

  // GRE
  { field: "gre", desc: "GRE protocol" },

  // MPLS
  { field: "mpls", desc: "MPLS protocol" },
  { field: "mpls.label", desc: "MPLS label" },

  // Common comparison operators (as examples)
  { field: "tcp.port == 80", desc: "HTTP traffic" },
  { field: "tcp.port == 443", desc: "HTTPS traffic" },
  { field: "tcp.port == 22", desc: "SSH traffic" },
  { field: "tcp.port == 21", desc: "FTP control" },
  { field: "tcp.port == 25", desc: "SMTP traffic" },
  { field: "tcp.port == 53", desc: "DNS over TCP" },
  { field: "udp.port == 53", desc: "DNS over UDP" },
  { field: "tcp.port == 3306", desc: "MySQL traffic" },
  { field: "tcp.port == 5432", desc: "PostgreSQL traffic" },
  { field: "tcp.port == 6379", desc: "Redis traffic" },
  { field: "tcp.port == 27017", desc: "MongoDB traffic" },
  { field: "udp.port == 67", desc: "DHCP server" },
  { field: "udp.port == 68", desc: "DHCP client" },
  { field: "udp.port == 123", desc: "NTP traffic" },
  { field: "udp.port == 161", desc: "SNMP traffic" },
  { field: "tcp.port == 389", desc: "LDAP traffic" },
  { field: "tcp.port == 636", desc: "LDAPS traffic" },
  { field: "tcp.port == 3389", desc: "RDP traffic" },
  { field: "udp.port == 500", desc: "IKE/IPsec" },
  { field: "udp.port == 4500", desc: "IPsec NAT-T" },

  // Logical operators
  { field: "and", desc: "Logical AND" },
  { field: "or", desc: "Logical OR" },
  { field: "not", desc: "Logical NOT" },
  { field: "!", desc: "Logical NOT (alt)" },
  { field: "&&", desc: "Logical AND (alt)" },
  { field: "||", desc: "Logical OR (alt)" },

  // Comparison operators
  { field: "==", desc: "Equal" },
  { field: "!=", desc: "Not equal" },
  { field: ">", desc: "Greater than" },
  { field: "<", desc: "Less than" },
  { field: ">=", desc: "Greater or equal" },
  { field: "<=", desc: "Less or equal" },
  { field: "contains", desc: "Contains string" },
  { field: "matches", desc: "Matches regex" },
];

// Local state
const displayFilterInput = ref("");
const inputRef = useTemplateRef("dfilter");
const showSuggestions = ref(false);
const selectedIndex = ref(0);
const isValidating = ref(false);
const validationResult = ref(null); // null = not validated, true = valid, false = invalid

// Get the current word being typed (for autocomplete)
// This includes dots, so "udp.por" returns "udp.por" not just "por"
const currentWord = computed(() => {
  const input = displayFilterInput.value;
  if (!input) return "";

  // Separators are spaces and logical/comparison operators, but NOT dots
  const separators = /[\s&|!()=<>]/;
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

// Check if current word looks like a value (number, IP, etc.) rather than a field name
const isValueContext = computed(() => {
  const input = displayFilterInput.value;
  if (!input) return false;

  // If the input ends with an operator followed by something, we're in value context
  // e.g., "udp.port == 53" or "ip.addr == 192"
  const valuePattern = /[=<>!]\s*\S+$/;
  return valuePattern.test(input);
});

// Filtered suggestions based on input
const filteredSuggestions = computed(() => {
  const word = currentWord.value;
  if (!word || word.length < 1) return [];

  // Don't show suggestions when user is typing a value after an operator
  if (isValueContext.value) return [];

  // Don't show suggestions for pure numbers (likely port numbers or values)
  if (/^\d+$/.test(word)) return [];

  const startsWithMatches = filterSuggestions.filter(s =>
    s.field.toLowerCase().startsWith(word)
  );
  const containsMatches = filterSuggestions.filter(s =>
    !s.field.toLowerCase().startsWith(word) && s.field.toLowerCase().includes(word)
  );

  return [...startsWithMatches, ...containsMatches].slice(0, 10);
});

// Compute input background color
const inputBgColor = computed(() => {
  const input = displayFilterInput.value.trim();

  // Empty input - transparent
  if (!input) return 'transparent';

  // Currently validating - keep previous color or transparent
  if (isValidating.value) {
    if (validationResult.value === true) return 'var(--ws-ugly-green)';
    if (validationResult.value === false) return 'var(--ws-ugly-red)';
    return 'transparent';
  }

  // Filter error from backend - red
  if (filterError.value) return 'var(--ws-ugly-red)';

  // Validation result
  if (validationResult.value === true) return 'var(--ws-ugly-green)';
  if (validationResult.value === false) return 'var(--ws-ugly-red)';

  // Active filter applied - green
  if (displayFilter.value && displayFilter.value === input) return 'var(--ws-ugly-green)';

  return 'transparent';
});

// Compute text color
const inputTextColor = computed(() => {
  const bg = inputBgColor.value;
  if (bg === 'var(--ws-ugly-green)' || bg === 'var(--ws-ugly-red)') {
    return '#ffffff';
  }
  return 'var(--ws-text-color)';
});

// Insert selected suggestion
const insertSuggestion = (suggestion) => {
  const input = displayFilterInput.value;
  const word = currentWord.value;
  const beforeWord = input.slice(0, input.length - word.length);
  displayFilterInput.value = beforeWord + suggestion.field;
  showSuggestions.value = false;
  selectedIndex.value = 0;
  inputRef.value?.focus();
  // Validate after inserting
  validateFilterSyntax(displayFilterInput.value);
};

// Handle keyboard navigation - this runs BEFORE the default input behavior
const handleKeydown = (event) => {
  // Handle suggestions navigation when dropdown is open
  if (showSuggestions.value && filteredSuggestions.value.length > 0) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      selectedIndex.value = (selectedIndex.value + 1) % filteredSuggestions.value.length;
      scrollSelectedIntoView();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      selectedIndex.value = selectedIndex.value <= 0
        ? filteredSuggestions.value.length - 1
        : selectedIndex.value - 1;
      scrollSelectedIntoView();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      showSuggestions.value = false;
      return;
    }

    // Tab: insert the selected suggestion
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      insertSuggestion(filteredSuggestions.value[selectedIndex.value]);
      return;
    }

    // Enter when dropdown is open: insert suggestion AND apply filter
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      insertSuggestion(filteredSuggestions.value[selectedIndex.value]);
      // Apply filter immediately after inserting
      setTimeout(() => handleSubmit(), 0);
      return;
    }
  }

  // Enter when no dropdown: submit the filter
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    handleSubmit();
  }
};

// Scroll selected item into view
const scrollSelectedIntoView = () => {
  nextTick(() => {
    const dropdown = document.querySelector('.suggestions-dropdown');
    const selected = dropdown?.querySelector('.suggestion-item.selected');
    if (selected && dropdown) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  });
};

// Validate filter syntax by asking backend (debounced)
let validateTimeout = null;
let pendingValidationFilter = null;

const validateFilterSyntax = (filter) => {
  if (validateTimeout) clearTimeout(validateTimeout);

  const trimmed = filter.trim();
  if (!trimmed) {
    validationResult.value = null;
    isValidating.value = false;
    return;
  }

  isValidating.value = true;
  pendingValidationFilter = trimmed;

  // Debounce validation
  validateTimeout = setTimeout(() => {
    // Use tshark to validate the filter without running it
    if (websocket.value && websocket.value.readyState === WebSocket.OPEN) {
      websocket.value.send(JSON.stringify({
        type: 'validateFilter',
        filter: trimmed
      }));
    } else {
      // Fallback: basic local validation
      validationResult.value = basicLocalValidation(trimmed);
      isValidating.value = false;
    }
  }, 300);
};

// Handle validation response from backend
window._filterValidationCallback = (filter, valid, error) => {
  // Only update if this is for the current pending filter
  if (filter === pendingValidationFilter || filter === displayFilterInput.value.trim()) {
    validationResult.value = valid;
    if (error) {
      filterError.value = error;
    }
    isValidating.value = false;
  }
};

// Basic local validation as fallback
const basicLocalValidation = (filter) => {
  // Check for incomplete expressions - these should not be green
  // e.g., "udp.port==" is incomplete
  if (/[=<>!&|]\s*$/.test(filter)) {
    return null; // Incomplete - don't show color
  }

  // Check for expressions ending with operators
  if (/\s+(and|or|not)\s*$/i.test(filter)) {
    return null; // Incomplete
  }

  // Check for common valid patterns
  const validStarts = filterSuggestions.map(s => s.field.split(/[.\s=<>!]/)[0]);
  const firstWord = filter.split(/[\s.=<>!&|()]/)[0].toLowerCase();

  // Simple protocol names are valid (e.g., "tcp", "udp", "dns")
  if (/^[a-z][a-z0-9]*$/i.test(filter) && validStarts.some(v => v.toLowerCase() === filter.toLowerCase())) {
    return true;
  }

  // Check if it starts with a known protocol/field and has a complete comparison
  // e.g., "tcp.port == 80" or "ip.addr == 192.168.1.1"
  if (validStarts.some(v => v.toLowerCase() === firstWord)) {
    // Check if it's a complete expression with value
    if (/[=<>!]+\s*\S+/.test(filter)) {
      return true;
    }
    // Just a field name without comparison - could be valid for existence check
    if (/^[a-z][a-z0-9._]*$/i.test(filter)) {
      return true;
    }
    return null; // Incomplete
  }

  // Check for logical operators at start
  if (['not', '!'].includes(firstWord)) {
    // Must have something after
    if (filter.trim().split(/\s+/).length > 1) {
      return null; // Let backend validate
    }
    return null;
  }

  // Check for parentheses expression
  if (filter.startsWith('(')) {
    return null; // Let backend validate complex expressions
  }

  return null; // Unknown - let backend validate
};

const handleInput = () => {
  filterError.value = null;
  const word = currentWord.value;
  showSuggestions.value = word.length >= 1 && filteredSuggestions.value.length > 0;
  selectedIndex.value = 0;

  // Validate as user types
  validateFilterSyntax(displayFilterInput.value);
};

const handleFocus = () => {
  const word = currentWord.value;
  if (word.length >= 1 && filteredSuggestions.value.length > 0) {
    showSuggestions.value = true;
  }
};

const handleBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
};

// Watch input for suggestions
watch(displayFilterInput, () => {
  handleInput();
});

// Watch for filter validation response from backend
watch(filterError, (error) => {
  if (error) {
    validationResult.value = false;
  }
  isValidating.value = false;
});

// Handle filter submission - send to backend
const handleSubmit = () => {
  showSuggestions.value = false;
  const filter = displayFilterInput.value.trim();

  // Don't submit if we know it's invalid
  if (validationResult.value === false && filter) {
    return;
  }

  applyDisplayFilter(filter);
};

// Clear filter
const clearFilter = () => {
  displayFilterInput.value = "";
  filterError.value = null;
  validationResult.value = null;
  applyDisplayFilter("");
};

// Refresh filter - re-apply current filter to catch new packets
const refreshFilter = () => {
  if (displayFilter.value) {
    applyDisplayFilter(displayFilter.value);
  }
};

// Ctrl-/ to focus filter
const handleGlobalKeydown = (event) => {
  if (event.key === "/" && !event.shiftKey && (event.ctrlKey !== event.metaKey)) {
    event.preventDefault();
    inputRef.value?.focus();
  }
};

onMounted(() => document.body.addEventListener("keydown", handleGlobalKeydown));
onBeforeUnmount(() => document.body.removeEventListener("keydown", handleGlobalKeydown));
</script>

<template>
  <div class="filter-container">
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
            displayFilter
              ? `Current filter: ${displayFilter}`
              : 'Apply a display filter ... <Ctrl-/>'
          "
          :style="{
            backgroundColor: inputBgColor,
            color: inputTextColor,
          }"
        />
        <div v-if="showSuggestions && filteredSuggestions.length > 0" class="suggestions-dropdown">
          <div
            v-for="(suggestion, index) in filteredSuggestions"
            :key="suggestion.field + index"
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
        v-if="displayFilterInput || displayFilter"
        @click="clearFilter"
      >
        ✕
      </button>
      <button
        type="button"
        class="refresh-filter"
        title="Refresh filter (re-apply to catch new packets)"
        v-if="displayFilter"
        @click="refreshFilter"
      >
        ↻
      </button>
      <button
        type="submit"
        class="apply-filter"
        title="Apply display filter"
        :disabled="displayFilter === displayFilterInput.trim() || validationResult === false"
      >
        <FilterApplyIcon />
      </button>
    </form>
    <div v-if="filterError" class="filter-error" :title="filterError">
      {{ filterError }}
    </div>
  </div>
</template>

<style scoped>
.filter-container {
  display: flex;
  flex-direction: column;
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
  padding: 4px 7px;
  font-family: monospace;
  font-size: 12px;
}
.filter-container .filter-bar input[type="text"]::placeholder {
  color: #999;
  opacity: 1;
  font-family: inherit;
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
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12px;
}
.suggestion-item:hover,
.suggestion-item.selected {
  background-color: #3875d7;
  color: white;
}
.suggestion-item.selected .suggestion-field,
.suggestion-item.selected .suggestion-desc,
.suggestion-item:hover .suggestion-field,
.suggestion-item:hover .suggestion-desc {
  color: white;
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
.clear-filter,
.refresh-filter {
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
.clear-filter:hover,
.refresh-filter:hover {
  color: var(--ws-text-color);
  background-color: var(--ws-dark-gray);
}
.refresh-filter {
  font-size: 1.3em;
}
.filter-error {
  color: #dc2626;
  font-size: 11px;
  padding: 2px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
