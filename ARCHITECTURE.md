# ARCHITECTURE.md — The Wall

This document captures the technical decisions for The Wall and tracks the actual state of the deployed system. It is updated at the end of each sprint to reflect what was built versus what is still planned.

For product principles, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.

---

## Current Implementation Status (as of Sprint 4)

| Component | Status |
|---|---|
| Pixel events stored in Supabase Postgres | ✅ Implemented |
| In-memory tile-canvas cache (client-side, pre-rasterized) | ✅ Implemented |
| Mode-aware polling (5s browse / 2s draw) | ✅ Implemented |
| Parallel keyset pagination for bootstrap + polling | ✅ Implemented |
| Anonymous sessions via localStorage UUID | ✅ Implemented |
| Daily budget enforcement (client-side) | ✅ Implemented |
| Daily prompt rotation | ✅ Implemented |
| Tap and tap-and-drag drawing | ✅ Implemented |
| Live commit (no undo) | ✅ Implemented |
| Color palette translation at API boundary | ✅ Implemented |
| Row-Level Security on all Supabase tables | ✅ Implemented |
| Mocked geolocation (real GPS deferred) | ⚠️ Mocked only |
| Onboarding flow | ❌ Not implemented |
| Server-side budget enforcement | ❌ Deferred |
| Server-side tile generation | ❌ Deferred |
| WebSocket / Supabase Realtime | ❌ Deferred (polling sufficient at MVP scale) |
| Authentication system | ❌ Not implemented (intentional) |
| Moderation tooling | ❌ Deferred |
| Real-world deployment | ❌ Local only as of Sprint 4 |

---

## Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for dev tooling and bundling
- **Tailwind CSS** for styling
- **HTML5 Canvas** for rendering the wall
- Mobile-first design — touch gestures are the primary interaction model

### Backend
- **Supabase** (Postgres + RLS)
- No custom server code at MVP scale; everything goes through Supabase's auto-generated APIs
- Future Edge Functions planned for tile generation and budget enforcement

### Hosting
- **Vercel** for the production frontend (planned for Sprint 5)
- **Supabase** hosts the backend
- Local development via Vite dev server

---

## Coordinate System

### Pixel Resolution
- **10ft × 10ft** per pixel in the real world
- Pixels are integer coordinates; no sub-pixel positioning

### NYC Bounding Box
The world coordinate system covers:
- **Southwest corner:** ~40.4774° N, -74.2591° W
- **Northeast corner:** ~40.9176° N, -73.7004° W
- This spans approximately 37 miles east-west, 35 miles north-south
- All five boroughs are included in the addressable space

### Pixel Grid Dimensions
- **Width:** ~18,500 pixels
- **Height:** ~13,000 pixels
- **Total addressable pixels:** ~240 million
- Most of these will never be drawn on. That is intentional — the wall is meant to feel infinite.

### Coordinate Conversion
- **Lat/lng → pixel:** linear projection within the bounding box
- **Pixel → lat/lng:** inverse of the above
- Conversions happen on the client; server stores integer pixel coordinates

---

## Data Model (Current)

### Three Tables in Supabase

```sql
-- Source of truth: every pixel placement, ever
CREATE TABLE pixel_events (
  id BIGSERIAL PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  color CHAR(1) NOT NULL,                  -- index into palette ('0'-'7')
  session_id TEXT NOT NULL,
  group_id UUID,                            -- NULL for taps; shared for stroke pixels
  group_seq SMALLINT,                       -- order within stroke; NULL for taps
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_mode CHAR(1) NOT NULL DEFAULT 't',  -- 't' = tap, 's' = stroke

  -- Reserved fields for future features (always defaults for now)
  depth SMALLINT NOT NULL DEFAULT 0,        -- for future infinite zoom
  parent_event_id BIGINT,                   -- for future infinite zoom
  city_id SMALLINT NOT NULL DEFAULT 1,      -- for future multi-city
  layer SMALLINT NOT NULL DEFAULT 0         -- for future layered modes
);

CREATE INDEX idx_events_xy ON pixel_events (x, y);
CREATE INDEX idx_events_time ON pixel_events (placed_at);
CREATE INDEX idx_events_session ON pixel_events (session_id);
CREATE INDEX idx_events_recent ON pixel_events (placed_at DESC);

-- Fast-rendering tile cache
CREATE TABLE tiles (
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  pixels BYTEA NOT NULL,                    -- 256×256 packed byte array
  last_event_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tile_x, tile_y)
);

-- Provisioned but not currently used (budget remains client-side)
CREATE TABLE user_budgets (
  session_id TEXT NOT NULL,
  date DATE NOT NULL,
  pixels_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date)
);
```

