import { useState } from 'react'
import { usePermissionState } from '../lib/usePermissionState'

export default function PermissionBanner() {
  const permission = usePermissionState()
  const [dismissed, setDismissed] = useState(
    () => !!sessionStorage.getItem('permission_banner_dismissed')
  )

  // Don't render until we know the actual state
  if (permission === null) return null
  if (permission === 'granted') return null
  if (dismissed) return null

  function handleEnable() {
    // Triggers the browser prompt if state is 'prompt'; no-op if already denied
    navigator.geolocation.getCurrentPosition(() => {}, () => {})
  }

  function handleDismiss() {
    setDismissed(true)
    sessionStorage.setItem('permission_banner_dismissed', 'true')
  }

  const isDenied = permission === 'denied'

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1a1a1a',
      color: '#faf7f2',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 100,
      fontFamily: 'ui-monospace, monospace',
      fontSize: 13,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 2 }}>
          {isDenied ? 'Location blocked' : 'Enable location to add to The Wall'}
        </div>
        <div style={{ color: '#aaa', fontSize: 11 }}>
          {isDenied
            ? 'Go to Settings → Safari → Location to allow.'
            : 'You can browse anywhere — drawing requires being there.'}
        </div>
      </div>
      {!isDenied && (
        <button
          onClick={handleEnable}
          style={{
            background: '#faf7f2',
            color: '#1a1a1a',
            border: 'none',
            borderRadius: 14,
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            whiteSpace: 'nowrap',
          }}
        >
          Enable
        </button>
      )}
      <button
        onClick={handleDismiss}
        style={{
          background: 'transparent',
          color: '#aaa',
          border: 'none',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 4px',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
