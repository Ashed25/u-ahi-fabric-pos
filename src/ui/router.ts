import { useSyncExternalStore } from 'react'

// Tiny hash router: "#/products/12?cat=3" -> { path: ['products','12'], query: {cat:'3'} }
const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const [p, q = ''] = hash.replace(/^#\/?/, '').split('?')
  return { path: p.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(q)) }
}

export const go = (to: string) => {
  location.hash = to
}
