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
// N_CHUNKS shards id-space; MAX_CONCURRENCY caps how many requests are
// actually in-flight at once. Sharding small + capping concurrency keeps
// individual chunk depth low while never overwhelming the Supabase pool
// or the browser's HTTP/2 stream budget.
const N_CHUNKS = 32
const MAX_CONCURRENCY = 8
const MAX_PAGES_PER_CHUNK = 50  // safety: 50k rows per chunk → 1.6M total cap

// Per-request guardrails. Without these, a stalled HTTP/2 stream or a
// transient PostgREST error would either hang the whole bootstrap (Promise.all
// waits forever for one stuck request) or silently truncate the dataset.
const REQUEST_TIMEOUT_MS = 15000
const RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Run a Supabase query builder with a hard timeout and retry-with-backoff.
 *
 * The builder is awaitable (PostgrestFilterBuilder implements `.then`); we
 * pass it an AbortSignal via `.abortSignal()` so timeouts cancel the in-flight
 * fetch instead of leaking. On timeout or 5xx we back off and try again.
 * After exhausted retries we throw — the previous code silently `break`ed
 * out of pagination on error, which produced partial datasets without
 * surfacing failure to the UI.
 */
async function execWithRetry<T>(
  build: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
  label: string,
): Promise<T | null> {
  let lastErr: unknown
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    const ac = new AbortController()
    const timer = setTimeout(
      () => ac.abort(new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`)),
      REQUEST_TIMEOUT_MS,
    )
    try {
      const { data, error } = await build(ac.signal)
      if (error) throw new Error(error.message ?? String(error))
      return data
    } catch (err) {
      lastErr = err
    } finally {
      clearTimeout(timer)
    }
    if (attempt < RETRY_ATTEMPTS - 1) {
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(4, attempt))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`${label}: exhausted retries`)
}

/**
 * Concurrency limiter. With N_CHUNKS=32 firing all at once, the browser's
 * HTTP/2 stream concurrency limit and Supabase's PostgREST connection pool
 * both push back, queueing requests server- or client-side without any
 * timeout safety net. Capping in-flight at MAX_CONCURRENCY keeps the system
 * within healthy operating limits.
 */
class Semaphore {
  private active = 0
  private waiters: Array<() => void> = []
  private max: number

  constructor(max: number) {
    this.max = max
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
    this.active++
    try {
      return await fn()
    } finally {
      this.active--
      const next = this.waiters.shift()
      if (next) next()
    }
  }
}

async function fetchMaxId(bounds: Bounds, sinceIso: string | null): Promise<number> {
  const data = await execWithRetry<{ id: number }[]>(
    signal => {
      let q = supabase
        .from('pixel_events')
        .select('id')
        .gte('x', bounds.minX).lte('x', bounds.maxX)
        .gte('y', bounds.minY).lte('y', bounds.maxY)
      if (sinceIso !== null) q = q.gt('placed_at', sinceIso)
      return q.order('id', { ascending: false }).limit(1).abortSignal(signal)
    },
    'fetchMaxId',
  )
  if (!data || data.length === 0) return 0
  return data[0].id
}

async function fetchChunkKeyset(
  bounds: Bounds,
  sinceIso: string | null,
  startIdInclusive: number,
  endIdInclusive: number,
  onChunk: (entries: PixelEntry[]) => void,
): Promise<void> {
  let cursor = startIdInclusive - 1  // gt(cursor) → first row is at startIdInclusive
  for (let page = 0; page < MAX_PAGES_PER_CHUNK; page++) {
    const data = await execWithRetry<DbRow[]>(
      signal => {
        let q = supabase
          .from('pixel_events')
          .select('id, x, y, color, placed_at')
          .gte('x', bounds.minX).lte('x', bounds.maxX)
          .gte('y', bounds.minY).lte('y', bounds.maxY)
          .gt('id', cursor)
          .lte('id', endIdInclusive)
        if (sinceIso !== null) q = q.gt('placed_at', sinceIso)
        return q.order('id', { ascending: true }).limit(PAGE_SIZE).abortSignal(signal)
      },
      `chunk[${startIdInclusive}-${endIdInclusive}] p${page}`,
    )
    if (!data || data.length === 0) return
    onChunk(data.map(dbRowToEntry))
    if (data.length < PAGE_SIZE) return
    cursor = data[data.length - 1].id
  }
}

/**
 * Stream all matching pixels through `onChunk` as each page resolves, rather
 * than collecting into one fat array and applying after all chunks finish.
 * Lets the renderer paint pixels in waves during cold-load.
 */
async function streamAll(
  bounds: Bounds,
  sinceIso: string | null,
  onChunk: (entries: PixelEntry[]) => void,
): Promise<void> {
  const maxId = await fetchMaxId(bounds, sinceIso)
  if (maxId === 0) return

  const chunkSize = Math.ceil(maxId / N_CHUNKS)
  const sem = new Semaphore(MAX_CONCURRENCY)
  const tasks: Array<Promise<void>> = []
  for (let i = 0; i < N_CHUNKS; i++) {
    const start = i * chunkSize + 1
    const end = i === N_CHUNKS - 1 ? maxId : (i + 1) * chunkSize
    if (start > end) continue
    tasks.push(sem.run(() => fetchChunkKeyset(bounds, sinceIso, start, end, onChunk)))
  }
  await Promise.all(tasks)
}

/**
 * Bootstrap path. Streams pixels into `onChunk` as they arrive so the user
 * sees painting begin before the whole dataset is fetched.
 * Throws if any chunk fails after retries — caller surfaces this in the UI.
 */
export async function streamViewportPixels(
  bounds: Bounds,
  onChunk: (entries: PixelEntry[]) => void,
): Promise<void> {
  await streamAll(bounds, null, onChunk)
}

/**
 * Polling path. Returns a buffered list — deltas are typically small.
 */
export async function fetchNewEvents(
  sinceIso: string,
  bounds: Bounds,
): Promise<PixelEntry[]> {
  const out: PixelEntry[] = []
  await streamAll(bounds, sinceIso, chunk => { out.push(...chunk) })
  return out
}

/**
 * Buffered cold-load — kept for the dev/seed PlacementView tool which expects
 * a single Promise<PixelEntry[]>. New code should prefer streamViewportPixels.
 */
export async function loadViewportPixels(bounds: Bounds): Promise<PixelEntry[]> {
  const out: PixelEntry[] = []
  await streamAll(bounds, null, chunk => { out.push(...chunk) })
  return out
}
