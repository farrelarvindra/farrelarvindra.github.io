import { useCallback, useState } from 'react'
import ActPrism from './acts/ActPrism'
import ActTaste from './acts/ActTaste'
import ActTotality from './acts/ActTotality'
import ActWorks from './acts/ActWorks'
import InterludeBreathe from './acts/InterludeBreathe'
import IntroAbyssPortal from './acts/IntroAbyssPortal'
import CosmicBackdrop from './components/CosmicBackdrop'
import SpectrumHUD from './components/SpectrumHUD'

export default function App() {
  // 'portal' -> swirling abyssal intro | 'emerging' -> throat opens into Act I | 'entered' -> portal unmounted
  const [introState, setIntroState] = useState('portal')
  const [isReplay, setIsReplay] = useState(false)
  const [skipInstant, setSkipInstant] = useState(false)
  const [biasAngle, setBiasAngle] = useState(28)

  const handleBiasChange = useCallback((deg) => {
    setBiasAngle(deg)
  }, [])

  const handleApertureOpen = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setSkipInstant(false)
    setIntroState('emerging')
  }, [])

  const handleIntroComplete = useCallback(() => {
    setIntroState('entered')
  }, [])

  const handleIntroSkip = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setSkipInstant(true)
    setIntroState('entered')
  }, [])

  const handleReplayIntro = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setIsReplay(true)
    setSkipInstant(false)
    setIntroState('portal')
  }, [])

  return (
    <div className="relative min-h-screen bg-[#020204] text-slate-100">
      {/* Swirling Portal to the Abyss with true-alpha throat dilation directly into Act I */}
      {introState !== 'entered' && (
        <IntroAbyssPortal
          isReplay={isReplay}
          onApertureOpen={handleApertureOpen}
          onComplete={handleIntroComplete}
          onSkip={handleIntroSkip}
        />
      )}

      {/* Deep-space backdrop: pure starless #020204 abyss on top page, stars emerging smoothly below */}
      <CosmicBackdrop />

      {/* Global subtle analog dark-room grain */}
      <div className="dark-grain fixed inset-0 z-50" aria-hidden="true" />

      {/* Persistent pinkfloyd.com-inspired header & active chapter indicator */}
      {introState !== 'portal' && (
        <SpectrumHUD biasAngle={biasAngle} onReplayIntro={handleReplayIntro} />
      )}

      <main className="relative z-10">
        {/* ACT I: 3D Glass Tetrahedron & Light Bias inside the starless #020204 abyss */}
        <ActPrism
          onBiasChange={handleBiasChange}
          introState={introState}
          skipInstant={skipInstant}
        />

        {/* INTERLUDE: "Breathe (In the Air)" Quote + Live Solar Eclipse */}
        <InterludeBreathe />

        {/* SELECTED WORKS & ALL GITHUB REPOSITORIES ARCHIVE */}
        <ActWorks />

        {/* ACT III: Influences & Taste — Yusuke Nakamura Darkroom Collage + Cursor Spotlight */}
        <ActTaste />

        {/* ACT IV: Totality Convergence, Contact Signal & Fading Heartbeat */}
        <ActTotality onReplayIntro={handleReplayIntro} />
      </main>
    </div>
  )
}
