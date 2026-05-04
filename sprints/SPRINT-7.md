# SPRINT-7.md — Smart Default Centering

This sprint replaces the current "full zoom out" default with intelligent centering that respects user context. Permission-granted users land at their actual location. Returning users land where they last were. Everyone else lands in a random NYC neighborhood that varies between sessions.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-6.md.

---

## The Goal

Three simple behaviors that combine into a coherent default-centering system:

1. **If permission is granted:** center on the user's actual location at neighborhood-level zoom. They land in their part of NYC.

2. **If returning user has a recent saved position (within 7 days):** restore their last position and zoom. They pick up where they left off.

3. **Otherwise (first-time visitor, denied permission, or last position is stale):** center on a random NYC neighborhood from a hardcoded list, at neighborhood-level zoom. Each visit picks a new neighborhood — variety is the point.

The current behavior — full zoom out by default — makes the wall feel empty and static. This sprint replaces it with something more intentional.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Centering Logic Requirements
- [ ] Permission granted users land centered on their actual location at neighborhood-level zoom
- [ ] Returning users with a saved position less than 7 days old land at that saved position with the saved zoom
- [ ] First-time users land at a random neighborhood from the hardcoded list at neighborhood-level zoom
- [ ] Users with denied/unsupported permission and no recent saved position also land at a random neighborhood
- [ ] Each random selection is independent — different visits pick different neighborhoods
- [ ] The previous "full zoom out" default behavior is removed

### Saved Position Requirements
- [ ] Map center (x, y) and zoom level are saved to localStorage whenever the user pans or zooms
- [ ] Saved position includes a timestamp
- [ ] Saved positions older than 7 days are ignored on subsequent visits
- [ ] Saved positions are NOT used when permission is granted (granted users always land at their actual location)
- [ ] localStorage writes are debounced/throttled so rapid panning doesn't write hundreds of times per second

### Hardcoded Neighborhood List Requirements
- [ ] At least 8 NYC neighborhoods are hardcoded with lat/lng coordinates and zoom level
- [ ] Selected via uniform random — no weighting by activity
- [ ] List is in a single file (probably `src/config/tuning.ts` or `src/data/neighborhoods.ts`)
- [ ] Each neighborhood has a name (for potential future use), lat, lng

### Permission State Transition Requirements
- [ ] When a user starts in browse mode (random neighborhood) and grants permission via the Doodle button, the camera smoothly transitions from the random neighborhood to their actual location
- [ ] Transition duration is approximately 1 second
- [ ] If `prefers-reduced-motion` is set, the camera snaps to the new position without animation

### Constraints
- [ ] Builds on top of Sprint 6's repo
- [ ] No changes to the welcome screen
- [ ] No changes to the drawing toolbar
- [ ] No changes to the Doodle button or toast logic from Sprint 6
- [ ] No backend schema changes
- [ ] Budget tracking remains in localStorage

---

## The Hardcoded Neighborhood List

Eight NYC neighborhoods covering the boroughs that have current testing activity, plus a few to add variety.

```typescript
// src/config/neighborhoods.ts

export const FALLBACK_NEIGHBORHOODS = [
  { name: 'Long Island City', lat: 40.7505, lng: -73.9408 },
  { name: 'Astoria', lat: 40.7644, lng: -73.9235 },
  { name: 'Greenpoint', lat: 40.7297, lng: -73.9540 },
  { name: 'Williamsburg', lat: 40.7081, lng: -73.9571 },
  { name: 'East Village', lat: 40.7265, lng: -73.9815 },
  { name: 'Lower East Side', lat: 40.7185, lng: -73.9870 },
  { name: 'Bushwick', lat: 40.6943, lng: -73.9213 },
  { name: 'Upper West Side', lat: 40.7870, lng: -73.9754 },
] as const

export function pickRandomNeighborhood(): typeof FALLBACK_NEIGHBORHOODS[number] {
  const index = Math.floor(Math.random() * FALLBACK_NEIGHBORHOODS.length)
  return FALLBACK_NEIGHBORHOODS[index]
}
```

The list is intentionally NYC-recognizable (no obscure neighborhoods) and skips Staten Island and most of the Bronx for now. These are the places where activity is most likely to develop.

The "neighborhood-level zoom" should be the same default zoom used elsewhere in the app for showing a neighborhood — close enough to feel like a place, far enough to see surrounding context.

---

## Step 1: Saved Position Persistence

The map needs to save its center and zoom whenever the user pans or zooms.

### Storage Format

