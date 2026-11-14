import { type CartLine, cartTotals } from '../core/cart'
import { defaultRoll, sellableRolls } from '../core/stock'
import { type Payment, type Sale, type SaleLine, db } from './schema'
import { getSetting, setSetting } from './settings'

export type PaymentInput = Omit<Payment, 'id' | 'saleId'>

export const saleNo = (prefix: string, seq: number) => `${prefix}-${String(seq).padStart(6, '0')}`

export interface CompleteResult {
  sale: Sale
  practice: boolean
}

/**
 * Records a sale atomically: number, lines, payments and stock in ONE transaction,
 * so a failed sale never uses up a number (no gaps) and never half-saves.
 * Practice mode validates the same way but writes nothing.
 */
export async function completeSale(lines: CartLine[], payments: PaymentInput[], userId = 0): Promise<CompleteResult> {
  return db.transaction('rw', [db.sales, db.saleLines, db.payments, db.settings, db.variants, db.rolls, db.stockMoves], async () => {
    if (!lines.length) throw new Error('Empty sale')
    const ct = await getSetting('ct')
    const totals = cartTotals(lines, ct)
    for (const p of payments) {
      if (!Number.isSafeInteger(p.amountKs) || p.amountKs <= 0) throw new Error(`Bad payment amount ${p.amountKs}`)
      if (p.changeKs && p.method !== 'cash') throw new Error('Change can only be given in cash')
    }
    const paid = payments.reduce((s, p) => s + p.amountKs, 0)
    if (paid !== totals.totalKs) throw new Error(`Payments ${paid} ≠ total ${totals.totalKs}`)

    const practice = await getSetting('practiceMode')
    const prefix = await getSetting('devicePrefix')
    const seq = (await getSetting('saleSeq')) + 1
    const now = Date.now()
    const sale: Sale = { id: practice ? 'PRACTICE' : saleNo(prefix, seq), deviceId: prefix, seq, at: now, userId, status: 'completed', ...totals }
    if (practice) return { sale, practice }

    await db.sales.add(sale)
    const ctRateBp = ct.registered ? ct.rateBp : 0
    for (const l of lines) {
      const row: SaleLine =
        l.kind === 'piece'
          ? { saleId: sale.id, productId: l.productId, variantId: l.variantId, kind: 'piece', qty: l.qty, nameMy: l.nameMy, sub: l.sub || undefined, unitPriceKs: l.unitPriceKs, ctRateBp, lineTotalKs: l.unitPriceKs * l.qty }
          : { saleId: sale.id, productId: l.productId, kind: 'length', entered: l.entered, lengthTenths: l.lengthTenths, nameMy: l.nameMy, sub: l.sub || undefined, unitPriceKs: l.unitPriceKs, pricingUnit: l.pricingUnit, unitTenths: l.unitTenths, ctRateBp, lineTotalKs: l.lineTotalKs, remnantPct: l.remnantPct, wholeRemnant: l.wholeRemnant }
      if (l.kind === 'piece') {
        const v = await db.variants.get(l.variantId)
        if (v) await db.variants.update(v.id!, { qty: v.qty - l.qty })
        await db.stockMoves.add({ at: now, userId, reason: 'sale', refId: sale.id, productId: l.productId, variantId: l.variantId, deltaQty: -l.qty })
      } else {
        // The roll the seller chose, else the open roll. A roll cut to 0 (or below) is finished.
        const rolls = await db.rolls.where('productId').equals(l.productId).toArray()
        const roll = sellableRolls(rolls).find((r) => r.id === l.rollId) ?? defaultRoll(rolls)
        if (roll) {
          const remainingTenths = roll.remainingTenths - l.lengthTenths
          await db.rolls.update(roll.id!, { remainingTenths, ...(remainingTenths <= 0 ? { status: 'finished' as const } : {}) })
          row.rollId = roll.id
        }
        await db.stockMoves.add({ at: now, userId, reason: 'sale', refId: sale.id, productId: l.productId, rollId: roll?.id, deltaTenths: -l.lengthTenths })
      }
      await db.saleLines.add(row)
    }
    for (const p of payments) await db.payments.add({ ...p, saleId: sale.id })
    await setSetting('saleSeq', seq)
    return { sale, practice }
  })
}

export function parkSale(lines: CartLine[], userId = 0) {
  return db.parked.add({ at: Date.now(), userId, cart: lines })
}

/** Takes a held sale back out (removing it from the held list). */
export function resumeParked(id: number): Promise<CartLine[]> {
  return db.transaction('rw', db.parked, async () => {
    const p = await db.parked.get(id)
    await db.parked.delete(id)
    return (p?.cart as CartLine[]) ?? []
  })
}

export async function saleDetail(id: string) {
  const [sale, lines, payments] = await Promise.all([db.sales.get(id), db.saleLines.where('saleId').equals(id).toArray(), db.payments.where('saleId').equals(id).toArray()])
  return sale ? { sale, lines, payments } : undefined
}
