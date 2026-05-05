# SPRINT-11.md — Adaptive Polling

This sprint replaces the uniform 5-second polling with smarter, context-aware polling that adapts to what the user is doing. Draw mode polls more frequently (2s), browse mode stays at the current cadence (5s), and polling pauses entirely when the app is backgrounded.

The architecture is designed so a future WebSocket layer (Sprint 12) can be added cleanly without restructuring. If WebSockets don't pan out, this sprint's improvements stand on their own.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-10.md.

---

## The Goal

Three improvements to the polling system:

1. **Adaptive polling rate.** Faster polling in draw mode (2s), normal in browse mode (5s).

2. **Backgrounded behavior.** Pause polling when the tab is hidden or the app is backgrounded. Catch up immediately on foreground.

3. **Clean event handling architecture.** Centralize the logic that processes incoming pixel events so a future WebSocket layer can plug into the same pipeline.

The user-facing result: the wall feels meaningfully more alive when you're actively drawing, while browsing stays calm and resource usage stays low when no one's watching.

---

## What's Changing

### Polling Cadence
- **Before:** Uniform 5-second polling regardless of app state.
- **After:** 2 seconds in draw mode, 5 seconds in browse mode, paused when backgrounded.

### Backgrounded Behavior
- **Before:** Polling continues even when the tab is hidden, wasting bandwidth and battery.
- **After:** Polling pauses on visibility change, resumes with immediate catch-up on foreground.

### Event Handling
- **Before:** Polling code directly applies events to render state, tightly coupled.
- **After:** Polling produces events; a centralized handler applies them. WebSocket subscriptions in the future will produce events into the same handler.

### Catch-Up Strategy
- **Before:** No explicit catch-up logic; reconnects rely on the next poll cycle.
- **After:** On foregrounding (and on connection-state recovery), trigger an immediate catch-up fetch before resuming the polling schedule.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Adaptive Polling Requirements
- [ ] Polling interval is 2 seconds when the app is in draw mode
- [ ] Polling interval is 5 seconds when the app is in browse mode
- [ ] Mode transitions immediately update the polling interval (no waiting for the current poll cycle to complete)
- [ ] All polling intervals come from a single configuration source (probably `tuning.ts`)

### Backgrounded Behavior Requirements
- [ ] Polling pauses when `document.hidden === true` (tab hidden, app backgrounded)
- [ ] Polling resumes when the document becomes visible again
- [ ] On resumption, an immediate catch-up fetch runs before the regular polling schedule resumes
- [ ] No polling requests fire while the document is hidden (verifiable in the network tab)

### Event Handling Architecture Requirements
- [ ] A centralized event handler exists (e.g., `applyIncomingEvents`) that takes pixel events and applies them to render state
- [ ] The polling code calls this handler with new events; it does not apply events directly
- [ ] The handler is designed to be called from any source (polling now, WebSocket later)
- [ ] The handler deduplicates events by ID — events already in render state are not re-applied
- [ ] The handler maintains the `lastSeenEventId` or `lastSeenTimestamp` cursor that polling uses for incremental fetches

### Connection State Tracking
- [ ] The app maintains an internal `connectionState`: `'connected'` | `'disconnected'` | `'reconnecting'`
- [ ] Connection state updates based on polling success/failure
- [ ] Connection state is exposed via a hook or context for future UI use (no UI in this sprint, just internal tracking)

### Catch-Up Strategy Requirements
- [ ] On app foreground, fetch all events in the current viewport since the last seen event
- [ ] On polling failure recovery (after one or more failed polls), the next successful poll fetches since last seen
- [ ] If the gap is too large (>500 events), refetch the entire viewport instead of incremental events

### Performance Requirements
- [ ] Polling at 2s in draw mode does not cause visible UI jank
- [ ] No memory leaks from accumulating event listeners or stale timers
- [ ] Polling does not continue after component unmount

### Constraints
- [ ] Builds on top of Sprint 10's repo
- [ ] No backend or schema changes
- [ ] No WebSocket implementation (deferred to Sprint 12)
- [ ] No visual treatment for new pixels — they appear normally (per user decision)
- [ ] No connection state UI in this sprint (just internal tracking)
- [ ] No activity indicators or "live" UI elements
- [ ] No changes to drawing logic, prompts, modes, or any other system

---

## The Architecture

The keystone of this sprint is separating *event production* from *event application*. Currently they're entangled: polling fetches events and directly mutates render state. After this sprint:

