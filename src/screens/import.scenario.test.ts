import 'fake-indexeddb/auto'
import ExcelJS from 'exceljs'
import { beforeEach, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseImport } from '../core/importer'
import { DEFAULT_UNITS } from '../core/units'
import { findByBarcode, importProducts, matchExisting, missingFrom, saveProduct } from '../db/products'
import { db } from '../db/schema'
import { productRows } from './Import'
import { buildBook } from './productSheet'

// Real products, added the way the owner adds them in the app (not the demo set).
beforeEach(async () => {
  await db.delete()
  await db.open()
  await saveProduct({ kind: 'piece', nameMy: 'ရှပ်', nameEn: 'Shirt', active: true, priceKs: 15000, updatedAt: 0 }, [
    { productId: 0, size: 'M', qty: 3 },
    { productId: 0, size: 'L', qty: 2 },
  ])
  await saveProduct({ kind: 'piece', nameMy: 'ပုဆိုး', nameEn: '', active: true, priceKs: 12000, updatedAt: 0 }, [{ productId: 0, qty: 5 }])
  await saveProduct({ kind: 'length', nameMy: 'ပိုး', nameEn: '', active: true, pricingUnit: 'gaik', unitPriceKs: 8000, widthTenths: 450, updatedAt: 0 })
})

const codes = async () => Object.fromEntries((await db.barcodes.toArray()).map((b) => [b.code, `${b.productId}/${b.variantId ?? ''}`]))

/** Download → edit in Excel → read back exactly as the Import screen does. */
async function roundTrip(edit: (ws: ExcelJS.Worksheet) => void) {
  const file = await buildBook(await productRows(DEFAULT_UNITS), { categories: [] })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(file)
  edit(wb.getWorksheet('products')!)
  const book = XLSX.read(await wb.xlsx.writeBuffer())
  const parsed = parseImport(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' }), DEFAULT_UNITS)
  expect(parsed.errors).toEqual([])
  return { ...parsed, products: await matchExisting(parsed.products) }
}
// Headings are "Burmese label\ncode"; find a column by its code like the importer does.
const col = (ws: ExcelJS.Worksheet, code: string) => (ws.getRow(1).values as unknown[]).findIndex((h) => String(h ?? '').split(/\s+/).pop() === code)
const rowOf = (ws: ExcelJS.Worksheet, name: string, size = '') =>
  ws.getRows(2, ws.rowCount - 1)!.find((r) => r.getCell(col(ws, 'name_my')).text === name && r.getCell(col(ws, 'size')).text === size)!
const addRow = (ws: ExcelJS.Worksheet, cells: Record<string, string | number>) => {
  const r = ws.getRow(ws.rowCount + 1)
  for (const [k, v] of Object.entries(cells)) r.getCell(col(ws, k)).value = v
}

it('barcodes stay the same through download, edit, upload and an in-app save', async () => {
  const before = await codes()
  const p = await roundTrip((ws) => (rowOf(ws, 'ရှပ်', 'M').getCell(col(ws, 'price_ks')).value = 16000))
  await importProducts(p.products)
  expect(await codes()).toEqual(before)
  // Re-saving in the app (same variants) keeps the codes too.
  const shirt = (await db.products.filter((x) => x.nameMy === 'ရှပ်').first())!
  await saveProduct(shirt, await db.variants.where('productId').equals(shirt.id!).toArray())
  expect(await codes()).toEqual(before)
  for (const code of Object.keys(before)) expect(await findByBarcode(code)).toBeTruthy()
})

it('deleting rows in the sheet removes those products and sizes', async () => {
  const p = await roundTrip((ws) => {
    ws.spliceRows(rowOf(ws, 'ပုဆိုး').number, 1)
    ws.spliceRows(rowOf(ws, 'ရှပ်', 'L').number, 1)
  })
  const missing = await missingFrom(p.products)
  expect(missing.products.map((x) => x.nameMy)).toEqual(['ပုဆိုး'])
  expect(missing.variants.map((v) => v.size)).toEqual(['L'])
  await importProducts(p.products, true)
  expect((await db.products.toArray()).map((x) => x.nameMy).sort()).toEqual(['ပိုး', 'ရှပ်'])
  expect((await db.variants.toArray()).map((v) => v.size)).toEqual(['M'])
  expect(await db.barcodes.count()).toBe(2) // shirt M + silk
})

it('a product that was sold is hidden, not deleted, when its row is removed', async () => {
  const paso = (await db.products.filter((x) => x.nameMy === 'ပုဆိုး').first())!
  await db.saleLines.add({ saleId: 'x', productId: paso.id!, kind: 'piece' } as never)
  const p = await roundTrip((ws) => ws.spliceRows(rowOf(ws, 'ပုဆိုး').number, 1))
  await importProducts(p.products, true)
  expect((await db.products.get(paso.id!))?.active).toBe(false)
})

it('without the remove choice, deleted rows are kept (old behaviour)', async () => {
  const p = await roundTrip((ws) => ws.spliceRows(rowOf(ws, 'ပုဆိုး').number, 1))
  await importProducts(p.products)
  expect(await db.products.count()).toBe(3)
})

it('a new row typed under the downloaded ones is added with its own barcode', async () => {
  const before = await codes()
  const p = await roundTrip((ws) => addRow(ws, { type: 'ခု', name_my: 'တီရှပ်', price_ks: 8500, size: 'S' }))
  expect(await missingFrom(p.products)).toEqual({ products: [], variants: [] })
  expect(await importProducts(p.products, true)).toEqual({ added: 1, updated: 3, removed: 0, hidden: 0 })
  const after = await codes()
  expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 1)
  expect(after).toMatchObject(before)
})

