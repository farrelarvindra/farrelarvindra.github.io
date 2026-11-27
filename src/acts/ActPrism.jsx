import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { drawRainbowFan, setupHiDPICanvas } from '../utils/optics'

// Regular 3D tetrahedron local vertices (Apex V0, Back-Left V1, Back-Right V2, Front-Ridge V3)
const TETRA_VERTS = [
  [0.0, -1.08, -0.05],
  [-0.95, 0.5, -0.48],
  [0.95, 0.5, -0.48],
  [0.06, 0.64, 0.82],
]

function projectTetraVertex([x, y, z], px, py, sz, pitch, yaw, roll) {
  const cx = Math.cos(pitch)
  const sx = Math.sin(pitch)
  const y1 = y * cx - z * sx
  const z1 = y * sx + z * cx

  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const x2 = x * cy + z1 * sy
  const z2 = -x * sy + z1 * cy

  const cz = Math.cos(roll)
  const szR = Math.sin(roll)
  const x3 = x2 * cz - y1 * szR
  const y3 = x2 * szR + y1 * cz

  const persp = 4.2 / (4.2 - z2)
  return {
    x: px + x3 * sz * persp,
    y: py + y3 * sz * persp,
    z: z2,
  }
}

function barycentric3(a, b, c, wa, wb, wc) {
  return {
    x: a.x * wa + b.x * wb + c.x * wc,
    y: a.y * wa + b.y * wb + c.y * wc,
  }
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

export default function ActPrism({
  onBiasChange,
  introState = 'entered',
  skipInstant = false,
}) {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const copyRef = useRef(null)
  const visibleRef = useRef(true)
  const targetBiasRef = useRef(0.28)
  const smoothBiasRef = useRef(0.28)
  const lastReportedDegRef = useRef(28)
  const introStateRef = useRef(introState)
  const skipInstantRef = useRef(skipInstant)
  const emergenceRef = useRef(introState === 'entered' ? 1 : 0)
  const scrollRatioRef = useRef(0)
  const [activeDiscipline, setActiveDiscipline] = useState(null)

  const syncCopyTransform = () => {
    const el = copyRef.current
    if (!el) return
    const copyReveal = smoothstep(0.36, 1.0, emergenceRef.current)
    const ratio = scrollRatioRef.current
    const scrollOpacity = Math.max(0.08, 1 - ratio * 0.92)
    const opacity = scrollOpacity * copyReveal
    const yOffset = -ratio * 28 + (1 - copyReveal) * 18
    el.style.opacity = opacity.toFixed(3)
    el.style.transform = `translate3d(0, ${yOffset.toFixed(1)}px, 0)`
  }

  useEffect(() => {
    introStateRef.current = introState
    skipInstantRef.current = skipInstant
    if (introState === 'portal') {
      emergenceRef.current = 0
      syncCopyTransform()
    } else if (introState === 'entered' && skipInstant) {
      emergenceRef.current = 1
      syncCopyTransform()
    }
  }, [introState, skipInstant])

  // Real-time 0-lag scroll choreography via direct DOM ref (zero React re-renders per scroll)
  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight || 1
      scrollRatioRef.current = Math.max(0, Math.min(1, window.scrollY / (vh * 0.72)))
      syncCopyTransform()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Pause 2D optical canvas when scrolled far offscreen so scrolling stays silky-smooth
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { rootMargin: '220px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let sizeState = setupHiDPICanvas(canvas)
    const reflStrength = 0.78
    let lastTs = performance.now()
    let rafId = 0

    const handleResize = () => {
      sizeState = setupHiDPICanvas(canvas)
    }
    window.addEventListener('resize', handleResize)

    const render = (t) => {
      const dt = Math.min(0.05, Math.max(0.001, (t - lastTs) * 0.001))
      lastTs = t

      if (!visibleRef.current) {
        rafId = requestAnimationFrame(render)
        return
      }
      if (!sizeState) sizeState = setupHiDPICanvas(canvas)
      if (sizeState) {
        const { w, h, ctx: pCtx } = sizeState

        // Transparent clear over the starless #020204 abyss
        pCtx.globalCompositeOperation = 'source-over'
        pCtx.clearRect(0, 0, w, h)

        // Idle cleanly while user is still inside the Abyss Portal before throat opens
        if (introStateRef.current === 'portal') {
          rafId = requestAnimationFrame(render)
          return
        }

        if (emergenceRef.current < 1) {
          const speed = skipInstantRef.current ? 2.6 : 0.76
          emergenceRef.current = Math.min(1, emergenceRef.current + dt * speed)
          syncCopyTransform()
        }

        const em = emergenceRef.current
        const crystalVis = smoothstep(0.0, 0.48, em)
        const rayVis = smoothstep(0.14, 0.62, em)
        const dispVis = smoothstep(0.48, 1.0, em)

        smoothBiasRef.current += (targetBiasRef.current - smoothBiasRef.current) * 0.08
        const breathe = Math.sin(t * 0.0009) * 0.035
        const bias = smoothBiasRef.current + breathe

        const roundedDeg = Math.round(smoothBiasRef.current * 100)
        if (roundedDeg !== lastReportedDegRef.current) {
          lastReportedDegRef.current = roundedDeg
          if (onBiasChange) onBiasChange(roundedDeg)
        }

        // Small, understated 3D tetrahedron anchor (upper-left third so light dominates 80% of the dark room)
        const px = w * 0.33
        const py = h * 0.39 + (1 - crystalVis) * 10
        const sz = Math.min(w, h) * 0.08 * (0.92 + 0.08 * crystalVis)

        // Subtle 3D orientation: diagonal cant + gentle 3D yaw breathing + bias pivot
        const pitch = 0.16 - bias * 0.08
        const yaw = -0.08 + Math.sin(t * 0.00065) * 0.14 + bias * 0.12
        const roll = -0.26 + bias * 0.15

        const [p0, p1, p2, p3] = TETRA_VERTS.map((v) =>
          projectTetraVertex(v, px, py, sz, pitch, yaw, roll),
        )

        const wApexIn = Math.max(0.22, Math.min(0.56, 0.4 - bias * 0.09))
        const entryPt = barycentric3(p0, p1, p3, wApexIn, 0.34, 1 - wApexIn - 0.34)

        const wApexOut = Math.max(0.22, Math.min(0.54, 0.36 - bias * 0.06))
        const exitPt = barycentric3(p0, p2, p3, wApexOut, 0.36, 1 - wApexOut - 0.36)

        const baseReflPt = barycentric3(p1, p2, p3, 0.33, 0.33, 0.34)

        const diag = Math.hypot(w, h)
        const fanReach = 0.22 + 0.78 * dispVis

        // 2. SECONDARY RAINBOW REFLECTIONS
        const reflAngleUp = -0.46 + bias * 0.24
        const reflSpreadUp = 0.16 + Math.abs(bias) * 0.06
        if (dispVis > 0.005) {
          drawRainbowFan(
            pCtx,
            exitPt.x,
            exitPt.y,
            reflAngleUp,
            reflSpreadUp,
            diag * 0.58 * fanReach,
            2.2,
            0.42 * reflStrength * dispVis,
            22,
            true,
          )

          const reflAngleDownLeft = 2.38 - bias * 0.2
          const reflSpreadDown = 0.22 + Math.abs(bias) * 0.08
          drawRainbowFan(
            pCtx,
            entryPt.x + 4,
            entryPt.y + 6,
            reflAngleDownLeft,
            reflSpreadDown,
            diag * 0.46 * fanReach,
            2.0,
            0.36 * reflStrength * dispVis,
            20,
            false,
          )

          const reflAngleBase = 1.28 + bias * 0.18
          drawRainbowFan(
            pCtx,
            baseReflPt.x,
            baseReflPt.y,
            reflAngleBase,
            0.19,
            diag * 0.38 * fanReach,
            3.0,
            0.3 * reflStrength * dispVis,
            18,
            false,
          )
        }

        // 3. COHERENT INCIDENT WHITE RAY (pierces out of the abyss onto the crystal facet)
        const beamStartY = py - h * 0.22 - bias * (h * 0.28)
        if (rayVis > 0.005) {
          const rayTipX = -10 + (entryPt.x + 10) * rayVis
          const rayTipY = beamStartY + (entryPt.y - beamStartY) * rayVis
          pCtx.save()
          pCtx.globalCompositeOperation = 'lighter'

          const outerIn = pCtx.createLinearGradient(0, beamStartY, rayTipX, rayTipY)
          outerIn.addColorStop(0, `rgba(200, 225, 255, ${(0.03 * rayVis).toFixed(3)})`)
          outerIn.addColorStop(1, `rgba(225, 240, 255, ${(0.22 * rayVis).toFixed(3)})`)
          pCtx.strokeStyle = outerIn
          pCtx.lineWidth = 13
          pCtx.beginPath()
          pCtx.moveTo(-10, beamStartY)
          pCtx.lineTo(rayTipX, rayTipY)
          pCtx.stroke()

          const coreIn = pCtx.createLinearGradient(0, beamStartY, rayTipX, rayTipY)
          coreIn.addColorStop(0, `rgba(255, 255, 255, ${(0.38 * rayVis).toFixed(3)})`)
          coreIn.addColorStop(1, `rgba(255, 255, 255, ${(0.96 * rayVis).toFixed(3)})`)
          pCtx.strokeStyle = coreIn
          pCtx.lineWidth = 2.6
          pCtx.beginPath()
          pCtx.moveTo(-10, beamStartY)
          pCtx.lineTo(rayTipX, rayTipY)
          pCtx.stroke()
          pCtx.restore()
        }

        // 4. 3D TETRAHEDRON BACK FACETS, INTERNAL DISPERSION & FRONT CRYSTAL FACETS
        pCtx.save()
        pCtx.globalAlpha = crystalVis
        pCtx.fillStyle = 'rgba(160, 195, 255, 0.024)'
        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.13)'
        pCtx.lineWidth = 0.8
        pCtx.beginPath()
        pCtx.moveTo(p0.x, p0.y)
        pCtx.lineTo(p1.x, p1.y)
        pCtx.lineTo(p2.x, p2.y)
        pCtx.closePath()
        pCtx.fill()
        pCtx.stroke()

        pCtx.fillStyle = 'rgba(140, 180, 255, 0.02)'
        pCtx.beginPath()
        pCtx.moveTo(p1.x, p1.y)
        pCtx.lineTo(p2.x, p2.y)
        pCtx.lineTo(p3.x, p3.y)
        pCtx.closePath()
        pCtx.fill()
        pCtx.stroke()
        pCtx.restore()

        const internalHit = smoothstep(0.42, 0.82, em)
        if (internalHit > 0.005) {
          const internalAngle = Math.atan2(exitPt.y - entryPt.y, exitPt.x - entryPt.x)
          const internalDist = Math.hypot(exitPt.x - entryPt.x, exitPt.y - entryPt.y)
          drawRainbowFan(
            pCtx,
            entryPt.x,
            entryPt.y,
            internalAngle,
            0.28,
            internalDist * 1.12,
            0.8,
            0.85 * internalHit,
            16,
            false,
          )
        }

        pCtx.save()
        pCtx.globalAlpha = crystalVis * (0.25 + 0.75 * dispVis)
        pCtx.globalCompositeOperation = 'lighter'
        const edgeRainbow = pCtx.createLinearGradient(p1.x, p1.y, p2.x, p2.y)
        edgeRainbow.addColorStop(0.0, 'rgba(146, 52, 255, 0.45)')
        edgeRainbow.addColorStop(0.35, 'rgba(0, 210, 255, 0.5)')
        edgeRainbow.addColorStop(0.68, 'rgba(255, 208, 12, 0.5)')
        edgeRainbow.addColorStop(1.0, 'rgba(255, 32, 68, 0.45)')

        pCtx.strokeStyle = edgeRainbow
        pCtx.lineWidth = 1.65
        pCtx.beginPath()
        pCtx.moveTo(p1.x, p1.y)
        pCtx.lineTo(p2.x, p2.y)
        pCtx.moveTo(p1.x, p1.y)
        pCtx.lineTo(p3.x, p3.y)
        pCtx.stroke()
        pCtx.restore()

        pCtx.save()
        pCtx.globalAlpha = crystalVis
        pCtx.fillStyle = 'rgba(255, 255, 255, 0.032)'
        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
        pCtx.lineWidth = 0.95
        pCtx.beginPath()
        pCtx.moveTo(p0.x, p0.y)
        pCtx.lineTo(p1.x, p1.y)
        pCtx.lineTo(p3.x, p3.y)
        pCtx.closePath()
        pCtx.fill()
        pCtx.stroke()

        pCtx.fillStyle = 'rgba(220, 238, 255, 0.046)'
        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.36)'
        pCtx.beginPath()
        pCtx.moveTo(p0.x, p0.y)
        pCtx.lineTo(p3.x, p3.y)
        pCtx.lineTo(p2.x, p2.y)
        pCtx.closePath()
        pCtx.fill()
        pCtx.stroke()

        const ridgeGrad = pCtx.createLinearGradient(p0.x, p0.y, p3.x, p3.y)
        ridgeGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.88)')
        ridgeGrad.addColorStop(0.55, 'rgba(225, 240, 255, 0.52)')
        ridgeGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.78)')
        pCtx.strokeStyle = ridgeGrad
        pCtx.lineWidth = 1.35
        pCtx.beginPath()
        pCtx.moveTo(p0.x, p0.y)
        pCtx.lineTo(p3.x, p3.y)
        pCtx.stroke()
        pCtx.restore()

        // 5. PRIMARY BIASED RAINBOW DISPERSION BEAM
        const mainAngle = 0.36 + bias * 0.34
        const mainSpread = 0.3 + Math.abs(bias) * 0.14
        if (dispVis > 0.005) {
          drawRainbowFan(
            pCtx,
            exitPt.x,
            exitPt.y,
            mainAngle,
            mainSpread,
            diag * 0.88 * fanReach,
            2.8,
            0.96 * dispVis,
            36,
            false,
          )
        }

        // Subtle optical pinpoints at entry & exit facets
        pCtx.save()
        pCtx.globalCompositeOperation = 'lighter'
        ;[entryPt, exitPt].forEach((pt, idx) => {
          const pinVis = idx === 0 ? smoothstep(0.45, 0.7, em) : dispVis
          if (pinVis < 0.01) return
          const r = idx === 1 ? 14 : 9
          const g = pCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r)
          g.addColorStop(0, `rgba(255, 255, 255, ${(0.85 * pinVis).toFixed(3)})`)
          g.addColorStop(
            0.4,
            idx === 1
              ? `rgba(255, 220, 160, ${(0.28 * pinVis).toFixed(3)})`
              : `rgba(200, 230, 255, ${(0.24 * pinVis).toFixed(3)})`,
          )
          g.addColorStop(1, 'rgba(0, 0, 0, 0)')
          pCtx.fillStyle = g
          pCtx.beginPath()
          pCtx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
          pCtx.fill()
        })
        pCtx.restore()
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
    }
  }, [onBiasChange])

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY
    if (typeof clientY !== 'number') return
    const ny = ((clientY - rect.top) / rect.height - 0.42) * 2.1
    targetBiasRef.current = Math.max(-1, Math.min(1, ny))
  }

  return (
    <section
      ref={sectionRef}
      id="refraction"
      onMouseMove={handlePointerMove}
      onTouchMove={handlePointerMove}
      className="relative min-h-svh w-full flex flex-col justify-end p-6 md:p-11 pb-12 md:pb-16 overflow-hidden"
    >
      {/* Full-Bleed Optical Tetrahedron & Light-Bias Canvas (soft bottom edge fade into void) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-0 cursor-crosshair"
        style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 86%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 86%, transparent 100%)',
        }}
      />

      {/* Frameless pinkfloyd.com Editorial Composition with real-time scroll-exit fade */}
      <div
        ref={copyRef}
        className="relative z-20 flex flex-wrap items-end justify-between gap-10 pt-64 pointer-events-none will-change-transform"
      >
        {/* Bottom-Left Positioning Copy */}
        <div className="max-w-lg space-y-3">
          <p className="font-pf-label text-[11px] uppercase text-white/40">
            {PORTFOLIO_DATA.hero.prompt}
          </p>
          <h1 className="font-pf-main font-normal text-3xl sm:text-5xl uppercase leading-[1.08] text-white/95">
            {PORTFOLIO_DATA.hero.headlineTop}
            <br />
            <span className="text-white/65">{PORTFOLIO_DATA.hero.headlineItalic}</span>
          </h1>
          <p className="font-pf-main text-[13.5px] sm:text-[14.5px] text-white/45 leading-[1.45] max-w-md">
            {PORTFOLIO_DATA.hero.bio}
          </p>

          <div className="pt-3 flex items-center gap-7 pointer-events-auto font-pf-label text-[12px] uppercase">
            <a
              href="#breathe"
              className="text-white/90 hover:text-amber-300 transition-colors flex items-center gap-2"
            >
              <span>DESCEND</span>
              <span className="text-white/45">↓</span>
            </a>
            <a
              href={PORTFOLIO_DATA.socials.github}
              target="_blank"
              rel="noreferrer"
              className="text-white/45 hover:text-white transition-colors"
            >
              @{PORTFOLIO_DATA.handle} →
            </a>
          </div>
        </div>

        {/* Bottom-Right Frameless Wavelength Index (Zero rounded glass box — raw editorial rows) */}
        <div className="pointer-events-auto w-full sm:w-auto min-w-[260px]">
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-white/[0.12]">
            <span className="font-pf-label text-[11px] text-white/40 uppercase">
              SPECTRUM
            </span>
            <span className="font-pf-label text-[11px] text-white/30 uppercase tabular-nums">
              {activeDiscipline ? activeDiscipline.nm : '410–680NM'}
            </span>
          </div>

          <ul className="divide-y divide-white/[0.06]">
            {PORTFOLIO_DATA.wavelengths.map((w) => {
              const isHovered = activeDiscipline?.nm === w.nm
              return (
                <li
                  key={w.nm}
                  tabIndex={0}
                  onMouseEnter={() => {
                    setActiveDiscipline(w)
                    targetBiasRef.current = w.biasPreset
                  }}
                  onMouseLeave={() => setActiveDiscipline(null)}
                  onFocus={() => {
                    setActiveDiscipline(w)
                    targetBiasRef.current = w.biasPreset
                  }}
                  onBlur={() => setActiveDiscipline(null)}
                  className="flex items-center justify-between gap-8 cursor-pointer group py-2"
                >
                  <span className="flex items-center gap-2.5 font-pf-label text-[11px] uppercase text-white/40 group-hover:text-white transition-colors">
                    <span
                      className="w-1.5 h-1.5 rounded-full transition-transform duration-200 group-hover:scale-125"
                      style={{
                        backgroundColor: w.color,
                        boxShadow: isHovered ? `0 0 10px ${w.color}` : 'none',
                      }}
                    />
                    {w.nm}
                  </span>
                  <span className="font-pf-main font-medium text-[12.5px] uppercase text-white/60 group-hover:text-white transition-colors text-right">
                    {w.domain}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Delicate vertical optical thread leading eye downward into the Eclipse interlude */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-16 z-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(255, 208, 12, 0.35) 55%, rgba(255, 110, 20, 0.55) 100%)',
        }}
      />
    </section>
  )
}
