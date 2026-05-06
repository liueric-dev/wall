// Image-to-palette pixel-art conversion pipeline. See SPRINT-13.md Step 2.

import { PALETTE } from '../../config/tuning'
import { findNearestColor, hexToRgb } from './ColorDistance'
import { applyFloydSteinberg } from './Dithering'

export interface ConvertedAsset {
  width: number
  height: number
  pixels: Array<{ x: number; y: number; color: string }>
}

export interface ConvertOptions {
  targetWidth: number
  targetHeight: number
  dithering: boolean
  rotation: 0 | 90 | 180 | 270
  mirrorH: boolean
  mirrorV: boolean
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  targetWidth: 50,
  targetHeight: 50,
  dithering: false,
  rotation: 0,
  mirrorH: false,
  mirrorV: false,
}

export async function convertImageToAsset(
  source: HTMLImageElement | HTMLCanvasElement,
  options: ConvertOptions,
): Promise<ConvertedAsset> {
  const canvas = document.createElement('canvas')
  canvas.width = options.targetWidth
  canvas.height = options.targetHeight
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Apply rotation/mirror via canvas transforms before drawing.
  ctx.save()
  if (options.mirrorH) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  if (options.mirrorV) {
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
  }
  if (options.rotation !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((options.rotation * Math.PI) / 180)
    ctx.translate(-canvas.width / 2, -canvas.height / 2)
  }

  // Bilinear-ish resize via drawImage (browser interpolation).
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  ctx.restore()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const palette = [...PALETTE]
  const result = options.dithering
    ? applyFloydSteinberg(imageData, palette)
    : applyNearestColor(imageData, palette)

  const pixels: Array<{ x: number; y: number; color: string }> = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4
      const alpha = result[idx + 3]
      if (alpha < 128) continue
      const r = result[idx]
      const g = result[idx + 1]
      const b = result[idx + 2]
      const color = findNearestColor(r, g, b, palette)
      pixels.push({ x, y, color })
    }
  }

  return {
    width: canvas.width,
    height: canvas.height,
    pixels,
  }
}

function applyNearestColor(
  imageData: ImageData,
  palette: readonly string[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const hex = findNearestColor(r, g, b, palette)
    const [nr, ng, nb] = hexToRgb(hex)
    data[i] = nr
    data[i + 1] = ng
    data[i + 2] = nb
  }
  return data
}

export function colorDistribution(
  pixels: ConvertedAsset['pixels'],
): Array<{ color: string; count: number }> {
  const counts = new Map<string, number>()
  for (const p of pixels) {
    counts.set(p.color, (counts.get(p.color) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([color, count]) => ({ color, count }))
    .sort((a, b) => b.count - a.count)
}
