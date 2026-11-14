import { expect, type Page, test } from '@playwright/test'
import { nav, scan, start } from './helpers'

const SILK = '2000000000114' // 2 rolls: 50 ကိုက် and 12 ကိုက် 1 တောင်
const LACE = '2000000000138' // 4,000/တောင်; 20 ကိုက် roll + a 30%-off remnant
const PRINTED = '2000000000145' // one short roll (2 ထွာ)

test.beforeEach(async ({ page }) => {
  await start(page)
})

test('sell from the open roll, a % remnant and a whole remnant; stock follows', async ({ page }) => {
  await nav(page, '#/')
  await expect(page.getByTestId('scan-area')).toBeVisible()

  // Silk: two rolls, the open (shorter) one is chosen by default
  await scan(page, SILK)
  await expect(page.getByRole('button', { name: /လိပ် #2: 12 ကိုက် 1 တောင်/ })).toHaveClass(/bg-blue-800/)
  await page.getByRole('button', { name: '1 ကိုက်', exact: true }).click()
  await page.getByRole('button', { name: 'အိုကေ' }).click()

  // Lace remnant at 30% off: 1 တောင် = 4,000 -> 2,800
  await scan(page, LACE)
  await page.getByRole('button', { name: /✂ အစ/ }).click()
  await page.getByRole('button', { name: '1 တောင်', exact: true }).click()
  await expect(page.getByTestId('length-price')).toContainText('2,800')
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await expect(page.getByTestId('cart')).toContainText('−30%')
  await expect(page.getByTestId('total')).toHaveText('10,800')

  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await expect(page.getByText('အရောင်း နံပါတ် A-000001')).toBeVisible()

  // Stock: silk open roll is now 11 ကိုက် 1 တောင်
  await nav(page, '#/stock')
  await page.getByRole('button', { name: /ပိုးထည် အပြာ/ }).click()
  await expect(page.getByText('11 ကိုက် 1 တောင် (414")')).toBeVisible()
  await expect(page.getByText('ရောင်း', { exact: true })).toBeVisible()

  // Printed cotton: short roll is offered as a remnant; sell it whole for 1,500
  await nav(page, '#/stock')
  await expect(page.getByText('တိုနေသော လိပ်များ — အစ အဖြစ် ရောင်းမလား')).toBeVisible()
  await page.getByRole('button', { name: /ချည်ထည် ပန်းရိုက်/ }).first().click()
  await page.getByRole('button', { name: '✂ အစ' }).click()
  await page.getByRole('button', { name: 'အကုန် ဈေးတစ်ခုတည်း' }).click()
  await page.getByLabel('အကုန်ယူရင် ဈေး (ကျပ်)').fill('1500')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('အစ — အကုန် 1,500 ကျပ်')).toBeVisible()

  await nav(page, '#/')
  await expect(page.getByTestId('scan-area')).toBeVisible()
  await scan(page, PRINTED)
  await page.getByRole('button', { name: /အစ အကုန်ယူ — 1,500/ }).click()
  await expect(page.getByTestId('length-price')).toContainText('1,500')
  await page.getByRole('button', { name: 'အိုကေ' }).click()
  await expect(page.getByTestId('cart')).toContainText('1 တောင် (18")') // whole remnant: shown largest-unit-first
  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  await page.getByRole('button', { name: 'ကွက်တိ' }).click()
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await nav(page, '#/stock')
  await page.getByRole('button', { name: /ချည်ထည် ပန်းရိုက်/ }).first().click()
  await expect(page.getByRole('button', { name: /ကုန်ပြီးသော လိပ်များ \(1\)/ })).toBeVisible()
})

test('receive pieces, adjust needs a reason, receive a roll, stock count', async ({ page }) => {
  await nav(page, '#/stock')
  await page.getByRole('button', { name: /ပုဆိုး ကွက်/ }).click()
  await page.getByRole('button', { name: '+ ဝင်' }).click()
  await page.getByLabel('ဘယ်နှစ်ထည် ဝင်သလဲ').fill('5')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('15 ထည်')).toBeVisible()

  await page.getByRole('button', { name: 'ပြင်ရန်' }).click()
  await page.getByLabel('အခု ဘယ်နှစ်ထည် ရှိသလဲ').fill('14')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('ဘာကြောင့် ပြင်တာလဲ အကြောင်းရင်း ရေးပါ')).toBeVisible()
  await page.getByLabel('အကြောင်းရင်း (မဖြစ်မနေ)').fill('damaged')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('14 ထည်')).toBeVisible()
  await expect(page.getByText('damaged')).toBeVisible()

  await nav(page, '#/stock')
  await page.getByRole('button', { name: /ချည်ထည် အဖြူ/ }).click()
  await page.getByRole('button', { name: '+ လိပ်အသစ် ဝင်ရန်' }).click()
  await page.getByLabel('ကိုက်').fill('40')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('70 ကိုက်')).toBeVisible()

  // Stock count: scanning opens the product in count mode
  await nav(page, '#/count')
  await page.getByRole('button', { name: 'စစ်ဆေးမှု အသစ် စမည်' }).click()
  await expect(page.getByText('စစ်ပြီး 0 / 9')).toBeVisible()
  await scan(page, '8851234567890') // towel (supplier code)
  await page.getByRole('button', { name: 'ရေတွက်ထည့်' }).click()
  await page.getByLabel('အခု ဘယ်နှစ်ထည် ရှိသလဲ').fill('9')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await page.getByRole('button', { name: /နောက်သို့/ }).click()
  await expect(page.getByText('စစ်ပြီး 1 / 9')).toBeVisible()
})

test('sell without a scanner: type a barcode or a name in "choose by photo"', async ({ page }) => {
  await nav(page, '#/')
  await page.getByRole('button', { name: /ဓာတ်ပုံဖြင့် ရွေးရန်/ }).click()
  await page.getByPlaceholder('အမည် (သို့) ဘားကုဒ် နံပါတ် ရိုက်ပါ').fill('2000000000015')
  await page.getByRole('button', { name: 'ရှာရန်' }).click()
  await expect(page.getByTestId('cart')).toContainText('ရှပ်အင်္ကျီ အဖြူ')

  await page.getByRole('button', { name: /ဓာတ်ပုံဖြင့် ရွေးရန်/ }).click()
  await page.getByPlaceholder('အမည် (သို့) ဘားကုဒ် နံပါတ် ရိုက်ပါ').fill('ပုဆိုး')
  await page.getByRole('button', { name: /ပုဆိုး ကွက်/ }).click()
  await expect(page.getByTestId('total')).toHaveText('27,000')
})
