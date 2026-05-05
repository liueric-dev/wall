import { useCallback, useEffect, useRef, useState } from 'react'
import { screenToWorld, TILE_SIZE, latLngToWorld } from '../lib/coordinates'
import {
  initialViewport, viewportCenteredOn, animateViewportTo,
  zoomAt, pan as panViewport, clampViewport, drawModeMinScale, effectiveMinScale,
  MAX_SCALE,
} from '../lib/viewport'
import type { Viewport } from '../lib/viewport'
import { DRAW_RADIUS } from '../lib/location'
import { captureLocationForSession, clearLockedLocation } from '../lib/geolocation'
import { usePermissionState } from '../lib/usePermissionState'
import type { PixelEvent } from '../lib/events'
import { getOrCreateSessionId, generateId } from '../lib/session'
import { getPixel, setPixel, deletePixel } from '../lib/pixelStore'
import { getRawPixelColor } from '../lib/tileRenderer'
import { PALETTE } from '../data/testDoodles'
import { loadBudgetState, saveBudgetState, getCurrentBudget, deductBudget } from '../lib/budget'
import { getCurrentPrompt } from '../lib/prompts'
import { TUNING } from '../config/tuning'
import { pickRandomNeighborhood } from '../config/neighborhoods'
import { getRecentSavedPosition, savePosition } from '../lib/savedPosition'
import {
  insertPixelEvent, loadViewportPixels, upsertTile,
} from '../lib/pixelApi'
import type { Bounds } from '../lib/pixelApi'
import { startPolling } from '../lib/polling'
import BaseMapLayer from './BaseMapLayer'
import PixelLayer from './PixelLayer'
import RadiusOverlay from './RadiusOverlay'
import DrawingToolbar from './DrawingToolbar'

const DRAW_SCALE = TUNING.viewport.drawScale
const DRAG_THRESHOLD = TUNING.cooldown.dragThresholdPx

// ── Bresenham line ─────────────────────────────────────────────────────────
function* linePixels(x0: number, y0: number, x1: number, y1: number): Generator<[number, number]> {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx - dy, x = x0, y = y0
  while (true) {
    yield [x, y]
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 <  dx) { err += dx; y += sy }
  }
}

// ── effective pixel color (user pixel wins over fake background) ───────────
function getEffectiveColor(x: number, y: number): number | null {
  const user = getPixel(x, y)
  if (user !== undefined) return user
  return getRawPixelColor(x, y)
}

// ── screen → integer world pixel ─────────────────────────────────────────
function toWorldPixel(sx: number, sy: number, vp: Viewport): { x: number; y: number } {
  const w = screenToWorld(sx, sy, vp)
  return { x: Math.floor(w.x), y: Math.floor(w.y) }
}

// ── viewport → world bounds for Supabase queries ─────────────────────────
function getViewportBounds(vp: Viewport, size: { w: number; h: number }): Bounds {
  const tl = screenToWorld(0, 0, vp)
  const br = screenToWorld(size.w, size.h, vp)
  return {
    minX: Math.max(0, Math.floor(Math.min(tl.x, br.x))),
    maxX: Math.ceil(Math.max(tl.x, br.x)),
    minY: Math.max(0, Math.floor(Math.min(tl.y, br.y))),
    maxY: Math.ceil(Math.max(tl.y, br.y)),
  }
}

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ────────────────────────────────────────────────────────────────────────────

