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
    drawScale: 10,
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

  prompts: {
    rotationHour: 6,
    list: [
      "Draw something you'd find at the corner deli",
      "Draw a sound you hear right now",
      "Draw your favorite hour of the day",
      "Draw something only locals would notice",
      "Draw the view from your window",
      "Draw something that's been here longer than you",
      "Draw what the neighborhood smells like",
      "Draw a shortcut only you know",
      "Draw something that opens at midnight",
      "Draw your go-to order",
      "Draw the thing you walk past every day without stopping",
      "Draw a texture you touched today",
      "Draw something that will be gone in a year",
      "Draw what home looks like from the outside",
      "Draw the first thing you see in the morning",
      "Draw a place where people wait",
      "Draw something small that matters",
      "Draw the color of this block",
      "Draw something that belongs to everyone",
      "Draw a landmark no map would show",
      "Draw what rain looks like here",
      "Draw the last thing open at night",
      "Draw a face you see every week but don't know",
      "Draw something that has a line outside it",
      "Draw where you'd go if you needed quiet",
      "Draw the thing that marks the entrance to your neighborhood",
      "Draw something left behind",
      "Draw the light at this exact hour",
      "Draw what a good Tuesday looks like",
      "Draw something worth coming back for",
      "Draw the most familiar door you know",
      "Draw something you've never drawn before",
    ],
  },
} as const
