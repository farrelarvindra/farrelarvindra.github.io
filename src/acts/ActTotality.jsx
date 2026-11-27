import { useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'

const LUNAR_VERT_SRC = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`

// Photorealistic pitch-dark Lunar Surface POV + 3 rare, subtle glinting stars
// Transparent sky (alpha = 0) so CosmicBackdrop's quiet starfield shines naturally behind it,
// solid opaque dark Moon (alpha = 1) below the rugged lunar horizon.
const LUNAR_FRAG_SRC = `
  precision highp float;
  varying vec2 v_uv;

  uniform vec2 u_res;
  uniform float u_time;
  uniform vec2 u_look;
  uniform vec3 u_clickStar; // xy = norm uv (0..1), z = age in seconds (< 0 inactive)

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.04 + vec2(11.3, 7.1);
      a *= 0.5;
    }
    return v;
  }

  // Procedural realistic lunar impact craters (depressed bowl + subtle raised rim)
  float craterLayer(vec2 p, float scale) {
    vec2 sp = p * scale;
    vec2 cell = floor(sp);
    vec2 f = fract(sp);
    float h = 0.0;

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 nb = vec2(float(x), float(y));
        vec2 id = cell + nb;
        vec2 rnd = hash22(id);
        float present = step(0.42, hash12(id + 19.7));
        vec2 center = nb + 0.18 + 0.64 * rnd;
        float dist = length(f - center);
        float rad = 0.14 + 0.30 * hash12(id + 41.3);

        float r = dist / rad;
        if (r < 1.35) {
          // Concave crater bowl inside r < 1.0
          float bowl = smoothstep(1.0, 0.15, r);
          float depth = -0.34 * bowl * bowl;
          // Raised ejecta rim peaking around r = 0.96
          float rim = 0.12 * exp(-pow((r - 0.96) / 0.16, 2.0));
          h += (depth + rim) * present * (rad * 2.2);
        }
      }
    }
    return h;
  }

  // Full lunar heightfield (mare undulations + multi-scale craters + fine regolith dust)
  float lunarHeight(vec2 p) {
    float h = 0.0;
    h += (fbm(p * 0.45) - 0.5) * 0.42;
    h += craterLayer(p, 0.72) * 0.48;
    h += craterLayer(p + vec2(3.7, 9.2), 1.95) * 0.24;
    h += (fbm(p * 4.8) - 0.5) * 0.075;
    h += (noise(p * 18.0) - 0.5) * 0.022;
    return h;
  }

  // Gentle curved lunar horizon silhouette with realistic subtle mountain ridges
  float horizonHeight(float xNorm) {
    float dx = (xNorm - 0.5);
    float curve = 0.30 - dx * dx * 0.16;
    float ridge =
      (fbm(vec2(xNorm * 5.2 + 1.3, 0.4)) - 0.5) * 0.028 +
      (noise(vec2(xNorm * 22.0 + 4.1, 1.7)) - 0.5) * 0.006;
    return curve + ridge;
  }

  // Delicate, refined astronomical star glint (DPI-normalized, un-premultiplied RGBA)
  vec4 renderGlintStar(vec2 px, vec2 starPx, float intensity, vec3 tint, float pxScale) {
    vec2 d = (px - starPx) * pxScale;
    float r = length(d);

    // Subtle soft atmospheric-free halo
    float halo = exp(-r / (5.0 + intensity * 16.0)) * (0.36 * intensity);

    // Crisp pinpoint core (always visible as a quiet star, brightens cleanly during glint)
    float core = exp(-r * r / (1.5 + intensity * 2.5)) * (0.62 + intensity * 0.38);

    // Slender 4-point diffraction needles (emerge smoothly when the star shines)
    float spikePow = smoothstep(0.12, 1.0, intensity);
    float len = 10.0 + spikePow * 32.0;
    float sx = exp(-abs(d.y) * 1.05) * exp(-abs(d.x) / len);
    float sy = exp(-abs(d.x) * 1.05) * exp(-abs(d.y) / len);
    float spikes = (sx + sy) * 0.68 * spikePow;

    float alpha = clamp(core + halo + spikes, 0.0, 1.0);
    // Keep RGB un-premultiplied (browser multiplies by alpha when premultipliedAlpha: false)
    vec3 pureCol = mix(tint, vec3(1.0), clamp(core * 0.9 + spikes * 0.45, 0.0, 1.0));
    return vec4(pureCol, alpha);
  }

  void main() {
    vec2 uv = v_uv;
    vec2 px = uv * u_res;
    float aspect = u_res.x / max(1.0, u_res.y);
    float pxScale = 680.0 / max(400.0, u_res.y);

    // Subtle POV camera look parallax
    vec2 lookUv = uv + vec2(u_look.x * 0.014, u_look.y * 0.008);
    float hY = horizonHeight(lookUv.x);

    // Smooth anti-aliased edge along the lunar horizon
    float pixelY = 1.0 / max(1.0, u_res.y);
    float moonMask = smoothstep(hY + pixelY * 1.6, hY - pixelY * 1.2, lookUv.y);

    // ================================================================
    // 1. SKY ABOVE THE MOON: 3 QUIET STARS THAT SOMETIMES SHINE
    // ================================================================
    vec3 skyCol = vec3(1.0);
    float skyAlpha = 0.0;

    if (moonMask < 0.999) {
      vec2 skyPx = px + vec2(u_look.x * 14.0, u_look.y * 6.0);

      // 3 staggered stars in the open dark sky above the Moon (11s, 14s, 17s cycles)
      float cyc1 = fract((u_time + 3.2) / 11.0);
      float glint1 = exp(-pow((cyc1 - 0.5) / 0.095, 2.0)) * 0.88;
      vec4 s1 = renderGlintStar(skyPx, vec2(0.24, 0.58) * u_res, glint1, vec3(0.82, 0.91, 1.0), pxScale);

      float cyc2 = fract((u_time + 9.4) / 14.0);
      float glint2 = exp(-pow((cyc2 - 0.5) / 0.088, 2.0)) * 0.84;
      vec4 s2 = renderGlintStar(skyPx, vec2(0.76, 0.53) * u_res, glint2, vec3(1.0, 0.93, 0.82), pxScale);

      float cyc3 = fract((u_time + 14.6) / 17.0);
      float glint3 = exp(-pow((cyc3 - 0.5) / 0.085, 2.0)) * 0.80;
      vec4 s3 = renderGlintStar(skyPx, vec2(0.56, 0.43) * u_res, glint3, vec3(0.90, 0.95, 1.0), pxScale);

      // Combine non-overlapping star contributions cleanly in un-premultiplied space
      float aSum = s1.a + s2.a + s3.a;
      vec3 cMix = (s1.rgb * s1.a + s2.rgb * s2.a + s3.rgb * s3.a);

      // Optional single user-clicked gentle star glint
      if (u_clickStar.z >= 0.0 && u_clickStar.z < 3.2) {
        float age = u_clickStar.z;
        float env = age < 0.45 ? (age / 0.45) : exp(-pow((age - 0.45) / 0.95, 2.0));
        vec4 sc = renderGlintStar(skyPx, u_clickStar.xy * u_res, env * 0.86, vec3(0.88, 0.94, 1.0), pxScale);
        cMix += sc.rgb * sc.a;
        aSum += sc.a;
      }

      float topFade = smoothstep(1.0, 0.88, uv.y);
      skyAlpha = clamp(aSum, 0.0, 1.0) * topFade;
      skyCol = aSum > 0.0001 ? (cMix / aSum) : vec3(1.0);
    }

    // ================================================================
    // 2. PHOTOREALISTIC PITCH-BLACK LUNAR SURFACE FOREGROUND
    // ================================================================
    vec3 moonCol = vec3(0.008, 0.008, 0.015); // #020204 deep obsidian base

    if (moonMask > 0.001) {
      // Perspective projection onto the lunar ground receding toward the horizon
      float distFromHorizon = max(0.004, hY - lookUv.y);
      float zDepth = 0.34 / (distFromHorizon + 0.042);
      vec2 worldP = vec2((lookUv.x - 0.5) * aspect * zDepth * 1.15, zDepth * 0.85);

      // Finite-difference surface normal from realistic lunar heightfield
      float eps = 0.014 * (1.0 + zDepth * 0.08);
      float hc = lunarHeight(worldP);
      float hx = lunarHeight(worldP + vec2(eps, 0.0));
      float hz = lunarHeight(worldP + vec2(0.0, eps));
      vec3 N = normalize(vec3((hc - hx) / eps * 1.85, 1.0, (hc - hz) / eps * 1.85));

      // Ultra-low grazing back-side light from behind the horizon (real dark-side lunar mood!)
      vec3 L = normalize(vec3(0.18 + u_look.x * 0.15, 0.14, 0.96));
      vec3 V = normalize(vec3((lookUv.x - 0.5) * 0.6, 0.28, -0.94));

      // Lommel-Seeliger lunar regolith reflectance (physically accurate dusty dark moon shading)
      float NdotL = max(0.0, dot(N, L));
      float NdotV = max(0.05, dot(N, V));
      float regolith = NdotL / (NdotL + NdotV * 0.92 + 0.05);

      // Distance falloff: faint grazed charcoal-silver texture near the crest, fading to pure black underfoot
      float horizonProximity = exp(-distFromHorizon * 6.8);
      float foregroundFade = smoothstep(0.0, 0.24, uv.y);

      // Micro-albedo variation (dark lunar basalt & charcoal dust)
      float basalt = 0.65 + 0.35 * fbm(worldP * 1.3);

      // Keep overall tone overwhelmingly dark/black (#020204..#20232b) with crisp grazed rim catches
      float lightAmt = regolith * basalt * (0.045 + horizonProximity * 0.22) * foregroundFade;

      // Subtle grazing silver edge along the very silhouette ridge against deep space
      float rimEdge = exp(-distFromHorizon * 72.0) * (0.14 + 0.22 * smoothstep(0.15, 0.75, regolith));

      vec3 regolithTint = vec3(0.74, 0.78, 0.86);
      moonCol = vec3(0.008, 0.008, 0.015) + regolithTint * (lightAmt + rimEdge * 0.55);

      // Deepen craters and foreground into true obsidian black at the very bottom edge
      moonCol = mix(vec3(0.008, 0.008, 0.015), moonCol, smoothstep(0.0, 0.18, uv.y));
    }

    // Composite opaque black Moon over transparent flaring star sky
    vec3 finalCol = mix(skyCol, moonCol, moonMask);
    float finalAlpha = mix(skyAlpha, 1.0, moonMask);
    gl_FragColor = vec4(finalCol, finalAlpha);
  }
