import { useEffect, useState } from 'react'
import { getPermissionState } from './geolocation'

// Polls + listens for permission changes so the UI stays in sync on iOS and desktop.
export function usePermissionState(): PermissionState | null {
  const [state, setState] = useState<PermissionState | null>(null)

  useEffect(() => {
    getPermissionState().then(setState)

    // Change listener where supported (Chrome/Firefox; unreliable on iOS Safari)
    let removeListener = () => {}
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then(status => {
          const handler = () => setState(status.state as PermissionState)
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
