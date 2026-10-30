import { describe, expect, it } from 'vitest'
import { addDays, dateParts, monthLabel, todayJst } from '@/shared/dates'

describe('dates', () => {
  it('todayJst は UTC の 15:00 で日付が変わる', () => {
    expect(todayJst(new Date('2026-11-06T14:59:59Z'))).toBe('2026-11-06')
    expect(todayJst(new Date('2026-11-06T15:00:00Z'))).toBe('2026-11-07')
  })

  it('addDays は月・年をまたぐ', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('dateParts と monthLabel', () => {
    expect(dateParts('2026-11-07')).toEqual({ year: 2026, month: 11, day: 7, weekday: '土' })
    expect(monthLabel('2026-11-22')).toBe('2026年11月')
  })
})
