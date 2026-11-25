import { useCallback, useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { setupHiDPICanvas } from '../utils/optics'

// Exact dialed-in idle parameters from the user's draft settings
const IDLE_STAR_DENSITY = 255
const MAX_STAR_DENSITY = 1350
const IDLE_WARP_SPEED = 0.68
const IDLE_BLUE_GLOW = 0.6
const IDLE_COMET_SPEED = 2.2

const Z_FAR_STAR = 1.65
const Z_NEAR_STAR = 0.035

const Z_FAR_COMET = 8.5
const Z_NEAR_COMET = 0.16
const Z_COMET_RATIO = Z_FAR_COMET / Z_NEAR_COMET

// 4 pure optical wavelengths matching Act I's refracted prism spectrum
const COMET_TINTS = new Float32Array([
  1.0, 0.72, 0.08, // 580nm Solar Amber-Gold
  0.04, 0.78, 1.0, // 490nm Electric Cyan
  0.6, 0.24, 1.0,  // 410nm Ultraviolet
  1.0, 0.18, 0.34, // 680nm Crimson-Rose
])

const COMET_VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

const COMET_FRAG = `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uScale;
  uniform vec4 uC0[4];
  uniform vec4 uC1[4];
  uniform vec4 uC2[4];
  uniform vec3 uTint[4];

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm2(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 4; k++) {
      v += a * noise2(p);
      p = p * 2.03 + vec2(17.1, 31.7);
      a *= 0.5;
    }
    return v;
  }

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec2 fp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
    vec3 accum = vec3(0.0);

    for (int i = 0; i < 4; i++) {
      vec4 c0 = uC0[i];
      if (c0.w < 0.005) continue;
      vec4 c1 = uC1[i];
      vec4 c2 = uC2[i];

      float nr = max(c0.z * uScale, 1.35);
      vec2 p = (fp - c0.xy * uScale) / nr;
      vec2 dir = c1.xy;
      vec2 perp = vec2(-dir.y, dir.x);
      float t = -dot(p, dir);
      float s = dot(p, perp);
      float L = max(c1.z * uScale / nr, 5.0);
      float al = c0.w;
      float boost = c1.w;
      vec3 col = uTint[i];

      if (t < -8.0 || t > L + 3.0 || abs(s) > 7.5 + 0.14 * max(t, 0.0)) continue;

      float r = length(p);
      float tp = max(t, 0.0);
      float xT = clamp(t / L, 0.0, 1.0);
      float endFade = 1.0 - smoothstep(0.45, 1.0, xT);

      // Compact, focused inverse-square light core
      float coreWhite = 1.0 / (1.0 + r * r * 5.4);
      float innerBloom = exp(-r * 1.72) * 0.86;
      float outerAura = exp(-r * 0.68) * 0.15;

      vec3 headLight = vec3(1.0, 0.99, 0.97) * (coreWhite * 2.15)
                     + mix(col, vec3(1.0), 0.22) * innerBloom
                     + col * outerAura;

      // Subtle horizontal cinema anamorphic glint
      float anamX = exp(-abs(p.y) * 5.4) * exp(-abs(p.x) * 0.52) * 0.4;
      float anamCore = exp(-abs(p.y) * 10.0) * exp(-abs(p.x) * 0.95) * 0.62;
      float spikeV = exp(-abs(p.x) * 8.5) * exp(-abs(p.y) * 1.6) * 0.18;
      headLight += mix(col, vec3(1.0), 0.42) * anamX
                 + vec3(1.0, 0.99, 0.98) * (anamCore + spikeV);

      // Slender silky optical light trail
      float trailMask = smoothstep(-0.35, 0.85, t) * endFade;
      float env = exp(-tp / (0.44 * L));
      float wakeW = 0.36 + 0.03 * tp;
      float coreW = 0.12 + 0.006 * tp;

      float wakeProf = exp(-(s * s) / (wakeW * wakeW));
      float coreProf = exp(-(s * s) / (coreW * coreW));
      float wisps = 0.68 + 0.52 * fbm2(vec2(s * 1.9, tp * 0.2 - uTime * 1.5 + c2.x * 3.0));

      vec3 trailLight = col * (env * wakeProf * wisps * 0.72) * trailMask
                      + mix(col, vec3(1.0), 0.65) * (env * coreProf * (0.75 + 0.45 * wisps) * 0.88) * trailMask;

      accum += (headLight + trailLight) * al * boost;
    }

    vec3 mapped = pow(aces(accum * 0.95), vec3(1.0 / 2.2));
    mapped += (hash21(fp + uTime) - 0.5) / 255.0 * step(0.004, max(mapped.r, max(mapped.g, mapped.b)));
    mapped = clamp(mapped, 0.0, 1.0);
    float alpha = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    gl_FragColor = vec4(mapped, alpha);
  }
`

function initCometGL(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
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

  const vs = compile(gl.VERTEX_SHADER, COMET_VERT)
  const fs = compile(gl.FRAGMENT_SHADER, COMET_FRAG)
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
      uScale: gl.getUniformLocation(prog, 'uScale'),
      uC0: gl.getUniformLocation(prog, 'uC0'),
      uC1: gl.getUniformLocation(prog, 'uC1'),
      uC2: gl.getUniformLocation(prog, 'uC2'),
      uTint: gl.getUniformLocation(prog, 'uTint'),
    },
  }
}

