<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import SleepTrendChart from '../components/SleepTrendChart.vue'
import { sleepHistoryMock } from '../mock/sleep'
import { assessSleep, minsToHm, worstAspect } from '../utils/sleepScoring'

const router = useRouter()

// -----------------------
// Input state
// -----------------------
// Split inputs: date + hour + minute (all dropdowns like BMI unit selector)
const startDate = ref('') // YYYY-MM-DD (default: yesterday)
const startHour = ref('00') // 00..23
const startMin = ref('00') // 00..59

const wakeDate = ref('') // YYYY-MM-DD (default: today)
const wakeHour = ref('00') // 00..23
const wakeMin = ref('00') // 00..59

const awakenings = ref(0) // int >= 0

const error = ref('')
const result = ref(null)

// Dropdown menus (match BMI)
const openMenu = ref(null)

function toggleMenu(which) {
  openMenu.value = openMenu.value === which ? null : which
}

function closeMenus() {
  openMenu.value = null
}

const closeOnWindowClick = () => {
  closeMenus()
}

// -----------------------
// Local storage (by sleep date)
// -----------------------
// 约定：localStorage 只保存用户真实录入（saved）；渲染时用 mock 作为基线再覆盖合并（merged）
const SLEEP_HISTORY_STORAGE_KEY = 'healthcare.sleepHistory.v1'
const savedHistory = ref([]) // [{ date, sleepStart, wakeTime, awakenings, durationMin, score }]

function pad2(n) {
  return String(n).padStart(2, '0')
}

function parseYmd(dateStr) {
  // local midnight
  return new Date(`${dateStr}T00:00:00`)
}

function toYmd(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

function addDays(ymdStr, deltaDays) {
  const d = parseYmd(ymdStr)
  d.setDate(d.getDate() + deltaDays)
  return toYmd(d)
}

function safeReadLocalHistory() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SLEEP_HISTORY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const cleaned = parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        date: String(x.date ?? ''),
        sleepStart: String(x.sleepStart ?? ''),
        wakeTime: String(x.wakeTime ?? ''),
        awakenings: Number(x.awakenings ?? 0),
        durationMin: Number(x.durationMin ?? NaN),
        score: Number(x.score ?? NaN),
      }))
      .filter(
        (x) =>
          /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
          x.sleepStart &&
          x.wakeTime &&
          Number.isFinite(x.awakenings) &&
          x.awakenings >= 0 &&
          Number.isFinite(x.durationMin) &&
          x.durationMin > 0 &&
          Number.isFinite(x.score)
      )
      .sort((a, b) => a.date.localeCompare(b.date))

    return cleaned.length ? cleaned : null
  } catch {
    return null
  }
}

function safeWriteLocalHistory(list) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SLEEP_HISTORY_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore quota / privacy mode
  }
}

function upsertSavedForDate(dateStr, payload) {
  const next = Array.isArray(savedHistory.value) ? savedHistory.value.slice() : []
  const idx = next.findIndex((p) => p?.date === dateStr)
  const rec = { date: dateStr, ...payload }
  if (idx >= 0) next[idx] = { ...next[idx], ...rec }
  else next.push(rec)
  next.sort((a, b) => a.date.localeCompare(b.date))
  savedHistory.value = next
  safeWriteLocalHistory(next)
}

