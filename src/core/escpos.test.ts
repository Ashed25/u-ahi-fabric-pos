import { expect, it } from 'vitest'
import { escPosRaster, INK } from './escpos'

const px = (w: number, h: number, black: [number, number][], grey: [number, number, number][] = []) => {
  const a = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [x, y] of black) a.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3)
  for (const [x, y, v] of grey) a.fill(v, (y * w + x) * 4, (y * w + x) * 4 + 3)
  return a
}

it('encodes a 1-bit raster with header, bit order, threshold and feed', () => {
  // 16×2: (0,0) black, (15,1) black, (8,0) just below INK (prints), (9,0) at INK (stays white)
  const b = escPosRaster(px(16, 2, [[0, 0], [15, 1]], [[8, 0, INK - 1], [9, 0, INK]]), 16, 2, 6)
  expect([...b]).toEqual([0x1b, 0x40, 0x1d, 0x76, 0x30, 0, 2, 0, 2, 0, 0x80, 0x80, 0x00, 0x01, ...Array(6).fill(0x0a)])
})

it('splits tall images into bands of 255 rows', () => {
  const b = escPosRaster(px(8, 300, []), 8, 300, 0)
  expect(b.length).toBe(2 + 8 + 255 + 8 + 45)
  expect([...b.subarray(2, 10)]).toEqual([0x1d, 0x76, 0x30, 0, 1, 0, 255, 0])
  expect([...b.subarray(265, 273)]).toEqual([0x1d, 0x76, 0x30, 0, 1, 0, 45, 0])
})
