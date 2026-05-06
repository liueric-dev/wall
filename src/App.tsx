import { lazy, Suspense, useState } from 'react'
import WallCanvas from './components/WallCanvas'
import WelcomeScreen from './components/WelcomeScreen'
import DevLocationMenu from './components/DevLocationMenu'

// Dev-only: lazy-loaded so production builds tree-shake it away.
// `import.meta.env.DEV` is replaced by Vite at build time with `false` in
// production, making the conditional branch dead code.
const SeedTool = import.meta.env.DEV
  ? lazy(() => import('./dev/seed/SeedTool'))
  : null

export default function App() {
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem('wall_onboarded') === 'true'
  )

  if (import.meta.env.DEV && SeedTool && window.location.pathname.startsWith('/dev/seed')) {
    return (
      <Suspense fallback={<div style={{ padding: 20, fontFamily: 'ui-monospace, monospace' }}>Loading dev tool…</div>}>
        <SeedTool />
      </Suspense>
    )
  }

  if (!onboarded) {
    return <WelcomeScreen onComplete={() => setOnboarded(true)} />
  }

  return (
    <>
      <WallCanvas />
      {import.meta.env.DEV && <DevLocationMenu />}
    </>
  )
}
