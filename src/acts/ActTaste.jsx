import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { COVER_FALLBACKS, NAKAMURA_FALLBACK_TILES } from '../utils/nakamuraArt'

// Build a dense 108-tile (9x12 on desktop) crammed wall from the 36 unique Yusuke Nakamura artworks
// so every single pixel of the background is densely packed top-to-bottom on any viewport.
const WALL_TILES = Array.from({ length: 108 }, (_, i) => {
  const source = PORTFOLIO_DATA.actThree.nakamuraWall
  const base = source[(i * 7 + Math.floor(i / 9) * 5) % source.length]
  return {
    ...base,
    key: `wall-${i}-${base.id}`,
  }
})

function CollageTile({ tile }) {
  const [src, setSrc] = useState(tile.src)

  return (
    <div className="relative aspect-square overflow-hidden bg-[#050508]">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setSrc(NAKAMURA_FALLBACK_TILES[tile.fallbackIdx])}
        className="w-full h-full object-cover scale-[1.02] select-none pointer-events-none"
      />
    </div>
  )
}

function TasteTile({ item, accent, isPortraitArt, isHovered, isDimmed, onEnter, onLeave }) {
  const [src, setSrc] = useState(item.cover)

  return (
    <article
      tabIndex={0}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className={`group relative aspect-square overflow-hidden bg-[#040407] border transition-all duration-500 ${
        isDimmed ? 'opacity-65' : 'opacity-100'
      }`}
      style={{
        borderColor: isHovered ? `${accent}aa` : 'rgba(255, 255, 255, 0.08)',
        boxShadow: isHovered
          ? `0 16px 36px -14px rgba(0, 0, 0, 0.85), 0 0 22px -10px ${accent}`
          : 'none',
      }}
    >
      {/* Full-bleed cover image — darkroom-graded at rest so bright covers blend into the void,
          blooming into full color & clarity when hovered */}
      <img
        src={src}
        alt={item.title}
        loading="lazy"
        decoding="async"
        onError={() => setSrc(COVER_FALLBACKS[item.id] || NAKAMURA_FALLBACK_TILES[0])}
        className={`w-full h-full object-cover transition-all duration-500 ${
          isPortraitArt ? 'object-top' : 'object-center'
        } ${
          isHovered
            ? 'scale-[1.04] grayscale-0 brightness-[0.94] contrast-100 saturate-100'
            : 'scale-100 grayscale-[58%] brightness-[0.54] contrast-[1.08] saturate-[0.72]'
        }`}
      />

      {/* Soft darkroom veil + edge vignette so white covers (The Wall, Horimiya, Oregairu) never glare */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: isHovered
            ? 'linear-gradient(180deg, rgba(2,2,4,0.18) 0%, rgba(2,2,4,0.02) 42%, rgba(2,2,4,0.68) 78%, rgba(2,2,4,0.94) 100%)'
            : 'linear-gradient(180deg, rgba(2,2,4,0.34) 0%, rgba(2,2,4,0.18) 42%, rgba(2,2,4,0.74) 76%, rgba(2,2,4,0.96) 100%)',
        }}
      />

      {/* Top-left rank pill */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-1.5 py-0.5 bg-black/55 border border-white/[0.08]">
        <span
          className="w-1 h-1 rounded-full transition-shadow duration-300"
          style={{
            backgroundColor: isHovered ? accent : 'rgba(255, 255, 255, 0.45)',
            boxShadow: isHovered ? `0 0 8px ${accent}` : 'none',
          }}
        />
        <span className="font-pf-label text-[9.5px] sm:text-[10px] uppercase tabular-nums text-white/75">
          #{item.rank}
        </span>
      </div>

      {/* Bottom Title + Meta + Hover Note */}
      <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3.5 flex flex-col justify-end">
        <div className="font-pf-label text-[8.5px] sm:text-[9.5px] uppercase text-white/45 tracking-[0.05em] truncate">
          {item.meta}
        </div>
        <h3 className="font-pf-main font-medium text-xs sm:text-[15px] uppercase leading-tight text-white/88 group-hover:text-white mt-0.5 truncate transition-colors">
          {item.title}
        </h3>
        <p
          className={`font-pf-main text-[11px] text-white/75 leading-[1.35] overflow-hidden transition-all duration-300 ${
            isHovered ? 'max-h-16 opacity-100 mt-1.5' : 'max-h-0 opacity-0 mt-0'
          }`}
        >
          {item.note}
        </p>
      </div>
    </article>
  )
}

