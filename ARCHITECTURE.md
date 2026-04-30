# ARCHITECTURE.md — The Wall

This document captures the technical decisions for The Wall. Reference it when making architectural choices to ensure consistency.

For product principles, see PRODUCT.md.

---

## Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for dev tooling and bundling
- **Tailwind CSS** for styling
- **HTML5 Canvas** for rendering the wall
- Mobile-first design — touch gestures are the primary interaction model

### Backend (Deferred Until After Rendering Spike)
- **Supabase** (Postgres + auth + realtime + edge functions)
- No custom server code at MVP scale; everything goes through Supabase's auto-generated APIs

### Hosting
- **Vercel** for the production frontend
- **Supabase** hosts the backend
- The rendering spike runs locally only — no deployment

### Why This Stack
- Postgres handles the geographic and temporal queries we need without exotic infrastructure
- Supabase removes the need for custom backend code at MVP scale
- Vite is fast and well-suited to canvas-heavy apps
- Tailwind keeps styling code small and consistent
- Canvas (not SVG, not WebGL) is the right primitive for pixel-grid rendering at this scale

---

## Coordinate System

### Pixel Resolution
- **10ft × 10ft** per pixel in the real world
- Pixels are integer coordinates; no sub-pixel positioning

### NYC Bounding Box
The world coordinate system covers:
- **Southwest corner:** ~40.4774° N, -74.2591° W (Staten Island south)
- **Northeast corner:** ~40.9176° N, -73.7004° W (Bronx north)
- This spans approximately 37 miles east-west, 35 miles north-south
- All five boroughs are included in the addressable space

### Pixel Grid Dimensions
- **Width:** ~18,500 pixels (37 miles × 5,280 feet/mile ÷ 10 feet/pixel)
- **Height:** ~13,000 pixels
- **Total addressable pixels:** ~240 million
- Most of these will never be drawn on. That is intentional — the wall is meant to feel infinite.

