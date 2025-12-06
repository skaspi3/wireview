import { ref } from "vue";
import Manager from "./classes/Manager";

export const manager = new Manager();

// Display offset for frame numbers (increases when packets are trimmed)
// This makes frame numbers appear continuous even when old packets are dropped
export const frameDisplayOffset = ref(0);
