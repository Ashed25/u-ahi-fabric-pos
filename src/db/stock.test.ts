import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultRoll, fabricLeft, isLow, remnantCandidates } from '../core/stock'
import { db } from './schema'
import { markRemnant, receivePieces, receiveRoll, setPieces, setRollLength } from './stock'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const YD = 360

describe('stock', () => {
  it('receives rolls and pieces with a move each', async () => {
    const r = await receiveRoll(1, 50 * YD)
    const vid = (await db.variants.add({ productId: 2, qty: 3 })) as number
    await receivePieces(vid, 10)
    expect((await db.rolls.get(r))!.remainingTenths).toBe(18000)
    expect((await db.variants.get(vid))!.qty).toBe(13)
    expect((await db.stockMoves.toArray()).map((m) => m.reason)).toEqual(['receive', 'receive'])
    await expect(receiveRoll(1, 0)).rejects.toThrow()
    await expect(receivePieces(vid, -1)).rejects.toThrow()
  })

  it('adjustments need a reason, record the difference, and finish/reopen rolls', async () => {
    const r = await receiveRoll(1, 10 * YD)
    await expect(setRollLength(r, 9 * YD, 'adjust', ' ')).rejects.toThrow(/reason/)
    await setRollLength(r, 9 * YD, 'waste', 'cutting waste')
    const moves = await db.stockMoves.where('rollId').equals(r).toArray()
    expect(moves.at(-1)).toMatchObject({ reason: 'waste', deltaTenths: -YD, note: 'cutting waste' })
    await setRollLength(r, 0, 'count', '')
    expect((await db.rolls.get(r))!.status).toBe('finished')
    await setRollLength(r, 44, 'adjust', 'found more')
    expect((await db.rolls.get(r))!.status).toBe('active')

    const vid = (await db.variants.add({ productId: 2, qty: 5 })) as number
    await setPieces(vid, 4, 'adjust', 'damaged')
    expect((await db.stockMoves.where('variantId').equals(vid).first())!.deltaQty).toBe(-1)
    expect(await db.audit.count()).toBeGreaterThanOrEqual(5)
  })

  it('remnants: whole price or % off, validated, reversible', async () => {
    const r = await receiveRoll(1, 300)
    await markRemnant(r, { pct: 30 })
    expect(await db.rolls.get(r)).toMatchObject({ status: 'remnant', remnantPct: 30 })
    await markRemnant(r, { wholeKs: 5000 })
    expect(await db.rolls.get(r)).toMatchObject({ status: 'remnant', remnantPriceKs: 5000 })
    expect((await db.rolls.get(r))!.remnantPct).toBeUndefined()
    await expect(markRemnant(r, { pct: 100 })).rejects.toThrow()
    await markRemnant(r, null)
    expect((await db.rolls.get(r))!.status).toBe('active')
  })

  it('picks the open roll first, remnants last; finds short rolls; low stock', async () => {
    const big = await receiveRoll(1, 40 * YD)
    const open = await receiveRoll(1, 12 * YD)
    const short = await receiveRoll(1, 200)
    await markRemnant(short, { pct: 20 })
    const rolls = await db.rolls.toArray()
    expect(defaultRoll(rolls)!.id).toBe(open)
    expect(remnantCandidates(rolls, YD).map((x) => x.id)).toEqual([])
    await markRemnant(short, null)
    expect(remnantCandidates(await db.rolls.toArray(), YD).map((x) => x.id)).toEqual([short])
    expect(fabricLeft(await db.rolls.toArray())).toBe(40 * YD + 12 * YD + 200)
    expect(isLow(100, 360)).toBe(true)
    expect(isLow(100, undefined)).toBe(false)
    expect(big).toBeGreaterThan(0)
  })
})
