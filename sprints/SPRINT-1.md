# SPRINT-1.md — The Rendering Spike

This is a focused sprint to answer one question: **can we render a city-scale pixel canvas at 60fps with smooth pan/zoom?**

If the answer is yes, the rest of the product is buildable. If the answer is no, the entire product needs rethinking before we go further.

For the long-term product vision, see PRODUCT.md.
For the technical blueprint, see ARCHITECTURE.md.

---

## The Goal

Build a working prototype that renders a NYC-scale pixel canvas with realistic-looking fake data. No backend, no real users, no drawing yet. Just rendering and navigation.

If the prototype runs smoothly on a phone and a laptop, the core product is technically viable.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Functional Requirements
- [ ] A canvas displays a stylized outline of NYC (rivers, major parks, bridges)
- [ ] Pre-made test "doodles" are placed at simulated NYC coordinates (clusters, not random)
- [ ] User can pan the canvas with touch (mobile) and click-drag (desktop)
- [ ] User can zoom the canvas with pinch (mobile) and scroll/cmd-scroll (desktop)
- [ ] Zoom range covers "all of NYC" to "individual pixel visible"
- [ ] Pan and zoom transitions are smooth (no visible jank or stuttering)
- [ ] App works on iOS Safari and Chrome (mobile and desktop)

### Performance Targets
- [ ] **60fps** sustained during pan/zoom with at least 100K visible pixels
- [ ] **Initial load** under 2 seconds on a normal laptop and recent phone
- [ ] **Tile rendering** appears progressive (tiles fill in as they load) rather than blocking
- [ ] No frame drops when 200+ tiles are visible

