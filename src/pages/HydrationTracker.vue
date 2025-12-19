<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getHydrationMonth, listAvailableMonths } from '../mock/hydration'

const router = useRouter()

// ===== Demo mode (mock data only) =====
// 状态管理（当天面板）
const currentIntake = ref(0)
const dailyGoal = ref(2000)
const perDrink = ref(250)

// 月热力图选择与数据
const available = listAvailableMonths()
const now = new Date()
const YEAR_MIN = 2016
const YEAR_MAX = 2025
const selectableYears = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i)
const clampYear = (y) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, y))
const selectedYear = ref(clampYear(available.at(-1)?.year ?? now.getFullYear()))
const selectedMonth = ref(available.at(-1)?.month ?? now.getMonth() + 1)
const monthDays = ref([]) // [{ day:'YYYY-MM-DD', goalMl, intakeMl }]

// Local storage (hydration check-in + settings)
const HYDRATION_DAILY_STORAGE_KEY = 'healthcare.hydrationDaily.v1'
const HYDRATION_SETTINGS_STORAGE_KEY = 'healthcare.hydrationSettings.v1'
const savedDaily = ref([]) // [{ day:'YYYY-MM-DD', goalMl, intakeMl }]
const settings = ref({ defaultGoalMl: 2000, perDrinkMl: 250 })

// Heatmap dropdown (match BMI unit selector)
const openHeatmapMenu = ref(null) // 'year' | 'month' | null

// 设置面板状态
const showSettings = ref(false)
const tempGoal = ref(2000)
const tempPerDrink = ref(250)

// 计算百分比
const percentage = computed(() => {
  const pct = Math.round((currentIntake.value / dailyGoal.value) * 100)
  return Math.min(pct, 100) // 最大100%
})

function pad2(n) {
  return String(n).padStart(2, '0')
}

