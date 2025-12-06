import { ref } from "vue";
import Manager from "./classes/Manager";

export const manager = new Manager();

// Display offset for frame numbers (increases when packets are trimmed)
// This makes frame numbers appear continuous even when old packets are dropped
export const frameDisplayOffset = ref(0);

// Live capture stats (reactive for status bar display)
export const captureStats = {
  totalCaptured: ref(0),   // Ever-increasing counter of all packets seen
  totalDropped: ref(0),    // How many packets have been trimmed
  isProcessing: ref(false), // Whether buffer is currently being processed
};
