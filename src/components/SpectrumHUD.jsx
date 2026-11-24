import { useEffect, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { spectralRGB } from '../utils/optics'

const NAV_ITEMS = [
  { id: 'refraction', label: 'Refraction' },
  { id: 'breathe', label: 'Eclipse' },
  { id: 'works', label: 'Works' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'signal', label: 'Signal' },
]

export default function SpectrumHUD({ biasAngle = 28 }) {
  const [scrollProgress, setScrollProgress] = useState(0)
  const [activeId, setActiveId] = useState('refraction')

  useEffect(() => {
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / docHeight)) : 0
      setScrollProgress(progress)

      // Determine active chapter based on viewport center
      const probeY = window.innerHeight * 0.42
      let current = 'refraction'
      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top <= probeY) {
          current = item.id
        }
      }
      setActiveId(current)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const [r, g, b] = spectralRGB(scrollProgress)
  const accentColor = `rgb(${r}, ${g}, ${b})`

  return (
    <>
      {/* Minimal pinkfloyd.com-inspired floating top bar: masthead left, quiet emblem center, active chapter nav right */}
      <header className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-6 py-5 md:px-11 md:py-7 pointer-events-none bg-gradient-to-b from-[#020204]/85 via-[#020204]/35 to-transparent">
        <a href="#refraction" className="group pointer-events-auto">
          <div className="font-pf-wordmark text-xl md:text-2xl uppercase leading-none text-white/95 group-hover:text-white transition">
            {PORTFOLIO_DATA.name}
          </div>
          <div className="font-pf-label text-[11px] uppercase text-white/35 mt-1 flex items-center gap-2">
            <span>{activeId.toUpperCase()}</span>
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

        <nav
          aria-label="Portfolio sections"
          className="hidden sm:flex items-center gap-7 pointer-events-auto"
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
                    className="absolute left-0 right-0 -bottom-0.5 h-px"
                    style={{
                      backgroundColor: accentColor,
                      boxShadow: `0 0 8px ${accentColor}`,
                    }}
                  />
                )}
              </a>
            )
          })}
          <a
            href={PORTFOLIO_DATA.socials.github}
            target="_blank"
            rel="noreferrer"
            className="font-pf-label text-[12px] uppercase text-white/70 hover:text-white transition-colors border-l border-white/10 pl-6"
          >
            GITHUB →
          </a>
        </nav>
      </header>

      {/* Right-Edge Hairline Spectrum Progress Rail */}
      <div
        aria-hidden="true"
        className="fixed right-3 md:right-5 top-1/2 -translate-y-1/2 h-36 w-px bg-white/[0.07] z-40 hidden md:block pointer-events-none"
      >
        <div
          className="w-full transition-all duration-150"
          style={{
            height: `${Math.max(8, scrollProgress * 100)}%`,
            background: `linear-gradient(180deg, rgba(255,255,255,0.25), ${accentColor})`,
            boxShadow: `0 0 10px ${accentColor}`,
          }}
        />
      </div>
    </>
  )
}
