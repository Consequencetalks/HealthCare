<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { parseNumber } from '../utils/number'
import { toKg, toM } from '../utils/units'

const router = useRouter()

const heightValue = ref('')
const weightValue = ref('')
const ageValue = ref('')
const heightUnit = ref('cm') // 'cm' | 'm' | 'ft'
const weightUnit = ref('kg') // 'kg' | 'jin' | 'lb'
const sex = ref('male') // 'male' | 'female'
const openMenu = ref(null) // 'height' | 'weight' | null

const result = ref(null) // { bmr: number, hint: string, activityFactor?: number, activityLabel?: string, activityExplain?: string, tdee?: number }
const error = ref('')

const heightUnitText = computed(() => ({ cm: 'centimeter', m: 'meter', ft: 'foot' }[heightUnit.value] ?? 'centimeter'))
const weightUnitText = computed(() => ({ kg: 'kilogram', jin: 'jin', lb: 'pound' }[weightUnit.value] ?? 'kilogram'))
const sexText = computed(() => (sex.value === 'female' ? 'Female' : 'Male'))

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

const agePlaceholder = computed(() => 'e.g. 25')

// parseNumber/toKg/toM moved to src/utils for reuse + testing

function toggleMenu(which) {
  openMenu.value = openMenu.value === which ? null : which
}

function closeMenus() {
  openMenu.value = null
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
  closeMenus()
}

onMounted(() => {
  window.addEventListener('click', closeOnWindowClick, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeOnWindowClick, true)
})

// 活动强度问答（用于估算 TDEE）
const showActivityWizard = ref(false)
const activityStep = ref(1) // 1..3
const qDaily = ref(null) // 'A'|'B'|'C'|'D' | null
const qFreq = ref(null) // 'A'|'B'|'C'|'D' | null
const qType = ref(null) // 'A'|'B'|'C' | null（可选）
const activityError = ref('')

const standardFactors = [1.2, 1.375, 1.55, 1.725, 1.9]

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function snapToStandard(n) {
  return standardFactors.reduce((best, cur) => {
    const d1 = Math.abs(cur - n)
    const d2 = Math.abs(best - n)
    if (d1 < d2) return cur
    if (d1 > d2) return best
    return cur > best ? cur : best
  }, standardFactors[0])
}

function labelForFactor(f) {
  if (f === 1.2) return 'Sedentary / Light'
  if (f === 1.375) return 'Lightly active'
  if (f === 1.55) return 'Moderately active'
  if (f === 1.725) return 'Very active'
  return 'Extra active'
}

function baseFactorFromDaily(v) {
  if (v === 'A') return 1.2
  if (v === 'B') return 1.35
  if (v === 'C') return 1.5
  if (v === 'D') return 1.7
  return NaN
}

function freqBonusFrom(v) {
  if (v === 'A') return 0
  if (v === 'B') return 0.05
  if (v === 'C') return 0.15
  if (v === 'D') return 0.25
  return NaN
}

function typeBonusFrom(v) {
  if (v === 'A') return 0
  if (v === 'B') return 0.05
  if (v === 'C') return 0.1
  return 0
}

const normalized = computed(() => {
  const hRaw = parseNumber(heightValue.value)
  const wRaw = parseNumber(weightValue.value)
  const hM = toM(hRaw, heightUnit.value)
  const wKg = toKg(wRaw, weightUnit.value)
  const hCm = hM * 100
  return { hRaw, wRaw, hM, hCm, wKg }
})

const hasActivity = computed(() => {
  const r = result.value
  return Number.isFinite(r?.activityFactor) && Number.isFinite(r?.tdee)
})

