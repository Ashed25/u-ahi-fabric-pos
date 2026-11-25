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

/**
 * Fabric prices are per yard (ကိုက်) now. An older fabric priced per another unit is shown and saved per yard:
 * price × yard/unit, and the wholesale minimum (in pricing units) becomes whole yards, rounded up.
 */
export function perYard(p: { pricingUnit?: string; unitPriceKs?: number; wholesalePriceKs?: number; wholesaleMin?: number }, units: { code: string; tenths: number }[]) {
  const unit = units.find((u) => u.code === (p.pricingUnit ?? 'gaik'))
  const yard = units.find((u) => u.code === 'gaik')
  if (!unit || !yard || unit === yard) return { pricingUnit: 'gaik', unitPriceKs: p.unitPriceKs, wholesalePriceKs: p.wholesalePriceKs, wholesaleMin: p.wholesaleMin }
  const ks = (n?: number) => (n == null ? undefined : Math.round((n * yard.tenths) / unit.tenths))
  return {
    pricingUnit: 'gaik',
    unitPriceKs: ks(p.unitPriceKs),
    wholesalePriceKs: ks(p.wholesalePriceKs),
    wholesaleMin: p.wholesaleMin == null ? undefined : Math.max(1, Math.ceil((p.wholesaleMin * unit.tenths) / yard.tenths)),
  }
}
