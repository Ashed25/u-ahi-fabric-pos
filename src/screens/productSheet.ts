import type ExcelJS from 'exceljs'
import { IMPORT_COLUMNS } from '../core/importer'

export const STOCK_COL = 'stock_info' // read-only: not in IMPORT_COLUMNS, so ignored on upload
// App-filled columns go last, grey, and refuse typing: the owner edits details only; ids come back so renames stay the same product.
const APP_COLS = ['product_id', 'variant_id', STOCK_COL] as const
export type Col = (typeof IMPORT_COLUMNS)[number] | typeof STOCK_COL
export const DETAILS: Col[] = IMPORT_COLUMNS.filter((c) => !(APP_COLS as readonly string[]).includes(c))
export const HEADER: Col[] = [...DETAILS, ...APP_COLS]
export type Row = Partial<Record<Col, string | number>>

export const TYPE_WORD = { piece: 'ခု', length: 'အလျား' } as const
export const ACTIVE_WORD = { yes: 'ရောင်း', no: 'မရောင်း' } as const
const WIDTHS = [36, 45, 58.4]

// Heading = Burmese label + the code on a second line; the importer reads the code (last word).
const LABEL: Record<Col, string> = {
  type: 'ရောင်းပုံ', name_my: 'အမည် (မြန်မာ)', name_en: 'အမည် (အင်္ဂလိပ်)', category: 'အမျိုးအစား', price_ks: 'ဈေး (ကျပ်) — ခု/ကိုက်',
  wholesale_price_ks: 'လက်ကားဈေး', wholesale_min: 'လက်ကား အနည်းဆုံး', size: 'အရွယ်', colour: 'အရောင်',
  width_inches: 'အနံ (လက်မ)', cost_ks: 'အရင်း (ကျပ်)', barcode: 'ဘားကုဒ်', active: 'ရောင်း/မရောင်း',
  product_id: 'ပစ္စည်း နံပါတ်', variant_id: 'အရွယ် နံပါတ်', [STOCK_COL]: 'လက်ကျန်',
}

export const EXAMPLES: Row[] = [
  { type: 'ခု', name_my: 'ရှပ်အင်္ကျီ အဖြူ', name_en: 'White shirt', category: 'အင်္ကျီ', price_ks: 15000, wholesale_price_ks: 12000, wholesale_min: 12, size: 'M', colour: 'အဖြူ', cost_ks: 9000 },
  { type: 'ခု', name_my: 'ရှပ်အင်္ကျီ အဖြူ', name_en: 'White shirt', category: 'အင်္ကျီ', price_ks: 15000, wholesale_price_ks: 12000, wholesale_min: 12, size: 'L', colour: 'အဖြူ', cost_ks: 9000 },
  { type: 'အလျား', name_my: 'ပိုးထည် အပြာ', name_en: 'Blue silk', category: 'ပိုးထည်', price_ks: 8000, wholesale_price_ks: 7000, wholesale_min: 20, width_inches: 45, cost_ks: 5000 },
  { type: 'အလျား', name_my: 'ချည်ထည် အစိမ်း', name_en: 'Green cotton', category: 'ချည်ထည်', price_ks: 5000, width_inches: 36 },
]

