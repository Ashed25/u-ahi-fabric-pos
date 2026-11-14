import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatInches, formatLargestFirst } from '../core/length'
import { formatKs } from '../core/money'
import { type PeriodKind, periodBounds, periodLabel, shiftRef } from '../core/period'
import { ctThreshold } from '../core/reports'
import { loadReport, rolling12mNetKs } from '../db/reports'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { methodName } from '../ui/format'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'
import { exportAll, exportReport } from '../ui/xlsx'

const KINDS: PeriodKind[] = ['day', 'week', 'month', 'quarter', 'fy']

/** Shown on the menu, daily summary and reports when yearly sales near the CT registration threshold. */
export function CtWarning({ always = false }: { always?: boolean }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const net = useLiveQuery(() => rolling12mNetKs(), [])
  if (!settings || net === undefined) return null
  const { pct, level } = ctThreshold(net, settings.ctThresholdKs)
  if (level === 'ok' && !always) return null
  const color = level === 'over' ? 'bg-red-100 text-red-900' : level === 'near' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'
  return (
    <button className={`block w-full rounded-2xl p-4 text-left text-xl ${color}`} onClick={() => go('#/ct')} data-testid="ct-warning">
      <b>{t(`ct.level_${level}`)}</b> — {t('ct.rolling', { net: formatKs(net), pct, threshold: formatKs(settings.ctThresholdKs) })}
      <span className="mt-2 block h-3 overflow-hidden rounded-full bg-white">
        <span className={`block h-full ${level === 'over' ? 'bg-red-600' : level === 'near' ? 'bg-amber-500' : 'bg-green-600'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
    </button>
  )
}

export function Reports() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const [kind, setKind] = useState<PeriodKind>('month')
  const [ref, setRef] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [from, to] = periodBounds(kind, ref)
  const data = useLiveQuery(async () => ({ ...(await loadReport(from, to)), users: await db.users.toArray() }), [from, to])
  if (!settings || !data) return null
  const { report: r, input, users } = data
  const name = (code: string) => methodName(t, settings.paymentMethods, code, lang)
  const label = periodLabel(kind, ref)
  const isCurrent = to > Date.now()

  const tile = (title: string, value: number, extra?: string, testId?: string) => (
    <div className="rounded-2xl bg-slate-100 p-4">
      <div className="text-lg text-slate-600">{title}</div>
      <div className="text-3xl font-bold" data-testid={testId}>
        {formatKs(value)}
      </div>
      {extra && <div className="text-base text-slate-600">{extra}</div>}
    </div>
  )

  return (
    <Screen
      title={t('reports.title')}
      actions={
        <Btn variant="plain" onClick={() => go('#/ct')}>
          {t('ct.title')}
        </Btn>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">
        <CtWarning />
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <Btn key={k} variant={kind === k ? 'primary' : 'plain'} onClick={() => (setKind(k), setRef(Date.now()))}>
              {t(`reports.${k}`)}
            </Btn>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="plain" onClick={() => setRef(shiftRef(kind, ref, -1))}>
            ◀
          </Btn>
          <span className="flex-1 text-center text-2xl font-bold" data-testid="period">
            {label}
          </span>
          <Btn variant="plain" disabled={isCurrent} onClick={() => setRef(shiftRef(kind, ref, 1))}>
            ▶
          </Btn>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tile(t('reports.sales', { count: r.count }), r.grossKs, r.voidCount ? t('reports.voids', { count: r.voidCount }) : undefined, 'gross')}
          {tile(t('reports.returns'), r.refundsKs)}
          {tile(t('reports.net'), r.netKs, undefined, 'net')}
          {r.ctKs > 0 ? tile(t('reports.ct'), r.ctKs - r.refundsCtKs) : tile(t('reports.netExCt'), r.netExCtKs)}
        </div>

        <section className="rounded-2xl border-2 border-green-200 bg-green-50 p-4">
          <h2 className="text-xl font-bold">{t('reports.profit')}</h2>
          <p className="text-4xl font-bold text-green-800" data-testid="profit">
            {formatKs(r.profit.profitKs)} {t('common.ks')}
          </p>
          <p className="text-lg">{t('reports.profitDetail', { revenue: formatKs(r.profit.revenueKs - r.profit.uncostedRevenueKs), cost: formatKs(r.profit.costKs) })}</p>
          {r.profit.uncostedRevenueKs > 0 && <p className="text-lg text-amber-800">⚠ {t('reports.uncosted', { amount: formatKs(r.profit.uncostedRevenueKs) })}</p>}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border-2 border-slate-200 p-4">
            <h2 className="mb-2 text-xl font-bold">{t('reports.byMethod')}</h2>
            {Object.entries(r.byMethod).map(([m, v]) => (
              <p key={m} className="flex justify-between text-xl">
                <span>{name(m)}</span>
                <b>{formatKs(v)}</b>
              </p>
            ))}
            {Object.entries(r.paidOutByMethod).map(([m, v]) => (
              <p key={m} className="flex justify-between text-lg text-violet-800">
                <span>
                  {t('today.paidOut')} — {name(m)}
                </span>
                <span>−{formatKs(v)}</span>
              </p>
            ))}
          </section>
          <section className="rounded-2xl border-2 border-slate-200 p-4">
            <h2 className="mb-2 text-xl font-bold">{t('reports.byStaff')}</h2>
            {Object.entries(r.byStaff).map(([uid, v]) => (
              <p key={uid} className="flex justify-between text-xl">
                <span>{users.find((u) => u.id === Number(uid))?.name ?? t('reports.noUser')}</span>
                <span>
                  {v.count} · <b>{formatKs(v.totalKs)}</b>
                </span>
              </p>
            ))}
          </section>
          <section className="rounded-2xl border-2 border-slate-200 p-4">
            <h2 className="mb-2 text-xl font-bold">{t('reports.bestPieces')}</h2>
            {r.pieces.slice(0, 10).map((p) => (
              <p key={p.productId} className="flex justify-between text-xl">
                <span>{p.nameMy}</span>
                <span>
                  {t('stock.pieces', { count: p.qty })} · <b>{formatKs(p.revenueKs)}</b>
                </span>
              </p>
            ))}
          </section>
          <section className="rounded-2xl border-2 border-slate-200 p-4">
            <h2 className="mb-2 text-xl font-bold">{t('reports.bestFabric')}</h2>
            {r.fabric.slice(0, 10).map((f) => (
              <p key={f.productId} className="flex justify-between text-xl">
                <span>{f.nameMy}</span>
                <span>
                  {formatLargestFirst(f.tenths, settings.units, lang)} <span className="text-base text-slate-600">({formatInches(f.tenths)}")</span> · <b>{formatKs(f.revenueKs)}</b>
                </span>
              </p>
            ))}
          </section>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Btn
            className="min-h-18"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await exportReport(label, r, input, settings.units, name).finally(() => setBusy(false))
            }}
          >
            ⬇ {t('reports.export')}
          </Btn>
          <Btn
            variant="plain"
            className="min-h-18"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await exportAll().finally(() => setBusy(false))
            }}
          >
            ⬇ {t('reports.exportAll')}
          </Btn>
        </div>
      </div>
    </Screen>
  )
}
