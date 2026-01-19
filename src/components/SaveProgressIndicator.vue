<template>
  <div v-if="activeSaves.length > 0" class="save-progress-container">
    <div v-for="save in activeSaves" :key="save.jobId" class="save-progress-item">
      <div class="progress-circle">
        <svg class="progress-ring" width="40" height="40">
          <circle
            class="progress-ring-circle-bg"
            stroke="#e0e0e0"
            stroke-width="3"
            fill="transparent"
            r="16"
            cx="20"
            cy="20"
          />
          <circle
            class="progress-ring-circle"
            :stroke="save.status === 'error' ? '#dc3545' : '#28a745'"
            stroke-width="3"
            fill="transparent"
            r="16"
            cx="20"
            cy="20"
            :style="{
              strokeDasharray: `${circumference} ${circumference}`,
              strokeDashoffset: strokeDashoffset(save.progress)
            }"
          />
        </svg>
        <div class="progress-text">
          {{ Math.round(save.progress) }}%
        </div>
      </div>
      <div class="progress-info">
        <div class="progress-message">{{ save.message }}</div>
        <div class="progress-status">{{ save.status }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const activeSaves = ref([]);

const circumference = 2 * Math.PI * 16; // radius = 16

const strokeDashoffset = (progress) => {
  return circumference - (progress / 100) * circumference;
};

const addSaveJob = (jobId) => {
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

    // Auto-remove after completion or error
    if (data.status === 'complete') {
      setTimeout(() => {
        removeSaveJob(data.jobId);
      }, 3000); // Keep for 3 seconds to show completion
    } else if (data.status === 'error') {
      setTimeout(() => {
        removeSaveJob(data.jobId);
      }, 5000); // Keep errors longer
    }
  } else {
    // Add if not found
    activeSaves.value.push({
      jobId: data.jobId,
      progress: data.progress,
      status: data.status,
      message: data.message
    });

    if (data.status === 'complete') {
      setTimeout(() => removeSaveJob(data.jobId), 3000);
    } else if (data.status === 'error') {
      setTimeout(() => removeSaveJob(data.jobId), 5000);
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
  gap: 12px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #444;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 280px;
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

.progress-circle {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.3s ease;
  stroke-linecap: round;
}

.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: bold;
  color: #fff;
}

.progress-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-message {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}

.progress-status {
  color: #aaa;
  font-size: 11px;
  text-transform: capitalize;
}
</style>
