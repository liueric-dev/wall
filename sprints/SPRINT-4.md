# SPRINT-4.md — Backend Integration

This sprint takes The Wall from a single-device app to a multi-user product. Pixels you place become visible to everyone. The wall finally becomes a *shared* canvas.

The core change: localStorage is replaced by Supabase as the source of truth for pixel events. Tile rendering still happens client-side, but the data behind it is now real and shared.

For the long-term product vision, see PRODUCT.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md, SPRINT-2.md, SPRINT-3.md.

---

## The Goal

Make the wall multi-user. Pixels you place must persist on a real backend and be visible to others within ~5 seconds. By the end of this sprint, you can have a friend open the URL on their phone and watch your pixels appear on their screen as you draw them.

This is the moment the product becomes the product. Until now, every user has been alone on a private wall.

---

## What's Changing

### Persistence
- **Before:** localStorage holds pixel events
- **After:** Supabase Postgres holds pixel events; localStorage holds only the device session UUID

### Multi-User Visibility
- **Before:** Only your pixels are visible
- **After:** All users' pixels are visible to everyone

### Real-Time Updates
- **Before:** Static — only your own pixels appear during your session
- **After:** Polling every 5 seconds fetches new pixels from other users; they appear on your screen as the canvas updates

### Budget Tracking
- **Before:** Local budget state in localStorage
- **After:** Local budget state in localStorage (still client-side for now — see notes)

### Authentication
- **Before:** Anonymous device-bound UUID
- **After:** Same — anonymous device-bound UUID. No login required.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Functional Requirements
- [ ] A Supabase project is created and configured for the app
- [ ] The full schema is deployed (`pixel_events`, `tiles`, `user_budgets`)
- [ ] Every pixel placement writes to `pixel_events` in Supabase
- [ ] On app load, pixels for the visible viewport are fetched from Supabase
- [ ] The app polls Supabase every 5 seconds for new pixel events
- [ ] New pixels appear on the canvas without a page refresh
- [ ] Two users on different devices can draw simultaneously and see each other's work appear
- [ ] Tile cache is updated whenever pixel events are written (synchronous, server-side)
- [ ] Budget tracking continues to work via localStorage (deferred for later migration)

### Performance Requirements
- [ ] Pixel placement still feels instant (optimistic UI update, then async write)
- [ ] Polling does not cause visible UI jank
- [ ] Initial viewport load completes within ~2 seconds
- [ ] Polling queries are bounded to visible tiles (not the entire canvas)

### Reliability Requirements
- [ ] If a write to Supabase fails, the user is shown a quiet error indicator
- [ ] If polling fails temporarily, the app continues to work in read-only mode locally
- [ ] On reconnect, the canvas re-syncs with the latest server state

### Constraints
- [ ] No WebSocket implementation (polling only)
- [ ] No authentication system (anonymous sessions continue)
- [ ] No client-side caching beyond the in-memory tile cache
- [ ] Budget refill stays client-side for now

---

## Step 1: Create the Supabase Project

If you haven't already, set up Supabase. This is a one-time operation that takes ~10 minutes.

