import { audit } from './audit'
import { type MoveReason, db } from './schema'

/** Every stock change is a StockMove (append-only) plus the cached figure on the roll / variant, in one transaction. */

export function receiveRoll(productId: number, tenths: number, userId = 0, note?: string): Promise<number> {
  return db.transaction('rw', [db.rolls, db.stockMoves, db.audit], async () => {
    if (!Number.isSafeInteger(tenths) || tenths <= 0) throw new Error('Roll length must be above 0')
    const at = Date.now()
    const rollId = (await db.rolls.add({ productId, startTenths: tenths, remainingTenths: tenths, status: 'active', receivedAt: at })) as number
    await db.stockMoves.add({ at, userId, reason: 'receive', productId, rollId, deltaTenths: tenths, note })
    await audit('stock.receiveRoll', `roll:${rollId}`, undefined, { productId, tenths, note }, userId)
    return rollId
  })
}

export function receivePieces(variantId: number, qty: number, userId = 0, note?: string) {
  return db.transaction('rw', [db.variants, db.stockMoves, db.audit], async () => {
    if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error('Quantity must be above 0')
    const v = await db.variants.get(variantId)
    if (!v) throw new Error('Variant not found')
    await db.variants.update(variantId, { qty: v.qty + qty })
    await db.stockMoves.add({ at: Date.now(), userId, reason: 'receive', productId: v.productId, variantId, deltaQty: qty, note })
    await audit('stock.receivePieces', `variant:${variantId}`, { qty: v.qty }, { qty: v.qty + qty, note }, userId)
  })
}

type AdjustReason = Extract<MoveReason, 'adjust' | 'waste' | 'count'>

/** Set a roll to what was measured. A reason is always required. */
export function setRollLength(rollId: number, tenths: number, reason: AdjustReason, note: string, userId = 0) {
  return db.transaction('rw', [db.rolls, db.stockMoves, db.audit], async () => {
    if (!Number.isSafeInteger(tenths) || tenths < 0) throw new Error('Length must be 0 or more')
    if (reason !== 'count' && !note.trim()) throw new Error('A reason is required')
    const r = await db.rolls.get(rollId)
    if (!r) throw new Error('Roll not found')
    const status = tenths === 0 ? 'finished' : r.status === 'finished' ? 'active' : r.status
    await db.rolls.update(rollId, { remainingTenths: tenths, status })
    await db.stockMoves.add({ at: Date.now(), userId, reason, note, productId: r.productId, rollId, deltaTenths: tenths - r.remainingTenths })
    await audit(`stock.${reason}`, `roll:${rollId}`, { remainingTenths: r.remainingTenths, status: r.status }, { remainingTenths: tenths, status, note }, userId)
  })
}

/** Set pieces to what was counted. A reason is always required. */
export function setPieces(variantId: number, qty: number, reason: AdjustReason, note: string, userId = 0) {
  return db.transaction('rw', [db.variants, db.stockMoves, db.audit], async () => {
    if (!Number.isSafeInteger(qty) || qty < 0) throw new Error('Quantity must be 0 or more')
    if (reason !== 'count' && !note.trim()) throw new Error('A reason is required')
    const v = await db.variants.get(variantId)
    if (!v) throw new Error('Variant not found')
    await db.variants.update(variantId, { qty })
    await db.stockMoves.add({ at: Date.now(), userId, reason, note, productId: v.productId, variantId, deltaQty: qty - v.qty })
    await audit(`stock.${reason}`, `variant:${variantId}`, { qty: v.qty }, { qty, note }, userId)
  })
}

/** Remnant: a fixed price for the whole piece, or a % off the normal price. */
export function markRemnant(rollId: number, price: { wholeKs: number } | { pct: number } | null, userId = 0) {
  return db.transaction('rw', [db.rolls, db.audit], async () => {
    const r = await db.rolls.get(rollId)
    if (!r || r.status === 'finished') throw new Error('Roll not available')
    if (price && 'pct' in price && !(Number.isInteger(price.pct) && price.pct > 0 && price.pct < 100)) throw new Error('Discount must be 1–99 %')
    if (price && 'wholeKs' in price && !(Number.isSafeInteger(price.wholeKs) && price.wholeKs > 0)) throw new Error('Price must be above 0')
    const patch = price
      ? { status: 'remnant' as const, remnantPriceKs: 'wholeKs' in price ? price.wholeKs : undefined, remnantPct: 'pct' in price ? price.pct : undefined }
      : { status: 'active' as const, remnantPriceKs: undefined, remnantPct: undefined }
    await db.rolls.update(rollId, patch)
    await audit(price ? 'stock.markRemnant' : 'stock.unmarkRemnant', `roll:${rollId}`, r, patch, userId)
  })
}
