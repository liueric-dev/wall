import { useCallback, useEffect, useRef, useState } from 'react'
import { screenToWorld, latLngToWorld } from '../lib/coordinates'
import {
  viewportCenteredOn, animateViewportTo,
  zoomAt, pan as panViewport, clampViewport, drawModeMinScale, effectiveMinScale,
  MAX_SCALE,
} from '../lib/viewport'
import type { Viewport } from '../lib/viewport'
import { DRAW_RADIUS } from '../lib/location'
import { captureLocationForSession, clearLockedLocation, getDevUnbounded } from '../lib/geolocation'
import { usePermissionState } from '../lib/usePermissionState'
import type { PixelEvent } from '../lib/events'
import { getOrCreateSessionId, generateId } from '../lib/session'
import { getPixel, setPixel, deletePixel } from '../lib/pixelStore'
import { loadBudgetState, saveBudgetState, getCurrentBudget, deductBudget } from '../lib/budget'
import { getCurrentPrompt } from '../lib/prompts'
import { TUNING, PALETTE } from '../config/tuning'
import { pickRandomNeighborhood } from '../config/neighborhoods'
import { getRecentSavedPosition, savePosition } from '../lib/savedPosition'
import { insertPixelEvent, loadViewportPixels } from '../lib/pixelApi'
import type { Bounds } from '../lib/pixelApi'
import { startPolling } from '../lib/polling'
import { applyIncomingEvents, subscribeToEvents } from '../lib/eventHandler'
import BaseMapLayer from './BaseMapLayer'
import PixelLayer from './PixelLayer'
import RadiusOverlay from './RadiusOverlay'
import DrawingToolbar from './DrawingToolbar'

