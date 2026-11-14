import type { TFunction } from 'i18next'
import { formatInches } from '../core/length'
import { formatKs } from '../core/money'
import { type Unit, unitByCode } from '../core/units'
import type { Product, Variant } from '../db/schema'

export const unitName = (units: Unit[], code: string, lang: string) => {
  const u = unitByCode(units, code)
  return lang === 'en' ? u.nameEn : u.nameMy
}

/** "15,000 ကျပ်" or "8,000 ကျပ် / ကိုက်" */
export function priceText(t: TFunction, p: Product, units: Unit[], lang: string, v?: Variant): string {
  if (p.kind === 'piece') return `${formatKs(v?.priceKs ?? p.priceKs ?? 0)} ${t('common.ks')}`
  return `${formatKs(p.unitPriceKs ?? 0)} ${t('common.ks')} / ${unitName(units, p.pricingUnit ?? 'gaik', lang)}`
}

/** Size/colour for clothes, width for fabric. */
export function subText(t: TFunction, p: Product, v?: Variant): string {
  if (p.kind === 'length') return p.widthTenths ? `${t('product.width')} ${formatInches(p.widthTenths)}"` : ''
  return [v?.size, v?.colour].filter(Boolean).join(' · ')
}