```
┌─────────────────┐
│ Polling Loop    │
│ (this sprint)   │
└────────┬────────┘
         │
         │ produces events
         ▼
┌─────────────────────────────────┐
│ Centralized Event Handler       │
│ - deduplicates by ID            │
│ - updates render state          │
│ - advances lastSeenEventId      │
└────────┬────────────────────────┘
         │
         │ applies to
         ▼
┌─────────────────┐
│ Render State    │
└─────────────────┘
```

Sprint 12 (WebSockets) adds a second event source feeding into the same handler:

```
┌─────────────────┐    ┌─────────────────┐
│ Polling Loop    │    │ WebSocket       │
│ (fallback)      │    │ Subscription    │
└────────┬────────┘    └────────┬────────┘
         │                      │
         └──────────┬───────────┘
                    │ produces events
                    ▼
        ┌─────────────────────────────────┐
        │ Centralized Event Handler       │
        └────────┬────────────────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ Render State    │
        └─────────────────┘
```

Sprint 11's job is to set up the handler well so Sprint 12 just plugs in.

---

## Step 1: Build The Centralized Event Handler

Before changing how events are fetched, refactor *how they're applied*.

### Find Where Events Are Currently Applied

The current polling logic probably looks something like:

```typescript
async function pollForEvents() {
  const events = await fetchEventsSince(lastFetchTime, viewport)
  for (const event of events) {
    renderState.setPixel(event.x, event.y, event.color)
  }
  if (events.length > 0) {
    lastFetchTime = events[events.length - 1].placed_at
  }
}
```

Find this and similar code paths.

### Build The Handler

Create a new module (e.g., `src/lib/eventHandler.ts`):

```typescript
// src/lib/eventHandler.ts

let lastSeenEventId: number | null = null
let lastSeenTimestamp: string | null = null
const seenEventIds = new Set<number>()

export interface PixelEvent {
  id: number
  x: number
  y: number
  color: string
  session_id: string
  placed_at: string
  // ... other fields
}

export function applyIncomingEvents(events: PixelEvent[]) {
  for (const event of events) {
    // Deduplicate
    if (seenEventIds.has(event.id)) continue
    seenEventIds.add(event.id)
    
    // Apply to render state
    renderState.setPixel(event.x, event.y, event.color)
    
    // Advance cursor
    if (lastSeenEventId === null || event.id > lastSeenEventId) {
      lastSeenEventId = event.id
      lastSeenTimestamp = event.placed_at
    }
  }
}

export function getLastSeenTimestamp(): string | null {
  return lastSeenTimestamp
}

export function getLastSeenEventId(): number | null {
  return lastSeenEventId
}

export function resetEventHandler() {
  // Used when refetching the entire viewport (e.g., after viewport change)
  lastSeenEventId = null
  lastSeenTimestamp = null
  seenEventIds.clear()
}
```

### Memory Consideration

The `seenEventIds` Set will grow over time. For long sessions, this is a memory issue. Two mitigations:

**Option A: Periodic pruning.** Every N events, remove the oldest IDs from the set (keep only the last 10,000).

**Option B: Lazy bounded set.** Use a bounded data structure (e.g., LRU cache) that auto-evicts.

**Option C: Trust the timestamp cursor.** The polling query uses `placed_at > lastSeenTimestamp`, so deduplication via the Set is a backup. As long as the timestamp cursor is correct, the Set is mostly redundant.

My vote: **Option A with a bounded size of 10,000.** Simple, works, never grows unbounded.

### Refactor Existing Code

Find all the places that apply events to render state. Replace them with calls to `applyIncomingEvents`.

After this step, polling should still work exactly as before — just with the application logic centralized.

---

## Step 2: Build The Adaptive Polling Loop

Replace the current setInterval-based polling with a self-scheduling, mode-aware loop.

### The New Polling Module

Create or refactor `src/lib/polling.ts`:

