import { fetchNewEvents } from './pixelApi'
import type { Bounds, PixelEntry } from './pixelApi'

const POLL_INTERVAL_MS = 5000

export function startPolling(
  getBounds: () => Bounds,
  onNewPixels: (pixels: PixelEntry[]) => void,
): () => void {
  let lastTime = new Date().toISOString()

  const id = window.setInterval(async () => {
    const pixels = await fetchNewEvents(lastTime, getBounds())
    if (pixels.length > 0) {
      onNewPixels(pixels)
      lastTime = pixels[pixels.length - 1].placed_at
    }
  }, POLL_INTERVAL_MS)

  return () => clearInterval(id)
}
