import { PALETTE } from '../data/testDoodles'
import type { PixelEvent } from './events'

// key = "x,y", value = palette index
const _pixels = new Map<string, number>()

const key = (x: number, y: number) => `${x},${y}`

export function getPixel(x: number, y: number): number | undefined {
  return _pixels.get(key(x, y))
}

export function setPixel(x: number, y: number, color: number): void {
  _pixels.set(key(x, y), color)
}

export function deletePixel(x: number, y: number): void {
  _pixels.delete(key(x, y))
}

export function getAllUserPixels(): Map<string, number> {
  return _pixels
}

export function replayEvents(events: PixelEvent[]): void {
  _pixels.clear()
  for (const e of events) {
    const idx = PALETTE.indexOf(e.color)
    if (idx !== -1) setPixel(e.x, e.y, idx)
    // last write wins — handles overwrites correctly
  }
}
