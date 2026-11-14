import { expect, type Page, test } from '@playwright/test'

/** A HID scanner: digits typed a few ms apart, then Enter. */
async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 5 })
  await page.keyboard.press('Enter')
}

test('owner adds a fabric and a shirt, links a supplier barcode, scans it, previews labels', async ({ page }) => {
  await page.goto('/#/menu')
  await expect(page.getByRole('heading', { name: 'မီနူး' })).toBeVisible()

  // Fabric, priced per ကိုက်
  await page.getByRole('button', { name: /ပစ္စည်းများ/ }).click()
  await page.getByRole('button', { name: /ပစ္စည်းအသစ်/ }).click()
  await page.getByRole('button', { name: /အလျားဖြင့် ရောင်းမည်/ }).click()
  await page.getByLabel('အမည် (မြန်မာ)').fill('ပိုးထည် အပြာ')
  await page.getByLabel('ယူနစ်တစ်ခု ဈေး (ကျပ်)').fill('8,000')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  // Saved -> stays on the product with its generated EAN-13
  await expect(page.getByText('ဆိုင်ထုတ်')).toBeVisible()

  // Link a supplier barcode by "scanning" it
  await page.getByRole('button', { name: /ရှိပြီးသား ဘားကုဒ် စကန်ဖတ်ရန်/ }).click()
  await scan(page, '8851234567890')
  await expect(page.getByText('8851234567890 ချိတ်ပြီးပါပြီ')).toBeVisible()
  // Same code again -> clear duplicate warning naming the product
  await scan(page, '8851234567890')
  await expect(page.getByText(/သုံးပြီးသားပါ/)).toBeVisible()
  await page.getByRole('button', { name: 'ပြီးပြီ' }).click()
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()

  // Shirt with two sizes
  await page.getByRole('button', { name: /ပစ္စည်းအသစ်/ }).click()
  await page.getByLabel('အမည် (မြန်မာ)').fill('ရှပ်အင်္ကျီ')
  await page.getByLabel('ဈေးနှုန်း (ကျပ်)').fill('15000')
  await page.getByLabel('အရွယ်').first().fill('M')
  await page.getByRole('button', { name: /အရွယ်\/အရောင် ထပ်ထည့်ရန်/ }).click()
  await page.getByLabel('အရွယ်').nth(1).fill('L')
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('ဆိုင်ထုတ်')).toHaveCount(2)
  await page.getByRole('button', { name: 'သိမ်းရန်' }).click()
  await expect(page.getByText('ပစ္စည်း 2 မျိုး')).toBeVisible()
  await expect(page.getByText('8,000 ကျပ် / ကိုက်')).toBeVisible()

  // Scanner test finds the fabric by its supplier code, even with a Burmese layout (key ≠ digit)
  await page.goto('/#/scanner')
  await scan(page, '8851234567890')
  await expect(page.getByText('တွေ့ပြီ — ပိုးထည် အပြာ')).toBeVisible()
  await scan(page, '1234567')
  await expect(page.getByText('ဒီပစ္စည်း မတွေ့ပါ')).toBeVisible()

  // Labels: one per fabric + one per shirt size
  await page.goto('/#/labels')
  await page.getByRole('button', { name: 'ကြိုကြည့်ရန် (3 ခု)' }).click()
  await expect(page.locator('.label-box')).toHaveCount(3)
  await expect(page.locator('.label-box svg rect').first()).toBeAttached()
  await page.screenshot({ path: 'test-results/labels-40x30.png' })
})
