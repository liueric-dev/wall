// Main /dev/seed page. Orchestrates: load image, convert with settings,
// preview, save to library, switch to placement view.
//
// See SPRINT-13.md (overall workflow + Step 5–9).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageLoader } from './ImageLoader'
import {
  convertImageToAsset, colorDistribution, DEFAULT_OPTIONS,
} from './Converter'
import type { ConvertedAsset, ConvertOptions } from './Converter'
import {
  loadLibrary, addAsset, deleteAsset, downloadLibraryFile, importLibrary,
  newAssetId,
} from './Library'
import type { SavedAsset } from './Library'
import { PALETTE } from '../../config/tuning'
import { PlacementView } from './PlacementView'

type View = 'editor' | 'placement'

export default function SeedTool() {
  const [view, setView] = useState<View>('editor')

  const [source, setSource] = useState<HTMLImageElement | HTMLCanvasElement | null>(null)
  const [sourceLabel, setSourceLabel] = useState<string>('')

  const [options, setOptions] = useState<ConvertOptions>({ ...DEFAULT_OPTIONS })
  const [converted, setConverted] = useState<ConvertedAsset | null>(null)
  const [converting, setConverting] = useState(false)

  const [library, setLibrary] = useState<SavedAsset[]>(() => loadLibrary())
  const [name, setName] = useState('')

  // Re-convert whenever the source or options change.
  const convertSeq = useRef(0)
  useEffect(() => {
    if (!source) {
      setConverted(null)
      return
    }
    const seq = ++convertSeq.current
    setConverting(true)
    convertImageToAsset(source, options).then(result => {
      if (seq !== convertSeq.current) return
      setConverted(result)
      setConverting(false)
    }).catch(err => {
      console.error('Conversion failed:', err)
      setConverting(false)
    })
  }, [source, options])

  const handleImage = useCallback((img: HTMLImageElement | HTMLCanvasElement, src: string) => {
    setSource(img)
    setSourceLabel(src)
    if (!name) {
      // Suggest a default name from the source label.
      const stripped = src.replace(/^(file:|url:|text:)/, '').slice(0, 30)
      setName(stripped || 'asset')
    }
  }, [name])

  const handleSave = useCallback(() => {
    if (!converted) return
    const finalName = (name || 'asset').trim()
    const asset: SavedAsset = {
      id: newAssetId(),
      name: finalName,
      width: converted.width,
      height: converted.height,
      pixels: converted.pixels,
      source: sourceLabel,
      settings: { ...options },
      createdAt: Date.now(),
    }
    const next = addAsset(asset)
    setLibrary(next)
  }, [converted, name, sourceLabel, options])

  const handleDelete = useCallback((id: string) => {
    if (!confirm('Delete this asset from the library?')) return
    setLibrary(deleteAsset(id))
  }, [])

  const handleImport = useCallback((file: File) => {
    file.text().then(text => {
      const ok = importLibrary(text)
      if (ok) {
        setLibrary(loadLibrary())
      } else {
        alert('Invalid library JSON.')
      }
    })
  }, [])

  const distribution = useMemo(
    () => converted ? colorDistribution(converted.pixels) : [],
    [converted],
  )

  if (view === 'placement') {
    return (
      <PlacementView
        library={library}
        onClose={() => setView('editor')}
      />
    )
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'auto',
      fontFamily: 'ui-monospace, monospace', background: '#f4efe6', padding: 12,
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>/dev/seed — Image Seeding Tool</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/" style={linkButton}>← Back to Wall</a>
          <button onClick={() => setView('placement')} style={primaryButton} disabled={library.length === 0}>
            Open placement view ({library.length})
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 320px', gap: 12 }}>
        {/* LEFT: load + settings */}
        <div style={panel}>
          <h2 style={h2}>1. Load image</h2>
          <ImageLoader onImage={handleImage} />

          {source && (
            <>
              <h2 style={h2}>2. Settings</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Slider
                  label={`Size: ${options.targetWidth}×${options.targetHeight}`}
                  min={20} max={150} value={options.targetWidth}
                  onChange={v => setOptions(o => ({ ...o, targetWidth: v, targetHeight: v }))}
                />
                <SliderPair
                  label="Width / Height (independent)"
                  w={options.targetWidth}
                  h={options.targetHeight}
                  onChange={(w, h) => setOptions(o => ({ ...o, targetWidth: w, targetHeight: h }))}
                />
                <label style={row}>
                  <input
                    type="checkbox"
                    checked={options.dithering}
                    onChange={e => setOptions(o => ({ ...o, dithering: e.target.checked }))}
                  />
                  <span>Floyd-Steinberg dithering</span>
                </label>
                <label style={row}>
                  <span>Rotation:</span>
                  <select
                    value={options.rotation}
                    onChange={e => setOptions(o => ({ ...o, rotation: parseInt(e.target.value) as 0 | 90 | 180 | 270 }))}
                    style={select}
                  >
                    {[0, 90, 180, 270].map(d => <option key={d} value={d}>{d}°</option>)}
                  </select>
                </label>
                <label style={row}>
                  <input
                    type="checkbox"
                    checked={options.mirrorH}
                    onChange={e => setOptions(o => ({ ...o, mirrorH: e.target.checked }))}
                  />
                  <span>Mirror horizontal</span>
                </label>
                <label style={row}>
                  <input
                    type="checkbox"
                    checked={options.mirrorV}
                    onChange={e => setOptions(o => ({ ...o, mirrorV: e.target.checked }))}
                  />
                  <span>Mirror vertical</span>
                </label>
              </div>
            </>
          )}
        </div>

        {/* MIDDLE: preview */}
        <div style={panel}>
          <h2 style={h2}>Preview</h2>
          {!source && <div style={{ color: '#888', fontSize: 12 }}>Load an image to preview</div>}
          {source && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PreviewCanvas asset={converted} converting={converting} />
              {converted && (
                <>
                  <div style={{ fontSize: 11, color: '#555' }}>
                    {converted.width}×{converted.height} · {converted.pixels.length} pixels (non-transparent)
                  </div>
                  <ColorList distribution={distribution} />
                </>
              )}

              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="asset name"
                  style={textInput}
                />
                <button onClick={handleSave} style={primaryButton} disabled={!converted}>
                  Save to library
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: library */}
        <div style={panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ ...h2, marginBottom: 0 }}>Library ({library.length})</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => downloadLibraryFile()} style={smallButton}>Export</button>
              <label style={{ ...smallButton, display: 'inline-block' }}>
                Import
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleImport(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>

          {library.length === 0 && <div style={{ fontSize: 12, color: '#888' }}>(empty)</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {library.map(asset => (
              <div key={asset.id} style={libraryRow}>
                <LibraryThumb asset={asset} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {asset.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#888' }}>
                    {asset.width}×{asset.height} · {asset.pixels.length}px
                  </div>
                </div>
                <button onClick={() => handleDelete(asset.id)} style={smallButton}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewCanvas({ asset, converting }: { asset: ConvertedAsset | null; converting: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !asset) return
    const scale = Math.max(1, Math.min(12, Math.floor(480 / Math.max(asset.width, asset.height))))
    canvas.width = asset.width * scale
    canvas.height = asset.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#faf7f2'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const p of asset.pixels) {
      ctx.fillStyle = p.color
      ctx.fillRect(p.x * scale, p.y * scale, scale, scale)
    }
  }, [asset])

  if (!asset) return <div style={{ height: 240, color: '#888', fontSize: 12 }}>{converting ? 'Converting…' : ''}</div>

  return (
    <div style={{ overflow: 'auto', border: '1px solid #ddd', background: '#faf7f2', padding: 4 }}>
      <canvas ref={ref} style={{ display: 'block', imageRendering: 'pixelated' }} />
    </div>
  )
}

function ColorList({ distribution }: { distribution: Array<{ color: string; count: number }> }) {
  const total = distribution.reduce((sum, d) => sum + d.count, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {distribution.map(d => (
        <div key={d.color} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 14, height: 14, background: d.color, border: '1px solid #ccc', display: 'inline-block' }} />
          <code>{d.color}</code>
          <span style={{ flex: 1 }} />
          <span>{d.count}</span>
          <span style={{ color: '#888' }}>({total > 0 ? Math.round((d.count / total) * 100) : 0}%)</span>
          {!PALETTE.includes(d.color as never) && (
            <span style={{ color: '#c0392b', fontSize: 9 }}>off-palette?</span>
          )}
        </div>
      ))}
    </div>
  )
}

function LibraryThumb({ asset, size }: { asset: SavedAsset; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = Math.max(1, Math.floor(Math.min(size / asset.width, size / asset.height)))
    canvas.width = asset.width * scale
    canvas.height = asset.height * scale
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#faf7f2'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const p of asset.pixels) {
      ctx.fillStyle = p.color
      ctx.fillRect(p.x * scale, p.y * scale, scale, scale)
    }
  }, [asset, size])
  return (
    <canvas
      ref={ref}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        imageRendering: 'pixelated',
        background: '#fafafa',
        border: '1px solid #eee',
      }}
    />
  )
}

