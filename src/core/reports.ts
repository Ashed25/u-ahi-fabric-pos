import type { CreditLine, CreditNote, Payment, Product, Sale, SaleLine } from '../db/schema'
import type { PeriodKind } from './period'
import { yangonMidnight, yangonParts } from './fy'
import { roundFraction } from './pricing'
import { moneyIn } from './summary'

/** Everything needed for one period. credit* hold the original sales/lines that returns refer to (may be older). */
export interface ReportInput {
  sales: Sale[]
  lines: SaleLine[]
  payments: Payment[] // payments made at sale time for `sales` + payments with `at` in the period (payouts, later debt payments)
  credits: CreditNote[]
  creditLines: CreditLine[]
  creditSales: Sale[]
  creditSaleLines: SaleLine[]
  products: Product[]
}

export interface Report {
  count: number
  voidCount: number
  grossKs: number // completed sales, incl. CT
  ctKs: number // CT on those sales
  refundsKs: number // returned value, incl. CT share
  refundsCtKs: number
  netKs: number // gross − refunds
  netExCtKs: number // what the shop earned before CT
  byMethod: Record<string, number> // new money in per method ('credit' excluded)
  paidOutByMethod: Record<string, number>
  debtKs: number // left unpaid on the period's sales
  debtPaidKs: number // debts paid in the period (inside byMethod)
  byStaff: Record<number, { count: number; totalKs: number }>
  pieces: { productId: number; nameMy: string; qty: number; revenueKs: number }[]
  fabric: { productId: number; nameMy: string; tenths: number; revenueKs: number }[]
  profit: { revenueKs: number; costKs: number; profitKs: number; uncostedRevenueKs: number }
}

const ratio = (amount: number, num: number, den: number) => (den ? roundFraction(amount * num, den, 1, 'nearest') : amount)
/** A line's share of the sale before CT (spreads CT and any sale discount over the lines). */
const lineExCt = (s: Sale, amount: number) => ratio(amount, s.totalKs - s.ctKs, s.subtotalKs)

function lineCost(l: SaleLine, products: Map<number, Product>): number | undefined {
  if (l.costKs != null) return l.costKs
  const c = products.get(l.productId)?.costKs // older sales: today's cost
  if (c == null) return undefined
  return l.kind === 'piece' ? c * (l.qty ?? 0) : ratio(c, l.lengthTenths ?? 0, l.unitTenths ?? 1)
}