```typescript
// src/lib/polling.ts

import { TUNING } from '@/config/tuning'
import { applyIncomingEvents, getLastSeenTimestamp, resetEventHandler } from './eventHandler'
import { fetchEventsSince } from './pixels'

let pollingTimer: number | null = null
let isPolling = false

export function startPolling(getViewport: () => Viewport, getMode: () => 'browse' | 'draw') {
  if (isPolling) return
  isPolling = true
  schedule(getViewport, getMode)
}

export function stopPolling() {
  isPolling = false
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

function getCurrentInterval(mode: 'browse' | 'draw'): number {
  if (document.hidden) return 0 // signal to pause
  return mode === 'draw' 
    ? TUNING.polling.drawIntervalMs 
    : TUNING.polling.browseIntervalMs
}

async function schedule(getViewport: () => Viewport, getMode: () => 'browse' | 'draw') {
  if (!isPolling) return
  
  const interval = getCurrentInterval(getMode())
  
  if (interval === 0) {
    // Document hidden — wait for visibility change to resume
    return
  }
  
  pollingTimer = window.setTimeout(async () => {
    if (!isPolling) return
    
    try {
      await pollOnce(getViewport())
      setConnectionState('connected')
    } catch (error) {
      console.error('Poll failed:', error)
      setConnectionState('disconnected')
      // Retry on next scheduled poll, no immediate retry
    }
    
    schedule(getViewport, getMode)
  }, interval)
}

async function pollOnce(viewport: Viewport) {
  const since = getLastSeenTimestamp()
  const events = await fetchEventsSince(since, viewport)
  applyIncomingEvents(events)
}
```

### Add To Tuning Config

```typescript
// src/config/tuning.ts (extend existing)

export const TUNING = {
  // ... existing config ...
  polling: {
    drawIntervalMs: 2000,        // 2 seconds in draw mode
    browseIntervalMs: 5000,      // 5 seconds in browse mode
    catchUpThresholdEvents: 500, // if more events than this, refetch viewport
  },
}
```

### Mode Change Triggers Reschedule

When the user transitions between draw and browse mode, the polling interval should immediately adjust — not wait for the current poll cycle to complete.

The cleanest way: the mode change handler explicitly cancels and restarts the polling timer. The polling system itself is reactive but doesn't watch for mode changes — the mode-change handler tells it to reschedule.

```typescript
function setAppMode(newMode: 'browse' | 'draw') {
  appMode = newMode
  // Restart polling so the next poll uses the new interval
  stopPolling()
  startPolling(getViewport, getMode)
}
```

---

## Step 3: Visibility Change Handling

When the document's visibility changes, polling needs to pause or resume.

### Implementation

```typescript
// In the polling module or app initialization

function handleVisibilityChange() {
  if (document.hidden) {
    // Pause: stop the current timer
    if (pollingTimer !== null) {
      clearTimeout(pollingTimer)
      pollingTimer = null
    }
  } else {
    // Resume: trigger immediate catch-up, then resume normal polling
    if (isPolling) {
      catchUpAndResume()
    }
  }
}

async function catchUpAndResume() {
  try {
    await pollOnce(getViewport())
    setConnectionState('connected')
  } catch (error) {
    console.error('Catch-up poll failed:', error)
    setConnectionState('disconnected')
  }
  schedule(getViewport, getMode)
}

document.addEventListener('visibilitychange', handleVisibilityChange)
```

### Event Listener Cleanup

When the polling module is torn down (e.g., on app unmount), the visibility listener needs to be removed:

```typescript
export function teardownPolling() {
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
}
```

---

## Step 4: Connection State Tracking

Maintain internal connection state. No UI in this sprint, but the state should be queryable.

### Implementation

```typescript
// src/lib/connectionState.ts

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting'

let currentState: ConnectionState = 'connected'
const listeners = new Set<(state: ConnectionState) => void>()

export function getConnectionState(): ConnectionState {
  return currentState
}

export function setConnectionState(newState: ConnectionState) {
  if (currentState === newState) return
  currentState = newState
  listeners.forEach(listener => listener(newState))
}

export function subscribeToConnectionState(listener: (state: ConnectionState) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
```

### State Transitions

- `connected` → `disconnected`: a poll fails
- `disconnected` → `connected`: a poll succeeds after a previous failure
- `disconnected` → `reconnecting`: when actively retrying (optional refinement)

For Sprint 11, the simple `connected` / `disconnected` distinction is enough.

### React Hook For Future UI

```typescript
// src/lib/useConnectionState.ts

import { useEffect, useState } from 'react'
import { getConnectionState, subscribeToConnectionState, ConnectionState } from './connectionState'

export function useConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(getConnectionState())
  
  useEffect(() => {
    return subscribeToConnectionState(setState)
  }, [])
  
  return state
}
```

This hook isn't used in Sprint 11 but is ready for Sprint 12 or later UI work.

