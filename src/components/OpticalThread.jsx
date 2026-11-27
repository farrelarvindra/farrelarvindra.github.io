import { useEffect, useRef } from 'react'
import { setupHiDPICanvas } from '../utils/optics'

const FILAMENTS = [
  { nm: '680nm', rgb: '255, 32, 68', side: -1.5, phase: 0.0 },
  { nm: '580nm', rgb: '255, 208, 12', side: -0.5, phase: 1.6 },
  { nm: '490nm', rgb: '0, 210, 255', side: 0.5, phase: 3.1 },
  { nm: '410nm', rgb: '146, 52, 255', side: 1.5, phase: 4.7 },
]

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

export default function OpticalThread({ lockedWavelength = null, biasAngle = 28 }) {
  const canvasRef = useRef(null)
  const lockedRef = useRef(lockedWavelength)
  const biasRef = useRef(biasAngle)

  useEffect(() => {
    lockedRef.current = lockedWavelength
  }, [lockedWavelength])

  useEffect(() => {
    biasRef.current = biasAngle
  }, [biasAngle])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let sizeState = setupHiDPICanvas(canvas)
    let smoothScroll = window.scrollY
    let prevSmoothScroll = window.scrollY
    let smoothVelocity = 0
    let rafId = 0

    // Cache document-space section anchors so we never thrash layout per frame
    const anchors = {
      refractionBottom: 900,
      breatheCenterY: 1400,
      breatheRadius: 190,
      worksTop: 1900,
      canvasBottom: 3600,
      signalTop: 3800,
      signalConvergeY: 4100,
    }

    const measureAnchors = () => {
      const scrollY = window.scrollY
      const rEl = document.getElementById('refraction')
      const bEl = document.getElementById('breathe')
      const wEl = document.getElementById('works')
      const cEl = document.getElementById('canvas')
      const sEl = document.getElementById('signal')

      if (rEl) {
        const r = rEl.getBoundingClientRect()
        anchors.refractionBottom = r.top + scrollY + r.height * 0.84
      }
      if (bEl) {
        const r = bEl.getBoundingClientRect()
        anchors.breatheCenterY = r.top + scrollY + r.height * 0.445
        anchors.breatheRadius = r.height * 0.235
      }
      if (wEl) {
        const r = wEl.getBoundingClientRect()
        anchors.worksTop = r.top + scrollY
      }
      if (cEl) {
        const r = cEl.getBoundingClientRect()
        anchors.canvasBottom = r.top + scrollY + r.height * 0.92
      }
      if (sEl) {
        const r = sEl.getBoundingClientRect()
        anchors.signalTop = r.top + scrollY
        anchors.signalConvergeY = r.top + scrollY + 210
      }
    }

    const onResize = () => {
      sizeState = setupHiDPICanvas(canvas)
      measureAnchors()
    }

    const ro = new ResizeObserver(measureAnchors)
    ro.observe(document.documentElement)
    window.addEventListener('resize', onResize, { passive: true })
    measureAnchors()

    const render = (ts) => {
      if (!sizeState) sizeState = setupHiDPICanvas(canvas)
      if (sizeState) {
        const { w, h, ctx } = sizeState
        const targetScroll = window.scrollY
        smoothScroll += (targetScroll - smoothScroll) * 0.18
        const rawVel = smoothScroll - prevSmoothScroll
        prevSmoothScroll = smoothScroll
        smoothVelocity += (rawVel - smoothVelocity) * 0.16

        // Drive global scroll-velocity RGB chromatic aberration CSS custom properties
        const chromaPx = Math.max(-2.6, Math.min(2.6, smoothVelocity * 0.065))
        const absChroma = Math.abs(chromaPx)
        document.documentElement.style.setProperty(
          '--scroll-chroma',
          absChroma > 0.04 ? `${chromaPx.toFixed(2)}px` : '0px',
        )
        document.documentElement.style.setProperty(
          '--scroll-chroma-y',
          absChroma > 0.04 ? `${(chromaPx * 0.42).toFixed(2)}px` : '0px',
        )

        ctx.clearRect(0, 0, w, h)

        const time = ts * 0.001
        const lockedNm = lockedRef.current?.nm || null
        const biasShift = (biasRef.current / 100) * 18
        const velBoost = Math.min(1, Math.abs(smoothVelocity) / 28)

        // Spine X shifts gracefully from center (Refraction & Eclipse) to an asymmetric left rail
        // across Works & Taste (so text and Nakamura portraits stay unobstructed), then back to center for Finale
        const railX = w >= 1024 ? Math.max(36, w * 0.048) : w * 0.5
        const steps = 68
        const stepY = h / (steps - 1)

        ctx.save()
        ctx.globalCompositeOperation = 'lighter'

        for (let fIdx = 0; fIdx < FILAMENTS.length; fIdx++) {
          const fil = FILAMENTS[fIdx]
          const isLockedMatch = lockedNm === fil.nm
          const isDimmedByLock = lockedNm !== null && !isLockedMatch

          const baseAlpha = isLockedMatch
            ? 0.52 + velBoost * 0.25
            : isDimmedByLock
              ? 0.09
              : 0.24 + velBoost * 0.18

          ctx.beginPath()
          let started = false

          for (let s = 0; s < steps; s++) {
            const sy = s * stepY
            const docY = smoothScroll + sy

            // Only emerge below Act I's prism and fade cleanly above Act IV's lunar surface
            if (docY < anchors.refractionBottom - 90 || docY > anchors.signalConvergeY + 90) {
              continue
            }

            // 1. Horizontal spine interpolation across chapters
            const toSideRail = smoothstep(
              anchors.worksTop - 220,
              anchors.worksTop + 140,
              docY,
            )
            const backToCenter = smoothstep(
              anchors.canvasBottom - 120,
              anchors.signalTop + 140,
              docY,
            )
            const sideWeight = toSideRail * (1 - backToCenter)
            let x = w * 0.5 + (railX - w * 0.5) * sideWeight

            // 2. Filament spread + harmonic wave
            const convergeStart = smoothstep(
              anchors.refractionBottom - 70,
              anchors.refractionBottom + 160,
              docY,
            )
            const convergeEnd =
              1 -
              smoothstep(
                anchors.signalConvergeY - 170,
                anchors.signalConvergeY + 30,
                docY,
              )
            const spreadEnv = convergeStart * convergeEnd

            const wave =
              Math.sin(docY * 0.0055 - time * 1.35 + fil.phase) *
              (4.5 + velBoost * 5.5) *
              spreadEnv
            const spreadOffset = fil.side * (6.5 + sideWeight * 3.0) * spreadEnv

            // 3. Gravitational lensing around the Solar Eclipse Moon in InterludeBreathe
            const dyEclipse = docY - anchors.breatheCenterY
            const rLens = anchors.breatheRadius
            let eclipseBend = 0
            if (Math.abs(dyEclipse) < rLens * 2.1) {
              const gauss = Math.exp(-Math.pow(dyEclipse / (rLens * 0.82), 2))
              const sideDir = fil.side < 0 ? -1 : 1
              const subLane = (Math.abs(fil.side) - 0.5) * 9
              eclipseBend = sideDir * (rLens * 1.08 + subLane) * gauss
            }

            x += spreadOffset + wave + eclipseBend + biasShift * (1 - toSideRail) * 0.35

            if (!started) {
              ctx.moveTo(x, sy)
              started = true
            } else {
              ctx.lineTo(x, sy)
            }
          }

          if (started) {
            // Vertical fade mask at birth (below Prism) and convergence (above Eclipse lyric)
            const topVis = smoothstep(
              anchors.refractionBottom - 90,
              anchors.refractionBottom + 80,
              smoothScroll + h * 0.5,
            )
            const grad = ctx.createLinearGradient(0, 0, 0, h)
            const startA =
              smoothScroll < anchors.refractionBottom
                ? 0
                : baseAlpha * 0.55
            const midA = baseAlpha * (0.65 + 0.35 * topVis)
            const endA =
              smoothScroll + h > anchors.signalConvergeY
                ? 0
                : baseAlpha * 0.65

            grad.addColorStop(0, `rgba(${fil.rgb}, ${startA.toFixed(3)})`)
            grad.addColorStop(0.25, `rgba(${fil.rgb}, ${midA.toFixed(3)})`)
            grad.addColorStop(0.78, `rgba(${fil.rgb}, ${midA.toFixed(3)})`)
            grad.addColorStop(1, `rgba(${fil.rgb}, ${endA.toFixed(3)})`)

            ctx.strokeStyle = grad
            ctx.lineWidth = isLockedMatch ? 1.85 : 1.05
            ctx.stroke()

            // Soft outer optical bloom for locked wavelength or fast scroll
            if (isLockedMatch || velBoost > 0.25) {
              ctx.strokeStyle = `rgba(${fil.rgb}, ${(baseAlpha * 0.28).toFixed(3)})`
              ctx.lineWidth = isLockedMatch ? 5.5 : 3.4
              ctx.stroke()
            }
          }
        }

        // Pinpoint convergence star at Act IV Signal lyric when visible onscreen
        const convergeScreenY = anchors.signalConvergeY - smoothScroll
        if (convergeScreenY > -30 && convergeScreenY < h + 30) {
          const cx = w * 0.5
          const pulse = 0.78 + 0.22 * Math.sin(time * 2.4)
          const g = ctx.createRadialGradient(
            cx,
            convergeScreenY,
            0,
            cx,
            convergeScreenY,
            22,
          )
          g.addColorStop(0, `rgba(255, 248, 225, ${(0.82 * pulse).toFixed(3)})`)
          g.addColorStop(0.35, `rgba(255, 208, 90, ${(0.24 * pulse).toFixed(3)})`)
          g.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(cx, convergeScreenY, 22, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      document.documentElement.style.setProperty('--scroll-chroma', '0px')
      document.documentElement.style.setProperty('--scroll-chroma-y', '0px')
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full z-[5] pointer-events-none"
    />
  )
}
