import { PALETTE } from '../data/testDoodles'

// Sprint 2 uses first 5 palette colors
const DRAW_COLORS = PALETTE.slice(0, 5)

interface Props {
  selectedColor: number
  onColorSelect: (idx: number) => void
  onUndo: () => void
  onDone: () => void
  canUndo: boolean
  pixelCount: number
  locationName: string
}

export default function DrawingToolbar({
  selectedColor,
  onColorSelect,
  onUndo,
  onDone,
  canUndo,
  pixelCount,
  locationName,
}: Props) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0,
      pointerEvents: 'none',
    }}>
      {/* Location label */}
      <div style={{
        fontSize: 11,
        color: '#6b6360',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 6,
        fontFamily: 'ui-monospace, monospace',
        pointerEvents: 'none',
      }}>
        {locationName} · {pixelCount} pixels today
      </div>

      {/* Main toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#faf7f2',
        border: '1px solid #d8d2c8',
        borderRadius: 14,
        padding: '10px 16px',
        marginBottom: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
        pointerEvents: 'auto',
      }}>
        {/* Color swatches */}
        {DRAW_COLORS.map((hex, idx) => (
          <button
            key={hex}
            onClick={() => onColorSelect(idx)}
            style={{
              width: 32,
              height: 32,
              minWidth: 32,
              borderRadius: '50%',
              background: hex,
              border: selectedColor === idx
                ? '2px solid #faf7f2'
                : '2px solid transparent',
              outline: selectedColor === idx
                ? `2px solid ${hex}`
                : '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              transition: 'outline 0.1s, transform 0.1s',
              transform: selectedColor === idx ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#d8d2c8' }} />

        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: canUndo ? 'pointer' : 'default',
            opacity: canUndo ? 1 : 0.3,
            fontSize: 18,
            borderRadius: 8,
          }}
          title="Undo"
        >
          ↩
        </button>

        {/* Done */}
        <button
          onClick={onDone}
          style={{
            height: 36,
            padding: '0 14px',
            background: '#1a1a1a',
            color: '#faf7f2',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'ui-monospace, monospace',
            letterSpacing: '0.04em',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
