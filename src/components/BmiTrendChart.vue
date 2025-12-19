<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  points: {
    type: Array,
    required: true, // [{ date: 'YYYY-MM-DD', bmi: number }]
  },
  height: {
    type: Number,
    default: 220,
  },
})

const W = 640
const H = computed(() => Math.max(160, Number(props.height) || 220))
const P = { l: 42, r: 16, t: 14, b: 28 }

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function fmtShort(dateStr) {
  // YYYY-MM-DD -> MM/DD
  const m = dateStr.slice(5, 7)
  const d = dateStr.slice(8, 10)
  return `${m}/${d}`
}

const values = computed(() => props.points.map((p) => p.bmi).filter((v) => Number.isFinite(v)))

const yDomain = computed(() => {
  const vs = values.value
  if (!vs.length) return { min: 0, max: 1 }
  let min = Math.min(...vs)
  let max = Math.max(...vs)
  if (min === max) {
    min -= 1
    max += 1
  }
  // padding
  const pad = Math.max(0.6, (max - min) * 0.12)
  min -= pad
  max += pad
  // round to 0.5
  min = Math.floor(min * 2) / 2
  max = Math.ceil(max * 2) / 2
  return { min, max }
})

const xStep = computed(() => {
  const n = props.points.length
  return n <= 1 ? 0 : (W - P.l - P.r) / (n - 1)
})

function xAt(i) {
  return P.l + i * xStep.value
}

function yAt(v) {
  const { min, max } = yDomain.value
  const t = (v - min) / (max - min)
  return P.t + (1 - t) * (H.value - P.t - P.b)
}

const pathD = computed(() => {
  const pts = props.points
  if (!pts.length) return ''
  return pts
    .map((p, i) => {
      const x = xAt(i)
      const y = yAt(p.bmi)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const areaD = computed(() => {
  const pts = props.points
  if (!pts.length) return ''
  const baseY = H.value - P.b
  const first = `M ${xAt(0).toFixed(2)} ${baseY.toFixed(2)}`
  const line = pts
    .map((p, i) => `L ${xAt(i).toFixed(2)} ${yAt(p.bmi).toFixed(2)}`)
    .join(' ')
  const last = `L ${xAt(pts.length - 1).toFixed(2)} ${baseY.toFixed(2)} Z`
  return `${first} ${line} ${last}`
})

const gridLines = computed(() => {
  const { min, max } = yDomain.value
  const steps = 4
  const out = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const v = min + (max - min) * (1 - t)
    out.push({ v: Math.round(v * 10) / 10, y: yAt(v) })
  }
  return out
})

const hoverIndex = ref(-1)
const tooltip = ref({ x: 0, y: 0, show: false })

function onMove(e) {
  const svg = e.currentTarget
  const rect = svg.getBoundingClientRect()
  const x = e.clientX - rect.left
  const n = props.points.length
  if (n <= 0) return

  const idx = n === 1 ? 0 : Math.round((x - P.l) / xStep.value)
  const i = clamp(idx, 0, n - 1)
  hoverIndex.value = i

  tooltip.value = {
    x: xAt(i),
    y: yAt(props.points[i].bmi),
    show: true,
  }
}

function onLeave() {
  hoverIndex.value = -1
  tooltip.value = { x: 0, y: 0, show: false }
}
</script>

<template>
  <div class="chart">
    <svg
      class="svg"
      :viewBox="`0 0 ${W} ${H}`"
      preserveAspectRatio="none"
      role="img"
      aria-label="BMI trend chart"
      @mousemove="onMove"
      @mouseleave="onLeave"
    >
      <defs>
        <linearGradient id="bmiLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6ee7b7" />
          <stop offset="50%" stop-color="#34d399" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
        <linearGradient id="bmiArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(110,231,183,0.22)" />
          <stop offset="100%" stop-color="rgba(34,197,94,0.00)" />
        </linearGradient>
      </defs>

      <!-- grid -->
      <g class="grid">
        <template v-for="g in gridLines" :key="g.y">
          <line :x1="P.l" :x2="W - P.r" :y1="g.y" :y2="g.y" class="gridLine" />
          <text :x="P.l - 8" :y="g.y + 4" text-anchor="end" class="gridLabel">{{ g.v }}</text>
        </template>
      </g>

      <!-- area + line -->
      <path v-if="areaD" :d="areaD" fill="url(#bmiArea)" />
      <path v-if="pathD" :d="pathD" fill="none" stroke="url(#bmiLine)" stroke-width="3" stroke-linecap="round" />

      <!-- points -->
      <g class="dots">
        <circle
          v-for="(p, i) in points"
          :key="p.date"
          :cx="xAt(i)"
          :cy="yAt(p.bmi)"
          :r="i === hoverIndex ? 5 : 3.2"
          :class="['dot', i === hoverIndex ? 'hot' : '']"
        />
      </g>

      <!-- x labels: first / middle / last -->
      <g class="xlabels" v-if="points.length">
        <text :x="P.l" :y="H - 10" text-anchor="start" class="xLabel">{{ fmtShort(points[0].date) }}</text>
        <text
          :x="xAt(Math.floor((points.length - 1) / 2))"
          :y="H - 10"
          text-anchor="middle"
          class="xLabel"
        >
          {{ fmtShort(points[Math.floor((points.length - 1) / 2)].date) }}
        </text>
        <text :x="W - P.r" :y="H - 10" text-anchor="end" class="xLabel">{{ fmtShort(points[points.length - 1].date) }}</text>
      </g>

      <!-- hover -->
      <g v-if="tooltip.show && hoverIndex >= 0" class="hover">
        <line :x1="tooltip.x" :x2="tooltip.x" :y1="P.t" :y2="H - P.b" class="hoverLine" />
      </g>
    </svg>

    <div v-if="tooltip.show && hoverIndex >= 0" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="ttDate">{{ points[hoverIndex].date }}</div>
      <div class="ttVal">BMI {{ points[hoverIndex].bmi }}</div>
    </div>
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  width: 100%;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.10);
  overflow: hidden;
}

.svg {
  width: 100%;
  height: 220px;
  display: block;
}

.gridLine {
  stroke: rgba(255, 255, 255, 0.10);
  stroke-width: 1;
}

.gridLabel {
  fill: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}

.xLabel {
  fill: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}

.dot {
  fill: rgba(110, 231, 183, 0.95);
  stroke: rgba(7, 10, 18, 0.8);
  stroke-width: 1.4;
}

.dot.hot {
  fill: rgba(34, 197, 94, 1);
}

.hoverLine {
  stroke: rgba(255, 255, 255, 0.18);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.tooltip {
  position: absolute;
  transform: translate(-50%, -120%);
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(10, 16, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  color: rgba(255, 255, 255, 0.92);
  min-width: 120px;
}

.ttDate {
  font-size: 11px;
  opacity: 0.72;
}

.ttVal {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 800;
}
</style>


