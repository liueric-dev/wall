import { latLngToWorld } from '../lib/coordinates'

// 8-color palette indices (matches ARCHITECTURE.md)
export const PALETTE = [
  '#1a1a1a', // 0 charcoal
  '#b8362a', // 1 brick red
  '#c89d3c', // 2 mustard
  '#1f3a5f', // 3 navy
  '#5a7a4f', // 4 sage green
  '#faf7f2', // 5 cream
  '#4a5d7e', // 6 slate blue
  '#2a2a2a', // 7 soft black
]

// Reserved for base-map outlines. Must NOT appear in PALETTE — keeps the city
// visually distinct from any user contribution.
export const OUTLINE_COLOR = '#a89a8c'

export interface Pixel {
  x: number
  y: number
  color: number // palette index 0-7
}

// Small doodle templates — relative pixel offsets from an anchor point
// Each entry is [dx, dy, colorIndex]
type Template = Array<[number, number, number]>

const HEART: Template = [
  [1,0,1],[2,0,1],[4,0,1],[5,0,1],
  [0,1,1],[1,1,1],[2,1,1],[3,1,1],[4,1,1],[5,1,1],[6,1,1],
  [0,2,1],[1,2,1],[2,2,1],[3,2,1],[4,2,1],[5,2,1],[6,2,1],
  [1,3,1],[2,3,1],[3,3,1],[4,3,1],[5,3,1],
  [2,4,1],[3,4,1],[4,4,1],
  [3,5,1],
]

const SMILEY: Template = [
  [2,0,2],[3,0,2],[4,0,2],
  [1,1,2],[5,1,2],
  [0,2,2],[2,2,0],[4,2,0],[6,2,2],
  [0,3,2],[6,3,2],
  [0,4,2],[1,4,0],[5,4,0],[6,4,2],
  [1,5,2],[2,5,2],[4,5,2],[5,5,2],
  [2,6,2],[3,6,2],[4,6,2],
]

const HOUSE: Template = [
  [3,0,0],[4,0,0],
  [2,1,0],[5,1,0],
  [1,2,0],[6,2,0],
  [0,3,0],[7,3,0],
  [0,4,0],[1,4,0],[2,4,0],[3,4,0],[4,4,0],[5,4,0],[6,4,0],[7,4,0],
  [1,5,0],[3,5,3],[4,5,3],[6,5,0],
  [1,6,0],[3,6,3],[4,6,3],[6,6,0],
  [1,7,0],[2,7,0],[3,7,0],[4,7,0],[5,7,0],[6,7,0],
]

const HI: Template = [
  [0,0,0],[2,0,0],[0,1,0],[2,1,0],[0,2,0],[1,2,0],[2,2,0],
  [0,3,0],[2,3,0],[0,4,0],[2,4,0],
  [4,0,0],[4,1,0],[4,2,0],[4,3,0],[4,4,0],
  [5,0,0],[5,2,0],[5,4,0],
  [6,0,0],[6,2,0],[6,4,0],
]

const FLOWER: Template = [
  [2,0,2],[4,0,2],
  [1,1,2],[3,1,2],[5,1,2],
  [2,2,2],[3,2,1],[4,2,2],
  [1,3,2],[3,3,4],[5,3,2],
  [2,4,2],[4,4,2],
  [3,5,4],[3,6,4],[3,7,4],
]

const STAR: Template = [
  [3,0,2],
  [2,1,2],[3,1,2],[4,1,2],
  [0,2,2],[1,2,2],[2,2,2],[3,2,2],[4,2,2],[5,2,2],[6,2,2],
  [1,3,2],[2,3,2],[3,3,2],[4,3,2],[5,3,2],
  [2,4,2],[4,4,2],
  [1,5,2],[5,5,2],
  [0,6,2],[6,6,2],
]

const CAT: Template = [
  [0,0,0],[1,0,0],[4,0,0],[5,0,0],
  [0,1,0],[1,1,0],[2,1,0],[3,1,0],[4,1,0],[5,1,0],
  [1,2,0],[2,2,5],[3,2,5],[4,2,0],
  [1,3,0],[2,3,0],[3,3,0],[4,3,0],
  [1,4,0],[3,4,0],
  [0,5,0],[2,5,0],[4,5,0],
]

const WAVE: Template = [
  [0,2,6],[1,1,6],[2,0,6],[3,1,6],[4,2,6],[5,1,6],[6,0,6],[7,1,6],[8,2,6],
  [0,3,6],[1,3,6],[2,3,6],[3,3,6],[4,3,6],[5,3,6],[6,3,6],[7,3,6],[8,3,6],
]

