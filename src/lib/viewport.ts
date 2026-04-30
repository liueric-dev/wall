import { WORLD_WIDTH, WORLD_HEIGHT } from './coordinates'
import type { Viewport } from './coordinates'
import { TUNING } from '../config/tuning'

export type { Viewport }

export const MIN_SCALE = TUNING.viewport.minScale
export const MAX_SCALE = TUNING.viewport.maxScale

export function initialViewport(screenW: number, screenH: number): Viewport {
  const scale = Math.min(screenW / WORLD_WIDTH, screenH / WORLD_HEIGHT) * 0.9
  const originX = (screenW - WORLD_WIDTH * scale) / 2
  // world Y=0 is south; screen Y=0 is top. The northern edge of the world
  // should appear at originY on screen (top of map area).
  const originY = (screenH - WORLD_HEIGHT * scale) / 2
  return { originX, originY, scale }
}

export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
}

/** Zoom around a fixed screen point (sx, sy). */
export function zoomAt(vp: Viewport, sx: number, sy: number, factor: number): Viewport {
  const newScale = clampScale(vp.scale * factor)
  const actualFactor = newScale / vp.scale
  return {
    scale: newScale,
    originX: sx - (sx - vp.originX) * actualFactor,
    originY: sy - (sy - vp.originY) * actualFactor,
  }
}

/** Pan by (dx, dy) in screen pixels. */
export function pan(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, originX: vp.originX + dx, originY: vp.originY + dy }
}

/** Build a viewport that centers world point (wx, wy) on screen at the given scale. */
export function viewportCenteredOn(
  wx: number, wy: number,
  scale: number,
  screenW: number, screenH: number,
): Viewport {
  return {
    scale,
    originX: screenW / 2 - wx * scale,
    // world Y increases north; screen Y increases down → flip
    originY: screenH / 2 - (WORLD_HEIGHT - wy) * scale,
  }
}

/**
 * Clamp a viewport so the city can never be panned off-screen.
 * Min scale is dynamic: city always fills at least 75% of the smaller screen dim.
 */
export function clampViewport(vp: Viewport, screenW: number, screenH: number): Viewport {
  const minScale = Math.min(screenW / WORLD_WIDTH, screenH / WORLD_HEIGHT) * 0.75
  const scale = Math.max(minScale, Math.min(MAX_SCALE, vp.scale))
  const worldW = WORLD_WIDTH * scale
  const worldH = WORLD_HEIGHT * scale
  const pad = 100 // minimum px of world that must remain visible on each edge
  return {
    scale,
    originX: Math.max(pad - worldW, Math.min(screenW - pad, vp.originX)),
    originY: Math.max(pad - worldH, Math.min(screenH - pad, vp.originY)),
  }
}

/** Smoothly animate from one viewport to another. Returns a cancel function. */
export function animateViewportTo(
  from: Viewport,
  to: Viewport,
  durationMs: number,
  onFrame: (vp: Viewport) => void,
  onDone: () => void,
): () => void {
  const start = performance.now()
  let rafId: number

  const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  const tick = (now: number) => {
    const raw = Math.min(1, (now - start) / durationMs)
    const t = ease(raw)
    onFrame({
      scale:   lerp(from.scale,   to.scale,   t),
      originX: lerp(from.originX, to.originX, t),
      originY: lerp(from.originY, to.originY, t),
    })
    if (raw < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      onDone()
    }
  }

  rafId = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(rafId)
}