```typescript
type SavedPosition = {
  centerX: number       // world pixel coordinate
  centerY: number       // world pixel coordinate
  zoom: number          // current zoom level
  savedAt: number       // timestamp (ms)
}
```

Stored in localStorage under the key `wall_last_position`.

### Save Logic

Whenever the user pans or zooms (i.e., the viewport changes), save the new position:

```typescript
function saveCurrentPosition(center: WorldCoord, zoom: number) {
  const position: SavedPosition = {
    centerX: center.x,
    centerY: center.y,
    zoom: zoom,
    savedAt: Date.now(),
  }
  localStorage.setItem('wall_last_position', JSON.stringify(position))
}
```

### Debouncing

Saving on every frame of pan/zoom is wasteful. Debounce so writes happen at most once per second:

```typescript
import { debounce } from 'lodash' // or implement inline if lodash isn't already a dep

const debouncedSave = debounce(saveCurrentPosition, 1000)
```

Use `debouncedSave` everywhere the viewport changes. The localStorage write happens only after the user has stopped moving for a second.

### Read Logic

```typescript
function getRecentSavedPosition(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): SavedPosition | null {
  const raw = localStorage.getItem('wall_last_position')
  if (!raw) return null
  
  try {
    const position: SavedPosition = JSON.parse(raw)
    
    // Check if it's stale
    if (Date.now() - position.savedAt > maxAgeMs) {
      return null
    }
    
    return position
  } catch {
    return null
  }
}
```

The 7-day threshold is the staleness cutoff. Older positions return null (and the app falls through to the random neighborhood).

---

## Step 2: Determine Initial Center Logic

The function that decides where the map starts on app load.

```typescript
async function determineInitialCenter(
  permission: LocationPermission
): Promise<{ center: WorldCoord; zoom: number; source: 'gps' | 'saved' | 'random' }> {
  // Branch 1: Permission granted — use actual location
  if (permission === 'granted') {
    const location = await captureLocationForSession()
    if (location) {
      const worldPos = latLngToWorld(location.lat, location.lng)
      return {
        center: worldPos,
        zoom: NEIGHBORHOOD_ZOOM,
        source: 'gps',
      }
    }
  }
  
  // Branch 2: Recent saved position
  const saved = getRecentSavedPosition()
  if (saved) {
    return {
      center: { x: saved.centerX, y: saved.centerY },
      zoom: saved.zoom,
      source: 'saved',
    }
  }
  
  // Branch 3: Random neighborhood
  const neighborhood = pickRandomNeighborhood()
  const worldPos = latLngToWorld(neighborhood.lat, neighborhood.lng)
  return {
    center: worldPos,
    zoom: NEIGHBORHOOD_ZOOM,
    source: 'random',
  }
}
```

### The `source` Return Value

I'm returning a `source` field for debuggability. During development you can check what path the app took without adding logging. Could remove for production if you prefer.

### The `NEIGHBORHOOD_ZOOM` Constant

Add to the tuning config:

```typescript
// src/config/tuning.ts (extend existing)
export const TUNING = {
  // ... existing config ...
  rendering: {
    pixelSizeFeet: 10,
    tileSize: 256,
    neighborhoodZoom: 14,    // adjust based on what looks right
  },
}
```

The exact zoom value should match what the app already considers "neighborhood-level." Look at how draw mode currently zooms when entered — that's the right starting value.

---

## Step 3: Wire Into App Initialization

Currently the app probably initializes the map at full zoom out (or some hardcoded center). Replace that with the new logic.

### Find Where The Map Is Initialized

Likely in `App.tsx` or a top-level component. Look for the initial state of the map's center and zoom.

### Replace With

```tsx
function App() {
  const permission = usePermissionState()
  const [initialCenter, setInitialCenter] = useState<WorldCoord | null>(null)
  const [initialZoom, setInitialZoom] = useState<number | null>(null)
  
  useEffect(() => {
    determineInitialCenter(permission).then(result => {
      setInitialCenter(result.center)
      setInitialZoom(result.zoom)
    })
  }, [permission])
  
  if (!initialCenter || !initialZoom) {
    // Loading state — could be a brief blank screen or a logo
    return <LoadingScreen />
  }
  
  return (
    <Map
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      // ... other props
    />
  )
}
```

### Loading State Consideration

The `determineInitialCenter` function may take ~100-500ms (especially the GPS path). During that time, the app shouldn't render the map at the wrong center then jump.

Options:
- **Option A:** Show a brief blank/branded screen while waiting (cleaner)
- **Option B:** Render the map at a default position, then snap to the determined center (jumpy)
- **Option C:** Pre-compute a reasonable guess immediately (e.g., from saved position or first hardcoded neighborhood) and refine if GPS resolves

