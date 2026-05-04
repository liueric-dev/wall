import { WORLD_HEIGHT } from './coordinates'
import type { Viewport } from './coordinates'

type SavedPosition = {
  centerX: number
  centerY: number
  zoom: number
  savedAt: number
}

const KEY = 'wall_last_position'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function savePosition(vp: Viewport, screenW: number, screenH: number) {
  const centerX = (screenW / 2 - vp.originX) / vp.scale
  const centerY = WORLD_HEIGHT - (screenH / 2 - vp.originY) / vp.scale
  const pos: SavedPosition = { centerX, centerY, zoom: vp.scale, savedAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify(pos))
}

export function getRecentSavedPosition(): SavedPosition | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const pos: SavedPosition = JSON.parse(raw)
    if (Date.now() - pos.savedAt > MAX_AGE_MS) return null
    return pos
  } catch {
    return null
  }
}
