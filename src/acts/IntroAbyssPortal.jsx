import { useCallback, useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'

const PORTAL_VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Real-time 60fps Abyssal Maelstrom & True-Alpha Throat Aperture Shader:
// - Dual-phase logarithmic-spiral flow advection (100% seamless 360°, zero angle seam, zero wind-up)
// - Multi-octave domain-warped pelagic slate-blue mist + sheared Sumi-ink blotches & abyssal ash flecks
// - Tactile cursor fluid wake & gravitational rim refraction whisper
// - True-alpha central throat dilation (#020204 -> alpha 0) opening directly into Act I's starless abyss
const PORTAL_FRAG = `
  precision highp float;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uCam;
  uniform vec2 uCursor;
  uniform float uCursorWake;
  uniform float uPull;
  uniform float uDive;
  uniform float uAperture;
  uniform float uIntroFade;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.52;
    mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = m * p * 2.03 + vec2(13.7, 29.1);
      a *= 0.5;
    }
    return v;
  }

  float fbmFast(vec2 p) {
    float v = 0.0;
    float a = 0.54;
    mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = m * p * 2.07 + vec2(7.3, 19.9);
      a *= 0.5;
    }
    return v;
  }

  mat2 rot2(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
  }

  // Evaluate a single flow-advected spiral layer (counter-clockwise inward curl matching reference art)
  vec3 sampleVortexPhase(vec2 pLocal, float rLocal, float ph, vec2 seedShift, float extraTwist) {
    // Radial inward suction: multiplying sample coord by exp(+ph * pull) makes mist drift INWARD
    float rAdv = rLocal * exp(ph * 0.44);
    vec2 pAdv = pLocal * exp(ph * 0.44);

    // Counter-clockwise inward logarithmic spiral + differential Keplerian inner shear
    float spiralAngle = 2.55 * log(rAdv + 0.034)
                      - (0.36 + extraTwist * 0.22) / (rAdv + 0.135)
                      - (ph - 0.5) * (0.42 / (rAdv + 0.19));

    vec2 q = rot2(spiralAngle) * pAdv * 2.55 + seedShift;

    // Inigo Quilez domain-warped marbling for silky deep-water / nebula filaments
    vec2 warp = vec2(
      fbmFast(q + vec2(1.7, 9.2)),
      fbmFast(q + vec2(8.3, 2.8))
    );
    float mist = fbm(q + 1.75 * warp);

    // Ridged spiral funnel striations (creates dark folded spiral troughs around the throat)
    float spiralCrease = fbmFast(rot2(spiralAngle * 1.35) * pAdv * 6.4 + warp * 1.1 + seedShift);
    float ridge = 1.0 - abs(2.0 * spiralCrease - 1.0);

    // Painterly Sumi-ink blotches & fine abyssal ash flecks sheared along the spiral arms
    vec2 qInk = rot2(spiralAngle * 1.18) * pAdv * 5.2 + warp * 1.45 + seedShift * 1.7;
    float clumpMask = smoothstep(0.45, 0.74, fbmFast(q * 0.85 + vec2(31.4, 14.8)));
    float blotch = fbmFast(qInk * 2.15);
    float fineSpecks = pow(noise(qInk * 9.6), 2.8);
    float ink = smoothstep(0.53, 0.71, blotch * 0.74 + fineSpecks * 0.48) * clumpMask;

    return vec3(mist, ridge, ink);
  }

  // Moody pelagic / cosmic slate-blue color ramp faithful to the Abyss reference palette
  vec3 abyssPalette(float h) {
    float x = clamp(h, 0.0, 1.08);
    vec3 c0 = vec3(0.00784, 0.00784, 0.01569); // #020204 pure obsidian void
    vec3 c1 = vec3(0.020, 0.052, 0.102);       // deep abyssal trench navy
    vec3 c2 = vec3(0.062, 0.152, 0.242);       // midnight Prussian slate
    vec3 c3 = vec3(0.138, 0.278, 0.388);       // stormy pelagic steel-blue
    vec3 c4 = vec3(0.248, 0.428, 0.548);       // moonlit abyssal slate ridge
    vec3 c5 = vec3(0.385, 0.568, 0.678);       // silky cold pale-slate crest

    vec3 col = mix(c0, c1, smoothstep(0.02, 0.22, x));
    col = mix(col, c2, smoothstep(0.22, 0.45, x));
    col = mix(col, c3, smoothstep(0.45, 0.68, x));
    col = mix(col, c4, smoothstep(0.68, 0.88, x));
    col = mix(col, c5, smoothstep(0.88, 1.06, x));
    return col;
  }

  vec3 spectralHint(float u) {
    // Subtle prism-echo tint along the event horizon
    vec3 cyan = vec3(0.04, 0.72, 0.98);
    vec3 violet = vec3(0.52, 0.24, 0.95);
    vec3 gold = vec3(0.98, 0.74, 0.18);
    float s = fract(u);
    if (s < 0.5) return mix(cyan, violet, s * 2.0);
    return mix(violet, gold, (s - 0.5) * 2.0);
  }

  void main() {
    float minDim = max(1.0, min(uRes.x, uRes.y));
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / minDim;

    // Subtle 3D camera parallax over the abyss mouth (centers tightly during dive)
    float camDamp = 1.0 - smoothstep(0.0, 0.45, uDive);
    vec2 p = uv - uCam * 0.042 * camDamp;

    // Gentle elliptical 3D cant matching the sweeping diagonal shelves of the reference art
    float cant = 0.24;
    vec2 pt = rot2(cant) * p;
    pt.x *= 0.91;
    pt.y *= 1.04;
    vec2 pVortex = rot2(-cant) * pt;

    // Interactive fluid wake when trailing cursor across the dark water / mist
    vec2 dc = p - uCursor;
    float d2 = dot(dc, dc);
    float wake = exp(-d2 * 20.0) * uCursorWake * camDamp;
    vec2 wakePerp = vec2(-dc.y, dc.x);
    pVortex += (wakePerp * 0.62 + dc * 0.16 * sin(sqrt(d2 + 1e-4) * 34.0 - uTime * 3.8)) * wake * 0.15;

    float r = length(pVortex);

    // Continuous 3D funnel zoom: plunging scales features exponentially outward past the camera
    float funnelZoom = exp(uDive * 2.48 + uPull * 0.15);
    vec2 pLocal = pVortex / funnelZoom;
    float rLocal = r / funnelZoom;

    // Whole-maelstrom continuous counter-clockwise rigid drift (never winds up)
    float rigidRot = -uTime * 0.075 - uDive * 1.15 - uPull * 0.12;
    vec2 pRot = rot2(rigidRot) * pLocal;

    // Dual-phase flow crossfade for eternal inward suction + differential shear without wind-up
    float flowClock = uTime * 0.085 + uDive * 0.55;
    float ph0 = fract(flowClock);
    float ph1 = fract(flowClock + 0.5);
    float blend = 0.5 - 0.5 * cos(6.2831853 * ph0);

    float extraTwist = uPull * 0.45 + uDive * 1.25;
    vec3 s0 = sampleVortexPhase(pRot, rLocal, ph0, vec2(0.0, 0.0), extraTwist);
    vec3 s1 = sampleVortexPhase(pRot, rLocal, ph1, vec2(17.3, 9.1), extraTwist);
    vec3 vSample = mix(s0, s1, blend);

    float mist = vSample.x;
    float ridge = vSample.y;
    float ink = vSample.z;

    // Outer diagonal shelf modulation (dark pockets upper-left/lower-right, sweeping shelf ridges)
    float shelfWave = fbmFast(pLocal * 1.65 + vec2(-2.1, 4.4) - uTime * 0.012);
    float asymLight = 0.82 + 0.26 * sin(atan(pVortex.y, pVortex.x) - 0.85);

    // Funnel rim luminosity profile: peaks in the swirling mid-arms, deepens toward outer corners & inner throat
    float midGlow = smoothstep(0.085, 0.25, rLocal) * (1.0 - 0.34 * smoothstep(0.46, 1.05, rLocal));
    float innerFoldShadow = mix(0.55, 1.0, pow(ridge, 1.35));
    float innerTroughMask = smoothstep(0.42, 0.12, rLocal);

    float lum = (mist * 0.78 + pow(ridge, 2.2) * 0.32 + shelfWave * 0.16) * midGlow * asymLight;
    lum *= mix(1.0, innerFoldShadow, innerTroughMask * 0.75);

    // Apply sheared obsidian Sumi-ink blotches & granular abyssal sediment specks
    lum *= (1.0 - ink * 0.86);

    vec3 abyssVoid = vec3(0.00784, 0.00784, 0.01569); // Exact #020204
    vec3 col = abyssPalette(lum);

    // Extra fine dark particulate flecks suspended across brighter slate ridges
    float microGrit = smoothstep(0.74, 0.88, noise(rot2(rigidRot * 1.4) * pLocal * 42.0));
    col = mix(col, abyssVoid, microGrit * 0.62 * smoothstep(0.14, 0.55, rLocal));

    // ================================================================
    // EVENT HORIZON / ABYSSAL THROAT GEOMETRY
    // ================================================================
    float baseThroat = (0.114 - uPull * 0.012 + 0.003 * sin(uTime * 1.1)) * funnelZoom;
    float aperturePush = pow(smoothstep(0.24, 0.96, uDive), 2.15) * 1.18;
    float throatR = baseThroat + aperturePush;

    // Organic spiral ink tongues curling over the throat edge (no cookie-cutter circle)
    float throatTongues = (mist - 0.48) * 0.28 * throatR + (ridge - 0.5) * 0.09 * throatR;
    float throatMask = smoothstep(throatR * 0.78, throatR * 1.46, r + throatTongues);

    // Deepen funnel walls smoothly into #020204 as they plunge into the central shaft
    col = mix(abyssVoid, col, throatMask);

    // Whisper-subtle gravitational-lens chromatic shimmer hugging the inner lip on hover/dive
    float rimDist = abs((r + throatTongues * 0.45) - throatR * 1.02) / max(0.02, throatR);
    float lensBand = exp(-rimDist * 9.5) * (0.04 + 0.14 * uPull + 0.22 * sin(smoothstep(0.0, 0.72, uDive) * 3.14159));
    float angNorm = atan(pVortex.y, pVortex.x) / 6.2831853 + 0.5;
    col += spectralHint(angNorm + uTime * 0.06) * lensBand * throatMask;

    // ================================================================
    // DELICATE SPIRALING COLD PINPOINT GLINTS (drawn inward & swallowed)
    // ================================================================
    float glintScale = 760.0;
    float diveStreak = sin(smoothstep(0.0, 0.88, uDive) * 3.14159);
    vec3 glintAccum = vec3(0.0);

    for (int i = 0; i < 22; i++) {
      float fi = float(i);
      float h1 = fract(sin(fi * 127.1 + 19.7) * 43758.5453);
      float h2 = fract(sin(fi * 269.5 + 47.3) * 43758.5453);
      float h3 = fract(sin(fi * 419.2 + 83.1) * 43758.5453);

      float life = fract(h1 + uTime * (0.018 + 0.016 * h2) * (1.0 + uPull * 0.55) + uDive * (0.65 + 0.35 * h3));
      float rNorm = mix(0.74, 0.078, pow(life, 0.84));
      float rG = rNorm * funnelZoom;

      // Exact counter-clockwise inward streamline trajectory
      float thetaG = h2 * 6.2831853
                   - 2.55 * log(rNorm + 0.034)
                   + 0.36 / (rNorm + 0.135)
                   + uTime * 0.075
                   + uDive * 1.15;

      vec2 dirR = vec2(cos(thetaG), sin(thetaG));
      vec2 dirT = vec2(-dirR.y, dirR.x);
      vec2 gPos = dirR * rG;

      vec2 dPx = (pVortex - gPos) * glintScale;
      // During plunge, glints stretch smoothly along the inward spiral streamline
      vec2 flowDir = normalize(-dirR * 0.58 + dirT * 0.81);
      vec2 flowPerp = vec2(-flowDir.y, flowDir.x);

      float along = dot(dPx, flowDir) / (1.0 + diveStreak * 9.5);
      float across = dot(dPx, flowPerp);
      float dStretched = length(vec2(along, across));

      if (dStretched < 18.0) {
        float twinkle = 0.68 + 0.32 * sin(uTime * (1.6 + h3 * 2.2) + fi * 2.7);
        float fadeBirth = smoothstep(0.0, 0.14, life);
        // Extinguish cleanly inside the throat (leaving 2-3 faint dying glints right on the inner rim)
        float swallow = smoothstep(throatR * 0.66, throatR * 1.08, rG);
        float edgeFade = 1.0 - smoothstep(0.78, 1.08, rG);
        float vis = fadeBirth * swallow * edgeFade * twinkle * (0.45 + 0.55 * h3);

        float core = exp(-dStretched * dStretched * 0.62);
        // Crisp hairline 4-point cross spikes at rest, blending into spiral streak during plunge
        float crossFade = 1.0 - diveStreak * 0.85;
        float spX = exp(-abs(dPx.y) * 1.25) * exp(-abs(dPx.x) * (0.20 + 0.12 * h2));
        float spY = exp(-abs(dPx.x) * 1.25) * exp(-abs(dPx.y) * (0.20 + 0.12 * h2));
        float halo = exp(-dStretched * 0.28) * 0.22;

        vec3 gTint = mix(vec3(0.74, 0.88, 1.0), vec3(0.96, 0.98, 1.0), core);
        glintAccum += gTint * (core * 0.95 + (spX + spY) * 0.52 * crossFade + halo) * vis;
      }
    }

    col += glintAccum;

    // Gentle cinematic outer vignette so edges breathe naturally into deep midnight-obsidian
    float outerVig = smoothstep(1.22, 0.32, length(uv));
    col = mix(abyssVoid, col, 0.42 + 0.58 * outerVig);

    // Subtle film dither to eliminate 8-bit gradient banding in dark pelagic tones
    col += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
    col = clamp(col, 0.0, 1.0);

    // ================================================================
    // TRUE-ALPHA APERTURE HANDOFF INTO ACT I'S STARLESS #020204 ABYSS
    // ================================================================
    // Inside the #020204 throat (throatMask == 0), alpha opens smoothly to 0.0 during emergence,
    // revealing ActPrism directly through the dilating mouth of the portal with zero seam!
    float eyeOpen = smoothstep(0.0, 0.58, uAperture) * (1.0 - throatMask);
    float finalSweep = smoothstep(0.76, 1.0, uAperture);
    float alpha = clamp(1.0 - max(eyeOpen, finalSweep), 0.0, 1.0) * uIntroFade;

    gl_FragColor = vec4(col, alpha);
  }
`

function initPortalGL(canvas) {
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

  const vs = compile(gl.VERTEX_SHADER, PORTAL_VERT)
  const fs = compile(gl.FRAGMENT_SHADER, PORTAL_FRAG)
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
    loc: {
      uRes: gl.getUniformLocation(prog, 'uRes'),
      uTime: gl.getUniformLocation(prog, 'uTime'),
      uCam: gl.getUniformLocation(prog, 'uCam'),
      uCursor: gl.getUniformLocation(prog, 'uCursor'),
      uCursorWake: gl.getUniformLocation(prog, 'uCursorWake'),
      uPull: gl.getUniformLocation(prog, 'uPull'),
      uDive: gl.getUniformLocation(prog, 'uDive'),
      uAperture: gl.getUniformLocation(prog, 'uAperture'),
      uIntroFade: gl.getUniformLocation(prog, 'uIntroFade'),
    },
  }
}