My vote: **Option C** for the best UX:
- Synchronously check for saved position — if found, render immediately
- Synchronously check for hardcoded neighborhoods — if no saved position, pick one immediately and render
- Asynchronously wait for GPS if permission is granted — when it resolves, smoothly transition the camera

This means the app renders without delay in the common case, and only does the smooth transition for the rarer case where permission is granted but GPS hasn't resolved yet.

---

## Step 4: Permission Grant Smooth Transition

When the user starts in browse mode (random neighborhood or saved position) and then grants permission via the Doodle button, the camera should smoothly transition to their actual location.

### Trigger Point

In the Doodle button's `handleClick` (from Sprint 6), there's a path where permission resolves to granted. After that, the user enters draw mode. Currently the app probably just snaps the camera to their location.

Replace that snap with a smooth transition:

```typescript
async function handleDoodleClick() {
  if (permission === 'granted') {
    enterDrawMode()
    return
  }
  
  if (permission === 'prompt') {
    const location = await captureLocationForSession()
    if (location) {
      // Smooth transition before entering draw mode
      const targetWorldPos = latLngToWorld(location.lat, location.lng)
      await smoothPanZoomTo(targetWorldPos, NEIGHBORHOOD_ZOOM, 1000)
      enterDrawMode()
    } else {
      showToast()
    }
    return
  }
  
  // ... rest of the logic
}
```

### Smooth Pan/Zoom Implementation

The `smoothPanZoomTo` function animates the map's center and zoom over the given duration.

```typescript
async function smoothPanZoomTo(
  targetCenter: WorldCoord,
  targetZoom: number,
  durationMs: number
): Promise<void> {
  if (prefersReducedMotion()) {
    setMapCenter(targetCenter)
    setMapZoom(targetZoom)
    return
  }
  
  const startCenter = getCurrentMapCenter()
  const startZoom = getCurrentMapZoom()
  const startTime = performance.now()
  
  return new Promise(resolve => {
    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = easeInOutCubic(progress)
      
      const interpolatedCenter = {
        x: startCenter.x + (targetCenter.x - startCenter.x) * eased,
        y: startCenter.y + (targetCenter.y - startCenter.y) * eased,
      }
      const interpolatedZoom = startZoom + (targetZoom - startZoom) * eased
      
      setMapCenter(interpolatedCenter)
      setMapZoom(interpolatedZoom)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        resolve()
      }
    }
    
    requestAnimationFrame(animate)
  })
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}
```

### Reduced Motion

The function checks `prefersReducedMotion()` at the top and snaps to the final state if set. This respects accessibility preferences without skipping the actual position change.

### Why ~1 Second

Long enough to feel deliberate (not jarring). Short enough that users don't get impatient. Standard duration for "navigate to a new location" transitions in mapping apps.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Create `src/config/neighborhoods.ts` with the hardcoded list and `pickRandomNeighborhood` function | 15 min | Random neighborhood selection works in isolation |
| 2 | Add `neighborhoodZoom` to `TUNING.rendering` config | 5 min | Constant available for use |
| 3 | Build saved position read/write functions with debouncing | 30 min | localStorage saves on pan/zoom, reads on app load |
| 4 | Wire saved-position writes into the map's pan/zoom event handlers | 30 min | Pan/zoom triggers debounced save |
| 5 | Build `determineInitialCenter` function with three branches (granted, saved, random) | 30 min | Function returns correct result for each case |
| 6 | Replace existing app initialization with the new centering logic | 45 min | App centers correctly on load |
| 7 | Implement loading-state strategy (synchronous fallback + async GPS refinement) | 30 min | App renders without delay; smooth transition if GPS resolves later |
| 8 | Build `smoothPanZoomTo` animation function with reduced-motion fallback | 45 min | Camera animates between positions |
| 9 | Wire smooth transition into Doodle button's permission-granted path | 20 min | Granting permission while in browse mode animates camera to user's location |
| 10 | Test all four scenarios: granted, returning recent, returning stale, first-time | 30 min | All branches verified |
| 11 | Mobile test: re-deploy to Vercel and verify on phone | 30 min | Works on mobile |
| 12 | Document any non-blocking issues in BACKLOG.md | 10 min | Sprint complete |

**Total estimated time: ~5 hours**

---

## Testing Checklist

