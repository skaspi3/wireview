<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import { ref } from 'vue';

const props = defineProps({
  firstRun: { type: Boolean, default: false },
});
const emit = defineEmits(['password-changed']);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const loading = ref(false);

const submit = async () => {
  error.value = '';
  if (!props.firstRun && !currentPassword.value) {
    error.value = 'Current password is required';
    return;
  }
  if (!newPassword.value || !confirmPassword.value) {
    error.value = 'All fields are required';
    return;
  }
  if (newPassword.value.length < 6) {
    error.value = 'Password must be at least 6 characters';
    return;
  }
  if (newPassword.value.length > 12) {
    error.value = 'Password must be at most 12 characters';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }
  if (newPassword.value === 'root1234') {
    error.value = 'New password must differ from the default';
    return;
  }
  loading.value = true;
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(props.firstRun ? {} : { currentPassword: currentPassword.value }),
        newPassword: newPassword.value,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      error.value = data.error || 'Failed to change password';
      return;
    }
    emit('password-changed');
  } catch (e) {
    error.value = 'Connection error';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="cpw-page">
    <div class="cpw-card">
      <img src="/webpcap-logo.png" alt="WebPCAP" class="cpw-logo" />
      <div class="cpw-title">Change Password</div>
      <div class="cpw-subtitle">You must set a new password before continuing.</div>
      <form class="cpw-form" @submit.prevent="submit">
        <div v-if="!firstRun" class="cpw-field">
          <label for="cpw-current">Current Password</label>
          <input id="cpw-current" v-model="currentPassword" type="password" autocomplete="current-password" autofocus />
        </div>
        <div class="cpw-field">
          <label for="cpw-new">New Password</label>
          <input id="cpw-new" v-model="newPassword" type="password" autocomplete="new-password" :autofocus="firstRun" placeholder="6–12 characters" />
        </div>
        <div class="cpw-field">
          <label for="cpw-confirm">Confirm Password</label>
          <input id="cpw-confirm" v-model="confirmPassword" type="password" autocomplete="new-password" @keyup.enter="submit" />
        </div>
        <div v-if="error" class="cpw-error">{{ error }}</div>
        <pf-button type="submit" class="cpw-btn" :disabled="loading || undefined" :loading="loading || undefined" block>
          {{ loading ? 'Saving...' : 'Set Password' }}
        </pf-button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.cpw-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #111318;
}
.cpw-card {
  background: #1a1d23;
  border: 1px solid #2d3240;
  border-radius: 14px;
  padding: 40px 44px 36px;
  width: 370px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.cpw-logo {
  height: 36px;
  margin-bottom: 24px;
  user-select: none;
  -webkit-user-drag: none;
}
.cpw-title {
  color: #f9fafb;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 6px;
}
.cpw-subtitle {
  color: #9ca3af;
  font-size: 13px;
  margin-bottom: 22px;
  text-align: center;
}
.cpw-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.cpw-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cpw-field label {
  color: #9ca3af;
  font-size: 13px;
  font-weight: 500;
}
.cpw-field input {
  background: #111318;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 12px;
  color: #e5e7eb;
  font-size: 15px;
  outline: none;
  transition: border-color 0.15s;
}
.cpw-field input:focus {
  border-color: #3b82f6;
}
.cpw-error {
  color: #ef4444;
  font-size: 13px;
  text-align: center;
  padding: 4px 0;
}
.cpw-btn {
  margin-top: 4px;
  --pf-c-button--FontSize: 15px;
  --pf-c-button--FontWeight: 600;
}
</style>
