import { describe, it, expect } from 'vitest'
import {
  latLngToWorld, worldToLatLng,
  worldToTile, tileToWorld,
  worldToScreen, screenToWorld,
  NYC_SW, NYC_NE, WORLD_WIDTH, WORLD_HEIGHT, TILE_SIZE,
  type Viewport,
} from './coordinates'

describe('coordinate dimensions', () => {
  it('world grid is approximately the right size', () => {
    // ~37 miles EW → ~19,000–20,000 px; ~35 miles NS → ~16,000–18,000 px
    expect(WORLD_WIDTH).toBeGreaterThan(14000)
    expect(WORLD_WIDTH).toBeLessThan(22000)
    expect(WORLD_HEIGHT).toBeGreaterThan(12000)
    expect(WORLD_HEIGHT).toBeLessThan(20000)
  })
})

describe('latLngToWorld / worldToLatLng', () => {
  it('SW corner maps to (0, 0)', () => {
    const { x, y } = latLngToWorld(NYC_SW.lat, NYC_SW.lng)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('NE corner maps to (WORLD_WIDTH, WORLD_HEIGHT)', () => {
    const { x, y } = latLngToWorld(NYC_NE.lat, NYC_NE.lng)
    expect(x).toBe(WORLD_WIDTH)
    expect(y).toBe(WORLD_HEIGHT)
  })

  it('round-trips lat/lng → world → lat/lng within 0.0001 degrees', () => {
    const cases = [
      { lat: 40.7580, lng: -73.9855 }, // Times Square
      { lat: 40.6501, lng: -73.9496 }, // Prospect Park
      { lat: 40.7282, lng: -73.7949 }, // Jamaica, Queens
    ]
    for (const { lat, lng } of cases) {
      const world = latLngToWorld(lat, lng)
      const back = worldToLatLng(world.x, world.y)
      expect(Math.abs(back.lat - lat)).toBeLessThan(0.0002)
      expect(Math.abs(back.lng - lng)).toBeLessThan(0.0002)
    }
  })
})

describe('worldToTile / tileToWorld', () => {
  it('origin pixel is in tile (0,0) at local offset (0,0)', () => {
    const { tx, ty, px, py } = worldToTile(0, 0)
    expect(tx).toBe(0)
    expect(ty).toBe(0)
    expect(px).toBe(0)
    expect(py).toBe(0)
  })

  it('pixel at (255, 255) is in tile (0,0) at offset (255,255)', () => {
    const { tx, ty, px, py } = worldToTile(255, 255)
    expect(tx).toBe(0)
    expect(ty).toBe(0)
    expect(px).toBe(255)
    expect(py).toBe(255)
  })

  it('pixel at (256, 0) is in tile (1,0)', () => {
    const { tx, ty } = worldToTile(256, 0)
    expect(tx).toBe(1)
    expect(ty).toBe(0)
  })

  it('tileToWorld gives the world origin of the tile', () => {
    const { x, y } = tileToWorld(3, 5)
    expect(x).toBe(3 * TILE_SIZE)
    expect(y).toBe(5 * TILE_SIZE)
  })

  it('local offset + tile origin = original world coords', () => {
    const wx = 1234
    const wy = 5678
    const { tx, ty, px, py } = worldToTile(wx, wy)
    const origin = tileToWorld(tx, ty)
    expect(origin.x + px).toBe(wx)
    expect(origin.y + py).toBe(wy)
  })
})

describe('worldToScreen / screenToWorld', () => {
  const vp: Viewport = { originX: 100, originY: 200, scale: 2 }

  it('world origin maps to viewport origin offset', () => {
    const { sx, sy } = worldToScreen(0, 0, vp)
    expect(sx).toBe(100)
    // Y=0 (south) maps to bottom of world in screen space
    expect(sy).toBe(200 + WORLD_HEIGHT * 2)
  })

  it('round-trips world → screen → world', () => {
    const cases = [
      { x: 0, y: 0 },
      { x: 1000, y: 2000 },
      { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
    ]
    for (const { x, y } of cases) {
      const screen = worldToScreen(x, y, vp)
      const back = screenToWorld(screen.sx, screen.sy, vp)
      expect(Math.abs(back.x - x)).toBeLessThan(0.001)
      expect(Math.abs(back.y - y)).toBeLessThan(0.001)
    }
  })

  it('larger scale moves screen coords further apart', () => {
    const vp1: Viewport = { originX: 0, originY: 0, scale: 1 }
    const vp2: Viewport = { originX: 0, originY: 0, scale: 4 }
    const p1 = worldToScreen(100, 100, vp1)
    const p2 = worldToScreen(100, 100, vp2)
    expect(p2.sx).toBe(p1.sx * 4)
  })
})
