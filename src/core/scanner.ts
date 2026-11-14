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
  private last = -Infinity

  constructor(
    // 100 ms tolerates Bluetooth jitter; people typing digits are slower than this.
    private maxGapMs = 100,
    private minLength = 4,
  ) {}

  /** Feed every keydown; returns the scanned code when a scan completes, else null. */
  feed(e: KeyLike): string | null {
    const gap = e.timeStamp - this.last
    this.last = e.timeStamp
    if (isEnter(e)) {
      const code = gap <= this.maxGapMs && this.buf.length >= this.minLength ? this.buf : null
      this.buf = ''
      return code
    }
    const d = digitOf(e)
    if (d === null) {
      if (!isModifier(e)) this.buf = ''
      return null
    }
    // A slow key starts a new buffer: humans typing digits never form a scan.
    this.buf = gap <= this.maxGapMs ? this.buf + d : d
    return null
  }

  reset() {
    this.buf = ''
  }
}
