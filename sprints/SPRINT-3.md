# SPRINT-3.md — Daily Ritual & Quiet Constraint

This sprint adds the rhythm that turns The Wall from a sandbox into a daily practice: a fresh prompt every morning, a budget that quietly refills over time, and a small cooldown so each pixel feels like a choice. The undo button is removed — every mark is committed and lived with.

The goal is *texture*, not features. The product won't gain new capabilities, but it will feel different — more deliberate, more rhythmic, more like something you come back to.

For the long-term product vision, see PRODUCT.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md and SPRINT-2.md.

---

## The Goal

Validate that **constraint and ritual make the product compelling**. By the end of the sprint, drawing should feel measured rather than careless, and there should be a clear daily rhythm pulling the user back: a new prompt every morning and a slowly refilling budget.

If users feel pulled to come back tomorrow, the sprint succeeded. If the product still feels too easy or too forgettable, the constraints need tuning — but the framework is in place.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Functional Requirements
- [ ] A daily prompt is visible in the drawing toolbar
- [ ] The prompt changes once per day at the configured rotation hour
- [ ] The user has a pixel budget that regenerates over time
- [ ] The budget caps at 300 pixels — additional regeneration above the cap is discarded
- [ ] The budget regenerates at 1 pixel per minute (60 pixels per hour)
- [ ] When the budget is 0, drawing is disabled with a quiet visual indication
- [ ] A small cooldown prevents rapid-fire pixel placement (300ms between any pixels)
- [ ] Drag drawing is rate-limited (30 pixels per second maximum)
- [ ] Undo functionality is removed entirely from the toolbar and codebase
- [ ] All tunable values live in a single configuration file

### Visual Requirements
- [ ] Budget counter is visible in the toolbar during draw mode
- [ ] Budget counter updates in real-time (ticks up as time passes)
- [ ] When budget is exhausted, the visual state is calm — not alarming
- [ ] Prompt text is rendered in serif typography, top of toolbar, prominent but not garish
- [ ] No undo button remains in the UI

### Performance Requirements
- [ ] Budget regeneration happens client-side via local time math (no server calls)
- [ ] Counter updates do not cause re-renders of the canvas
- [ ] Cooldown enforcement is instant (no perceptible UI lag when blocked)

### Configuration Requirements
- [ ] All tuning values (budget cap, regen rate, cooldown duration, drag rate, prompt rotation hour) are in a single TypeScript file
- [ ] Magic numbers are removed from feature code; the config is the only source

### Constraints
- [ ] Builds on top of Sprint 2's repo
- [ ] No backend, no Supabase, no API
- [ ] No new GPS work — uses the existing mocked location system
- [ ] Local-only deployment, no production push

---

## The Tuning Configuration

Create a single file: `src/config/tuning.ts`. This is the only place tuning values should live.

```typescript
// src/config/tuning.ts

export const TUNING = {
  // Pixel budget — the daily drawing allowance
  budget: {
    cap: 300,                       // max pixels held at any one time
    regenPerHour: 60,               // pixels regenerated per hour (= 1/min)
    initialBudget: 300,             // starting budget for new sessions
  },
  
  // Cooldown / pacing
  cooldown: {
    betweenPixelsMs: 300,           // milliseconds between any pixel placement
    dragMaxPixelsPerSecond: 30,     // upper bound on drag speed
  },
  
  // Editable radius
  radius: {
    feet: 300,                      // editable radius around mocked location
  },
  
  // Prompts
  prompts: {
    rotationHour: 6,                // hour of day when new prompt drops (local)
    list: [
      "Draw something you'd find at the deli",
      "Draw something only locals would notice",
      "Draw a sound you hear right now",
      "Draw your favorite hour of the day",
      // ... 30-60 prompts total
    ],
  },
  
  // Pixel rendering (already used in prior sprints)
  rendering: {
    pixelSizeFeet: 10,
    tileSize: 256,
  },
} as const
```

All feature code references `TUNING.budget.cap`, `TUNING.cooldown.betweenPixelsMs`, etc. **No magic numbers anywhere else.**

---

## The Sliding Window Budget

The budget regenerates continuously, not in discrete refills. The mechanic is:

- The user has up to 300 pixels at any moment
- One pixel regenerates every minute of real time
- The budget caps at 300 — additional regen is discarded
- When 0, the user cannot draw until at least one pixel has regenerated

### Storage Model

Budget state is stored in localStorage:

