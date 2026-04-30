import { latLngToWorld } from './coordinates'

export interface Location {
  name: string
  lat: number
  lng: number
}

export const LOCATIONS: Record<string, Location> = {
  lic:          { name: 'Long Island City', lat: 40.7447, lng: -73.9485 },
  astoria:      { name: 'Astoria',          lat: 40.7721, lng: -73.9302 },
  greenpoint:   { name: 'Greenpoint',       lat: 40.7290, lng: -73.9523 },
  williamsburg: { name: 'Williamsburg',     lat: 40.7081, lng: -73.9571 },
  bushwick:     { name: 'Bushwick',         lat: 40.6944, lng: -73.9213 },
  eastvillage:  { name: 'East Village',     lat: 40.7265, lng: -73.9815 },
  midtown:      { name: 'Midtown',          lat: 40.7549, lng: -73.9840 },
}

export const DRAW_RADIUS = 30 // world pixels (~300ft)

export function getMockedLocation(): Location {
  const key = new URLSearchParams(window.location.search).get('location')?.toLowerCase()
  return (key && LOCATIONS[key]) ? LOCATIONS[key] : LOCATIONS.lic
}

export function getMockedLocationWorld() {
  const loc = getMockedLocation()
  return latLngToWorld(loc.lat, loc.lng)
}
