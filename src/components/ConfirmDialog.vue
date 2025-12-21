<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="handleCancel">
    <div class="confirm-dialog">
      <div class="confirm-header">
        <h3>{{ title }}</h3>
        <button class="close-btn" @click="handleCancel" title="Cancel">&times;</button>
      </div>
      <div class="confirm-body">
        <p>{{ message }}</p>
      </div>
      <div class="confirm-footer">
        <button class="btn btn-cancel" @click="handleCancel">Cancel</button>
        <button class="btn btn-secondary" @click="handleNo">{{ noText }}</button>
        <button class="btn btn-primary" @click="handleYes">{{ yesText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
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
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.confirm-dialog {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  min-width: 300px;
  max-width: 400px;
  color: #ccc;
}

.confirm-header {
  padding: 12px 16px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.confirm-header h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #3e3e42;
  color: #fff;
}

.confirm-body {
  padding: 20px 16px;
}

.confirm-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #3e3e42;
}

.btn {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  font-size: 13px;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
}

.btn-secondary {
  background: #4b5563;
  color: white;
}

.btn-secondary:hover {
  background: #6b7280;
}

.btn-cancel {
  background: transparent;
  color: #9ca3af;
  border: 1px solid #4b5563;
}

.btn-cancel:hover {
  background: #374151;
  color: #fff;
}
</style>
