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

export async function captureLocationForSession(): Promise<LocationState | 'denied' | null> {
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
        console.error('Geolocation error code:', error.code, error.message)
        // code 1 = PERMISSION_DENIED; codes 2/3 = unavailable or timeout (not permanent)
        resolve(error.code === error.PERMISSION_DENIED ? 'denied' : null)
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

let _devUnbounded = false

export function setDevUnbounded(value: boolean): void {
  _devUnbounded = value
}

export function getDevUnbounded(): boolean {
  return _devUnbounded
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
