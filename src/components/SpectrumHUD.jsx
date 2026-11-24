import { useEffect, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { spectralRGB } from '../utils/optics'

const NAV_ITEMS = [
  { id: 'refraction', label: 'Refraction' },
  { id: 'works', label: 'Works' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'signal', label: 'Signal' },
]

export default function SpectrumHUD({ biasAngle = 28 }) {
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / docHeight)) : 0
      setScrollProgress(progress)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const [r, g, b] = spectralRGB(scrollProgress)
  const accentColor = `rgb(${r}, ${g}, ${b})`

  return (
    <>
      {/* Top Header styled after pinkfloyd.com: condensed masthead left, Neue Montreal 500 uppercase nav, BB Manual Mono CTA */}
      <header className="fixed top-0 inset-x-0 z-40 flex items-start justify-between px-6 py-6 md:px-11 md:py-7 pointer-events-none">
        <a href="#refraction" className="group pointer-events-auto">
          <div className="font-pf-wordmark text-xl md:text-2xl uppercase leading-none text-white/95 group-hover:text-white transition">
            {PORTFOLIO_DATA.name}
          </div>
          <div className="font-pf-label text-[11px] uppercase text-white/35 mt-1.5 flex items-center gap-2">
            <span>OPTICAL BIAS</span>
            <span className="text-white/20">·</span>
            <span className="tabular-nums text-white/55">
              {biasAngle >= 0 ? `+${biasAngle}°` : `${biasAngle}°`}
            </span>
          </div>
        </a>

        <nav
          aria-label="Portfolio sections"
          className="hidden sm:flex items-center gap-8 pointer-events-auto pt-1"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="font-pf-main font-medium text-[13px] md:text-[14px] uppercase text-white/55 hover:text-white transition-colors"
            >
              {item.label}
            </a>
          ))}
          <a
            href={PORTFOLIO_DATA.socials.github}
            target="_blank"
            rel="noreferrer"
            className="font-pf-label text-[12px] uppercase text-white/75 hover:text-white transition-colors border-l border-white/10 pl-6"
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
