import { useEffect, useRef, useState } from 'react'

const CHAPTER_META = {
  refraction: { tag: 'PRISM', accent: '#ffd00c' },
  breathe: { tag: 'ORBIT', accent: '#ff8a2b' },
  works: { tag: 'BENCH', accent: '#00d2ff' },
  canvas: { tag: 'LOUPE', accent: '#ff2044' },
  signal: { tag: 'ASTRA', accent: '#e2e8f0' },
}

export default function OpticalCursor({ biasAngle = 28, lockedWavelength = null }) {
  const [enabled, setEnabled] = useState(false)
  const [chapter, setChapter] = useState('refraction')
  const [hoveredLabel, setHoveredLabel] = useState('')
  const [isInteractive, setIsInteractive] = useState(false)
  const [isPressed, setIsPressed] = useState(false)

  const dotRef = useRef(null)
  const ringRef = useRef(null)
  const labelRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)')
    const syncMedia = () => setEnabled(mq.matches)
    syncMedia()
    mq.addEventListener('change', syncMedia)
    return () => mq.removeEventListener('change', syncMedia)
  }, [])

  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove('has-optical-cursor')
      return undefined
    }

    document.documentElement.classList.add('has-optical-cursor')

    const pos = {
      tx: window.innerWidth * 0.5,
      ty: window.innerHeight * 0.5,
      rx: window.innerWidth * 0.5,
      ry: window.innerHeight * 0.5,
      visible: false,
    }

    let rafId = 0
    let lastChapter = ''

    const onMove = (e) => {
      pos.tx = e.clientX
      pos.ty = e.clientY
      if (!pos.visible) {
        pos.rx = e.clientX
        pos.ry = e.clientY
        pos.visible = true
      }

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`
        dotRef.current.style.opacity = '1'
      }
    }

    const onOver = (e) => {
      const target = e.target?.closest?.(
        'a, button, [role="button"], input, [data-cursor], [tabindex="0"]',
      )
      const customHint = e.target?.closest?.('[data-cursor-label]')?.getAttribute('data-cursor-label') || ''
      const isTextInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')

      if (isTextInput) {
        setIsInteractive(false)
        setHoveredLabel('')
        return
      }

      setIsInteractive(Boolean(target))
      setHoveredLabel(customHint)
    }

    const onDown = () => setIsPressed(true)
    const onUp = () => setIsPressed(false)
    const onLeaveWindow = () => {
      pos.visible = false
      if (dotRef.current) dotRef.current.style.opacity = '0'
      if (ringRef.current) ringRef.current.style.opacity = '0'
      if (labelRef.current) labelRef.current.style.opacity = '0'
    }

    const tick = () => {
      pos.rx += (pos.tx - pos.rx) * 0.22
      pos.ry += (pos.ty - pos.ry) * 0.22

      if (ringRef.current && pos.visible) {
        ringRef.current.style.transform = `translate3d(${pos.rx.toFixed(1)}px, ${pos.ry.toFixed(1)}px, 0) translate(-50%, -50%)`
        ringRef.current.style.opacity = '1'
      }

      if (labelRef.current && pos.visible) {
        labelRef.current.style.transform = `translate3d(${(pos.rx + 18).toFixed(1)}px, ${(pos.ry + 14).toFixed(1)}px, 0)`
        labelRef.current.style.opacity = '1'
      }

      const domChapter = document.documentElement.dataset.chapter || 'refraction'
      if (domChapter !== lastChapter) {
        lastChapter = domChapter
        setChapter(domChapter)
      }

      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('mouseover', onOver, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('mouseleave', onLeaveWindow)
    rafId = requestAnimationFrame(tick)

    return () => {
      document.documentElement.classList.remove('has-optical-cursor')
      cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('mouseover', onOver)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('mouseleave', onLeaveWindow)
    }
  }, [enabled])

  if (!enabled) return null

  const meta = CHAPTER_META[chapter] || CHAPTER_META.refraction
  const accentColor = lockedWavelength?.color || meta.accent
  const ringSize = isPressed ? 20 : isInteractive ? 38 : chapter === 'canvas' ? 32 : 26

  let readout = ''
  if (hoveredLabel) {
    readout = hoveredLabel
  } else if (chapter === 'refraction') {
    readout = lockedWavelength
      ? `${lockedWavelength.nm} LOCKED`
      : `${biasAngle >= 0 ? `+${biasAngle}°` : `${biasAngle}°`}`
  } else if (chapter === 'canvas') {
    readout = 'f/1.4'
  } else if (chapter === 'signal') {
    readout = '✦'
  }

  return (
    <div aria-hidden="true" className="fixed inset-0 z-[90] pointer-events-none overflow-hidden">
      {/* Zero-latency optical pinpoint */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 w-1.5 h-1.5 rounded-full will-change-transform"
        style={{
          opacity: 0,
          backgroundColor: '#ffffff',
          boxShadow: `0 0 10px 1px ${accentColor}`,
        }}
      />

      {/* Spring-damped chapter-morphing optical reticle */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 flex items-center justify-center will-change-transform transition-[width,height,border-radius,border-color] duration-200"
        style={{
          opacity: 0,
          width: `${ringSize}px`,
          height: `${ringSize}px`,
          borderRadius: chapter === 'works' && !isInteractive ? '2px' : '9999px',
          border: `1px solid ${isInteractive ? accentColor : 'rgba(255, 255, 255, 0.34)'}`,
          boxShadow: isInteractive ? `0 0 16px -4px ${accentColor}` : 'none',
          backgroundColor: isInteractive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        }}
      >
        {/* Subtle crosshair ticks inside reticle for Prism & Astra modes */}
        {(chapter === 'refraction' || chapter === 'signal') && !isInteractive && (
          <>
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-px h-1.5 bg-white/45" />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-px h-1.5 bg-white/45" />
            <span className="absolute top-1/2 -left-1 -translate-y-1/2 h-px w-1.5 bg-white/45" />
            <span className="absolute top-1/2 -right-1 -translate-y-1/2 h-px w-1.5 bg-white/45" />
          </>
        )}
      </div>

      {/* Micro optical telemetry tag */}
      <div
        ref={labelRef}
        className="fixed top-0 left-0 font-pf-label text-[9px] uppercase tracking-[0.14em] whitespace-nowrap will-change-transform transition-colors duration-200"
        style={{
          opacity: 0,
          color: isInteractive ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
        }}
      >
        {readout}
      </div>
    </div>
  )
}
