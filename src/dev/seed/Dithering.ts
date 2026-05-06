// Floyd-Steinberg dithering, palette-quantizing each pixel and distributing
// the quantization error to the right + bottom neighbors.
// See SPRINT-13.md Step 3.

import { findNearestColor, hexToRgb } from './ColorDistance'

export function applyFloydSteinberg(
  imageData: ImageData,
  palette: readonly string[],
): Uint8ClampedArray {
  const { width, height, data } = imageData
  const result = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4

      if (result[idx + 3] < 128) continue

      const oldR = result[idx]
      const oldG = result[idx + 1]
      const oldB = result[idx + 2]

      const newHex = findNearestColor(oldR, oldG, oldB, palette)
      const [newR, newG, newB] = hexToRgb(newHex)

      result[idx] = newR
      result[idx + 1] = newG
      result[idx + 2] = newB

      const errR = oldR - newR
      const errG = oldG - newG
      const errB = oldB - newB

      distributeError(result, x + 1, y,     width, height, errR, errG, errB, 7 / 16)
      distributeError(result, x - 1, y + 1, width, height, errR, errG, errB, 3 / 16)
      distributeError(result, x,     y + 1, width, height, errR, errG, errB, 5 / 16)
      distributeError(result, x + 1, y + 1, width, height, errR, errG, errB, 1 / 16)
    }
  }

  return result
}

function distributeError(
  data: Uint8ClampedArray,
  x: number, y: number,
  width: number, height: number,
  errR: number, errG: number, errB: number,
  factor: number,
): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const idx = (y * width + x) * 4
  if (data[idx + 3] < 128) return
  data[idx]     = clamp255(data[idx]     + errR * factor)
  data[idx + 1] = clamp255(data[idx + 1] + errG * factor)
  data[idx + 2] = clamp255(data[idx + 2] + errB * factor)
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
