<script setup>
import { ref, watch, computed, onUnmounted } from "vue";
import { packets, activePacketIndex, activePacketDetails, activePacketHex, activePacketRawHex, highlightedByteRange, isSessionOwner, followOwner, broadcastOwnerState, onOwnerStateChange } from "../../globals";
import { getPacketWithPrefetch, getCachedPacket, isFetchingBatch } from "../../packetCache";

// Collapsed state for tree nodes
const collapsed = ref({});
const isLoading = ref(false);

// Toggle collapse state
const toggleCollapse = (path) => {
  collapsed.value[path] = !collapsed.value[path];
  // Broadcast collapsed state change to viewers if owner
  if (isSessionOwner.value) {
    broadcastOwnerState({ collapsed: { ...collapsed.value } });
  }
};

// Check if collapsed
const isCollapsed = (path) => collapsed.value[path] !== false;

// Listen for owner state changes (for viewers)
const unsubscribeOwnerState = onOwnerStateChange((state) => {
  // Only apply if we're a viewer and following is enabled
  if (isSessionOwner.value || !followOwner.value) return;

  // Apply collapsed state
  if (state.collapsed !== undefined) {
    collapsed.value = { ...state.collapsed };
  }

  // Apply highlighted byte range
  if (state.highlightedByteRange !== undefined) {
    highlightedByteRange.value = state.highlightedByteRange;
  }
});

// Cleanup timeout reference (set later)
let cleanupHighlightTimeout = null;

// Cleanup on unmount
onUnmounted(() => {
  unsubscribeOwnerState();
  if (cleanupHighlightTimeout) clearTimeout(cleanupHighlightTimeout);
});

