# SPRINT-9.md — Interaction Fixes

This sprint addresses several interaction issues surfaced from real use: the toast position is vague, the zoom-out behavior at limits is buggy, and draw mode is unusable at high zoom on mobile because there's no way to pan without drawing. The prompt placement is already working and stays as is.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-8.md.

---

## The Goal

Four contained interaction fixes:

1. **Toast placement.** The toast that appears when the user taps Doodle without permission needs a specific position with breathing room.

2. **Zoom-past-limit bug.** When the user reaches the maximum zoom level (in or out) and continues scrolling, the camera shifts toward the cursor even though zoom isn't changing. The camera should stay still.

3. **Two-finger pan in draw mode.** On mobile, single-finger drag draws pixels. There's currently no way to pan around the drawing radius. Add two-finger pan as the navigation gesture, leaving single-finger drag for drawing.

4. **Zoom-out cap in draw mode.** Cap the zoom-out level so the user can't see (much) more than their editable radius. Pan is disabled at the cap and clamped to the radius when zoomed in.

The prompt placement (above the drawing toolbar in draw mode) is already working and stays as is.

---

## What's Changing

### Toast Position
- **Before:** Vague placement — "above the Doodle button or similar non-blocking position"
- **After:** Specific placement directly above the Doodle button with 12-16px breathing room

### Zoom Limit Behavior
- **Before:** Scrolling past zoom limits causes the camera to shift toward the cursor
- **After:** When zoom doesn't actually change (because of the cap), no pan adjustment happens

### Pan in Draw Mode
- **Before:** No way to pan within the drawing radius — single-finger drag always draws
- **After:** Single-finger drag draws; two-finger drag pans

### Zoom-Out Cap in Draw Mode
- **Before:** User can zoom out arbitrarily far in draw mode, seeing areas they can't draw on
- **After:** Zoom-out is capped so the editable radius (with margin) fills the screen

### Pan Constraint in Draw Mode
- **Before:** No pan, so no constraint needed
- **After:** Pan is clamped so the user can't pan their view outside the radius

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Toast Position Requirements
- [ ] Toast appears directly above the Doodle button when triggered
- [ ] Toast has 12-16px of breathing room between it and the button (not visually attached)
- [ ] Toast is horizontally centered relative to the Doodle button
- [ ] Toast does not overlap with any other UI elements
- [ ] Toast text and styling unchanged from Sprint 6 ("Enable location to draw", auto-dismisses after 3 seconds)

### Zoom-Past-Limit Bug Fix
- [ ] Scrolling past the maximum zoom-in does not move the camera
- [ ] Scrolling past the maximum zoom-out does not move the camera
- [ ] At the limits, the wheel events are effectively no-ops
- [ ] Pinch-zoom past the limits also does not move the camera

