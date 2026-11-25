import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'

const VERT_SRC = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Interactive Photorealistic Eclipse Shader:
// Moving the Moon in any 2D direction (uMoonOffset) physically shifts the exposed solar limb,
// diamond-ring flare, asymmetric coronal intensity, inner-moon copper lens bleed, and star occultation.
const FRAG_SRC = `
  precision highp float;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uMoonOffset;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.52;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.05 + vec3(11.3, 23.7, 5.9);
      a *= 0.5;
    }
    return v;
  }

  vec3 solarRamp(float h) {
    float x = clamp(h, 0.0, 1.65);
    vec3 col = mix(vec3(0.0), vec3(0.48, 0.05, 0.005), smoothstep(0.0, 0.10, x));
    col = mix(col, vec3(0.96, 0.24, 0.01), smoothstep(0.10, 0.30, x));
    col = mix(col, vec3(1.00, 0.58, 0.03), smoothstep(0.30, 0.58, x));
    col = mix(col, vec3(1.00, 0.90, 0.24), smoothstep(0.58, 0.92, x));
    col = mix(col, vec3(1.00, 0.99, 0.86), smoothstep(0.92, 1.42, x));
    return col;
  }

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec2 sunCenter = vec2(0.0, 0.055);
    vec2 p = uv - sunCenter;

    float sunR = 0.205;
    float moonR = 0.204;

    float rSun = length(p);
    vec2 dir = p / max(rSun, 1e-4);
    float dSunRim = rSun - sunR;

    // Movable Moon position in all 2D directions relative to the Sun
    vec2 pMoon = p - uMoonOffset;
    float rMoon = length(pMoon);
    float dMoonRim = rMoon - moonR;

    float offLen = length(uMoonOffset);
    // Direction where the Sun is most exposed (opposite to where the Moon shifted)
    vec2 burstDir = (offLen > 0.0005) ? normalize(-uMoonOffset) : vec2(0.965, -0.26);
    float offsetFactor = smoothstep(0.001, 0.022, offLen);

    // 1. DYNAMIC CORONAL RING AROUND THE SUN (adapts organically from pure 360° totality to asymmetric crescent)
    float totalityArc = 0.42 + 0.58 * pow(abs(dir.x), 1.25);
    float exposedSide = 0.5 + 0.5 * dot(dir, burstDir);
    float asymArc = 0.12 + 0.88 * pow(exposedSide, 1.45);
    float arcWeight = mix(totalityArc, asymArc, offsetFactor);

    float gran = 0.84 + 0.32 * fbm(vec3(dir * 16.0, uTime * 0.2));
    float pips = pow(fbm(vec3(dir * 34.0, rSun * 24.0 - uTime * 0.32)), 3.4);
    float pipExtend = pips * 0.009 * (0.4 + 0.6 * arcWeight);

    // Opaque Moon mask: 0 inside Moon, 1 outside Moon
    float moonOutside = smoothstep(-0.0022, 0.0012, dMoonRim);
    float insideMoon = 1.0 - moonOutside;

    // True geometric solar photosphere exposed when Moon shifts off-center
    float sunInside = smoothstep(sunR + 0.0028, sunR - 0.0022, rSun);
    float exposedCrescent = sunInside * moonOutside;

    // Tight fiery solar corona hugging the Sun's limb outside the Moon
    float dOuter = max(dSunRim - pipExtend, 0.0);
    float ringCore = exp(-dOuter * 168.0) * 1.32 * arcWeight * gran;
    float ringFire = exp(-dOuter * 46.0) * 0.54 * (0.28 + 0.72 * arcWeight) * (0.8 + 0.4 * pips);
    float ringAmbient = exp(-abs(dSunRim) * 13.5) * 0.09 * (0.35 + 0.65 * arcWeight);

    // Tiny localized chromosphere prominence tuft on the limb
    float topPipMask = pow(max(0.0, dot(dir, normalize(vec2(0.28, 0.96)))), 48.0);
    float topPip = exp(-max(dSunRim, 0.0) * 55.0) * topPipMask * (0.45 + 0.55 * pips) * 0.62;

    float rimHeat = (ringCore + ringFire + topPip + exposedCrescent * 2.4) * moonOutside
                  + ringAmbient * smoothstep(-0.025, 0.005, dMoonRim);

    // 2. DYNAMIC DIAMOND-RING SOLAR BURST TRACKING THE EXPOSED LIMB IN ALL 360°
    vec2 burstPos = burstDir * sunR;
    vec2 dp = p - burstPos;
    float dBurst = length(dp);

    // Slightly elongated plasma contour tangent to the solar limb
    vec2 tang = vec2(-burstDir.y, burstDir.x);
    vec2 burstLocal = vec2(dot(dp, burstDir) * 1.16, dot(dp, tang) * 0.82);
    float flameWarp = (fbm(vec3(dp * 28.0, uTime * 0.38)) - 0.48) * 0.016;
    float dWarped = max(0.0, length(burstLocal) + flameWarp * smoothstep(0.004, 0.06, dBurst));

    // Scales smoothly from quiet totality (offLen ~ 0) up to blazing diamond-ring & crescent glare
    float burstIntensity = smoothstep(0.0008, 0.011, offLen) * (0.85 + 0.65 * smoothstep(0.011, 0.045, offLen));

    float flareCore = exp(-dWarped * 44.0) * 2.45 * burstIntensity;
    float flareOrange = exp(-dWarped * 16.5) * 0.92 * burstIntensity;
    float flareHaze = exp(-dBurst * 6.4) * 0.25 * burstIntensity;

    // Subtle fiery flame tongues licking outward from the exposed side
    float burstCone = pow(max(0.0, dot(dir, burstDir)), 10.0);
    float burstTongues = exp(-max(dSunRim, 0.0) * 20.0) * moonOutside * burstCone
                       * pow(fbm(vec3(dir * 22.0, rSun * 14.0 - uTime * 0.42)), 1.6) * 1.15 * burstIntensity;

    // Let peak diamond-ring optical bloom spill slightly in front of the lunar edge for photographic realism
    float flareBleedMask = 0.32 + 0.68 * moonOutside;
    float totalHeat = rimHeat + (flareCore + flareOrange) * flareBleedMask + burstTongues;

    vec3 fireLinear = solarRamp(totalHeat) * totalHeat * 1.25
                    + vec3(0.75, 0.14, 0.015) * flareHaze;

    // Whisper-subtle chromatic lens fringe echoing Act I's optics
    float fringe = exp(-abs(dBurst - 0.095) * 32.0) * 0.065 * burstIntensity;
    fireLinear += vec3(0.05, 0.42, 0.85) * fringe;

    // 3. DYNAMIC INNER-MOON WARM COPPER LENS BLEED (shifts with Moon direction!)
    if (rMoon < moonR) {
      float innerScatter = exp(-dBurst * 6.2) * smoothstep(moonR * 0.12, moonR, rMoon);
      fireLinear += vec3(0.62, 0.14, 0.012) * innerScatter * 0.38 * (0.25 + 0.75 * burstIntensity);
    }

    vec3 mappedFire = pow(aces(fireLinear), vec3(1.0 / 2.2));
    vec3 moonVoid = vec3(0.00784, 0.00784, 0.01569); // #020204

    // Opaque Moon occults CosmicBackdrop stars cleanly as it moves; tight alpha outside preserves stars
    float glowLum = max(mappedFire.r, max(mappedFire.g, mappedFire.b));
    float outAlpha = smoothstep(0.035, 0.62, glowLum);
    float alpha = max(insideMoon, outAlpha);

    vec3 finalRgb = mix(mappedFire, max(moonVoid, mappedFire), insideMoon);
    gl_FragColor = vec4(clamp(finalRgb, 0.0, 1.0), alpha);
  }
`

