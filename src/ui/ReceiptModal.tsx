import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { download } from '../db/backup'
import { saleDetail } from '../db/sales'
import type { Settings } from '../db/settings'
import { Btn, Modal } from './kit'
import { receiptImage, receiptRows } from './receipt'

/** On-screen receipt with Share (Viber/Messenger) — only when the digital receipt setting is on. */
export function ReceiptModal({ saleId, settings, copy, onClose }: { saleId: string; settings: Settings; copy: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [img, setImg] = useState<{ blob: Blob; url: string }>()
  const [error, setError] = useState('')

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

  async function share() {
    if (!img) return
    const file = new File([img.blob], `receipt-${saleId}.png`, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else download(img.blob, file.name)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String(e))
    }
  }

  return (
    <Modal onClose={onClose}>
      {error && <p className="text-red-800">{error}</p>}
      {img ? <img src={img.url} alt={t('receipt.title')} className="mx-auto max-h-[60dvh] border border-slate-300" /> : <p>{t('app.loading')}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Btn variant="plain" onClick={onClose}>
          {t('common.close')}
        </Btn>
        <Btn disabled={!img} onClick={share}>
          {t('receipt.share')}
        </Btn>
      </div>
    </Modal>
  )
}
