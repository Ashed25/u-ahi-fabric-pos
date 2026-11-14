/**
 * HID barcode scanners type digits very fast and end with Enter.
 * Uses KeyboardEvent.code (physical key) so a Burmese keyboard layout can't change the digits,
 * and maps Myanmar digits ၀–၉ in case a layout sends them anyway.
 */
export interface KeyLike {
  code: string
  key: string
  timeStamp: number
}

const MY_DIGITS = '၀၁၂၃၄၅၆၇၈၉'

export function digitOf(e: KeyLike): string | null {
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code)
  if (m) return m[1]
  if (/^\d$/.test(e.key)) return e.key
  const i = MY_DIGITS.indexOf(e.key)
  return i >= 0 ? String(i) : null
}

const isEnter = (e: KeyLike) => e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter'
const isModifier = (e: KeyLike) => e.key === 'Shift' || e.code.startsWith('Shift')

export class ScanBuffer {
  private buf = ''
  private start = 0
  private last = -Infinity

  constructor(
    // Average per key: scanners ~1–20 ms, people typing 100+ ms. Averaging tolerates one late key (Bluetooth, busy tablet).
    private avgMs = 60,
    private resetMs = 500, // a pause this long starts a fresh buffer
    private minLength = 4,
  ) {}

  /** Feed every keydown; returns the scanned code when a scan completes, else null. */
  feed(e: KeyLike): string | null {
    const gap = e.timeStamp - this.last
    this.last = e.timeStamp
    if (isEnter(e)) {
      const fast = this.buf.length >= this.minLength && (e.timeStamp - this.start) / this.buf.length <= this.avgMs
      const code = fast ? this.buf : null
      this.buf = ''
      return code
    }
    const d = digitOf(e)
    if (d === null) {
      if (!isModifier(e)) this.buf = ''
      return null
    }
    if (!this.buf || gap > this.resetMs) {
      this.buf = d
      this.start = e.timeStamp
    } else this.buf += d
    return null
  }

  reset() {
    this.buf = ''
  }
}
