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

// Comprehensive field name mappings for human-readable display
const fieldNames = {
  // Frame
  'frame.time': 'Arrival Time',
  'frame.time_epoch': 'Epoch Time',
  'frame.time_delta': 'Time delta from previous captured frame',
  'frame.time_relative': 'Time since reference or first frame',
  'frame.len': 'Frame Length',
  'frame.cap_len': 'Capture Length',
  'frame.protocols': 'Protocols in frame',
  'frame.number': 'Frame Number',
  'frame.encap_type': 'Encapsulation type',
  'frame.marked': 'Frame is marked',
  'frame.ignored': 'Frame is ignored',

  // Ethernet
  'eth.dst': 'Destination',
  'eth.dst_resolved': 'Destination (resolved)',
  'eth.src': 'Source',
  'eth.src_resolved': 'Source (resolved)',
  'eth.type': 'Type',
  'eth.lg': 'LG bit',
  'eth.ig': 'IG bit',

  // IP
  'ip.version': 'Version',
  'ip.hdr_len': 'Header Length',
  'ip.dsfield': 'Differentiated Services Field',
  'ip.dsfield.dscp': 'Differentiated Services Codepoint',
  'ip.dsfield.ecn': 'Explicit Congestion Notification',
  'ip.len': 'Total Length',
  'ip.id': 'Identification',
  'ip.flags': 'Flags',
  'ip.flags.rb': 'Reserved bit',
  'ip.flags.df': 'Don\'t fragment',
  'ip.flags.mf': 'More fragments',
  'ip.frag_offset': 'Fragment Offset',
  'ip.ttl': 'Time to Live',
  'ip.proto': 'Protocol',
  'ip.checksum': 'Header Checksum',
  'ip.checksum.status': 'Header checksum status',
  'ip.src': 'Source Address',
  'ip.dst': 'Destination Address',
  'ip.src_host': 'Source Host',
  'ip.dst_host': 'Destination Host',

  // IPv6
  'ipv6.version': 'Version',
  'ipv6.tclass': 'Traffic Class',
  'ipv6.flow': 'Flow Label',
  'ipv6.plen': 'Payload Length',
  'ipv6.nxt': 'Next Header',
  'ipv6.hlim': 'Hop Limit',
  'ipv6.src': 'Source Address',
  'ipv6.dst': 'Destination Address',

  // TCP
  'tcp.srcport': 'Source Port',
  'tcp.dstport': 'Destination Port',
  'tcp.stream': 'Stream index',
  'tcp.len': 'TCP Segment Len',
  'tcp.seq': 'Sequence Number',
  'tcp.nxtseq': 'Next Sequence Number',
  'tcp.ack': 'Acknowledgment Number',
  'tcp.hdr_len': 'Header Length',
  'tcp.flags': 'Flags',
  'tcp.flags.res': 'Reserved',
  'tcp.flags.ns': 'Nonce',
  'tcp.flags.cwr': 'Congestion Window Reduced',
  'tcp.flags.ecn': 'ECN-Echo',
  'tcp.flags.ece': 'ECN-Echo',
  'tcp.flags.urg': 'Urgent',
  'tcp.flags.ack': 'Acknowledgment',
  'tcp.flags.push': 'Push',
  'tcp.flags.reset': 'Reset',
  'tcp.flags.syn': 'Syn',
  'tcp.flags.fin': 'Fin',
  'tcp.flags.str': 'TCP Flags',
  'tcp.window_size': 'Window',
  'tcp.window_size_value': 'Calculated window size',
  'tcp.window_size_scalefactor': 'Window size scaling factor',
  'tcp.checksum': 'Checksum',
  'tcp.checksum.status': 'Checksum Status',
  'tcp.urgent_pointer': 'Urgent Pointer',
  'tcp.options': 'Options',
  'tcp.options.mss': 'Maximum segment size',
  'tcp.options.mss_val': 'MSS Value',
  'tcp.options.wscale': 'Window scale',
  'tcp.options.wscale.shift': 'Shift count',
  'tcp.options.wscale.multiplier': 'Multiplier',
  'tcp.options.sack_perm': 'SACK permitted',
  'tcp.options.timestamp': 'Timestamps',
  'tcp.options.timestamp.tsval': 'Timestamp value',
  'tcp.options.timestamp.tsecr': 'Timestamp echo reply',
  'tcp.payload': 'TCP payload',
  'tcp.analysis': 'SEQ/ACK analysis',
  'tcp.analysis.bytes_in_flight': 'Bytes in flight',
  'tcp.analysis.push_bytes_sent': 'Bytes sent since last PSH flag',
  'tcp.analysis.acks_frame': 'This is an ACK to the segment in frame',
  'tcp.analysis.ack_rtt': 'The RTT to ACK the segment was',
  'tcp.analysis.initial_rtt': 'iRTT',
  'tcp.time_relative': 'Time since first frame in this TCP stream',
  'tcp.time_delta': 'Time since previous frame in this TCP stream',
  'tcp.completeness': 'Conversation completeness',

  // UDP
  'udp.srcport': 'Source Port',
  'udp.dstport': 'Destination Port',
  'udp.length': 'Length',
  'udp.checksum': 'Checksum',
  'udp.checksum.status': 'Checksum Status',
  'udp.stream': 'Stream index',
  'udp.payload': 'UDP payload',
  'udp.time_relative': 'Time since first frame',
  'udp.time_delta': 'Time since previous frame',

  // DNS
  'dns.id': 'Transaction ID',
  'dns.flags': 'Flags',
  'dns.flags.response': 'Response',
  'dns.flags.opcode': 'Opcode',
  'dns.flags.authoritative': 'Authoritative',
  'dns.flags.truncated': 'Truncated',
  'dns.flags.recdesired': 'Recursion desired',
  'dns.flags.recavail': 'Recursion available',
  'dns.flags.z': 'Z',
  'dns.flags.authenticated': 'Answer authenticated',
  'dns.flags.checkdisable': 'Non-authenticated data',
  'dns.flags.rcode': 'Reply code',
  'dns.count.queries': 'Questions',
  'dns.count.answers': 'Answer RRs',
  'dns.count.auth_rr': 'Authority RRs',
  'dns.count.add_rr': 'Additional RRs',
  'dns.qry.name': 'Name',
  'dns.qry.name.len': 'Name Length',
  'dns.qry.type': 'Type',
  'dns.qry.class': 'Class',
  'dns.resp.name': 'Name',
  'dns.resp.type': 'Type',
  'dns.resp.class': 'Class',
  'dns.resp.ttl': 'Time to live',
  'dns.resp.len': 'Data length',
  'dns.a': 'Address',
  'dns.aaaa': 'AAAA Address',
  'dns.cname': 'CNAME',
  'dns.ns': 'Name Server',
  'dns.ptr.domain_name': 'Domain Name',
  'dns.mx.mail_exchange': 'Mail Exchange',
  'dns.mx.preference': 'Preference',
  'dns.txt': 'TXT',
  'dns.soa.mname': 'Primary name server',
  'dns.soa.rname': 'Responsible authority\'s mailbox',
  'dns.soa.serial_number': 'Serial Number',
  'dns.soa.refresh_interval': 'Refresh Interval',
  'dns.soa.retry_interval': 'Retry Interval',
  'dns.soa.expire_limit': 'Expire limit',
  'dns.soa.minimum_ttl': 'Minimum TTL',

  // HTTP
  'http.request': 'Request',
  'http.request.method': 'Request Method',
  'http.request.uri': 'Request URI',
  'http.request.full_uri': 'Full request URI',
  'http.request.version': 'Request Version',
  'http.request.line': 'Request line',
  'http.response': 'Response',
  'http.response.version': 'Response Version',
  'http.response.code': 'Status Code',
  'http.response.code.desc': 'Status Code Description',
  'http.response.phrase': 'Response Phrase',
  'http.response.line': 'Status line',
  'http.host': 'Host',
  'http.user_agent': 'User-Agent',
  'http.accept': 'Accept',
  'http.accept_language': 'Accept-Language',
  'http.accept_encoding': 'Accept-Encoding',
  'http.connection': 'Connection',
  'http.content_type': 'Content-Type',
  'http.content_length': 'Content-Length',
  'http.content_length_header': 'Content-Length',
  'http.content_encoding': 'Content-Encoding',
  'http.transfer_encoding': 'Transfer-Encoding',
  'http.cookie': 'Cookie',
  'http.set_cookie': 'Set-Cookie',
  'http.cache_control': 'Cache-Control',
  'http.date': 'Date',
  'http.server': 'Server',
  'http.location': 'Location',
  'http.referer': 'Referer',
  'http.authorization': 'Authorization',
  'http.file_data': 'File Data',

  // TLS/SSL
  'tls.record': 'TLS Record Layer',
  'tls.record.content_type': 'Content Type',
  'tls.record.version': 'Version',
  'tls.record.length': 'Length',
  'tls.handshake': 'Handshake Protocol',
  'tls.handshake.type': 'Handshake Type',
  'tls.handshake.length': 'Length',
  'tls.handshake.version': 'Version',
  'tls.handshake.random': 'Random',
  'tls.handshake.random_time': 'GMT Unix Time',
  'tls.handshake.random_bytes': 'Random Bytes',
  'tls.handshake.session_id': 'Session ID',
  'tls.handshake.session_id_length': 'Session ID Length',
  'tls.handshake.cipher_suites_length': 'Cipher Suites Length',
  'tls.handshake.cipher_suites': 'Cipher Suites',
  'tls.handshake.ciphersuite': 'Cipher Suite',
  'tls.handshake.comp_methods_length': 'Compression Methods Length',
  'tls.handshake.comp_methods': 'Compression Methods',
  'tls.handshake.comp_method': 'Compression Method',
  'tls.handshake.extensions_length': 'Extensions Length',
  'tls.handshake.extension.type': 'Type',
  'tls.handshake.extension.len': 'Length',
  'tls.handshake.extension.data': 'Data',
  'tls.handshake.extensions_server_name': 'Server Name Indication',
  'tls.handshake.extensions_server_name_type': 'Server Name Type',
  'tls.handshake.extensions_server_name_len': 'Server Name length',
  'tls.handshake.extensions_server_name': 'Server Name',
  'tls.handshake.certificate': 'Certificate',
  'tls.handshake.certificate_length': 'Certificate Length',
  'tls.handshake.certificates_length': 'Certificates Length',
  'tls.change_cipher_spec': 'Change Cipher Spec Message',
  'tls.alert_message': 'Alert Message',
  'tls.app_data': 'Encrypted Application Data',
  'tls.segment.data': 'TLS segment data',

  // ARP
  'arp.hw.type': 'Hardware type',
  'arp.proto.type': 'Protocol type',
  'arp.hw.size': 'Hardware size',
  'arp.proto.size': 'Protocol size',
  'arp.opcode': 'Opcode',
  'arp.src.hw_mac': 'Sender MAC address',
  'arp.src.proto_ipv4': 'Sender IP address',
  'arp.dst.hw_mac': 'Target MAC address',
  'arp.dst.proto_ipv4': 'Target IP address',

  // ICMP
  'icmp.type': 'Type',
  'icmp.code': 'Code',
  'icmp.checksum': 'Checksum',
  'icmp.checksum.status': 'Checksum Status',
  'icmp.ident': 'Identifier (BE)',
  'icmp.ident_le': 'Identifier (LE)',
  'icmp.seq': 'Sequence Number (BE)',
  'icmp.seq_le': 'Sequence Number (LE)',
  'icmp.data': 'Data',
  'icmp.data_time': 'Timestamp from icmp data',
  'icmp.data_time_relative': 'Timestamp from icmp data (relative)',
  'icmp.resp_in': 'Response frame',
  'icmp.resp_to': 'Request frame',
  'icmp.resptime': 'Response time',

  // ICMPv6
  'icmpv6.type': 'Type',
  'icmpv6.code': 'Code',
  'icmpv6.checksum': 'Checksum',
  'icmpv6.checksum.status': 'Checksum Status',

  // DHCP
  'dhcp.type': 'Message type',
  'dhcp.hw.type': 'Hardware type',
  'dhcp.hw.len': 'Hardware address length',
  'dhcp.hops': 'Hops',
  'dhcp.id': 'Transaction ID',
  'dhcp.secs': 'Seconds elapsed',
  'dhcp.flags': 'Bootp flags',
  'dhcp.ip.client': 'Client IP address',
  'dhcp.ip.your': 'Your (client) IP address',
  'dhcp.ip.server': 'Next server IP address',
  'dhcp.ip.relay': 'Relay agent IP address',
  'dhcp.hw.mac_addr': 'Client MAC address',
  'dhcp.server': 'Server host name',
  'dhcp.file': 'Boot file name',
  'dhcp.cookie': 'Magic cookie',
  'dhcp.option.type': 'Option',
  'dhcp.option.length': 'Length',
  'dhcp.option.value': 'Value',
  'dhcp.option.dhcp': 'DHCP Message Type',
  'dhcp.option.subnet_mask': 'Subnet Mask',
  'dhcp.option.router': 'Router',
  'dhcp.option.domain_name_server': 'Domain Name Server',
  'dhcp.option.hostname': 'Host Name',
  'dhcp.option.domain_name': 'Domain Name',
  'dhcp.option.broadcast_address': 'Broadcast Address',
  'dhcp.option.requested_ip_address': 'Requested IP Address',
  'dhcp.option.ip_address_lease_time': 'IP Address Lease Time',
  'dhcp.option.dhcp_server_id': 'DHCP Server Identifier',
  'dhcp.option.renewal_time': 'Renewal Time Value',
  'dhcp.option.rebinding_time': 'Rebinding Time Value',
  'dhcp.option.client_id': 'Client identifier',

  // QUIC
  'quic.header_form': 'Header Form',
  'quic.fixed_bit': 'Fixed Bit',
  'quic.long.packet_type': 'Packet Type',
  'quic.version': 'Version',
  'quic.dcid': 'Destination Connection ID',
  'quic.scid': 'Source Connection ID',
  'quic.dcil': 'Destination Connection ID Length',
  'quic.scil': 'Source Connection ID Length',
  'quic.payload': 'Payload',
  'quic.packet_number': 'Packet Number',
  'quic.packet_length': 'Packet Length',
  'quic.frame': 'Frame',
  'quic.frame_type': 'Frame Type',
  'quic.stream.stream_id': 'Stream ID',
  'quic.stream.offset': 'Offset',
  'quic.stream.length': 'Length',
  'quic.stream.data': 'Stream Data',
};