export default function ActTaste() {
  const sectionRef = useRef(null)
  const spotlightLayerRef = useRef(null)
  const lensRingRef = useRef(null)
  const [hoveredItemId, setHoveredItemId] = useState(null)

  const targetRef = useRef({ x: -999, y: -999, active: false })
  const smoothRef = useRef({ x: 0, y: 0, opacity: 0 })
  const visibleRef = useRef(true)

  // Pause cursor spotlight RAF when Act III is offscreen
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { rootMargin: '250px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 60fps smooth cursor spotlight interpolation (zero React re-renders per mousemove)
  useEffect(() => {
    let rafId = 0

    const tick = () => {
      if (!visibleRef.current) {
        rafId = requestAnimationFrame(tick)
        return
      }
      const target = targetRef.current
      const cur = smoothRef.current

      if (target.active) {
        cur.x += (target.x - cur.x) * 0.14
        cur.y += (target.y - cur.y) * 0.14
        cur.opacity += (1 - cur.opacity) * 0.1
      } else {
        cur.opacity += (0 - cur.opacity) * 0.08
      }

      const sx = `${cur.x.toFixed(1)}px`
      const sy = `${cur.y.toFixed(1)}px`
      const op = cur.opacity.toFixed(3)

      if (spotlightLayerRef.current) {
        const mask = `radial-gradient(290px circle at ${sx} ${sy}, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.65) 48%, transparent 100%)`
        spotlightLayerRef.current.style.maskImage = mask
        spotlightLayerRef.current.style.webkitMaskImage = mask
        spotlightLayerRef.current.style.opacity = op
      }

      if (lensRingRef.current) {
        lensRingRef.current.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0) translate(-50%, -50%)`
        lensRingRef.current.style.opacity = (cur.opacity * 0.5).toFixed(3)
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const handlePointerMove = (e) => {
    const el = sectionRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (!targetRef.current.active) {
      smoothRef.current.x = x
      smoothRef.current.y = y
    }
    targetRef.current = { x, y, active: true }
  }

  const handlePointerLeave = () => {
    targetRef.current.active = false
    setHoveredItemId(null)
  }

  const { eyebrow, heading, hint, credit, categories } = PORTFOLIO_DATA.actThree

  const verticalVoidMask = {
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
  }

  return (
    <section
      ref={sectionRef}
      id="canvas"
      aria-label="Act III — Influences & Taste"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative min-h-[100svh] w-full flex flex-col justify-between px-5 sm:px-8 md:px-11 py-24 md:py-28 overflow-hidden"
    >
      {/* Top optical thread continuing smoothly from Selected Works */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-14 z-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(146, 52, 255, 0.2) 60%, transparent 100%)',
        }}
      />

      {/* =========================================================
          DUAL-LAYER CRAMMED REAL YUSUKE NAKAMURA DARKROOM COLLAGE
          ========================================================= */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
        style={verticalVoidMask}
      >
        {/* LAYER A: Deeply dimmed, near-monochrome crammed wall (all Yusuke Nakamura art edge-to-edge) */}
        <div
          className="absolute -inset-6 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-[2px] -rotate-[1.5deg] scale-[1.06] opacity-85"
          style={{ filter: 'grayscale(82%) brightness(0.28) contrast(1.16)' }}
        >
          {WALL_TILES.map((tile) => (
            <CollageTile key={`dim-${tile.key}`} tile={tile} />
          ))}
        </div>

        {/* LAYER B: Full saturated Yusuke Nakamura color revealed inside the cursor spotlight */}
        <div
          ref={spotlightLayerRef}
          className="absolute inset-0"
          style={{ opacity: 0 }}
        >
          <div
            className="absolute -inset-6 grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-[2px] -rotate-[1.5deg] scale-[1.06]"
            style={{ filter: 'saturate(1.22) brightness(0.92) contrast(1.06)' }}
          >
            {WALL_TILES.map((tile) => (
              <CollageTile key={`lit-${tile.key}`} tile={tile} />
            ))}
          </div>
        </div>

        {/* Soft darkroom vignette so edges breathe cleanly into the void without hiding the crammed wall */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 50%, rgba(2, 2, 4, 0.28) 0%, rgba(2, 2, 4, 0.58) 72%, rgba(2, 2, 4, 0.88) 100%)',
          }}
        />
      </div>

      {/* Subtle optical spotlight lens ring tracking the cursor */}
      <div
        ref={lensRingRef}
        aria-hidden="true"
        className="absolute top-0 left-0 w-[300px] h-[300px] rounded-full pointer-events-none z-10"
        style={{
          opacity: 0,
          background:
            'radial-gradient(circle, rgba(255, 240, 200, 0.08) 0%, rgba(255, 190, 90, 0.03) 55%, transparent 72%)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      />

      {/* =========================================================
          FOREGROUND CONTENT: 3x3 IMAGE GRID (ANIME -> MANGA -> ALBUMS)
          ========================================================= */}
      <div className="relative z-20 max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center space-y-9">
        {/* Section Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.12] pb-5">
          <div className="space-y-1.5">
            <div className="font-pf-label text-[11px] uppercase text-white/55">
              03 // {eyebrow}
            </div>
            <h2 className="font-pf-main font-normal text-3xl sm:text-5xl uppercase leading-[1.04] text-white/95">
              {heading}
            </h2>
          </div>

          <p className="font-pf-label text-[11px] uppercase text-white/45 max-w-xs sm:text-right">
            {hint}
          </p>
        </div>

        {/* 3x3 Visual Grid: Row 1 = Top 3 Anime, Row 2 = Top 3 Manga, Row 3 = Top 3 Music Albums */}
        <div className="space-y-7">
          {categories.map((cat) => {
            const isPortraitArt = cat.id === 'anime' || cat.id === 'manga'
            return (
              <div key={cat.id} className="space-y-2.5">
                {/* Row Label */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-pf-label text-[10.5px] sm:text-[11px] uppercase text-white/80 bg-black/45 px-2 py-0.5 border border-white/[0.08]">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: cat.accent,
                        boxShadow: `0 0 8px ${cat.accent}`,
                      }}
                    />
                    {cat.num} · TOP 3 {cat.label}
                  </span>
                  <span className="font-pf-label text-[10px] uppercase text-white/35 hidden sm:inline">
                    ROW {cat.num} / 03
                  </span>
                </div>

                {/* 3 Image Tiles across */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                  {cat.items.map((item) => (
                    <TasteTile
                      key={item.id}
                      item={item}
                      accent={cat.accent}
                      isPortraitArt={isPortraitArt}
                      isHovered={hoveredItemId === item.id}
                      isDimmed={hoveredItemId !== null && hoveredItemId !== item.id}
                      onEnter={() => setHoveredItemId(item.id)}
                      onLeave={() => setHoveredItemId(null)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Explicit Artist Credit to Yusuke Nakamura */}
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.12] font-pf-label text-[10.5px] uppercase text-white/60">
          <span className="bg-black/50 px-2.5 py-1 border border-white/[0.08]">
            BACKGROUND COLLAGE ARTWORK BY{' '}
            <a
              href={credit.url}
              target="_blank"
              rel="noreferrer"
              className="text-white underline underline-offset-4 decoration-white/40 hover:decoration-white transition-colors"
            >
              {credit.artist} ({credit.jpName}) ↗
            </a>
          </span>
          <span className="text-white/45 bg-black/45 px-2 py-1">
            3×3 PERSONAL ARCHIVE · ANIME · MANGA · ALBUMS
          </span>
        </div>
      </div>

      {/* Bottom optical thread leading seamlessly into Act IV Finale */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-14 z-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(255, 208, 12, 0.25) 60%, rgba(255, 255, 255, 0.28) 100%)',
        }}
      />
    </section>
  )
}
