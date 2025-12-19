<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BmiTrendChart from '../components/BmiTrendChart.vue'
import { bmiHistoryMock } from '../mock/bmi'
import { parseNumber } from '../utils/number'
import { toKg, toM } from '../utils/units'
import { classifyBmi } from '../utils/bmi'

const router = useRouter()

const heightValue = ref('')
const weightValue = ref('')
const heightUnit = ref('cm') // 'cm' | 'm' | 'ft'
const weightUnit = ref('kg') // 'kg' | 'jin' | 'lb'
const openMenu = ref(null) // 'height' | 'weight' | null
const openTrendMenu = ref(false)

const result = ref(null) // { bmi: number, category: string, hint: string }
const error = ref('')

const heightUnitText = computed(() => ({ cm: 'centimeter', m: 'meter', ft: 'foot' }[heightUnit.value] ?? 'centimeter'))
const weightUnitText = computed(() => ({ kg: 'kilogram', jin: 'jin', lb: 'pound' }[weightUnit.value] ?? 'kilogram'))

const heightPlaceholder = computed(() => {
  if (heightUnit.value === 'm') return 'e.g. 1.70'
  if (heightUnit.value === 'ft') return 'e.g. 5.6'
  return 'e.g. 170'
})

const weightPlaceholder = computed(() => {
  if (weightUnit.value === 'jin') return 'e.g. 130'
  if (weightUnit.value === 'lb') return 'e.g. 143'
  return 'e.g. 65'
})

// parseNumber/toKg/toM/classifyBmi moved to src/utils for reuse + testing

const normalized = computed(() => {
  const hRaw = parseNumber(heightValue.value)
  const wRaw = parseNumber(weightValue.value)
  const hM = toM(hRaw, heightUnit.value)
  const wKg = toKg(wRaw, weightUnit.value)
  const hCm = hM * 100
  return { hRaw, wRaw, hM, hCm, wKg }
})

function toggleMenu(which) {
  openMenu.value = openMenu.value === which ? null : which
}

function closeMenus() {
  openMenu.value = null
}

function closeTrendMenu() {
  openTrendMenu.value = false
}

function toggleTrendMenu() {
  openTrendMenu.value = !openTrendMenu.value
}

function closeAllMenus() {
  closeMenus()
  closeTrendMenu()
}

function setHeightUnit(u) {
  heightUnit.value = u
  closeMenus()
  result.value = null
  error.value = ''
}

function setWeightUnit(u) {
  weightUnit.value = u
  closeMenus()
  result.value = null
  error.value = ''
}

const closeOnWindowClick = () => {
  closeAllMenus()
}

onMounted(() => {
  window.addEventListener('click', closeOnWindowClick, true)

  // Load local history (if any). Keep mock data as a baseline demo and let saved values override same dates.
  const saved = safeReadLocalHistory()
  if (saved) {
    const merged = mergeMockAndSaved(bmiHistoryMock, saved)
    history.value = merged
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeOnWindowClick, true)
})

function calc() {
  error.value = ''
  const { hM, hCm, wKg } = normalized.value

  if (!Number.isFinite(hM) || !Number.isFinite(wKg)) {
    error.value = `Please enter a valid height (${heightUnitText.value}) and weight (${weightUnitText.value}).`
    result.value = null
    return
  }
  if (hM <= 0 || wKg <= 0) {
    error.value = 'Height and weight must be greater than 0.'
    result.value = null
    return
  }
  if (hCm < 50 || hCm > 260) {
    error.value = 'Height range should be between 50 and 260 cm.'
    result.value = null
    return
  }
  if (wKg < 10 || wKg > 400) {
    error.value = 'Weight range should be between 10 and 400 kg.'
    result.value = null
    return
  }

  const bmi = wKg / (hM * hM)
  const rounded = Math.round(bmi * 10) / 10
  const { category, hint } = classifyBmi(rounded)
  result.value = { bmi: rounded, category, hint }

  // Update trend immediately (one value per day; same day overwrite)
  upsertBmiForToday(rounded)
}

function reset() {
  heightValue.value = ''
  weightValue.value = ''
  result.value = null
  error.value = ''
}

const toneClass = computed(() => {
  const c = result.value?.category
  if (!c) return ''
  if (c === 'Normal') return 'ok'
  if (c === 'Underweight' || c === 'Overweight') return 'warn'
  if (c === 'Severely underweight' || c === 'Obese') return 'danger'
  return 'warn'
})

