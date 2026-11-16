import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { download } from '../db/backup'
import { saleDetail } from '../db/sales'
import type { Settings } from '../db/settings'
import { Btn, Modal } from './kit'
import { receiptImage, receiptRows } from './receipt'

/** On-screen receipt: Print for the customer, Save a copy to this device, Share (Viber/Messenger / printer app). */
export function ReceiptModal({ saleId, settings, copy, onClose }: { saleId: string; settings: Settings; copy: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [img, setImg] = useState<{ blob: Blob; url: string }>()
  const [error, setError] = useState('')
  const [noDialog, setNoDialog] = useState(false)

  useEffect(() => {
    let url = ''
    ;(async () => {
      const d = await saleDetail(saleId)
      if (!d) return setError('?')
      const blob = await receiptImage(receiptRows(t, i18n.language, settings, d, copy))
      url = URL.createObjectURL(blob)
      setImg({ blob, url })
    })().catch((e) => setError(String(e)))
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [saleId, settings, copy, t, i18n.language])

  const fileName = `receipt-${saleId}.png`

  // Same trick as label printing: installed phone/tablet apps silently ignore window.print().
  function print() {
    setNoDialog(false)
    let opened = false
    const seen = () => (opened = true)
    window.addEventListener('beforeprint', seen, { once: true })
    window.print()
    setTimeout(() => {
      window.removeEventListener('beforeprint', seen)
      if (!opened) setNoDialog(true)
    }, 1500)
  }

  async function share() {
    if (!img) return
    const file = new File([img.blob], fileName, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else download(img.blob, fileName)
    } catch (e) {
      if ((e as Error).name === 'NotAllowedError') download(img.blob, fileName)
      else if ((e as Error).name !== 'AbortError') setError(String(e))
    }
  }

  return (
    <Modal onClose={onClose}>
      {error && <p className="text-red-800">{error}</p>}
      {img ? <img src={img.url} alt={t('receipt.title')} className="mx-auto max-h-[60dvh] border border-slate-300" /> : <p>{t('app.loading')}</p>}
      {noDialog && (
        <p className="mt-3 rounded-lg bg-amber-100 p-3 text-amber-900" role="alert">
          {t('receipt.noPrint')}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Btn variant="ok" disabled={!img} onClick={print}>
          🖨 {t('receipt.print')}
        </Btn>
        <Btn variant="plain" disabled={!img} onClick={() => img && download(img.blob, fileName)}>
          💾 {t('receipt.save')}
        </Btn>
        <Btn variant="plain" disabled={!img} onClick={share}>
          📤 {t('receipt.share')}
        </Btn>
        <Btn variant="plain" onClick={onClose}>
          {t('common.close')}
        </Btn>
      </div>
      {img && createPortal(<img src={img.url} alt="" className="receipt-print" />, document.body)}
    </Modal>
  )
}