function mergeMockAndSaved(mockList, savedList) {
  const map = new Map()
  for (const p of mockList ?? []) map.set(p.date, { ...p })
  for (const p of savedList ?? []) map.set(p.date, { ...map.get(p.date), ...p })
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function isValidHour(hh) {
  return /^\d{2}$/.test(hh) && Number(hh) >= 0 && Number(hh) <= 23
}

function isValidMinute(mm) {
  return /^\d{2}$/.test(mm) && Number(mm) >= 0 && Number(mm) <= 59
}

const hourOptions = Array.from({ length: 24 }, (_, i) => pad2(i))
const minuteOptions = Array.from({ length: 60 }, (_, i) => pad2(i))
const awakeningOptions = Array.from({ length: 11 }, (_, i) => i) // 0..10

const dateOptions = computed(() => {
  // Provide a usable window (past 365 days + tomorrow), so user can choose cross-day wake.
  const today = toYmd(new Date())
  const start = addDays(today, -365)
  const end = addDays(today, 1)
  const out = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
})

const sleepStartStr = computed(() => {
  if (!startDate.value || !isValidHour(startHour.value) || !isValidMinute(startMin.value)) return ''
  return `${startDate.value}T${startHour.value}:${startMin.value}`
})

const wakeTimeStr = computed(() => {
  if (!wakeDate.value || !isValidHour(wakeHour.value) || !isValidMinute(wakeMin.value)) return ''
  return `${wakeDate.value}T${wakeHour.value}:${wakeMin.value}`
})

function buildWorstHint(worst, ctx) {
  // ctx: { durationMin, startDate, awakenings, cycleDiffMin }
  if (worst.key === 'duration') {
    if (ctx.durationMin < 360) {
      return `Your sleep was short (~${minsToHm(ctx.durationMin)}). First priority: reach 7–8 hours by keeping a fixed wake time and moving bedtime earlier by 30–60 minutes.`
    }
    return `Your sleep duration could be improved (~${minsToHm(ctx.durationMin)}). Aim for 7–9 hours and keep a consistent schedule.`
  }
  if (worst.key === 'bedtime') {
    const hh = pad2(ctx.startDate.getHours())
    const mm = pad2(ctx.startDate.getMinutes())
    return `You fell asleep late (${hh}:${mm}). Try moving toward ~23:00: put your phone away 30 minutes earlier, dim lights, and keep a fixed wake time.`
  }
  if (worst.key === 'awakenings') {
    const a = ctx.awakenings
    if (a >= 3) {
      return `You woke up frequently at night (${a} times), which can noticeably reduce sleep quality. Try reducing fluids/alcohol/caffeine within 2 hours before bed; consider checking for persistent issues if this continues.`
    }
    if (a === 2) return 'You woke up twice at night, which may affect continuity. Reduce late fluids and stimulants, and see if it persists.'
    return `Night awakenings were low (${a} time${a === 1 ? '' : 's'}), impact is likely small.`
  }
  // cycle
  if (ctx.cycleDiffMin <= 10) return 'Your duration is very close to a full sleep cycle—nice!'
  if (ctx.cycleDiffMin <= 30) {
    return `Your duration is slightly off a full sleep-cycle boundary (~${ctx.cycleDiffMin} min). Try shifting wake time by ±15–30 minutes and see if you wake up more naturally.`
  }
  return `Your duration is far from a full sleep-cycle boundary (~${ctx.cycleDiffMin} min). First, stabilize your schedule, then try adjusting wake time closer to a multiple of 90 minutes.`
}

function calc() {
  error.value = ''
  result.value = null

  if (!sleepStartStr.value || !wakeTimeStr.value) {
    error.value = 'Please select both sleep time and wake time.'
    return
  }

  const aRaw = Number(awakenings.value)
  const a = Number.isFinite(aRaw) ? Math.max(0, Math.round(aRaw)) : NaN
  if (!Number.isFinite(a)) {
    error.value = 'Awakenings must be a non-negative integer.'
    return
  }

  const assessed = assessSleep({ sleepStartISO: sleepStartStr.value, wakeTimeISO: wakeTimeStr.value, awakenings: a })
  if (!assessed) {
    error.value =
      'Invalid time range. Make sure wake time is after sleep time (select the next day if needed), and keep duration within 1–16 hours.'
    return
  }

  const hint =
    assessed.score < 70
      ? buildWorstHint(assessed.worst, { durationMin: assessed.durationMin, startDate: assessed.start, awakenings: assessed.awakenings, cycleDiffMin: assessed.cycleDiffMin })
      : 'Overall sleep looks good. Keep a consistent schedule and a steady wake-up time.'

  const sleepDateKey = assessed.dateKey // 按“入睡日期”归档
  // 更新 saved（立即影响图表）+ 写入 localStorage
  upsertSavedForDate(sleepDateKey, {
    sleepStart: assessed.sleepStartISO,
    wakeTime: assessed.wakeTimeISO,
    awakenings: assessed.awakenings,
    durationMin: assessed.durationMin,
    score: assessed.score,
  })

  result.value = {
    dateKey: sleepDateKey,
    durationMin: assessed.durationMin,
    subscores: assessed.subscores,
    score: assessed.score,
    grade: assessed.grade,
    worst: assessed.worst,
    hint,
  }
}

function reset() {
  // Reset to defaults
  const today = toYmd(new Date())
  startDate.value = addDays(today, -1)
  wakeDate.value = today
  startHour.value = '00'
  startMin.value = '00'
  wakeHour.value = '00'
  wakeMin.value = '00'
  awakenings.value = 0
  error.value = ''
  result.value = null
}

const toneClass = computed(() => result.value?.grade?.tone ?? '')

const mergedHistory = computed(() => {
  return mergeMockAndSaved(sleepHistoryMock, savedHistory.value)
})

const trendPoints = computed(() => {
  // last 30 points for readability
  const list = mergedHistory.value
    .filter((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date ?? '')))
    .map((x) => ({
      date: String(x.date),
      score: Number(x.score),
      durationMin: Number(x.durationMin),
    }))
    .filter((x) => Number.isFinite(x.score) && Number.isFinite(x.durationMin))
    .sort((a, b) => a.date.localeCompare(b.date))
  return list.slice(Math.max(0, list.length - 30))
})

