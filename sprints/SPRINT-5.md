# SPRINT-5.md — Real Location, First Impressions, Real World

This sprint takes The Wall from "works on my machine" to a deployed product that real people can use on their actual phones in their actual neighborhoods. It replaces mocked geolocation with real GPS, designs the first-time experience around the act of drawing, and ships a public URL.

For the long-term product vision, see PRODUCT.md.
For philosophical commitments, see MANIFESTO.md.
For the technical blueprint, see ARCHITECTURE.md.
For prior sprints, see SPRINT-1.md through SPRINT-4.md.

---

## The Goal

Three things, in priority order:

1. **Real geolocation.** Replace the mocked location system with `navigator.geolocation`. Build the lock-in model that captures GPS once per draw session and ignores drift. Add a generous radius that absorbs GPS error.

2. **First-time experience.** Build an onboarding flow where the user's first interaction *is* their first contribution. No "Begin" button — make a pixel to begin. Acknowledge the early state of the wall.

3. **Real deployment.** Ship to a production URL on Vercel. Test on a real phone. Fix what's broken on mobile.

By the end of the sprint, you can text a friend a URL and they can use the app on their phone, in their neighborhood, with their real GPS.

---

## What's Changing

### Geolocation
- **Before:** Mocked location via `?location=` query parameter
- **After:** Real GPS via `navigator.geolocation`, captured once at draw mode entry, with dev-mode override

### First Visit
- **Before:** App loads directly into the city view
- **After:** First-time visitors see a welcome flow that integrates a first drawing experience

### Permission Handling
- **Before:** No location permission flow
- **After:** Permission requested when user enters draw mode; read-only fallback if denied; persistent banner offering to enable

### Deployment
- **Before:** Local development only
- **After:** Live on a Vercel URL with environment variables configured

---

## Definition of Done

The sprint is complete when **all of the following are true**:

### Geolocation Requirements
- [ ] Real GPS via `navigator.geolocation` is integrated
- [ ] Location is captured ONCE when draw mode is entered, not continuously
- [ ] GPS drift during a draw session is suppressed (subsequent readings ignored)
- [ ] Editable radius is 400ft (40 pixels at 10ft resolution)
- [ ] If a user denies location permission, the app falls back to read-only browsing
- [ ] A persistent banner appears for users without granted location permission, dismissable per session
- [ ] Dev-mode location menu replaces the `?location=` query parameter for development
- [ ] The dev menu is visible only in development builds (`import.meta.env.DEV`)

### Onboarding Requirements
- [ ] First-time visitors see a welcome screen on initial load
- [ ] The welcome screen includes a small interactive element where the user makes their first pixel
- [ ] The act of drawing the first pixel transitions them into the main app
- [ ] If location permission is granted, the first pixel is placed at their actual location
- [ ] If location permission is denied, the first pixel is "demo only" and the user enters read-only mode
- [ ] Welcome screen acknowledges that the user is early — the wall is just beginning
- [ ] Welcome screen appears once per device (tracked via localStorage)
- [ ] Re-seeing the welcome on a new device or after cleared cache is acceptable

### Permission Banner Requirements
- [ ] A small banner appears when the user enters the app without granted location permission
- [ ] The banner offers an "Enable location" button and a dismiss action
- [ ] Once dismissed, the banner stays hidden for the remainder of the browser tab session (sessionStorage)
- [ ] Closing and reopening the tab causes the banner to reappear
- [ ] Once permission is granted, the banner never appears again
- [ ] Banner copy acknowledges that browsing is fine without location, drawing is what requires it

### Deployment Requirements
- [ ] The app is deployed to a Vercel URL
- [ ] Supabase environment variables are configured in Vercel
- [ ] HTTPS is working (required for `navigator.geolocation`)
- [ ] The app loads correctly on iOS Safari and Android Chrome
- [ ] GPS works on a real phone (you have tested this personally)

### Mobile Polish (Discovered Through Testing)
- [ ] You have used the app on your phone for at least 30 minutes
- [ ] Any blocking issues found on mobile are fixed
- [ ] Non-blocking issues are added to BACKLOG.md

### Constraints
- [ ] Builds on top of Sprint 4's repo
- [ ] No backend schema changes
- [ ] No WebSocket implementation
- [ ] No authentication system
- [ ] No seeded fake pixels — empty state is honest

---

## Step 1: Real Geolocation Implementation

### The Lock-In Model

The core principle: **GPS is captured once when the user enters draw mode. It does not change during that draw session.**