### Visual Requirements
- [ ] Pixels render with hard edges (no anti-aliasing — celebrate the pixel aesthetic)
- [ ] Base map renders as soft charcoal lines on warm cream background (#faf7f2)
- [ ] Pixel art layers cleanly above the base map without obscuring orientation
- [ ] At max zoom-out, individual pixels blend into a heat-map-like impressionistic view
- [ ] At max zoom-in, individual pixels are clearly visible as 10ft × 10ft squares

### Mobile-First Requirements
- [ ] Layout works portrait and landscape on phones
- [ ] Touch gestures feel natural (pinch is intuitive, pan is not laggy)
- [ ] App is usable single-handed
- [ ] No tap targets smaller than 44pt
- [ ] Performance on a recent iPhone matches or beats laptop

### Constraints
- [ ] Local-only — no deployment, no backend, no Supabase
- [ ] Fake data only — no real strokes, no user input
- [ ] No drawing tools — view-only at this stage
- [ ] No styling polish beyond what's needed for visual correctness

---

## The Tech Stack (Locked In)

Use exactly these tools. Do not add dependencies without checking first.

- **Vite + React 18 + TypeScript** for the project skeleton
- **Tailwind CSS** for layout and minimal styling
- **HTML5 Canvas** for both the base map and the pixel layer
- **No** WebGL, no Three.js, no D3, no fabric.js, no konva — Canvas 2D is enough
- **No** map libraries (Mapbox, Leaflet, Google Maps) — we're rendering our own minimal base map

---

## Project Structure

```
src/
├── App.tsx                     // top-level app component
├── components/
│   ├── WallCanvas.tsx          // the main rendering component
│   ├── BaseMapLayer.tsx        // SVG or canvas of NYC outline
│   └── PixelLayer.tsx          // tile-rendered pixel art
├── lib/
│   ├── coordinates.ts          // lat/lng <-> pixel <-> tile conversions
│   ├── tileRenderer.ts         // draws tiles to canvas
│   ├── viewport.ts             // pan/zoom state and gesture handling
│   └── fakeData.ts             // generates pre-made test doodles
├── data/
│   ├── nycOutline.svg          // simplified NYC base map
│   └── testDoodles.ts          // pre-defined doodle positions and shapes
└── styles/
    └── globals.css             // Tailwind + base styles
```

---

## Coordinate System Implementation

This is the foundation everything else builds on. Get this right first.

### World Coordinates (Pixel Grid)
- The world is a 2D integer grid covering NYC
- Origin (0, 0) is at the southwest corner of the bounding box
- X increases east, Y increases north
- Total dimensions: ~18,500 × ~13,000 pixels at 10ft resolution

### Tile Coordinates
- Tiles are 256×256 pixels each
- Tile (tx, ty) covers world pixels [tx*256, tx*256+255] × [ty*256, ty*256+255]
- Total tiles for NYC: ~72 × ~51 = ~3,700

### Screen Coordinates
- The user's viewport in screen pixels
- Maps from world coordinates via the current pan/zoom transform

### Required Conversion Functions
```typescript
// in lib/coordinates.ts
function latLngToWorld(lat: number, lng: number): { x: number; y: number }
function worldToLatLng(x: number, y: number): { lat: number; lng: number }
function worldToTile(x: number, y: number): { tx: number; ty: number; px: number; py: number }
function tileToWorld(tx: number, ty: number): { x: number; y: number }
function worldToScreen(x: number, y: number, viewport: Viewport): { sx: number; sy: number }
function screenToWorld(sx: number, sy: number, viewport: Viewport): { x: number; y: number }
```

Test these with unit tests before building anything else. A bug here cascades into every other system.

---

## Fake Data Generation

The spike needs realistic-looking data, not random pixels. Generate **pre-made test doodles** at simulated neighborhood locations.

### What to Generate

In `data/testDoodles.ts`, hardcode a set of "doodle templates" — small pixel art designs (10-50 pixels each) representing things people might actually draw:

- A simple heart
- A smiley face
- A small house outline
- The word "HI"
- A flower
- A star
- A simple cat outline
- Abstract dots and dashes
- A wave pattern
- A small tree

### Where to Place Them

Simulate ~10 fake "neighborhoods" with realistic NYC coordinates:

- Long Island City (Queens)
- Astoria (Queens)
- Greenpoint (Brooklyn)
- Williamsburg (Brooklyn)
- Bushwick (Brooklyn)
- Bed-Stuy (Brooklyn)
- Lower East Side (Manhattan)
- East Village (Manhattan)
- Midtown (Manhattan)
- Inwood (Manhattan)

Each "neighborhood" gets a cluster of 30-100 doodles within a small radius of its center coordinate.

### Density Pattern

- Manhattan and Brooklyn neighborhoods: dense clusters (60-100 doodles each)
- Queens neighborhoods: medium density (40-60 doodles)
- Sparse zones (Staten Island, far parts of Bronx and Queens): empty for now

This creates a realistic visual with most activity concentrated in expected places, naturally testing both dense and sparse rendering paths.

### Total Pixel Count
Aim for **roughly 100,000 to 200,000 individual pixels** across the entire test dataset. Enough to stress the renderer, realistic for "small launch" scale.

---

## Rendering Implementation

### The Pixel Layer

Use a single Canvas element for the pixel layer. On every render:

1. Compute which tiles are visible in the current viewport
2. For each visible tile:
   - If not in cache, generate it from the fake data (this is fast — small batch operations)
   - Cache the rendered tile as an `ImageBitmap` or offscreen canvas
   - Draw the tile to the visible canvas at the correct screen position and zoom

### The Base Map Layer

Use a separate Canvas (or SVG, your call) underneath the pixel layer.

The NYC outline can be a simplified SVG path:
- Coastlines as smooth bezier paths
- Parks as filled polygons
- Bridges as simple lines

Render this once at app load, then redraw only on zoom changes (it doesn't change with pan).

### Performance Approach

- Use `requestAnimationFrame` for all renders
- Throttle pan/zoom event handlers (don't redraw every pointermove event)
- Use `OffscreenCanvas` for tile pre-rendering if available
- Cache tiles aggressively — don't regenerate on every frame
- Only redraw the parts of the canvas that actually changed (use `clip` rectangles)

### Zoom Levels

Support continuous zoom (not discrete levels), but optimize for these reference points:
- **Zoom 0:** Entire NYC visible (~3700 tiles, but most are empty)
- **Zoom 5:** Borough-level (Manhattan or Brooklyn fits the screen)
- **Zoom 10:** Neighborhood-level (a few blocks visible)
- **Zoom 15:** Individual buildings (each pixel is clearly a 10ft square)

At extreme zoom-out, you may need to render a heat-map approximation rather than every pixel — but try the simple path first and only optimize if needed.

---

## Touch & Mouse Input

### Mobile (Primary)
- **Single-finger drag** = pan
- **Two-finger pinch** = zoom (anchored at the midpoint)
- **Two-finger drag** = pan (alternative)
- **Tap** = (placeholder for future "doodle" entry, but does nothing in spike)

### Desktop (Secondary)
- **Click-and-drag** = pan
- **Mouse wheel** = zoom (anchored at cursor position)
- **Cmd/Ctrl + scroll** = zoom (alternative for trackpad users)

### Implementation
Use native `pointer` events to handle both mouse and touch with one code path. Avoid touch-event-specific libraries — modern Pointer Events API is sufficient.

Use [Hammer.js](https://hammerjs.github.io/) only if pinch-zoom math becomes painful. Otherwise vanilla.

---

## Build Order (Strict)

Follow this order. Each step has a clear deliverable.

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Vite + React + TypeScript + Tailwind setup | 15 min | Hello world running locally |
| 2 | Coordinate system in lib/coordinates.ts with unit tests | 30 min | All conversion functions working |
| 3 | Fake data generator with 10 neighborhoods, ~150K total pixels | 30 min | testDoodles.ts produces realistic dataset |
| 4 | Base map layer rendering NYC outline | 45 min | NYC visible on screen |
| 5 | Pixel layer rendering tiles (no input yet) | 60 min | Pixels visible at fixed viewport |
| 6 | Pan implementation (mouse + touch) | 30 min | Can pan smoothly |
| 7 | Zoom implementation (mouse wheel + pinch) | 45 min | Can zoom smoothly |
| 8 | Performance optimization pass (FPS measurement, throttling) | 45 min | 60fps confirmed on phone and laptop |
| 9 | Mobile testing and gesture refinement | 30 min | Feels native on iOS |
| 10 | Polish (cursors, smooth zoom anchoring, edge cases) | 30 min | Feels finished |

**Total estimated time: 6 hours** (with buffer for the unexpected)

---

## What Counts as Success

The sprint succeeds if you can hand the laptop or phone to someone and they can:

1. See the city in a quiet, beautiful overview
2. Pan around to explore different neighborhoods
3. Zoom in to see detailed pixel art
4. Zoom back out without losing orientation
5. Have all of this feel smooth, not janky

If they can do this and the FPS counter stays at 60, the spike has answered the central question: **yes, this is buildable.**

---

## What Counts as Failure

The sprike fails if any of these happen:

- FPS drops below 30 during normal pan/zoom
- Mobile rendering looks dramatically worse than desktop
- Tile loading creates visible "popping" or "flashing" during pan
- Memory usage grows unbounded during normal use (suggests a tile cache bug)
- The visual aesthetic feels harsh, ugly, or "wrong" in a way styling can't fix

If any of these occur, **don't push through.** Stop and re-evaluate the architecture. The sprike's purpose is to surface these problems before more is built on top.

Possible mitigations if the spike struggles:
- Increase pixel size from 10ft to 25ft (reduces total pixel count by 6x)
- Reduce NYC bounding box to Manhattan + Brooklyn only
- Switch to WebGL for the pixel layer (last resort)
- Pre-generate tiles as PNGs rather than rendering pixel-by-pixel

---

## After the Sprint

Once the spike succeeds:

1. **Demo it to yourself.** Use it for 5 minutes. Note what feels wrong.
2. **Demo it to one other person.** Watch where they get confused.
3. **Write SPRINT-2.md** based on what you learned. Likely candidates:
   - Adding the drawing interaction
   - Adding the Supabase backend
   - Adding session-based budget tracking
   - Adding the editable radius (geofence)

Do not start sprint 2 until sprint 1 is genuinely done. The temptation to "just add one more thing" is how sprints become products that never ship.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this entire file first.** Confirm understanding before writing code.
- **Follow the build order.** Don't jump ahead.
- **Show me what you build after each step.** Don't batch multiple steps before checking in.
- **If you hit ambiguity, stop and ask.** Don't make product decisions silently.
- **If something takes longer than its time budget, stop and tell me.** We'll decide together whether to push through or simplify.
- **Don't add dependencies that aren't in this document without asking.**

The goal is a working spike, not a finished product. Optimize for "does it answer the question" over "is it pretty."