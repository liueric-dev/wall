import { useEffect, useState } from 'react'
import { getPermissionState } from './geolocation'

export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

// Polls + listens for permission changes so the UI stays in sync on iOS and desktop.
export function usePermissionState(): LocationPermission | null {
  const [state, setState] = useState<LocationPermission | null>(
    !navigator.geolocation ? 'unsupported' : null
  )

  useEffect(() => {
    if (!navigator.geolocation) return

    getPermissionState().then(setState)

    // Change listener where supported (Chrome/Firefox; unreliable on iOS Safari)
    let removeListener = () => {}
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then(status => {
          const handler = () => setState(status.state as LocationPermission)
          status.addEventListener('change', handler)
          removeListener = () => status.removeEventListener('change', handler)
        })
        .catch(() => {})
    }

    // Poll every 2s as fallback — iOS doesn't reliably fire change events
    const interval = setInterval(() => {
      getPermissionState().then(setState)
    }, 2000)

    return () => {
      removeListener()
      clearInterval(interval)
    }
  }, [])

  return state
}
