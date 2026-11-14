import { expect, test } from '@playwright/test'
import { nav, OWNER_PASSWORD, OWNER_PIN, pin, scan, start } from './helpers'

const SHIRT_M = '2000000000015'

test('owner adds a seller; seller sells; a return needs a manager PIN; owner area needs the password', async ({ page }) => {
  await start(page)

  // Owner area: Users (already unlocked right after setup)
  await nav(page, '#/users')
  await page.getByRole('button', { name: /လူအသစ်/ }).click()
  await page.getByLabel('အမည်').fill('အမေ')
  await page.getByLabel('PIN (ဂဏန်း ၄ လုံး)').fill(OWNER_PIN)
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('ဒီ PIN ကို တခြားသူ သုံးပြီးသား')).toBeVisible() // PINs are unique
  await page.getByLabel('PIN (ဂဏန်း ၄ လုံး)').fill('1111')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByRole('button', { name: /အမေ/ })).toBeVisible()

  // Lock, wrong PIN, then the seller logs in
  await nav(page, '#/')
  await page.getByRole('button', { name: 'သော့ခတ်' }).click()
  await expect(page.getByText('သင့် PIN ၄ လုံး ထည့်ပါ')).toBeVisible()
  await pin(page, '9999')
  await expect(page.getByText('PIN မှားနေသည်')).toBeVisible()
  await pin(page, '1111')
  await expect(page.getByTestId('scan-area')).toBeVisible()

  // Seller sells; no discount button for sellers
  await scan(page, SHIRT_M)
  await expect(page.getByTestId('total')).toHaveText('15,000')
  await expect(page.getByRole('button', { name: /လျှော့ဈေး/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await page.getByRole('button', { name: 'နောက်တစ်ယောက်' }).click()

  // Seller's menu: no stock, products, settings
  await nav(page, '#/menu')
  await expect(page.getByRole('button', { name: /ယနေ့ အနှစ်ချုပ်/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /လက်ကျန်/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /ဆက်တင်များ/ })).toHaveCount(0)
  await nav(page, '#/settings')
  await expect(page.getByText('ခွင့်မရှိပါ').first()).toBeVisible()

  // Return as seller: a manager/owner PIN is asked; a seller PIN is refused
  await nav(page, '#/sales/A-000001')
  await page.getByRole('button', { name: /ပြန်လဲ \/ ပြန်အမ်း/ }).click()
  await page.getByRole('button', { name: '+' }).click()
  await page.getByLabel('အကြောင်းရင်း (မဖြစ်မနေ)').fill('size')
  await page.getByRole('button', { name: 'ငွေ ပြန်အမ်းမည်' }).click()
  await expect(page.getByText('မန်နေဂျာ (သို့) ပိုင်ရှင် PIN ထည့်ပါ')).toBeVisible()
  await pin(page, '1111')
  await expect(page.getByText('ဒီလူ ခွင့်ပြုခွင့် မရှိပါ')).toBeVisible()
  await pin(page, OWNER_PIN)
  await expect(page.getByText('CN-A-000001 မှတ်ပြီးပါပြီ')).toBeVisible()

  // Owner logs back in: discount allowed; the owner area asks for the password
  await nav(page, '#/')
  await page.getByRole('button', { name: 'သော့ခတ်' }).click()
  await pin(page, OWNER_PIN)
  await scan(page, SHIRT_M)
  await page.getByRole('button', { name: /လျှော့ဈေး/ }).click()
  await page.getByRole('button', { name: '10%' }).click()
  await expect(page.getByTestId('discount')).toContainText('1,500')
  await expect(page.getByTestId('total')).toHaveText('13,500')
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('အရောင်း နံပါတ် A-000002')).toBeVisible()

  await nav(page, '#/audit')
  await page.getByLabel('ပိုင်ရှင် စကားဝှက်').fill('nope')
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await expect(page.getByText('စကားဝှက် မှားနေသည်')).toBeVisible()
  await page.getByLabel('ပိုင်ရှင် စကားဝှက်').fill(OWNER_PASSWORD)
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await expect(page.getByText('return.refund').first()).toBeVisible()
  await expect(page.getByText('user.create').first()).toBeVisible()

  // Sales history shows who sold
  await nav(page, '#/reports')
  await expect(page.getByText('အမေ')).toBeVisible()
})