// MAC OUI (Organizationally Unique Identifier) vendor lookup
// Format: first 3 bytes of MAC address (uppercase, colon-separated) -> vendor short name
const macOuiVendors = {
  // Intel
  '00:1B:21': 'Intel', '00:1C:C0': 'Intel', '00:1D:E0': 'Intel', '00:1E:64': 'Intel',
  '00:1E:65': 'Intel', '00:1E:67': 'Intel', '00:1F:3B': 'Intel', '00:1F:3C': 'Intel',
  '00:21:5C': 'Intel', '00:21:5D': 'Intel', '00:21:6A': 'Intel', '00:21:6B': 'Intel',
  '00:22:FA': 'Intel', '00:22:FB': 'Intel', '00:24:D6': 'Intel', '00:24:D7': 'Intel',
  '00:26:C6': 'Intel', '00:26:C7': 'Intel', '00:27:10': 'Intel', '00:A0:C9': 'Intel',
  '24:EB:16': 'Intel', '3C:A9:F4': 'Intel', '48:51:B7': 'Intel', '5C:87:9C': 'Intel',
  '5C:C5:D4': 'Intel', '64:D4:DA': 'Intel', '68:05:CA': 'Intel', '68:17:29': 'Intel',
  '7C:7A:91': 'Intel', '80:86:F2': 'Intel', '84:3A:4B': 'Intel', '88:53:2E': 'Intel',
  '8C:EC:4B': 'Intel', '98:4F:EE': 'Intel', 'A4:34:D9': 'Intel', 'A4:C4:94': 'Intel',
  'AC:FD:CE': 'Intel', 'B4:6B:FC': 'Intel', 'B8:08:CF': 'Intel', 'DC:53:60': 'Intel',
  'E8:B1:FC': 'Intel', 'F4:8C:50': 'Intel', 'F8:16:54': 'Intel', 'F8:94:C2': 'Intel',

  // Broadcom
  '00:10:18': 'Broadcom', '00:0A:F7': 'Broadcom', '00:1B:E9': 'Broadcom',
  '00:22:5F': 'Broadcom', '00:23:A2': 'Broadcom', '00:24:D4': 'Broadcom',
  '00:26:86': 'Broadcom', '00:90:4C': 'Broadcom', '08:00:0E': 'Broadcom',
  '98:0C:82': 'Broadcom', 'AC:10:0B': 'Broadcom', 'D8:FE:E3': 'Broadcom',

  // VMware
  '00:0C:29': 'VMware', '00:50:56': 'VMware', '00:05:69': 'VMware',
  '00:1C:14': 'VMware', '00:1C:42': 'Parallels',

  // Realtek
  '00:E0:4C': 'Realtek', '52:54:00': 'Realtek', '00:0A:CD': 'Realtek',
  '08:10:74': 'Realtek', '08:10:75': 'Realtek', '08:60:6E': 'Realtek',
  '28:F0:76': 'Realtek', '48:5D:60': 'Realtek', '4C:ED:FB': 'Realtek',
  '50:3E:AA': 'Realtek', '52:54:00': 'RealtekVirt', '54:E1:AD': 'Realtek',
  '70:8B:CD': 'Realtek', '74:D0:2B': 'Realtek', '80:A5:89': 'Realtek',
  '9C:5C:8E': 'Realtek', 'B0:A7:32': 'Realtek', 'D4:6A:6A': 'Realtek',

  // Cisco
  '00:00:0C': 'Cisco', '00:01:42': 'Cisco', '00:01:43': 'Cisco', '00:01:63': 'Cisco',
  '00:01:64': 'Cisco', '00:01:96': 'Cisco', '00:01:97': 'Cisco', '00:01:C7': 'Cisco',
  '00:01:C9': 'Cisco', '00:02:16': 'Cisco', '00:02:17': 'Cisco', '00:02:3D': 'Cisco',
  '00:02:4A': 'Cisco', '00:02:4B': 'Cisco', '00:02:7D': 'Cisco', '00:02:7E': 'Cisco',
  '00:02:B9': 'Cisco', '00:02:BA': 'Cisco', '00:02:FC': 'Cisco', '00:02:FD': 'Cisco',
  '00:03:31': 'Cisco', '00:03:32': 'Cisco', '00:03:6B': 'Cisco', '00:03:6C': 'Cisco',
  '00:03:9F': 'Cisco', '00:03:A0': 'Cisco', '00:03:E3': 'Cisco', '00:03:E4': 'Cisco',
  '00:03:FD': 'Cisco', '00:03:FE': 'Cisco', '00:04:27': 'Cisco', '00:04:28': 'Cisco',

  // Apple
  '00:03:93': 'Apple', '00:05:02': 'Apple', '00:0A:27': 'Apple', '00:0A:95': 'Apple',
  '00:0D:93': 'Apple', '00:10:FA': 'Apple', '00:11:24': 'Apple', '00:14:51': 'Apple',
  '00:16:CB': 'Apple', '00:17:F2': 'Apple', '00:19:E3': 'Apple', '00:1B:63': 'Apple',
  '00:1C:B3': 'Apple', '00:1D:4F': 'Apple', '00:1E:52': 'Apple', '00:1E:C2': 'Apple',
  '00:1F:5B': 'Apple', '00:1F:F3': 'Apple', '00:21:E9': 'Apple', '00:22:41': 'Apple',
  '00:23:12': 'Apple', '00:23:32': 'Apple', '00:23:6C': 'Apple', '00:23:DF': 'Apple',
  '00:24:36': 'Apple', '00:25:00': 'Apple', '00:25:4B': 'Apple', '00:25:BC': 'Apple',
  '00:26:08': 'Apple', '00:26:4A': 'Apple', '00:26:B0': 'Apple', '00:26:BB': 'Apple',
  '04:0C:CE': 'Apple', '04:15:52': 'Apple', '04:1E:64': 'Apple', '04:26:65': 'Apple',
  '10:40:F3': 'Apple', '14:10:9F': 'Apple', '18:E7:F4': 'Apple', '24:A0:74': 'Apple',
  '28:6A:BA': 'Apple', '28:CF:DA': 'Apple', '2C:BE:08': 'Apple', '34:15:9E': 'Apple',
  '3C:07:54': 'Apple', '40:33:1A': 'Apple', '44:2A:60': 'Apple', '48:60:BC': 'Apple',
  '54:EA:A8': 'Apple', '58:55:CA': 'Apple', '5C:F9:38': 'Apple', '60:C5:47': 'Apple',
  '64:A5:C3': 'Apple', '68:5B:35': 'Apple', '6C:40:08': 'Apple', '70:DE:E2': 'Apple',
  '78:31:C1': 'Apple', '7C:6D:62': 'Apple', '80:00:6E': 'Apple', '80:92:9F': 'Apple',
  '84:29:99': 'Apple', '88:53:95': 'Apple', '88:63:DF': 'Apple', '8C:85:90': 'Apple',
  '90:27:E4': 'Apple', '98:01:A7': 'Apple', '9C:20:7B': 'Apple', 'A4:D1:D2': 'Apple',
  'A8:86:DD': 'Apple', 'AC:BC:32': 'Apple', 'B0:34:95': 'Apple', 'B8:09:8A': 'Apple',
  'BC:52:B7': 'Apple', 'C0:84:7A': 'Apple', 'C8:69:CD': 'Apple', 'CC:08:E0': 'Apple',
  'D4:9A:20': 'Apple', 'D8:30:62': 'Apple', 'DC:2B:2A': 'Apple', 'E0:F8:47': 'Apple',
  'E4:8B:7F': 'Apple', 'E8:04:0B': 'Apple', 'F0:99:BF': 'Apple', 'F8:1E:DF': 'Apple',

  // Dell
  '00:06:5B': 'Dell', '00:08:74': 'Dell', '00:0B:DB': 'Dell', '00:0D:56': 'Dell',
  '00:0F:1F': 'Dell', '00:11:43': 'Dell', '00:12:3F': 'Dell', '00:13:72': 'Dell',
  '00:14:22': 'Dell', '00:15:C5': 'Dell', '00:16:F0': 'Dell', '00:18:8B': 'Dell',
  '00:19:B9': 'Dell', '00:1A:A0': 'Dell', '00:1C:23': 'Dell', '00:1D:09': 'Dell',
  '00:1E:4F': 'Dell', '00:1E:C9': 'Dell', '00:21:70': 'Dell', '00:21:9B': 'Dell',
  '00:22:19': 'Dell', '00:23:AE': 'Dell', '00:24:E8': 'Dell', '00:25:64': 'Dell',
  '00:26:B9': 'Dell', '14:18:77': 'Dell', '14:FE:B5': 'Dell', '18:03:73': 'Dell',
  '18:A9:9B': 'Dell', '18:DB:F2': 'Dell', '1C:40:24': 'Dell', '20:47:47': 'Dell',

  // HP/HPE
  '00:01:E6': 'HP', '00:01:E7': 'HP', '00:02:A5': 'HP', '00:04:EA': 'HP',
  '00:08:02': 'HP', '00:08:83': 'HP', '00:0A:57': 'HP', '00:0B:CD': 'HP',
  '00:0D:9D': 'HP', '00:0E:7F': 'HP', '00:0F:20': 'HP', '00:0F:61': 'HP',
  '00:10:83': 'HP', '00:10:E3': 'HP', '00:11:0A': 'HP', '00:11:85': 'HP',
  '00:12:79': 'HP', '00:13:21': 'HP', '00:14:38': 'HP', '00:14:C2': 'HP',
  '00:15:60': 'HP', '00:16:35': 'HP', '00:17:08': 'HP', '00:17:A4': 'HP',
  '00:18:71': 'HP', '00:18:FE': 'HP', '00:19:BB': 'HP', '00:1A:4B': 'HP',
  '00:1B:78': 'HP', '00:1C:2E': 'HP', '00:1C:C4': 'HP', '00:1E:0B': 'HP',
  '00:1F:29': 'HP', '00:1F:FE': 'HP', '00:21:5A': 'HP', '00:22:64': 'HP',
  '00:23:7D': 'HP', '00:24:81': 'HP', '00:25:B3': 'HP', '00:26:55': 'HP',

  // Microsoft / Hyper-V
  '00:15:5D': 'HyperV', '00:03:FF': 'Microsoft', '00:0D:3A': 'Microsoft',
  '00:12:5A': 'Microsoft', '00:17:FA': 'Microsoft', '00:1D:D8': 'Microsoft',
  '00:22:48': 'Microsoft', '28:18:78': 'Microsoft', '50:1A:C5': 'Microsoft',
  '60:45:BD': 'Microsoft', '7C:1E:52': 'Microsoft', '7C:ED:8D': 'Microsoft',

  // Amazon AWS
  '02:00:00': 'AWS', '06:00:00': 'AWS', '0A:00:00': 'AWS', '0E:00:00': 'AWS',

  // Google
  '00:1A:11': 'Google', '08:9E:08': 'Google', '0C:54:A5': 'Google',
  '1A:62:3A': 'Google', '3C:5A:B4': 'Google', '54:60:09': 'Google',
  '58:CB:52': 'Google', '70:32:17': 'Google', '94:EB:2C': 'Google',
  'A4:77:33': 'Google', 'D8:6C:63': 'Google', 'F4:F5:D8': 'Google',

  // Samsung
  '00:00:F0': 'Samsung', '00:02:78': 'Samsung', '00:07:AB': 'Samsung',
  '00:09:18': 'Samsung', '00:0D:AE': 'Samsung', '00:12:47': 'Samsung',
  '00:12:FB': 'Samsung', '00:13:77': 'Samsung', '00:15:99': 'Samsung',
  '00:16:32': 'Samsung', '00:16:6B': 'Samsung', '00:16:6C': 'Samsung',
  '00:17:C9': 'Samsung', '00:17:D5': 'Samsung', '00:18:AF': 'Samsung',
  '00:1A:8A': 'Samsung', '00:1B:98': 'Samsung', '00:1C:43': 'Samsung',
  '00:1D:25': 'Samsung', '00:1D:F6': 'Samsung', '00:1E:7D': 'Samsung',
  '00:1F:CC': 'Samsung', '00:1F:CD': 'Samsung', '00:21:4C': 'Samsung',

  // Qualcomm/Atheros
  '00:03:7F': 'Atheros', '00:13:74': 'Atheros', '00:15:AF': 'Atheros',
  '00:1D:0F': 'Atheros', '00:24:6C': 'Atheros', '04:F0:21': 'Qualcomm',
  '78:D6:F0': 'Qualcomm', '9C:65:F9': 'Qualcomm', 'C0:EE:FB': 'Qualcomm',

  // Juniper
  '00:05:85': 'Juniper', '00:10:DB': 'Juniper', '00:12:1E': 'Juniper',
  '00:14:F6': 'Juniper', '00:17:CB': 'Juniper', '00:19:E2': 'Juniper',
  '00:1B:C0': 'Juniper', '00:1D:B5': 'Juniper', '00:1F:12': 'Juniper',
  '00:21:59': 'Juniper', '00:22:83': 'Juniper', '00:23:9C': 'Juniper',
  '00:24:DC': 'Juniper', '00:26:88': 'Juniper', '28:8A:1C': 'Juniper',
  '28:A2:4B': 'Juniper', '28:C0:DA': 'Juniper', '2C:21:31': 'Juniper',
  '2C:21:72': 'Juniper', '2C:6B:F5': 'Juniper', '30:7C:5E': 'Juniper',
  '3C:61:04': 'Juniper', '3C:8A:B0': 'Juniper', '40:71:83': 'Juniper',
  '40:A6:77': 'Juniper', '40:B4:F0': 'Juniper', '44:AA:50': 'Juniper',
  '44:F4:77': 'Juniper', '4C:96:14': 'Juniper', '50:C5:8D': 'Juniper',
  '54:1E:56': 'Juniper', '54:4B:8C': 'Juniper', '54:E0:32': 'Juniper',
  '5C:45:27': 'Juniper', '5C:5E:AB': 'Juniper', '64:64:9B': 'Juniper',
  '64:87:88': 'Juniper', '78:19:F7': 'Juniper', '78:FE:3D': 'Juniper',
  '80:71:1F': 'Juniper', '80:AC:AC': 'Juniper', '84:18:88': 'Juniper',
  '84:B5:9C': 'Juniper', '84:C1:C1': 'Juniper', '88:A2:5E': 'Juniper',
  '88:E0:F3': 'Juniper', '8C:60:4F': 'Juniper', '9C:CC:83': 'Juniper',
  'A8:D0:E5': 'Juniper', 'AC:4B:C8': 'Juniper', 'B0:A8:6E': 'Juniper',
  'B0:C6:9A': 'Juniper', 'CC:E1:7F': 'Juniper', 'D4:04:FF': 'Juniper',
  'DC:38:E1': 'Juniper', 'EC:13:DB': 'Juniper', 'EC:3E:F7': 'Juniper',
  'F0:1C:2D': 'Juniper', 'F4:A7:39': 'Juniper', 'F4:B5:2F': 'Juniper',
  'F8:C0:01': 'Juniper',

  // Arista
  '00:1C:73': 'Arista', '28:99:3A': 'Arista', '44:4C:A8': 'Arista',
  '74:83:C2': 'Arista', '94:8E:D3': 'Arista', 'D4:AF:F7': 'Arista',

  // Mellanox/NVIDIA
  '00:02:C9': 'Mellanox', '00:25:90': 'Mellanox', '0C:42:A1': 'Mellanox',
  '24:8A:07': 'Mellanox', '50:6B:4B': 'Mellanox', '7C:FE:90': 'Mellanox',
  '98:03:9B': 'Mellanox', 'B8:59:9F': 'Mellanox', 'B8:CE:F6': 'Mellanox',
  'E4:1D:2D': 'Mellanox', 'E8:EB:D3': 'Mellanox', 'EC:0D:9A': 'Mellanox',

  // Supermicro
  '00:25:90': 'Supermicro', '00:30:48': 'Supermicro', '0C:C4:7A': 'Supermicro',
  '3C:EC:EF': 'Supermicro', 'AC:1F:6B': 'Supermicro',

  // Lenovo
  '00:09:2D': 'Lenovo', '00:1A:6B': 'Lenovo', '00:21:5E': 'Lenovo',
  '00:24:7E': 'Lenovo', '08:D4:0C': 'Lenovo', '28:D2:44': 'Lenovo',
  '40:B0:34': 'Lenovo', '54:EE:75': 'Lenovo', '68:F7:28': 'Lenovo',
  '6C:0B:84': 'Lenovo', '70:5A:0F': 'Lenovo', '74:E5:0B': 'Lenovo',
  '84:7B:EB': 'Lenovo', '8C:DC:D4': 'Lenovo', '98:FA:9B': 'Lenovo',

  // ASUS
  '00:0C:6E': 'ASUS', '00:11:2F': 'ASUS', '00:13:D4': 'ASUS',
  '00:15:F2': 'ASUS', '00:17:31': 'ASUS', '00:1A:92': 'ASUS',
  '00:1D:60': 'ASUS', '00:1E:8C': 'ASUS', '00:1F:C6': 'ASUS',
  '00:22:15': 'ASUS', '00:23:54': 'ASUS', '00:24:8C': 'ASUS',
  '00:26:18': 'ASUS', '04:92:26': 'ASUS', '08:60:6E': 'ASUS',
  '10:BF:48': 'ASUS', '14:DA:E9': 'ASUS', '1C:87:2C': 'ASUS',

  // TP-Link
  '00:1D:0F': 'TP-Link', '14:CC:20': 'TP-Link', '18:D6:C7': 'TP-Link',
  '1C:3B:F3': 'TP-Link', '30:B5:C2': 'TP-Link', '50:C7:BF': 'TP-Link',
  '54:C8:0F': 'TP-Link', '5C:A6:E6': 'TP-Link', '60:E3:27': 'TP-Link',
  '64:66:B3': 'TP-Link', '64:70:02': 'TP-Link', '6C:5A:B0': 'TP-Link',
  '74:EA:3A': 'TP-Link', '78:44:76': 'TP-Link', '80:89:17': 'TP-Link',
  '90:F6:52': 'TP-Link', '94:D9:B3': 'TP-Link', '98:DA:C4': 'TP-Link',
  'A4:2B:B0': 'TP-Link', 'B0:BE:76': 'TP-Link', 'C0:25:E9': 'TP-Link',
  'C4:E9:84': 'TP-Link', 'D8:07:B6': 'TP-Link', 'E8:94:F6': 'TP-Link',
  'F4:EC:38': 'TP-Link', 'F8:D1:11': 'TP-Link',

  // Netgear
  '00:09:5B': 'Netgear', '00:0F:B5': 'Netgear', '00:14:6C': 'Netgear',
  '00:18:4D': 'Netgear', '00:1B:2F': 'Netgear', '00:1E:2A': 'Netgear',
  '00:1F:33': 'Netgear', '00:22:3F': 'Netgear', '00:24:B2': 'Netgear',
  '00:26:F2': 'Netgear', '04:A1:51': 'Netgear', '08:BD:43': 'Netgear',
  '10:0C:6B': 'Netgear', '10:DA:43': 'Netgear', '20:E5:2A': 'Netgear',
  '28:C6:8E': 'Netgear', '2C:B0:5D': 'Netgear', '30:46:9A': 'Netgear',
  '44:94:FC': 'Netgear', '4C:60:DE': 'Netgear', '6C:B0:CE': 'Netgear',
  '84:1B:5E': 'Netgear', '9C:3D:CF': 'Netgear', 'A0:04:60': 'Netgear',
  'A0:21:B7': 'Netgear', 'A0:40:A0': 'Netgear', 'A4:2B:8C': 'Netgear',
  'B0:7F:B9': 'Netgear', 'C0:3F:0E': 'Netgear', 'C4:04:15': 'Netgear',
  'C4:3D:C7': 'Netgear', 'CC:40:D0': 'Netgear', 'E0:46:9A': 'Netgear',
  'E0:91:F5': 'Netgear', 'E4:F4:C6': 'Netgear', 'E8:FC:AF': 'Netgear',

  // D-Link
  '00:05:5D': 'D-Link', '00:0D:88': 'D-Link', '00:0F:3D': 'D-Link',
  '00:11:95': 'D-Link', '00:13:46': 'D-Link', '00:15:E9': 'D-Link',
  '00:17:9A': 'D-Link', '00:19:5B': 'D-Link', '00:1B:11': 'D-Link',
  '00:1C:F0': 'D-Link', '00:1E:58': 'D-Link', '00:21:91': 'D-Link',
  '00:22:B0': 'D-Link', '00:24:01': 'D-Link', '00:26:5A': 'D-Link',
  '00:27:22': 'D-Link', '14:D6:4D': 'D-Link', '1C:7E:E5': 'D-Link',
  '1C:AF:F7': 'D-Link', '28:10:7B': 'D-Link', '34:08:04': 'D-Link',
  '3C:1E:04': 'D-Link', '5C:D9:98': 'D-Link', '78:32:1B': 'D-Link',
  '78:54:2E': 'D-Link', '84:C9:B2': 'D-Link', '90:94:E4': 'D-Link',
  '9C:D6:43': 'D-Link', 'AC:F1:DF': 'D-Link', 'B8:A3:86': 'D-Link',
  'BC:F6:85': 'D-Link', 'C0:A0:BB': 'D-Link', 'C8:BE:19': 'D-Link',
  'C8:D3:A3': 'D-Link', 'CC:B2:55': 'D-Link', 'E4:6F:13': 'D-Link',
  'E8:CC:18': 'D-Link', 'F0:7D:68': 'D-Link',

  // Ubiquiti
  '00:15:6D': 'Ubiquiti', '00:27:22': 'Ubiquiti', '04:18:D6': 'Ubiquiti',
  '18:E8:29': 'Ubiquiti', '24:5A:4C': 'Ubiquiti', '24:A4:3C': 'Ubiquiti',
  '44:D9:E7': 'Ubiquiti', '68:72:51': 'Ubiquiti', '70:A7:41': 'Ubiquiti',
  '74:83:C2': 'Ubiquiti', '78:8A:20': 'Ubiquiti', '80:2A:A8': 'Ubiquiti',
  'AC:8B:A9': 'Ubiquiti', 'B4:FB:E4': 'Ubiquiti', 'DC:9F:DB': 'Ubiquiti',
  'E0:63:DA': 'Ubiquiti', 'F0:9F:C2': 'Ubiquiti', 'FC:EC:DA': 'Ubiquiti',

  // Huawei
  '00:18:82': 'Huawei', '00:1E:10': 'Huawei', '00:25:68': 'Huawei',
  '00:25:9E': 'Huawei', '00:34:FE': 'Huawei', '00:46:4B': 'Huawei',
  '00:5A:13': 'Huawei', '00:66:4B': 'Huawei', '00:9A:CD': 'Huawei',
  '00:E0:FC': 'Huawei', '04:02:1F': 'Huawei', '04:25:C5': 'Huawei',
  '04:33:89': 'Huawei', '04:B0:E7': 'Huawei', '04:C0:6F': 'Huawei',
  '04:F9:38': 'Huawei', '08:19:A6': 'Huawei', '08:63:61': 'Huawei',
  '08:7A:4C': 'Huawei', '0C:37:DC': 'Huawei', '0C:45:BA': 'Huawei',
  '0C:96:BF': 'Huawei', '10:1B:54': 'Huawei', '10:44:00': 'Huawei',
  '10:47:80': 'Huawei', '10:C6:1F': 'Huawei', '14:A0:F8': 'Huawei',
  '14:B9:68': 'Huawei', '18:C5:8A': 'Huawei', '1C:1D:67': 'Huawei',
  '1C:8E:5C': 'Huawei', '20:08:ED': 'Huawei', '20:0B:C7': 'Huawei',
  '20:2B:C1': 'Huawei', '20:A6:80': 'Huawei', '20:F3:A3': 'Huawei',

  // VirtualBox
  '08:00:27': 'VirtualBox',

  // Docker
  '02:42:AC': 'Docker',

  // Private/Local
  '02:00:00': 'Local', 'FE:FF:FF': 'Local',
};

