import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assignBarcode } from '../db/products'
import { Btn, Modal, inputCls } from './kit'
import { beepError, beepOk } from './sound'
import { useScanner } from './useScanner'

/** Scan (or type) an existing barcode to link it to a product/variant. Warns if it is already used. */
export function ScanAssign({ productId, variantId, onClose }: { productId: number; variantId?: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  async function assign(raw: string) {
    const code = raw.trim()
    if (!/^\d{4,}$/.test(code)) {
      beepError()
      return setMsg({ ok: false, text: t('barcode.digitsOnly') })
    }
    const r = await assignBarcode(code, productId, variantId)
    if (r.ok) {
      beepOk()
      setTyped('')
      setMsg({ ok: true, text: t('barcode.assigned', { code }) })
    } else {
      beepError()
      setMsg({ ok: false, text: t('barcode.taken', { code, name: r.productName ?? '?' }) })
    }
  }

  useScanner(assign)

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-2 text-2xl font-bold">{t('barcode.scanTitle')}</h2>
      <p className="mb-4 text-xl">{t('barcode.scanNow')}</p>
      {msg && (
        <p className={`mb-4 rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>{msg.text}</p>
      )}
      <div className="flex gap-2">
        <input className={inputCls} inputMode="numeric" placeholder={t('barcode.typeIt')} value={typed} onChange={(e) => setTyped(e.target.value)} />
        <Btn onClick={() => assign(typed)}>{t('common.add')}</Btn>
      </div>
      <Btn variant="plain" className="mt-4 w-full" onClick={onClose}>
        {t('common.done')}
      </Btn>
    </Modal>
  )
}
