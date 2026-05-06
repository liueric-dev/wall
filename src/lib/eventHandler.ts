import { setPixel } from './pixelStore'
import type { PixelEntry } from './pixelApi'

let lastSeenTimestamp: string | null = null
const subscribers = new Set<() => void>()

export function applyIncomingEvents(events: PixelEntry[]): void {
  if (events.length === 0) return
  for (const e of events) {
    setPixel(e.x, e.y, e.color, e.eventId)
    if (lastSeenTimestamp === null || e.placed_at > lastSeenTimestamp) {
      lastSeenTimestamp = e.placed_at
    }
  }
  subscribers.forEach(fn => fn())
}

export function getLastSeenTimestamp(): string | null {
  return lastSeenTimestamp
}

/** Used when warm-hydrating from the IndexedDB cache so polling resumes from
 *  the cached high-water mark instead of refetching everything. */
export function setLastSeenTimestamp(iso: string | null): void {
  lastSeenTimestamp = iso
}

export function resetEventHandler(): void {
  lastSeenTimestamp = null
}

export function subscribeToEvents(listener: () => void): () => void {
  subscribers.add(listener)
  return () => { subscribers.delete(listener) }
}
