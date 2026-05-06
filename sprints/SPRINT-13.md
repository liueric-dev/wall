# SPRINT-13.md — Image Seeding Dev Tool

This sprint builds an internal dev-only tool for populating the wall with pixel art. It exists at `/dev/seed`, gated by `import.meta.env.DEV` so production builds never include it.

The tool is for:
- Populating the wall before demos
- Testing rendering at scale
- Generating sample content for screenshots or marketing
- Anything else where seeded pixel content is needed

The tool is NOT for:
- Real production "seeding" (real activity should come from real users)
- Any user-facing feature

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For the roadmap, see ROADMAP.md.
For prior sprints, see SPRINT-1.md through SPRINT-12.md.

---

## Important Context: Shared Database

Local dev and production currently share the same Supabase database (single project, same URL/anon key in `.env.local` and Vercel env vars). This means seeding from local dev populates the production wall — convenient for demos, but risky long-term.

The implications:
- Pixels seeded via the dev tool appear on the production wall immediately
- The audience at any demo will see seeded pixels alongside real user pixels (indistinguishable visually)
- Cleanup affects production data — be careful with the "delete all dev-seeded pixels" button
- Splitting dev and production databases is future work (not part of this sprint)

For tomorrow's demo, this shared-database setup is a feature: seed locally, audience sees it on production. After the demo, run cleanup from local dev.

---

## Important Context: `vercel dev` Required

This sprint requires running the local dev server with `vercel dev` instead of `npm run dev` because the URL-fetching feature uses a Vercel API route. `npm run dev` (pure Vite) doesn't support `/api/*` serverless routes.

**Workflow:**
- Regular development: `npm run dev` (faster, normal experience)
- When using the seeding tool: `vercel dev` (slower startup, but supports API routes)

The seeding tool itself works in both, but URL fetching only works under `vercel dev`. File upload and text input work in either.

---

## The Goal

A working dev tool that converts arbitrary image content (uploaded files, URLs, or text) into pixel art using the locked palette, and places that pixel art onto the wall via direct Supabase writes.

The workflow:
1. **Load:** upload an image, paste a URL, or type text
2. **Convert:** see the pixel art preview at target size, tweak settings (dithering, rotation, mirror, size)
3. **Save (optional):** add the converted asset to a library for later reuse
4. **Place:** open the map view, pick an asset, tap where to place it
5. **Brush mode (optional):** toggle on to rapidly stamp the same asset at multiple locations
6. **Cleanup:** when done, undo recent placements or wipe all dev-seeded pixels

The tool is *functional first, ugly second*. Internal infrastructure.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Routing & Access Control

- [ ] Tool lives at `/dev/seed`
- [ ] Route is conditionally registered: only included when `import.meta.env.DEV === true`
- [ ] Production builds verifiably do NOT include the route or any of its code
- [ ] Tool reachable from a browser running `vercel dev`

### Image Loading

- [ ] User can upload image files via drag/drop
- [ ] User can upload image files via file picker
- [ ] User can paste a URL (any HTTP/HTTPS image URL)
- [ ] URL fetching works for cross-origin sources via `/api/dev-fetch-image` route
- [ ] Supported formats: PNG, JPG, GIF (static), WebP
- [ ] Failed loads show a clear error message

### Text Rendering

- [ ] User can type text into a text input
- [ ] User can pick from at least 4 fonts (serif, sans-serif, monospace, cursive)
- [ ] User can select font size (range 20-100, default 40)
- [ ] Text renders to canvas, then runs through the same conversion pipeline as images
- [ ] User can preview different fonts and sizes before converting

### Conversion Settings

- [ ] Size selector (width × height in pixels): range 20-150, default 50
- [ ] Dithering toggle (Floyd-Steinberg): on/off, default off
- [ ] Rotation: 0°, 90°, 180°, 270°
- [ ] Mirror: horizontal flip, vertical flip
- [ ] Each setting change triggers re-conversion and preview update

### Conversion Algorithm

- [ ] Source image resized to target dimensions using bilinear (smoother for photos)
- [ ] Each source pixel mapped to nearest palette color using weighted Euclidean RGB distance:
  ```
  rmean = (r1 + r2) / 2
  distance = sqrt(((512 + rmean) * dr² >> 8) + 4 * dg² + ((767 - rmean) * db² >> 8))
  ```
- [ ] Source pixels with alpha < 50% become transparent (no pixel placed)
- [ ] Floyd-Steinberg dithering, when enabled, distributes color quantization error to neighboring pixels
- [ ] Output is a 2D array of `{x, y, color}` entries, where color is a palette hex string

### Preview

- [ ] Converted image displays as a magnified pixel grid (each pixel ~10x screen pixels)
- [ ] Color distribution view shows count of each palette color used (simple list)
- [ ] Total pixel count displayed (number of non-transparent cells)

### Asset Library

- [ ] User can save a converted image to the library with a custom name
- [ ] Library persists in `localStorage` under a single key (e.g., `dev-seed-library`)
- [ ] Each saved asset stores: id (uuid), name, dimensions, color count, pixel data, original source, settings used, created timestamp
- [ ] Library shows thumbnails of all saved assets
- [ ] User can delete individual assets from the library
- [ ] User can export entire library as a JSON file (download)
- [ ] User can import a JSON file to restore a library

### Map Placement View