function spawnStar(initialRandomZ) {
  const ang = Math.random() * Math.PI * 2
  const rad = 0.032 + Math.pow(Math.random(), 0.72) * 1.18
  return {
    x: Math.cos(ang) * rad,
    y: Math.sin(ang) * rad,
    z: initialRandomZ
      ? Z_NEAR_STAR + Math.random() * (Z_FAR_STAR - Z_NEAR_STAR)
      : Z_FAR_STAR * (0.78 + Math.random() * 0.34),
    thickness: 0.7 + Math.random() * 1.15,
    brightness: 0.55 + Math.random() * 0.45,
    coolness: 0.35 + Math.random() * 0.65,
  }
}

export default function IntroHyperspace({ onComplete }) {
  const starCanvasRef = useRef(null)
  const glCanvasRef = useRef(null)
  const flashOverlayRef = useRef(null)
  const rootRef = useRef(null)

  const [jumping, setJumping] = useState(false)
  const jumpStartRef = useRef(null)
  const completedRef = useRef(false)
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  const triggerJump = useCallback(() => {
    if (jumpStartRef.current !== null) return
    jumpStartRef.current = performance.now()
    setJumping(true)
  }, [])

  // Lock page scroll & allow Enter / Space key to jump while intro is active
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        triggerJump()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [triggerJump])

  // Main Star Wars Hyperspace + Jump-to-Lightspeed Blank Sequence Loop
  useEffect(() => {
    const starCanvas = starCanvasRef.current
    const glCanvas = glCanvasRef.current
    if (!starCanvas || !glCanvas) return undefined

    let sizeState = setupHiDPICanvas(starCanvas)
    const glState = initCometGL(glCanvas)

    // Pre-allocate full jump pool (1,350 stars) for zero-stutter density surge when ENTER is clicked
    const stars = Array.from({ length: MAX_STAR_DENSITY }, () => spawnStar(true))
    const projects = PORTFOLIO_DATA.featuredProjects

    const uC0 = new Float32Array(16)
    const uC1 = new Float32Array(16)
    const uC2 = new Float32Array(16)
    const uTint = new Float32Array(12)

    let cometClock = 0.18
    let lastTs = 0
    let rafId = 0

    const onResize = () => {
      sizeState = setupHiDPICanvas(starCanvas)
    }
    window.addEventListener('resize', onResize)

    // Timeline (seconds after ENTER click):
    // 0.00 -> 1.15s : Star density surges 255 -> 1350, warp surges 0.68 -> 6.2 (blazing Millennium Falcon tunnel!)
    // 0.85 -> 1.32s : Incandescent white-ice light-speed flash peaks to pure white
    // 1.32 -> 1.66s : Flash cuts/dissolves down to pure blank #020204 void
    // 1.66 -> 1.92s : Dramatic beat of pure blank darkness (exit hyperspace silence)
    // 1.92 -> 2.50s : Blank curtain smoothly fades away revealing Act I
    const render = (ts) => {
      const dt = Math.min(0.05, (ts - lastTs) * 0.001 || 0.016)
      lastTs = ts

      let jumpElapsed = 0
      let isJumping = false
      if (jumpStartRef.current !== null) {
        isJumping = true
        jumpElapsed = Math.max(0, (ts - jumpStartRef.current) * 0.001)
      }

      // Compute jump phases
      const surgeU = isJumping ? Math.min(1, jumpElapsed / 1.18) : 0
      const surgeEase = Math.pow(surgeU, 2.2)

      // Star density & velocity surge
      const activeStars = Math.round(
        IDLE_STAR_DENSITY + (MAX_STAR_DENSITY - IDLE_STAR_DENSITY) * Math.pow(surgeU, 1.55),
      )
      const warpSpeed = IDLE_WARP_SPEED + surgeEase * 5.6
      const blueGlow = IDLE_BLUE_GLOW + surgeU * (1.0 - IDLE_BLUE_GLOW)
      const cometSpeed = IDLE_COMET_SPEED + surgeEase * 8.5

      // Pure blank darkness after 1.36s (beams vanish cleanly behind peak white flash -> pure blank void!)
      const inBlankVoid = isJumping && jumpElapsed >= 1.36

      // White flash overlay curve (0.85s -> 1.30s rise to blinding white, 1.36s -> 1.68s drop to blank #020204)
      let whiteFlash = 0
      if (isJumping) {
        if (jumpElapsed >= 0.82 && jumpElapsed < 1.32) {
          whiteFlash = Math.pow((jumpElapsed - 0.82) / 0.5, 2.1)
        } else if (jumpElapsed >= 1.32 && jumpElapsed < 1.44) {
          whiteFlash = 1.0
        } else if (jumpElapsed >= 1.44 && jumpElapsed < 1.72) {
          whiteFlash = 1.0 - (jumpElapsed - 1.44) / 0.28
        }
      }

      if (flashOverlayRef.current) {
        flashOverlayRef.current.style.opacity = whiteFlash.toFixed(3)
      }

      // Final curtain dissolve from blank #020204 void into Act I (1.92s -> 2.52s)
      if (isJumping && jumpElapsed >= 1.92 && rootRef.current) {
        const dissolve = Math.min(1, (jumpElapsed - 1.92) / 0.6)
        rootRef.current.style.opacity = (1 - dissolve).toFixed(3)
        if (dissolve >= 1 && !completedRef.current) {
          completedRef.current = true
          if (onComplete) onComplete()
          return
        }
      }

      if (!sizeState) sizeState = setupHiDPICanvas(starCanvas)
      if (sizeState) {
        const { w, h, ctx } = sizeState

        // Center vanishing point locks tightly to dead-center during hyperspace jump
        const parallaxAmt = isJumping ? Math.max(0, 1 - surgeU * 2.5) : 1
        mouseRef.current.x += (mouseRef.current.tx * parallaxAmt - mouseRef.current.x) * 0.06
        mouseRef.current.y += (mouseRef.current.ty * parallaxAmt - mouseRef.current.y) * 0.06

        const cx = w * 0.5 - mouseRef.current.x * 22
        const cy = h * 0.5 - mouseRef.current.y * 16
        const fov = Math.min(w, h) * 0.72

        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = '#020204'
        ctx.fillRect(0, 0, w, h)

        if (!inBlankVoid) {
          // 1. TRUE 3D (1/z) STAR WARS HYPERSPACE STARLINES
          const zStep = (0.35 + warpSpeed * 1.45) * dt
          const trailZ = 0.065 + warpSpeed * 0.185

          ctx.save()
          ctx.globalCompositeOperation = 'lighter'

          for (let i = 0; i < activeStars; i++) {
            const s = stars[i]
            s.z -= zStep

            if (s.z <= Z_NEAR_STAR) {
              const fresh = spawnStar(false)
              s.x = fresh.x
              s.y = fresh.y
              s.z = fresh.z
              s.thickness = fresh.thickness
              s.brightness = fresh.brightness
              s.coolness = fresh.coolness
              continue
            }

            const headX = cx + (s.x / s.z) * fov
            const headY = cy + (s.y / s.z) * fov
            const zTail = s.z + trailZ
            const tailX = cx + (s.x / zTail) * fov
            const tailY = cy + (s.y / zTail) * fov

            if (
              (headX < -90 || headX > w + 90 || headY < -90 || headY > h + 90) &&
              (tailX < -90 || tailX > w + 90 || tailY < -90 || tailY > h + 90)
            ) {
              continue
            }

            const depthNorm = 1 - (s.z - Z_NEAR_STAR) / (Z_FAR_STAR - Z_NEAR_STAR)
            const alpha =
              Math.pow(Math.max(0, Math.min(1, depthNorm)), 0.85) *
              s.brightness *
              (1 + surgeEase * 0.55)
            const headWidth = s.thickness * (0.35 + depthNorm * 1.65) * (1 + surgeEase * 0.9)

            // Icy periwinkle-blue Star Wars halation
            const haloGrad = ctx.createLinearGradient(tailX, tailY, headX, headY)
            const blueR = Math.round(140 + (1 - s.coolness) * 70)
            const blueG = Math.round(182 + (1 - s.coolness) * 55)
            haloGrad.addColorStop(0.0, `rgba(${blueR}, ${blueG}, 255, 0)`)
            haloGrad.addColorStop(
              0.55,
              `rgba(${blueR}, ${blueG}, 255, ${Math.min(0.65, alpha * 0.24 * blueGlow).toFixed(3)})`,
            )
            haloGrad.addColorStop(
              1.0,
              `rgba(195, 222, 255, ${Math.min(0.85, alpha * 0.42 * blueGlow).toFixed(3)})`,
            )
            ctx.strokeStyle = haloGrad
            ctx.lineWidth = headWidth * 3.2
            ctx.lineCap = 'round'
            ctx.beginPath()
            ctx.moveTo(tailX, tailY)
            ctx.lineTo(headX, headY)
            ctx.stroke()

            // Crisp tapered pure-white needle core
            const dx = headX - tailX
            const dy = headY - tailY
            const segLen = Math.hypot(dx, dy)

            if (segLen < 1.2) {
              ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha * 0.9).toFixed(3)})`
              ctx.beginPath()
              ctx.arc(headX, headY, Math.max(0.6, headWidth * 0.65), 0, Math.PI * 2)
              ctx.fill()
            } else {
              const nx = (-dy / segLen) * (headWidth * 0.55)
              const ny = (dx / segLen) * (headWidth * 0.55)
              const coreGrad = ctx.createLinearGradient(tailX, tailY, headX, headY)
              coreGrad.addColorStop(0.0, 'rgba(220, 235, 255, 0)')
              coreGrad.addColorStop(0.35, `rgba(240, 246, 255, ${Math.min(1, alpha * 0.55).toFixed(3)})`)
              coreGrad.addColorStop(1.0, `rgba(255, 255, 255, ${Math.min(1, alpha * 1.05).toFixed(3)})`)
              ctx.fillStyle = coreGrad
              ctx.beginPath()
              ctx.moveTo(tailX, tailY)
              ctx.lineTo(headX + nx, headY + ny)
              ctx.lineTo(headX - nx, headY - ny)
              ctx.closePath()
              ctx.fill()
            }
          }
          ctx.restore()

          // 2. FOUR COMPACT COLORED OPTICAL LIGHT-COMETS
          cometClock = (cometClock + dt * 0.22 * cometSpeed) % 1
          const maxR = Math.hypot(w, h) * 0.66
          const ordered = projects
            .map((frag, idx) => ({
              frag,
              idx,
              z: (frag.zOffset + cometClock) % 1,
            }))
            .sort((a, b) => a.z - b.z)

          uC0.fill(0)
          let nGL = 0

          for (const { frag, idx, z } of ordered) {
            if (z < 0.015 || z > 0.985) continue
            const rho = 0.48 + (idx % 2) * 0.07
            const zd = Z_NEAR_COMET * Math.pow(Z_COMET_RATIO, 1 - z)
            const rHead = (fov * rho) / zd
            const dirX = Math.cos(frag.angle)
            const dirY = Math.sin(frag.angle)
            const hx = cx + dirX * rHead
            const hy = cy + dirY * rHead
            const coreR = (fov * 0.022) / zd

            const fadeIn = Math.min(1, z / 0.14)
            const fadeOut = 1 - Math.min(1, Math.max(0, (rHead - maxR * 0.88) / (maxR * 0.34)))
            const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut))
            if (alpha < 0.01) continue

            const tailLen = Math.min(rHead * 0.92, coreR * 26 + 16 + cometSpeed * 18)

            if (nGL < 4) {
              const o = nGL * 4
              uC0[o] = hx
              uC0[o + 1] = hy
              uC0[o + 2] = coreR
              uC0[o + 3] = alpha
              uC1[o] = dirX
              uC1[o + 1] = dirY
              uC1[o + 2] = tailLen
              uC1[o + 3] = 1.0 + surgeEase * 0.8
              uC2[o] = idx * 1.37 + 0.6
              uC2[o + 1] = 0
              uC2[o + 2] = 0
              uC2[o + 3] = 0
              const tb = (idx % 4) * 3
              uTint[nGL * 3] = COMET_TINTS[tb]
              uTint[nGL * 3 + 1] = COMET_TINTS[tb + 1]
              uTint[nGL * 3 + 2] = COMET_TINTS[tb + 2]
              nGL++
            }
          }
        } else {
          // Pure blank void after peak flash
          uC0.fill(0)
        }

        // Render WebGL colored optical comets (clears to transparent during blank void)
        if (glState) {
          const { gl, prog, loc } = glState
          const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
          const rect = glCanvas.getBoundingClientRect()
          const pw = Math.max(1, Math.round(rect.width * dpr))
          const ph = Math.max(1, Math.round(rect.height * dpr))
          if (glCanvas.width !== pw || glCanvas.height !== ph) {
            glCanvas.width = pw
            glCanvas.height = ph
          }
          gl.viewport(0, 0, pw, ph)
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          if (!inBlankVoid) {
            gl.useProgram(prog)
            gl.uniform2f(loc.uRes, pw, ph)
            gl.uniform1f(loc.uTime, ts * 0.001)
            gl.uniform1f(loc.uScale, dpr)
            gl.uniform4fv(loc.uC0, uC0)
            gl.uniform4fv(loc.uC1, uC1)
            gl.uniform4fv(loc.uC2, uC2)
            gl.uniform3fv(loc.uTint, uTint)
            gl.drawArrays(gl.TRIANGLES, 0, 6)
          }
        }
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      if (glState) {
        const { gl, prog, vs, fs, buf } = glState
        gl.deleteBuffer(buf)
        gl.deleteProgram(prog)
        gl.deleteShader(vs)
        gl.deleteShader(fs)
      }
    }
  }, [onComplete])

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouseRef.current.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    mouseRef.current.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2
  }

  return (
    <div
      ref={rootRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-[#020204] flex flex-col items-center justify-between p-8 md:p-12 overflow-hidden select-none"
    >
      {/* Layer 1: Star Wars 3D Hyperspace Starlines */}
      <canvas ref={starCanvasRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Layer 2: WebGL Colored Optical Light-Comets */}
      <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none" />

      {/* Layer 3: Blinding Star Wars Lightspeed Flash Curtain */}
      <div
        ref={flashOverlayRef}
        aria-hidden="true"
        className="absolute inset-0 z-30 pointer-events-none"
        style={{
          opacity: 0,
          background:
            'radial-gradient(circle at 50% 50%, #ffffff 0%, #f2f7ff 55%, #dceaff 100%)',
        }}
      />

      {/* Top Masthead (pinkfloyd.com splash rhythm) */}
      <div
        className={`relative z-20 transition-all duration-500 ${
          jumping ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="font-pf-wordmark text-2xl md:text-3xl uppercase tracking-tight text-white/95 text-center">
          {PORTFOLIO_DATA.name}
        </div>
      </div>

      {/* Centered pinkfloyd.com-style ENTER Button */}
      <div
        className={`relative z-20 flex flex-col items-center gap-5 transition-all duration-500 ${
          jumping ? 'opacity-0 scale-110 pointer-events-none' : 'opacity-100 scale-100'
        }`}
      >
        <button
          type="button"
          onClick={triggerJump}
          className="group relative px-10 py-3.5 rounded-full border border-white/45 hover:border-white bg-[#020204]/50 hover:bg-white/[0.08] backdrop-blur-sm transition-all duration-300 cursor-pointer"
        >
          <span className="font-pf-label text-[13px] md:text-[14px] uppercase tracking-[0.22em] text-white/95 group-hover:text-white">
            ENTER
          </span>
        </button>

        <span className="font-pf-label text-[11px] uppercase tracking-[0.18em] text-white/40">
          OPTICAL PORTFOLIO · PRESS ENTER
        </span>
      </div>

      {/* Bottom Whisper Metadata + Optional Quick Skip */}
      <div
        className={`relative z-20 w-full max-w-5xl flex items-center justify-between font-pf-label text-[11px] uppercase tracking-[0.16em] text-white/30 transition-opacity duration-500 ${
          jumping ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <span>@{PORTFOLIO_DATA.handle}</span>
        <button
          type="button"
          onClick={() => {
            if (!completedRef.current) {
              completedRef.current = true
              if (onComplete) onComplete()
            }
          }}
          className="text-white/35 hover:text-white/80 transition-colors cursor-pointer"
        >
          SKIP →
        </button>
      </div>
    </div>
  )
}
