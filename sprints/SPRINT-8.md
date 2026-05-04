# SPRINT-8.md — Prompts to Supabase

This sprint replaces the hardcoded prompt list with a Supabase-backed system that supports new prompts taking priority, falls back to least-recently-used when fresh prompts run out, and lets you curate prompts via the Supabase dashboard rather than redeploying.

The sprint also includes writing 50+ better prompts following the philosophy we established: anchored in the senses, observational rather than imaginative, specific in subject but open in interpretation.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-7.md.

---

## The Goal

Three things, in order:

1. **Move prompts from hardcoded array to Supabase.** The current `tuning.ts` prompts get deleted. A new `prompts` table is the source of truth. Adding or editing prompts no longer requires a deploy.

2. **Smart daily selection.** A new prompt is preferred if available. If no new prompts, the system falls back to least-recently-used. Future-you can also schedule specific prompts for specific dates.

3. **Write 50+ better prompts.** Following the philosophy: sensory, observational, specific-yet-open. Not the thin generic list currently in the codebase.

---

## What's Changing

### Prompt Storage
- **Before:** Hardcoded array in `src/config/tuning.ts`, rotates deterministically by day-of-year
- **After:** Supabase `prompts` table, rotated via stateful selection logic that prefers new prompts

### Curation Workflow
- **Before:** Edit `tuning.ts`, commit, deploy
- **After:** Edit `prompts` table directly in Supabase dashboard, no redeploy needed

### Selection Behavior
- **Before:** Deterministic by day — same prompt on March 15 every year
- **After:** Stateful — new prompts used first, then least-recently-used random fallback, with optional scheduling

### Prompt Quality
- **Before:** Mix of decent and generic prompts
- **After:** 50+ prompts following the documented philosophy

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Schema Requirements
- [ ] A `prompts` table exists in Supabase with the documented schema
- [ ] A `daily_prompt` table exists for tracking which prompt is active each day
- [ ] Indexes are created for the queries the selection function needs
- [ ] RLS is enabled — anonymous users can read prompts but not write them
- [ ] Anonymous users can call the daily selection RPC

### Selection Function Requirements
- [ ] A Postgres function `get_or_create_daily_prompt()` is deployed and callable from the client
- [ ] On first call of a given day, the function selects a prompt and records it in `daily_prompt`
- [ ] On subsequent calls the same day, it returns the already-selected prompt (idempotent)
- [ ] Selection priority: scheduled → new (unused) → least-recently-used
- [ ] When a prompt is selected, its `used_at` is updated to today's date

### Client Integration Requirements
- [ ] The client fetches today's prompt by calling the RPC, not by reading hardcoded data
- [ ] The hardcoded `prompts.list` array is removed from `tuning.ts`
- [ ] The toolbar displays the prompt fetched from Supabase
- [ ] If the RPC fails (network error, etc.), the toolbar shows a graceful empty state — no error message blocking the UI

### Content Requirements
- [ ] At least 50 approved prompts exist in the database
- [ ] Prompts follow the philosophy documented below
- [ ] Prompts are seeded as part of this sprint (not a separate task)

### Constraints
- [ ] Builds on top of Sprint 7's repo
- [ ] No changes to the welcome flow, Doodle button, drawing toolbar, or map rendering
- [ ] No custom admin UI — the Supabase dashboard is the management interface
- [ ] No LLM-generated prompts in this sprint (deferred to a future sprint)
- [ ] Existing hardcoded prompts in `tuning.ts` are deleted (fresh start)

---

## The Schema

### The `prompts` Table

```sql
CREATE TABLE prompts (
  id BIGSERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',  -- 'draft' | 'approved' | 'retired'
  used_at DATE,                              -- NULL if never used
  scheduled_for DATE,                        -- NULL unless explicitly scheduled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT                                 -- optional admin notes
);

CREATE INDEX idx_prompts_status_used ON prompts (status, used_at);
CREATE INDEX idx_prompts_scheduled ON prompts (scheduled_for);
```

