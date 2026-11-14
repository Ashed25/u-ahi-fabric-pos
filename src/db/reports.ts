import { buildReport, type ReportInput } from '../core/reports'
import { db } from './schema'

const inRange = (from: number, to: number) => (at?: number) => at != null && at >= from && at < to

export async function loadReportInput(from: number, to: number): Promise<ReportInput> {
  const sales = await db.sales.where('at').between(from, to, true, false).toArray()
  const ids = sales.map((s) => s.id)
  const credits = await db.creditNotes.where('at').between(from, to, true, false).toArray()
  const creditLines = await db.creditLines.where('creditId').anyOf(credits.map((c) => c.id)).toArray()
  const isIn = inRange(from, to)
  const [lines, salePays, payouts, creditSales, creditSaleLines, products] = await Promise.all([
    db.saleLines.where('saleId').anyOf(ids).toArray(),
    db.payments.where('saleId').anyOf(ids).toArray(),
    db.payments.filter((p) => p.amountKs < 0 && isIn(p.at)).toArray(),
    db.sales.bulkGet([...new Set(credits.map((c) => c.saleId))]),
    db.saleLines.where('id').anyOf(creditLines.map((c) => c.saleLineId)).toArray(),
    db.products.toArray(),
  ])
  return { sales, lines, payments: [...salePays, ...payouts], credits, creditLines, creditSales: creditSales.filter((s) => !!s), creditSaleLines, products }
}

export async function loadReport(from: number, to: number) {
  const input = await loadReportInput(from, to)
  return { input, report: buildReport(input) }
}

/** Sales over the last 365 days, net of returns: what counts for the CT registration threshold. */
export async function rolling12mNetKs(now = Date.now()): Promise<number> {
  const from = now - 365 * 86_400_000
  const sales = await db.sales.where('at').between(from, now, true, true).filter((s) => s.status === 'completed').toArray()
  const credits = await db.creditNotes.where('at').between(from, now, true, true).toArray()
  return sales.reduce((s, x) => s + x.totalKs, 0) - credits.reduce((s, c) => s + c.totalKs, 0)
}