### Two-Finger Pan in Draw Mode
- [ ] Single-finger drag in draw mode draws pixels (existing behavior, unchanged)
- [ ] Two-finger drag in draw mode pans the map
- [ ] Pinch-to-zoom continues to work alongside two-finger pan (gestures don't conflict)
- [ ] When a second finger touches within 50ms of the first finger, the gesture is treated as pan, not draw
- [ ] Browse mode behavior is unchanged (single-finger drag pans, since drawing isn't active)

### Zoom-Out Cap in Draw Mode
- [ ] Zoom-out is capped so the editable radius (with small margin) fills the visible viewport
- [ ] Cap is dynamic based on screen dimensions (mobile portrait vs desktop produce different caps)
- [ ] Browse mode zoom is unaffected — only draw mode has the cap
- [ ] At the cap, pan is silently disabled (no visual feedback, no jitter)
- [ ] Below the cap (more zoomed in), pan is enabled and clamped to the radius

### Pan Constraint
- [ ] When zoomed in within draw mode, panning is allowed but clamped
- [ ] User cannot pan their view such that the radius circle is fully off-screen
- [ ] Clamping feels natural — the camera stops smoothly at the boundary, not with a jarring snap
- [ ] Constraint applies only in draw mode, not browse mode

### Constraints
- [ ] Builds on top of Sprint 8's repo
- [ ] No changes to drawing logic itself (pixel placement, color picker, budget)
- [ ] No changes to the prompt system (Sprint 8)
- [ ] No changes to the welcome flow
- [ ] No backend schema changes

---

## Step 1: Toast Position

The current toast position is vague. Make it specific.

### Implementation

The toast should be a positioned element relative to the Doodle button (or absolutely positioned with coordinates derived from the button's position).

```tsx
function DoodleButtonContainer() {
  // ... existing state ...
  const buttonRef = useRef<HTMLButtonElement>(null)
  
  return (
    <div className="doodle-button-area" style={{ position: 'relative' }}>
      <button ref={buttonRef} onClick={handleDoodleClick} className="doodle-button">
        Doodle
      </button>
      {showToast && (
        <div 
          className="toast"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 14px)', // 14px breathing room above the button
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          Enable location to draw
        </div>
      )}
    </div>
  )
}
```

### Visual Specs

- 14px gap between bottom of toast and top of Doodle button (this falls in the 12-16px range and uses an even number)
- Horizontally centered relative to the button
- Toast width is content-fit (not full-width)
- Background: charcoal or dark color matching the existing palette
- Text: cream-colored, small but legible
- Subtle border-radius (~4-6px)
- `pointer-events: none` so it doesn't block interactions

The exact styling should match the rest of the app's visual language. If there's a charcoal text color and cream background elsewhere, invert it for the toast.

---

## Step 2: Zoom-Past-Limit Bug

The bug: scrolling past max zoom shifts the camera anyway. The fix is small and surgical.

### Current Behavior (Inferred)

The zoom handler probably does something like:

```typescript
function handleWheel(event: WheelEvent) {
  const cursorPos = { x: event.clientX, y: event.clientY }
  const delta = -event.deltaY * ZOOM_SENSITIVITY
  
  const newZoom = clamp(currentZoom + delta, MIN_ZOOM, MAX_ZOOM)
  
  // Adjust pan to keep cursor over the same world point
  applyZoomWithCursorAnchor(newZoom, cursorPos)
}
```

The bug: even when `newZoom === currentZoom` (clamped), `applyZoomWithCursorAnchor` still runs and produces a small pan toward the cursor due to floating-point rounding or anchor-math behavior.

### Fix

Early-return when zoom doesn't actually change:

```typescript
function handleWheel(event: WheelEvent) {
  const cursorPos = { x: event.clientX, y: event.clientY }
  const delta = -event.deltaY * ZOOM_SENSITIVITY
  
  const newZoom = clamp(currentZoom + delta, MIN_ZOOM, MAX_ZOOM)
  
  // If zoom didn't actually change, don't apply any anchor adjustment
  if (newZoom === currentZoom) {
    return
  }
  
  applyZoomWithCursorAnchor(newZoom, cursorPos)
}
```

Same fix applies to pinch-zoom on mobile if it has the same anchor-based logic.

### Important Detail

Floating-point comparisons can be tricky. If `newZoom` and `currentZoom` differ by a tiny amount (like 0.0000001) due to rounding, the early-return won't fire. Use a small epsilon:

```typescript
if (Math.abs(newZoom - currentZoom) < 0.0001) {
  return
}
```

This handles the case where the zoom is *effectively* the same even if not exactly equal.

---

## Step 3: Two-Finger Pan in Draw Mode

This is the largest change in the sprint. Adding a new gesture without breaking the existing one requires care.

### The Disambiguation Problem

When a touch starts, you don't know yet if it's a one-finger draw or the start of a two-finger pan. You have to wait briefly to see if a second finger arrives.

### Implementation Approach

Track touch state with a small state machine:

```typescript
type TouchState = 
  | { kind: 'idle' }
  | { kind: 'pending', startTime: number, touches: Touch[] }
  | { kind: 'drawing', strokeId: string }
  | { kind: 'panning', initialCenter: WorldCoord }
  | { kind: 'pinching', initialZoom: number, initialDistance: number }

const PAN_DETECTION_WINDOW_MS = 50
```

When a touch starts:

```typescript
function handleTouchStart(event: TouchEvent) {
  if (touchState.kind !== 'idle') {
    // Already in a gesture — handle multi-touch transitions
    handleMultiTouch(event)
    return
  }
  
  // Start in pending state, wait briefly to see if second finger arrives
  touchState = {
    kind: 'pending',
    startTime: performance.now(),
    touches: Array.from(event.touches),
  }
  
  // After 50ms, if still single-touch, commit to drawing
  setTimeout(() => {
    if (touchState.kind === 'pending' && event.touches.length === 1) {
      // Commit to drawing
      const touch = event.touches[0]
      startDrawingStroke(touch)
      touchState = { kind: 'drawing', strokeId: generateStrokeId() }
    }
  }, PAN_DETECTION_WINDOW_MS)
}
```

When a second touch arrives during the pending window:

```typescript
function handleMultiTouch(event: TouchEvent) {
  if (touchState.kind === 'pending' && event.touches.length === 2) {
    // Two fingers within the detection window — pan, not draw
    touchState = {
      kind: 'panning',
      initialCenter: getCurrentMapCenter(),
    }
  }
  // ... handle pinch detection too if both fingers are spreading
}
```

When fingers move:

```typescript
function handleTouchMove(event: TouchEvent) {
  if (touchState.kind === 'drawing' && event.touches.length === 1) {
    // Continue drawing the stroke
    const touch = event.touches[0]
    extendDrawingStroke(touch)
  }
  
  if (touchState.kind === 'panning' && event.touches.length === 2) {
    // Pan the map based on the average of two finger positions
    const center = averageTouchPosition(event.touches)
    panMapBy(center, touchState.initialCenter)
  }
  
  // ... etc
}
```

### The 50ms Lag

There's a small but real lag at the start of every draw stroke. The first 50ms of the drag don't draw anything — they're waiting to see if a second finger arrives.

This is imperceptible to users but critical to get right. Without it, two-finger gestures fail because the first finger has already started drawing before the second arrives.

### Existing Pinch-Zoom Compatibility

Pinch-zoom should keep working. The state machine above handles this — when two touches are present and they're spreading apart, it's a pinch (not a pan). The detection logic distinguishes:

- Two touches, parallel movement = pan
- Two touches, distance changing = pinch
- Two touches, both = pan + pinch simultaneously

Most map libraries handle this with a single matrix transform that combines both. Your current pinch logic probably works the same way — adding pan detection is additive, not replacement.

### Browse Mode Unchanged

In browse mode, single-finger drag pans (because drawing isn't active). Two-finger gestures continue to work as they currently do. The new logic only kicks in when in draw mode.

```typescript
function shouldUseDrawingGesture(): boolean {
  return appMode === 'draw'
}
```

Wrap the touch handler logic with this check. In browse mode, use the existing single-finger pan logic.

---

## Step 4: Zoom-Out Cap in Draw Mode

### Computing The Cap

The cap is the zoom level at which the editable radius (40 world pixels diameter, with margin) fills the visible viewport.

```typescript
function computeDrawModeMinZoom(viewport: Viewport): number {
  const radiusWorldPixels = 80 // diameter (40 in each direction)
  const marginFactor = 1.1 // 10% margin around the radius
  
  // The smaller dimension of the viewport determines the cap
  const minViewportDim = Math.min(viewport.width, viewport.height)
  
  // We want: minViewportDim = radiusWorldPixels * marginFactor * displayPixelsPerWorldPixel
  // So: displayPixelsPerWorldPixel = minViewportDim / (radiusWorldPixels * marginFactor)
  
  const requiredScale = minViewportDim / (radiusWorldPixels * marginFactor)
  
  return scaleToZoomLevel(requiredScale)
}
```

The exact `scaleToZoomLevel` conversion depends on how zoom is defined in your codebase. Reuse the existing zoom math.

### Applying The Cap

In the zoom handler, use the dynamic cap when in draw mode:

```typescript
function handleZoom(event: WheelEvent) {
  const minZoom = appMode === 'draw' 
    ? computeDrawModeMinZoom(currentViewport)
    : MIN_ZOOM
  
  const cursorPos = { x: event.clientX, y: event.clientY }
  const delta = -event.deltaY * ZOOM_SENSITIVITY
  
  const newZoom = clamp(currentZoom + delta, minZoom, MAX_ZOOM)
  
  if (Math.abs(newZoom - currentZoom) < 0.0001) {
    return
  }
  
  applyZoomWithCursorAnchor(newZoom, cursorPos)
}
```

Same logic applies to pinch-zoom — the cap is the floor; pinch-zoom can't go below it.

### Initial Zoom on Entering Draw Mode

When the user enters draw mode, the camera should be at a zoom level that's at-or-above the cap. If they were zoomed-out in browse mode and then enter draw mode, the zoom should snap to the cap.

```typescript
function enterDrawMode(userLocation: Location) {
  setAppMode('draw')
  
  // Center on user's location
  const center = latLngToWorld(userLocation.lat, userLocation.lng)
  setMapCenter(center)
  
  // Set zoom to the cap (or current zoom, whichever is more zoomed-in)
  const cap = computeDrawModeMinZoom(currentViewport)
  const newZoom = Math.max(currentZoom, cap)
  setMapZoom(newZoom)
}
```

This ensures the user always starts seeing their full radius.

---

## Step 5: Pan Constraint in Draw Mode

When the user pans within draw mode, they shouldn't be able to push the radius fully off-screen.

### Computing The Constraint

The user's location and radius define a circular drawing area. The viewport (camera) should be positioned such that some portion of the radius is visible.

A simple approach: clamp the viewport center so it's never more than `radiusWorldPixels / 2` from the user's location.

```typescript
function clampPanToRadius(
  proposedCenter: WorldCoord,
  userLocation: WorldCoord,
  radiusWorldPixels: number
): WorldCoord {
  const dx = proposedCenter.x - userLocation.x
  const dy = proposedCenter.y - userLocation.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  if (distance <= radiusWorldPixels) {
    return proposedCenter
  }
  
  // Beyond the radius — clamp to the edge
  const angle = Math.atan2(dy, dx)
  return {
    x: userLocation.x + Math.cos(angle) * radiusWorldPixels,
    y: userLocation.y + Math.sin(angle) * radiusWorldPixels,
  }
}
```

This keeps the viewport center within the radius. The user can pan, but the radius is always at least partially visible.

### Disable Pan At The Zoom-Out Cap

When at the cap, the radius fills the viewport. Panning would just move the radius around the screen, which is meaningless. Disable pan in this state:

```typescript
function handlePanGesture(deltaX: number, deltaY: number) {
  // Don't pan if we're at or near the zoom-out cap
  const cap = computeDrawModeMinZoom(currentViewport)
  if (currentZoom <= cap + 0.01) {
    return
  }
  
  // Otherwise pan, with clamping
  const proposedCenter = {
    x: currentCenter.x - deltaX / currentScale,
    y: currentCenter.y - deltaY / currentScale,
  }
  
  const clampedCenter = clampPanToRadius(
    proposedCenter,
    userLocation,
    drawModeRadiusWorldPixels
  )
  
  setMapCenter(clampedCenter)
}
```

### Visual Feel

The clamp should feel natural — the camera stops smoothly at the boundary, not with a hard jolt. Most users won't notice the clamp is happening; they'll just notice that the radius stays visible no matter where they try to pan.

If you want to add a subtle bounce or rubber-band effect at the boundary, that's a nice polish but not required for this sprint.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Update toast position to be relative to the Doodle button with 14px breathing room | 30 min | Toast appears in the correct position |
| 2 | Add zoom-past-limit early-return with epsilon comparison | 30 min | Scrolling at zoom limits no longer moves the camera |
| 3 | Refactor touch handler in draw mode to use a state machine (idle / pending / drawing / panning / pinching) | 90 min | Touch state machine compiles and tracks state correctly |
| 4 | Implement single-finger draw and two-finger pan with 50ms detection window | 60 min | Single-finger drags draw; two-finger drags pan |
| 5 | Verify pinch-zoom still works alongside two-finger pan | 30 min | Pinch and pan don't conflict |
| 6 | Compute the draw-mode zoom-out cap dynamically based on viewport | 45 min | Cap is correctly computed for any screen size |
| 7 | Apply the cap in the zoom handler (wheel + pinch) | 30 min | Cannot zoom out beyond the cap in draw mode |
| 8 | When entering draw mode, snap zoom to at-least-cap if currently more zoomed-out | 20 min | Entering draw mode always shows the full radius |
| 9 | Implement pan clamping to keep the radius on-screen | 60 min | Pan stops at the boundary smoothly |
| 10 | Disable pan when at the zoom-out cap | 15 min | At cap, two-finger drag does nothing |
| 11 | Test all interactions on desktop (mouse + trackpad) | 30 min | Desktop works correctly |
| 12 | Test all interactions on mobile (one finger, two finger, pinch) | 60 min | Mobile works correctly |
| 13 | Mobile re-deploy to Vercel and verify on phone | 30 min | Production-deployed version works |
| 14 | Document any non-blocking issues in BACKLOG.md | 15 min | Sprint complete |

**Total estimated time: ~9 hours**

---

## Testing Checklist

### Desktop Testing

**Toast Position**
- Open app in browse mode without permission
- Tap Doodle
- Verify toast appears directly above the button with breathing room
- Toast disappears after 3 seconds
- ✅ Pass: position is correct, no overlap with other UI

**Zoom Limit Bug**
- In browse mode, zoom to maximum zoom-in
- Continue scrolling toward zoom-in (mouse wheel up)
- Camera should not move
- Zoom to maximum zoom-out
- Continue scrolling toward zoom-out
- Camera should not move
- ✅ Pass: camera is still at zoom limits

**Draw Mode Zoom Cap**
- Enter draw mode
- Try to zoom out as far as possible
- The editable radius should fill the screen with margin
- Cannot zoom further out
- ✅ Pass: cap holds at radius-filling level

### Mobile Testing

**Single-Finger Draw**
- Enter draw mode on mobile
- Single-finger drag across the canvas
- Pixels should be placed
- ✅ Pass: drawing works as before

**Two-Finger Pan (At High Zoom)**
- Zoom in past the cap so only a portion of the radius is visible
- Two-finger drag in any direction
- Map should pan
- Pinch to zoom should still work
- Single-finger drag should still draw
- ✅ Pass: gestures don't conflict, all work

**Two-Finger Pan (At Cap)**
- Zoom out to the cap
- Two-finger drag
- Map should NOT pan (silently disabled)
- ✅ Pass: pan disabled at cap

**Pan Clamping**
- Zoom in within draw mode
- Two-finger pan in one direction repeatedly
- Camera should stop at the radius boundary
- The radius circle should still be visible, just at the edge of the screen
- ✅ Pass: clamping holds, radius stays visible

**Pinch-Zoom Past Limits**
- Pinch to zoom in to maximum, then continue pinching
- Camera should not shift
- Pinch to zoom out to cap, then continue
- Camera should not shift
- ✅ Pass: zoom past limits doesn't move camera

---

## What Counts as Success

The sprint succeeds when:

1. The toast appears in a clearly defined position above the Doodle button
2. Scrolling/pinching at zoom limits doesn't move the camera
3. In draw mode, single-finger drags draw and two-finger drags pan, without conflict
4. Draw mode zoom-out is capped at radius-filling level
5. Pan in draw mode is clamped so the radius is always at least partially visible
6. All existing functionality from prior sprints still works
7. The phone experience for drawing-while-zoomed-in is genuinely usable

---

## What Counts as Failure

- Toast position is still vague or overlaps with other UI
- Camera shifts when scrolling past zoom limits
- Two-finger pan accidentally draws pixels (gesture detection broken)
- Single-finger draw doesn't work because of the 50ms detection window timing
- Pinch-zoom is broken by the new pan logic
- Zoom-out cap is wrong on different screen sizes (too tight on mobile, too loose on desktop)
- Pan clamping causes jittery or jarring camera movement
- Browse mode behavior is changed by mistake

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- Drawing logic itself (pixel placement, color picker, budget)
- The prompt system (Sprint 8)
- The welcome flow
- The Doodle button toast text or timing
- Smart default centering
- Server-side budget enforcement
- Authentication
- Personal history view
- Mode infrastructure (deferred to Sprint 10+)
- Accessibility mode toggle for one-handed pan (consider for a future sprint)

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, and SPRINT-1 through SPRINT-8 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **The touch handler refactor (Step 3) is the most complex piece.** Get the state machine right before adding behaviors. A bug here breaks both drawing and panning.
- **The 50ms detection window is critical.** Test it on a real phone, not just a desktop browser with touch emulation. Touch behavior differs between simulators and real devices.
- **The zoom-out cap math depends on existing zoom-level definitions.** Reuse the existing zoom math; don't invent new conversions.
- **Pan clamping should be smooth, not abrupt.** Test that the camera stops gracefully at the radius boundary.
- **Use Opus, not Sonnet, for this sprint.** Touch handling and gesture state machines are easy to break subtly.
- **Stay in plan mode for the full plan review before executing.** Walk through every step.
- **If you hit ambiguity, stop and ask.** Don't make UX decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is making draw mode actually usable on mobile and fixing the small interaction bugs. Optimize for "interactions feel right on a phone" over "code is clever."

---

## After the Sprint

Once Sprint 9 ships:

1. **Use it on your phone for at least an hour.** Try drawing in dense areas where you need to pan around. Notice if the gestures feel natural.
2. **Send the URL to a friend who hasn't used it yet.** Watch them try to pan. Don't tell them about two-finger pan — see if they discover it.
3. **Confirm no regressions.** All Sprint 8 functionality (prompts, etc.) still works.
4. **Tell me Sprint 9 is done.** I'll generate Sprint 10.

Likely candidates for Sprint 10:
- **Welcome flow polish** — the lightweight version of what we tried earlier
- **Mode infrastructure** — start building the foundation for weekly modes
- **Accessibility pan toggle** — if discovery of two-finger pan is genuinely a problem
- **Personal history view** — if users keep asking "what did I draw?"

Don't pre-commit. Sprint 10 follows from what real use surfaces.