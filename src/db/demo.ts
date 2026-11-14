import { DEFAULT_QUICK_CUTS, assignBarcode, saveProduct } from './products'
import { type Product, db } from './schema'

/** Demo catalogue for trying the app. Everything is flagged demo:true so it can be removed in one tap. */
const CATS = ['အင်္ကျီ', 'ထဘီ / ပုဆိုး', 'ပိတ်စ', 'အထွေထွေ']

type Demo = { cat: number; color: string; p: Partial<Product>; variants?: { size?: string; colour?: string; priceKs?: number }[]; supplierCode?: string }

const ITEMS: Demo[] = [
  { cat: 0, color: '#f8fafc', p: { kind: 'piece', nameMy: 'ရှပ်အင်္ကျီ အဖြူ', nameEn: 'White shirt', priceKs: 15000, costKs: 9000 }, variants: [{ size: 'M' }, { size: 'L' }, { size: 'XL', priceKs: 16500 }] },
  { cat: 0, color: '#1e3a8a', p: { kind: 'piece', nameMy: 'တီရှပ်', nameEn: 'T-shirt', priceKs: 8500, costKs: 5000 }, variants: [{ size: 'S', colour: 'အပြာ' }, { size: 'M', colour: 'အပြာ' }, { size: 'M', colour: 'အနက်' }] },
  { cat: 1, color: '#7c2d12', p: { kind: 'piece', nameMy: 'ပုဆိုး ကွက်', nameEn: 'Checked paso', priceKs: 12000, costKs: 7500 }, variants: [{}] },
  { cat: 1, color: '#be123c', p: { kind: 'piece', nameMy: 'ထဘီ ပန်းရိုက်', nameEn: 'Printed htamein', priceKs: 18500, costKs: 11000 }, variants: [{ colour: 'အနီ' }, { colour: 'အပြာ' }] },
  { cat: 3, color: '#0d9488', p: { kind: 'piece', nameMy: 'မျက်နှာသုတ်ပုဝါ', nameEn: 'Towel', priceKs: 3500, costKs: 2000 }, variants: [{}], supplierCode: '8851234567890' },
  { cat: 2, color: '#2563eb', p: { kind: 'length', nameMy: 'ပိုးထည် အပြာ', nameEn: 'Blue silk', pricingUnit: 'gaik', unitPriceKs: 8000, widthTenths: 450, costKs: 5000 } },
  { cat: 2, color: '#e2e8f0', p: { kind: 'length', nameMy: 'ချည်ထည် အဖြူ', nameEn: 'White cotton', pricingUnit: 'gaik', unitPriceKs: 5500, widthTenths: 360, costKs: 3000 } },
  { cat: 2, color: '#a855f7', p: { kind: 'length', nameMy: 'ဇာ ခရမ်း', nameEn: 'Purple lace', pricingUnit: 'taung', unitPriceKs: 4000, widthTenths: 584, costKs: 2500 } },
  { cat: 2, color: '#16a34a', p: { kind: 'length', nameMy: 'ချည်ထည် ပန်းရိုက်', nameEn: 'Printed cotton', pricingUnit: 'gaik', unitPriceKs: 3000, widthTenths: 450 } },
]

/** A plain coloured square with the name, standing in for a product photo. */
async function swatch(color: string, text: string): Promise<Blob | undefined> {
  if (typeof document === 'undefined') return undefined
  const c = document.createElement('canvas')
  c.width = c.height = 320
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.fillRect(0, 0, 320, 320)
  g.fillStyle = 'rgba(255,255,255,0.85)'
  g.fillRect(0, 230, 320, 90)
  g.fillStyle = '#0f172a'
  g.font = 'bold 30px "Noto Sans Myanmar", sans-serif'
  g.textAlign = 'center'
  g.fillText(text, 160, 288, 300)
  return new Promise((r) => c.toBlob((b) => r(b ?? undefined), 'image/jpeg', 0.8))
}

export async function hasDemo() {
  return (await db.products.filter((p) => !!p.demo).count()) > 0
}

export async function loadDemo() {
  if (await hasDemo()) return
  const catIds: number[] = []
  for (const [i, nameMy] of CATS.entries()) {
    const existing = await db.categories.filter((c) => c.nameMy === nameMy).first()
    catIds.push(existing?.id ?? ((await db.categories.add({ nameMy, nameEn: '', sort: 100 + i, demo: true })) as number))
  }
  for (const it of ITEMS) {
    const p = {
      nameEn: '',
      active: true,
      updatedAt: 0,
      ...it.p,
      categoryId: catIds[it.cat],
      photo: await swatch(it.color, it.p.nameMy!),
      quickCuts: it.p.kind === 'length' ? DEFAULT_QUICK_CUTS : undefined,
      demo: true,
    } as Product
    const id = await saveProduct(p, (it.variants ?? []).map((v) => ({ ...v, productId: 0, qty: 0 })))
    if (it.supplierCode) {
      const [v] = await db.variants.where('productId').equals(id).toArray()
      await assignBarcode(it.supplierCode, id, v?.id)
    }
  }
}

/** Removes demo products, their variants and barcodes, and demo categories left empty. */
export function removeDemo() {
  return db.transaction('rw', [db.products, db.variants, db.barcodes, db.categories], async () => {
    const ids = (await db.products.filter((p) => !!p.demo).toArray()).map((p) => p.id!)
    await db.barcodes.where('productId').anyOf(ids).delete()
    await db.variants.where('productId').anyOf(ids).delete()
    await db.products.bulkDelete(ids)
    for (const c of await db.categories.filter((c) => !!c.demo).toArray()) {
      if ((await db.products.where('categoryId').equals(c.id!).count()) === 0) await db.categories.delete(c.id!)
    }
  })
}
