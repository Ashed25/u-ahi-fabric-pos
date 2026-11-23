import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dateKey, timeText } from '../core/fy'
import { setSetting } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { useSession } from '../session'
import { becomePrimary, getPrimary, queueEverything, restoreFromCloud, useSyncStatus } from '../sync/engine'
import { setDeviceRole } from '../sync/queue'
import { syncNow } from '../sync/runner'
import { cloudApi, getClient, SETUP_SQL } from '../sync/supabase'
import { Btn, Field, Modal, Screen, inputCls } from '../ui/kit'

type Confirm = { text: string; run: () => Promise<void> }

/** Owner: connect to Supabase, choose what this device is, see sync status. */
export function Cloud() {
  const { t } = useTranslation()
  const settings = useSettings()
  const status = useSyncStatus()
  const { lock } = useSession()
  const [f, setF] = useState<{ url?: string; key?: string; email?: string; password: string }>({ password: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>()
  const [copied, setCopied] = useState(false)
  if (!settings) return null
  const url = f.url ?? settings.cloudUrl
  const key = f.key ?? settings.cloudAnonKey
  const email = f.email ?? settings.cloudEmail

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg(undefined)
    try {
      await fn()
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error)?.message ?? e) })
    } finally {
      setBusy(false)
    }
  }

  const connect = () =>
    run(async () => {
      await setSetting('cloudUrl', url.trim())
      await setSetting('cloudAnonKey', key.trim())
      await setSetting('cloudEmail', email.trim())
      if (!settings.deviceUuid) await setSetting('deviceUuid', crypto.randomUUID())
      const client = (await getClient())!
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password: f.password })
      if (error) throw new Error(error.message)
      setF({ password: '' })
      setMsg({ ok: true, text: t('cloud.connected') })
    })

  const api = async () => {
    const a = await cloudApi()
    if (!a) throw new Error(t('cloud.state_signedOut'))
    return a
  }

  const chooseTablet = () =>
    run(async () => {
      const a = await api()
      const claim = await getPrimary(a)
      const go = async () => {
        await becomePrimary(a)
        setDeviceRole('primary')
        await queueEverything()
        await syncNow()
        setMsg({ ok: true, text: t('cloud.isTablet') })
      }
      if (claim && claim.device !== settings.deviceUuid) setConfirm({ text: t('cloud.takeOverWarn', { when: dateKey(Number(claim.at)) }), run: go })
      else await go()
    })

  const chooseViewer = () =>
    setConfirm({
      text: t('cloud.viewerWarn'),
      run: async () => {
        const a = await api()
        setDeviceRole('viewer')
        await setSetting('deviceRole', 'viewer')
        const n = await restoreFromCloud(a)
        setMsg({ ok: true, text: t('cloud.restored', { count: n }) })
        lock() // the users now come from the shop tablet: log in with your real PIN
      },
    })

  const replaceTablet = () =>
    setConfirm({
      text: t('cloud.replaceWarn'),
      run: async () => {
        const a = await api()
        const claim = await getPrimary(a)
        setDeviceRole('viewer')
        await restoreFromCloud(a)
        await becomePrimary(a, { continueFrom: (claim?.prefix as string) || undefined })
        setDeviceRole('primary')
        setMsg({ ok: true, text: t('cloud.isTablet') })
        lock()
      },
    })

  const disconnect = () =>
    run(async () => {
      await (await getClient())?.auth.signOut()
      await setSetting('deviceRole', '')
      setDeviceRole('')
      setMsg({ ok: true, text: t('cloud.disconnected') })
    })

  const signedIn = status.state !== 'signedOut' && !!settings.cloudUrl && (settings.deviceRole !== '' || msg?.ok)

  return (
    <Screen title={t('cloud.title')}>
      <div className="mx-auto max-w-3xl space-y-5">
        {settings.deviceRole && (
          <section className={`rounded-2xl p-4 text-xl ${['ok', 'syncing'].includes(status.state) ? 'bg-green-50' : 'bg-amber-100'}`} data-testid="cloud-status">
            <p className="text-2xl font-bold">
              {t(settings.deviceRole === 'primary' ? 'cloud.roleTablet' : 'cloud.roleViewer')} — ☁ {t(`cloud.state_${status.state}`)}
            </p>
            <p>
              {t('cloud.waiting', { count: status.queued })} · {t('cloud.last')}: {settings.lastSyncAt ? `${dateKey(settings.lastSyncAt)} ${timeText(settings.lastSyncAt)}` : '—'}
            </p>
            {status.state === 'unreachable' && <p className="mt-2 font-bold">{t('cloud.pausedHelp')}</p>}
            {status.state === 'notPrimary' && <p className="mt-2 font-bold">{t('cloud.notPrimaryHelp')}</p>}
            {status.error && status.state !== 'ok' && <p className="mt-1 break-all font-mono text-base">{status.error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn disabled={busy} onClick={() => run(syncNow)}>
                ⟳ {t('cloud.syncNow')}
              </Btn>
              {settings.deviceRole === 'primary' && (
                <Btn variant="plain" disabled={busy} onClick={() => run(async () => (await queueEverything(), await syncNow()))}>
                  {t('cloud.uploadAll')}
                </Btn>
              )}
              {settings.deviceRole === 'viewer' && (
                <Btn variant="plain" disabled={busy} onClick={replaceTablet}>
                  {t('cloud.replaceTablet')}
                </Btn>
              )}
              <Btn variant="plain" disabled={busy} onClick={disconnect}>
                {t('cloud.disconnect')}
              </Btn>
            </div>
          </section>
        )}

        {!settings.deviceRole && signedIn && (
          <section className="space-y-3">
            <h2 className="text-2xl font-bold">{t('cloud.whatIsThis')}</h2>
            <Btn variant="ok" className="min-h-24 w-full text-2xl" disabled={busy} onClick={chooseTablet}>
              📱 {t('cloud.chooseTablet')}
            </Btn>
            <Btn className="min-h-24 w-full text-2xl" disabled={busy} onClick={chooseViewer}>
              💻 {t('cloud.chooseViewer')}
            </Btn>
            <Btn variant="plain" className="w-full" disabled={busy} onClick={replaceTablet}>
              {t('cloud.replaceTablet')}
            </Btn>
            <Btn variant="plain" className="w-full" disabled={busy} onClick={disconnect}>
              {t('cloud.disconnect')}
            </Btn>
          </section>
        )}

        {msg && <p className={`rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100' : 'bg-red-100'}`}>{msg.text}</p>}

        <details open={!settings.cloudUrl} className="rounded-2xl border-2 border-slate-200 p-4">
          <summary className="cursor-pointer text-2xl font-bold">{t('cloud.setupTitle')}</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-8 text-xl">
            <li>{t('cloud.step1')}</li>
            <li>
              {t('cloud.step2')}
              <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-900 p-3 text-sm text-white">{SETUP_SQL}</pre>
              <Btn
                variant="plain"
                className="mt-2"
                onClick={async () => {
                  await navigator.clipboard?.writeText(SETUP_SQL)
                  setCopied(true)
                }}
              >
                {copied ? `✓ ${t('cloud.copied')}` : t('cloud.copySql')}
              </Btn>
            </li>
            <li>{t('cloud.step3')}</li>
            <li>{t('cloud.step4')}</li>
            <li>{t('cloud.step5')}</li>
          </ol>
          <div className="mt-4 space-y-3">
            <Field label="Project URL">
              <input className={inputCls} placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setF({ ...f, url: e.target.value })} />
            </Field>
            <Field label="anon public key">
              <input className={inputCls} value={key} onChange={(e) => setF({ ...f, key: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('cloud.email')}>
                <input className={inputCls} type="email" value={email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </Field>
              <Field label={t('cloud.password')}>
                <input className={inputCls} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              </Field>
            </div>
            <Btn variant="ok" className="w-full" disabled={busy || !url || !key || !email || !f.password} onClick={connect}>
              {t('cloud.connect')}
            </Btn>
          </div>
        </details>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(undefined)}>
          <p className="mb-4 text-2xl">{confirm.text}</p>
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setConfirm(undefined)}>
              {t('common.cancel')}
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                const c = confirm
                setConfirm(undefined)
                void run(c.run)
              }}
            >
              {t('common.ok')}
            </Btn>
          </div>
        </Modal>
      )}
    </Screen>
  )
}