### Steps
1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project named `the-wall` (or similar). Pick a region close to you (us-east-1 if you're in NYC)
3. Save the project URL and anon key — you'll need both
4. From the dashboard, open the SQL Editor

### Initial SQL — Run This First

Paste and run the schema from ARCHITECTURE.md, with the forward-compatible fields included:

```sql
-- Source of truth: every pixel ever placed
CREATE TABLE pixel_events (
  id BIGSERIAL PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  color CHAR(1) NOT NULL,
  session_id TEXT NOT NULL,
  group_id UUID,
  group_seq SMALLINT,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_mode CHAR(1) NOT NULL DEFAULT 't',
  
  -- Reserved fields (always defaults for now)
  depth SMALLINT NOT NULL DEFAULT 0,
  parent_event_id BIGINT,
  city_id SMALLINT NOT NULL DEFAULT 1,
  layer SMALLINT NOT NULL DEFAULT 0
);

-- Indexes for the access patterns we need
CREATE INDEX idx_events_xy ON pixel_events (x, y);
CREATE INDEX idx_events_time ON pixel_events (placed_at);
CREATE INDEX idx_events_session ON pixel_events (session_id);
CREATE INDEX idx_events_recent ON pixel_events (placed_at DESC);

-- Tile cache for fast viewing
CREATE TABLE tiles (
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  pixels BYTEA NOT NULL,
  last_event_id BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tile_x, tile_y)
);

-- Budget tracking (placeholder — will be used when budget moves server-side)
CREATE TABLE user_budgets (
  session_id TEXT NOT NULL,
  date DATE NOT NULL,
  pixels_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, date)
);
```

### Configure Row-Level Security (RLS)

For MVP, allow anonymous reads and writes. We'll tighten this later.

```sql
-- Enable RLS on all tables
ALTER TABLE pixel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_budgets ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read pixel events
CREATE POLICY "Anyone can read pixel events" ON pixel_events
  FOR SELECT USING (true);

-- Allow anyone to insert pixel events
CREATE POLICY "Anyone can insert pixel events" ON pixel_events
  FOR INSERT WITH CHECK (true);

-- Allow anyone to read tiles
CREATE POLICY "Anyone can read tiles" ON tiles
  FOR SELECT USING (true);

-- Allow anyone to insert/update tiles (for now — will tighten with edge functions later)
CREATE POLICY "Anyone can write tiles" ON tiles
  FOR ALL USING (true) WITH CHECK (true);
```

This is permissive on purpose. We'll lock it down once we have edge functions managing writes properly. For MVP, anonymous read/write is fine.

### Save Connection Details

Add Supabase credentials to a `.env.local` file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Add `.env.local` to `.gitignore` so you don't commit secrets.

---

## Step 2: Install Supabase Client

```bash
npm install @supabase/supabase-js
```

Create a single shared client module:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

Use this client everywhere. Don't create new instances.

---

## Step 3: Replace localStorage Writes with Supabase Writes

Replace any "save pixel event to localStorage" code with calls that write to Supabase.

```typescript
// src/lib/pixels.ts
import { supabase } from './supabase'
import { v4 as uuidv4 } from 'uuid'

export async function placePixel(
  x: number,
  y: number,
  color: string,
  sessionId: string,
  groupId?: string,
  groupSeq?: number
): Promise<{ success: boolean }> {
  // Optimistic UI update happens elsewhere — this is just the write
  
  const { error } = await supabase.from('pixel_events').insert({
    x,
    y,
    color,
    session_id: sessionId,
    group_id: groupId ?? null,
    group_seq: groupSeq ?? null,
    input_mode: 't',
    // depth, parent_event_id, city_id, layer all default
  })
  
  if (error) {
    console.error('Failed to place pixel:', error)
    return { success: false }
  }
  
  return { success: true }
}
```

### Optimistic UI Pattern

The user expects pixels to appear instantly. Don't wait for the network round-trip. Pattern:

1. User taps a pixel
2. Update render state immediately (the user sees the pixel)
3. Send write to Supabase asynchronously
4. If the write fails, show a small error indicator and revert the local pixel

```typescript
function handleTap(x: number, y: number) {
  const color = userState.activeColor
  
  // 1. Update locally first
  renderState.setPixel(x, y, color)
  
  // 2. Write to backend in the background
  placePixel(x, y, color, userState.sessionId).then(result => {
    if (!result.success) {
      // Revert: restore previous pixel state
      renderState.setPixel(x, y, previousColor)
      showQuietError()
    }
  })
}
```

---

## Step 4: Replace localStorage Reads with Supabase Reads

On app load, fetch pixel events for the visible viewport instead of reading from localStorage.

```typescript
// src/lib/pixels.ts (continued)
export async function loadPixelsInViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): Promise<PixelEvent[]> {
  const { data, error } = await supabase
    .from('pixel_events')
    .select('*')
    .gte('x', bounds.minX)
    .lte('x', bounds.maxX)
    .gte('y', bounds.minY)
    .lte('y', bounds.maxY)
    .order('placed_at', { ascending: true })  // earliest first; later events overwrite
  
  if (error) {
    console.error('Failed to load pixels:', error)
    return []
  }
  
  return data
}
```

### Important: Latest-Wins Logic

When loading events, the *latest event at each (x, y)* determines the current pixel color. The query orders by `placed_at` ascending, so as you process events in order, later events naturally overwrite earlier ones in your render state.

Don't try to deduplicate at the database level — load all events and let the rendering pipeline handle the precedence.

### Limit Considerations

For now, the viewport is small enough that loading all events is fine. As the wall grows, you may need to:
- Limit to events in the last N days
- Use the tile cache instead of raw events
- Paginate

For Sprint 4, just load all events in viewport bounds. Optimize later if performance becomes an issue.

---

## Step 5: Implement Polling for New Events

Every 5 seconds, fetch any pixel events that have been placed since the last fetch. Render them on top of the current state.

```typescript
// src/lib/polling.ts
import { supabase } from './supabase'

let lastFetchTime: string = new Date().toISOString()
let pollingInterval: number | null = null

export function startPolling(
  bounds: () => { minX: number; minY: number; maxX: number; maxY: number },
  onNewEvents: (events: PixelEvent[]) => void
) {
  pollingInterval = window.setInterval(async () => {
    const currentBounds = bounds()
    const { data, error } = await supabase
      .from('pixel_events')
      .select('*')
      .gte('x', currentBounds.minX)
      .lte('x', currentBounds.maxX)
      .gte('y', currentBounds.minY)
      .lte('y', currentBounds.maxY)
      .gt('placed_at', lastFetchTime)
      .order('placed_at', { ascending: true })
    
    if (!error && data && data.length > 0) {
      onNewEvents(data)
      lastFetchTime = data[data.length - 1].placed_at
    }
  }, 5000)
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}
```

### Notes on Polling

- **Bounds are recomputed each poll** — if the user pans, polling adapts to the new visible area
- **`lastFetchTime` advances** as new events arrive, ensuring you only ever fetch new ones
- **Stop polling when the user is in draw mode** (optional — could continue, but it's a render-state simplification)
- **Restart polling on reconnect** if the network drops

---

## Step 6: Implement Tile Update Logic

When pixels are placed, the affected tiles need to update so future viewers can render them efficiently.

For Sprint 4, do this client-side and *synchronously*. When a pixel is placed:
1. Compute the tile that contains it
2. Read the current tile from Supabase (or in-memory cache)
3. Update the byte at the right position
4. Write the updated tile back

```typescript
// src/lib/tiles.ts
export async function updateTileForPixel(
  x: number, 
  y: number, 
  colorIndex: number,
  eventId: number
) {
  const tileX = Math.floor(x / 256)
  const tileY = Math.floor(y / 256)
  const localX = x - tileX * 256
  const localY = y - tileY * 256
  
  // Fetch current tile (or initialize if none)
  const { data: existingTile } = await supabase
    .from('tiles')
    .select('*')
    .eq('tile_x', tileX)
    .eq('tile_y', tileY)
    .single()
  
  const pixels = existingTile?.pixels ?? new Uint8Array(256 * 256)
  pixels[localY * 256 + localX] = colorIndex
  
  // Upsert the tile
  await supabase.from('tiles').upsert({
    tile_x: tileX,
    tile_y: tileY,
    pixels,
    last_event_id: eventId,
    updated_at: new Date().toISOString(),
  })
}
```

### Important Caveat

This is *correct* but not *optimal*. Doing tile updates synchronously on every pixel write means every tap triggers two Supabase round-trips (event insert + tile upsert).

For MVP, this is fine. With <100 users this won't cause performance issues. **In a future sprint, this should move to a Supabase Edge Function** that handles tile updates server-side after event inserts. For now, client-side is acceptable.

---

## Step 7: Migrate Existing Local Data (Optional)

If you have pixel data in localStorage from earlier sprints, you can either:

**Option A: Throw it away.** Cleaner. Start fresh on the real backend.

**Option B: Migrate it.** On first load with the new code, push existing localStorage pixels to Supabase, then delete the localStorage entries.

For Sprint 4, **just throw it away.** You're the only user and your "data" is testing data. Migrating adds complexity for no real value.

---

## Step 8: Keep Budget Client-Side (For Now)

The budget mechanic from Sprint 3 stays in localStorage for this sprint. Don't migrate it.

This is a deliberate deferral. As noted in the conversation:
- Client-side is easy to "rip out later"
- Server-side budget enforcement matters when scale demands it (vandalism, brigading, paid users)
- For <100 trusted users, client-side budget is sufficient

The `user_budgets` table is set up server-side and ready to use, but no code writes to it yet. **Future Sprint 5 or 6 will migrate budget to server-side enforcement.** Note this in your retrospective.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Create Supabase project, run schema migration, set up RLS, save credentials | 30 min | Supabase project ready |
| 2 | Install Supabase client, create shared client module | 15 min | Client connects from app |
| 3 | Build `placePixel` function and integrate with tap/drag flow (replacing localStorage writes) | 60 min | Pixels write to Supabase |
| 4 | Implement optimistic UI pattern (immediate render + async write + revert on failure) | 30 min | Pixels appear instantly, errors handled |
| 5 | Build `loadPixelsInViewport` and replace localStorage reads on app load | 45 min | App loads pixels from Supabase |
| 6 | Build polling system, integrate with viewport bounds | 60 min | New pixels appear every 5s |
| 7 | Implement tile update logic on pixel placement | 60 min | Tiles get updated after each event |
| 8 | Test multi-device: open app on phone and laptop simultaneously, verify pixels appear on both | 45 min | Multi-user works |
| 9 | Polish: error indicators, reconnection logic, loading states | 45 min | Feels production-ish |
| 10 | End-to-end testing — share URL with one friend and have them draw | 30 min | Sprint complete |

**Total estimated time: ~7 hours**

---

## What Counts as Success

The sprint succeeds when:

1. You and a friend (on different devices) can both have the app open
2. When they draw a pixel, you see it appear on your screen within ~5 seconds
3. When they reload the page, your pixels are still there
4. Pixels persist across browser sessions, devices, and networks
5. The drawing experience still feels instant on the placing user's device
6. The app gracefully handles brief network drops (continues to work, syncs on reconnect)

---

## What Counts as Failure

- Pixels take more than 10 seconds to appear on other devices
- Pixels are lost on network interruption
- The drawing experience feels laggy due to network round-trips
- Polling causes UI jank or frame drops
- Errors are silent (user has no idea something failed)
- The schema requires migrations during the sprint (it shouldn't)

---

## What's Out of Scope

To stay focused, do NOT build in this sprint:

- WebSocket / real-time subscription system (polling only)
- Server-side budget enforcement (client-side stays)
- Server-side tile generation via Edge Functions (client-side stays)
- Authentication / accounts
- Migration of existing localStorage data
- Geographic indexing optimizations (PostGIS, etc.)
- Tile CDN or caching layer
- Deduplication of events at write time
- Real-time event ordering guarantees
- Conflict resolution beyond latest-wins
- Read replicas, sharding, or other database scaling work

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, ARCHITECTURE.md, MANIFESTO.md, and SPRINT-1 through SPRINT-3 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **Coordinate Supabase setup with me explicitly** — the project creation steps require my action, not yours.
- **Do not commit `.env.local`.** Verify `.gitignore` is configured before any commit.
- **If you hit ambiguity, stop and ask.** Do not make architectural decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is multi-user persistence with reasonable real-time feel. Optimize for "does it work for two people" over "is it production-ready for thousands."

---

## After the Sprint

Once Sprint 4 ships:

1. **Tell 5-10 friends to use it.** Send them the URL. Watch what happens.
2. **Look at the wall the next morning.** Did people draw? Did the prompt resonate? Are there clusters or scatter?
3. **Capture observations in `RETROSPECTIVE-SPRINT-4.md`.**

Likely candidates for Sprint 5 (in priority order based on common outcomes):

- **Real geolocation** — replace mocked location with actual GPS, implement geofencing properly. This is the moment the product becomes physical.
- **Onboarding flow** — when friends start using it, you'll discover what's confusing. First-launch UX matters.
- **Server-side tile generation** — if the synchronous client-side tile updates are slowing down placement, move to Edge Functions.
- **Server-side budget enforcement** — if anyone tries to cheat or you see the need for fairness, migrate budget logic.
- **WebSockets** — only if 5-second polling feels obviously slow with multi-user activity.

Don't pre-commit. The retrospective will reveal which one matters most.