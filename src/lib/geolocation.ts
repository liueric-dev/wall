export type LocationState = {
  lat: number
  lng: number
  capturedAt: number
  source: 'gps' | 'dev'
}

let lockedLocation: LocationState | null = null
let devOverride: { lat: number; lng: number } | null = null

export function setDevOverride(loc: { lat: number; lng: number } | null) {
  devOverride = loc
  lockedLocation = null  // clear lock so next captureLocationForSession picks up the new override
}

export async function captureLocationForSession(): Promise<LocationState | null> {
  if (lockedLocation) return lockedLocation

  if (devOverride) {
    lockedLocation = {
      lat: devOverride.lat,
      lng: devOverride.lng,
      capturedAt: Date.now(),
      source: 'dev',
    }
    return lockedLocation
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        lockedLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          capturedAt: Date.now(),
          source: 'gps',
        }
        resolve(lockedLocation)
      },
      (error) => {
        console.error('Geolocation failed:', error)
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    )
  })
}

export function clearLockedLocation() {
  lockedLocation = null
}

export function getLockedLocation(): LocationState | null {
  return lockedLocation
}

export async function getPermissionState(): Promise<PermissionState> {
  if (!navigator.permissions) return 'prompt'
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    return result.state
  } catch {
    return 'prompt'
  }
}
