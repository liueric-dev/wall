import { useEffect, useRef, useCallback } from 'react'
import { worldToScreen, screenToWorld, TILE_SIZE } from '../lib/coordinates'
import { getVisibleTileCanvases } from '../lib/pixelStore'
import type { Viewport } from '../lib/viewport'

interface Props {
  viewport: Viewport
  width: number
  height: number
  pixelVersion: number
}

export default function PixelLayer({ viewport, width, height, pixelVersion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const vp = viewportRef.current

    const dpr = window.devicePixelRatio || 1
    const bw = Math.round(width * dpr)
    const bh = Math.round(height * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false

    const tl = screenToWorld(0, 0, vp)
    const br = screenToWorld(width, height, vp)
    const wxMin = Math.min(tl.x, br.x)
    const wxMax = Math.max(tl.x, br.x)
    const wyMin = Math.min(tl.y, br.y)
    const wyMax = Math.max(tl.y, br.y)

    // Render: drawImage every populated tile that intersects the viewport.
    // Per-frame cost is ~O(visible_tiles) — independent of total pixel count.
    const tileScreenSize = TILE_SIZE * vp.scale
    for (const { tx, ty, canvas: tileCanvas } of getVisibleTileCanvases(wxMin, wxMax, wyMin, wyMax)) {
      // World NW corner of the tile is (tx*TILE, (ty+1)*TILE) (world Y grows north).
      const { sx, sy } = worldToScreen(tx * TILE_SIZE, (ty + 1) * TILE_SIZE, vp)
      ctx.drawImage(tileCanvas, sx, sy, tileScreenSize, tileScreenSize)
    }
  }, [viewport, width, height, pixelVersion])

  useEffect(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      renderFrame()
    })
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [renderFrame])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  )
}
