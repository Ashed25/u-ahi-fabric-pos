import { expect, test } from '@playwright/test'
import { nav, scan, start } from './helpers'

const SHIRT_M = '2000000000015' // demo shirt, 15,000

test('wholesale price from 2 shirts; customer pays part; debt collected later', async ({ page }) => {
  await start(page)

  // Wholesale: 12,000 each from 2 pieces
  await nav(page, '#/products')
  await page.getByRole('button', { name: /ရှပ်အင်္ကျီ အဖြူ/ }).first().click()
  await page.getByTestId('ws-price').fill('12000')
  await page.getByTestId('ws-min').fill('2')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page).toHaveURL(/#\/products$/)

  await nav(page, '#/')
  await scan(page, SHIRT_M)
  await expect(page.getByTestId('total')).toHaveText('15,000')
  await scan(page, SHIRT_M)
  await expect(page.getByTestId('total')).toHaveText('24,000')
  await expect(page.getByTestId('cart')).toContainText('လက်ကား')

  // Pays 10,000 now, owes 14,000
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: '+ 10,000' }).click()
  await page.getByTestId('owe').click()
  await expect(page.getByTestId('owed')).toHaveText('14,000')
  await page.getByLabel('အမည်', { exact: true }).fill('Ko Aung')
  await page.getByRole('button', { name: /ကျန်ငွေ မှတ်မည်/ }).click()
  await expect(page.getByTestId('done-owed')).toContainText('14,000')

  // Collect 4,000 later
  await nav(page, '#/debts')
  await expect(page.getByTestId('debt-total')).toContainText('14,000')
  await page.getByTestId('debtor').getByRole('button', { name: 'ငွေလက်ခံ' }).click()
  await page.getByTestId('debt-amount').fill('4000')
  await page.getByRole('button', { name: '✓ ငွေလက်ခံ' }).click()
  await expect(page.getByTestId('debt-total')).toContainText('10,000')

  // Today: cash in = 10,000 + 4,000; debt figures shown
  await nav(page, '#/today')
  await expect(page.getByTestId('day-total')).toContainText('24,000')
  await expect(page.getByTestId('debt-lines')).toContainText('14,000')
  await expect(page.getByTestId('debt-lines')).toContainText('4,000')
  await expect(page.getByText(/ငွေသား 14,000/)).toBeVisible()
})
