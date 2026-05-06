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

// PostgREST caps responses at 1000 rows by default. We paginate to get the full
// set, but use a parallel fetch strategy for cold-load: do an exact-count probe,
// then fan out all pages in parallel via Promise.all. Cuts cold-load from ~N
// sequential round-trips to ~1 round-trip-equivalent of latency for any N.
const PAGE_SIZE = 1000
const MAX_PAGES = 200  // safety: 200,000 events per call

async function fetchPage(bounds: Bounds, sinceIso: string | null, from: number): Promise<{
  rows: PixelEntry[]
  totalCount: number | null
  error: string | null
}> {
  let q = supabase
    .from('pixel_events')
    .select('id, x, y, color, placed_at', { count: 'exact' })
    .gte('x', bounds.minX)
    .lte('x', bounds.maxX)
    .gte('y', bounds.minY)
    .lte('y', bounds.maxY)
  if (sinceIso !== null) q = q.gt('placed_at', sinceIso)
  const { data, error, count } = await q
    .order('placed_at', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
  if (error || !data) return { rows: [], totalCount: null, error: error?.message ?? 'unknown' }
  return {
    rows: (data as DbRow[]).map(dbRowToEntry),
    totalCount: count ?? null,
    error: null,
  }
}

async function loadAllPagesParallel(bounds: Bounds, sinceIso: string | null): Promise<PixelEntry[]> {
  // First request: get page 0 + the exact total count.
  const first = await fetchPage(bounds, sinceIso, 0)
  if (first.error) return []
  const all: PixelEntry[][] = [first.rows]
  const total = first.totalCount
  if (total === null || total <= PAGE_SIZE) return first.rows

  // Fan out remaining pages in parallel.
  const pageStarts: number[] = []
  for (let from = PAGE_SIZE; from < total && from < MAX_PAGES * PAGE_SIZE; from += PAGE_SIZE) {
    pageStarts.push(from)
  }
  const rest = await Promise.all(
    pageStarts.map(from => fetchPage(bounds, sinceIso, from)),
  )
  for (const r of rest) {
    if (!r.error) all.push(r.rows)
  }
  return all.flat()
}

export async function loadViewportPixels(bounds: Bounds): Promise<PixelEntry[]> {
  return loadAllPagesParallel(bounds, null)
}

export async function fetchNewEvents(
  sinceIso: string,
  bounds: Bounds,
): Promise<PixelEntry[]> {
  return loadAllPagesParallel(bounds, sinceIso)
}
