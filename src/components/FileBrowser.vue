<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Open Capture File</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <div class="path-bar">
        <button class="nav-btn" @click="goUp" :disabled="!canGoUp" title="Go up">
          ↑
        </button>
        <button class="nav-btn" @click="refresh" title="Refresh">
          ↻
        </button>
        <input
          type="text"
          v-model="pathInput"
          @keydown.enter="navigateTo(pathInput)"
          class="path-input"
        />
        <button class="nav-btn" @click="navigateTo(pathInput)">
          Go
        </button>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <span>Loading...</span>
      </div>

      <div v-else-if="error" class="error">
        {{ error }}
      </div>

      <div v-else class="file-list">
        <div
          v-for="file in files"
          :key="file.path"
          class="file-item"
          :class="{ selected: selectedFile === file.path, directory: file.isDirectory }"
          @click="selectFile(file)"
          @dblclick="openItem(file)"
        >
          <span class="icon">{{ file.isDirectory ? '📁' : '📄' }}</span>
          <span class="name">{{ file.name }}</span>
          <span class="size" v-if="!file.isDirectory">{{ formatSize(file.size) }}</span>
        </div>

        <div v-if="files.length === 0" class="empty">
          No capture files in this directory (.pcap, .pcapng, .pcap.zst, .pcapng.zst)
        </div>
      </div>

      <div class="modal-footer">
        <span class="selected-path" v-if="selectedFile">{{ selectedFile }}</span>
        <div class="buttons">
          <button class="btn btn-secondary" @click="close">Cancel</button>
          <button
            class="btn btn-primary"
            @click="openSelected"
            :disabled="!selectedFile || selectedIsDirectory"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const emit = defineEmits(['select', 'close']);

const isOpen = ref(false);
const currentPath = ref('');
const pathInput = ref('');
const parentPath = ref('');
const files = ref([]);
const selectedFile = ref(null);
const loading = ref(false);
const error = ref(null);

const selectedIsDirectory = computed(() => {
  const file = files.value.find(f => f.path === selectedFile.value);
  return file?.isDirectory || false;
});

const canGoUp = computed(() => {
  return currentPath.value !== parentPath.value && parentPath.value;
});

const open = () => {
  isOpen.value = true;
  selectedFile.value = null;
  error.value = null;
  // Start at home directory
  loadDirectory('');
};

const close = () => {
  isOpen.value = false;
  emit('close');
};

const loadDirectory = async (dirPath) => {
  loading.value = true;
  error.value = null;
  selectedFile.value = null;

  try {
    const url = `/api/files?path=${encodeURIComponent(dirPath)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      error.value = data.error;
      return;
    }

    currentPath.value = data.path;
    pathInput.value = data.path;
    parentPath.value = data.parent;
    files.value = data.files;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
};

const navigateTo = (path) => {
  loadDirectory(path);
};

const goUp = () => {
  if (canGoUp.value) {
    loadDirectory(parentPath.value);
  }
};

const refresh = () => {
  loadDirectory(currentPath.value);
};

const selectFile = (file) => {
  selectedFile.value = file.path;
};

const openItem = (file) => {
  if (file.isDirectory) {
    loadDirectory(file.path);
  } else {
    emit('select', file.path);
    close();
  }
};

const openSelected = () => {
  if (selectedFile.value && !selectedIsDirectory.value) {
    emit('select', selectedFile.value);
    close();
  }
};

const formatSize = (bytes) => {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
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
  z-index: 1000;
}

.modal-content {
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 8px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  color: #ccc;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3e3e42;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #888;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #fff;
}

.path-bar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #3e3e42;
}

.nav-btn {
  background: #374151;
  border: 1px solid #4b5563;
  color: #ccc;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.nav-btn:hover:not(:disabled) {
  background: #4b5563;
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.path-input {
  flex: 1;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  color: #ccc;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
}

.loading, .error {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
}

.error {
  color: #ef4444;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid transparent;
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.file-list {
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
  max-height: 400px;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  gap: 8px;
}

.file-item:hover {
  background: #2d2d30;
}

.file-item.selected {
  background: #3b82f6;
  color: #fff;
}

.file-item .icon {
  font-size: 16px;
}

.file-item .name {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item .size {
  font-family: monospace;
  font-size: 12px;
  color: #888;
}

.file-item.selected .size {
  color: #ddd;
}

.empty {
  padding: 40px;
  text-align: center;
  color: #666;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid #3e3e42;
  gap: 12px;
}

.selected-path {
  flex: 1;
  font-family: monospace;
  font-size: 11px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buttons {
  display: flex;
  gap: 8px;
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

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  background: #4b5563;
  cursor: not-allowed;
}

.btn-secondary {
  background: #4b5563;
  color: white;
}

.btn-secondary:hover {
  background: #6b7280;
}
</style>