```typescript
type BudgetState = {
  amount: number;      // pixels at last update
  lastUpdated: number; // timestamp (ms) of last update
}
```

### Computing Current Budget

The budget at any moment is computed lazily from `lastUpdated`:

```typescript
function getCurrentBudget(state: BudgetState): number {
  const now = Date.now()
  const elapsedMs = now - state.lastUpdated
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  const regenerated = elapsedHours * TUNING.budget.regenPerHour
  return Math.min(state.amount + regenerated, TUNING.budget.cap)
}
```

This pattern means we never need a background timer — every read computes the current budget from the elapsed time.

### Deducting From Budget

Every pixel placed deducts 1 from the budget:

```typescript
function deductBudget(state: BudgetState, amount: number): BudgetState {
  const current = getCurrentBudget(state)
  return {
    amount: Math.max(0, current - amount),
    lastUpdated: Date.now(),
  }
}
```

### UI Updates

The budget counter in the toolbar should update visually every second to show the slow tick of regeneration. Use a `setInterval` that just re-reads `getCurrentBudget()` and updates the displayed number — do NOT trigger canvas re-renders from this.

---

## The Cooldown System

Two cooldowns operate simultaneously:

1. **Tap cooldown:** 300ms between any individual pixel placement
2. **Drag rate cap:** 30 pixels per second during a continuous drag

### Tap Cooldown

Track the timestamp of the last pixel placement. Reject new placements if `now - lastPlaced < TUNING.cooldown.betweenPixelsMs`.

When a tap is rejected: silent. No animation, no toast, no feedback. The user just notices their second tap didn't register, and they tap again.

### Drag Rate Cap