function calc() {
  error.value = ''
  const { hM, hCm, wKg } = normalized.value
  const ageRaw = parseNumber(ageValue.value)
  const age = Number.isFinite(ageRaw) ? Math.round(ageRaw) : NaN

  if (!Number.isFinite(hM) || !Number.isFinite(wKg) || !Number.isFinite(age)) {
    error.value = `Please enter a valid height (${heightUnitText.value}), weight (${weightUnitText.value}), and age.`
    result.value = null
    return
  }
  if (hM <= 0 || wKg <= 0) {
    error.value = 'Height and weight must be greater than 0.'
    result.value = null
    return
  }
  if (age <= 0) {
    error.value = 'Age must be greater than 0.'
    result.value = null
    return
  }
  if (age < 5 || age > 120) {
    error.value = 'Recommended age range is 5–120.'
    result.value = null
    return
  }
  if (hCm < 50 || hCm > 260) {
    error.value = 'Recommended height range is 50–260 cm.'
    result.value = null
    return
  }
  if (wKg < 10 || wKg > 400) {
    error.value = 'Recommended weight range is 10–400 kg.'
    result.value = null
    return
  }

  // Mifflin-St Jeor（常见用法）：BMR ≈ 10W + 6.25H - 5A + S
  // 男：S=+5；女：S=-161
  const s = sex.value === 'female' ? -161 : 5
  const bmr = 10 * wKg + 6.25 * hCm - 5 * age + s
  const rounded = Math.round(bmr)

  const hint =
    'This is an estimated Basal Metabolic Rate (BMR). It does not include daily activity or exercise. For better accuracy, consider age, body fat %, or consult a professional.'

  const prev = result.value
  const activityFactor = prev?.activityFactor
  const activityLabel = prev?.activityLabel
  const activityExplain = prev?.activityExplain
  const tdee = Number.isFinite(activityFactor) ? Math.round(rounded * activityFactor) : undefined
  result.value = { bmr: rounded, hint, activityFactor, activityLabel, activityExplain, tdee }
}

function openActivityWizard() {
  // Ensure BMR is valid first; otherwise show error and do not enter the wizard.
  calc()
  if (!result.value || error.value) return

  activityError.value = ''
  activityStep.value = 1
  qDaily.value = null
  qFreq.value = null
  qType.value = null
  showActivityWizard.value = true
}

function closeActivityWizard() {
  showActivityWizard.value = false
  activityError.value = ''
}

function nextActivityStep() {
  activityError.value = ''
  if (activityStep.value === 1 && !qDaily.value) {
    activityError.value = 'Please choose your daily activity level.'
    return
  }
  if (activityStep.value === 2 && !qFreq.value) {
    activityError.value = 'Please choose your exercise frequency.'
    return
  }
  activityStep.value = Math.min(3, activityStep.value + 1)
}

function prevActivityStep() {
  activityError.value = ''
  activityStep.value = Math.max(1, activityStep.value - 1)
}

function finishActivityWizard() {
  activityError.value = ''
  if (!qDaily.value || !qFreq.value) {
    activityError.value = 'Please complete the first two required questions.'
    return
  }

  const baseFactor = baseFactorFromDaily(qDaily.value)
  const frequencyBonus = freqBonusFrom(qFreq.value)
  const typeBonus = typeBonusFrom(qType.value)

  const raw = baseFactor + frequencyBonus + typeBonus
  const clamped = clamp(raw, 1.2, 1.9)
  const normalizedFactor = snapToStandard(clamped)
  const activityLabel = labelForFactor(normalizedFactor)

  const bmr = result.value?.bmr
  const tdee = Number.isFinite(bmr) ? Math.round(bmr * normalizedFactor) : undefined

  const activityExplain = `Based on your daily routine and exercise habits, your overall activity level is [${activityLabel}].\nFor calorie estimation, we will use ${normalizedFactor} × BMR to estimate your total daily energy expenditure.`

  result.value = {
    ...(result.value ?? {}),
    activityFactor: normalizedFactor,
    activityLabel,
    activityExplain,
    tdee,
  }

  closeActivityWizard()
}

function reset() {
  heightValue.value = ''
  weightValue.value = ''
  ageValue.value = ''
  sex.value = 'male'
  result.value = null
  error.value = ''
  closeActivityWizard()
}
</script>

