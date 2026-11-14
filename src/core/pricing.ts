export type RoundMode = 'nearest' | 'up'

/** Round the exact fraction num/den to a multiple of step; 'nearest' rounds exact halves up. Integers only. */
export function roundFraction(num: number, den: number, step: number, mode: RoundMode): number {
  const d = den * step
  const q = mode === 'up' ? Math.ceil(num / d) : Math.floor((2 * num + d) / (2 * d))
  return q * step
}

/** Fabric line price = unitPrice × length / unitLength, rounded per line. */
export function fabricLinePrice(
  unitPriceKs: number,
  lengthTenths: number,
  unitTenths: number,
  step = 50,
  mode: RoundMode = 'nearest',
): number {
  for (const n of [unitPriceKs, lengthTenths, unitTenths, step]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`fabricLinePrice: bad input ${n}`)
  }
  if (unitTenths === 0 || step === 0) throw new Error('fabricLinePrice: zero unit/step')
  return roundFraction(unitPriceKs * lengthTenths, unitTenths, step, mode)
}

/** Remnant at pctOff % off: exact integer maths, rounded once per line like any fabric line. */
export function discountedLinePrice(unitPriceKs: number, lengthTenths: number, unitTenths: number, pctOff: number, step = 50, mode: RoundMode = 'nearest'): number {
  if (!Number.isInteger(pctOff) || pctOff < 0 || pctOff >= 100) throw new Error(`bad discount ${pctOff}`)
  return fabricLinePrice(unitPriceKs * (100 - pctOff), lengthTenths, unitTenths * 100, step, mode)
}
