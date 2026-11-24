import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'

const VERT_SRC = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Photorealistic Total Eclipse + Diamond-Ring Solar Burst Shader with transparent void alpha:
// Inside the Moon disc -> opaque #020204 (genuinely occulting the shared CosmicBackdrop stars!)
// Outside the Moon disc -> smooth optical alpha so the exact same continuous starfield surrounds the Eclipse!
const FRAG_SRC = `
  precision highp float;

  uniform vec2 uRes;
  uniform float uTime;
  uniform float uBurstAngle;

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
    float x = clamp(h, 0.0, 1.6);
    vec3 col = mix(vec3(0.0), vec3(0.48, 0.05, 0.005), smoothstep(0.0, 0.10, x));
    col = mix(col, vec3(0.96, 0.24, 0.01), smoothstep(0.10, 0.30, x));
    col = mix(col, vec3(1.00, 0.58, 0.03), smoothstep(0.30, 0.58, x));
    col = mix(col, vec3(1.00, 0.90, 0.24), smoothstep(0.58, 0.92, x));
    col = mix(col, vec3(1.00, 0.99, 0.86), smoothstep(0.92, 1.40, x));
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
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);
    float dRim = r - sunR;

    // 1. RAZOR-THIN GOLDEN-ORANGE LIMB RING (bright left/right arcs, smoldering top/bottom poles)
    float arcWeight = 0.14 + 0.86 * pow(abs(dir.x), 1.45);
    float gran = 0.84 + 0.32 * fbm(vec3(dir * 16.0, uTime * 0.2));
    float pips = pow(fbm(vec3(dir * 34.0, r * 24.0 - uTime * 0.32)), 3.4);
    float pipExtend = pips * 0.009 * (0.4 + 0.6 * arcWeight);

    float innerEdge = smoothstep(-0.0024, 0.0004, dRim);
    float dOuter = max(dRim - pipExtend, 0.0);

    float ringCore = exp(-dOuter * 175.0) * 1.32 * arcWeight * gran;
    float ringFire = exp(-dOuter * 48.0) * 0.52 * (0.28 + 0.72 * arcWeight) * (0.8 + 0.4 * pips);
    float ringAmbient = exp(-abs(dRim) * 14.0) * 0.085 * (0.35 + 0.65 * arcWeight);

    float topPipMask = pow(max(0.0, dot(dir, normalize(vec2(0.28, 0.96)))), 48.0);
    float topPip = exp(-max(dRim, 0.0) * 55.0) * innerEdge * topPipMask * (0.45 + 0.55 * pips) * 0.65;

    float rimHeat = (ringCore + ringFire + topPip) * innerEdge + ringAmbient * smoothstep(-0.03, 0.0, dRim);

    // 2. SINGULAR BLAZING LOWER-RIGHT SOLAR FLARE (~4 o'clock)
    vec2 burstDir = vec2(cos(uBurstAngle), sin(uBurstAngle));
    vec2 burstPos = burstDir * sunR;
    vec2 dp = p - burstPos;
    float dBurst = length(dp);

    vec2 burstLocal = vec2(dp.x * 1.12, dp.y * 0.84);
    float flameWarp = (fbm(vec3(dp * 28.0, uTime * 0.38)) - 0.48) * 0.016;
    float dWarped = max(0.0, length(burstLocal) + flameWarp * smoothstep(0.004, 0.06, dBurst));

    float flareCore = exp(-dWarped * 48.0) * 2.55;
    float flareOrange = exp(-dWarped * 18.5) * 0.92;
    float flareHaze = exp(-dBurst * 6.8) * 0.24;

    float burstCone = pow(max(0.0, dot(dir, burstDir)), 12.0);
    float burstTongues = exp(-max(dRim, 0.0) * 22.0) * innerEdge * burstCone * pow(fbm(vec3(dir * 22.0, r * 14.0 - uTime * 0.42)), 1.6) * 1.15;

    float totalHeat = rimHeat + flareCore + flareOrange + burstTongues;
    vec3 fireLinear = solarRamp(totalHeat) * totalHeat * 1.25
                    + vec3(0.75, 0.14, 0.015) * flareHaze;

    // Whisper-subtle chromatic lens fringe on the outer edge of the 4 o'clock burst
    // (visually echoes Act I's optical prism lens without losing the pure solar fire palette)
    float fringe = exp(-abs(dBurst - 0.095) * 32.0) * 0.065;
    fireLinear += vec3(0.05, 0.42, 0.85) * fringe;

    // 3. INNER-MOON OPTICAL LIGHT BLEED (Warm copper scatter on right edge inside the opaque dark Moon)
    float insideMoon = 1.0 - smoothstep(sunR - 0.003, sunR + 0.001, r);
    if (r < sunR) {
      float innerScatter = exp(-dBurst * 6.5) * smoothstep(sunR * 0.15, sunR, r);
      fireLinear += vec3(0.58, 0.13, 0.012) * innerScatter * 0.34;
    }

    vec3 mappedFire = pow(aces(fireLinear), vec3(1.0 / 2.2));
    vec3 moonVoid = vec3(0.00784, 0.00784, 0.01569); // #020204

    // Alpha = 1.0 inside the Moon (occults background stars cleanly), smooth glow alpha outside
    float glowLum = max(mappedFire.r, max(mappedFire.g, mappedFire.b));
    float outAlpha = clamp(glowLum * 1.65, 0.0, 1.0);
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
    uRes: gl.getUniformLocation(prog, 'uRes'),
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uBurstAngle: gl.getUniformLocation(prog, 'uBurstAngle'),
  }
}

export default function InterludeBreathe() {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const targetAngleRef = useRef(-0.24)
  const smoothAngleRef = useRef(-0.24)
  const [revealProgress, setRevealProgress] = useState(0)

  useEffect(() => {
    const updateScrollChoreography = () => {
      const el = sectionRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      const progress = (vh * 0.5 - (rect.top + rect.height * 0.5)) / vh

      targetAngleRef.current = -0.24 - Math.max(-0.5, Math.min(0.5, progress)) * 0.24

      // Smooth cinematic reveal: peaks at 1.0 when section is centered in viewport
      const visibility = 1 - Math.min(1, Math.abs(progress) * 1.35)
      setRevealProgress(Math.max(0, visibility))
    }

    window.addEventListener('scroll', updateScrollChoreography, { passive: true })
    window.addEventListener('resize', updateScrollChoreography)
    updateScrollChoreography()

    return () => {
      window.removeEventListener('scroll', updateScrollChoreography)
      window.removeEventListener('resize', updateScrollChoreography)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const state = initEclipseGL(canvas)
    if (!state) return undefined

    const { gl, prog, uRes, uTime, uBurstAngle } = state
    let rafId = 0

    const render = (ts) => {
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

      smoothAngleRef.current += (targetAngleRef.current - smoothAngleRef.current) * 0.05
      const subtleDrift = Math.sin(ts * 0.0005) * 0.02

      gl.useProgram(prog)
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uTime, ts * 0.001)
      gl.uniform1f(uBurstAngle, smoothAngleRef.current + subtleDrift)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const { quote, source } = PORTFOLIO_DATA.breatheInterlude

  return (
    <section
      ref={sectionRef}
      id="breathe"
      aria-label="Breathe Eclipse Interlude"
      className="relative min-h-[100svh] w-full flex flex-col items-center justify-end px-6 pb-16 md:pb-24 overflow-hidden"
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

      {/* Transparent-Void Solar Eclipse Canvas (Moon occults the shared CosmicBackdrop stars!) */}
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

      {/* Scroll-Choreographed Quote & Attribution */}
      <figure
        className="relative z-10 max-w-2xl mx-auto text-center space-y-3.5 pt-96 transition-transform duration-150"
        style={{
          opacity: 0.18 + revealProgress * 0.82,
          transform: `translateY(${((1 - revealProgress) * 18).toFixed(1)}px)`,
        }}
      >
        <blockquote className="font-pf-main font-normal text-lg sm:text-2xl md:text-[26px] uppercase leading-[1.25] text-white/90 tracking-[-0.01em]">
          &ldquo;{quote}&rdquo;
        </blockquote>
        <figcaption className="font-pf-label text-[11px] sm:text-[12px] uppercase text-white/45 tracking-[0.14em]">
          &mdash; &ldquo;{source}&rdquo;
        </figcaption>
      </figure>

      {/* Delicate bottom thread leading into Act II */}
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
