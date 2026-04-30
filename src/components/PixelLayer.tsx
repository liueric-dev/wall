import { useEffect, useRef, useCallback } from 'react'
import { TILE_SIZE, worldToScreen, screenToWorld } from '../lib/coordinates'
import { getTileBitmapSync, prefetchTileBitmap, getTileImageData, TILE_COLS, TILE_ROWS } from '../lib/tileRenderer'
import { getAllUserPixels } from '../lib/pixelStore'
import { PALETTE } from '../data/testDoodles'
import type { Viewport } from '../lib/viewport'

// Off-screen canvas pool for ImageData → canvas conversion (sync fallback)
let _tmpCanvas: HTMLCanvasElement | null = null
function getTmpCanvas(): HTMLCanvasElement {
  if (!_tmpCanvas) {
    _tmpCanvas = document.createElement('canvas')
    _tmpCanvas.width = _tmpCanvas.height = TILE_SIZE
  }
  return _tmpCanvas
}

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

  const scheduleRender = useCallback(() => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      renderFrame()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const vp = viewportRef.current

    ctx.clearRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false

    // Determine visible tile range
    const tl = screenToWorld(0, 0, vp)
    const br = screenToWorld(width, height, vp)

    const txMin = Math.max(0, Math.floor(Math.min(tl.x, br.x) / TILE_SIZE))
    const txMax = Math.min(TILE_COLS - 1, Math.floor(Math.max(tl.x, br.x) / TILE_SIZE))
    const tyMin = Math.max(0, Math.floor(Math.min(tl.y, br.y) / TILE_SIZE))
    const tyMax = Math.min(TILE_ROWS - 1, Math.floor(Math.max(tl.y, br.y) / TILE_SIZE))

    const tileScreenSize = TILE_SIZE * vp.scale

    for (let ty = tyMin; ty <= tyMax; ty++) {
      for (let tx = txMin; tx <= txMax; tx++) {
        const bitmap = getTileBitmapSync(tx, ty)

        if (bitmap === null) continue // tile has no pixels

        // World NW corner of tile: (tx*TILE_SIZE, (ty+1)*TILE_SIZE)
        const { sx, sy } = worldToScreen(tx * TILE_SIZE, (ty + 1) * TILE_SIZE, vp)

        if (bitmap !== undefined) {
          // Fast path: GPU-cached ImageBitmap
          ctx.drawImage(bitmap, sx, sy, tileScreenSize, tileScreenSize)
        } else {
          // Bitmap not ready — draw from ImageData and kick off async load
          const imgData = getTileImageData(tx, ty)
          if (imgData) {
            const tmp = getTmpCanvas()
            tmp.getContext('2d')!.putImageData(imgData, 0, 0)
            ctx.drawImage(tmp, sx, sy, tileScreenSize, tileScreenSize)
          }
          prefetchTileBitmap(tx, ty, scheduleRender)
        }
      }
    }

    // Pass 2: user-placed pixels — group by color to minimize fillStyle changes
    const wxMin = Math.min(tl.x, br.x)
    const wxMax = Math.max(tl.x, br.x)
    const wyMin = Math.min(tl.y, br.y)
    const wyMax = Math.max(tl.y, br.y)

    const byColor = new Map<number, [number, number][]>()
    for (const [key, colorIdx] of getAllUserPixels()) {
      const comma = key.indexOf(',')
      const wx = Number(key.slice(0, comma))
      const wy = Number(key.slice(comma + 1))
      if (wx < wxMin || wx > wxMax || wy < wyMin || wy > wyMax) continue
      let bucket = byColor.get(colorIdx)
      if (!bucket) { bucket = []; byColor.set(colorIdx, bucket) }
      bucket.push([wx, wy])
    }

    for (const [colorIdx, pixels] of byColor) {
      ctx.fillStyle = PALETTE[colorIdx] ?? '#000'
      for (const [wx, wy] of pixels) {
        // NW corner of this pixel is worldToScreen(wx, wy+1, vp)
        const { sx: px, sy: py } = worldToScreen(wx, wy + 1, vp)
        ctx.fillRect(px, py, vp.scale, vp.scale)
      }
    }
  }, [viewport, width, height, pixelVersion, scheduleRender])

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    renderFrame()
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [renderFrame])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  )
}