- [ ] Tool has a "place" view showing the actual NYC map (reuse main app's map renderer)
- [ ] User picks an asset from the library (sidebar of thumbnails)
- [ ] User taps a location on the map
- [ ] On tap (when brush mode OFF): preview overlay shows where the image will go (image centered on tap location)
- [ ] User can drag the preview to refine placement before committing
- [ ] User clicks "Place" button to commit
- [ ] Visual feedback: placement happens, preview disappears, pixels appear on map within ~5 seconds

### Brush Mode

- [ ] Toggle in placement view to enable/disable brush mode
- [ ] When enabled: each tap immediately places the active asset (no preview, no confirm)
- [ ] Tap-vs-pan disambiguation works the same as Sprint 12 (10px movement threshold)
- [ ] No drag-to-stamp — only individual taps place pixels
- [ ] Brief visual feedback (flash, ring, or animation) confirms each placement
- [ ] Brush mode placements still register in the undo stack as separate entries

### Undo Stack

- [ ] After each placement, the tool stores the placement's pixel event IDs in localStorage
- [ ] Undo stack holds the last 20 placements
- [ ] "Undo last placement" button removes pixels from the most recent placement
- [ ] After successful undo, that entry is removed from the stack
- [ ] If undo stack is empty, button is disabled

### Cleanup

- [ ] "Delete all dev-seeded pixels" button shows a confirmation dialog
- [ ] On confirm: deletes all rows where `session_id LIKE 'dev-seed-%'`
- [ ] Visual feedback: count of rows deleted is shown
- [ ] After cleanup, the wall renders without any seeded content
- [ ] Undo stack is cleared after full cleanup

### Direct Supabase Writes

- [ ] Placement bypasses the `placePixel` function entirely
- [ ] Writes happen directly via Supabase client, raw inserts to `pixel_events`
- [ ] Each row uses the schema: `{x, y, color, session_id, group_id, group_seq, input_mode}`
- [ ] `session_id` set to `dev-seed-{asset-name}-{timestamp}` (sanitized for SQL safety — no spaces, special chars)
- [ ] `input_mode` set to `'t'`
- [ ] `group_id` and `group_seq` are `null`
- [ ] Bulk inserts: rows batched into chunks of ~500 per insert call

### Performance

- [ ] Placing a 100×100 image (up to 10,000 pixels) completes in under 30 seconds
- [ ] User sees progress feedback during long placements (e.g., "Placing 4,200 of 7,500 pixels...")
- [ ] If a placement fails partway through, user can see which pixels were written

### Vercel API Route

- [ ] `/api/dev-fetch-image` route exists for URL fetching
- [ ] Accepts a `url` query parameter
- [ ] Validates URL is HTTP/HTTPS
- [ ] Validates response content-type starts with `image/`
- [ ] 10s timeout on fetches
- [ ] Returns image bytes with appropriate `Content-Type` header
- [ ] **Conditionally available** — gated to dev mode only via `process.env.NODE_ENV === 'development'`. Returns 404 in production.

### Constraints

- [ ] Tool requires NO changes to existing user-facing code
- [ ] Tool builds on top of Sprint 12's repo
- [ ] All Sprint 1-12 functionality continues to work in production builds
- [ ] No production user can access the tool

---

## Architecture Sketch

```
/src/dev/seed/
├── SeedTool.tsx         — main page component
├── ImageLoader.tsx      — file upload, URL paste, text input
├── Converter.ts         — image-to-palette conversion
├── Dithering.ts         — Floyd-Steinberg implementation
├── ColorDistance.ts     — weighted Euclidean RGB distance
├── Library.ts           — localStorage CRUD for asset library
├── PlacementView.tsx    — map view with placement overlay and brush mode
└── DirectWriter.ts      — Supabase direct writes, bulk inserts
```

API route:
```
/api/dev-fetch-image.ts
```

### Code Inclusion Strategy

Use Vite's tree-shaking with `import.meta.env.DEV`:

```typescript
// In the main router or App component
{import.meta.env.DEV && <Route path="/dev/seed" component={SeedTool} />}
```

For dynamic imports (potentially safer):
```typescript
const SeedTool = import.meta.env.DEV 
  ? lazy(() => import('@/dev/seed/SeedTool'))
  : null
```

Verify in production build: search the production bundle for `dev/seed` strings — they should not appear.

---

## Step 1: Vercel API Route for URL Fetching

```typescript
// /api/dev-fetch-image.ts

export default async function handler(req, res) {
  // Gate to dev mode only
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }
  
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url query param required' })
  }
  
  // URL validation
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }
  
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http(s) URLs allowed' })
  }
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TheWall-DevTool/1.0' }
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) {
      return res.status(502).json({ error: `Source returned ${response.status}` })
    }
    
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL did not return an image' })
    }
    
    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.send(Buffer.from(buffer))
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out' })
    }
    return res.status(500).json({ error: error.message })
  }
}
```

Test with `curl http://localhost:3000/api/dev-fetch-image?url=https://example.com/image.png` after starting `vercel dev` — should return image bytes.

---

## Step 2: Color Distance and Conversion (Pure Logic)

```typescript
// /src/dev/seed/ColorDistance.ts

export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  const rmean = (r1 + r2) / 2
  const r = r1 - r2
  const g = g1 - g2
  const b = b1 - b2
  return Math.sqrt(
    (((512 + rmean) * r * r) >> 8) +
    4 * g * g +
    (((767 - rmean) * b * b) >> 8)
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

export function findNearestColor(
  r: number, g: number, b: number,
  palette: string[]
): string {
  let nearest = palette[0]
  let minDist = Infinity
  for (const hex of palette) {
    const [pr, pg, pb] = hexToRgb(hex)
    const dist = colorDistance(r, g, b, pr, pg, pb)
    if (dist < minDist) {
      minDist = dist
      nearest = hex
    }
  }
  return nearest
}
```

```typescript
// /src/dev/seed/Converter.ts

import { PALETTE } from '@/config/tuning'
import { findNearestColor, hexToRgb } from './ColorDistance'
import { applyFloydSteinberg } from './Dithering'

export interface ConvertedAsset {
  width: number
  height: number
  pixels: Array<{ x: number; y: number; color: string }>
}

export interface ConvertOptions {
  targetWidth: number
  targetHeight: number
  dithering: boolean
  rotation: 0 | 90 | 180 | 270
  mirrorH: boolean
  mirrorV: boolean
}

export async function convertImageToAsset(
  source: HTMLImageElement | HTMLCanvasElement,
  options: ConvertOptions
): Promise<ConvertedAsset> {
  // 1. Create canvas at target dimensions
  const canvas = document.createElement('canvas')
  canvas.width = options.targetWidth
  canvas.height = options.targetHeight
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // 2. Apply rotation and mirror via canvas transforms
  ctx.save()
  if (options.mirrorH) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  if (options.mirrorV) {
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
  }
  if (options.rotation !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((options.rotation * Math.PI) / 180)
    ctx.translate(-canvas.width / 2, -canvas.height / 2)
  }
  
  // 3. Draw source onto target-sized canvas (auto-resizes)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  ctx.restore()
  
  // 4. Read pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  
  // 5. Apply dithering or simple nearest-color quantization
  const palette = [...PALETTE]
  const result = options.dithering
    ? applyFloydSteinberg(imageData, palette)
    : applyNearestColor(imageData, palette)
  
  // 6. Convert to pixel array, skipping transparent pixels
  const pixels: Array<{ x: number; y: number; color: string }> = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4
      const alpha = result[idx + 3]
      if (alpha < 128) continue
      const r = result[idx]
      const g = result[idx + 1]
      const b = result[idx + 2]
      const color = findNearestColor(r, g, b, palette)
      pixels.push({ x, y, color })
    }
  }
  
  return {
    width: canvas.width,
    height: canvas.height,
    pixels,
  }
}

function applyNearestColor(imageData: ImageData, palette: string[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const hex = findNearestColor(r, g, b, palette)
    const [nr, ng, nb] = hexToRgb(hex)
    data[i] = nr
    data[i + 1] = ng
    data[i + 2] = nb
  }
  return data
}
```

---

## Step 3: Floyd-Steinberg Dithering

```typescript
// /src/dev/seed/Dithering.ts

import { findNearestColor, hexToRgb } from './ColorDistance'

export function applyFloydSteinberg(
  imageData: ImageData,
  palette: string[]
): Uint8ClampedArray {
  const { width, height, data } = imageData
  const result = new Uint8ClampedArray(data)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      
      if (result[idx + 3] < 128) continue
      
      const oldR = result[idx]
      const oldG = result[idx + 1]
      const oldB = result[idx + 2]
      
      const newHex = findNearestColor(oldR, oldG, oldB, palette)
      const [newR, newG, newB] = hexToRgb(newHex)
      
      result[idx] = newR
      result[idx + 1] = newG
      result[idx + 2] = newB
      
      const errR = oldR - newR
      const errG = oldG - newG
      const errB = oldB - newB
      
      // Distribute error to neighbors
      distributeError(result, x + 1, y, width, height, errR, errG, errB, 7 / 16)
      distributeError(result, x - 1, y + 1, width, height, errR, errG, errB, 3 / 16)
      distributeError(result, x, y + 1, width, height, errR, errG, errB, 5 / 16)
      distributeError(result, x + 1, y + 1, width, height, errR, errG, errB, 1 / 16)
    }
  }
  
  return result
}

function distributeError(
  data: Uint8ClampedArray,
  x: number, y: number,
  width: number, height: number,
  errR: number, errG: number, errB: number,
  factor: number
) {
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const idx = (y * width + x) * 4
  if (data[idx + 3] < 128) return
  data[idx] = Math.max(0, Math.min(255, data[idx] + errR * factor))
  data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + errG * factor))
  data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + errB * factor))
}
```

---

## Step 4: Image Loader Component

```typescript
// /src/dev/seed/ImageLoader.tsx

import { useState } from 'react'

export function ImageLoader({ onImage }: { onImage: (img: HTMLImageElement | HTMLCanvasElement) => void }) {
  const [mode, setMode] = useState<'file' | 'url' | 'text'>('file')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [font, setFont] = useState('serif')
  const [fontSize, setFontSize] = useState(40)
  const [error, setError] = useState('')
  
  const handleFile = (file: File) => {
    setError('')
    const img = new Image()
    img.onload = () => onImage(img)
    img.onerror = () => setError('Failed to load image')
    img.src = URL.createObjectURL(file)
  }
  
  const handleUrl = async () => {
    setError('')
    try {
      const res = await fetch(`/api/dev-fetch-image?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const img = new Image()
      img.onload = () => onImage(img)
      img.onerror = () => setError('Failed to render image')
      img.src = URL.createObjectURL(blob)
    } catch (err: any) {
      setError(`URL fetch error: ${err.message}`)
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
    
    // First pass: measure
    ctx.font = `${fontSize}px ${font}`
    const metrics = ctx.measureText(text)
    canvas.width = Math.ceil(metrics.width) + 20
    canvas.height = fontSize + 20
    
    // Re-set font after canvas resize (resizing clears state)
    ctx.font = `${fontSize}px ${font}`
    ctx.fillStyle = 'black'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, canvas.height / 2)
    
    onImage(canvas)
  }
  
  return (
    <div>
      <div>
        <button onClick={() => setMode('file')}>File</button>
        <button onClick={() => setMode('url')}>URL</button>
        <button onClick={() => setMode('text')}>Text</button>
      </div>
      
      {mode === 'file' && (
        <DragDropZone onFile={handleFile} />
      )}
      
      {mode === 'url' && (
        <div>
          <input 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
            placeholder="https://..."
            style={{ width: '100%' }}
          />
          <button onClick={handleUrl}>Fetch</button>
        </div>
      )}
      
      {mode === 'text' && (
        <div>
          <input 
            value={text} 
            onChange={e => setText(e.target.value)} 
            placeholder="Type text..."
          />
          <select value={font} onChange={e => setFont(e.target.value)}>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
            <option value="monospace">Monospace</option>
            <option value="cursive">Cursive</option>
          </select>
          <input
            type="number"
            value={fontSize}
            onChange={e => setFontSize(parseInt(e.target.value))}
            min="20"
            max="100"
          />
          <button onClick={handleText}>Render</button>
        </div>
      )}
      
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  )
}

