# SPRINT-13.md — Image Seeding Dev Tool

This sprint builds an internal dev-only tool for populating the wall with pixel art. It exists at `/dev/seed`, gated by `import.meta.env.DEV` so production builds never include it.

The tool is for populating the wall before demos, testing rendering at scale, and generating sample content. It is not a user-facing feature.

For prior context, see PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, ROADMAP.md, and SPRINT-1 through SPRINT-12.

---

## Important Setup Context

**Shared database.** Local dev and production currently share the same Supabase project (single URL/anon key in both `.env.local` and Vercel). This means seeding from local dev populates the production wall — convenient for demos, but cleanup affects production data.

**`vercel dev` required.** The URL-fetching feature uses a Vercel API route, which `npm run dev` doesn't support. When using the seeding tool: `vercel dev`. Otherwise: `npm run dev` is fine.

---

## The Goal

A working dev tool with this workflow:
1. Load an image (file upload, URL, or text rendered to canvas)
2. Convert to pixel art using the locked palette, with adjustable settings
3. Save converted assets to a reusable library
4. Pick an asset, tap on the map to place it
5. Optionally enable brush mode to rapidly stamp the same asset at multiple locations
6. Undo recent placements or wipe all dev-seeded pixels when done

Functional first, ugly second. Internal infrastructure.

---

## Definition of Done

### Routing & Access Control
- [ ] Tool at `/dev/seed`, gated by `import.meta.env.DEV`
- [ ] Production builds verifiably exclude the route and all dev-seed code
- [ ] Reachable via `vercel dev`

### Image Loading
- [ ] File upload via drag/drop and file picker
- [ ] URL paste (any http/https image URL), fetched via `/api/dev-fetch-image` route to bypass CORS
- [ ] Text input with at least 4 fonts (serif, sans-serif, monospace, cursive) and adjustable size
- [ ] Supported formats: PNG, JPG, GIF (static), WebP
- [ ] Failed loads show clear errors

### Conversion Settings
- [ ] Size selector: 20-150 pixels per side, default 50
- [ ] Dithering toggle (Floyd-Steinberg): on/off, default off
- [ ] Rotation: 0°, 90°, 180°, 270°
- [ ] Mirror: horizontal, vertical
- [ ] All settings update preview live

### Conversion Algorithm
- [ ] Source image resized to target dimensions (bilinear smoothing — better for photos)
- [ ] Each pixel mapped to nearest palette color using **weighted Euclidean RGB distance**, with this specific formula:
  ```
  rmean = (r1 + r2) / 2
  distance = sqrt(((512 + rmean) * dr² >> 8) + 4 * dg² + ((767 - rmean) * db² >> 8))
  ```
  This formula compensates for human eye sensitivity better than plain Euclidean distance.
- [ ] Source pixels with alpha < 50% become transparent (no pixel placed)
- [ ] Floyd-Steinberg dithering, when enabled, distributes quantization error to neighboring pixels using the standard 7/16, 3/16, 5/16, 1/16 pattern
- [ ] Output: 2D array of `{x, y, color}` entries where color is a palette hex string

### Preview Display
- [ ] Magnified pixel grid showing the converted result
- [ ] Color distribution view — simple list showing count per palette color
- [ ] Total pixel count (non-transparent cells)

### Asset Library
- [ ] Save converted images with a custom name
- [ ] Persists in localStorage (single key)
- [ ] Each asset stores: id, name, dimensions, pixels, original source, settings used, timestamp
- [ ] Thumbnails of all saved assets
- [ ] Delete individual assets
- [ ] Export library as JSON (downloadable file)
- [ ] Import library from JSON

### Map Placement View
- [ ] Reuses the main app's map renderer
- [ ] Sidebar shows library asset thumbnails, click to select active asset
- [ ] Tap on map (brush mode OFF) → preview overlay appears at tap location with image centered
- [ ] User can drag preview to refine position
- [ ] "Place" button commits the placement
- [ ] Visual feedback: pixels appear on map within ~5 seconds of commit

### Brush Mode
- [ ] Toggle in placement view
- [ ] When ON: tap immediately places the active asset (no preview, no confirm)
- [ ] Tap-vs-pan disambiguation: 10px movement threshold (matches Sprint 12)
- [ ] No drag-to-stamp — only individual taps place pixels
- [ ] Brief visual feedback (flash, ring, or animation) confirms each placement
- [ ] Each brush stamp is a separate undo stack entry

### Undo Stack
- [ ] Last 20 placements tracked in localStorage
- [ ] "Undo last placement" button removes pixels from most recent placement and pops the stack
- [ ] Button disabled when stack is empty
- [ ] Shows the asset name being undone

### Cleanup
- [ ] "Delete all dev-seeded pixels" button with confirmation dialog
- [ ] Deletes all rows where `session_id LIKE 'dev-seed-%'`
- [ ] Shows count of deleted rows
- [ ] Clears the undo stack
- [ ] Wall renders without seeded content after cleanup

### Direct Supabase Writes
- [ ] Bypasses the user-facing `placePixel` function — writes directly to `pixel_events`
- [ ] `session_id` format: `dev-seed-{sanitized-asset-name}-{timestamp}`
- [ ] `input_mode = 't'`, `group_id = null`, `group_seq = null`
- [ ] Bulk inserts in batches of ~500 rows per call

### Performance
- [ ] 100×100 image (up to 10,000 pixels) places in under 30 seconds
- [ ] Progress feedback during long placements ("Placing X of Y pixels...")
- [ ] Partial-failure handling: user can see which pixels were written before a failure

