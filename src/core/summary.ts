import type { CreditNote, Payment, Sale, SaleLine } from '../db/schema'

export interface DaySummary {
  count: number // completed sales
  totalKs: number // sales total
  byMethod: Record<string, number> // money taken per method (exchange credit excluded: it is not new money)
  refundsKs: number // value of goods returned (credit notes)
  paidOutByMethod: Record<string, number> // money given back per method (refunds, unused exchange credit)
  netKs: number // money taken − money given back
  cashNetKs: number // what the cash drawer should have gained
  debtKs: number // left unpaid on this day's sales
  debtPaidKs: number // received this day against earlier debts (already inside byMethod)
  pieces: number
  /** Every product sold that day, biggest money first (line totals, before any whole-sale discount). */
  items: { productId: number; nameMy: string; kind: 'piece' | 'length'; qty: number; tenths: number; totalKs: number }[]
}

/**
 * One day's figures. `payments` holds the sales' payments plus any payouts made that day
 * (payout rows have saleId = credit note id and a negative amount) and debt payments made that day (positive, with `at`).
 */
export function summarize(sales: Sale[], lines: SaleLine[], payments: Payment[], credits: CreditNote[]): DaySummary {
  const done = sales.filter((s) => s.status === 'completed')
  const ids = new Set(done.map((s) => s.id))
  const m = moneyIn(done, payments)
  const byMethod = m.byMethod
  const paidOutByMethod = m.paidOutByMethod
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  const items = new Map<number, DaySummary['items'][number]>()
  let pieces = 0
  for (const l of lines.filter((l) => ids.has(l.saleId))) {
    if (l.kind === 'piece') pieces += l.qty ?? 0
    const x = items.get(l.productId) ?? { productId: l.productId, nameMy: l.nameMy, kind: l.kind, qty: 0, tenths: 0, totalKs: 0 }
    x.qty += l.qty ?? 0
    x.tenths += l.lengthTenths ?? 0
    x.totalKs += l.lineTotalKs
    items.set(l.productId, x)
  }
  return {
    count: done.length,
    totalKs: done.reduce((s, x) => s + x.totalKs, 0),
    byMethod,
    refundsKs: credits.reduce((s, c) => s + c.totalKs, 0),
    paidOutByMethod,
    netKs: sum(byMethod) - sum(paidOutByMethod),
    cashNetKs: (byMethod.cash ?? 0) - (paidOutByMethod.cash ?? 0),
    debtKs: m.debtKs,
    debtPaidKs: m.debtPaidKs,
    pieces,
    items: [...items.values()].sort((a, b) => b.totalKs - a.totalKs),
  }
}

/**
 * Money per method for a period. Sale payments (no `at`) count with their sale; payments with `at`
 * count when they happened: payouts (negative) and later debt payments (positive). Exchange credit is not new money.
 */
export function moneyIn(done: Sale[], payments: Payment[]) {
  const ids = new Set(done.map((s) => s.id))
  const byMethod: Record<string, number> = {}
  const paidOutByMethod: Record<string, number> = {}
  const paidAtSale = new Map<string, number>()
  let debtPaidKs = 0
  for (const p of payments) {
    if (p.at == null) paidAtSale.set(p.saleId, (paidAtSale.get(p.saleId) ?? 0) + p.amountKs)
    if (p.amountKs < 0) paidOutByMethod[p.method] = (paidOutByMethod[p.method] ?? 0) - p.amountKs
    else if (p.method !== 'credit' && (p.at != null || ids.has(p.saleId))) {
      byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountKs
      if (p.at != null) debtPaidKs += p.amountKs
    }
  }
  const debtKs = done.filter((s) => s.debtor).reduce((t, s) => t + s.totalKs - (paidAtSale.get(s.id) ?? 0), 0)
  return { byMethod, paidOutByMethod, debtKs, debtPaidKs }
}

/** +12% / −5% change vs. another day; undefined when there is nothing to compare with. */
export const changePct = (now: number, before: number) => (before ? Math.round(((now - before) * 100) / before) : undefined)
