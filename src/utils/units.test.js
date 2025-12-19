import { describe, expect, it } from 'vitest'
import { toKg, toM } from './units'

describe('units', () => {
  it('toKg: jin -> kg', () => {
    expect(toKg(130, 'jin')).toBeCloseTo(65)
  })

  it('toKg: lb -> kg', () => {
    expect(toKg(220, 'lb')).toBeCloseTo(99.7903214)
  })

  it('toM: cm -> m', () => {
    expect(toM(170, 'cm')).toBeCloseTo(1.7)
  })

  it('toM: ft -> m', () => {
    expect(toM(5.6, 'ft')).toBeCloseTo(1.70688)
  })
})


