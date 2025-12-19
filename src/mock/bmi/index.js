function pad2(n) {
  return String(n).padStart(2, '0')
}

function toYmd(d) {
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  return `${y}-${m}-${day}`
}

// Deterministic pseudo-random generator (LCG) for stable mock data
function makeRng(seed = 123456789) {
  let s = seed >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/**
 * Generate daily BMI mock history (one point per day).
 * @param {{ days?: number, endDate?: Date, seed?: number, base?: number }} opts
 * @returns {{ date: string, bmi: number }[]}
 */
export function generateBmiHistory(opts = {}) {
  const days = opts.days ?? 120
  const endDate = opts.endDate ?? new Date()
  const seed = opts.seed ?? 20251218
  const base = opts.base ?? 22.4
  const rnd = makeRng(seed)

  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)

  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(end.getDate() - i)

    // Trend + weekly seasonality + small noise
    const t = (days - 1 - i) / Math.max(1, days - 1)
    const slowTrend = (t - 0.5) * 0.9 // -0.45..0.45
    const weekly = Math.sin(((days - 1 - i) / 7) * Math.PI * 2) * 0.25
    const noise = (rnd() - 0.5) * 0.35
    const bmi = base + slowTrend + weekly + noise

    out.push({
      date: toYmd(d),
      bmi: Math.round(bmi * 10) / 10,
    })
  }

  return out
}

export const bmiHistoryMock = generateBmiHistory()