---

## Step 5: Catch-Up Threshold Logic

When a long disconnection happens, the catch-up could try to fetch hundreds or thousands of events. If the gap is too large, refetching the viewport entirely is faster and more reliable.

### Implementation

```typescript
// In the polling module or event handler

async function catchUpOrReset(viewport: Viewport) {
  const since = getLastSeenTimestamp()
  
  if (since === null) {
    // No previous state — fetch viewport from scratch
    await refetchViewport(viewport)
    return
  }
  
  // Try incremental catch-up first
  const events = await fetchEventsSince(since, viewport)
  
  if (events.length > TUNING.polling.catchUpThresholdEvents) {
    // Too many events; refetch the viewport for safety
    resetEventHandler()
    await refetchViewport(viewport)
  } else {
    applyIncomingEvents(events)
  }
}

async function refetchViewport(viewport: Viewport) {
  const allEvents = await fetchEventsInViewport(viewport)
  applyIncomingEvents(allEvents)
}
```

### When To Use Catch-Up vs Refetch

- **Foreground from background:** use catch-up logic
- **Recovering from disconnection:** use catch-up logic
- **Viewport changes (pan/zoom):** Sprint 11 doesn't change this; whatever the existing logic is stays the same

---

## Step 6: Wire Everything Together In The App

The app initialization needs to:
1. Initialize the polling system with viewport and mode getters
2. Set up the visibility change listener
3. Handle teardown on unmount

```tsx
// In App.tsx or a top-level component

useEffect(() => {
  startPolling(
    () => getCurrentViewport(),
    () => appMode  // 'browse' | 'draw'
  )
  
  return () => {
    teardownPolling()
  }
}, [])

// When mode changes, restart polling
useEffect(() => {
  stopPolling()
  startPolling(
    () => getCurrentViewport(),
    () => appMode
  )
}, [appMode])
```

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Audit current polling and event-application code; identify all places events are applied | 30 min | Clear understanding of what to refactor |
| 2 | Build `eventHandler.ts` with `applyIncomingEvents`, deduplication, and cursor tracking | 45 min | Centralized event application working |
| 3 | Refactor existing polling to call `applyIncomingEvents` instead of applying directly | 30 min | Polling still works, but goes through handler |
| 4 | Add `polling.drawIntervalMs` and `polling.browseIntervalMs` to tuning config | 10 min | Config values exist |
| 5 | Build the new self-scheduling polling loop with mode-aware intervals | 60 min | Polling adapts to mode |
| 6 | Wire mode transitions to restart polling | 30 min | Mode changes immediately update polling cadence |
| 7 | Build visibility change handler with pause/resume and catch-up | 45 min | Polling pauses when backgrounded, catches up on foreground |
| 8 | Build connection state tracking module | 30 min | Internal state can be queried |
| 9 | Build catch-up threshold logic — refetch viewport if gap is too large | 45 min | Long disconnections handled gracefully |
| 10 | Build memory pruning for `seenEventIds` Set | 20 min | Set stays bounded |
| 11 | Test mode transitions: draw → browse should slow polling, browse → draw should speed up | 20 min | Verified |
| 12 | Test backgrounding: tab switch, lock screen on mobile, foreground catch-up | 30 min | Verified |
| 13 | Test connection failure recovery: simulate offline, verify state transitions and recovery | 30 min | Verified |
| 14 | Test long-disconnection scenario: leave tab hidden for an hour, foreground, verify catch-up | 20 min | Verified |
| 15 | Mobile re-deploy to Vercel and verify on phone | 30 min | Works on mobile |
| 16 | Document any non-blocking issues in BACKLOG.md | 10 min | Sprint complete |

**Total estimated time: ~7 hours**

---

## Testing Checklist

### Adaptive Polling
- [ ] Open app in browse mode; verify polling happens every 5 seconds (network tab)
- [ ] Tap Doodle to enter draw mode; verify polling speeds up to every 2 seconds
- [ ] Exit draw mode; verify polling slows back to 5 seconds
- [ ] Mode transitions take effect immediately, not after the current cycle completes
- [ ] ✅ Pass: polling is mode-aware

### Backgrounding
- [ ] Open app; verify polling is happening
- [ ] Switch to another tab; verify polling stops (no requests in network tab)
- [ ] Switch back to app tab; verify immediate catch-up poll fires, then regular schedule resumes
- [ ] On mobile: lock screen, verify polling stops; unlock, verify catch-up
- [ ] ✅ Pass: backgrounded behavior works correctly

