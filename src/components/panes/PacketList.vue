<script setup>
import {
  computed,
  onMounted, // Added onMounted
  reactive,
  shallowReactive,
  useTemplateRef,
  watch,
} from "vue";
import { useResizeObserver, useScroll, watchThrottled } from "@vueuse/core";
import { areArraysEqual, clamp } from "../../util";
import { manager, DEBUG } from "../../globals";
import Minimap from "./PacketList/Minimap.vue";
import PacketTable from "./PacketList/PacketTable.vue";
import PacketTableRows from "./PacketList/PacketTableRows.vue";

// Row code
const headerHeight = 20; // TODO: use resizeObserver to set this?

const state = reactive({
  clientHeight: 0,
  clientWidth: 0,

  // refs
  minimapRef: useTemplateRef("minimap"),
  scrollY: null,

  // computed
  rowCount: 0, // count of rows that are completely visible
  extraRows: 0, // rows that aren't in the view
  scrollYPercent: 0, // how much percent is scrolled
  firstRowIndex: 0, // the index of the current first row
  visibleTableWidth: 0, // available width for table (total width - minimap width)
  minimapFirstRowIndex: 0, // first row of the minimap index
  frameReqArgs: [], // filter, skip, limit (minimap)
  frameReqArgsForTable: [], // filter, skip, limit (table)
});

// Explicit ref for the element
const scrollableEl = useTemplateRef("packet-list-scrollable");

// Force check dimensions on mount and data change
const checkDimensions = () => {
  if (scrollableEl.value) {
    const { clientHeight, clientWidth } = scrollableEl.value;
    if (clientHeight > 0) state.clientHeight = clientHeight;
    if (clientWidth > 0) state.clientWidth = clientWidth;
  }
};

onMounted(() => {
  checkDimensions();
  setTimeout(checkDimensions, 100);
});

useResizeObserver(scrollableEl, (entries) => {
  const entry = entries[0];
  const { width, height } = entry.contentRect;
  if (DEBUG) console.log("Resize:", width, height);
  if (height > 0) state.clientHeight = height;
  if (width > 0) state.clientWidth = width;
});

const shallowState = shallowReactive({
  frameBank: null,
  table: null,
});

// Also force check when packets arrive, in case the list was hidden/empty
watch(() => manager.frameCount, (newCount, oldCount) => {
  // Reset scroll if frame count dropped to 0 (capture cleared/restarted)
  if (newCount === 0 && oldCount > 0) {
    if (DEBUG) console.log("Frame count dropped to 0, resetting scroll");
    state.scrollY = 0;
    shallowState.frameBank = null;
    shallowState.table = null;
  }

  window.dispatchEvent(new Event('resize'));
  if (state.clientHeight < 50) checkDimensions();
  requestFrames();
});

// Reset scroll when session is cleared
watch(
  () => manager.sessionInfo,
  (newInfo, oldInfo) => {
    if (oldInfo && !newInfo) {
      if (DEBUG) console.log("Session cleared, resetting scroll to 0");
      state.scrollY = 0;
      shallowState.frameBank = null;
      shallowState.table = null;
    }
  }
);

state.scrollY = useScroll(scrollableEl).y;

state.rowCount = computed(() => {
  // Use fallback only if clientHeight is missing
  const h = state.clientHeight || 200;
  const availableHeight = Math.max(0, h - headerHeight);
  const fullRows = Math.floor(availableHeight / manager.rowHeight);
  return fullRows;
});

state.extraRows = computed(() =>
  Math.max(0, manager.frameCount - state.rowCount)
);

state.scrollYPercent = computed(() =>
  // clamping is required because many mobile browsers under/overscroll
  clamp(0, state.extraRows ? state.scrollY / state.extraRows : 0, 1)
);

state.firstRowIndex = computed(() => {
  const clamped = clamp(0, state.scrollY, state.extraRows);
  return clamped;
});
state.visibleTableWidth = computed(() => (state.clientWidth || 600) - minimapWidth);

state.minimapFirstRowIndex = computed(() =>
  Math.max(
    0,
    Math.round((manager.frameCount - (state.clientHeight || 200)) * state.scrollYPercent)
  )
);

state.frameReqArgs = computed(() => {
  // Clamp skip to valid range (0 to frameCount)
  const maxSkip = Math.max(0, manager.frameCount - 1);
  const clampedSkip = Math.min(state.minimapFirstRowIndex, maxSkip);

  return [
    manager.displayFilter,
    Math.max(0, clampedSkip),  // Never request negative skip
    state.clientHeight || 200,
  ];
});

state.frameReqArgsForTable = computed(() => {
  // Clamp skip to valid range
  const maxSkip = Math.max(0, manager.frameCount - 1);
  const clampedSkip = Math.min(state.firstRowIndex, maxSkip);

  return [
    manager.displayFilter,
    Math.max(0, clampedSkip),
    state.rowCount + 1,
  ];
});

