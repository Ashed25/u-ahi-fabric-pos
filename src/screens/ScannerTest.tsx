import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidEan13, looksLikeMisread } from '../core/barcode'
import { digitOf } from '../core/scanner'
import { findByBarcode } from '../db/products'
import { CameraScan, cameraScanSupported } from '../ui/CameraScan'
import { Btn, Screen, inputCls } from '../ui/kit'
import { beepError, beepOk } from '../ui/sound'
import { useScanner } from '../ui/useScanner'

interface Raw {
  code: string
  key: string
  gap: number
}

/** Shows exactly what the scanner sends, so keyboard-layout problems are easy to spot. */
export function ScannerTest() {
  const { t } = useTranslation()
  const [raw, setRaw] = useState<Raw[]>([])
  const [result, setResult] = useState<{ code: string; text: string; ok: boolean }>()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    let last = 0
    const onKey = (e: KeyboardEvent) => {
      const gap = last ? Math.round(e.timeStamp - last) : 0
      last = e.timeStamp
      setRaw((r) => [{ code: e.code, key: e.key, gap }, ...r].slice(0, 40))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const [camera, setCamera] = useState(false)
  useScanner(check)

  async function check(code: string) {
    setCamera(false)
    const found = await findByBarcode(code)
    const ok = !!found
    ;(ok ? beepOk : beepError)()
    const text = found
      ? t('scanner.found', { name: found.product.nameMy })
      : looksLikeMisread(code)
        ? t('scanner.misread')
        : t('scanner.notFound')
    setResult({ code, text, ok })
  }

  return (
    <Screen title={t('scanner.title')}>
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-xl">{t('scanner.hint')}</p>
        <div className={`mb-4 rounded-2xl p-6 text-center ${result ? (result.ok ? 'bg-green-100' : 'bg-red-100') : 'bg-slate-100'}`}>
          {result ? (
            <>
              <div className="font-mono text-4xl font-bold">{result.code}</div>
              <div className="text-base text-slate-600">
                {result.code.length} {t('scanner.digits')}
                {isValidEan13(result.code) && ' · EAN-13 ✓'}
              </div>
              <div className="mt-2 text-2xl font-bold">{result.text}</div>
            </>
          ) : (
            <div className="text-2xl">{t('scanner.waiting')}</div>
          )}
        </div>
        {/* No scanner at hand: read with the camera, or type the digits. */}
        <div className="mb-4 flex flex-wrap gap-2">
          {cameraScanSupported() && (
            <Btn variant="plain" onClick={() => setCamera(true)}>
              📷 {t('camera.button')}
            </Btn>
          )}
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const v = typed.trim()
              if (/^\d{4,}$/.test(v)) check(v)
              setTyped('')
            }}
          >
            <input className={inputCls} inputMode="numeric" placeholder={t('barcode.typeIt')} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <Btn type="submit">{t('grid.useCode')}</Btn>
          </form>
        </div>
        {camera && <CameraScan onCode={check} onClose={() => setCamera(false)} />}
        <h2 className="mb-2 font-bold">{t('scanner.rawKeys')}</h2>
        <table className="w-full font-mono text-base">
          <thead>
            <tr className="text-left">
              <th>code</th>
              <th>key</th>
              <th>{t('scanner.digit')}</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {raw.map((r, i) => (
              <tr key={i} className={r.gap > 60 ? 'text-slate-400' : ''}>
                <td>{r.code}</td>
                <td>{r.key}</td>
                <td>{digitOf({ ...r, timeStamp: 0 }) ?? '–'}</td>
                <td>{r.gap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Screen>
  )
}
