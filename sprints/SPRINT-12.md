# SPRINT-12.md — Drawing Experience v2

This sprint reshapes the drawing experience based on real-use observations. It bundles several related changes into a single coherent v2 of how drawing works on The Wall.

The changes:
1. **Database migration** from palette indices to hex storage (unlocks future palette flexibility)
2. **New 10-color palette** with broader expressive range
3. **Tap-only drawing** — single-finger drag no longer draws pixels (eliminates accidental brush)
4. **Simplified gesture model** — single-finger drag pans, two-finger drag pans, taps draw
5. **Lower pixel cap** — from 300 to 256
6. **Two-row toolbar layout** — color swatches in 5×2 grid

These changes ship together because they're all about cleaning up the drawing experience and the user's relationship to colors and contributions.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-11.md.

---

## The Goal

The drawing experience after Sprint 12 should feel:
- **More deliberate** — each tap is a decision; no accidental brushstrokes
- **More expressive** — 10 colors instead of effective 5 currently visible
- **More navigable** — pan with one finger or two; no gesture conflicts
- **More architecturally clean** — palette can change without affecting historical data

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Database Migration
- [ ] `pixel_events.color` schema is changed from `CHAR(1)` (palette index) to `CHAR(7)` (hex string)
- [ ] All existing pixel data is truncated (test data, no preservation needed)
- [ ] `tiles` table is also truncated (regenerates as users draw)
- [ ] All client code reads/writes hex strings, no palette-index references remain
- [ ] Indexes still work for the queries the polling system uses

### New Palette
- [ ] The 10-color palette is defined as a constant in `tuning.ts`:
  ```
  #1a1a1a  Black
  #f0ebe0  Off-white
  #e63946  Red
  #f4a261  Orange
  #f4c430  Yellow
  #5db075  Green
  #3d8eb9  Blue
  #f06292  Pink
  #9575cd  Purple
  #8b5a3c  Brown
  ```
- [ ] All 10 colors are user-selectable
- [ ] No palette-index conversion code exists anywhere in the codebase

### Tap-Only Drawing
- [ ] Single-finger tap places one pixel (existing behavior)
- [ ] Single-finger drag does NOT place pixels along the drag path
- [ ] Single-finger drag pans the map (in both browse and draw modes)
- [ ] Two-finger drag pans the map (existing from Sprint 9, still works)
- [ ] Pinch-to-zoom continues to work
- [ ] The 50ms detection window from Sprint 9 is removed (no longer needed)

### Tap vs. Drag Detection
- [ ] A touch is classified as a tap if it moves less than ~10 pixels before release
- [ ] A touch is classified as a drag if it moves more than ~10 pixels
- [ ] The threshold value is in `tuning.ts` for easy adjustment
- [ ] Taps reliably place pixels on intent
- [ ] Drags reliably pan without placing pixels

### Pixel Cap Change
- [ ] `TUNING.budget.cap` is changed from 300 to 256
- [ ] `TUNING.budget.initialBudget` is changed from 300 to 256
- [ ] `TUNING.budget.regenPerHour` stays at 60
- [ ] Existing localStorage budget state caps at 256 on next read (any saved state above 256 is reduced)

### Toolbar Layout
- [ ] The drawing toolbar shows two rows below the prompt:
  - Row 1 (above): the prompt (existing)
  - Row 2 (below): 5×2 grid of color swatches on the left, budget number + Done button on the right
- [ ] Color swatches are circular, ~26px diameter
- [ ] Selected color shows visual selection indicator (focus ring or similar)
- [ ] Budget displays as a number (e.g., "256 px") — no "pixels" word
- [ ] Done button is filled-style (dark background, light text), distinct from selectable elements
- [ ] Long prompts truncate with ellipsis if they would overflow

### Schema Cleanup (Optional)
- [ ] `pixel_events.group_id` and `group_seq` fields are kept in the schema (no longer used, but harmless)
- [ ] `pixel_events.input_mode` field is kept (always `'t'` now)

