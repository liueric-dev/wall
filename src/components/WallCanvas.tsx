import { useCallback, useEffect, useRef, useState } from 'react'
import { screenToWorld, WORLD_HEIGHT } from '../lib/coordinates'
import {
  initialViewport, viewportCenteredOn, animateViewportTo,
  zoomAt, pan as panViewport, clampViewport,
} from '../lib/viewport'
import type { Viewport } from '../lib/viewport'
import { getMockedLocation, getMockedLocationWorld, DRAW_RADIUS } from '../lib/location'
import { loadEvents, saveEvents, appendEvent } from '../lib/events'
import type { PixelEvent } from '../lib/events'
import { getOrCreateSessionId, generateId } from '../lib/session'
import { getPixel, setPixel, deletePixel, replayEvents, getAllUserPixels } from '../lib/pixelStore'
import { getRawPixelColor } from '../lib/tileRenderer'
import { PALETTE } from '../data/testDoodles'
import BaseMapLayer from './BaseMapLayer'
import PixelLayer from './PixelLayer'
import RadiusOverlay from './RadiusOverlay'
import DrawingToolbar from './DrawingToolbar'

// ── constants ────────────────────────────────────────────────────────────────
const DRAW_SCALE = 10        // viewport scale when entering draw mode
const DRAG_THRESHOLD = 3     // screen pixels before a tap becomes a drag

type UndoEntry = { type: 'single'; id: string } | { type: 'group'; groupId: string }

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
  const [canUndo, setCanUndo] = useState(false)

  const undoStack = useRef<UndoEntry[]>([])
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

  const location = getMockedLocation()
  const locationWorld = getMockedLocationWorld()

  // ── bootstrap: replay persisted events on mount ──────────────────────────
  useEffect(() => {
    const events = loadEvents()
    replayEvents(events)
    if (events.length > 0) setPixelVersion(v => v + 1)
  }, [])

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
    // bounds check
    if (wx < 0 || wy < 0) return false
    // radius check
    const dx = wx - locationWorld.x, dy = wy - locationWorld.y
    if (Math.hypot(dx, dy) > DRAW_RADIUS) return false
    // no-op check
    if (getEffectiveColor(wx, wy) === selectedColor) return false

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

    appendEvent(event)
    setPixel(wx, wy, selectedColor)
    setPixelVersion(v => v + 1)
    return true
  }, [selectedColor, locationWorld])

  // ── undo ──────────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return

    const events = loadEvents()
    const remaining = entry.type === 'single'
      ? events.filter(e => e.id !== entry.id)
      : events.filter(e => e.group_id !== entry.groupId)

    saveEvents(remaining)
    replayEvents(remaining)
    setPixelVersion(v => v + 1)
    setCanUndo(undoStack.current.length > 0)
  }, [])

  // ── enter / exit draw mode ────────────────────────────────────────────────
  const enterDraw = useCallback(() => {
    if (mode !== 'browse') return
    browseViewport.current = viewportRef.current
    const target = viewportCenteredOn(
      locationWorld.x, locationWorld.y,
      DRAW_SCALE,
      size.w, size.h,
    )
    setMode('animating')
    animCancel.current = animateViewportTo(
      viewportRef.current, target, 500,
      vp => setViewport(vp),
      () => setMode('draw'),
    )
  }, [mode, locationWorld, size])

  const exitDraw = useCallback(() => {
    if (mode !== 'draw') return
    const target = browseViewport.current ?? initialViewport(size.w, size.h)
    setMode('animating')
    animCancel.current = animateViewportTo(
      viewportRef.current, target, 500,
      vp => setViewport(vp),
      () => setMode('browse'),
    )
  }, [mode, size])

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

        if (lastDrawPixel.current) {
          const { x: x0, y: y0 } = lastDrawPixel.current
          let placedAny = false
          for (const [wx, wy] of linePixels(x0, y0, curr.x, curr.y)) {
            const placed = placePixel(wx, wy, drawGroupId.current, ++drawGroupSeq.current)
            if (placed) placedAny = true
          }
          if (!placedAny) drawGroupSeq.current-- // don't advance seq for no-ops
        } else {
          placePixel(curr.x, curr.y, drawGroupId.current, ++drawGroupSeq.current)
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
        const start = drawStartScreen.current!
        const { x: wx, y: wy } = toWorldPixel(start.x, start.y, viewportRef.current)

        if (getPixel(wx, wy) !== undefined) {
          // Tap on a user-placed pixel — erase it back to background
          deletePixel(wx, wy)
          const remaining = loadEvents().filter(e => !(e.x === wx && e.y === wy))
          saveEvents(remaining)
          setPixelVersion(v => v + 1)
        } else {
          // Tap on empty/background — place pixel
          const placed = placePixel(wx, wy, null, null)
          if (placed) {
            const events = loadEvents()
            const lastEvent = events[events.length - 1]
            undoStack.current.push({ type: 'single', id: lastEvent.id })
            setCanUndo(true)
          }
        }
      } else if (drawGroupSeq.current > 0) {
        // Drag — record the whole group for undo
        undoStack.current.push({ type: 'group', groupId: drawGroupId.current! })
        setCanUndo(true)
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

  // ── count today's pixels for the budget display ───────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)
  const sessionId = getOrCreateSessionId()
  const todayPixelCount = loadEvents().filter(
    e => e.session_id === sessionId && e.placed_at.startsWith(todayStr)
  ).length

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

      {mode === 'draw' && (
        <RadiusOverlay
          locationWorld={locationWorld}
          viewport={viewport}
          width={size.w}
          height={size.h}
        />
      )}

      {/* Browse mode — Doodle entry button */}
      {mode === 'browse' && (
        <div style={{
          position: 'absolute',
          bottom: 32,
          left: '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'auto',
        }}>
          <button
            onClick={enterDraw}
            style={{
              height: 48,
              padding: '0 28px',
              background: '#1a1a1a',
              color: '#faf7f2',
              border: 'none',
              borderRadius: 24,
              cursor: 'pointer',
              fontSize: 15,
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.06em',
              boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            }}
          >
            Doodle
          </button>
        </div>
      )}

      {/* Draw mode toolbar */}
      {mode === 'draw' && (
        <DrawingToolbar
          selectedColor={selectedColor}
          onColorSelect={setSelectedColor}
          onUndo={undo}
          onDone={exitDraw}
          canUndo={canUndo}
          pixelCount={todayPixelCount}
          locationName={location.name}
        />
      )}
    </div>
  )
}
