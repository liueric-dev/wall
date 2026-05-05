# ROADMAP.md — The Wall

This document captures forward-looking work, deferred features, and open strategic questions. It exists so decisions don't get lost between sprints, and so future-you (or future-collaborators) can see the shape of the path without it being scattered across sprint docs.

For product principles, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For technical blueprint, see ARCHITECTURE.md.

---

## Document Purpose

Three things this document captures:

1. **What's been done** — completed sprints and current state
2. **What's near-term** — sprints planned in concrete terms
3. **What's beyond** — strategic decisions and possible directions, with open questions made explicit

The roadmap is reviewed and updated at the end of each sprint. It is not a contract. Anything in the "beyond" section may change based on what real usage reveals.

**Sprint docs should not contain forward-looking work.** All "we might want this later" thinking lives here, not in sprint docs. Sprint docs are about immediate scope only.

---

## Current State (Through Sprint 12)

Completed sprints:
- **Sprint 1** — City rendering with pan/zoom on canvas
- **Sprint 2** — Tap drawing, color picker, localStorage persistence
- **Sprint 3** — Daily prompt system, sliding window budget, removed undo
- **Sprint 4** — Migrated to Supabase, 5s polling, RLS enabled
- **Sprint 5** — Real GPS, onboarding flow, Vercel deployment
- **Sprint 6** — Post-welcome UI cleanup (banner removed, Doodle button improvements)
- **Sprint 7** — Smart default centering with session restoration
- **Sprint 8** — Daily prompts moved to Supabase with smart selection
- **Sprint 9** — Interaction fixes (toast position, zoom limits, two-finger pan, draw mode zoom cap)
- **Sprint 10** — Geography above pixels (city outline always visible, reserved outline color)
- **Sprint 11** — Adaptive polling (mode-aware intervals, backgrounding pause, centralized event handler)
- **Sprint 12** — Drawing experience v2 (hex storage migration, 10-color palette, tap-only drawing, two-row toolbar, lower pixel cap)

The product is functional and complete enough to be used by real people in real neighborhoods.

---

## Near-Term Sprints

These are planned in concrete-enough terms to ship soon. Each is sized to fit in 1-2 sessions.

### No Currently Planned Sprints

After Sprint 12, the product is in a stable state. Most subsequent work is reactive to real usage rather than predetermined.

The next sprint should be triggered by a specific signal — user feedback, a real bottleneck, a clearly desired feature — not by "what's next on the list."

---

## Reactive Sprints (Triggered By Specific Signals)

These don't have a fixed order. They get built when reality demands them. Each is responsive to a specific signal.

### WebSockets In Draw Mode

**Trigger:** When 2-second polling in draw mode (Sprint 11) feels insufficient. Specifically: real-time collaborative drawing becomes a meaningful use case, or users complain about lag.

**What it does:** Layers Supabase Realtime subscriptions on top of the polling baseline. WebSocket-based updates in draw mode, polling continues as fallback. Architecture from Sprint 11 (centralized event handler) accommodates this without restructuring.

**Estimated effort:** 10-15 hours

**Decision point:** Don't pre-commit. Use the product. If 2s polling feels good enough, this is unnecessary.

### Tile Cache Restoration

**Trigger:** Write performance becomes a perceptible bottleneck (likely 100+ concurrent active users).

**What it does:** Sprint 12 disabled the tile cache (since it stored palette indices that no longer exist). This sprint would design and implement a new tile cache format compatible with hex storage. Options: hex JSON arrays, RGB byte arrays, or palette-snapshot indices.

**Estimated effort:** 6-10 hours

### Server-Side Budget Enforcement

**Trigger:** First measurable abuse, or active user count exceeds ~50.

**What it does:** Moves pixel budget tracking from localStorage to Supabase. The `user_budgets` table already exists; this sprint wires it up.

**Estimated effort:** 6-8 hours

### LLM-Generated Prompts

**Trigger:** Approved prompt pool is running low (~20 unused remaining).

**What it does:** Adds an LLM integration that drafts new prompts in The Wall's voice. Drafts go to a "pending review" status; approval happens via Supabase dashboard.

