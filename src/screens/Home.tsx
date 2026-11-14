import { useTranslation } from 'react-i18next'
import { setSetting } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { Btn, Screen } from '../ui/kit'
import { go } from '../ui/router'

const TILES = [
  ['products', '👕', 'products.title'],
  ['labels', '🏷', 'labels.title'],
  ['tagging', '✅', 'tagging.title'],
  ['import', '📥', 'import.title'],
  ['units', '📏', 'units.title'],
  ['scanner', '🔍', 'scanner.title'],
  ['backup', '💾', 'backup.title'],
] as const

export function Home() {
  const { t } = useTranslation()
  const settings = useSettings()
  if (!settings) return null
  return (
    <Screen
      title={settings.shopName}
      back={null}
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
    </Screen>
  )
}
