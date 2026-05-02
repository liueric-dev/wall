import { useCallback, useEffect, useRef, useState } from 'react'
import { screenToWorld, TILE_SIZE, latLngToWorld } from '../lib/coordinates'
import {
  initialViewport, viewportCenteredOn, animateViewportTo,
  zoomAt, pan as panViewport, clampViewport,
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
import {
  insertPixelEvent, loadViewportPixels, deletePixelEvents, upsertTile,
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

// ────────────────────────────────────────────────────────────────────────────

export default function WallCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [viewport, setViewport] = useState<Viewport>(() =>
    initialViewport(window.innerWidth, window.innerHeight)
  )
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const sizeRef = useRef(size)
  sizeRef.current = size

  const [mode, setMode] = useState<'browse' | 'draw' | 'animating'>('browse')
  const [selectedColor, setSelectedColor] = useState(0)
  const [pixelVersion, setPixelVersion] = useState(0)
  const [syncError, setSyncError] = useState(false)

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

  // draw gesture state
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const lastPinchDist = useRef<number | null>(null)
  const drawActive = useRef(false)
  const drawStartScreen = useRef<{ x: number; y: number } | null>(null)
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

  // ── enter / exit draw mode ────────────────────────────────────────────────
  const enterDraw = useCallback(async () => {
    if (mode !== 'browse') return

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
    const target = viewportCenteredOn(
      world.x, world.y,
      DRAW_SCALE,
      sizeRef.current.w, sizeRef.current.h,
    )
    setMode('animating')
    animCancel.current = animateViewportTo(
      viewportRef.current, target, TUNING.viewport.animDurationMs,
      vp => setViewport(vp),
      () => setMode('draw'),
    )
  }, [mode, permissionState, showToast])

  const exitDraw = useCallback(() => {
    if (mode !== 'draw') return
    clearLockedLocation()
    const target = browseViewport.current ?? initialViewport(sizeRef.current.w, sizeRef.current.h)
    setMode('animating')
    animCancel.current = animateViewportTo(
      viewportRef.current, target, TUNING.viewport.animDurationMs,
      vp => setViewport(vp),
      () => setMode('browse'),
    )
  }, [mode])

  // ── pointer handlers ──────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (mode === 'draw' && pointers.current.size === 1) {
      drawActive.current = true
      drawStartScreen.current = { x: e.clientX, y: e.clientY }
      hasDragged.current = false
      drawGroupId.current = generateId()
      drawGroupSeq.current = 0
      lastDrawPixel.current = null
    }
  }, [mode])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const active = Array.from(pointers.current.values())

    // Two-finger pan/zoom works in all non-animating modes
    if (active.length >= 2) {
      const [p0, p1] = active
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      const midX = (p0.x + p1.x) / 2
      const midY = (p0.y + p1.y) / 2
      if (lastPinchDist.current !== null) {
        setViewport(vp => clampViewport(zoomAt(vp, midX, midY, dist / lastPinchDist.current!), sizeRef.current.w, sizeRef.current.h))
      }
      lastPinchDist.current = dist
      return
    }

    if (mode === 'browse') {
      // Single finger pan in browse mode
      setViewport(vp => clampViewport(panViewport(vp, e.clientX - prev.x, e.clientY - prev.y), sizeRef.current.w, sizeRef.current.h))
      return
    }

    if (mode === 'draw' && drawActive.current) {
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
  }, [mode, placePixel])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const wasDrawing = drawActive.current

    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) lastPinchDist.current = null

    if (mode === 'draw' && wasDrawing) {
      drawActive.current = false

      if (!hasDragged.current) {
        // tap cooldown
        if (Date.now() - lastTapMs.current < TUNING.cooldown.betweenPixelsMs) {
          // silently skip
        } else {
          const start = drawStartScreen.current!
          const { x: wx, y: wy } = toWorldPixel(start.x, start.y, viewportRef.current)

          if (getPixel(wx, wy) !== undefined) {
            // Tap on a user-placed pixel — erase it back to background
            deletePixel(wx, wy)
            setPixelVersion(v => v + 1)
            lastTapMs.current = Date.now()
            deletePixelEvents(wx, wy)  // async, fire and forget
          } else {
            // Tap on empty/background — place pixel
            const placed = placePixel(wx, wy, null, null)
            if (placed) lastTapMs.current = Date.now()
          }
        }
      }

      drawGroupId.current = null
      drawGroupSeq.current = 0
      lastDrawPixel.current = null
    }
  }, [mode, placePixel])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (mode === 'animating') return
    setViewport(vp => clampViewport(zoomAt(vp, e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1), sizeRef.current.w, sizeRef.current.h))
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
              position: 'fixed',
              top: 24,
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
          prompt={getCurrentPrompt()}
        />
      )}
    </div>
  )
}