```typescript
// src/lib/geolocation.ts

type LocationState = {
  lat: number
  lng: number
  capturedAt: number
  source: 'gps' | 'dev'
}

let lockedLocation: LocationState | null = null

export async function captureLocationForSession(): Promise<LocationState | null> {
  // If already locked, return existing
  if (lockedLocation) return lockedLocation
  
  // Request fresh GPS
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        lockedLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          capturedAt: Date.now(),
          source: 'gps',
        }
        resolve(lockedLocation)
      },
      (error) => {
        console.error('Geolocation failed:', error)
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000, // accept readings up to 30s old
      }
    )
  })
}

export function clearLockedLocation() {
  lockedLocation = null
}

export function getLockedLocation(): LocationState | null {
  return lockedLocation
}
```

### When to Lock and Unlock

- **Lock:** Called when the user taps "Doodle" / enters draw mode
- **Unlock:** Called when the user exits draw mode (either via Done button or auto-timeout)
- **Timeout:** Optional — if you want, auto-unlock after 5 minutes to prevent drawing across long transit

For Sprint 5, **don't add the timeout.** Keep it simple. The lock persists until the user explicitly exits draw mode.

### Permission Handling

Three states for location permission:
- `'granted'` — full draw functionality available
- `'denied'` — read-only mode, banner shown
- `'prompt'` — permission not yet requested, will be on first draw attempt

```typescript
export async function getPermissionState(): Promise<PermissionState> {
  if (!navigator.permissions) return 'prompt'
  
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' })
    return result.state
  } catch {
    return 'prompt'
  }
}
```

### The Generous Radius

The geofence radius is 400ft (40 world pixels), increased from the 300ft of mocked mode. This absorbs GPS error of up to ~50ft, which covers most real-world conditions.

```typescript
// src/config/tuning.ts (update)
radius: {
  feet: 400,                    // increased from 300 to absorb GPS error
  pixels: 40,                   // 400 / 10 ft per pixel
},
```

---

## Step 2: Dev-Mode Location Menu

In development builds only, a small menu appears that lets you set a fake location without needing query parameters.

### Implementation

```typescript
// src/components/DevLocationMenu.tsx

const DEV_LOCATIONS = [
  { name: 'Long Island City', lat: 40.7505, lng: -73.9408 },
  { name: 'Astoria', lat: 40.7644, lng: -73.9235 },
  { name: 'Greenpoint', lat: 40.7297, lng: -73.9540 },
  { name: 'Williamsburg', lat: 40.7081, lng: -73.9571 },
  { name: 'East Village', lat: 40.7265, lng: -73.9815 },
  { name: 'Midtown', lat: 40.7549, lng: -73.9840 },
  { name: 'Bushwick', lat: 40.6943, lng: -73.9213 },
  { name: 'Upper West Side', lat: 40.7870, lng: -73.9754 },
]

export function DevLocationMenu() {
  if (!import.meta.env.DEV) return null
  
  return (
    <div className="fixed top-2 right-2 bg-white border rounded p-2 z-50">
      <select onChange={(e) => setDevLocation(e.target.value)}>
        <option>Set location...</option>
        {DEV_LOCATIONS.map(loc => (
          <option key={loc.name} value={loc.name}>{loc.name}</option>
        ))}
      </select>
    </div>
  )
}

function setDevLocation(name: string) {
  const loc = DEV_LOCATIONS.find(l => l.name === name)
  if (!loc) return
  
  // Override the locked location with this dev value
  // The geolocation module needs a way to accept dev overrides
  setDevOverride({ lat: loc.lat, lng: loc.lng, source: 'dev' })
}
```

### Important: This Must Be Stripped From Production

`import.meta.env.DEV` is a Vite-provided flag that's `true` in dev and `false` in production builds. The component returns `null` in production, so it's effectively absent — no need to worry about exposing it.

Verify after deployment: the dev menu should NOT be visible on the production URL.

---

## Step 3: Onboarding Flow

The onboarding is also the first drawing experience. Specifically:

### The Welcome Screen

Single screen, full-bleed, warm and quiet aesthetic. Contains:
- A title (the product name, in serif)
- One sentence explaining what The Wall is
- A small interactive area where the user can make a pixel

The copy should acknowledge the early state of the wall. Something like:

> **The Wall**
>
> *A canvas of New York City, drawn one pixel at a time.*
>
> *You're early — the wall is just beginning.*
> *Make your first mark.*