### Constraints
- [ ] Builds on top of Sprint 11's repo
- [ ] No changes to prompt system, polling, or other unrelated systems
- [ ] No backend API changes beyond the schema migration
- [ ] All Sprint 1-11 functionality continues to work

---

## Step 1: Database Migration

The first and most critical change. All other changes depend on the database being in the right state.

### Truncate Existing Data

```sql
-- Run in Supabase SQL editor
TRUNCATE TABLE pixel_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE tiles;
```

This clears all pixel events and the tile cache. The `RESTART IDENTITY` resets the BIGSERIAL counter so new pixels start at id=1.

### Migrate The Schema

```sql
-- Change color column from CHAR(1) to CHAR(7)
ALTER TABLE pixel_events 
  ALTER COLUMN color TYPE CHAR(7);

-- Verify the change worked
SELECT column_name, data_type, character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'pixel_events' AND column_name = 'color';
-- Should show: color | character | 7
```

### Verify RLS Policies Still Work

The existing policies don't reference the `color` column, so they should be unaffected. Verify by trying a test insert and select.

---

## Step 2: Update The Tuning Config

Replace the palette and budget values in `src/config/tuning.ts`:

```typescript
// src/config/tuning.ts

export const TUNING = {
  // ... existing config (prompts, polling, radius, etc.) ...
  
  budget: {
    cap: 256,                       // changed from 300
    regenPerHour: 60,               // unchanged
    initialBudget: 256,             // changed from 300
  },
  
  // Tap vs drag detection
  gesture: {
    tapMaxMovementPx: 10,           // touch moves < 10px = tap, more = drag
  },
  
  // ... existing cooldown, prompts, etc. unchanged ...
}

// Palette is its own export for clarity
export const PALETTE = [
  '#1a1a1a', // Black
  '#f0ebe0', // Off-white
  '#e63946', // Red
  '#f4a261', // Orange
  '#f4c430', // Yellow
  '#5db075', // Green
  '#3d8eb9', // Blue
  '#f06292', // Pink
  '#9575cd', // Purple
  '#8b5a3c', // Brown
] as const

export type PaletteColor = typeof PALETTE[number]
```

The palette is no longer ordered by anything that affects storage — it's just the order users see them in the toolbar. Reordering is now safe.

### Remove Old Palette References

Search for and remove:
- Any function that converts palette index to hex (e.g., `paletteIndexToColor(index)`)
- Any function that converts hex to palette index
- Any references to `'0'`, `'1'`, etc. as color values
- The old palette array if it lived elsewhere

The new model: hex strings flow through the entire pipeline. No translation anywhere.

---

## Step 3: Update Pixel Write Code

Find the `placePixel` function (or equivalent) and update it to write hex directly.

```typescript
// src/lib/pixels.ts

export async function placePixel(
  x: number,
  y: number,
  color: string,  // now expects hex string like '#e63946'
  sessionId: string,
  groupId?: string,
  groupSeq?: number
): Promise<{ success: boolean }> {
  
  const { error } = await supabase.from('pixel_events').insert({
    x,
    y,
    color,  // hex string written directly
    session_id: sessionId,
    group_id: groupId ?? null,
    group_seq: groupSeq ?? null,
    input_mode: 't',
  })
  
  if (error) {
    console.error('Failed to place pixel:', error)
    return { success: false }
  }
  
  return { success: true }
}
```

No conversion. The hex string from the active color goes straight to the database.

---

## Step 4: Update Pixel Read Code

The polling and event handler code from Sprint 11 needs to expect hex strings instead of palette indices.

```typescript
// src/lib/eventHandler.ts (updated)

export interface PixelEvent {
  id: number
  x: number
  y: number
  color: string  // now expects hex like '#e63946'
  session_id: string
  placed_at: string
  // ... other fields
}

export function applyIncomingEvents(events: PixelEvent[]) {
  for (const event of events) {
    if (seenEventIds.has(event.id)) continue
    seenEventIds.add(event.id)
    
    // Apply hex color directly to render state
    renderState.setPixel(event.x, event.y, event.color)
    
    if (lastSeenEventId === null || event.id > lastSeenEventId) {
      lastSeenEventId = event.id
      lastSeenTimestamp = event.placed_at
    }
  }
}
```

