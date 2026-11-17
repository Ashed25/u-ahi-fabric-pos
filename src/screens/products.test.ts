import { expect, it } from 'vitest'
import type { Product } from '../db/schema'
import { type View, applyView } from './Products'

const item = (id: number, nameMy: string, kind: Product['kind'], price: number, left: number, extra: Partial<Product> = {}) => ({
  p: { id, nameMy, nameEn: '', kind, active: true, updatedAt: id, ...(kind === 'piece' ? { priceKs: price } : { unitPriceKs: price }), ...extra } as Product,
  left,
  low: left > 0 && left < 3,
})
const items = [item(1, 'က', 'piece', 500, 10), item(2, 'ခ', 'length', 100, 0), item(3, 'ဂ', 'piece', 300, 2, { active: false }), item(4, 'ဃ', 'piece', 900, 5, { categoryId: 7 })]
const view: View = { sort: 'name', kind: '', status: '', stock: '' }
const ids = (v: Partial<View>, q = '', cat?: number) => applyView(items, { ...view, ...v }, q, cat).map((d) => d.p.id)

it('sorts and filters the product list', () => {
  expect(ids({})).toEqual([1, 2, 3, 4])
  expect(ids({ sort: 'priceDown' })).toEqual([4, 1, 3, 2])
  expect(ids({ sort: 'stock' })).toEqual([2, 3, 4, 1])
  expect(ids({ sort: 'recent' })).toEqual([4, 3, 2, 1])
  expect(ids({ kind: 'piece', status: 'active' })).toEqual([1, 4])
  expect(ids({ status: 'hidden' })).toEqual([3])
  expect(ids({ stock: 'low' })).toEqual([2, 3])
  expect(ids({ stock: 'out' })).toEqual([2])
  expect(ids({}, 'ဃ')).toEqual([4])
  expect(ids({}, '', 7)).toEqual([4])
})
