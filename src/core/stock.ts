import type { Roll } from '../db/schema'

/** Rolls a seller can cut from (not finished), open roll first. */
export function sellableRolls(rolls: Roll[]): Roll[] {
  return rolls
    .filter((r) => r.status !== 'finished')
    .sort((a, b) => (a.status === 'remnant' ? 1 : 0) - (b.status === 'remnant' ? 1 : 0) || a.remainingTenths - b.remainingTenths || a.receivedAt - b.receivedAt)
}

/** Default roll to cut from: the open (shortest) normal roll; remnants only if nothing else. */
export const defaultRoll = (rolls: Roll[]): Roll | undefined => sellableRolls(rolls)[0]

/** Short, still-normal rolls worth offering as remnants. */
export const remnantCandidates = (rolls: Roll[], belowTenths: number) =>
  rolls.filter((r) => r.status === 'active' && r.remainingTenths > 0 && r.remainingTenths < belowTenths)

/** Total left across sellable rolls (tenths). */
export const fabricLeft = (rolls: Roll[]) => sellableRolls(rolls).reduce((s, r) => s + Math.max(0, r.remainingTenths), 0)

export const isLow = (left: number, lowStock?: number) => lowStock != null && left < lowStock
