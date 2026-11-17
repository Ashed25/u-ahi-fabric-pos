import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { formatKs } from '../../core/money'
import type { PaymentInput, SaleOptions } from '../../db/sales'
import { db } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { methodName } from '../../ui/format'
import { Btn, inputCls, toInt } from '../../ui/kit'
import { useScanner } from '../../ui/useScanner'

const NOTES = [50, 100, 200, 500, 1000, 5000, 10000, 20000]

/** Cash with note buttons and a huge change figure; mobile/card with optional reference; split allowed. */
export function Payment({
  totalKs,
  settings,
  credit,
  onBack,
  onFinish,
}: {
  totalKs: number
  settings: Settings
  credit?: { cnId: string; leftKs: number } // exchange credit from a return
  onBack: () => void
  onFinish: (p: PaymentInput[], creditBackKs: number, debtor?: SaleOptions['debtor']) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const methods = settings.paymentMethods.filter((m) => m.active)
  const creditUsed = credit ? Math.min(credit.leftKs, totalKs) : 0
  const creditBack = credit ? credit.leftKs - creditUsed : 0 // new items cost less: give the rest back in cash
  const [paid, setPaid] = useState<PaymentInput[]>(credit && creditUsed ? [{ method: 'credit', amountKs: creditUsed, ref: credit.cnId }] : [])
  const [method, setMethod] = useState(methods[0]?.code ?? 'cash')
  const [tendered, setTendered] = useState(0)
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [owe, setOwe] = useState<{ name: string; phone: string }>()
  const debtorNames = useLiveQuery(() => (owe ? db.sales.orderBy('debtor').uniqueKeys() : []), [!!owe])
  useScanner(null)

  const due = totalKs - paid.reduce((s, p) => s + p.amountKs, 0)
  const isCash = method === 'cash'
  const m = methods.find((x) => x.code === method)
  const name = (code: string) => methodName(t, settings.paymentMethods, code, i18n.language)
  const otherAmount = amount === '' ? due : (toInt(amount) ?? 0)
  const change = tendered - due

  // The payment this screen would add right now (full or partial).
  const current: PaymentInput | undefined = isCash
    ? tendered > 0
      ? { method, amountKs: Math.min(tendered, due), tenderedKs: tendered, changeKs: Math.max(0, change) }
      : undefined
    : otherAmount > 0 && otherAmount <= due
      ? { method, amountKs: otherAmount, ref: ref.trim() || undefined }
      : undefined
  const covers = !!current && current.amountKs === due
  const fullyPaid = due === 0 // e.g. exchange credit covers everything

  function choose(code: string) {
    setMethod(code)
    setTendered(0)
    setAmount('')
    setRef('')
    setError('')
  }

  async function finish() {
    if (!fullyPaid && (!current || !covers)) return
    setBusy(true)
    try {
      await onFinish(fullyPaid ? paid : [...paid, current!], creditBack)
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  // Partly paid: what is taken now (parts + this screen's amount if it doesn't cover all) and what stays owed.
  const paidNow = current && !covers ? [...paid, current] : paid
  const owedKs = totalKs - paidNow.reduce((s, p) => s + p.amountKs, 0)

  async function finishOwed() {
    if (!owe?.name.trim() || owedKs <= 0) return
    setBusy(true)
    try {
      await onFinish(paidNow, creditBack, { name: owe.name, phone: owe.phone })
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  function addPart() {
    if (!current || covers) return
    setPaid([...paid, current])
    choose(isCash ? (methods.find((x) => x.code !== 'cash')?.code ?? 'cash') : 'cash')
  }

  return (
    <div className="fixed inset-0 z-30 overflow-auto bg-white">
      <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="rounded-2xl bg-slate-100 p-4">
            <div className="text-xl">{t('pay.total')}</div>
            <div className="text-6xl font-bold">{formatKs(totalKs)}</div>
            {paid.map((p, i) => (
              <div key={i} className="mt-2 flex items-center justify-between text-xl">
                <span>
                  {name(p.method)} {p.ref && <span className="text-base text-slate-600">#{p.ref}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {formatKs(p.amountKs)}
                  {p.method !== 'credit' && (
                    <button className="min-h-12 w-12 text-red-700" aria-label={t('common.remove')} onClick={() => setPaid(paid.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </span>
              </div>
            ))}
            {paid.length > 0 && (
              <div className="mt-2 border-t-2 border-slate-300 pt-2 text-3xl font-bold">
                {t('pay.remaining')}: {formatKs(due)}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((x) => (
              <Btn key={x.code} variant={method === x.code ? 'primary' : 'plain'} className="min-h-18" onClick={() => choose(x.code)}>
                {i18n.language === 'en' ? x.nameEn : x.nameMy}
              </Btn>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          {owe ? (
            <div className="space-y-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4" data-testid="owe-form">
              <p className="flex justify-between text-2xl">
                <span>{t('debt.paidNow')}</span>
                <b>{formatKs(totalKs - owedKs)}</b>
              </p>
              <p className="flex justify-between text-3xl font-bold text-amber-900">
                <span>{t('debt.owed')}</span>
                <span data-testid="owed">{formatKs(owedKs)}</span>
              </p>
              <label className="block text-xl">
                {t('debt.name')}
                <input autoFocus className={inputCls} list="debtor-names" value={owe.name} onChange={(e) => setOwe({ ...owe, name: e.target.value })} />
              </label>
              <datalist id="debtor-names">
                {debtorNames?.map((n) => (
                  <option key={String(n)} value={String(n)} />
                ))}
              </datalist>
              <label className="block text-xl">
                {t('debt.phone')}
                <input className={inputCls} inputMode="tel" value={owe.phone} onChange={(e) => setOwe({ ...owe, phone: e.target.value })} />
              </label>
            </div>
          ) : fullyPaid ? (
            <div className="rounded-2xl bg-green-100 p-4 text-center text-green-900">
              <div className="text-2xl">{t(creditBack > 0 ? 'pay.creditBack' : 'pay.paidByCredit')}</div>
              {creditBack > 0 && (
                <div className="text-7xl font-bold" data-testid="change">
                  {formatKs(creditBack)}
                </div>
              )}
            </div>
          ) : isCash ? (
            <>
              <label className="block rounded-2xl border-2 border-slate-300 p-4">
                <span className="text-xl">{t('pay.received')}</span>
                <input
                  className="w-full bg-transparent text-5xl font-bold outline-none"
                  data-testid="tendered"
                  inputMode="numeric"
                  placeholder="0"
                  value={tendered ? tendered.toLocaleString('en-US') : ''}
                  onChange={(e) => setTendered(toInt(e.target.value) ?? 0)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {NOTES.map((n) => (
                  <Btn key={n} variant="plain" className="min-h-20 text-3xl" onClick={() => setTendered(tendered + n)}>
                    + {formatKs(n)}
                  </Btn>
                ))}
                <Btn variant="plain" className="min-h-20 text-2xl" onClick={() => setTendered(due)}>
                  {t('pay.exact')}
                </Btn>
                <Btn variant="plain" className="min-h-20 text-2xl" onClick={() => setTendered(0)}>
                  {t('pay.clear')}
                </Btn>
              </div>
              {tendered > 0 && (
                <div className={`rounded-2xl p-4 text-center ${change >= 0 ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
                  <div className="text-2xl">{change >= 0 ? t('pay.change') : t('pay.short')}</div>
                  <div className="text-7xl font-bold" data-testid="change">
                    {formatKs(Math.abs(change))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-xl">{t('pay.amount')}</span>
                <input className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-4xl font-bold" inputMode="numeric" placeholder={formatKs(due)} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              {m?.needsRef && (
                <label className="block">
                  <span className="text-xl">{t('pay.ref')}</span>
                  <input className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 text-2xl" value={ref} onChange={(e) => setRef(e.target.value)} />
                </label>
              )}
              {otherAmount > due && <p className="rounded-xl bg-amber-100 p-3 text-xl">{t('pay.tooMuch')}</p>}
            </>
          )}

          {error && <p className="rounded-xl bg-red-100 p-3 text-xl font-bold text-red-900">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="plain" className="min-h-20 text-2xl" onClick={owe ? () => setOwe(undefined) : onBack}>
              ← {t('common.back')}
            </Btn>
            {owe ? (
              <Btn variant="ok" className="min-h-20 text-2xl" disabled={!owe.name.trim() || owedKs <= 0 || busy} onClick={finishOwed}>
                ✓ {t('debt.confirm')}
              </Btn>
            ) : current && !covers ? (
              <Btn className="min-h-20 text-2xl" onClick={addPart}>
                {t('pay.addPart')}
              </Btn>
            ) : (
              <Btn variant="ok" className="min-h-20 text-3xl" disabled={!(covers || fullyPaid) || busy} onClick={finish}>
                ✓ {t('pay.finish')}
              </Btn>
            )}
          </div>
          {!owe && !fullyPaid && !covers && (
            <Btn variant="plain" className="w-full border-amber-400 text-xl" onClick={() => setOwe({ name: '', phone: '' })} data-testid="owe">
              📒 {t('debt.payLater')}
            </Btn>
          )}
        </section>
      </div>
    </div>
  )
}
