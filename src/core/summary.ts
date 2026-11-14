import type { CreditNote, Payment, Sale, SaleLine } from '../db/schema'

export interface DaySummary {
  count: number // completed sales
  totalKs: number // sales total
  byMethod: Record<string, number> // money taken per method (exchange credit excluded: it is not new money)
  refundsKs: number // value of goods returned (credit notes)
  paidOutByMethod: Record<string, number> // money given back per method (refunds, unused exchange credit)
  netKs: number // money taken − money given back
  cashNetKs: number // what the cash drawer should have gained
  pieces: number
  fabric: { productId: number; nameMy: string; tenths: number }[]
}

/**
 * One day's figures. `payments` holds the sales' payments plus any payouts made that day
 * (payout rows have saleId = credit note id and a negative amount).
 */
export function summarize(sales: Sale[], lines: SaleLine[], payments: Payment[], credits: CreditNote[]): DaySummary {
  const done = sales.filter((s) => s.status === 'completed')
  const ids = new Set(done.map((s) => s.id))
  const byMethod: Record<string, number> = {}
  const paidOutByMethod: Record<string, number> = {}
  for (const p of payments) {
    if (p.amountKs < 0) paidOutByMethod[p.method] = (paidOutByMethod[p.method] ?? 0) - p.amountKs
    else if (ids.has(p.saleId) && p.method !== 'credit') byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amountKs
  }
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  const fabric = new Map<number, { productId: number; nameMy: string; tenths: number }>()
  let pieces = 0
  for (const l of lines.filter((l) => ids.has(l.saleId))) {
    if (l.kind === 'piece') pieces += l.qty ?? 0
    else {
      const f = fabric.get(l.productId) ?? { productId: l.productId, nameMy: l.nameMy, tenths: 0 }
      f.tenths += l.lengthTenths ?? 0
      fabric.set(l.productId, f)
    }
  }
  return {
    count: done.length,
    totalKs: done.reduce((s, x) => s + x.totalKs, 0),
    byMethod,
    refundsKs: credits.reduce((s, c) => s + c.totalKs, 0),
    paidOutByMethod,
    netKs: sum(byMethod) - sum(paidOutByMethod),
    cashNetKs: (byMethod.cash ?? 0) - (paidOutByMethod.cash ?? 0),
    pieces,
    fabric: [...fabric.values()].sort((a, b) => b.tenths - a.tenths),
  }
}

/** +12% / −5% change vs. another day; undefined when there is nothing to compare with. */
export const changePct = (now: number, before: number) => (before ? Math.round(((now - before) * 100) / before) : undefined)
