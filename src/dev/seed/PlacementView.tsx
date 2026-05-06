// Map placement view for the dev/seed tool.
// Renders the NYC base map + pixel layer (re-used from main app), plus an
// overlay for the live preview of where the chosen asset will land.
//
// See SPRINT-13.md Step 7 (and Brush Mode + Cleanup sections).

import { useCallback, useEffect, useRef, useState } from 'react'
import { latLngToWorld, screenToWorld, worldToScreen } from '../../lib/coordinates'
import {
  viewportCenteredOn,
  zoomAt,
  pan as panViewport,
  clampViewport,
  MAX_SCALE,
  effectiveMinScale,
} from '../../lib/viewport'
import type { Viewport } from '../../lib/viewport'
import { TUNING } from '../../config/tuning'
import { pickRandomNeighborhood } from '../../config/neighborhoods'
import { loadViewportPixels } from '../../lib/pixelApi'
import type { Bounds } from '../../lib/pixelApi'
import { applyIncomingEvents, subscribeToEvents } from '../../lib/eventHandler'
import { startPolling } from '../../lib/polling'
import BaseMapLayer from '../../components/BaseMapLayer'
import PixelLayer from '../../components/PixelLayer'
import type { SavedAsset } from './Library'
import {
  placeAsset, undoLastPlacement, deleteAllSeededPixels,
  peekUndoEntry, getUndoStackSize,
} from './DirectWriter'

const TAP_MAX_PX = TUNING.gesture.tapMaxMovementPx

interface Props {
  library: SavedAsset[]
  onClose: () => void
}

interface Preview {
  worldX: number
  worldY: number
}

interface Flash {
  id: number
  worldX: number
  worldY: number
  width: number
  height: number
  startedAt: number
}

function getViewportBounds(vp: Viewport, w: number, h: number): Bounds {
  const tl = screenToWorld(0, 0, vp)
  const br = screenToWorld(w, h, vp)
  return {
    minX: Math.max(0, Math.floor(Math.min(tl.x, br.x))),
    maxX: Math.ceil(Math.max(tl.x, br.x)),
    minY: Math.max(0, Math.floor(Math.min(tl.y, br.y))),
    maxY: Math.ceil(Math.max(tl.y, br.y)),
  }
}