const HELP = [
  ['column', 'ရှင်းလင်းချက်', 'Explanation'],
  ['', 'ဆဲလ်တစ်ခု နှိပ်လိုက်ရင် အကူအညီ ပေါ်လာမည်။ ▼ ပါသော ဆဲလ်များတွင် စာရင်းမှ ရွေးပါ', 'Click a cell to see a hint. Cells with ▼ have a list to choose from'],
  ['product_id', 'မီးခိုးရောင် ကော်လံ — app က ဖြည့်ပေးသည်။ ထိစရာ မလိုပါ။ ပစ္စည်းအသစ်တွင် အလွတ် ထားပါ (app က နံပါတ် ပေးမည်)', 'Grey column, filled in by the app — leave it. Leave it empty for new products; the app gives the number'],
  ['variant_id', 'မီးခိုးရောင် ကော်လံ — app က ဖြည့်ပေးသည်။ အရွယ်အသစ် ထည့်ရန် အမည်၊ အမျိုးအစား တူတူဖြင့် အကြောင်းအသစ် ရေးပါ', 'Grey column, filled in by the app. To add a new size, add a row with the same name and category'],
  ['', 'အကြောင်းဟောင်းကို ကူးပြီး အမည် ပြောင်းရင် ပစ္စည်းအသစ်၊ အမည်တူ အရွယ်/အရောင် ပြောင်းရင် အရွယ်အသစ် ဖြစ်မည် (ဘားကုဒ် အသစ် ရမည်)', 'Copy a row and change the name = a new product; keep the name and change the size/colour = a new size. Copies get their own barcode'],
  ['type', 'ခု = တစ်ခုချင်း ရောင်း / အလျား = အလျားဖြင့် ရောင်း (ပိတ်စ)', 'ခု = sold per piece, အလျား = sold by length (fabric). piece / length also work'],
  ['name_my', 'အမည် (မြန်မာ) — မဖြစ်မနေ', 'Burmese name — required'],
  ['name_en', 'အမည် (အင်္ဂလိပ်) — မထည့်လည်းရ', 'English name — optional'],
  ['category', 'အမျိုးအစား — စာရင်းမှ ရွေးပါ၊ အသစ်ဆိုရင် ရိုက်ထည့်ပါ', 'Category — choose from the list or type a new one'],
  ['price_ks', 'ခု: တစ်ခု ဈေး / အလျား: တစ်ကိုက် ဈေး (ကျပ်)', 'piece: price per piece / length: price per yard (ကိုက်) (Ks)'],
  ['wholesale_price_ks', 'လက်ကား ဈေး (price_ks နှင့် ယူနစ်တူ) — မထည့်လည်းရ', 'Wholesale price, same unit as price_ks — optional'],
  ['wholesale_min', 'လက်ကား အနည်းဆုံး — ခု: အထည်ရေ (အရွယ်/အရောင် အားလုံး ပေါင်း) / အလျား: ကိုက် အရေအတွက်', 'Wholesale minimum — piece: number of pieces (all sizes/colours together) / length: number of yards'],
  ['size', 'အရွယ် (ခု သာ)', 'Size (piece only)'],
  ['colour', 'အရောင် (ခု သာ)', 'Colour (piece only)'],
  ['width_inches', 'ပိတ်စ အနံ (လက်မ) ဥပမာ 36, 45, 58.4', 'Fabric width in inches'],
  ['cost_ks', 'အရင်း (ကျပ်) — မထည့်လည်းရ', 'Cost (Ks) — optional'],
  ['barcode', 'ရှိပြီးသား ဘားကုဒ် — မထည့်ရင် အလိုအလျောက် ထုတ်ပေးမည်။ ဘားကုဒ် ဖယ်ရှားခြင်းကို app ထဲတွင် လုပ်ပါ', 'Existing barcode — leave empty to generate one. A new code is added; removing barcodes is done in the app'],
  ['active', 'ရောင်း = ရောင်းမည် / မရောင်း = ဖျောက်ထားမည် (အလွတ် = ရောင်း)', 'ရောင်း = for sale / မရောင်း = hidden (empty = for sale). yes / no also work'],
  [STOCK_COL, 'လက်ကျန် — ကြည့်ရန်သာ။ ဒီမှာ ပြင်လည်း မပြောင်းပါ (လက်ကျန်ကို app ထဲတွင် ရေတွက်ပါ)', 'Stock — for reference only; changes here are ignored (count stock in the app)'],
  ['', 'အရွယ်/အရောင် များရင် တစ်ကြောင်းစီ ရေးပါ (အမည်တူ၊ အမျိုးအစားတူ)', 'One row per size/colour (same name and category)'],
  ['', 'အကြောင်း ဖျက်လိုက်ရင် ထိုပစ္စည်း/အရွယ်ကို app မှ ဖျက်မည် (တင်ခါနီး စာရင်း ပြမည်)။ ရောင်းဖူးသော ပစ္စည်းကို မရောင်း အဖြစ် ဖျောက်ထားမည်', 'Deleting a row deletes that product or size from the app (you see the list before it happens). A product that was ever sold is hidden (မရောင်း) instead'],
  ['', 'ဖျက်ခြင်းသည် ဤ app မှ ဒေါင်းထားသော ဖိုင် အပြည့်ကို တင်မှသာ ဖြစ်သည်။ ပစ္စည်းအသစ်သာ ပါသော ဖိုင် တင်ရင် ဘာမှ မဖျက်ပါ', 'Only a full sheet downloaded from the app deletes anything. A file with only new products deletes nothing'],
]