### Event Handler
- [ ] Trigger duplicate events (e.g., refetch viewport after a poll); verify pixels don't double-render
- [ ] Verify `lastSeenEventId` advances correctly as events arrive
- [ ] Run a long session (hundreds of events); verify no memory growth in DevTools
- [ ] ✅ Pass: deduplication and cursor tracking work

### Connection State
- [ ] In DevTools, simulate offline mode; verify state transitions to `disconnected` after a poll fails
- [ ] Re-enable network; verify next poll succeeds and state returns to `connected`
- [ ] ✅ Pass: connection state tracks correctly

### Catch-Up Logic
- [ ] Background the tab for at least 30 seconds while pixels are being placed (use a second device)
- [ ] Foreground; verify the missed pixels appear immediately
- [ ] If many events were placed, verify the catch-up doesn't cause UI jank
- [ ] ✅ Pass: catch-up works for typical gaps

### Long Disconnection
- [ ] Background the tab for many minutes (an hour if possible)
- [ ] Foreground; if the gap exceeds the threshold, verify viewport is refetched cleanly
- [ ] No stale pixels remain from before backgrounding
- [ ] ✅ Pass: long-gap handling works

### No Regressions
- [ ] Drawing in draw mode still works
- [ ] All Sprint 1-10 functionality is intact
- [ ] No new console errors
- [ ] No memory leaks over a long session
- [ ] ✅ Pass: no regressions

---

## What Counts as Success

The sprint succeeds when:

1. Polling adapts cleanly to mode changes
2. Backgrounding pauses polling, foregrounding catches up immediately
3. The wall feels meaningfully more alive in draw mode (visible by drawing on a second device and watching pixels appear within ~1 second)
4. The event handling architecture is centralized — Sprint 12 can plug in WebSockets without restructuring
5. Connection state is tracked internally for future UI use
6. No regressions in existing functionality
7. Mobile behavior is correct, especially around backgrounding

---

## What Counts as Failure

- Polling doesn't adapt to mode changes
- Backgrounded polling continues (waste of resources)
- Mode changes wait for the current poll cycle (laggy feel)
- The event handler is in the wrong place architecturally — Sprint 12 would require restructuring
- Memory leaks from accumulating event IDs or timers
- Existing functionality breaks
- Mobile foregrounding doesn't trigger catch-up

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- WebSockets / Supabase Realtime (Sprint 12)
- Visual treatment for new pixels (no fade-in, no highlights — per user decision)
- Connection state UI (banner, indicator, etc. — internal tracking only)
- Activity indicators ("X people drawing nearby")
- Live cursors or stroke previews
- Drawing logic, prompts, modes, palette
- Any Sprint 1-10 functionality

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, ROADMAP.md, and SPRINT-1 through SPRINT-10 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **Step 2 (the centralized event handler) is the architectural keystone.** Get this right and Sprint 12 plugs in cleanly. Get it wrong and Sprint 12 requires restructuring.
- **Step 3 (refactor existing code to use the handler) is where regressions are most likely.** Test thoroughly that polling still works correctly before moving on.
- **Use Opus, not Sonnet, for this sprint.** Architectural refactoring requires care.
- **Test backgrounding on a real phone, not just a desktop browser.** Mobile backgrounding behaves differently and is the main use case for the visibility logic.
- **If you hit ambiguity, stop and ask.** Don't make architectural decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is robust, mode-aware polling with architecture ready for the WebSocket layer. Optimize for "no regressions, clean separation of concerns" over "this is clever."

---

## After the Sprint

Once Sprint 11 ships:

1. **Use it for several days.** Notice how draw mode feels — does it feel more alive?
2. **Test cross-device.** Open on phone and laptop simultaneously, draw on one, watch the other. Latency should feel near-instant in draw mode.
3. **Watch for any regressions.** All Sprint 10 functionality (geography above pixels) and earlier should work normally.
4. **Decide if Sprint 12 is worth doing.** If 2-second polling in draw mode feels good enough, WebSockets become optional. If you can still feel the lag, Sprint 12 is justified.
5. **Tell me Sprint 11 is done.** I'll generate Sprint 12 (WebSockets in draw mode) only if you decide it's needed.

The decision point is real: Sprint 11 might be enough on its own. Don't rush into Sprint 12 if Sprint 11 already produces the desired feel.