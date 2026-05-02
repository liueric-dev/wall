# SPRINT-6.md — Post-Welcome UI Cleanup

This sprint is intentionally small. A previous larger sprint attempt was reverted due to scope. The work has been broken into smaller, focused sprints. Sprint 6 addresses only the post-welcome UI: removing the permission banner, simplifying the Doodle button, and adding a permission change listener.

No welcome flow changes. No map architecture changes. No animations. Three focused changes that can be implemented without restructuring existing code.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-5.md.

---

## The Goal

Three small, contained improvements to the post-welcome UI:

1. **Remove the permission banner.** It exists in the codebase and isn't serving a useful purpose. Rip it out.

2. **Simplify the Doodle button.** Currently it works only for users with granted permission. Update it to handle all permission states with a brief toast on error.

3. **Add a permission change listener.** When the user enables location in browser settings, the app should react without requiring a page refresh.

Sprint 6 does NOT touch:
- The welcome screen (any of it — including the "Just browse" link, if present)
- The map's rendering or zoom behavior
- The drawing toolbar
- The smart default centering
- Any animations

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Banner Removal
- [ ] The permission banner component is deleted from the codebase
- [ ] All references to the banner are removed (imports, usages, conditional rendering)
- [ ] The banner's CSS is deleted or marked as unused
- [ ] No dead code related to banner state remains

### Doodle Button Behavior
- [ ] Tapping the Doodle button when permission is `granted` enters draw mode (existing behavior — no change)
- [ ] Tapping the Doodle button when permission is `denied` or `unsupported` shows a toast that auto-dismisses after 3 seconds
- [ ] Tapping the Doodle button when permission is `prompt` triggers the browser permission request; if granted, enters draw mode; if denied or dismissed, shows the toast
- [ ] The Doodle button itself has the same visual appearance in all permission states (no separate "locked" or "disabled" variant)

### Toast Component
- [ ] Toast appears briefly above the Doodle button (or in a similar non-blocking position)
- [ ] Toast text is exactly: "Enable location to draw"
- [ ] Toast auto-dismisses after 3 seconds
- [ ] Toast does not block the rest of the UI (uses `pointer-events: none`)
- [ ] Multiple rapid Doodle taps don't stack toasts — the existing toast either resets its timer or remains visible without duplication

### Permission Change Listener
- [ ] The app listens to the `change` event on the geolocation permission status
- [ ] When the permission state changes (e.g., user enables in browser settings), the React state updates
- [ ] The Doodle button's behavior reflects the new permission state on the next tap, without a page refresh

### Constraints
- [ ] Builds on top of Sprint 5's repo
- [ ] No changes to the welcome screen or onboarding flow
- [ ] No changes to map rendering, zoom, or centering behavior
- [ ] No changes to the drawing toolbar
- [ ] Budget tracking remains in localStorage
- [ ] No backend schema changes

---

## Step 1: Remove The Permission Banner

The banner component exists but isn't serving a clear purpose. Remove it entirely.

### What To Find And Remove

- The banner component file (likely `PermissionBanner.tsx` or similar)
- Any imports of the banner in other components
- Any conditional rendering blocks that mount the banner
- Any state variables related to banner dismissal (e.g., `bannerDismissed`)
- Any sessionStorage or localStorage keys related to banner state
- The banner's associated CSS

### What To Keep

