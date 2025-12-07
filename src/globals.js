import { ref } from "vue";
import Manager from "./classes/Manager";
export { DEBUG } from "./debug";

export const manager = new Manager();

// Initialize Wiregasm as soon as DOM is ready (after Vite server is up)
// This is earlier than Vue's onMounted but ensures the server can serve files
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => manager.initialize());
} else {
  // DOM already ready
  manager.initialize();
}

// Display offset for frame numbers (increases when packets are trimmed)
// This makes frame numbers appear continuous even when old packets are dropped
export const frameDisplayOffset = ref(0);

// Live capture stats (reactive for status bar display)
export const captureStats = {
  totalCaptured: ref(0),   // Ever-increasing counter of all packets seen
  totalDropped: ref(0),    // How many packets have been trimmed
  isProcessing: ref(false), // Whether buffer is currently being processed
};

// Crash log (records each crash/recovery event)
export const crashLog = ref([]);  // Array of { timestamp: string, packetCount: number }

// Version info (displayed in status bar)
export const wiregasmVersion = ref('');
export const nodeVersion = ref('');
export const backendPort = ref(null);

// Backend connection status: 'disconnected' | 'connecting' | 'connected'
export const backendStatus = ref('disconnected');