function ymd(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`
}

function safeReadLocalDaily() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(HYDRATION_DAILY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const cleaned = parsed
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        day: String(x.day ?? ''),
        goalMl: Number(x.goalMl ?? 2000),
        intakeMl: Number(x.intakeMl ?? 0),
      }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day) && Number.isFinite(x.goalMl) && Number.isFinite(x.intakeMl))
      .sort((a, b) => a.day.localeCompare(b.day))

    return cleaned.length ? cleaned : null
  } catch {
    return null
  }
}

function safeWriteLocalDaily(list) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HYDRATION_DAILY_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore quota / privacy mode
  }
}

function safeReadLocalSettings() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(HYDRATION_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const goal = Number(parsed.defaultGoalMl)
    const per = Number(parsed.perDrinkMl)
    const next = {
      defaultGoalMl: Number.isFinite(goal) && goal > 0 ? goal : 2000,
      perDrinkMl: Number.isFinite(per) && per > 0 ? per : 250,
    }
    return next
  } catch {
    return null
  }
}

function safeWriteLocalSettings(next) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HYDRATION_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota / privacy mode
  }
}

function loadMonth() {
  const data = getHydrationMonth(selectedYear.value, selectedMonth.value)
  const mock = (data.days ?? []).map((x) => ({
    day: String(x.day),
    goalMl: Number(x.goalMl ?? 2000),
    intakeMl: Number(x.intakeMl ?? 0),
  }))

  // Merge: mock as baseline demo, savedDaily overrides same dates (similar to BMI page)
  const map = new Map()
  for (const r of mock) map.set(r.day, r)
  for (const r of savedDaily.value) {
    if (r.day.startsWith(`${selectedYear.value}-${pad2(selectedMonth.value)}`)) {
      map.set(r.day, { ...map.get(r.day), ...r })
    }
  }
  monthDays.value = Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day))

  // 初始化当天面板：如果当月含今天记录，则用其值；否则用默认值
  const today = ymd(new Date())
  const todayRec = monthDays.value.find((x) => x.day === today) || savedDaily.value.find((x) => x.day === today)
  if (todayRec && today.startsWith(`${selectedYear.value}-${pad2(selectedMonth.value)}`)) {
    dailyGoal.value = Math.max(1, todayRec.goalMl || 2000)
    currentIntake.value = Math.max(0, todayRec.intakeMl || 0)
  } else {
    dailyGoal.value = settings.value.defaultGoalMl || 2000
    currentIntake.value = currentIntake.value || 0
  }
}

function upsertSavedDaily(dayStr, patch) {
  const day = String(dayStr)
  const goalMl = Number(patch.goalMl ?? settings.value.defaultGoalMl ?? 2000)
  const intakeMl = Number(patch.intakeMl ?? 0)

  const next = Array.isArray(savedDaily.value) ? savedDaily.value.slice() : []
  const idx = next.findIndex((x) => x.day === day)

  // If intake is 0, treat as "no check-in": remove the saved record to fall back to gray
  if (!Number.isFinite(intakeMl) || intakeMl <= 0) {
    if (idx >= 0) next.splice(idx, 1)
    savedDaily.value = next
    safeWriteLocalDaily(next)
    return
  }

  const rec = { day, goalMl: Math.max(1, goalMl), intakeMl: Math.max(0, intakeMl) }
  if (idx >= 0) next[idx] = { ...next[idx], ...rec }
  else next.push(rec)
  next.sort((a, b) => a.day.localeCompare(b.day))
  savedDaily.value = next
  safeWriteLocalDaily(next)
}

function upsertDayRecord(dayStr, patch) {
  const idx = monthDays.value.findIndex((x) => x.day === dayStr)
  if (idx === -1) {
    monthDays.value.push({
      day: dayStr,
      goalMl: patch.goalMl ?? 2000,
      intakeMl: patch.intakeMl ?? 0,
    })
  } else {
    monthDays.value[idx] = { ...monthDays.value[idx], ...patch }
  }

  // Persist to local storage as well (so refresh keeps the check-in)
  upsertSavedDaily(dayStr, patch)
}

function dayStatus(goalMl, intakeMl) {
  const goal = Math.max(1, Number(goalMl ?? 2000))
  const intake = Math.max(0, Number(intakeMl ?? 0))
  if (intake <= 0) return 'none' // gray
  if (intake >= goal) return 'done' // deep blue + check
  if (intake * 2 < goal) return 'low' // <50% light blue
  return 'mid' // >=50% && <100% deep blue
}

function dayPercentage(goalMl, intakeMl) {
  const goal = Math.max(1, Number(goalMl ?? 2000))
  const intake = Math.max(0, Number(intakeMl ?? 0))
  return Math.min(100, Math.round((intake * 100) / goal))
}

function cellTooltip(c) {
  if (!c?.inMonth) return ''
  // No check-in
  if (c.status === 'none') return `${c.dateStr} • No check-in`
  // Checked-in
  return `${c.dateStr} • Goal ${c.goalMl}ml • Intake ${c.intakeMl}ml • ${c.pct}%`
}

const heatmapYearMonthKey = computed(
  () => `${selectedYear.value}-${pad2(selectedMonth.value)}`
)

const recordsByDay = computed(() => {
  const m = new Map()
  for (const r of monthDays.value) {
    m.set(r.day, r)
  }
  return m
})

const monthGrid = computed(() => {
  const y = selectedYear.value
  const m = selectedMonth.value
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  const daysInMonth = last.getDate()

  // Monday-first
  const jsDay = first.getDay() // 0 Sun ... 6 Sat
  const mondayFirstOffset = (jsDay + 6) % 7 // Mon=0 ... Sun=6

  const totalCells = Math.ceil((mondayFirstOffset + daysInMonth) / 7) * 7
  const cells = []

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - mondayFirstOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ inMonth: false, day: null })
      continue
    }
    const dateStr = `${y}-${pad2(m)}-${pad2(dayNum)}`
    const rec = recordsByDay.value.get(dateStr)
    const goalMl = rec?.goalMl ?? 2000
    const intakeMl = rec?.intakeMl ?? 0
    const status = dayStatus(goalMl, intakeMl)
    const pct = dayPercentage(goalMl, intakeMl)
    cells.push({
      inMonth: true,
      day: dayNum,
      dateStr,
      goalMl,
      intakeMl,
      pct,
      status,
    })
  }
  return { offset: mondayFirstOffset, daysInMonth, cells }
})

// Heatmap tooltip (match BMI chart tooltip style)
const heatmapGridRef = ref(null)
const heatmapHoverCell = ref(null)
const heatmapTooltip = ref({ x: 0, y: 0, show: false, flip: false })

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function updateHeatmapTooltipPos(e) {
  const el = heatmapGridRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  // keep within container a bit so it doesn't clip too easily
  const px = clamp(x, 24, rect.width - 24)
  const py = clamp(y, 24, rect.height - 24)

  heatmapTooltip.value = {
    x: px,
    y: py,
    show: true,
    flip: py < 52,
  }
}

function onHeatmapCellEnter(c, e) {
  if (!c?.inMonth) return
  heatmapHoverCell.value = c
  updateHeatmapTooltipPos(e)
}

function onHeatmapMove(e) {
  if (!heatmapTooltip.value.show) return
  updateHeatmapTooltipPos(e)
}

function onHeatmapLeave() {
  heatmapHoverCell.value = null
  heatmapTooltip.value = { x: 0, y: 0, show: false, flip: false }
}

const heatmapTooltipText = computed(() => {
  const c = heatmapHoverCell.value
  if (!c?.inMonth) return null
  if (c.status === 'none') {
    return { date: c.dateStr, value: 'No check-in' }
  }
  return {
    date: c.dateStr,
    value: `Goal ${c.goalMl}ml · Intake ${c.intakeMl}ml · ${c.pct}%`,
  }
})

// 喝水操作（仅更新本地假数据 + UI）
function drink() {
  currentIntake.value = Math.min(currentIntake.value + perDrink.value, dailyGoal.value)
  const today = ymd(new Date())
  // Always persist today; if viewing the same month, the grid updates immediately
  upsertSavedDaily(today, { goalMl: dailyGoal.value, intakeMl: currentIntake.value })
  if (today.startsWith(heatmapYearMonthKey.value)) upsertDayRecord(today, { goalMl: dailyGoal.value, intakeMl: currentIntake.value })
}

// 打开设置
function openSettings() {
  tempGoal.value = dailyGoal.value
  tempPerDrink.value = perDrink.value
  showSettings.value = true
}

// 保存设置
function saveSettings() {
  dailyGoal.value = Math.max(1, tempGoal.value)
  perDrink.value = Math.max(50, tempPerDrink.value)
  currentIntake.value = Math.min(currentIntake.value, dailyGoal.value)
  showSettings.value = false

  // Persist defaults
  settings.value = { defaultGoalMl: dailyGoal.value, perDrinkMl: perDrink.value }
  safeWriteLocalSettings(settings.value)

  const today = ymd(new Date())
  upsertSavedDaily(today, { goalMl: dailyGoal.value, intakeMl: currentIntake.value })
  if (today.startsWith(heatmapYearMonthKey.value)) upsertDayRecord(today, { goalMl: dailyGoal.value, intakeMl: currentIntake.value })
}

// 重置进度
function resetProgress() {
  currentIntake.value = 0
  const today = ymd(new Date())
  // reset => remove saved record => gray
  upsertSavedDaily(today, { goalMl: dailyGoal.value, intakeMl: 0 })
  if (today.startsWith(heatmapYearMonthKey.value)) upsertDayRecord(today, { goalMl: dailyGoal.value, intakeMl: 0 })
}

// 返回首页
function goBack() {
  router.push('/')
}

onMounted(() => {
  // Load local storage overrides
  const s = safeReadLocalSettings()
  if (s) settings.value = s
  dailyGoal.value = settings.value.defaultGoalMl
  perDrink.value = settings.value.perDrinkMl

  const saved = safeReadLocalDaily()
  if (saved) savedDaily.value = saved

  loadMonth()

  window.addEventListener('click', closeHeatmapMenus, true)
})

watch([selectedYear, selectedMonth], () => {
  loadMonth()
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeHeatmapMenus, true)
})

function toggleHeatmapMenu(which) {
  openHeatmapMenu.value = openHeatmapMenu.value === which ? null : which
}

function closeHeatmapMenus() {
  openHeatmapMenu.value = null
}

function setHeatmapYear(y) {
  selectedYear.value = y
  closeHeatmapMenus()
}

function setHeatmapMonth(m) {
  selectedMonth.value = m
  closeHeatmapMenus()
}
</script>

<template>
  <main class="page">
    <!-- 返回按钮 -->
    <button class="back-btn" @click="goBack">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>

    <section class="card">
      <header class="card-header">
        <div class="badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
          </svg>
          Hydration Tracker
        </div>
        <h1 class="title">Hydration Tracker</h1>
        <p class="subtitle">Stay hydrated. Hit your daily goal of {{ dailyGoal }}ml.</p>
      </header>

      <div class="tracker-container">
        <!-- 左侧控制区 -->
        <div class="control-section">
          <button class="drink-btn" @click="drink" :disabled="percentage >= 100">
            <svg class="drop-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            <span class="drink-text">Drink</span>
            <span class="drink-amount">+{{ perDrink }}ml</span>
          </button>

          <div class="sub-controls">
            <button class="icon-btn" @click="openSettings" title="Settings">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button class="icon-btn reset" @click="resetProgress" title="Reset">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
          </div>

          <div class="stats">
            <div class="stat-item">
              <span class="stat-label">Intake</span>
              <span class="stat-value">{{ currentIntake }}<small>ml</small></span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Goal</span>
              <span class="stat-value">{{ dailyGoal }}<small>ml</small></span>
            </div>
          </div>
        </div>

        <!-- 右侧水杯可视化区 -->
        <div class="glass-section">
          <div
            class="glass"
            :style="{
              '--water-level': percentage + '%',
              '--wave-opacity': percentage === 0 ? 0 : 1,
            }"
          >
            <div class="water"></div>
            <!-- 波浪放在glass层，跟随水位移动 -->
            <div class="wave-container">
              <div class="wave"></div>
            </div>
            <div class="percentage">{{ percentage }}%</div>
            <!-- 刻度线 -->
            <div class="markers">
              <span class="marker" style="--pos: 100%">100%</span>
              <span class="marker" style="--pos: 75%">75%</span>
              <span class="marker" style="--pos: 50%">50%</span>
              <span class="marker" style="--pos: 25%">25%</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Monthly heatmap (2nd card, same background as the first card) -->
    <section class="card heatmap-card">
      <section class="heatmap">
        <div class="heatmap-top">
          <div class="heatmap-title">
            <div class="heatmap-label">Monthly check-in</div>
            <div class="heatmap-sub">Each cell is a day. Color reflects progress.</div>
          </div>

          <div class="heatmap-controls">
            <div class="heatmapSelect">
              <span class="select-label">Year</span>
              <div class="unitSelect" :class="{ open: openHeatmapMenu === 'year' }" @click.stop>
                <button
                  class="unitBtn"
                  type="button"
                  @click="toggleHeatmapMenu('year')"
                  aria-haspopup="listbox"
                  :aria-expanded="openHeatmapMenu === 'year'"
                >
                  {{ selectedYear }}
                  <span class="chev" aria-hidden="true">▾</span>
                </button>
                <div class="unitMenu" role="listbox" aria-label="Year">
                  <button
                    v-for="y in selectableYears"
                    :key="`year-${y}`"
                    class="unitOption"
                    type="button"
                    role="option"
                    :aria-selected="selectedYear === y"
                    @click="setHeatmapYear(y)"
                  >
                    {{ y }}
                  </button>
                </div>
              </div>
            </div>

            <div class="heatmapSelect">
              <span class="select-label">Month</span>
              <div class="unitSelect" :class="{ open: openHeatmapMenu === 'month' }" @click.stop>
                <button
                  class="unitBtn"
                  type="button"
                  @click="toggleHeatmapMenu('month')"
                  aria-haspopup="listbox"
                  :aria-expanded="openHeatmapMenu === 'month'"
                >
                  {{ String(selectedMonth).padStart(2, '0') }}
                  <span class="chev" aria-hidden="true">▾</span>
                </button>
                <div class="unitMenu" role="listbox" aria-label="Month">
                  <button
                    v-for="m in 12"
                    :key="`month-${m}`"
                    class="unitOption"
                    type="button"
                    role="option"
                    :aria-selected="selectedMonth === m"
                    @click="setHeatmapMonth(m)"
                  >
                    {{ String(m).padStart(2, '0') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dow">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>

        <div
          ref="heatmapGridRef"
          class="grid"
          role="grid"
          :aria-label="`Hydration heatmap ${selectedYear}-${String(selectedMonth).padStart(2,'0')}`"
          @mousemove="onHeatmapMove"
          @mouseleave="onHeatmapLeave"
        >
          <button
            v-for="(c, idx) in monthGrid.cells"
            :key="idx"
            class="cell"
            :class="[
              c.inMonth ? 'in' : 'out',
              c.inMonth ? `s-${c.status}` : '',
            ]"
            type="button"
            :disabled="!c.inMonth"
            @mouseenter="onHeatmapCellEnter(c, $event)"
          >
            <span v-if="c.inMonth" class="day">{{ c.day }}</span>
            <span v-if="c.inMonth && c.status === 'done'" class="check" aria-hidden="true">✓</span>
          </button>

          <!-- custom tooltip (same style as BMI chart tooltip) -->
          <div
            v-if="heatmapTooltip.show && heatmapTooltipText"
            class="hmTooltip"
            :class="{ flip: heatmapTooltip.flip }"
            :style="{ left: heatmapTooltip.x + 'px', top: heatmapTooltip.y + 'px' }"
          >
            <div class="ttDate">{{ heatmapTooltipText.date }}</div>
            <div class="ttVal">{{ heatmapTooltipText.value }}</div>
          </div>
        </div>

        <div class="legend">
          <span class="lg"><i class="dot none"></i> No check-in</span>
          <span class="lg"><i class="dot low"></i> &lt; 50%</span>
          <span class="lg"><i class="dot mid"></i> 50–99%</span>
          <span class="lg"><i class="dot done"></i> 100% ✓</span>
        </div>
      </section>
    </section>

    <!-- 完成提示：放在卡片外，避免撑开卡片高度 -->
    <Transition name="toast">
      <div v-if="percentage >= 100" class="completion-toast" role="status" aria-live="polite">
        🎉 Congrats! You’ve hit your hydration goal for today.
      </div>
    </Transition>

    <!-- 设置弹窗 -->
    <Transition name="modal">
      <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
        <div class="modal">
          <h2 class="modal-title">Settings</h2>
          
          <div class="form-group">
            <label>Daily goal (ml)</label>
            <input type="number" v-model.number="tempGoal" min="500" max="5000" step="100" />
          </div>
          
          <div class="form-group">
            <label>Per drink (ml)</label>
            <input type="number" v-model.number="tempPerDrink" min="50" max="500" step="50" />
          </div>

          <div class="modal-actions">
            <button class="btn secondary" @click="showSettings = false">Cancel</button>
            <button class="btn primary" @click="saveSettings">Save</button>
          </div>
        </div>
      </div>
    </Transition>
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

.card-header {
  text-align: left;
  margin-bottom: 28px;
}

.heatmap-card {
  margin-top: 22px;
  position: relative;
  overflow: hidden;
  /* Continue the darker tone from the bottom of the first card */
  background:
    linear-gradient(
      180deg,
      rgba(6, 10, 18, 0.38) 0%,
      rgba(6, 10, 18, 0.18) 35%,
      rgba(6, 10, 18, 0.06) 100%
    ),
    var(--card);
}

.heatmap-card::after {
  content: '';
  position: absolute;
  inset: 0;
  /* very subtle top highlight to keep glass feel, without becoming "lighter" than card 1 bottom */
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 28%);
  pointer-events: none;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #7dd3fc;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.3px;
}

.title {
  margin: 16px 0 8px;
  font-size: clamp(28px, 4vw, 38px);
  line-height: 1.15;
  background: linear-gradient(135deg, #fff 30%, #7dd3fc);
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

.tracker-container {
  display: flex;
  gap: 40px;
  align-items: center;
  justify-content: space-between;
}

/* Heatmap */
.heatmap {
  margin-top: 0;
  padding-top: 0;
}

.heatmap-top {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.heatmap-label {
  font-weight: 800;
  letter-spacing: 0.2px;
}

.heatmap-sub {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.heatmap-controls {
  display: flex;
  gap: 12px;
  align-items: end;
}

.heatmapSelect {
  display: grid;
  gap: 6px;
}

.select-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 650;
}

/* Match BMI unit selector dropdown style */
.unitSelect {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.unitBtn {
  height: 40px;
  border-radius: 12px;
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
  min-width: 160px;
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

.dow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  margin: 12px 0 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 650;
}

.dow span {
  text-align: center;
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  position: relative;
}

.hmTooltip {
  position: absolute;
  transform: translate(-50%, -120%);
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(10, 16, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  color: rgba(255, 255, 255, 0.92);
  min-width: 150px;
  z-index: 30;
  backdrop-filter: blur(10px);
}

.hmTooltip.flip {
  transform: translate(-50%, 18px);
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

.cell {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: transform 120ms ease, filter 160ms ease, border-color 160ms ease;
}

.cell:disabled {
  cursor: default;
  opacity: 0.35;
}

.cell.in:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.22);
  filter: brightness(1.08);
}

.cell .day {
  position: absolute;
  top: 6px;
  left: 7px;
  font-size: 12px;
  font-weight: 750;
  opacity: 0.92;
}

.cell .check {
  position: absolute;
  right: 7px;
  bottom: 6px;
  font-size: 14px;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}

/* Status colors */
.cell.s-none {
  background: rgba(255, 255, 255, 0.06);
}

.cell.s-low {
  background: rgba(56, 189, 248, 0.18);
  border-color: rgba(56, 189, 248, 0.28);
}

.cell.s-mid {
  background: rgba(14, 165, 233, 0.30);
  border-color: rgba(14, 165, 233, 0.40);
}

.cell.s-done {
  background: rgba(2, 132, 199, 0.42);
  border-color: rgba(125, 211, 252, 0.38);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.70);
}

.lg {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.dot.none { background: rgba(255, 255, 255, 0.06); }
.dot.low { background: rgba(56, 189, 248, 0.18); border-color: rgba(56, 189, 248, 0.28); }
.dot.mid { background: rgba(14, 165, 233, 0.30); border-color: rgba(14, 165, 233, 0.40); }
.dot.done { background: rgba(2, 132, 199, 0.42); border-color: rgba(125, 211, 252, 0.38); }

/* 左侧控制区 */
.control-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
}

.drink-btn {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(145deg, #0ea5e9, #0284c7, #0369a1);
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-shadow: 
    0 8px 32px rgba(14, 165, 233, 0.4),
    inset 0 2px 0 rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.drink-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), transparent 60%);
  pointer-events: none;
}

.drink-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 
    0 12px 40px rgba(14, 165, 233, 0.5),
    inset 0 2px 0 rgba(255, 255, 255, 0.2);
}

.drink-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.drink-btn:disabled {
  background: linear-gradient(145deg, #22c55e, #16a34a, #15803d);
  box-shadow: 
    0 8px 32px rgba(34, 197, 94, 0.4),
    inset 0 2px 0 rgba(255, 255, 255, 0.2);
  cursor: default;
}

.drop-icon {
  width: 48px;
  height: 48px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

.drink-text {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 1px;
}

.drink-amount {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
}

.sub-controls {
  display: flex;
  gap: 12px;
}

.icon-btn {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s ease;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
}

.icon-btn.reset:hover {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.4);
}

.stats {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}

.stat-value small {
  font-size: 14px;
  font-weight: 500;
  opacity: 0.6;
  margin-left: 2px;
}


.glass-section {
  flex-shrink: 0;
}

.glass {
  width: 140px;
  height: 280px;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 0 0 30px 30px;
  position: relative;
  overflow: hidden;
  box-shadow: 
    inset 0 0 30px rgba(0, 0, 0, 0.2),
    0 10px 40px rgba(0, 0, 0, 0.3);
}

.glass::before {
  content: '';
  position: absolute;
  top: 0;
  left: 8px;
  width: 20px;
  height: 100%;
  background: linear-gradient(90deg, rgba(255,255,255,0.1), transparent);
  border-radius: 10px;
  pointer-events: none;
  z-index: 10;
}

.water {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--water-level);
  background: linear-gradient(180deg, #38bdf8 0%, #0ea5e9 50%, #0284c7 100%);
  transition: height 1s cubic-bezier(0.4, 0, 0.2, 1);
}

.wave-container {
  --wave-band: 28px;
  position: absolute;
  left: 0;
  right: 0;
  bottom: clamp(0px, calc(var(--water-level) - (var(--wave-band) / 2)), calc(100% - var(--wave-band)));
  height: var(--wave-band);
  overflow: hidden;
  transition: bottom 1s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  opacity: var(--wave-opacity, 1);
}

.wave {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 260px;
  height: 260px;
  margin-left: -130px;
  margin-top: -130px;
  background: transparent;
}

.wave::before {
  content: '';
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: rgba(56, 189, 248, 0.55);
  border-radius: 40%;
  animation: wave 4.5s linear infinite;
}

.wave::after {
  content: '';
  position: absolute;
  inset: 10px;
  background: rgba(14, 165, 233, 0.35);
  border-radius: 42%;
  animation: wave 6.5s linear infinite reverse;
}

@keyframes wave {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.percentage {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 32px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  z-index: 20;
}

.markers {
  position: absolute;
  top: 0;
  right: 8px;
  bottom: 0;
  width: 40px;
  z-index: 5;
}

.marker {
  position: absolute;
  bottom: var(--pos);
  right: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  transform: translateY(50%);
}

.marker::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  width: 8px;
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin-right: 4px;
}

/* 完成提示 */
.completion-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  width: min(800px, calc(100% - 48px));
  padding: 14px 18px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(16, 185, 129, 0.16));
  border: 1px solid rgba(34, 197, 94, 0.32);
  border-radius: 16px;
  text-align: center;
  font-size: 15px;
  font-weight: 650;
  color: #86efac;
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  pointer-events: none; /* 不阻塞页面交互 */
  z-index: 80;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 180ms ease, transform 220ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* 设置弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 100;
}

.modal {
  width: min(400px, 90%);
  background: linear-gradient(145deg, #1e293b, #0f172a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal-title {
  margin: 0 0 24px;
  font-size: 22px;
  font-weight: 700;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.form-group input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  outline: none;
  transition: all 0.2s ease;
}

.form-group input:focus {
  border-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.1);
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 28px;
}

.btn {
  flex: 1;
  padding: 14px 20px;
  border-radius: 14px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border);
}

.btn.secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn.primary {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  color: #fff;
}

.btn.primary:hover {
  filter: brightness(1.1);
}

/* 弹窗动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: scale(0.9) translateY(20px);
}

/* 响应式 */
@media (max-width: 600px) {
  .tracker-container {
    flex-direction: column;
    gap: 32px;
  }

  .control-section {
    align-items: center;
    text-align: center;
  }

  .drink-btn {
    width: 140px;
    height: 140px;
  }

  .drop-icon {
    width: 40px;
    height: 40px;
  }

  .stats {
    justify-content: center;
  }

  .glass {
    width: 120px;
    height: 240px;
  }
}
</style>

