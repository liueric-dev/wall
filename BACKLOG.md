# BACKLOG.md — The Wall

Non-blocking issues and deferred items, in rough priority order.

---

## From Sprint 7

### GPS refinement / enterDraw animation race (low risk)
When the user clicks Doodle with `permission === 'prompt'` and grants location, both `enterDraw()` and the GPS refinement `useEffect` call `captureLocationForSession()` concurrently. The mode-check inside the refinement's `.then()` (`if (mode !== 'browse') return`) guards against double-animation, but it relies on React 18's batched state updates resolving enterDraw's `setMode('animating')` before the refinement effect re-runs. Has not caused visible issues in testing; worth watching if animation glitches are reported on mid-session grants.

### `neighborhoodZoom` tuning
Currently `3` (≈ 1,250 ft wide on mobile). Right for dense hackathon context; may want to lower to `1.0–1.5` (broader neighborhood view) if feedback says the landing feels too close.
