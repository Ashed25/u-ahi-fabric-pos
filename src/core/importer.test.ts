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