The render state's `setPixel` should also expect hex strings. If it currently expects palette indices, update it to use hex throughout.

---

## Step 5: Update Tile Rendering

The tile rendering code probably converts palette indices to hex for actual canvas drawing. With hex storage, this conversion goes away.

### Tile Cache Structure

The `tiles.pixels` BYTEA column previously stored 1 byte per pixel (palette index 0-7). With hex storage, the tile cache structure needs to change.

Options:

**A. Store hex strings as a JSON array.** `pixels` becomes `JSONB` with an array of hex strings. Larger but flexible.

**B. Store as RGB bytes.** Each pixel is 3 bytes (R, G, B). Tile size is 256 × 256 × 3 = 196KB per tile. Decent compromise.

**C. Don't cache tiles at all for now.** Skip the tile optimization until performance demands it. Render directly from `pixel_events` queries.

For Sprint 12, the simplest approach is **C — don't worry about tile cache yet**. We just truncated the tiles table. Let it stay empty. The polling system reads from `pixel_events` directly, which is fine at MVP scale.

If tile cache needs to be revived later, that's a separate sprint with a clear performance signal.

### Action Item

Find any code that interacts with the `tiles` table. Either:
- Comment it out / disable it
- Or refactor to store hex (Option A or B above)

For Sprint 12 scope, **disabling tile cache is the right call.** It's an optimization that doesn't matter yet.

---

## Step 6: Tap-Only Drawing — Refactor Touch Handler

This is the biggest behavioral change. The Sprint 9 touch state machine needs to change.

### Sprint 9 State Machine

```
idle → pending (50ms) → drawing | panning | pinching
```

The `pending` state existed to disambiguate single-finger draw from two-finger pan.

### New State Machine

```
idle → tap-or-drag-pending → tap-completed | dragging | pinching
```

The disambiguation is now based on *movement*, not *time*:
- Touch starts → enter `tap-or-drag-pending`
- If movement exceeds threshold → become `dragging` (which pans)
- If touch ends without exceeding threshold → it was a tap, place pixel
- If second finger arrives → become `pinching` or `dragging` (depending on whether distance is changing)

### Implementation

```typescript
// src/lib/touchHandler.ts

import { TUNING } from '@/config/tuning'

type TouchState = 
  | { kind: 'idle' }
  | { kind: 'tap-or-drag-pending'; startX: number; startY: number; touchId: number }
  | { kind: 'dragging'; lastX: number; lastY: number }
  | { kind: 'pinching'; initialDistance: number; initialZoom: number }

let touchState: TouchState = { kind: 'idle' }

export function handleTouchStart(event: TouchEvent) {
  if (event.touches.length === 1) {
    const touch = event.touches[0]
    touchState = {
      kind: 'tap-or-drag-pending',
      startX: touch.clientX,
      startY: touch.clientY,
      touchId: touch.identifier,
    }
  } else if (event.touches.length === 2) {
    // Two fingers — definitely not a draw
    const distance = touchDistance(event.touches[0], event.touches[1])
    touchState = {
      kind: 'pinching',
      initialDistance: distance,
      initialZoom: getCurrentZoom(),
    }
  }
}

export function handleTouchMove(event: TouchEvent) {
  if (touchState.kind === 'tap-or-drag-pending' && event.touches.length === 1) {
    const touch = event.touches[0]
    const dx = touch.clientX - touchState.startX
    const dy = touch.clientY - touchState.startY
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance > TUNING.gesture.tapMaxMovementPx) {
      // Movement exceeded threshold — convert to drag
      touchState = {
        kind: 'dragging',
        lastX: touch.clientX,
        lastY: touch.clientY,
      }
    }
    // Otherwise, still pending — wait to see what happens
  }
  
  if (touchState.kind === 'dragging' && event.touches.length === 1) {
    const touch = event.touches[0]
    const dx = touch.clientX - touchState.lastX
    const dy = touch.clientY - touchState.lastY
    
    panMapBy(dx, dy)
    
    touchState.lastX = touch.clientX
    touchState.lastY = touch.clientY
  }
  
  if (touchState.kind === 'pinching' && event.touches.length === 2) {
    const distance = touchDistance(event.touches[0], event.touches[1])
    const zoomFactor = distance / touchState.initialDistance
    setZoom(touchState.initialZoom * zoomFactor)
    
    // Pinch can also pan via center movement (handled together)
    // ... existing pinch logic
  }
}

export function handleTouchEnd(event: TouchEvent) {
  if (touchState.kind === 'tap-or-drag-pending') {
    // Touch ended without exceeding movement threshold — it was a tap
    if (appMode === 'draw') {
      placePixelAtScreenPosition(touchState.startX, touchState.startY)
    }
  }
  // dragging and pinching just end naturally — no special handling needed
  
  touchState = { kind: 'idle' }
}
```