// Get human-readable field name
const getFieldName = (fullPath) => {
  // Try exact match first
  if (fieldNames[fullPath]) {
    return fieldNames[fullPath];
  }

  // Try without layer prefix duplication (e.g., "tcp.tcp.srcport" -> "tcp.srcport")
  const parts = fullPath.split('.');
  if (parts.length >= 3 && parts[0] === parts[1]) {
    const simplified = parts.slice(1).join('.');
    if (fieldNames[simplified]) {
      return fieldNames[simplified];
    }
  }

  // Try last two parts (e.g., "frame.frame.time" -> "frame.time")
  if (parts.length >= 2) {
    const lastTwo = parts.slice(-2).join('.');
    if (fieldNames[lastTwo]) {
      return fieldNames[lastTwo];
    }
  }

  // Fallback: clean up the last part
  const lastPart = parts[parts.length - 1];
  return lastPart
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

// Get layer summary for header display
const getLayerSummary = (layerName, layerData) => {
  const flatData = flattenLayerData(layerData);

  switch (layerName) {
    case 'frame': {
      const len = flatData['frame.len'];
      const protos = flatData['frame.protocols'];
      if (len) return `${len} bytes on wire`;
      return '';
    }
    case 'eth': {
      const src = flatData['eth.src'] || flatData['eth.src_resolved'];
      const dst = flatData['eth.dst'] || flatData['eth.dst_resolved'];
      if (src && dst) return `${src} → ${dst}`;
      return '';
    }
    case 'ip': {
      const src = flatData['ip.src'];
      const dst = flatData['ip.dst'];
      if (src && dst) return `${src} → ${dst}`;
      return '';
    }
    case 'ipv6': {
      const src = flatData['ipv6.src'];
      const dst = flatData['ipv6.dst'];
      if (src && dst) return `${src} → ${dst}`;
      return '';
    }
    case 'tcp': {
      const srcPort = flatData['tcp.srcport'];
      const dstPort = flatData['tcp.dstport'];
      const seq = flatData['tcp.seq'];
      const ack = flatData['tcp.ack'];
      const len = flatData['tcp.len'];
      const flags = flatData['tcp.flags.str'] || flatData['tcp.flags'];
      let summary = '';
      if (srcPort && dstPort) summary += `${srcPort} → ${dstPort}`;
      if (flags) summary += ` [${flags}]`;
      if (seq) summary += ` Seq=${seq}`;
      if (ack) summary += ` Ack=${ack}`;
      if (len) summary += ` Len=${len}`;
      return summary;
    }
    case 'udp': {
      const srcPort = flatData['udp.srcport'];
      const dstPort = flatData['udp.dstport'];
      const len = flatData['udp.length'];
      let summary = '';
      if (srcPort && dstPort) summary += `${srcPort} → ${dstPort}`;
      if (len) summary += ` Len=${len}`;
      return summary;
    }
    case 'dns': {
      const id = flatData['dns.id'];
      const isResponse = flatData['dns.flags.response'] === '1';
      const qryName = flatData['dns.qry.name'];
      let summary = isResponse ? 'Response' : 'Query';
      if (id) summary = `${id} ${summary}`;
      if (qryName) summary += ` ${qryName}`;
      return summary;
    }
    case 'http': {
      const method = flatData['http.request.method'];
      const uri = flatData['http.request.uri'];
      const code = flatData['http.response.code'];
      const phrase = flatData['http.response.phrase'];
      if (method && uri) return `${method} ${uri}`;
      if (code && phrase) return `${code} ${phrase}`;
      if (code) return `${code}`;
      return '';
    }
    case 'tls': {
      const contentType = flatData['tls.record.content_type'];
      const handshakeType = flatData['tls.handshake.type'];
      if (handshakeType) {
        const types = { '1': 'Client Hello', '2': 'Server Hello', '11': 'Certificate', '12': 'Server Key Exchange', '14': 'Server Hello Done', '16': 'Client Key Exchange', '20': 'Finished' };
        return types[handshakeType] || `Handshake (${handshakeType})`;
      }
      if (contentType) {
        const types = { '20': 'Change Cipher Spec', '21': 'Alert', '22': 'Handshake', '23': 'Application Data' };
        return types[contentType] || `Record (${contentType})`;
      }
      return '';
    }
    case 'arp': {
      const opcode = flatData['arp.opcode'];
      const srcIp = flatData['arp.src.proto_ipv4'];
      const dstIp = flatData['arp.dst.proto_ipv4'];
      const op = opcode === '1' ? 'Request' : opcode === '2' ? 'Reply' : '';
      if (op && srcIp && dstIp) return `${op}: ${srcIp} → ${dstIp}`;
      return op || '';
    }
    case 'icmp': {
      const type = flatData['icmp.type'];
      const code = flatData['icmp.code'];
      const types = { '0': 'Echo Reply', '3': 'Destination Unreachable', '8': 'Echo Request', '11': 'Time Exceeded' };
      return types[type] || `Type ${type}, Code ${code}`;
    }
    default:
      return '';
  }
};

// Flatten nested layer data for easy field lookup
const flattenLayerData = (data, prefix = '', result = {}) => {
  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      flattenLayerData(value, fullKey, result);
    } else {
      result[key] = value;  // Store with short key for easier lookup
      result[fullKey] = value;  // Also store with full path
    }
  }
  return result;
};

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

