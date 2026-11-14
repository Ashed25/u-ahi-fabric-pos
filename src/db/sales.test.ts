import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addPiece, type CartLine } from '../core/cart'
import { db } from './schema'
import { completeSale, parkSale, resumeParked, saleDetail } from './sales'
import { setSetting } from './settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function setup() {
  const pid = (await db.products.add({ kind: 'piece', nameMy: 'ရှပ်', nameEn: '', active: true, priceKs: 15000, updatedAt: 0 })) as number
  const vid = (await db.variants.add({ productId: pid, size: 'M', qty: 5 })) as number
  const fid = (await db.products.add({ kind: 'length', nameMy: 'ပိုး', nameEn: '', active: true, pricingUnit: 'gaik', unitPriceKs: 8000, updatedAt: 0 })) as number
  const rid = (await db.rolls.add({ productId: fid, startTenths: 18000, remainingTenths: 18000, status: 'active', receivedAt: 1 })) as number
  const lines: CartLine[] = [
    ...addPiece([], { productId: pid, variantId: vid, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 }),
    { key: 'k', kind: 'length', productId: fid, nameMy: 'ပိုး', sub: '', entered: [{ unit: 'taung', count: 3 }], lengthTenths: 540, unitPriceKs: 8000, pricingUnit: 'gaik', unitTenths: 360, lineTotalKs: 12000 },
  ]
  return { vid, rid, lines }
}

describe('completeSale', () => {
  it('records a sale with gap-free numbers, lines, payments and stock', async () => {
    const { vid, rid, lines } = await setup()
    const a = await completeSale(lines, [{ method: 'cash', amountKs: 27000, tenderedKs: 30000, changeKs: 3000 }])
    const b = await completeSale(lines, [{ method: 'kbzpay', amountKs: 20000, ref: 'TX1' }, { method: 'cash', amountKs: 7000 }])
    expect([a.sale.id, b.sale.id]).toEqual(['A-000001', 'A-000002'])

    const d = (await saleDetail('A-000001'))!
    expect(d.sale.totalKs).toBe(27000)
    expect(d.lines.find((l) => l.kind === 'length')).toMatchObject({ entered: [{ unit: 'taung', count: 3 }], lengthTenths: 540, rollId: rid })
    expect(d.payments[0]).toMatchObject({ tenderedKs: 30000, changeKs: 3000 })
    expect((await db.variants.get(vid))!.qty).toBe(3)
    expect((await db.rolls.get(rid))!.remainingTenths).toBe(18000 - 2 * 540)
    expect(await db.stockMoves.count()).toBe(4)
  })

  it('a rejected sale writes nothing and does not use a number', async () => {
    const { lines } = await setup()
    await expect(completeSale(lines, [{ method: 'cash', amountKs: 1000 }])).rejects.toThrow(/≠ total/)
    await expect(completeSale(lines, [{ method: 'kbzpay', amountKs: 27000, changeKs: 500 }])).rejects.toThrow(/cash/)
    await expect(completeSale([], [])).rejects.toThrow(/Empty/)
    expect(await db.sales.count()).toBe(0)
    expect(await db.stockMoves.count()).toBe(0)
    const ok = await completeSale(lines, [{ method: 'cash', amountKs: 27000 }])
    expect(ok.sale.id).toBe('A-000001')
  })

  it('cuts from the chosen roll and finishes a roll cut to zero', async () => {
    const { rid, lines } = await setup()
    const fid = lines[1].productId
    const small = (await db.rolls.add({ productId: fid, startTenths: 540, remainingTenths: 540, status: 'remnant', remnantPriceKs: 9000, receivedAt: 2 })) as number
    const fabric = { ...lines[1], rollId: small, wholeRemnant: true, lineTotalKs: 9000 } as CartLine
    await completeSale([fabric], [{ method: 'cash', amountKs: 9000 }])
    expect(await db.rolls.get(small)).toMatchObject({ remainingTenths: 0, status: 'finished' })
    expect((await db.rolls.get(rid))!.remainingTenths).toBe(18000)
    expect((await db.saleLines.toArray())[0]).toMatchObject({ rollId: small, wholeRemnant: true, lineTotalKs: 9000 })
  })

  it('practice mode records nothing', async () => {
    const { vid, lines } = await setup()
    await setSetting('practiceMode', true)
    const r = await completeSale(lines, [{ method: 'cash', amountKs: 27000 }])
    expect(r.practice).toBe(true)
    expect(await db.sales.count()).toBe(0)
    expect((await db.variants.get(vid))!.qty).toBe(5)
    await setSetting('practiceMode', false)
    expect((await completeSale(lines, [{ method: 'cash', amountKs: 27000 }])).sale.id).toBe('A-000001')
  })

  it('uses the device prefix and CT when registered', async () => {
    const { lines } = await setup()
    await setSetting('devicePrefix', 'B')
    await setSetting('ct', { registered: true, rateBp: 500, inclusive: false })
    const r = await completeSale(lines, [{ method: 'cash', amountKs: 28350 }])
    expect(r.sale).toMatchObject({ id: 'B-000001', subtotalKs: 27000, ctKs: 1350, totalKs: 28350 })
    expect((await db.saleLines.toArray()).every((l) => l.ctRateBp === 500)).toBe(true)
  })

  it('held sales come back exactly and leave the held list', async () => {
    const { lines } = await setup()
    const id = (await parkSale(lines)) as number
    expect(await resumeParked(id)).toEqual(lines)
    expect(await db.parked.count()).toBe(0)
  })
})