### Key Differences From Sprint 9

- No 50ms timer — instant tap/drag classification based on movement
- Single-finger drag pans (instead of drawing)
- Two-finger drag is still pinching/panning (unchanged)
- Tap places one pixel (no drag-to-line)

### Browse Mode Behavior

In browse mode (`appMode === 'browse'`):
- Single-finger tap: does nothing (no draw mode)
- Single-finger drag: pans (existing behavior)
- Two-finger drag/pinch: pans/zooms (existing behavior)

Same logic applies — the only difference is taps don't place pixels in browse mode.

---

## Step 7: Toolbar Layout

The drawing toolbar gets a new structure:

### Current Layout (Reference)
```
┌────────────────────────────────────┐
│  Draw a sound you can hear right.. │  prompt
├────────────────────────────────────┤
│  ●○○○○                  299 px [Done]│  5 colors + budget + done
└────────────────────────────────────┘
```

### New Layout
```
┌────────────────────────────────────┐
│  Draw a sound you can hear right.. │  prompt
├────────────────────────────────────┤
│  ●●●●●                              │
│  ●●●●●                  256 px [Done]│  5×2 colors + budget + done
└────────────────────────────────────┘
```

### Layout Specifications

**Prompt section (top):**
- Same as current
- Serif italic font, centered or left-aligned
- Truncates with ellipsis if too long
- ~36px tall

**Color section (bottom):**
- Container is a flex layout: color grid on the left, budget+Done on the right
- Color grid: 5 columns × 2 rows, ~26px circular swatches, ~5px gap between
- Budget number: small text, ~13px, plain "256 px" format
- Done button: filled style (dark background, light text), ~36px tall

### Color Grid Order

```
Row 1: black     off-white  red      orange   yellow
Row 2: green     blue       pink     purple   brown
```

This puts the foundation tones (black, off-white) at the top-left, with the chromatic spectrum flowing through the rest. Logical reading order.

### Selected Color Indicator

When a color is selected, show a focus ring around the swatch:
- A small gap (~2px) between the swatch and the ring
- A ring color that contrasts with both the swatch and the cream background
- For most colors, a black ring works
- For black itself, the ring should be different — maybe an inset light ring, or a different accent

### Touch Targets

26px circular swatches are below the 44pt touch target guideline. Mitigation:
- Each swatch's invisible tap area extends ~7-8px beyond the visible bounds
- The grid layout uses 5px gaps which gives some natural spacing
- Tested on mobile to verify accuracy

---

## Step 8: Update Color Selection State

The active color in the drawing UI is currently a hex string in component state. This stays the same — but the *initial* color and the *available* colors come from the new palette.

```typescript
// In the drawing toolbar component
import { PALETTE } from '@/config/tuning'

const [activeColor, setActiveColor] = useState<string>(PALETTE[0]) // start with black

// Color picker maps over PALETTE, renders a swatch for each
// Tap on a swatch sets activeColor to that hex
```

The active color becomes the `color` parameter in `placePixel` calls. Hex flows through directly.

---

## Step 9: Migrate Existing Budget State

If a user has existing budget state in localStorage saying "amount: 300, lastUpdated: ..." then opens the app after deploy, the budget should cap at 256 immediately.

