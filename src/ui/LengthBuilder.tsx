import { useTranslation } from 'react-i18next'
import { addUnit, type EnteredLength, formatEntered, formatInches, toTenths } from '../core/length'
import type { Unit } from '../core/units'

/** Tap "+ ကိုက်" twice, "+ တောင်" once -> 2 ကိုက် 1 တောင်. Order and units stay exactly as tapped. */
export function LengthBuilder({ value, onChange, units }: { value: EnteredLength; onChange: (v: EnteredLength) => void; units: Unit[] }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'my'
  const count = (code: string) => value.find((e) => e.unit === code)?.count ?? 0
  return (
    <div>
      <div className="mb-3 rounded-2xl bg-slate-100 p-3 text-center">
        <div className="min-h-12 text-4xl font-bold">{value.length ? formatEntered(value, units, lang) : '—'}</div>
        <div className="text-lg text-slate-600">
          {formatInches(toTenths(value, units))} {t('unit.inches')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {units.map((u) => (
          <div key={u.code} className="flex items-stretch gap-2">
            <button
              aria-label={`− ${u.nameMy}`}
              className="w-16 rounded-2xl border-2 border-slate-300 bg-white text-3xl font-bold disabled:opacity-30"
              disabled={count(u.code) === 0}
              onClick={() => onChange(addUnit(value, u.code, -1))}
            >
              −
            </button>
            <button
              className="flex-1 rounded-2xl bg-blue-800 px-2 text-2xl font-bold text-white active:bg-blue-950"
              onClick={() => onChange(addUnit(value, u.code, 1))}
            >
              + {lang === 'my' ? u.nameMy : u.nameEn}
              {count(u.code) > 0 && <span className="ml-2 rounded-full bg-white px-2 text-blue-900">{count(u.code)}</span>}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
