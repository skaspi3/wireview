import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Register Service Worker for WASM pre-caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.log('Service Worker registered, scope:', registration.scope);
    })
    .catch((err) => {
      console.warn('Service Worker registration failed:', err);
    });
}

createApp(App).mount('#app')
