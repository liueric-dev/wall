# SPRINT-10.md — Geography Above Pixels

This sprint makes the city's identity permanent. The base map's coastline and park outlines render above the pixel layer, so the city stays recognizable no matter what users draw. The outline color is reserved — never selectable from the palette — so the geography is always visually distinct from contributions.

This is a small, contained sprint focused on visual rendering only.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-9.md.

---

## The Goal

Two changes to the base map's visual treatment:

1. **Render order:** the base map (coastline + park outlines) renders *above* the pixel layer instead of below it. Users draw underneath the geography, not over it.

2. **Reserved outline color:** the outline uses a color that's not in the user-selectable palette (`#a89a8c` as the starting point — warm gray-brown). Users cannot accidentally make the outline blend into their drawings by painting in the same color.

Together, these ensure NYC stays recognizable as the wall fills with pixels over months and years.

---

## What's Changing

### Render Order
- **Before:** Pixel layer renders on top; base map is underneath. Users painting over coastline obscure the outline.
- **After:** Base map renders on top; pixel layer is underneath. Coastline and park outlines are always visible.

### Outline Color
- **Before:** Outline color may overlap with palette colors; can blend into pixel art when users draw in the same color.
- **After:** Outline color is reserved (`#a89a8c`), not selectable from the palette. Always visually distinct from any contribution.

### Bridges, Water, Other Features
- **Before:** Only land mass and major park outlines exist on the map. Bridges, water boundaries, and other features are blank.
- **After:** Same — no changes. Bridges and water remain blank canvas. Pixels can appear there normally.

### Welcome Flow, Drawing Behavior, Everything Else
- **Before/After:** No changes. This sprint only touches the base map's rendering.

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Render Order Requirements
- [ ] The base map's SVG (coastline + park outlines) renders on a canvas layer above the pixel layer
- [ ] Pixels are visible up to the edges of the outline strokes
- [ ] Pixels next to the coastline appear "underneath" the coastline visually — the outline is always on top
- [ ] The render order change doesn't break the existing pan/zoom or drawing interactions

### Outline Color Requirements
- [ ] The outline renders in `#a89a8c` (warm gray-brown) as the starting value
- [ ] The color is defined as a constant (e.g., `OUTLINE_COLOR`) in a single place, not scattered across the codebase
- [ ] The color is NOT in the user-selectable palette
- [ ] The outline is visible against all 8 palette colors (verified by drawing test pixels of each color near the outline)
- [ ] The color may be tuned during testing if the starting value doesn't feel right — adjust the constant, not the palette

### Stroke Weight Requirements
- [ ] The outline's stroke weight is appropriate for the new render-on-top context
- [ ] Strokes are visible without being heavy enough to compete with pixel art
- [ ] The stroke weight may be tuned during testing if the existing weight feels off when on top

### Constraints
- [ ] Builds on top of Sprint 9's repo
- [ ] No changes to drawing logic, palette, prompts, or any other system
- [ ] No changes to the welcome flow
- [ ] No new schema, no new dependencies
- [ ] The base map's SVG file may be edited or replaced if needed for stroke tuning

---

## Step 1: Identify The Current Render Order

Before changing anything, understand how the layers currently work.

The app likely has two canvas elements (or one canvas with multiple draw passes):
- **Pixel layer** — renders user contributions
- **Base map layer** — renders the SVG of NYC outlines

In the current implementation, the pixel layer is on top. This means:
- When pan/zoom happens, the pixel layer is drawn first (or in the higher z-index)
- The base map is drawn underneath

The change in this sprint is to invert this. Whether the implementation uses canvas z-index, draw order, or two HTML canvas elements, the inversion is the same — base map renders last (or in higher z-index).

### What To Look For In The Code

- The component that renders the base map (probably in `src/components/`)
- The canvas element that draws pixels (probably also in `src/components/`)
- The CSS that positions these layers (z-index, position: absolute, etc.)

The exact location depends on the architecture. Sprint 1 set up the layered rendering; reference that file structure if needed.

---

## Step 2: Swap The Render Order

The mechanical change. Three possible implementations depending on the current architecture:

### If The Layers Are Separate HTML Elements

Both layers are positioned absolute, and z-index determines stacking:

```css
/* Before */
.base-map { z-index: 1; }
.pixel-layer { z-index: 2; }

/* After */
.base-map { z-index: 2; }
.pixel-layer { z-index: 1; }
```

### If The Layers Are Drawn To One Canvas In Sequence

The render function draws them in order, last drawn is on top:

```typescript
// Before
function renderFrame() {
  drawBaseMap()
  drawPixels()
}

// After
function renderFrame() {
  drawPixels()
  drawBaseMap()
}
```

