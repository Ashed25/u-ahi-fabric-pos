import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPiece } from '../core/cart'
import { summarize } from '../core/summary'
import { listDebts, payDebt } from './debts'
import { createReturn } from './returns'
import { completeSale } from './sales'
import { db } from './schema'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function cart(qty = 2) {
  const pid = (await db.products.add({ kind: 'piece', nameMy: 'ရှပ်', nameEn: '', active: true, priceKs: 10000, updatedAt: 0 })) as number
  const vid = (await db.variants.add({ productId: pid, size: 'M', qty: 9 })) as number
  let lines = addPiece([], { productId: pid, variantId: vid, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 10000 })
  for (let i = 1; i < qty; i++) lines = addPiece(lines, { productId: pid, variantId: vid, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 10000 })
  return lines
}

describe('debts', () => {
  it('a partly paid sale needs a name; the rest is owed', async () => {
    const lines = await cart()
    await expect(completeSale(lines, [{ method: 'cash', amountKs: 5000 }])).rejects.toThrow(/≠ total/)
    await expect(completeSale(lines, [{ method: 'cash', amountKs: 25000 }], { debtor: { name: 'x' } })).rejects.toThrow(/> total/)
    const { sale } = await completeSale(lines, [{ method: 'cash', amountKs: 5000 }], { debtor: { name: ' Ko Aung ', phone: '09 123' } })
    expect(sale).toMatchObject({ totalKs: 20000, debtor: 'Ko Aung', debtorPhone: '09 123' })
    await completeSale(lines, [], { debtor: { name: 'ko  aung' } }) // nothing paid; same person, typed differently
    const [d] = await listDebts()
    expect(d).toMatchObject({ key: 'ko aung', owingKs: 35000 })
    expect(d.sales.map((s) => s.owingKs)).toEqual([15000, 20000])
  })

  it('a later payment pays the oldest sale first and counts on the day it is paid', async () => {
    const lines = await cart()
    const a = (await completeSale(lines, [{ method: 'cash', amountKs: 5000 }], { debtor: { name: 'Ma Hla' } })).sale
    const b = (await completeSale(lines, [], { debtor: { name: 'Ma Hla' } })).sale
    await expect(payDebt('ma hla', 'cash', 36000)).rejects.toThrow(/More than/)
    const paid = await payDebt('ma hla', 'kbzpay', 25000, 'TX9')
    expect(paid.map((p) => [p.saleId, p.amountKs])).toEqual([[a.id, 15000], [b.id, 10000]])
    expect((await listDebts())[0].owingKs).toBe(10000)

    // Day summary: sale-time payments + payments made "today" (the later ones, with `at`).
    const sales = await db.sales.toArray()
    const pays = await db.payments.toArray()
    const s = summarize(sales, [], pays, [])
    expect(s.byMethod).toEqual({ cash: 5000, kbzpay: 25000 })
    expect(s.debtKs).toBe(35000) // left unpaid at the time of sale
    expect(s.debtPaidKs).toBe(25000)
    // A later day that only sees the later payments: money counted there, no new debt.
    expect(summarize([], [], pays.filter((p) => p.at), [])).toMatchObject({ byMethod: { kbzpay: 25000 }, debtKs: 0, debtPaidKs: 25000 })

    await payDebt('ma hla', 'cash', 10000)
    expect(await listDebts()).toEqual([])
  })

  it('a return on a debt sale cancels debt first, then refunds the rest', async () => {
    const lines = await cart(3) // 30000
    const { sale } = await completeSale(lines, [{ method: 'cash', amountKs: 25000 }], { debtor: { name: 'U Ba' } })
    const line = (await db.saleLines.where('saleId').equals(sale.id).first())!
    const cn = await createReturn({ saleId: sale.id, items: [{ saleLineId: line.id!, qty: 1 }], type: 'refund', reason: 'size', refundMethod: 'cash' })
    expect(cn).toMatchObject({ totalKs: 10000, toDebtKs: 5000 })
    expect(await listDebts()).toEqual([])
    const refund = await db.payments.where('saleId').equals(cn.id).toArray()
    expect(refund.map((p) => p.amountKs)).toEqual([-5000])
  })
})