**Estimated effort:** 5-8 hours

### Account System + Personal History View

**Trigger:** Users explicitly ask 2-3 times. Or when cross-device continuity becomes a real need.

**Scope:**
- OAuth-based accounts (Apple + Google as primary; magic link or email/password as possible additions)
- Optional accounts — anonymous usage continues to work forever
- Personal history view: user can see all pixels they've placed
- Cross-device continuity (sign in on phone, see your work on laptop)
- Anonymous-but-claimable sessions: existing localStorage UUID can be associated with a new account at signup

**Open question:** What do accounts unlock beyond history and continuity? See "Open Questions" below.

**Estimated effort:** 15-20 hours

### Persistence Model Decision

**Trigger:** Enough real usage data to make an informed decision (likely 6+ months of operation).

**What it does:** Resolves the open question about whether pixels persist forever, decay visually over time, or reset periodically.

**Estimated effort:** Highly variable depending on chosen model. Decay-based: 10+ hours. Periodic resets: ~5 hours.

### Moderation Tooling

**Trigger:** First inappropriate content appears that requires more than ad-hoc handling via Supabase dashboard.

**Scope:**
- Report buttons on suspect pixels/areas
- Moderation queue
- Possibly automated flagging via image analysis on tile renders
- Audit log of removals

**Estimated effort:** 15+ hours for a real system

### Mode Infrastructure

**Status:** Originally planned as Sprint 11 but deferred. Genuine concerns surfaced about whether modes (rule modifications) actually serve the manifesto.

**Trigger:** Real usage data suggests the product needs more variety than daily prompts provide. Or a specific mode idea emerges that's compelling enough to build for its own sake.

**Scope:** A flexible framework supporting different mode types (constraint modes, mechanic modes, ritual modes, etc.). First mode would likely be a constraint mode (like Two-Color Week) but could be a meaning-driven mode (collective attention, embodied participation, marking time).

**Estimated effort:** 12-15 hours for infrastructure + first mode

**Important caveat:** The original Sprint 11 plan was paused because the mode types we'd designed felt mechanical rather than meaningful. Before building mode infrastructure, decide what kind of variety the product actually needs. May not be modes at all — could be better prompts, occasional cultural moments, or simple time-based events.

### Welcome Flow Polish

**Trigger:** User feedback indicates the welcome flow is confusing or missing something.

**Scope:** Visual improvements (typography, copy, interactions) within the existing welcome screen architecture. No structural changes.

**Note:** Originally planned as a sprint, but user said the current welcome flow works fine. Skip until there's a specific signal.

**Estimated effort:** 3-5 hours

---

## Long-Term Strategic Decisions

These involve real strategic decisions, not just engineering. Appropriate to think about now, but not appropriate to commit to until much later.

### Multi-City Strategy & Expansion

**Trigger:** NYC has been thriving for at least one year, with active community and meaningful archive.

**Status:** Open question, deliberately undecided. Three architectures possible:
- One product, many city instances (shared codebase + cross-city browsing)
- Federation (each city is its own product)
- Tiered (same software, culturally autonomous deployments)

**Current leaning:** Tiered architecture — same software, deployed per city, each city operationally independent with its own moderators, prompt curation, and modes. Users can have one account across cities, but each city's wall is its own irreplaceable artifact.

**Resolution path:** Defer until NYC is genuinely thriving. Probably 12-18 months minimum.

### Posters, Prints, and Monetization

**Trigger:** Archive has accumulated meaningful moments worth preserving in print form.

**Scope:**
- High-quality archival render system
- Pricing and fulfillment infrastructure (probably outsourced to a print-on-demand service)
- Curation of which moments are worth offering as prints

**Earliest realistic timeline:** 12-18 months from MVP launch.

### Real-Time Collaborative Drawing (Beyond WebSockets)

**Trigger:** Synchronous drawing emerges as a dominant use case beyond what basic WebSockets handle.

**Scope:** Live cursors, stroke previews, real-time presence indicators. Significant complexity beyond simple pub/sub.

**Probability of being needed:** Uncertain. Asynchronous use is the dominant pattern at MVP scale.

### Anti-Spoofing Layers

