// calibration: a pixel darker than this prints black. Raise it if thin Burmese strokes break up on paper; lower it if text looks blotchy.
export const INK = 160
const BAND = 255 // rows per GS v 0 command; cheap printers choke on one huge image

/** RGBA pixels → ESC/POS: init, 1-bit raster (GS v 0) with a hard threshold and no dithering so Burmese stays sharp, then `feed` blank lines. */
export function escPosRaster(rgba: Uint8ClampedArray, width: number, height: number, feed = 6): Uint8Array<ArrayBuffer> {
  if (width % 8) throw new Error('raster width must be a multiple of 8')
  const wb = width / 8
  const bands = Math.ceil(height / BAND)
  const out = new Uint8Array(2 + bands * 8 + wb * height + feed)
  let o = 0
  out[o++] = 0x1b // ESC @ = reset
  out[o++] = 0x40
  for (let y0 = 0; y0 < height; y0 += BAND) {
    const h = Math.min(BAND, height - y0)
    out.set([0x1d, 0x76, 0x30, 0, wb & 255, wb >> 8, h & 255, h >> 8], o)
    o += 8
    for (let y = y0; y < y0 + h; y++) {
      for (let xb = 0; xb < wb; xb++) {
        let byte = 0
        for (let bit = 0; bit < 8; bit++) {
          const i = (y * width + xb * 8 + bit) * 4
          if ((rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000 < INK) byte |= 0x80 >> bit
        }
        out[o++] = byte
      }
    }
  }
  out.fill(0x0a, o) // LF × feed
  return out
}