The interactive area below is a small canvas (maybe 100×100 pixels visually) with a single color picker. The user taps to make their first pixel. Once they do, the welcome screen smoothly transitions into the main app.

### Logic Flow

```typescript
// Pseudocode for the onboarding flow
async function handleFirstPixel(localX: number, localY: number, color: string) {
  // 1. Show the pixel locally on the welcome canvas
  renderFirstPixel(localX, localY, color)
  
  // 2. Wait a beat for visual confirmation
  await delay(500)
  
  // 3. Request location permission
  const permission = await requestLocation()
  
  if (permission === 'granted') {
    // Place this pixel at their actual location
    const location = await captureLocationForSession()
    if (location) {
      const worldCoord = latLngToWorld(location.lat, location.lng)
      // Slightly randomize within radius so it doesn't always go to exact center
      const offsetX = randomInt(-10, 10)
      const offsetY = randomInt(-10, 10)
      await placePixel(
        worldCoord.x + offsetX,
        worldCoord.y + offsetY,
        color,
        sessionId
      )
    }
  }
  
  // 4. Mark onboarding as complete
  localStorage.setItem('wall_onboarded', 'true')
  
  // 5. Transition to main app
  showMainApp()
}
```

### Tracking Onboarding Completion

```typescript
function hasOnboarded(): boolean {
  return localStorage.getItem('wall_onboarded') === 'true'
}
```

If `hasOnboarded()` returns false, show the welcome screen. Otherwise, go straight to the main app.

This is device-specific. New devices will see the onboarding again. That's acceptable.

---

## Step 4: Permission Banner

When the user is in the main app without granted location permission, a small banner appears.

### Banner Component

```tsx
// src/components/PermissionBanner.tsx

export function PermissionBanner() {
  const [permission, setPermission] = useState<PermissionState>('prompt')
  const [dismissed, setDismissed] = useState(false)
  
  useEffect(() => {
    // Check current permission state
    getPermissionState().then(setPermission)
    
    // Check if dismissed this session
    const wasDismissed = sessionStorage.getItem('permission_banner_dismissed')
    if (wasDismissed) setDismissed(true)
  }, [])
  
  if (permission === 'granted') return null
  if (dismissed) return null
  
  return (
    <div className="banner">
      <span>📍 Enable location to add to The Wall</span>
      <span className="banner-subtext">
        You can browse anywhere, but drawing requires being there.
      </span>
      <button onClick={enableLocation}>Enable</button>
      <button onClick={() => {
        setDismissed(true)
        sessionStorage.setItem('permission_banner_dismissed', 'true')
      }}>Not now</button>
    </div>
  )
}
```

### Banner Behavior Summary

| Situation | Banner Visible? |
|---|---|
| Permission granted | No |
| Permission denied or prompt, banner not dismissed this session | Yes |
| Banner dismissed this session | No (until tab closes and reopens) |
| Tab closed and reopened, permission still not granted | Yes |
| User clicks "Enable", grants permission | No (forever) |
| User clicks "Enable", denies permission | Banner stays (or returns next session) |

---

## Step 5: Deployment to Vercel

### Setup Steps

1. **Push your code to GitHub** if you haven't already
2. **Sign in to Vercel** with your GitHub account
3. **Import the repository** as a new Vercel project
4. **Configure environment variables** in Vercel:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
5. **Deploy** — Vercel auto-detects Vite and configures the build

### Vercel Configuration

