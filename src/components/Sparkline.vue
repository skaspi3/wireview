<template>
  <canvas
    ref="canvas"
    :width="width"
    :height="height"
    class="sparkline"
  ></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({
  // Array of data points (numbers)
  data: {
    type: Array,
    default: () => []
  },
  // Canvas dimensions
  width: {
    type: Number,
    default: 180
  },
  height: {
    type: Number,
    default: 28
  },
  // Line color
  lineColor: {
    type: String,
    default: '#4fc3f7'
  },
  // Fill color (gradient from line to transparent)
  fillColor: {
    type: String,
    default: 'rgba(79, 195, 247, 0.2)'
  },
  // Line width
  lineWidth: {
    type: Number,
    default: 1.5
  },
  // Maximum number of data points to show
  maxPoints: {
    type: Number,
    default: 60
  },
  // Auto-scale Y axis
  autoScale: {
    type: Boolean,
    default: true
  },
  // Fixed max value (if autoScale is false)
  maxValue: {
    type: Number,
    default: 100
  }
})

const canvas = ref(null)
let ctx = null
let animationFrame = null

// Draw the sparkline
const draw = () => {
  if (!canvas.value || !ctx) return

  const { width, height, data, lineColor, fillColor, lineWidth, maxPoints, autoScale, maxValue } = props

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  // Get visible data points
  const visibleData = data.slice(-maxPoints)
  if (visibleData.length < 2) {
    // Not enough data, draw a flat line
    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(0, height - 2)
    ctx.lineTo(width, height - 2)
    ctx.stroke()
    return
  }

  // Calculate Y scale
  let yMax = maxValue
  if (autoScale) {
    yMax = Math.max(...visibleData, 1) // At least 1 to avoid division by zero
    // Add 10% headroom
    yMax = yMax * 1.1
  }

  // Calculate point spacing
  const xStep = width / (maxPoints - 1)
  const yScale = (height - 4) / yMax  // 2px padding top and bottom

  // Calculate starting X position to right-align the data
  const startX = width - (visibleData.length - 1) * xStep

  // Build path
  ctx.beginPath()
  ctx.moveTo(startX, height - 2 - (visibleData[0] * yScale))

  for (let i = 1; i < visibleData.length; i++) {
    const x = startX + i * xStep
    const y = height - 2 - (visibleData[i] * yScale)

    // Use quadratic curve for smoother line
    if (i < visibleData.length - 1) {
      const xNext = startX + (i + 1) * xStep
      const yNext = height - 2 - (visibleData[i + 1] * yScale)
      const xMid = (x + xNext) / 2
      const yMid = (y + yNext) / 2
      ctx.quadraticCurveTo(x, y, xMid, yMid)
    } else {
      ctx.lineTo(x, y)
    }
  }

  // Draw fill
  ctx.lineTo(startX + (visibleData.length - 1) * xStep, height)
  ctx.lineTo(startX, height)
  ctx.closePath()

  // Create gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, fillColor)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fill()

  // Draw line on top
  ctx.beginPath()
  ctx.moveTo(startX, height - 2 - (visibleData[0] * yScale))

  for (let i = 1; i < visibleData.length; i++) {
    const x = startX + i * xStep
    const y = height - 2 - (visibleData[i] * yScale)

    if (i < visibleData.length - 1) {
      const xNext = startX + (i + 1) * xStep
      const yNext = height - 2 - (visibleData[i + 1] * yScale)
      const xMid = (x + xNext) / 2
      const yMid = (y + yNext) / 2
      ctx.quadraticCurveTo(x, y, xMid, yMid)
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.strokeStyle = lineColor
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

// Smooth animation frame
const scheduleDraw = () => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
  animationFrame = requestAnimationFrame(draw)
}

// Initialize canvas context
onMounted(() => {
  nextTick(() => {
    if (canvas.value) {
      ctx = canvas.value.getContext('2d')
      draw()
    }
  })
})

// Watch for data changes
watch(() => props.data, scheduleDraw, { deep: true })
watch(() => props.width, draw)
watch(() => props.height, draw)

// Cleanup
onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})
</script>

<style scoped>
.sparkline {
  display: block;
  background: transparent;
}
</style>