// Port to protocol mapping for heuristics
const portProtocols = {
  // Well-known ports
  20: 'FTP-DATA', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP',
  53: 'DNS', 67: 'DHCP', 68: 'DHCP', 69: 'TFTP', 80: 'HTTP',
  110: 'POP3', 119: 'NNTP', 123: 'NTP', 135: 'RPC', 137: 'NetBIOS',
  138: 'NetBIOS', 139: 'NetBIOS', 143: 'IMAP', 161: 'SNMP', 162: 'SNMP',
  179: 'BGP', 194: 'IRC', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB',
  465: 'SMTPS', 500: 'IKE', 514: 'Syslog', 515: 'LPD', 520: 'RIP',
  523: 'IBM-DB2', 554: 'RTSP', 587: 'SMTP', 631: 'IPP', 636: 'LDAPS',
  873: 'rsync', 902: 'VMware', 989: 'FTPS', 990: 'FTPS', 993: 'IMAPS',
  995: 'POP3S', 1080: 'SOCKS', 1194: 'OpenVPN', 1433: 'MSSQL', 1434: 'MSSQL',
  1521: 'Oracle', 1701: 'L2TP', 1723: 'PPTP', 1812: 'RADIUS', 1813: 'RADIUS',
  1883: 'MQTT', 1900: 'SSDP', 2049: 'NFS', 2082: 'cPanel', 2083: 'cPanel',
  2086: 'WHM', 2087: 'WHM', 2088: 'Webmail', 2095: 'Webmail', 2181: 'ZooKeeper',
  2375: 'Docker', 2376: 'Docker', 2379: 'etcd', 2380: 'etcd', 3000: 'Grafana',
  3128: 'Squid', 3268: 'LDAP-GC', 3269: 'LDAPS-GC', 3306: 'MySQL', 3389: 'RDP',
  3478: 'STUN', 3690: 'SVN', 4369: 'EPMD', 4443: 'Pharos', 4500: 'IPSec',
  5000: 'UPnP', 5060: 'SIP', 5061: 'SIPS', 5222: 'XMPP', 5223: 'XMPP',
  5228: 'GCM', 5432: 'PostgreSQL', 5672: 'AMQP', 5900: 'VNC', 5938: 'TeamViewer',
  5984: 'CouchDB', 5985: 'WinRM', 5986: 'WinRM', 6379: 'Redis', 6443: 'K8s-API',
  6666: 'IRC', 6667: 'IRC', 6881: 'BitTorrent', 7001: 'WebLogic', 7002: 'WebLogic',
  7070: 'RealServer', 7474: 'Neo4j', 8000: 'HTTP-Alt', 8008: 'HTTP-Alt',
  8080: 'HTTP-Proxy', 8081: 'HTTP-Alt', 8088: 'HTTP-Alt', 8443: 'HTTPS-Alt',
  8888: 'HTTP-Alt', 9000: 'PHP-FPM', 9042: 'Cassandra', 9090: 'Prometheus',
  9092: 'Kafka', 9200: 'Elasticsearch', 9300: 'Elasticsearch', 9418: 'Git',
  9999: 'ABYSS', 10000: 'Webmin', 10050: 'Zabbix', 10051: 'Zabbix',
  11211: 'Memcached', 15672: 'RabbitMQ', 27017: 'MongoDB', 27018: 'MongoDB',
  28015: 'RethinkDB', 50000: 'SAP', 50070: 'HDFS', 61616: 'ActiveMQ',

  // Zixi specific
  2077: 'ZIXI', 2088: 'ZIXI', 4444: 'ZIXI',

  // Common application ports
  8009: 'AJP', 8161: 'ActiveMQ', 8500: 'Consul', 8600: 'Consul',
  9001: 'Supervisor', 9091: 'Transmission', 9100: 'JetDirect',
  15674: 'RabbitMQ-WS', 25672: 'RabbitMQ',
};