### If There's A Layer Manager

Some abstraction that orders layers — flip the order in the manager's config or array.

Whichever applies, the change is small.

---

## Step 3: Reserve The Outline Color

The base map's stroke color is currently set somewhere — possibly in the SVG file directly, possibly in CSS, possibly as a render parameter.

### Define The Constant

In a config file (probably `src/config/tuning.ts` or a new dedicated file like `src/config/colors.ts`):

```typescript
// src/config/colors.ts

export const OUTLINE_COLOR = '#a89a8c'  // Warm gray-brown — reserved, not in palette

// Existing palette stays in tuning.ts
// Verify OUTLINE_COLOR is not present in the palette array
```

### Apply The Color

Wherever the base map's stroke is rendered, use the constant:

```typescript
// If rendering SVG via React/canvas
import { OUTLINE_COLOR } from '@/config/colors'

// Apply to stroke style
ctx.strokeStyle = OUTLINE_COLOR
```

If the SVG has hardcoded stroke colors, edit them to match `OUTLINE_COLOR` or apply a CSS override:

```css
/* If SVG strokes are styled via CSS */
.base-map svg path {
  stroke: var(--outline-color);
}
```

### Verify Palette Doesn't Include It

The palette array (probably in `tuning.ts`) should NOT include `#a89a8c`. Verify visually:

```typescript
const PALETTE = [
  '#1a1a1a', // Charcoal
  '#b8362a', // Brick red
  '#c89d3c', // Mustard
  '#1f3a5f', // Navy
  '#5a7a4f', // Sage green
  '#faf7f2', // Cream
  '#4a5d7e', // Slate blue
  '#2a2a2a', // Soft black
]
// '#a89a8c' is not present — good
```

---

## Step 4: Verify Visual Quality

After the render order swap, the visual result needs checking. The base map's strokes might:
- Look too heavy on top of pixels (competing visually)
- Look too thin on top of pixels (disappearing into the wall)
- Have unwanted anti-aliasing artifacts at intersections with pixels

### Test Cases

Place pixels of each palette color adjacent to the outline:

1. **Charcoal (`#1a1a1a`) next to outline:** outline should still be clearly visible
2. **Brick red (`#b8362a`) next to outline:** outline should still be clearly visible
3. **Mustard (`#c89d3c`) next to outline:** outline should still be clearly visible
4. **Navy (`#1f3a5f`) next to outline:** outline should still be clearly visible
5. **Sage green (`#5a7a4f`) next to outline:** outline should still be clearly visible
6. **Cream (`#faf7f2`) next to outline:** outline should be clearly visible (cream is the background, so this might not be relevant in practice — but verify)
7. **Slate blue (`#4a5d7e`) next to outline:** outline should still be clearly visible
8. **Soft black (`#2a2a2a`) next to outline:** outline should still be clearly visible

If the outline disappears or is barely visible against any color, tune the outline color or stroke weight.

### Tuning Direction

If `#a89a8c` is too quiet:
- Try slightly darker: `#9c8e7a`, `#8e8170`
- Or slightly more saturated: `#a89580`

If `#a89a8c` is too prominent:
- Try slightly lighter: `#b4a698`, `#c0b3a4`
- Or slightly desaturated: `#a39c95`

The goal is "visible against all 8 palette colors, but visually quieter than any of them." This is the "map is a whisper" principle made concrete.

---

## Step 5: Tune Stroke Weight If Needed

The current stroke weight was probably designed for the "render below pixels" context. On top of pixels, it might need adjustment.

### Try The Existing Weight First

Before tuning, see if the existing weight works. The outline might already look right — the color change alone might be enough.

### If Tuning Is Needed

If the existing weight feels too heavy on top of pixels:
- Reduce stroke width by 0.5-1px
- Re-check visibility against all palette colors

If the existing weight feels too thin and disappears:
- Increase stroke width by 0.5-1px
- Re-check that pixel art isn't visually crowded

### Where The Weight Lives

If it's in the SVG file:
```svg
<path d="..." stroke="#a89a8c" stroke-width="2" fill="none" />
```

If it's applied via CSS:
```css
.base-map svg path {
  stroke-width: 2px;
}
```

