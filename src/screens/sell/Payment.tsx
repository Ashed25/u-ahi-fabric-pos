import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatKs } from '../../core/money'
import type { PaymentInput } from '../../db/sales'
import type { Settings } from '../../db/settings'
import { Btn, toInt } from '../../ui/kit'
import { useScanner } from '../../ui/useScanner'

const NOTES = [1000, 5000, 10000, 20000]

/** Cash with note buttons and a huge change figure; mobile/card with optional reference; split allowed. */
export function Payment({ totalKs, settings, onBack, onFinish }: { totalKs: number; settings: Settings; onBack: () => void; onFinish: (p: PaymentInput[]) => Promise<void> }) {
  const { t, i18n } = useTranslation()
  const methods = settings.paymentMethods.filter((m) => m.active)
  const [paid, setPaid] = useState<PaymentInput[]>([])
  const [method, setMethod] = useState(methods[0]?.code ?? 'cash')
  const [tendered, setTendered] = useState(0)
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useScanner(null)

  const due = totalKs - paid.reduce((s, p) => s + p.amountKs, 0)
  const isCash = method === 'cash'
  const m = methods.find((x) => x.code === method)
  const name = (code: string) => {
    const x = settings.paymentMethods.find((p) => p.code === code)
    return x ? (i18n.language === 'en' ? x.nameEn : x.nameMy) : code
  }
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

  function choose(code: string) {
    setMethod(code)
    setTendered(0)
    setAmount('')
    setRef('')
    setError('')
  }

  async function finish() {
    if (!current || !covers) return
    setBusy(true)
    try {
      await onFinish([...paid, current])
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
                  <button className="min-h-12 w-12 text-red-700" aria-label={t('common.remove')} onClick={() => setPaid(paid.filter((_, j) => j !== i))}>
                    ✕
                  </button>
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
          {isCash ? (
            <>
              <div className="rounded-2xl border-2 border-slate-300 p-4">
                <div className="text-xl">{t('pay.received')}</div>
                <div className="text-5xl font-bold" data-testid="tendered">
                  {formatKs(tendered)}
                </div>
              </div>
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
            <Btn variant="plain" className="min-h-20 text-2xl" onClick={onBack}>
              ← {t('common.back')}
            </Btn>
            {current && !covers ? (
              <Btn className="min-h-20 text-2xl" onClick={addPart}>
                {t('pay.addPart')}
              </Btn>
            ) : (
              <Btn variant="ok" className="min-h-20 text-3xl" disabled={!covers || busy} onClick={finish}>
                ✓ {t('pay.finish')}
              </Btn>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
