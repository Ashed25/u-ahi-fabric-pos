import { describe, expect, it } from 'vitest'
import { periodBounds, periodLabel, shiftRef } from './period'
import { buildReport, ctThreshold, type ReportInput, salesTrend } from './reports'
import type { Sale, SaleLine } from '../db/schema'

const at = (iso: string) => Date.parse(iso)

describe('periods (Asia/Yangon, FY from April)', () => {
  const ref = at('2026-11-14T10:00:00+06:30') // a Saturday
  it('bounds', () => {
    expect(periodBounds('week', ref)).toEqual([at('2026-11-09T00:00:00+06:30'), at('2026-11-16T00:00:00+06:30')])
    expect(periodBounds('month', ref)).toEqual([at('2026-11-01T00:00:00+06:30'), at('2026-12-01T00:00:00+06:30')])
    expect(periodBounds('quarter', ref)).toEqual([at('2026-10-01T00:00:00+06:30'), at('2027-01-01T00:00:00+06:30')])
    expect(periodBounds('fy', ref)).toEqual([at('2026-04-01T00:00:00+06:30'), at('2027-04-01T00:00:00+06:30')])
  })
  it('labels and shifting across year ends', () => {
    expect(periodLabel('quarter', ref)).toBe('FY 2026-27 Q3')
    expect(periodLabel('quarter', shiftRef('quarter', ref, 1))).toBe('FY 2026-27 Q4')
    expect(periodLabel('quarter', shiftRef('quarter', ref, 2))).toBe('FY 2027-28 Q1')
    expect(periodLabel('month', shiftRef('month', ref, 2))).toBe('2027-01')
    expect(periodLabel('fy', shiftRef('fy', ref, -1))).toBe('FY 2025-26')
    expect(periodLabel('week', ref)).toBe('2026-11-09 – 2026-11-15')
  })
})

const sale = (id: string, p: Partial<Sale>): Sale => ({ id, deviceId: 'A', seq: 1, at: 0, userId: 0, status: 'completed', subtotalKs: 0, discountKs: 0, ctKs: 0, totalKs: 0, ...p })
const line = (id: number, saleId: string, p: Partial<SaleLine>): SaleLine => ({ id, saleId, productId: 1, kind: 'piece', nameMy: 'x', unitPriceKs: 0, ctRateBp: 0, lineTotalKs: 0, ...p })

