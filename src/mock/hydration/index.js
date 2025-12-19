import data2025_11 from './2025-11.json'
import data2025_12 from './2025-12.json'

const datasets = {
  '2025-11': data2025_11,
  '2025-12': data2025_12,
}

export function listAvailableMonths() {
  return Object.keys(datasets)
    .map((k) => {
      const [y, m] = k.split('-').map((v) => Number(v))
      return { year: y, month: m }
    })
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
}

export function getHydrationMonth(year, month) {
  const key = `${year}-${String(month).padStart(2, '0')}`
  return datasets[key] ?? { year, month, days: [] }
}