export function PlacementView({ library, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [viewport, setViewport] = useState<Viewport>(() => {
    const n = pickRandomNeighborhood()
    const world = latLngToWorld(n.lat, n.lng)
    return viewportCenteredOn(
      world.x, world.y, TUNING.rendering.neighborhoodZoom,
      window.innerWidth, window.innerHeight,
    )
  })
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const sizeRef = useRef(size)
  sizeRef.current = size

  const [selectedId, setSelectedId] = useState<string | null>(library[0]?.id ?? null)
  const selectedAsset = library.find(a => a.id === selectedId) ?? null
  const selectedRef = useRef(selectedAsset)
  selectedRef.current = selectedAsset

  const [brushMode, setBrushMode] = useState(false)
  const brushRef = useRef(brushMode)
  brushRef.current = brushMode

  const [preview, setPreview] = useState<Preview | null>(null)
  const previewRef = useRef(preview)
  previewRef.current = preview

  const [pixelVersion, setPixelVersion] = useState(0)
  const [progress, setProgress] = useState<{ placed: number; total: number; name: string } | null>(null)
  const [flashes, setFlashes] = useState<Flash[]>([])
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [undoSize, setUndoSize] = useState(getUndoStackSize())
  const [undoTop, setUndoTop] = useState(peekUndoEntry())

  const refreshUndo = useCallback(() => {
    setUndoSize(getUndoStackSize())
    setUndoTop(peekUndoEntry())
  }, [])

  // Bootstrap pixels and subscribe.
  useEffect(() => {
    const bounds = getViewportBounds(viewportRef.current, sizeRef.current.w, sizeRef.current.h)
    loadViewportPixels(bounds).then(applyIncomingEvents)
  }, [])

  useEffect(() => {
    return subscribeToEvents(() => setPixelVersion(v => v + 1))
  }, [])

  useEffect(() => {
    return startPolling(
      () => getViewportBounds(viewportRef.current, sizeRef.current.w, sizeRef.current.h),
      () => 'browse',
    )
  }, [])

  // Resize.
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

  // Pre-render asset thumbnails.
  // (computed inline in the sidebar; small libraries don't need caching.)

  // Convert window-relative clientX/Y to container-local coords for screenToWorld/zoomAt.
  const getLocalCoords = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }

  // Pointer state for pan + tap-vs-drag classification.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchPair = useRef<{ idA: number; idB: number } | null>(null)
  const pinchAnchor = useRef<{ dist: number; midX: number; midY: number; viewport: Viewport } | null>(null)
  const tapStartScreen = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const previewDragOffset = useRef<{ dx: number; dy: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input, [data-no-pan]')) return
    pointers.current.set(e.pointerId, getLocalCoords(e.clientX, e.clientY))
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    if (pointers.current.size === 2) {
      const ids = Array.from(pointers.current.keys())
      const a = pointers.current.get(ids[0])!
      const b = pointers.current.get(ids[1])!
      pinchPair.current = { idA: ids[0], idB: ids[1] }
      pinchAnchor.current = {
        dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        viewport: viewportRef.current,
      }
      hasDragged.current = true
      tapStartScreen.current = null
      return
    }

    // Single-pointer: capture potential tap, or start dragging the preview if tapped over it.
    if (pointers.current.size === 1) {
      const local = getLocalCoords(e.clientX, e.clientY)
      tapStartScreen.current = local
      hasDragged.current = false

      // If preview exists and tap is inside the preview rectangle, prepare to drag-move it.
      const p = previewRef.current
      const a = selectedRef.current
      if (p && a && !brushRef.current) {
        const halfW = Math.floor(a.width / 2)
        const halfH = Math.floor(a.height / 2)
        const topLeft = { x: p.worldX - halfW, y: p.worldY + halfH }
        const tlScreen = worldToScreen(topLeft.x, topLeft.y, viewportRef.current)
        const w = a.width * viewportRef.current.scale
        const h = a.height * viewportRef.current.scale
        if (
          local.x >= tlScreen.sx && local.x <= tlScreen.sx + w &&
          local.y >= tlScreen.sy && local.y <= tlScreen.sy + h
        ) {
          previewDragOffset.current = { dx: local.x - tlScreen.sx, dy: local.y - tlScreen.sy }
        } else {
          previewDragOffset.current = null
        }
      } else {
        previewDragOffset.current = null
      }
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    const local = getLocalCoords(e.clientX, e.clientY)
    pointers.current.set(e.pointerId, local)

    // Pinch.
    if (pinchPair.current && pinchAnchor.current) {
      const { idA, idB } = pinchPair.current
      const a = pointers.current.get(idA)
      const b = pointers.current.get(idB)
      if (!a || !b) return
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y))
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      const anchor = pinchAnchor.current
      const factor = Math.max(0.05, Math.min(20, dist / anchor.dist))
      const dx = midX - anchor.midX
      const dy = midY - anchor.midY
      const w = sizeRef.current.w, h = sizeRef.current.h
      const minScaleEff = effectiveMinScale('browse', w, h)
      const desired = anchor.viewport.scale * factor
      const finalScale = Math.max(minScaleEff, Math.min(MAX_SCALE, desired))
      const effFactor = finalScale / anchor.viewport.scale
      setViewport(() => {
        const panned = panViewport(anchor.viewport, dx, dy)
        const zoomed = zoomAt(panned, midX, midY, effFactor)
        return clampViewport(zoomed, w, h, 'browse', null)
      })
      return
    }

    if (tapStartScreen.current) {
      if (!hasDragged.current) {
        const start = tapStartScreen.current
        const movement = Math.hypot(local.x - start.x, local.y - start.y)
        if (movement >= TAP_MAX_PX) hasDragged.current = true
      }

      // Drag the preview if user grabbed it.
      if (hasDragged.current && previewDragOffset.current && previewRef.current) {
        const a = selectedRef.current
        if (a) {
          const newTopLeftScreen = {
            sx: local.x - previewDragOffset.current.dx,
            sy: local.y - previewDragOffset.current.dy,
          }
          const halfW = Math.floor(a.width / 2)
          const halfH = Math.floor(a.height / 2)
          const tlWorld = screenToWorld(newTopLeftScreen.sx, newTopLeftScreen.sy, viewportRef.current)
          // tlWorld is the world pixel matching the new top-left;
          // image-local Y=0 corresponds to world Y = centerY + halfH (since flipped).
          const centerWorldX = Math.round(tlWorld.x + halfW)
          const centerWorldY = Math.round(tlWorld.y - halfH)
          setPreview({ worldX: centerWorldX, worldY: centerWorldY })
        }
        return
      }

      // Otherwise, pan the map.
      if (hasDragged.current) {
        setViewport(vp => clampViewport(
          panViewport(vp, local.x - prev.x, local.y - prev.y),
          sizeRef.current.w, sizeRef.current.h, 'browse', null,
        ))
      }
    }
  }, [])

  const placeAtTap = useCallback(async (sx: number, sy: number) => {
    const asset = selectedRef.current
    if (!asset) return
    const w = screenToWorld(sx, sy, viewportRef.current)
    const wx = Math.floor(w.x)
    const wy = Math.floor(w.y)

    const flashId = Date.now() + Math.random()
    setFlashes(prev => [
      ...prev,
      {
        id: flashId,
        worldX: wx,
        worldY: wy,
        width: asset.width,
        height: asset.height,
        startedAt: performance.now(),
      },
    ])

    setProgress({ placed: 0, total: asset.pixels.length, name: asset.name })
    const result = await placeAsset(asset, wx, wy, (placed, total) => {
      setProgress({ placed, total, name: asset.name })
    })
    setProgress(null)
    refreshUndo()

    if (!result.success) {
      setStatusMsg(`Place failed (${result.placed}/${result.total} written): ${result.error ?? 'unknown'}`)
    } else {
      setStatusMsg(`Placed ${result.total} px (${asset.name})`)
    }
    setTimeout(() => setStatusMsg(''), 4000)
  }, [refreshUndo])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pinchPair.current) {
      const { idA, idB } = pinchPair.current
      if (e.pointerId === idA || e.pointerId === idB) {
        pinchPair.current = null
        pinchAnchor.current = null
      }
    }

    const wasTap = tapStartScreen.current && !hasDragged.current
    const start = tapStartScreen.current
    const wasPreviewDrag = !!previewDragOffset.current
    tapStartScreen.current = null
    hasDragged.current = false
    previewDragOffset.current = null

    if (!wasTap || !start) return
    if (wasPreviewDrag) return

    const asset = selectedRef.current
    if (!asset) return

    const w = screenToWorld(start.x, start.y, viewportRef.current)
    const wx = Math.floor(w.x)
    const wy = Math.floor(w.y)

    if (brushRef.current) {
      // Brush mode: place immediately, no preview.
      void placeAtTap(start.x, start.y)
    } else {
      setPreview({ worldX: wx, worldY: wy })
    }
  }, [placeAtTap])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const local = getLocalCoords(e.clientX, e.clientY)
    setViewport(vp => {
      const w = sizeRef.current.w, h = sizeRef.current.h
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const minScaleEff = effectiveMinScale('browse', w, h)
      const desired = vp.scale * factor
      const finalScale = Math.max(minScaleEff, Math.min(MAX_SCALE, desired))
      if (Math.abs(finalScale - vp.scale) < 1e-4) return vp
      const effFactor = finalScale / vp.scale
      return clampViewport(zoomAt(vp, local.x, local.y, effFactor), w, h, 'browse', null)
    })
  }, [])

  // Render the preview overlay (asset pixels at correct screen position).
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const bw = Math.round(size.w * dpr)
    const bh = Math.round(size.h * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    ctx.imageSmoothingEnabled = false

    // Preview overlay (semi-transparent asset).
    if (preview && selectedAsset) {
      const a = selectedAsset
      const offsetX = preview.worldX - Math.floor(a.width / 2)
      const offsetY = preview.worldY - Math.floor(a.height / 2)
      ctx.globalAlpha = 0.7
      const byColor = new Map<string, Array<[number, number]>>()
      for (const p of a.pixels) {
        const wx = offsetX + p.x
        // Vertical flip for screen orientation; matches DirectWriter.
        const wy = offsetY + (a.height - 1 - p.y)
        let bucket = byColor.get(p.color)
        if (!bucket) { bucket = []; byColor.set(p.color, bucket) }
        bucket.push([wx, wy])
      }
      for (const [color, pts] of byColor) {
        ctx.fillStyle = color
        for (const [wx, wy] of pts) {
          const { sx, sy } = worldToScreen(wx, wy + 1, viewport)
          ctx.fillRect(sx, sy, viewport.scale, viewport.scale)
        }
      }
      ctx.globalAlpha = 1
      // Outline rectangle.
      const tl = worldToScreen(offsetX, offsetY + a.height, viewport)
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.strokeRect(tl.sx, tl.sy, a.width * viewport.scale, a.height * viewport.scale)
      ctx.setLineDash([])
    }

    // Brush flashes.
    const now = performance.now()
    const live = flashes.filter(f => now - f.startedAt < 600)
    if (live.length !== flashes.length) setFlashes(live)
    for (const f of live) {
      const t = (now - f.startedAt) / 600
      const alpha = (1 - t) * 0.6
      const offsetX = f.worldX - Math.floor(f.width / 2)
      const offsetY = f.worldY - Math.floor(f.height / 2)
      const tl = worldToScreen(offsetX, offsetY + f.height, viewport)
      ctx.strokeStyle = `rgba(80,120,200,${alpha})`
      ctx.lineWidth = 2
      ctx.strokeRect(tl.sx, tl.sy, f.width * viewport.scale, f.height * viewport.scale)
    }
  }, [preview, selectedAsset, viewport, size, flashes])

  // RAF loop while flashes exist (to drive fade).
  useEffect(() => {
    if (flashes.length === 0) return
    let raf = 0
    const tick = () => {
      setFlashes(prev => {
        const now = performance.now()
        const next = prev.filter(f => now - f.startedAt < 600)
        return next.length === prev.length ? prev : next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [flashes.length])

  const commitPreview = useCallback(async () => {
    const p = preview
    if (!p) return
    const asset = selectedRef.current
    if (!asset) return
    setPreview(null)
    setProgress({ placed: 0, total: asset.pixels.length, name: asset.name })
    const result = await placeAsset(asset, p.worldX, p.worldY, (placed, total) => {
      setProgress({ placed, total, name: asset.name })
    })
    setProgress(null)
    refreshUndo()
    if (!result.success) {
      setStatusMsg(`Place failed (${result.placed}/${result.total} written): ${result.error ?? 'unknown'}`)
    } else {
      setStatusMsg(`Placed ${result.total} px (${asset.name})`)
    }
    setTimeout(() => setStatusMsg(''), 4000)
  }, [preview, refreshUndo])

  const handleUndo = useCallback(async () => {
    const top = peekUndoEntry()
    if (!top) return
    if (!confirm(`Undo placement of "${top.assetName}" (${top.eventIds.length} pixels)?`)) return
    const result = await undoLastPlacement()
    refreshUndo()
    if (result.success) {
      setStatusMsg(`Undid "${result.assetName}" (${result.deletedCount} px)`)
    } else {
      setStatusMsg(`Undo failed: ${result.error ?? 'unknown'}`)
    }
    setTimeout(() => setStatusMsg(''), 4000)
  }, [refreshUndo])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm('DELETE ALL pixels with session_id LIKE "dev-seed-%" from production DB? This cannot be undone.')) return
    if (!confirm('Are you really sure? This affects shared production data.')) return
    const result = await deleteAllSeededPixels()
    refreshUndo()
    if (result.success) {
      setStatusMsg(`Deleted ${result.deletedCount} dev-seeded pixels`)
    } else {
      setStatusMsg(`Delete-all failed: ${result.error ?? 'unknown'}`)
    }
    setTimeout(() => setStatusMsg(''), 6000)
  }, [refreshUndo])

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
      {/* Sidebar */}
      <div style={sidebarStyle} data-no-pan>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>Place</strong>
          <button onClick={onClose} style={smallButton}>← Back</button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={brushMode}
            onChange={e => {
              setBrushMode(e.target.checked)
              if (e.target.checked) setPreview(null)
            }}
          />
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
            Brush mode (tap-to-stamp)
          </span>
        </label>

        <div style={{ fontSize: 11, color: '#888', fontFamily: 'ui-monospace, monospace', marginBottom: 6 }}>
          {library.length} assets
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {library.map(asset => (
            <button
              key={asset.id}
              onClick={() => { setSelectedId(asset.id); setPreview(null) }}
              style={{
                ...thumbButtonStyle,
                border: selectedId === asset.id ? '2px solid #1a1a1a' : '1px solid #ccc',
              }}
            >
              <AssetThumb asset={asset} size={80} />
              <div style={thumbLabel}>{asset.name}</div>
              <div style={thumbDims}>{asset.width}×{asset.height} · {asset.pixels.length}px</div>
            </button>
          ))}
        </div>

        {progress && (
          <div style={progressBox}>
            Placing {progress.placed} of {progress.total}: {progress.name}
          </div>
        )}

        {preview && !brushMode && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={commitPreview} style={primaryButton}>Place</button>
            <button onClick={() => setPreview(null)} style={smallButton}>Cancel</button>
          </div>
        )}

        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #ddd' }}>
          <button
            onClick={handleUndo}
            disabled={undoSize === 0}
            style={{ ...smallButton, width: '100%', marginBottom: 6, opacity: undoSize === 0 ? 0.5 : 1 }}
          >
            Undo last {undoTop ? `(${undoTop.assetName} — ${undoTop.eventIds.length}px)` : ''} ({undoSize})
          </button>
          <button onClick={handleDeleteAll} style={{ ...dangerButton, width: '100%' }}>
            Delete ALL dev-seeded pixels
          </button>
        </div>

        {statusMsg && (
          <div style={statusStyle}>{statusMsg}</div>
        )}
      </div>

      {/* Map */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
      >
        <BaseMapLayer viewport={viewport} width={size.w} height={size.h} pass="fills" />
        <PixelLayer viewport={viewport} width={size.w} height={size.h} pixelVersion={pixelVersion} />
        <BaseMapLayer viewport={viewport} width={size.w} height={size.h} pass="outlines" />
        <canvas
          ref={overlayRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${size.w}px`,
            height: `${size.h}px`,
            pointerEvents: 'none',
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  )
}

function AssetThumb({ asset, size }: { asset: SavedAsset; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = Math.max(1, Math.floor(Math.min(size / asset.width, size / asset.height)))
    const w = asset.width * scale
    const h = asset.height * scale
    canvas.width = w
    canvas.height = h
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, w, h)
    for (const p of asset.pixels) {
      ctx.fillStyle = p.color
      ctx.fillRect(p.x * scale, p.y * scale, scale, scale)
    }
  }, [asset, size])
  return (
    <canvas
      ref={ref}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        imageRendering: 'pixelated',
        background: '#fafafa',
        border: '1px solid #eee',
      }}
    />
  )
}

const sidebarStyle: React.CSSProperties = {
  width: 280,
  background: '#fff',
  borderRight: '1px solid #ddd',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'ui-monospace, monospace',
}
const thumbButtonStyle: React.CSSProperties = {
  background: '#fafafa',
  borderRadius: 4,
  padding: 4,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
}
const thumbLabel: React.CSSProperties = {
  fontSize: 11,
  textAlign: 'center',
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const thumbDims: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
}
const smallButton: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  border: '1px solid #aaa',
  background: '#fff',
  cursor: 'pointer',
  borderRadius: 4,
  fontFamily: 'ui-monospace, monospace',
}
const primaryButton: React.CSSProperties = {
  padding: '6px 12px',
  background: '#1a1a1a',
  color: '#faf7f2',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
  flex: 1,
}
const dangerButton: React.CSSProperties = {
  padding: '6px 12px',
  background: '#991b1b',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
}
const progressBox: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 8px',
  background: '#f0ebe0',
  border: '1px solid #d8d2c8',
  borderRadius: 4,
  fontSize: 11,
}
const statusStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 8px',
  background: '#eef',
  border: '1px solid #cce',
  borderRadius: 4,
  fontSize: 11,
}
