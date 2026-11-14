import { lazy, type ReactNode, Suspense, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { NEED } from './access'
import { useSettings } from './db/useSettings'
import { anyUsers, atLeast } from './db/users'
import { AuditLog } from './screens/AuditLog'
import { Backup } from './screens/Backup'
import { Cloud } from './screens/Cloud'
import { SyncRunner } from './sync/runner'
import { CtReport } from './screens/CtReport'
import { Home } from './screens/Home'
import { Labels } from './screens/Labels'
import { ProductEdit } from './screens/ProductEdit'
import { Products } from './screens/Products'
import { Reports } from './screens/Reports'
import { Return } from './screens/Return'
import { SalesHistory, SaleView } from './screens/SalesHistory'
import { ScannerTest } from './screens/ScannerTest'
import { SettingsScreen } from './screens/SettingsScreen'
import { Sell } from './screens/sell/Sell'
import { StockCount } from './screens/stock/StockCount'
import { StockList } from './screens/stock/StockList'
import { StockProduct } from './screens/stock/StockProduct'
import { Tagging } from './screens/Tagging'
import { Today } from './screens/Today'
import { Units } from './screens/Units'
import { Users } from './screens/Users'
import { LockScreen, OwnerGate, SessionProvider, Setup, useAutoLock, useSession } from './session'
import { Btn, Screen } from './ui/kit'
import { go, useRoute } from './ui/router'

// Excel library is large: load only when the Import screen opens.
const Import = lazy(() => import('./screens/Import').then((m) => ({ default: m.Import })))

export default function App() {
  const { i18n } = useTranslation()
  const settings = useSettings()
  useEffect(() => {
    if (!settings) return
    if (i18n.language !== settings.lang) i18n.changeLanguage(settings.lang)
    document.documentElement.lang = settings.lang
    document.documentElement.classList.toggle('large-text', settings.largeText)
  }, [settings, i18n])
  return (
    <SessionProvider>
      <SyncRunner />
      <Gate />
    </SessionProvider>
  )
}

function Gate() {
  const { t } = useTranslation()
  const hasUsers = useLiveQuery(anyUsers, [])
  const { user } = useSession()
  const { path } = useRoute()
  useAutoLock()
  if (hasUsers === undefined) return null
  if (!hasUsers) return <Setup />
  if (!user) return <LockScreen />

  const need = NEED[path[0] ?? ''] ?? 'owner'
  if (!atLeast(user, need))
    return (
      <Screen title={t('lock.noAccess')}>
        <div className="mx-auto max-w-xl space-y-4 text-center text-2xl">
          <p>{t('lock.noAccessHint')}</p>
          <Btn onClick={() => go('#/')}>{t('lock.toSell')}</Btn>
        </div>
      </Screen>
    )
  const page = route(path)
  return need === 'owner' ? <OwnerGate>{page}</OwnerGate> : page
}

function route(path: string[]): ReactNode {
  switch (path[0]) {
    case 'menu':
      return <Home />
    case 'sales':
      return path[1] ? <SaleView key={path[1]} id={decodeURIComponent(path[1])} /> : <SalesHistory />
    case 'settings':
      return <SettingsScreen />
    case 'users':
      return <Users />
    case 'audit':
      return <AuditLog />
    case 'cloud':
      return <Cloud />
    case 'stock':
      return path[1] ? <StockProduct key={path[1]} id={Number(path[1])} /> : <StockList />
    case 'count':
      return <StockCount />
    case 'return':
      return <Return key={path[1]} saleId={decodeURIComponent(path[1] ?? '')} />
    case 'today':
      return <Today />
    case 'reports':
      return <Reports />
    case 'ct':
      return <CtReport />
    case 'products':
      if (path[1] === 'new') return <ProductEdit key="new" />
      return path[1] ? <ProductEdit key={path[1]} id={Number(path[1])} /> : <Products />
    case 'labels':
      return <Labels />
    case 'tagging':
      return <Tagging />
    case 'import':
      return (
        <Suspense>
          <Import />
        </Suspense>
      )
    case 'units':
      return <Units />
    case 'scanner':
      return <ScannerTest />
    case 'backup':
      return <Backup />
    default:
      return <Sell />
  }
}
