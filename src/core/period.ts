import { dateKey, fyBounds, fyOf, fyQuarterOf, quarterBounds, yangonMidnight, yangonParts } from './fy'

export type PeriodKind = 'day' | 'week' | 'month' | 'quarter' | 'fy'
const DAY = 86_400_000

/** [from, to) in epoch ms for the period containing `ref` (Yangon time). Weeks start on Monday. */
export function periodBounds(kind: PeriodKind, ref: number): [number, number] {
  const p = yangonParts(ref)
  switch (kind) {
    case 'day':
      return [yangonMidnight(p.year, p.month, p.day), yangonMidnight(p.year, p.month, p.day + 1)]
    case 'week': {
      const dow = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7 // Mon = 0
      return [yangonMidnight(p.year, p.month, p.day - dow), yangonMidnight(p.year, p.month, p.day - dow + 7)]
    }
    case 'month':
      return [yangonMidnight(p.year, p.month, 1), yangonMidnight(p.year, p.month + 1, 1)]
    case 'quarter':
      return quarterBounds(fyOf(ref), fyQuarterOf(ref))
    case 'fy':
      return fyBounds(fyOf(ref))
  }
}

/** Move `ref` by n whole periods. */
export function shiftRef(kind: PeriodKind, ref: number, n: number): number {
  if (kind === 'day') return ref + n * DAY
  if (kind === 'week') return ref + n * 7 * DAY
  const p = yangonParts(ref)
  const months = kind === 'month' ? n : kind === 'quarter' ? 3 * n : 12 * n
  return yangonMidnight(p.year, p.month + months, 1) + DAY / 2 // midday of the 1st: safely inside the month
}

/** FY named by its start year: 2026 -> "2026-27". */
export const fyName = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`

export function periodLabel(kind: PeriodKind, ref: number): string {
  const [from, to] = periodBounds(kind, ref)
  if (kind === 'day') return dateKey(from)
  if (kind === 'fy') return `FY ${fyName(fyOf(ref))}`
  if (kind === 'quarter') return `FY ${fyName(fyOf(ref))} Q${fyQuarterOf(ref)}`
  if (kind === 'month') return dateKey(from).slice(0, 7)
  return `${dateKey(from)} – ${dateKey(to - 1)}`
}
