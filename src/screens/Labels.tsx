import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { type Barcode, db } from '../db/schema'
import { setSetting, type Settings } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { BarcodeSvg } from '../ui/BarcodeSvg'
import { priceText, subText } from '../ui/format'
import { Btn, Field, Screen, inputCls, toInt } from '../ui/kit'
import { Photo } from '../ui/photo'
import { useRoute } from '../ui/router'
import { dateKey } from '../core/fy'
import { download } from '../ui/download'
import { formatLargestFirst } from '../core/length'
import { printLabels } from '../ui/btPrinter'
import type { LabelText } from '../ui/labelImage'

type Layout = 't40' | 't50' | 'a4' | 'book'
const THERMAL = { t40: [40, 30], t50: [50, 30] } as const

interface Item {
  key: string
  code: string
  name: string
  sub: string
  price: string
  categoryId?: number
  photo?: Blob
}

// Prefer our own generated code (always EAN-13) over a supplier code.
const pick = (codes: Barcode[]) => codes.find((b) => b.source === 'generated') ?? codes[0]

export function Labels() {
  const { t, i18n } = useTranslation()
  const { query } = useRoute()
  const settings = useSettings()
  const [layout, setLayout] = useState<Layout>('t40')
  const [cat, setCat] = useState<number | undefined>(query.cat ? Number(query.cat) : undefined)
  const [copies, setCopies] = useState<Record<number, number>>({})
  const [skip, setSkip] = useState(0)
  const [printing, setPrinting] = useState(false)
  const [q, setQ] = useState('')

  const data = useLiveQuery(async () => {
    const [categories, products, variants, barcodes, rolls] = await Promise.all([
      db.categories.orderBy('sort').toArray(),
      db.products.filter((p) => p.active).toArray(),
      db.variants.toArray(),
      db.barcodes.toArray(),
      db.rolls.toArray(),
    ])
    return { categories, products: products.sort((a, b) => a.nameMy.localeCompare(b.nameMy)), variants, barcodes, rolls }
  }, [])

  // Default: one label for every product in the opening category. Only once, so switching category
  // or a live data refresh doesn't wipe what the user ticked.
  const inited = useRef(false)
  useEffect(() => {
    if (!data || inited.current) return
    inited.current = true
    setCopies(Object.fromEntries(data.products.filter((p) => cat === undefined || p.categoryId === cat).map((p) => [p.id!, 1])))
  }, [data, cat])

  // How many different labels one copy of a product makes (one per size/colour that has a barcode).
  const perCopy = useMemo(() => {
    const m: Record<number, number> = {}
    if (!data) return m
    for (const p of data.products) {
      const codes = data.barcodes.filter((b) => b.productId === p.id)
      const targets = p.kind === 'length' ? [undefined] : data.variants.filter((v) => v.productId === p.id)
      m[p.id!] = targets.filter((v) => codes.some((c) => (v ? c.variantId === v.id : c.variantId == null))).length
    }
    return m
  }, [data])

  const items = useMemo(() => {
    if (!data || !settings) return []
    const out: Item[] = []
    for (const p of data.products) {
      const n = layout === 'book' ? Math.min(1, copies[p.id!] ?? 0) : (copies[p.id!] ?? 0)
      if (!n) continue
      const codes = data.barcodes.filter((b) => b.productId === p.id)
      const targets = p.kind === 'length' ? [undefined] : data.variants.filter((v) => v.productId === p.id)
      for (const v of targets) {
        const b = pick(codes.filter((c) => (v ? c.variantId === v.id : c.variantId == null)))
        if (!b) continue
        const item = { code: b.code, name: p.nameMy, sub: subText(t, p, v), price: priceText(t, p, settings.units, i18n.language, v), categoryId: p.categoryId, photo: p.photo }
        for (let i = 0; i < n; i++) out.push({ ...item, key: `${b.code}-${i}` })
      }
    }
    return out
  }, [data, settings, copies, layout, t, i18n.language])

  // Opened from a roll on the stock screen: print just that roll's label.
  const rollId = query.roll ? Number(query.roll) : undefined
  const roll = rollId ? data?.rolls.find((r) => r.id === rollId) : undefined
  const rollProduct = roll && data?.products.find((p) => p.id === roll.productId)
  const rollCode = rollProduct && pick(data!.barcodes.filter((b) => b.productId === rollProduct.id && b.variantId == null))

  if (!data || !settings) return null

  if (roll && rollProduct && rollCode) {
    const item: Item = {
      key: `roll-${roll.id}`,
      code: rollCode.code,
      name: rollProduct.nameMy,
      sub: `${t('stock.roll')} #${roll.id} · ${formatLargestFirst(roll.startTenths, settings.units, i18n.language === 'en' ? 'en' : 'my')} · ${dateKey(roll.receivedAt)}`,
      price: priceText(t, rollProduct, settings.units, i18n.language),
    }
    return (
      <PrintView onBack={() => history.back()} bt={{ items: [item], w: 50, h: 30 }}>
        <PrintSheets layout="t50" items={[item]} settings={settings} skip={0} categories={data.categories} />
      </PrintView>
    )
  }

  if (printing)
    return (
      <PrintView onBack={() => setPrinting(false)} bt={layout === 't40' || layout === 't50' ? { items, w: THERMAL[layout][0], h: THERMAL[layout][1] } : undefined}>
        <PrintSheets layout={layout} items={items} settings={settings} skip={skip} categories={data.categories} />
      </PrintView>
    )

  const needle = q.trim().toLowerCase()
  const shown = data.products.filter((p) => (cat === undefined || p.categoryId === cat) && (!needle || p.nameMy.toLowerCase().includes(needle)))
  const printable = shown.filter((p) => perCopy[p.id!])
  const book = layout === 'book'
  const setN = (id: number, n: number) => setCopies((c) => ({ ...c, [id]: Math.max(0, Math.min(99, n)) }))
  const setShown = (n: number) => setCopies((c) => ({ ...c, ...Object.fromEntries(printable.map((p) => [p.id!, n])) }))
  const picked = data.products.filter((p) => copies[p.id!] && perCopy[p.id!]).length
  const allShownPicked = printable.length > 0 && printable.every((p) => copies[p.id!])
  const a4 = settings.a4Layout
  const setA4 = (k: keyof Settings['a4Layout'], v: string) => {
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) setSetting('a4Layout', { ...a4, [k]: n })
  }

  return (
    <Screen title={t('labels.title')}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(['t40', 't50', 'a4', 'book'] as const).map((l) => (
            <Btn key={l} variant={layout === l ? 'primary' : 'plain'} onClick={() => setLayout(l)}>
              {t(`labels.layout_${l}`)}
            </Btn>
          ))}
        </div>

        {layout === 'a4' && (
          <div className="grid grid-cols-4 gap-2 rounded-2xl bg-slate-100 p-3 text-base">
            {(Object.keys(a4) as (keyof typeof a4)[]).map((k) => (
              <Field key={k} label={t(`labels.a4_${k}`)}>
                <input className={inputCls} inputMode="decimal" defaultValue={a4[k]} onBlur={(e) => setA4(k, e.target.value)} />
              </Field>
            ))}
            <Field label={t('labels.skip')}>
              <input className={inputCls} inputMode="numeric" value={skip} onChange={(e) => setSkip(toInt(e.target.value) ?? 0)} />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Btn variant={cat === undefined ? 'primary' : 'plain'} onClick={() => setCat(undefined)}>
            {t('common.all')}
          </Btn>
          {data.categories.map((c) => (
            <Btn key={c.id} variant={cat === c.id ? 'primary' : 'plain'} onClick={() => setCat(c.id)}>
              {c.nameMy}
            </Btn>
          ))}
        </div>

        <input className={inputCls} placeholder={t('products.search')} value={q} onChange={(e) => setQ(e.target.value)} />

        <label className="flex items-center gap-3 px-2 text-lg font-bold">
          <input type="checkbox" className="h-8 w-8 accent-blue-800" checked={allShownPicked} disabled={!printable.length} onChange={(e) => setShown(e.target.checked ? 1 : 0)} />
          {t('labels.all')} ({printable.length})
        </label>

        <ul className="space-y-2">
          {shown.map((p) => {
            const n = copies[p.id!] ?? 0
            const per = perCopy[p.id!]
            const on = n > 0 && per > 0
            return (
              <li key={p.id} className={`flex items-center gap-3 rounded-xl border-2 p-2 ${on ? 'border-blue-700 bg-blue-50' : 'border-slate-200 bg-white'} ${per ? '' : 'opacity-60'}`}>
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input type="checkbox" className="h-8 w-8 shrink-0 accent-blue-800" checked={on} disabled={!per} onChange={(e) => setN(p.id!, e.target.checked ? 1 : 0)} />
                  <Photo blob={p.photo} className="h-14 w-14 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-xl">{p.nameMy}</span>
                    {!per ? (
                      <span className="block text-base text-red-700">{t('labels.noBarcode')}</span>
                    ) : (
                      per > 1 && <span className="block text-base text-slate-600">{t('labels.variantsHint', { per, count: per * (book ? 1 : Math.max(n, 1)) })}</span>
                    )}
                  </span>
                </label>
                {!book && per > 0 && (
                  <div className="flex shrink-0 items-center gap-1" aria-label={t('labels.copies')}>
                    <Btn variant="plain" className="h-12 w-12 px-0 text-2xl" disabled={!n} onClick={() => setN(p.id!, n - 1)} aria-label="−">
                      −
                    </Btn>
                    <input
                      className="h-12 w-14 rounded-lg border border-slate-300 bg-white text-center text-xl font-bold"
                      inputMode="numeric"
                      aria-label={t('labels.copies')}
                      value={n}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setN(p.id!, toInt(e.target.value) ?? 0)}
                    />
                    <Btn variant="plain" className="h-12 w-12 px-0 text-2xl" disabled={n >= 99} onClick={() => setN(p.id!, n + 1)} aria-label="+">
                      +
                    </Btn>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="sticky bottom-2 flex items-center gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-lg">
          <span className="px-2 text-lg">{t('labels.selected', { count: picked })}</span>
          {picked > 0 && (
            <Btn variant="plain" className="py-3" onClick={() => setCopies({})}>
              {t('labels.none')}
            </Btn>
          )}
          <Btn variant="ok" className="flex-1 py-4" disabled={!items.length} onClick={() => setPrinting(true)}>
            {t('labels.preview', { count: items.length })}
          </Btn>
        </div>
      </div>
    </Screen>
  )
}

/** Print toolbar + sheets. Thermal labels go straight to the Bluetooth label printer when one is connected (Settings).
 *  Otherwise the print dialog; installed phone/tablet apps silently ignore window.print(), so when no print
 *  dialog shows up we offer the labels as a file to open in Chrome/Safari (or a label-printer app). */
function PrintView({ onBack, children, bt }: { onBack: () => void; children: ReactNode; bt?: { items: LabelText[]; w: number; h: number } }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const sheets = useRef<HTMLDivElement>(null)
  const [noDialog, setNoDialog] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<number>() // labels sent so far while Bluetooth printing
  const stop = useRef(false)
  const printer = bt && settings?.labelPrinter

  async function print() {
    setError(undefined)
    if (printer) {
      stop.current = false
      setDone(0)
      try {
        await printLabels(printer, bt.items, settings!.shopName, bt.w, bt.h, setDone, () => stop.current)
      } catch (e) {
        setError(`${t('printer.failed')} (${(e as Error).message})`)
      } finally {
        setDone(undefined)
      }
      return
    }
    let opened = false
    const seen = () => (opened = true)
    window.addEventListener('beforeprint', seen, { once: true })
    window.print()
    setTimeout(() => {
      window.removeEventListener('beforeprint', seen)
      if (!opened) setNoDialog(true)
    }, 1500)
  }

  async function share() {
    setError(undefined)
    try {
      const blob = new Blob([await labelsHtml(sheets.current!)], { type: 'text/html' })
      const file = new File([blob], `labels-${dateKey(Date.now())}.html`, { type: 'text/html' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: file.name })
        } catch (e) {
          if ((e as Error).name !== 'NotAllowedError') throw e
          download(blob, file.name)
        }
      } else download(blob, file.name)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e))
    }
  }

  return (
    <div>
      <div className="no-print sticky top-0 z-10 flex flex-wrap gap-3 bg-blue-900 p-2">
        <Btn variant="plain" onClick={onBack}>
          ← {t('common.back')}
        </Btn>
        {done === undefined ? (
          <Btn variant="ok" onClick={print}>
            🖨 {t('labels.print')}
          </Btn>
        ) : (
          <>
            <span className="self-center text-xl font-bold text-white">{t('labels.btPrinting', { done, total: bt!.items.length })}</span>
            <Btn variant="danger" onClick={() => (stop.current = true)}>
              ⏹ {t('labels.stop')}
            </Btn>
          </>
        )}
        <Btn variant="plain" onClick={share}>
          📤 {t('labels.shareFile')}
        </Btn>
        <span className="self-center text-white">{printer ? t('printer.connected', { name: printer.name }) : t('labels.printHint')}</span>
      </div>
      {(noDialog || error) && (
        <p className="no-print m-2 rounded-lg bg-amber-100 p-3 text-amber-900" role="alert">
          {error ?? t('labels.noPrint')}
        </p>
      )}
      <div ref={sheets}>{children}</div>
    </div>
  )
}

/** A stand-alone copy of the label sheets (app CSS inlined, photos embedded) that prints itself when opened in a browser. */
async function labelsHtml(el: HTMLElement): Promise<string> {
  const css = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((r) => r.cssText)
      } catch {
        return [] // cross-origin sheet: not readable, not needed
      }
    })
    .join('\n')
  const copy = el.cloneNode(true) as HTMLElement
  for (const img of copy.querySelectorAll('img')) {
    const blob = await (await fetch(img.src)).blob()
    img.src = await new Promise<string>((ok) => {
      const r = new FileReader()
      r.onload = () => ok(r.result as string)
      r.readAsDataURL(blob)
    })
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Labels</title><style>${css}</style></head><body>${copy.innerHTML}<script>onload=()=>setTimeout(print,500)</script></body></html>`
}

function Label({ item, shop, w, h }: { item: Item; shop: string; w: number; h: number }) {
  const big = h >= 35
  return (
    <div className="label-box flex flex-col overflow-hidden" style={{ width: `${w}mm`, height: `${h}mm`, padding: '1.5mm', lineHeight: 1.35 }}>
      <div style={{ fontSize: big ? '7pt' : '6pt' }} className="truncate">
        {shop}
      </div>
      <div style={{ fontSize: big ? '10pt' : '8pt' }} className="truncate font-bold">
        {item.name}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span style={{ fontSize: big ? '8pt' : '6.5pt' }} className="truncate">
          {item.sub}
        </span>
        <span style={{ fontSize: big ? '11pt' : '9pt' }} className="shrink-0 font-bold">
          {item.price}
        </span>
      </div>
      <BarcodeSvg value={item.code} className="min-h-0 w-full flex-1" fontSize={16} />
    </div>
  )
}

function PrintSheets({ layout, items, settings, skip, categories }: { layout: Layout; items: Item[]; settings: Settings; skip: number; categories: { id?: number; nameMy: string }[] }) {
  const shop = settings.shopName

  if (layout === 't40' || layout === 't50') {
    const [w, h] = THERMAL[layout]
    return (
      <>
        <style>{`@page { size: ${w}mm ${h}mm; margin: 0 }`}</style>
        {items.map((it) => (
          <div key={it.key} className="print-page">
            <Label item={it} shop={shop} w={w} h={h} />
          </div>
        ))}
      </>
    )
  }

  if (layout === 'a4') {
    const a = settings.a4Layout
    const per = a.cols * a.rows
    const cells: (Item | null)[] = [...Array<null>(Math.min(skip, per - 1)).fill(null), ...items]
    const pages = Array.from({ length: Math.ceil(cells.length / per) }, (_, i) => cells.slice(i * per, (i + 1) * per))
    return (
      <>
        <style>{'@page { size: A4; margin: 0 }'}</style>
        {pages.map((cellsOnPage, i) => (
          <div
            key={i}
            className="print-page"
            style={{
              width: '210mm',
              height: '297mm',
              paddingTop: `${a.topMm}mm`,
              paddingLeft: `${a.leftMm}mm`,
              display: 'grid',
              gridTemplateColumns: `repeat(${a.cols}, ${a.wMm}mm)`,
              gridAutoRows: `${a.hMm}mm`,
              columnGap: `${a.gapXMm}mm`,
              rowGap: `${a.gapYMm}mm`,
              alignContent: 'start',
            }}
          >
            {cellsOnPage.map((it, j) => (it ? <Label key={it.key} item={it} shop={shop} w={a.wMm} h={a.hMm} /> : <div key={`skip${j}`} />))}
          </div>
        ))}
      </>
    )
  }

  // Barcode book: A4, grouped by category, with photos — kept at the counter for items whose label fell off.
  const groups = [...categories, { id: undefined, nameMy: '—' }]
    .map((c) => ({ name: c.nameMy, items: items.filter((it) => it.categoryId === c.id) }))
    .filter((g) => g.items.length)
  return (
    <div style={{ width: '190mm', margin: '0 auto' }}>
      <style>{'@page { size: A4; margin: 10mm }'}</style>
      <h1 className="text-center text-2xl font-bold">{shop}</h1>
      {groups.map((g) => (
        <section key={g.name}>
          <h2 className="mt-4 border-b-2 border-black text-xl font-bold" style={{ breakAfter: 'avoid' }}>
            {g.name}
          </h2>
          <div className="grid grid-cols-3 gap-2 pt-2">
            {g.items.map((it) => (
              <div key={it.key} className="flex flex-col items-center border border-slate-400 p-2" style={{ breakInside: 'avoid', fontSize: '9pt' }}>
                <Photo blob={it.photo} className="h-[28mm] w-[28mm]" />
                <div className="w-full truncate text-center font-bold">{it.name}</div>
                <div className="truncate">{it.sub}</div>
                <div className="font-bold">{it.price}</div>
                <BarcodeSvg value={it.code} className="h-[16mm] w-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
