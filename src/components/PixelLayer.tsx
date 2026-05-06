import { useEffect, useRef, useCallback } from 'react'
import { worldToScreen, screenToWorld } from '../lib/coordinates'
import { getPixelsInBounds } from '../lib/pixelStore'
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

    // Group user-placed pixels by hex color to minimize fillStyle changes.
    // Uses the tile-indexed iterator so we touch only pixels whose tiles
    // intersect the viewport — O(visible) instead of O(total).
    const byColor = new Map<string, [number, number][]>()
    for (const [key, color] of getPixelsInBounds(wxMin, wxMax, wyMin, wyMax)) {
      const comma = key.indexOf(',')
      const wx = Number(key.slice(0, comma))
      const wy = Number(key.slice(comma + 1))
      if (wx < wxMin || wx > wxMax || wy < wyMin || wy > wyMax) continue
      let bucket = byColor.get(color)
      if (!bucket) { bucket = []; byColor.set(color, bucket) }
      bucket.push([wx, wy])
    }

    for (const [color, pixels] of byColor) {
      ctx.fillStyle = color
      for (const [wx, wy] of pixels) {
        // NW corner of this pixel is worldToScreen(wx, wy+1, vp)
        const { sx: px, sy: py } = worldToScreen(wx, wy + 1, vp)
        ctx.fillRect(px, py, vp.scale, vp.scale)
      }
    }
  }, [viewport, width, height, pixelVersion])

  useEffect(() => {
    // Coalesce rapid prop updates (pan/zoom fires many setViewport per second)
    // into one renderFrame per animation frame.
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