// Parse tshark JSON into tree structure with summaries
const detailsTree = computed(() => {
  if (!activePacketDetails.value) return [];

  const details = activePacketDetails.value;
  const layers = details._source?.layers || details.layers || {};

  const tree = [];
  for (const [layerName, layerData] of Object.entries(layers)) {
    if (typeof layerData !== 'object' || layerData === null) continue;

    // Skip _raw layers (frame_raw, eth_raw, ip_raw, udp_raw, zixi_raw, etc.)
    if (layerName.endsWith('_raw')) continue;

    const summary = getLayerSummary(layerName, layerData);
    const node = {
      name: formatLayerName(layerName),
      summary,
      path: layerName,
      isLayer: true,
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
    icmpv6: 'Internet Control Message Protocol v6',
    dhcp: 'Dynamic Host Configuration Protocol',
    quic: 'QUIC',
    data: 'Data',
    zixi: 'ZIXI Protocol',
  };
  return names[name] || name.toUpperCase();
};

// Check if a field should be filtered out
const shouldFilterField = (key) => {
  // Filter out _raw fields and other internal fields
  if (key.endsWith('_raw') || key.includes('_raw_')) return true;
  if (key.endsWith('_tree')) return true;
  // Filter duplicate address/host fields that are redundant
  if (key === 'ip.addr' || key === 'ip.host') return true;
  if (key === 'ipv6.addr' || key === 'ipv6.host') return true;
  if (key === 'tcp.port' || key === 'udp.port') return true;
  if (key === 'eth.addr') return true;
  return false;
};

// Parse layer fields into tree nodes (recursive for arbitrary depth)
const parseLayerFields = (data, prefix) => {
  const fields = [];
  for (const [key, value] of Object.entries(data)) {
    // Skip _raw and other filtered fields
    if (shouldFilterField(key)) continue;

    const path = `${prefix}.${key}`;
    const displayName = getFieldName(path);

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object - recurse
      const children = parseLayerFields(value, path);
      // Only add if there are visible children
      if (children.length > 0) {
        fields.push({
          name: displayName,
          path,
          children,
          hasChildren: true,
        });
      }
    } else if (Array.isArray(value)) {
      // Array - show as comma-separated or with indices
      if (value.length > 0 && typeof value[0] === 'object') {
        // Array of objects - create indexed children
        const children = value.map((item, idx) => ({
          name: `[${idx}]`,
          path: `${path}[${idx}]`,
          children: typeof item === 'object' ? parseLayerFields(item, `${path}[${idx}]`) : [],
          value: typeof item !== 'object' ? String(item) : undefined,
        })).filter(child => child.children.length > 0 || child.value);
        if (children.length > 0) {
          fields.push({
            name: displayName,
            path,
            children,
            hasChildren: true,
          });
        }
      } else {
        // Array of primitives
        fields.push({
          name: displayName,
          value: value.join(', '),
          path,
        });
      }
    } else {
      // Primitive value
      const formattedValue = formatValue(key, path, value);
      fields.push({
        name: displayName,
        value: formattedValue,
        path,
      });
    }
  }
  return fields;
};

// Format values for display - Wireshark style
const formatValue = (key, path, value) => {
  if (value === null || value === undefined) return '';
  const strValue = String(value);
  const keyLower = key.toLowerCase();

  // Boolean flags - show "Set" or "Not set"
  if (strValue === '0' || strValue === '1') {
    const flagKeys = ['flags.', '.rb', '.df', '.mf', '.syn', '.ack', '.fin', '.rst', '.psh', '.push', '.urg',
                      '.ns', '.cwr', '.ecn', '.ece', '.response', '.authoritative', '.truncated',
                      '.recdesired', '.recavail', '.lg', '.ig'];
    if (flagKeys.some(f => path.toLowerCase().includes(f))) {
      return strValue === '1' ? 'Set' : 'Not set';
    }
  }

  // Protocol numbers - add protocol name
  if (keyLower === 'proto' || path.endsWith('.ip.proto')) {
    const protocols = { '1': 'ICMP (1)', '6': 'TCP (6)', '17': 'UDP (17)', '41': 'IPv6 (41)', '47': 'GRE (47)', '50': 'ESP (50)', '58': 'ICMPv6 (58)', '89': 'OSPF (89)' };
    return protocols[strValue] || strValue;
  }

  // Ethernet type - add description
  if (keyLower === 'type' && path.includes('eth')) {
    const types = { '0x0800': 'IPv4 (0x0800)', '0x0806': 'ARP (0x0806)', '0x86dd': 'IPv6 (0x86dd)', '0x8100': 'VLAN (0x8100)' };
    return types[strValue] || strValue;
  }

  // Checksum status
  if (path.includes('checksum.status')) {
    const statuses = { '0': 'Unverified', '1': 'Good', '2': 'Bad' };
    return statuses[strValue] || strValue;
  }

  // Header length in bytes
  if (keyLower === 'hdr_len' && path.includes('ip.')) {
    const bytes = parseInt(strValue);
    if (!isNaN(bytes)) {
      return `${bytes * 4} bytes (${bytes})`;
    }
  }
  if (keyLower === 'hdr_len' && path.includes('tcp.')) {
    const bytes = parseInt(strValue);
    if (!isNaN(bytes)) {
      return `${bytes * 4} bytes (${bytes})`;
    }
  }

  // ARP opcode
  if (path.includes('arp.opcode')) {
    const opcodes = { '1': 'request (1)', '2': 'reply (2)' };
    return opcodes[strValue] || strValue;
  }

  // ICMP type
  if (path.includes('icmp.type')) {
    const types = { '0': 'Echo Reply (0)', '3': 'Destination Unreachable (3)', '8': 'Echo Request (8)', '11': 'Time Exceeded (11)' };
    return types[strValue] || strValue;
  }

  return strValue;
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
      <!-- Layer headers with summaries -->
      <template v-for="layer in detailsTree" :key="layer.path">
        <div
          class="layer-header"
          :class="{ collapsed: isCollapsed(layer.path) }"
          @click="toggleCollapse(layer.path)"
        >
          <span class="toggle">{{ isCollapsed(layer.path) ? '▶' : '▼' }}</span>
          <span class="layer-name">{{ layer.name }}</span>
          <span v-if="layer.summary" class="layer-summary">, {{ layer.summary }}</span>
        </div>
        <div v-if="!isCollapsed(layer.path)" class="children">
          <template v-for="field in layer.children" :key="field.path">
            <!-- Recursive field rendering using nested templates for up to 5 levels -->
            <template v-if="field.children && field.children.length > 0">
              <div class="field-parent">
                <div
                  class="field-header"
                  :class="{ collapsed: isCollapsed(field.path) }"
                  @click="toggleCollapse(field.path)"
                >
                  <span class="toggle">{{ isCollapsed(field.path) ? '▶' : '▼' }}</span>
                  <span class="field-name-expandable">{{ field.name }}</span>
                </div>
                <div v-if="!isCollapsed(field.path)" class="nested-children">
                  <template v-for="child2 in field.children" :key="child2.path">
                    <!-- Level 2 -->
                    <template v-if="child2.children && child2.children.length > 0">
                      <div class="field-parent">
                        <div
                          class="field-header"
                          :class="{ collapsed: isCollapsed(child2.path) }"
                          @click="toggleCollapse(child2.path)"
                        >
                          <span class="toggle">{{ isCollapsed(child2.path) ? '▶' : '▼' }}</span>
                          <span class="field-name-expandable">{{ child2.name }}</span>
                        </div>
                        <div v-if="!isCollapsed(child2.path)" class="nested-children">
                          <template v-for="child3 in child2.children" :key="child3.path">
                            <!-- Level 3 -->
                            <template v-if="child3.children && child3.children.length > 0">
                              <div class="field-parent">
                                <div
                                  class="field-header"
                                  :class="{ collapsed: isCollapsed(child3.path) }"
                                  @click="toggleCollapse(child3.path)"
                                >
                                  <span class="toggle">{{ isCollapsed(child3.path) ? '▶' : '▼' }}</span>
                                  <span class="field-name-expandable">{{ child3.name }}</span>
                                </div>
                                <div v-if="!isCollapsed(child3.path)" class="nested-children">
                                  <template v-for="child4 in child3.children" :key="child4.path">
                                    <!-- Level 4 -->
                                    <template v-if="child4.children && child4.children.length > 0">
                                      <div class="field-parent">
                                        <div
                                          class="field-header"
                                          :class="{ collapsed: isCollapsed(child4.path) }"
                                          @click="toggleCollapse(child4.path)"
                                        >
                                          <span class="toggle">{{ isCollapsed(child4.path) ? '▶' : '▼' }}</span>
                                          <span class="field-name-expandable">{{ child4.name }}</span>
                                        </div>
                                        <div v-if="!isCollapsed(child4.path)" class="nested-children">
                                          <div v-for="child5 in child4.children" :key="child5.path" class="field">
                                            <span class="field-name">{{ child5.name }}:</span>
                                            <span class="field-value">{{ child5.value }}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </template>
                                    <div v-else class="field">
                                      <span class="field-name">{{ child4.name }}:</span>
                                      <span class="field-value">{{ child4.value }}</span>
                                    </div>
                                  </template>
                                </div>
                              </div>
                            </template>
                            <div v-else class="field">
                              <span class="field-name">{{ child3.name }}:</span>
                              <span class="field-value">{{ child3.value }}</span>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                    <div v-else class="field">
                      <span class="field-name">{{ child2.name }}:</span>
                      <span class="field-value">{{ child2.value }}</span>
                    </div>
                  </template>
                </div>
              </div>
            </template>
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
  color: #d4d4d4;
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
  padding: 2px;
}

/* Layer headers - protocol sections */
.layer-header {
  padding: 3px 6px;
  margin: 1px 0;
  background: linear-gradient(to bottom, #3c3c3c, #2d2d30);
  border: 1px solid #3e3e42;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
}

.layer-header:hover {
  background: linear-gradient(to bottom, #4a4a4a, #3a3a3d);
  border-color: #505054;
}

.layer-name {
  font-weight: 600;
  color: #e8e8e8;
}

.layer-summary {
  color: #9cdcfe;
  font-weight: normal;
  margin-left: 0;
}

.toggle {
  display: inline-block;
  width: 16px;
  min-width: 16px;
  text-align: center;
  font-size: 10px;
  color: #888;
  margin-right: 2px;
}

.layer-header:hover .toggle {
  color: #ccc;
}

.children {
  padding-left: 16px;
  border-left: 1px solid #3e3e42;
  margin-left: 7px;
}

.field-parent {
  margin: 0;
}

.field-header {
  padding: 2px 4px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
}

.field-header:hover {
  background: #2a2d2e;
}

.field-name-expandable {
  color: #dcdcaa;
}

.nested-children {
  padding-left: 16px;
  border-left: 1px solid #3e3e42;
  margin-left: 7px;
}

.field {
  padding: 2px 4px;
  display: flex;
  align-items: baseline;
}

.field:hover {
  background: #2a2d2e;
}

.field-name {
  color: #9cdcfe;
  flex-shrink: 0;
}

.field-value {
  color: #ce9178;
  margin-left: 8px;
  word-break: break-all;
}
</style>
