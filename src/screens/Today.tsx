import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, dayBounds } from '../core/fy'
import { formatInches, formatLargestFirst } from '../core/length'
import { formatKs } from '../core/money'
import { changePct, summarize } from '../core/summary'
import { audit } from '../db/audit'
import { db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { methodName } from '../ui/format'
import { Btn, DayPicker, Screen, inputCls, toInt } from '../ui/kit'
import { CtWarning, DebtLines } from './Reports'

const DAY = 86_400_000

async function loadDay(ms: number) {
  const [from, to] = dayBounds(ms)
  const sales = await db.sales.where('at').between(from, to, true, false).toArray()
  const ids = sales.map((s) => s.id)
  const [lines, salePays, credits, payouts] = await Promise.all([
    db.saleLines.where('saleId').anyOf(ids).toArray(),
    db.payments.where('saleId').anyOf(ids).filter((p) => p.at == null).toArray(),
    db.creditNotes.where('at').between(from, to, true, false).toArray(),
    db.payments.filter((p) => p.at != null && p.at >= from && p.at < to).toArray(), // payouts and later debt payments
  ])
  return summarize(sales, lines, [...salePays, ...payouts], credits)
}

/** Daily summary: sales, money per method, refunds, what was sold, and an optional cash check. */
export function Today() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const [day, setDay] = useState(() => Date.now())
  const [opening, setOpening] = useState('')
  const [counted, setCounted] = useState('')
  const [saved, setSaved] = useState(false)
  const data = useLiveQuery(async () => ({ today: await loadDay(day), yesterday: await loadDay(day - DAY), lastWeek: await loadDay(day - 7 * DAY) }), [day])
  if (!settings || !data) return null
  const { today: s, yesterday, lastWeek } = data
  const name = (code: string) => methodName(t, settings.paymentMethods, code, lang)

  const vs = (label: string, before: number) => {
    const pct = changePct(s.totalKs, before)
    return (
      <div className="rounded-2xl bg-slate-100 p-3">
        <div className="text-lg text-slate-600">{label}</div>
        <div className="text-2xl font-bold">{formatKs(before)}</div>
        {pct !== undefined && <div className={`text-xl font-bold ${pct >= 0 ? 'text-green-700' : 'text-red-700'}`}>{pct >= 0 ? `▲ ${pct}%` : `▼ ${-pct}%`}</div>}
      </div>
    )
  }

  const expected = (toInt(opening) ?? 0) + s.cashNetKs
  const countedN = toInt(counted)

  return (
    <Screen title={t('today.title')}>
      <div className="mx-auto max-w-4xl space-y-4">
        <CtWarning />
        <DayPicker day={day} onChange={setDay} />

        <div className="rounded-3xl bg-slate-900 p-5 text-white">
          <div className="text-2xl">{t('today.sales', { count: s.count })}</div>
          <div className="text-6xl font-bold" data-testid="day-total">
            {formatKs(s.totalKs)} <span className="text-3xl">{t('common.ks')}</span>
          </div>
          <div className="mt-2 text-xl">
            {Object.entries(s.byMethod)
              .map(([m, v]) => `${name(m)} ${formatKs(v)}`)
              .join(' · ') || '—'}
          </div>
          <DebtLines debtKs={s.debtKs} debtPaidKs={s.debtPaidKs} className="text-slate-200" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {vs(t('today.yesterday'), yesterday.totalKs)}
          {vs(t('today.lastWeek'), lastWeek.totalKs)}
        </div>

        {(s.refundsKs > 0 || Object.keys(s.paidOutByMethod).length > 0) && (
          <div className="rounded-2xl bg-violet-50 p-4 text-xl">
            <p>
              ↩ {t('today.returns')}: <b>{formatKs(s.refundsKs)}</b>
            </p>
            <p>
              {t('today.paidOut')}:{' '}
              {Object.entries(s.paidOutByMethod)
                .map(([m, v]) => `${name(m)} ${formatKs(v)}`)
                .join(' · ') || '—'}
            </p>
            <p className="font-bold">
              {t('today.net')}: {formatKs(s.netKs)}
            </p>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 p-4" data-testid="day-items">
          <h2 className="mb-2 flex justify-between text-xl font-bold">
            <span>{t('today.sold')}</span>
            {s.pieces > 0 && <span className="text-base font-normal text-slate-600">{t('today.pieces', { count: s.pieces })}</span>}
          </h2>
          {!s.items.length && <p className="text-slate-500">—</p>}
          <ul className="divide-y divide-slate-100">
            {s.items.map((i) => (
              <li key={i.productId} className="flex items-baseline gap-3 py-1.5">
                <span className="min-w-0 flex-1">{i.nameMy}</span>
                <span className="text-slate-700">
                  {i.kind === 'piece' ? (
                    t('today.pieces', { count: i.qty })
                  ) : (
                    <>
                      {formatLargestFirst(i.tenths, settings.units, lang)} <span className="text-sm text-slate-500">({formatInches(i.tenths)}")</span>
                    </>
                  )}
                </span>
                <b className="w-24 text-right tabular-nums">{formatKs(i.totalKs)}</b>
              </li>
            ))}
          </ul>
        </section>

        {settings.cashCheck && dateKey(day) === dateKey(Date.now()) && (
          <section className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="text-xl font-bold">{t('today.cashCheck')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="block">{t('today.opening')}</span>
                <input className={inputCls} inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} />
              </label>
              <label>
                <span className="block">{t('today.counted')}</span>
                <input className={inputCls} inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} />
              </label>
            </div>
            <p className="text-xl">
              {t('today.expected')}: <b>{formatKs(expected)}</b>
            </p>
            {countedN !== undefined && (
              <>
                <p className={`text-3xl font-bold ${countedN - expected === 0 ? 'text-green-700' : 'text-red-700'}`} data-testid="cash-diff">
                  {countedN - expected === 0 ? `✓ ${t('today.exact')}` : `${t(countedN > expected ? 'today.over' : 'today.short')} ${formatKs(Math.abs(countedN - expected))}`}
                </p>
                <Btn
                  variant="plain"
                  disabled={saved}
                  onClick={async () => {
                    await audit('cash.check', 'cash', undefined, { opening: toInt(opening) ?? 0, expected, counted: countedN })
                    setSaved(true)
                  }}
                >
                  {saved ? `✓ ${t('common.saved')}` : t('today.saveCheck')}
                </Btn>
              </>
            )}
          </section>
        )}
      </div>
    </Screen>
  )
}
