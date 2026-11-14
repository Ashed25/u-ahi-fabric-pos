import { expect, type Page, test } from '@playwright/test'
import { nav, scan, start } from './helpers'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

const readXlsx = (path: string) => XLSX.read(readFileSync(path))

test('month report: sales, profit from costs, Excel export; CT warning and CT report', async ({ page }) => {
  await start(page)

  // Shirt M 15,000 (cost 9,000) + silk 1 ကိုက် 1 တောင် = 12,000 (cost 5,000/ကိုက် → 7,500)
  await nav(page, '#/')
  await expect(page.getByTestId('scan-area')).toBeVisible()
  await scan(page, '2000000000015')
  await scan(page, '2000000000114')
  await page.getByRole('button', { name: '1 ကိုက် 1 တောင်' }).click()
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('အရောင်း နံပါတ် A-000001')).toBeVisible()

  await nav(page, '#/reports')
  await expect(page.getByTestId('gross')).toHaveText('27,000')
  await expect(page.getByTestId('profit')).toContainText('10,500')
  await expect(page.getByText('ပိုးထည် အပြာ')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Excel ဖိုင် ထုတ်ရန်/ }).click()
  const wb = readXlsx((await (await download).path())!)
  expect(wb.SheetNames).toEqual(['Summary', 'Payment methods', 'Best sellers - pieces', 'Best sellers - fabric', 'Sales schedule', 'Items'])
  const fabric = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Best sellers - fabric'])
  expect(fabric[0]).toMatchObject({ Product: 'ပိုးထည် အပြာ', Length: '1 ကိုက် 1 တောင်', 'Length (in)': 54 })
  const schedule = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Sales schedule'])
  expect(schedule[0]).toMatchObject({ Number: 'A-000001', 'Total (Ks)': 27000 })

  // A low threshold triggers the CT registration warning on the menu
  await nav(page, '#/settings')
  await page.getByLabel(/CT မှတ်ပုံတင်ရန် နှစ်စဉ် အရောင်း/).fill('30000')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await nav(page, '#/menu')
  await expect(page.getByTestId('ct-warning')).toContainText('နီးလာပြီ')
  await page.getByTestId('ct-warning').click()
  await expect(page.getByRole('cell', { name: '27,000' }).first()).toBeVisible()

  const ctDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /CT အစီရင်ခံစာ Excel/ }).click()
  const ct = readXlsx((await (await ctDownload).path())!)
  expect(ct.SheetNames).toEqual(['CT by quarter', 'Sales schedule'])
})

test('accountant export has every table with readable dates', async ({ page }) => {
  await start(page)
  await nav(page, '#/reports')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /စာရင်းကိုင်အတွက်/ }).click()
  const wb = readXlsx((await (await download).path())!)
  expect(wb.SheetNames).toContain('stockMoves')
  const moves = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.stockMoves)
  expect(String(moves[0].at)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  const products = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.products)
  expect(products[0]).not.toHaveProperty('photo')
})