### Row-Level Security

All tables have RLS enabled. Current policies (permissive but bounded):

```sql
-- pixel_events: anyone can read and insert; no updates or deletes
CREATE POLICY "Anyone can read pixel events" ON pixel_events
  FOR SELECT USING (true);
CREATE POLICY "Anyone can insert pixel events" ON pixel_events
  FOR INSERT WITH CHECK (true);

-- tiles: anyone can read; anyone can write (will tighten in future sprint)
CREATE POLICY "Anyone can read tiles" ON tiles
  FOR SELECT USING (true);
CREATE POLICY "Anyone can write tiles" ON tiles
  FOR ALL USING (true) WITH CHECK (true);
```

### Why the Schema Looks This Way

**Pixel events are the source of truth.** Every contribution is preserved as an immutable event. Tiles are a cache derived from events — they can always be regenerated.

**No `strokes` table.** Earlier drafts of this document referenced a separate strokes table. That was superseded by the unified `pixel_events` schema, which handles both tap and (future) stroke modes through the `group_id` field. This is the schema deployed in production.

**Reserved fields with defaults.** `depth`, `parent_event_id`, `city_id`, and `layer` are present but unused. They support future features (infinite zoom, multi-city, layered modes) without requiring migrations later.

**No foreign keys, no users table.** Sessions are anonymous device-bound UUIDs in localStorage. No auth, no user records.

**Color stored as palette index, not hex.** `CHAR(1)` stores '0' through '7', representing positions in the 8-color palette. The application uses hex strings internally (`'#1a1a1a'`); translation happens at the Supabase API boundary. This is a deliberate tradeoff: storage efficiency on the database, code clarity in the application.

### Tile Update Flow (Current)

When a pixel event is committed:
1. Insert into `pixel_events` (one round-trip).
2. Locally call `setPixel(x, y, color)` (`src/lib/pixelStore.ts`), which updates the three in-memory maps and paints a 1×1 `fillRect` directly into the affected tile's offscreen `HTMLCanvasElement`.

That is the entire write path. There is no client→Supabase tile read or upsert, and no Edge Function in the loop. The `tiles` table still exists in the schema (see below) but is **unused** at MVP — kept for forward-compat in case server-side tile materialisation is reintroduced. The previously planned Edge-Function migration is no longer the natural next step: per-pixel write cost is now one Supabase RTT, and the hot bottleneck has moved to bootstrap-fetch latency, addressed by parallel keyset pagination (see "Fetch Pipeline" below).

---

## Real-Time Updates: Mode-Aware Polling

Decision finalized in Sprint 4: pixel updates are propagated via **polling**, not WebSocket subscriptions. The cadence is now mode-aware rather than a flat 5s.

### How It Works (`src/lib/polling.ts`)
- Each tick calls `fetchNewEvents(sinceIso, viewportBounds)`, which fetches `pixel_events` newer than `lastSeenTimestamp` and inside the current viewport. The fetch itself uses parallel keyset pagination — see "Fetch Pipeline" below.
- Returned events are passed through `applyIncomingEvents`, which calls `setPixel` for each row and bumps the in-memory `lastSeenTimestamp`. `setPixel` paints into the relevant tile canvas immediately, then notifies subscribers, which causes `PixelLayer` to schedule one RAF render.
- Cadence is selected per tick from `src/config/tuning.ts`:
  - `polling.browseIntervalMs = 5000` (browse mode — passive viewing)
  - `polling.drawIntervalMs = 2000` (draw mode — user is placing pixels, freshness matters more)
- When `document.hidden` becomes true the loop pauses; on visibility-change it does an immediate catch-up fetch and then resumes the normal cadence.

