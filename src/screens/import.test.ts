import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { parseImport } from '../core/importer'
import { DEFAULT_UNITS } from '../core/units'
import { importProducts, matchExisting, saveProduct } from '../db/products'
import { db } from '../db/schema'
import { productRows } from './Import'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('downloaded sheet uploaded unchanged changes nothing', async () => {
  await saveProduct({ kind: 'piece', nameMy: 'ရှပ်', nameEn: 'Shirt', active: true, priceKs: 15000, costKs: 9000, wholesalePriceKs: 12000, wholesaleMin: 12, updatedAt: 0 }, [
    { productId: 0, size: 'M', qty: 3 },
    { productId: 0, size: 'XL', priceKs: 16500, qty: 1 },
  ])
  await saveProduct({ kind: 'length', nameMy: 'ပိုး', nameEn: '', active: false, pricingUnit: 'taung', unitPriceKs: 4000, widthTenths: 584, updatedAt: 0 })
  const snap = async () => ({
    products: (await db.products.toArray()).map(({ updatedAt: _, ...p }) => p),
    variants: await db.variants.toArray(),
    barcodes: (await db.barcodes.toArray()).length,
  })
  const before = await snap()

  const rows = await productRows(DEFAULT_UNITS)
  expect(rows).toHaveLength(3)
  // Excel gives back strings and numbers; empty cells come back as ''.
  const back = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? ''])))
  const { products, errors } = parseImport(back, DEFAULT_UNITS)
  expect(errors).toEqual([])
  expect(await importProducts(products)).toEqual({ added: 0, updated: 2 })
  expect(await snap()).toEqual(before)
})

it('sheet without product_id uploaded twice updates instead of duplicating', async () => {
  const rows = [
    { type: 'piece', name_my: 'ပုဆိုး', category: 'ပုဆိုး', price_ks: 16500, size: '', colour: '' },
    { type: 'piece', name_my: 'ရှပ်', category: 'အင်္ကျီ', price_ks: 15000, size: 'M' },
    { type: 'piece', name_my: 'ရှပ်', category: 'အင်္ကျီ', price_ks: 15000, size: 'L' },
    { type: 'length', name_my: 'ပိုး', category: '', price_ks: 4000 },
  ]
  const upload = async (r: Record<string, unknown>[]) => importProducts(await matchExisting(parseImport(r, DEFAULT_UNITS).products))
  expect(await upload(rows)).toEqual({ added: 3, updated: 0 })
  expect(await upload([...rows.slice(0, 3), { ...rows[3], price_ks: 4500 }, { type: 'piece', name_my: 'အသစ်', price_ks: 1000 }])).toEqual({ added: 1, updated: 3 })
  expect(await db.products.count()).toBe(4)
  expect(await db.variants.count()).toBe(4)
  expect((await db.products.filter((p) => p.nameMy === 'ပိုး').first())?.unitPriceKs).toBe(4500)
})
