import { useEffect, useState } from 'react'
import type { TFunction } from 'i18next'
import type { CartLine, LengthLine, PieceLine } from '../../core/cart'
import { newKey } from '../../core/cart'
import { type EnteredLength, toTenths } from '../../core/length'
import { fabricLinePrice } from '../../core/pricing'
import { unitByCode } from '../../core/units'
import type { Product, Variant } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { subText } from '../../ui/format'

export function pieceItem(t: TFunction, p: Product, v: Variant): Omit<PieceLine, 'key' | 'kind' | 'qty'> {
  return { productId: p.id!, variantId: v.id!, nameMy: p.nameMy, sub: subText(t, p, v), unitPriceKs: v.priceKs ?? p.priceKs ?? 0 }
}

export function lengthPrice(p: Product, entered: EnteredLength, s: Settings) {
  const unitTenths = unitByCode(s.units, p.pricingUnit ?? 'gaik').tenths
  const lengthTenths = toTenths(entered, s.units)
  return { lengthTenths, unitTenths, totalKs: fabricLinePrice(p.unitPriceKs ?? 0, lengthTenths, unitTenths, s.roundStep, s.roundMode) }
}

export function lengthLine(t: TFunction, p: Product, entered: EnteredLength, s: Settings, key = newKey()): LengthLine {
  const { lengthTenths, unitTenths, totalKs } = lengthPrice(p, entered, s)
  return {
    key, kind: 'length', productId: p.id!, nameMy: p.nameMy, sub: subText(t, p), entered, lengthTenths,
    unitPriceKs: p.unitPriceKs ?? 0, pricingUnit: p.pricingUnit ?? 'gaik', unitTenths, lineTotalKs: totalKs,
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
