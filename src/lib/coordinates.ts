// NYC bounding box
export const NYC_SW = { lat: 40.4774, lng: -74.2591 }
export const NYC_NE = { lat: 40.9176, lng: -73.7004 }

// World pixel grid dimensions (10ft per pixel)
// ~37 miles EW × 5280 ft/mi ÷ 10 ft/px = ~19,536
// ~35 miles NS × 5280 ft/mi ÷ 10 ft/px = ~18,480
// Using values derived from the actual lat/lng span with ~364ft per 0.001 degree lat
// 1 degree lat ≈ 364,000 ft → 36,400 px
// 1 degree lng ≈ 273,000 ft at NYC lat (cos(40.7°) ≈ 0.758) → 27,300 px
const LAT_SPAN = NYC_NE.lat - NYC_SW.lat   // ~0.4402 degrees
const LNG_SPAN = NYC_NE.lng - NYC_SW.lng   // ~0.5587 degrees

// Feet per degree (approximate at NYC latitude)
const FT_PER_DEG_LAT = 364_000
const FT_PER_DEG_LNG = 273_000  // cos(40.7°) × 364,000

const FT_PER_PIXEL = 10

export const WORLD_WIDTH = Math.round((LNG_SPAN * FT_PER_DEG_LNG) / FT_PER_PIXEL)
export const WORLD_HEIGHT = Math.round((LAT_SPAN * FT_PER_DEG_LAT) / FT_PER_PIXEL)

export const TILE_SIZE = 256
export const TILE_COLS = Math.ceil(WORLD_WIDTH / TILE_SIZE)
export const TILE_ROWS = Math.ceil(WORLD_HEIGHT / TILE_SIZE)

export interface Viewport {
  // offset of the world origin from screen origin, in screen pixels
  originX: number
  originY: number
  // how many screen pixels per world pixel
  scale: number
}

export function latLngToWorld(lat: number, lng: number): { x: number; y: number } {
  const x = Math.round(((lng - NYC_SW.lng) / LNG_SPAN) * WORLD_WIDTH)
  // Y=0 is south (SW corner), increases northward
  const y = Math.round(((lat - NYC_SW.lat) / LAT_SPAN) * WORLD_HEIGHT)
  return { x, y }
}

export function worldToLatLng(x: number, y: number): { lat: number; lng: number } {
  const lng = NYC_SW.lng + (x / WORLD_WIDTH) * LNG_SPAN
  const lat = NYC_SW.lat + (y / WORLD_HEIGHT) * LAT_SPAN
  return { lat, lng }
}

export function worldToTile(x: number, y: number): { tx: number; ty: number; px: number; py: number } {
  const tx = Math.floor(x / TILE_SIZE)
  const ty = Math.floor(y / TILE_SIZE)
  const px = x - tx * TILE_SIZE
  const py = y - ty * TILE_SIZE
  return { tx, ty, px, py }
}

export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE, y: ty * TILE_SIZE }
}

// World Y=0 is south, but screen Y=0 is top — so we flip the Y axis when mapping to screen
export function worldToScreen(x: number, y: number, vp: Viewport): { sx: number; sy: number } {
  const sx = vp.originX + x * vp.scale
  // Flip: world Y increases north (up), screen Y increases down
  const sy = vp.originY + (WORLD_HEIGHT - y) * vp.scale
  return { sx, sy }
}

export function screenToWorld(sx: number, sy: number, vp: Viewport): { x: number; y: number } {
  const x = (sx - vp.originX) / vp.scale
  const y = WORLD_HEIGHT - (sy - vp.originY) / vp.scale
  return { x, y }
}
