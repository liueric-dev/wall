import { TILE_SIZE } from './coordinates'

// Four parallel structures, all kept in sync by setPixel/deletePixel:
//
// _pixels: flat key → color (queried by getPixel for hit-tests in placePixel).
// _tileIndex: key set per tile (legacy iterator; kept for compat).
// _tileCanvas: pre-rasterized 256×256 canvas per populated tile — the render
//   hot path drawImages these directly to the visible canvas. Per-frame cost
//   is O(visible tiles) regardless of pixel count.
// _pixelEventId: highest event id ever applied to a coord. Lets parallel
//   bootstrap chunks arrive in any order without older events stomping newer
//   ones (multiple pixel_events rows can exist for the same (x,y); only the
//   highest id should be visible).
const _pixels = new Map<string, string>()
const _tileIndex = new Map<string, Set<string>>()
const _tileCanvas = new Map<string, HTMLCanvasElement>()
const _pixelEventId = new Map<string, number>()

const pixelKey = (x: number, y: number) => `${x},${y}`
const tileKeyOf = (x: number, y: number) =>
  `${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`

function getOrCreateTileCanvas(tx: number, ty: number): HTMLCanvasElement {
  const tk = `${tx},${ty}`
  let c = _tileCanvas.get(tk)
  if (!c) {
    c = document.createElement('canvas')
    c.width = TILE_SIZE
    c.height = TILE_SIZE
    _tileCanvas.set(tk, c)
  }
  return c
}

// Convert (x, y) world pixel into local (lx, ly) within its tile, in screen
// orientation (Y grows downward on canvas, but world Y grows northward).
function toCanvasLocal(x: number, y: number): { tx: number; ty: number; lx: number; lyCanvas: number } {
  const tx = Math.floor(x / TILE_SIZE)
  const ty = Math.floor(y / TILE_SIZE)
  const lx = x - tx * TILE_SIZE
  const lyWorld = y - ty * TILE_SIZE
  const lyCanvas = TILE_SIZE - 1 - lyWorld
  return { tx, ty, lx, lyCanvas }
}

export function getPixel(x: number, y: number): string | undefined {
  return _pixels.get(pixelKey(x, y))
}

export function setPixel(x: number, y: number, color: string, eventId?: number): void {
  const k = pixelKey(x, y)
  // Gate: an incoming event with a known id only wins if it's newer than
  // whatever's currently painted at this coord. Optimistic local writes pass
  // no eventId and are always applied (they fall through to last-write-wins).
  if (eventId !== undefined) {
    const prev = _pixelEventId.get(k)
    if (prev !== undefined && prev >= eventId) return
    _pixelEventId.set(k, eventId)
  }
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

  const { tx, ty, lx, lyCanvas } = toCanvasLocal(x, y)
  const canvas = getOrCreateTileCanvas(tx, ty)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  ctx.fillRect(lx, lyCanvas, 1, 1)
}

export function deletePixel(x: number, y: number): void {
  const k = pixelKey(x, y)
  if (!_pixels.delete(k)) return
  _pixelEventId.delete(k)
  const tk = tileKeyOf(x, y)
  const bucket = _tileIndex.get(tk)
  if (bucket) {
    bucket.delete(k)
    if (bucket.size === 0) _tileIndex.delete(tk)
  }
  const { tx, ty, lx, lyCanvas } = toCanvasLocal(x, y)
  const canvas = _tileCanvas.get(`${tx},${ty}`)
  if (canvas) {
    canvas.getContext('2d')!.clearRect(lx, lyCanvas, 1, 1)
  }
}

export function getAllUserPixels(): Map<string, string> {
  return _pixels
}

export function getAllPixelEventIds(): Map<string, number> {
  return _pixelEventId
}

/** Iterate visible populated tiles for the renderer. */
export function* getVisibleTileCanvases(
  minX: number, maxX: number, minY: number, maxY: number,
): Generator<{ tx: number; ty: number; canvas: HTMLCanvasElement }> {
  const txMin = Math.floor(minX / TILE_SIZE)
  const txMax = Math.floor(maxX / TILE_SIZE)
  const tyMin = Math.floor(minY / TILE_SIZE)
  const tyMax = Math.floor(maxY / TILE_SIZE)
  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      const canvas = _tileCanvas.get(`${tx},${ty}`)
      if (canvas) yield { tx, ty, canvas }
    }
  }
}

/**
 * Legacy iterator — still exported for the dev/seed PlacementView preview path.
 * Per-frame iteration of all pixels in bounds; only used in non-hot paths.
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
