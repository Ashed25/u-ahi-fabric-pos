import type { Transaction } from 'dexie'
import { db } from '../db/schema'
import { isShared, SYNCED, VIEWER_WRITABLE } from './rows'

/**
 * Change queue: every committed write to a synced table puts "table + key" here (localStorage,
 * written right after the transaction commits). The push reads the row's *current* state, so
 * creates, edits and deletes are all handled the same way.
 */
const KEY = 'u-ahi-sync-queue'
type Queue = Record<string, number> // "tbl\tkeyJSON" -> time queued

function read(): Queue {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Queue
  } catch {
    return {}
  }
}
function write(q: Queue) {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    // storage full/blocked: a full upload from the cloud screen re-sends everything
  }
}

export function enqueue(tbl: string, key: unknown) {
  const q = read()
  q[`${tbl}\t${JSON.stringify(key)}`] = Date.now()
  write(q)
}

export function queueSnapshot(): { tbl: string; key: unknown; k: string; at: number }[] {
  return Object.entries(read()).map(([k, at]) => {
    const [tbl, json] = k.split('\t')
    return { tbl, key: JSON.parse(json), k, at }
  })
}

/** Remove what was pushed, unless it changed again meanwhile. */
export function queueAck(done: { k: string; at: number }[]) {
  const q = read()
  for (const d of done) if (q[d.k] === d.at) delete q[d.k]
  write(q)
}

export const queueSize = () => Object.keys(read()).length

// While applying rows downloaded from the cloud, don't queue them again and don't block viewers.
let applying = false
export async function whileApplying<T>(fn: () => Promise<T>): Promise<T> {
  applying = true
  try {
    return await fn()
  } finally {
    applying = false
  }
}

let role: '' | 'primary' | 'viewer' = ''
export const setDeviceRole = (r: typeof role) => {
  role = r
}

let installed = false
/** Hook every synced table once at app start. */
export function installSyncHooks() {
  if (installed) return
  installed = true
  for (const tbl of SYNCED) {
    const table = db.table(tbl)
    const guard = () => {
      // A viewer (laptop) only mirrors the shop tablet: local changes would never reach the cloud.
      if (role === 'viewer' && !VIEWER_WRITABLE.has(tbl)) throw new Error('This device only views data (cloud viewer). Make changes on the shop tablet.')
    }
    const after = (trans: Transaction, key: unknown) => {
      if (isShared(tbl, key)) trans.on('complete', () => enqueue(tbl, key))
    }
    table.hook('creating', function (key, _obj, trans) {
      if (applying) return
      guard()
      if (key !== undefined) after(trans, key)
      else this.onsuccess = (k) => after(trans, k)
    })
    table.hook('updating', function (_mods, key, _obj, trans) {
      if (applying) return
      guard()
      after(trans, key)
    })
    table.hook('deleting', function (key, _obj, trans) {
      if (applying) return
      guard()
      after(trans, key)
    })
  }
}