onMounted(() => {
  window.addEventListener('click', closeOnWindowClick, true)

  const saved = safeReadLocalHistory()
  savedHistory.value = saved ?? []

  // Defaults
  const today = toYmd(new Date())
  startDate.value = addDays(today, -1)
  wakeDate.value = today
  startHour.value = '00'
  startMin.value = '00'
  wakeHour.value = '00'
  wakeMin.value = '00'
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeOnWindowClick, true)
})
</script>

<template>
  <main class="page">
    <button class="back-btn" type="button" @click="router.push('/')" aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>

    <section class="card">
      <header class="top">
        <div class="badge sleep-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path
              d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5z"
            />
          </svg>
          Sleep
        </div>
        <h1 class="title">Sleep Assistant</h1>
        <p class="subtitle">Enter sleep/wake time and awakenings to get a sleep score and a focused improvement tip (grouped by sleep date).</p>
      </header>

      <div class="form">
        <div class="field">
          <span class="label">Sleep time</span>
          <div class="row3">
            <div class="unitSelect" :class="{ open: openMenu === 'startDate' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('startDate')" aria-haspopup="listbox" :aria-expanded="openMenu === 'startDate'">
                {{ startDate || 'Select date' }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Sleep date">
                <button
                  v-for="d in dateOptions"
                  :key="`sd-${d}`"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="startDate === d"
                  @click="
                    startDate = d;
                    closeMenus()
                  "
                >
                  {{ d }}
                </button>
              </div>
            </div>

            <div class="unitSelect" :class="{ open: openMenu === 'startHour' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('startHour')" aria-haspopup="listbox" :aria-expanded="openMenu === 'startHour'">
                {{ startHour }} h
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Sleep hour">
                <button
                  v-for="hh in hourOptions"
                  :key="`sh-${hh}`"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="startHour === hh"
                  @click="
                    startHour = hh;
                    closeMenus()
                  "
                >
                  {{ hh }}
                </button>
              </div>
            </div>

            <div class="unitSelect" :class="{ open: openMenu === 'startMin' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('startMin')" aria-haspopup="listbox" :aria-expanded="openMenu === 'startMin'">
                {{ startMin }} m
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Sleep minute">
                <button
                  v-for="mm in minuteOptions"
                  :key="`sm-${mm}`"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="startMin === mm"
                  @click="
                    startMin = mm;
                    closeMenus()
                  "
                >
                  {{ mm }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="field">
          <span class="label">Wake time</span>
          <div class="row3">
            <div class="unitSelect" :class="{ open: openMenu === 'wakeDate' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('wakeDate')" aria-haspopup="listbox" :aria-expanded="openMenu === 'wakeDate'">
                {{ wakeDate || 'Select date' }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Wake date">
                <button
                  v-for="d in dateOptions"
                  :key="`wd-${d}`"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="wakeDate === d"
                  @click="
                    wakeDate = d;
                    closeMenus()
                  "
                >
                  {{ d }}
                </button>
              </div>
            </div>

            <div class="unitSelect" :class="{ open: openMenu === 'wakeHour' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('wakeHour')" aria-haspopup="listbox" :aria-expanded="openMenu === 'wakeHour'">
                {{ wakeHour }} h
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Wake hour">
                <button
                  v-for="hh in hourOptions"
                  :key="`wh-${hh}`"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="wakeHour === hh"
                  @click="
                    wakeHour = hh;
                    closeMenus()
                  "
                >
                  {{ hh }}
                </button>
              </div>
            </div>

            <div class="unitSelect" :class="{ open: openMenu === 'wakeMin' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('wakeMin')" aria-haspopup="listbox" :aria-expanded="openMenu === 'wakeMin'">
                {{ wakeMin }} m
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Wake minute">
                <button
                  v-for="mm in minuteOptions"
                  :key="`wm-${mm}`"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="wakeMin === mm"
                  @click="
                    wakeMin = mm;
                    closeMenus()
                  "
                >
                  {{ mm }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="field">
          <span class="label">Night awakenings</span>
          <div class="unitSelect" :class="{ open: openMenu === 'awakenings' }" @click.stop @keydown.esc="closeMenus">
            <button class="unitBtn" type="button" @click="toggleMenu('awakenings')" aria-haspopup="listbox" :aria-expanded="openMenu === 'awakenings'">
              {{ awakenings }} time{{ awakenings === 1 ? '' : 's' }}
              <span class="chev" aria-hidden="true">▾</span>
            </button>
            <div class="unitMenu" role="listbox" aria-label="Night awakenings">
              <button
                v-for="n in awakeningOptions"
                :key="`aw-${n}`"
                class="unitOption"
                type="button"
                role="option"
                :aria-selected="awakenings === n"
                @click="
                  awakenings = n;
                  closeMenus()
                "
              >
                {{ n }} time{{ n === 1 ? '' : 's' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary" type="button" @click="calc">Generate score</button>
        <button class="btn ghost" type="button" @click="reset">Clear</button>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section v-if="result" class="result" aria-live="polite">
        <div class="metric">
          <span class="tag" :class="toneClass">Score: {{ result.score }} / 100 ({{ result.grade.label }})</span>
          <div class="metricLabel">Saved under (sleep date)</div>
          <div class="metricValue" :class="toneClass">{{ result.dateKey }}</div>
        </div>

        <div class="tagRow">
          <span class="tag subtle">Duration {{ result.durationMin }} min</span>
          <span class="tag subtle">Awakenings {{ awakenings }}</span>
          <span class="tag subtle">Focus area: {{ result.worst.label }}</span>
        </div>

        <p class="hint">{{ result.hint }}</p>
      </section>

      <section class="trend" aria-label="Sleep trend">
        <header class="trendTop">
          <div class="trendTitles">
            <div class="trendTitle">Sleep trend</div>
            <div class="trendSub">Bars: duration · Line: score (last 30 days)</div>
          </div>
        </header>

        <SleepTrendChart :points="trendPoints" :height="300" />
      </section>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  position: relative;
}

.back-btn {
  position: absolute;
  top: 24px;
  left: 24px;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--card);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.card {
  width: min(800px, 100%);
  border-radius: 28px;
  padding: 32px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(12px);
}

.top {
  text-align: left;
  margin-bottom: 18px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.3px;
}

.sleep-badge {
  background: rgba(167, 139, 250, 0.16);
  border: 1px solid rgba(167, 139, 250, 0.32);
  color: #ddd6fe;
}

.title {
  margin: 14px 0 8px;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.15;
  background: linear-gradient(135deg, #fff 30%, #ddd6fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 0;
  color: rgba(255, 255, 255, 0.65);
  font-size: 15px;
  line-height: 1.6;
}

.form {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.row3 {
  display: grid;
  grid-template-columns: 1.25fr 0.6fr 0.6fr;
  gap: 10px;
  align-items: center;
}

@media (max-width: 640px) {
  .row3 {
    grid-template-columns: 1fr;
  }
}

.field {
  display: grid;
  gap: 8px;
}

.label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 700;
}

/* Match BMI unit selector dropdown style */
.unitSelect {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 100%;
}

.unitBtn {
  height: 44px;
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 28, 0.55);
  color: rgba(255, 255, 255, 0.9);
  padding: 0 12px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  white-space: nowrap;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.unitBtn:hover {
  background: rgba(10, 16, 28, 0.62);
}

.unitBtn:focus-visible {
  outline: none;
  border-color: rgba(167, 139, 250, 0.65);
  box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.14);
}

.chev {
  opacity: 0.75;
  font-size: 12px;
  transform: translateY(-1px);
}

.unitMenu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 6px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 16, 28, 0.92);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 20;
  max-height: 280px;
  overflow: auto;
}

.unitSelect:hover .unitMenu,
.unitSelect:focus-within .unitMenu,
.unitSelect.open .unitMenu {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.unitOption {
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 12px;
  padding: 10px 10px;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-weight: 700;
  font-size: 13px;
}

.unitOption:hover {
  background: rgba(255, 255, 255, 0.08);
}

.unitOption[aria-selected='true'] {
  background: rgba(167, 139, 250, 0.16);
  border: 1px solid rgba(167, 139, 250, 0.24);
}

.actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  border: 0;
  border-radius: 14px;
  padding: 12px 16px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.2s ease;
}

.btn:active {
  transform: translateY(1px);
}

.primary {
  color: #0b1220;
  background: linear-gradient(135deg, #ddd6fe, #a78bfa, #8b5cf6);
  filter: saturate(1.08);
}

.primary:hover {
  filter: saturate(1.18);
}

.ghost {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--border);
}

.error {
  margin: 12px 0 0;
  color: #fca5a5;
  font-weight: 700;
}

.result {
  margin-top: 18px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.04);
}

.trend {
  margin-top: 16px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  text-align: left;
}

.trendTop {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.trendTitles {
  display: grid;
  gap: 2px;
}

.trendTitle {
  font-weight: 900;
  letter-spacing: -0.2px;
}

.trendSub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
}

.metricLabel {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 700;
}

.metricValue {
  margin-top: 6px;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0.3px;
}

.tagRow {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
  font-weight: 800;
  font-size: 12px;
}

.tag.subtle {
  color: rgba(255, 255, 255, 0.78);
  font-weight: 750;
}

.metricValue.ok {
  color: #86efac;
}
.metricValue.warn {
  color: #fde68a;
}
.metricValue.danger {
  color: #fca5a5;
}

.tag.ok {
  background: rgba(34, 197, 94, 0.14);
  border-color: rgba(34, 197, 94, 0.28);
  color: #86efac;
}
.tag.warn {
  background: rgba(251, 191, 36, 0.14);
  border-color: rgba(251, 191, 36, 0.26);
  color: #fde68a;
}
.tag.danger {
  background: rgba(248, 113, 113, 0.14);
  border-color: rgba(248, 113, 113, 0.26);
  color: #fca5a5;
}

.hint {
  margin: 12px 0 0;
  color: rgba(255, 255, 255, 0.78);
  line-height: 1.65;
  font-weight: 650;
}
</style>


