<script setup>
import { onMounted, ref } from 'vue';
import Particles from '@tsparticles/vue3';
import { loadSlim } from '@tsparticles/slim';

const props = defineProps({
  color: { type: String, default: '#c0c0c0' },
  linkColor: { type: String, default: '#c0c0c0' },
  count: { type: Number, default: 80 },
  speed: { type: Number, default: 1 },
  linkDistance: { type: Number, default: 150 },
  opacity: { type: Number, default: 0.4 },
});

const ready = ref(false);

const particlesInit = async (engine) => {
  await loadSlim(engine);
  ready.value = true;
};

const options = {
  fullScreen: false,
  background: { color: 'transparent' },
  fpsLimit: 60,
  particles: {
    number: { value: props.count, density: { enable: true, area: 900 } },
    color: { value: props.color },
    links: {
      enable: true,
      distance: props.linkDistance,
      color: props.linkColor,
      opacity: props.opacity,
      width: 1,
    },
    move: {
      enable: true,
      speed: props.speed,
      direction: 'none',
      outModes: { default: 'bounce' },
    },
    opacity: { value: props.opacity },
    size: { value: { min: 1, max: 3 } },
    shape: { type: 'circle' },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: 'grab' },
    },
    modes: {
      grab: { distance: 180, links: { opacity: 0.6 } },
    },
  },
  detectRetina: true,
};
</script>

<template>
  <Particles class="particles-bg" :options="options" :particlesInit="particlesInit" />
</template>

<style scoped>
.particles-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: auto;
}
</style>
