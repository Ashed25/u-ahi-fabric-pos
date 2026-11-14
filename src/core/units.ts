// Length units live in settings; this is only the default seed.
export interface Unit {
  code: string // stable internal id, stored in sale lines
  nameMy: string
  nameEn: string
  tenths: number // length in tenths of an inch
  pricing: boolean // owner may price a fabric per this unit
}

export const DEFAULT_UNITS: Unit[] = [
  { code: 'gaik', nameMy: 'ကိုက်', nameEn: 'yd', tenths: 360, pricing: true },
  { code: 'taung', nameMy: 'တောင်', nameEn: 'taung', tenths: 180, pricing: true },
  { code: 'htwa', nameMy: 'ထွာ', nameEn: 'htwa', tenths: 90, pricing: true },
  { code: 'maik', nameMy: 'မိုက်', nameEn: 'maik', tenths: 44, pricing: true },
  { code: 'inch', nameMy: 'လက်မ', nameEn: 'in', tenths: 10, pricing: true },
  { code: 'halfinch', nameMy: 'လက်မဝက်', nameEn: '½ in', tenths: 5, pricing: false },
]

export function unitByCode(units: Unit[], code: string): Unit {
  const u = units.find((x) => x.code === code)
  if (!u) throw new Error(`Unknown unit: ${code}`)
  return u
}
