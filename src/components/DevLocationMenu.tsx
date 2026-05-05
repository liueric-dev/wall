import { LOCATIONS } from '../lib/location'
import { setDevOverride, setDevUnbounded } from '../lib/geolocation'

const DEV_LOCATIONS = Object.values(LOCATIONS)

export default function DevLocationMenu() {
  if (!import.meta.env.DEV) return null

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const name = e.target.value
    const loc = DEV_LOCATIONS.find(l => l.name === name)
    if (!loc) return
    setDevOverride({ lat: loc.lat, lng: loc.lng })
    setDevUnbounded(loc.name.startsWith('birb'))
  }

  return (
    <div style={{
      position: 'fixed',
      top: 8,
      right: 8,
      background: 'white',
      border: '1px solid #ccc',
      borderRadius: 6,
      padding: '4px 8px',
      zIndex: 9999,
      fontSize: 12,
      fontFamily: 'ui-monospace, monospace',
    }}>
      <select onChange={handleChange} defaultValue="">
        <option value="" disabled>Set dev location…</option>
        {DEV_LOCATIONS.map(loc => (
          <option key={loc.name} value={loc.name}>{loc.name}</option>
        ))}
      </select>
    </div>
  )
}
