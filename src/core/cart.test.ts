import { describe, expect, it } from 'vitest'
import { addPiece, type CartLine, cartTotals, removeLast, setQty } from './cart'

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
