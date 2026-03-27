<template>
  <div v-if="activeSaves.length > 0" class="save-progress-container">
    <div v-for="save in activeSaves" :key="save.jobId" class="save-progress-item">
      <n-progress
        type="circle"
        :percentage="Math.round(save.progress)"
        :status="save.status === 'error' ? 'error' : save.status === 'complete' ? 'success' : 'default'"
        :stroke-width="10"
        :show-indicator="true"
        style="width: 48px; height: 48px;"
      />
      <div class="progress-info">
        <div class="progress-message">{{ save.message }}</div>
        <div v-if="save.path" class="progress-path" :title="save.path">📁 {{ save.path.split('/').pop() }}</div>
        <div v-if="save.compressed && save.originalSize && save.savedSize" class="progress-compression">
          {{ formatSize(save.originalSize) }} → {{ formatSize(save.savedSize) }} ({{ compressionRatio(save.originalSize, save.savedSize) }}% reduction)
        </div>
        <div class="progress-status">{{ save.status }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { NProgress } from 'naive-ui';

const activeSaves = ref([]);

const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

const compressionRatio = (original, compressed) => {
  if (!original) return 0;
  return ((1 - compressed / original) * 100).toFixed(1);
};

const addSaveJob = (jobId) => {
  // Skip if already exists (WebSocket progress may arrive before HTTP response)
  if (activeSaves.value.find(s => s.jobId === jobId)) return;
  activeSaves.value.push({
    jobId,
    progress: 0,
    status: 'starting',
    message: 'Starting save...'
  });
};

const updateSaveProgress = (data) => {
  const save = activeSaves.value.find(s => s.jobId === data.jobId);
  if (save) {
    save.progress = data.progress;
    save.status = data.status;
    save.message = data.message;
    if (data.path) save.path = data.path;
    if (data.compressed) save.compressed = true;
    if (data.originalSize) save.originalSize = data.originalSize;
    if (data.savedSize) save.savedSize = data.savedSize;

    // Auto-remove after completion or error
    if (data.status === 'complete') {
      setTimeout(() => {
        removeSaveJob(data.jobId);
      }, 7000); // Keep for 7 seconds to show completion, path and compression
    } else if (data.status === 'error') {
      setTimeout(() => {
        removeSaveJob(data.jobId);
      }, 7000); // Keep errors longer
    }
  } else {
    // Add if not found
    activeSaves.value.push({
      jobId: data.jobId,
      progress: data.progress,
      status: data.status,
      message: data.message,
      path: data.path || null,
      compressed: data.compressed || false,
      originalSize: data.originalSize || null,
      savedSize: data.savedSize || null
    });

    if (data.status === 'complete') {
      setTimeout(() => removeSaveJob(data.jobId), 5000);
    } else if (data.status === 'error') {
      setTimeout(() => removeSaveJob(data.jobId), 7000);
    }
  }
};

const removeSaveJob = (jobId) => {
  const index = activeSaves.value.findIndex(s => s.jobId === jobId);
  if (index !== -1) {
    activeSaves.value.splice(index, 1);
  }
};

// Expose methods for parent component
defineExpose({
  addSaveJob,
  updateSaveProgress,
  removeSaveJob
});
</script>

<style scoped>
.save-progress-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.save-progress-item {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #1a1d23;
  border: 1px solid #374151;
  border-radius: 10px;
  padding: 14px 18px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  min-width: 340px;
  max-width: 500px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.progress-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-message {
  color: #e5e7eb;
  font-size: 15px;
  font-weight: 600;
}

.progress-path {
  color: #60a5fa;
  font-size: 13px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
}

.progress-compression {
  color: #22c55e;
  font-size: 12px;
  font-family: monospace;
}

.progress-status {
  color: #9ca3af;
  font-size: 12px;
  text-transform: capitalize;
}
</style>
