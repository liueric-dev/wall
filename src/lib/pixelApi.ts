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

// Pagination strategy: parallel keyset (id-range chunks).
//
// Why not OFFSET: Postgres `OFFSET N` walks N rows on every query, scaling
// linearly with offset. At ~150k rows the planner hits statement_timeout.
//
// Why not sequential keyset: with 175k+ matching rows, ~175 sequential
// round-trips × ~80ms = ~14s cold-load.
//
// Approach: get max(id) in bounds (one fast probe — uses btree on id),
// split [1, max_id] into N_CHUNKS parallel ranges, paginate keyset-style
// inside each range. Each query is a bounded index range scan — fast and
// constant per page regardless of total dataset size.
const PAGE_SIZE = 1000
// Higher N_CHUNKS makes the worst case (all rows clustered in one id-range)
// faster, since the cluster still gets split. 32 keeps individual chunk
// pagination depth < 6 even when the cluster contains 175k rows.
const N_CHUNKS = 32
const MAX_PAGES_PER_CHUNK = 50  // safety: 50k rows per chunk → 1.6M total cap

async function fetchMaxId(bounds: Bounds, sinceIso: string | null): Promise<number> {
  let q = supabase
    .from('pixel_events')
    .select('id')
    .gte('x', bounds.minX).lte('x', bounds.maxX)
    .gte('y', bounds.minY).lte('y', bounds.maxY)
  if (sinceIso !== null) q = q.gt('placed_at', sinceIso)
  const { data, error } = await q
    .order('id', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return 0
  return (data[0] as { id: number }).id
}

async function fetchChunkKeyset(
  bounds: Bounds,
  sinceIso: string | null,
  startIdInclusive: number,
  endIdInclusive: number,
): Promise<PixelEntry[]> {
  const out: PixelEntry[] = []
  let cursor = startIdInclusive - 1  // gt(cursor) → first row is at startIdInclusive
  for (let page = 0; page < MAX_PAGES_PER_CHUNK; page++) {
    let q = supabase
      .from('pixel_events')
      .select('id, x, y, color, placed_at')
      .gte('x', bounds.minX).lte('x', bounds.maxX)
      .gte('y', bounds.minY).lte('y', bounds.maxY)
      .gt('id', cursor)
      .lte('id', endIdInclusive)
    if (sinceIso !== null) q = q.gt('placed_at', sinceIso)
    const { data, error } = await q
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
    if (error || !data || data.length === 0) break
    const rows = (data as DbRow[]).map(dbRowToEntry)
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
    cursor = (data[data.length - 1] as DbRow).id
  }
  return out
}

async function loadAll(bounds: Bounds, sinceIso: string | null): Promise<PixelEntry[]> {
  const maxId = await fetchMaxId(bounds, sinceIso)
  if (maxId === 0) return []

  // Split [1, maxId] into N_CHUNKS contiguous id-ranges.
  const chunkSize = Math.ceil(maxId / N_CHUNKS)
  const chunks: Array<Promise<PixelEntry[]>> = []
  for (let i = 0; i < N_CHUNKS; i++) {
    const start = i * chunkSize + 1
    const end = i === N_CHUNKS - 1 ? maxId : (i + 1) * chunkSize
    if (start > end) continue
    chunks.push(fetchChunkKeyset(bounds, sinceIso, start, end))
  }
  const results = await Promise.all(chunks)
  return results.flat()
}

export async function loadViewportPixels(bounds: Bounds): Promise<PixelEntry[]> {
  return loadAll(bounds, null)
}

export async function fetchNewEvents(
  sinceIso: string,
  bounds: Bounds,
): Promise<PixelEntry[]> {
  return loadAll(bounds, sinceIso)
}
