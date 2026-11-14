import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { addUnit, type EnteredLength, formatEntered, formatInches, formatLargestFirst } from '../../core/length'
import { formatKs } from '../../core/money'
import { type Product, db } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { LengthBuilder } from '../../ui/LengthBuilder'
import { priceText } from '../../ui/format'
import { Btn, toInt } from '../../ui/kit'
import { Photo } from '../../ui/photo'
import { useScanner } from '../../ui/useScanner'
import { lengthPrice } from './lines'

/** One big screen: quick cuts, + unit buttons, live price. Warns (doesn't block) if longer than the roll. */
export function LengthEntry({ product: p, settings, initial = [], onOk, onCancel }: { product: Product; settings: Settings; initial?: EnteredLength; onOk: (e: EnteredLength) => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const [entered, setEntered] = useState<EnteredLength>(initial)
  const [inches, setInches] = useState('')
  useScanner(null) // a stray scan must not add another item while cutting

  const rollLeft = useLiveQuery(async () => {
    const rolls = await db.rolls.where('productId').equals(p.id!).filter((r) => r.status !== 'finished').toArray()
    return rolls.length ? rolls.reduce((s, r) => s + r.remainingTenths, 0) : null
  }, [p.id])
  const { lengthTenths, totalKs } = lengthPrice(p, entered, settings)
  const tooLong = rollLeft != null && lengthTenths > rollLeft

  function addInches() {
    // "12" or "12.5": whole inches plus an optional half inch, kept as the seller typed it.
    const m = /^(\d*)(\.5)?$/.exec(inches.trim().replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040)))
    if (!m || inches.trim() === '') return
    let e = entered
    const whole = toInt(m[1] || '0') ?? 0
    if (whole) e = addUnit(e, 'inch', whole)
    if (m[2]) e = addUnit(e, 'halfinch', 1)
    setEntered(e)
    setInches('')
  }

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
        <div className="flex items-center gap-4">
          <Photo blob={p.photo} className="h-24 w-24 shrink-0 rounded-2xl" />
          <div className="flex-1">
            <h2 className="text-3xl font-bold">{p.nameMy}</h2>
            <p className="text-xl text-slate-700">
              {priceText(t, p, settings.units, lang)}
              {p.widthTenths ? ` · ${t('product.width')} ${formatInches(p.widthTenths)}"` : ''}
            </p>
            {rollLeft != null && (
              <p className="text-xl">
                {t('sell.rollLeft')}: <b>{formatLargestFirst(rollLeft, settings.units, lang)}</b>{' '}
                <span className="text-base text-slate-600">({formatInches(rollLeft)}")</span>
              </p>
            )}
          </div>
        </div>

        {(p.quickCuts?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.quickCuts!.map((c, i) => (
              <Btn key={i} variant="plain" className="min-w-36 text-2xl" onClick={() => setEntered(c)}>
                {formatEntered(c, settings.units, lang)}
              </Btn>
            ))}
          </div>
        )}

        <LengthBuilder value={entered} onChange={setEntered} units={settings.units} />

        <div className="flex gap-2">
          <input
            className="w-48 rounded-xl border-2 border-slate-300 px-4 text-xl"
            inputMode="decimal"
            placeholder={t('sell.inchesKeypad')}
            value={inches}
            onChange={(e) => setInches(e.target.value)}
          />
          <Btn variant="plain" onClick={addInches}>
            + {t('unit.inches')}
          </Btn>
          <Btn variant="plain" className="ml-auto" disabled={!entered.length} onClick={() => setEntered([])}>
            {t('sell.clearLength')}
          </Btn>
        </div>

        {tooLong && <p className="rounded-xl bg-amber-100 p-3 text-xl font-bold text-amber-900">⚠ {t('sell.longerThanRoll')}</p>}

        {/* Price and OK/Cancel stay on screen without scrolling. */}
        <div className="sticky bottom-0 -mx-4 grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t-2 border-slate-200 bg-white p-4">
          <div className="text-6xl font-bold text-blue-900" data-testid="length-price">
            {formatKs(totalKs)} <span className="text-3xl">{t('common.ks')}</span>
          </div>
          <Btn variant="plain" className="min-h-20 px-8 text-3xl" onClick={onCancel}>
            {t('common.cancel')}
          </Btn>
          <Btn variant="ok" className="min-h-20 px-10 text-3xl" disabled={!entered.length} onClick={() => onOk(entered)}>
            {t('common.ok')}
          </Btn>
        </div>
      </div>
    </div>
  )
}
