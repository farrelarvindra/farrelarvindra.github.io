import { useCallback, useState } from 'react'
import ActPrism from './acts/ActPrism'
import InterludeBreathe from './acts/InterludeBreathe'
import CosmicBackdrop from './components/CosmicBackdrop'
import SpectrumHUD from './components/SpectrumHUD'

export default function App() {
  const [biasAngle, setBiasAngle] = useState(28)

  const handleBiasChange = useCallback((deg) => {
    setBiasAngle(deg)
  }, [])

  return (
    <div className="relative min-h-screen bg-[#020204] text-slate-100">
      {/* Shared persistent deep-space starfield running seamlessly behind every Act */}
      <CosmicBackdrop />

      {/* Global subtle analog dark-room grain */}
      <div className="dark-grain fixed inset-0 z-50" aria-hidden="true" />

      {/* Persistent pinkfloyd.com-inspired header & active chapter indicator */}
      <SpectrumHUD biasAngle={biasAngle} />

      <main className="relative z-10">
        {/* ACT I: 3D Glass Tetrahedron & Light Bias */}
        <ActPrism onBiasChange={handleBiasChange} />

        {/* INTERLUDE: "Breathe (In the Air)" Quote + Live Solar Eclipse (Seamless, zero divider bar) */}
        <InterludeBreathe />

        {/* Upcoming Acts staged cleanly in the same continuous void */}
        <section
          id="works"
          className="min-h-[42vh] flex flex-col items-center justify-center px-6 text-center"
        >
          <span className="font-pf-label text-[11px] uppercase text-white/35">
            ACT II · STAGED NEXT
          </span>
          <p className="font-pf-main text-xl md:text-2xl uppercase text-white/65 mt-2">
            Life-Flash Perspective Vortex &amp; Full GitHub Repository Index
          </p>
        </section>

        <section
          id="canvas"
          className="min-h-[30vh] flex flex-col items-center justify-center px-6 text-center"
        >
          <span className="font-pf-label text-[11px] uppercase text-white/30">
            ACT III · RESERVED SLOT
          </span>
          <p className="font-pf-main text-lg md:text-xl uppercase text-white/45 mt-2">
            Reserved for upcoming custom drawing installation
          </p>
        </section>

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
