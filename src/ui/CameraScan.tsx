import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Btn } from './kit'

// Chrome's built-in barcode reader (Android, ChromeOS, macOS). Not in TypeScript's DOM types yet.
interface DetectedBarcode {
  rawValue: string
}
declare class BarcodeDetector {
  constructor(o: { formats: string[] })
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}

export const cameraScanSupported = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

/** Backup scanner: reads a barcode with the tablet's back camera. */
export function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let done = false
    ;(async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (done || !video.current) return stream.getTracks().forEach((tr) => tr.stop()) // closed while starting
      video.current.srcObject = stream
      await video.current.play()
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
      timer = setInterval(async () => {
        if (done || !video.current) return
        const found = (await detector.detect(video.current).catch(() => []))[0]?.rawValue
        if (found && /^\d{4,}$/.test(found)) {
          done = true
          onCodeRef.current(found)
        }
      }, 250)
    })().catch((e) => setError(String(e)))
    return () => {
      done = true
      clearInterval(timer)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black p-4">
      <video ref={video} className="max-h-[70dvh] w-full max-w-3xl rounded-2xl object-cover" muted playsInline />
      <p className="text-2xl text-white">{error || t('camera.hint')}</p>
      <Btn variant="plain" className="min-w-60" onClick={onClose}>
        {t('common.close')}
      </Btn>
    </div>
  )
}
