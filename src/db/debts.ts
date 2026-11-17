import { audit } from './audit'
import { type Payment, type Sale, db } from './schema'

/** Names are typed by hand: "Ko Aung" and " ko  aung" are the same person. */
export const debtorKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export interface DebtSale {
  sale: Sale
  paidKs: number
  owingKs: number
}

export interface Debtor {
  key: string
  name: string // as last typed
  phone?: string
  owingKs: number
  sales: DebtSale[] // oldest first
}

/** Everyone who still owes money, biggest debt first. */
export async function listDebts(): Promise<Debtor[]> {
  const sales = (await db.sales.where('debtor').above('').toArray()).filter((s) => s.status === 'completed').sort((a, b) => a.at - b.at)
  const paid = new Map<string, number>()
  for (const p of await db.payments.where('saleId').anyOf(sales.map((s) => s.id)).toArray()) paid.set(p.saleId, (paid.get(p.saleId) ?? 0) + p.amountKs)
  const people = new Map<string, Debtor>()
  for (const sale of sales) {
    const paidKs = paid.get(sale.id) ?? 0
    const owingKs = sale.totalKs - paidKs
    if (owingKs <= 0) continue
    const key = debtorKey(sale.debtor!)
    const d = people.get(key) ?? { key, name: sale.debtor!, owingKs: 0, sales: [] }
    d.name = sale.debtor!
    d.phone = sale.debtorPhone ?? d.phone
    d.owingKs += owingKs
    d.sales.push({ sale, paidKs, owingKs })
    people.set(key, d)
  }
  return [...people.values()].sort((a, b) => b.owingKs - a.owingKs)
}

/** What is still owed on one sale (0 when fully paid). */
export async function owingOn(sale: Sale): Promise<number> {
  if (!sale.debtor) return 0
  const pays = await db.payments.where('saleId').equals(sale.id).toArray()
  return Math.max(0, sale.totalKs - pays.reduce((s, p) => s + p.amountKs, 0))
}

/** Money received later from someone who owes: paid off their oldest sale first. */
export async function payDebt(key: string, method: string, amountKs: number, ref?: string): Promise<Payment[]> {
  return db.transaction('rw', [db.sales, db.payments, db.audit], async () => {
    if (!Number.isSafeInteger(amountKs) || amountKs <= 0) throw new Error(`Bad amount ${amountKs}`)
    const d = (await listDebts()).find((x) => x.key === key)
    if (!d || amountKs > d.owingKs) throw new Error('More than what is owed')
    const at = Date.now()
    const out: Payment[] = []
    let left = amountKs
    for (const s of d.sales) {
      if (!left) break
      const part = Math.min(left, s.owingKs)
      out.push({ saleId: s.sale.id, method, amountKs: part, at, ref: ref?.trim() || undefined })
      left -= part
    }
    await db.payments.bulkAdd(out)
    await audit('debt.pay', `debtor:${d.name}`, { owingKs: d.owingKs }, { method, amountKs, sales: out.map((p) => p.saleId) })
    return out
  })
}
