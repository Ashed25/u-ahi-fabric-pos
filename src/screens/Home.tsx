import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { hasDemo, loadDemo, removeDemo } from '../db/demo'
import { setSetting } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'
import { CtWarning } from './Reports'
import { NEED } from '../access'
import { atLeast } from '../db/users'
import { useSession } from '../session'
import { SyncBadge } from '../sync/runner'

const TILES = [
  ['today', '📊', 'today.title'],
  ['sales', '🧾', 'history.title'],
  ['reports', '📈', 'reports.title'],
  ['stock', '📦', 'stock.title'],
  ['products', '👕', 'products.title'],
  ['labels', '🏷', 'labels.title'],
  ['tagging', '✅', 'tagging.title'],
  ['import', '📥', 'import.title'],
  ['units', '📏', 'units.title'],
  ['scanner', '🔍', 'scanner.title'],
  ['backup', '💾', 'backup.title'],
  ['cloud', '☁️', 'cloud.title'],
  ['settings', '⚙️', 'settings.title'],
  ['users', '👥', 'users.title'],
  ['audit', '📜', 'audit.title'],
] as const

export function Home() {
  const { t } = useTranslation()
  const settings = useSettings()
  const { user, lock } = useSession()
  const hasDemoData = useLiveQuery(hasDemo, [])
  const [busy, setBusy] = useState(false)
  if (!settings || hasDemoData === undefined) return null
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen
      title={`${t('sell.menu')} — ${user?.name ?? ''}`}
      back="#/"
      actions={
        <>
          <Btn variant="plain" onClick={() => setSetting('largeText', !settings.largeText)}>
            {t(settings.largeText ? 'home.normalText' : 'home.largeText')}
          </Btn>
          <Btn variant="plain" onClick={() => setSetting('lang', settings.lang === 'my' ? 'en' : 'my')}>
            {t('lang.toggle')}
          </Btn>
          <SyncBadge always />
          <Btn variant="plain" onClick={lock}>
            🔒 {t('lock.lock')}
          </Btn>
        </>
      }
    >
      <div className="mx-auto mb-4 max-w-4xl space-y-3">
        {settings.deviceRole === 'viewer' && <p className="rounded-2xl bg-sky-100 p-3 text-xl">👁 {t('cloud.viewerBanner')}</p>}
        {atLeast(user, 'owner') && Date.now() - settings.lastBackupAt > 86_400_000 && (
          <button className="block w-full rounded-2xl bg-amber-100 p-3 text-left text-xl" onClick={() => go('#/backup')} data-testid="backup-reminder">
            💾 {t(settings.lastBackupAt ? 'backup.reminder' : 'backup.reminderNever', { days: Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000) })}
          </button>
        )}
        <CtWarning />
      </div>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
        <a
          href="guide.html"
          target="_blank"
          className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-slate-300 bg-slate-50 p-4 text-2xl font-bold active:bg-slate-200"
        >
          <span className="text-5xl" aria-hidden>
            📖
          </span>
          {t('home.guide')}
        </a>
        {TILES.filter(([route]) => atLeast(user, NEED[route])).map(([route, icon, label]) => (
          <button
            key={route}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-slate-300 bg-slate-50 p-4 text-2xl font-bold active:bg-slate-200"
            onClick={() => go(`#/${route}`)}
          >
            <span className="text-5xl" aria-hidden>
              {icon}
            </span>
            {t(label)}
          </button>
        ))}
      </div>
      {atLeast(user, 'owner') && (
      <div className="mx-auto mt-8 max-w-4xl rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
        <p className="mb-3 text-xl">{t(hasDemoData ? 'demo.loadedHint' : 'demo.hint')}</p>
        {hasDemoData ? (
          <Btn variant="danger" disabled={busy} onClick={run(removeDemo)}>
            {t('demo.remove')}
          </Btn>
        ) : (
          <Btn disabled={busy} onClick={run(loadDemo)}>
            {t('demo.load')}
          </Btn>
        )}
      </div>
      )}
    </Screen>
  )
}
