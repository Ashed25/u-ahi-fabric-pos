import { exportDB, importInto, peakImportFile } from 'dexie-export-import'
import { dateKey } from '../core/fy'
import { audit } from './audit'
import { db } from './schema'
import { requireRole } from './users'
import { download } from '../ui/download'

/** Full backup incl. photos. Also how the laptop gets a copy of the data for label printing. */
export async function exportBackup(): Promise<{ blob: Blob; filename: string }> {
  await audit('export.backup', 'all')
  const blob = await exportDB(db)
  return { blob, filename: `u-ahi-backup-${dateKey(Date.now())}.json` }
}

export async function backupInfo(file: Blob) {
  const meta = await peakImportFile(file)
  if (meta.data.databaseName !== db.name) throw new Error('Not a backup of this app')
  const count = (t: string) => meta.data.tables.find((x) => x.name === t)?.rowCount ?? 0
  return { products: count('products'), sales: count('sales') }
}

/** Replaces ALL data on this device. Downloads a safety copy of the current data first. */
export async function restoreBackup(file: Blob) {
  await requireRole('owner')
  await backupInfo(file) // validates the file before touching anything
  const safety = await exportBackup()
  download(safety.blob, safety.filename.replace('backup', 'before-restore'))
  await importInto(db, file, { clearTablesBeforeImport: true, acceptVersionDiff: true })
}