Vite usually works out of the box on Vercel. If needed, create `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

This ensures client-side routing works (all paths route to `index.html`).

### Verify After Deployment

- [ ] Site loads at the Vercel URL
- [ ] HTTPS is enabled (Vercel does this automatically)
- [ ] Supabase reads/writes work (check the network tab)
- [ ] Location permission prompt fires correctly
- [ ] On a real phone, GPS works (the most important verification)
- [ ] Dev menu is NOT visible in production

### Custom Domain (Optional)

If you want a custom domain (e.g., `thewall.nyc`), buy one and configure it in Vercel. Not required for Sprint 5; the Vercel-generated URL is fine for testing.

---

## Step 6: Mobile Testing

Once deployed, open the production URL on your phone. Walk around. Try drawing in your real neighborhood.

### Things to Test

- Welcome screen on first visit
- Drawing the first pixel
- Location permission flow (allow / deny / re-request)
- Drawing in your actual neighborhood
- The 400ft radius — does it feel about right?
- Pan and zoom on the map with touch gestures
- Bottom toolbar usability one-handed
- Reconnecting after the phone goes to sleep

### What to Do With What You Find

- **Blocking issues** (app doesn't work on phone, GPS fails, etc.) → fix before declaring sprint done
- **Polish issues** (small visual things, minor UX awkwardness) → add to BACKLOG.md
- **Surprises** (something works differently than expected) → write down for the retrospective

Don't try to perfect mobile in this sprint. Just get it working.

---

## Build Order (Strict)

| # | Step | Time | Deliverable |
|---|---|---|---|
| 1 | Implement geolocation lock-in model with permission handling | 60 min | GPS works in dev with real `navigator.geolocation` |
| 2 | Add 400ft radius to tuning config; update geofence checks | 15 min | Radius is generous |
| 3 | Build dev-mode location menu with NYC neighborhoods | 45 min | Dropdown replaces query param approach |
| 4 | Build welcome screen with first-pixel interaction | 90 min | Onboarding flow visible on first load |
| 5 | Wire first-pixel to actual placement at user's location | 45 min | First pixel ends up on the wall |
| 6 | Build permission banner with sessionStorage dismissal | 45 min | Banner appears and dismisses correctly |
| 7 | Read-only mode for users without location permission | 30 min | Permission denial leads to browsing-only state |
| 8 | Set up Vercel project, configure env vars, deploy | 30 min | App is live at a public URL |
| 9 | Verify HTTPS, dev menu hidden, Supabase connection works | 15 min | Production deployment is correct |
| 10 | Test on real phone, fix blocking issues only | 60 min | Works on actual device |
| 11 | Document any non-blocking issues in BACKLOG.md | 15 min | Sprint complete |

**Total estimated time: ~7 hours**

---

## What Counts as Success

The sprint succeeds when:

1. You text a friend the production URL
2. They open it on their phone
3. They see the welcome screen
4. They draw their first pixel and grant location permission
5. The pixel appears on the wall at their actual location
6. They can browse the city, see your pixels, and add their own
7. No blocking bugs prevent any of this from working

If you can do this end-to-end with someone who isn't you, the sprint is done.

---

## What Counts as Failure

- The app doesn't load on a phone
- GPS permission flow is broken
- Pixels don't end up at the user's actual location
- The welcome screen is confusing or off-putting
- HTTPS isn't enabled (geolocation won't work)
- Production deployment has the dev menu visible

---

## What's Out of Scope

To stay focused, do NOT build in this sprint:

- WebSocket real-time updates
- Authentication system
- Server-side budget enforcement
- Server-side tile generation
- Personal histories or user dashboards
- Moderation tooling
- Multi-city support
- Custom domain
- Analytics
- A/B testing infrastructure
- Marketing pages
- Anti-spoofing layers (IP, WiFi, etc.)

If something feels missing, write it in `BACKLOG.md` and move on.

---

## Operating Instructions for Claude Code

When using this document with Claude Code:

- **Read this file plus PRODUCT.md, MANIFESTO.md, ARCHITECTURE.md, and SPRINT-1 through SPRINT-4 before writing any code.**
- **Confirm understanding in plan mode before exiting to execute.**
- **Follow the build order strictly.** Do not jump ahead.
- **Show me each step's deliverable before moving to the next step.**
- **Coordinate Vercel setup with me explicitly** — I need to do the GitHub connection and env var configuration.
- **Verify mobile behavior with real testing**, not just simulators.
- **If you hit ambiguity, stop and ask.** Don't make UX decisions silently.
- **If a step takes longer than its time budget, stop and tell me.**

The goal is a deployed, real-world-functional product. Optimize for "does it work on a phone in real life" over "is it polished."

---

## After the Sprint

Once Sprint 5 ships:

1. **Send the URL to 5-10 friends.** Watch what they do.
2. **Use it yourself for several days.** Notice the daily rhythm forming (or not).
3. **Capture observations in `RETROSPECTIVE-SPRINT-5.md`** with three sections: what felt right, what felt wrong, what to do next.

Likely candidates for Sprint 6:
- **Polish based on real user feedback** — whatever's confusing actual humans
- **Server-side tile generation** — if write performance is becoming a bottleneck
- **Personal history view** — if users keep asking "what did I draw?"
- **WebSocket real-time** — if synchronous drawing emerges as a use case
- **Moderation tooling** — if any inappropriate content appears

Don't pre-commit. The retrospective from real users will reveal the actual priority.