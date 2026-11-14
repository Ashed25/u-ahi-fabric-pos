import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from './db/useSettings'
import { Backup } from './screens/Backup'
import { Home } from './screens/Home'
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
      return <Home />
  }
}
