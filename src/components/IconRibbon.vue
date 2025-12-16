<script setup>
import { useTemplateRef } from 'vue';
import LiveCapture from "./LiveCapture.vue";

const props = defineProps({
  hideInsights: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['clear', 'stop', 'openFileBrowser', 'openInsights']);

const liveCaptureRef = useTemplateRef('live-capture');

const loadPcapFile = (filePath) => {
  liveCaptureRef.value?.loadPcapFile(filePath);
};

defineExpose({ loadPcapFile });
</script>

<template>
  <div class="ribbon">
    <LiveCapture
      ref="live-capture"
      @clear="() => emit('clear')"
      @stop="() => emit('stop')"
      @openFileBrowser="() => emit('openFileBrowser')"
    />
    <template v-if="!hideInsights">
      <div class="separator"></div>
      <button class="insights-btn" @click="emit('openInsights')" title="Capture Insights">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3v18h18"/>
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/>
        </svg>
        Insights
      </button>
    </template>
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

.insights-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.insights-btn:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
  transform: translateY(-1px);
}

.insights-btn:active {
  transform: translateY(0);
}

.insights-btn svg {
  width: 16px;
  height: 16px;
}
</style>