// -----------------------
// Trend chart (mock data)
// -----------------------
const trendMode = ref('week') // 'week' | 'month'
const history = ref(bmiHistoryMock)

function parseYmd(dateStr) {
  // Force local midnight to reduce timezone issues
  return new Date(`${dateStr}T00:00:00`)
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toYmd(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

function weekStartYmd(dateStr) {
  const d = parseYmd(dateStr)
  const day = d.getDay() // 0 Sun .. 6 Sat
  const offset = (day + 6) % 7 // Monday=0
  const s = new Date(d)
  s.setDate(d.getDate() - offset)
  return toYmd(s)
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7) // YYYY-MM
}

const BMI_HISTORY_STORAGE_KEY = 'healthcare.bmiHistory.v1'

function safeReadLocalHistory() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(BMI_HISTORY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const cleaned = parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({ date: String(x.date ?? ''), bmi: Number(x.bmi) }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Number.isFinite(x.bmi))
      .sort((a, b) => a.date.localeCompare(b.date))

    return cleaned.length ? cleaned : null
  } catch {
    return null
  }
}

function safeWriteLocalHistory(list) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(BMI_HISTORY_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore quota / privacy mode
  }
}

function mergeMockAndSaved(mockList, savedList) {
  const map = new Map()
  for (const p of mockList ?? []) map.set(p.date, { date: p.date, bmi: p.bmi })
  for (const p of savedList ?? []) map.set(p.date, { date: p.date, bmi: p.bmi })
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function upsertBmiForDate(dateStr, bmiValue) {
  const next = Array.isArray(history.value) ? history.value.slice() : []
  const idx = next.findIndex((p) => p?.date === dateStr)
  if (idx >= 0) next[idx] = { ...next[idx], bmi: bmiValue }
  else next.push({ date: dateStr, bmi: bmiValue })
  next.sort((a, b) => a.date.localeCompare(b.date))
  history.value = next
  safeWriteLocalHistory(next)
}

function upsertBmiForToday(bmiValue) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  upsertBmiForDate(toYmd(now), bmiValue)
}

const availableWeeks = computed(() => {
  const map = new Map()
  for (const p of history.value) {
    const start = weekStartYmd(p.date)
    if (!map.has(start)) map.set(start, true)
  }
  const keys = Array.from(map.keys()).sort()
  return keys.map((start) => {
    const s = parseYmd(start)
    const e = new Date(s)
    e.setDate(s.getDate() + 6)
    return { key: start, label: `${start} ~ ${toYmd(e)}` }
  })
})

const availableMonths = computed(() => {
  const map = new Map()
  for (const p of history.value) {
    const k = monthKey(p.date)
    if (!map.has(k)) map.set(k, true)
  }
  return Array.from(map.keys()).sort().map((k) => ({ key: k, label: k }))
})

const selectedWeek = ref('')
const selectedMonth = ref('')

function initTrendDefaults() {
  const w = availableWeeks.value
  const m = availableMonths.value
  if (w.length) {
    const exists = w.some((x) => x.key === selectedWeek.value)
    if (!selectedWeek.value || !exists) selectedWeek.value = w[w.length - 1].key
  }
  if (m.length) {
    const exists = m.some((x) => x.key === selectedMonth.value)
    if (!selectedMonth.value || !exists) selectedMonth.value = m[m.length - 1].key
  }
}

initTrendDefaults()

watch([availableWeeks, availableMonths], initTrendDefaults)

const trendSelectionLabel = computed(() => {
  if (trendMode.value === 'month') {
    const key = selectedMonth.value
    const found = availableMonths.value.find((m) => m.key === key)
    return found?.label ?? key ?? 'Select month'
  }
  const key = selectedWeek.value
  const found = availableWeeks.value.find((w) => w.key === key)
  return found?.label ?? key ?? 'Select week'
})

function setTrendSelection(key) {
  if (trendMode.value === 'month') {
    selectedMonth.value = key
  } else {
    selectedWeek.value = key
  }
  closeTrendMenu()
}

