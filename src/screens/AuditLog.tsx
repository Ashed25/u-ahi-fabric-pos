import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, timeText } from '../core/fy'
import { formatLargestFirst } from '../core/length'
import { formatKs } from '../core/money'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { methodName, unitName } from '../ui/format'
import { Btn, Screen } from '../ui/kit'

const GROUPS = ['', 'product', 'barcode', 'stock', 'sale', 'return', 'credit', 'debt', 'settings', 'user', 'export', 'cash'] as const

// Which settings screen label names each setting key.
const SETTING_LABEL: Record<string, string> = {
  shopName: 'settings.shopName',
  shopAddress: 'settings.address',
  shopPhone: 'settings.phone',
  roundStep: 'settings.rounding',
  roundMode: 'settings.rounding',
  receiptEnabled: 'settings.receiptOn',
  receiptFooter: 'settings.footer',
  returnPolicy: 'settings.policy',
  practiceMode: 'settings.practice',
  devicePrefix: 'settings.prefix',
  paymentMethods: 'settings.payments',
  ct: 'settings.tax',
  remnantBelowTenths: 'settings.remnantBelow',
  cashCheck: 'settings.cashCheck',
  ctThresholdKs: 'settings.ctThreshold',
  autoLockMinutes: 'settings.autoLock',
  units: 'audit.f_units',
}

/** A field value in words: money as Ks, fabric lengths in yards/inches, yes/no, roles, people. Undefined = don't show. */
export type FormatValue = (key: string, v: unknown) => string | undefined

/** Plain "Price: 15,000 Ks → 16,000 Ks" lines for the fields that changed and that a person would care about. */
export function changeLines(before: unknown, after: unknown, label: (k: string) => string | undefined, value: FormatValue): string[] {
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
  const b = obj(before)
  const a = obj(after)
  const out: string[] = []
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (JSON.stringify(b[k]) === JSON.stringify(a[k])) continue
    if (after && !(k in a)) continue // "after" is only the patch: fields it leaves out didn't change
    const name = label(k)
    const was = value(k, b[k])
    const now = value(k, a[k])
    if (!name || (was === undefined && now === undefined)) continue // internal field (ids, flags, lists)
    out.push(was === undefined || now === undefined ? `${name}: ${was ?? now}` : `${name}: ${was} → ${now}`)
  }
  return out
}

