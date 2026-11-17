import { roundFraction } from '../core/pricing'
import { audit } from './audit'
import { owingOn } from './debts'
import { type CreditLine, type CreditNote, type Sale, type SaleLine, db } from './schema'
import { getSetting, setSetting } from './settings'
import { currentUserId, requireRole } from './users'

export interface ReturnItem {
  saleLineId: number
  qty?: number // clothes: how many come back
  toRoll?: boolean // fabric: whole cut comes back; true = back onto its roll, false = written off
}

export interface Returned {
  qty: number
  fabric: boolean
}

const TABLES = () => [db.sales, db.saleLines, db.creditNotes, db.creditLines, db.payments, db.settings, db.variants, db.rolls, db.stockMoves, db.audit]

/** What has already come back from each line of a sale. */
export async function returnedSoFar(saleId: string): Promise<Map<number, Returned>> {
  const m = new Map<number, Returned>()
  for (const c of await db.creditLines.where('saleId').equals(saleId).toArray()) {
    const r = m.get(c.saleLineId) ?? { qty: 0, fabric: false }
    m.set(c.saleLineId, { qty: r.qty + (c.qty ?? 0), fabric: r.fabric || c.lengthTenths != null })
  }
  return m
}

/** Refund share of a line, including its part of CT (and any sale discount): line × total / subtotal. */
const share = (amountKs: number, sale: Sale) => (sale.subtotalKs ? roundFraction(amountKs * sale.totalKs, sale.subtotalKs, 1, 'nearest') : amountKs)

async function putBack(l: SaleLine, qty: number, toRoll: boolean, at: number, userId: number, refId: string) {
  if (l.kind === 'piece') {
    const v = l.variantId != null ? await db.variants.get(l.variantId) : undefined
    if (v) await db.variants.update(v.id!, { qty: v.qty + qty })
    await db.stockMoves.add({ at, userId, reason: 'return', refId, productId: l.productId, variantId: l.variantId, deltaQty: qty })
  } else if (toRoll && l.rollId != null) {
    const r = await db.rolls.get(l.rollId)
    if (r) {
      const remainingTenths = r.remainingTenths + (l.lengthTenths ?? 0)
      await db.rolls.update(r.id!, { remainingTenths, ...(r.status === 'finished' && remainingTenths > 0 ? { status: 'active' as const } : {}) })
      await db.stockMoves.add({ at, userId, reason: 'return', refId, productId: l.productId, rollId: r.id, deltaTenths: l.lengthTenths })
    }
  }
}

/**
 * Return goods against a completed sale. Creates a numbered credit note (never edits the sale),
 * puts stock back, and for a refund records the money paid back. An exchange keeps the value as credit.
 * If the customer still owes on the sale, the returned value first cancels that debt (toDebtKs); only the rest is refunded / credited.
 */