**Trigger:** First measurable GPS abuse incidents.

**Scope:**
- IP geolocation as cross-check
- WiFi BSSID fingerprinting (advanced)
- Behavioral signals (drawing patterns inconsistent with claimed location)

**Estimated effort:** Highly variable. IP-based first pass: ~3 hours. Full system: 20+ hours.

### Native Mobile Apps

**Trigger:** PWA limitations actively bite. Currently no specific reason to go native.

**Position:** Stay PWA-only until a specific limitation forces the issue. If native becomes necessary, consider PWA-wrapping tools (Capacitor, PWABuilder) before committing to a separate native codebase.

### Marketing & Public Presence

**Trigger:** Product is genuinely loved by 20+ people and ready to be shared more broadly.

**Scope (worth doing eventually):**
- Simple landing page that explains The Wall to a curious visitor
- "About" or manifesto-excerpt page
- Open Graph / Twitter card images for shareable URLs
- Press contact

**Scope (probably never):**
- SEO optimization
- Paid ads
- Growth funnels
- Newsletter signup forms
- "Coming soon" pages with email capture

### Domain Name

**Status:** Should buy soon (low effort task, ~30 minutes). Vercel-generated URL works fine until then.

**Likely candidates:** `thewall.nyc`, `wallnyc.app`, similar.

---

## Open Questions

These are real strategic questions that don't have answers yet. Listing them explicitly so they're not forgotten.

### Q1: What Do Accounts Unlock?

When the account system is built, what does signing up actually give the user?

**Confirmed:** Personal history view, cross-device continuity.

**Undecided:** Whether accounts unlock additional capabilities (higher pixel budgets, faster regen, etc.) or whether they're capability-equal with anonymous users.

**The tension:** "Higher limits for accounts" creates an incentive to sign up but introduces a class divide on the wall — anonymous users draw under different constraints than account users. This conflicts with the manifesto's egalitarian framing of constraint as a shared design feature. But it's also a normal pattern in many products that rewards commitment.

**Resolution path:** Defer until the account system is being designed. Real usage data may inform the decision. Make the decision deliberately when the time comes, and update PRODUCT.md and MANIFESTO.md to reflect it.

### Q2: Persistence Model

Do pixels persist forever, decay visually over time, or reset periodically?

**Considerations:**
- Permanent + decay: aligns with cultural document framing. Old work fades but isn't lost.
- Periodic resets: creates rhythm, lets the wall feel "new" periodically. Loses long-term archive depth.
- Hybrid (permanent base + resetting overlay): ambitious, complex, possibly the most interesting answer.

**Resolution path:** Wait for usage data. Decision becomes obvious or contentious based on what the wall starts to look like over months.

### Q3: Multi-City Architecture

See "Long-Term Strategic Decisions" above. Three options possible. Current leaning toward "Tiered" but uncommitted.

### Q4: Native Apps vs. PWA

Stay PWA-only until a specific reason to go native. Revisit only if PWA limitations bite.

### Q5: How Does Marketing Happen?

How does The Wall get more users without becoming an attention-mining machine?

**Position:** Build a simple landing page when the product is ready to be shared more broadly (post-real-user-validation). Avoid the growth-funnel playbook indefinitely.

### Q6: Notifications

Should the product ever send notifications, or stay pull-only?

**Current position (manifesto):** No notifications. Ritual over compulsion.

**Resolution path:** Defer indefinitely. Revisit only if users specifically request it, and even then design extremely carefully.

### Q7: What Does The Product Need For Variety?

Originally planned to address with mode infrastructure, but that work was paused because the mode types didn't feel meaningful enough.

**Real question:** Is variety needed at all? If so, does it come from:
- Better-designed prompts (extending what already works)
- Occasional cultural moments (one-off events tied to real-world dates)
- Mode infrastructure (rule modifications applied for periods)
- The user's own exploration of the wall (no product changes)
- Time itself (the archive deepens)

**Resolution path:** Don't decide preemptively. Use the product. Notice what feels missing. The answer will emerge from real use.

### Q8: Re-Litigated Decisions

Some decisions have been visited and revisited. Worth naming so they don't get re-relitigated:

