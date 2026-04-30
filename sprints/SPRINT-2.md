# SPRINT-2.md — Tap-Based Drawing

This sprint builds the drawing interaction on top of the rendering spike. Users can tap to place pixels, switch colors, undo their work, and see their contributions persist across page reloads. No backend, no real GPS — just the creative core.

For the long-term product vision, see PRODUCT.md.
For the technical blueprint, see ARCHITECTURE.md.
For the rendering foundation, see SPRINT-1.md.

---

## The Goal

Validate that the **act of placing pixels feels good** as a creative experience. By the end of the sprint, you should be able to open the app, tap to make pixel art, switch colors, undo mistakes, reload the page, and see your work preserved.

If this interaction feels right, the creative core of the product is real. If it doesn't, we have a fundamental product problem to solve before going further.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Functional Requirements
- [ ] User can tap any pixel within the editable radius to place a colored pixel
- [ ] User can tap-and-drag to place a continuous line of pixels along the drag path
- [ ] User can switch colors via a visible color picker in the drawing toolbar
- [ ] User can undo their last tap (or last drag-line) with an undo button
- [ ] Tapping a pixel that's already the selected color does NOTHING (no-op, no budget deducted)
- [ ] Tapping a pixel that's a different color overwrites it
- [ ] All pixel placements persist across page reloads via localStorage
- [ ] Pixel data is stored using the forward-compatible event schema (see below)

### Visual Requirements
- [ ] An editable radius (soft circle) is visible around the user's mocked location
- [ ] Pixels outside the radius are visible but not tappable
- [ ] A "Doodle" entry mode shows the toolbar; otherwise it's hidden
- [ ] Newly placed pixels appear instantly with no perceptible lag
- [ ] The drawing toolbar has clear visual affordance for selected color

### Performance Targets
- [ ] Tap-to-pixel-visible latency under 50ms
- [ ] No frame drops during rapid tap-and-drag
- [ ] localStorage writes don't block the UI

### Mobile-First Requirements
- [ ] Tap and tap-and-drag both feel native on iOS Safari
- [ ] The drawing toolbar is usable single-handed
- [ ] Touch targets in the toolbar are at least 44pt
- [ ] Pinch-to-zoom and pan still work as in Sprint 1 (drawing mode does not break navigation)

### Constraints
- [ ] Builds on the same repo as Sprint 1
- [ ] No backend, no Supabase, no API
- [ ] No real GPS — uses a mocked location with a query parameter override
- [ ] No daily budget enforcement (budget counter is visible for UX testing, but unlimited)
- [ ] Local-only deployment, no production push

---

## The Event Schema (Forward-Compatible)

Every pixel placement is stored as an event in localStorage. The schema is designed to support tap mode now and stroke mode (and other modes) later without migration.

```typescript
type PixelEvent = {
  id: string;                    // UUID
  x: number;                     // world pixel coord (integer)
  y: number;                     // world pixel coord (integer)
  color: string;                 // hex string from the palette
  session_id: string;            // anonymous UUID, persisted in localStorage
  group_id: string | null;       // null for individual taps; UUID for tap-drag groups
  group_seq: number | null;      // order within a group; null for individual taps
  placed_at: string;             // ISO timestamp
  input_mode: 't' | 's';         // 't' for tap, 's' for stroke (always 't' in this sprint)
  
  // Reserved for future features — always default values for now:
  depth: number;                 // 0 (for future infinite zoom)
  parent_event_id: string | null;// null (for future infinite zoom)
  city_id: number;               // 1 (for future multi-city)
  layer: number;                 // 0 (for future layered modes)
};
```

### Storage in localStorage
- One key: `wall_events`
- Value: JSON array of `PixelEvent` objects
- Append on every new event
- Read once on app load and replay into the rendering engine

### Why These Fields Exist Now
Even though most are unused in this sprint, including them in the schema today means:
- No migration when those features arrive
- The data shape matches what Postgres will eventually store
- Sprint 3+ can move from localStorage to Supabase by mapping fields directly

---

## Tap Mechanics