<template>
  <main class="page">
    <!-- Back button (match HydrationTracker style) -->
    <button class="back-btn" type="button" @click="router.push('/')" aria-label="Back">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>

    <section class="card">
      <header class="top">
        <div class="titles">
          <h1 class="title">Calorie Calculator</h1>
        </div>
      </header>

      <div class="form">
        <label class="field">
          <span class="label">Height ({{ heightUnitText }})</span>
          <div class="inputRow">
            <input v-model.trim="heightValue" class="input" inputmode="decimal" autocomplete="off" :placeholder="heightPlaceholder" />
            <div class="unitSelect" :class="{ open: openMenu === 'height' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('height')" aria-haspopup="listbox" :aria-expanded="openMenu === 'height'">
                {{ heightUnitText }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Height unit">
                <button class="unitOption" type="button" role="option" :aria-selected="heightUnit === 'cm'" @click="setHeightUnit('cm')">
                  centimeter (cm)
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="heightUnit === 'm'" @click="setHeightUnit('m')">
                  meter (m)
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="heightUnit === 'ft'" @click="setHeightUnit('ft')">
                  foot (ft)
                </button>
              </div>
            </div>
          </div>
        </label>

        <label class="field">
          <span class="label">Weight ({{ weightUnitText }})</span>
          <div class="inputRow">
            <input v-model.trim="weightValue" class="input" inputmode="decimal" autocomplete="off" :placeholder="weightPlaceholder" />
            <div class="unitSelect" :class="{ open: openMenu === 'weight' }" @click.stop @keydown.esc="closeMenus">
              <button class="unitBtn" type="button" @click="toggleMenu('weight')" aria-haspopup="listbox" :aria-expanded="openMenu === 'weight'">
                {{ weightUnitText }}
                <span class="chev" aria-hidden="true">▾</span>
              </button>
              <div class="unitMenu" role="listbox" aria-label="Weight unit">
                <button class="unitOption" type="button" role="option" :aria-selected="weightUnit === 'kg'" @click="setWeightUnit('kg')">
                  kilogram (kg)
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="weightUnit === 'jin'" @click="setWeightUnit('jin')">
                  jin
                </button>
                <button class="unitOption" type="button" role="option" :aria-selected="weightUnit === 'lb'" @click="setWeightUnit('lb')">
                  pound (lb)
                </button>
              </div>
            </div>
          </div>
        </label>

        <label class="field">
          <span class="label">Age (years)</span>
          <div class="inputRow">
            <input v-model.trim="ageValue" class="input" inputmode="numeric" autocomplete="off" :placeholder="agePlaceholder" />
            <div class="unitStub" aria-hidden="true">
              <span class="unitStubText">yr</span>
            </div>
          </div>
        </label>

        <label class="field">
          <span class="label">Sex ({{ sexText }})</span>
          <div class="seg" role="radiogroup" aria-label="Sex">
            <button class="segBtn" :class="{ active: sex === 'male' }" type="button" role="radio" :aria-checked="sex === 'male'" @click="sex = 'male'">
              Male
            </button>
            <button class="segBtn" :class="{ active: sex === 'female' }" type="button" role="radio" :aria-checked="sex === 'female'" @click="sex = 'female'">
              Female
            </button>
          </div>
        </label>
      </div>

      <div class="actions">
        <button class="btn primary" type="button" @click="calc">Calculate BMR</button>
        <button class="btn secondary" type="button" @click="openActivityWizard">Estimate Activity</button>
        <button class="btn ghost" type="button" @click="reset">Clear</button>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section v-if="result" class="result" aria-live="polite">
        <div class="metric">
          <span class="tag" :class="hasActivity ? 'warn' : 'ok'">
            {{ hasActivity ? 'Total Daily Energy (TDEE, incl. activity)' : 'Basal Metabolic Rate (BMR)' }}
          </span>
          <div class="metricLabel">
            {{ hasActivity ? 'TDEE (kcal/day)' : 'BMR (kcal/day)' }}
          </div>
          <div class="metricValue" :class="hasActivity ? 'warn' : 'ok'">
            {{ hasActivity ? result.tdee : result.bmr }} <span class="unit">kcal/day</span>
          </div>
        </div>
        <div v-if="hasActivity" class="tdee">
          <div class="tdeeRow">
            <span class="tag subtle">BMR: {{ result.bmr }} kcal/day</span>
            <span class="tag subtle">Activity factor: {{ result.activityFactor }}</span>
          </div>
          <p class="explain">{{ result.activityExplain }}</p>
        </div>
        <p v-if="!hasActivity" class="hint">{{ result.hint }}</p>
      </section>

      <div v-if="showActivityWizard" class="modal-overlay" @click.self="closeActivityWizard">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Estimate activity level">
          <div class="modalHeader">
            <div class="modalTitle">Estimate Activity Level</div>
            <button class="iconClose" type="button" @click="closeActivityWizard" aria-label="Close">×</button>
          </div>

          <div class="step">
            <div class="stepTag">Step {{ activityStep }} / 3</div>

            <template v-if="activityStep === 1">
              <div class="qTitle">On a typical workday, most of your time is spent:</div>
              <div class="options">
                <label class="opt">
                  <input v-model="qDaily" type="radio" name="qDaily" value="A" />
                  <span class="optText">A: Mostly sitting (almost always seated, little walking)</span>
                </label>
                <label class="opt">
                  <input v-model="qDaily" type="radio" name="qDaily" value="B" />
                  <span class="optText">B: Sitting + walking (some walking, not standing all day)</span>
                </label>
                <label class="opt">
                  <input v-model="qDaily" type="radio" name="qDaily" value="C" />
                  <span class="optText">C: Mostly standing or walking (rarely seated for long)</span>
                </label>
                <label class="opt">
                  <input v-model="qDaily" type="radio" name="qDaily" value="D" />
                  <span class="optText">D: Physical labor (frequent lifting/carrying or heavy work)</span>
                </label>
              </div>
            </template>

            <template v-else-if="activityStep === 2">
              <div class="qTitle">Do you exercise regularly?</div>
              <div class="options">
                <label class="opt">
                  <input v-model="qFreq" type="radio" name="qFreq" value="A" />
                  <span class="optText">A: Rarely exercise</span>
                </label>
                <label class="opt">
                  <input v-model="qFreq" type="radio" name="qFreq" value="B" />
                  <span class="optText">B: 1–2 times/week, ≤30 minutes each</span>
                </label>
                <label class="opt">
                  <input v-model="qFreq" type="radio" name="qFreq" value="C" />
                  <span class="optText">C: 3–4 times/week, 30–60 minutes each</span>
                </label>
                <label class="opt">
                  <input v-model="qFreq" type="radio" name="qFreq" value="D" />
                  <span class="optText">D: ≥5 times/week, or higher-intensity training</span>
                </label>
              </div>
            </template>

            <template v-else>
              <div class="qTitle">What is your main exercise type? (optional)</div>
              <div class="options">
                <label class="opt">
                  <input v-model="qType" type="radio" name="qType" value="A" />
                  <span class="optText">A: Walking / stretching / yoga (light activity)</span>
                </label>
                <label class="opt">
                  <input v-model="qType" type="radio" name="qType" value="B" />
                  <span class="optText">B: Running / swimming / cycling (aerobic)</span>
                </label>
                <label class="opt">
                  <input v-model="qType" type="radio" name="qType" value="C" />
                  <span class="optText">C: Strength training / HIIT / competitive sports</span>
                </label>
              </div>
              <div class="subTip">Not sure? You can skip this step. No bonus will be applied by default.</div>
            </template>

            <p v-if="activityError" class="error" role="alert">{{ activityError }}</p>
          </div>

          <div class="modalActions">
            <button class="btn ghost" type="button" @click="prevActivityStep" :disabled="activityStep === 1">Back</button>
            <button v-if="activityStep < 3" class="btn primary" type="button" @click="nextActivityStep">Next</button>
            <div v-else class="finishRow">
              <button class="btn ghost" type="button" @click="finishActivityWizard">Skip & Finish</button>
              <button class="btn primary" type="button" @click="finishActivityWizard">Finish</button>
            </div>
          </div>
        </div>
      </div>
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
  width: min(820px, 100%);
  border-radius: 22px;
  padding: 22px;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(10px);
}

