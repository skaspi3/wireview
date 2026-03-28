import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initSentry } from './sentry'
import Particles from '@tsparticles/vue3'
import { loadSlim } from '@tsparticles/slim'

const app = createApp(App)
initSentry(app)
app.use(Particles, { init: async (engine) => { await loadSlim(engine); } })
app.mount('#app')