// Quintic C2-continuous S-curve: silky acceleration into the throat & velvet landing in the abyss
function quinticInOut(t) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

export default function IntroAbyssPortal({
  isReplay = false,
  onApertureOpen,
  onComplete,
  onSkip,
}) {
  const glCanvasRef = useRef(null)
  const fallbackBgRef = useRef(null)
  const pullBarRef = useRef(null)

  const [plunging, setPlunging] = useState(false)
  const [hoveringEye, setHoveringEye] = useState(false)
  const [uiEntered, setUiEntered] = useState(!isReplay)

  const plungeStartRef = useRef(null)
  const apertureOpenedRef = useRef(false)
  const completedRef = useRef(false)
  const reducedMotionRef = useRef(false)

  const pointerRef = useRef({
    camX: 0,
    camY: 0,
    targetCamX: 0,
    targetCamY: 0,
    curX: 0,
    curY: 0,
    targetCurX: 0,
    targetCurY: 0,
    wake: 0,
    hoverPull: 0,
    scrollPull: 0,
    smoothPull: 0,
  })

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (isReplay) {
      const id = requestAnimationFrame(() => setUiEntered(true))
      return () => cancelAnimationFrame(id)
    }
    return undefined
  }, [isReplay])

  const triggerPlunge = useCallback(() => {
    if (plungeStartRef.current !== null || completedRef.current) return
    plungeStartRef.current = performance.now()
    setPlunging(true)
  }, [])

  const handleQuickSkip = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    if (onSkip) {
      onSkip()
    } else if (onComplete) {
      onComplete()
    }
  }, [onComplete, onSkip])

  // Lock page scroll while portal is active; support Enter, Space, and intuitive scroll-to-descend pull!
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        triggerPlunge()
      }
    }

    let touchStartY = null
    const onWheel = (e) => {
      if (plungeStartRef.current !== null) return
      if (e.deltaY > 0) {
        const next = Math.min(1, pointerRef.current.scrollPull + Math.min(0.42, e.deltaY * 0.0028))
        pointerRef.current.scrollPull = next
        if (next >= 0.88) {
          triggerPlunge()
        }
      } else if (e.deltaY < 0) {
        pointerRef.current.scrollPull = Math.max(0, pointerRef.current.scrollPull + e.deltaY * 0.002)
      }
    }

    const onTouchStart = (e) => {
      touchStartY = e.touches[0]?.clientY ?? null
    }

    const onTouchMove = (e) => {
      if (touchStartY === null || plungeStartRef.current !== null) return
      const y = e.touches[0]?.clientY
      if (typeof y !== 'number') return
      const dy = touchStartY - y
      if (dy > 58) {
        triggerPlunge()
      } else if (dy > 0) {
        pointerRef.current.scrollPull = Math.max(pointerRef.current.scrollPull, dy / 65)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [triggerPlunge])

  useEffect(() => {
    pointerRef.current.hoverPull = hoveringEye ? 0.55 : 0
  }, [hoveringEye])

  // Main 60fps Abyssal Maelstrom & True-Alpha Aperture Loop
  useEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas) return undefined

    const glState = initPortalGL(canvas)
    const mountTs = performance.now()
    let lastTs = mountTs
    let rafId = 0

    // Timeline (normal motion: 2.22s total; reduced motion: 0.90s gentle dissolve):
    // 0.00 -> 0.85s : Maelstrom coils & accelerates; camera plunges down the spiral funnel
    // 0.82s         : Central #020204 throat opens its true-alpha aperture -> ActPrism emerges inside!
    // 0.82 -> 2.22s : Swirling slate-blue vortex walls rush past outer corners as ActPrism's ray ignites
    // 2.22s         : Alpha = 0.000 across entire viewport -> clean zero-seam unmount
    const render = (ts) => {
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) * 0.001))
      lastTs = ts

      const isReduced = reducedMotionRef.current
      const totalDuration = isReduced ? 0.92 : 2.22
      const apertureStart = isReduced ? 0.18 : 0.82

      const introFade = isReplay ? Math.min(1, (ts - mountTs) / 580) : 1

      let diveU = 0
      let apertureU = 0
      if (plungeStartRef.current !== null) {
        const elapsed = Math.max(0, (ts - plungeStartRef.current) * 0.001)
        const rawU = Math.min(1, elapsed / totalDuration)
        diveU = isReduced ? rawU * 0.25 : quinticInOut(rawU)

        if (elapsed >= apertureStart) {
          if (!apertureOpenedRef.current) {
            apertureOpenedRef.current = true
            if (onApertureOpen) onApertureOpen()
          }
          apertureU = Math.min(1, (elapsed - apertureStart) / (totalDuration - apertureStart))
        }

        if (rawU >= 1 && !completedRef.current) {
          completedRef.current = true
          if (onComplete) onComplete()
          return
        }
      } else {
        // Gentle spring decay on uncommitted scroll-pull
        pointerRef.current.scrollPull = Math.max(0, pointerRef.current.scrollPull - dt * 0.34)
      }

      const p = pointerRef.current
      const targetPull = Math.min(1, Math.max(p.hoverPull, p.scrollPull))
      p.smoothPull += (targetPull - p.smoothPull) * Math.min(1, dt * 6.5)

      p.camX += (p.targetCamX - p.camX) * Math.min(1, dt * 4.2)
      p.camY += (p.targetCamY - p.camY) * Math.min(1, dt * 4.2)

      const dxCur = p.targetCurX - p.curX
      const dyCur = p.targetCurY - p.curY
      p.curX += dxCur * Math.min(1, dt * 9.0)
      p.curY += dyCur * Math.min(1, dt * 9.0)

      const curSpeed = Math.hypot(dxCur, dyCur) / Math.max(0.008, dt)
      const wakeTarget = Math.min(1, curSpeed * 0.55)
      p.wake += (wakeTarget - p.wake) * Math.min(1, dt * 5.5)

      if (pullBarRef.current) {
        const barScale = Math.min(1, p.scrollPull / 0.88)
        pullBarRef.current.style.transform = `scaleX(${barScale.toFixed(3)})`
        pullBarRef.current.style.opacity = barScale > 0.02 ? '1' : '0'
      }

      if (glState) {
        const { gl, prog, loc } = glState
        const dpr = Math.min(window.devicePixelRatio || 1, 1.85)
        const rect = canvas.getBoundingClientRect()
        const pw = Math.max(1, Math.round(rect.width * dpr))
        const ph = Math.max(1, Math.round(rect.height * dpr))
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw
          canvas.height = ph
        }

        gl.viewport(0, 0, pw, ph)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        const timeSec = (isReduced ? ts * 0.00018 : ts * 0.001) % 3600

        gl.useProgram(prog)
        gl.uniform2f(loc.uRes, pw, ph)
        gl.uniform1f(loc.uTime, timeSec)
        gl.uniform2f(loc.uCam, p.camX, p.camY)
        gl.uniform2f(loc.uCursor, p.curX, p.curY)
        gl.uniform1f(loc.uCursorWake, p.wake)
        gl.uniform1f(loc.uPull, p.smoothPull)
        gl.uniform1f(loc.uDive, diveU)
        gl.uniform1f(loc.uAperture, apertureU)
        gl.uniform1f(loc.uIntroFade, introFade)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
      } else if (fallbackBgRef.current) {
        // Non-WebGL graceful fallback dissolve
        fallbackBgRef.current.style.opacity = ((1 - apertureU) * introFade).toFixed(3)
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      if (glState) {
        const { gl, prog, vs, fs, buf } = glState
        gl.deleteBuffer(buf)
        gl.deleteProgram(prog)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
      }
    }
  }, [isReplay, onApertureOpen, onComplete])

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const minDim = Math.max(1, Math.min(rect.width, rect.height))
    pointerRef.current.targetCamX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    pointerRef.current.targetCamY = (0.5 - (e.clientY - rect.top) / rect.height) * 2
    pointerRef.current.targetCurX = (e.clientX - (rect.left + rect.width * 0.5)) / minDim
    pointerRef.current.targetCurY = (rect.top + rect.height * 0.5 - e.clientY) / minDim
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      className="fixed inset-0 z-50 bg-transparent flex flex-col items-center justify-between p-8 md:p-12 overflow-hidden select-none"
    >
      {/* Non-WebGL radial fallback (hidden automatically when WebGL context initializes) */}
      <div
        ref={fallbackBgRef}
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          opacity: 0,
          background:
            'radial-gradient(circle at 50% 50%, #020204 0%, #020204 14%, #0f273d 34%, #06101c 68%, #020204 100%)',
        }}
      />

      {/* Real-Time 60fps WebGL Abyssal Portal & True-Alpha Throat Aperture */}
      <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Top Masthead — gently drawn downward into the vortex when plunging */}
      <div
        className={`relative z-20 transition-all duration-700 ease-out ${
          plunging
            ? 'opacity-0 translate-y-4 scale-95 pointer-events-none'
            : uiEntered
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 -translate-y-2'
        }`}
      >
        <div className="font-pf-wordmark text-2xl md:text-3xl uppercase tracking-tight text-white/92 text-center drop-shadow-[0_2px_16px_rgba(2,2,4,0.9)]">
          {PORTFOLIO_DATA.name}
        </div>
      </div>

      {/* Central Frameless Abyssal Eye Threshold — sits cleanly inside the pitch-black vortex mouth */}
      <div
        className={`relative z-20 flex flex-col items-center transition-all duration-700 ${
          plunging
            ? 'opacity-0 scale-75 blur-[2px] pointer-events-none'
            : uiEntered
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
        }`}
      >
        <button
          type="button"
          onClick={triggerPlunge}
          onPointerEnter={() => setHoveringEye(true)}
          onPointerLeave={() => setHoveringEye(false)}
          onFocus={() => setHoveringEye(true)}
          onBlur={() => setHoveringEye(false)}
          aria-label="Enter the abyss"
          className="group relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center cursor-pointer focus-visible:outline-none"
        >
          {/* Delicate rotating orbital compass hairline around the event horizon */}
          <svg
            viewBox="0 0 180 180"
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full transition-transform duration-700 ${
              hoveringEye ? 'scale-[0.93] rotate-[-28deg]' : 'scale-100 rotate-0'
            }`}
          >
            <circle
              cx="90"
              cy="90"
              r="82"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeDasharray="34 18 8 18"
              className="text-sky-100/22 group-hover:text-sky-200/55 transition-colors duration-500"
            />
            <circle
              cx="90"
              cy="90"
              r="68"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeDasharray="2 10"
              className="text-white/15 group-hover:text-sky-200/40 transition-colors duration-500"
            />
          </svg>

          <span className="font-pf-label text-[13px] sm:text-[14px] uppercase tracking-[0.3em] pl-[0.3em] text-white/90 group-hover:text-white group-hover:tracking-[0.36em] group-hover:pl-[0.36em] transition-all duration-500 drop-shadow-[0_0_14px_rgba(2,2,4,1)]">
            ENTER
          </span>
          <span className="font-pf-label text-[9.5px] uppercase tracking-[0.24em] pl-[0.24em] text-sky-200/45 group-hover:text-sky-200/80 mt-1.5 transition-colors duration-500">
            THE ABYSS
          </span>
        </button>

        {/* Subtle descent prompt + live scroll-pull tension hairline positioned below the throat */}
        <div className="mt-8 flex flex-col items-center gap-2.5 pointer-events-none">
          <span className="font-pf-label text-[10.5px] uppercase tracking-[0.2em] text-white/38 drop-shadow-[0_1px_10px_rgba(2,2,4,0.95)]">
            CLICK, SCROLL, OR PRESS ENTER
          </span>
          <div className="w-24 h-px bg-white/10 overflow-hidden">
            <div
              ref={pullBarRef}
              className="h-full w-full origin-center bg-sky-200/75 transition-opacity duration-150"
              style={{ transform: 'scaleX(0)', opacity: 0 }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Whisper Telemetry + Instant Skip */}
      <div
        className={`relative z-20 w-full max-w-5xl flex items-center justify-between font-pf-label text-[11px] uppercase tracking-[0.16em] text-white/35 transition-all duration-500 ${
          plunging
            ? 'opacity-0 translate-y-2 pointer-events-none'
            : uiEntered
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-2'
        }`}
      >
        <div className="flex items-center gap-3">
          <span>@{PORTFOLIO_DATA.handle}</span>
          <span className="hidden sm:inline text-white/20">·</span>
          <span className="hidden sm:inline text-sky-200/35">00 // EVENT HORIZON</span>
        </div>

        <button
          type="button"
          onClick={handleQuickSkip}
          className="text-white/40 hover:text-white/85 transition-colors cursor-pointer"
        >
          SKIP →
        </button>
      </div>
    </div>
  )
}
