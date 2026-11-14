import { db } from './schema'

/** Append-only audit trail. userId is filled in once users/roles land (phase f). */
export function audit(action: string, entity: string, before?: unknown, after?: unknown, userId?: number) {
  return db.audit.add({ at: Date.now(), userId, action, entity, before: strip(before), after: strip(after) })
}

// Photos are Blobs; keep them out of the log.
function strip(v: unknown) {
  if (v && typeof v === 'object' && 'photo' in v) {
    const { photo: _photo, ...rest } = v as Record<string, unknown>
    return rest
  }
  return v
}
