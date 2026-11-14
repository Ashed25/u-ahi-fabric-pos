import { expect, type Page, test } from '@playwright/test'
import { nav, scan, start } from './helpers'

const SHIRT_M = '2000000000015'
const SHIRT_XL = '2000000000039'
const SILK = '2000000000114'
const TOWEL = '8851234567890'

async function sellCash(page: Page, codes: string[], silkTaung = 0) {
  await nav(page, '#/')
  await expect(page.getByTestId('scan-area')).toBeVisible()
  for (const c of codes) await scan(page, c)
  if (silkTaung) {
    await scan(page, SILK)
    for (let i = 0; i < silkTaung; i++) await page.getByRole('button', { name: /^\+ တောင်/ }).click()
    await page.getByRole('button', { name: 'အိုကေ' }).click()
  }
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await page.getByRole('button', { name: 'နောက်တစ်ယောက်' }).click()
}

test.beforeEach(async ({ page }) => {
  await start(page)
})

test('refund a shirt and a fabric cut; daily summary shows it', async ({ page }) => {
  await sellCash(page, [SHIRT_M], 3) // 15,000 + 12,000
  await nav(page, '#/sales/A-000001')
  await page.getByRole('button', { name: /ပြန်လဲ \/ ပြန်အမ်း/ }).click()
  await page.getByRole('button', { name: '+' }).click()
  await page.getByRole('button', { name: 'လိပ်ထဲ ပြန်ထည့်' }).click()
  await expect(page.getByTestId('return-total')).toHaveText('27,000')
  await page.getByRole('button', { name: 'ငွေ ပြန်အမ်းမည်' }).click()
  await expect(page.getByText('အကြောင်းရင်း ရေးပါ')).toBeVisible() // reason is required
  await page.getByLabel('အကြောင်းရင်း (မဖြစ်မနေ)').fill('wrong colour')
  await page.getByRole('button', { name: 'ငွေ ပြန်အမ်းမည်' }).click()
  await expect(page.getByText('CN-A-000001 မှတ်ပြီးပါပြီ')).toBeVisible()
  await expect(page.getByText('27,000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ပြီးပြီ' }).click()
  await expect(page.getByText(/CN-A-000001/)).toBeVisible()
  // fully returned: no void any more
  await expect(page.getByRole('button', { name: /ပယ်ဖျက်ရန်/ })).toHaveCount(0)

  await nav(page, '#/today')
  await expect(page.getByTestId('day-total')).toContainText('27,000')
  await expect(page.getByText('အသားတင် ဝင်ငွေ: 0')).toBeVisible()
})

test('exchange: credit pays for a dearer item, and gives cash back for a cheaper one', async ({ page }) => {
  await sellCash(page, [SHIRT_M, SHIRT_XL]) // 15,000 + 16,500
  await nav(page, '#/sales/A-000001')
  await page.getByRole('button', { name: /ပြန်လဲ \/ ပြန်အမ်း/ }).click()
  await page.getByRole('button', { name: '+' }).first().click() // shirt M
  await page.getByRole('button', { name: /ပစ္စည်း ပြန်လဲ/ }).click()
  await page.getByLabel('အကြောင်းရင်း (မဖြစ်မနေ)').fill('size')
  await page.getByRole('button', { name: /ပြန်လဲမည်/ }).click()

  // Back on the sell screen with 15,000 credit; take the XL (16,500): pay 1,500 more
  await expect(page.getByTestId('credit-banner')).toContainText('15,000')
  await scan(page, SHIRT_XL)
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await expect(page.getByText('ကျန်ငွေ: 1,500')).toBeVisible()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('အရောင်း နံပါတ် A-000002')).toBeVisible()
  await page.getByRole('button', { name: 'နောက်တစ်ယောက်' }).click()
  await expect(page.getByTestId('credit-banner')).toHaveCount(0)

  // Return the XL from the first sale for a towel (3,500): 13,000 back in cash
  await nav(page, '#/sales/A-000001')
  await page.getByRole('button', { name: /ပြန်လဲ \/ ပြန်အမ်း/ }).click()
  await page.getByRole('button', { name: '+' }).nth(1).click()
  await page.getByRole('button', { name: /ပစ္စည်း ပြန်လဲ/ }).click()
  await page.getByLabel('အကြောင်းရင်း (မဖြစ်မနေ)').fill('changed mind')
  await page.getByRole('button', { name: /ပြန်လဲမည်/ }).click()
  await scan(page, TOWEL)
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await expect(page.getByTestId('change')).toHaveText('13,000')
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('13,000', { exact: true })).toBeVisible()

  await nav(page, '#/sales/A-000002')
  await expect(page.getByText(/ပြန်လဲ ခံစားခွင့်/).first()).toBeVisible()
})

test('void a mistaken sale: keeps its number, marked VOID, stock back', async ({ page }) => {
  await sellCash(page, [SHIRT_M])
  await nav(page, '#/sales/A-000001')
  await page.getByRole('button', { name: /အရောင်း ပယ်ဖျက်ရန်/ }).click()
  await page.getByLabel('အကြောင်းရင်း (မဖြစ်မနေ)').fill('scanned twice')
  await page.getByRole('button', { name: 'ပယ်ဖျက်မည်' }).click()
  await expect(page.getByText(/VOID — scanned twice/)).toBeVisible()
  await nav(page, '#/sales')
  await expect(page.getByText('VOID', { exact: true })).toBeVisible()
  await expect(page.getByText('အရောင်း 0 ခု — 0 ကျပ်')).toBeVisible()
  await nav(page, '#/stock')
  await page.getByRole('button', { name: /ရှပ်အင်္ကျီ အဖြူ/ }).click()
  await expect(page.getByRole('heading', { name: 'ရှပ်အင်္ကျီ အဖြူ' })).toBeVisible()
  await expect(page.getByText('30 ထည်')).toBeVisible()
})