`

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function formatWibTime() {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
  } catch {
    return '--:--:--'
  }
}

export default function ActTotality({ onReplayIntro }) {
  const moonCanvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [hoveredChannel, setHoveredChannel] = useState(null)
  const [wibTime, setWibTime] = useState('--:--:--')

  // Subtle POV look parallax & single gentle user-clicked star glint
  const pointerRef = useRef({ x: 0, y: 0, active: false })
  const clickStarRef = useRef({ x: 0.5, y: 0.65, age: -1 })
  const visibleRef = useRef(true)

  // Live WIB (UTC+7) clock
  useEffect(() => {
    const updateClock = () => setWibTime(formatWibTime())
    updateClock()
    const timer = window.setInterval(updateClock, 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Pause WebGL dark Moon shader while scrolled far above Act IV
  useEffect(() => {
    const el = moonCanvasRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { rootMargin: '280px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 60fps WebGL Photorealistic Dark Moon Surface + 3 Rare Subtle Glinting Stars
  useEffect(() => {
    const canvas = moonCanvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    })
    if (!gl) return

    const vs = compileShader(gl, gl.VERTEX_SHADER, LUNAR_VERT_SRC)
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, LUNAR_FRAG_SRC)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return

    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const posLoc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uLook = gl.getUniformLocation(prog, 'u_look')
    const uClickStar = gl.getUniformLocation(prog, 'u_clickStar')

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pw = Math.round(rect.width * dpr)
      const ph = Math.round(rect.height * dpr)
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
        gl.viewport(0, 0, pw, ph)
      }
    }

    syncSize()
    const ro = new ResizeObserver(syncSize)
    ro.observe(canvas)

    let rafId = 0
    let lastTs = performance.now()
    let smoothX = 0
    let smoothY = 0

    const render = (now) => {
      const dt = Math.min((now - lastTs) / 1000, 0.05)
      lastTs = now

      if (!visibleRef.current) {
        rafId = requestAnimationFrame(render)
        return
      }

      syncSize()

      const targetX = pointerRef.current.active ? pointerRef.current.x : 0
      const targetY = pointerRef.current.active ? pointerRef.current.y : 0
      smoothX += (targetX - smoothX) * Math.min(1, dt * 2.5)
      smoothY += (targetY - smoothY) * Math.min(1, dt * 2.5)

      if (clickStarRef.current.age >= 0) {
        clickStarRef.current.age += dt
        if (clickStarRef.current.age > 3.2) {
          clickStarRef.current.age = -1
        }
      }

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, now * 0.001)
      gl.uniform2f(uLook, smoothX, smoothY)
      gl.uniform3f(
        uClickStar,
        clickStarRef.current.x,
        clickStarRef.current.y,
        clickStarRef.current.age,
      )

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(PORTFOLIO_DATA.socials.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    } catch {
      window.location.href = `mailto:${PORTFOLIO_DATA.socials.email}`
    }
  }

  const handleSkyPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    pointerRef.current = {
      x: (nx - 0.5) * 2,
      y: (0.5 - ny) * 2,
      active: true,
    }
  }

  const handleSkyPointerLeave = () => {
    pointerRef.current.active = false
  }

  const handleSkyClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = 1 - (e.clientY - rect.top) / rect.height // WebGL UV y=0 is bottom
    if (y < 0.34) return // ignore clicks on the lunar ground
    clickStarRef.current = { x, y, age: 0 }
  }

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const { eyebrow, quote, quoteSource, heading, status, whisper, portrait } = PORTFOLIO_DATA.actFour
  const { email, github, linkedin, instagram, instagramHandle } = PORTFOLIO_DATA.socials

  const channels = [
    {
      id: 'email',
      num: '01',
      label: 'DIRECT MAIL',
      value: email,
      accent: '#ff2044',
      isEmail: true,
      href: `mailto:${email}`,
    },
    {
      id: 'github',
      num: '02',
      label: 'GITHUB',
      value: `github.com/${PORTFOLIO_DATA.githubUsername}`,
      accent: '#00d2ff',
      href: github,
    },
    {
      id: 'linkedin',
      num: '03',
      label: 'LINKEDIN',
      value: 'in/maulana-farrel-arvindra',
      accent: '#ffd00c',
      href: linkedin,
    },
    {
      id: 'instagram',
      num: '04',
      label: 'INSTAGRAM',
      value: instagramHandle,
      accent: '#9234ff',
      href: instagram,
    },
  ]

  return (
    <footer
      id="signal"
      aria-label="Act IV — Eclipse Totality & Lunar Horizon Finale"
      className="relative w-full flex flex-col justify-between pt-24 overflow-hidden"
    >
      {/* Top optical thread continuing cleanly from Act III */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 208, 12, 0.2) 55%, transparent 100%)',
        }}
      />

      {/* =========================================================
          UPPER CHAPTER: ECLIPSE LYRIC & FRAMELESS CONTACT INDEX
          ========================================================= */}
      <div className="relative z-10 max-w-5xl w-full mx-auto px-6 md:px-11 space-y-14 pt-12">
        {/* Closing Eclipse Quote (unified Pink Floyd quote format, pure starfield backdrop) */}
        <figure className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="font-pf-label text-[11px] uppercase text-white/45">
            04 // {eyebrow}
          </div>

          <blockquote className="font-pf-main font-light italic text-xl sm:text-2xl md:text-[28px] leading-[1.38] text-white/90 tracking-[-0.01em]">
            “{quote}”
          </blockquote>

          <figcaption className="font-pf-label text-[10.5px] sm:text-[11px] uppercase text-white/40 tracking-[0.14em]">
            — {quoteSource}
          </figcaption>
        </figure>

        {/* Signal Contact Index + Low-Opacity Feathered Darkroom Portrait */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left: Signal Header + 4-Channel Contact Index */}
          <div className="lg:col-span-8 space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.12] pb-4">
              <h2 className="font-pf-main font-normal text-2xl sm:text-4xl uppercase leading-none text-white/95">
                {heading}
              </h2>

              <div className="flex flex-wrap items-center gap-4 font-pf-label text-[10.5px] uppercase text-white/50">
                <span className="inline-flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  {status}
                </span>
                <span className="tabular-nums text-white/35">{wibTime} WIB</span>
              </div>
            </div>

            {/* Frameless 4-Channel Contact Index */}
            <ul className="divide-y divide-white/[0.08]">
              {channels.map((ch) => {
                const isHovered = hoveredChannel === ch.id
                return (
                  <li
                    key={ch.id}
                    onMouseEnter={() => setHoveredChannel(ch.id)}
                    onMouseLeave={() => setHoveredChannel(null)}
                    className="py-4 sm:py-5 flex flex-wrap items-center justify-between gap-4 group transition-colors"
                  >
                    <div className="flex items-center gap-4 sm:gap-6 min-w-0">
                      <span
                        className="font-pf-label text-[11px] tabular-nums transition-colors"
                        style={{ color: isHovered ? ch.accent : 'rgba(255, 255, 255, 0.32)' }}
                      >
                        {ch.num}
                      </span>

                      <div className="min-w-0">
                        <div className="font-pf-label text-[10px] uppercase text-white/40">
                          {ch.label}
                        </div>
                        <div className="font-pf-main text-base sm:text-xl text-white/85 group-hover:text-white transition-colors truncate">
                          {ch.value}
                        </div>
                      </div>
                    </div>

                    {/* Right-side minimal mono actions */}
                    <div className="flex items-center gap-4 font-pf-label text-[11px] uppercase">
                      {ch.isEmail && (
                        <button
                          type="button"
                          onClick={handleCopyEmail}
                          className="px-3 py-1.5 border border-white/15 hover:border-white/55 text-white/75 hover:text-white transition-colors cursor-pointer"
                        >
                          {copied ? 'COPIED ✓' : 'COPY EMAIL'}
                        </button>
                      )}

                      <a
                        href={ch.href}
                        target={ch.isEmail ? undefined : '_blank'}
                        rel={ch.isEmail ? undefined : 'noreferrer'}
                        className="inline-flex items-center gap-1.5 text-white/60 hover:text-white transition-colors py-1"
                      >
                        <span>{ch.isEmail ? 'SEND MAIL' : 'OPEN'}</span>
                        <span className="transition-transform group-hover:translate-x-0.5">→</span>
                      </a>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Right: Frameless Low-Opacity Cutout Portrait — pitch-black backdrop vanishes via mix-blend-lighten */}
          {portrait && (
            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <figure className="group relative w-60 sm:w-64 lg:w-full max-w-[300px] aspect-[3/4] select-none mix-blend-lighten">
                <div
                  className="relative w-full h-full overflow-hidden transition-opacity duration-700 opacity-[0.34] group-hover:opacity-[0.65]"
                  style={{
                    maskImage:
                      'linear-gradient(to bottom, black 0%, black 62%, transparent 100%)',
                    WebkitMaskImage:
                      'linear-gradient(to bottom, black 0%, black 62%, transparent 100%)',
                  }}
                >
                  <img
                    src={portrait}
                    alt={PORTFOLIO_DATA.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.03]"
                    style={{
                      filter: 'grayscale(100%) contrast(1.12) brightness(0.95)',
                    }}
                  />
                </div>
              </figure>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================
          THE ENDING: STANDING ON THE DARK MOON, VIEWING THE STARS
          ========================================================= */}
      <div
        onPointerMove={handleSkyPointerMove}
        onPointerLeave={handleSkyPointerLeave}
        onClick={handleSkyClick}
        className="relative w-full mt-14 sm:mt-20 min-h-[600px] sm:min-h-[680px] flex flex-col justify-between select-none"
      >
        {/* WebGL Photorealistic Pitch-Black Lunar Surface + 3 Rare Subtle Glinting Stars */}
        <canvas
          ref={moonCanvasRef}
          aria-label="Photorealistic dark lunar surface looking out into deep space"
          className="absolute inset-0 w-full h-full block"
        />

        {/* Quote positioned comfortably in the middle-upper dark cosmos above the Moon (unified quote format) */}
        <figure className="relative z-10 flex flex-col items-center px-6 pt-24 sm:pt-32 space-y-4 pointer-events-none">
          <blockquote className="font-pf-main font-light italic text-xl sm:text-2xl md:text-[28px] leading-[1.38] text-white/90 tracking-[-0.01em] text-center max-w-2xl drop-shadow-[0_2px_18px_rgba(2,2,4,0.95)]">
            “{whisper}”
          </blockquote>
          <figcaption className="font-pf-label text-[10.5px] sm:text-[11px] uppercase text-white/40 tracking-[0.14em]">
            — {quoteSource}
          </figcaption>
        </figure>

        {/* Quiet navigation tucked into the obsidian lunar ground underfoot */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 max-w-5xl w-full mx-auto px-6 md:px-11 pb-8 pt-6"
        >
          <div className="pt-4 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-4 font-pf-label text-[10px] uppercase text-white/38">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleBackToTop}
                className="hover:text-white transition-colors cursor-pointer"
              >
                BACK TO PRISM ↑
              </button>
              {onReplayIntro && (
                <>
                  <span className="text-white/20">·</span>
                  <button
                    type="button"
                    onClick={onReplayIntro}
                    className="hover:text-white transition-colors cursor-pointer"
                  >
                    REPLAY PORTAL ↺
                  </button>
                </>
              )}
            </div>

            <span className="text-white/25">FIN · DARK SIDE OF THE MOON</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