Either is fine to edit.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Audit current rendering: identify base map and pixel layer rendering, current z-index/order, current stroke color and weight | 20 min | Clear understanding of what to change |
| 2 | Define `OUTLINE_COLOR = '#a89a8c'` as a constant in a config file | 10 min | Constant exists, can be imported |
| 3 | Apply the constant to the base map's stroke color | 20 min | Outline renders in `#a89a8c` |
| 4 | Verify the palette does not contain `#a89a8c` | 5 min | Confirmation |
| 5 | Swap render order: base map renders above pixels | 30 min | Layers are inverted |
| 6 | Verify drawing, pan, zoom still work correctly with new render order | 30 min | All interactions intact |
| 7 | Test outline visibility against all 8 palette colors (place test pixels) | 30 min | Outline is clearly visible against every color |
| 8 | Tune outline color if any palette color visibility is poor | 30 min | Outline color finalized |
| 9 | Tune stroke weight if needed | 20 min | Stroke weight finalized |
| 10 | Mobile re-deploy to Vercel and verify on phone | 30 min | Works on mobile |
| 11 | Document any non-blocking issues in BACKLOG.md | 10 min | Sprint complete |

**Total estimated time: ~4 hours**

---

## Testing Checklist

### Render Order
- [ ] Open the app
- [ ] Pan around to areas with pixels
- [ ] Verify the coastline and park outlines are clearly visible
- [ ] Find an area where pixels would have previously overlapped the coastline (or paint some test pixels there)
- [ ] Verify the outline is now on top — pixels appear "behind" it
- [ ] ✅ Pass: outline is always visible

### Outline Color
- [ ] Place a test pixel of each palette color adjacent to the outline
- [ ] Verify the outline is visible against each color
- [ ] If outline disappears or is too faint against any color, tune
- [ ] ✅ Pass: outline visible against all 8 palette colors

### No Regressions
- [ ] Drawing in draw mode still works
- [ ] Pan and zoom still work
- [ ] Welcome flow still works (the click-through-canvas behavior)
- [ ] Smart default centering still works
- [ ] Two-finger pan still works (Sprint 9)
- [ ] Daily prompt still appears (Sprint 8)
- [ ] Doodle button + toast still work (Sprint 6)
- [ ] ✅ Pass: no Sprint 1-9 functionality is broken

### Mobile
- [ ] On phone, base map outlines are visible
- [ ] Outlines look good against pixel art
- [ ] No rendering glitches at intersections
- [ ] ✅ Pass: works on mobile

---

## What Counts as Success

The sprint succeeds when:

1. The base map renders above the pixel layer
2. The outline color is `#a89a8c` (or a tuned variant) and is reserved — not in the palette
3. The city is recognizable as NYC regardless of how heavily users have painted nearby
4. The outline is visible against all 8 palette colors
5. The stroke weight feels appropriate for the new render-on-top context
6. No existing functionality is broken
7. The visual quality holds up on both desktop and mobile

---

## What Counts as Failure

- Pixels render on top of the outline (render order didn't swap)
- The outline color is in the palette (users could paint with it)
- The outline is invisible or barely visible against any palette color
- Drawing, pan, zoom, or any other interaction is broken
- The base map looks worse than before — too prominent, too crowded, too distracting
- Mobile rendering has artifacts or visual glitches

---

## What's Out of Scope

To stay focused, do NOT touch in this sprint:

- The welcome flow (no changes — user explicitly said current flow is fine)
- Drawing logic, palette, prompts, budget
- Doodle button or toast
- Geofencing or location handling
- Any new map features (no adding bridges, water tints, neighborhood labels, etc.)
- Map detail level (no adding more streets, parks, or other features)
- Mode infrastructure (deferred to Sprint 11)
- Backend or schema changes
- Server-side anything

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, and SPRINT-1 through SPRINT-9 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **This sprint is small by design.** If you find yourself touching the welcome flow, the palette, the prompts, or anything else, STOP — that's out of scope.
- **The audit step (Step 1) matters.** Understanding the current rendering setup before changing it prevents accidental scope creep.
- **The visual tuning steps (8 and 9) require iteration.** Don't ship the first attempt — verify against each palette color and adjust.
- **Use Opus, not Sonnet, for this sprint.** Visual rendering work requires careful attention to detail.
- **If you hit ambiguity, stop and ask.** Don't make visual decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is small, contained visual improvements. Optimize for "the city stays recognizable" over "this is clever."

---

## After the Sprint

Once Sprint 10 ships:

1. **Verify on phone.** Walk through each test scenario.
2. **Look at the wall in dense pixel areas.** The outline should be visible. The city should be recognizable.
3. **Use it for a few days.** Notice if the new visual hierarchy feels right, if any palette color makes the outline disappear in practice.
4. **If the outline color or stroke weight feels off, tune via the config.** Small iterations are fine — that's why the constant is centralized.
5. **Tell me Sprint 10 is done.** I'll generate Sprint 11 (mode infrastructure + first weekly mode).

The next major sprint:
- **Sprint 11:** Mode infrastructure + first weekly mode — the highest-impact remaining work, where the product graduates from "working" to "interesting over time"

After Sprint 11, the product is operationally complete. Most subsequent work is reactive to real usage.