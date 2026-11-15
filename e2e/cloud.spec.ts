import { expect, test } from '@playwright/test'
import { nav, start } from './helpers'

test('changes are queued for the cloud; cloud setup screen; daily backup reminder', async ({ page }) => {
  await start(page)

  // Every write in the real browser lands in the change queue (sent once a shop tablet is connected)
  const queued = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('u-ahi-sync-queue') ?? '{}')))
  expect(queued.some((k) => k.startsWith('products\t'))).toBe(true)
  expect(queued.some((k) => k.startsWith('users\t'))).toBe(true)
  expect(queued.some((k) => k === 'settings\t"saleSeq"')).toBe(false) // per-device counters never leave the device

  // Owner sees the backup reminder until a backup is saved
  await nav(page, '#/menu')
  await expect(page.getByTestId('backup-reminder')).toContainText('အရန်ဖိုင် မသိမ်းရသေးပါ')
  await page.getByTestId('backup-reminder').click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /အရန်ဖိုင် သိမ်းရန်/ }).click()
  await download
  await expect(page.getByText('အရန်ဖိုင် သိမ်းပြီးပါပြီ')).toBeVisible()
  await nav(page, '#/menu')
  await expect(page.getByRole('heading', { name: /မီနူး/ })).toBeVisible()
  await expect(page.getByTestId('backup-reminder')).toHaveCount(0)

  // Cloud screen: setup steps with the SQL, connect needs all fields
  await page.getByRole('button', { name: /Cloud အရန်/ }).click()
  await expect(page.getByText('create table if not exists pos_rows')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ချိတ်ဆက်မည်' })).toBeDisabled()
  await page.getByLabel('Project URL').fill('https://example.supabase.co')
  await page.getByLabel('anon public key').fill('key')
  await page.getByLabel('Supabase user email').fill('shop@example.com')
  await page.getByLabel('Supabase user စကားဝှက်').fill('secret')
  await expect(page.getByRole('button', { name: 'ချိတ်ဆက်မည်' })).toBeEnabled()
})

test('backup still downloads when the share sheet is refused (NotAllowedError)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    })
  })
  await start(page, { demo: false })
  await nav(page, '#/backup')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /အရန်ဖိုင် သိမ်းရန်/ }).click()
  await download
  await expect(page.getByText('အရန်ဖိုင် သိမ်းပြီးပါပြီ')).toBeVisible()
})
