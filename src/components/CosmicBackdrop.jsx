import { useEffect, useRef } from 'react'
import { setupHiDPICanvas } from '../utils/optics'

// Deterministic quiet-but-crisp deep-space starfield shared continuously behind every Act
const STARS = Array.from({ length: 440 }, (_, i) => {
  const warmRoll = (i * 19.37) % 1
  const tint =
    warmRoll > 0.78
      ? '255, 228, 184' // warm solar ivory-gold
      : warmRoll > 0.42
        ? '226, 238, 255' // crisp starlight cool white
        : '250, 250, 255' // pure pinpoint white

  const isAnchor = i % 19 === 0
  const isMedium = i % 5 === 0
  return {
    x: ((i * 67.31 + (i % 7) * 3.11) % 100) / 100,
    y: ((i * 43.17 + (i % 11) * 2.37) % 100) / 100,
    r: isAnchor ? 1.35 : isMedium ? 0.95 : 0.62,
    baseAlpha: isAnchor
      ? 0.68 + ((i * 17) % 24) * 0.01
      : isMedium
        ? 0.36 + ((i * 23) % 30) * 0.01
        : 0.18 + ((i * 31) % 28) * 0.01,
    isAnchor,
    depth: 0.1 + (i % 5) * 0.085,
    twSpeed: 0.0007 + (i % 5) * 0.00038,
    twPhase: i * 1.73,
    tint,
  }
})

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)))
  return t * t * (3 - 2 * t)
}

export default function CosmicBackdrop() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let sizeState = setupHiDPICanvas(canvas)
    let smoothScroll = window.scrollY
    let refractionBottom = window.innerHeight || 900
    let rafId = 0

    const measureTopPage = () => {
      const topSection = document.getElementById('refraction')
      if (topSection) {
        const rect = topSection.getBoundingClientRect()
        refractionBottom = Math.max(1, rect.top + window.scrollY + rect.height)
      } else {
        refractionBottom = window.innerHeight || 900
      }
    }

    const onResize = () => {
      sizeState = setupHiDPICanvas(canvas)
      measureTopPage()
    }
    window.addEventListener('resize', onResize)
    measureTopPage()

    let ro = null
    const topEl = document.getElementById('refraction')
    if (topEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measureTopPage)
      ro.observe(topEl)
    }

    const render = (t) => {
      if (!sizeState) sizeState = setupHiDPICanvas(canvas)
      if (sizeState) {
        const { w, h, ctx } = sizeState
        const scrollY = window.scrollY
        smoothScroll += (scrollY - smoothScroll) * 0.24

        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = '#020204'
        ctx.fillRect(0, 0, w, h)

        // Keep the entire top page (#refraction) a pure starless #020204 abyss;
        // stars emerge smoothly only as the user descends below Act I into the Eclipse & Moon.
        const scrollGate = smoothstep(h * 0.22, h * 0.78, scrollY)
        if (scrollGate > 0.002) {
          const topBoundary = Math.max(h, refractionBottom)

          for (const s of STARS) {
            const sx = s.x * w
            const rawY = (s.y * h - smoothScroll * s.depth) % h
            const sy = rawY < 0 ? rawY + h : rawY

            const docY = scrollY + sy
            const spatialGate = smoothstep(topBoundary * 0.98, topBoundary * 1.44, docY)
            const visibility = scrollGate * spatialGate
            if (visibility < 0.004) continue

            const twinkle = 0.72 + 0.28 * Math.sin(t * s.twSpeed + s.twPhase)
            const alpha = Math.min(0.95, s.baseAlpha * twinkle) * visibility

            // Whisper-subtle optical bloom only on the sparse brighter anchor stars
            if (s.isAnchor) {
              ctx.fillStyle = `rgba(${s.tint}, ${(alpha * 0.22).toFixed(3)})`
              ctx.beginPath()
              ctx.arc(sx, sy, s.r * 2.5, 0, Math.PI * 2)
              ctx.fill()
            }

            ctx.fillStyle = `rgba(${s.tint}, ${alpha.toFixed(3)})`
            ctx.beginPath()
            ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      if (ro) ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full z-0 pointer-events-none"
    />
  )
}
