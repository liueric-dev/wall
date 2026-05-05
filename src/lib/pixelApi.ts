import { supabase } from './supabase'
import { PALETTE } from '../data/testDoodles'
import { TILE_SIZE } from './coordinates'
import type { PixelEvent } from './events'

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type PixelEntry = {
  x: number
  y: number
  colorIdx: number
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
    colorIdx: parseInt(row.color, 10),
    placed_at: row.placed_at,
    eventId: row.id,
  }
}

export async function insertPixelEvent(
  event: PixelEvent,
  colorIdx: number,
): Promise<{ eventId: number | null; error: string | null }> {
  const { data, error } = await supabase
    .from('pixel_events')
    .insert({
      x: event.x,
      y: event.y,
      color: String(colorIdx),
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

export async function upsertTile(
  tileX: number,
  tileY: number,
  localX: number,
  localY: number,
  colorIdx: number,
  eventId: number,
): Promise<void> {
  // Fetch existing tile (BYTEA comes back as \x-prefixed hex via PostgREST)
  const { data } = await supabase
    .from('tiles')
    .select('pixels')
    .eq('tile_x', tileX)
    .eq('tile_y', tileY)
    .maybeSingle()

  const size = TILE_SIZE * TILE_SIZE
  let pixels: Uint8Array

  if (data?.pixels) {
    // PostgREST returns BYTEA as \x-prefixed hex string
    const hex = (data.pixels as string).replace(/^\\x/, '')
    pixels = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2)
      pixels[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  } else {
    pixels = new Uint8Array(size).fill(0xff) // 0xff = empty
  }

  pixels[localY * TILE_SIZE + localX] = colorIdx

  // Re-encode as \x-prefixed hex for Supabase
  let hex = '\\x'
  pixels.forEach(b => { hex += b.toString(16).padStart(2, '0') })

  await supabase.from('tiles').upsert({
    tile_x: tileX,
    tile_y: tileY,
    pixels: hex,
    last_event_id: eventId,
    updated_at: new Date().toISOString(),
  })
}

// Derive the PALETTE index for a hex color string (used when converting legacy events)
export function paletteIndexFor(hex: string): number {
  const idx = PALETTE.indexOf(hex)
  return idx === -1 ? 0 : idx
}