### Scenario 1: First-Time Visitor (Permission Prompt)
- Clear localStorage and browser permissions for the site
- Open the app
- Should land at a random neighborhood from the hardcoded list
- Refresh the page (without panning) — should land at a *different* random neighborhood (or the same one if random luck)
- ✅ Pass: random neighborhood, varies between visits

### Scenario 2: Permission Granted, First Time
- Open app, tap Doodle, grant permission
- Camera should smoothly transition to user's actual location
- After entering draw mode, position is the user's actual location
- ✅ Pass: smooth transition, ends at correct location

### Scenario 3: Returning User With Recent Position
- Pan to a specific area (e.g., Williamsburg)
- Wait 2+ seconds (let debounced save fire)
- Refresh the page
- Should land back at Williamsburg with the same zoom
- ✅ Pass: position restored

### Scenario 4: Returning User With Stale Position
- Manually edit localStorage to set `wall_last_position` with a `savedAt` timestamp 8 days ago
- Refresh the page
- Should land at a random neighborhood (not the stale position)
- ✅ Pass: stale position ignored

### Scenario 5: Permission Granted, Returning User
- Have a saved position in localStorage (e.g., Williamsburg)
- Permission is granted
- Open the app
- Should land at user's actual location, NOT at Williamsburg
- ✅ Pass: granted permission overrides saved position

### Scenario 6: Mid-Session Permission Grant
- Open app, see random neighborhood
- Tap Doodle (permission state is `prompt`)
- Browser dialog appears, click Allow
- Camera smoothly transitions from random neighborhood to user's location
- ✅ Pass: smooth animation, no jarring jump

### Scenario 7: Reduced Motion
- Set `prefers-reduced-motion: reduce` in browser/OS settings
- Trigger a permission grant transition (Scenario 6)
- Camera should snap immediately, not animate
- ✅ Pass: animation skipped

### Scenario 8: Rapid Pan/Zoom
- Pan and zoom continuously for 5+ seconds
- Stop
- Wait 2 seconds
- Check localStorage for `wall_last_position`
- Should reflect the final position, not an intermediate one (debouncing working)
- ✅ Pass: single localStorage entry with final position

---

## What Counts as Success

The sprint succeeds when:

1. The "full zoom out" default is gone
2. Permission-granted users always land at their location
3. Returning users with recent activity land where they were
4. First-time and stale users land at varied random neighborhoods
5. Mid-session permission grants animate smoothly
6. localStorage saves are debounced (no spam writes)
7. All test scenarios pass on both desktop and mobile
8. Sprint 6 functionality (banner removed, Doodle button, toast, permission listener) still works

---

## What Counts as Failure

- Any user lands at full zoom out
- Saved position restoration breaks for permission-granted users (they should always go to GPS, not saved)
- Random neighborhoods don't actually vary between visits (stuck on one)
- Mid-session permission grants snap jarringly instead of animating
- localStorage writes happen on every pan event (no debouncing)
- Stale positions are restored when they should be ignored
- Sprint 6 functionality is broken by these changes

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- The welcome screen or onboarding flow
- The Doodle button's core logic (Sprint 6)
- The toast component (Sprint 6)
- Permission state management (Sprint 6)
- The drawing toolbar
- The map's rendering pipeline (just its initial center)
- Any animation other than the permission-grant transition
- Activity-weighted neighborhood selection (we're using uniform random)
- Server-side anything

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, and SPRINT-1 through SPRINT-6 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **This sprint is small by design.** If you find yourself touching the welcome screen, the Doodle button, the toast, the drawing toolbar, or anything from Sprint 6, STOP — that's out of scope.
- **The debouncing in Step 3 is easy to get wrong.** Verify the saved position only writes once after pan/zoom stops, not on every frame.
- **The smooth transition in Step 8 should respect reduced motion.** Don't ship without testing this.
- **Use Opus, not Sonnet,** for this sprint.
- **Stay in plan mode for the full plan review before executing.** Walk through every step.
- **If you hit ambiguity, stop and ask.** Don't make UX decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is small, contained improvements to the default centering behavior. Optimize for "no regressions" over "this is clever."

---

## After the Sprint

Once Sprint 7 ships:

1. **Verify on phone.** Walk through each test scenario.
2. **Confirm no regressions.** Sprint 6 functionality still works.
3. **Use it for a few days.** Notice if random neighborhoods feel right, if saved positions are useful, if the transition feels natural.
4. **Tell me Sprint 7 is done.** I'll generate Sprint 8 (welcome flow improvements).

The remaining sprints in this batch:
- **Sprint 8:** Welcome flow improvements — smaller scope than the previous attempt, no architectural changes

Then Sprint 9+ for prompts, modes, and beyond.