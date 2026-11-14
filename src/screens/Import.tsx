import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { IMPORT_COLUMNS, type ImportError, type ParsedProduct, parseImport } from '../core/importer'
import { importProducts } from '../db/products'
import { useSettings } from '../db/useSettings'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'

const EXAMPLES = [
  ['piece', 'ရှပ်အင်္ကျီ အဖြူ', 'White shirt', 'အင်္ကျီ', 15000, 'M', 'အဖြူ', '', '', 9000, ''],
  ['piece', 'ရှပ်အင်္ကျီ အဖြူ', 'White shirt', 'အင်္ကျီ', 15000, 'L', 'အဖြူ', '', '', 9000, ''],
  ['length', 'ပိုးထည် အပြာ', 'Blue silk', 'ပိုးထည်', 8000, '', '', 'ကိုက်', 45, 5000, ''],
  ['length', 'ချည်ထည် အစိမ်း', 'Green cotton', 'ချည်ထည်', 2500, '', '', 'တောင်', 36, '', ''],
]

const HELP = [
  ['column', 'ရှင်းလင်းချက်', 'Explanation'],
  ['type', 'piece = တစ်ထည်ချင်း ရောင်း / length = အလျားဖြင့် ရောင်း (ပိတ်စ)', 'piece = sold per piece, length = sold by length (fabric)'],
  ['name_my', 'အမည် (မြန်မာ) — မဖြစ်မနေ', 'Burmese name — required'],
  ['name_en', 'အမည် (အင်္ဂလိပ်) — မထည့်လည်းရ', 'English name — optional'],
  ['category', 'အမျိုးအစား', 'Category'],
  ['price_ks', 'piece: တစ်ထည် ဈေး / length: ယူနစ်တစ်ခု ဈေး (ကျပ်)', 'piece: price per piece / length: price per pricing unit (Ks)'],
  ['size', 'အရွယ် (piece)', 'Size (piece)'],
  ['colour', 'အရောင် (piece)', 'Colour (piece)'],
  ['pricing_unit', 'ကိုက် / တောင် / ထွာ / မိုက် / လက်မ (မထည့်ရင် ကိုက်)', 'Pricing unit (default ကိုက်)'],
  ['width_inches', 'ပိတ်စ အနံ (လက်မ) ဥပမာ 36, 45, 58.4', 'Fabric width in inches'],
  ['cost_ks', 'အရင်း (ကျပ်) — မထည့်လည်းရ', 'Cost (Ks) — optional'],
  ['barcode', 'ရှိပြီးသား ဘားကုဒ် — မထည့်ရင် အလိုအလျောက် ထုတ်ပေးမည်။ ကော်လံကို Text format ထားပါ', 'Existing barcode — leave empty to generate one. Format this column as Text so leading zeros are kept'],
  ['', 'အရွယ်/အရောင် များရင် တစ်ကြောင်းစီ ရေးပါ (အမည်တူ၊ အမျိုးအစားတူ)', 'One row per size/colour (same name and category)'],
]

export function downloadTemplate() {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...IMPORT_COLUMNS], ...EXAMPLES]), 'products')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(HELP), 'help')
  XLSX.writeFile(wb, 'u-ahi-products-template.xlsx')
}

export function Import() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<{ products: ParsedProduct[]; errors: ImportError[] }>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)

  async function pick(file?: File) {
    if (!file || !settings) return
    setMsg(undefined)
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      setParsed(parseImport(rows, settings.units))
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
      setMsg({ ok: true, text: t('import.done', { count: n }) })
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  const variants = parsed?.products.reduce((n, p) => n + Math.max(1, p.variants.length), 0) ?? 0

  return (
    <Screen title={t('import.title')}>
      <div className="mx-auto max-w-3xl space-y-4">
        <ol className="list-decimal space-y-1 pl-8 text-xl">
          <li>{t('import.step1')}</li>
          <li>{t('import.step2')}</li>
          <li>{t('import.step3')}</li>
        </ol>
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
            <p className="text-xl font-bold">{t('import.preview', { products: parsed.products.length, labels: variants })}</p>
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
