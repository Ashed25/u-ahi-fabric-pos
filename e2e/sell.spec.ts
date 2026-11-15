import { expect, type Page, test } from '@playwright/test'
import { nav, scan, start } from './helpers'

// Demo barcodes are generated in a fixed order: shirt M is the first, blue silk the 8th.
const SHIRT_M = '2000000000015'
const SILK = '2000000000114'

test.beforeEach(async ({ page }) => {
  await start(page)
  await nav(page, '#/')
  await expect(page.getByTestId('scan-area')).toBeVisible()
})

test('sell one shirt + one fabric cut, pay cash, see it in history', async ({ page }) => {
  await scan(page, SHIRT_M)
  await expect(page.getByTestId('cart')).toContainText('ရှပ်အင်္ကျီ အဖြူ')
  await expect(page.getByTestId('total')).toHaveText('15,000')

  // Fabric: 2 ကိုက် 1 မိုက် at 8,000/ကိုက် = 17,000 (rounded to nearest 50)
  await scan(page, SILK)
  await page.getByRole('button', { name: /^\+ ကိုက်/ }).click()
  await page.getByRole('button', { name: /^\+ ကိုက်/ }).click()
  await page.getByRole('button', { name: /^\+ မိုက်/ }).click()
  await expect(page.getByTestId('length-price')).toContainText('17,000')
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await expect(page.getByTestId('cart')).toContainText('2 ကိုက် 1 မိုက်')
  await expect(page.getByTestId('cart')).toContainText('(76.4")')
  await expect(page.getByTestId('total')).toHaveText('32,000')

  // Pay with two 20,000 notes -> 8,000 change
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: '+ 20,000' }).click()
  await page.getByRole('button', { name: '+ 20,000' }).click()
  await expect(page.getByTestId('change')).toHaveText('8,000')
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('ရောင်းပြီးပါပြီ')).toBeVisible()
  await expect(page.getByText('အရောင်း နံပါတ် A-000001')).toBeVisible()
  await page.screenshot({ path: 'test-results/sell-done.png' })
  await page.getByRole('button', { name: 'နောက်တစ်ယောက်' }).click()
  await expect(page.getByTestId('total')).toHaveText('0')

  // History shows it, with the fabric exactly as entered
  await nav(page, '#/sales')
  await expect(page.getByText('အရောင်း 1 ခု — 32,000 ကျပ်')).toBeVisible()
  await page.getByRole('button', { name: /A-000001/ }).click()
  await expect(page.getByText('2 ကိုက် 1 မိုက်')).toBeVisible()
  await expect(page.getByText(/ငွေသား/)).toBeVisible()
})

test('mixed units stay as entered; remove last; unknown barcode; split payment', async ({ page }) => {
  await scan(page, SILK)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^\+ တောင်/ }).click()
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await expect(page.getByTestId('cart')).toContainText('3 တောင်')
  await expect(page.getByTestId('total')).toHaveText('12,000')

  await scan(page, SHIRT_M)
  await scan(page, SHIRT_M)
  await expect(page.getByTestId('cart')).toContainText('× 2')
  await page.getByRole('button', { name: 'နောက်ဆုံးတစ်ခုဖျက်' }).click()
  await expect(page.getByTestId('total')).toHaveText('27,000')

  await scan(page, '99999999')
  await expect(page.getByText('ဒီပစ္စည်း မတွေ့ပါ — ဓာတ်ပုံဖြင့် ရွေးပါ')).toBeVisible()
  await page.getByRole('button', { name: 'မလုပ်တော့' }).click()
  // Regression: the scanner's Enter must not press the focused "remove last" button again.
  await expect(page.getByTestId('total')).toHaveText('27,000')

  // 20,000 by KBZPay, the rest in cash
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'KBZPay' }).click()
  await page.getByPlaceholder('27,000').fill('20000')
  await page.getByRole('button', { name: /ကျန်တာ နောက်နည်းနဲ့/ }).click()
  await expect(page.getByText('ကျန်ငွေ: 7,000')).toBeVisible()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('အရောင်း နံပါတ် A-000001')).toBeVisible()
})

test('practice mode records nothing', async ({ page }) => {
  await nav(page, '#/settings')
  await page.getByLabel('လေ့ကျင့်ရန် မုဒ်').check()
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await nav(page, '#/')
  await expect(page.getByText('လေ့ကျင့်ရန် — အရောင်း မမှတ်ပါ')).toBeVisible()
  await scan(page, SHIRT_M)
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('လေ့ကျင့်မှု ပြီးပါပြီ (မမှတ်ပါ)')).toBeVisible()
  await nav(page, '#/sales')
  await expect(page.getByText('အရောင်း 0 ခု — 0 ကျပ်')).toBeVisible()
})

test('daily summary lists every product sold; the calendar picks a day', async ({ page }) => {
  await scan(page, SHIRT_M)
  await scan(page, SHIRT_M)
  await scan(page, '2000000000046') // T-shirt S, 8,500
  await expect(page.getByTestId('total')).toHaveText('38,500')
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: '+ 20,000' }).click()
  await page.getByRole('button', { name: '+ 20,000' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await page.getByRole('button', { name: 'နောက်တစ်ယောက်' }).click()

  await nav(page, '#/today')
  const items = page.getByTestId('day-items')
  await expect(items.getByRole('listitem')).toHaveCount(2)
  await expect(items.getByRole('listitem').nth(0)).toContainText('ရှပ်အင်္ကျီ အဖြူ')
  await expect(items.getByRole('listitem').nth(0)).toContainText('30,000')
  await expect(items.getByRole('listitem').nth(1)).toContainText('တီရှပ်')
  await expect(items.getByRole('listitem').nth(1)).toContainText('8,500')

  // Pick yesterday from the calendar: nothing sold, ▶ comes back to today
  const date = page.getByLabel('date')
  const today = await date.inputValue()
  const [y, m, d] = today.split('-').map(Number)
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  await date.fill(yesterday)
  await expect(page.getByTestId('day-total')).toContainText('0')
  await expect(items.getByRole('listitem')).toHaveCount(0)
  await page.getByRole('button', { name: '▶' }).click()
  await expect(date).toHaveValue(today)
  await expect(items.getByRole('listitem')).toHaveCount(2)

  // Sales history uses the same picker
  await nav(page, '#/sales')
  await page.getByLabel('date').fill(yesterday)
  await expect(page.getByText(/^အရောင်း 0 ခု/)).toBeVisible()
})
