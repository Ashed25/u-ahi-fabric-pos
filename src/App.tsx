import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from './db/settings'

export default function App() {
  const { t, i18n } = useTranslation()
  const shopName = useLiveQuery(() => getSetting('shopName'))

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center justify-between gap-4 bg-blue-900 px-4 text-white">
        <h1 className="text-2xl font-bold">{shopName ?? t('app.loading')}</h1>
        <button
          className="rounded-xl px-4 text-lg"
          onClick={() => i18n.changeLanguage(i18n.language === 'my' ? 'en' : 'my')}
        >
          {t('lang.toggle')}
        </button>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 text-3xl">{t('app.comingSoon')}</main>
    </div>
  )
}
