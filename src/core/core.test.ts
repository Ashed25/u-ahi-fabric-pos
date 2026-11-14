import { describe, expect, it } from 'vitest'
import { DEFAULT_UNITS as U, unitByCode } from './units'
import { addUnit, type EnteredLength, formatEntered, formatInches, formatLargestFirst, toTenths } from './length'
import { discountedLinePrice, fabricLinePrice } from './pricing'
import { amountDue, changeDue, formatKs } from './money'
import { applyCt, ctFromExclusive, ctFromInclusive } from './tax'
import { internalEan13, isValidEan13, looksLikeMisread } from './barcode'
import { ScanBuffer } from './scanner'
import { dateKey, fyBounds, fyOf, fyQuarterOf, quarterBounds } from './fy'

const L = (...parts: [string, number][]): EnteredLength => parts.map(([unit, count]) => ({ unit, count }))
const price = (unitPrice: number, unit: string, len: EnteredLength) =>
  fabricLinePrice(unitPrice, toTenths(len, U), unitByCode(U, unit).tenths)

describe('fabric pricing (owner-supplied cases)', () => {
  it.each<[EnteredLength, number]>([
    [L(['halfinch', 1]), 100],
    [L(['inch', 1]), 200],
    [L(['maik', 1]), 1000],
    [L(['htwa', 1]), 2000],
    [L(['taung', 1]), 4000],
    [L(['gaik', 1], ['taung', 1]), 12000],
    [L(['gaik', 2], ['maik', 1]), 17000],
    [L(['gaik', 3], ['inch', 5]), 25100],
    [L(['gaik', 2], ['htwa', 1], ['maik', 1]), 19000],
    [L(['taung', 3]), 12000],
    [L(['taung', 1], ['maik', 2]), 5950],
    [L(['maik', 2]), 1950],
  ])('8,000/ကိုက်: %j -> %i', (len, want) => expect(price(8000, 'gaik', len)).toBe(want))

  it.each<[EnteredLength, number]>([
    [L(['maik', 1]), 650],
    [L(['htwa', 1]), 1400], // exact half (1,375) rounds up
    [L(['gaik', 1], ['htwa', 1]), 6900], // exact half (6,875) rounds up
    [L(['gaik', 2], ['maik', 1]), 11650],
    [L(['gaik', 3], ['inch', 5]), 17250],
  ])('5,500/ကိုက်: %j -> %i', (len, want) => expect(price(5500, 'gaik', len)).toBe(want))

  it.each<[EnteredLength, number]>([
    [L(['maik', 1]), 1000],
    [L(['gaik', 2], ['maik', 1]), 17000],
  ])('4,000/တောင်: %j -> %i', (len, want) => expect(price(4000, 'taung', len)).toBe(want))

  it('entered lengths have the stated inch totals', () => {
    expect(formatInches(toTenths(L(['gaik', 2], ['htwa', 1], ['maik', 1]), U))).toBe('85.4')
    expect(formatInches(toTenths(L(['taung', 3]), U))).toBe('54')
    expect(formatInches(toTenths(L(['taung', 1], ['maik', 2]), U))).toBe('26.8')
    expect(formatInches(toTenths(L(['maik', 2]), U))).toBe('8.8')
  })

  it('remnant % off is exact, then rounded per line', () => {
    expect(discountedLinePrice(8000, 360, 360, 30)).toBe(5600)
    expect(discountedLinePrice(5500, 90, 360, 20)).toBe(1100)
    expect(discountedLinePrice(8000, 44, 360, 30)).toBe(700) // 684.4
    expect(discountedLinePrice(8000, 764, 360, 0)).toBe(17000) // same as no discount
    expect(() => discountedLinePrice(8000, 360, 360, 100)).toThrow()
  })

  it('rounding step and mode are settings', () => {
    expect(fabricLinePrice(8000, 44, 360, 100)).toBe(1000) // 977.8 -> nearest 100
    expect(fabricLinePrice(8000, 44, 360, 50, 'up')).toBe(1000)
    expect(fabricLinePrice(5500, 44, 360, 50, 'up')).toBe(700) // 672.2 -> up
    expect(fabricLinePrice(8000, 0, 360)).toBe(0)
    expect(() => fabricLinePrice(8000.5, 10, 360)).toThrow()
  })
})

describe('length display', () => {
  it('largest units first where there is no entered form', () => {
    expect(formatLargestFirst(540, U)).toBe('1 ကိုက် 1 တောင်')
    expect(formatLargestFirst(764, U)).toBe('2 ကိုက် 1 မိုက်')
    expect(formatLargestFirst(450, U)).toBe('1 ကိုက် 1 ထွာ')
    expect(formatLargestFirst(0, U)).toBe('0')
    expect(formatLargestFirst(2, U)).toBe('0') // under half an inch: only shown in the inches line
  })

  it('shows the length exactly as entered', () => {
    expect(formatEntered(L(['taung', 3]), U)).toBe('3 တောင်')
    expect(formatEntered(L(['gaik', 2], ['htwa', 1], ['maik', 1]), U)).toBe('2 ကိုက် 1 ထွာ 1 မိုက်')
    expect(formatEntered(L(['taung', 1], ['maik', 2]), U)).toBe('1 တောင် 2 မိုက်')
  })

  it('+/- buttons keep order and drop zero counts', () => {
    let e: EnteredLength = []
    e = addUnit(e, 'gaik', 1)
    e = addUnit(e, 'htwa', 1)
    e = addUnit(e, 'gaik', 1)
    expect(e).toEqual(L(['gaik', 2], ['htwa', 1]))
    e = addUnit(e, 'htwa', -1)
    expect(e).toEqual(L(['gaik', 2]))
    expect(addUnit(e, 'maik', -1)).toEqual(e)
  })

  it('formats inches', () => {
    expect(formatInches(5)).toBe('0.5')
    expect(formatInches(1130)).toBe('113')
    expect(formatInches(-44)).toBe('-4.4')
  })
})