### Why Polling Over WebSockets
- Polling is dramatically simpler — no connection state, no reconnection logic.
- 2–5s latency is acceptable for asynchronous use (most users draw at different times).
- Synchronous use cases (two friends drawing together right now) are rare at MVP scale.
- Migration path to Supabase Realtime is straightforward when needed.

### Known Limitation
For real-time *collaborative* drawing (two users in the same area at the same time), even the 2s draw-mode delay is perceptible. This is a known limitation. If/when this becomes the dominant use case, the polling layer should be replaced with Supabase Realtime subscriptions.

---

## Rendering: Tile-Based Canvas

The wall is too big to render all at once. Tiles are 256×256 windows of world space and act as the unit of caching. Unlike Google Maps, **tiles are never fetched from the server** — they are pre-rasterized in-memory in the browser and updated incrementally as pixel events stream in.

### Tile Specification
- **Tile size:** 256×256 world pixels (`TILE_SIZE` in `src/lib/coordinates.ts`).
- **Total addressable tiles for NYC:** ~72 × ~51 ≈ ~3,700. In practice only the populated subset is materialised — the `_tileCanvas` map only allocates a canvas the first time a pixel lands in a given tile.

### Storage (`src/lib/pixelStore.ts`)

Three parallel in-memory maps, all kept in sync by `setPixel`/`deletePixel`:

| Map | Type | Purpose |
|---|---|---|
| `_pixels` | `Map<"x,y", color>` | Flat hit-test. Used by `placePixel` to short-circuit no-op writes (same color on same coord). |
| `_tileIndex` | `Map<"tx,ty", Set<pixelKey>>` | Per-tile pixel set. Now only used by the dev/seed `PlacementView` preview path. Kept for compat. |
| `_tileCanvas` | `Map<"tx,ty", HTMLCanvasElement>` | **The render hot path.** One offscreen 256×256 canvas per populated tile, painted in screen-Y orientation (`lyCanvas = TILE_SIZE - 1 - lyWorld`) so the renderer can `drawImage` without per-frame Y-flip. |

### Write Path (`setPixel`)
Updates all three maps together. Tile canvas is painted with a 1×1 `ctx.fillRect`. After the first pixel in a tile, no further allocations occur on the hot path.

### Render Path (`src/components/PixelLayer.tsx`)
A single `useEffect` triggers whenever `viewport`, `width`, `height`, or `pixelVersion` changes. It schedules **one** `requestAnimationFrame` (coalescing rapid changes — e.g. continuous pan, or a burst of incoming polled events). On the frame:

1. Resize the backing canvas to the DPR-scaled bounds and `clearRect`.
2. `screenToWorld` the four corners → world bounds.
3. `getVisibleTileCanvases(wxMin, wxMax, wyMin, wyMax)` yields `{tx, ty, canvas}` for each populated tile that intersects the viewport.
4. For each, `worldToScreen(tx*TILE, (ty+1)*TILE)` (the world NW corner of the tile, since world Y grows north) → `ctx.drawImage(tileCanvas, sx, sy, TILE_SIZE * scale, TILE_SIZE * scale)`.

Per-frame cost is **O(visible tiles)** — typically 5–30 `drawImage` calls — and is independent of the total number of pixels in the store. This is the key win over the previous per-pixel `fillRect` render path.

### Layer Composition (`src/components/WallCanvas.tsx`)
Three sibling `<canvas>` layers, painted bottom-up:

1. `<BaseMapLayer pass="fills">` — cream background + borough fills.
2. `<PixelLayer>` — user pixels (the tile-canvas blits described above).
3. `<BaseMapLayer pass="outlines">` — borough and park strokes, painted *over* pixel art so coastlines remain legible at any zoom.

`BaseMapLayer` re-renders on the same triggers as `PixelLayer` (viewport / size). It is not tile-cached — it strokes/fills GeoJSON paths directly, with line weight scaled inversely with zoom to stay visible.

### Performance Targets
- 60fps pan and zoom with the live dataset (~175k pixels visible at full zoom-out).
- Per-frame budget: ~5–30 `drawImage` calls regardless of pixel count.
- Initial load: dominated by the bootstrap fetch (see "Fetch Pipeline" below), not by rendering.

---

## Fetch Pipeline: Parallel Keyset Pagination

