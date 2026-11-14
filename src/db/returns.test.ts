import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPiece, type CartLine } from '../core/cart'
import { summarize } from '../core/summary'
import { createReturn, creditLeft, payOutCredit, returnedSoFar, voidSale } from './returns'
import { completeSale } from './sales'
import { db } from './schema'
import { setSetting } from './settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function sold() {
  const pid = (await db.products.add({ kind: 'piece', nameMy: 'ရှပ်', nameEn: '', active: true, priceKs: 15000, updatedAt: 0 })) as number
  const vid = (await db.variants.add({ productId: pid, size: 'M', qty: 5 })) as number
  const fid = (await db.products.add({ kind: 'length', nameMy: 'ပိုး', nameEn: '', active: true, pricingUnit: 'gaik', unitPriceKs: 8000, updatedAt: 0 })) as number
  const rid = (await db.rolls.add({ productId: fid, startTenths: 540, remainingTenths: 540, status: 'active', receivedAt: 1 })) as number
  let lines: CartLine[] = addPiece([], { productId: pid, variantId: vid, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 })
  lines = addPiece(lines, { productId: pid, variantId: vid, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 })
  lines.push({ key: 'f', kind: 'length', productId: fid, nameMy: 'ပိုး', sub: '', entered: [{ unit: 'taung', count: 3 }], lengthTenths: 540, unitPriceKs: 8000, pricingUnit: 'gaik', unitTenths: 360, lineTotalKs: 12000 })
  const { sale } = await completeSale(lines, [{ method: 'cash', amountKs: 42000 }])
  const saleLines = await db.saleLines.where('saleId').equals(sale.id).toArray()
  return { sale, vid, rid, shirtLine: saleLines.find((l) => l.kind === 'piece')!.id!, silkLine: saleLines.find((l) => l.kind === 'length')!.id! }
}