// Simple DragDropZone component
function DragDropZone({ onFile }: { onFile: (file: File) => void }) {
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) onFile(file)
      }}
      style={{ 
        border: '2px dashed #ccc', 
        padding: 40, 
        textAlign: 'center' 
      }}
    >
      Drop image here
      <br />
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
```

---

## Step 5: Asset Library

```typescript
// /src/dev/seed/Library.ts

import { ConvertOptions } from './Converter'

const STORAGE_KEY = 'dev-seed-library'

export interface SavedAsset {
  id: string
  name: string
  width: number
  height: number
  pixels: Array<{ x: number; y: number; color: string }>
  source: string
  settings: ConvertOptions
  createdAt: number
}

export function loadLibrary(): SavedAsset[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveLibrary(library: SavedAsset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
}

export function addAsset(asset: SavedAsset): SavedAsset[] {
  const library = loadLibrary()
  library.push(asset)
  saveLibrary(library)
  return library
}

export function deleteAsset(id: string): SavedAsset[] {
  const library = loadLibrary().filter(a => a.id !== id)
  saveLibrary(library)
  return library
}

export function exportLibrary(): string {
  return JSON.stringify(loadLibrary(), null, 2)
}

export function importLibrary(json: string): boolean {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return false
    saveLibrary(parsed)
    return true
  } catch {
    return false
  }
}
```

UI shows thumbnails (render each asset's pixel array onto a small canvas), with delete buttons.

---

## Step 6: Direct Writer with Bulk Inserts and Undo Stack

```typescript
// /src/dev/seed/DirectWriter.ts

import { supabase } from '@/lib/supabase'
import { SavedAsset } from './Library'

const BATCH_SIZE = 500
const UNDO_STACK_KEY = 'dev-seed-undo-stack'
const MAX_UNDO_ENTRIES = 20

interface UndoEntry {
  assetName: string
  eventIds: number[]
  placedAt: number
}

function getUndoStack(): UndoEntry[] {
  const raw = localStorage.getItem(UNDO_STACK_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function pushUndoEntry(entry: UndoEntry) {
  const stack = getUndoStack()
  stack.push(entry)
  while (stack.length > MAX_UNDO_ENTRIES) {
    stack.shift()
  }
  localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack))
}

function popUndoEntry(): UndoEntry | null {
  const stack = getUndoStack()
  const entry = stack.pop()
  localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack))
  return entry || null
}

export async function placeAsset(
  asset: SavedAsset,
  centerX: number,
  centerY: number,
  onProgress: (placed: number, total: number) => void
): Promise<{ success: boolean; eventIds: number[]; error?: string }> {
  const sanitizedName = asset.name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 30)
  const sessionId = `dev-seed-${sanitizedName}-${Date.now()}`
  
  const offsetX = centerX - Math.floor(asset.width / 2)
  const offsetY = centerY - Math.floor(asset.height / 2)
  
  const rows = asset.pixels.map(p => ({
    x: offsetX + p.x,
    y: offsetY + p.y,
    color: p.color,
    session_id: sessionId,
    group_id: null,
    group_seq: null,
    input_mode: 't',
  }))
  
  const eventIds: number[] = []
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('pixel_events')
      .insert(batch)
      .select('id')
    
    if (error) {
      return { success: false, eventIds, error: error.message }
    }
    
    if (data) {
      eventIds.push(...data.map(d => d.id))
    }
    
    onProgress(i + batch.length, rows.length)
  }
  
  pushUndoEntry({
    assetName: asset.name,
    eventIds,
    placedAt: Date.now(),
  })
  
  return { success: true, eventIds }
}

export async function undoLastPlacement(): Promise<{ success: boolean; deletedCount?: number; assetName?: string }> {
  const entry = popUndoEntry()
  if (!entry) return { success: false }
  
  const { error, count } = await supabase
    .from('pixel_events')
    .delete({ count: 'exact' })
    .in('id', entry.eventIds)
  
  if (error) {
    pushUndoEntry(entry)
    return { success: false }
  }
  
  return { success: true, deletedCount: count ?? 0, assetName: entry.assetName }
}

export async function deleteAllSeededPixels(): Promise<{ success: boolean; deletedCount?: number }> {
  const { error, count } = await supabase
    .from('pixel_events')
    .delete({ count: 'exact' })
    .like('session_id', 'dev-seed-%')
  
  if (error) return { success: false }
  
  localStorage.removeItem(UNDO_STACK_KEY)
  return { success: true, deletedCount: count ?? 0 }
}

