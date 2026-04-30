import { useEffect, useState } from 'react'
import { PALETTE } from '../data/testDoodles'
import { loadBudgetState, getCurrentBudget } from '../lib/budget'

const DRAW_COLORS = PALETTE.slice(0, 5)

interface Props {
  selectedColor: number
  onColorSelect: (idx: number) => void
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
    }}>
      {/* Main toolbar pill */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        background: '#faf7f2',
        border: '1px solid #d8d2c8',
        borderRadius: 16,
        padding: '12px 16px',
        marginBottom: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.10)',
        pointerEvents: 'auto',
        maxWidth: 340,
      }}>
        {/* Prompt */}
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: 'italic',
          fontSize: 13,
          color: '#3a3530',
          textAlign: 'center',
          lineHeight: 1.4,
          paddingBottom: 2,
        }}>
          {prompt}
        </div>

        {/* Divider */}
        <div style={{ width: '100%', height: 1, background: '#d8d2c8' }} />

        {/* Color swatches + budget + done */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                border: selectedColor === idx ? '2px solid #faf7f2' : '2px solid transparent',
                outline: selectedColor === idx ? `2px solid ${hex}` : '2px solid transparent',
                cursor: outOfPixels ? 'not-allowed' : 'pointer',
                padding: 0,
                transition: 'outline 0.1s, transform 0.1s, opacity 0.2s',
                transform: selectedColor === idx ? 'scale(1.15)' : 'scale(1)',
                opacity: outOfPixels ? 0.4 : 1,
              }}
            />
          ))}

          {/* Divider */}
          <div style={{ width: 1, height: 28, background: '#d8d2c8' }} />

          {/* Budget counter */}
          <div style={{
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            color: outOfPixels ? '#9b8f87' : '#6b6360',
            minWidth: 52,
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}>
            {outOfPixels ? '0 pixels' : `${budget} px`}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 28, background: '#d8d2c8' }} />

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
    </div>
  )
}

