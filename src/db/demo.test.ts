import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { db } from './schema'
import { hasDemo, loadDemo, removeDemo } from './demo'
import { saveProduct } from './products'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

it('loads demo once and removes only demo data', async () => {
  const real = await saveProduct({ kind: 'length', nameMy: 'real', nameEn: '', active: true, pricingUnit: 'gaik', unitPriceKs: 1000, updatedAt: 0 })
  await loadDemo()
  await loadDemo() // no duplicates
  expect(await hasDemo()).toBe(true)
  expect(await db.products.count()).toBe(10)
  expect((await db.barcodes.get('8851234567890'))?.variantId).toBeDefined()
  expect(await db.rolls.count()).toBe(6)
  expect((await db.variants.toArray()).every((v) => v.qty === 10)).toBe(true)

  await removeDemo()
  expect(await hasDemo()).toBe(false)
  expect((await db.products.toArray()).map((p) => p.id)).toEqual([real])
  expect(await db.barcodes.where('productId').equals(real).count()).toBe(1)
  expect(await db.variants.count()).toBe(0)
  expect(await db.rolls.count()).toBe(0)
  expect(await db.stockMoves.count()).toBe(0)
  expect(await db.categories.count()).toBe(0)
})