describe('money', () => {
  it('formats MMK with separators', () => expect(formatKs(1250000)).toBe('1,250,000'))
  it('split payments and change', () => {
    expect(amountDue(29000, [{ amountKs: 20000 }])).toBe(9000)
    expect(amountDue(29000, [{ amountKs: 20000 }, { amountKs: 10000 }])).toBe(0)
    expect(changeDue(9000, 10000)).toBe(1000)
    expect(changeDue(9000, 5000)).toBe(-4000)
  })
})

describe('commercial tax', () => {
  it('off by default leaves the amount alone', () =>
    expect(applyCt(10500, { registered: false, rateBp: 500, inclusive: true })).toEqual({ netKs: 10500, ctKs: 0, totalKs: 10500 }))
  it('5% inclusive', () => expect(ctFromInclusive(10500, 500)).toEqual({ netKs: 10000, ctKs: 500, totalKs: 10500 }))
  it('5% exclusive', () => expect(ctFromExclusive(10000, 500)).toEqual({ netKs: 10000, ctKs: 500, totalKs: 10500 }))
  it('rounds CT to whole Ks', () => expect(ctFromInclusive(1000, 500).ctKs).toBe(48)) // 47.6
})

describe('barcodes', () => {
  it('generates valid in-store EAN-13', () => {
    const c = internalEan13(1)
    expect(c).toMatch(/^200000000001\d$/)
    expect(isValidEan13(c)).toBe(true)
    expect(isValidEan13('4006381333931')).toBe(true) // known-good public EAN
  })
  it('detects misreads', () => {
    const c = internalEan13(42)
    const bad = c.slice(0, 12) + ((Number(c[12]) + 1) % 10)
    expect(looksLikeMisread(bad)).toBe(true)
    expect(looksLikeMisread(c)).toBe(false)
  })
  it('rejects bad prefix or seq', () => {
    expect(() => internalEan13(1, '45')).toThrow()
    expect(() => internalEan13(0)).toThrow()
  })
})

describe('scanner input', () => {
  const burst = (s: ScanBuffer, keys: { code: string; key: string }[], start = 1000, gap = 10) =>
    keys.map((k, i) => s.feed({ ...k, timeStamp: start + i * gap })).filter(Boolean)
  const digits = (str: string, layout: 'en' | 'my-key' | 'my-digit') =>
    [...str].map((d) => ({
      code: layout === 'my-digit' ? '' : `Digit${d}`,
      key: layout === 'en' ? d : layout === 'my-key' ? 'ဆ' : '၀၁၂၃၄၅၆၇၈၉'[Number(d)],
    }))
  const ENTER = { code: 'Enter', key: 'Enter' }

  it('reads a fast burst ending in Enter', () =>
    expect(burst(new ScanBuffer(), [...digits('2000000000015', 'en'), ENTER])).toEqual(['2000000000015']))
  it('ignores the keyboard layout (uses physical key code)', () =>
    expect(burst(new ScanBuffer(), [...digits('2000000000015', 'my-key'), ENTER])).toEqual(['2000000000015']))
  it('maps Myanmar digits', () =>
    expect(burst(new ScanBuffer(), [...digits('8851234', 'my-digit'), ENTER])).toEqual(['8851234']))
  it('ignores slow human typing', () =>
    expect(burst(new ScanBuffer(), [...digits('12345', 'en'), ENTER], 0, 300)).toEqual([]))
  it('ignores too-short input', () => expect(burst(new ScanBuffer(), [...digits('12', 'en'), ENTER])).toEqual([]))
  it('one late key (busy tablet / Bluetooth) does not break a scan', () => {
    const s = new ScanBuffer()
    const keys = [...digits('2000000000114', 'en'), ENTER]
    const times = keys.map((_, i) => 1000 + i * 10 + (i >= 1 ? 180 : 0)) // 180 ms stall after the first digit
    expect(keys.map((k, i) => s.feed({ ...k, timeStamp: times[i] })).filter(Boolean)).toEqual(['2000000000114'])
  })
  it('two scans back to back', () =>
    expect(burst(new ScanBuffer(), [...digits('2000000000015', 'en'), ENTER, ...digits('2000000000114', 'en'), ENTER])).toEqual(['2000000000015', '2000000000114']))
})

describe('Yangon time & financial year', () => {
  const at = (iso: string) => Date.parse(iso)
  it('date key uses UTC+06:30', () => {
    expect(dateKey(at('2026-11-14T17:29:00Z'))).toBe('2026-11-14')
    expect(dateKey(at('2026-11-14T17:30:00Z'))).toBe('2026-11-15')
  })
  it('FY runs 1 Apr – 31 Mar with quarters from April', () => {
    expect(fyOf(at('2026-04-01T00:00:00+06:30'))).toBe(2026)
    expect(fyOf(at('2026-03-31T23:59:00+06:30'))).toBe(2025)
    expect([4, 7, 10, 1].map((m) => fyQuarterOf(at(`2026-${String(m).padStart(2, '0')}-15T12:00:00+06:30`)))).toEqual([1, 2, 3, 4])
    expect(fyBounds(2026)).toEqual([at('2026-04-01T00:00:00+06:30'), at('2027-04-01T00:00:00+06:30')])
    expect(quarterBounds(2026, 4)).toEqual([at('2027-01-01T00:00:00+06:30'), at('2027-04-01T00:00:00+06:30')])
  })
})