export function getUndoStackSize(): number {
  return getUndoStack().length
}
```

---

## Step 7: Placement View With Brush Mode

The most complex UI piece. Reuse main app's map renderer (the component that renders `WallCanvas` or equivalent). Add overlay layer.

Key behaviors:
- Sidebar: thumbnails of library assets, click to select
- Main area: NYC map (same render as user-facing app)
- Brush mode toggle (top of sidebar or separate control area)
- Active asset indicator (selected thumbnail highlighted)

When brush mode OFF:
- Tap on map → preview overlay appears at tap location (image centered)
- Drag preview → moves it
- "Place" button → commits via `placeAsset`
- "Cancel" → preview disappears

When brush mode ON:
- Tap on map → immediate `placeAsset` call (image centered on tap)
- Brief flash/ring animation at placement location
- Sidebar shows progress for current placement
- No preview, no confirm

Coordinate handling is critical. Three coordinate systems:
- **Screen coordinates** (user's tap location in pixels on screen)
- **World coordinates** (NYC pixel grid coordinates)
- **Image-local coordinates** (within the asset's pixel array)

The conversion:
1. User taps at screen position (sx, sy)
2. Convert to world coordinates using current viewport transform: `(wx, wy)`
3. Image's center becomes (wx, wy)
4. For each image pixel at (ix, iy): write to world position `(wx - W/2 + ix, wy - H/2 + iy)`

---

## Step 8: Cleanup UI

Bottom of the tool, simple section:

```
[Undo last (asset_name) — N pixels]   [Delete all dev-seeded pixels]
```

Both with confirmation dialogs. The undo button shows the current top of the undo stack (or is disabled if empty).

After cleanup, refresh the wall renderer to confirm pixels are gone.

---

## Build Order

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Create Vercel API route for URL fetching | 1 hour | Route works under `vercel dev` |
| 2 | Implement color distance + conversion logic | 1.5 hours | Conversion produces valid output (test in console) |
| 3 | Implement Floyd-Steinberg dithering | 1 hour | Dithering produces visually different output |
| 4 | Build `ImageLoader` component (file, URL, text) | 2 hours | All three input modes work |
| 5 | Build conversion preview UI with all settings | 1.5 hours | Settings update preview live |
| 6 | Build asset library (save, list, delete, export, import) | 2 hours | Library persists and manages assets |
| 7 | Build placement view base (map + asset selection) | 2 hours | Can pick asset and see it as preview |
| 8 | Build placement preview overlay with drag | 1.5 hours | Preview shows where image will land |
| 9 | Build `DirectWriter` with bulk inserts | 1.5 hours | Placement writes pixels successfully |
| 10 | Add brush mode toggle and stamp-on-tap behavior | 1.5 hours | Brush mode stamps without preview |
| 11 | Build undo stack and cleanup buttons | 1 hour | Both work as expected |
| 12 | End-to-end testing | 1 hour | All test cases pass |
| 13 | Verify production build excludes the tool | 30 min | Bundle inspection shows no dev/seed code |

**Total estimated time: ~17 hours**

---

## Testing Checklist

- [ ] `vercel dev` runs successfully
- [ ] `/dev/seed` accessible only when running dev server
- [ ] Upload PNG → preview correct
- [ ] Paste URL → image fetched and converted
- [ ] Type text "HELLO" with serif → rendered and converted
- [ ] Toggle dithering → preview changes visibly
- [ ] Rotate 90° → preview rotates
- [ ] Mirror H/V → preview mirrors
- [ ] Save asset → appears in library
- [ ] Delete asset → disappears
- [ ] Export library → JSON downloads
- [ ] Import JSON → library restored
- [ ] Pick asset → tap map → preview shows
- [ ] Drag preview → moves
- [ ] Click Place → pixels appear within 5s
- [ ] Open the production URL → seeded pixels visible there too (shared DB)
- [ ] Toggle brush mode → tap stamps immediately, no preview
- [ ] Multiple brush stamps → each registered as separate undo entry
- [ ] Click "Undo last" → most recent placement disappears
- [ ] Click "Delete all dev-seeded pixels" → all disappear
- [ ] Production build: `/dev/seed` route does NOT exist
- [ ] Production build: `/api/dev-fetch-image` returns 404
- [ ] Production build bundle: no `dev/seed` references

---

## What Counts as Success

- The tool works for its intended use cases (populating the wall before demos)
- Production builds are verifiably clean of dev-tool code
- The tool is robust enough to use repeatedly without breaking
- Cleanup mechanism reliably removes all seeded pixels
- Brush mode makes rapid stamping efficient

---

## What Counts as Failure

- Tool ships any code to production
- Direct writes hit RLS errors that aren't caught and surfaced
- Placement misalignment (image appears far from where user tapped)
- Bulk inserts fail silently mid-batch
- Cleanup leaves orphaned pixels behind
- Brush mode places pixels in unexpected locations due to gesture confusion

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- User-facing seeding features
- Server-side asset library (localStorage only)
- Image cropping in-tool
- Color distribution adjustment (showing breakdown is enough)
- Multi-image bulk placement
- Saved view layouts
- Aesthetic polish

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, ROADMAP.md, and SPRINT-1 through SPRINT-12 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Get the conversion logic right before any UI.
- **Show me each step's deliverable before moving to the next.**
- **The dev-only gating is critical.** Verify in production builds that no dev-seed code is included. Do this multiple times during the sprint, not just at the end.
- **Use Opus, not Sonnet.** This sprint touches multiple modules (image processing, UI, database, server routes) and benefits from sustained reasoning.
- **For the conversion algorithm, test on multiple source images.** A landscape photo, a logo, a face, a piece of text. Different sources stress different parts of the conversion.
- **Don't optimize prematurely.** Sequential `for` loops over pixel arrays are fine for the conversion. Worry about performance only if conversion takes >2 seconds for a 100x100 image.
- **The map placement view is the trickiest UI.** Coordinate systems (world coords vs screen coords vs image-local coords) need careful handling. Plan this on paper before coding.
- **If you hit ambiguity, stop and ask.** Especially for things like "where exactly does the image center land when the user taps?"
- **Test the cleanup mechanism with real seeded pixels.** Don't just trust the SQL pattern — actually place pixels, then delete them, then verify nothing's left.
- **Remember the shared database**. Pixels seeded locally appear on production. Be careful with the "delete all" button.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is a tool that you'd actually use repeatedly, not a one-off demo helper. Build it well enough to deserve its place in the codebase.

---

## After the Sprint

Once Sprint 13 ships:

1. **Use it for the demo.** Populate the wall. Take screenshots.
2. **After the demo, run cleanup.** Remove dev-seeded pixels.
3. **Document any non-blocking issues in BACKLOG.md** for future iteration.
4. **Update ROADMAP.md** if you decide to expand the tool's capabilities.
5. **Tell me Sprint 13 is done.** I'll generate Sprint 14 if there's a clear next priority — but more likely, the next sprint is reactive to real user feedback on Sprint 12's drawing experience.

The tool is internal infrastructure. It should fade into the background after this sprint and just work whenever needed.# SPRINT-13.md — Image Seeding Dev Tool

This sprint builds an internal dev-only tool for populating the wall with pixel art. It exists at `/dev/seed`, gated by `import.meta.env.DEV` so production builds never include it.

The tool is for:
- Populating the wall before demos
- Testing rendering at scale
- Generating sample content for screenshots or marketing
- Anything else where seeded pixel content is needed

The tool is NOT for:
- Real production "seeding" (real activity should come from real users)
- Any user-facing feature

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For the roadmap, see ROADMAP.md.
For prior sprints, see SPRINT-1.md through SPRINT-12.md.

---

## Important Context: Shared Database

Local dev and production currently share the same Supabase database (single project, same URL/anon key in `.env.local` and Vercel env vars). This means seeding from local dev populates the production wall — convenient for demos, but risky long-term.

The implications:
- Pixels seeded via the dev tool appear on the production wall immediately
- The audience at any demo will see seeded pixels alongside real user pixels (indistinguishable visually)
- Cleanup affects production data — be careful with the "delete all dev-seeded pixels" button
- Splitting dev and production databases is future work (not part of this sprint)

For tomorrow's demo, this shared-database setup is a feature: seed locally, audience sees it on production. After the demo, run cleanup from local dev.

---

## Important Context: `vercel dev` Required

This sprint requires running the local dev server with `vercel dev` instead of `npm run dev` because the URL-fetching feature uses a Vercel API route. `npm run dev` (pure Vite) doesn't support `/api/*` serverless routes.

**Workflow:**
- Regular development: `npm run dev` (faster, normal experience)
- When using the seeding tool: `vercel dev` (slower startup, but supports API routes)

The seeding tool itself works in both, but URL fetching only works under `vercel dev`. File upload and text input work in either.

---

## The Goal

A working dev tool that converts arbitrary image content (uploaded files, URLs, or text) into pixel art using the locked palette, and places that pixel art onto the wall via direct Supabase writes.

The workflow:
1. **Load:** upload an image, paste a URL, or type text
2. **Convert:** see the pixel art preview at target size, tweak settings (dithering, rotation, mirror, size)
3. **Save (optional):** add the converted asset to a library for later reuse
4. **Place:** open the map view, pick an asset, tap where to place it
5. **Brush mode (optional):** toggle on to rapidly stamp the same asset at multiple locations
6. **Cleanup:** when done, undo recent placements or wipe all dev-seeded pixels

The tool is *functional first, ugly second*. Internal infrastructure.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Routing & Access Control

- [ ] Tool lives at `/dev/seed`
- [ ] Route is conditionally registered: only included when `import.meta.env.DEV === true`
- [ ] Production builds verifiably do NOT include the route or any of its code
- [ ] Tool reachable from a browser running `vercel dev`

### Image Loading

- [ ] User can upload image files via drag/drop
- [ ] User can upload image files via file picker
- [ ] User can paste a URL (any HTTP/HTTPS image URL)
- [ ] URL fetching works for cross-origin sources via `/api/dev-fetch-image` route
- [ ] Supported formats: PNG, JPG, GIF (static), WebP
- [ ] Failed loads show a clear error message

### Text Rendering

- [ ] User can type text into a text input
- [ ] User can pick from at least 4 fonts (serif, sans-serif, monospace, cursive)
- [ ] User can select font size (range 20-100, default 40)
- [ ] Text renders to canvas, then runs through the same conversion pipeline as images
- [ ] User can preview different fonts and sizes before converting

### Conversion Settings

- [ ] Size selector (width × height in pixels): range 20-150, default 50
- [ ] Dithering toggle (Floyd-Steinberg): on/off, default off
- [ ] Rotation: 0°, 90°, 180°, 270°
- [ ] Mirror: horizontal flip, vertical flip
- [ ] Each setting change triggers re-conversion and preview update

### Conversion Algorithm

- [ ] Source image resized to target dimensions using bilinear (smoother for photos)
- [ ] Each source pixel mapped to nearest palette color using weighted Euclidean RGB distance:
  ```
  rmean = (r1 + r2) / 2
  distance = sqrt(((512 + rmean) * dr² >> 8) + 4 * dg² + ((767 - rmean) * db² >> 8))
  ```
- [ ] Source pixels with alpha < 50% become transparent (no pixel placed)
- [ ] Floyd-Steinberg dithering, when enabled, distributes color quantization error to neighboring pixels
- [ ] Output is a 2D array of `{x, y, color}` entries, where color is a palette hex string

### Preview

- [ ] Converted image displays as a magnified pixel grid (each pixel ~10x screen pixels)
- [ ] Color distribution view shows count of each palette color used (simple list)
- [ ] Total pixel count displayed (number of non-transparent cells)

### Asset Library

- [ ] User can save a converted image to the library with a custom name
- [ ] Library persists in `localStorage` under a single key (e.g., `dev-seed-library`)
- [ ] Each saved asset stores: id (uuid), name, dimensions, color count, pixel data, original source, settings used, created timestamp
- [ ] Library shows thumbnails of all saved assets
- [ ] User can delete individual assets from the library
- [ ] User can export entire library as a JSON file (download)
- [ ] User can import a JSON file to restore a library

### Map Placement View

- [ ] Tool has a "place" view showing the actual NYC map (reuse main app's map renderer)
- [ ] User picks an asset from the library (sidebar of thumbnails)
- [ ] User taps a location on the map
- [ ] On tap (when brush mode OFF): preview overlay shows where the image will go (image centered on tap location)
- [ ] User can drag the preview to refine placement before committing
- [ ] User clicks "Place" button to commit
- [ ] Visual feedback: placement happens, preview disappears, pixels appear on map within ~5 seconds

### Brush Mode

- [ ] Toggle in placement view to enable/disable brush mode
- [ ] When enabled: each tap immediately places the active asset (no preview, no confirm)
- [ ] Tap-vs-pan disambiguation works the same as Sprint 12 (10px movement threshold)
- [ ] No drag-to-stamp — only individual taps place pixels
- [ ] Brief visual feedback (flash, ring, or animation) confirms each placement
- [ ] Brush mode placements still register in the undo stack as separate entries

### Undo Stack

- [ ] After each placement, the tool stores the placement's pixel event IDs in localStorage
- [ ] Undo stack holds the last 20 placements
- [ ] "Undo last placement" button removes pixels from the most recent placement
- [ ] After successful undo, that entry is removed from the stack
- [ ] If undo stack is empty, button is disabled

### Cleanup

- [ ] "Delete all dev-seeded pixels" button shows a confirmation dialog
- [ ] On confirm: deletes all rows where `session_id LIKE 'dev-seed-%'`
- [ ] Visual feedback: count of rows deleted is shown
- [ ] After cleanup, the wall renders without any seeded content
- [ ] Undo stack is cleared after full cleanup

### Direct Supabase Writes

- [ ] Placement bypasses the `placePixel` function entirely
- [ ] Writes happen directly via Supabase client, raw inserts to `pixel_events`
- [ ] Each row uses the schema: `{x, y, color, session_id, group_id, group_seq, input_mode}`
- [ ] `session_id` set to `dev-seed-{asset-name}-{timestamp}` (sanitized for SQL safety — no spaces, special chars)
- [ ] `input_mode` set to `'t'`
- [ ] `group_id` and `group_seq` are `null`
- [ ] Bulk inserts: rows batched into chunks of ~500 per insert call

### Performance

- [ ] Placing a 100×100 image (up to 10,000 pixels) completes in under 30 seconds
- [ ] User sees progress feedback during long placements (e.g., "Placing 4,200 of 7,500 pixels...")
- [ ] If a placement fails partway through, user can see which pixels were written

### Vercel API Route

- [ ] `/api/dev-fetch-image` route exists for URL fetching
- [ ] Accepts a `url` query parameter
- [ ] Validates URL is HTTP/HTTPS
- [ ] Validates response content-type starts with `image/`
- [ ] 10s timeout on fetches
- [ ] Returns image bytes with appropriate `Content-Type` header
- [ ] **Conditionally available** — gated to dev mode only via `process.env.NODE_ENV === 'development'`. Returns 404 in production.

### Constraints

- [ ] Tool requires NO changes to existing user-facing code
- [ ] Tool builds on top of Sprint 12's repo
- [ ] All Sprint 1-12 functionality continues to work in production builds
- [ ] No production user can access the tool

---

## Architecture Sketch

```
/src/dev/seed/
├── SeedTool.tsx         — main page component
├── ImageLoader.tsx      — file upload, URL paste, text input
├── Converter.ts         — image-to-palette conversion
├── Dithering.ts         — Floyd-Steinberg implementation
├── ColorDistance.ts     — weighted Euclidean RGB distance
├── Library.ts           — localStorage CRUD for asset library
├── PlacementView.tsx    — map view with placement overlay and brush mode
└── DirectWriter.ts      — Supabase direct writes, bulk inserts
```

API route:
```
/api/dev-fetch-image.ts
```

### Code Inclusion Strategy

Use Vite's tree-shaking with `import.meta.env.DEV`:

```typescript
// In the main router or App component
{import.meta.env.DEV && <Route path="/dev/seed" component={SeedTool} />}
```

For dynamic imports (potentially safer):
```typescript
const SeedTool = import.meta.env.DEV 
  ? lazy(() => import('@/dev/seed/SeedTool'))
  : null
```

Verify in production build: search the production bundle for `dev/seed` strings — they should not appear.

---

## Step 1: Vercel API Route for URL Fetching

```typescript
// /api/dev-fetch-image.ts

export default async function handler(req, res) {
  // Gate to dev mode only
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' })
  }
  
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url query param required' })
  }
  
  // URL validation
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }
  
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http(s) URLs allowed' })
  }
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TheWall-DevTool/1.0' }
    })
    
    clearTimeout(timeout)
    
    if (!response.ok) {
      return res.status(502).json({ error: `Source returned ${response.status}` })
    }
    
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL did not return an image' })
    }
    
    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-store')
    res.send(Buffer.from(buffer))
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out' })
    }
    return res.status(500).json({ error: error.message })
  }
}
```

Test with `curl http://localhost:3000/api/dev-fetch-image?url=https://example.com/image.png` after starting `vercel dev` — should return image bytes.

---

## Step 2: Color Distance and Conversion (Pure Logic)

```typescript
// /src/dev/seed/ColorDistance.ts

export function colorDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  const rmean = (r1 + r2) / 2
  const r = r1 - r2
  const g = g1 - g2
  const b = b1 - b2
  return Math.sqrt(
    (((512 + rmean) * r * r) >> 8) +
    4 * g * g +
    (((767 - rmean) * b * b) >> 8)
  )
}

export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

export function findNearestColor(
  r: number, g: number, b: number,
  palette: string[]
): string {
  let nearest = palette[0]
  let minDist = Infinity
  for (const hex of palette) {
    const [pr, pg, pb] = hexToRgb(hex)
    const dist = colorDistance(r, g, b, pr, pg, pb)
    if (dist < minDist) {
      minDist = dist
      nearest = hex
    }
  }
  return nearest
}
```

```typescript
// /src/dev/seed/Converter.ts

import { PALETTE } from '@/config/tuning'
import { findNearestColor, hexToRgb } from './ColorDistance'
import { applyFloydSteinberg } from './Dithering'

export interface ConvertedAsset {
  width: number
  height: number
  pixels: Array<{ x: number; y: number; color: string }>
}

export interface ConvertOptions {
  targetWidth: number
  targetHeight: number
  dithering: boolean
  rotation: 0 | 90 | 180 | 270
  mirrorH: boolean
  mirrorV: boolean
}

export async function convertImageToAsset(
  source: HTMLImageElement | HTMLCanvasElement,
  options: ConvertOptions
): Promise<ConvertedAsset> {
  // 1. Create canvas at target dimensions
  const canvas = document.createElement('canvas')
  canvas.width = options.targetWidth
  canvas.height = options.targetHeight
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  
  // 2. Apply rotation and mirror via canvas transforms
  ctx.save()
  if (options.mirrorH) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  if (options.mirrorV) {
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
  }
  if (options.rotation !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((options.rotation * Math.PI) / 180)
    ctx.translate(-canvas.width / 2, -canvas.height / 2)
  }
  
  // 3. Draw source onto target-sized canvas (auto-resizes)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  ctx.restore()
  
  // 4. Read pixel data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  
  // 5. Apply dithering or simple nearest-color quantization
  const palette = [...PALETTE]
  const result = options.dithering
    ? applyFloydSteinberg(imageData, palette)
    : applyNearestColor(imageData, palette)
  
  // 6. Convert to pixel array, skipping transparent pixels
  const pixels: Array<{ x: number; y: number; color: string }> = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4
      const alpha = result[idx + 3]
      if (alpha < 128) continue
      const r = result[idx]
      const g = result[idx + 1]
      const b = result[idx + 2]
      const color = findNearestColor(r, g, b, palette)
      pixels.push({ x, y, color })
    }
  }
  
  return {
    width: canvas.width,
    height: canvas.height,
    pixels,
  }
}

function applyNearestColor(imageData: ImageData, palette: string[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(imageData.data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const hex = findNearestColor(r, g, b, palette)
    const [nr, ng, nb] = hexToRgb(hex)
    data[i] = nr
    data[i + 1] = ng
    data[i + 2] = nb
  }
  return data
}
```

---

## Step 3: Floyd-Steinberg Dithering

```typescript
// /src/dev/seed/Dithering.ts

import { findNearestColor, hexToRgb } from './ColorDistance'

export function applyFloydSteinberg(
  imageData: ImageData,
  palette: string[]
): Uint8ClampedArray {
  const { width, height, data } = imageData
  const result = new Uint8ClampedArray(data)
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      
      if (result[idx + 3] < 128) continue
      
      const oldR = result[idx]
      const oldG = result[idx + 1]
      const oldB = result[idx + 2]
      
      const newHex = findNearestColor(oldR, oldG, oldB, palette)
      const [newR, newG, newB] = hexToRgb(newHex)
      
      result[idx] = newR
      result[idx + 1] = newG
      result[idx + 2] = newB
      
      const errR = oldR - newR
      const errG = oldG - newG
      const errB = oldB - newB
      
      // Distribute error to neighbors
      distributeError(result, x + 1, y, width, height, errR, errG, errB, 7 / 16)
      distributeError(result, x - 1, y + 1, width, height, errR, errG, errB, 3 / 16)
      distributeError(result, x, y + 1, width, height, errR, errG, errB, 5 / 16)
      distributeError(result, x + 1, y + 1, width, height, errR, errG, errB, 1 / 16)
    }
  }
  
  return result
}

function distributeError(
  data: Uint8ClampedArray,
  x: number, y: number,
  width: number, height: number,
  errR: number, errG: number, errB: number,
  factor: number
) {
  if (x < 0 || x >= width || y < 0 || y >= height) return
  const idx = (y * width + x) * 4
  if (data[idx + 3] < 128) return
  data[idx] = Math.max(0, Math.min(255, data[idx] + errR * factor))
  data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + errG * factor))
  data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + errB * factor))
}
```

---

## Step 4: Image Loader Component

```typescript
// /src/dev/seed/ImageLoader.tsx

import { useState } from 'react'

export function ImageLoader({ onImage }: { onImage: (img: HTMLImageElement | HTMLCanvasElement) => void }) {
  const [mode, setMode] = useState<'file' | 'url' | 'text'>('file')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [font, setFont] = useState('serif')
  const [fontSize, setFontSize] = useState(40)
  const [error, setError] = useState('')
  
  const handleFile = (file: File) => {
    setError('')
    const img = new Image()
    img.onload = () => onImage(img)
    img.onerror = () => setError('Failed to load image')
    img.src = URL.createObjectURL(file)
  }
  
  const handleUrl = async () => {
    setError('')
    try {
      const res = await fetch(`/api/dev-fetch-image?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const img = new Image()
      img.onload = () => onImage(img)
      img.onerror = () => setError('Failed to render image')
      img.src = URL.createObjectURL(blob)
    } catch (err: any) {
      setError(`URL fetch error: ${err.message}`)
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
    
    // First pass: measure
    ctx.font = `${fontSize}px ${font}`
    const metrics = ctx.measureText(text)
    canvas.width = Math.ceil(metrics.width) + 20
    canvas.height = fontSize + 20
    
    // Re-set font after canvas resize (resizing clears state)
    ctx.font = `${fontSize}px ${font}`
    ctx.fillStyle = 'black'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, canvas.height / 2)
    
    onImage(canvas)
  }
  
  return (
    <div>
      <div>
        <button onClick={() => setMode('file')}>File</button>
        <button onClick={() => setMode('url')}>URL</button>
        <button onClick={() => setMode('text')}>Text</button>
      </div>
      
      {mode === 'file' && (
        <DragDropZone onFile={handleFile} />
      )}
      
      {mode === 'url' && (
        <div>
          <input 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
            placeholder="https://..."
            style={{ width: '100%' }}
          />
          <button onClick={handleUrl}>Fetch</button>
        </div>
      )}
      
      {mode === 'text' && (
        <div>
          <input 
            value={text} 
            onChange={e => setText(e.target.value)} 
            placeholder="Type text..."
          />
          <select value={font} onChange={e => setFont(e.target.value)}>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
            <option value="monospace">Monospace</option>
            <option value="cursive">Cursive</option>
          </select>
          <input
            type="number"
            value={fontSize}
            onChange={e => setFontSize(parseInt(e.target.value))}
            min="20"
            max="100"
          />
          <button onClick={handleText}>Render</button>
        </div>
      )}
      
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  )
}

// Simple DragDropZone component
function DragDropZone({ onFile }: { onFile: (file: File) => void }) {
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) onFile(file)
      }}
      style={{ 
        border: '2px dashed #ccc', 
        padding: 40, 
        textAlign: 'center' 
      }}
    >
      Drop image here
      <br />
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
```

---

## Step 5: Asset Library

```typescript
// /src/dev/seed/Library.ts

import { ConvertOptions } from './Converter'

const STORAGE_KEY = 'dev-seed-library'

export interface SavedAsset {
  id: string
  name: string
  width: number
  height: number
  pixels: Array<{ x: number; y: number; color: string }>
  source: string
  settings: ConvertOptions
  createdAt: number
}

export function loadLibrary(): SavedAsset[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveLibrary(library: SavedAsset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library))
}

export function addAsset(asset: SavedAsset): SavedAsset[] {
  const library = loadLibrary()
  library.push(asset)
  saveLibrary(library)
  return library
}

export function deleteAsset(id: string): SavedAsset[] {
  const library = loadLibrary().filter(a => a.id !== id)
  saveLibrary(library)
  return library
}

export function exportLibrary(): string {
  return JSON.stringify(loadLibrary(), null, 2)
}

export function importLibrary(json: string): boolean {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return false
    saveLibrary(parsed)
    return true
  } catch {
    return false
  }
}
```

UI shows thumbnails (render each asset's pixel array onto a small canvas), with delete buttons.

---

## Step 6: Direct Writer with Bulk Inserts and Undo Stack

```typescript
// /src/dev/seed/DirectWriter.ts

import { supabase } from '@/lib/supabase'
import { SavedAsset } from './Library'

const BATCH_SIZE = 500
const UNDO_STACK_KEY = 'dev-seed-undo-stack'
const MAX_UNDO_ENTRIES = 20

interface UndoEntry {
  assetName: string
  eventIds: number[]
  placedAt: number
}

function getUndoStack(): UndoEntry[] {
  const raw = localStorage.getItem(UNDO_STACK_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function pushUndoEntry(entry: UndoEntry) {
  const stack = getUndoStack()
  stack.push(entry)
  while (stack.length > MAX_UNDO_ENTRIES) {
    stack.shift()
  }
  localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack))
}

function popUndoEntry(): UndoEntry | null {
  const stack = getUndoStack()
  const entry = stack.pop()
  localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack))
  return entry || null
}

export async function placeAsset(
  asset: SavedAsset,
  centerX: number,
  centerY: number,
  onProgress: (placed: number, total: number) => void
): Promise<{ success: boolean; eventIds: number[]; error?: string }> {
  const sanitizedName = asset.name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 30)
  const sessionId = `dev-seed-${sanitizedName}-${Date.now()}`
  
  const offsetX = centerX - Math.floor(asset.width / 2)
  const offsetY = centerY - Math.floor(asset.height / 2)
  
  const rows = asset.pixels.map(p => ({
    x: offsetX + p.x,
    y: offsetY + p.y,
    color: p.color,
    session_id: sessionId,
    group_id: null,
    group_seq: null,
    input_mode: 't',
  }))
  
  const eventIds: number[] = []
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('pixel_events')
      .insert(batch)
      .select('id')
    
    if (error) {
      return { success: false, eventIds, error: error.message }
    }
    
    if (data) {
      eventIds.push(...data.map(d => d.id))
    }
    
    onProgress(i + batch.length, rows.length)
  }
  
  pushUndoEntry({
    assetName: asset.name,
    eventIds,
    placedAt: Date.now(),
  })
  
  return { success: true, eventIds }
}

export async function undoLastPlacement(): Promise<{ success: boolean; deletedCount?: number; assetName?: string }> {
  const entry = popUndoEntry()
  if (!entry) return { success: false }
  
  const { error, count } = await supabase
    .from('pixel_events')
    .delete({ count: 'exact' })
    .in('id', entry.eventIds)
  
  if (error) {
    pushUndoEntry(entry)
    return { success: false }
  }
  
  return { success: true, deletedCount: count ?? 0, assetName: entry.assetName }
}

export async function deleteAllSeededPixels(): Promise<{ success: boolean; deletedCount?: number }> {
  const { error, count } = await supabase
    .from('pixel_events')
    .delete({ count: 'exact' })
    .like('session_id', 'dev-seed-%')
  
  if (error) return { success: false }
  
  localStorage.removeItem(UNDO_STACK_KEY)
  return { success: true, deletedCount: count ?? 0 }
}

export function getUndoStackSize(): number {
  return getUndoStack().length
}
```

---

## Step 7: Placement View With Brush Mode

The most complex UI piece. Reuse main app's map renderer (the component that renders `WallCanvas` or equivalent). Add overlay layer.

Key behaviors:
- Sidebar: thumbnails of library assets, click to select
- Main area: NYC map (same render as user-facing app)
- Brush mode toggle (top of sidebar or separate control area)
- Active asset indicator (selected thumbnail highlighted)

When brush mode OFF:
- Tap on map → preview overlay appears at tap location (image centered)
- Drag preview → moves it
- "Place" button → commits via `placeAsset`
- "Cancel" → preview disappears

When brush mode ON:
- Tap on map → immediate `placeAsset` call (image centered on tap)
- Brief flash/ring animation at placement location
- Sidebar shows progress for current placement
- No preview, no confirm

Coordinate handling is critical. Three coordinate systems:
- **Screen coordinates** (user's tap location in pixels on screen)
- **World coordinates** (NYC pixel grid coordinates)
- **Image-local coordinates** (within the asset's pixel array)

The conversion:
1. User taps at screen position (sx, sy)
2. Convert to world coordinates using current viewport transform: `(wx, wy)`
3. Image's center becomes (wx, wy)
4. For each image pixel at (ix, iy): write to world position `(wx - W/2 + ix, wy - H/2 + iy)`

---

## Step 8: Cleanup UI

Bottom of the tool, simple section:

```
[Undo last (asset_name) — N pixels]   [Delete all dev-seeded pixels]
```

Both with confirmation dialogs. The undo button shows the current top of the undo stack (or is disabled if empty).

After cleanup, refresh the wall renderer to confirm pixels are gone.

---

## Build Order

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Create Vercel API route for URL fetching | 1 hour | Route works under `vercel dev` |
| 2 | Implement color distance + conversion logic | 1.5 hours | Conversion produces valid output (test in console) |
| 3 | Implement Floyd-Steinberg dithering | 1 hour | Dithering produces visually different output |
| 4 | Build `ImageLoader` component (file, URL, text) | 2 hours | All three input modes work |
| 5 | Build conversion preview UI with all settings | 1.5 hours | Settings update preview live |
| 6 | Build asset library (save, list, delete, export, import) | 2 hours | Library persists and manages assets |
| 7 | Build placement view base (map + asset selection) | 2 hours | Can pick asset and see it as preview |
| 8 | Build placement preview overlay with drag | 1.5 hours | Preview shows where image will land |
| 9 | Build `DirectWriter` with bulk inserts | 1.5 hours | Placement writes pixels successfully |
| 10 | Add brush mode toggle and stamp-on-tap behavior | 1.5 hours | Brush mode stamps without preview |
| 11 | Build undo stack and cleanup buttons | 1 hour | Both work as expected |
| 12 | End-to-end testing | 1 hour | All test cases pass |
| 13 | Verify production build excludes the tool | 30 min | Bundle inspection shows no dev/seed code |

**Total estimated time: ~17 hours**

---

## Testing Checklist

- [ ] `vercel dev` runs successfully
- [ ] `/dev/seed` accessible only when running dev server
- [ ] Upload PNG → preview correct
- [ ] Paste URL → image fetched and converted
- [ ] Type text "HELLO" with serif → rendered and converted
- [ ] Toggle dithering → preview changes visibly
- [ ] Rotate 90° → preview rotates
- [ ] Mirror H/V → preview mirrors
- [ ] Save asset → appears in library
- [ ] Delete asset → disappears
- [ ] Export library → JSON downloads
- [ ] Import JSON → library restored
- [ ] Pick asset → tap map → preview shows
- [ ] Drag preview → moves
- [ ] Click Place → pixels appear within 5s
- [ ] Open the production URL → seeded pixels visible there too (shared DB)
- [ ] Toggle brush mode → tap stamps immediately, no preview
- [ ] Multiple brush stamps → each registered as separate undo entry
- [ ] Click "Undo last" → most recent placement disappears
- [ ] Click "Delete all dev-seeded pixels" → all disappear
- [ ] Production build: `/dev/seed` route does NOT exist
- [ ] Production build: `/api/dev-fetch-image` returns 404
- [ ] Production build bundle: no `dev/seed` references

---

## What Counts as Success

- The tool works for its intended use cases (populating the wall before demos)
- Production builds are verifiably clean of dev-tool code
- The tool is robust enough to use repeatedly without breaking
- Cleanup mechanism reliably removes all seeded pixels
- Brush mode makes rapid stamping efficient

---

## What Counts as Failure

- Tool ships any code to production
- Direct writes hit RLS errors that aren't caught and surfaced
- Placement misalignment (image appears far from where user tapped)
- Bulk inserts fail silently mid-batch
- Cleanup leaves orphaned pixels behind
- Brush mode places pixels in unexpected locations due to gesture confusion

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- User-facing seeding features
- Server-side asset library (localStorage only)
- Image cropping in-tool
- Color distribution adjustment (showing breakdown is enough)
- Multi-image bulk placement
- Saved view layouts
- Aesthetic polish

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, ROADMAP.md, and SPRINT-1 through SPRINT-12 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Get the conversion logic right before any UI.
- **Show me each step's deliverable before moving to the next.**
- **The dev-only gating is critical.** Verify in production builds that no dev-seed code is included. Do this multiple times during the sprint, not just at the end.
- **Use Opus, not Sonnet.** This sprint touches multiple modules (image processing, UI, database, server routes) and benefits from sustained reasoning.
- **For the conversion algorithm, test on multiple source images.** A landscape photo, a logo, a face, a piece of text. Different sources stress different parts of the conversion.
- **Don't optimize prematurely.** Sequential `for` loops over pixel arrays are fine for the conversion. Worry about performance only if conversion takes >2 seconds for a 100x100 image.
- **The map placement view is the trickiest UI.** Coordinate systems (world coords vs screen coords vs image-local coords) need careful handling. Plan this on paper before coding.
- **If you hit ambiguity, stop and ask.** Especially for things like "where exactly does the image center land when the user taps?"
- **Test the cleanup mechanism with real seeded pixels.** Don't just trust the SQL pattern — actually place pixels, then delete them, then verify nothing's left.
- **Remember the shared database**. Pixels seeded locally appear on production. Be careful with the "delete all" button.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is a tool that you'd actually use repeatedly, not a one-off demo helper. Build it well enough to deserve its place in the codebase.

---

## After the Sprint

Once Sprint 13 ships:

1. **Use it for the demo.** Populate the wall. Take screenshots.
2. **After the demo, run cleanup.** Remove dev-seeded pixels.
3. **Document any non-blocking issues in BACKLOG.md** for future iteration.
4. **Update ROADMAP.md** if you decide to expand the tool's capabilities.
5. **Tell me Sprint 13 is done.** I'll generate Sprint 14 if there's a clear next priority — but more likely, the next sprint is reactive to real user feedback on Sprint 12's drawing experience.

The tool is internal infrastructure. It should fade into the background after this sprint and just work whenever needed.