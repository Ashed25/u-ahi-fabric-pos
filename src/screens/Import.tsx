import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { IMPORT_COLUMNS, type ImportError, type ParsedProduct, parseImport } from '../core/importer'
import { formatInches, formatLargestFirst } from '../core/length'
import { sellableRolls } from '../core/stock'
import type { Unit } from '../core/units'
import { audit } from '../db/audit'
import { importProducts, matchExisting } from '../db/products'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'

const STOCK_COL = 'stock_info' // read-only: not in IMPORT_COLUMNS, so ignored on upload
// App-filled columns go last and hidden: the owner edits details only; ids still come back so renames stay the same product.
const HIDDEN = ['product_id', 'variant_id', STOCK_COL] as const
type Col = (typeof IMPORT_COLUMNS)[number] | typeof STOCK_COL
const DETAILS: Col[] = IMPORT_COLUMNS.filter((c) => !(HIDDEN as readonly string[]).includes(c))
const HEADER: Col[] = [...DETAILS, ...HIDDEN]
type Row = Partial<Record<Col, string | number>>

const EXAMPLES: Row[] = [
  { type: 'piece', name_my: 'ရှပ်အင်္ကျီ အဖြူ', name_en: 'White shirt', category: 'အင်္ကျီ', price_ks: 15000, wholesale_price_ks: 12000, wholesale_min: 12, size: 'M', colour: 'အဖြူ', cost_ks: 9000 },
  { type: 'piece', name_my: 'ရှပ်အင်္ကျီ အဖြူ', name_en: 'White shirt', category: 'အင်္ကျီ', price_ks: 15000, wholesale_price_ks: 12000, wholesale_min: 12, size: 'L', colour: 'အဖြူ', cost_ks: 9000 },
  { type: 'length', name_my: 'ပိုးထည် အပြာ', name_en: 'Blue silk', category: 'ပိုးထည်', price_ks: 8000, wholesale_price_ks: 7000, wholesale_min: 20, pricing_unit: 'ကိုက်', width_inches: 45, cost_ks: 5000 },
  { type: 'length', name_my: 'ချည်ထည် အစိမ်း', name_en: 'Green cotton', category: 'ချည်ထည်', price_ks: 2500, pricing_unit: 'တောင်', width_inches: 36 },
]

