const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

/** 17000 -> "17,000" */
export const formatKs = (ks: number) => fmt.format(ks)

export const sumKs = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export interface PaymentLike {
  amountKs: number
}

/** Remaining to pay (>0), or 0 when fully paid. */
export const amountDue = (totalKs: number, payments: PaymentLike[]) =>
  Math.max(0, totalKs - sumKs(payments.map((p) => p.amountKs)))

/** Cash: change to give back. Negative means not enough cash. */
export const changeDue = (dueKs: number, tenderedKs: number) => tenderedKs - dueKs