// Resolve MAC address to vendor prefix format
const resolveMac = (mac) => {
  if (!mac || typeof mac !== 'string') return mac;

  // Normalize MAC format (handle different separators)
  const normalized = mac.toUpperCase().replace(/[-.]/g, ':');
  const parts = normalized.split(':');

  if (parts.length !== 6) return mac;

  // Get OUI (first 3 octets)
  const oui = parts.slice(0, 3).join(':');
  const vendor = macOuiVendors[oui];

  if (vendor) {
    // Format: Vendor_xx:xx:xx (last 3 octets)
    const suffix = parts.slice(3).join(':').toLowerCase();
    return `${vendor}_${suffix} (${mac})`;
  }

  return mac;
};

// Get protocol name from port number
const getProtocolFromPort = (port) => {
  const portNum = parseInt(port);
  return portProtocols[portNum] || null;
};

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
  'udp.pdu.size': 'PDU Size',
  'udp.pnum': 'Packet Number',
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

// Metadata field patterns - fields that are observations/analysis, not RFC protocol data
const isMetadataField = (path) => {
  const lowerPath = path.toLowerCase();

  // Stream indices
  if (lowerPath.endsWith('.stream')) return true;

  // Checksum status (validation result, not the checksum itself)
  if (lowerPath.endsWith('.checksum.status')) return true;

  // Time analysis fields
  if (lowerPath.endsWith('.time_relative') || lowerPath.endsWith('.time_delta')) return true;
  if (lowerPath.includes('.time_relative') || lowerPath.includes('.time_delta')) return true;

  // TCP/UDP analysis
  if (lowerPath.includes('.analysis')) return true;

  // Frame metadata
  if (lowerPath.includes('frame.time_epoch')) return true;
  if (lowerPath.includes('frame.marked') || lowerPath.includes('frame.ignored')) return true;
  if (lowerPath.includes('frame.protocols')) return true;

  // Response tracking
  if (lowerPath.endsWith('.resp_in') || lowerPath.endsWith('.resp_to')) return true;
  if (lowerPath.endsWith('.resptime')) return true;

  // Calculated/derived values
  if (lowerPath.includes('.completeness')) return true;
  if (lowerPath.includes('window_size_scalefactor') || lowerPath.includes('window_size_value')) return true;
  if (lowerPath.includes('.iface')) return true;
  if (lowerPath.includes('.encap_type')) return true;

  // Initial RTT and other measurements
  if (lowerPath.includes('.initial_rtt') || lowerPath.includes('.ack_rtt')) return true;
  if (lowerPath.includes('.bytes_in_flight') || lowerPath.includes('.push_bytes_sent')) return true;
  if (lowerPath.includes('.acks_frame')) return true;

  // PDU/packet tracking
  if (lowerPath.endsWith('.pnum') || lowerPath.includes('.pdu.')) return true;

  return false;
};

