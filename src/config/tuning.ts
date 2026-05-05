export const TUNING = {
  budget: {
    cap: 256,
    regenPerHour: 60,
    initialBudget: 256,
  },

  cooldown: {
    betweenPixelsMs: 300,
  },

  gesture: {
    tapMaxMovementPx: 10,
  },

  viewport: {
    drawScale: 15,
    minScale: 0.012,
    maxScale: 40,
    animDurationMs: 500,
  },

  radius: {
    feet: 400,
    pixels: 40,
  },

  rendering: {
    pixelSizeFeet: 10,
    tileSize: 256,
    neighborhoodZoom: 3,
  },

  polling: {
    drawIntervalMs: 2000,
    browseIntervalMs: 5000,
  },
} as const

// Drawable palette — source of truth. Reordering is safe; storage is hex.
export const PALETTE: readonly string[] = [
  '#1a1a1a', // black
  '#f0ebe0', // off-white
  '#e63946', // red
  '#f4a261', // orange
  '#f4c430', // yellow
  '#5db075', // green
  '#3d8eb9', // blue
  '#f06292', // pink
  '#9575cd', // purple
  '#8b5a3c', // brown
] as const

// Reserved for base-map outlines. Must NOT appear in PALETTE.
export const OUTLINE_COLOR = '#a89a8c'
