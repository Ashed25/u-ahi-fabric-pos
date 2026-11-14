import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import { assignBarcode, findByBarcode, importProducts, removeBarcode, saveProduct } from './products'
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
        { kind: 'length', nameMy: 'X', nameEn: '', category: 'ပိုး', pricingUnit: 'gaik', unitPriceKs: 1000, variants: [] },
        { kind: 'piece', nameMy: 'Y', nameEn: '', category: '', priceKs: 1000, variants: [{ barcode: '11112222' }] },
      ]),
    ).rejects.toThrow(/already in use/)
    expect(await db.products.count()).toBe(1)
  })

  it('import creates categories and barcodes', async () => {
    await importProducts([
      { kind: 'piece', nameMy: 'Y', nameEn: '', category: 'အင်္ကျီ', priceKs: 1000, variants: [{ size: 'M' }, { size: 'L', barcode: '99998888' }] },
    ])
    expect(await db.categories.count()).toBe(1)
    const codes = await db.barcodes.toArray()
    expect(codes.map((b) => b.source).sort()).toEqual(['assigned', 'generated'])
  })
})