/** Owner: every price change, discount, void, refund, stock adjustment, setting, user change and export. */
export function AuditLog() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('')
  const [limit, setLimit] = useState(100)
  const data = useLiveQuery(async () => {
    const [rows, users, products, rolls, variants] = await Promise.all([
      db.audit
        .orderBy('at')
        .reverse()
        .filter((r) => !group || r.action.startsWith(`${group}.`))
        .limit(limit)
        .toArray(),
      db.users.toArray(),
      db.products.toArray(),
      db.rolls.toArray(),
      db.variants.toArray(),
    ])
    return {
      rows,
      users: new Map(users.map((u) => [u.id, u.name])),
      products: new Map(products.map((p) => [p.id, p.nameMy])),
      rolls: new Map(rolls.map((r) => [r.id, r.productId])),
      variants: new Map(variants.map((v) => [v.id, v])),
    }
  }, [group, limit])
  if (!data || !settings) return null

  const lang = i18n.language === 'en' ? 'en' : 'my'
  const ks = (n: number) => `${formatKs(n)} ${t('common.ks')}`

  const value: FormatValue = (k, v) => {
    if (v === undefined || v === null || v === '' || (k === 'toDebtKs' && v === 0)) return undefined
    if (typeof v === 'boolean') return t(v ? 'audit.yes' : 'audit.no')
    if (Array.isArray(v)) return v.every((x) => typeof x !== 'object') ? v.join(', ') : undefined
    if (typeof v === 'object') return undefined
    if (typeof v === 'number' && /Ks$/.test(k)) return ks(v)
    if (typeof v === 'number' && /Tenths$|^tenths$/.test(k)) return formatLargestFirst(v, settings.units, lang)
    if (k === 'approvedBy' || k === 'voidBy') return data.users.get(v as number) ?? `#${v}`
    if (k === 'role') return t(`role.${v}`)
    if (k === 'method') return methodName(t, settings.paymentMethods, String(v), lang)
    if (k === 'pricingUnit') return unitName(settings.units, String(v), lang)
    if (k === 'status') return t(`audit.s_${v}`, { defaultValue: String(v) })
    if (k === 'opening' || k === 'expected' || k === 'counted') return ks(v as number)
    return String(v)
  }
  const label = (k: string) => (i18n.exists(`audit.f_${k}`) ? t(`audit.f_${k}`) : undefined)

  /** What the entry was about, e.g. the product's name or "Receipt A-000123". */
  function subject(entity: string, before: unknown, after: unknown): string {
    const [kind, id] = entity.split(':')
    const n = Number(id)
    const old = (before ?? after ?? {}) as Record<string, unknown>
    switch (kind) {
      case 'product':
        return data!.products.get(n) ?? (old.nameMy as string) ?? `#${id}`
      case 'category':
        return (old.nameMy as string) ?? `#${id}`
      case 'user':
        return data!.users.get(n) ?? `#${id}`
      case 'sale':
        return t('audit.receipt', { id })
      case 'credit':
        return id
      case 'debtor':
        return entity.slice('debtor:'.length)
      case 'roll':
        return `${data!.products.get(data!.rolls.get(n)) ?? ''} · ${t('stock.roll')} #${id}`
      case 'variant': {
        const v = data!.variants.get(n)
        return v ? [data!.products.get(v.productId), v.size, v.colour].filter(Boolean).join(' · ') : `#${id}`
      }
      case 'settings':
        return SETTING_LABEL[id] ? t(SETTING_LABEL[id]) : id
      default:
        return ''
    }
  }

  function details(action: string, entity: string, before: unknown, after: unknown): string[] {
    // A setting stores its value directly, not as an object of fields.
    if (action.startsWith('settings.')) {
      const k = entity.split(':')[1]
      const was = value(k, before)
      const now = value(k, after)
      if (was !== undefined || now !== undefined) return [`${was ?? '—'} → ${now ?? '—'}`]
    }
    return changeLines(before, after, label, value)
  }

  return (
    <Screen title={t('audit.title')}>
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <Btn key={g} variant={group === g ? 'primary' : 'plain'} className="text-lg" onClick={() => setGroup(g)}>
              {g ? t(`audit.g_${g}`) : t('common.all')}
            </Btn>
          ))}
        </div>
        <ul className="space-y-2">
          {data.rows.map((r) => {
            const what = t(`audit.a_${r.action.replace('.', '_')}`, { defaultValue: r.action })
            const about = subject(r.entity, r.before, r.after)
            const lines = details(r.action, r.entity, r.before, r.after)
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap justify-between gap-x-4 text-base text-slate-600">
                  <span>
                    {dateKey(r.at)} · {timeText(r.at)}
                  </span>
                  <span className="font-bold text-slate-800">👤 {data.users.get(r.userId) ?? '—'}</span>
                </div>
                <div className="mt-1 text-xl">
                  <b>{what}</b>
                  {about && <span> — {about}</span>}
                </div>
                {lines.length > 0 && (
                  <ul className="mt-1 text-lg text-slate-700">
                    {lines.map((l, i) => (
                      <li key={i}>• {l}</li>
                    ))}
                  </ul>
                )}
                {(r.before !== undefined || r.after !== undefined) && (
                  <details className="mt-1 text-sm text-slate-500">
                    <summary className="cursor-pointer">{t('audit.raw')}</summary>
                    <pre className="whitespace-pre-wrap break-all">{JSON.stringify({ before: r.before, after: r.after }, null, 1)}</pre>
                  </details>
                )}
              </li>
            )
          })}
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