export function buildReport(d: ReportInput): Report {
  const products = new Map(d.products.map((p) => [p.id!, p]))
  const done = d.sales.filter((s) => s.status === 'completed')
  const byId = new Map(done.map((s) => [s.id, s]))
  const r: Report = {
    count: done.length,
    voidCount: d.sales.length - done.length,
    grossKs: 0, ctKs: 0, refundsKs: 0, refundsCtKs: 0, netKs: 0, netExCtKs: 0,
    ...moneyIn(done, d.payments), byStaff: {}, pieces: [], fabric: [],
    profit: { revenueKs: 0, costKs: 0, profitKs: 0, uncostedRevenueKs: 0 },
  }
  for (const s of done) {
    r.grossKs += s.totalKs
    r.ctKs += s.ctKs
    const st = (r.byStaff[s.userId] ??= { count: 0, totalKs: 0 })
    st.count++
    st.totalKs += s.totalKs
  }


  const pieces = new Map<number, Report['pieces'][number]>()
  const fabric = new Map<number, Report['fabric'][number]>()
  for (const l of d.lines) {
    const s = byId.get(l.saleId)
    if (!s) continue
    const rev = lineExCt(s, l.lineTotalKs)
    if (l.kind === 'piece') {
      const x = pieces.get(l.productId) ?? { productId: l.productId, nameMy: l.nameMy, qty: 0, revenueKs: 0 }
      x.qty += l.qty ?? 0
      x.revenueKs += rev
      pieces.set(l.productId, x)
    } else {
      const x = fabric.get(l.productId) ?? { productId: l.productId, nameMy: l.nameMy, tenths: 0, revenueKs: 0 }
      x.tenths += l.lengthTenths ?? 0
      x.revenueKs += rev
      fabric.set(l.productId, x)
    }
    const cost = lineCost(l, products)
    r.profit.revenueKs += rev
    if (cost == null) r.profit.uncostedRevenueKs += rev
    else r.profit.costKs += cost
  }

  // Returns count in the period they happen, against the original sale's prices, CT and cost.
  const origSale = new Map(d.creditSales.map((s) => [s.id, s]))
  const origLine = new Map(d.creditSaleLines.map((l) => [l.id!, l]))
  const inPeriod = new Set(d.credits.map((c) => c.id))
  for (const c of d.credits) r.refundsKs += c.totalKs
  for (const cl of d.creditLines.filter((x) => inPeriod.has(x.creditId))) {
    const s = origSale.get(cl.saleId)
    const l = origLine.get(cl.saleLineId)
    if (!s || !l) continue
    const exCt = ratio(cl.amountKs, s.totalKs - s.ctKs, s.totalKs)
    r.refundsCtKs += cl.amountKs - exCt
    r.profit.revenueKs -= exCt
    const cost = lineCost(l, products)
    if (cost == null) r.profit.uncostedRevenueKs -= exCt
    else r.profit.costKs -= l.kind === 'piece' ? ratio(cost, cl.qty ?? 0, l.qty ?? 1) : cost
  }

  r.netKs = r.grossKs - r.refundsKs
  r.netExCtKs = r.netKs - (r.ctKs - r.refundsCtKs)
  r.profit.profitKs = r.profit.revenueKs - r.profit.uncostedRevenueKs - r.profit.costKs
  r.pieces = [...pieces.values()].sort((a, b) => b.qty - a.qty || b.revenueKs - a.revenueKs)
  r.fabric = [...fabric.values()].sort((a, b) => b.tenths - a.tenths)
  return r
}

/** CT registration check: sales over the last 12 months (net of returns) against the threshold. */
export function ctThreshold(rolling12mNetKs: number, thresholdKs: number) {
  const pct = thresholdKs ? Math.floor((rolling12mNetKs * 100) / thresholdKs) : 0
  return { pct, level: pct >= 100 ? ('over' as const) : pct >= 80 ? ('near' as const) : ('ok' as const) }
}

export interface TrendBar {
  label: string
  totalKs: number
  count: number
}

const HOUR = 3_600_000
const DAY_MS = 24 * HOUR
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Completed sales per hour (day), per day (week, month) or per month (quarter, year), Yangon time.
 * A day shows at least 8:00–20:00, widened to any hour that had a sale.
 */
export function salesTrend(sales: Sale[], kind: PeriodKind, from: number, to: number): TrendBar[] {
  const done = sales.filter((s) => s.status === 'completed' && s.at >= from && s.at < to)
  let starts: number[]
  let label: (start: number) => string
  if (kind === 'day') {
    const hours = done.map((s) => Math.floor((s.at - from) / HOUR))
    const first = Math.min(8, ...hours)
    const last = Math.max(20, ...hours)
    starts = Array.from({ length: last - first + 1 }, (_, i) => from + (first + i) * HOUR)
    label = (s) => String((s - from) / HOUR)
  } else if (kind === 'week' || kind === 'month') {
    starts = Array.from({ length: Math.round((to - from) / DAY_MS) }, (_, i) => from + i * DAY_MS) // Yangon has no DST
    label = (s) => String(yangonParts(s).day)
  } else {
    const p = yangonParts(from)
    starts = []
    for (let m = 0; yangonMidnight(p.year, p.month + m, 1) < to; m++) starts.push(yangonMidnight(p.year, p.month + m, 1))
    label = (s) => MONTHS[yangonParts(s).month - 1]
  }
  const bars = starts.map((s) => ({ label: label(s), totalKs: 0, count: 0 }))
  for (const s of done) {
    let i = starts.length - 1
    while (i > 0 && starts[i] > s.at) i--
    bars[i].totalKs += s.totalKs
    bars[i].count++
  }
  return bars
}
