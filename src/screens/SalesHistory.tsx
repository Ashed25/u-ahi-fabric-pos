import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, dayBounds, timeText } from '../core/fy'
import { formatEntered, formatInches } from '../core/length'
import { formatKs } from '../core/money'
import { saleDetail } from '../db/sales'
import { type Sale, db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { methodName, unitName } from '../ui/format'
import { voidSale } from '../db/returns'
import { useSession } from '../session'
import { Btn, DayPicker, Field, Modal, Screen, inputCls } from '../ui/kit'
import { ReceiptModal } from '../ui/ReceiptModal'
import { go } from '../ui/router'


export function SalesHistory() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const [day, setDay] = useState(() => Date.now())
  const [q, setQ] = useState('')

  const data = useLiveQuery(async () => {
    const needle = q.trim()
    let sales: Sale[]
    if (!needle) {
      const [from, to] = dayBounds(day)
      sales = await db.sales.where('at').between(from, to, true, false).toArray()
    } else {
      // Sale number, or a product name anywhere in history.
      const ids = new Set((await db.saleLines.filter((l) => l.nameMy.includes(needle)).toArray()).map((l) => l.saleId))
      sales = await db.sales.filter((s) => s.id.toLowerCase().includes(needle.toLowerCase()) || ids.has(s.id)).toArray()
    }
    sales.sort((a, b) => b.at - a.at)
    const pays = await db.payments.where('saleId').anyOf(sales.map((s) => s.id)).toArray()
    return { sales, pays }
  }, [day, q])
  if (!settings || !data) return null

  const method = (code: string) => methodName(t, settings.paymentMethods, code, i18n.language)
  const completed = data.sales.filter((s) => s.status === 'completed')
  const total = completed.reduce((s, x) => s + x.totalKs, 0)
  const owed = (s: Sale) => s.totalKs - data.pays.filter((p) => p.saleId === s.id).reduce((a, p) => a + p.amountKs, 0)

  return (
    <Screen title={t('history.title')} back="#/menu">
      <div className="mx-auto max-w-4xl space-y-3">
        <input className={inputCls} placeholder={t('history.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {!q && (
          <DayPicker day={day} onChange={setDay} />
        )}
        <p className="text-xl">{t('history.summary', { count: completed.length, total: formatKs(total) })}</p>
        <ul className="divide-y-2 divide-slate-200">
          {data.sales.map((s) => (
            <li key={s.id}>
              <button className="flex w-full items-center gap-4 py-3 text-left" onClick={() => go(`#/sales/${s.id}`)}>
                <span className="w-36 font-mono text-xl">{s.id}</span>
                <span className="w-28 text-xl">{q ? dateKey(s.at) : timeText(s.at)}</span>
                <span className="flex-1 text-lg text-slate-600">
                  {[...new Set(data.pays.filter((p) => p.saleId === s.id).map((p) => method(p.method)))].join(' · ')}
                </span>
                {s.status === 'void' && <span className="rounded bg-red-100 px-2 text-red-800">VOID</span>}
                {s.status === 'completed' && s.debtor && owed(s) > 0 && (
                  <span className="rounded bg-amber-100 px-2 text-amber-900">
                    📒 {s.debtor} {formatKs(owed(s))}
                  </span>
                )}
                <span className="text-2xl font-bold">{formatKs(s.totalKs)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  )
}

export function SaleView({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const d = useLiveQuery(async () => {
    const detail = await saleDetail(id)
    const credits = await db.creditNotes.where('saleId').equals(id).toArray()
    const payouts = await db.payments.where('saleId').anyOf(credits.map((c) => c.id)).toArray()
    return detail && { ...detail, credits, payouts }
  }, [id])
  const [receipt, setReceipt] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const { approve } = useSession()
  const [voidReason, setVoidReason] = useState('')
  const [error, setError] = useState('')
  if (!settings || d === undefined) return null

  const { sale, lines, payments, credits, payouts } = d
  const owedKs = sale.totalKs - payments.reduce((s, p) => s + p.amountKs, 0)
  async function doVoid() {
    if (!voidReason.trim()) return setError(t('return.errReason'))
    const approver = await approve('manager')
    if (!approver) return
    try {
      await voidSale(sale.id, voidReason, approver.id)
      setVoiding(false)
    } catch (e) {
      setError(/reason/i.test(String(e)) ? t('return.errReason') : String(e))
    }
  }
  const method = (code: string) => methodName(t, settings.paymentMethods, code, lang)
  return (
    <Screen title={`${t('receipt.no')} ${sale.id}`} back="#/sales">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xl">
          {dateKey(sale.at)} {timeText(sale.at)} {sale.status === 'void' && <b className="text-red-800">VOID — {sale.voidReason}</b>}
        </p>
        <ul className="divide-y-2 divide-slate-200 rounded-2xl border-2 border-slate-200 px-4">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 py-2">
              <span>
                <span className="block text-xl font-bold">{l.nameMy}</span>
                <span className="block text-lg text-slate-700">
                  {l.kind === 'length' ? (
                    <>
                      {formatEntered(l.entered ?? [], settings.units, lang)} <span className="text-base">({formatInches(l.lengthTenths ?? 0)}")</span> @ {formatKs(l.unitPriceKs)}/
                      {unitName(settings.units, l.pricingUnit ?? 'gaik', lang)}
                      {(l.remnantPct || l.wholeRemnant) && <span className="ml-2 text-amber-700">✂ {l.remnantPct ? `−${l.remnantPct}%` : t('stock.remnant')}</span>}
                    </>
                  ) : (
                    `${l.sub ? `${l.sub} · ` : ''}${l.qty} × ${formatKs(l.unitPriceKs)}`
                  )}
                  {l.wholesale && <span className="ml-2 text-indigo-700">{t('wholesale.tag')}</span>}
                </span>
              </span>
              <span className="text-2xl font-bold">{formatKs(l.lineTotalKs)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 text-xl">
          {sale.ctKs > 0 && (
            <p className="flex justify-between">
              <span>{t('receipt.ct')}</span>
              <span>{formatKs(sale.ctKs)}</span>
            </p>
          )}
          <p className="flex justify-between text-3xl font-bold">
            <span>{t('pay.total')}</span>
            <span>{formatKs(sale.totalKs)}</span>
          </p>
          {payments.map((p) => (
            <p key={p.id} className="flex justify-between">
              <span>
                {method(p.method)} {p.ref && <span className="text-base text-slate-600">#{p.ref}</span>}
                {p.at && <span className="text-base text-slate-600"> · {dateKey(p.at)} {timeText(p.at)}</span>}
              </span>
              <span>
                {formatKs(p.amountKs)}
                {p.changeKs ? ` (${t('pay.received')} ${formatKs(p.tenderedKs ?? 0)}, ${t('pay.change')} ${formatKs(p.changeKs)})` : ''}
              </span>
            </p>
          ))}
          {sale.debtor && (
            <button className="flex w-full justify-between rounded-xl bg-amber-100 p-3 text-left text-2xl font-bold text-amber-900" onClick={() => go('#/debts')} data-testid="sale-owed">
              <span>
                📒 {sale.debtor} {sale.debtorPhone && <span className="text-lg font-normal">{sale.debtorPhone}</span>}
              </span>
              <span>{owedKs > 0 ? `${t('debt.owed')} ${formatKs(owedKs)}` : `✓ ${t('debt.paidOff')}`}</span>
            </button>
          )}
        </div>
        {credits.length > 0 && (
          <section className="rounded-2xl bg-violet-50 p-4">
            <h2 className="mb-2 text-xl font-bold">↩ {t('return.list')}</h2>
            {credits.map((c) => (
              <p key={c.id} className="text-lg">
                <b>{c.id}</b> · {dateKey(c.at)} {timeText(c.at)} · {t(c.type === 'refund' ? 'return.refund' : 'return.exchange')} · <b>{formatKs(c.totalKs)}</b> · {c.reason}
                {payouts
                  .filter((p) => p.saleId === c.id)
                  .map((p) => ` · ${method(p.method)} −${formatKs(-p.amountKs)}`)
                  .join('')}
              </p>
            ))}
          </section>
        )}
        <div className="flex flex-wrap gap-3">
          {settings.receiptEnabled && (
            <Btn variant="plain" onClick={() => setReceipt(true)}>
              🧾 {t('receipt.show')}
            </Btn>
          )}
          {sale.status === 'completed' && (
            <Btn onClick={() => go(`#/return/${sale.id}`)}>↩ {t('return.button')}</Btn>
          )}
          {sale.status === 'completed' && credits.length === 0 && (
            <Btn variant="danger" onClick={() => setVoiding(true)}>
              ✕ {t('void.button')}
            </Btn>
          )}
        </div>
      </div>
      {receipt && <ReceiptModal saleId={sale.id} settings={settings} copy onClose={() => setReceipt(false)} />}
      {voiding && (
        <Modal onClose={() => setVoiding(false)}>
          <h2 className="mb-2 text-2xl font-bold text-red-800">{t('void.title', { id: sale.id })}</h2>
          <p className="mb-4 text-xl">{t('void.hint')}</p>
          <Field label={t('return.reason')}>
            <input className={inputCls} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </Field>
          {error && <p className="mt-3 rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setVoiding(false)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant="danger" onClick={doVoid}>
              {t('void.confirm')}
            </Btn>
          </div>
        </Modal>
      )}
    </Screen>
  )
}