### Single Tap
- User taps a pixel inside the editable radius
- Client checks the current color of that pixel
  - If same as selected color: **no-op, no budget deducted, no event logged, no visual change**
  - If different (or empty): **the pixel updates immediately, an event is logged**
- The new event has `group_id = null` and `input_mode = 't'`

### Tap-and-Drag
- User taps and drags continuously across the canvas
- Each new pixel cell crossed during the drag generates a separate event
- All events from a single drag share a `group_id` (newly generated UUID)
- Each event has a `group_seq` for ordering (1, 2, 3, ...)
- The same no-op rule applies per pixel — if a pixel during the drag is already the selected color, it's silently skipped

This means a drag is *technically* still recorded as a series of tap events, but they're grouped so undo can remove the entire drag as a unit.

### No-Op Detection
- Performed client-side
- Uses the in-memory render state (which already knows every pixel's current color)
- A no-op produces zero side effects: no event, no animation, no toast
- This is correct behavior — the user expects "nothing happened" when they tap a pixel that's already their color

---

## Editable Radius

### Mechanics
- A soft circle is drawn around the mocked location at radius = 30 world pixels (300 ft)
- Inside the circle: pixels are tappable
- Outside the circle: pixels are visible but tap events are ignored
- The circle is rendered as a subtle outline + a faint glow on the canvas

### Mocked Location
- Default: Long Island City (mocked GPS coordinates)
- Override via URL param: `?location=astoria`, `?location=greenpoint`, etc.
- A small dev-only menu in the toolbar lets you switch locations mid-session for testing
- Locations available: LIC, Astoria, Greenpoint, Williamsburg, Bushwick, East Village, Midtown

### Visual Treatment
- The circle is *suggestive*, not a hard wall — pixels just outside it look the same as pixels inside, except dimmer and untappable
- When a user taps outside the circle, no feedback is given (silent failure, like the no-op)
- This matches the soft-radius principle from ARCHITECTURE.md

---

## The Drawing Toolbar

### Layout
A compact bar fixed to the bottom of the screen, visible only in "draw mode":
- 5 color swatches (the locked palette, simplified for Sprint 2)
- Undo button
- Mode exit button ("Done" or close icon)
- Budget counter ("142 pixels today" — visible but not enforced)

### Color Palette (Sprint 2 Subset)
Use 5 colors for now to keep the toolbar simple:
- Charcoal `#1a1a1a`
- Brick red `#b8362a`
- Mustard `#c89d3c`
- Navy `#1f3a5f`
- Sage green `#5a7a4f`

Full 8-color palette comes in a later sprint.

### Selected Color State
- Visible affordance for which color is selected (e.g., a ring around the swatch)
- Stored in component state, not localStorage (resets per session)
- Default selection on app open: charcoal

### Undo Button
- Disabled when there's nothing to undo
- On tap: removes the most recent event (or most recent group, if the last action was a drag)
- Updates localStorage and re-renders the affected pixel(s)
- Maintains a session-scoped undo stack (no persistent undo across reloads — for simplicity)

---

## Drawing Mode Entry & Exit

### Entry
- A "Doodle" button is visible on the city view (the Sprint 1 home state)
- Tapping it transitions the user into draw mode:
  - Camera smoothly zooms to the mocked location
  - The editable radius circle appears
  - The drawing toolbar fades in at the bottom
  - Pan/zoom navigation is restricted (you stay focused on the local area)

### Exit
- The "Done" button in the toolbar exits draw mode:
  - Camera smoothly zooms back out to the city view
  - The editable radius disappears
  - The toolbar slides away
  - Pan/zoom navigation is fully restored

### Dual-Mode UX Principle
- **Browse mode (default):** read-only, full pan/zoom of the entire city
- **Draw mode:** locked to the editable radius, drawing toolbar visible, taps create pixels

The Sprint 1 rendering work covers browse mode. Sprint 2 adds draw mode on top.

---

## Build Order (Strict)

Follow this order. Each step has a clear deliverable. Do not move to the next step until the current one is verifiably done.

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Define the `PixelEvent` type and create localStorage helper functions | 30 min | Type-safe read/write to `wall_events` key |
| 2 | Generate and persist a session UUID in localStorage | 15 min | Same session ID across reloads |
| 3 | Build the mocked location system + URL param override | 30 min | `?location=lic` works, default location is LIC |
| 4 | Add a "Doodle" button to the city view; build the camera zoom-to-location transition | 45 min | Smooth zoom from city view to local area |
| 5 | Render the editable radius circle on the canvas | 30 min | Soft circle visible at the right place |
| 6 | Build the drawing toolbar UI (5 colors, undo, done, budget counter) | 45 min | Toolbar appears in draw mode |
| 7 | Implement single-tap pixel placement with no-op detection | 60 min | Taps inside radius create pixels; same-color taps are silent |
| 8 | Implement tap-and-drag with group_id grouping | 45 min | Drag creates a continuous line of pixels with shared group_id |
| 9 | Implement undo (single tap or whole drag group) | 30 min | Undo removes last action, updates localStorage and canvas |
| 10 | Implement persistence — load events from localStorage on app start, replay into render state | 30 min | Reload preserves all pixels |
| 11 | Visual polish: selected color affordance, smooth transitions, mobile gesture refinement | 45 min | Feels finished, not janky |
| 12 | End-to-end testing on phone and laptop, fix any rough edges | 30 min | Sprint complete |

**Total estimated time: ~7.5 hours**

---

## What Counts as Success

The sprint succeeds if you can hand the laptop or phone to someone and they can:

1. See the city in browse mode (Sprint 1 view)
2. Tap "Doodle" and watch the camera fly into their area
3. Tap to place pixels in their chosen color
4. Drag a finger to draw a line of pixels
5. Switch colors and continue drawing in a new color
6. Undo a mistake
7. Tap "Done" to return to the city view
8. Reload the page and find their pixels still there
9. Tap "Doodle" again and continue adding to their work

If this loop feels satisfying — if the act of doodling makes them want to keep doing it — the sprint has answered its question: **yes, the creative core works.**

---

## What Counts as Failure

The sprint fails if any of these happen:

- Tapping a pixel feels laggy (delay between tap and visible result)
- Tap-and-drag feels jerky or unpredictable
- Pixels get placed in the wrong location (coordinate system bugs)
- Pixels disappear on reload (persistence bugs)
- The interaction feels frustrating rather than satisfying
- Mobile touch handling is significantly worse than desktop mouse

If any of these happen, **don't push through.** Stop and diagnose. The act of drawing has to feel good, or the rest of the product can't recover.

---

## What's Out of Scope

To stay focused, explicitly do NOT build in this sprint:

- Backend / Supabase wiring
- Real GPS / actual geolocation
- Daily budget enforcement (counter is visible but unlimited)
- Density-based rate adaptation
- Eraser tool
- Stroke-mode drawing (just tap and tap-and-drag)
- Decay / fade over time
- Multi-device sync
- User accounts or auth
- Notifications
- Special modes (Doodle Day, etc.)
- Voting, leaderboards, or any social features
- Moderation tools
- Analytics

Anything not in this document gets deferred. Write it down in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md and ARCHITECTURE.md before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **If you hit ambiguity, stop and ask.** Do not make product decisions silently.
- **If a step takes longer than its time budget, stop and tell me.** We'll decide together.
- **Do not add dependencies that aren't already in use.**

The goal is the validated creative core, not a polished feature. Optimize for "does it feel right" over "does it look perfect."

---

## After the Sprint

Once Sprint 2 is done:

1. **Use it for at least 30 minutes.** Doodle. Try things. Notice what feels off.
2. **Show it to one or two other people.** Watch where they get confused.
3. **Capture observations in a `RETROSPECTIVE-SPRINT-2.md`.** This becomes input to Sprint 3.

Likely candidates for Sprint 3:
- Wire up Supabase backend (replace localStorage with Postgres)
- Implement real GPS / geofencing
- Add daily budget enforcement
- Multi-device pixel sync via real-time subscriptions

But don't decide yet. The retrospective will reveal which one matters most.