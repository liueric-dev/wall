import { TILE_SIZE, TILE_COLS, TILE_ROWS } from './coordinates'
import { PALETTE, getTestPixels } from '../data/testDoodles'
import type { Pixel } from '../data/testDoodles'

const EMPTY = 0xff

function buildTileData(pixels: Pixel[]): Map<string, Uint8Array> {
  const tiles = new Map<string, Uint8Array>()
  for (const { x, y, color } of pixels) {
    const tx = Math.floor(x / TILE_SIZE)
    const ty = Math.floor(y / TILE_SIZE)
    if (tx < 0 || ty < 0 || tx >= TILE_COLS || ty >= TILE_ROWS) continue
    const key = `${tx},${ty}`
    let data = tiles.get(key)
    if (!data) {
      data = new Uint8Array(TILE_SIZE * TILE_SIZE).fill(EMPTY)
      tiles.set(key, data)
    }
    const px = x - tx * TILE_SIZE
    const py = y - ty * TILE_SIZE
    data[py * TILE_SIZE + px] = color
  }
  return tiles
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

const PALETTE_RGB = PALETTE.map(parseHex)

function rasterizeTile(data: Uint8Array): ImageData {
  const img = new ImageData(TILE_SIZE, TILE_SIZE)
  const buf = img.data
  for (let i = 0; i < data.length; i++) {
    const idx = data[i]
    if (idx === EMPTY) continue
    const [r, g, b] = PALETTE_RGB[idx]
    const o = i * 4
    buf[o]     = r
    buf[o + 1] = g
    buf[o + 2] = b
    buf[o + 3] = 255
  }
  return img
}

let _tileData: Map<string, Uint8Array> | null = null
const _bitmapCache = new Map<string, ImageBitmap>()
const _inflight = new Set<string>()

function getTileData(): Map<string, Uint8Array> {
  if (!_tileData) _tileData = buildTileData(getTestPixels())
  return _tileData
}

export function hasTilePixels(tx: number, ty: number): boolean {
  return getTileData().has(`${tx},${ty}`)
}

/** Synchronous: returns cached ImageBitmap if ready, null if empty, undefined if still loading. */
export function getTileBitmapSync(tx: number, ty: number): ImageBitmap | null | undefined {
  if (!hasTilePixels(tx, ty)) return null
  const key = `${tx},${ty}`
  return _bitmapCache.get(key) ?? undefined
}

/** Kick off async bitmap creation; calls onReady when done. */
export function prefetchTileBitmap(tx: number, ty: number, onReady: () => void): void {
  const key = `${tx},${ty}`
  if (_bitmapCache.has(key) || _inflight.has(key) || !hasTilePixels(tx, ty)) return
  _inflight.add(key)
  const data = getTileData().get(key)!
  const img = rasterizeTile(data)
  createImageBitmap(img).then(bmp => {
    _inflight.delete(key)
    _bitmapCache.set(key, bmp)
    onReady()
  })
}

/** Sync fallback for immediate drawing while bitmap is loading. */
export function getTileImageData(tx: number, ty: number): ImageData | null {
  const data = getTileData().get(`${tx},${ty}`)
  return data ? rasterizeTile(data) : null
}

/** Returns the palette index of the fake background pixel at (x,y), or null if empty. */
export function getRawPixelColor(x: number, y: number): number | null {
  const tx = Math.floor(x / TILE_SIZE)
  const ty = Math.floor(y / TILE_SIZE)
  const data = getTileData().get(`${tx},${ty}`)
  if (!data) return null
  const px = x - tx * TILE_SIZE
  const py = y - ty * TILE_SIZE
  const idx = data[py * TILE_SIZE + px]
  return idx === EMPTY ? null : idx
}

export { TILE_COLS, TILE_ROWS }