describe('returns', () => {
  it('refund: credit note, stock back, money paid back; cannot over-return', async () => {
    const { sale, vid, rid, shirtLine, silkLine } = await sold()
    expect((await db.rolls.get(rid))!.status).toBe('finished')
    const cn = await createReturn({ saleId: sale.id, items: [{ saleLineId: shirtLine, qty: 1 }, { saleLineId: silkLine, toRoll: true }], type: 'refund', reason: 'wrong size', refundMethod: 'cash' })
    expect(cn).toMatchObject({ id: 'CN-A-000001', totalKs: 27000, type: 'refund' })
    expect((await db.variants.get(vid))!.qty).toBe(4)
    expect(await db.rolls.get(rid)).toMatchObject({ remainingTenths: 540, status: 'active' })
    expect(await db.payments.where('saleId').equals(cn.id).toArray()).toMatchObject([{ method: 'cash', amountKs: -27000 }])
    expect((await db.sales.get(sale.id))!.status).toBe('completed') // the sale itself is never edited

    expect((await returnedSoFar(sale.id)).get(shirtLine)).toEqual({ qty: 1, fabric: false })
    await expect(createReturn({ saleId: sale.id, items: [{ saleLineId: shirtLine, qty: 2 }], type: 'refund', reason: 'x', refundMethod: 'cash' })).rejects.toThrow(/Cannot return/)
    await expect(createReturn({ saleId: sale.id, items: [{ saleLineId: silkLine }], type: 'refund', reason: 'x', refundMethod: 'cash' })).rejects.toThrow(/already/)
    await expect(createReturn({ saleId: sale.id, items: [{ saleLineId: shirtLine, qty: 1 }], type: 'refund', reason: ' ', refundMethod: 'cash' })).rejects.toThrow(/reason/)
    expect(await db.creditNotes.count()).toBe(1)
  })

  it('written-off fabric does not go back on the roll', async () => {
    const { sale, rid, silkLine } = await sold()
    await createReturn({ saleId: sale.id, items: [{ saleLineId: silkLine, toRoll: false }], type: 'refund', reason: 'stained', refundMethod: 'kbzpay' })
    expect((await db.rolls.get(rid))!.remainingTenths).toBe(0)
  })

  it('refund includes the CT share when CT was added on top', async () => {
    await setSetting('ct', { registered: true, rateBp: 500, inclusive: false })
    const pid = (await db.products.add({ kind: 'piece', nameMy: 'x', nameEn: '', active: true, priceKs: 10000, updatedAt: 0 })) as number
    const vid = (await db.variants.add({ productId: pid, qty: 1 })) as number
    const { sale } = await completeSale(addPiece([], { productId: pid, variantId: vid, nameMy: 'x', sub: '', unitPriceKs: 10000 }), [{ method: 'cash', amountKs: 10500 }])
    const [line] = await db.saleLines.toArray()
    const cn = await createReturn({ saleId: sale.id, items: [{ saleLineId: line.id!, qty: 1 }], type: 'refund', reason: 'r', refundMethod: 'cash' })
    expect(cn.totalKs).toBe(10500)
  })

  it('exchange: credit pays the next sale, leftover paid back in cash, cannot be used twice', async () => {
    const { sale, shirtLine, vid } = await sold()
    const cn = await createReturn({ saleId: sale.id, items: [{ saleLineId: shirtLine, qty: 2 }], type: 'exchange', reason: 'size' })
    expect(await creditLeft(cn.id)).toBe(30000)
    const cheaper = addPiece([], { productId: 1, variantId: vid, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 25000 })
    await completeSale(cheaper, [{ method: 'credit', amountKs: 25000, ref: cn.id }], { creditPayout: { cnId: cn.id, method: 'cash', amountKs: 5000 } })
    expect(await creditLeft(cn.id)).toBe(0)
    await expect(completeSale(cheaper, [{ method: 'credit', amountKs: 25000, ref: cn.id }])).rejects.toThrow(/credit/)
    await expect(payOutCredit(cn.id, 'cash', 1)).rejects.toThrow()
  })

  it('void keeps the number, restores stock, and is blocked after a return', async () => {
    const a = await sold()
    await voidSale(a.sale.id, 'rang up twice')
    expect(await db.sales.get(a.sale.id)).toMatchObject({ status: 'void', voidReason: 'rang up twice' })
    expect((await db.variants.get(a.vid))!.qty).toBe(5)
    expect((await db.rolls.get(a.rid))!.remainingTenths).toBe(540)
    await expect(voidSale(a.sale.id, 'again')).rejects.toThrow()

    const lines = [{ key: 'f', kind: 'length' as const, productId: 2, nameMy: 'ပိုး', sub: '', entered: [], lengthTenths: 180, unitPriceKs: 8000, pricingUnit: 'gaik', unitTenths: 360, lineTotalKs: 4000 }]
    const b = await completeSale(lines, [{ method: 'cash', amountKs: 4000 }])
    expect(b.sale.id).toBe('A-000002')
    const [bl] = await db.saleLines.where('saleId').equals(b.sale.id).toArray()
    await createReturn({ saleId: b.sale.id, items: [{ saleLineId: bl.id!, toRoll: true }], type: 'refund', reason: 'r', refundMethod: 'cash' })
    await expect(voidSale(b.sale.id, 'x')).rejects.toThrow(/returns/)
  })

  it('daily summary: totals, methods, refunds, cash, pieces and fabric', async () => {
    const { sale, shirtLine } = await sold()
    await completeSale(addPiece([], { productId: 1, variantId: 1, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 }), [{ method: 'kbzpay', amountKs: 15000, ref: 'T' }])
    await createReturn({ saleId: sale.id, items: [{ saleLineId: shirtLine, qty: 1 }], type: 'refund', reason: 'r', refundMethod: 'cash' })
    const s = summarize(await db.sales.toArray(), await db.saleLines.toArray(), await db.payments.toArray(), await db.creditNotes.toArray())
    expect(s).toMatchObject({ count: 2, totalKs: 57000, byMethod: { cash: 42000, kbzpay: 15000 }, refundsKs: 15000, paidOutByMethod: { cash: 15000 }, netKs: 42000, cashNetKs: 27000, pieces: 3 })
    expect(s.fabric).toEqual([{ productId: 2, nameMy: 'ပိုး', tenths: 540 }])
  })
})