### Vercel API Route
- [ ] `/api/dev-fetch-image` accepts `url` query param
- [ ] Validates URL is http/https
- [ ] Validates response content-type starts with `image/`
- [ ] 10-second timeout on the fetch
- [ ] Gated to dev mode only (`process.env.NODE_ENV === 'development'`); returns 404 in production

### Constraints
- [ ] No changes to existing user-facing code
- [ ] Builds on Sprint 12's repo
- [ ] Sprint 1-12 functionality intact in production builds

---

## Architecture

Suggested module structure under `/src/dev/seed/`:
- Image loading (file/URL/text)
- Color distance + nearest-color lookup
- Floyd-Steinberg dithering
- Image-to-asset conversion (orchestrates the above)
- localStorage library CRUD
- Placement view (map + overlay + brush mode)
- Direct Supabase writer with bulk inserts and undo stack

Plus the API route at `/api/dev-fetch-image`.

Claude Code can structure this however makes sense — the above is a suggestion, not a requirement.

### Code Inclusion Strategy

Use Vite's tree-shaking with `import.meta.env.DEV` so production builds exclude the dev tool. Either conditional route registration or dynamic imports — Claude Code's call.

Verification: search the production bundle for `dev/seed` strings; they should not appear.

---

## Build Order

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Vercel API route for URL fetching | 1h | Route works under `vercel dev` |
| 2 | Color distance + conversion logic | 1.5h | Conversion produces valid palette output |
| 3 | Floyd-Steinberg dithering | 1h | Toggling dithering produces visibly different output |
| 4 | Image loader UI (file, URL, text) | 2h | All three input modes work |
| 5 | Conversion preview UI with all settings | 1.5h | Settings update preview live |
| 6 | Asset library (save, list, delete, export, import) | 2h | Library persists and manages assets |
| 7 | Placement view base (map + asset selection) | 2h | Can pick asset and see preview |
| 8 | Placement preview overlay with drag | 1.5h | Preview shows where image will land |
| 9 | Direct writer with bulk inserts | 1.5h | Placement writes pixels |
| 10 | Brush mode toggle and stamp-on-tap | 1.5h | Brush mode stamps without preview |
| 11 | Undo stack and cleanup buttons | 1h | Both work as expected |
| 12 | End-to-end testing | 1h | Test cases pass |
| 13 | Verify production build excludes the tool | 30m | Bundle inspection clean |

**Total estimated time: ~17 hours**

---

## Testing Checklist

- [ ] `vercel dev` runs successfully
- [ ] `/dev/seed` accessible only when running dev server
- [ ] Upload PNG → preview correct
- [ ] Paste URL → image fetched and converted
- [ ] Type text → rendered and converted
- [ ] Toggle dithering → preview changes visibly
- [ ] Rotate 90° → preview rotates
- [ ] Mirror H/V → preview mirrors
- [ ] Save asset → appears in library
- [ ] Delete asset → disappears
- [ ] Export and re-import library → restored correctly
- [ ] Pick asset → tap map → preview shows
- [ ] Drag preview → moves
- [ ] Click Place → pixels appear within 5s
- [ ] Open production URL → seeded pixels visible there too (shared DB)
- [ ] Toggle brush mode → tap stamps immediately, no preview
- [ ] Multiple brush stamps → each is a separate undo entry
- [ ] Click "Undo last" → most recent placement disappears
- [ ] Click "Delete all dev-seeded pixels" → all disappear
- [ ] Production build: `/dev/seed` does NOT exist
- [ ] Production build: `/api/dev-fetch-image` returns 404
- [ ] Production build bundle: no `dev/seed` references in output

---

## What Counts as Success

Tool works for its intended purpose. Production builds are clean of dev code. Cleanup reliably removes all seeded pixels. Brush mode makes rapid stamping efficient. Robust enough to use repeatedly.

---

## What Counts as Failure

Tool ships any code to production. Direct writes hit unhandled errors. Placement misalignment (image far from tap). Bulk inserts fail silently mid-batch. Cleanup leaves orphaned pixels. Brush mode places pixels in unexpected locations.

---

## What's Out of Scope

- User-facing seeding features
- Server-side asset library (localStorage only)
- Image cropping in-tool
- Color distribution adjustment (showing breakdown is enough)
- Multi-image bulk placement
- Aesthetic polish

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

- Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, ROADMAP.md, and Sprint 1-12 before writing code.
- Confirm understanding in plan mode before exiting to execute.
- Follow the build order. Get conversion logic right before any UI.
- Show each step's deliverable before moving to the next.
- The dev-only gating is critical — verify production bundles exclude the tool throughout the sprint, not just at the end.
- Use Opus, not Sonnet. Multi-module sprint that benefits from sustained reasoning.
- Test conversion on multiple source types: landscape photo, logo, face, text. Each stresses different parts.
- Don't optimize prematurely. Sequential loops over pixel arrays are fine.
- Coordinate systems in the placement view (world vs screen vs image-local) are tricky — plan on paper before coding.
- Test cleanup with real seeded pixels: place, undo, place again, full cleanup. Verify each step.
- Remember the shared database — pixels seeded locally appear on production. Be careful with the "delete all" button.
- If you hit ambiguity, stop and ask.
- If a step takes longer than its time budget, stop and tell me.

---

## After the Sprint

1. Use it for the demo. Populate the wall.
2. After the demo, run cleanup.
3. Note any friction in BACKLOG.md.
4. Tell me Sprint 13 is done. Next sprint is likely reactive to real user feedback on Sprint 12's drawing experience.

The tool is internal infrastructure. Should fade into the background and just work.