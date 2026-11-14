import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { type Product, type Variant, db } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { priceText, subText } from '../../ui/format'
import { Btn, Modal } from '../../ui/kit'
import { Photo } from '../../ui/photo'
import { useScanner } from '../../ui/useScanner'

/** For items whose label is missing: pick by picture, by category. */
export function PhotoGrid({ settings, title, onPick, onClose }: { settings: Settings; title: string; onPick: (p: Product) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [cat, setCat] = useState<number>()
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const products = useLiveQuery(() => db.products.filter((p) => p.active).toArray(), [])
  useScanner(null)
  if (!categories || !products) return null
  const shown = products.filter((p) => cat === undefined || p.categoryId === cat).sort((a, b) => a.nameMy.localeCompare(b.nameMy))

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center gap-3 bg-blue-900 px-4 py-2 text-white">
        <h2 className="flex-1 text-2xl font-bold">{title}</h2>
        <Btn variant="plain" onClick={onClose}>
          ✕ {t('common.close')}
        </Btn>
      </header>
      <div className="flex flex-wrap gap-2 p-3">
        <Btn variant={cat === undefined ? 'primary' : 'plain'} onClick={() => setCat(undefined)}>
          {t('common.all')}
        </Btn>
        {categories.map((c) => (
          <Btn key={c.id} variant={cat === c.id ? 'primary' : 'plain'} onClick={() => setCat(c.id)}>
            {c.nameMy}
          </Btn>
        ))}
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-auto p-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((p) => (
          <button key={p.id} className="flex flex-col overflow-hidden rounded-2xl border-2 border-slate-200 text-left active:bg-slate-100" onClick={() => onPick(p)}>
            <Photo blob={p.photo} className="aspect-square w-full" />
            <span className="px-2 pt-1 text-xl font-bold leading-snug">{p.nameMy}</span>
            <span className="px-2 pb-2 text-lg text-slate-700">{priceText(t, p, settings.units, i18n.language)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Clothes with several sizes/colours: big buttons, one per variant. */
export function VariantPick({ product: p, onPick, onClose }: { product: Product; onPick: (v: Variant) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const variants = useLiveQuery(() => db.variants.where('productId').equals(p.id!).toArray(), [p.id])
  useScanner(null)
  return (
    <Modal onClose={onClose}>
      <h2 className="mb-4 text-3xl font-bold">{p.nameMy}</h2>
      <div className="grid gap-3">
        {variants?.map((v) => (
          <Btn key={v.id} variant="plain" className="flex min-h-20 items-center justify-between text-2xl" onClick={() => onPick(v)}>
            <span>{subText(t, p, v) || p.nameMy}</span>
            <span>{priceText(t, p, [], i18n.language, v)}</span>
          </Btn>
        ))}
      </div>
      <Btn variant="plain" className="mt-4 w-full" onClick={onClose}>
        {t('common.cancel')}
      </Btn>
    </Modal>
  )
}