const trendPoints = computed(() => {
  if (trendMode.value === 'month') {
    const key = selectedMonth.value
    return history.value.filter((p) => monthKey(p.date) === key)
  }

  const start = selectedWeek.value
  const s = parseYmd(start)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  const startStr = toYmd(s)
  const endStr = toYmd(e)
  return history.value.filter((p) => p.date >= startStr && p.date <= endStr)
})
</script>

<template>
  <main class="page">
    <button class="back-btn" type="button" @click="router.push('/')">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>

    <section class="card">
      <header class="top">
        <div class="titles">
          <h1 class="title">BMI Calculator</h1>
          <p class="subtitle">BMI = weight(kg) ÷ height(m)²</p>
        </div>
      </header>

      <div class="form">
        <label class="field">
          <span class="label">height（{{ heightUnitText }}）</span>
          <div class="inputRow">
            <input
              v-model.trim="heightValue"
              class="input"
              inputmode="decimal"
              autocomplete="off"
              :placeholder="heightPlaceholder"
            />
            <div class="unitSelect" :class="{ open: openMenu === 'height' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('height')" aria-haspopup="listbox" :aria-expanded="openMenu === 'height'">
                {{ heightUnitText }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Height unit">
                <button class="unitOption" type="button" role="option" :aria-selected="heightUnit === 'cm'" @click="setHeightUnit('cm')">
                  centimeter（cm）
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="heightUnit === 'm'" @click="setHeightUnit('m')">
                  meter（m）
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="heightUnit === 'ft'" @click="setHeightUnit('ft')">
                  foot（ft）
                </button>
              </div>
            </div>
          </div>
        </label>

        <label class="field">
          <span class="label">weight（{{ weightUnitText }}）</span>
          <div class="inputRow">
            <input
              v-model.trim="weightValue"
              class="input"
              inputmode="decimal"
              autocomplete="off"
              :placeholder="weightPlaceholder"
            />
            <div class="unitSelect" :class="{ open: openMenu === 'weight' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('weight')" aria-haspopup="listbox" :aria-expanded="openMenu === 'weight'">
                {{ weightUnitText }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Weight unit">
                <button class="unitOption" type="button" role="option" :aria-selected="weightUnit === 'kg'" @click="setWeightUnit('kg')">
                  kilogram（kg）
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="weightUnit === 'jin'" @click="setWeightUnit('jin')">
                  jin
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="weightUnit === 'lb'" @click="setWeightUnit('lb')">
                  pound（lb）
                </button>
              </div>
            </div>
          </div>
        </label>
      </div>

      <div class="actions">
        <button class="btn primary" type="button" @click="calc">calculate BMI</button>
        <button class="btn ghost" type="button" @click="reset">clear</button>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section v-if="result" class="result" aria-live="polite">
        <div class="metric">
          <span class="tag" :class="toneClass">Result: {{ result.category }}</span>
          <div class="metricLabel">Your BMI</div>
          <div class="metricValue" :class="toneClass">{{ result.bmi }}</div>
        </div>
        <div class="tagRow">
          <span class="tag subtle">Reference: 18.5 / 24 / 28</span>
        </div>
        <p class="hint">{{ result.hint }}</p>
      </section>

      <section class="trend" aria-label="BMI trend">
        <header class="trendTop">
          <div class="trendTitles">
            <div class="trendTitle">BMI Trend</div>
            <div class="trendSub">Daily history · switch Week/Month to see the trend</div>
          </div>

          <div class="trendControls">
            <div class="seg">
              <button class="segBtn" :class="{ active: trendMode === 'week' }" type="button" @click="trendMode = 'week'">Week</button>
              <button class="segBtn" :class="{ active: trendMode === 'month' }" type="button" @click="trendMode = 'month'">Month</button>
            </div>

            <div class="unitSelect" :class="{ open: openTrendMenu }" @click.stop @keydown.esc="closeAllMenus">
              <button class="unitBtn" type="button" @click="toggleTrendMenu" aria-haspopup="listbox" :aria-expanded="openTrendMenu">
                {{ trendSelectionLabel }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>

              <div
                v-if="trendMode === 'week'"
                class="unitMenu"
                role="listbox"
                aria-label="Select week"
              >
                <button
                  v-for="w in availableWeeks"
                  :key="w.key"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="selectedWeek === w.key"
                  @click="setTrendSelection(w.key)"
                >
                  {{ w.label }}
                </button>
              </div>

              <div
                v-else
                class="unitMenu"
                role="listbox"
                aria-label="Select month"
              >
                <button
                  v-for="m in availableMonths"
                  :key="m.key"
                  class="unitOption"
                  type="button"
                  role="option"
                  :aria-selected="selectedMonth === m.key"
                  @click="setTrendSelection(m.key)"
                >
                  {{ m.label }}
                </button>
              </div>
            </div>
          </div>
        </header>

        <BmiTrendChart :points="trendPoints" :height="220" />
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
  z-index: 30;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.card {
  width: min(780px, 100%);
  border-radius: 22px;
  padding: 22px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}

.top {
  margin-bottom: 18px;
  text-align: left;
  padding-right: 4px;
}

.titles {
  text-align: left;
}

.title {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
}

.subtitle {
  margin: 6px 0 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 640px) {
  .form {
    grid-template-columns: 1fr;
  }
}

.field {
  display: grid;
  gap: 8px;
  text-align: left;
}

.inputRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}

.input {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 28, 0.55);
  color: rgba(255, 255, 255, 0.92);
  padding: 12px 12px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input:focus {
  border-color: rgba(124, 247, 212, 0.65);
  box-shadow: 0 0 0 4px rgba(124, 247, 212, 0.12);
}

.unitSelect {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.unitBtn {
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 28, 0.55);
  color: rgba(255, 255, 255, 0.9);
  padding: 0 12px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.unitBtn:hover {
  background: rgba(10, 16, 28, 0.62);
}

.unitBtn:focus-visible {
  outline: none;
  border-color: rgba(124, 247, 212, 0.65);
  box-shadow: 0 0 0 4px rgba(124, 247, 212, 0.12);
}

.chev {
  opacity: 0.75;
  font-size: 12px;
  transform: translateY(-1px);
}

.unitMenu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 170px;
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
  font-weight: 650;
  font-size: 13px;
}

.unitOption:hover {
  background: rgba(255, 255, 255, 0.08);
}

.unitOption[aria-selected='true'] {
  background: rgba(124, 247, 212, 0.14);
  border: 1px solid rgba(124, 247, 212, 0.22);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.btn {
  border: 0;
  border-radius: 14px;
  padding: 11px 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, filter 0.2s ease, background 0.2s ease;
}

.btn:active {
  transform: translateY(1px);
}

.primary {
  color: #0b1220;
  background: linear-gradient(135deg, #6ee7b7, #34d399, #22c55e);
  filter: saturate(1.08);
}

.primary:hover {
  filter: saturate(1.18);
}

.ghost {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.ghost:hover {
  background: rgba(255, 255, 255, 0.11);
}

.error {
  margin: 12px 0 0;
  color: rgba(255, 153, 153, 0.95);
  text-align: left;
  font-size: 13px;
}

.result {
  margin-top: 16px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  text-align: left;
}

.metric {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 10px 12px;
}

.metricLabel {
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
}

.metricValue {
  font-size: 44px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.5px;
}

.metricValue.ok {
  color: rgba(124, 247, 212, 0.98);
}

.metricValue.warn {
  color: rgba(255, 193, 92, 0.98);
}

.metricValue.danger {
  color: rgba(255, 107, 107, 0.98);
}

.tagRow {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.tag.ok {
  background: rgba(124, 247, 212, 0.16);
  border-color: rgba(124, 247, 212, 0.26);
}

.tag.warn {
  background: rgba(255, 193, 92, 0.16);
  border-color: rgba(255, 193, 92, 0.28);
}

.tag.danger {
  background: rgba(255, 107, 107, 0.18);
  border-color: rgba(255, 107, 107, 0.30);
}

.subtle {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.72);
}

.hint {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 1.7;
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

.trendControls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.seg {
  display: inline-flex;
  padding: 4px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.10);
}

.segBtn {
  border: 0;
  padding: 8px 10px;
  border-radius: 11px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-weight: 800;
  cursor: pointer;
}

.segBtn.active {
  background: rgba(110, 231, 183, 0.16);
  border: 1px solid rgba(110, 231, 183, 0.22);
  color: rgba(255, 255, 255, 0.92);
}

.select {
  height: 40px;
  border-radius: 12px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 28, 0.55);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
}

.select:focus {
  border-color: rgba(110, 231, 183, 0.60);
  box-shadow: 0 0 0 4px rgba(110, 231, 183, 0.10);
}
</style>