const GREY = { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE5E7EB' } } as const
const SPARE_ROWS = 1000 // dropdowns and checks reach this far below the data, for new rows

/** The products workbook (.xlsx bytes): dropdowns, checks, hints, grey cells that don't apply. */
export async function buildBook(rows: Row[], lists: { categories: string[] }, header: Col[] = HEADER): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('products', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = header.map((c) => ({ header: `${LABEL[c]}\n${c}`, key: c, width: c === 'name_my' || c === 'name_en' ? 28 : 15 }))
  ws.getColumn('barcode').numFmt = '@' // text, so leading zeros stay
  ws.addRows(rows)
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.alignment = { wrapText: true, vertical: 'top' }
  head.height = 34

  const categories = [...new Set([...lists.categories, ...rows.map((r) => String(r.category ?? ''))].filter(Boolean))]
  const help = wb.addWorksheet('help')
  const listSheet = wb.addWorksheet('lists', { state: 'hidden' })
  const listCols = [categories, Object.values(TYPE_WORD), Object.values(ACTIVE_WORD), WIDTHS] as (string | number)[][]
  listCols.forEach((values, i) => values.forEach((v, r) => (listSheet.getCell(r + 1, i + 1).value = v)))
  const listRef = (i: number) => `lists!$${String.fromCharCode(65 + i)}$1:$${String.fromCharCode(65 + i)}$${Math.max(1, listCols[i].length)}`

  const end = rows.length + 1 + SPARE_ROWS
  const has = (c: Col) => header.includes(c)
  const letter = (c: Col) => ws.getColumn(c).letter
  const range = (cols: Col[]) => cols.filter(has).map((c) => `${letter(c)}2:${letter(c)}${end}`).join(' ')
  // exceljs accepts a range address and type 'any' (hint only) at runtime; its .d.ts lacks both.
  type V = Omit<ExcelJS.DataValidation, 'type' | 'formulae'> & { type?: ExcelJS.DataValidation['type'] | 'any'; formulae?: unknown[] }
  const dv = (ws as unknown as { dataValidations: { add(range: string, v: V): void } }).dataValidations
  const check = (c: Col, prompt: string, v: V) =>
    has(c) && dv.add(range([c]), { type: 'any', allowBlank: true, showInputMessage: true, prompt, showErrorMessage: true, errorStyle: 'stop', error: prompt, ...v })
  const list = (i: number) => ({ type: 'list' as const, formulae: [listRef(i)] })
  const whole = (min: number) => ({ type: 'whole' as const, operator: 'greaterThanOrEqual' as const, formulae: [min] })

  check('type', 'ခု = တစ်ခုချင်း / အလျား = ပိတ်စ', list(1))
  check('name_my', 'အမည် (မြန်မာ) — မဖြစ်မနေ', {})
  if (categories.length) check('category', 'စာရင်းမှ ရွေးပါ၊ အသစ်ဆိုရင် ရိုက်ထည့်ပါ', { ...list(0), errorStyle: 'information', error: 'အမျိုးအစား အသစ် ဖြစ်မည်' })
  check('price_ks', 'ခု: တစ်ခု ဈေး / အလျား: တစ်ကိုက် ဈေး (ကျပ်) — ဂဏန်းသာ', whole(1))
  check('wholesale_price_ks', 'လက်ကားဈေး — မထည့်လည်းရ', whole(1))
  check('wholesale_min', 'လက်ကား အနည်းဆုံး — မထည့်လည်းရ', whole(1))
  check('cost_ks', 'အရင်း (ကျပ်) — မထည့်လည်းရ', whole(0))
  check('width_inches', 'အလျား သာ — စာရင်းမှ ရွေး၊ သို့ ရိုက်ထည့်ပါ', { ...list(3), errorStyle: 'information', error: 'အနံ အသစ်' })
  check('active', 'ရောင်း / မရောင်း (အလွတ် = ရောင်း)', list(2))
  check('barcode', 'ရှိပြီးသား ဘားကုဒ် — မထည့်ရင် app က ထုတ်ပေးမည်', {})
  for (const c of APP_COLS) check(c, 'app က ဖြည့်သည် — မပြင်ပါနှင့်', { type: 'custom', formulae: ['FALSE'] })

  const t = `$${letter('type')}2`
  const grey = (cols: Col[], formula: string) =>
    cols.some(has) && ws.addConditionalFormatting({ ref: range(cols), rules: [{ type: 'expression', priority: 1, formulae: [formula], style: { fill: GREY } }] })
  grey(['size', 'colour'], `OR(${t}="${TYPE_WORD.length}",${t}="length")`)
  grey(['width_inches'], `OR(${t}="${TYPE_WORD.piece}",${t}="piece")`)
  grey([...APP_COLS], 'TRUE')

  help.addRows(HELP)
  help.columns = [{ width: 20 }, { width: 60 }, { width: 60 }]
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
