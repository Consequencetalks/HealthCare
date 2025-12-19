import { assessSleep } from '../../utils/sleepScoring'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toYmd(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

function parseYmd(dateStr) {
  return new Date(`${dateStr}T00:00:00`)
}

function addDays(ymdStr, deltaDays) {
  const d = parseYmd(ymdStr)
  d.setDate(d.getDate() + deltaDays)
  return toYmd(d)
}

// Deterministic pseudo-random generator (LCG) for stable mock data
function makeRng(seed = 123456789) {
  let s = seed >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function fmtIso(ymdStr, hh, mm) {
  return `${ymdStr}T${pad2(hh)}:${pad2(mm)}`
}

/**
 * Generate daily sleep mock history (one point per sleep date).
 * @param {{ days?: number, endDate?: Date, seed?: number }} opts
 * @returns {{ date: string, sleepStart: string, wakeTime: string, awakenings: number, durationMin: number, score: number }[]}
 */
export function generateSleepHistory(opts = {}) {
  const days = opts.days ?? 90
  const endDate = opts.endDate ?? new Date()
  const seed = opts.seed ?? 20251218
  const rnd = makeRng(seed)

  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  const endYmd = toYmd(end)

  const out = []

  for (let i = days - 1; i >= 0; i--) {
    const sleepDate = addDays(endYmd, -i) // this is the "sleep date" (start date)

    // Bedtime: around 23:00–01:30 with some noise
    const base = 23 * 60 + 15 // 23:15
    const lateShift = (rnd() - 0.5) * 150 // +/- 75 min
    const occasionalLate = rnd() < 0.15 ? 60 + rnd() * 120 : 0 // sometimes much later
    let startMinOfDay = Math.round(base + lateShift + occasionalLate)
    if (startMinOfDay < 20 * 60) startMinOfDay = 20 * 60
    if (startMinOfDay > 27 * 60) startMinOfDay = 27 * 60

    const startHour = Math.floor((startMinOfDay % (24 * 60)) / 60)
    const startMin = startMinOfDay % 60

    // Duration: mostly 6.0–8.5h with some short nights
    const shortNight = rnd() < 0.12
    const durMin = shortNight ? 300 + rnd() * 120 : 360 + rnd() * 150 // 5–7h or 6–8.5h
    const durationMin = Math.round(durMin)

    // Wake time (may be next day)
    const wakeMinOfDay = startMinOfDay + durationMin
    const wakeDay = wakeMinOfDay >= 24 * 60 ? addDays(sleepDate, 1) : sleepDate
    const wakeHour = Math.floor((wakeMinOfDay % (24 * 60)) / 60)
    const wakeMin = wakeMinOfDay % 60

    // Awakenings: 0–3 with rare higher
    let awakenings = 0
    const r = rnd()
    if (r < 0.45) awakenings = 0
    else if (r < 0.75) awakenings = 1
    else if (r < 0.92) awakenings = 2
    else if (r < 0.98) awakenings = 3
    else awakenings = 4 + Math.floor(rnd() * 2)

    const sleepStartISO = fmtIso(sleepDate, startHour, startMin)
    const wakeTimeISO = fmtIso(wakeDay, wakeHour, wakeMin)

    const assessed = assessSleep({ sleepStartISO, wakeTimeISO, awakenings })
    if (!assessed) continue

    out.push({
      date: assessed.dateKey,
      sleepStart: assessed.sleepStartISO,
      wakeTime: assessed.wakeTimeISO,
      awakenings: assessed.awakenings,
      durationMin: assessed.durationMin,
      score: assessed.score,
    })
  }

  return out
}

export const sleepHistoryMock = generateSleepHistory()


