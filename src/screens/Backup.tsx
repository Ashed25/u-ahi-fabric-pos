import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { backupInfo, download, exportBackup, restoreBackup } from '../db/backup'
import { Btn, Modal, Screen } from '../ui/kit'
import { setSetting } from '../db/settings'

export function Backup() {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [pending, setPending] = useState<{ file: File; products: number; sales: number }>()

  async function doExport() {
    setBusy(true)
    try {
      const { blob, filename } = await exportBackup()
      // Share sheet lets the owner send it straight to Google Drive / Viber; fall back to a download.
      const file = new File([blob], filename, { type: 'application/json' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename })
        } catch (e) {
          // Share refused (the tap "expired" while the backup was built, or .json not allowed): download instead.
          if ((e as Error).name !== 'NotAllowedError') throw e
          download(blob, filename)
        }
      } else download(blob, filename)
      await setSetting('lastBackupAt', Date.now())
      setMsg({ ok: true, text: t('backup.exported') })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg({ ok: false, text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function pick(file?: File) {
    if (!file) return
    try {
      setPending({ file, ...(await backupInfo(file)) })
    } catch (e) {
      setMsg({ ok: false, text: `${t('backup.badFile')} (${String(e)})` })
    }
  }

  async function doRestore() {
    if (!pending) return
    setBusy(true)
    try {
      await restoreBackup(pending.file)
      setMsg({ ok: true, text: t('backup.restored') })
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
    } finally {
      setPending(undefined)
      setBusy(false)
    }
  }

  return (
    <Screen title={t('backup.title')}>
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-xl">{t('backup.hint')}</p>
        <Btn className="w-full py-4" disabled={busy} onClick={doExport}>
          💾 {t('backup.export')}
        </Btn>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Btn variant="plain" className="w-full py-4" disabled={busy} onClick={() => fileRef.current?.click()}>
          {t('backup.restore')}
        </Btn>
        <p className="text-slate-600">{t('backup.laptopHint')}</p>
        {msg && <p className={`rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100' : 'bg-red-100'}`}>{msg.text}</p>}
      </div>
      {pending && (
        <Modal onClose={() => setPending(undefined)}>
          <h2 className="mb-3 text-2xl font-bold text-red-800">{t('backup.confirmTitle')}</h2>
          <p className="mb-2 text-xl">{t('backup.confirmBody', { products: pending.products, sales: pending.sales })}</p>
          <p className="mb-4 text-slate-600">{t('backup.safetyCopy')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Btn variant="plain" onClick={() => setPending(undefined)}>
              {t('common.cancel')}
            </Btn>
            <Btn variant="danger" disabled={busy} onClick={doRestore}>
              {t('backup.restoreNow')}
            </Btn>
          </div>
        </Modal>
      )}
    </Screen>
  )
}