- The permission state itself (the `permission` value used elsewhere)
- Any code that requests permission (this stays — it's used by the Doodle button)
- The geolocation library code

### How To Verify

After removal:
- The app should compile cleanly (no unresolved references)
- Loading the app at any permission state should not show a banner
- No console errors related to missing imports or undefined components

---

## Step 2: Update The Doodle Button

The Doodle button currently works only for users with granted permission. Update it to handle all permission states.

### Current Behavior (Approximate)

```typescript
// Likely something like this currently
function handleDoodleClick() {
  if (permission === 'granted') {
    enterDrawMode()
  }
  // Other states: probably nothing happens or there's broken behavior
}
```

### New Behavior

```typescript
async function handleDoodleClick() {
  if (permission === 'granted') {
    enterDrawMode()
    return
  }
  
  if (permission === 'denied' || permission === 'unsupported') {
    showToast('Enable location to draw')
    return
  }
  
  // permission === 'prompt'
  // Trigger the browser dialog by attempting to capture location
  const location = await captureLocationForSession()
  
  if (location) {
    enterDrawMode()
  } else {
    // User denied in the browser dialog or GPS timed out
    showToast('Enable location to draw')
  }
}
```

### Three Branches Explained

- **`granted`:** User has permission. Enter draw mode immediately. No toast needed.
- **`denied` or `unsupported`:** Permission can't be requested again (denied is sticky in browsers; unsupported means no API). Show toast immediately so the user gets feedback.
- **`prompt`:** User hasn't decided yet. Trigger the browser dialog. The user's response determines what happens next — either enter draw mode (granted) or show toast (denied/dismissed).

### Important Detail

For the `prompt` case, the toast appears **only after the user has answered the browser dialog**, not before. Showing the toast simultaneously with the browser dialog would confuse the user — they'd see "enable location to draw" while also being asked to enable location.

The toast is feedback for "your action couldn't accomplish what you wanted." It only makes sense after the failure is known.

---

## Step 3: Build The Toast Component

The toast is a small UI element that appears briefly when the user taps Doodle in a non-granted state.

### Component Sketch

```tsx
function Toast({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null
  
  return (
    <div className="
      fixed bottom-24 left-1/2 -translate-x-1/2
      px-4 py-2 rounded
      bg-charcoal text-cream text-sm
      pointer-events-none
      transition-opacity duration-200
    ">
      {message}
    </div>
  )
}
```

### State Management

The toast visibility is controlled at the same level as the Doodle button (probably in the same component or a parent).

```tsx
function DoodleButtonContainer() {
  const permission = usePermissionState()
  const [toastVisible, setToastVisible] = useState(false)
  
  function showToast() {
    setToastVisible(true)
    
    // Hide after 3 seconds
    setTimeout(() => setToastVisible(false), 3000)
  }
  
  async function handleDoodleClick() {
    // ... logic from Step 2 ...
  }
  
  return (
    <>
      <button onClick={handleDoodleClick}>Doodle</button>
      <Toast message="Enable location to draw" visible={toastVisible} />
    </>
  )
}
```

### Handling Rapid Taps

If the user taps Doodle multiple times in quick succession with denied permission, the toast should not stack. Two reasonable approaches:

**Approach A: Reset the timer on each tap**
- Each tap calls `setToastVisible(true)` and resets the 3-second timer
- The toast remains visible for 3 seconds after the *last* tap

**Approach B: Ignore taps while toast is visible**
- If `toastVisible` is already true, don't trigger another toast
- The toast disappears 3 seconds after the first tap

My recommendation: **Approach A.** Resetting the timer feels more responsive — the user's last tap "matters." Implementation requires storing the timeout reference and clearing it on each tap before setting a new one.

```tsx
const timeoutRef = useRef<number | null>(null)

function showToast() {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current)
  }
  
  setToastVisible(true)
  timeoutRef.current = window.setTimeout(() => {
    setToastVisible(false)
    timeoutRef.current = null
  }, 3000)
}
```

---

## Step 4: Add The Permission Change Listener

When the user changes their location permission in browser settings, the app should react without a page refresh.

### Implementation

This is a React hook that wraps the `navigator.permissions` API:

```typescript
// src/lib/usePermissionState.ts

import { useEffect, useState } from 'react'

type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export function usePermissionState(): LocationPermission {
  const [state, setState] = useState<LocationPermission>('prompt')
  
  useEffect(() => {
    if (!navigator.permissions) {
      setState('unsupported')
      return
    }
    
    let cleanup = () => {}
    
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      // Set initial state
      setState(status.state as LocationPermission)
      
      // Listen for changes
      const handler = () => setState(status.state as LocationPermission)
      status.addEventListener('change', handler)
      cleanup = () => status.removeEventListener('change', handler)
    }).catch(() => {
      setState('unsupported')
    })
    
    return cleanup
  }, [])
  
  return state
}
```

### Why This Hook Matters For Sprint 6

Without this listener, the toast becomes a lie. The user reads "Enable location to draw," goes to browser settings, enables location, comes back to the app — but the app's React state still says `permission === 'denied'` because nothing told it to re-check.

With this listener, the change event fires when the user enables location in browser settings. The hook updates state. The next Doodle tap correctly enters draw mode.

### Where To Use It

If the existing code already manages permission state in some way, replace that with this hook. If permission state is currently checked imperatively at various points, centralizing it through this hook is part of the cleanup.

The Doodle button reads from this hook. Any other component that needs to know the permission state also reads from this hook.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Audit current code: identify the banner component, its usage sites, and existing permission state management | 20 min | Clear list of what to remove and what to refactor |
| 2 | Build the `usePermissionState` hook with change-event listening | 20 min | Hook works in isolation; can be imported and used |
| 3 | Remove the permission banner component and all references | 30 min | Banner gone, app compiles |
| 4 | Build the Toast component | 25 min | Toast renders correctly when given visible=true and a message |
| 5 | Update the Doodle button to use the new permission state hook and handle all branches | 40 min | Doodle button behaves correctly in granted, prompt, denied, and unsupported states |
| 6 | Wire the toast into the Doodle button container with timer-reset on rapid taps | 25 min | Toast appears on Doodle tap when not granted, fades after 3s, doesn't stack |
| 7 | Test all four permission states manually | 30 min | Each state produces correct behavior |
| 8 | Test permission change scenario: deny → enable in browser settings → tap Doodle without refresh | 15 min | Doodle works after enabling, no refresh needed |
| 9 | Mobile test: re-deploy to Vercel and verify on phone | 30 min | Works on mobile |
| 10 | Document any non-blocking issues in BACKLOG.md | 15 min | Sprint complete |

**Total estimated time: ~4 hours**

---

## Testing Checklist

Before declaring the sprint done, walk through these scenarios:

### Scenario 1: Granted Path (Existing Behavior)
- Open app with location permission granted
- Tap Doodle
- Should enter draw mode normally
- ✅ Pass: enters draw mode without any toast

### Scenario 2: Fresh User With Prompt
- Open app in a fresh browser (or clear permissions for the site)
- Tap Doodle
- Browser permission dialog should appear
- Click "Allow"
- Should enter draw mode
- ✅ Pass: enters draw mode after allowing

### Scenario 3: Fresh User Denies
- Same as Scenario 2 but click "Block" in the browser dialog
- After dialog closes, toast should appear: "Enable location to draw"
- Toast should fade after 3 seconds
- ✅ Pass: toast appears after denial, fades correctly

### Scenario 4: Already Denied
- Open app with location previously denied
- Tap Doodle
- Toast appears immediately: "Enable location to draw"
- No browser dialog (browsers don't re-prompt after denial)
- Toast fades after 3 seconds
- ✅ Pass: toast appears immediately, no browser dialog

### Scenario 5: Permission Change Recovery
- Start with permission denied
- Tap Doodle, see toast
- Without refreshing the page, go to browser settings (lock icon in address bar) and enable location for the site
- Return to the app
- Tap Doodle
- Should enter draw mode (no toast, no need to refresh)
- ✅ Pass: app reacts to permission change without refresh

### Scenario 6: Rapid Tap
- Open app with permission denied
- Tap Doodle multiple times rapidly (e.g., 5 taps in 2 seconds)
- Toast should appear and remain visible until 3 seconds after the last tap
- Toasts should not stack or duplicate
- ✅ Pass: single toast, timer resets per tap

### Scenario 7: Banner Truly Gone
- Open app at any permission state
- Look for any banner, notice, or persistent notification about location
- ✅ Pass: no banner anywhere

---

## What Counts as Success

The sprint succeeds when:

1. The permission banner is gone — no trace in the codebase, no UI remnant
2. The Doodle button works correctly in all four permission states
3. The toast appears at the right moment (only after a denial is known) with the right copy
4. The permission change listener allows recovery without a page refresh
5. All test scenarios pass on both desktop and mobile
6. No existing functionality is broken (welcome flow, draw mode, polling, etc. all still work)

---

## What Counts as Failure

- Banner still appears in any state
- Doodle button does nothing in denied/unsupported states (no toast feedback)
- Toast appears simultaneously with the browser permission dialog (the prompt-state confusion)
- Toast persists indefinitely or stacks on rapid taps
- Permission change in browser settings doesn't update the UI without a refresh
- Any existing functionality is broken by these changes
- The Doodle button's visual appearance changes between permission states

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- The welcome screen or onboarding flow
- The "Just browse" link (if present in the welcome screen)
- The map rendering, zoom behavior, or initial centering
- The drawing toolbar
- Smart default centering (deferred to Sprint 7)
- Welcome flow improvements (deferred to Sprint 8)
- Server-side budget enforcement
- Daily prompt improvements
- Mode infrastructure
- Animations of any kind

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, and SPRINT-1 through SPRINT-5 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **This sprint is small by design.** If you find yourself touching the welcome screen, the map, or the drawing toolbar, STOP — that's out of scope.
- **The audit step (Step 1) matters.** Understanding the current banner code and permission state management before making changes prevents accidental scope creep.
- **Use Opus, not Sonnet, for this sprint** — the previous attempt at Sprint 6 was botched, possibly due to model selection. Opus is more careful with refactoring tasks.
- **Stay in plan mode for the full plan review before executing.** Walk through every step. Push back on anything that seems off.
- **If you hit ambiguity, stop and ask.** Do not make UX or architectural decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is small, contained, low-risk improvements. Optimize for "nothing broke" over "this is clever."

---

## After the Sprint

Once Sprint 6 ships:

1. **Verify on phone.** Open the deployed URL, walk through each test scenario.
2. **Confirm no regressions.** All Sprint 5 functionality still works.
3. **Tell me Sprint 6 is done.** I'll generate Sprint 7 (smart default centering).

The remaining sprints in this batch:
- **Sprint 7:** Smart default centering — weighted-random neighborhoods, fallback landmark, replaces fixed default location
- **Sprint 8:** Welcome flow improvements — smaller scope than the previous attempt, no architectural changes

Then Sprint 9+ for prompts, modes, and beyond.