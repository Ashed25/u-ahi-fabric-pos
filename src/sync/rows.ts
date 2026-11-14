import { db } from '../db/schema'
import { SHARED_SETTINGS } from '../db/settings'

/** Tables copied to the cloud. Held sales (parked) and the old outbox stay on the device. */
export const SYNCED = [
  'settings', 'users', 'categories', 'products', 'variants', 'barcodes', 'rolls', 'stockMoves',
  'sales', 'saleLines', 'payments', 'creditNotes', 'creditLines', 'audit',
] as const
export type SyncedTable = (typeof SYNCED)[number]

/** On a viewer device these may still be written locally (preferences, its own audit of exports). */
export const VIEWER_WRITABLE = new Set<string>(['settings', 'audit'])

export const isShared = (tbl: string, key: unknown) => tbl !== 'settings' || SHARED_SETTINGS.includes(key as never)

/** Cloud ids are strings; auto-increment tables use numbers locally. */
export const toId = (key: unknown) => String(key)
export function fromId(tbl: string, id: string): string | number {
  return db.table(tbl).schema.primKey.auto ? Number(id) : id
}

export interface CloudRow {
  tbl: string
  id: string
  data: unknown
  deleted: boolean
}

// Photos are Blobs: stored in the cloud as { __blob: type, b64 }.
type BlobJson = { __blob: string; b64: string }

async function blobToJson(b: Blob): Promise<BlobJson> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { __blob: b.type, b64: btoa(bin) }
}

function jsonToBlob(j: BlobJson): Blob {
  const bin = atob(j.b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: j.__blob })
}

const isBlobJson = (v: unknown): v is BlobJson => !!v && typeof v === 'object' && '__blob' in v && 'b64' in v

export async function toCloud(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Blob ? await blobToJson(v) : v
  return out
}

export function fromCloud(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) out[k] = isBlobJson(v) ? jsonToBlob(v) : v
  return out
}
