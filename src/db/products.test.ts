import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { assignBarcode, deleteCategory, deleteProduct, findByBarcode, importProducts, removeBarcode, saveProduct } from './products'
import { isValidEan13 } from '../core/barcode'
import { getSetting } from './settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const shirt = { kind: 'piece' as const, nameMy: 'ရှပ်', nameEn: '', active: true, priceKs: 15000, updatedAt: 0 }
const silk = { kind: 'length' as const, nameMy: 'ပိုး', nameEn: '', active: true, pricingUnit: 'gaik', unitPriceKs: 8000, updatedAt: 0 }

describe('products & barcodes', () => {
  it('generates one valid barcode per variant and per fabric', async () => {
    const pid = await saveProduct(shirt, [{ productId: 0, size: 'M', qty: 0 }, { productId: 0, size: 'L', qty: 0 }])
    const fid = await saveProduct(silk)
    const codes = await db.barcodes.toArray()
    expect(codes).toHaveLength(3)
    expect(codes.every((b) => isValidEan13(b.code) && b.source === 'generated')).toBe(true)
    expect(codes.filter((b) => b.productId === pid).every((b) => b.variantId != null)).toBe(true)
    expect(codes.find((b) => b.productId === fid)?.variantId).toBeUndefined()
  })

  it('re-saving does not add barcodes; removed numbers are never reused', async () => {
    const pid = await saveProduct(shirt, [{ productId: 0, size: 'M', qty: 0 }])
    const p = (await db.products.get(pid))!
    const v = await db.variants.where('productId').equals(pid).toArray()
    await saveProduct(p, v)
    expect(await db.barcodes.count()).toBe(1)
    const [first] = await db.barcodes.toArray()
    await removeBarcode(first.code)
    await saveProduct(p, v) // regenerates because the variant has none
    const [second] = await db.barcodes.toArray()
    expect(second.code).not.toBe(first.code)
    expect(await getSetting('barcodeSeq')).toBe(2)
  })

  it('assigns a scanned barcode and refuses duplicates with the owner product name', async () => {
    const fid = await saveProduct(silk)
    const pid = await saveProduct(shirt, [{ productId: 0, qty: 0 }])
    expect(await assignBarcode('8851234567890', fid)).toEqual({ ok: true })
    const dup = await assignBarcode('8851234567890', pid)
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.productName).toBe('ပိုး')
    expect((await findByBarcode('8851234567890'))?.product.id).toBe(fid)
  })

  it('variant removal drops its barcodes', async () => {
    const pid = await saveProduct(shirt, [{ productId: 0, size: 'M', qty: 0 }, { productId: 0, size: 'L', qty: 0 }])
    const p = (await db.products.get(pid))!
    const [m] = await db.variants.where('productId').equals(pid).toArray()
    await saveProduct(p, [m])
    expect(await db.barcodes.count()).toBe(1)
  })

  it('import is all-or-nothing when a barcode is already used', async () => {
    const fid = await saveProduct(silk)
    await assignBarcode('11112222', fid)
    await expect(
      importProducts([
        { kind: 'length', nameMy: 'X', nameEn: '', active: true, category: 'ပိုး', pricingUnit: 'gaik', unitPriceKs: 1000, variants: [] },
        { kind: 'piece', nameMy: 'Y', nameEn: '', active: true, category: '', priceKs: 1000, variants: [{ barcode: '11112222' }] },
      ]),
    ).rejects.toThrow(/already in use/)
    expect(await db.products.count()).toBe(1)
  })

  it('import creates categories and barcodes', async () => {
    await importProducts([
      { kind: 'piece', nameMy: 'Y', nameEn: '', active: true, category: 'အင်္ကျီ', priceKs: 1000, variants: [{ size: 'M' }, { size: 'L', barcode: '99998888' }] },
    ])
    expect(await db.categories.count()).toBe(1)
    const codes = await db.barcodes.toArray()
    expect(codes.map((b) => b.source).sort()).toEqual(['assigned', 'generated'])
  })

  it('deletes a never-sold product with its barcodes; refuses one with sales or in a held sale', async () => {
    const pid = await saveProduct(shirt, [{ productId: 0, size: 'M', qty: 0 }])
    const sold = await saveProduct(silk)
    const held = await saveProduct({ ...shirt, nameMy: 'held' }, [{ productId: 0, qty: 0 }])
    await db.saleLines.add({ saleId: 'A-1', productId: sold, kind: 'length', nameMy: 'ပိုး', unitPriceKs: 8000, ctRateBp: 0, lineTotalKs: 8000 })
    await db.parked.add({ at: 0, userId: 1, cart: [{ productId: held }] })
    expect(await deleteProduct(pid)).toBe(true)
    expect(await db.products.get(pid)).toBeUndefined()
    expect(await db.variants.where('productId').equals(pid).count()).toBe(0)
    expect(await db.barcodes.where('productId').equals(pid).count()).toBe(0)
    expect(await deleteProduct(sold)).toBe(false)
    expect(await deleteProduct(held)).toBe(false)
    expect(await db.products.count()).toBe(2)
  })

  it('deletes only an unused category', async () => {
    const used = (await db.categories.add({ nameMy: 'A', nameEn: '', sort: 0 })) as number
    const empty = (await db.categories.add({ nameMy: 'B', nameEn: '', sort: 1 })) as number
    await saveProduct({ ...silk, categoryId: used, active: false })
    expect(await deleteCategory(used)).toBe(false)
    expect(await deleteCategory(empty)).toBe(true)
    expect((await db.categories.toArray()).map((c) => c.nameMy)).toEqual(['A'])
  })
})

describe('Excel update', () => {
  it('updates details by id, keeps stock and photo, adds a new size, all-or-nothing on bad ids', async () => {
    const pid = await saveProduct(shirt, [{ productId: 0, size: 'M', qty: 4 }])
    const [m] = await db.variants.where('productId').equals(pid).toArray()
    const r = await importProducts([
      { id: pid, kind: 'piece', nameMy: 'ရှပ် ၂', nameEn: '', category: '', priceKs: 16000, wholesalePriceKs: 13000, wholesaleMin: 10, active: true, variants: [{ id: m.id, size: 'M' }, { size: 'XL', barcode: '55556666' }] },
      { kind: 'length', nameMy: 'new', nameEn: '', category: '', pricingUnit: 'gaik', unitPriceKs: 1000, active: false, variants: [] },
    ])
    expect(r).toEqual({ added: 1, updated: 1 })
    expect(await db.products.get(pid)).toMatchObject({ nameMy: 'ရှပ် ၂', priceKs: 16000, wholesalePriceKs: 13000, wholesaleMin: 10 })
    const vs = await db.variants.where('productId').equals(pid).toArray()
    expect(vs.map((v) => [v.size, v.qty])).toEqual([['M', 4], ['XL', 0]])
    expect((await findByBarcode('55556666'))?.variant?.size).toBe('XL')
    expect((await db.products.where('kind').equals('length').first())?.active).toBe(false)

    await expect(importProducts([{ id: 999, kind: 'piece', nameMy: 'x', nameEn: '', category: '', priceKs: 1, active: true, variants: [] }])).rejects.toThrow(/not in this shop/)
    await expect(importProducts([{ id: pid, kind: 'length', nameMy: 'x', nameEn: '', category: '', unitPriceKs: 1, active: true, variants: [] }])).rejects.toThrow(/type cannot change/)
    expect(await db.products.count()).toBe(2)
  })
})
