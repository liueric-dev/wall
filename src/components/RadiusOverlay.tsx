import { useEffect, useRef } from 'react'
import { worldToScreen } from '../lib/coordinates'
import { DRAW_RADIUS } from '../lib/location'
import type { Viewport } from '../lib/viewport'

interface Props {
  locationWorld: { x: number; y: number }
  viewport: Viewport
  width: number
  height: number
}

export default function RadiusOverlay({ locationWorld, viewport, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    const { sx: cx, sy: cy } = worldToScreen(locationWorld.x, locationWorld.y, viewport)
    const r = DRAW_RADIUS * viewport.scale

    // Soft radial glow inside the circle
    const grad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r)
    grad.addColorStop(0, 'rgba(80, 120, 200, 0)')
    grad.addColorStop(1, 'rgba(80, 120, 200, 0.07)')
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // Circle outline
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(80, 120, 200, 0.35)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }, [locationWorld, viewport, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  )
}