const DRAW_SCALE = TUNING.viewport.drawScale
const TAP_MAX_PX = TUNING.gesture.tapMaxMovementPx

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
  const [selectedColor, setSelectedColor] = useState<string>(PALETTE[0])
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
  // Single-finger gesture state — applies to both modes.
  // Movement-based tap/drag classification: < TAP_MAX_PX = tap, ≥ = drag.
  const drawStartScreen = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const spaceHeld = useRef(false)
  const panActive = useRef(false)
  const panPrevScreen = useRef<{ x: number; y: number } | null>(null)

  // cooldown refs
  const lastTapMs = useRef(0)

  // ── bootstrap: load pixels from Supabase on mount ────────────────────────
  useEffect(() => {
    localStorage.removeItem('wall_events')  // throw away legacy localStorage pixels
    const bounds = getViewportBounds(viewportRef.current, sizeRef.current)
    loadViewportPixels(bounds).then(applyIncomingEvents)
  }, [])

  // ── polling: mode-aware, paused when backgrounded ────────────────────────
  useEffect(() => {
    return startPolling(
      () => getViewportBounds(viewportRef.current, sizeRef.current),
      () => mode,
    )
  }, [mode])

  // ── re-render when incoming events apply to the pixel store ──────────────
  useEffect(() => {
    return subscribeToEvents(() => setPixelVersion(v => v + 1))
  }, [])

  // ── auto-clear sync error after 3s ───────────────────────────────────────
  useEffect(() => {
    if (!syncError) return
    const id = setTimeout(() => setSyncError(false), 3000)
    return () => clearTimeout(id)
  }, [syncError])

  // ── spacebar tracking for desktop pan-in-draw-mode ────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      spaceHeld.current = true
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeld.current = false
    }
    const onBlur = () => { spaceHeld.current = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
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

  // ── place a single pixel (tap-only after sprint 12) ──────────────────────
  const placePixel = useCallback((wx: number, wy: number): boolean => {
    const loc = locationWorldRef.current
    if (!loc) return false
    // bounds check
    if (wx < 0 || wy < 0) return false
    // radius check (skipped in dev "birb" mode)
    if (!getDevUnbounded()) {
      const dx = wx - loc.x, dy = wy - loc.y
      if (Math.hypot(dx, dy) > DRAW_RADIUS) return false
    }
    // no-op: tapping a pixel that's already this color does nothing
    if (getPixel(wx, wy) === selectedColor) return false
    // budget check
    const budgetState = loadBudgetState()
    if (getCurrentBudget(budgetState) < 1) return false

    const sessionId = getOrCreateSessionId()
    const event: PixelEvent = {
      id: generateId(),
      x: wx, y: wy,
      color: selectedColor,
      session_id: sessionId,
      group_id: null,
      group_seq: null,
      placed_at: new Date().toISOString(),
      input_mode: 't',
      depth: 0,
      parent_event_id: null,
      city_id: 1,
      layer: 0,
    }

    // Optimistic update
    const prevColor = getPixel(wx, wy)
    setPixel(wx, wy, selectedColor)
    saveBudgetState(deductBudget(budgetState, 1))
    setPixelVersion(v => v + 1)

    insertPixelEvent(event, selectedColor).then(({ error }) => {
      if (error) {
        if (prevColor === undefined) deletePixel(wx, wy)
        else setPixel(wx, wy, prevColor)
        setPixelVersion(v => v + 1)
        setSyncError(true)
      } else {
        setSyncError(false)
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
    // Pinch supersedes any pending tap; mark as dragged so pointer-up doesn't fire a tap.
    hasDragged.current = true
    drawStartScreen.current = null
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

    const targetScale = getDevUnbounded()
      ? DRAW_SCALE
      : Math.max(DRAW_SCALE, drawModeMinScale(sizeRef.current.w, sizeRef.current.h))
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
    // Stay where the user is — keep the current draw-mode viewport instead of
    // animating back to the pre-draw browse position.
    setMode('browse')
  }, [mode, disarmPinch])

  // ── pointer handlers ──────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (pointers.current.size === 2 && !pinchPair.current) {
      armPinch()
      return
    }

    // Desktop pan trigger: right-click (mouse) or spacebar held + left-click.
    const isRightClick = e.button === 2 && e.pointerType === 'mouse'
    if (pointers.current.size === 1 && (isRightClick || spaceHeld.current)) {
      panActive.current = true
      panPrevScreen.current = { x: e.clientX, y: e.clientY }
      return
    }

    // First finger of a single-pointer gesture in either mode.
    // Classification (tap vs drag-pan) is decided in onPointerMove/Up by movement.
    if (pointers.current.size === 1) {
      drawStartScreen.current = { x: e.clientX, y: e.clientY }
      hasDragged.current = false
    }
  }, [armPinch])

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
      const effMode = getDevUnbounded() ? 'browse' : mode
      const effLoc = getDevUnbounded() ? null : locationWorldRef.current
      const minScaleEff = effectiveMinScale(effMode, w, h)
      const desiredScale = anchor.viewport.scale * factor
      const finalScale = Math.max(minScaleEff, Math.min(MAX_SCALE, desiredScale))
      const effectiveFactor = finalScale / anchor.viewport.scale

      const atDrawCap = effMode === 'draw' && Math.abs(finalScale - drawModeMinScale(w, h)) < 1e-4
      const effDx = atDrawCap ? 0 : dx
      const effDy = atDrawCap ? 0 : dy

      setViewport(() => {
        const panned = panViewport(anchor.viewport, effDx, effDy)
        const zoomed = zoomAt(panned, midX, midY, effectiveFactor)
        return clampViewport(zoomed, w, h, effMode, effLoc)
      })
      return
    }

    // Desktop pan (right-click or spacebar+left-click).
    if (panActive.current) {
      const last = panPrevScreen.current!
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      panPrevScreen.current = { x: e.clientX, y: e.clientY }
      const effMode = getDevUnbounded() ? 'browse' : mode
      const effLoc = getDevUnbounded() ? null : locationWorldRef.current
      setViewport(vp => clampViewport(
        panViewport(vp, dx, dy),
        sizeRef.current.w, sizeRef.current.h, effMode, effLoc,
      ))
      return
    }

    // Single-finger gesture: classify tap vs drag-pan by movement, then pan if dragging.
    if (drawStartScreen.current) {
      if (!hasDragged.current) {
        const start = drawStartScreen.current
        const movement = Math.hypot(e.clientX - start.x, e.clientY - start.y)
        if (movement >= TAP_MAX_PX) {
          hasDragged.current = true
        }
      }

      if (hasDragged.current) {
        // Pan in both modes; clampViewport applies the radius-clamp in draw mode.
        const effMode = getDevUnbounded() ? 'browse' : mode
        const effLoc = getDevUnbounded() ? null : locationWorldRef.current
        setViewport(vp => clampViewport(
          panViewport(vp, e.clientX - prev.x, e.clientY - prev.y),
          sizeRef.current.w, sizeRef.current.h, effMode, effLoc,
        ))
      }
    }
  }, [mode, armPinch, disarmPinch])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pinchPair.current) {
      const { idA, idB } = pinchPair.current
      if (e.pointerId === idA || e.pointerId === idB) {
        disarmPinch()
      }
    }

    if (panActive.current) {
      panActive.current = false
      panPrevScreen.current = null
    }

    // Tap-to-place in draw mode (only if movement stayed below TAP_MAX_PX).
    if (mode === 'draw' && drawStartScreen.current && !hasDragged.current) {
      if (Date.now() - lastTapMs.current >= TUNING.cooldown.betweenPixelsMs) {
        const start = drawStartScreen.current
        const { x: wx, y: wy } = toWorldPixel(start.x, start.y, viewportRef.current)
        const placed = placePixel(wx, wy)
        if (placed) lastTapMs.current = Date.now()
      }
    }

    drawStartScreen.current = null
    hasDragged.current = false
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
      const effMode = getDevUnbounded() ? 'browse' : mode
      const effLoc = getDevUnbounded() ? null : locationWorldRef.current
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const minScaleEff = effectiveMinScale(effMode, w, h)
      const desiredScale = vp.scale * factor
      const finalScale = Math.max(minScaleEff, Math.min(MAX_SCALE, desiredScale))
      if (Math.abs(finalScale - vp.scale) < 1e-4) return vp
      const effectiveFactor = finalScale / vp.scale
      return clampViewport(
        zoomAt(vp, e.clientX, e.clientY, effectiveFactor),
        w, h, effMode, effLoc,
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
      onContextMenu={(e) => e.preventDefault()}
    >
      <BaseMapLayer viewport={viewport} width={size.w} height={size.h} pass="fills" />
      <PixelLayer viewport={viewport} width={size.w} height={size.h} pixelVersion={pixelVersion} />
      <BaseMapLayer viewport={viewport} width={size.w} height={size.h} pass="outlines" />

      {mode === 'draw' && locationWorld && !getDevUnbounded() && (
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