it('fabric price is per yard (ကိုက်) in the sheet, also for an old per-taung fabric', async () => {
  await saveProduct({ kind: 'length', nameMy: 'ဇာ', nameEn: '', active: true, pricingUnit: 'taung', unitPriceKs: 4000, wholesalePriceKs: 3500, wholesaleMin: 4, updatedAt: 0 })
  const rows = await productRows(DEFAULT_UNITS)
  expect(rows.find((r) => r.name_my === 'ဇာ')).toMatchObject({ price_ks: 8000, wholesale_price_ks: 7000, wholesale_min: 2 })
  const p = await roundTrip(() => {})
  await importProducts(p.products)
  expect(await db.products.filter((x) => x.nameMy === 'ဇာ').first()).toMatchObject({ pricingUnit: 'gaik', unitPriceKs: 8000, wholesalePriceKs: 7000, wholesaleMin: 2 })
})

/** Copy a whole row (grey numbers and barcode too) to the bottom, the way Excel copy/paste does, then change some cells. */
const copyRow = (ws: ExcelJS.Worksheet, from: ExcelJS.Row, change: Record<string, string>) => {
  const to = ws.getRow(ws.rowCount + 1)
  from.eachCell((c, i) => (to.getCell(i).value = c.value))
  for (const [k, v] of Object.entries(change)) to.getCell(col(ws, k)).value = v
}

it('a copied row renamed is a new product; copied with a new size is a new size; each gets its own barcode', async () => {
  const before = await codes()
  const p = await roundTrip((ws) => {
    copyRow(ws, rowOf(ws, 'ပုဆိုး'), { name_my: 'ပုဆိုး အသစ်' })
    copyRow(ws, rowOf(ws, 'ရှပ်', 'L'), { size: 'XL' })
    copyRow(ws, rowOf(ws, 'ပိုး'), { name_my: 'ပိုး အနီ' })
  })
  expect(await missingFrom(p.products)).toEqual({ products: [], variants: [] })
  expect(await importProducts(p.products, true)).toMatchObject({ added: 2, updated: 3, removed: 0 })
  const after = await codes()
  expect(after).toMatchObject(before) // old labels still point at the same items
  expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 3)
  const shirt = (await db.products.filter((x) => x.nameMy === 'ရှပ်').first())!
  expect((await db.variants.where('productId').equals(shirt.id!).toArray()).map((v) => v.size)).toEqual(['M', 'L', 'XL'])
  expect((await db.products.toArray()).map((x) => x.nameMy).sort()).toEqual(['ပိုး', 'ပိုး အနီ', 'ပုဆိုး', 'ပုဆိုး အသစ်', 'ရှပ်'])
})

it('a copied size row left unchanged is an error, not a second "L"', async () => {
  const file = await buildBook(await productRows(DEFAULT_UNITS), { categories: [] })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(file)
  const ws = wb.getWorksheet('products')!
  copyRow(ws, rowOf(ws, 'ရှပ်', 'L'), {})
  const book = XLSX.read(await wb.xlsx.writeBuffer())
  const { errors } = parseImport(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' }), DEFAULT_UNITS)
  expect(errors.map((e) => e.message)).toEqual(['"ရှပ်" L appears twice: change the size/colour of the copy'])
})