export default function WallCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [viewport, setViewport] = useState<Viewport>(() => {
    const saved = getRecentSavedPosition()
    if (saved) {
      return viewportCenteredOn(saved.centerX, saved.centerY, saved.zoom,
        window.innerWidth, window.innerHeight)
    }
    const n = pickRandomNeighborhood()
    const world = latLngToWorld(n.lat, n.lng)
    return viewportCenteredOn(world.x, world.y, TUNING.rendering.neighborhoodZoom,
      window.innerWidth, window.innerHeight)
  })
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const sizeRef = useRef(size)
  sizeRef.current = size

  const [mode, setMode] = useState<'browse' | 'draw' | 'animating'>('browse')
  const [selectedColor, setSelectedColor] = useState(0)
  const [pixelVersion, setPixelVersion] = useState(0)
  const [syncError, setSyncError] = useState(false)
  const [promptText, setPromptText] = useState('')

  useEffect(() => { getCurrentPrompt().then(setPromptText) }, [])

  // GPS state — null until captured when entering draw mode
  const [locationWorld, setLocationWorld] = useState<{ x: number; y: number } | null>(null)
  const locationWorldRef = useRef(locationWorld)
  locationWorldRef.current = locationWorld

  const permissionState = usePermissionState()
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting'>('idle')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastVisible(true)
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false)
      toastTimerRef.current = null
    }, 3000)
  }, [])

  const animCancel = useRef<(() => void) | null>(null)
  const browseViewport = useRef<Viewport | null>(null)
  const initialCenterDone = useRef(false)

  // draw gesture state
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchPair = useRef<{ idA: number; idB: number } | null>(null)
  const pinchAnchor = useRef<{
    dist: number
    midX: number
    midY: number
    viewport: Viewport
  } | null>(null)
  const drawActive = useRef(false)
  const drawStartScreen = useRef<{ x: number; y: number } | null>(null)
  const drawStartedAt = useRef(0)
  const hasDragged = useRef(false)
  const drawGroupId = useRef<string | null>(null)
  const drawGroupSeq = useRef(0)
  const lastDrawPixel = useRef<{ x: number; y: number } | null>(null)

  // cooldown refs
  const lastTapMs = useRef(0)
  const lastDragPixelMs = useRef(0)

  // ── bootstrap: load pixels from Supabase on mount ────────────────────────
  useEffect(() => {
    localStorage.removeItem('wall_events')  // throw away legacy localStorage pixels
    const bounds = getViewportBounds(viewportRef.current, sizeRef.current)
    loadViewportPixels(bounds).then(pixels => {
      pixels.forEach(p => setPixel(p.x, p.y, p.colorIdx))
      if (pixels.length > 0) setPixelVersion(v => v + 1)
    })
  }, [])

  // ── polling: new pixels from other users every 5s ────────────────────────
  useEffect(() => {
    return startPolling(
      () => getViewportBounds(viewportRef.current, sizeRef.current),
      (pixels) => {
        pixels.forEach(p => setPixel(p.x, p.y, p.colorIdx))
        setPixelVersion(v => v + 1)
      },
    )
  }, [])

  // ── auto-clear sync error after 3s ───────────────────────────────────────
  useEffect(() => {
    if (!syncError) return
    const id = setTimeout(() => setSyncError(false), 3000)
    return () => clearTimeout(id)
  }, [syncError])

  // ── resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        setSize({ w: Math.round(width), h: Math.round(height) })
      }
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── save position to localStorage, debounced 1s after pan/zoom stops ──────
  const saveTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      savePosition(viewportRef.current, sizeRef.current.w, sizeRef.current.h)
    }, 1000)
  }, [viewport])

  // ── GPS refinement: animate to actual location once on granted permission ──
  useEffect(() => {
    if (permissionState !== 'granted') return
    if (initialCenterDone.current) return
    initialCenterDone.current = true
    captureLocationForSession().then(result => {
      if (!result || result === 'denied') return
      if (mode !== 'browse') return
      const world = latLngToWorld(result.lat, result.lng)
      const target = viewportCenteredOn(world.x, world.y,
        TUNING.rendering.neighborhoodZoom, sizeRef.current.w, sizeRef.current.h)
      if (animCancel.current) animCancel.current()
      if (prefersReducedMotion()) {
        setViewport(target)
      } else {
        animCancel.current = animateViewportTo(viewportRef.current, target, 1000,
          vp => setViewport(vp), () => {})
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionState])

  // ── place a single pixel ──────────────────────────────────────────────────
  const placePixel = useCallback((
    wx: number, wy: number,
    groupId: string | null,
    seq: number | null,
  ): boolean => {
    const loc = locationWorldRef.current
    if (!loc) return false
    // bounds check
    if (wx < 0 || wy < 0) return false
    // radius check
    const dx = wx - loc.x, dy = wy - loc.y
    if (Math.hypot(dx, dy) > DRAW_RADIUS) return false
    // no-op check
    if (getEffectiveColor(wx, wy) === selectedColor) return false
    // budget check
    const budgetState = loadBudgetState()
    if (getCurrentBudget(budgetState) < 1) return false

    const color = PALETTE[selectedColor]
    const sessionId = getOrCreateSessionId()
    const event: PixelEvent = {
      id: generateId(),
      x: wx, y: wy,
      color,
      session_id: sessionId,
      group_id: groupId,
      group_seq: seq,
      placed_at: new Date().toISOString(),
      input_mode: 't',
      depth: 0,
      parent_event_id: null,
      city_id: 1,
      layer: 0,
    }

    // Optimistic update
    const prevColorIdx = getPixel(wx, wy)
    setPixel(wx, wy, selectedColor)
    saveBudgetState(deductBudget(budgetState, 1))
    setPixelVersion(v => v + 1)

    // Async write to Supabase
    insertPixelEvent(event, selectedColor).then(({ eventId, error }) => {
      if (error) {
        // Revert local state
        if (prevColorIdx === undefined) deletePixel(wx, wy)
        else setPixel(wx, wy, prevColorIdx)
        setPixelVersion(v => v + 1)
        setSyncError(true)
      } else if (eventId !== null) {
        setSyncError(false)
        // Update tile cache (fire and forget)
        const tileX = Math.floor(wx / TILE_SIZE)
        const tileY = Math.floor(wy / TILE_SIZE)
        const localX = wx - tileX * TILE_SIZE
        const localY = wy - tileY * TILE_SIZE
        upsertTile(tileX, tileY, localX, localY, selectedColor, eventId)
      }
    })

    return true
  }, [selectedColor, setSyncError])

  // ── pinch lifecycle ───────────────────────────────────────────────────────
  const armPinch = useCallback(() => {
    const ids = Array.from(pointers.current.keys())
    if (ids.length < 2) return
    const [idA, idB] = ids
    const a = pointers.current.get(idA)!
    const b = pointers.current.get(idB)!
    pinchPair.current = { idA, idB }
    pinchAnchor.current = {
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      viewport: viewportRef.current,
    }
    drawActive.current = false
    hasDragged.current = false
  }, [])

  const disarmPinch = useCallback(() => {
    pinchPair.current = null
    pinchAnchor.current = null
  }, [])

  // ── enter / exit draw mode ────────────────────────────────────────────────
  const enterDraw = useCallback(async () => {
    if (mode !== 'browse') return
    disarmPinch()
    pointers.current.clear()

    if (permissionState === 'denied' || permissionState === 'unsupported') {
      showToast()
      return
    }

    setLocationStatus('requesting')
    const result = await captureLocationForSession()
    setLocationStatus('idle')

    if (!result || result === 'denied') {
      showToast()
      return
    }

    const world = latLngToWorld(result.lat, result.lng)
    setLocationWorld(world)
    locationWorldRef.current = world

    browseViewport.current = viewportRef.current
    const targetScale = Math.max(
      DRAW_SCALE,
      drawModeMinScale(sizeRef.current.w, sizeRef.current.h),
    )
    const target = viewportCenteredOn(
      world.x, world.y,
      targetScale,
      sizeRef.current.w, sizeRef.current.h,
    )
    if (prefersReducedMotion()) {
      setViewport(target)
      setMode('draw')
    } else {
      setMode('animating')
      animCancel.current = animateViewportTo(
        viewportRef.current, target, TUNING.viewport.animDurationMs,
        vp => setViewport(vp),
        () => setMode('draw'),
      )
    }
  }, [mode, permissionState, showToast, disarmPinch])

  const exitDraw = useCallback(() => {
    if (mode !== 'draw') return
    disarmPinch()
    pointers.current.clear()
    clearLockedLocation()
    const target = browseViewport.current ?? initialViewport(sizeRef.current.w, sizeRef.current.h)
    if (prefersReducedMotion()) {
      setViewport(target)
      setMode('browse')
    } else {
      setMode('animating')
      animCancel.current = animateViewportTo(
        viewportRef.current, target, TUNING.viewport.animDurationMs,
        vp => setViewport(vp),
        () => setMode('browse'),
      )
    }
  }, [mode, disarmPinch])

  // ── pointer handlers ──────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (pointers.current.size === 2 && !pinchPair.current) {
      armPinch()
    }

    if (mode === 'draw' && pointers.current.size === 1) {
      drawActive.current = true
      drawStartScreen.current = { x: e.clientX, y: e.clientY }
      drawStartedAt.current = Date.now()
      hasDragged.current = false
      drawGroupId.current = generateId()
      drawGroupSeq.current = 0
      lastDrawPixel.current = null
    }
  }, [mode, armPinch])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Two-finger pan + zoom: locked pair, anchor-based math (idempotent).
    if (pinchPair.current && pinchAnchor.current) {
      const { idA, idB } = pinchPair.current
      const a = pointers.current.get(idA)
      const b = pointers.current.get(idB)

      if (!a || !b) {
        disarmPinch()
        if (pointers.current.size >= 2) armPinch()
        return
      }

      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2

      const anchor = pinchAnchor.current
      const rawFactor = dist / anchor.dist
      const factor = Math.max(0.05, Math.min(20, rawFactor))

      const dx = midX - anchor.midX
      const dy = midY - anchor.midY

      const w = sizeRef.current.w, h = sizeRef.current.h

      // Pre-compute the final scale clampViewport would produce so origin and scale
      // stay consistent through zoomAt. Without this, zoomAt computes origin assuming
      // a scale that clampViewport then boosts to the draw-mode cap, breaking the
      // zoom-anchor invariant and causing the radius-clamp to "snap" the view.
      const minScaleEff = effectiveMinScale(mode, w, h)
      const desiredScale = anchor.viewport.scale * factor
      const finalScale = Math.max(minScaleEff, Math.min(MAX_SCALE, desiredScale))
      const effectiveFactor = finalScale / anchor.viewport.scale

      // At the draw-mode zoom-out cap, suppress pan — pinch only zooms.
      const atDrawCap = mode === 'draw' && Math.abs(finalScale - drawModeMinScale(w, h)) < 1e-4
      const effDx = atDrawCap ? 0 : dx
      const effDy = atDrawCap ? 0 : dy

      setViewport(() => {
        const panned = panViewport(anchor.viewport, effDx, effDy)
        const zoomed = zoomAt(panned, midX, midY, effectiveFactor)
        return clampViewport(zoomed, w, h, mode, locationWorldRef.current)
      })
      return
    }

    if (mode === 'browse') {
      // Single finger pan in browse mode
      setViewport(vp => clampViewport(panViewport(vp, e.clientX - prev.x, e.clientY - prev.y), sizeRef.current.w, sizeRef.current.h, mode, locationWorldRef.current))
      return
    }

    if (mode === 'draw' && drawActive.current) {
      // 50ms gate: don't place drag pixels until we've waited for a possible 2nd finger.
      // If a 2nd finger arrives in this window, armPinch clears drawActive and this branch
      // never runs. Tap-place in onPointerUp is unaffected.
      if (Date.now() - drawStartedAt.current < 50) return

      const start = drawStartScreen.current!
      const movedEnough = Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD

      if (movedEnough) {
        hasDragged.current = true
        const vp = viewportRef.current
        const curr = toWorldPixel(e.clientX, e.clientY, vp)

        const dragIntervalMs = 1000 / TUNING.cooldown.dragMaxPixelsPerSecond
        if (lastDrawPixel.current) {
          const { x: x0, y: y0 } = lastDrawPixel.current
          let placedAny = false
          for (const [wx, wy] of linePixels(x0, y0, curr.x, curr.y)) {
            if (Date.now() - lastDragPixelMs.current < dragIntervalMs) continue
            const placed = placePixel(wx, wy, drawGroupId.current, ++drawGroupSeq.current)
            if (placed) { placedAny = true; lastDragPixelMs.current = Date.now() }
          }
          if (!placedAny) drawGroupSeq.current--
        } else {
          if (Date.now() - lastDragPixelMs.current >= dragIntervalMs) {
            const placed = placePixel(curr.x, curr.y, drawGroupId.current, ++drawGroupSeq.current)
            if (placed) lastDragPixelMs.current = Date.now()
          }
        }
        lastDrawPixel.current = curr
      }
    }
  }, [mode, placePixel, armPinch, disarmPinch])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const wasDrawing = drawActive.current

    pointers.current.delete(e.pointerId)
    if (pinchPair.current) {
      const { idA, idB } = pinchPair.current
      if (e.pointerId === idA || e.pointerId === idB) {
        disarmPinch()
      }
    }

    if (mode === 'draw' && wasDrawing) {
      drawActive.current = false

      if (!hasDragged.current) {
        // tap cooldown
        if (Date.now() - lastTapMs.current < TUNING.cooldown.betweenPixelsMs) {
          // silently skip
        } else {
          const start = drawStartScreen.current!
          const { x: wx, y: wy } = toWorldPixel(start.x, start.y, viewportRef.current)

          const placed = placePixel(wx, wy, null, null)
          if (placed) lastTapMs.current = Date.now()
        }
      }

      drawGroupId.current = null
      drawGroupSeq.current = 0
      lastDrawPixel.current = null
    }
  }, [mode, placePixel, disarmPinch])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (mode === 'animating') return
    // Firefox synthesizes wheel events with ctrlKey from pinch gestures (trackpad
    // and some mobile cases). These can fire post-gesture and cause runaway zoom.
    // Touch pinch is handled via pointer events; ignore the synthetic wheel form.
    if (e.ctrlKey) return
    setViewport(vp => {
      const w = sizeRef.current.w, h = sizeRef.current.h
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const minScaleEff = effectiveMinScale(mode, w, h)
      const desiredScale = vp.scale * factor
      const finalScale = Math.max(minScaleEff, Math.min(MAX_SCALE, desiredScale))
      if (Math.abs(finalScale - vp.scale) < 1e-4) return vp
      const effectiveFactor = finalScale / vp.scale
      return clampViewport(
        zoomAt(vp, e.clientX, e.clientY, effectiveFactor),
        w, h, mode, locationWorldRef.current,
      )
    })
  }, [mode])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <BaseMapLayer viewport={viewport} width={size.w} height={size.h} />
      <PixelLayer viewport={viewport} width={size.w} height={size.h} pixelVersion={pixelVersion} />

      {mode === 'draw' && locationWorld && (
        <RadiusOverlay
          locationWorld={locationWorld}
          viewport={viewport}
          width={size.w}
          height={size.h}
        />
      )}

      {/* Browse mode — Doodle entry button or read-only indicator */}
      {mode === 'browse' && (
        <div style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          <button
            onClick={enterDraw}
            disabled={locationStatus === 'requesting'}
            style={{
              height: 48,
              padding: '0 28px',
              background: locationStatus === 'requesting' ? '#888' : '#1a1a1a',
              color: '#faf7f2',
              border: 'none',
              borderRadius: 24,
              cursor: locationStatus === 'requesting' ? 'default' : 'pointer',
              fontSize: 15,
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.06em',
              boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            }}
          >
            {locationStatus === 'requesting' ? 'Locating…' : 'Doodle'}
          </button>
          {toastVisible && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 14px)',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '8px 16px',
              background: '#1a1a1a',
              color: '#faf7f2',
              borderRadius: 20,
              fontSize: 13,
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.04em',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}>
              Enable location to draw
            </div>
          )}
        </div>
      )}

      {/* Sync error indicator */}
      {syncError && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#c0392b',
          pointerEvents: 'none',
          opacity: 0.8,
        }} />
      )}

      {/* Draw mode toolbar */}
      {mode === 'draw' && (
        <DrawingToolbar
          selectedColor={selectedColor}
          onColorSelect={setSelectedColor}
          onDone={exitDraw}
          prompt={promptText}
        />
      )}
    </div>
  )
}
