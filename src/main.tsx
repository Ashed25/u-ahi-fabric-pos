import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'
import { installSyncHooks } from './sync/queue'

// Queue every change for the cloud (only sent if this device is set up as the shop tablet).
installSyncHooks()

// Ask Chrome not to evict our IndexedDB data under storage pressure.
navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
