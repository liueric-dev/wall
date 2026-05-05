import { setPixel } from './pixelStore'
import type { PixelEntry } from './pixelApi'

let lastSeenTimestamp: string | null = null
const subscribers = new Set<() => void>()

export function applyIncomingEvents(events: PixelEntry[]): void {
  if (events.length === 0) return
  for (const e of events) {
    setPixel(e.x, e.y, e.colorIdx)
    if (lastSeenTimestamp === null || e.placed_at > lastSeenTimestamp) {
      lastSeenTimestamp = e.placed_at
    }
  }
  subscribers.forEach(fn => fn())
}

export function getLastSeenTimestamp(): string | null {
  return lastSeenTimestamp
}

export function resetEventHandler(): void {
  lastSeenTimestamp = null
}

export function subscribeToEvents(listener: () => void): () => void {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}
