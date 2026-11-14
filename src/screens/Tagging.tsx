import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { db } from '../db/schema'
import { Btn, Screen } from '../ui/kit'
import { Photo } from '../ui/photo'
import { go } from '../ui/router'

/** Tagging day: per category, print labels then tick off what has been labelled. */
export function Tagging() {
  const { t } = useTranslation()
  const categories = useLiveQuery(() => db.categories.orderBy('sort').toArray(), [])
  const products = useLiveQuery(() => db.products.filter((p) => p.active).toArray(), [])
  if (!categories || !products) return null

  const groups = [...categories.map((c) => ({ id: c.id, name: c.nameMy })), { id: undefined, name: t('tagging.noCategory') }]
    .map((g) => ({ ...g, items: products.filter((p) => p.categoryId === g.id) }))
    .filter((g) => g.items.length)
  const done = products.filter((p) => p.tagged).length

  return (
    <Screen title={t('tagging.title')}>
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-2xl font-bold">{t('tagging.progress', { done, total: products.length })}</p>
        {groups.map((g) => (
          <section key={g.id ?? 'none'} className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-2xl font-bold">
                {g.name} ({g.items.filter((p) => p.tagged).length}/{g.items.length})
              </h2>
              <Btn variant="plain" onClick={() => go(`#/labels${g.id != null ? `?cat=${g.id}` : ''}`)}>
                🖨 {t('tagging.printLabels')}
              </Btn>
            </div>
            <ul className="divide-y-2 divide-slate-200">
              {g.items.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-4 py-2 text-xl">
                    <input
                      type="checkbox"
                      className="h-10 w-10"
                      checked={!!p.tagged}
                      onChange={(e) => db.products.update(p.id!, { tagged: e.target.checked })}
                    />
                    <Photo blob={p.photo} className="h-14 w-14 rounded-lg" />
                    <span className={p.tagged ? 'text-slate-400 line-through' : ''}>{p.nameMy}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Screen>
  )
}