- **Cream as a "color":** removed from user-selectable palette in Sprint 12. Stays as background only. Don't bring it back.
- **Two near-identical darks (charcoal + soft black):** consolidated to single black in Sprint 12 palette. Don't add a second dark.
- **Tap-and-drag drawing:** removed in Sprint 12 to eliminate accidental brushstrokes. Don't add back.
- **Undo:** removed in Sprint 3 to make pixels feel weighty. Don't add back.
- **The 10-color palette:** locked after extensive iteration. The final palette is:
  ```
  #1a1a1a  Black
  #f0ebe0  Off-white
  #e63946  Red
  #ed8a3a  Orange
  #f0c52a  Yellow
  #4a8a64  Green
  #4a78a0  Blue
  #ed6b96  Pink
  #7a5db0  Purple
  #8b5d40  Brown
  ```
  This palette was chosen with accessibility (colorblind distinguishability via lightness contrast), iconicness (cohesive warm-tinted character), and long-term durability (avoids trendy saturation, prints cleanly) in mind. The hex storage migration in Sprint 12 means individual colors *could* be tweaked later without affecting the database, but the palette as a set should be considered final. Don't reopen this without a strong reason.

---

## Things That Probably Never Get Built

For the sake of clarity about what The Wall is *not*:

- A/B testing infrastructure (the principles are stable; A/B testing implies they're negotiable)
- Algorithmic feeds or recommendations
- Profiles, follower counts, or any public identity beyond pixels on the wall
- Voting, leaderboards, or competitive mechanics
- Marketplace features (selling user creations, NFTs, commissioned art)
- Family/group/private canvases (one canvas, public, shared)
- Targeted advertising
- Selling user data or behavior patterns

If a future feature pulls toward any of these, it gets rejected.

---

## Speculative Scaffolding To Avoid

Sprint docs have historically included scaffolding for "future sprints might use this." Going forward, this is anti-pattern:

**Examples of scaffolding that produced unused code:**
- Connection state hooks built before any UI consumes them
- Event ID dedup Sets built before duplicate events are an actual problem
- Mode infrastructure designed before knowing what modes should be

**Better pattern:** Build only what the current sprint needs. Add infrastructure when the consumer is also being built. The consumer informs what the infrastructure should look like.

If sprint docs include speculative scaffolding, push back during plan mode.

---

## How To Use This Document

### When To Read It

- At the start of each new sprint, to remember context
- When deciding what to work on next
- When pushed to add a feature that doesn't fit (check the "never built" list)
- When real usage surfaces something that triggers a reactive sprint

### When To Update It

- At the end of each sprint, to update "Current State" and shift completed items
- When an open question gets resolved
- When a trigger fires for a reactive sprint (note the trigger and the response)
- When new strategic questions emerge
- When new "we might want this later" thinking comes up that should not pollute sprint docs

### What Not To Do

- Don't treat this as a commitment. The "beyond" section is exploratory.
- Don't extend it beyond ~12 months out. Roadmaps that try to predict 2 years are works of fiction.
- Don't add features just because they fit. Each addition should pass the "does this serve the manifesto" test.
- Don't put sprint-immediate work here. Sprint docs are for that.
- Don't put forward-looking work in sprint docs. This is for that.

---

## A Note On Pacing

The Wall is not a startup. The manifesto says so explicitly. This means the roadmap doesn't aim for shipping velocity for its own sake.

After Sprint 12, the product is *operationally* complete. Most subsequent work is editorial (curating prompts, designing modes, watching the wall grow) rather than feature-driven.

The right rhythm is probably:
- **Months 1-3 (post-MVP):** Small reactive sprints based on real user feedback
- **Months 3-6:** Operational period. Curate prompts. Watch what happens. Reactive sprints when triggers fire.
- **Months 6-12:** Continue operating. Decisions get made on persistence, accounts, etc., based on real data. Strategic conversations begin about cities, prints.
- **Year 2+:** The Wall is now a *cultural document* rather than a *product*. Operation matters more than building.

This is a feature, not a bug. If you find yourself wanting to ship features just to ship features, that's a signal worth examining.