`src/lib/pixelApi.ts` is the single source for both bootstrap (`loadViewportPixels`) and polling (`fetchNewEvents`). Both delegate to one internal `loadAll(bounds, sinceIso)`.

### Strategy
1. **Probe.** `fetchMaxId(bounds, sinceIso)` runs a single query that returns the largest `id` matching the bounds (and optional `placed_at > sinceIso`). Uses the btree on `id` — fast even on large tables.
2. **Split.** `[1, maxId]` is divided into `N_CHUNKS = 32` contiguous id-ranges.
3. **Paginate in parallel.** For each range, `fetchChunkKeyset` keyset-paginates: `gt(id, cursor)` + `lte(id, endId)`, ordered by `id` asc, `PAGE_SIZE = 1000`, capped at `MAX_PAGES_PER_CHUNK = 50` (≈50k rows per chunk; 1.6M global cap).
4. **Merge.** `Promise.all` the chunks; flatten.

### Why This Shape
- **Why not OFFSET.** Postgres `OFFSET N` walks N rows on every query. At ~150k matching rows the planner hits `statement_timeout`.
- **Why not sequential keyset.** With 175k+ rows, ~175 sequential round-trips × ~80ms ≈ ~14s cold-load. Unacceptable.
- **Why parallel keyset.** Each chunk is a bounded index range scan on `id` — constant time per page regardless of total dataset size. With `N_CHUNKS = 32` the worst case (all rows clustered in a single id-range) still splits the cluster, keeping any individual chunk's pagination depth under ~6 pages even at 175k rows.

### Knobs
- `PAGE_SIZE = 1000` — Supabase's PostgREST default cap is 1000; raising would require server config.
- `N_CHUNKS = 32` — empirically sized for the current cluster pattern; raise if cold-load becomes the bottleneck again as the dataset grows.

---

## Color Palette

The palette is fixed. Adding colors requires unanimous agreement that the existing palette is failing.

### Current Palette (8 colors at index 0-7)
- `0` Charcoal `#1a1a1a`
- `1` Brick red `#b8362a`
- `2` Mustard `#c89d3c`
- `3` Navy `#1f3a5f`
- `4` Sage green `#5a7a4f`
- `5` Cream (paper background) `#faf7f2`
- `6` Slate blue `#4a5d7e`
- `7` Soft black (alternate dark) `#2a2a2a`

### Critical Constraint
**The palette must not be reordered.** Indices are stored in the database. Reordering would invalidate every existing pixel event. New colors are appended only.

This is enforced by a comment in the source code at the palette definition.

---

## Identity & Sessions

### Current Approach
- Anonymous device-bound sessions
- A UUID generated on first launch and persisted in localStorage
- Used for: budget tracking, ownership of recent actions
- Not exposed on the wall (anonymous contribution principle)

### What This Means in Practice
- The same physical user on a new device is, from the app's perspective, a new user
- Clearing browser data resets identity
- Onboarding will appear again on new devices (acceptable; aligned with manifesto)
- No cross-device continuity is possible without authentication, which we're explicitly not adding

---

## Geolocation (Currently Mocked)

Real GPS is deferred until Sprint 5. The current implementation uses a mocked location with a `?location=` query parameter override.

### Sprint 5 Plan
- Real GPS via `navigator.geolocation`
- Lock-in model: GPS captured once when draw mode is entered; subsequent drift ignored during the session
- Generous radius (~400ft) to absorb GPS error
- Read-only fallback if permission is denied
- Dev-mode location menu for development (replaces query param approach)

### Geofence Mechanics (Planned)
- **Soft constraint** — users can pan/zoom anywhere on the map at any time
- **Drawing is gated** by physical location
- **Default radius:** 400 feet (40 pixels at 10ft resolution)
- **Visualized** as a soft circle when entering draw mode

### Geolocation Strategy
- GPS is the only signal at MVP scale
- IP geolocation, WiFi BSSID fingerprinting, and behavioral signals are deferred until anti-spoofing becomes a real problem

---

## Persistence Model

**Currently undecided.** This is an open question in PRODUCT.md.

Options under consideration:
- Permanent persistence with soft visual decay (older pixels fade in opacity but never disappear)
- Periodic resets (weekly or monthly)
- Hybrid: permanent base layer + periodically resetting overlay

