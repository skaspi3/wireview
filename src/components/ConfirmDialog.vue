<script setup>
/**
 * ConfirmDialog — Thin wrapper around Naive UI's $dialog.warning.
 * Keeps the same open()/close() + emit API so callers don't change.
 */
const props = defineProps({
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  yesText: { type: String, default: 'Yes' },
  noText: { type: String, default: 'No' }
});

const emit = defineEmits(['yes', 'no', 'cancel', 'close']);

let dialogInstance = null;

const open = () => {
  if (!window.$dialog) return;
  dialogInstance = window.$dialog.warning({
    title: props.title,
    content: props.message,
    positiveText: props.yesText,
    negativeText: props.noText,
    closable: true,
    maskClosable: false,
    onPositiveClick: () => { emit('yes'); },
    onNegativeClick: () => { emit('no'); },
    onClose: () => { emit('cancel'); },
    onMaskClick: () => { emit('cancel'); },
  });
};

const close = () => {
  if (dialogInstance) {
    dialogInstance.destroy();
    dialogInstance = null;
  }
  emit('close');
};

defineExpose({ open, close });
</script>
