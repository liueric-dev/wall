// File / URL / Text image loader for the dev/seed tool.
// See SPRINT-13.md Step 4.

import { useState } from 'react'

interface Props {
  onImage: (img: HTMLImageElement | HTMLCanvasElement, source: string) => void
}

type LoaderMode = 'file' | 'url' | 'text'

const FONTS: Array<{ value: string; label: string }> = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans-serif', label: 'Sans-serif' },
  { value: 'monospace', label: 'Monospace' },
  { value: 'cursive', label: 'Cursive' },
]

export function ImageLoader({ onImage }: Props) {
  const [mode, setMode] = useState<LoaderMode>('file')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [font, setFont] = useState<string>('serif')
  const [fontSize, setFontSize] = useState(40)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleFile = (file: File) => {
    setError('')
    const img = new Image()
    img.onload = () => onImage(img, `file:${file.name}`)
    img.onerror = () => setError('Failed to load image')
    img.src = URL.createObjectURL(file)
  }

  const handleUrl = async () => {
    if (!url.trim()) {
      setError('URL required')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/dev-fetch-image?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        let msg = `Failed (${res.status})`
        try {
          const body = await res.json()
          if (body && typeof body.error === 'string') msg = body.error
        } catch { /* ignore */ }
        setError(`${msg} — note: URL fetching only works under \`vercel dev\``)
        setLoading(false)
        return
      }
      const blob = await res.blob()
      const img = new Image()
      img.onload = () => {
        setLoading(false)
        onImage(img, `url:${url}`)
      }
      img.onerror = () => {
        setLoading(false)
        setError('Failed to render image')
      }
      img.src = URL.createObjectURL(blob)
    } catch (err) {
      setLoading(false)
      const msg = err instanceof Error ? err.message : String(err)
      setError(`URL fetch error: ${msg}`)
    }
  }

  const handleText = () => {
    setError('')
    if (!text.trim()) {
      setError('Text required')
      return
    }
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    ctx.font = `${fontSize}px ${font}`
    const metrics = ctx.measureText(text)
    canvas.width = Math.max(1, Math.ceil(metrics.width) + 20)
    canvas.height = fontSize + 20

    // Re-set font after canvas resize (resizing clears context state).
    ctx.font = `${fontSize}px ${font}`
    ctx.fillStyle = 'black'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, canvas.height / 2)

    onImage(canvas, `text:${text}`)
  }

  return (
    <div style={panel}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['file', 'url', 'text'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={tab(mode === m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {mode === 'file' && <DragDropZone onFile={handleFile} />}

      {mode === 'url' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://…"
            style={textInput}
          />
          <button onClick={handleUrl} disabled={loading} style={primaryButton}>
            {loading ? 'Fetching…' : 'Fetch'}
          </button>
          <div style={hint}>Requires <code>vercel dev</code></div>
        </div>
      )}

      {mode === 'text' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Type text…"
            style={textInput}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={font} onChange={e => setFont(e.target.value)} style={selectInput}>
              {FONTS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <input
              type="number"
              value={fontSize}
              onChange={e => setFontSize(Math.max(20, Math.min(100, parseInt(e.target.value || '40'))))}
              min={20}
              max={100}
              style={{ ...textInput, width: 80 }}
            />
          </div>
          <button onClick={handleText} style={primaryButton}>Render</button>
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

function DragDropZone({ onFile }: { onFile: (file: File) => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setHover(true) }}
      onDragLeave={() => setHover(false)}
      onDrop={e => {
        e.preventDefault()
        setHover(false)
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) onFile(file)
      }}
      style={{
        border: `2px dashed ${hover ? '#1a1a1a' : '#aaa'}`,
        padding: 24,
        textAlign: 'center',
        background: hover ? '#f0ebe0' : '#fafafa',
        borderRadius: 8,
        fontSize: 13,
        fontFamily: 'ui-monospace, monospace',
        color: '#555',
      }}
    >
      <div style={{ marginBottom: 8 }}>Drop image here</div>
      <input
        type="file"
        accept="image/*"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
    </div>
  )
}

const panel: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 12,
}
const tab = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '6px 10px',
  border: '1px solid #aaa',
  background: active ? '#1a1a1a' : '#fff',
  color: active ? '#faf7f2' : '#1a1a1a',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
})
const textInput: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid #bbb',
  borderRadius: 4,
  fontFamily: 'ui-monospace, monospace',
  width: '100%',
  boxSizing: 'border-box',
}
const selectInput: React.CSSProperties = {
  ...textInput,
  flex: 1,
}
const primaryButton: React.CSSProperties = {
  padding: '6px 12px',
  background: '#1a1a1a',
  color: '#faf7f2',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 13,
}
const hint: React.CSSProperties = {
  fontSize: 11,
  color: '#888',
  fontFamily: 'ui-monospace, monospace',
}
const errorStyle: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 10px',
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  color: '#991b1b',
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
  borderRadius: 4,
}
