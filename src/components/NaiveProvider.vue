<script setup>
/**
 * NaiveProvider - Wraps application content with Naive UI providers.
 * Provides: message, notification, loading-bar, and dark theme.
 * Exposes service instances globally via window for use outside Vue components.
 */
import { defineComponent } from 'vue';
import {
  darkTheme,
  NConfigProvider,
  NMessageProvider,
  NNotificationProvider,
  NLoadingBarProvider,
  useMessage,
  useNotification,
  useLoadingBar,
} from 'naive-ui';

/**
 * Inner renderless component that registers Naive UI composables into the global scope.
 * Must be a child of the providers to access their inject context.
 */
const NaiveServiceRegistrar = defineComponent({
  name: 'NaiveServiceRegistrar',
  setup() {
    const message = useMessage();
    const notification = useNotification();
    const loadingBar = useLoadingBar();

    window.$message = message;
    window.$notification = notification;
    window.$loadingBar = loadingBar;
  },
  render() {
    return null;
  },
});

// Theme overrides to match the existing dark color scheme
const themeOverrides = {
  common: {
    primaryColor: '#3b82f6',
    primaryColorHover: '#60a5fa',
    primaryColorPressed: '#2563eb',
    primaryColorSuppl: '#3b82f6',
    successColor: '#22c55e',
    successColorHover: '#4ade80',
    warningColor: '#f59e0b',
    warningColorHover: '#fbbf24',
    errorColor: '#ef4444',
    errorColorHover: '#f87171',
    infoColor: '#3b82f6',
    infoColorHover: '#60a5fa',
    bodyColor: '#1a1d23',
    cardColor: '#1f2937',
    modalColor: '#1f2937',
    popoverColor: '#1f2937',
    tableColor: '#1a1d23',
    inputColor: '#1e1e1e',
    borderColor: '#374151',
    dividerColor: '#374151',
    hoverColor: 'rgba(255, 255, 255, 0.05)',
    textColorBase: '#e5e7eb',
    textColor1: '#f9fafb',
    textColor2: '#d1d5db',
    textColor3: '#9ca3af',
    borderRadius: '6px',
    fontFamily: '"Segoe UI", sans-serif',
    fontFamilyMono: 'monospace',
    fontSize: '13px',
  },
  LoadingBar: {
    colorLoading: '#3b82f6',
    height: '3px',
  },
  Message: {
    colorInfo: '#1f2937',
    colorSuccess: '#1f2937',
    colorWarning: '#1f2937',
    colorError: '#1f2937',
    colorLoading: '#1f2937',
    borderInfo: '1px solid #374151',
    borderSuccess: '1px solid #374151',
    borderWarning: '1px solid #374151',
    borderError: '1px solid #374151',
    borderLoading: '1px solid #374151',
    boxShadowInfo: '0 4px 12px rgba(0, 0, 0, 0.3)',
    boxShadowSuccess: '0 4px 12px rgba(0, 0, 0, 0.3)',
    boxShadowWarning: '0 4px 12px rgba(0, 0, 0, 0.3)',
    boxShadowError: '0 4px 12px rgba(0, 0, 0, 0.3)',
    boxShadowLoading: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  Notification: {
    color: '#1f2937',
    borderColor: '#374151',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    headerTextColor: '#f9fafb',
    descriptionTextColor: '#d1d5db',
    textColor: '#e5e7eb',
  },
};
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-message-provider :max="5" :duration="3000" placement="bottom">
        <n-notification-provider :max="4" placement="bottom-right">
          <NaiveServiceRegistrar />
          <slot />
        </n-notification-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>
