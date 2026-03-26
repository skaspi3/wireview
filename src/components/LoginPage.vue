<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import { ref } from 'vue';

const emit = defineEmits(['login-success']);

const password = ref('');
const error = ref('');
const loading = ref(false);

const login = async () => {
  error.value = '';
  if (!password.value) {
    error.value = 'Please enter a password';
    return;
  }
  loading.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'webpcap', password: password.value }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      error.value = data.error || 'Login failed';
      return;
    }
    emit('login-success', { user: data.user, passwordChanged: data.passwordChanged });
  } catch (e) {
    error.value = 'Connection error';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <img src="/webpcap-logo.png" alt="WebPCAP" class="login-logo" />

      <form class="login-form" @submit.prevent="login">
        <div class="login-field">
          <label for="login-user">Username</label>
          <input
            id="login-user"
            type="text"
            value="webpcap"
            readonly
            class="login-readonly"
          />
        </div>
        <div class="login-field">
          <label for="login-pass">Password</label>
          <input
            id="login-pass"
            v-model="password"
            type="password"
            autocomplete="current-password"
            autofocus
            @keyup.enter="login"
          />
        </div>
        <div v-if="error" class="login-error">{{ error }}</div>
        <pf-button type="submit" class="login-btn" :disabled="loading || undefined" :loading="loading || undefined" block>
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </pf-button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #111318;
}
.login-card {
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
.login-logo {
  height: 36px;
  margin-bottom: 32px;
  user-select: none;
  -webkit-user-drag: none;
}
.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.login-field label {
  color: #9ca3af;
  font-size: 13px;
  font-weight: 500;
}
.login-field input {
  background: #111318;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 12px;
  color: #e5e7eb;
  font-size: 15px;
  outline: none;
  transition: border-color 0.15s;
}
.login-field input:focus {
  border-color: #3b82f6;
}
.login-readonly {
  opacity: 0.6;
  cursor: default;
}
.login-error {
  color: #ef4444;
  font-size: 13px;
  text-align: center;
  padding: 6px 0;
}
.login-btn {
  margin-top: 6px;
  --pf-c-button--FontSize: 15px;
  --pf-c-button--FontWeight: 600;
}
</style>
