import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey, dayBounds, timeText } from '../core/fy'
import { formatEntered, formatInches } from '../core/length'
import { formatKs } from '../core/money'
import { saleDetail } from '../db/sales'
import { type Sale, db } from '../db/schema'
import { useSettings } from '../db/useSettings'
import { unitName } from '../ui/format'
import { Btn, Screen, inputCls } from '../ui/kit'
import { ReceiptModal } from '../ui/ReceiptModal'
import { go } from '../ui/router'

const DAY = 86_400_000

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

  const method = (code: string) => {
    const m = settings.paymentMethods.find((x) => x.code === code)
    return m ? (i18n.language === 'en' ? m.nameEn : m.nameMy) : code
  }
  const completed = data.sales.filter((s) => s.status === 'completed')
  const total = completed.reduce((s, x) => s + x.totalKs, 0)

  return (
    <Screen title={t('history.title')} back="#/menu">
      <div className="mx-auto max-w-4xl space-y-3">
        <input className={inputCls} placeholder={t('history.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {!q && (
          <div className="flex items-center gap-2">
            <Btn variant="plain" onClick={() => setDay(day - DAY)}>
              ◀
            </Btn>
            <span className="flex-1 text-center text-2xl font-bold">{dateKey(day)}</span>
            <Btn variant="plain" disabled={dateKey(day) === dateKey(Date.now())} onClick={() => setDay(day + DAY)}>
              ▶
            </Btn>
          </div>
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
  const d = useLiveQuery(() => saleDetail(id), [id])
  const [receipt, setReceipt] = useState(false)
  if (!settings || d === undefined) return null

  const { sale, lines, payments } = d
  const method = (code: string) => {
    const m = settings.paymentMethods.find((x) => x.code === code)
    return m ? (lang === 'en' ? m.nameEn : m.nameMy) : code
  }
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
                    </>
                  ) : (
                    `${l.sub ? `${l.sub} · ` : ''}${l.qty} × ${formatKs(l.unitPriceKs)}`
                  )}
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
              </span>
              <span>
                {formatKs(p.amountKs)}
                {p.changeKs ? ` (${t('pay.received')} ${formatKs(p.tenderedKs ?? 0)}, ${t('pay.change')} ${formatKs(p.changeKs)})` : ''}
              </span>
            </p>
          ))}
        </div>
        {settings.receiptEnabled && (
          <Btn variant="plain" onClick={() => setReceipt(true)}>
            🧾 {t('receipt.show')}
          </Btn>
        )}
      </div>
      {receipt && <ReceiptModal saleId={sale.id} settings={settings} copy onClose={() => setReceipt(false)} />}
    </Screen>
  )
}
