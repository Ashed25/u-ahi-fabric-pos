import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../db/useSettings'
import { go } from '../ui/router'
import { setStatus, syncOnce, useSyncStatus } from './engine'
import { setDeviceRole } from './queue'
import { cloudApi } from './supabase'

let running = false
export async function syncNow() {
  if (running) return
  running = true
  try {
    const api = await cloudApi()
    if (api) await syncOnce(api)
    else setStatus({ state: 'signedOut' })
  } finally {
    running = false
  }
}

/** Background sync: every 30 s, when the internet comes back, and when the app comes to the front. */
export function SyncRunner() {
  const settings = useSettings()
  const role = settings?.deviceRole ?? ''
  const configured = !!settings?.cloudUrl
  useEffect(() => setDeviceRole(role), [role])
  useEffect(() => {
    if (!configured || !role) return setStatus({ state: 'off' })
    void syncNow()
    const id = setInterval(syncNow, 30_000)
    const onVisible = () => document.visibilityState === 'visible' && syncNow()
    window.addEventListener('online', syncNow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', syncNow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [configured, role])
  return null
}

/** Small cloud badge: quiet when all is well, visible when something needs attention. */
export function SyncBadge({ always = false }: { always?: boolean }) {
  const { t } = useTranslation()
  const s = useSyncStatus()
  if (s.state === 'off' || (!always && (s.state === 'ok' || s.state === 'syncing') && s.queued < 50)) return null
  const bad = !['ok', 'syncing'].includes(s.state)
  return (
    <button className={`rounded-xl px-3 text-lg ${bad ? 'bg-amber-300 text-amber-950' : 'bg-white/20'}`} onClick={() => go('#/cloud')} data-testid="sync-badge">
      ☁ {t(`cloud.state_${s.state}`)}
      {s.queued > 0 && ` · ${s.queued}`}
    </button>
  )
}
