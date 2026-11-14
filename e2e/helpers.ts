import { expect, type Page } from '@playwright/test'

export const OWNER_PIN = '1234'
export const OWNER_PASSWORD = 'owner123'

/** A HID scanner: digits a few ms apart, then Enter. */
export async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 5 })
  await page.keyboard.press('Enter')
}

/** Change screen inside the app (a full reload would log out, as it should). */
export async function nav(page: Page, hash: string) {
  await page.evaluate((h) => {
    location.hash = h
  }, hash)
}

/** Tap a PIN on the big PIN pad. */
export async function pin(page: Page, digits: string) {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click()
}

/** Fresh app: create the owner on the first-start screen (logged in as owner), optionally load the demo. */
export async function start(page: Page, { demo = true } = {}) {
  await page.goto('./') // relative, so BASE_URL can include the GitHub Pages folder
  await page.getByLabel('အမည်').fill('ဦးအဟိ')
  await page.getByLabel('PIN (ဂဏန်း ၄ လုံး)').fill(OWNER_PIN)
  await page.getByLabel('PIN ထပ်ရိုက်ပါ').fill(OWNER_PIN)
  await page.getByLabel('စကားဝှက် (၆ လုံး အနည်းဆုံး)').fill(OWNER_PASSWORD)
  await page.getByLabel('စကားဝှက် ထပ်ရိုက်ပါ').fill(OWNER_PASSWORD)
  await page.getByRole('button', { name: 'စတင်မည်' }).click()
  await expect(page.getByTestId('scan-area')).toBeVisible()
  if (demo) {
    await nav(page, '#/menu')
    await page.getByRole('button', { name: 'နမူနာ ပစ္စည်း ထည့်ရန်' }).click()
    await expect(page.getByRole('button', { name: 'နမူနာ ပစ္စည်း ဖျက်ရန်' })).toBeEnabled() // enabled = all demo items written
  }
}
