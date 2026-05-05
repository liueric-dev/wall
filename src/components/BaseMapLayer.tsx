import { useEffect, useRef } from 'react'
import { latLngToWorld, worldToScreen } from '../lib/coordinates'
import { NYC_BOROUGHS } from '../data/nycGeo'
import { NYC_PARKS } from '../data/nycParks'
import { OUTLINE_COLOR } from '../config/tuning'
import type { Viewport } from '../lib/viewport'

// Pre-convert park rings from [lng, lat] to world coords
const PARKS_WORLD = Object.values(NYC_PARKS).map(ring =>
  ring.map(([lng, lat]) => latLngToWorld(lat, lng))
)

// Pre-convert all GeoJSON [lng, lat] rings to world pixel coords at module load
const BOROUGHS_WORLD: Record<string, Array<Array<{ x: number; y: number }>>> =
  Object.fromEntries(
    Object.entries(NYC_BOROUGHS).map(([name, rings]) => [
      name,
      rings.map(ring =>
        ring.map(([lng, lat]) => latLngToWorld(lat, lng))
      ),
    ])
  )

function drawRing(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  vp: Viewport,
) {
  if (pts.length < 2) return
  ctx.beginPath()
  const { sx, sy } = worldToScreen(pts[0].x, pts[0].y, vp)
  ctx.moveTo(sx, sy)
  for (let i = 1; i < pts.length; i++) {
    const p = worldToScreen(pts[i].x, pts[i].y, vp)
    ctx.lineTo(p.sx, p.sy)
  }
  ctx.closePath()
}

interface Props {
  viewport: Viewport
  width: number
  height: number
  pass: 'fills' | 'outlines'
}

export default function BaseMapLayer({ viewport, width, height, pass }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const bw = Math.round(width * dpr)
    const bh = Math.round(height * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    if (pass === 'fills') {
      // Background cream + borough land tint. Renders below pixels.
      ctx.fillStyle = '#faf7f2'
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = '#f4efe6'
      for (const rings of Object.values(BOROUGHS_WORLD)) {
        for (const ring of rings) {
          drawRing(ctx, ring, viewport)
          ctx.fill()
        }
      }
    } else {
      // Borough/coastline outlines + park outlines. Renders above pixels.
      ctx.strokeStyle = OUTLINE_COLOR
      ctx.lineWidth = 1
      for (const rings of Object.values(BOROUGHS_WORLD)) {
        for (const ring of rings) {
          drawRing(ctx, ring, viewport)
          ctx.stroke()
        }
      }

      ctx.strokeStyle = '#8faa85'
      ctx.lineWidth = 1
      for (const ring of PARKS_WORLD) {
        drawRing(ctx, ring, viewport)
        ctx.stroke()
      }
    }
  }, [viewport, width, height, pass])

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
      }}
    />
  )
}
