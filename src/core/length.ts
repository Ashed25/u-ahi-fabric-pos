import { type Unit, unitByCode } from './units'

/** A length exactly as the seller built it, e.g. 3 taung or 2 gaik 1 htwa 1 maik. Order is preserved. */
export type EnteredLength = { unit: string; count: number }[]
export type Lang = 'my' | 'en'

export function toTenths(entered: EnteredLength, units: Unit[]): number {
  return entered.reduce((sum, e) => sum + unitByCode(units, e.unit).tenths * e.count, 0)
}

/** +/- button: change one unit's count, keeping the seller's order; drops units that reach 0. */
export function addUnit(entered: EnteredLength, unit: string, delta: number): EnteredLength {
  const i = entered.findIndex((e) => e.unit === unit)
  if (i === -1) return delta > 0 ? [...entered, { unit, count: delta }] : entered
  const count = entered[i].count + delta
  return count > 0
    ? entered.map((e, j) => (j === i ? { unit, count } : e))
    : entered.filter((_, j) => j !== i)
}

const name = (u: Unit, lang: Lang) => (lang === 'my' ? u.nameMy : u.nameEn)

/** Display exactly as entered: "3 တောင်" stays "3 တောင်". */
export function formatEntered(entered: EnteredLength, units: Unit[], lang: Lang = 'my'): string {
  return entered.map((e) => `${e.count} ${name(unitByCode(units, e.unit), lang)}`).join(' ')
}

/**
 * Largest-units-first breakdown, for lengths with no entered form (roll stock).
 * Because a maik is 4.4", a few lengths leave < 0.5" over; that remainder is dropped here
 * and only visible in the exact inches line.
 */
export function breakdown(tenths: number, units: Unit[]): EnteredLength {
  const out: EnteredLength = []
  let left = tenths
  for (const u of [...units].sort((a, b) => b.tenths - a.tenths)) {
    const count = Math.floor(left / u.tenths)
    if (count > 0) {
      out.push({ unit: u.code, count })
      left -= count * u.tenths
    }
  }
  return out
}

export function formatLargestFirst(tenths: number, units: Unit[], lang: Lang = 'my'): string {
  const parts = breakdown(tenths, units)
  return parts.length ? formatEntered(parts, units, lang) : '0'
}

/** 764 -> "76.4", 540 -> "54" */
export function formatInches(tenths: number): string {
  const sign = tenths < 0 ? '-' : ''
  const t = Math.abs(tenths)
  const whole = Math.floor(t / 10)
  const frac = t % 10
  return sign + (frac ? `${whole}.${frac}` : `${whole}`)
}
