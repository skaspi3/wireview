<template>
  <pf-modal :open="isOpen || undefined" @close="handleCancel" variant="small">
    <h3 slot="header">{{ title }}</h3>
    <p class="confirm-body">{{ message }}</p>
    <div slot="footer" class="confirm-footer">
      <pf-button variant="tertiary" @click="handleCancel">Cancel</pf-button>
      <pf-button variant="secondary" @click="handleNo">{{ noText }}</pf-button>
      <pf-button @click="handleYes">{{ yesText }}</pf-button>
    </div>
  </pf-modal>
</template>

<script setup>
import '@patternfly/elements/pf-modal/pf-modal.js';
import '@patternfly/elements/pf-button/pf-button.js';
import { ref } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  yesText: { type: String, default: 'Yes' },
  noText: { type: String, default: 'No' }
});

const emit = defineEmits(['yes', 'no', 'cancel', 'close']);

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
  emit('close');
};

const handleYes = () => {
  isOpen.value = false;
  emit('yes');
};

const handleNo = () => {
  isOpen.value = false;
  emit('no');
};

const handleCancel = () => {
  isOpen.value = false;
  emit('cancel');
};

defineExpose({ open, close });
</script>

<style scoped>
.confirm-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}

.confirm-footer pf-button {
  --pf-c-button--FontWeight: bold;
}
</style>
