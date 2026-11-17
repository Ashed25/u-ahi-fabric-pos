import { describe, expect, it } from 'vitest'
import { parseImport } from './importer'
import { DEFAULT_UNITS } from './units'

const parse = (rows: Record<string, unknown>[]) => parseImport(rows, DEFAULT_UNITS)

describe('Excel import parser', () => {
  it('groups clothing rows into one product with variants', () => {
    const { products, errors } = parse([
      { type: 'piece', name_my: 'ရှပ်အင်္ကျီ', category: 'အင်္ကျီ', price_ks: '15,000', size: 'M', colour: 'အဖြူ' },
      { type: 'ခု', name_my: 'ရှပ်အင်္ကျီ', category: 'အင်္ကျီ', price_ks: 15000, size: 'L', colour: 'အဖြူ' },
      { type: 'piece', name_my: 'ရှပ်အင်္ကျီ', category: 'အင်္ကျီ', price_ks: '၁၆၅၀၀', size: 'XL', barcode: '8851234567890' },
    ])
    expect(errors).toEqual([])
    expect(products).toHaveLength(1)
    expect(products[0].priceKs).toBe(15000)
    expect(products[0].variants).toEqual([
      { size: 'M', colour: 'အဖြူ', priceKs: undefined, barcode: undefined },
      { size: 'L', colour: 'အဖြူ', priceKs: undefined, barcode: undefined },
      { size: 'XL', colour: undefined, priceKs: 16500, barcode: '8851234567890' },
    ])
  })

  it('parses fabric with pricing unit and width', () => {
    const { products, errors } = parse([
      { type: 'length', name_my: 'ပိုးထည် အပြာ', category: 'ပိုး', price_ks: 8000, width_inches: '58.4' },
      { type: 'အလျား', name_my: 'ချည်ထည်', price_ks: 4000, pricing_unit: 'တောင်', width_inches: 45 },
    ])
    expect(errors).toEqual([])
    expect(products[0]).toMatchObject({ kind: 'length', pricingUnit: 'gaik', unitPriceKs: 8000, widthTenths: 584 })
    expect(products[1]).toMatchObject({ pricingUnit: 'taung', unitPriceKs: 4000, widthTenths: 450 })
  })

  it('skips blank lines and reports bad rows with Excel row numbers', () => {
    const { products, errors } = parse([
      { type: 'piece', name_my: 'A', price_ks: 1000, barcode: '12345' },
      {},
      { type: 'shirt', name_my: 'B', price_ks: 1000 },
      { type: 'piece', name_my: '', price_ks: 1000 },
      { type: 'piece', name_my: 'C', price_ks: 'free' },
      { type: 'length', name_my: 'D', price_ks: 1000, pricing_unit: 'metre' },
      { type: 'length', name_my: 'E', price_ks: 1000, pricing_unit: 'လက်မဝက်' }, // not a pricing unit
      { type: 'piece', name_my: 'F', price_ks: 1000, barcode: '12345' },
      { type: 'length', name_my: 'G', price_ks: 1000 },
      { type: 'length', name_my: 'G', price_ks: 1000 },
    ])
    expect(products.map((p) => p.nameMy)).toEqual(['A', 'G'])
    expect(errors.map((e) => e.row)).toEqual([4, 5, 6, 7, 8, 9, 11])
  })
})

describe('Excel update sheet', () => {
  it('rows with product_id update that product; wholesale and active are read', () => {
    const { products, errors } = parse([
      { product_id: 7, variant_id: 70, type: 'piece', name_my: 'ရှပ်', price_ks: 15000, wholesale_price_ks: 12000, wholesale_min: 12, size: 'M', active: 'no', stock_info: 99 },
      { product_id: 7, variant_id: '', type: 'piece', name_my: 'ရှပ်', price_ks: 15000, wholesale_price_ks: 12000, wholesale_min: 12, size: 'XL' },
      { product_id: 8, type: 'length', name_my: 'ပိုး', price_ks: 8000 },
    ])
    expect(errors).toEqual([])
    expect(products[0]).toMatchObject({ id: 7, active: false, wholesalePriceKs: 12000, wholesaleMin: 12 })
    expect(products[0].variants.map((v) => [v.id, v.size])).toEqual([[70, 'M'], [undefined, 'XL']])
    expect(products[1]).toMatchObject({ id: 8, kind: 'length', active: true })
  })
  it('reports bad ids and half-filled wholesale', () => {
    const { errors } = parse([
      { product_id: 'x', type: 'piece', name_my: 'A', price_ks: 1 },
      { variant_id: 3, type: 'piece', name_my: 'B', price_ks: 1 },
      { type: 'piece', name_my: 'C', price_ks: 1, wholesale_price_ks: 900 },
      { product_id: 5, variant_id: 9, type: 'piece', name_my: 'D', price_ks: 1 },
      { product_id: 5, variant_id: 9, type: 'piece', name_my: 'D', price_ks: 1 },
    ])
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 6])
  })
})
