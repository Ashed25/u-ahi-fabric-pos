/** EAN-13 with an in-store prefix (20–29): numeric only, and the check digit catches misreads. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('need 12 digits')
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12])
}

/** seq is the never-reused counter from settings. */
export function internalEan13(seq: number, prefix = '20'): string {
  if (!/^2\d$/.test(prefix)) throw new Error('in-store prefix must be 20–29')
  if (!Number.isSafeInteger(seq) || seq < 1 || seq > 9_999_999_999) throw new Error('bad seq')
  const first12 = prefix + String(seq).padStart(10, '0')
  return first12 + ean13CheckDigit(first12)
}

/** A 13-digit code starting 20–29 that fails its check digit is a misread, not an unknown product. */
export function looksLikeMisread(code: string): boolean {
  return /^2\d{12}$/.test(code) && !isValidEan13(code)
}