const updateRowsForTable = () => {
  if (shallowState.frameBank === null) return;

  // Early exit if no session
  if (manager.frameCount === 0) {
    shallowState.table = { frames: [], startIndex: 0 };
    return;
  }

  const {
    frames,
    offset,
    reqArgs: [filter, skip, limit],
  } = shallowState.frameBank;

  // Handle empty frames case
  if (!frames || frames.length === 0) {
    // Don't update table with empty data - keep previous state
    console.warn("updateRowsForTable: no frames, skip might be out of range");
    return;
  }

  // so let's say starts at frame index 50, while the first table row starts at index 60
  // that is (state.firstRowIndex - skip)

  // normal case
  // have [50,,, 100], offset = 0
  // want [60, 75], startSliceIdx = 10 -> startIndex = 60

  // have [50,,, 100], offset = 0
  // want [45, 60], startSliceIdx = 0  -> startIndex = 50

  // have [50,,, 100], offset = 10
  // want [45, 60], startSliceIdx = 5  -> startIndex = 45

  const minIndex = skip - offset;
  // Ensure we don't calculate a negative maxIndex if frames.length is small
  const safeMaxIndex = Math.max(0, skip + frames.length - state.rowCount);
  
  // Ensure start index is within current valid bounds
  const startIndex = Math.min(Math.max(minIndex, state.firstRowIndex), safeMaxIndex);
  
  const startSliceIdx = Math.max(0, startIndex - minIndex);
  const endSliceIdx = Math.min(frames.length, startSliceIdx + state.rowCount + 1);

  if (DEBUG) console.log(`Table Slice: frames=${frames.length} minIdx=${minIndex} startIdx=${startIndex} slice=${startSliceIdx}-${endSliceIdx}`);

  shallowState.table = {
    frames: frames.slice(startSliceIdx, endSliceIdx),
    startIndex,
  };
};

let framesRequest = null;
const requestFrames = async () => {
  const reqArgs = state.frameReqArgs;
  if (framesRequest) {
    if (DEBUG) console.log("requestFrames locked, skipping");
    return;
  }

  // Don't request if there are no frames
  if (manager.frameCount === 0) {
    shallowState.frameBank = null;
    shallowState.table = null;
    return;
  }

  if (DEBUG) console.log("requestFrames calling manager.getFrames", reqArgs);
  const [filter, skip, limit] = reqArgs;
  framesRequest = manager.getFrames(filter, skip, limit);
  const { frames, offset } = await framesRequest;
  framesRequest = null;

  // Don't update if session was cleared while we were fetching
  if (manager.frameCount === 0) {
    if (DEBUG) console.log("Session cleared during fetch, discarding result");
    shallowState.frameBank = null;
    shallowState.table = null;
    return;
  }

  shallowState.frameBank = { frames, offset, reqArgs };

  updateRowsForTable();
  if (!areArraysEqual(reqArgs, state.frameReqArgs)) {
    if (DEBUG) console.log("requestFrames args changed during fetch, retrying");
    return requestFrames();
  }
};

watchThrottled(() => state.frameReqArgs, requestFrames, { throttle: 111 });

watch(() => state.frameReqArgsForTable, updateRowsForTable);

const minimapWidth = 34;

// Scrolling via mousewheel scrolls too much because a row contributes only 1px to the scrollbar
const handleWheel = (event) => {
  if (!event.deltaY) return;
  event.preventDefault();
  state.scrollY += Math.round(event.deltaY / manager.rowHeight);
};

// ensure that active row is in viewport
// may not be in viewport already due to keyboard navigation
watch(
  () => manager.activeFrameIndex,
  (index) => {
    if (index === null) return;

    if (DEBUG) console.log("idx", index, state.firstRowIndex, document.activeElement);
    if (index < state.firstRowIndex)
      state.scrollY -= state.firstRowIndex - index;
    else if (index >= state.firstRowIndex + state.rowCount)
      state.scrollY += index - (state.firstRowIndex + state.rowCount) + 1;
      
    // Force update table rows as scrollY change might be throttled or delayed
    updateRowsForTable();
  }
);
</script>

<template>
  <div
    class="packet-list-scrollable"
    ref="packet-list-scrollable"
    @wheel="handleWheel"
  >
    <div
      class="content"
      :style="{
        '--minimap-width': `${minimapWidth}px`,
      }"
    >
      <PacketTable :visibleWidth="state.visibleTableWidth">
        <PacketTableRows :table="shallowState.table" />
      </PacketTable>
      <Minimap
        ref="minimap"
        :frameInfo="shallowState.frameBank"
        :width="minimapWidth"
        :height="state.clientHeight"
      />
    </div>
    <div
      :style="{
        height: state.extraRows + 'px',
      }"
    ></div>
  </div>
</template>
<style scoped>
.packet-list-scrollable {
  flex-grow: 1;
  position: relative;
  overflow-y: scroll;
  overflow-x: auto;
  height: 100%; /* Force height to fill parent */
  width: 100%;  /* Force width to fill parent */
}
.content {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100%;

  display: flex;
}
</style>
