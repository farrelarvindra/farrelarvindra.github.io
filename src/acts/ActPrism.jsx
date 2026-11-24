import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { drawRainbowFan, setupHiDPICanvas, spectralRGB } from '../utils/optics'

// Deterministic suspended dust motes (sparkle only inside the incident & refracted light paths)
const INITIAL_MOTES = Array.from({ length: 95 }, (_, i) => ({
  x: ((i * 67.3) % 100) / 100,
  y: ((i * 41.9) % 100) / 100,
  vx: (((i * 13) % 9) - 4) * 0.00003,
  vy: (((i * 29) % 9) - 4) * 0.00003,
  r: 0.55 + (i % 3) * 0.35,
  tw: i * 1.1,
}))

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

export default function ActPrism({ onBiasChange }) {
  const canvasRef = useRef(null)
  const targetBiasRef = useRef(0.28)
  const smoothBiasRef = useRef(0.28)
  const lastReportedDegRef = useRef(28)
  const [activeDiscipline, setActiveDiscipline] = useState(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let sizeState = setupHiDPICanvas(canvas)
    const motes = INITIAL_MOTES.map((m) => ({ ...m }))
    const reflStrength = 0.78
    let rafId = 0

    const handleResize = () => {
      sizeState = setupHiDPICanvas(canvas)
    }
    window.addEventListener('resize', handleResize)

    const render = (t) => {
      if (!sizeState) sizeState = setupHiDPICanvas(canvas)
      if (sizeState) {
        const { w, h, ctx: pCtx } = sizeState

        smoothBiasRef.current += (targetBiasRef.current - smoothBiasRef.current) * 0.08
        const breathe = Math.sin(t * 0.0009) * 0.035
        const bias = smoothBiasRef.current + breathe

        const roundedDeg = Math.round(smoothBiasRef.current * 100)
        if (roundedDeg !== lastReportedDegRef.current) {
          lastReportedDegRef.current = roundedDeg
          if (onBiasChange) onBiasChange(roundedDeg)
        }

        // 1. PURE DEEP DARKNESS (#020204)
        pCtx.globalCompositeOperation = 'source-over'
        pCtx.fillStyle = '#020204'
        pCtx.fillRect(0, 0, w, h)

        // Small, understated 3D tetrahedron anchor (upper-left third so light dominates 80% of the dark room)
        const px = w * 0.33
        const py = h * 0.39
        const sz = Math.min(w, h) * 0.08

        // Subtle 3D orientation: diagonal cant + gentle 3D yaw breathing + bias pivot
        const pitch = 0.16 - bias * 0.08
        const yaw = -0.08 + Math.sin(t * 0.00065) * 0.14 + bias * 0.12
        const roll = -0.26 + bias * 0.15

        const [p0, p1, p2, p3] = TETRA_VERTS.map((v) =>
          projectTetraVertex(v, px, py, sz, pitch, yaw, roll),
        )

        // Exact optical attachment points on Left Entry Face (p0,p1,p3), Right Exit Face (p0,p2,p3), and Base (p1,p2,p3)
        const wApexIn = Math.max(0.22, Math.min(0.56, 0.4 - bias * 0.09))
        const entryPt = barycentric3(p0, p1, p3, wApexIn, 0.34, 1 - wApexIn - 0.34)

        const wApexOut = Math.max(0.22, Math.min(0.54, 0.36 - bias * 0.06))
        const exitPt = barycentric3(p0, p2, p3, wApexOut, 0.36, 1 - wApexOut - 0.36)

        const baseReflPt = barycentric3(p1, p2, p3, 0.33, 0.33, 0.34)

        const diag = Math.hypot(w, h)

        // 2. SECONDARY RAINBOW REFLECTIONS
        // Reflection A: Upper-right grazing rainbow reflection
        const reflAngleUp = -0.46 + bias * 0.24
        const reflSpreadUp = 0.16 + Math.abs(bias) * 0.06
        drawRainbowFan(
          pCtx,
          exitPt.x,
          exitPt.y,
          reflAngleUp,
          reflSpreadUp,
          diag * 0.58,
          2.2,
          0.42 * reflStrength,
          22,
          true,
        )

        // Reflection B: Downward-left grazing surface rainbow reflection
        const reflAngleDownLeft = 2.38 - bias * 0.2
        const reflSpreadDown = 0.22 + Math.abs(bias) * 0.08
        drawRainbowFan(
          pCtx,
          entryPt.x + 4,
          entryPt.y + 6,
          reflAngleDownLeft,
          reflSpreadDown,
          diag * 0.46,
          2.0,
          0.36 * reflStrength,
          20,
          false,
        )

        // Reflection C: Steep crystal-base rainbow caustic spill
        const reflAngleBase = 1.28 + bias * 0.18
        drawRainbowFan(
          pCtx,
          baseReflPt.x,
          baseReflPt.y,
          reflAngleBase,
          0.19,
          diag * 0.38,
          3.0,
          0.3 * reflStrength,
          18,
          false,
        )

        // 3. COHERENT INCIDENT WHITE RAY
        const beamStartY = py - h * 0.22 - bias * (h * 0.28)
        pCtx.save()
        pCtx.globalCompositeOperation = 'lighter'

        const outerIn = pCtx.createLinearGradient(0, beamStartY, entryPt.x, entryPt.y)
        outerIn.addColorStop(0, 'rgba(200, 225, 255, 0.03)')
        outerIn.addColorStop(1, 'rgba(225, 240, 255, 0.22)')
        pCtx.strokeStyle = outerIn
        pCtx.lineWidth = 13
        pCtx.beginPath()
        pCtx.moveTo(-10, beamStartY)
        pCtx.lineTo(entryPt.x, entryPt.y)
        pCtx.stroke()

        const coreIn = pCtx.createLinearGradient(0, beamStartY, entryPt.x, entryPt.y)
        coreIn.addColorStop(0, 'rgba(255, 255, 255, 0.38)')
        coreIn.addColorStop(1, 'rgba(255, 255, 255, 0.96)')
        pCtx.strokeStyle = coreIn
        pCtx.lineWidth = 2.6
        pCtx.beginPath()
        pCtx.moveTo(-10, beamStartY)
        pCtx.lineTo(entryPt.x, entryPt.y)
        pCtx.stroke()
        pCtx.restore()

        // 4. 3D TETRAHEDRON BACK FACETS, INTERNAL DISPERSION & FRONT CRYSTAL FACETS
        pCtx.save()
        // Rear face (p0, p1, p2) & Underside base face (p1, p2, p3) drawn behind internal rainbow
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

        // Internal rainbow dispersion fanning through the interior of the glass tetrahedron
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
          0.85,
          16,
          false,
        )

        // Internal rainbow bevel glints along rear & base tetrahedron edges
        pCtx.save()
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

        // Front two smoked-glass triangular facets + sharp central crystal ridge (p0 -> p3)
        pCtx.save()
        // Front-Left Entry Facet (p0, p1, p3)
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

        // Front-Right Exit Facet (p0, p3, p2)
        pCtx.fillStyle = 'rgba(220, 238, 255, 0.046)'
        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.36)'
        pCtx.beginPath()
        pCtx.moveTo(p0.x, p0.y)
        pCtx.lineTo(p3.x, p3.y)
        pCtx.lineTo(p2.x, p2.y)
        pCtx.closePath()
        pCtx.fill()
        pCtx.stroke()

        // Crisp specular highlight along the front apex-to-base ridge (p0 -> p3)
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
        drawRainbowFan(
          pCtx,
          exitPt.x,
          exitPt.y,
          mainAngle,
          mainSpread,
          diag * 0.88,
          2.8,
          0.96,
          36,
          false,
        )

        // Subtle optical pinpoints at entry & exit facets
        pCtx.save()
        pCtx.globalCompositeOperation = 'lighter'
        ;[entryPt, exitPt].forEach((pt, idx) => {
          const r = idx === 1 ? 14 : 9
          const g = pCtx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r)
          g.addColorStop(0, 'rgba(255, 255, 255, 0.85)')
          g.addColorStop(
            0.4,
            idx === 1 ? 'rgba(255, 220, 160, 0.28)' : 'rgba(200, 230, 255, 0.24)',
          )
          g.addColorStop(1, 'rgba(0, 0, 0, 0)')
          pCtx.fillStyle = g
          pCtx.beginPath()
          pCtx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
          pCtx.fill()
        })

        // 6. Microscopic dust specks illuminated strictly within the light paths
        for (const m of motes) {
          m.x = (m.x + m.vx + 1) % 1
          m.y = (m.y + m.vy + 1) % 1
          const mx = m.x * w
          const my = m.y * h

          let alpha = 0
          let rgb = '255,255,255'

          if (mx > exitPt.x) {
            const ang = Math.atan2(my - exitPt.y, mx - exitPt.x)
            const half = mainSpread * 0.56
            if (Math.abs(ang - mainAngle) < half) {
              const u = (ang - (mainAngle - half)) / (half * 2)
              const [cr, cg, cb] = spectralRGB(u)
              rgb = `${cr},${cg},${cb}`
              alpha = 0.62
            } else if (Math.abs(ang - reflAngleUp) < reflSpreadUp * 0.6) {
              const u = 1 - (ang - (reflAngleUp - reflSpreadUp * 0.6)) / (reflSpreadUp * 1.2)
              const [cr, cg, cb] = spectralRGB(u)
              rgb = `${cr},${cg},${cb}`
              alpha = 0.35 * reflStrength
            }
          } else {
            const beamY = beamStartY + (entryPt.y - beamStartY) * (mx / entryPt.x)
            if (Math.abs(my - beamY) < 10) {
              alpha = 0.55
            }
          }

          if (alpha > 0.01) {
            const tw = 0.5 + 0.5 * Math.sin(t * 0.0025 + m.tw)
            pCtx.fillStyle = `rgba(${rgb}, ${(alpha * tw).toFixed(3)})`
            pCtx.beginPath()
            pCtx.arc(mx, my, m.r, 0, Math.PI * 2)
            pCtx.fill()
          }
        }
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
      id="refraction"
      onMouseMove={handlePointerMove}
      onTouchMove={handlePointerMove}
      className="relative min-h-svh w-full flex flex-col justify-end p-6 md:p-11 overflow-hidden bg-[#020204]"
    >
      {/* Full-Bleed Optical Prism & Light-Bias Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-0 cursor-crosshair"
      />

      {/* Restrained Bottom Editorial & Wavelength Legend (pinkfloyd.com typography system) */}
      <div className="relative z-20 flex flex-wrap items-end justify-between gap-8 pt-64 pointer-events-none">
        {/* Bottom-Left Positioning Copy */}
        <div className="max-w-lg space-y-3">
          <p className="font-pf-label text-[12px] uppercase text-white/40">
            {PORTFOLIO_DATA.hero.prompt}
          </p>
          <h1 className="font-pf-main font-normal text-3xl sm:text-5xl uppercase leading-[1.08] text-white/95">
            {PORTFOLIO_DATA.hero.headlineTop}
            <br />
            <span className="text-white/70">{PORTFOLIO_DATA.hero.headlineItalic}</span>
          </h1>
          <p className="font-pf-main text-[13.5px] sm:text-[14.5px] text-white/50 leading-[1.4] max-w-md">
            {PORTFOLIO_DATA.hero.bio}
          </p>

          <div className="pt-2.5 flex items-center gap-6 pointer-events-auto font-pf-label text-[12px] uppercase">
            <a
              href="#works"
              className="text-white/90 hover:text-white transition-colors flex items-center gap-2"
            >
              <span>EXPLORE WORKS</span>
              <span className="text-white/50">↓</span>
            </a>
            <a
              href={PORTFOLIO_DATA.socials.github}
              target="_blank"
              rel="noreferrer"
              className="text-white/50 hover:text-white/95 transition-colors"
            >
              @{PORTFOLIO_DATA.handle} →
            </a>
          </div>
        </div>

        {/* Bottom-Right Subtle Refracted Wavelength Index */}
        <div className="obsidian-panel rounded-xl px-4 py-3.5 pointer-events-auto w-full sm:w-auto min-w-[265px] space-y-2">
          <div className="flex items-center justify-between gap-4 pb-1.5 border-b border-white/[0.06]">
            <span className="font-pf-label text-[11px] text-white/40 uppercase">
              REFRACTED SPECTRUM
            </span>
            <span className="font-pf-label text-[11px] text-white/30 uppercase">
              {activeDiscipline ? activeDiscipline.nm : '410–680NM'}
            </span>
          </div>

          <ul className="space-y-1.5">
            {PORTFOLIO_DATA.wavelengths.map((w) => {
              const isHovered = activeDiscipline?.nm === w.nm
              return (
                <li
                  key={w.nm}
                  onMouseEnter={() => {
                    setActiveDiscipline(w)
                    targetBiasRef.current = w.biasPreset
                  }}
                  onMouseLeave={() => setActiveDiscipline(null)}
                  className="flex items-center justify-between gap-6 cursor-pointer group py-0.5"
                >
                  <span className="flex items-center gap-2 font-pf-label text-[11px] uppercase text-white/45 group-hover:text-white/90 transition-colors">
                    <span
                      className="w-1.5 h-1.5 rounded-full transition-transform duration-200 group-hover:scale-125"
                      style={{
                        backgroundColor: w.color,
                        boxShadow: isHovered ? `0 0 8px ${w.color}` : 'none',
                      }}
                    />
                    {w.nm}
                  </span>
                  <span className="font-pf-main font-medium text-[12.5px] uppercase text-white/65 group-hover:text-white transition-colors text-right">
                    {w.domain}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
