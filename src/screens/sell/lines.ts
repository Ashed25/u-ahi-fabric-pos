import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import type { CartLine, LengthLine, PieceLine } from '../../core/cart'
import { newKey } from '../../core/cart'
import { type EnteredLength, toTenths } from '../../core/length'
import { discountedLinePrice } from '../../core/pricing'
import { unitByCode } from '../../core/units'
import type { Product, Roll, Variant } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { subText } from '../../ui/format'

export function pieceItem(t: TFunction, p: Product, v: Variant): Omit<PieceLine, 'key' | 'kind' | 'qty'> {
  return { productId: p.id!, variantId: v.id!, nameMy: p.nameMy, sub: subText(t, p, v), unitPriceKs: v.priceKs ?? p.priceKs ?? 0 }
}

/** Price of a cut. A remnant roll is sold at its % off, or — when sold whole — at its fixed price. */
export function lengthPrice(p: Product, entered: EnteredLength, s: Settings, roll?: Roll, whole = false) {
  const unitTenths = unitByCode(s.units, p.pricingUnit ?? 'gaik').tenths
  const lengthTenths = toTenths(entered, s.units)
  const pct = roll?.status === 'remnant' ? (roll.remnantPct ?? 0) : 0
  const totalKs =
    whole && roll?.remnantPriceKs ? roll.remnantPriceKs : discountedLinePrice(p.unitPriceKs ?? 0, lengthTenths, unitTenths, pct, s.roundStep, s.roundMode)
  return { lengthTenths, unitTenths, totalKs, pct }
}

export function lengthLine(t: TFunction, p: Product, entered: EnteredLength, s: Settings, key = newKey(), roll?: Roll, whole = false): LengthLine {
  const { lengthTenths, unitTenths, totalKs, pct } = lengthPrice(p, entered, s, roll, whole)
  return {
    key, kind: 'length', productId: p.id!, nameMy: p.nameMy, sub: subText(t, p), entered, lengthTenths,
    unitPriceKs: p.unitPriceKs ?? 0, pricingUnit: p.pricingUnit ?? 'gaik', unitTenths, lineTotalKs: totalKs,
    rollId: roll?.id, remnantPct: !whole && pct ? pct : undefined, wholeRemnant: whole && !!roll?.remnantPriceKs ? true : undefined,
  }
}

// Exchange credit waiting to be used by the next sale (credit note id).
const CREDIT_KEY = 'u-ahi-credit'
export function getPendingCredit(): string | undefined {
  try {
    return localStorage.getItem(CREDIT_KEY) ?? undefined
  } catch {
    return undefined
  }
}
export function setPendingCredit(cnId?: string) {
  try {
    if (cnId) localStorage.setItem(CREDIT_KEY, cnId)
    else localStorage.removeItem(CREDIT_KEY)
  } catch {
    // storage blocked: the credit stays on the credit note and can be paid out from sales history
  }
}

const KEY = 'u-ahi-cart'

/** The open sale survives a reload or power cut. Per-device convenience only, so localStorage is fine. */
export function useStoredCart() {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines))
    } catch {
      // storage blocked: the cart just won't survive a reload
    }
  }, [lines])
  return [lines, setLines] as const
}
