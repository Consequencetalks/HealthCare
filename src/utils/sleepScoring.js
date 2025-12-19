function pad2(n) {
  return String(n).padStart(2, '0')
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function toYmd(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

// -----------------------
// Scoring algorithm (0..100)
// -----------------------
export const SLEEP_WEIGHTS = {
  duration: 40,
  bedtime: 20,
  cycle: 25,
  awakenings: 15,
}

function durationScore(durationMin) {
  // Target: 7–9h. Piecewise score in [0..40]
  // <4h => 0
  // 4–6h => 0..25
  // 6–8h => 25..40
  // 8–9h => 40
  // >9h => 40..30 (soft penalty)
  const d = Number(durationMin)
  if (!Number.isFinite(d) || d <= 0) return 0
  if (d < 240) return 0
  if (d < 360) return ((d - 240) / 120) * 25
  if (d < 480) return 25 + ((d - 360) / 120) * 15
  if (d < 540) return 40
  // 9–11h map down to 30; cap at 30 for very long
  if (d < 660) return 40 - ((d - 540) / 120) * 10
  return 30
}

function bedtimeScore(startDate) {
  // Target: ~23:00. Score in [0..20]
  // Treat times after midnight as "late" by shifting to next-day minutes.
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return 0
  const clockMin = startDate.getHours() * 60 + startDate.getMinutes()
  const effective = clockMin < 12 * 60 ? clockMin + 24 * 60 : clockMin
  const target = 23 * 60 // 1380
  const delta = Math.abs(effective - target)

  if (delta <= 60) return 20
  if (delta <= 180) return 20 - ((delta - 60) / 120) * 12 // 20 -> 8
  if (delta <= 360) return 8 - ((delta - 180) / 180) * 8 // 8 -> 0
  return 0
}

function cycleScore(durationMin, awakeningsCount) {
  // Fit to nearest 90-min cycle; score in [0..25], with a gentle penalty for more awakenings.
  const d = Number(durationMin)
  if (!Number.isFinite(d) || d <= 0) return 0
  const cycleLen = 90
  const nearest = Math.round(d / cycleLen) * cycleLen
  const diff = Math.abs(d - nearest)
  const fit = clamp(1 - diff / 45, 0, 1)
  let score = fit * SLEEP_WEIGHTS.cycle

  const a = Number(awakeningsCount ?? 0)
  const factor = a <= 1 ? 1 : a === 2 ? 0.85 : 0.7
  score *= factor
  return clamp(score, 0, SLEEP_WEIGHTS.cycle)
}

function awakeningsScore(awakeningsCount) {
  // Score in [0..15]
  const a = Math.max(0, Math.round(Number(awakeningsCount ?? 0)))
  if (a <= 0) return 15
  if (a === 1) return 12
  if (a === 2) return 8
  if (a === 3) return 4
  return 0
}

export function gradeLabel(score) {
  if (score >= 85) return { label: 'Excellent', tone: 'ok' }
  if (score >= 70) return { label: 'Good', tone: 'ok' }
  if (score >= 55) return { label: 'Fair', tone: 'warn' }
  return { label: 'Poor', tone: 'danger' }
}

export function minsToHm(mins) {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}

export function worstAspect(subscores) {
  const items = [
    { key: 'duration', max: SLEEP_WEIGHTS.duration, label: 'Sleep duration' },
    { key: 'bedtime', max: SLEEP_WEIGHTS.bedtime, label: 'Sleep timing' },
    { key: 'cycle', max: SLEEP_WEIGHTS.cycle, label: 'Cycle alignment' },
    { key: 'awakenings', max: SLEEP_WEIGHTS.awakenings, label: 'Night awakenings' },
  ]
  let worst = items[0]
  let worstRatio = 1
  for (const it of items) {
    const s = Number(subscores?.[it.key] ?? 0)
    const ratio = it.max > 0 ? clamp(s / it.max, 0, 1) : 1
    if (ratio < worstRatio) {
      worstRatio = ratio
      worst = it
    }
  }
  return { ...worst, ratio: worstRatio }
}

/**
 * 计算睡眠评分（按“入睡日期”归档）
 * @param {{ sleepStartISO: string, wakeTimeISO: string, awakenings: number }} input
 */
export function assessSleep(input) {
  const sleepStartISO = String(input?.sleepStartISO ?? '')
  const wakeTimeISO = String(input?.wakeTimeISO ?? '')
  const awakenings = Math.max(0, Math.round(Number(input?.awakenings ?? 0)))

  const start = new Date(sleepStartISO)
  const wake = new Date(wakeTimeISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(wake.getTime())) return null

  const diffMs = wake.getTime() - start.getTime()
  if (diffMs <= 0) return null

  const durationMin = diffMs / 60000
  if (durationMin < 60 || durationMin > 16 * 60) return null

  const s1 = durationScore(durationMin)
  const s2 = bedtimeScore(start)
  const s4 = awakeningsScore(awakenings)
  const s3 = cycleScore(durationMin, awakenings)

  const score = Math.round(clamp(s1 + s2 + s3 + s4, 0, 100))
  const grade = gradeLabel(score)

  const cycleLen = 90
  const nearest = Math.round(durationMin / cycleLen) * cycleLen
  const cycleDiffMin = Math.abs(Math.round(durationMin - nearest))

  const subscores = { duration: s1, bedtime: s2, cycle: s3, awakenings: s4 }
  const worst = worstAspect(subscores)

  return {
    dateKey: toYmd(start),
    start,
    wake,
    sleepStartISO,
    wakeTimeISO,
    awakenings,
    durationMin: Math.round(durationMin),
    score,
    grade,
    subscores: {
      duration: Math.round(s1),
      bedtime: Math.round(s2),
      cycle: Math.round(s3),
      awakenings: Math.round(s4),
    },
    worst,
    cycleDiffMin,
  }
}


