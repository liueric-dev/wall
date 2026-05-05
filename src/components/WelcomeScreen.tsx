import { useRef, useState } from 'react'
import { captureLocationForSession } from '../lib/geolocation'
import { latLngToWorld } from '../lib/coordinates'
import { insertPixelEvent } from '../lib/pixelApi'
import { getOrCreateSessionId, generateId } from '../lib/session'
import { PALETTE } from '../config/tuning'

const CANVAS_SIZE = 120
const PIXEL_SIZE = 10
const GRID = CANVAS_SIZE / PIXEL_SIZE  // 12×12 grid on the mini canvas

const WELCOME_COLORS = PALETTE.slice(0, 5)

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export default function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedColor, setSelectedColor] = useState<string>(WELCOME_COLORS[0])
  const [placed, setPlaced] = useState(false)

  async function handleCanvasPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    if (placed) return
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const px = Math.floor((e.clientX - rect.left) / PIXEL_SIZE)
    const py = Math.floor((e.clientY - rect.top) / PIXEL_SIZE)
    if (px < 0 || px >= GRID || py < 0 || py >= GRID) return

    setPlaced(true)

    // Render pixel on mini canvas
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = selectedColor
    ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE)

    // GPS must be kicked off synchronously within the user gesture — any await before
    // this call breaks iOS Safari's gesture-context requirement
    const locPromise = captureLocationForSession()

    await delay(500)

    const locResult = await locPromise
    const loc = locResult && locResult !== 'denied' ? locResult : null

    if (loc) {
      const world = latLngToWorld(loc.lat, loc.lng)
      const wx = world.x + randomInt(-10, 10)
      const wy = world.y + randomInt(-10, 10)
      const sessionId = getOrCreateSessionId()
      await insertPixelEvent(
        {
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
        },
        selectedColor,
      )
    }

    localStorage.setItem('wall_onboarded', 'true')
    onComplete()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#faf7f2',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      padding: 32,
    }}>
      <h1 style={{
        fontFamily: 'Georgia, serif',
        fontSize: 32,
        fontWeight: 400,
        color: '#1a1a1a',
        margin: 0,
        letterSpacing: '0.01em',
      }}>
        The Wall
      </h1>

      <p style={{
        fontFamily: 'Georgia, serif',
        fontSize: 16,
        color: '#444',
        margin: 0,
        textAlign: 'center',
        maxWidth: 280,
        lineHeight: 1.6,
      }}>
        A canvas of New York City,<br />drawn one pixel at a time.
      </p>

      <p style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13,
        color: '#888',
        margin: 0,
        textAlign: 'center',
        letterSpacing: '0.03em',
      }}>
        You're early — the wall is just beginning.<br />Make your first mark.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onPointerDown={handleCanvasPointer}
          style={{
            border: '1px solid #ddd',
            borderRadius: 4,
            cursor: placed ? 'default' : 'crosshair',
            background: '#fff',
            touchAction: 'none',
            imageRendering: 'pixelated',
          }}
        />

        {/* Color picker */}
        {!placed && (
          <div style={{ display: 'flex', gap: 8 }}>
            {WELCOME_COLORS.map(hex => (
              <button
                key={hex}
                onClick={() => setSelectedColor(hex)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: hex,
                  border: selectedColor === hex ? '2px solid #1a1a1a' : '2px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  outline: selectedColor === hex ? '2px solid #faf7f2' : 'none',
                  outlineOffset: -4,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
