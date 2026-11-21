import { packBits } from './escpos'

// calibration: gap between die-cut labels (BLIVO 40×30 ≈ 2 mm). Labels drifting a little further each time → adjust.
const GAP_MM = 2
// calibration: TSPL BITMAP prints a dot where the bit is 0, so our 1 = black bits are inverted. Label comes out as a negative → set false.
const INVERT = true

const ascii = (s: string) => new TextEncoder().encode(s)

/** TSPL job setup, sent once before the labels: label size, gap, orientation. */
export const tsplSetup = (wMm: number, hMm: number) => ascii(`SIZE ${wMm} mm,${hMm} mm\r\nGAP ${GAP_MM} mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\n`)

/** One label: clear, the whole label as a 1-bit bitmap at 0,0, print it. */
export function tsplLabel(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array<ArrayBuffer> {
  const bits = packBits(rgba, width, height)
  if (INVERT) for (let i = 0; i < bits.length; i++) bits[i] ^= 0xff
  const head = ascii(`CLS\r\nBITMAP 0,0,${width / 8},${height},0,`)
  const tail = ascii('\r\nPRINT 1,1\r\n')
  const out = new Uint8Array(head.length + bits.length + tail.length)
  out.set(head)
  out.set(bits, head.length)
  out.set(tail, head.length + bits.length)
  return out
}
