import { roundFraction } from './pricing'

/** Commercial Tax. rateBp in basis points (500 = 5%) to keep everything integer. */
export interface TaxSplit {
  netKs: number
  ctKs: number
  totalKs: number
}

export interface CtSettings {
  registered: boolean
  rateBp: number
  inclusive: boolean
}

export function ctFromInclusive(totalKs: number, rateBp: number): TaxSplit {
  const ctKs = roundFraction(totalKs * rateBp, 10000 + rateBp, 1, 'nearest')
  return { netKs: totalKs - ctKs, ctKs, totalKs }
}

export function ctFromExclusive(netKs: number, rateBp: number): TaxSplit {
  const ctKs = roundFraction(netKs * rateBp, 10000, 1, 'nearest')
  return { netKs, ctKs, totalKs: netKs + ctKs }
}

export function applyCt(amountKs: number, s: CtSettings): TaxSplit {
  if (!s.registered) return { netKs: amountKs, ctKs: 0, totalKs: amountKs }
  return s.inclusive ? ctFromInclusive(amountKs, s.rateBp) : ctFromExclusive(amountKs, s.rateBp)
}
