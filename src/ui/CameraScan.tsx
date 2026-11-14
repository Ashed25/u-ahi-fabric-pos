import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Btn } from './kit'

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (o: { formats: string[] }) => Detector
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

/**
 * Chrome on Android has a built-in barcode reader. Elsewhere (iPhone, laptop webcam) load the
 * ZXing reader on demand; its .wasm is bundled with the app so it also works offline.
 */
async function makeDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (native) return new native({ formats: FORMATS })
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  return new BarcodeDetector({ formats: FORMATS as never })
}

export const cameraScanSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

/** Backup scanner: reads a barcode with the device camera (back camera on phones/tablets). */
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
      const detector = await makeDetector()
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (done || !video.current) return stream.getTracks().forEach((tr) => tr.stop()) // closed while starting
      video.current.srcObject = stream
      await video.current.play()
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
