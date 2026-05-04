# BACKLOG.md — The Wall

Non-blocking issues and deferred items, in rough priority order.

---

## From Sprint 7

### GPS refinement / enterDraw animation race (low risk)
When the user clicks Doodle with `permission === 'prompt'` and grants location, both `enterDraw()` and the GPS refinement `useEffect` call `captureLocationForSession()` concurrently. The mode-check inside the refinement's `.then()` (`if (mode !== 'browse') return`) guards against double-animation, but it relies on React 18's batched state updates resolving enterDraw's `setMode('animating')` before the refinement effect re-runs. Has not caused visible issues in testing; worth watching if animation glitches are reported on mid-session grants.

### `neighborhoodZoom` tuning
Currently `3` (≈ 1,250 ft wide on mobile). Right for dense hackathon context; may want to lower to `1.0–1.5` (broader neighborhood view) if feedback says the landing feels too close.

---

## From Sprint 8

### Prompt cache invalidates only on date change — no live refresh
Today's prompt is cached in memory for the session. If the `prompts` table is edited mid-day (e.g., retiring the day's prompt via Supabase dashboard), the running app won't pick up the change until the next page load. Acceptable at current scale; add a refresh mechanism if prompt editing during the day becomes a workflow.

### LLM-generated prompts deferred
Generating or curating prompts via Claude API was explicitly deferred. Consider adding an LLM-assisted prompt generation workflow (call Claude, review in Supabase dashboard) in a future sprint when the initial 60 prompts start to cycle.

### No admin UI for prompt management
Prompt curation happens entirely through the Supabase dashboard. If non-technical team members need to manage prompts, a lightweight admin interface becomes necessary.