const TREE: Template = [
  [2,0,4],[3,0,4],
  [1,1,4],[2,1,4],[3,1,4],[4,1,4],
  [0,2,4],[1,2,4],[2,2,4],[3,2,4],[4,2,4],[5,2,4],
  [1,3,4],[2,3,4],[3,3,4],[4,3,4],
  [2,4,0],[3,4,0],
  [2,5,0],[3,5,0],
]

const DOTS: Template = Array.from({ length: 15 }, (_, i) => [
  (i * 3) % 12, Math.floor(i / 4) * 3, (i % 7) as number
] as [number, number, number])

const TEMPLATES: Template[] = [
  HEART, SMILEY, HOUSE, HI, FLOWER, STAR, CAT, WAVE, TREE, DOTS,
]

// Seeded pseudo-random — deterministic output
function seededRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
}

interface Neighborhood {
  name: string
  lat: number
  lng: number
  // doodles = small template instances; scatterPixels = raw individual pixels
  doodles: number
  scatterPixels: number
}

const NEIGHBORHOODS: Neighborhood[] = [
  { name: 'Long Island City',  lat: 40.7447, lng: -73.9485, doodles: 400,  scatterPixels: 4000 },
  { name: 'Astoria',           lat: 40.7721, lng: -73.9302, doodles: 350,  scatterPixels: 3500 },
  { name: 'Greenpoint',        lat: 40.7290, lng: -73.9523, doodles: 700,  scatterPixels: 8000 },
  { name: 'Williamsburg',      lat: 40.7081, lng: -73.9571, doodles: 800,  scatterPixels: 9000 },
  { name: 'Bushwick',          lat: 40.6944, lng: -73.9213, doodles: 600,  scatterPixels: 7000 },
  { name: 'Bed-Stuy',          lat: 40.6872, lng: -73.9418, doodles: 550,  scatterPixels: 6500 },
  { name: 'Lower East Side',   lat: 40.7157, lng: -73.9863, doodles: 750,  scatterPixels: 9000 },
  { name: 'East Village',      lat: 40.7265, lng: -73.9815, doodles: 850,  scatterPixels: 10000 },
  { name: 'Midtown',           lat: 40.7549, lng: -73.9840, doodles: 900,  scatterPixels: 11000 },
  { name: 'Inwood',            lat: 40.8676, lng: -73.9218, doodles: 500,  scatterPixels: 5500 },
]

// Cluster radius in world pixels (~600ft spread)
const CLUSTER_RADIUS_PX = 60

export function generateTestPixels(): Pixel[] {
  const pixels: Pixel[] = []

  NEIGHBORHOODS.forEach((hood, hoodIdx) => {
    const center = latLngToWorld(hood.lat, hood.lng)
    const rng = seededRng(hoodIdx * 99991 + 1)

    // Template-based doodles
    for (let d = 0; d < hood.doodles; d++) {
      const template = TEMPLATES[(hoodIdx * 37 + d * 13) % TEMPLATES.length]

      const angle = rng() * Math.PI * 2
      const dist = rng() * CLUSTER_RADIUS_PX
      const ax = Math.round(center.x + Math.cos(angle) * dist)
      const ay = Math.round(center.y + Math.sin(angle) * dist)
      const colorShift = Math.floor(rng() * 8)

      for (const [dx, dy, colorIdx] of template) {
        pixels.push({
          x: ax + dx,
          y: ay + dy,
          color: rng() < 0.1 ? colorShift : colorIdx,
        })
      }
    }

    // Scatter pixels — individual pixels filling the cluster area
    const scatterRng = seededRng(hoodIdx * 55555 + 7)
    for (let s = 0; s < hood.scatterPixels; s++) {
      const angle = scatterRng() * Math.PI * 2
      const dist = scatterRng() * CLUSTER_RADIUS_PX * 1.2
      pixels.push({
        x: Math.round(center.x + Math.cos(angle) * dist),
        y: Math.round(center.y + Math.sin(angle) * dist),
        color: Math.floor(scatterRng() * 8),
      })
    }
  })

  return pixels
}

// Pre-generate once and cache
let _cachedPixels: Pixel[] | null = null

export function getTestPixels(): Pixel[] {
  if (!_cachedPixels) _cachedPixels = generateTestPixels()
  return _cachedPixels
}
