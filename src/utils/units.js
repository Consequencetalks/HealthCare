export function toKg(value, unit) {
  if (!Number.isFinite(value)) return NaN
  if (unit === 'jin') return value * 0.5
  if (unit === 'lb') return value * 0.45359237
  return value
}

export function toM(value, unit) {
  if (!Number.isFinite(value)) return NaN
  if (unit === 'cm') return value / 100
  if (unit === 'ft') return value * 0.3048
  return value
}