The data model supports all three options. The decision will be made based on real usage patterns.

---

## Rate Limiting Framework

The framework is locked. The numbers are tunable based on real usage data.

### Three Variables
1. **Budget** — daily pixel allowance (per session)
2. **Cooldown** — time between pixel placements (within a session)
3. **Density** — local activity adjustment (planned but not yet implemented)

### Current Values (Sprint 3)
- **Budget cap:** 300 pixels
- **Regen rate:** 1 pixel per minute (60 per hour)
- **Tap cooldown:** 300ms between any pixel placement
- **Drag rate cap:** 30 pixels per second

### Implementation
- All values live in `src/config/tuning.ts`
- Currently enforced client-side via localStorage
- Server-side enforcement deferred until scale or fairness demands it

### Planned Migration
When budget enforcement moves server-side (likely Sprint 6 or later), the `user_budgets` table becomes the source of truth. The migration is straightforward — the table already exists, the schema matches the localStorage format.

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
- Re-renders only on zoom changes

---

## Mobile-First Considerations

The product is designed mobile-first. This shapes several decisions:

- **Touch gestures are primary:** pinch-zoom, two-finger pan, tap-and-hold for drawing
- **Single-handed use is a goal:** drawing tools live at the bottom of the screen
- **Performance targets assume mobile hardware:** 60fps on a recent iPhone
- **Network assumptions are conservative:** the app must work over patchy cellular
- **Battery cost matters:** rendering should pause aggressively when the app is backgrounded
- **Touch target sizing:** all interactive elements meet a minimum 44pt touch target

Desktop is a supported secondary experience, not the primary one.

---

## Things We Have Explicitly Rejected

To avoid re-litigating later:

- **WebGL rendering.** Canvas 2D is sufficient for pixel-grid art at our scale. WebGL adds complexity without benefit.
- **PostGIS.** Our queries are integer rectangles, not real geographic shapes. Plain Postgres indexes are enough.
- **Per-user authentication at MVP.** Anonymous sessions are sufficient and aligned with product principles.
- **Server-side rendering.** The product is interactive and client-driven. SSR adds complexity for no gain.
- **A custom backend.** Supabase covers everything we need at MVP scale.
- **Microservices.** This is one product. One database. One frontend.
- **WebSockets at MVP.** Polling at 5s intervals is acceptable until synchronous collaborative drawing becomes the dominant use case.
- **Seeded fake content for cold-start.** The archive must remain authentic. Empty state is acceptable; faked engagement is not.
- **Cross-device persistence without auth.** Adding identity contradicts the manifesto. Re-onboarding on new devices is fine.

These rejections are revisitable if circumstances change, but the bar for revisiting them is high.

---

## Open Technical Questions

These are unresolved and will be addressed when the relevant feature is built:

1. **Per-tab memory growth.** The in-memory `_tileCanvas` map only grows — populated tiles are never evicted, even when far outside the viewport. At MVP scale this is fine; long sessions on a large dataset may eventually need an LRU bound or an off-viewport eviction sweep.
2. **Real-time updates beyond polling.** WebSocket subscriptions for collaborative drawing if it becomes a dominant use case.
3. **Rendering performance at extreme zoom-out.** When you can see all of NYC at once, that's potentially millions of pixels in view. May need a separate "overview" rendering path.
4. **Anti-spoofing layers.** Currently trusting GPS. Will add IP, WiFi, and behavioral signals only when abuse becomes measurable.
5. **Moderation infrastructure.** Report buttons, AI flagging, human review queues. All deferred until there's something to moderate.
6. **Server-side budget enforcement.** When fairness, anti-cheating, or scale demands it.

---

## Author's Note

This architecture is intentionally boring. Every "exotic" choice (custom rendering pipelines, distributed databases, fancy ML services) is a future expense that compounds. We use proven, well-documented tools to do unproven, novel things. The novelty is in the product, not the stack.

When tempted by a more sophisticated solution, ask: *is this solving a real problem we have, or a problem we imagine we might have?* The latter rarely justifies the cost.

---

## Document Maintenance

This document is updated at the end of each sprint to reflect the actual deployed state of the system. The "Current Implementation Status" table is the canonical reference for what is built versus what is planned. When this document drifts from reality, the document is wrong.