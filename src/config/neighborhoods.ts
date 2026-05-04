export const FALLBACK_NEIGHBORHOODS = [
  { name: 'Long Island City', lat: 40.7505, lng: -73.9408 },
  { name: 'Astoria',          lat: 40.7644, lng: -73.9235 },
  { name: 'Greenpoint',       lat: 40.7297, lng: -73.9540 },
  { name: 'Williamsburg',     lat: 40.7081, lng: -73.9571 },
  { name: 'East Village',     lat: 40.7265, lng: -73.9815 },
  { name: 'Lower East Side',  lat: 40.7185, lng: -73.9870 },
  { name: 'Bushwick',         lat: 40.6943, lng: -73.9213 },
  { name: 'Upper West Side',  lat: 40.7870, lng: -73.9754 },
] as const

export function pickRandomNeighborhood(): typeof FALLBACK_NEIGHBORHOODS[number] {
  return FALLBACK_NEIGHBORHOODS[Math.floor(Math.random() * FALLBACK_NEIGHBORHOODS.length)]
}