export async function createReturn(o: { saleId: string; items: ReturnItem[]; type: CreditNote['type']; reason: string; refundMethod?: string; approvedBy?: number }): Promise<CreditNote & { toDebtKs: number }> {
  await requireRole('manager', o.approvedBy) // a seller needs a manager to enter their PIN
  return db.transaction('rw', TABLES(), async () => {
    const userId = currentUserId()
    const sale = await db.sales.get(o.saleId)
    if (!sale || sale.status !== 'completed') throw new Error('Sale not found or void')
    if (!o.reason.trim()) throw new Error('A reason is required')
    if (o.type === 'refund' && !o.refundMethod) throw new Error('Refund method required')
    const lines = new Map((await db.saleLines.where('saleId').equals(sale.id).toArray()).map((l) => [l.id!, l]))
    const done = await returnedSoFar(sale.id)

    const seq = (await getSetting('creditSeq')) + 1
    const id = `CN-${await getSetting('devicePrefix')}-${String(seq).padStart(6, '0')}`
    const at = Date.now()
    const out: CreditLine[] = []
    for (const it of o.items) {
      const l = lines.get(it.saleLineId)
      if (!l) throw new Error('Line not in this sale')
      const prev = done.get(l.id!)
      if (l.kind === 'piece') {
        const qty = it.qty ?? 0
        if (!Number.isInteger(qty) || qty <= 0 || qty > (l.qty ?? 0) - (prev?.qty ?? 0)) throw new Error(`Cannot return ${qty} of ${l.nameMy}`)
        out.push({ creditId: id, saleId: sale.id, saleLineId: l.id!, qty, toRoll: false, amountKs: share(l.unitPriceKs * qty, sale) })
        await putBack(l, qty, false, at, userId, id)
      } else {
        if (prev?.fabric) throw new Error(`${l.nameMy} already returned`)
        out.push({ creditId: id, saleId: sale.id, saleLineId: l.id!, lengthTenths: l.lengthTenths, toRoll: !!it.toRoll, amountKs: share(l.lineTotalKs, sale) })
        await putBack(l, 0, !!it.toRoll, at, userId, id)
      }
    }
    if (!out.length) throw new Error('Nothing to return')

    const cn: CreditNote = { id, saleId: sale.id, at, userId, approvedBy: o.approvedBy ?? userId, reason: o.reason.trim(), type: o.type, totalKs: out.reduce((s, c) => s + c.amountKs, 0) }
    await db.creditNotes.add(cn)
    await db.creditLines.bulkAdd(out)
    // Paid with the returned goods' value (method 'credit', ref = this credit note): exchange credit left shrinks by the same amount.
    const toDebtKs = Math.min(await owingOn(sale), cn.totalKs)
    if (toDebtKs) await db.payments.add({ saleId: sale.id, method: 'credit', ref: id, amountKs: toDebtKs, at })
    if (o.type === 'refund' && cn.totalKs > toDebtKs) await db.payments.add({ saleId: id, method: o.refundMethod!, amountKs: toDebtKs - cn.totalKs, at })
    await setSetting('creditSeq', seq)
    await audit(`return.${o.type}`, `sale:${sale.id}`, undefined, { ...cn, lines: out, toDebtKs })
    return { ...cn, toDebtKs }
  })
}

/** Exchange credit still unused on a credit note. */
export async function creditLeft(cnId: string): Promise<number> {
  const cn = await db.creditNotes.get(cnId)
  if (!cn || cn.type !== 'exchange') return 0
  const used = (await db.payments.filter((p) => (p.method === 'credit' && p.ref === cnId) || p.saleId === cnId).toArray()).reduce((s, p) => s + Math.abs(p.amountKs), 0)
  return Math.max(0, cn.totalKs - used)
}

/** Pay out unused exchange credit (e.g. customer wants money instead, or new items cost less). */
export async function payOutCredit(cnId: string, method: string, amountKs: number, approvedBy?: number) {
  await requireRole('manager', approvedBy)
  return db.transaction('rw', [db.creditNotes, db.payments, db.audit], async () => {
    if (amountKs <= 0 || amountKs > (await creditLeft(cnId))) throw new Error('More than the credit left')
    await db.payments.add({ saleId: cnId, method, amountKs: -amountKs, at: Date.now() })
    await audit('credit.payout', `credit:${cnId}`, undefined, { method, amountKs, approvedBy })
  })
}

/** Cancel a mistaken sale: keeps its number (marked VOID), puts all stock back. Not allowed after a return. */
export async function voidSale(saleId: string, reason: string, approvedBy?: number) {
  await requireRole('manager', approvedBy)
  const userId = currentUserId()
  return db.transaction('rw', TABLES(), async () => {
    const sale = await db.sales.get(saleId)
    if (!sale || sale.status !== 'completed') throw new Error('Sale not found or already void')
    if (!reason.trim()) throw new Error('A reason is required')
    if ((await db.creditNotes.where('saleId').equals(saleId).count()) > 0) throw new Error('This sale has returns; use a return instead')
    const at = Date.now()
    for (const l of await db.saleLines.where('saleId').equals(saleId).toArray()) await putBack(l, l.qty ?? 0, true, at, userId, saleId)
    await db.sales.update(saleId, { status: 'void', voidReason: reason.trim(), voidBy: approvedBy ?? userId })
    await audit('sale.void', `sale:${saleId}`, { status: 'completed' }, { status: 'void', reason, approvedBy }, userId)
  })
}
