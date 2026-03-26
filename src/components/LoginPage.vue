<script setup>
import '@patternfly/elements/pf-button/pf-button.js';
import { ref } from 'vue';

const emit = defineEmits(['login-success']);

const mode = ref('login'); // 'login' or 'register'

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

// Registration fields
const regUsername = ref('');
const regEmail = ref('');
const regPassword = ref('');
const regConfirm = ref('');
const regError = ref('');
const regLoading = ref(false);

const login = async () => {
  error.value = '';
  if (!username.value || !password.value) {
    error.value = 'Please enter username and password';
    return;
  }
  loading.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      error.value = data.error || 'Login failed';
      return;
    }
    emit('login-success', { user: data.user });
  } catch (e) {
    error.value = 'Connection error';
  } finally {
    loading.value = false;
  }
};

const register = async () => {
  regError.value = '';
  if (!regUsername.value.trim() || regUsername.value.trim().length < 2) {
    regError.value = 'Username must be at least 2 characters';
    return;
  }
  if (!regEmail.value.trim()) {
    regError.value = 'Email is required';
    return;
  }
  if (!regPassword.value || regPassword.value.length < 4) {
    regError.value = 'Password must be at least 4 characters';
    return;
  }
  if (regPassword.value !== regConfirm.value) {
    regError.value = 'Passwords do not match';
    return;
  }
  regLoading.value = true;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: regUsername.value.trim(),
        email: regEmail.value.trim(),
        password: regPassword.value,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      regError.value = data.error || 'Registration failed';
      return;
    }
    emit('login-success', { user: data.user });
  } catch (e) {
    regError.value = 'Connection error';
  } finally {
    regLoading.value = false;
  }
};

const switchToRegister = () => {
  mode.value = 'register';
  regError.value = '';
};

const switchToLogin = () => {
  mode.value = 'login';
  error.value = '';
};
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <img src="/webpcap-logo.png" alt="WebPCAP" class="login-logo" />

      <!-- Login form -->
      <form v-if="mode === 'login'" class="login-form" @submit.prevent="login">
        <div class="login-field">
          <label for="login-user">Username</label>
          <input
            id="login-user"
            v-model="username"
            type="text"
            autocomplete="username"
            autofocus
          />
        </div>
        <div class="login-field">
          <label for="login-pass">Password</label>
          <input
            id="login-pass"
            v-model="password"
            type="password"
            autocomplete="current-password"
            @keyup.enter="login"
          />
        </div>
        <div v-if="error" class="login-error">{{ error }}</div>
        <pf-button type="submit" class="login-btn" :disabled="loading || undefined" :loading="loading || undefined" block>
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </pf-button>
        <div class="login-switch">
          Don't have an account? <a href="#" @click.prevent="switchToRegister">Create Account</a>
        </div>
      </form>

      <!-- Registration form -->
      <form v-else class="login-form" @submit.prevent="register">
        <div class="login-field">
          <label for="reg-user">Username</label>
          <input
            id="reg-user"
            v-model="regUsername"
            type="text"
            autocomplete="username"
            autofocus
            placeholder="Min 2 characters"
          />
        </div>
        <div class="login-field">
          <label for="reg-email">Email <span class="login-required">(@zixi.com)</span></label>
          <input
            id="reg-email"
            v-model="regEmail"
            type="email"
            autocomplete="email"
            placeholder="user@zixi.com"
          />
        </div>
        <div class="login-field">
          <label for="reg-pass">Password</label>
          <input
            id="reg-pass"
            v-model="regPassword"
            type="password"
            autocomplete="new-password"
            placeholder="Min 4 characters"
          />
        </div>
        <div class="login-field">
          <label for="reg-confirm">Confirm Password</label>
          <input
            id="reg-confirm"
            v-model="regConfirm"
            type="password"
            autocomplete="new-password"
            @keyup.enter="register"
          />
        </div>
        <div v-if="regError" class="login-error">{{ regError }}</div>
        <pf-button type="submit" class="login-btn" :disabled="regLoading || undefined" :loading="regLoading || undefined" block>
          {{ regLoading ? 'Creating...' : 'Create Account' }}
        </pf-button>
        <div class="login-switch">
          Already have an account? <a href="#" @click.prevent="switchToLogin">Sign In</a>
        </div>
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
.login-switch {
  text-align: center;
  color: #6b7280;
  font-size: 13px;
  margin-top: 4px;
}
.login-switch a {
  color: #3b82f6;
  text-decoration: none;
  font-weight: 500;
}
.login-switch a:hover {
  text-decoration: underline;
}
.login-required {
  color: #f59e0b;
  font-weight: 400;
}
</style>
