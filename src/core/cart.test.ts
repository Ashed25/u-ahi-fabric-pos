import { describe, expect, it } from 'vitest'
import { addPiece, applyWholesale, type CartLine, cartTotals, removeLast, setQty } from './cart'

const shirt = { productId: 1, variantId: 10, nameMy: 'ရှပ်', sub: 'M', unitPriceKs: 15000 }
const silk: CartLine = {
  key: 'f1', kind: 'length', productId: 2, nameMy: 'ပိုး', sub: '', entered: [{ unit: 'gaik', count: 2 }, { unit: 'maik', count: 1 }],
  lengthTenths: 764, unitPriceKs: 8000, pricingUnit: 'gaik', unitTenths: 360, lineTotalKs: 17000,
}
const NO_CT = { registered: false, rateBp: 500, inclusive: true }

describe('cart', () => {
  it('merges the same size/colour and moves it last', () => {
    let c = addPiece([], shirt)
    c = [...c, silk]
    c = addPiece(c, shirt)
    expect(c.map((l) => l.kind)).toEqual(['length', 'piece'])
    expect(c[1].kind === 'piece' && c[1].qty).toBe(2)
  })

  it('remove last takes one piece, then the line, then the fabric cut', () => {
    let c: CartLine[] = [silk, ...addPiece(addPiece([], shirt), shirt)]
    c = removeLast(c)
    expect(c[1].kind === 'piece' && c[1].qty).toBe(1)
    c = removeLast(c)
    expect(c).toEqual([silk])
    expect(removeLast(removeLast(c))).toEqual([])
  })

  it('setQty 0 removes the line', () => {
    const c = addPiece([], shirt)
    expect(setQty(c, c[0].key, 3)[0]).toMatchObject({ qty: 3 })
    expect(setQty(c, c[0].key, 0)).toEqual([])
  })

  it('totals one shirt + one fabric cut', () => {
    const c = [...addPiece([], shirt), silk]
    expect(cartTotals(c, NO_CT)).toEqual({ subtotalKs: 32000, discountKs: 0, ctKs: 0, totalKs: 32000 })
  })

  it('CT inclusive keeps the total, exclusive adds to it', () => {
    const c = addPiece([], { ...shirt, unitPriceKs: 10500 })
    expect(cartTotals(c, { registered: true, rateBp: 500, inclusive: true })).toMatchObject({ ctKs: 500, totalKs: 10500 })
    expect(cartTotals(c, { registered: true, rateBp: 500, inclusive: false })).toMatchObject({ ctKs: 525, totalKs: 11025 })
  })
})

describe('wholesale', () => {
  const ws = { ...shirt, wholesaleKs: 12000, wholesaleMin: 3 }
  const L = { ...shirt, variantId: 11, sub: 'L', wholesaleKs: 12000, wholesaleMin: 3 }
  it('all sizes of a product count toward the minimum', () => {
    let c = addPiece(addPiece([], ws), ws)
    expect(applyWholesale(c, 50, 'nearest').every((l) => !l.wholesale)).toBe(true)
    c = addPiece(c, L) // 2 M + 1 L = 3
    const p = applyWholesale(c, 50, 'nearest')
    expect(p.every((l) => l.wholesale && l.unitPriceKs === 12000)).toBe(true)
    expect(cartTotals(p, NO_CT).totalKs).toBe(36000)
    expect(applyWholesale(p, 50, 'nearest')).toEqual(p) // idempotent
  })
  it('fabric: total length vs minimum, rounded per line; remnants keep their price', () => {
    const cut = { ...silk, wholesaleKs: 7000, wholesaleMin: 720 } as CartLine // 2 yd minimum
    const p = applyWholesale([cut], 50, 'nearest') // 764 tenths ≥ 720
    expect(p[0]).toMatchObject({ wholesale: true, unitPriceKs: 7000, lineTotalKs: 14850 }) // 7000 × 764/360 = 14855.6 → 14850
    const remnant = { ...cut, remnantPct: 20 } as CartLine
    expect(applyWholesale([remnant], 50, 'nearest')[0]).toBe(remnant)
  })
})
