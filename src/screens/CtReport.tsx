import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { fyBounds, fyOf, quarterBounds } from '../core/fy'
import { formatKs } from '../core/money'
import { fyName } from '../core/period'
import { buildReport } from '../core/reports'
import { loadReportInput } from '../db/reports'
import { useSettings } from '../db/useSettings'
import { Btn, DateNav, Screen } from '../ui/kit'
import { exportCt } from '../ui/xlsx'
import { CtWarning } from './Reports'

/** Commercial Tax report per FY quarter (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar) with the sale-level schedule. */
export function CtReport() {
  const { t } = useTranslation()
  const settings = useSettings()
  const [fy, setFy] = useState(() => fyOf(Date.now()))
  const data = useLiveQuery(async () => {
    const [from, to] = fyBounds(fy)
    const input = await loadReportInput(from, to)
    const quarters = await Promise.all(
      ([1, 2, 3, 4] as const).map(async (q) => {
        const [qf, qt] = quarterBounds(fy, q)
        return { label: `Q${q}`, r: buildReport(await loadReportInput(qf, qt)) }
      }),
    )
    return { input, year: buildReport(input), quarters }
  }, [fy])
  if (!settings || !data) return null
  const rows = [...data.quarters, { label: t('ct.year'), r: data.year }]

  return (
    <Screen title={t('ct.title')} back="#/reports">
      <div className="mx-auto max-w-5xl space-y-4">
        <CtWarning always />
        <p className="text-lg text-slate-700">{settings.ct.registered ? t('ct.registered', { rate: settings.ct.rateBp / 100 }) : t('ct.notRegistered')}</p>
        <DateNav
          label={`FY ${fyName(fy)}`}
          value={Math.min(fyBounds(fy)[0], Date.now())}
          onPick={(ms) => setFy(fyOf(ms))}
          onPrev={() => setFy(fy - 1)}
          onNext={() => setFy(fy + 1)}
          nextDisabled={fy >= fyOf(Date.now())}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xl">
            <thead>
              <tr className="text-base text-slate-600">
                <th className="text-left">{t('ct.quarter')}</th>
                <th>{t('ct.salesExCt')}</th>
                <th>{t('ct.collected')}</th>
                <th>{t('ct.returnsExCt')}</th>
                <th>{t('ct.returnsCt')}</th>
                <th>{t('ct.netCt')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ label, r }) => (
                <tr key={label} className="border-t-2 border-slate-200 last:font-bold">
                  <td className="py-2 text-left">{label}</td>
                  <td>{formatKs(r.grossKs - r.ctKs)}</td>
                  <td>{formatKs(r.ctKs)}</td>
                  <td>{formatKs(r.refundsKs - r.refundsCtKs)}</td>
                  <td>{formatKs(r.refundsCtKs)}</td>
                  <td>{formatKs(r.ctKs - r.refundsCtKs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-base text-slate-600">{t('ct.quartersHint')}</p>
        <Btn className="min-h-18 w-full" onClick={() => exportCt(`FY ${fyName(fy)}`, rows, data.input)}>
          ⬇ {t('ct.export')}
        </Btn>
      </div>
    </Screen>
  )
}
