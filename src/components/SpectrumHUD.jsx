import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { spectralRGB } from '../utils/optics'

const NAV_ITEMS = [
  { id: 'refraction', num: '01', label: 'Refraction' },
  { id: 'breathe', num: '02', label: 'Eclipse' },
  { id: 'works', num: '03', label: 'Works' },
  { id: 'canvas', num: '04', label: 'Taste' },
  { id: 'signal', num: '05', label: 'Signal' },
]

export default function SpectrumHUD({ biasAngle = 28, onReplayIntro }) {
  const [activeId, setActiveId] = useState('refraction')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Direct DOM refs for 0ms real-time GPU-composited scroll sync (zero CSS transition lag, zero scroll re-renders)
  const railFillRef = useRef(null)
  const railHeadRef = useRef(null)
  const activeUnderlineRef = useRef(null)
  const activeIdRef = useRef('refraction')
  const accentRef = useRef('rgb(255, 32, 68)')

  useEffect(() => {
    const syncScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0

      const [r, g, b] = spectralRGB(progress)
      const accentColor = `rgb(${r}, ${g}, ${b})`
      accentRef.current = accentColor

      // 1. Instant hardware-accelerated right-edge spectral rail update (no transition lag!)
      if (railFillRef.current) {
        railFillRef.current.style.transform = `scaleY(${Math.max(0.02, progress).toFixed(4)})`
        railFillRef.current.style.background = `linear-gradient(180deg, rgba(255,255,255,0.28), ${accentColor})`
        railFillRef.current.style.boxShadow = `0 0 10px ${accentColor}`
      }

      if (railHeadRef.current) {
        railHeadRef.current.style.top = `${(progress * 100).toFixed(2)}%`
        railHeadRef.current.style.backgroundColor = accentColor
        railHeadRef.current.style.boxShadow = `0 0 10px 2px ${accentColor}`
      }

      if (activeUnderlineRef.current) {
        activeUnderlineRef.current.style.backgroundColor = accentColor
        activeUnderlineRef.current.style.boxShadow = `0 0 8px ${accentColor}`
      }

      // 2. Real-time active chapter detection (including clean bottom-of-page lock onto Signal)
      let current = 'refraction'
      if (docHeight > 0 && scrollTop >= docHeight - 28) {
        current = 'signal'
      } else {
        const probeY = window.innerHeight * 0.38
        for (const item of NAV_ITEMS) {
          const el = document.getElementById(item.id)
          if (!el) continue
          const rect = el.getBoundingClientRect()
          if (rect.top <= probeY) {
            current = item.id
          }
        }
      }

      if (current !== activeIdRef.current) {
        activeIdRef.current = current
        setActiveId(current)
      }
    }

    // Also resync whenever lazy-loaded artwork changes total page height
    const ro = new ResizeObserver(syncScroll)
    ro.observe(document.documentElement)

    window.addEventListener('scroll', syncScroll, { passive: true })
    window.addEventListener('resize', syncScroll, { passive: true })
    syncScroll()

    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', syncScroll)
      window.removeEventListener('resize', syncScroll)
    }
  }, [])

  // Keep newly mounted active underline tinted accurately when activeId switches
  useEffect(() => {
    if (activeUnderlineRef.current) {
      activeUnderlineRef.current.style.backgroundColor = accentRef.current
      activeUnderlineRef.current.style.boxShadow = `0 0 8px ${accentRef.current}`
    }
  }, [activeId])

  // Lock background scroll & support ESC when mobile menu is open
  useEffect(() => {
    if (!mobileMenuOpen) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileMenuOpen])

  const activeLabel = NAV_ITEMS.find((n) => n.id === activeId)?.label || 'Refraction'

  return (
    <>
      {/* Minimal pinkfloyd.com-inspired floating top bar */}
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-6 py-5 md:px-11 md:py-7 pointer-events-none bg-gradient-to-b from-[#020204]/90 via-[#020204]/40 to-transparent">
        <a href="#refraction" className="group pointer-events-auto">
          <div className="font-pf-wordmark text-xl md:text-2xl uppercase leading-none text-white/95 group-hover:text-white transition">
            {PORTFOLIO_DATA.name}
          </div>
          <div className="font-pf-label text-[11px] uppercase text-white/38 mt-1 flex items-center gap-2">
            <span>{activeLabel}</span>
            <span className="text-white/20">·</span>
            <span className="tabular-nums text-white/50">
              {biasAngle >= 0 ? `+${biasAngle}°` : `${biasAngle}°`}
            </span>
          </div>
        </a>

        {/* Subtle centered eclipse emblem (pinkfloyd.com centered crest rhythm) */}
        <a
          href="#breathe"
          aria-label="Jump to Eclipse interlude"
          className="hidden lg:flex items-center justify-center w-7 h-7 rounded-full border border-white/25 hover:border-amber-300/75 transition-colors pointer-events-auto relative"
        >
          <span className="w-5 h-5 rounded-full bg-[#020204]" />
          <span
            className="absolute right-0.5 bottom-1 w-1.5 h-1.5 rounded-full transition-colors"
            style={{
              backgroundColor: activeId === 'breathe' ? '#ffd00c' : '#ffffff',
              boxShadow:
                activeId === 'breathe'
                  ? '0 0 10px 2px rgba(255, 180, 40, 0.9)'
                  : '0 0 6px rgba(255,255,255,0.65)',
            }}
          />
        </a>

        {/* Desktop Chapter Navigation */}
        <nav
          aria-label="Portfolio sections"
          className="hidden sm:flex items-center gap-6 md:gap-7 pointer-events-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeId === item.id
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={`font-pf-main font-medium text-[13px] md:text-[13.5px] uppercase transition-colors relative py-1 ${
                  isActive ? 'text-white' : 'text-white/40 hover:text-white/85'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    ref={activeUnderlineRef}
                    className="absolute left-0 right-0 -bottom-0.5 h-px"
                  />
                )}
              </a>
            )
          })}
          {onReplayIntro && (
            <button
              type="button"
              onClick={onReplayIntro}
              className="font-pf-label text-[11px] uppercase text-white/40 hover:text-white transition-colors cursor-pointer border-l border-white/10 pl-5 md:pl-6"
            >
              INTRO
            </button>
          )}
          <a
            href={PORTFOLIO_DATA.socials.github}
            target="_blank"
            rel="noreferrer"
            className="font-pf-label text-[12px] uppercase text-white/70 hover:text-white transition-colors border-l border-white/10 pl-5 md:pl-6"
          >
            GITHUB →
          </a>
        </nav>

        {/* Mobile Chapter Menu Trigger (< sm) */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-expanded={mobileMenuOpen}
          aria-label="Toggle section menu"
          className="sm:hidden pointer-events-auto font-pf-label text-[11px] uppercase tracking-[0.12em] text-white/80 hover:text-white px-3 py-1.5 border border-white/15 bg-[#020204]/70 backdrop-blur-sm cursor-pointer"
        >
          {mobileMenuOpen ? 'CLOSE ×' : 'MENU ≡'}
        </button>
      </header>

      {/* Mobile Fullscreen Frameless Chapter Overlay */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-50 sm:hidden bg-[#020204]/96 backdrop-blur-md flex flex-col justify-between px-6 py-7 animate-pf-fade"
        >
          <div className="flex items-center justify-between">
            <span className="font-pf-wordmark text-xl uppercase text-white/95">
              {PORTFOLIO_DATA.name}
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="font-pf-label text-[11px] uppercase text-white/70 hover:text-white px-3 py-1.5 border border-white/15 cursor-pointer"
            >
              CLOSE ×
            </button>
          </div>

          <nav className="flex flex-col divide-y divide-white/[0.08]">
            {NAV_ITEMS.map((item) => {
              const isActive = activeId === item.id
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-5 flex items-baseline justify-between"
                >
                  <span
                    className={`font-pf-main text-2xl uppercase ${
                      isActive ? 'text-white' : 'text-white/55'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="font-pf-label text-[11px] text-white/35 tabular-nums">
                    {item.num}
                  </span>
                </a>
              )
            })}
          </nav>

          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08] font-pf-label text-[11px] uppercase">
            {onReplayIntro && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false)
                  onReplayIntro()
                }}
                className="text-white/55 hover:text-white cursor-pointer"
              >
                REPLAY INTRO ↺
              </button>
            )}
            <a
              href={PORTFOLIO_DATA.socials.github}
              target="_blank"
              rel="noreferrer"
              className="text-white/80 hover:text-white"
            >
              GITHUB →
            </a>
          </div>
        </div>
      )}

      {/* Right-Edge Real-Time Spectrum Rail + Interactive Chapter Ticks (0ms GPU sync) */}
      <aside
        aria-label="Scroll progress and chapter index"
        className="fixed right-3 md:right-5 top-1/2 -translate-y-1/2 z-40 hidden md:flex items-center gap-3"
      >
        {/* Subtle interactive chapter tick buttons */}
        <div className="flex flex-col justify-between h-44 py-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeId === item.id
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-label={`Jump to ${item.label}`}
                className="group relative flex items-center justify-end gap-2 py-1"
              >
                <span
                  className={`font-pf-label text-[9px] uppercase tracking-[0.08em] transition-opacity duration-150 ${
                    isActive
                      ? 'opacity-75 text-white'
                      : 'opacity-0 group-hover:opacity-80 text-white/60'
                  }`}
                >
                  {item.label}
                </span>
                <span
                  className={`block h-px transition-all duration-150 ${
                    isActive
                      ? 'w-3 bg-white/90'
                      : 'w-1.5 bg-white/20 group-hover:w-2.5 group-hover:bg-white/65'
                  }`}
                />
              </a>
            )
          })}
        </div>

        {/* Continuous real-time 0-lag hairline track */}
        <div className="relative h-44 w-px bg-white/[0.09] pointer-events-none">
          <div
            ref={railFillRef}
            className="absolute inset-0 origin-top will-change-transform"
            style={{ transform: 'scaleY(0.02)' }}
          />
          <span
            ref={railHeadRef}
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full will-change-transform"
            style={{ top: '0%' }}
          />
        </div>
      </aside>
    </>
  )
}