const HELP = [
  ['column', 'ရှင်းလင်းချက်', 'Explanation'],
  ['product_id', 'ဖျောက်ထားသော ကော်လံ — app က ဖြည့်ပေးသည်။ ထိစရာ မလိုပါ။ မပါရင် type၊ အမည်၊ အမျိုးအစား တူသော ပစ္စည်းကို ပြင်မည် (မရှိရင် ပစ္စည်းအသစ်)', 'Hidden column, filled in by the app — leave it. Without it, the product with the same type, name and category is updated (new product if none)'],
  ['variant_id', 'ဖျောက်ထားသော ကော်လံ — app က ဖြည့်ပေးသည်။ အရွယ်အသစ် ထည့်ရန် အမည်၊ အမျိုးအစား တူတူဖြင့် အကြောင်းအသစ် ရေးပါ', 'Hidden column, filled in by the app. To add a new size, add a row with the same name and category'],
  ['', 'ပစ္စည်းအသစ်အတွက် အကြောင်းဟောင်းကို ကူးမည်ဆိုရင် Excel ၏ Insert ဖြင့် အကြောင်းအလွတ် ထည့်ပြီး စာများကိုသာ ကူးပါ (ဖျောက်ထားသော နံပါတ်များ မပါစေရန်)', 'To start a new product from an existing row, insert an empty row and copy the text cells only, so the hidden numbers are not copied'],
  ['type', 'piece = တစ်ထည်ချင်း ရောင်း / length = အလျားဖြင့် ရောင်း (ပိတ်စ)', 'piece = sold per piece, length = sold by length (fabric)'],
  ['name_my', 'အမည် (မြန်မာ) — မဖြစ်မနေ', 'Burmese name — required'],
  ['name_en', 'အမည် (အင်္ဂလိပ်) — မထည့်လည်းရ', 'English name — optional'],
  ['category', 'အမျိုးအစား', 'Category'],
  ['price_ks', 'piece: တစ်ထည် ဈေး / length: ယူနစ်တစ်ခု ဈေး (ကျပ်)', 'piece: price per piece / length: price per pricing unit (Ks)'],
  ['wholesale_price_ks', 'လက်ကား ဈေး (price_ks နှင့် ယူနစ်တူ) — မထည့်လည်းရ', 'Wholesale price, same unit as price_ks — optional'],
  ['wholesale_min', 'လက်ကား အနည်းဆုံး — piece: အထည်ရေ (အရွယ်/အရောင် အားလုံး ပေါင်း) / length: pricing_unit အရေအတွက်', 'Wholesale minimum — piece: number of pieces (all sizes/colours together) / length: number of pricing units'],
  ['size', 'အရွယ် (piece)', 'Size (piece)'],
  ['colour', 'အရောင် (piece)', 'Colour (piece)'],
  ['pricing_unit', 'ကိုက် / တောင် / ထွာ / မိုက် / လက်မ (မထည့်ရင် ကိုက်)', 'Pricing unit (default ကိုက်)'],
  ['width_inches', 'ပိတ်စ အနံ (လက်မ) ဥပမာ 36, 45, 58.4', 'Fabric width in inches'],
  ['cost_ks', 'အရင်း (ကျပ်) — မထည့်လည်းရ', 'Cost (Ks) — optional'],
  ['barcode', 'ရှိပြီးသား ဘားကုဒ် — မထည့်ရင် အလိုအလျောက် ထုတ်ပေးမည်။ ကော်လံကို Text format ထားပါ။ ဘားကုဒ် ဖယ်ရှားခြင်းကို app ထဲတွင် လုပ်ပါ', 'Existing barcode — leave empty to generate one. Format this column as Text so leading zeros are kept. A new code is added; removing barcodes is done in the app'],
  ['active', 'yes = ရောင်းမည် / no = ဖျောက်ထားမည် (အလွတ် = yes)', 'yes = for sale / no = hidden (empty = yes)'],
  [STOCK_COL, 'လက်ကျန် — ကြည့်ရန်သာ။ ဒီမှာ ပြင်လည်း မပြောင်းပါ (လက်ကျန်ကို app ထဲတွင် ရေတွက်ပါ)', 'Stock — for reference only; changes here are ignored (count stock in the app)'],
  ['', 'အရွယ်/အရောင် များရင် တစ်ကြောင်းစီ ရေးပါ (အမည်တူ၊ အမျိုးအစားတူ)', 'One row per size/colour (same name and category)'],
  ['', 'အကြောင်း ဖျက်လိုက်ရင် ပစ္စည်း မပျက်ပါ — ဖျောက်ရန် active = no ထားပါ', 'Deleting a row does not delete the product — set active = no to hide it'],
]

function writeBook(rows: Row[], filename: string, header = HEADER) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows, { header })
  ws['!cols'] = header.map((h) => ({ wch: h === 'name_my' || h === 'name_en' ? 28 : 14, hidden: (HIDDEN as readonly string[]).includes(h) }))
  XLSX.utils.book_append_sheet(wb, ws, 'products')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(HELP), 'help')
  XLSX.writeFile(wb, filename)
}

export function downloadTemplate() {
  writeBook(EXAMPLES, 'u-ahi-products-template.xlsx', DETAILS)
}

