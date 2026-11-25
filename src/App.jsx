import { useCallback, useState } from 'react'
import ActPrism from './acts/ActPrism'
import ActTaste from './acts/ActTaste'
import ActWorks from './acts/ActWorks'
import InterludeBreathe from './acts/InterludeBreathe'
import IntroHyperspace from './acts/IntroHyperspace'
import CosmicBackdrop from './components/CosmicBackdrop'
import SpectrumHUD from './components/SpectrumHUD'

export default function App() {
  const [entered, setEntered] = useState(false)
  const [biasAngle, setBiasAngle] = useState(28)

  const handleBiasChange = useCallback((deg) => {
    setBiasAngle(deg)
  }, [])

  const handleIntroComplete = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setEntered(true)
  }, [])

  const handleReplayIntro = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    setEntered(false)
  }, [])

  return (
    <div className="relative min-h-screen bg-[#020204] text-slate-100">
      {/* Opening pinkfloyd.com-style ENTER splash with Star Wars hyperspace jump -> blank reveal */}
      {!entered && <IntroHyperspace onComplete={handleIntroComplete} />}

      {/* Shared persistent deep-space starfield running seamlessly behind every Act */}
      <CosmicBackdrop />

      {/* Global subtle analog dark-room grain */}
      <div className="dark-grain fixed inset-0 z-50" aria-hidden="true" />

      {/* Persistent pinkfloyd.com-inspired header & active chapter indicator */}
      {entered && <SpectrumHUD biasAngle={biasAngle} onReplayIntro={handleReplayIntro} />}

      <main className="relative z-10">
        {/* ACT I: 3D Glass Tetrahedron & Light Bias */}
        <ActPrism onBiasChange={handleBiasChange} />

        {/* INTERLUDE: "Breathe (In the Air)" Quote + Live Solar Eclipse */}
        <InterludeBreathe />

        {/* SELECTED WORKS & ALL GITHUB REPOSITORIES ARCHIVE */}
        <ActWorks />

        {/* ACT III: Influences & Taste — Yusuke Nakamura Darkroom Collage + Cursor Spotlight */}
        <ActTaste />

        {/* ACT IV: Staged Finale */}
        <section
          id="signal"
          className="min-h-[30vh] flex flex-col items-center justify-center px-6 text-center"
        >
          <span className="font-pf-label text-[11px] uppercase text-white/30">
            ACT IV · STAGED FINALE
          </span>
          <p className="font-pf-main text-lg md:text-xl uppercase text-white/45 mt-2">
            Totality Convergence, Signal Links &amp; Fading Heartbeat
          </p>
        </section>
      </main>
    </div>
  )
}
