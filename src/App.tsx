import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from './db/useSettings'
import { Backup } from './screens/Backup'
import { Home } from './screens/Home'
import { SalesHistory, SaleView } from './screens/SalesHistory'
import { SettingsScreen } from './screens/SettingsScreen'
import { Return } from './screens/Return'
import { Sell } from './screens/sell/Sell'
import { Today } from './screens/Today'
import { StockCount } from './screens/stock/StockCount'
import { StockList } from './screens/stock/StockList'
import { StockProduct } from './screens/stock/StockProduct'
import { Labels } from './screens/Labels'
import { ProductEdit } from './screens/ProductEdit'
import { Products } from './screens/Products'
import { ScannerTest } from './screens/ScannerTest'
import { Tagging } from './screens/Tagging'
import { Units } from './screens/Units'
import { useRoute } from './ui/router'

// Excel library is large: load only when the Import screen opens.
const Import = lazy(() => import('./screens/Import').then((m) => ({ default: m.Import })))

export default function App() {
  const { i18n } = useTranslation()
  const settings = useSettings()
  const { path } = useRoute()

  useEffect(() => {
    if (!settings) return
    if (i18n.language !== settings.lang) i18n.changeLanguage(settings.lang)
    document.documentElement.lang = settings.lang
    document.documentElement.classList.toggle('large-text', settings.largeText)
  }, [settings, i18n])

  switch (path[0]) {
    case 'menu':
      return <Home />
    case 'sales':
      return path[1] ? <SaleView key={path[1]} id={decodeURIComponent(path[1])} /> : <SalesHistory />
    case 'settings':
      return <SettingsScreen />
    case 'stock':
      return path[1] ? <StockProduct key={path[1]} id={Number(path[1])} /> : <StockList />
    case 'count':
      return <StockCount />
    case 'return':
      return <Return key={path[1]} saleId={decodeURIComponent(path[1] ?? '')} />
    case 'today':
      return <Today />
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
