import { useEffect, useRef } from 'react'
import { setupHiDPICanvas } from '../utils/optics'

// Deterministic deep-space starfield shared continuously behind every Act
const STARS = Array.from({ length: 185 }, (_, i) => {
  const warmRoll = (i * 19.37) % 1
  const tint =
    warmRoll > 0.78
      ? '255, 224, 178' // faint solar ivory-gold
      : warmRoll > 0.45
        ? '226, 236, 255' // crisp starlight cool white
        : '245, 245, 250' // pure pinpoint white
  return {
    x: ((i * 67.31) % 100) / 100,
    y: ((i * 43.17) % 100) / 100,
    r: i % 9 === 0 ? 1.15 : i % 3 === 0 ? 0.8 : 0.55,
    baseAlpha: 0.1 + ((i * 31.7) % 100) * 0.0042,
    depth: 0.12 + (i % 5) * 0.09, // subtle scroll parallax layer
    twSpeed: 0.0008 + (i % 4) * 0.00045,
    twPhase: i * 1.73,
    tint,
  }
})

export default function CosmicBackdrop() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let sizeState = setupHiDPICanvas(canvas)
    let smoothScroll = window.scrollY
    let rafId = 0

    const onResize = () => {
      sizeState = setupHiDPICanvas(canvas)
    }
    window.addEventListener('resize', onResize)

    const render = (t) => {
      if (!sizeState) sizeState = setupHiDPICanvas(canvas)
      if (sizeState) {
        const { w, h, ctx } = sizeState
        smoothScroll += (window.scrollY - smoothScroll) * 0.08

        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = '#020204'
        ctx.fillRect(0, 0, w, h)

        for (const s of STARS) {
          const sx = s.x * w
          // Wrap vertically with gentle parallax so stars drift smoothly across Act boundaries
          const rawY = (s.y * h - smoothScroll * s.depth) % h
          const sy = rawY < 0 ? rawY + h : rawY
          const twinkle = 0.68 + 0.32 * Math.sin(t * s.twSpeed + s.twPhase)
          const alpha = s.baseAlpha * twinkle

          ctx.fillStyle = `rgba(${s.tint}, ${alpha.toFixed(3)})`
          ctx.beginPath()
          ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
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
