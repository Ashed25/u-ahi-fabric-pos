import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatInches } from '../core/length'
import { audit } from '../db/audit'
import { setSetting } from '../db/settings'
import { useSettings } from '../db/useSettings'
import { Btn, Screen, inputCls } from '../ui/kit'

export function Units() {
  const { t } = useTranslation()
  const settings = useSettings()
  const [rows, setRows] = useState<{ code: string; nameMy: string; nameEn: string; inches: string; pricing: boolean }[]>()
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    if (settings && !rows) setRows(settings.units.map((u) => ({ ...u, inches: formatInches(u.tenths) })))
  }, [settings, rows])
  if (!settings || !rows) return null

  const edit = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function save() {
    if (rows!.some((r) => !r.nameMy.trim() || !/^\d+(\.\d)?$/.test(r.inches.trim()) || Number(r.inches) <= 0)) {
      return setMsg({ ok: false, text: t('units.invalid') })
    }
    const units = rows!.map(({ inches, ...r }) => ({ ...r, nameMy: r.nameMy.trim(), nameEn: r.nameEn.trim(), tenths: Math.round(Number(inches) * 10) }))
    await audit('settings.units', 'settings:units', settings!.units, units)
    await setSetting('units', units)
    setMsg({ ok: true, text: t('common.saved') })
  }

  return (
    <Screen title={t('units.title')}>
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-slate-700">{t('units.hint')}</p>
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th>{t('units.nameMy')}</th>
              <th>{t('units.nameEn')}</th>
              <th>{t('units.inches')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.code}>
                <td className="p-1">
                  <input className={inputCls} value={r.nameMy} onChange={(e) => edit(i, { nameMy: e.target.value })} />
                </td>
                <td className="p-1">
                  <input className={inputCls} value={r.nameEn} onChange={(e) => edit(i, { nameEn: e.target.value })} />
                </td>
                <td className="p-1">
                  <input className={inputCls} inputMode="decimal" value={r.inches} onChange={(e) => edit(i, { inches: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg && <p className={`mt-4 rounded-xl p-3 text-xl font-bold ${msg.ok ? 'bg-green-100' : 'bg-red-100'}`}>{msg.text}</p>}
        <Btn variant="ok" className="mt-4 w-full" onClick={save}>
          {t('common.save')}
        </Btn>
      </div>
    </Screen>
  )
}
