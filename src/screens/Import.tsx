import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import { type ImportError, type ParsedProduct, parseImport } from '../core/importer'
import { formatInches, formatLargestFirst } from '../core/length'
import { perYard } from '../core/pricing'
import { sellableRolls } from '../core/stock'
import type { Unit } from '../core/units'
import { audit } from '../db/audit'
import { download } from '../ui/download'
import { importProducts, matchExisting, missingFrom } from '../db/products'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'
import { ACTIVE_WORD, buildBook, DETAILS, EXAMPLES, type Row, STOCK_COL, TYPE_WORD } from './productSheet'

/** Every product as sheet rows (one per size/colour), ready to edit and upload again. */
export async function productRows(units: Unit[]): Promise<Row[]> {
  const [products, variants, barcodes, categories, rolls] = await Promise.all([db.products.toArray(), db.variants.toArray(), db.barcodes.toArray(), db.categories.toArray(), db.rolls.toArray()])
  const cat = new Map(categories.map((c) => [c.id, c]))
  const code = (pid: number, vid?: number) => barcodes.find((b) => b.productId === pid && b.variantId === vid)?.code ?? ''
  products.sort((a, b) => (cat.get(a.categoryId)?.sort ?? 1e9) - (cat.get(b.categoryId)?.sort ?? 1e9) || a.nameMy.localeCompare(b.nameMy))
  const rows: Row[] = []
  for (const p of products) {
    const base: Row = {
      product_id: p.id, type: TYPE_WORD[p.kind], name_my: p.nameMy, name_en: p.nameEn, category: cat.get(p.categoryId)?.nameMy ?? '',
      wholesale_price_ks: p.wholesalePriceKs, wholesale_min: p.wholesaleMin, cost_ks: p.costKs, active: ACTIVE_WORD[p.active ? 'yes' : 'no'],
    }
    if (p.kind === 'length') {
      const left = sellableRolls(rolls.filter((r) => r.productId === p.id)).reduce((s, r) => s + r.remainingTenths, 0)
      const yd = perYard(p, units)
      rows.push({
        ...base, price_ks: yd.unitPriceKs, wholesale_price_ks: yd.wholesalePriceKs, wholesale_min: yd.wholesaleMin,
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
  const [parsed, setParsed] = useState<{ products: ParsedProduct[]; errors: ImportError[]; missing: string[] }>()
  const [remove, setRemove] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)

  async function save(rows: Row[], filename: string, header?: typeof DETAILS) {
    const lists = { categories: (await db.categories.orderBy('sort').toArray()).map((c) => c.nameMy) }
    download(new Blob([await buildBook(rows, lists, header)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
  }

  async function downloadAll() {
    if (!settings) return
    await audit('export.excel', 'products')
    await save(await productRows(settings.units), `u-ahi-products-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function pick(file?: File) {
    if (!file || !settings) return
    setMsg(undefined)
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const p = parseImport(rows, settings.units)
      const products = await matchExisting(p.products)
      // Only a sheet downloaded from the app (it has product numbers) can delete: a file of new products deletes nothing.
      const gone = p.products.some((x) => x.id) ? await missingFrom(products) : { products: [], variants: [] }
      const names = new Map((await db.products.toArray()).map((x) => [x.id, x.nameMy]))
      const missing = [
        ...gone.products.map((x) => x.nameMy),
        ...gone.variants.map((v) => `${names.get(v.productId)} (${[v.size, v.colour].filter(Boolean).join(' · ')})`),
      ]
      setRemove(true)
      setParsed({ ...p, products, missing })
    } catch (e) {
      setMsg({ ok: false, text: `${t('import.badFile')} (${String(e)})` })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function run() {
    if (!parsed) return
    setBusy(true)
    try {
      const n = await importProducts(parsed.products, remove && parsed.missing.length > 0)
      setParsed(undefined)
      setMsg({ ok: true, text: [t('import.doneUpdate', n), n.removed + n.hidden > 0 && t('import.doneRemove', n)].filter(Boolean).join(' · ') })
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
        <Btn variant="plain" className="w-full" onClick={() => save(EXAMPLES, 'u-ahi-products-template.xlsx', DETAILS)}>
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
            {parsed.missing.length > 0 && (
              <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 p-3">
                <p className="text-xl font-bold text-red-800">{t('import.missing', { count: parsed.missing.length })}</p>
                <ul className="max-h-48 list-disc overflow-auto pl-8 text-lg">
                  {parsed.missing.map((name, i) => (
                    <li key={i}>{name}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-center gap-3 text-xl">
                  <input type="checkbox" className="h-8 w-8" checked={remove} onChange={(e) => setRemove(e.target.checked)} data-testid="import-remove" />
                  {t('import.removeMissing')}
                </label>
              </div>
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