describe('report', () => {
  const s1 = sale('A-1', { subtotalKs: 27000, totalKs: 27000 })
  const s2 = sale('A-2', { subtotalKs: 10000, ctKs: 500, totalKs: 10500, userId: 2 }) // CT added on top
  const s3 = sale('A-3', { status: 'void', subtotalKs: 5000, totalKs: 5000 })
  const lines = [
    line(1, 'A-1', { productId: 1, nameMy: 'ရှပ်', qty: 1, unitPriceKs: 15000, lineTotalKs: 15000, costKs: 9000 }),
    line(2, 'A-1', { productId: 2, nameMy: 'ပိုး', kind: 'length', lengthTenths: 540, unitTenths: 360, lineTotalKs: 12000 }), // no snapshot: uses product cost 5000/ကိုက်
    line(3, 'A-2', { productId: 3, nameMy: 'ပုဝါ', qty: 2, unitPriceKs: 5000, lineTotalKs: 10000 }), // no cost at all
    line(4, 'A-3', { productId: 1, nameMy: 'ရှပ်', qty: 1, lineTotalKs: 5000 }),
  ]
  const input: ReportInput = {
    sales: [s1, s2, s3],
    lines,
    payments: [
      { saleId: 'A-1', method: 'cash', amountKs: 27000 },
      { saleId: 'A-2', method: 'kbzpay', amountKs: 10500 },
      { saleId: 'CN-A-1', method: 'cash', amountKs: -5250, at: 1 },
    ],
    credits: [{ id: 'CN-A-1', saleId: 'A-2', at: 1, userId: 0, approvedBy: 0, reason: 'r', type: 'refund', totalKs: 5250 }],
    creditLines: [{ creditId: 'CN-A-1', saleId: 'A-2', saleLineId: 3, qty: 1, toRoll: false, amountKs: 5250 }],
    creditSales: [s2],
    creditSaleLines: [lines[2]],
    products: [{ id: 2, kind: 'length', nameMy: 'ပိုး', nameEn: '', active: true, costKs: 5000, updatedAt: 0 }],
  }

  it('sales, CT, returns, methods, staff', () => {
    const r = buildReport(input)
    expect(r).toMatchObject({ count: 2, voidCount: 1, grossKs: 37500, ctKs: 500, refundsKs: 5250, refundsCtKs: 250, netKs: 32250, netExCtKs: 32000 })
    expect(r.byMethod).toEqual({ cash: 27000, kbzpay: 10500 })
    expect(r.paidOutByMethod).toEqual({ cash: 5250 })
    expect(r.byStaff).toEqual({ 0: { count: 1, totalKs: 27000 }, 2: { count: 1, totalKs: 10500 } })
  })

  it('best sellers in pieces and fabric length', () => {
    const r = buildReport(input)
    expect(r.pieces.map((p) => [p.nameMy, p.qty])).toEqual([['ပုဝါ', 2], ['ရှပ်', 1]])
    expect(r.fabric).toEqual([{ productId: 2, nameMy: 'ပိုး', tenths: 540, revenueKs: 12000 }])
  })

  it('profit only over lines with a cost, net of returns', () => {
    // revenue ex-CT: 15000 + 12000 + 10000 − 5000 returned = 32000; uncosted: 10000 − 5000 = 5000
    // cost: 9000 + 5000×54/36 = 7500 → 16500; profit = 32000 − 5000 − 16500
    expect(buildReport(input).profit).toEqual({ revenueKs: 32000, costKs: 16500, profitKs: 10500, uncostedRevenueKs: 5000 })
  })

  it('CT threshold warnings at 80% and 100%', () => {
    expect(ctThreshold(39_999_999, 50_000_000).level).toBe('ok')
    expect(ctThreshold(40_000_000, 50_000_000)).toEqual({ pct: 80, level: 'near' })
    expect(ctThreshold(50_000_000, 50_000_000).level).toBe('over')
  })
})

describe('sales trend', () => {
  const s = (id: string, iso: string, totalKs: number, status: Sale['status'] = 'completed') => sale(id, { at: at(iso), totalKs, status })
  const sales = [
    s('A-1', '2026-11-14T07:30:00+06:30', 1000), // before 8:00 widens the day
    s('A-2', '2026-11-14T10:05:00+06:30', 2000),
    s('A-3', '2026-11-14T10:55:00+06:30', 3000),
    s('A-4', '2026-11-14T11:00:00+06:30', 9000, 'void'), // voids never count
    s('A-5', '2026-11-30T23:59:00+06:30', 4000),
  ]
  it('a day by hour, at least 8–20', () => {
    const bars = salesTrend(sales, 'day', ...periodBounds('day', at('2026-11-14T12:00:00+06:30')))
    expect(bars.map((b) => b.label)).toEqual(['7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'])
    expect(bars[0]).toEqual({ label: '7', totalKs: 1000, count: 1 })
    expect(bars[3]).toEqual({ label: '10', totalKs: 5000, count: 2 })
    expect(bars[4].totalKs).toBe(0)
  })
  it('a month by day, a year by month', () => {
    const month = salesTrend(sales, 'month', ...periodBounds('month', at('2026-11-14T12:00:00+06:30')))
    expect(month).toHaveLength(30)
    expect(month[13]).toEqual({ label: '14', totalKs: 6000, count: 3 })
    expect(month[29]).toEqual({ label: '30', totalKs: 4000, count: 1 }) // last minute stays in its own day
    const fy = salesTrend(sales, 'fy', ...periodBounds('fy', at('2026-11-14T12:00:00+06:30')))
    expect(fy.map((b) => b.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'])
    expect(fy[7].totalKs).toBe(10000)
  })
})
