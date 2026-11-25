import ExcelJS from 'exceljs'
import { expect, type Page, test } from '@playwright/test'
import { nav, scan, start } from './helpers'

async function addPiece(page: Page, name: string, price: string, sizes: string[]) {
  await nav(page, '#/products')
  await page.getByRole('button', { name: /ပစ္စည်းအသစ်/ }).click()
  await page.getByLabel('အမည် (မြန်မာ)').fill(name)
  await page.getByLabel('ဈေးနှုန်း (ကျပ်)').fill(price)
  for (const [i, s] of sizes.entries()) {
    if (i) await page.getByRole('button', { name: /အရွယ်\/အရောင် ထပ်ထည့်ရန်/ }).click()
    await page.getByLabel('အရွယ်').nth(i).fill(s)
  }
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('ဆိုင်ထုတ်').first()).toBeVisible()
}

async function downloadSheet(page: Page) {
  await nav(page, '#/import')
  const dl = page.waitForEvent('download')
  await page.getByTestId('download-products').click()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile((await (await dl).path())!)
  const ws = wb.getWorksheet('products')!
  const col = (code: string) => (ws.getRow(1).values as unknown[]).findIndex((h) => String(h ?? '').split(/\s+/).pop() === code)
  const rows = () => ws.getRows(2, ws.rowCount - 1)!.filter((r) => r.getCell(col('name_my')).text)
  const find = (name: string, size = '') => rows().find((r) => r.getCell(col('name_my')).text === name && r.getCell(col('size')).text === size)!
  return { wb, ws, col, find }
}

test('real products: Excel round trip keeps barcodes, deleted rows are deleted, fabric priced per ကိုက်', async ({ page }) => {
  await start(page, { demo: false })
  await addPiece(page, 'ရှပ်', '15000', ['M', 'L'])
  await addPiece(page, 'ပုဆိုး', '12000', [''])
  await nav(page, '#/products')
  await page.getByRole('button', { name: /ပစ္စည်းအသစ်/ }).click()
  await page.getByRole('button', { name: /အလျားဖြင့် ရောင်းမည်/ }).click()
  await page.getByLabel('အမည် (မြန်မာ)').fill('ပိုး')
  await expect(page.getByText('ဘာနဲ့ ဈေးသတ်မှတ်မလဲ')).toHaveCount(0) // no unit choice: always per ကိုက်
  await page.getByLabel('တစ်ကိုက် ဈေး (ကျပ်)').fill('8000')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('ဆိုင်ထုတ်')).toBeVisible()

  // Download, then edit the file as the owner would in Excel: delete two rows, change a price.
  const sheet = await downloadSheet(page)
  expect(sheet.col('pricing_unit')).toBe(-1)
  const code = (name: string, size = '') => sheet.find(name, size).getCell(sheet.col('barcode')).text
  const codes = { shirtM: code('ရှပ်', 'M'), shirtL: code('ရှပ်', 'L'), paso: code('ပုဆိုး'), silk: code('ပိုး') }
  sheet.find('ပိုး').getCell(sheet.col('price_ks')).value = 9000
  sheet.ws.spliceRows(sheet.find('ပုဆိုး').number, 1)
  sheet.ws.spliceRows(sheet.find('ရှပ်', 'L').number, 1)
  const edited = test.info().outputPath('edited.xlsx')
  await sheet.wb.xlsx.writeFile(edited)

  await page.locator('input[type=file]').setInputFiles(edited)
  await expect(page.getByText('ဖိုင်ထဲ မပါတော့သော 2 ခု')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'ပုဆိုး' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'ရှပ် (L)' })).toBeVisible()
  await page.screenshot({ path: 'test-results/import-preview.png' })
  await page.getByRole('button', { name: 'ဆိုင်ထဲ သိမ်းမည်' }).click()
  await expect(page.getByText(/1 ခု ဖျက်ပြီး/)).toBeVisible()

  // Labels printed before the upload still scan; the deleted ones don't.
  await nav(page, '#/scanner')
  await scan(page, codes.shirtM)
  await expect(page.getByText('တွေ့ပြီ — ရှပ်')).toBeVisible()
  await scan(page, codes.silk)
  await expect(page.getByText('တွေ့ပြီ — ပိုး')).toBeVisible()
  for (const gone of [codes.paso, codes.shirtL]) {
    await scan(page, gone)
    await expect(page.getByText('ဒီပစ္စည်း မတွေ့ပါ')).toBeVisible()
  }

  // Second download: same codes, new price, deleted rows stay gone.
  const again = await downloadSheet(page)
  expect(again.find('ရှပ်', 'M').getCell(again.col('barcode')).text).toBe(codes.shirtM)
  expect(again.find('ပိုး').getCell(again.col('price_ks')).value).toBe(9000)
  expect(again.find('ပုဆိုး')).toBeUndefined()
})
