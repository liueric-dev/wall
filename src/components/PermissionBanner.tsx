import { useEffect, useState } from 'react'
import { getPermissionState } from '../lib/geolocation'

export default function PermissionBanner() {
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    getPermissionState().then(setPermission)
    if (sessionStorage.getItem('permission_banner_dismissed')) {
      setDismissed(true)
    }
  }, [])

  if (permission === 'granted') return null
  if (dismissed) return null

  function handleEnable() {
    navigator.geolocation.getCurrentPosition(
      () => getPermissionState().then(setPermission),
      () => getPermissionState().then(setPermission),
    )
  }

  function handleDismiss() {
    setDismissed(true)
    sessionStorage.setItem('permission_banner_dismissed', 'true')
  }

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
        <div style={{ marginBottom: 2 }}>Enable location to add to The Wall</div>
        <div style={{ color: '#aaa', fontSize: 11 }}>
          You can browse anywhere — drawing requires being there.
        </div>
      </div>
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
