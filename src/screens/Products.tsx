import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { priceText } from '../ui/format'
import { Btn, Screen, inputCls } from '../ui/kit'
import { Photo } from '../ui/photo'
import { go } from '../ui/router'

export function Products() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<number>()
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  if (!settings || !categories || !products) return null

  const needle = q.trim().toLowerCase()
  const shown = products
    .filter((p) => cat === undefined || p.categoryId === cat)
    .filter((p) => !needle || p.nameMy.includes(needle) || p.nameEn.toLowerCase().includes(needle))
    .sort((a, b) => a.nameMy.localeCompare(b.nameMy))

  return (
    <Screen
      title={t('products.title')}
      actions={
        <Btn variant="ok" onClick={() => go('#/products/new')}>
          + {t('products.add')}
        </Btn>
      }
    >
      <input className={inputCls} placeholder={t('products.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="my-3 flex flex-wrap gap-2">
        <Btn variant={cat === undefined ? 'primary' : 'plain'} onClick={() => setCat(undefined)}>
          {t('common.all')}
        </Btn>
        {categories.map((c) => (
          <Btn key={c.id} variant={cat === c.id ? 'primary' : 'plain'} onClick={() => setCat(c.id)}>
            {c.nameMy}
          </Btn>
        ))}
      </div>
      <p className="mb-2 text-slate-600">{t('products.count', { count: shown.length })}</p>
      <ul className="divide-y-2 divide-slate-200">
        {shown.map((p) => (
          <li key={p.id}>
            <button className="flex w-full items-center gap-4 py-2 text-left" onClick={() => go(`#/products/${p.id}`)}>
              <Photo blob={p.photo} className="h-16 w-16 shrink-0 rounded-xl" />
              <span className="flex-1">
                <span className="block text-xl font-bold">{p.nameMy}</span>
                <span className="block text-slate-600">{priceText(t, p, settings.units, i18n.language)}</span>
              </span>
              {!p.active && <span className="rounded-lg bg-slate-200 px-2 text-base">{t('products.hidden')}</span>}
              <span className="rounded-lg bg-blue-100 px-2 text-base text-blue-900">
                {t(p.kind === 'piece' ? 'product.kindPiece' : 'product.kindLength')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  )
}
