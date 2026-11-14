import type { TFunction } from 'i18next'
import { dateKey, timeText } from '../core/fy'
import { formatEntered, formatInches } from '../core/length'
import { formatKs } from '../core/money'
import type { Payment, Sale, SaleLine } from '../db/schema'
import type { Settings } from '../db/settings'
import { unitName } from './format'

type Row = { left: string; right?: string; bold?: boolean; size?: number; center?: boolean; small?: boolean; rule?: boolean }

/** Builds the receipt rows (text only) — the same rows are drawn to an image for sharing. */
export function receiptRows(t: TFunction, lang: string, s: Settings, d: { sale: Sale; lines: SaleLine[]; payments: Payment[] }, copy: boolean): Row[] {
  const rows: Row[] = []
  const ks = (n: number) => formatKs(n)
  if (copy) rows.push({ left: t('receipt.copy'), center: true, bold: true, size: 30 })
  rows.push({ left: s.shopName, center: true, bold: true, size: 34 })
  if (s.shopAddress) rows.push({ left: s.shopAddress, center: true, small: true })
  if (s.shopPhone) rows.push({ left: s.shopPhone, center: true, small: true })
  if (s.tin) rows.push({ left: `TIN/CT: ${s.tin}`, center: true, small: true })
  rows.push({ left: '', rule: true })
  rows.push({ left: `${t('receipt.no')} ${d.sale.id}`, right: `${dateKey(d.sale.at)} ${timeText(d.sale.at)}` })
  rows.push({ left: '', rule: true })
  for (const l of d.lines) {
    if (l.kind === 'length') {
      rows.push({ left: l.nameMy, right: ks(l.lineTotalKs), bold: true })
      rows.push({ left: `  ${formatEntered(l.entered ?? [], s.units, lang as 'my' | 'en')} (${formatInches(l.lengthTenths ?? 0)}") @ ${ks(l.unitPriceKs)}/${unitName(s.units, l.pricingUnit ?? 'gaik', lang)}`, small: true })
    } else {
      rows.push({ left: l.nameMy, right: ks(l.lineTotalKs), bold: true })
      const detail = [l.sub, (l.qty ?? 1) > 1 ? `${l.qty} × ${ks(l.unitPriceKs)}` : ''].filter(Boolean).join(' · ')
      if (detail) rows.push({ left: `  ${detail}`, small: true })
    }
  }
  rows.push({ left: '', rule: true })
  rows.push({ left: t('receipt.subtotal'), right: ks(d.sale.subtotalKs) })
  if (d.sale.discountKs) rows.push({ left: t('receipt.discount'), right: `-${ks(d.sale.discountKs)}` })
  if (d.sale.ctKs) rows.push({ left: t('receipt.ct'), right: ks(d.sale.ctKs) })
  rows.push({ left: t('receipt.total'), right: `${ks(d.sale.totalKs)} ${t('common.ks')}`, bold: true, size: 32 })
  for (const p of d.payments) {
    const m = s.paymentMethods.find((x) => x.code === p.method)
    rows.push({ left: `${m ? (lang === 'en' ? m.nameEn : m.nameMy) : p.method}${p.ref ? ` #${p.ref}` : ''}`, right: ks(p.tenderedKs ?? p.amountKs) })
    if (p.changeKs) rows.push({ left: t('pay.change'), right: ks(p.changeKs) })
  }
  rows.push({ left: '', rule: true })
  if (s.returnPolicy) rows.push({ left: s.returnPolicy, center: true, small: true })
  if (s.receiptFooter) rows.push({ left: s.receiptFooter, center: true })
  if (d.sale.status === 'void') rows.unshift({ left: 'VOID', center: true, bold: true, size: 40 })
  return rows
}

const W = 576 // 80 mm receipt width at 7 px/mm
const PAD = 24
const FONT = '"Noto Sans Myanmar", sans-serif'

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > width && line) {
      out.push(line)
      line = word
    } else line = next
  }
  out.push(line)
  return out
}

/** Draws the receipt rows to a PNG for sharing via Viber / Messenger. */
export async function receiptImage(rows: Row[]): Promise<Blob> {
  await Promise.all([document.fonts.load(`24px ${FONT}`), document.fonts.load(`bold 24px ${FONT}`)])
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  const font = (r: Row) => `${r.bold ? 'bold ' : ''}${r.size ?? (r.small ? 20 : 24)}px ${FONT}`

  // Lay out first to know the height.
  const laid: { r: Row; lines: string[]; h: number }[] = rows.map((r) => {
    g.font = font(r)
    const lh = Math.round((r.size ?? (r.small ? 20 : 24)) * 1.7)
    if (r.rule) return { r, lines: [], h: 20 }
    const rightW = r.right ? g.measureText(r.right).width + 16 : 0
    const lines = wrap(g, r.left, W - 2 * PAD - rightW)
    return { r, lines, h: lines.length * lh }
  })
  c.width = W
  c.height = PAD * 2 + laid.reduce((s, x) => s + x.h, 0)
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'
  g.textBaseline = 'top'

  let y = PAD
  for (const { r, lines, h } of laid) {
    g.font = font(r)
    if (r.rule) {
      g.fillRect(PAD, y + 9, W - 2 * PAD, 2)
    } else {
      const lh = h / lines.length
      lines.forEach((text, i) => {
        g.textAlign = r.center ? 'center' : 'left'
        g.fillText(text, r.center ? W / 2 : PAD, y + i * lh)
      })
      if (r.right) {
        g.textAlign = 'right'
        g.fillText(r.right, W - PAD, y)
      }
    }
    y += h
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('receipt image failed'))), 'image/png'))
}
