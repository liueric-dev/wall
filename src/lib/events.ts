export type InputMode = 't' | 's'

export interface PixelEvent {
  id: string
  x: number
  y: number
  color: string              // hex string from palette
  session_id: string
  group_id: string | null    // null = single tap; UUID = drag group
  group_seq: number | null   // null for taps; 1,2,3... for drags
  placed_at: string          // ISO timestamp
  input_mode: InputMode      // always 't' this sprint
  // reserved — always default values for now
  depth: number              // 0
  parent_event_id: string | null // null
  city_id: number            // 1
  layer: number              // 0
}

const STORAGE_KEY = 'wall_events'

export function loadEvents(): PixelEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PixelEvent[]) : []
  } catch {
    return []
  }
}

export function saveEvents(events: PixelEvent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

export function appendEvent(event: PixelEvent): void {
  const events = loadEvents()
  events.push(event)
  saveEvents(events)
}
