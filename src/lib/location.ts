import { TUNING } from '../config/tuning'

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
  upperwestside: { name: 'Upper West Side', lat: 40.7870, lng: -73.9754 },
  birb:         { name: 'birb (dev: unbounded)', lat: 40.7549, lng: -73.9840 },
}

export const DRAW_RADIUS = TUNING.radius.pixels
