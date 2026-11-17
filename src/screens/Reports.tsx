import { type ReactNode, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatLargestFirst } from '../core/length'
import { formatKs } from '../core/money'
import { type PeriodKind, periodBounds, periodLabel, shiftRef } from '../core/period'
import { ctThreshold, salesTrend, type TrendBar } from '../core/reports'
import { changePct } from '../core/summary'
import { loadReport, rolling12mNetKs } from '../db/reports'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { methodName } from '../ui/format'
import { Btn, DateNav, Screen } from '../ui/kit'
import { go } from '../ui/router'
import { exportAll, exportReport } from '../ui/xlsx'

const KINDS: PeriodKind[] = ['day', 'week', 'month', 'quarter', 'fy']

/** Money left owing on the period's sales, and debts paid in it (already counted in the methods above). Taps through to the debts list. */
export function DebtLines({ debtKs, debtPaidKs, className = 'text-amber-800' }: { debtKs: number; debtPaidKs: number; className?: string }) {
  const { t } = useTranslation()
  if (!debtKs && !debtPaidKs) return null
  return (
    <button className={`mt-1 block w-full text-left text-base underline-offset-2 hover:underline ${className}`} onClick={() => go('#/debts')} data-testid="debt-lines">
      {debtKs > 0 && <span className="mr-4">📒 {t('debt.newDebt')}: {formatKs(debtKs)}</span>}
      {debtPaidKs > 0 && <span>{t('debt.collected')}: {formatKs(debtPaidKs)}</span>}
    </button>
  )
}

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
  const isCurrent = to > Date.now()
  // The previous period, cut to the same length when this one is still running (fair "so far" comparison).
  const [prevFrom, prevFullTo] = periodBounds(kind, shiftRef(kind, ref, -1))
  const prevTo = isCurrent ? Math.min(prevFullTo, prevFrom + (Date.now() - from)) : prevFullTo
  const data = useLiveQuery(
    async () => ({ ...(await loadReport(from, to)), prev: (await loadReport(prevFrom, prevTo)).report, users: await db.users.toArray() }),
    [from, to, prevFrom, prevTo],
  )
  if (!settings || !data) return null
  const { report: r, input, prev, users } = data
  const name = (code: string) => methodName(t, settings.paymentMethods, code, lang)
  const label = periodLabel(kind, ref)
  const costedKs = r.profit.revenueKs - r.profit.uncostedRevenueKs
  const top = [
    ...r.pieces.map((p) => ({ key: `p${p.productId}`, name: p.nameMy, detail: t('stock.pieces', { count: p.qty }), valueKs: p.revenueKs })),
    ...r.fabric.map((f) => ({ key: `f${f.productId}`, name: f.nameMy, detail: formatLargestFirst(f.tenths, settings.units, lang), valueKs: f.revenueKs })),
  ]
    .sort((a, b) => b.valueKs - a.valueKs)
    .slice(0, 10)

  const tile = (title: string, value: string, extra?: string, testId?: string) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-sm text-slate-600">{title}</div>
      <div className="text-2xl font-bold" data-testid={testId}>
        {value}
      </div>
      {extra && <div className="text-sm text-slate-600">{extra}</div>}
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
            <Btn key={k} variant={kind === k ? 'primary' : 'plain'} className="min-h-10 px-3 text-base" onClick={() => (setKind(k), setRef(Date.now()))}>
              {t(`reports.${k}`)}
            </Btn>
          ))}
        </div>
        <DateNav
          label={label}
          value={Math.min(ref, Date.now())}
          onPick={setRef}
          onPrev={() => setRef(shiftRef(kind, ref, -1))}
          onNext={() => setRef(shiftRef(kind, ref, 1))}
          nextDisabled={isCurrent}
        />

        {/* Hero: the one number the owner looks at first */}
        <section className="rounded-2xl bg-slate-900 p-4 text-white">
          <div className="text-base text-slate-300">{t('reports.net')}</div>
          <div className="text-5xl font-bold" data-testid="net">
            {formatKs(r.netKs)} <span className="text-2xl font-normal">{t('common.ks')}</span>
          </div>
          <Delta now={r.netKs} before={prev.netKs} label={t('reports.vsPrev')} />
        </section>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 shadow-sm">
            <div className="text-sm text-green-900">{t('reports.profit')}</div>
            <div className="text-2xl font-bold text-green-800" data-testid="profit">
              {formatKs(r.profit.profitKs)}
            </div>
            {costedKs > 0 && <div className="text-sm text-green-900">{t('reports.margin', { pct: Math.round((r.profit.profitKs * 100) / costedKs) })}</div>}
          </div>
          {tile(t('reports.sales', { count: r.count }), formatKs(r.grossKs), r.voidCount ? t('reports.voids', { count: r.voidCount }) : undefined, 'gross')}
          {tile(t('reports.avgSale'), r.count ? formatKs(Math.round(r.grossKs / r.count)) : '—')}
          {tile(t('reports.returns'), formatKs(r.refundsKs))}
        </div>
        <p className="-mt-2 text-sm text-slate-600">
          {t('reports.profitDetail', { revenue: formatKs(costedKs), cost: formatKs(r.profit.costKs) })}
          {r.ctKs > 0 && ` · ${t('reports.ct')} ${formatKs(r.ctKs - r.refundsCtKs)}`}
          {r.profit.uncostedRevenueKs > 0 && <span className="block text-amber-800">⚠ {t('reports.uncosted', { amount: formatKs(r.profit.uncostedRevenueKs) })}</span>}
        </p>

        <Card title={t('reports.trend')}>
          <TrendChart bars={salesTrend(input.sales, kind, from, to)} />
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title={t('reports.topProducts')}>
            <RankList rows={top.map((x, i) => ({ ...x, name: `${i + 1}. ${x.name}` }))} />
          </Card>
          <div className="space-y-4">
            <Card title={t('reports.byMethod')}>
              <RankList rows={Object.entries(r.byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => ({ key: m, name: name(m), valueKs: v }))} />
              {Object.entries(r.paidOutByMethod).map(([m, v]) => (
                <p key={m} className="mt-1 flex justify-between text-sm text-violet-800">
                  <span>
                    {t('today.paidOut')} — {name(m)}
                  </span>
                  <span>−{formatKs(v)}</span>
                </p>
              ))}
              <DebtLines debtKs={r.debtKs} debtPaidKs={r.debtPaidKs} />
            </Card>
            <Card title={t('reports.byStaff')}>
              <RankList
                rows={Object.entries(r.byStaff)
                  .sort((a, b) => b[1].totalKs - a[1].totalKs)
                  .map(([uid, v]) => ({ key: uid, name: users.find((u) => u.id === Number(uid))?.name ?? t('reports.noUser'), detail: t('reports.sales', { count: v.count }), valueKs: v.totalKs }))}
              />
            </Card>
          </div>
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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

