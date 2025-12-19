import { describe, expect, it } from 'vitest'
import { classifyBmi } from './bmi'

describe('classifyBmi', () => {
  it('severely underweight < 16', () => {
    expect(classifyBmi(15.9).category).toBe('Severely underweight')
  })

  it('underweight < 18.5', () => {
    expect(classifyBmi(18.49).category).toBe('Underweight')
  })

  it('normal < 24', () => {
    expect(classifyBmi(18.5).category).toBe('Normal')
    expect(classifyBmi(23.99).category).toBe('Normal')
  })

  it('overweight < 28', () => {
    expect(classifyBmi(24).category).toBe('Overweight')
    expect(classifyBmi(27.99).category).toBe('Overweight')
  })

  it('obese >= 28', () => {
    expect(classifyBmi(28).category).toBe('Obese')
  })
})