### The `daily_prompt` Table

```sql
CREATE TABLE daily_prompt (
  date DATE PRIMARY KEY,
  prompt_id BIGINT NOT NULL REFERENCES prompts(id),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Row-Level Security

```sql
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prompt ENABLE ROW LEVEL SECURITY;

-- Anyone can read prompts (needed for the RPC to work)
CREATE POLICY "Anyone can read prompts" ON prompts
  FOR SELECT USING (true);

-- Anyone can read daily_prompt
CREATE POLICY "Anyone can read daily_prompt" ON daily_prompt
  FOR SELECT USING (true);

-- Writes happen only via the service role (Supabase dashboard) and the RPC function
-- No INSERT/UPDATE/DELETE policies for anonymous users
```

The RPC function will run with `SECURITY DEFINER` so it can write to these tables even though anonymous users can't write directly. This is the standard Postgres pattern for "anonymous users trigger this function, but the function itself has elevated privileges."

---

## The Selection Function

The Postgres function is the heart of the sprint. It encodes the entire selection logic on the database side.

```sql
CREATE OR REPLACE FUNCTION get_or_create_daily_prompt()
RETURNS TABLE(text TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  selected_id BIGINT;
BEGIN
  -- Step 1: Has today's prompt already been selected?
  SELECT prompt_id INTO selected_id
  FROM daily_prompt
  WHERE date = today;
  
  IF selected_id IS NOT NULL THEN
    RETURN QUERY SELECT p.text FROM prompts p WHERE p.id = selected_id;
    RETURN;
  END IF;
  
  -- Step 2: Is there a prompt scheduled for today?
  SELECT id INTO selected_id
  FROM prompts
  WHERE status = 'approved' AND scheduled_for = today
  LIMIT 1;
  
  -- Step 3: If not, try a new (unused) approved prompt
  IF selected_id IS NULL THEN
    SELECT id INTO selected_id
    FROM prompts
    WHERE status = 'approved' AND used_at IS NULL AND scheduled_for IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- Step 4: If no new prompts, fall back to least recently used
  IF selected_id IS NULL THEN
    SELECT id INTO selected_id
    FROM prompts
    WHERE status = 'approved' AND scheduled_for IS NULL
    ORDER BY used_at ASC NULLS LAST
    LIMIT 1;
  END IF;
  
  -- Step 5: Mark the prompt as used and record in daily_prompt
  IF selected_id IS NOT NULL THEN
    UPDATE prompts SET used_at = today WHERE id = selected_id;
    INSERT INTO daily_prompt (date, prompt_id) VALUES (today, selected_id);
    RETURN QUERY SELECT p.text FROM prompts p WHERE p.id = selected_id;
  END IF;
  
  -- If we got here, there are no approved prompts at all — return empty
  RETURN;
END;
$$;

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION get_or_create_daily_prompt() TO anon, authenticated;
```

### Why This Function Works The Way It Does

**Idempotent.** Multiple calls in a single day return the same prompt. Only the first call actually selects.

**Atomic.** All the database operations (SELECT, UPDATE, INSERT) happen inside a single function call, so concurrent calls can't double-select.

**Stateful.** Selection depends on what's been used before, so the system "rotates through" available prompts naturally.

**Excludes scheduled prompts from the unused pool.** A prompt scheduled for next Tuesday shouldn't be picked today by accident. The `scheduled_for IS NULL` filter in steps 3 and 4 handles this.

**Falls back gracefully.** If there are no prompts at all, the function returns nothing. The client handles the empty state.

---

## Client Integration

### Replace The Hardcoded Selection

In `tuning.ts`, the current prompts list looks something like:

```typescript
prompts: {
  rotationHour: 6,
  list: [
    "Draw something you'd find at the deli",
    // ... 30 prompts
  ],
}
```

Remove `list` entirely. Keep `rotationHour` if it's still used elsewhere.

### Update The Prompt Fetch

Wherever the client currently reads `TUNING.prompts.list[someIndex]`, replace with a call to the RPC:

```typescript
// src/lib/prompts.ts

import { supabase } from './supabase'

export async function getCurrentPrompt(): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_daily_prompt')
  
  if (error) {
    console.error('Failed to fetch prompt:', error)
    return ''
  }
  
  if (!data || data.length === 0) {
    return ''
  }
  
  return data[0].text
}
```

### Cache Today's Prompt

Once fetched, cache the prompt for the rest of the session. Don't re-fetch on every render.

```typescript
let cachedPrompt: { text: string; date: string } | null = null

