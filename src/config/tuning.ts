export const TUNING = {
  budget: {
    cap: 300,
    regenPerHour: 60,
    initialBudget: 300,
  },

  cooldown: {
    betweenPixelsMs: 300,
    dragMaxPixelsPerSecond: 30,
    dragThresholdPx: 3,
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
} as const
