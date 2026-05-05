import { supabase } from './supabase'
import type { PixelEvent } from './events'

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type PixelEntry = {
  x: number
  y: number
  color: string  // hex like '#1a1a1a'
  placed_at: string
  eventId: number
}

interface DbRow {
  id: number
  x: number
  y: number
  color: string
  placed_at: string
}

function dbRowToEntry(row: DbRow): PixelEntry {
  return {
    x: row.x,
    y: row.y,
    color: row.color,
    placed_at: row.placed_at,
    eventId: row.id,
  }
}

export async function insertPixelEvent(
  event: PixelEvent,
  colorHex: string,
): Promise<{ eventId: number | null; error: string | null }> {
  const { data, error } = await supabase
    .from('pixel_events')
    .insert({
      x: event.x,
      y: event.y,
      color: colorHex,
      session_id: event.session_id,
      group_id: event.group_id,
      group_seq: event.group_seq,
      input_mode: event.input_mode,
    })
    .select('id')
    .single()

  if (error) return { eventId: null, error: error.message }
  return { eventId: (data as { id: number }).id, error: null }
}

// PostgREST caps responses at 1000 rows by default; paginate via Range until exhausted.
const PAGE_SIZE = 1000
const MAX_PAGES = 50  // safety: 50,000 events per call

export async function loadViewportPixels(bounds: Bounds): Promise<PixelEntry[]> {
  const all: PixelEntry[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('pixel_events')
      .select('id, x, y, color, placed_at')
      .gte('x', bounds.minX)
      .lte('x', bounds.maxX)
      .gte('y', bounds.minY)
      .lte('y', bounds.maxY)
      .order('placed_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error || !data) break
    all.push(...(data as DbRow[]).map(dbRowToEntry))
    if (data.length < PAGE_SIZE) break
  }
  return all
}

export async function fetchNewEvents(
  sinceIso: string,
  bounds: Bounds,
): Promise<PixelEntry[]> {
  const all: PixelEntry[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await supabase
      .from('pixel_events')
      .select('id, x, y, color, placed_at')
      .gte('x', bounds.minX)
      .lte('x', bounds.maxX)
      .gte('y', bounds.minY)
      .lte('y', bounds.maxY)
      .gt('placed_at', sinceIso)
      .order('placed_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error || !data) break
    all.push(...(data as DbRow[]).map(dbRowToEntry))
    if (data.length < PAGE_SIZE) break
  }
  return all
}
