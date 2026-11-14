import { test } from '@playwright/test'
import { nav, scan, start } from './helpers'

// Screenshots for the parents' picture guide (public/guide.html). Run: GUIDE_SHOTS=1 npx playwright test guide-shots
test.skip(!process.env.GUIDE_SHOTS, 'only when refreshing the guide pictures')

const shot = (name: string) => ({ path: `public/guide/${name}.jpg`, type: 'jpeg' as const, quality: 60 })

test('guide pictures', async ({ page }) => {
  await start(page)
  await nav(page, '#/')
  await page.getByTestId('scan-area').waitFor()

  await scan(page, '2000000000015')
  await scan(page, '2000000000039')
  await page.waitForTimeout(300)
  await page.screenshot(shot('1-scan'))

  await scan(page, '2000000000114')
  await page.getByRole('button', { name: /^\+ ကိုက်/ }).click()
  await page.getByRole('button', { name: /^\+ ကိုက်/ }).click()
  await page.getByRole('button', { name: /^\+ ထွာ/ }).click()
  await page.waitForTimeout(300)
  await page.screenshot(shot('2-fabric'))
  await page.getByRole('button', { name: 'အိုကေ' }).click()

  await page.getByRole('button', { name: 'ငွေရှင်းရန်' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ 20,000' }).click()
  await page.waitForTimeout(300)
  await page.screenshot(shot('3-pay'))
  await page.getByRole('button', { name: /ပြီးပြီ/ }).click()
  await page.getByRole('button', { name: 'နောက်တစ်ယောက်' }).click()

  await scan(page, '99999999')
  await page.waitForTimeout(300)
  await page.screenshot(shot('4-notfound'))
  await page.getByRole('dialog').getByRole('button', { name: /ဓာတ်ပုံဖြင့် ရွေးရန်/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot(shot('5-photos'))
})