export async function getCurrentPrompt(): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  
  if (cachedPrompt && cachedPrompt.date === today) {
    return cachedPrompt.text
  }
  
  const { data, error } = await supabase.rpc('get_or_create_daily_prompt')
  
  if (error || !data || data.length === 0) {
    return ''
  }
  
  cachedPrompt = { text: data[0].text, date: today }
  return data[0].text
}
```

The cache invalidates when the date changes (next day's first call refetches). This handles the rotation hour naturally — when local midnight passes, the date changes and the next fetch will get tomorrow's prompt.

### Handling The Empty State

If the RPC returns no prompt (database is empty, or all prompts retired), the toolbar should not display a broken-looking UI. Two approaches:

**A. Show a default fallback string.** Something quiet like "Draw what you see today."
**B. Hide the prompt area entirely.** The toolbar just doesn't show a prompt.

My vote: **B, hide it.** A static fallback would create confusion if it stayed up for a long time. Better to show nothing than something wrong.

The toolbar's prompt component should accept an empty string and render null in that case.

---

## The Prompts (Initial 50+)

These prompts follow the philosophy from earlier in our conversation:

- **Anchored in the senses or the body.** Not in abstract feelings.
- **Observational, not imaginative.** What's actually around you.
- **Specific in subject, open in style.** Concrete enough to start, vague enough to vary.
- **Achievable in 30 seconds.** Small contributions beat ambitious ones.
- **Trust the user's interpretation.** Take it literally, metaphorically, or subvert it.

### Sensory Observation (12 prompts)

1. Draw a sound you can hear right now.
2. Draw something you can smell.
3. Draw the texture under your fingertips.
4. Draw what's in your peripheral vision.
5. Draw a color you didn't expect to see today.
6. Draw the loudest thing you've heard today.
7. Draw the quietest thing in this room.
8. Draw the temperature.
9. Draw what your hands are touching.
10. Draw the shape of a sound.
11. Draw the warmest spot you can find.
12. Draw something you only noticed because you stopped moving.

### Hyperlocal NYC (12 prompts)

13. Draw something you'd find at the deli.
14. Draw something only locals would notice.
15. Draw the closest piece of trash to you.
16. Draw a window that isn't yours.
17. Draw something you walk past every day without seeing.
18. Draw the sign on your nearest corner.
19. Draw a stranger's hat.
20. Draw the inside of a bodega.
21. Draw the building across the street.
22. Draw what you can see from where you're sitting.
23. Draw a piece of street art near you.
24. Draw something that's been there longer than you.

### Domestic and Personal (10 prompts)

25. Draw the thing on your desk you don't need but won't throw away.
26. Draw your favorite mug.
27. Draw what's in your pocket.
28. Draw the food you ate most recently.
29. Draw a plant in your apartment.
30. Draw something you've owned for ten years.
31. Draw the first thing you touch in the morning.
32. Draw your most-used object today.
33. Draw the corner of your room.
34. Draw what's on the floor right now.

### Time and Weather (8 prompts)

35. Draw the sky right now.
36. Draw what time feels like today.
37. Draw the light coming through a window.
38. Draw a shadow.
39. Draw the weather without using clouds or sun.
40. Draw what season it actually feels like.
41. Draw the hour you most enjoyed today.
42. Draw the moon, even if you can't see it.

### Memory and Nostalgia (8 prompts)

43. Draw a place you used to go that's gone now.
44. Draw something from a trip.
45. Draw a meal you remember from childhood.
46. Draw a friend's face from memory.
47. Draw a room you don't live in anymore.
48. Draw something you've lost.
49. Draw a smell that takes you somewhere else.
50. Draw a sound you'll never hear again.

### Whimsy and Play (10 prompts)

51. Draw a creature that doesn't exist but should.
52. Draw something at the wrong scale.
53. Draw a tiny thing as big as you can.
54. Draw a face on something that doesn't have one.
55. Draw what a pigeon is thinking.
56. Draw a small joke.
57. Draw the inside of an animal you'll never see inside of.
58. Draw a door to somewhere unexpected.
59. Draw a thing that's about to happen.
60. Draw something almost embarrassing.

### Total: 60 prompts

This gives a buffer beyond the 50-minimum requirement. You can edit, retire, or replace any of these via the Supabase dashboard. Adding more is just inserting rows.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Run the schema SQL in Supabase to create `prompts` and `daily_prompt` tables, indexes, and RLS policies | 20 min | Tables exist with correct constraints |
| 2 | Deploy the `get_or_create_daily_prompt` Postgres function | 30 min | Function exists and is callable from anon role |
| 3 | Test the function manually in Supabase SQL editor: insert a test prompt, call the function, verify selection logic | 30 min | Function works correctly with test data |
| 4 | Build `getCurrentPrompt()` client function with session-level caching | 30 min | Client can fetch today's prompt from RPC |
| 5 | Replace the hardcoded prompt usage in the existing toolbar code with the new client function | 30 min | Toolbar displays prompts from Supabase |
| 6 | Remove `prompts.list` from `tuning.ts` | 10 min | Hardcoded prompts gone |
| 7 | Insert all 60 prompts from this sprint into the `prompts` table via Supabase dashboard or a migration script | 60 min | Database populated with approved prompts |
| 8 | Test the empty-state handling: temporarily set all prompts to status `retired`, verify toolbar shows blank | 15 min | Empty state is graceful |
| 9 | Verify prompts cycle correctly across multiple days (manually advance dates if needed for testing) | 30 min | Selection logic works in practice |
| 10 | Mobile test: re-deploy to Vercel and verify on phone | 30 min | Works on mobile |
| 11 | Document any non-blocking issues in BACKLOG.md | 15 min | Sprint complete |

**Total estimated time: ~5 hours**

---

## Testing Checklist

### Scenario 1: First Day Of Use
- Database has 60 prompts, all `status = 'approved'`, all `used_at IS NULL`
- Open the app for the first time today
- The toolbar shows a prompt
- Check the database — `daily_prompt` has today's date with a `prompt_id`, and that prompt's `used_at` equals today
- ✅ Pass: prompt appears, database state is correct

### Scenario 2: Subsequent Visits Same Day
- Open the app multiple times during the day
- Toolbar shows the same prompt every time
- `daily_prompt` is unchanged (no duplicate inserts)
- `used_at` on the selected prompt is unchanged
- ✅ Pass: idempotent

### Scenario 3: New Day, New Prompt
- Day passes (or manually set system date forward)
- Open the app
- Toolbar shows a different prompt than yesterday
- The new prompt's `used_at` equals the new date
- ✅ Pass: rotation works

### Scenario 4: New Prompts Preferred
- Some prompts have `used_at` set to past dates, others are `NULL`
- Trigger today's selection
- Selected prompt should be one with `used_at IS NULL`, not a previously-used one
- ✅ Pass: new prompts get priority

### Scenario 5: Fallback To Least Recently Used
- Manually update all prompts to have `used_at` set (no new prompts available)
- Trigger today's selection
- Selected prompt should be the one with the oldest `used_at`
- ✅ Pass: fallback works

### Scenario 6: Scheduled Prompt
- Manually set `scheduled_for = today` on a specific prompt (and set its `used_at` to NULL or any value)
- Trigger today's selection
- Selected prompt should be the scheduled one, even if there are unused non-scheduled prompts
- ✅ Pass: scheduling overrides default selection

### Scenario 7: Empty Database
- Mark all prompts as `status = 'retired'`
- Open the app
- Toolbar shows no prompt area (or empty state, depending on implementation)
- ✅ Pass: graceful empty state

### Scenario 8: RPC Failure
- Temporarily break the RPC (e.g., wrong function name in client)
- Open the app
- Toolbar handles the error gracefully — no error modals, no broken UI
- ✅ Pass: error handled

### Scenario 9: Adding A Prompt Via Supabase Dashboard
- Open Supabase dashboard, go to `prompts` table, insert a new row with `text = "Draw a chair"`, `status = 'approved'`
- Wait until tomorrow (or set system date forward)
- Open the app
- The new "Draw a chair" prompt may or may not appear (depends on FIFO order — older prompts come first)
- Insert another prompt with the same `created_at` you control, verify behavior
- ✅ Pass: dashboard-added prompts enter the rotation correctly

---

## What Counts as Success

The sprint succeeds when:

1. The hardcoded prompts list is gone from the codebase
2. The Supabase `prompts` table is the source of truth
3. New prompts can be added via the Supabase dashboard without redeploying
4. The selection function prioritizes new prompts, falls back to least-recently-used
5. The client fetches and displays today's prompt correctly
6. 60 well-crafted prompts are seeded in the database
7. All test scenarios pass

---

## What Counts as Failure

- Hardcoded prompts still being used somewhere
- Same prompt selected multiple days in a row when new prompts are available
- RPC failures crash the toolbar or block the UI
- Adding a prompt via Supabase dashboard doesn't take effect (caching issues)
- Selection function picks scheduled prompts on the wrong date
- The 60 prompts in the database don't match the philosophy (too generic, too directive, too abstract)

---

## What's Out of Scope

To stay focused, do NOT build in this sprint:

- A custom admin UI (use Supabase dashboard instead)
- LLM-generated prompts (deferred)
- Authentication or admin allowlists (Supabase dashboard handles auth via service role)
- Open days / no-prompt-today capability (deferred)
- Prompt categorization or tagging
- User-submitted prompts
- Voting on prompts
- Mode infrastructure (deferred)
- Anything from Sprint 9+

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, and SPRINT-1 through SPRINT-7 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **Use Opus, not Sonnet, for this sprint.** Postgres function development requires care.
- **Stay in plan mode for the full plan review before executing.** Walk through every step.
- **The Postgres function (Step 2) is the most complex piece.** Test it thoroughly before integrating with the client.
- **Do NOT build a custom admin UI.** The Supabase dashboard is the management interface. If you find yourself building admin pages, stop — that's out of scope.
- **The 60 prompts are part of the deliverable.** They need to actually land in the database, not just exist in this doc. Use the Supabase dashboard or a one-time SQL script.
- **If you hit ambiguity, stop and ask.** Don't make UX or architectural decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is a working prompt system with real content, managed through the Supabase dashboard. Optimize for "no regressions, real prompts in the database, rotation works correctly."

---

## After the Sprint

Once Sprint 8 ships:

1. **Verify on phone.** Walk through each test scenario.
2. **Use it for at least a week.** Notice which prompts feel right, which feel off, which produce interesting work in the actual wall (or in your head if no users yet).
3. **Curate prompts via the Supabase dashboard.** Retire the ones that don't work. Add new ones as ideas occur.
4. **Tell me Sprint 8 is done.** I'll generate Sprint 9 (welcome flow improvements).

The remaining sprints in this batch:
- **Sprint 9:** Welcome flow improvements — smaller scope than the previous attempt, no architectural changes

Then Sprint 10+ for mode infrastructure, weekly modes, and beyond.