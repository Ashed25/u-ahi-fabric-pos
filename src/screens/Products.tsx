import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { deleteCategory } from '../db/products'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { priceText } from '../ui/format'
import { Btn, Modal, Screen, inputCls } from '../ui/kit'
import { Photo } from '../ui/photo'
import { go } from '../ui/router'

export function Products() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<number>()
  const [confirmCat, setConfirmCat] = useState(false)
  const [msg, setMsg] = useState('')
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
      {cat !== undefined && (
        <Btn variant="plain" className="mb-3 text-red-700" onClick={() => (setMsg(''), setConfirmCat(true))}>
          🗑 {t('products.deleteCategory')}
        </Btn>
      )}
      {msg && <p className="mb-3 rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{msg}</p>}
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
      {confirmCat && cat !== undefined && (
        <Modal onClose={() => setConfirmCat(false)}>
          <p className="mb-4 text-xl">{t('products.confirmDeleteCategory', { name: categories.find((c) => c.id === cat)?.nameMy })}</p>
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setConfirmCat(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="danger"
              onClick={async () => {
                setConfirmCat(false)
                try {
                  if (await deleteCategory(cat)) setCat(undefined)
                  else setMsg(t('products.cantDeleteCategory'))
                } catch (e) {
                  setMsg(String(e))
                }
              }}
            >
              {t('products.deleteCategory')}
            </Btn>
          </div>
        </Modal>
      )}
    </Screen>
  )
}
