import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, timeText } from '../core/fy'
import { db } from '../db/schema'
import { Btn, Screen } from '../ui/kit'

const GROUPS = ['', 'product', 'barcode', 'stock', 'sale', 'return', 'credit', 'settings', 'user', 'export', 'cash'] as const

/** Only the fields that changed, e.g. "priceKs: 15000 → 16000". */
function changes(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>
  const a = (after ?? {}) as Record<string, unknown>
  if (typeof before !== 'object' || typeof after !== 'object') return [before, after].filter((x) => x != null).map((x) => JSON.stringify(x)).join(' → ')
  const fmt = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v))
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => k !== 'updatedAt' && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => (k in b && b[k] !== undefined ? `${k}: ${fmt(b[k])} → ${fmt(a[k])}` : `${k}: ${fmt(a[k])}`))
    .join(' · ')
}

/** Owner: every price change, discount, void, refund, stock adjustment, setting, user change and export. */
export function AuditLog() {
  const { t } = useTranslation()
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('')
  const [limit, setLimit] = useState(100)
  const data = useLiveQuery(async () => {
    const rows = await db.audit
      .orderBy('at')
      .reverse()
      .filter((r) => !group || r.action.startsWith(`${group}.`))
      .limit(limit)
      .toArray()
    return { rows, users: new Map((await db.users.toArray()).map((u) => [u.id, u.name])) }
  }, [group, limit])
  if (!data) return null

  return (
    <Screen title={t('audit.title')}>
      <div className="mx-auto max-w-5xl space-y-3">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Btn key={g} variant={group === g ? 'primary' : 'plain'} className="text-lg" onClick={() => setGroup(g)}>
              {g ? t(`audit.g_${g}`) : t('common.all')}
            </Btn>
          ))}
        </div>
        <ul className="divide-y divide-slate-200">
          {data.rows.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex flex-wrap gap-x-4 text-lg">
                <span className="text-slate-600">
                  {dateKey(r.at)} {timeText(r.at)}
                </span>
                <b>{data.users.get(r.userId) ?? '—'}</b>
                <span className="font-mono">{r.action}</span>
                <span className="text-slate-600">{r.entity}</span>
              </div>
              <div className="break-all font-mono text-base text-slate-700">{changes(r.before, r.after)}</div>
            </li>
          ))}
        </ul>
        {data.rows.length === limit && (
          <Btn variant="plain" className="w-full" onClick={() => setLimit(limit + 200)}>
            {t('audit.more')}
          </Btn>
        )}
      </div>
    </Screen>
  )
}
