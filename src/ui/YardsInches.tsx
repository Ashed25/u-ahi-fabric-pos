import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatInches, formatLargestFirst } from '../core/length'
import type { Unit } from '../core/units'
import { inputCls, toInt } from './kit'

const YARD = 360

/** "50 ကိုက် + 12.5 လက်မ" -> tenths; undefined while invalid. For measuring rolls, not for selling. */
export function parseYardsInches(yards: string, inches: string): number | undefined {
  const y = yards.trim() === '' ? 0 : toInt(yards)
  const i = inches.trim().replace(/[၀-၉]/g, (d) => String(d.charCodeAt(0) - 0x1040))
  const iOk = i === '' || /^\d+(\.\d)?$/.test(i)
  if (y === undefined || !iOk) return undefined
  return y * YARD + (i ? Math.round(Number(i) * 10) : 0)
}

export function YardsInches({ units, initialTenths, onChange }: { units: Unit[]; initialTenths?: number; onChange: (tenths: number | undefined) => void }) {
  const { t, i18n } = useTranslation()
  const [yards, setYards] = useState(initialTenths != null ? String(Math.floor(initialTenths / YARD)) : '')
  const [inches, setInches] = useState(initialTenths != null && initialTenths % YARD ? formatInches(initialTenths % YARD) : '')
  const tenths = parseYardsInches(yards, inches)
  const update = (y: string, i: string) => {
    setYards(y)
    setInches(i)
    onChange(parseYardsInches(y, i))
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="block font-bold">{units.find((u) => u.code === 'gaik')?.nameMy ?? 'yd'}</span>
          <input className={inputCls} inputMode="numeric" value={yards} onChange={(e) => update(e.target.value, inches)} />
        </label>
        <label>
          <span className="block font-bold">+ {t('unit.inches')}</span>
          <input className={inputCls} inputMode="decimal" value={inches} onChange={(e) => update(yards, e.target.value)} />
        </label>
      </div>
      <p className="mt-2 text-xl">
        = <b>{tenths != null ? formatLargestFirst(tenths, units, i18n.language === 'en' ? 'en' : 'my') : '?'}</b>{' '}
        <span className="text-base text-slate-600">({tenths != null ? formatInches(tenths) : '?'}")</span>
      </p>
    </div>
  )
}
