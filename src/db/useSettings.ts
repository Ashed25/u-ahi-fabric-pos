import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './schema'
import { DEFAULT_SETTINGS, type Settings } from './settings'

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const rows = await db.settings.toArray()
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings
  })
}
