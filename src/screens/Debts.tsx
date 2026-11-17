import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { dateKey } from '../core/fy'
import { formatKs } from '../core/money'
import { type Debtor, debtorKey, listDebts, payDebt } from '../db/debts'
import type { Settings } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { Btn, Modal, Screen, inputCls, toInt } from '../ui/kit'
import { go } from '../ui/router'

/** Who owes how much, for which sales; record money they bring later. */
export function Debts() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const debts = useLiveQuery(listDebts, [])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string>()
  const [paying, setPaying] = useState<Debtor>()
  if (!settings || !debts) return null

  const needle = debtorKey(q)
  const shown = debts.filter((d) => !needle || d.key.includes(needle) || d.phone?.includes(needle))
  const total = debts.reduce((s, d) => s + d.owingKs, 0)

  return (
    <Screen title={t('debt.title')} back="#/menu">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="rounded-3xl bg-amber-100 p-5 text-amber-900">
          <div className="text-xl">{t('debt.people', { count: debts.length })}</div>
          <div className="text-5xl font-bold" data-testid="debt-total">
            {formatKs(total)} <span className="text-2xl">{t('common.ks')}</span>
          </div>
        </div>
        <input className={inputCls} placeholder={t('debt.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {!shown.length && <p className="text-xl text-slate-500">{t('debt.none')}</p>}
        <ul className="space-y-2">
          {shown.map((d) => (
            <li key={d.key} className="rounded-2xl border border-slate-200 bg-white" data-testid="debtor">
              <div className="flex items-center gap-3 p-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === d.key ? undefined : d.key)}>
                  <span className="block truncate text-2xl font-bold">{d.name}</span>
                  <span className="block text-base text-slate-600">
                    {d.phone && `${d.phone} · `}
                    {t('debt.salesCount', { count: d.sales.length })} {open === d.key ? '▲' : '▼'}
                  </span>
                </button>
                <span className="text-2xl font-bold tabular-nums text-amber-900">{formatKs(d.owingKs)}</span>
                <Btn variant="ok" className="px-4 text-lg" onClick={() => setPaying(d)}>
                  {t('debt.receive')}
                </Btn>
              </div>
              {open === d.key && (
                <ul className="divide-y divide-slate-100 border-t border-slate-200 px-3">
                  {d.sales.map(({ sale, paidKs, owingKs }) => (
                    <li key={sale.id}>
                      <button className="flex w-full flex-wrap items-baseline gap-x-4 py-2 text-left text-lg" onClick={() => go(`#/sales/${sale.id}`)}>
                        <span className="font-mono">{sale.id}</span>
                        <span>{dateKey(sale.at)}</span>
                        <span className="flex-1 text-slate-600">
                          {t('pay.total')} {formatKs(sale.totalKs)} · {t('debt.paid')} {formatKs(paidKs)}
                        </span>
                        <b className="tabular-nums text-amber-900">{formatKs(owingKs)}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
      {paying && <ReceiveDialog debtor={paying} settings={settings} lang={i18n.language} onClose={() => setPaying(undefined)} />}
    </Screen>
  )
}

function ReceiveDialog({ debtor, settings, lang, onClose }: { debtor: Debtor; settings: Settings; lang: string; onClose: () => void }) {
  const { t } = useTranslation()
  const methods = settings.paymentMethods.filter((m) => m.active)
  const [method, setMethod] = useState(methods[0]?.code ?? 'cash')
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const n = amount === '' ? debtor.owingKs : toInt(amount)
  const ok = !!n && n <= debtor.owingKs

  async function save() {
    if (!ok) return
    setBusy(true)
    try {
      await payDebt(debtor.key, method, n!, ref)
      onClose()
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-2xl font-bold">{debtor.name}</h2>
      <p className="mb-4 text-xl">
        {t('debt.owed')}: <b>{formatKs(debtor.owingKs)}</b>
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {methods.map((m) => (
          <Btn key={m.code} variant={method === m.code ? 'primary' : 'plain'} onClick={() => setMethod(m.code)}>
            {lang === 'en' ? m.nameEn : m.nameMy}
          </Btn>
        ))}
      </div>
      <label className="block text-xl">
        {t('pay.amount')}
        <input className={inputCls} inputMode="numeric" placeholder={formatKs(debtor.owingKs)} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="debt-amount" />
      </label>
      {methods.find((m) => m.code === method)?.needsRef && (
        <label className="mt-2 block text-xl">
          {t('pay.ref')}
          <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} />
        </label>
      )}
      {n != null && n > debtor.owingKs && <p className="mt-2 rounded-xl bg-amber-100 p-3 text-xl">{t('pay.tooMuch')}</p>}
      <p className="mt-2 text-base text-slate-600">{t('debt.oldestFirst')}</p>
      {error && <p className="mt-2 rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Btn variant="plain" onClick={onClose}>
          {t('common.cancel')}
        </Btn>
        <Btn variant="ok" disabled={!ok || busy} onClick={save}>
          ✓ {t('debt.receive')}
        </Btn>
      </div>
    </Modal>
  )
}
