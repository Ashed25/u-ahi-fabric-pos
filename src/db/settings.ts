import { DEFAULT_UNITS } from '../core/units'
import type { RoundMode } from '../core/pricing'
import type { CtSettings } from '../core/tax'
import { db } from './schema'

export interface PaymentMethod {
  code: string
  nameMy: string
  nameEn: string
  needsRef: boolean
  active: boolean
}

export const DEFAULT_SETTINGS = {
  shopName: 'ဦးအဟိ အထည်ဆိုင်',
  shopAddress: '',
  shopPhone: '',
  tin: '',
  units: DEFAULT_UNITS,
  roundStep: 50,
  roundMode: 'nearest' as RoundMode,
  paymentMethods: [
    { code: 'cash', nameMy: 'ငွေသား', nameEn: 'Cash', needsRef: false, active: true },
    { code: 'kbzpay', nameMy: 'KBZPay', nameEn: 'KBZPay', needsRef: true, active: true },
    { code: 'wavepay', nameMy: 'WavePay', nameEn: 'WavePay', needsRef: true, active: true },
    { code: 'ayapay', nameMy: 'AYA Pay', nameEn: 'AYA Pay', needsRef: true, active: true },
    { code: 'cbpay', nameMy: 'CB Pay', nameEn: 'CB Pay', needsRef: true, active: true },
    { code: 'card', nameMy: 'MPU / ကတ်', nameEn: 'MPU / card', needsRef: true, active: true },
    { code: 'bank', nameMy: 'ဘဏ်လွှဲ', nameEn: 'Bank transfer', needsRef: true, active: true },
  ] as PaymentMethod[],
  ct: { registered: false, rateBp: 500, inclusive: true } as CtSettings,
  ctThresholdKs: 50_000_000,
  receiptEnabled: true,
  receiptFooter: 'ဝယ်ယူအားပေးမှုအတွက် ကျေးဇူးတင်ပါသည်',
  returnPolicy: '',
  barcodePrefix: '20',
  barcodeSeq: 0, // last generated; never reused
  // A4 sticker sheet geometry in mm (default: common 3×8 sheet of 70×37 mm)
  a4Layout: { cols: 3, rows: 8, wMm: 70, hMm: 37, topMm: 0.5, leftMm: 0, gapXMm: 0, gapYMm: 0 },
  devicePrefix: 'A',
  saleSeq: 0, // last completed sale on this device
  creditSeq: 0, // last credit note (return) on this device
  practiceMode: false,
  lang: 'my' as 'my' | 'en',
  largeText: false,
  remnantBelowTenths: 360, // offer remnant when a roll is under 1 ကိုက်
  autoLockMinutes: 5,
  cashCheck: false,
  // Cloud (this device only, never synced)
  cloudUrl: '',
  cloudAnonKey: '',
  cloudEmail: '',
  deviceRole: '' as '' | 'primary' | 'viewer', // primary = the shop tablet that sends; viewer = laptop/phone that only reads
  deviceUuid: '',
  lastPullSeq: 0,
  lastSyncAt: 0,
  lastBackupAt: 0,
}

/** Settings shared through the cloud; everything else (sale counters, device letter, cloud login, language…) stays per device. */
export const SHARED_SETTINGS: SettingKey[] = [
  'shopName', 'shopAddress', 'shopPhone', 'tin', 'units', 'roundStep', 'roundMode', 'paymentMethods', 'ct', 'ctThresholdKs',
  'receiptEnabled', 'receiptFooter', 'returnPolicy', 'a4Layout', 'remnantBelowTenths', 'cashCheck', 'autoLockMinutes',
]

export type Settings = typeof DEFAULT_SETTINGS
export type SettingKey = keyof Settings

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key)
  return (row ? row.value : DEFAULT_SETTINGS[key]) as Settings[K]
}

export async function setSetting<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value })
}
