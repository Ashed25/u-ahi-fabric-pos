import { useSyncExternalStore } from 'react'
import { db } from '../db/schema'
import { getSetting, setSetting, SHARED_SETTINGS } from '../db/settings'
import { audit } from '../db/audit'
import { enqueue, queueAck, queueSize, queueSnapshot, whileApplying } from './queue'
import { type CloudRow, fromCloud, fromId, isShared, SYNCED, toCloud, toId } from './rows'

/** What the engine needs from the cloud. The real one is Supabase; tests use an in-memory fake. */
export interface CloudApi {
  upsert(rows: CloudRow[]): Promise<void>
  pull(afterSeq: number, limit: number): Promise<(CloudRow & { seq: number })[]>
  getMeta(id: string): Promise<Record<string, unknown> | undefined>
  setMeta(id: string, data: Record<string, unknown>): Promise<void>
}

const CHUNK = 200

/** Upload queued changes (shop tablet). Returns how many rows went up. */
export async function push(api: CloudApi): Promise<number> {
  const snap = queueSnapshot()
  let sent = 0
  for (let i = 0; i < snap.length; i += CHUNK) {
    const part = snap.slice(i, i + CHUNK)
    const rows: CloudRow[] = []
    for (const e of part) {
      if (e.tbl === 'settings') {
        const s = await db.settings.get(e.key as string)
        rows.push({ tbl: 'settings', id: toId(e.key), data: s ?? null, deleted: !s })
        continue
      }
      const row = (await db.table(e.tbl).get(e.key as never)) as Record<string, unknown> | undefined
      rows.push({ tbl: e.tbl, id: toId(e.key), data: row ? await toCloud(row) : null, deleted: !row })
    }
    await api.upsert(rows)
    queueAck(part)
    sent += rows.length
  }
  return sent
}

/** Queue every row (first connection, or after a problem): the next pushes send everything. */
export async function queueEverything() {
  for (const tbl of SYNCED) {
    const keys = (await db.table(tbl).toCollection().primaryKeys()) as unknown[]
    for (const k of keys) if (isShared(tbl, k)) enqueue(tbl, k)
  }
}

async function fetchAll(api: CloudApi, after: number) {
  const rows: (CloudRow & { seq: number })[] = []
  for (;;) {
    const page = await api.pull(after, 1000)
    if (!page.length) return { rows, after }
    rows.push(...page)
    after = page[page.length - 1].seq
  }
}

const tables = () => SYNCED.map((t) => db.table(t))

/** Apply downloaded rows in one transaction. `replace` = this device becomes an exact copy of the cloud. */
async function apply(rows: (CloudRow & { seq: number })[], lastSeq: number, replace: boolean) {
  // Decode photos before the transaction: IndexedDB transactions can't wait for other work.
  const decoded = rows.filter((r) => r.tbl !== '_meta').map((r) => ({ ...r, data: r.deleted || !r.data ? null : fromCloud(r.data as Record<string, unknown>) }))
  await whileApplying(() =>
    db.transaction('rw', tables(), async () => {
      if (replace) {
        for (const t of SYNCED) {
          if (t === 'settings') await db.settings.bulkDelete(SHARED_SETTINGS)
          else await db.table(t).clear()
        }
      }
      for (const r of decoded) {
        if (!(SYNCED as readonly string[]).includes(r.tbl)) continue
        if (r.tbl === 'settings' && !isShared('settings', r.id)) continue
        if (r.data) await db.table(r.tbl).put(r.data)
        else await db.table(r.tbl).delete(fromId(r.tbl, r.id))
      }
      await setSetting('lastPullSeq', lastSeq)
    }),
  )
}

/** Download what changed since last time (viewer devices). */
export async function pull(api: CloudApi): Promise<number> {
  const { rows, after } = await fetchAll(api, await getSetting('lastPullSeq'))
  if (rows.length) await apply(rows, after, false)
  return rows.length
}

/** Replace everything on this device with the cloud copy (laptop setup, or a replacement tablet). */
export async function restoreFromCloud(api: CloudApi): Promise<number> {
  const { rows, after } = await fetchAll(api, 0)
  await apply(rows, after, true)
  return rows.length
}

/** Who is the shop tablet right now. */
export const getPrimary = (api: CloudApi) => api.getMeta('primary')

/**
 * Make this device the shop tablet. When replacing a broken tablet (after restoreFromCloud), it keeps
 * the old tablet's letter and continues its sale / return / barcode numbers without gaps.
 */
export async function becomePrimary(api: CloudApi, opts: { continueFrom?: string } = {}) {
  let uuid = await getSetting('deviceUuid')
  if (!uuid) {
    uuid = crypto.randomUUID()
    await setSetting('deviceUuid', uuid)
  }
  if (opts.continueFrom) await setSetting('devicePrefix', opts.continueFrom)
  const prefix = await getSetting('devicePrefix')
  const sales = await db.sales.filter((s) => s.deviceId === prefix).toArray()
  const saleSeq = Math.max(await getSetting('saleSeq'), ...sales.map((s) => s.seq))
  const creditSeq = Math.max(await getSetting('creditSeq'), ...(await db.creditNotes.toArray()).filter((c) => c.id.startsWith(`CN-${prefix}-`)).map((c) => Number(c.id.slice(-6))))
  const bp = await getSetting('barcodePrefix')
  const generated = (await db.barcodes.filter((b) => b.source === 'generated' && b.code.startsWith(bp)).toArray()).map((b) => Number(b.code.slice(2, 12)))
  const barcodeSeq = Math.max(await getSetting('barcodeSeq'), ...generated)
  await setSetting('saleSeq', saleSeq)
  await setSetting('creditSeq', creditSeq)
  await setSetting('barcodeSeq', barcodeSeq)
  await setSetting('deviceRole', 'primary')
  await api.setMeta('primary', { device: uuid, prefix, at: Date.now() })
  await audit('cloud.primary', 'device', undefined, { device: uuid, prefix })
}

// ---------- Background sync + status for the UI ----------

export type SyncState = 'off' | 'ok' | 'syncing' | 'offline' | 'unreachable' | 'signedOut' | 'notPrimary' | 'error'
export interface SyncStatus {
  state: SyncState
  queued: number
  lastSyncAt: number
  error?: string
}
let status: SyncStatus = { state: 'off', queued: 0, lastSyncAt: 0 }
const listeners = new Set<() => void>()
export function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, queued: queueSize(), ...patch }
  listeners.forEach((l) => l())
}
export const useSyncStatus = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => status,
  )

/** Network problem while the browser says it's online: likely the free Supabase project is paused (7 days unused). */
export function classify(e: unknown): SyncState {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline'
  const m = String((e as Error)?.message ?? e)
  if (/fetch|network|load failed|ERR_|timeout/i.test(m)) return 'unreachable'
  if (/JWT|auth|session|401|403/i.test(m)) return 'signedOut'
  return 'error'
}

/** One round: the shop tablet pushes, a viewer pulls. */
export async function syncOnce(api: CloudApi) {
  const role = await getSetting('deviceRole')
  if (!role) return setStatus({ state: 'off' })
  setStatus({ state: 'syncing' })
  try {
    if (role === 'primary') {
      const p = await getPrimary(api)
      if (p && p.device !== (await getSetting('deviceUuid'))) return setStatus({ state: 'notPrimary' })
      await push(api)
    } else await pull(api)
    const now = Date.now()
    await setSetting('lastSyncAt', now)
    setStatus({ state: 'ok', lastSyncAt: now, error: undefined })
  } catch (e) {
    setStatus({ state: classify(e), error: String((e as Error)?.message ?? e) })
  }
}
