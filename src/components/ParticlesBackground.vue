<script setup>
import { computed } from 'vue';

const props = defineProps({
  id: { type: String, default: 'particles' },
  color: { type: String, default: '#c0c0c0' },
  linkColor: { type: String, default: '#c0c0c0' },
  count: { type: Number, default: 80 },
  speed: { type: Number, default: 1 },
  linkDistance: { type: Number, default: 150 },
  opacity: { type: Number, default: 0.4 },
});

const options = computed(() => ({
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
}));
</script>

<template>
  <vue-particles :id="id" :options="options" class="particles-bg" />
</template>

<style scoped>
.particles-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}
</style>
