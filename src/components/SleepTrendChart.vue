<script setup>
import { computed, ref } from 'vue'
import { minsToHm } from '../utils/sleepScoring'

const props = defineProps({
  points: {
    type: Array,
    required: true, // [{ date:'YYYY-MM-DD', score:number, durationMin:number }]
  },
  height: {
    type: Number,
    default: 240,
  },
})

const W = 640
const H = computed(() => Math.max(180, Number(props.height) || 240))
const P = { l: 46, r: 46, t: 14, b: 28 }

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function fmtShort(dateStr) {
  // YYYY-MM-DD -> MM/DD
  const m = dateStr.slice(5, 7)
  const d = dateStr.slice(8, 10)
  return `${m}/${d}`
}

const safePoints = computed(() =>
  (props.points ?? []).filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date ?? '')))
)

const durations = computed(() =>
  safePoints.value.map((p) => Number(p.durationMin)).filter((v) => Number.isFinite(v) && v > 0)
)

const durDomain = computed(() => {
  const vs = durations.value
  if (!vs.length) return { min: 0, max: 600 }
  let min = Math.min(...vs)
  let max = Math.max(...vs)
  // keep readable range; enforce minimum spread
  min = Math.max(0, Math.floor((min - 60) / 60) * 60)
  max = Math.min(16 * 60, Math.ceil((max + 60) / 60) * 60)
  if (max - min < 180) max = Math.min(16 * 60, min + 180)
  return { min, max }
})

const xStep = computed(() => {
  const n = safePoints.value.length
  return n <= 1 ? 0 : (W - P.l - P.r) / (n - 1)
})

function xAt(i) {
  return P.l + i * xStep.value
}

function yDur(v) {
  const { min, max } = durDomain.value
  const t = (v - min) / (max - min)
  return P.t + (1 - t) * (H.value - P.t - P.b)
}

function yScore(s) {
  const v = clamp(Number(s), 0, 100)
  const t = v / 100
  return P.t + (1 - t) * (H.value - P.t - P.b)
}

const barW = computed(() => {
  const n = safePoints.value.length
  if (n <= 1) return 42
  return clamp(xStep.value * 0.62, 10, 26)
})

