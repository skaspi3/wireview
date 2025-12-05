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
import { manager } from "../../globals";
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
  scrollableRef: useTemplateRef("packet-list-scrollable"),
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

// Force check dimensions on mount and data change
const checkDimensions = () => {
  if (state.scrollableRef) {
    // Use fallback if clientHeight is 0 (e.g. element hidden or not laid out yet)
    // This ensures we at least try to fetch some rows
    state.clientHeight = state.scrollableRef.clientHeight || 200;
    state.clientWidth = state.scrollableRef.clientWidth || 600;
  }
};

onMounted(() => {
  // Try immediately
  checkDimensions();
  // And after a tick for layout settlement
  setTimeout(checkDimensions, 100);
});

// Also force check when packets arrive, in case the list was hidden/empty
watch(() => manager.frameCount, () => {
  // Trigger a window resize event to wake up any lazy layout engines
  window.dispatchEvent(new Event('resize'));
  
  // If height is small/zero, try checking again
  if (state.clientHeight < 50) checkDimensions();

  // Force request frames immediately when count changes
  requestFrames();
});

const shallowState = shallowReactive({
  frameBank: null,
  table: null,
});

state.scrollY = useScroll(() => state.scrollableRef).y;

state.rowCount = computed(() => {
  // Use fallback height if clientHeight is 0 to ensure we render SOMETHING
  const h = state.clientHeight || 200;
  const availableHeight = Math.max(0, h - headerHeight);
  // Ensure we always have at least a few rows, even if layout says 0 height
  const fullRows = Math.max(10, Math.floor(availableHeight / manager.rowHeight));
  console.debug("fullRows", fullRows, "availableHeight", availableHeight);
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
  console.debug("scrollY", state.scrollY, "fri", clamped);
  return clamped;
});
state.visibleTableWidth = computed(() => (state.clientWidth || 600) - minimapWidth);

state.minimapFirstRowIndex = computed(() =>
  Math.max(
    0,
    Math.round((manager.frameCount - (state.clientHeight || 200)) * state.scrollYPercent)
  )
);

state.frameReqArgs = computed(() => [
  manager.displayFilter,
  state.minimapFirstRowIndex,
  state.clientHeight || 200,
]);

state.frameReqArgsForTable = computed(() => [
  manager.displayFilter,
  state.firstRowIndex,
  state.rowCount + 1,
]);

useResizeObserver(state.scrollableRef, (entries) => {
  const entry = entries[0];
  const { width, height } = entry.contentRect;
  state.clientWidth = width || 600;
  state.clientHeight = height || 200;
});

const updateRowsForTable = () => {
  if (shallowState.frameBank === null) return;
  const {
    frames,
    offset,
    reqArgs: [filter, skip, limit],
  } = shallowState.frameBank;

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

  console.log(`Table Slice: frames=${frames.length} minIdx=${minIndex} startIdx=${startIndex} slice=${startSliceIdx}-${endSliceIdx}`);

  shallowState.table = {
    frames: frames.slice(startSliceIdx, endSliceIdx),
    startIndex,
  };
};

let framesRequest = null;
const requestFrames = async () => {
  const reqArgs = state.frameReqArgs;
  if (framesRequest) {
    console.log("requestFrames locked, skipping");
    return;
  }
  
  console.log("requestFrames calling manager.getFrames", reqArgs);
  const [filter, skip, limit] = reqArgs;
  framesRequest = manager.getFrames(filter, skip, limit);
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  const { frames, offset } = await framesRequest;
  framesRequest = null;

  shallowState.frameBank = { frames, offset, reqArgs };

  updateRowsForTable();
  if (!areArraysEqual(reqArgs, state.frameReqArgs)) {
    console.log("requestFrames args changed during fetch, retrying");
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

    console.log("idx", index, state.firstRowIndex, document.activeElement);
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