During a drag gesture, the system samples pointer position. If a drag would place more than 30 pixels per second, throttle to 30. Pixels exceeding the rate are simply not placed (they're not queued).

This means a fast finger swipe leaves *some* gap in the line — that's correct behavior. The rate cap creates physical limits on how aggressively a user can sweep across the canvas.

### Why Both

The tap cooldown prevents rapid-fire single-pixel destruction. The drag rate cap prevents rapid-sweep destruction. Together, they ensure no input pattern can place pixels faster than ~30/second, which is enough for natural drawing but not for vandalism.

---

## The Daily Prompt

### Mechanics

- A static array of 30-60 prompts in `TUNING.prompts.list`
- The "current prompt" is determined by `(daysSinceEpoch + offset) % prompts.length`
- A new prompt arrives at `TUNING.prompts.rotationHour` (default: 6am local)
- Before that hour, today's prompt is the previous day's

### Implementation

```typescript
function getCurrentPrompt(): string {
  const now = new Date()
  const hour = now.getHours()
  const isBeforeRotation = hour < TUNING.prompts.rotationHour
  
  // If it's before 6am, use yesterday's prompt
  const effectiveDate = isBeforeRotation 
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : now
  
  const daysSinceEpoch = Math.floor(effectiveDate.getTime() / (24 * 60 * 60 * 1000))
  const index = daysSinceEpoch % TUNING.prompts.list.length
  return TUNING.prompts.list[index]
}
```

### Display

- Prompt text appears in the drawing toolbar, top area
- Serif font (DM Serif Display or whatever's already in use)
- Quiet enough to not dominate the screen, prominent enough to be noticed
- No "today's prompt" label needed — the prompt itself is the call to action

### Suggested Initial Prompt List

Aim for a mix of: observational ("something you'd hear right now"), nostalgic ("a place you used to go"), playful ("draw your favorite shape"), and place-specific ("something only locals notice"). Keep them open-ended — they should suggest, not constrain.

A starter set of 30 is sufficient for ~1 month of variety. Expand as needed.

---

## Removing Undo

Sprint 2 added an undo button and an undo stack. Remove all of it:

- Delete the undo button from the toolbar
- Remove undo-related event handlers and keyboard shortcuts
- Remove the undo stack from state management
- Delete any "previous color" tracking that existed only for undo

Each pixel placement is now permanent (subject to overwrite by future placements, of course). This is intentional — it adds weight to each tap and removes a layer of complexity from the model.

The user-facing change: there's no undo button, and the toolbar is simpler.

---

## The Updated Toolbar

After this sprint, the toolbar contains:

- Today's prompt (top, serif text)
- Color picker (5 colors, locked palette from Sprint 2)
- Budget counter ("247 pixels")
- Done / exit button (returns to city view)

That's it. Smaller and quieter than Sprint 2's toolbar.

---

## Build Order (Strict)

Follow this order. Each step has a verifiable deliverable.

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Create `src/config/tuning.ts` and migrate existing magic numbers from Sprint 1 and 2 | 30 min | Single source of truth for all tunables |
| 2 | Build the budget state type, localStorage helpers, and `getCurrentBudget` math | 30 min | Budget read/write functions with unit tests |
| 3 | Build `deductBudget` and integrate into the tap/drag pixel placement flow | 30 min | Each pixel placement deducts 1 from budget |
| 4 | Add the budget counter UI to the toolbar; update via setInterval each second | 30 min | Counter visible and ticking up |
| 5 | Block drawing when budget is 0; show calm "out of pixels" state | 30 min | Cannot draw at 0; visual state communicates this |
| 6 | Implement tap cooldown (reject placements within 300ms of previous) | 30 min | Rapid taps are silently dropped |
| 7 | Implement drag rate cap (max 30 pixels/second during continuous drag) | 45 min | Fast swipes don't place pixels above rate |
| 8 | Build the prompt rotation logic and display in toolbar | 30 min | Prompt visible; rotates at 6am |
| 9 | Write the initial prompt list (30 prompts minimum) into config | 20 min | Config has prompts |
| 10 | Remove undo button and all undo-related code | 30 min | Undo gone, toolbar simpler |
| 11 | Polish: smooth budget counter animation, prompt typography, calm out-of-budget state | 30 min | Feels finished |
| 12 | End-to-end testing on phone and laptop | 30 min | Sprint complete |

**Total estimated time: ~5.5 hours**

---

## What Counts as Success

The sprint succeeds if:

1. The product feels meaningfully different — more deliberate, less casual
2. The daily prompt creates an actual reason to open the app tomorrow morning
3. The budget mechanic is invisible most of the time but felt when you push against it
4. The cooldown is barely noticeable in normal drawing
5. The rate cap prevents you from sweeping across the canvas in a few seconds
6. After using it for a few hours, you're aware of the budget without obsessing over it

You can validate this informally: doodle for 10 minutes, do something else, come back later. Notice how the budget has refilled. Notice whether the prompt makes you want to engage. The signal will be clear.

---

## What Counts as Failure

The sprint fails if:

- The cooldown feels annoying during normal drawing (try lowering to 200ms)
- The budget burns out too fast on the first session (raise the cap)
- The prompt is invisible or feels like decoration (rework display)
- Removing undo creates frequent frustration (revisit, but ideally accept the tradeoff)
- Out-of-budget state is confusing or alarming (rework the visual)

Tune via `TUNING` until the product feels right. The whole point of putting values in config is that you can iterate quickly.

---

## What's Out of Scope

To stay focused, explicitly do NOT build in this sprint:

- Backend / Supabase wiring
- Real GPS / actual geolocation  
- Asymmetric pixel costs (overwriting others' work costs the same as drawing on empty space, for now)
- Time-based pixel crystallization
- Voluntary visual decay
- Eraser tool
- Notifications
- Special modes (Doodle Day, Mirror Week, etc.)
- Voting, leaderboards, or any social features
- Moderation tools or report buttons
- Server-side tuning config (file-based for now)

Anything not in this document gets deferred. Add to `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, ARCHITECTURE.md, SPRINT-1.md, and SPRINT-2.md before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **All tuning values must come from `src/config/tuning.ts`.** No magic numbers in feature code.
- **If you hit ambiguity, stop and ask.** Don't make product decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is a quietly different feel, not a flashier product. Optimize for "does it feel rhythmic" over "does it have features."

---

## After the Sprint

Once Sprint 3 is done:

1. **Use it for a full day.** Doodle in the morning, again at lunch, again before bed. Notice if the rhythm forms.
2. **Tune the values.** Cap too high? Lower it. Regen too slow? Speed it up. The config makes this fast.
3. **Capture observations in `RETROSPECTIVE-SPRINT-3.md`.** Three sections: what felt right, what felt wrong, what to do next.

Likely candidates for Sprint 4:
- Backend wiring (Supabase) — to enable multi-device and real persistence
- Real geolocation — to make the geographic constraint physical
- Visual decay over time — pixel fade for the "soft decay" persistence model
- Onboarding flow — for when other people use it

Decide based on what the retrospective surfaces. Don't pre-commit.