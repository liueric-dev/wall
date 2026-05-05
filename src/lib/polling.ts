import { fetchNewEvents } from './pixelApi'
import type { Bounds } from './pixelApi'
import { applyIncomingEvents, getLastSeenTimestamp } from './eventHandler'
import { setConnectionState } from './connectionState'
import { TUNING } from '../config/tuning'

type Mode = 'browse' | 'draw' | 'animating'

export function startPolling(
  getBounds: () => Bounds,
  getMode: () => Mode,
): () => void {
  let timer: number | null = null
  let stopped = false

  const intervalFor = (mode: Mode) =>
    mode === 'draw' ? TUNING.polling.drawIntervalMs : TUNING.polling.browseIntervalMs

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const pollOnce = async () => {
    const since = getLastSeenTimestamp() ?? new Date().toISOString()
    try {
      const events = await fetchNewEvents(since, getBounds())
      applyIncomingEvents(events)
      setConnectionState('connected')
    } catch (err) {
      console.error('Poll failed:', err)
      setConnectionState('disconnected')
    }
  }

  const schedule = () => {
    if (stopped || document.hidden) return
    timer = window.setTimeout(async () => {
      timer = null
      await pollOnce()
      schedule()
    }, intervalFor(getMode()))
  }

  const onVisibilityChange = () => {
    if (document.hidden) {
      cancel()
    } else if (!stopped) {
      // Immediate catch-up, then resume normal cadence.
      pollOnce().then(schedule)
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  schedule()

  return () => {
    stopped = true
    cancel()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
