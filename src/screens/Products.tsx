import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatLargestFirst } from '../core/length'
import { deleteCategory } from '../db/products'
import { type Product, db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { priceText } from '../ui/format'
import { Btn, Modal, Screen, inputCls } from '../ui/kit'
import { Photo } from '../ui/photo'
import { go } from '../ui/router'
import { useStockData } from './stock/StockList'

type Sort = 'name' | 'priceUp' | 'priceDown' | 'stock' | 'recent'
export interface View { sort: Sort; kind: '' | Product['kind']; status: '' | 'active' | 'hidden'; stock: '' | 'low' | 'out' }
type Item = { p: Product; left: number; low: boolean }

const VIEW_KEY = 'products.view'
const DEFAULT_VIEW: View = { sort: 'name', kind: '', status: '', stock: '' }
const price = (p: Product) => (p.kind === 'piece' ? p.priceKs : p.unitPriceKs) ?? 0
const short = (d: Item) => d.low || d.left <= 0
const SORTS: Record<Sort, (a: Item, b: Item) => number> = {
  name: (a, b) => a.p.nameMy.localeCompare(b.p.nameMy),
  priceUp: (a, b) => price(a.p) - price(b.p),
  priceDown: (a, b) => price(b.p) - price(a.p),
  stock: (a, b) => Number(short(b)) - Number(short(a)) || a.left - b.left, // low/out first
  recent: (a, b) => b.p.updatedAt - a.p.updatedAt,
}

/** Search, category and the sort/filter row in one place, so the screen and its test agree. */
export function applyView(items: Item[], view: View, q: string, cat?: number): Item[] {
  const needle = q.trim().toLowerCase()
  return items
    .filter(({ p }) => cat === undefined || p.categoryId === cat)
    .filter(({ p }) => !needle || p.nameMy.includes(needle) || p.nameEn.toLowerCase().includes(needle))
    .filter(({ p }) => !view.kind || p.kind === view.kind)
    .filter(({ p }) => !view.status || p.active === (view.status === 'active'))
    .filter((d) => !view.stock || (view.stock === 'out' ? d.left <= 0 : short(d)))
    .sort((a, b) => SORTS[view.sort](a, b) || SORTS.name(a, b))
}

function loadView(): View {
  try {
    const v = { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') }
    return v.sort in SORTS ? v : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function Products() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const [q, setQ] = useState('')
  const [view, setView] = useState(loadView)
  const [cat, setCat] = useState<number>()
  const [confirmCat, setConfirmCat] = useState(false)
  const [msg, setMsg] = useState('')
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const items = useStockData()
  if (!settings || !categories || !items) return null

  const shown = applyView(items, view, q, cat)
  const change = (v: Partial<View>) => {
    const next = { ...view, ...v }
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(next)) // per-device convenience only
    } catch {}
  }
  const pick = <K extends keyof View>(key: K, options: [View[K], string][]) => (
    <select className={inputCls} value={view[key]} onChange={(e) => change({ [key]: e.target.value })} data-testid={`view-${key}`}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  )

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
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {pick('sort', [
          ['name', t('products.sortName')],
          ['priceUp', t('products.sortPriceUp')],
          ['priceDown', t('products.sortPriceDown')],
          ['stock', t('products.sortStock')],
          ['recent', t('products.sortRecent')],
        ])}
        {pick('kind', [
          ['', t('products.allTypes')],
          ['piece', t('product.kindPiece')],
          ['length', t('product.kindLength')],
        ])}
        {pick('status', [
          ['', t('products.allStatus')],
          ['active', t('products.forSale')],
          ['hidden', t('products.hidden')],
        ])}
        {pick('stock', [
          ['', t('products.allStock')],
          ['low', t('products.lowOrOut')],
          ['out', t('products.outOfStock')],
        ])}
      </div>
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
        {shown.map((d) => (
          <li key={d.p.id}>
            <button className="flex w-full items-center gap-4 py-2 text-left" onClick={() => go(`#/products/${d.p.id}`)}>
              <Photo blob={d.p.photo} className="h-16 w-16 shrink-0 rounded-xl" />
              <span className="flex-1">
                <span className="block text-xl font-bold">{d.p.nameMy}</span>
                <span className="block text-slate-600">
                  {priceText(t, d.p, settings.units, i18n.language)}
                  {' · '}
                  <span className={short(d) ? 'font-bold text-red-700' : ''}>
                    {short(d) && '⚠ '}
                    {d.p.kind === 'piece' ? t('stock.pieces', { count: d.left }) : formatLargestFirst(d.left, settings.units, lang)}
                  </span>
                </span>
              </span>
              {!d.p.active && <span className="rounded-lg bg-slate-200 px-2 text-base">{t('products.hidden')}</span>}
              <span className="rounded-lg bg-blue-100 px-2 text-base text-blue-900">
                {t(d.p.kind === 'piece' ? 'product.kindPiece' : 'product.kindLength')}
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
