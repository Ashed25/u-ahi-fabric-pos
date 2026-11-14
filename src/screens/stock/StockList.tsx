import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatLargestFirst } from '../../core/length'
import { fabricLeft, isLow, remnantCandidates } from '../../core/stock'
import { findByBarcode } from '../../db/products'
import { db } from '../../db/schema'
import { useSettings } from '../../db/useSettings'
import { Btn, Screen } from '../../ui/kit'
import { Photo } from '../../ui/photo'
import { go } from '../../ui/router'
import { beepError, beepOk } from '../../ui/sound'
import { useScanner } from '../../ui/useScanner'

export function useStockData() {
  return useLiveQuery(async () => {
    const [products, variants, rolls] = await Promise.all([db.products.toArray(), db.variants.toArray(), db.rolls.toArray()])
    return products
      .map((p) => {
        const pRolls = rolls.filter((r) => r.productId === p.id)
        const left = p.kind === 'piece' ? variants.filter((v) => v.productId === p.id).reduce((s, v) => s + v.qty, 0) : fabricLeft(pRolls)
        return { p, left, rolls: pRolls, low: isLow(left, p.lowStock) }
      })
      .sort((a, b) => a.p.nameMy.localeCompare(b.p.nameMy))
  }, [])
}

/** Scanning on a stock screen opens that product's stock page. */
export function useScanToProduct(query = '') {
  useScanner(async (code) => {
    const found = await findByBarcode(code)
    if (!found) return beepError()
    beepOk()
    go(`#/stock/${found.product.id}${query}`)
  })
}

export function StockList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const data = useStockData()
  const [lowOnly, setLowOnly] = useState(false)
  useScanToProduct()
  if (!settings || !data) return null

  const short = data.flatMap((d) => remnantCandidates(d.rolls, settings.remnantBelowTenths).map((r) => ({ d, r })))
  const shown = data.filter((d) => d.p.active && (!lowOnly || d.low))
  const leftText = (d: (typeof data)[number]) =>
    d.p.kind === 'piece' ? t('stock.pieces', { count: d.left }) : `${formatLargestFirst(d.left, settings.units, lang)} · ${t('stock.rolls', { count: d.rolls.filter((r) => r.status !== 'finished').length })}`

  return (
    <Screen
      title={t('stock.title')}
      actions={
        <Btn variant="plain" onClick={() => go('#/count')}>
          📋 {t('count.title')}
        </Btn>
      }
    >
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="text-lg text-slate-700">{t('stock.scanHint')}</p>
        {short.length > 0 && (
          <section className="rounded-2xl bg-amber-50 p-4">
            <h2 className="mb-2 text-xl font-bold">✂ {t('stock.shortRolls')}</h2>
            {short.map(({ d, r }) => (
              <button key={r.id} className="flex min-h-14 w-full items-center justify-between text-left text-xl" onClick={() => go(`#/stock/${d.p.id}`)}>
                <span>{d.p.nameMy}</span>
                <b>{formatLargestFirst(r.remainingTenths, settings.units, lang)}</b>
              </button>
            ))}
          </section>
        )}
        <div className="flex gap-2">
          <Btn variant={!lowOnly ? 'primary' : 'plain'} onClick={() => setLowOnly(false)}>
            {t('common.all')}
          </Btn>
          <Btn variant={lowOnly ? 'primary' : 'plain'} onClick={() => setLowOnly(true)}>
            ⚠ {t('stock.lowOnly', { count: data.filter((d) => d.p.active && d.low).length })}
          </Btn>
        </div>
        <ul className="divide-y-2 divide-slate-200">
          {shown.map((d) => (
            <li key={d.p.id}>
              <button className="flex w-full items-center gap-4 py-2 text-left" onClick={() => go(`#/stock/${d.p.id}`)}>
                <Photo blob={d.p.photo} className="h-16 w-16 shrink-0 rounded-xl" />
                <span className="flex-1 text-xl font-bold">{d.p.nameMy}</span>
                <span className={`text-xl ${d.low ? 'font-bold text-red-700' : ''}`}>
                  {d.low && '⚠ '}
                  {leftText(d)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  )
}
