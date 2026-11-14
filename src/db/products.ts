import { internalEan13 } from '../core/barcode'
import type { ParsedProduct } from '../core/importer'
import { audit } from './audit'
import { type Barcode, type Product, type Variant, db } from './schema'
import { getSetting, setSetting } from './settings'
import { requireRole } from './users'

const WRITE_TABLES = () => [db.products, db.variants, db.barcodes, db.settings, db.audit, db.categories]

/** Next in-store EAN-13. Must run inside a transaction that includes settings + barcodes. Never reuses a number. */
async function nextInternalCode(): Promise<string> {
  const prefix = await getSetting('barcodePrefix')
  let seq = await getSetting('barcodeSeq')
  let code: string
  do {
    seq += 1
    code = internalEan13(seq, prefix)
  } while (await db.barcodes.get(code)) // skip numbers already taken by an assigned (scanned) code
  await setSetting('barcodeSeq', seq)
  return code
}

async function generateFor(productId: number, variantId?: number) {
  const code = await nextInternalCode()
  await db.barcodes.add({ code, productId, variantId, source: 'generated', createdAt: Date.now() })
  return code
}

/** Every variant (clothes) / every fabric product gets at least one barcode. */
async function ensureBarcodes(p: Product & { id: number }) {
  const codes = await db.barcodes.where('productId').equals(p.id).toArray()
  if (p.kind === 'length') {
    if (!codes.some((b) => b.variantId == null)) await generateFor(p.id)
    return
  }
  const variants = await db.variants.where('productId').equals(p.id).toArray()
  for (const v of variants) if (!codes.some((b) => b.variantId === v.id)) await generateFor(p.id, v.id)
}

async function saveInTx(p: Product, variants: Variant[]): Promise<number> {
  const before = p.id ? await db.products.get(p.id) : undefined
  if (before && before.kind !== p.kind) throw new Error('Product kind cannot change')
  const id = (await db.products.put({ ...p, updatedAt: Date.now() })) as number

  if (p.kind === 'piece') {
    if (variants.length === 0) throw new Error('A clothing product needs at least one variant')
    const keep = new Set(variants.filter((v) => v.id).map((v) => v.id))
    const old = await db.variants.where('productId').equals(id).toArray()
    for (const v of old.filter((v) => !keep.has(v.id))) {
      await db.barcodes.where('variantId').equals(v.id!).delete()
      await db.variants.delete(v.id!)
    }
    for (const v of variants) await db.variants.put({ ...v, productId: id })
  }
  await ensureBarcodes({ ...p, id })
  await audit(before ? 'product.update' : 'product.create', `product:${id}`, before, { ...p, id })
  return id
}

export async function saveProduct(p: Product, variants: Variant[] = []): Promise<number> {
  await requireRole('manager') // prices: never a seller
  // Callback must be async: a plain arrow returning a promise makes Dexie commit too early.
  return db.transaction('rw', WRITE_TABLES(), async () => await saveInTx(p, variants))
}

export type AssignResult = { ok: true } | { ok: false; taken: Barcode; productName?: string }

/** Link an existing (supplier / pre-printed) barcode. Barcodes are unique across all products. */
export async function assignBarcode(code: string, productId: number, variantId?: number, approvedBy?: number): Promise<AssignResult> {
  await requireRole('manager', approvedBy)
  return db.transaction('rw', [db.barcodes, db.products, db.audit], async () => {
    if (!/^\d{4,}$/.test(code)) throw new Error(`Barcode must be digits: ${code}`)
    const taken = await db.barcodes.get(code)
    if (taken) return { ok: false, taken, productName: (await db.products.get(taken.productId))?.nameMy }
    await db.barcodes.add({ code, productId, variantId, source: 'assigned', createdAt: Date.now() })
    await audit('barcode.assign', `product:${productId}`, undefined, { code, variantId })
    return { ok: true }
  })
}

export async function removeBarcode(code: string) {
  await requireRole('manager')
  return db.transaction('rw', [db.barcodes, db.audit], async () => {
    const b = await db.barcodes.get(code)
    await db.barcodes.delete(code)
    await audit('barcode.remove', `product:${b?.productId}`, b, undefined)
  })
}

export async function findByBarcode(code: string) {
  const b = await db.barcodes.get(code)
  if (!b) return undefined
  const product = await db.products.get(b.productId)
  if (!product) return undefined
  const variant = b.variantId != null ? await db.variants.get(b.variantId) : undefined
  return { product, variant, barcode: b }
}

async function categoryId(nameMy: string): Promise<number | undefined> {
  if (!nameMy) return undefined
  const found = await db.categories.filter((c) => c.nameMy === nameMy).first()
  if (found) return found.id
  return (await db.categories.add({ nameMy, nameEn: '', sort: await db.categories.count() })) as number
}

/** Import parsed Excel rows in one transaction: all or nothing. Barcodes are generated for everything. */
export async function importProducts(items: ParsedProduct[]): Promise<number> {
  await requireRole('owner')
  return db.transaction('rw', WRITE_TABLES(), async () => {
    for (const it of items) {
      const p: Product = {
        kind: it.kind,
        nameMy: it.nameMy,
        nameEn: it.nameEn,
        categoryId: await categoryId(it.category),
        costKs: it.costKs,
        active: true,
        priceKs: it.priceKs,
        pricingUnit: it.pricingUnit,
        unitPriceKs: it.unitPriceKs,
        widthTenths: it.widthTenths,
        quickCuts: it.kind === 'length' ? DEFAULT_QUICK_CUTS : undefined,
        updatedAt: Date.now(),
      }
      // Assign supplier barcodes first so generated ones are only added where none were given.
      const id = (await db.products.add(p)) as number
      if (it.kind === 'length' && it.barcode) await assignOrThrow(it.barcode, id)
      for (const v of it.variants) {
        const vid = (await db.variants.add({ productId: id, size: v.size, colour: v.colour, priceKs: v.priceKs, qty: 0 })) as number
        if (v.barcode) await assignOrThrow(v.barcode, id, vid)
      }
      await ensureBarcodes({ ...p, id })
      await audit('product.import', `product:${id}`, undefined, { ...p, id })
    }
    return items.length
  })
}

async function assignOrThrow(code: string, productId: number, variantId?: number) {
  if (await db.barcodes.get(code)) throw new Error(`Barcode already in use: ${code}`)
  await db.barcodes.add({ code, productId, variantId, source: 'assigned', createdAt: Date.now() })
}

export const DEFAULT_QUICK_CUTS = [
  [{ unit: 'taung', count: 1 }],
  [{ unit: 'gaik', count: 1 }],
  [{ unit: 'gaik', count: 1 }, { unit: 'taung', count: 1 }],
  [{ unit: 'gaik', count: 2 }],
  [{ unit: 'gaik', count: 3 }],
]