/** Every product as sheet rows (one per size/colour), ready to edit and upload again. */
export async function productRows(units: Unit[]): Promise<Row[]> {
  const [products, variants, barcodes, categories, rolls] = await Promise.all([db.products.toArray(), db.variants.toArray(), db.barcodes.toArray(), db.categories.toArray(), db.rolls.toArray()])
  const cat = new Map(categories.map((c) => [c.id, c]))
  const code = (pid: number, vid?: number) => barcodes.find((b) => b.productId === pid && b.variantId === vid)?.code ?? ''
  products.sort((a, b) => (cat.get(a.categoryId)?.sort ?? 1e9) - (cat.get(b.categoryId)?.sort ?? 1e9) || a.nameMy.localeCompare(b.nameMy))
  const rows: Row[] = []
  for (const p of products) {
    const base: Row = {
      product_id: p.id, type: p.kind, name_my: p.nameMy, name_en: p.nameEn, category: cat.get(p.categoryId)?.nameMy ?? '',
      wholesale_price_ks: p.wholesalePriceKs, wholesale_min: p.wholesaleMin, cost_ks: p.costKs, active: p.active ? 'yes' : 'no',
    }
    if (p.kind === 'length') {
      const left = sellableRolls(rolls.filter((r) => r.productId === p.id)).reduce((s, r) => s + r.remainingTenths, 0)
      rows.push({
        ...base, price_ks: p.unitPriceKs, pricing_unit: units.find((u) => u.code === p.pricingUnit)?.nameMy ?? p.pricingUnit,
        width_inches: p.widthTenths ? formatInches(p.widthTenths) : '', barcode: code(p.id!), [STOCK_COL]: formatLargestFirst(left, units, 'my'),
      })
    } else {
      for (const v of variants.filter((x) => x.productId === p.id))
        rows.push({ ...base, variant_id: v.id, price_ks: v.priceKs ?? p.priceKs, size: v.size, colour: v.colour, barcode: code(p.id!, v.id), [STOCK_COL]: v.qty })
    }
  }
  return rows
}

export function Import() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<{ products: ParsedProduct[]; errors: ImportError[] }>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)

  async function downloadAll() {
    if (!settings) return
    await audit('export.excel', 'products')
    writeBook(await productRows(settings.units), `u-ahi-products-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function pick(file?: File) {
    if (!file || !settings) return
    setMsg(undefined)
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const p = parseImport(rows, settings.units)
      setParsed({ ...p, products: await matchExisting(p.products) })
    } catch (e) {
      setMsg({ ok: false, text: `${t('import.badFile')} (${String(e)})` })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function run() {
    if (!parsed) return
    setBusy(true)
    try {
      const n = await importProducts(parsed.products)
      setParsed(undefined)
      setMsg({ ok: true, text: t('import.doneUpdate', n) })
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  const updating = parsed?.products.filter((p) => p.id).length ?? 0

  return (
    <Screen title={t('import.title')}>
      <div className="mx-auto max-w-3xl space-y-4">
        <ol className="list-decimal space-y-1 pl-8 text-xl">
          <li>{t('import.step1')}</li>
          <li>{t('import.step2')}</li>
          <li>{t('import.step3')}</li>
        </ol>
        <Btn variant="plain" className="w-full" onClick={downloadAll} data-testid="download-products">
          ⬇ {t('import.downloadAll')}
        </Btn>
        <Btn variant="plain" className="w-full" onClick={downloadTemplate}>
          ⬇ {t('import.template')}
        </Btn>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Btn className="w-full" onClick={() => fileRef.current?.click()}>
          {t('import.choose')}
        </Btn>
        {msg && (
          <p className={`rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100' : 'bg-red-100'}`}>
            {msg.text}
            {msg.ok && (
              <Btn variant="plain" className="ml-3" onClick={() => go('#/products')}>
                {t('products.title')}
              </Btn>
            )}
          </p>
        )}
        {parsed && (
          <div className="rounded-2xl border-2 border-slate-200 p-4">
            <p className="text-xl font-bold">{t('import.previewUpdate', { added: parsed.products.length - updating, updated: updating })}</p>
            {parsed.errors.length > 0 && (
              <>
                <p className="mt-2 text-xl font-bold text-red-800">{t('import.errors', { count: parsed.errors.length })}</p>
                <ul className="max-h-80 overflow-auto font-mono text-base text-red-900">
                  {parsed.errors.map((e, i) => (
                    <li key={i}>
                      {t('import.row')} {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Btn variant="ok" className="mt-4 w-full" disabled={busy || parsed.errors.length > 0 || !parsed.products.length} onClick={run}>
              {t('import.run')}
            </Btn>
          </div>
        )}
      </div>
    </Screen>
  )
}
