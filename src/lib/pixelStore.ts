import { TILE_SIZE } from './coordinates'

// Flat map: key = "x,y", value = hex color string (e.g. '#1a1a1a')
const _pixels = new Map<string, string>()

// Parallel spatial index: tileKey "tx,ty" → set of pixelKeys "x,y" inside that tile.
// Render hot-path iterates only visible tiles' sets, not the entire flat map,
// keeping per-frame cost proportional to visible pixels rather than total pixels.
const _tileIndex = new Map<string, Set<string>>()

const pixelKey = (x: number, y: number) => `${x},${y}`
const tileKeyOf = (x: number, y: number) =>
  `${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`

export function getPixel(x: number, y: number): string | undefined {
  return _pixels.get(pixelKey(x, y))
}

export function setPixel(x: number, y: number, color: string): void {
  const k = pixelKey(x, y)
  const tk = tileKeyOf(x, y)
  if (!_pixels.has(k)) {
    let bucket = _tileIndex.get(tk)
    if (!bucket) {
      bucket = new Set<string>()
      _tileIndex.set(tk, bucket)
    }
    bucket.add(k)
  }
  _pixels.set(k, color)
}

export function deletePixel(x: number, y: number): void {
  const k = pixelKey(x, y)
  if (_pixels.delete(k)) {
    const tk = tileKeyOf(x, y)
    const bucket = _tileIndex.get(tk)
    if (bucket) {
      bucket.delete(k)
      if (bucket.size === 0) _tileIndex.delete(tk)
    }
  }
}

export function getAllUserPixels(): Map<string, string> {
  return _pixels
}

/**
 * Iterate every (key, color) for pixels whose tiles intersect the given world bounds.
 * O(visible tiles × pixels-per-tile), independent of total wall pixel count.
 * Caller still needs to do a fine-grained per-pixel bounds test on the keys.
 */
export function* getPixelsInBounds(
  minX: number, maxX: number, minY: number, maxY: number,
): Generator<[string, string]> {
  const txMin = Math.floor(minX / TILE_SIZE)
  const txMax = Math.floor(maxX / TILE_SIZE)
  const tyMin = Math.floor(minY / TILE_SIZE)
  const tyMax = Math.floor(maxY / TILE_SIZE)
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      const bucket = _tileIndex.get(`${tx},${ty}`)
      if (!bucket) continue
      for (const k of bucket) {
        const color = _pixels.get(k)
        if (color !== undefined) yield [k, color]
      }
    }
  }
}
