import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { audit } from '../db/audit'
import { db } from '../db/schema'
import { type Printer, type Settings, setSetting } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { canBle, canSerial, connectPrinter, printRows } from '../ui/btPrinter'
import { Btn, Field, Screen, inputCls, toInt } from '../ui/kit'

type Draft = Pick<Settings, 'shopName' | 'shopAddress' | 'shopPhone' | 'tin' | 'roundStep' | 'roundMode' | 'receiptEnabled' | 'receiptFooter' | 'returnPolicy' | 'practiceMode' | 'devicePrefix' | 'paymentMethods' | 'ct' | 'remnantBelowTenths' | 'cashCheck' | 'ctThresholdKs' | 'autoLockMinutes'>
const KEYS: (keyof Draft)[] = ['shopName', 'shopAddress', 'shopPhone', 'tin', 'roundStep', 'roundMode', 'receiptEnabled', 'receiptFooter', 'returnPolicy', 'practiceMode', 'devicePrefix', 'paymentMethods', 'ct', 'remnantBelowTenths', 'cashCheck', 'ctThresholdKs', 'autoLockMinutes']

export function SettingsScreen() {
  const { t } = useTranslation()
  const settings = useSettings()
  const hasSales = useLiveQuery(async () => (await db.sales.count()) > 0, [])
  const [d, setD] = useState<Draft>()
  const [ctRate, setCtRate] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [pmsg, setPmsg] = useState<{ ok: boolean; text: string }>()
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (settings && !d) {
      setD(Object.fromEntries(KEYS.map((k) => [k, settings[k]])) as Draft)
      setCtRate(String(settings.ct.rateBp / 100))
    }
  }, [settings, d])
  if (!settings || !d) return null
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch })

  async function save() {
    const rate = Number(ctRate)
    if (!d!.shopName.trim()) return setMsg({ ok: false, text: t('settings.errShop') })
    if (!/^[A-Z]$/.test(d!.devicePrefix)) return setMsg({ ok: false, text: t('settings.errPrefix') })
    if (!(rate >= 0 && rate <= 100)) return setMsg({ ok: false, text: t('settings.errCt') })
    const next = { ...d!, ct: { ...d!.ct, rateBp: Math.round(rate * 100) } }
    for (const k of KEYS) {
      if (JSON.stringify(settings![k]) !== JSON.stringify(next[k])) {
        await audit('settings.change', `settings:${k}`, settings![k], next[k])
        await setSetting(k, next[k] as never)
      }
    }
    setMsg({ ok: true, text: t('common.saved') })
  }

  async function connect(kind: Printer['kind']) {
    setPmsg(undefined)
    try {
      const p = await connectPrinter(kind)
      await setSetting('printer', p)
      setPmsg({ ok: true, text: t('printer.connected', { name: p.name }) })
    } catch (e) {
      setPmsg({ ok: false, text: `${t('printer.failed')} (${(e as Error).message})` })
    }
  }

  async function testPrint() {
    setPmsg(undefined)
    setPrinting(true)
    try {
      await printRows(settings!.printer!, [
        { left: settings!.shopName, center: true, bold: true, size: 34 },
        { left: '', rule: true },
        { left: 'မြန်မာစာ စမ်းသပ် ပုံနှိပ်ခြင်း', bold: true },
        { left: 'ကျောက်ချိုင့် ညှပ်ကြိုး ဂျော်ဂျက် ပိုး ချည် ၁၂၃၄၅၆၇၈၉၀', small: true },
        { left: 'Test print 0123456789', right: '12,500' },
        { left: '', rule: true },
        { left: new Date().toLocaleString(), center: true, small: true },
      ])
    } catch (e) {
      setPmsg({ ok: false, text: `${t('printer.failed')} (${(e as Error).message})` })
    } finally {
      setPrinting(false)
    }
  }

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center gap-3 text-xl">
      <input type="checkbox" className="h-8 w-8" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <Screen title={t('settings.title')} back="#/menu">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className={`rounded-2xl p-4 ${d.practiceMode ? 'bg-orange-100' : 'bg-slate-100'}`}>
          {toggle(t('settings.practice'), d.practiceMode, (v) => set({ practiceMode: v }))}
          <p className="mt-1 text-base text-slate-700">{t('settings.practiceHint')}</p>
        </section>

        <h2 className="text-2xl font-bold">{t('settings.shop')}</h2>
        <Field label={t('settings.shopName')}>
          <input className={inputCls} value={d.shopName} onChange={(e) => set({ shopName: e.target.value })} />
        </Field>
        <Field label={t('settings.address')}>
          <input className={inputCls} value={d.shopAddress} onChange={(e) => set({ shopAddress: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.phone')}>
            <input className={inputCls} inputMode="tel" value={d.shopPhone} onChange={(e) => set({ shopPhone: e.target.value })} />
          </Field>
          <Field label="TIN / CT">
            <input className={inputCls} value={d.tin} onChange={(e) => set({ tin: e.target.value })} />
          </Field>
        </div>

        <h2 className="text-2xl font-bold">{t('settings.rounding')}</h2>
        <p className="text-base text-slate-700">{t('settings.roundingHint')}</p>
        <div className="flex flex-wrap gap-2">
          {[50, 100].map((s) => (
            <Btn key={s} variant={d.roundStep === s ? 'primary' : 'plain'} onClick={() => set({ roundStep: s })}>
              {s} {t('common.ks')}
            </Btn>
          ))}
          {(['nearest', 'up'] as const).map((m) => (
            <Btn key={m} variant={d.roundMode === m ? 'primary' : 'plain'} onClick={() => set({ roundMode: m })}>
              {t(`settings.round_${m}`)}
            </Btn>
          ))}
        </div>

        <Field label={t('settings.remnantBelow')} hint={t('settings.remnantBelowHint')}>
          <input
            className={`${inputCls} w-32`}
            inputMode="decimal"
            defaultValue={d.remnantBelowTenths / 360}
            onChange={(e) => {
              const yards = Number(e.target.value)
              if (yards > 0) set({ remnantBelowTenths: Math.round(yards * 360) })
            }}
          />
        </Field>

        <h2 className="text-2xl font-bold">{t('settings.payments')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {d.paymentMethods.map((m, i) => (
            <div key={m.code}>
              {toggle(m.nameMy, m.active, (v) => set({ paymentMethods: d.paymentMethods.map((x, j) => (j === i ? { ...x, active: v } : x)) }))}
            </div>
          ))}
        </div>

        {toggle(t('settings.cashCheck'), d.cashCheck, (v) => set({ cashCheck: v }))}

        <h2 className="text-2xl font-bold">{t('settings.receipt')}</h2>
        {toggle(t('settings.receiptOn'), d.receiptEnabled, (v) => set({ receiptEnabled: v }))}
        <Field label={t('settings.footer')}>
          <input className={inputCls} value={d.receiptFooter} onChange={(e) => set({ receiptFooter: e.target.value })} />
        </Field>
        <Field label={t('settings.policy')}>
          <input className={inputCls} value={d.returnPolicy} onChange={(e) => set({ returnPolicy: e.target.value })} />
        </Field>

        <h2 className="text-2xl font-bold">{t('settings.printing')}</h2>
        <p className="text-xl">{settings.printer ? t('printer.connected', { name: settings.printer.name }) : t('printer.none')}</p>
        {canBle() || canSerial() ? (
          <>
            <p className="text-base text-slate-700">{t('printer.hint')}</p>
            <div className="flex flex-wrap gap-2">
              {canBle() && <Btn onClick={() => connect('ble')}>🔗 {t('printer.connect')}</Btn>}
              {canSerial() && (
                <Btn variant="plain" onClick={() => connect('serial')}>
                  {t('printer.connectSerial')}
                </Btn>
              )}
              <Btn variant="plain" disabled={!settings.printer || printing} onClick={testPrint}>
                🖨 {printing ? t('printer.printing') : t('printer.test')}
              </Btn>
            </div>
          </>
        ) : (
          <p className="rounded-lg bg-amber-100 p-3 text-amber-900">{t('printer.unsupported')}</p>
        )}
        {pmsg && <p className={`rounded-xl p-3 text-xl font-bold ${pmsg.ok ? 'bg-green-100' : 'bg-red-100'}`}>{pmsg.text}</p>}

        <h2 className="text-2xl font-bold">{t('settings.tax')}</h2>
        {toggle(t('settings.ctRegistered'), d.ct.registered, (v) => set({ ct: { ...d.ct, registered: v } }))}
        {d.ct.registered && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.ctRate')}>
              <input className={inputCls} inputMode="decimal" value={ctRate} onChange={(e) => setCtRate(e.target.value)} />
            </Field>
            <div className="pt-8">{toggle(t('settings.ctInclusive'), d.ct.inclusive, (v) => set({ ct: { ...d.ct, inclusive: v } }))}</div>
          </div>
        )}

        <Field label={t('settings.ctThreshold')} hint={t('settings.ctThresholdHint')}>
          <input
            className={`${inputCls} w-60`}
            inputMode="numeric"
            defaultValue={d.ctThresholdKs}
            onChange={(e) => {
              const n = toInt(e.target.value)
              if (n) set({ ctThresholdKs: n })
            }}
          />
        </Field>

        <h2 className="text-2xl font-bold">{t('settings.device')}</h2>
        <Field label={t('settings.autoLock')} hint={t('settings.autoLockHint')}>
          <input
            className={`${inputCls} w-32`}
            inputMode="numeric"
            defaultValue={d.autoLockMinutes}
            onChange={(e) => {
              const n = toInt(e.target.value)
              if (n !== undefined) set({ autoLockMinutes: n })
            }}
          />
        </Field>
        <Field label={t('settings.prefix')} hint={t(hasSales ? 'settings.prefixLocked' : 'settings.prefixHint')}>
          <input className={`${inputCls} w-24`} maxLength={1} disabled={hasSales} value={d.devicePrefix} onChange={(e) => set({ devicePrefix: e.target.value.toUpperCase() })} />
        </Field>

        {msg && <p className={`rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100' : 'bg-red-100'}`}>{msg.text}</p>}
        <Btn variant="ok" className="w-full py-4 text-2xl" onClick={save}>
          {t('common.save')}
        </Btn>
      </div>
    </Screen>
  )
}