// Get human-readable field name
const getFieldName = (fullPath) => {
  let name;

  // Try exact match first
  if (fieldNames[fullPath]) {
    name = fieldNames[fullPath];
  } else {
    // Try without layer prefix duplication (e.g., "tcp.tcp.srcport" -> "tcp.srcport")
    const parts = fullPath.split('.');
    if (parts.length >= 3 && parts[0] === parts[1]) {
      const simplified = parts.slice(1).join('.');
      if (fieldNames[simplified]) {
        name = fieldNames[simplified];
      }
    }

    // Try last two parts (e.g., "frame.frame.time" -> "frame.time")
    if (!name && parts.length >= 2) {
      const lastTwo = parts.slice(-2).join('.');
      if (fieldNames[lastTwo]) {
        name = fieldNames[lastTwo];
      }
    }

    // Fallback: clean up the last part
    if (!name) {
      const lastPart = parts[parts.length - 1];
      name = lastPart
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  // Wrap metadata fields in brackets
  if (isMetadataField(fullPath)) {
    return `[${name}]`;
  }

  return name;
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
      if (src && dst) {
        // Resolve MAC addresses to vendor prefixes
        const srcResolved = resolveMac(src);
        const dstResolved = resolveMac(dst);
        return `${srcResolved} → ${dstResolved}`;
      }
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
      if (srcPort && dstPort) {
        // Add protocol heuristics
        const srcProto = getProtocolFromPort(srcPort);
        const dstProto = getProtocolFromPort(dstPort);
        const proto = srcProto || dstProto;
        summary += `${srcPort} → ${dstPort}`;
        if (proto) summary = `[${proto}] ${summary}`;
      }
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
      if (srcPort && dstPort) {
        // Add protocol heuristics
        const srcProto = getProtocolFromPort(srcPort);
        const dstProto = getProtocolFromPort(dstPort);
        const proto = srcProto || dstProto;
        summary += `${srcPort} → ${dstPort}`;
        if (proto) summary = `[${proto}] ${summary}`;
      }
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
  // Clear highlight when packet changes
  highlightedByteRange.value = null;

  if (index === null || index < 0 || index >= packets.value.length) {
    activePacketDetails.value = null;
    activePacketHex.value = '';
    activePacketRawHex.value = '';
    isLoading.value = false;
    return;
  }

  const packet = packets.value[index];
  if (!packet) {
    activePacketDetails.value = null;
    activePacketHex.value = '';
    activePacketRawHex.value = '';
    isLoading.value = false;
    return;
  }

  const frameNumber = packet.number;

  // Check cache first for instant display
  const cached = getCachedPacket(frameNumber);
  if (cached && cached.details) {
    activePacketDetails.value = cached.details;
    activePacketHex.value = cached.hex || '';
    activePacketRawHex.value = cached.rawHex || '';
    // Keep collapsed state - don't reset to preserve user's expanded headers
    isLoading.value = false;

    // Trigger background prefetch of adjacent packets
    getPacketWithPrefetch(frameNumber, packets.value.length);
    return;
  }

  // Not in cache - show loading and fetch with prefetch
  isLoading.value = true;
  activePacketDetails.value = null;
  activePacketHex.value = '';
  activePacketRawHex.value = '';

  try {
    const data = await getPacketWithPrefetch(frameNumber, packets.value.length);
    if (data && data.details) {
      activePacketDetails.value = data.details;
      activePacketHex.value = data.hex || '';
      activePacketRawHex.value = data.rawHex || '';
      // Keep collapsed state - don't reset to preserve user's expanded headers
    } else {
      activePacketDetails.value = null;
      activePacketHex.value = '';
      activePacketRawHex.value = '';
    }
  } catch (e) {
    console.error("Failed to fetch packet data:", e);
    activePacketDetails.value = null;
    activePacketHex.value = '';
    activePacketRawHex.value = '';
  } finally {
    isLoading.value = false;
  }
});

// Parse tshark JSON into tree structure with summaries
const detailsTree = computed(() => {
  if (!activePacketDetails.value) return [];

  const details = activePacketDetails.value;
  const layers = details._source?.layers || details.layers || {};

  // First pass: collect all layers with their full byte ranges
  const layerList = [];
  for (const [layerName, layerData] of Object.entries(layers)) {
    if (typeof layerData !== 'object' || layerData === null) continue;
    if (layerName.endsWith('_raw')) continue;

    const layerRaw = layers[`${layerName}_raw`];
    let fullRange = null;
    if (Array.isArray(layerRaw) && layerRaw.length >= 3) {
      const offset = parseInt(layerRaw[1]);
      const length = parseInt(layerRaw[2]);
      if (!isNaN(offset) && !isNaN(length)) {
        fullRange = { start: offset, end: offset + length };
      }
    }

    layerList.push({ layerName, layerData, fullRange });
  }

  // Known protocol header sizes (in bytes)
  const getKnownHeaderSize = (layerName, layerData) => {
    switch (layerName) {
      case 'frame': return 0; // Frame is meta-layer, no actual bytes
      case 'eth': return 14;  // Ethernet II header
      case 'ip': {
        // IP header length is in 32-bit words, field 'ip.hdr_len'
        const hdrLen = layerData['ip.hdr_len'];
        return hdrLen ? parseInt(hdrLen) * 4 : 20; // Default 20 bytes
      }
      case 'ipv6': return 40; // IPv6 fixed header
      case 'udp': return 8;   // UDP header is always 8 bytes
      case 'tcp': {
        // TCP header length is in 32-bit words
        const hdrLen = layerData['tcp.hdr_len'];
        return hdrLen ? parseInt(hdrLen) * 4 : 20; // Default 20 bytes
      }
      case 'icmp': return 8;  // ICMP header
      case 'arp': return 28;  // ARP for IPv4/Ethernet
      default: return null;   // Unknown - use full range
    }
  };

  // Protocols that should ALWAYS show header-only (never include payload in header highlight)
  const headerOnlyProtocols = ['frame', 'eth', 'ip', 'ipv6', 'udp', 'tcp', 'icmp', 'arp'];

  // Second pass: calculate header-only ranges
  const tree = [];
  for (let i = 0; i < layerList.length; i++) {
    const { layerName, layerData, fullRange } = layerList[i];
    const isLastLayer = i === layerList.length - 1;

    let byteRange = fullRange;

    // For transport/network protocols, always use header-only size
    // These protocols carry payload that belongs to upper layers
    if (fullRange && headerOnlyProtocols.includes(layerName)) {
      const headerSize = getKnownHeaderSize(layerName, layerData);
      if (headerSize !== null) {
        byteRange = {
          start: fullRange.start,
          end: fullRange.start + headerSize
        };
      }
    } else if (!isLastLayer && fullRange) {
      // For other non-last layers, try to use next layer's start position
      const nextLayer = layerList[i + 1];
      if (nextLayer && nextLayer.fullRange) {
        byteRange = {
          start: fullRange.start,
          end: nextLayer.fullRange.start
        };
      }
    }
    // Last layer (application data) keeps its fullRange

    const summary = getLayerSummary(layerName, layerData);
    const node = {
      name: formatLayerName(layerName),
      summary,
      path: layerName,
      isLayer: true,
      children: parseLayerFields(layerData, layerName),
      byteRange,
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
  if (key === 'ip.src_host' || key === 'ip.dst_host') return true;
  if (key === 'src_host' || key === 'dst_host') return true;
  if (key === 'ipv6.addr' || key === 'ipv6.host') return true;
  if (key === 'ipv6.src_host' || key === 'ipv6.dst_host') return true;
  if (key === 'tcp.port' || key === 'udp.port') return true;
  if (key === 'eth.addr') return true;
  return false;
};

// Get byte range from _raw field
// tshark _raw fields are arrays: [hex_value, byte_offset, byte_length]
const getByteRange = (rawData, key) => {
  if (!rawData) return null;
  const rawKey = `${key}_raw`;
  const raw = rawData[rawKey];
  if (Array.isArray(raw) && raw.length >= 3) {
    const offset = parseInt(raw[1]);
    const length = parseInt(raw[2]);
    if (!isNaN(offset) && !isNaN(length)) {
      return { start: offset, end: offset + length };
    }
  }
  return null;
};

// Debounce helper for highlight broadcasts
const broadcastHighlightDebounced = (byteRange) => {
  if (cleanupHighlightTimeout) clearTimeout(cleanupHighlightTimeout);
  cleanupHighlightTimeout = setTimeout(() => {
    broadcastOwnerState({ highlightedByteRange: byteRange });
  }, 30);
};

// Handle field hover - set highlighted byte range
const onFieldHover = (byteRange) => {
  if (byteRange) {
    highlightedByteRange.value = byteRange;
    // Broadcast to viewers if owner
    if (isSessionOwner.value) {
      broadcastHighlightDebounced(byteRange);
    }
  }
};

// Handle mouse leave from tree - clear highlight
const onTreeLeave = () => {
  highlightedByteRange.value = null;
  // Broadcast to viewers if owner
  if (isSessionOwner.value) {
    broadcastHighlightDebounced(null);
  }
};

// Parse layer fields into tree nodes (recursive for arbitrary depth)
// parentData is the containing object that has _raw fields alongside regular fields
const parseLayerFields = (data, prefix, parentData = null) => {
  const fields = [];
  // Use data itself as parent for top-level, since _raw fields are at same level
  const rawLookup = parentData || data;

  for (const [key, value] of Object.entries(data)) {
    // Skip _raw and other filtered fields
    if (shouldFilterField(key)) continue;

    const path = `${prefix}.${key}`;
    const displayName = getFieldName(path);
    // Look up byte range from _raw field
    const byteRange = getByteRange(rawLookup, key);

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object - recurse, passing data as parent for child lookups
      const children = parseLayerFields(value, path, data);
      // Only add if there are visible children
      if (children.length > 0) {
        fields.push({
          name: displayName,
          path,
          children,
          hasChildren: true,
          byteRange,
        });
      }
    } else if (Array.isArray(value)) {
      // Array - show as comma-separated or with indices
      if (value.length > 0 && typeof value[0] === 'object') {
        // Array of objects - create indexed children
        const children = value.map((item, idx) => ({
          name: `[${idx}]`,
          path: `${path}[${idx}]`,
          children: typeof item === 'object' ? parseLayerFields(item, `${path}[${idx}]`, value) : [],
          value: typeof item !== 'object' ? String(item) : undefined,
        })).filter(child => child.children.length > 0 || child.value);
        if (children.length > 0) {
          fields.push({
            name: displayName,
            path,
            children,
            hasChildren: true,
            byteRange,
          });
        }
      } else {
        // Array of primitives
        fields.push({
          name: displayName,
          value: value.join(', '),
          path,
          byteRange,
        });
      }
    } else {
      // Primitive value
      const formattedValue = formatValue(key, path, value);
      fields.push({
        name: displayName,
        value: formattedValue,
        path,
        byteRange,
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
  const pathLower = path.toLowerCase();

  // MAC address resolution - show vendor prefix
  if (pathLower.includes('eth.src') || pathLower.includes('eth.dst') ||
      pathLower.includes('arp.src.hw_mac') || pathLower.includes('arp.dst.hw_mac')) {
    return resolveMac(strValue);
  }

  // Port numbers - add protocol heuristics
  if (keyLower === 'srcport' || keyLower === 'dstport') {
    const protocol = getProtocolFromPort(strValue);
    if (protocol) {
      return `${strValue} (${protocol})`;
    }
    return strValue;
  }

  // Boolean flags - show "Set" or "Not set"
  if (strValue === '0' || strValue === '1') {
    const flagKeys = ['flags.', '.rb', '.df', '.mf', '.syn', '.ack', '.fin', '.rst', '.psh', '.push', '.urg',
                      '.ns', '.cwr', '.ecn', '.ece', '.response', '.authoritative', '.truncated',
                      '.recdesired', '.recavail', '.lg', '.ig'];
    if (flagKeys.some(f => pathLower.includes(f))) {
      return strValue === '1' ? 'Set' : 'Not set';
    }
  }

  // Protocol numbers - add protocol name
  if (keyLower === 'proto' || path.endsWith('.ip.proto')) {
    const protocols = { '1': 'ICMP (1)', '6': 'TCP (6)', '17': 'UDP (17)', '41': 'IPv6 (41)', '47': 'GRE (47)', '50': 'ESP (50)', '58': 'ICMPv6 (58)', '89': 'OSPF (89)' };
    return protocols[strValue] || strValue;
  }

  // Ethernet type - add description
  if (keyLower === 'type' && pathLower.includes('eth')) {
    const types = { '0x0800': 'IPv4 (0x0800)', '0x0806': 'ARP (0x0806)', '0x86dd': 'IPv6 (0x86dd)', '0x8100': 'VLAN (0x8100)' };
    return types[strValue] || strValue;
  }

  // Checksum status
  if (pathLower.includes('checksum.status')) {
    const statuses = { '0': 'Unverified', '1': 'Good', '2': 'Bad' };
    return statuses[strValue] || strValue;
  }

  // Header length in bytes
  if (keyLower === 'hdr_len' && pathLower.includes('ip.')) {
    const bytes = parseInt(strValue);
    if (!isNaN(bytes)) {
      return `${bytes * 4} bytes (${bytes})`;
    }
  }
  if (keyLower === 'hdr_len' && pathLower.includes('tcp.')) {
    const bytes = parseInt(strValue);
    if (!isNaN(bytes)) {
      return `${bytes * 4} bytes (${bytes})`;
    }
  }

  // ARP opcode
  if (pathLower.includes('arp.opcode')) {
    const opcodes = { '1': 'request (1)', '2': 'reply (2)' };
    return opcodes[strValue] || strValue;
  }

  // ICMP type
  if (pathLower.includes('icmp.type')) {
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
    <div v-else class="tree" @mouseleave="onTreeLeave">
      <!-- Layer headers with summaries -->
      <template v-for="layer in detailsTree" :key="layer.path">
        <div
          class="layer-header"
          :class="{ collapsed: isCollapsed(layer.path) }"
          @click="toggleCollapse(layer.path)"
          @mouseenter="onFieldHover(layer.byteRange)"
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
                  @mouseenter="onFieldHover(field.byteRange)"
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
                          @mouseenter="onFieldHover(child2.byteRange)"
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
                                  @mouseenter="onFieldHover(child3.byteRange)"
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
                                          @mouseenter="onFieldHover(child4.byteRange)"
                                        >
                                          <span class="toggle">{{ isCollapsed(child4.path) ? '▶' : '▼' }}</span>
                                          <span class="field-name-expandable">{{ child4.name }}</span>
                                        </div>
                                        <div v-if="!isCollapsed(child4.path)" class="nested-children">
                                          <div v-for="child5 in child4.children" :key="child5.path" class="field" @mouseenter="onFieldHover(child5.byteRange)">
                                            <span class="field-name">{{ child5.name }}:</span>
                                            <span class="field-value">{{ child5.value }}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </template>
                                    <div v-else class="field" @mouseenter="onFieldHover(child4.byteRange)">
                                      <span class="field-name">{{ child4.name }}:</span>
                                      <span class="field-value">{{ child4.value }}</span>
                                    </div>
                                  </template>
                                </div>
                              </div>
                            </template>
                            <div v-else class="field" @mouseenter="onFieldHover(child3.byteRange)">
                              <span class="field-name">{{ child3.name }}:</span>
                              <span class="field-value">{{ child3.value }}</span>
                            </div>
                          </template>
                        </div>
                      </div>
                    </template>
                    <div v-else class="field" @mouseenter="onFieldHover(child2.byteRange)">
                      <span class="field-name">{{ child2.name }}:</span>
                      <span class="field-value">{{ child2.value }}</span>
                    </div>
                  </template>
                </div>
              </div>
            </template>
            <div v-else class="field" @mouseenter="onFieldHover(field.byteRange)">
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
