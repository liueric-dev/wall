import { useState } from 'react'
import WallCanvas from './components/WallCanvas'
import WelcomeScreen from './components/WelcomeScreen'
import DevLocationMenu from './components/DevLocationMenu'

export default function App() {
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem('wall_onboarded') === 'true'
  )

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