function Slider({ label, min, max, value, onChange }: {
  label: string; min: number; max: number; value: number; onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
      />
    </label>
  )
}

function SliderPair({ label, w, h, onChange }: {
  label: string
  w: number; h: number
  onChange: (w: number, h: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ fontSize: 10, color: '#888' }}>{label}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>W</span>
        <input
          type="number" min={20} max={150} value={w}
          onChange={e => onChange(Math.max(20, Math.min(150, parseInt(e.target.value || '20'))), h)}
          style={{ ...textInput, width: 60 }}
        />
        <span>H</span>
        <input
          type="number" min={20} max={150} value={h}
          onChange={e => onChange(w, Math.max(20, Math.min(150, parseInt(e.target.value || '20'))))}
          style={{ ...textInput, width: 60 }}
        />
      </div>
    </div>
  )
}

const panel: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 12,
  minHeight: 0,
}
const h2: React.CSSProperties = {
  fontSize: 13,
  margin: '8px 0 6px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#555',
}
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
}
const select: React.CSSProperties = {
  padding: '4px 8px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
  border: '1px solid #bbb',
  borderRadius: 4,
}
const textInput: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 13,
  border: '1px solid #bbb',
  borderRadius: 4,
  fontFamily: 'ui-monospace, monospace',
  flex: 1,
  minWidth: 0,
}
const primaryButton: React.CSSProperties = {
  padding: '6px 12px',
  background: '#1a1a1a',
  color: '#faf7f2',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
}
const smallButton: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  border: '1px solid #aaa',
  background: '#fff',
  cursor: 'pointer',
  borderRadius: 4,
  fontFamily: 'ui-monospace, monospace',
}
const linkButton: React.CSSProperties = {
  ...smallButton,
  textDecoration: 'none',
  color: '#1a1a1a',
}
const libraryRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid #eee',
  borderRadius: 4,
  padding: 4,
  background: '#fafafa',
}
