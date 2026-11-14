import type { EnteredLength } from './length'
import { type CtSettings, applyCt } from './tax'

export interface PieceLine {
  key: string
  kind: 'piece'
  productId: number
  variantId: number
  nameMy: string
  sub: string // size · colour
  unitPriceKs: number
  qty: number
}

export interface LengthLine {
  key: string
  kind: 'length'
  productId: number
  nameMy: string
  sub: string // width
  entered: EnteredLength // exactly as the seller built it
  lengthTenths: number
  unitPriceKs: number // price per pricing unit
  pricingUnit: string
  unitTenths: number
  lineTotalKs: number // already rounded per line
  rollId?: number // roll the seller cut from (default: the open roll)
  remnantPct?: number // remnant sold at % off
  wholeRemnant?: boolean // remnant sold whole at its fixed price
}

export type CartLine = PieceLine | LengthLine

export const lineTotal = (l: CartLine) => (l.kind === 'piece' ? l.unitPriceKs * l.qty : l.lineTotalKs)

let n = 0
export const newKey = () => `${Date.now().toString(36)}-${(n++).toString(36)}`

/** Scanning the same size/colour again adds to its quantity instead of a new line. */
export function addPiece(lines: CartLine[], item: Omit<PieceLine, 'key' | 'kind' | 'qty'>): CartLine[] {
  const i = lines.findIndex((l) => l.kind === 'piece' && l.variantId === item.variantId)
  if (i === -1) return [...lines, { ...item, kind: 'piece', qty: 1, key: newKey() }]
  // Move it to the end so "remove last" removes what was just scanned.
  const line = lines[i] as PieceLine
  return [...lines.filter((_, j) => j !== i), { ...line, qty: line.qty + 1 }]
}

/** "Remove last item": one piece off the last line, or the whole last fabric cut. */
export function removeLast(lines: CartLine[]): CartLine[] {
  const last = lines.at(-1)
  if (!last) return lines
  if (last.kind === 'piece' && last.qty > 1) return [...lines.slice(0, -1), { ...last, qty: last.qty - 1 }]
  return lines.slice(0, -1)
}

export function setQty(lines: CartLine[], key: string, qty: number): CartLine[] {
  return qty <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key && l.kind === 'piece' ? { ...l, qty } : l))
}

export interface Totals {
  subtotalKs: number
  discountKs: number
  ctKs: number
  totalKs: number
}

/** CT applies once on the sale (after discount). When not registered, total = subtotal. */
export function cartTotals(lines: CartLine[], ct: CtSettings, discountKs = 0): Totals {
  const subtotalKs = lines.reduce((s, l) => s + lineTotal(l), 0)
  const t = applyCt(subtotalKs - discountKs, ct)
  return { subtotalKs, discountKs, ctKs: t.ctKs, totalKs: t.totalKs }
}
