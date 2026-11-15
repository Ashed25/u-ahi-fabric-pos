import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { addUnit, breakdown, type EnteredLength, formatEntered, formatInches, formatLargestFirst } from '../../core/length'
import { formatKs } from '../../core/money'
import { defaultRoll, sellableRolls } from '../../core/stock'
import { type Product, type Roll, db } from '../../db/schema'
import type { Settings } from '../../db/settings'
import { LengthBuilder } from '../../ui/LengthBuilder'
import { priceText } from '../../ui/format'
import { Btn, toInt } from '../../ui/kit'
import { Photo } from '../../ui/photo'
import { useScanner } from '../../ui/useScanner'
import { lengthPrice } from './lines'

/** One big screen: quick cuts, + unit buttons, live price. Warns (doesn't block) if longer than the roll. */
export function LengthEntry({
  product: p,
  settings,
  initial = [],
  initialRollId,
  onOk,
  onCancel,
}: {
  product: Product
  settings: Settings
  initial?: EnteredLength
  initialRollId?: number
  onOk: (e: EnteredLength, roll: Roll | undefined, whole: boolean) => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const [entered, setEnteredRaw] = useState<EnteredLength>(initial)
  const [whole, setWhole] = useState(false)
  const [inches, setInches] = useState('')
  const [rollId, setRollId] = useState<number | undefined>(initialRollId)
  useScanner(null) // a stray scan must not add another item while cutting

  const rolls = useLiveQuery(async () => sellableRolls(await db.rolls.where('productId').equals(p.id!).toArray()), [p.id])
  useEffect(() => {
    if (rolls && rollId === undefined) setRollId(defaultRoll(rolls)?.id)
  }, [rolls, rollId])
  const roll = rolls?.find((r) => r.id === rollId)

  // Any manual change means it is no longer "the whole remnant".
  const setEntered = (e: EnteredLength) => {
    setEnteredRaw(e)
    setWhole(false)
  }
  const { lengthTenths, totalKs, pct } = lengthPrice(p, entered, settings, roll, whole)
  const tooLong = roll != null && lengthTenths > roll.remainingTenths
  const fmt = (tenths: number) => formatLargestFirst(tenths, settings.units, lang)

  function addInches() {
    // "12" or "12.5": whole inches plus an optional half inch, kept as the seller typed it.
    const m = /^(\d*)(\.5)?$/.exec(inches.trim().replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040)))
    if (!m || inches.trim() === '') return
    let e = entered
    const wholeInches = toInt(m[1] || '0') ?? 0
    if (wholeInches) e = addUnit(e, 'inch', wholeInches)
    if (m[2]) e = addUnit(e, 'halfinch', 1)
    setEntered(e)
    setInches('')
  }

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-4">
          <Photo blob={p.photo} className="h-16 w-16 shrink-0 rounded-xl sm:h-20 sm:w-20" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold">{p.nameMy}</h2>
            <p className="text-base text-slate-600">
              {priceText(t, p, settings.units, lang)}
              {p.widthTenths ? ` · ${t('product.width')} ${formatInches(p.widthTenths)}"` : ''}
            </p>
            {roll && rolls!.length === 1 && (
              <p className="text-base">
                {t('sell.rollLeft')}: <b>{fmt(roll.remainingTenths)}</b> <span className="text-base text-slate-600">({formatInches(roll.remainingTenths)}")</span>
              </p>
            )}
          </div>
        </div>

        {rolls && rolls.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {rolls.map((r) => (
              <Btn key={r.id} variant={r.id === rollId ? 'primary' : 'plain'} className="text-lg" onClick={() => (setRollId(r.id), setWhole(false))}>
                {r.status === 'remnant' ? `✂ ${t('stock.remnant')}` : `${t('stock.roll')} #${r.id}`}: {fmt(r.remainingTenths)}
              </Btn>
            ))}
          </div>
        )}

        {roll?.status === 'remnant' && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 text-base">
            <span>✂ {roll.remnantPct ? t('stock.remnantPct', { pct: roll.remnantPct }) : t('stock.remnantWhole', { price: formatKs(roll.remnantPriceKs ?? 0) })}</span>
            {roll.remnantPriceKs != null && (
              <Btn
                variant={whole ? 'primary' : 'plain'}
                onClick={() => {
                  setEnteredRaw(breakdown(roll.remainingTenths, settings.units))
                  setWhole(true)
                }}
              >
                {t('sell.sellWhole', { price: formatKs(roll.remnantPriceKs) })}
              </Btn>
            )}
          </div>
        )}

        {(p.quickCuts?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {p.quickCuts!.map((c, i) => (
              <Btn key={i} variant="plain" className="min-w-28 text-lg" onClick={() => setEntered(c)}>
                {formatEntered(c, settings.units, lang)}
              </Btn>
            ))}
          </div>
        )}

        <LengthBuilder value={entered} onChange={setEntered} units={settings.units} />

        <div className="flex gap-2">
          <input
            className="w-36 min-w-0 rounded-lg border border-slate-300 px-3 text-lg shadow-sm outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-200"
            inputMode="decimal"
            placeholder={t('sell.inchesKeypad')}
            value={inches}
            onChange={(e) => setInches(e.target.value)}
          />
          <Btn variant="plain" className="whitespace-nowrap px-3" onClick={addInches}>
            + {t('unit.inches')}
          </Btn>
          <Btn variant="plain" className="ml-auto whitespace-nowrap px-3" disabled={!entered.length} onClick={() => setEntered([])}>
            {t('sell.clearLength')}
          </Btn>
        </div>

        {tooLong && <p className="rounded-xl bg-amber-100 p-3 text-base font-bold text-amber-900">⚠ {t('sell.longerThanRoll')}</p>}

        {/* Price and OK/Cancel stay on screen without scrolling. */}
        <div className="sticky bottom-0 -mx-3 grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-slate-200 bg-white p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] sm:-mx-4 sm:gap-3 sm:p-4">
          <div className="min-w-0 text-3xl font-bold tabular-nums text-blue-900 sm:text-5xl" data-testid="length-price">
            {formatKs(totalKs)} <span className="text-lg sm:text-2xl">{t('common.ks')}</span>
            {pct > 0 && !whole && <span className="ml-2 text-lg text-amber-700">−{pct}%</span>}
          </div>
          <Btn variant="plain" className="min-h-14 whitespace-nowrap px-4 text-lg sm:min-h-16 sm:px-6 sm:text-2xl" onClick={onCancel}>
            {t('common.cancel')}
          </Btn>
          <Btn variant="ok" className="min-h-14 whitespace-nowrap px-6 text-xl sm:min-h-16 sm:px-8 sm:text-2xl" disabled={!entered.length} onClick={() => onOk(entered, roll, whole)}>
            {t('common.ok')}
          </Btn>
        </div>
      </div>
    </div>
  )
}