This happens naturally because the `getCurrentBudget` function uses `Math.min(amount + regenerated, TUNING.budget.cap)`. As soon as `cap` becomes 256, the next read returns at most 256.

**No explicit migration needed for localStorage.** The cap clamps automatically on next read.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Run database migration: truncate pixel_events and tiles, alter color column to CHAR(7) | 30 min | Database schema is migrated |
| 2 | Update tuning.ts with new PALETTE array, new budget values, gesture threshold | 20 min | Config has new values |
| 3 | Find and remove all palette-index conversion code | 45 min | Codebase has no index references |
| 4 | Update pixel write code (placePixel) to write hex directly | 20 min | New writes use hex |
| 5 | Update pixel read code (event handler, polling) to handle hex strings | 30 min | Reads work with hex |
| 6 | Disable tile cache code (don't write to tiles table for now) | 30 min | Tile cache disabled cleanly |
| 7 | Refactor touch handler to new state machine (tap-or-drag based on movement) | 90 min | Tap-only drawing works |
| 8 | Test gesture model: tap places pixel, drag pans, pinch zooms | 30 min | Gestures work correctly |
| 9 | Update toolbar layout to 5×2 color grid + budget + Done | 60 min | New layout renders correctly |
| 10 | Test selected color indicator across all 10 colors | 20 min | Selection is visible for every color |
| 11 | Verify budget caps at 256 (test with localStorage state >256) | 15 min | Cap behavior correct |
| 12 | Mobile re-deploy to Vercel and verify on phone | 30 min | Works on mobile |
| 13 | End-to-end test: enter draw mode, place pixels in each color, exit, verify persistence | 30 min | Full flow works |
| 14 | Document any non-blocking issues in BACKLOG.md | 10 min | Sprint complete |

**Total estimated time: ~7 hours**

---

## Testing Checklist

### Database Migration
- [ ] Schema shows `color` as `CHAR(7)`
- [ ] No existing pixels remain (table is empty)
- [ ] No existing tiles remain
- [ ] New inserts work with hex values
- [ ] Reads return hex values
- [ ] ✅ Pass: migration is clean

### New Palette
- [ ] All 10 colors appear in the toolbar
- [ ] Each color is selectable
- [ ] Selected color displays a clear visual indicator
- [ ] Active color flows correctly to placed pixels
- [ ] Pixels render in their actual hex colors
- [ ] ✅ Pass: palette works end-to-end

### Tap-Only Drawing
- [ ] Single tap places one pixel — no drag line
- [ ] Slow single-finger drag pans the map smoothly
- [ ] Fast single-finger drag pans the map (doesn't accidentally place pixels)
- [ ] Two-finger drag pans
- [ ] Pinch zooms
- [ ] Two-finger drag + pinch simultaneously = pan + zoom (combined gesture)
- [ ] ✅ Pass: gestures are clean

### Tap vs Drag Threshold
- [ ] A touch that moves <10px is treated as a tap
- [ ] A touch that moves >10px is treated as a drag
- [ ] Threshold tuning value is in tuning.ts
- [ ] On accidental small movements (e.g., a slightly unsteady tap), the tap still registers
- [ ] On deliberate slow drags, the pan starts after exceeding threshold
- [ ] ✅ Pass: classification feels natural

### Pixel Cap
- [ ] Budget displays "256 px" (or current value)
- [ ] After placing pixels, budget decrements
- [ ] Budget regenerates at 60/hour (1/min)
- [ ] Cap holds at 256 — no over-accumulation
- [ ] Pre-existing localStorage state >256 caps at 256 on next read
- [ ] ✅ Pass: budget behavior correct

### Toolbar Layout
- [ ] 5×2 grid of circular color swatches displays correctly
- [ ] Budget number and Done button sit to the right of the grid
- [ ] Layout works on mobile portrait (verify on real phone)
- [ ] Layout works on mobile landscape
- [ ] Layout works on desktop
- [ ] Selected color indicator is visible for every color
- [ ] Touch targets are accurate (test rapid color switching)
- [ ] ✅ Pass: toolbar feels good

### No Regressions
- [ ] Welcome flow still works
- [ ] Smart default centering still works
- [ ] Daily prompts still appear
- [ ] Adaptive polling still works (Sprint 11)
- [ ] Mode entry/exit transitions work
- [ ] ✅ Pass: no Sprint 1-11 functionality broken

### Mobile-Specific
- [ ] All gestures work cleanly on iOS Safari
- [ ] All gestures work cleanly on Android Chrome
- [ ] Touch targets are accurate one-handed
- [ ] Toolbar doesn't obscure too much canvas
- [ ] ✅ Pass: mobile experience holds up

---

## What Counts as Success

The sprint succeeds when:

1. The database migration is clean — no palette-index references anywhere
2. All 10 colors are usable and visually distinct on the wall
3. Tap-only drawing eliminates accidental brushstrokes
4. Single-finger pan works smoothly in both browse and draw modes
5. The new toolbar layout fits comfortably on mobile
6. The budget cap of 256 feels appropriate (not too tight, not too loose)
7. No regressions in any prior sprint's functionality

---

## What Counts as Failure

- Pixels are still stored as palette indices anywhere
- The old palette colors render alongside the new palette (mixed state)
- Tap accidentally creates pixels during pan attempts
- Drag accidentally pans when user wanted to tap
- Touch targets are too small to use comfortably
- The toolbar doesn't fit on smaller mobile screens
- Existing functionality breaks
- The new gesture model causes pinch-zoom to malfunction

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- Tile cache rebuild (deferred — disabled for now)
- WebSocket migration (Sprint 12 was originally planned but pushed back; let polling stay)
- Welcome flow changes
- New prompts or prompt logic
- Mode infrastructure
- Personal history view
- Account system
- Server-side budget enforcement
- Any UI changes outside the drawing toolbar

If something feels missing, write it in `BACKLOG.md` and move on.

---

## A Note On The Tile Cache

The tiles table is being disabled in this sprint, not deleted. The schema stays in place; the code that writes to it stops being called. The reasons:

1. **At MVP scale, tile cache isn't needed.** Polling pulls events directly from `pixel_events` and the rendering pipeline can handle that volume.
2. **Reviving tile cache is a future optimization.** When write volume becomes a perceptible bottleneck, a future sprint can decide on the right tile storage format (hex JSON, RGB bytes, palette snapshots, etc.).
3. **Disabling now keeps the migration simpler.** No need to design the new tile format alongside everything else.

This is a deliberate deferral. Note it in ARCHITECTURE.md when updating after the sprint.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, ROADMAP.md, and SPRINT-1 through SPRINT-11 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **The database migration (Step 1) is the foundation.** Every other step depends on it. Get this right first.
- **The touch handler refactor (Step 7) is the most complex piece.** Test thoroughly. Tap and drag detection is easy to get subtly wrong.
- **Use Opus, not Sonnet, for this sprint.** This sprint touches database, drawing logic, and UI — high cohesion required.
- **Test on a real phone, not just desktop.** Touch behavior is the most important thing to verify, and emulators don't catch everything.
- **The threshold of 10px for tap-vs-drag** is a starting value. If real testing shows it feels off, tune via `TUNING.gesture.tapMaxMovementPx`. Smaller threshold = more sensitive (small movements become drags); larger = more forgiving (allows slightly unsteady taps).
- **If you hit ambiguity, stop and ask.** Don't make UX or architectural decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is a cleaner v2 of the drawing experience. Optimize for "every interaction is intentional" over "this is clever."

---

## After the Sprint

Once Sprint 12 ships:

1. **Use it for a few days.** Notice if tap-only drawing feels right or limiting.
2. **Notice the new palette.** Are there colors you never use? Colors that feel missing?
3. **Verify cross-device.** Open on phone and laptop, draw, observe.
4. **Update ARCHITECTURE.md** to reflect: hex storage in `pixel_events`, tile cache disabled, new palette, tap-only drawing model.
5. **Tell me Sprint 12 is done.** I'll generate Sprint 13 if there's a clear next priority.

The product after Sprint 12 is genuinely v2 of the drawing experience. Major future sprints become more reactive to real usage rather than predetermined.