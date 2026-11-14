import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { hasDemo, loadDemo, removeDemo } from '../db/demo'
import { setSetting } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'

const TILES = [
  ['sales', '🧾', 'history.title'],
  ['stock', '📦', 'stock.title'],
  ['products', '👕', 'products.title'],
  ['labels', '🏷', 'labels.title'],
  ['tagging', '✅', 'tagging.title'],
  ['import', '📥', 'import.title'],
  ['units', '📏', 'units.title'],
  ['scanner', '🔍', 'scanner.title'],
  ['backup', '💾', 'backup.title'],
  ['settings', '⚙️', 'settings.title'],
] as const

export function Home() {
  const { t } = useTranslation()
  const settings = useSettings()
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
      title={t('sell.menu')}
      back="#/"
      actions={
        <>
          <Btn variant="plain" onClick={() => setSetting('largeText', !settings.largeText)}>
            {t(settings.largeText ? 'home.normalText' : 'home.largeText')}
          </Btn>
          <Btn variant="plain" onClick={() => setSetting('lang', settings.lang === 'my' ? 'en' : 'my')}>
            {t('lang.toggle')}
          </Btn>
        </>
      }
    >
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-3">
        {TILES.map(([route, icon, label]) => (
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
    </Screen>
  )
}
