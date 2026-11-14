import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatEntered, formatInches } from '../core/length'
import { formatKs } from '../core/money'
import { roundFraction } from '../core/pricing'
import { createReturn, type ReturnItem, returnedSoFar } from '../db/returns'
import { saleDetail } from '../db/sales'
import { useSettings } from '../db/useSettings'
import { Btn, Field, Screen, inputCls } from '../ui/kit'
import { go } from '../ui/router'
import { setPendingCredit } from './sell/lines'
import { useSession } from '../session'

/** Return goods from a sale: refund the money, or keep it as credit for an exchange. */
export function Return({ saleId }: { saleId: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const settings = useSettings()
  const { approve } = useSession()
  const data = useLiveQuery(async () => ({ d: await saleDetail(saleId), done: await returnedSoFar(saleId) }), [saleId])
  const [qty, setQty] = useState<Record<number, number>>({})
  const [fabric, setFabric] = useState<Record<number, 'roll' | 'off' | undefined>>({})
  const [type, setType] = useState<'refund' | 'exchange'>('refund')
  const [method, setMethod] = useState('cash')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refunded, setRefunded] = useState<{ id: string; totalKs: number }>()
  if (!settings || !data?.d) return null
  const { sale, lines } = data.d

  // Same rounding as the saved credit note: line × total / subtotal.
  const share = (n: number) => (sale.subtotalKs ? roundFraction(n * sale.totalKs, sale.subtotalKs, 1, 'nearest') : n)
  const items: ReturnItem[] = [
    ...lines.filter((l) => l.kind === 'piece' && (qty[l.id!] ?? 0) > 0).map((l) => ({ saleLineId: l.id!, qty: qty[l.id!] })),
    ...lines.filter((l) => l.kind === 'length' && fabric[l.id!]).map((l) => ({ saleLineId: l.id!, toRoll: fabric[l.id!] === 'roll' })),
  ]
  const totalKs = lines.reduce((s, l) => s + (l.kind === 'piece' ? share(l.unitPriceKs * (qty[l.id!] ?? 0)) : fabric[l.id!] ? share(l.lineTotalKs) : 0), 0)

  async function save() {
    if (!reason.trim()) return setError(t('return.errReason'))
    const approver = await approve('manager') // sellers need a manager PIN
    if (!approver) return
    setBusy(true)
    setError('')
    try {
      const cn = await createReturn({ saleId, items, type, reason, refundMethod: type === 'refund' ? method : undefined, approvedBy: approver.id })
      if (type === 'exchange') {
        setPendingCredit(cn.id)
        go('#/')
      } else setRefunded(cn)
    } catch (e) {
      setError(/reason/i.test(String(e)) ? t('return.errReason') : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (refunded)
    return (
      <Screen title={t('return.title')} back={`#/sales/${saleId}`}>
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <p className="text-4xl font-bold text-green-800">✓ {t('return.done', { id: refunded.id })}</p>
          <p className="text-3xl">{t('return.giveBack')}</p>
          <p className="text-8xl font-bold">{formatKs(refunded.totalKs)}</p>
          <Btn variant="ok" className="min-h-20 px-10" onClick={() => go(`#/sales/${saleId}`)}>
            {t('common.done')}
          </Btn>
        </div>
      </Screen>
    )

  return (
    <Screen title={`${t('return.title')} — ${sale.id}`} back={`#/sales/${saleId}`}>
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-xl">{t('return.pick')}</p>
        <ul className="divide-y-2 divide-slate-200 rounded-2xl border-2 border-slate-200 px-4">
          {lines.map((l) => {
            const prev = data.done.get(l.id!)
            if (l.kind === 'piece') {
              const max = (l.qty ?? 0) - (prev?.qty ?? 0)
              const n = qty[l.id!] ?? 0
              return (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <span className="flex-1">
                    <span className="block text-xl font-bold">{l.nameMy}</span>
                    <span className="text-lg text-slate-600">
                      {l.sub} · {t('return.sold', { count: l.qty ?? 0 })}
                      {prev?.qty ? ` · ${t('return.already', { count: prev.qty })}` : ''}
                    </span>
                  </span>
                  <Btn variant="plain" className="w-16 text-3xl" disabled={n === 0} onClick={() => setQty({ ...qty, [l.id!]: n - 1 })}>
                    −
                  </Btn>
                  <span className="w-12 text-center text-3xl font-bold">{n}</span>
                  <Btn variant="plain" className="w-16 text-3xl" disabled={n >= max} onClick={() => setQty({ ...qty, [l.id!]: n + 1 })}>
                    +
                  </Btn>
                </li>
              )
            }
            return (
              <li key={l.id} className="py-3">
                <span className="block text-xl font-bold">{l.nameMy}</span>
                <span className="block text-lg text-slate-600">
                  {formatEntered(l.entered ?? [], settings.units, lang)} ({formatInches(l.lengthTenths ?? 0)}") · {formatKs(l.lineTotalKs)}
                </span>
                {prev?.fabric ? (
                  <span className="text-lg text-slate-600">{t('return.fabricAlready')}</span>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {([undefined, 'roll', 'off'] as const).map((v) => (
                      <Btn key={v ?? 'no'} variant={fabric[l.id!] === v ? 'primary' : 'plain'} className="text-lg" onClick={() => setFabric({ ...fabric, [l.id!]: v })}>
                        {t(v === 'roll' ? 'return.toRoll' : v === 'off' ? 'return.writeOff' : 'return.keep')}
                      </Btn>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          <Btn variant={type === 'refund' ? 'primary' : 'plain'} className="min-h-20" onClick={() => setType('refund')}>
            💵 {t('return.refund')}
          </Btn>
          <Btn variant={type === 'exchange' ? 'primary' : 'plain'} className="min-h-20" onClick={() => setType('exchange')}>
            ↩ {t('return.exchange')}
          </Btn>
        </div>
        {type === 'refund' && (
          <div className="flex flex-wrap gap-2">
            {settings.paymentMethods
              .filter((m) => m.active)
              .map((m) => (
                <Btn key={m.code} variant={method === m.code ? 'primary' : 'plain'} onClick={() => setMethod(m.code)}>
                  {lang === 'en' ? m.nameEn : m.nameMy}
                </Btn>
              ))}
          </div>
        )}
        {type === 'exchange' && <p className="rounded-xl bg-violet-100 p-3 text-xl">{t('return.exchangeHint')}</p>}
        <Field label={t('return.reason')}>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="rounded-2xl bg-slate-900 p-4 text-right text-white">
          <div className="text-xl">{t(type === 'refund' ? 'return.refundTotal' : 'return.creditTotal')}</div>
          <div className="text-6xl font-bold" data-testid="return-total">
            {formatKs(totalKs)}
          </div>
        </div>
        {error && <p className="rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
        <Btn variant="ok" className="min-h-20 w-full text-2xl" disabled={!items.length || busy} onClick={save}>
          {t(type === 'refund' ? 'return.confirmRefund' : 'return.confirmExchange')}
        </Btn>
      </div>
    </Screen>
  )
}