/** ▲ 12% / ▼ 5% against the previous period; arrow + sign, never colour alone. */
function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const pct = changePct(now, before)
  if (pct === undefined) return null
  return (
    <div className={`mt-1 text-sm font-bold ${pct >= 0 ? 'text-green-300' : 'text-red-300'}`} data-testid="delta">
      {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}% <span className="font-normal text-slate-300">{label}</span>
    </div>
  )
}

/** Column chart, one series. Tap / hover a bar to read it; the highest bar is shown first. */
function TrendChart({ bars }: { bars: TrendBar[] }) {
  const { t } = useTranslation()
  const [sel, setSel] = useState<number>()
  const max = Math.max(0, ...bars.map((b) => b.totalKs))
  if (!max) return <p className="py-6 text-center text-slate-500">{t('reports.noSales')}</p>
  const shownIdx = sel ?? bars.findIndex((b) => b.totalKs === max)
  const shown = bars[shownIdx]
  const every = bars.length > 16 ? 5 : 1 // a month has 30 bars: label every 5th day
  return (
    <div data-testid="trend">
      <p className="mb-2 text-sm text-slate-600" aria-live="polite">
        {sel === undefined && `${t('reports.highest')} · `}
        <b className="text-slate-900">{shown.label}</b> · {formatKs(shown.totalKs)} {t('common.ks')} · {t('reports.sales', { count: shown.count })}
      </p>
      <div className="flex h-40 items-end gap-0.5 border-b border-slate-300" onMouseLeave={() => setSel(undefined)}>
        {bars.map((b, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${b.label}: ${formatKs(b.totalKs)} ${t('common.ks')}`}
            className="flex h-full min-w-0 flex-1 items-end justify-center"
            onMouseEnter={() => setSel(i)}
            onFocus={() => setSel(i)}
            onClick={() => setSel(i)}
          >
            <span
              className={`block w-full max-w-6 rounded-t ${i === shownIdx ? 'bg-blue-900' : 'bg-blue-600'}`}
              style={{ height: b.totalKs ? `max(2px, ${(b.totalKs / max) * 100}%)` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-center text-xs text-slate-500" aria-hidden>
        {bars.map((b, i) => (
          <span key={i} className="min-w-0 flex-1">
            {i % every === 0 ? b.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Ranked rows with a thin bar showing each one's size against the first. */
function RankList({ rows }: { rows: { key: string; name: string; detail?: string; valueKs: number }[] }) {
  if (!rows.length) return <p className="text-slate-500">—</p>
  const max = Math.max(1, ...rows.map((r) => r.valueKs))
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">{r.name}</span>
            {r.detail && <span className="text-sm text-slate-500">{r.detail}</span>}
            <b className="tabular-nums">{formatKs(r.valueKs)}</b>
          </div>
          <div className="mt-0.5 h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(r.valueKs / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
