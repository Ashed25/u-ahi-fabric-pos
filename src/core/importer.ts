import type { Unit } from './units'

/**
 * Sheet columns (row 1). A row with product_id updates that product (variant_id: that size/colour; empty: a new one).
 * Rows without product_id are new; rows with the same type + name + category become one product with variants.
 */
export const IMPORT_COLUMNS = [
  'product_id', // filled by "download products"; empty = new product
  'variant_id', // piece only; empty = new size/colour
  'type', // piece / length  (or ခု / အလျား)
  'name_my',
  'name_en',
  'category',
  'price_ks', // piece: price per piece. length: price per pricing_unit
  'wholesale_price_ks', // optional, same unit as price_ks
  'wholesale_min', // pieces (all sizes together) / pricing units of fabric
  'size',
  'colour',
  'pricing_unit', // length only: ကိုက် / တောင် / ထွာ / မိုက် / လက်မ (default ကိုက်)
  'width_inches', // length only, e.g. 36, 45, 58.4
  'cost_ks', // optional
  'barcode', // optional existing barcode; otherwise one is generated. Adds a barcode; never removes one
  'active', // yes / no (no = hidden from selling); empty = yes
] as const

export interface ParsedVariant {
  id?: number // existing variant
  size?: string
  colour?: string
  priceKs?: number // only when different from the product price
  barcode?: string
}

export interface ParsedProduct {
  id?: number // existing product: update it
  kind: 'piece' | 'length'
  nameMy: string
  nameEn: string
  category: string
  priceKs?: number
  pricingUnit?: string
  unitPriceKs?: number
  widthTenths?: number
  costKs?: number
  wholesalePriceKs?: number
  wholesaleMin?: number
  active: boolean
  barcode?: string // length products
  variants: ParsedVariant[]
}

export interface ImportError {
  row: number // Excel row number (header is row 1)
  message: string
}

const str = (v: unknown) => String(v ?? '').trim()
const myDigits = (s: string) => s.replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040))

function int(v: unknown): number | undefined {
  const s = myDigits(str(v)).replace(/[,\s]/g, '')
  return /^\d+$/.test(s) ? Number(s) : undefined
}

function kindOf(v: string): 'piece' | 'length' | undefined {
  const s = v.toLowerCase()
  if (['piece', 'pcs', 'ခု', 'ထည်'].includes(s)) return 'piece'
  if (['length', 'fabric', 'အလျား', 'ပိတ်စ'].includes(s)) return 'length'
}

export function parseImport(rows: Record<string, unknown>[], units: Unit[]): { products: ParsedProduct[]; errors: ImportError[] } {
  const errors: ImportError[] = []
  const byKey = new Map<string, ParsedProduct>()
  const seenCodes = new Set<string>()

  rows.forEach((r, i) => {
    const row = i + 2
    const err = (message: string) => errors.push({ row, message })
    if (IMPORT_COLUMNS.every((c) => str(r[c]) === '')) return // blank line

    const kind = kindOf(str(r.type))
    const nameMy = str(r.name_my)
    const price = int(r.price_ks)
    const cost = str(r.cost_ks) === '' ? undefined : int(r.cost_ks)
    const barcode = myDigits(str(r.barcode))
    const id = str(r.product_id) === '' ? undefined : int(r.product_id)
    const variantId = str(r.variant_id) === '' ? undefined : int(r.variant_id)
    const wsPrice = str(r.wholesale_price_ks) === '' ? undefined : int(r.wholesale_price_ks)
    const wsMin = str(r.wholesale_min) === '' ? undefined : int(r.wholesale_min)
    if (str(r.product_id) !== '' && !id) return err(`product_id must be a number from the downloaded sheet (got "${str(r.product_id)}")`)
    if (str(r.variant_id) !== '' && !variantId) return err(`variant_id must be a number from the downloaded sheet (got "${str(r.variant_id)}")`)
    if (variantId && !id) return err('variant_id needs its product_id')
    if (!kind) return err(`type must be piece or length (got "${str(r.type)}")`)
    if (!nameMy) return err('name_my is required')
    if (!price) return err(`price_ks must be a whole number above 0 (got "${str(r.price_ks)}")`)
    if (str(r.cost_ks) !== '' && cost === undefined) return err(`cost_ks must be a whole number (got "${str(r.cost_ks)}")`)
    if (str(r.wholesale_price_ks) !== '' && !wsPrice) return err(`wholesale_price_ks must be a whole number above 0 (got "${str(r.wholesale_price_ks)}")`)
    if (str(r.wholesale_min) !== '' && !wsMin) return err(`wholesale_min must be a whole number above 0 (got "${str(r.wholesale_min)}")`)
    if (!wsPrice !== !wsMin) return err('wholesale_price_ks and wholesale_min go together: fill both or neither')
    if (barcode) {
      if (!/^\d{4,}$/.test(barcode)) return err(`barcode must be digits only (got "${barcode}")`)
      if (seenCodes.has(barcode)) return err(`barcode ${barcode} appears twice in the file`)
      seenCodes.add(barcode)
    }

    const category = str(r.category)
    const key = id ? `id:${id}` : `${kind}|${nameMy}|${category}`
    const existing = byKey.get(key)
    if (existing && existing.kind !== kind) return err(`product_id ${id} has rows with different types`)
    const active = !['no', 'n', '0', 'false', 'hidden', 'မဟုတ်', 'မရောင်း'].includes(str(r.active).toLowerCase())
    const product = { id, nameMy, nameEn: str(r.name_en), category, costKs: cost, wholesalePriceKs: wsPrice, wholesaleMin: wsMin, active }

    if (kind === 'length') {
      if (existing) return err(`fabric "${nameMy}" appears twice`)
      const unitName = str(r.pricing_unit)
      const unit = unitName ? units.find((u) => u.pricing && (u.code === unitName || u.nameMy === unitName)) : units.find((u) => u.code === 'gaik')
      if (!unit) return err(`unknown pricing_unit "${unitName}"`)
      const w = myDigits(str(r.width_inches))
      if (w && !/^\d+(\.\d)?$/.test(w)) return err(`width_inches must be a number like 45 or 58.4 (got "${w}")`)
      byKey.set(key, {
        kind, ...product,
        pricingUnit: unit.code, unitPriceKs: price,
        widthTenths: w ? Math.round(Number(w) * 10) : undefined,
        barcode: barcode || undefined,
        variants: [],
      })
      return
    }

    if (variantId && existing?.variants.some((v) => v.id === variantId)) return err(`variant_id ${variantId} appears twice`)
    const p = existing ?? { kind, ...product, priceKs: price, variants: [] }
    p.variants.push({
      id: variantId,
      size: str(r.size) || undefined,
      colour: str(r.colour) || undefined,
      priceKs: price !== p.priceKs ? price : undefined,
      barcode: barcode || undefined,
    })
    byKey.set(key, p)
  })

  return { products: [...byKey.values()], errors }
}
