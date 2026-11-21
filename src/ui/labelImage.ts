import JsBarcode from 'jsbarcode'
import { isValidEan13 } from '../core/barcode'

const FONT = '"Noto Sans Myanmar", sans-serif'
export type LabelText = { code: string; name: string; sub: string; price: string }

// Cut to fit with "…", by whole letters so Burmese clusters never split.
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  const parts = [...new Intl.Segmenter().segment(text)].map((s) => s.segment)
  while (parts.length && g.measureText(`${parts.join('')}…`).width > max) parts.pop()
  return `${parts.join('')}…`
}

/** One label drawn at the printer's own dots (8 per mm at 203 dpi), same content as the HTML label: shop, name, detail + price, barcode. */
export async function labelCanvas(it: LabelText, shop: string, wMm: number, hMm: number): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load(`20px ${FONT}`), document.fonts.load(`bold 20px ${FONT}`)])
  const W = wMm * 8
  const H = hMm * 8
  const P = 12 // 1.5 mm edge
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#000'
  g.textBaseline = 'middle' // marks above Burmese letters stay inside the line instead of clipping at the top

  let y = 10 // room for the marks above the first line's Burmese letters
  // Each row is `rowH` tall; text is centred in it so small and big text on one row line up.
  const text = (s: string, size: number, bold: boolean, x: number, max: number, align: CanvasTextAlign, rowH: number) => {
    g.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`
    g.textAlign = align
    g.fillText(fit(g, s, max), x, y + rowH / 2)
  }
  text(shop, 18, false, P, W - 2 * P, 'left', 26)
  y += 26
  text(it.name, 26, true, P, W - 2 * P, 'left', 36)
  y += 36
  g.font = `bold 26px ${FONT}`
  const priceW = Math.min(g.measureText(it.price).width, W - 2 * P)
  text(it.price, 26, true, W - P, W - 2 * P, 'right', 36)
  text(it.sub, 20, false, P, W - 2 * P - priceW - 8, 'left', 36)
  y += 38

  // Barcode bars must be whole dots wide to scan: measure at 1 dot per module, then use the widest whole size that
  // still leaves 10 modules of blank quiet zone on each side (scanners misread without it).
  const format = isValidEan13(it.code) ? 'EAN13' : 'CODE128'
  const bc = document.createElement('canvas')
  const draw = (width: number, height: number) => JsBarcode(bc, it.code, { format, width, height, fontSize: 20, textMargin: 0, margin: 0, flat: true })
  draw(1, 10)
  const mod = Math.max(1, Math.floor(W / (bc.width + 20)))
  draw(mod, H - 6 - y - 20)
  g.drawImage(bc, Math.floor((W - bc.width) / 2), y)
  return c
}
