<script setup>
import CloseCaptureIcon from "./icons/CloseCaptureIcon.vue";
import FindIcon from "./icons/FindIcon.vue";
import PreviousPacketIcon from "./icons/PreviousPacketIcon.vue";
import NextPacketIcon from "./icons/NextPacketIcon.vue";
import { manager } from "../globals";
import GoFirstIcon from "./icons/GoFirstIcon.vue";
import GoLastIcon from "./icons/GoLastIcon.vue";
</script>

<template>
  <div class="ribbon">
    <div
      class="icon"
      :class="{ disabled: manager.sessionInfo === null }"
      title="Close this capture file"
      @click="() => manager.closeFile()"
    >
      <CloseCaptureIcon />
    </div>
    <div class="separator"></div>
    <div
      class="icon"
      :class="{ disabled: manager.sessionInfo === null }"
      title="Find a packet"
      @mousedown.prevent
      @mouseup="() => manager.setFindFrameBarHidden()"
    >
      <FindIcon />
    </div>
    <!-- In Firefox, the css :active selector does not fire if we run
    event.preventDefault() on the mousedown event. We need to prevent default
    so that focus is not lost (from, say, a currently focused row) -->
    <div
      class="icon"
      :class="{
        disabled: !manager.canGoToPreviousPacket,
      }"
      title="Go to the previous packet"
      @mousedown.prevent
      @mouseup="() => manager.goToNearbyPacket(-1)"
    >
      <PreviousPacketIcon />
    </div>
    <div
      class="icon"
      :class="{
        disabled: !manager.canGoToNextPacket,
      }"
      title="Go to the next packet"
      @mousedown.prevent
      @mouseup="() => manager.goToNearbyPacket(1)"
    >
      <NextPacketIcon />
    </div>
    <div
      class="icon"
      :class="{
        disabled: !manager.canGoToPreviousPacket,
      }"
      title="Go to the first packet"
      @mousedown.prevent
      @mouseup="() => manager.setActiveFrameIndex(0)"
    >
      <GoFirstIcon />
    </div>
    <div
      class="icon"
      :class="{
        disabled: !manager.canGoToNextPacket,
      }"
      title="Go to the last packet"
      @mousedown.prevent
      @mouseup="() => manager.setActiveFrameIndex(-1)"
    >
      <GoLastIcon />
    </div>
  </div>
</template>

<style scoped>
.ribbon {
  background: var(--ws-lighter-gray);
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 1px;
  border-bottom: var(--ws-pane-border);
}
.icon {
  padding: 3px;
  display: flex;
  border: 1px solid transparent;
  border-radius: 4px;
}
.icon:hover {
  background: var(--ws-dark-gray);
  border-color: var(--ws-darker-gray);
}
.icon:active {
  background: var(--ws-selected-bg);
}
.icon.disabled,
.icon:has(input[disabled]) {
  pointer-events: none;
  filter: saturate(0);
  opacity: 0.5;
}
.icon input[type="file"] {
  display: none;
}
.separator {
  margin: 0 2px 0 3px;
  width: 2px;
  height: 16px;
  background-color: var(--ws-dark-gray);
  border-right: 1px solid var(--ws-gray);
}
</style>
