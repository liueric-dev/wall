import { describe, it, expect } from 'vitest'
import { generateTestPixels, PALETTE } from './testDoodles'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../lib/coordinates'

describe('generateTestPixels', () => {
  const pixels = generateTestPixels()

  it('generates a substantial number of pixels', () => {
    expect(pixels.length).toBeGreaterThan(5000)
  })

  it('all pixels are within world bounds', () => {
    const oob = pixels.filter(p => p.x < 0 || p.x >= WORLD_WIDTH || p.y < 0 || p.y >= WORLD_HEIGHT)
    expect(oob.length).toBe(0)
  })

  it('all color indices are valid', () => {
    const invalid = pixels.filter(p => p.color < 0 || p.color >= PALETTE.length)
    expect(invalid.length).toBe(0)
  })

  it('is deterministic across calls', () => {
    const p1 = generateTestPixels()
    const p2 = generateTestPixels()
    expect(p1.length).toBe(p2.length)
    expect(p1[0]).toEqual(p2[0])
    expect(p1[100]).toEqual(p2[100])
  })
})
