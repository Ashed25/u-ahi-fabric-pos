/** Asia/Yangon is a fixed UTC+06:30 with no DST, so plain offset maths is exact. */
const OFFSET_MS = 6.5 * 3600 * 1000

export interface YangonParts {
  year: number
  month: number // 1-12
  day: number
}

export function yangonParts(ms: number): YangonParts {
  const d = new Date(ms + OFFSET_MS)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** "2026-11-14" in Yangon time */
export function dateKey(ms: number): string {
  const p = yangonParts(ms)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** "14:05" in Yangon time */
export function timeText(ms: number): string {
  const d = new Date(ms + OFFSET_MS)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Epoch ms of Yangon midnight for that date. Month/day overflow is allowed (Date.UTC normalises). */
export function yangonMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) - OFFSET_MS
}

export function dayBounds(ms: number): [number, number] {
  const p = yangonParts(ms)
  return [yangonMidnight(p.year, p.month, p.day), yangonMidnight(p.year, p.month, p.day + 1)]
}

/** Financial year 1 Apr – 31 Mar, named by its starting year (FY 2026 = Apr 2026 – Mar 2027). */
export function fyOf(ms: number): number {
  const p = yangonParts(ms)
  return p.month >= 4 ? p.year : p.year - 1
}

/** Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar */
export function fyQuarterOf(ms: number): 1 | 2 | 3 | 4 {
  const m = yangonParts(ms).month
  return (Math.floor(((m + 8) % 12) / 3) + 1) as 1 | 2 | 3 | 4
}

export function fyBounds(fy: number): [number, number] {
  return [yangonMidnight(fy, 4, 1), yangonMidnight(fy + 1, 4, 1)]
}

export function quarterBounds(fy: number, q: 1 | 2 | 3 | 4): [number, number] {
  const startMonth = 4 + (q - 1) * 3
  return [yangonMidnight(fy, startMonth, 1), yangonMidnight(fy, startMonth + 3, 1)]
}