### Coordinate Conversion
- **Lat/lng → pixel:** linear projection within the bounding box (Mercator distortion is negligible at NYC's latitude over this small a span)
- **Pixel → lat/lng:** inverse of the above
- Conversions happen on the client; server stores integer pixel coordinates

---

## Rendering: Tile-Based Canvas

The wall is too big to render all at once. We use a tile-based approach inspired by Google Maps and OpenStreetMap.

### Tile Specification
- **Tile size:** 256×256 pixels
- **Total tiles for NYC:** ~72 × ~51 = ~3,700 tiles
- Each tile stores its pixel data as a packed byte array (one byte per pixel for color index)
- Tile size on disk: ~64KB max per fully-populated tile
- **Total city storage if every pixel populated:** ~240 MB (we will never approach this)

### Tile Lifecycle
1. Tiles are computed from the source-of-truth stroke data
2. Cached in the database for fast reads
3. Invalidated when strokes within their bounds are added or modified
4. Lazy-loaded on the client based on the visible viewport

### Rendering Pipeline (Client)
1. Compute which tiles are visible in the current viewport
2. Fetch any tiles not already in client cache
3. Draw each tile's pixels onto a Canvas at the appropriate scale
4. Overlay the simple NYC base map (rivers, parks, bridges) underneath
5. Re-render on pan/zoom events using `requestAnimationFrame`

### Performance Targets
- 60fps pan and zoom with 100K+ visible pixels
- Tile fetches complete within 200ms over reasonable network
- Initial load under 2 seconds

---

## Data Model

### Three Core Tables

```sql
-- Source of truth: every stroke ever drawn
CREATE TABLE strokes (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  points BYTEA NOT NULL,
  color CHAR(1) NOT NULL,           -- index into palette (0-7)
  width SMALLINT NOT NULL,
  bbox_x INTEGER NOT NULL,          -- bounding box in world pixel coords
  bbox_y INTEGER NOT NULL,
  bbox_w SMALLINT NOT NULL,
  bbox_h SMALLINT NOT NULL,
  drawn_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_strokes_bbox ON strokes (bbox_x, bbox_y);
CREATE INDEX idx_strokes_time ON strokes (drawn_at);
CREATE INDEX idx_strokes_session ON strokes (session_id);

-- Fast-rendering tile cache
CREATE TABLE tiles (
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  pixels BYTEA NOT NULL,            -- 256×256 packed byte array
  last_stroke_id BIGINT NOT NULL,   -- watermark for invalidation
  updated_at TIMESTAMP NOT NULL,
  PRIMARY KEY (tile_x, tile_y)
);

-- Daily budget tracking per anonymous session
CREATE TABLE user_budgets (
  session_id TEXT NOT NULL,
  date DATE NOT NULL,
  pixels_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date)
);
```

### Why This Schema

**Strokes are the source of truth.** Every contribution is preserved as the original gesture (a path of points), not a destructive set of pixels. This unlocks timelapse, history, posters, and undoability.

**Tiles are a cache, not source data.** Tiles can always be regenerated from the stroke log. This means we can change rendering style, decay curves, or color palettes without losing any data.

**No foreign keys, no users table.** Sessions are anonymous and identified by device-bound UUIDs in localStorage. We add real auth only when we need to.

### Stroke Encoding
- Points stored as delta-encoded varints in a binary blob
- Typical compression: 30-50% of naive size
- Bounding box is denormalized for fast spatial queries

### Tile Update Flow
When a stroke is committed:
1. Insert into `strokes` table
2. Compute affected tiles (using bounding box)
3. For each affected tile: rasterize the new stroke's pixels into the tile's byte array
4. Update tile's `last_stroke_id` watermark

This is "write amplification" — one stroke causes 1-4 tile writes — but writes are cheap and reads dominate by orders of magnitude.

---

## Rate Limiting Framework

The framework is locked. The numbers are tunable based on real usage data.

### Three Variables
1. **Budget** — daily pixel allowance (per session)
2. **Cooldown** — time between pixel placements (within a session)
3. **Density** — local activity adjustment that scales budget and cooldown up or down

### Budget Mechanics
- Refills daily at user's local midnight
- Atomic refill (full reset, not incremental)
- Each stroke consumes pixels equal to its rasterized pixel count
- When the budget is exhausted, drawing is disabled until reset

### Cooldown Mechanics
- Default: zero cooldown within a session
- In high-density areas, a cooldown may be enforced
- Cooldown is invisible UX in low/moderate density (which is everywhere at launch)

### Density Function
Calculated as: pixels placed within a defined radius and time window of the user's location.

| Local density | Budget multiplier | Cooldown multiplier |
|---|---|---|
| Sparse | 2.0× (generous) | 0.5× (no friction) |
| Moderate | 1.0× (default) | 1.0× (default) |
| Dense | 0.5× (tight) | 2.0× (slowed) |

### Tunable Configuration
All these values live in a single config (likely a database table or admin panel) and can be changed without redeploying:
- `baseBudget` (initial guess: 100 pixels)
- `baseCooldown` (initial guess: 0 seconds)
- `densityRadius` (initial guess: 1,000 ft)
- `densityWindow` (initial guess: 7 days)
- `densitySparseThreshold`, `densityDenseThreshold`

Expect every value to change multiple times in the first year.

---

## Editable Radius

### Mechanics
- **Soft constraint:** users can pan and zoom anywhere on the map at any time
- **Drawing is gated:** users can only place pixels within a radius of their GPS location
- **Default radius:** 300 feet (~30 pixels at 10ft resolution)
- The radius is visualized as a soft circle when entering draw mode

### Geolocation Strategy
- GPS is the primary signal
- IP geolocation is a fallback / sanity check
- WiFi BSSID fingerprinting and time-in-place verification are deferred until anti-spoofing becomes a real problem
- For MVP: trust GPS, log suspicious patterns for later review

---

## Persistence Model

**Currently undecided.** This is an open question in PRODUCT.md.

Options under consideration:
- Permanent persistence with soft visual decay (older pixels fade in opacity but never disappear)
- Periodic resets (weekly or monthly)
- Hybrid: permanent base layer + periodically resetting overlay

The data model supports all three options. The decision will be made based on real usage patterns.

This section will be updated and the open question removed once we commit.

---

## Color Palette

The palette is fixed. Adding colors requires unanimous agreement that the existing palette is failing.

### Initial Palette (8 colors)
- Charcoal `#1a1a1a`
- Brick red `#b8362a`
- Mustard `#c89d3c`
- Navy `#1f3a5f`
- Sage green `#5a7a4f`
- Cream (paper background) `#faf7f2`
- Slate blue `#4a5d7e`
- Soft black (alternate dark) `#2a2a2a`

The palette is deliberately warm and hand-painted feeling. No neon. No primary RGB.

Each pixel stores its color as an index (0-7) into this palette, requiring only 3 bits of color information.

---

## Base Map Rendering

The base map is intentionally minimal. It exists for orientation only.

### What's Included
- Coastlines (land/water boundaries)
- Major rivers (Hudson, East River)
- Major parks (Central, Prospect, Flushing Meadows, Van Cortlandt, Pelham Bay)
- Major bridges (Brooklyn, Manhattan, Williamsburg, Queensboro, GW)

### What's NOT Included
- Streets (any of them)
- Subway lines
- Building footprints
- Labels (until deepest zoom levels)
- Points of interest

### Visual Treatment
- Single-tone strokes (charcoal on cream)
- Hand-drawn aesthetic — slightly imperfect lines, not crisp vectors
- Always rendered *underneath* pixel art
- Always quieter than the doodles

### Implementation
- The base map ships as a static SVG asset
- Rendered to its own canvas layer beneath the pixel layer
- Re-renders only on zoom changes (it never changes otherwise)

---

## Identity & Sessions

### MVP Approach
- Anonymous device-bound sessions
- A UUID generated on first launch and persisted in localStorage
- Used for: budget tracking, undo functionality
- Not exposed on the wall (anonymous contribution principle)

### Why No Auth at Launch
- Auth adds significant friction to the "open app, doodle, leave" loop
- The product principles explicitly avoid social features that would require accounts
- Future features (personal galleries, posters tied to a person's history) may justify auth — at that point we add Supabase Auth on top of the existing session mechanism

---

## Mobile-First Considerations

The product is designed mobile-first. This shapes several decisions:

- **Touch gestures are primary:** pinch-zoom, two-finger pan, tap-and-hold for drawing
- **Single-handed use is a goal:** drawing tools live at the bottom of the screen
- **Performance targets assume mobile hardware:** 60fps on a recent iPhone, not just a MacBook Pro
- **Network assumptions are conservative:** the app must work over patchy cellular
- **Battery cost matters:** rendering should pause aggressively when the app is backgrounded
- **Touch target sizing:** all interactive elements meet a minimum 44pt touch target

Desktop is a supported secondary experience, not the primary one.

---

## Open Technical Questions

These are unresolved and will be addressed when the relevant feature is built:

1. **Stroke compression strategy.** Delta-encoded varints are the plan; benchmarking will confirm.
2. **Tile invalidation efficiency.** Current plan rasterizes new strokes onto existing tiles. May need batching at scale.
3. **Real-time updates.** WebSocket subscriptions for new strokes vs. polling. WebSockets feel right but add complexity. Decision deferred.
4. **Rendering performance at extreme zoom-out.** When you can see all of NYC at once, that's potentially millions of pixels in view. May need a separate "overview" rendering path with pre-aggregated heat-map style visualization.
5. **Anti-spoofing layers.** Currently trusting GPS. Will add IP, WiFi, and behavioral signals only when abuse becomes measurable.
6. **Moderation infrastructure.** Report buttons, AI flagging, human review queues. All deferred until there's something to moderate but designed in advance.

---

## Things We Have Explicitly Rejected

To avoid re-litigating later:

- **WebGL rendering.** Canvas 2D is sufficient for pixel-grid art at our scale. WebGL adds complexity without benefit.
- **PostGIS.** Our queries are integer rectangles, not real geographic shapes. Plain Postgres indexes are enough.
- **Per-user authentication at launch.** Anonymous sessions are sufficient and aligned with product principles.
- **Server-side rendering.** The product is interactive and client-driven. SSR adds complexity for no gain.
- **A custom backend.** Supabase covers everything we need at MVP scale.
- **Microservices.** This is one product. One database. One frontend.

These rejections are revisitable if circumstances change, but the bar for revisiting them is high.

---

## Author's Note

This architecture is intentionally boring. Every "exotic" choice (custom rendering pipelines, distributed databases, fancy ML services) is a future expense that compounds. We use proven, well-documented tools to do unproven, novel things. The novelty is in the product, not the stack.

When tempted by a more sophisticated solution, ask: *is this solving a real problem we have, or a problem we imagine we might have?* The latter rarely justifies the cost.