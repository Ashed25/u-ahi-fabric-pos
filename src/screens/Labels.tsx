import { useEffect, useMemo, useState } from 'react'
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
import { formatLargestFirst } from '../core/length'

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

  // Default: one label for every product in the chosen category.
  useEffect(() => {
    if (!data) return
    setCopies(Object.fromEntries(data.products.filter((p) => cat === undefined || p.categoryId === cat).map((p) => [p.id!, 1])))
  }, [data, cat])

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
      <div>
        <div className="no-print sticky top-0 z-10 flex gap-3 bg-blue-900 p-2">
          <Btn variant="plain" onClick={() => history.back()}>
            ← {t('common.back')}
          </Btn>
          <Btn variant="ok" onClick={() => window.print()}>
            🖨 {t('labels.print')}
          </Btn>
        </div>
        <PrintSheets layout="t50" items={[item]} settings={settings} skip={0} categories={data.categories} />
      </div>
    )
  }

  if (printing)
    return (
      <div>
        <div className="no-print sticky top-0 z-10 flex gap-3 bg-blue-900 p-2">
          <Btn variant="plain" onClick={() => setPrinting(false)}>
            ← {t('common.back')}
          </Btn>
          <Btn variant="ok" onClick={() => window.print()}>
            🖨 {t('labels.print')}
          </Btn>
          <span className="self-center text-white">{t('labels.printHint')}</span>
        </div>
        <PrintSheets layout={layout} items={items} settings={settings} skip={skip} categories={data.categories} />
      </div>
    )

  const shown = data.products.filter((p) => cat === undefined || p.categoryId === cat)
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

        <div className="flex gap-2">
          <Btn variant="plain" onClick={() => setCopies(Object.fromEntries(shown.map((p) => [p.id!, 1])))}>
            {t('labels.all')}
          </Btn>
          <Btn variant="plain" onClick={() => setCopies({})}>
            {t('labels.none')}
          </Btn>
        </div>

        <ul className="divide-y-2 divide-slate-200">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <Photo blob={p.photo} className="h-14 w-14 rounded-lg" />
              <span className="flex-1 text-xl">{p.nameMy}</span>
              {layout === 'book' ? (
                <input
                  type="checkbox"
                  className="h-10 w-10"
                  checked={!!copies[p.id!]}
                  onChange={(e) => setCopies({ ...copies, [p.id!]: e.target.checked ? 1 : 0 })}
                />
              ) : (
                <>
                  <span className="text-base text-slate-600">{t('labels.copies')}</span>
                  <input
                    className={`${inputCls} w-24 text-center`}
                    inputMode="numeric"
                    value={copies[p.id!] ?? 0}
                    onChange={(e) => setCopies({ ...copies, [p.id!]: toInt(e.target.value) ?? 0 })}
                  />
                </>
              )}
            </li>
          ))}
        </ul>

        <Btn variant="ok" className="sticky bottom-2 w-full py-4" disabled={!items.length} onClick={() => setPrinting(true)}>
          {t('labels.preview', { count: items.length })}
        </Btn>
      </div>
    </Screen>
  )
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