function initEclipseGL(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  })
  if (!gl) return null

  const compile = (type, src) => {
    const sh = gl.createShader(type)
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh)
      return null
    }
    return sh
  }

  const vs = compile(gl.VERTEX_SHADER, VERT_SRC)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC)
  if (!vs || !fs) return null

  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  return {
    gl,
    prog,
    vs,
    fs,
    buf,
    uRes: gl.getUniformLocation(prog, 'uRes'),
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uMoonOffset: gl.getUniformLocation(prog, 'uMoonOffset'),
  }
}

// Resting state: Moon centered cleanly over the Sun (totality); moves only when pointer is around the Moon
const CENTER_MOON_OFFSET = { x: 0, y: 0 }
const MAX_HOVER_OFFSET = 0.036
const MAX_DRAG_OFFSET = 0.056
// Proximity zone around the Moon (~1.5x the 0.205 visual radius)
const MOON_ZONE_RADIUS_FACTOR = 0.31

export default function InterludeBreathe() {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const quoteRef = useRef(null)
  const visibleRef = useRef(true)

  const targetOffsetRef = useRef({ ...CENTER_MOON_OFFSET })
  const smoothOffsetRef = useRef({ ...CENTER_MOON_OFFSET })
  const draggingRef = useRef(false)
  const [nearMoon, setNearMoon] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Real-time 0-lag scroll choreography via direct DOM ref
  useEffect(() => {
    const updateScrollChoreography = () => {
      const el = sectionRef.current
      const qEl = quoteRef.current
      if (!el || !qEl) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      const progress = (vh * 0.5 - (rect.top + rect.height * 0.5)) / vh
      const reveal = Math.max(0, 1 - Math.min(1, Math.abs(progress) * 1.35))
      qEl.style.opacity = (0.18 + reveal * 0.82).toFixed(3)
      qEl.style.transform = `translate3d(0, ${((1 - reveal) * 18).toFixed(1)}px, 0)`
    }

    window.addEventListener('scroll', updateScrollChoreography, { passive: true })
    window.addEventListener('resize', updateScrollChoreography, { passive: true })
    updateScrollChoreography()

    return () => {
      window.removeEventListener('scroll', updateScrollChoreography)
      window.removeEventListener('resize', updateScrollChoreography)
    }
  }, [])

  // Pause WebGL solar eclipse shader when scrolled offscreen for butter-smooth performance
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { rootMargin: '260px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const state = initEclipseGL(canvas)
    if (!state) return undefined

    const { gl, prog, vs, fs, buf, uRes, uTime, uMoonOffset } = state
    let rafId = 0

    const render = (ts) => {
      if (!visibleRef.current) {
        rafId = requestAnimationFrame(render)
        return
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // Smooth orbital ease toward target 2D moon offset + subtle living breath
      smoothOffsetRef.current.x += (targetOffsetRef.current.x - smoothOffsetRef.current.x) * 0.075
      smoothOffsetRef.current.y += (targetOffsetRef.current.y - smoothOffsetRef.current.y) * 0.075

      const driftX = Math.sin(ts * 0.00055) * 0.0012
      const driftY = Math.cos(ts * 0.00045) * 0.0012

      gl.useProgram(prog)
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uTime, ts * 0.001)
      gl.uniform2f(
        uMoonOffset,
        smoothOffsetRef.current.x + driftX,
        smoothOffsetRef.current.y + driftY,
      )
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  // Only move the Moon when the pointer is within the proximity zone around the Moon (or actively dragging it);
  // otherwise smoothly recenter the Moon over the Sun.
  const getPointerMoonMetrics = (clientX, clientY) => {
    const el = sectionRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const moonCx = rect.left + rect.width * 0.5
    const moonCy = rect.top + rect.height * 0.445
    const zoneR = rect.height * MOON_ZONE_RADIUS_FACTOR

    const px = clientX - moonCx
    const py = -(clientY - moonCy) // Flip Y for WebGL upward +Y
    const distPx = Math.hypot(px, py)
    return {
      dx: px / zoneR,
      dy: py / zoneR,
      distNorm: distPx / zoneR,
      insideZone: distPx <= zoneR,
    }
  }

  const applyMoonOffset = (metrics, isDrag) => {
    const maxR = isDrag ? MAX_DRAG_OFFSET : MAX_HOVER_OFFSET
    const clampedDist = Math.min(1, metrics.distNorm) * maxR
    const scale = metrics.distNorm > 1e-4 ? clampedDist / metrics.distNorm : 0
    targetOffsetRef.current = {
      x: metrics.dx * scale,
      y: metrics.dy * scale,
    }
  }

  const handlePointerMove = (e) => {
    const m = getPointerMoonMetrics(e.clientX, e.clientY)
    if (!m) return

    setNearMoon(m.insideZone)
    if (draggingRef.current || m.insideZone) {
      applyMoonOffset(m, draggingRef.current)
    } else {
      targetOffsetRef.current = { ...CENTER_MOON_OFFSET }
    }
  }

  const handlePointerDown = (e) => {
    const m = getPointerMoonMetrics(e.clientX, e.clientY)
    if (!m || !m.insideZone) return
    draggingRef.current = true
    setDragging(true)
    applyMoonOffset(m, true)
  }

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    const m = getPointerMoonMetrics(e.clientX, e.clientY)
    if (!m || !m.insideZone) {
      setNearMoon(false)
      targetOffsetRef.current = { ...CENTER_MOON_OFFSET }
    }
  }

  const handlePointerLeave = () => {
    draggingRef.current = false
    setDragging(false)
    setNearMoon(false)
    targetOffsetRef.current = { ...CENTER_MOON_OFFSET }
  }

  const { quote, source } = PORTFOLIO_DATA.breatheInterlude

  return (
    <section
      ref={sectionRef}
      id="breathe"
      aria-label="Breathe Eclipse Interlude"
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={`relative min-h-[100svh] w-full flex flex-col items-center justify-end px-6 pb-16 md:pb-24 overflow-hidden select-none ${
        dragging ? 'cursor-grabbing' : nearMoon ? 'cursor-grab' : 'cursor-default'
      }`}
    >
      {/* Delicate top thread continuing smoothly from Act I */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-16 z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255, 110, 20, 0.55) 0%, rgba(255, 110, 20, 0.12) 60%, transparent 100%)',
        }}
      />

      {/* Transparent-Void Interactive Solar Eclipse Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-0 pointer-events-none"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
        }}
      />

      {/* Real-Time Scroll-Choreographed Quote & Attribution */}
      <figure
        ref={quoteRef}
        className="relative z-10 max-w-2xl mx-auto text-center space-y-3.5 pt-96 pointer-events-none will-change-transform"
      >
        <blockquote className="font-pf-main font-normal text-lg sm:text-2xl md:text-[26px] uppercase leading-[1.25] text-white/90 tracking-[-0.01em]">
          &ldquo;{quote}&rdquo;
        </blockquote>
        <figcaption className="font-pf-label text-[11px] sm:text-[12px] uppercase text-white/45 tracking-[0.14em]">
          &mdash; &ldquo;{source}&rdquo;
        </figcaption>
        <p className="font-pf-label text-[10px] uppercase text-white/25 tracking-[0.18em] pt-2">
          MOVE OR DRAG TO SHIFT THE MOON
        </p>
      </figure>

      {/* Delicate bottom thread leading into Works */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-14 z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(255, 180, 70, 0.28) 65%, rgba(0, 210, 255, 0.35) 100%)',
        }}
      />
    </section>
  )
}
