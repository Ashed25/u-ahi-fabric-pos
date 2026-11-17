import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { parseImport } from '../core/importer'
import { DEFAULT_UNITS } from '../core/units'
import { importProducts, saveProduct } from '../db/products'
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
