import { useCallback, useState } from 'react'
import ActPrism from './acts/ActPrism'
import InterludeBreathe from './acts/InterludeBreathe'
import SpectrumHUD from './components/SpectrumHUD'

export default function App() {
  const [biasAngle, setBiasAngle] = useState(28)

  const handleBiasChange = useCallback((deg) => {
    setBiasAngle(deg)
  }, [])

  return (
    <div className="relative min-h-screen bg-[#020204] text-slate-100">
      {/* Global subtle analog dark-room grain */}
      <div className="dark-grain fixed inset-0 z-50" aria-hidden="true" />

      {/* Persistent minimal corner coordinates & right-edge spectrum rail */}
      <SpectrumHUD biasAngle={biasAngle} />

      <main>
        {/* ACT I: Incidence & Light Bias (Complete) */}
        <ActPrism onBiasChange={handleBiasChange} />

        <div className="spectral-hairline opacity-35" />

        {/* INTERLUDE: "Breathe (In the Air)" Quote + Live Solar Eclipse */}
        <InterludeBreathe />

        <div className="spectral-hairline opacity-25" />

        {/* Upcoming Acts staged cleanly for Act-by-Act build */}
        <section
          id="works"
          className="min-h-[36vh] flex flex-col items-center justify-center px-6 text-center border-b border-white/[0.04]"
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
          className="min-h-[28vh] flex flex-col items-center justify-center px-6 text-center border-b border-white/[0.04]"
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
          className="min-h-[28vh] flex flex-col items-center justify-center px-6 text-center"
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
