import { describe, expect, it } from 'vitest'
import { parseNumber } from './number'

describe('parseNumber', () => {
  it('parses dot decimal', () => {
    expect(parseNumber('1.70')).toBeCloseTo(1.7)
  })

  it('parses comma decimal', () => {
    expect(parseNumber('1,70')).toBeCloseTo(1.7)
  })

  it('returns NaN for invalid input', () => {
    expect(Number.isNaN(parseNumber('abc'))).toBe(true)
  })
})


