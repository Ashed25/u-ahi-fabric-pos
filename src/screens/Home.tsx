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
  ['debts', '📒', 'debt.title'],
  ['reports', '📈', 'reports.title'],
  ['stock', '📦', 'stock.title'],
  ['products', '👕', 'products.title'],
  ['labels', '🏷', 'labels.title'],
  ['tagging', '✅', 'tagging.title'],
  ['import', '📥', 'import.title'],
  ['units', '📏', 'units.title'],
  ['scanner', '🔍', 'scanner.title'],
  ['profile', '👤', 'profile.title'],
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
          <Btn variant="plain" className="min-h-10 px-3 text-sm sm:text-base" onClick={() => setSetting('largeText', !settings.largeText)}>
            {t(settings.largeText ? 'home.normalText' : 'home.largeText')}
          </Btn>
          <Btn variant="plain" className="min-h-10 px-3 text-sm sm:text-base" onClick={() => setSetting('lang', settings.lang === 'my' ? 'en' : 'my')}>
            {t('lang.toggle')}
          </Btn>
          <SyncBadge always />
          <Btn variant="plain" className="min-h-10 px-3 text-sm sm:text-base" aria-label={t('lock.lock')} onClick={lock}>
            🔒<span className="hidden sm:inline"> {t('lock.lock')}</span>
          </Btn>
        </>
      }
    >
      <div className="mx-auto mb-4 max-w-4xl space-y-3">
        {settings.deviceRole === 'viewer' && <p className="rounded-xl bg-sky-100 p-3 text-base">👁 {t('cloud.viewerBanner')}</p>}
        {atLeast(user, 'owner') && Date.now() - settings.lastBackupAt > 86_400_000 && (
          <button className="block w-full rounded-xl bg-amber-100 p-3 text-left text-base" onClick={() => go('#/backup')} data-testid="backup-reminder">
            💾 {t(settings.lastBackupAt ? 'backup.reminder' : 'backup.reminderNever', { days: Math.floor((Date.now() - settings.lastBackupAt) / 86_400_000) })}
          </button>
        )}
        <CtWarning />
      </div>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <a
          href="guide.html"
          target="_blank"
          className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 text-center text-base font-bold shadow-sm active:bg-slate-100"
        >
          <span className="text-4xl" aria-hidden>
            📖
          </span>
          {t('home.guide')}
        </a>
        {TILES.filter(([route]) => atLeast(user, NEED[route])).map(([route, icon, label]) => (
          <button
            key={route}
            className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 text-center text-base font-bold shadow-sm active:bg-slate-100"
            onClick={() => go(`#/${route}`)}
          >
            <span className="text-4xl" aria-hidden>
              {icon}
            </span>
            {t(label)}
          </button>
        ))}
      </div>
      {atLeast(user, 'owner') && (
      <div className="mx-auto mt-6 max-w-4xl rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4">
        <p className="mb-3 text-base">{t(hasDemoData ? 'demo.loadedHint' : 'demo.hint')}</p>
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