.top {
  display: block;
  margin-bottom: 18px;
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
  line-height: 1.5;
}

.form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
  text-align: left;
}

.label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}

.inputRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
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
  border-color: rgba(251, 146, 60, 0.75);
  box-shadow: 0 0 0 4px rgba(251, 146, 60, 0.14);
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
  border-color: rgba(251, 146, 60, 0.75);
  box-shadow: 0 0 0 4px rgba(251, 146, 60, 0.14);
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
  background: rgba(251, 146, 60, 0.16);
  border: 1px solid rgba(251, 146, 60, 0.28);
}

.unitStub {
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 28, 0.55);
  color: rgba(255, 255, 255, 0.78);
  padding: 0 12px;
  font-weight: 750;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0.95;
}

.unitStubText {
  pointer-events: none;
}

.seg {
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(10, 16, 28, 0.55);
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  gap: 6px;
}

.segBtn {
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.86);
  font-weight: 800;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.15s ease, color 0.18s ease;
}

.segBtn:active {
  transform: translateY(1px);
}

.segBtn.active {
  background: rgba(251, 146, 60, 0.2);
  border: 1px solid rgba(251, 146, 60, 0.32);
  color: #fed7aa;
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
  background: linear-gradient(135deg, #fdba74, #fb923c, #f97316);
  filter: saturate(1.06);
}

.primary:hover {
  filter: saturate(1.16);
}

.secondary {
  color: #0b1220;
  background: linear-gradient(135deg, rgba(253, 224, 71, 0.95), rgba(250, 204, 21, 0.95), rgba(234, 179, 8, 0.95));
  border: 0;
  box-shadow: 0 10px 30px rgba(234, 179, 8, 0.22);
  filter: saturate(1.02);
}

.secondary:hover {
  filter: saturate(1.12);
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

.unit {
  margin-left: 8px;
  font-size: 14px;
  font-weight: 750;
  letter-spacing: 0;
  opacity: 0.75;
  vertical-align: baseline;
}

.metricValue.ok {
  color: rgba(251, 146, 60, 0.98);
}

.metricValue.warn {
  color: rgba(253, 224, 71, 0.98);
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
  background: rgba(251, 146, 60, 0.18);
  border-color: rgba(251, 146, 60, 0.28);
}

.tag.warn {
  background: rgba(253, 224, 71, 0.14);
  border-color: rgba(253, 224, 71, 0.28);
  color: rgba(255, 255, 255, 0.92);
}

.tag.subtle {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.72);
}

.tdee {
  margin-top: 10px;
}

.tdeeRow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.explain {
  margin: 10px 0 0;
  white-space: pre-line;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  line-height: 1.7;
}

.hint {
  margin: 10px 0 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  line-height: 1.7;
}

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
  width: min(560px, calc(100% - 48px));
  background: rgba(10, 16, 28, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 22px;
  padding: 18px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
}

.modalHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.modalTitle {
  font-size: 16px;
  font-weight: 850;
}

.iconClose {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: grid;
  place-items: center;
  line-height: 1;
  font-size: 18px;
}

.iconClose:hover {
  background: rgba(255, 255, 255, 0.11);
}

.stepTag {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  font-weight: 700;
}

.qTitle {
  margin-top: 10px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.92);
}

.options {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}

.opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.opt:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.18);
}

.opt input {
  margin-top: 3px;
}

.optText {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}

.subTip {
  margin-top: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.modalActions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.finishRow {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>


