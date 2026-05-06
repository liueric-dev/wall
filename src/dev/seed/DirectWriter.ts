// Direct Supabase writes for the dev/seed tool.
// Bypasses the regular placePixel pipeline. Bulk-inserts in chunks of ~500 rows.
// Maintains a localStorage undo stack of the last 20 placements.
// See SPRINT-13.md Step 6 + Undo Stack + Cleanup sections.

import { supabase } from '../../lib/supabase'
import type { SavedAsset } from './Library'

const BATCH_SIZE = 500
const UNDO_STACK_KEY = 'dev-seed-undo-stack'
const MAX_UNDO_ENTRIES = 20

export interface UndoEntry {
  assetName: string
  eventIds: number[]
  placedAt: number
}

function readUndoStack(): UndoEntry[] {
  const raw = localStorage.getItem(UNDO_STACK_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as UndoEntry[]) : []
  } catch {
    return []
  }
}

function writeUndoStack(stack: UndoEntry[]): void {
  localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack))
}

export function getUndoStack(): UndoEntry[] {
  return readUndoStack()
}

export function getUndoStackSize(): number {
  return readUndoStack().length
}

export function peekUndoEntry(): UndoEntry | null {
  const stack = readUndoStack()
  return stack.length === 0 ? null : stack[stack.length - 1]
}

function pushUndoEntry(entry: UndoEntry): void {
  const stack = readUndoStack()
  stack.push(entry)
  while (stack.length > MAX_UNDO_ENTRIES) stack.shift()
  writeUndoStack(stack)
}

function popUndoEntry(): UndoEntry | null {
  const stack = readUndoStack()
  const entry = stack.pop()
  writeUndoStack(stack)
  return entry ?? null
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 30) || 'asset'
}

export interface PlaceResult {
  success: boolean
  eventIds: number[]
  placed: number
  total: number
  error?: string
}

/**
 * Place an asset centered on (centerX, centerY) world coordinates.
 * Inserts directly into pixel_events using a `dev-seed-…` session_id.
 */
export async function placeAsset(
  asset: SavedAsset,
  centerX: number,
  centerY: number,
  onProgress?: (placed: number, total: number) => void,
): Promise<PlaceResult> {
  const sessionId = `dev-seed-${sanitizeName(asset.name)}-${Date.now()}`

  const offsetX = centerX - Math.floor(asset.width / 2)
  const offsetY = centerY - Math.floor(asset.height / 2)

  const rows = asset.pixels.map(p => ({
    x: offsetX + p.x,
    // Image-local Y grows downward; world Y grows upward (north). Flip
    // the asset vertically so it lands right-side-up on the wall.
    y: offsetY + (asset.height - 1 - p.y),
    color: p.color,
    session_id: sessionId,
    group_id: null,
    group_seq: null,
    input_mode: 't',
  }))

  const eventIds: number[] = []
  const total = rows.length
  if (total === 0) {
    return { success: true, eventIds, placed: 0, total }
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('pixel_events')
      .insert(batch)
      .select('id')

    if (error) {
      // Persist the partial undo entry so the user can clean up what was written.
      if (eventIds.length > 0) {
        pushUndoEntry({
          assetName: asset.name,
          eventIds: [...eventIds],
          placedAt: Date.now(),
        })
      }
      return {
        success: false,
        eventIds,
        placed: eventIds.length,
        total,
        error: error.message,
      }
    }

    if (data) {
      for (const row of data as Array<{ id: number }>) eventIds.push(row.id)
    }

    onProgress?.(Math.min(i + batch.length, total), total)
  }

  pushUndoEntry({
    assetName: asset.name,
    eventIds,
    placedAt: Date.now(),
  })

  return { success: true, eventIds, placed: eventIds.length, total }
}

export async function undoLastPlacement(): Promise<{
  success: boolean
  deletedCount?: number
  assetName?: string
  error?: string
}> {
  const entry = popUndoEntry()
  if (!entry) return { success: false, error: 'Undo stack is empty' }

  if (entry.eventIds.length === 0) {
    return { success: true, deletedCount: 0, assetName: entry.assetName }
  }

  const { error, count } = await supabase
    .from('pixel_events')
    .delete({ count: 'exact' })
    .in('id', entry.eventIds)

  if (error) {
    // Restore the entry so the user can retry.
    pushUndoEntry(entry)
    return { success: false, error: error.message }
  }

  return { success: true, deletedCount: count ?? 0, assetName: entry.assetName }
}

export async function deleteAllSeededPixels(): Promise<{
  success: boolean
  deletedCount?: number
  error?: string
}> {
  const { error, count } = await supabase
    .from('pixel_events')
    .delete({ count: 'exact' })
    .like('session_id', 'dev-seed-%')

  if (error) return { success: false, error: error.message }

  localStorage.removeItem(UNDO_STACK_KEY)
  return { success: true, deletedCount: count ?? 0 }
}
