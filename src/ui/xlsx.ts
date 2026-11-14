import { dateKey, timeText } from '../core/fy'
import { formatEntered, formatInches, formatLargestFirst } from '../core/length'
import type { Report, ReportInput } from '../core/reports'
import type { Unit } from '../core/units'
import { db } from '../db/schema'

// The Excel library is large: load it only when exporting.
const xlsx = () => import('xlsx')
type Row = Record<string, string | number | undefined>

async function save(filename: string, sheets: [string, Row[] | (string | number)[][]][]) {
  const X = await xlsx()
  const wb = X.utils.book_new()
  for (const [name, rows] of sheets) {
    const ws = Array.isArray(rows[0]) ? X.utils.aoa_to_sheet(rows as (string | number)[][]) : X.utils.json_to_sheet(rows as Row[])
    X.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  X.writeFile(wb, filename)
}

const when = (ms: number) => `${dateKey(ms)} ${timeText(ms)}`

/** Sale-by-sale schedule (also the CT sales schedule): every number in sequence, voids included. */
export function scheduleRows(input: ReportInput): Row[] {
  const sales = input.sales.map((s) => ({
    Date: when(s.at), Number: s.id, Status: s.status === 'void' ? 'VOID' : 'Sale',
    'Sales excl. CT (Ks)': s.status === 'void' ? 0 : s.totalKs - s.ctKs,
    'CT (Ks)': s.status === 'void' ? 0 : s.ctKs,
    'Total (Ks)': s.status === 'void' ? 0 : s.totalKs,
    Note: s.voidReason,
  }))
  const orig = new Map(input.creditSales.map((s) => [s.id, s]))
  const credits = input.credits.map((c) => {
    const s = orig.get(c.saleId)
    const ct = s?.totalKs ? Math.round((c.totalKs * s.ctKs) / s.totalKs) : 0
    return { Date: when(c.at), Number: c.id, Status: `Return of ${c.saleId}`, 'Sales excl. CT (Ks)': -(c.totalKs - ct), 'CT (Ks)': -ct, 'Total (Ks)': -c.totalKs, Note: c.reason }
  })
  return [...sales, ...credits].sort((a, b) => a.Date.localeCompare(b.Date))
}

export function exportReport(label: string, r: Report, input: ReportInput, units: Unit[], methodName: (c: string) => string) {
  const summary: (string | number)[][] = [
    ['Period', label],
    ['Sales (count)', r.count],
    ['Void (count)', r.voidCount],
    ['Sales incl. CT (Ks)', r.grossKs],
    ['CT collected (Ks)', r.ctKs],
    ['Returns incl. CT (Ks)', r.refundsKs],
    ['CT on returns (Ks)', r.refundsCtKs],
    ['Net sales (Ks)', r.netKs],
    ['Net sales excl. CT (Ks)', r.netExCtKs],
    ['Revenue with cost entered, excl. CT (Ks)', r.profit.revenueKs - r.profit.uncostedRevenueKs],
    ['Cost (Ks)', r.profit.costKs],
    ['Profit (Ks)', r.profit.profitKs],
    ['Revenue without cost entered (Ks)', r.profit.uncostedRevenueKs],
  ]
  const lines = input.lines.map((l) => ({
    Sale: l.saleId, Product: l.nameMy, Detail: l.sub,
    Qty: l.kind === 'piece' ? l.qty : undefined,
    Length: l.kind === 'length' ? formatEntered(l.entered ?? [], units) : undefined,
    'Length (in)': l.kind === 'length' ? Number(formatInches(l.lengthTenths ?? 0)) : undefined,
    'Unit price (Ks)': l.unitPriceKs, 'Line total (Ks)': l.lineTotalKs, 'Cost (Ks)': l.costKs,
  }))
  return save(`report-${label.replace(/[^\w-]+/g, '_')}.xlsx`, [
    ['Summary', summary],
    ['Payment methods', [...Object.entries(r.byMethod).map(([m, v]) => ({ Method: methodName(m), 'In (Ks)': v, 'Paid back (Ks)': r.paidOutByMethod[m] ?? 0 })), ...Object.entries(r.paidOutByMethod).filter(([m]) => !(m in r.byMethod)).map(([m, v]) => ({ Method: methodName(m), 'In (Ks)': 0, 'Paid back (Ks)': v }))]],
    ['Best sellers - pieces', r.pieces.map((p) => ({ Product: p.nameMy, Pieces: p.qty, 'Revenue excl. CT (Ks)': p.revenueKs }))],
    ['Best sellers - fabric', r.fabric.map((f) => ({ Product: f.nameMy, Length: formatLargestFirst(f.tenths, units), 'Length (in)': Number(formatInches(f.tenths)), 'Revenue excl. CT (Ks)': f.revenueKs }))],
    ['Sales schedule', scheduleRows(input)],
    ['Items', lines],
  ])
}

export function exportCt(fyLabel: string, quarters: { label: string; r: Report }[], input: ReportInput) {
  const rows = quarters.map(({ label, r }) => ({
    Quarter: label,
    'Sales excl. CT (Ks)': r.grossKs - r.ctKs,
    'CT collected (Ks)': r.ctKs,
    'Returns excl. CT (Ks)': r.refundsKs - r.refundsCtKs,
    'CT on returns (Ks)': r.refundsCtKs,
    'Net CT (Ks)': r.ctKs - r.refundsCtKs,
  }))
  return save(`CT-${fyLabel.replace(/\s+/g, '_')}.xlsx`, [
    ['CT by quarter', rows],
    ['Sales schedule', scheduleRows(input)],
  ])
}

/** Everything, for the accountant (photos left out). */
export async function exportAll() {
  const tables = ['sales', 'saleLines', 'payments', 'creditNotes', 'creditLines', 'products', 'variants', 'barcodes', 'rolls', 'stockMoves', 'categories', 'audit'] as const
  const sheets: [string, Row[]][] = []
  for (const name of tables) {
    const rows = (await db.table(name).toArray()) as Record<string, unknown>[]
    sheets.push([
      name,
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r)
            .filter(([k]) => k !== 'photo')
            .map(([k, v]) => [
              k,
              (k === 'at' || k.endsWith('At')) && typeof v === 'number' ? when(v) : typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as string | number),
            ]),
        ),
      ),
    ])
  }
  await save(`u-ahi-all-data-${dateKey(Date.now())}.xlsx`, sheets)
}
