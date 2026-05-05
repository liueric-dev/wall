import { useEffect, useState } from 'react'
import { PALETTE } from '../config/tuning'
import { loadBudgetState, getCurrentBudget } from '../lib/budget'

interface Props {
  selectedColor: string
  onColorSelect: (hex: string) => void
  onDone: () => void
  prompt: string
}

export default function DrawingToolbar({ selectedColor, onColorSelect, onDone, prompt }: Props) {
  const [budget, setBudget] = useState(() => Math.floor(getCurrentBudget(loadBudgetState())))

  useEffect(() => {
    const id = setInterval(() => {
      setBudget(Math.floor(getCurrentBudget(loadBudgetState())))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const outOfPixels = budget <= 0

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      pointerEvents: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      {/* Main toolbar pill */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 10,
        background: '#faf7f2',
        border: '1px solid #d8d2c8',
        borderRadius: 16,
        padding: '12px 16px',
        marginBottom: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
        pointerEvents: 'auto',
      }}>
        {/* Prompt — hidden when empty */}
        {prompt && (
          <>
            <div style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: 'italic',
              fontSize: 13,
              color: '#3a3530',
              textAlign: 'center',
              lineHeight: 1.4,
              paddingBottom: 2,
              maxWidth: 320,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {prompt}
            </div>

            <div style={{ width: '100%', height: 1, background: '#d8d2c8' }} />
          </>
        )}

        {/* Bottom row: 5x2 swatch grid + budget + Done */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 26px)',
            gridTemplateRows: 'repeat(2, 26px)',
            gap: 5,
          }}>
            {PALETTE.map(hex => {
              const isSelected = selectedColor === hex
              const ringColor = hex === '#1a1a1a' ? '#f0ebe0' : '#1a1a1a'
              return (
                <button
                  key={hex}
                  onClick={() => onColorSelect(hex)}
                  aria-label={`Color ${hex}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: hex,
                    border: 'none',
                    outline: isSelected ? `2px solid ${ringColor}` : 'none',
                    outlineOffset: 2,
                    cursor: outOfPixels ? 'not-allowed' : 'pointer',
                    padding: 0,
                    opacity: outOfPixels ? 0.4 : 1,
                    transition: 'outline 0.1s, opacity 0.2s',
                  }}
                />
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              fontSize: 12,
              fontFamily: 'ui-monospace, monospace',
              color: outOfPixels ? '#9b8f87' : '#6b6360',
              letterSpacing: '0.02em',
            }}>
              {budget} px
            </div>

            <button
              onClick={onDone}
              style={{
                height: 32,
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
      </div>
    </div>
  )
}