const lineD = computed(() => {
  const pts = safePoints.value
  if (!pts.length) return ''
  return pts
    .map((p, i) => {
      const x = xAt(i)
      const y = yScore(p.score)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
})

const scoreGrid = computed(() => [0, 25, 50, 75, 100].map((v) => ({ v, y: yScore(v) })))
const durGrid = computed(() => {
  const { min, max } = durDomain.value
  const step = 120 // 2 hours
  const out = []
  for (let v = min; v <= max; v += step) out.push({ v, y: yDur(v) })
  return out
})

const hoverIndex = ref(-1)
const tooltip = ref({ x: 0, y: 0, show: false })
const hoverMode = ref('bar') // 'bar' | 'line'

function onMove(e) {
  const svg = e.currentTarget
  const rect = svg.getBoundingClientRect()
  const xPx = e.clientX - rect.left
  const n = safePoints.value.length
  if (n <= 0) return

  // Convert mouse position (px) -> SVG viewBox units to avoid scale drift
  const xSvg = rect.width > 0 ? (xPx / rect.width) * W : xPx
  const idx = n === 1 ? 0 : Math.round((xSvg - P.l) / xStep.value)
  const i = clamp(idx, 0, n - 1)
  hoverIndex.value = i

  // pick y from bar top to feel like "hovering the bar"
  const p = safePoints.value[i]
  const barTopSvg = yDur(Number(p.durationMin))

  // Anchor tooltip to the bar center/top in px (absolute overlay)
  const anchorXSvg = xAt(i)
  const anchorXPx = rect.width > 0 ? (anchorXSvg / W) * rect.width : xPx
  const anchorYPx = rect.height > 0 ? (barTopSvg / H.value) * rect.height : 0
  tooltip.value = { x: anchorXPx, y: anchorYPx, show: true }
  hoverMode.value = 'bar'
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
      :style="{ height: H + 'px' }"
      preserveAspectRatio="none"
      role="img"
      aria-label="Sleep duration (bar) and score (line)"
      @mousemove="onMove"
      @mouseleave="onLeave"
    >
      <defs>
        <linearGradient id="sleepLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ddd6fe" />
          <stop offset="55%" stop-color="#a78bfa" />
          <stop offset="100%" stop-color="#8b5cf6" />
        </linearGradient>
        <linearGradient id="sleepBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(56,189,248,0.30)" />
          <stop offset="100%" stop-color="rgba(56,189,248,0.06)" />
        </linearGradient>
      </defs>

      <!-- grid (score) -->
      <g class="grid">
        <template v-for="g in scoreGrid" :key="`sg-${g.v}`">
          <line :x1="P.l" :x2="W - P.r" :y1="g.y" :y2="g.y" class="gridLine" />
          <text :x="W - P.r + 6" :y="g.y + 4" text-anchor="start" class="gridLabelR">{{ g.v }}</text>
        </template>
      </g>

      <!-- duration labels (left) -->
      <g class="grid">
        <template v-for="g in durGrid" :key="`dg-${g.v}`">
          <text :x="P.l - 8" :y="g.y + 4" text-anchor="end" class="gridLabelL">{{ Math.round(g.v / 60) }}h</text>
        </template>
      </g>

      <!-- bars (duration) -->
      <g class="bars" v-if="safePoints.length">
        <rect
          v-for="(p, i) in safePoints"
          :key="`b-${p.date}`"
          class="bar"
          :class="{ hot: i === hoverIndex }"
          :x="(xAt(i) - barW / 2).toFixed(2)"
          :y="yDur(Number(p.durationMin)).toFixed(2)"
          :width="barW.toFixed(2)"
          :height="(H - P.b - yDur(Number(p.durationMin))).toFixed(2)"
          rx="8"
          ry="8"
        />
      </g>

      <!-- line (score) -->
      <path v-if="lineD" :d="lineD" fill="none" stroke="url(#sleepLine)" stroke-width="3" stroke-linecap="round" class="line" />

      <!-- line dots -->
      <g class="dots" v-if="safePoints.length">
        <circle
          v-for="(p, i) in safePoints"
          :key="`d-${p.date}`"
          :cx="xAt(i)"
          :cy="yScore(p.score)"
          :r="i === hoverIndex ? 5 : 3.2"
          :class="['dot', i === hoverIndex ? 'hot' : '']"
        />
      </g>

      <!-- x labels: first / middle / last -->
      <g class="xlabels" v-if="safePoints.length">
        <text :x="P.l" :y="H - 10" text-anchor="start" class="xLabel">{{ fmtShort(safePoints[0].date) }}</text>
        <text
          :x="xAt(Math.floor((safePoints.length - 1) / 2))"
          :y="H - 10"
          text-anchor="middle"
          class="xLabel"
        >
          {{ fmtShort(safePoints[Math.floor((safePoints.length - 1) / 2)].date) }}
        </text>
        <text :x="W - P.r" :y="H - 10" text-anchor="end" class="xLabel">{{ fmtShort(safePoints[safePoints.length - 1].date) }}</text>
      </g>

      <!-- hover vertical line -->
      <g v-if="tooltip.show && hoverIndex >= 0" class="hover">
        <line :x1="xAt(hoverIndex)" :x2="xAt(hoverIndex)" :y1="P.t" :y2="H - P.b" class="hoverLine" />
      </g>
    </svg>

  <div v-if="tooltip.show && hoverIndex >= 0" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
      <div class="ttDate">{{ safePoints[hoverIndex].date }}</div>
      <div class="ttVal">Duration {{ minsToHm(safePoints[hoverIndex].durationMin) }}</div>
      <div class="ttVal sub">Score {{ safePoints[hoverIndex].score }}</div>
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
  /* allow tooltip to escape the chart box */
  overflow: visible;
}

.svg {
  width: 100%;
  height: 100%;
  display: block;
}

.gridLine {
  stroke: rgba(255, 255, 255, 0.10);
}

.gridLabelL,
.gridLabelR {
  fill: rgba(255, 255, 255, 0.50);
  font-size: 11px;
  font-weight: 650;
}

.bar {
  fill: url(#sleepBar);
  stroke: rgba(56, 189, 248, 0.22);
  stroke-width: 1;
  transition: filter 160ms ease, opacity 160ms ease;
}

.bar.hot {
  filter: brightness(1.12);
  stroke: rgba(56, 189, 248, 0.38);
}

.dot {
  fill: rgba(221, 214, 254, 0.88);
  stroke: rgba(139, 92, 246, 0.55);
  stroke-width: 1;
}

.dot.hot {
  fill: rgba(255, 255, 255, 0.95);
}

.hoverLine {
  stroke: rgba(255, 255, 255, 0.14);
  stroke-dasharray: 4 4;
}

.xLabel {
  fill: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-weight: 650;
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
  min-width: 160px;
  z-index: 30;
  backdrop-filter: blur(10px);
}

.ttDate {
  font-size: 11px;
  opacity: 0.72;
}

.ttVal {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 850;
}

.ttVal.sub {
  opacity: 0.88;
  font-weight: 750;
}
</style>


