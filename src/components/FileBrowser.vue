<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Open Capture File</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <div class="path-bar">
        <pf-tooltip content="Go up">
          <pf-button variant="control" class="nav-btn" @click="goUp" :disabled="!canGoUp || undefined">
            ↑
          </pf-button>
        </pf-tooltip>
        <pf-tooltip content="Refresh">
          <pf-button variant="control" class="nav-btn" @click="refresh">
            ↻
          </pf-button>
        </pf-tooltip>
        <pf-text-input
          :value="pathInput"
          @input="pathInput = $event.target.value"
          @keydown.enter="navigateTo(pathInput)"
          class="path-input"
        ></pf-text-input>
        <pf-button variant="control" class="nav-btn" @click="navigateTo(pathInput)">
          Go
        </pf-button>
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
          <pf-button variant="secondary" @click="close">Cancel</pf-button>
          <pf-button
            @click="openSelected"
            :disabled="!selectedFile || selectedIsDirectory || undefined"
          >
            Open
          </pf-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import '@patternfly/elements/pf-tooltip/pf-tooltip.js';
import '@patternfly/elements/pf-text-input/pf-text-input.js';
import { ref, computed, watch } from 'vue';
import { apiFetch } from '../globals';

const emit = defineEmits(['select', 'close']);

const isOpen = ref(false);
const currentPath = ref('');
const pathInput = ref('');
const parentPath = ref('');
const files = ref([]);
const selectedFile = ref(null);
const loading = ref(false);
const error = ref(null);
let directoryLoadSeq = 0;

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
  directoryLoadSeq += 1;
  loading.value = false;
  isOpen.value = false;
  emit('close');
};

const loadDirectory = async (dirPath) => {
  const requestSeq = ++directoryLoadSeq;
  loading.value = true;
  error.value = null;
  selectedFile.value = null;

  try {
    const url = `/api/files?path=${encodeURIComponent(dirPath)}`;
    const response = await apiFetch(url);
    const data = await response.json();
    if (requestSeq !== directoryLoadSeq) return;

    if (data.error) {
      error.value = data.error;
      return;
    }

    currentPath.value = data.path;
    pathInput.value = data.path;
    parentPath.value = data.parent;
    files.value = data.files;
  } catch (e) {
    if (requestSeq !== directoryLoadSeq) return;
    error.value = e.message;
  } finally {
    if (requestSeq === directoryLoadSeq) {
      loading.value = false;
    }
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
  --pf-c-button--PaddingTop: 6px;
  --pf-c-button--PaddingBottom: 6px;
}

.path-input {
  flex: 1;
  --pf-c-form-control--FontFamily: monospace;
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

.buttons pf-button {
  --pf-c-button--FontWeight: bold;
}
</style>
