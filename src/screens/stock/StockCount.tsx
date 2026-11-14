import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, timeText } from '../../core/fy'
import { db } from '../../db/schema'
import { Btn, Screen } from '../../ui/kit'
import { Photo } from '../../ui/photo'
import { go } from '../../ui/router'
import { useScanToProduct } from './StockList'

const KEY = 'u-ahi-count-start'
const read = () => {
  try {
    return Number(localStorage.getItem(KEY)) || undefined
  } catch {
    return undefined
  }
}
const write = (v?: number) => {
  try {
    if (v) localStorage.setItem(KEY, String(v))
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: the count still works for this visit
  }
}

/** Stock count (also the opening count): scan or tap each item, enter what is really there. */
export function StockCount() {
  const { t } = useTranslation()
  const [start, setStart] = useState(read)
  useScanToProduct('?count=1')

  const data = useLiveQuery(async () => {
    const products = (await db.products.filter((p) => p.active).toArray()).sort((a, b) => a.nameMy.localeCompare(b.nameMy))
    const counted = start ? new Set((await db.stockMoves.where('at').aboveOrEqual(start).filter((m) => m.reason === 'count').toArray()).map((m) => m.productId)) : new Set<number>()
    return { products, counted }
  }, [start])
  if (!data) return null

  if (!start)
    return (
      <Screen title={t('count.title')} back="#/stock">
        <div className="mx-auto max-w-2xl space-y-4 text-xl">
          <p>{t('count.intro')}</p>
          <Btn
            variant="ok"
            className="w-full py-4"
            onClick={() => {
              const now = Date.now()
              write(now)
              setStart(now)
            }}
          >
            {t('count.start')}
          </Btn>
        </div>
      </Screen>
    )

  const todo = data.products.filter((p) => !data.counted.has(p.id!))
  const done = data.products.filter((p) => data.counted.has(p.id!))
  return (
    <Screen title={t('count.title')} back="#/stock">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-2xl font-bold">
          {t('count.progress', { done: done.length, total: data.products.length })}{' '}
          <span className="text-base font-normal text-slate-600">
            ({t('count.since')} {dateKey(start)} {timeText(start)})
          </span>
        </p>
        <p className="text-lg text-slate-700">{t('count.scanHint')}</p>
        <ul className="divide-y-2 divide-slate-200">
          {[...todo, ...done].map((p) => (
            <li key={p.id}>
              <button className="flex w-full items-center gap-4 py-2 text-left" onClick={() => go(`#/stock/${p.id}?count=1`)}>
                <span className="w-10 text-3xl">{data.counted.has(p.id!) ? '✅' : '⬜'}</span>
                <Photo blob={p.photo} className="h-14 w-14 rounded-lg" />
                <span className={`text-xl ${data.counted.has(p.id!) ? 'text-slate-400' : 'font-bold'}`}>{p.nameMy}</span>
              </button>
            </li>
          ))}
        </ul>
        <Btn
          variant="plain"
          className="w-full"
          onClick={() => {
            write(undefined)
            setStart(undefined)
          }}
        >
          {t('count.finish')}
        </Btn>
      </div>
    </Screen>
  )
}
