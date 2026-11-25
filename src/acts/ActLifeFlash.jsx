import { useEffect, useRef, useState } from 'react'
import RepoArchiveDrawer from '../components/RepoArchiveDrawer'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { setupHiDPICanvas, spectralRGB } from '../utils/optics'

// Exact dialed-in Act II optical parameters
const STAR_DENSITY = 255
const WARP_SPEED = 0.68
const ICE_BLUE_GLOW = 0.6
const COMET_SPEED = 2.2

const Z_FAR_STAR = 1.65
const Z_NEAR_STAR = 0.04

const Z_FAR_COMET = 8.5
const Z_NEAR_COMET = 0.16
const Z_COMET_RATIO = Z_FAR_COMET / Z_NEAR_COMET
const FOCUS_PHASE = 0.56

// 4 pure optical wavelengths matching Act I's refracted prism spectrum
const COMET_TINTS = new Float32Array([
  1.0, 0.72, 0.08,  // 01: 580nm Solar Amber-Gold
  0.04, 0.78, 1.0,  // 02: 490nm Electric Cyan
  0.6, 0.24, 1.0,   // 03: 410nm Ultraviolet
  1.0, 0.18, 0.34,  // 04: 680nm Crimson-Rose
])

const COMET_VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Photorealistic colored optical light-comet shader (compact tight glow, white-hot core, sleek anamorphic glint, silky trail)
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

      // 1. Tight, compact inverse-square white-hot core + focused spectral aura
      float coreWhite = 1.0 / (1.0 + r * r * 5.4);
      float innerBloom = exp(-r * 1.72) * 0.86;
      float outerAura = exp(-r * 0.68) * 0.15;

      vec3 headLight = vec3(1.0, 0.99, 0.97) * (coreWhite * 2.15)
                     + mix(col, vec3(1.0), 0.22) * innerBloom
                     + col * outerAura;

      // 2. Sleek, compact horizontal anamorphic lens glint
      float anamX = exp(-abs(p.y) * 5.4) * exp(-abs(p.x) * 0.52) * 0.4;
      float anamCore = exp(-abs(p.y) * 10.0) * exp(-abs(p.x) * 0.95) * 0.62;
      float spikeV = exp(-abs(p.x) * 8.5) * exp(-abs(p.y) * 1.6) * 0.18;
      headLight += mix(col, vec3(1.0), 0.42) * anamX
                 + vec3(1.0, 0.99, 0.98) * (anamCore + spikeV);

      // 3. Slender, silky tapered optical light trail
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
  const rad = 0.045 + Math.pow(Math.random(), 0.72) * 1.15
  return {
    x: Math.cos(ang) * rad,
    y: Math.sin(ang) * rad,
    z: initialRandomZ
      ? Z_NEAR_STAR + Math.random() * (Z_FAR_STAR - Z_NEAR_STAR)
      : Z_FAR_STAR * (0.82 + Math.random() * 0.28),
    thickness: 0.7 + Math.random() * 1.15,
    brightness: 0.55 + Math.random() * 0.45,
    coolness: 0.35 + Math.random() * 0.65,
  }
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy || 1e-6
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export default function ActLifeFlash() {
  const sectionRef = useRef(null)
  const starCanvasRef = useRef(null)
  const glCanvasRef = useRef(null)

  const [activeIdx, setActiveIdx] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [repos, setRepos] = useState(PORTFOLIO_DATA.placeholderRepos)
  const [repoStatus, setRepoStatus] = useState('loading')
  const [revealProgress, setRevealProgress] = useState(0)

  const activeIdxRef = useRef(0)
  const hoveredIdxRef = useRef(-1)
  const cometClockRef = useRef(0.18)
  const snapTargetRef = useRef(null)
  const holdTimerRef = useRef(0)
  const hitBoxesRef = useRef([])
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  const projects = PORTFOLIO_DATA.featuredProjects
  const activeProject = projects[activeIdx]
  const [actR, actG, actB] = spectralRGB(activeProject.uColor)

  // Fetch all public repositories from github.com/farrelarvindra (with placeholder fallback)
  useEffect(() => {
    const controller = new AbortController()
    const url = `https://api.github.com/users/${PORTFOLIO_DATA.githubUsername}/repos?sort=updated&per_page=100`

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('GitHub API request failed')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setRepos(data)
          setRepoStatus('live')
        } else {
          setRepos(PORTFOLIO_DATA.placeholderRepos)
          setRepoStatus('fallback')
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setRepos(PORTFOLIO_DATA.placeholderRepos)
        setRepoStatus('fallback')
      })

    return () => controller.abort()
  }, [])

  // Smooth scroll-reveal choreography matching Act I & Breathe
  useEffect(() => {
    const onScroll = () => {
      const el = sectionRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      const progress = (vh * 0.5 - (rect.top + rect.height * 0.5)) / vh
      const visibility = 1 - Math.min(1, Math.abs(progress) * 1.15)
      setRevealProgress(Math.max(0, visibility))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Main dual-layer animation loop: 2D Star Wars Hyperspace + WebGL Colored Light-Comets
  useEffect(() => {
    const starCanvas = starCanvasRef.current
    const glCanvas = glCanvasRef.current
    if (!starCanvas || !glCanvas) return undefined

    let sizeState = setupHiDPICanvas(starCanvas)
    const glState = initCometGL(glCanvas)
    const stars = Array.from({ length: STAR_DENSITY }, () => spawnStar(true))

    const uC0 = new Float32Array(16)
    const uC1 = new Float32Array(16)
    const uC2 = new Float32Array(16)
    const uTint = new Float32Array(12)

    let lastTs = 0
    let rafId = 0

    const onResize = () => {
      sizeState = setupHiDPICanvas(starCanvas)
    }
    window.addEventListener('resize', onResize)

    const render = (ts) => {
      const dt = Math.min(0.05, (ts - lastTs) * 0.001 || 0.016)
      lastTs = ts

      if (!sizeState) sizeState = setupHiDPICanvas(starCanvas)
      if (sizeState) {
        const { w, h, ctx } = sizeState

        mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.06
        mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.06

        const cx = w * 0.5 - mouseRef.current.x * 22
        const cy = h * 0.48 - mouseRef.current.y * 16
        const fov = Math.min(w, h) * 0.72

        // Transparent clear so the shared CosmicBackdrop starfield shines seamlessly behind Act II
        ctx.globalCompositeOperation = 'source-over'
        ctx.clearRect(0, 0, w, h)

        // 1. TRUE 3D (1/z) STAR WARS HYPERSPACE STARLINES (Density 255, Warp 68%, Ice-Blue Glow 60%)
        const zStep = (0.35 + WARP_SPEED * 1.45) * dt
        const trailZ = 0.065 + WARP_SPEED * 0.185

        ctx.save()
        ctx.globalCompositeOperation = 'lighter'

        for (let i = 0; i < STAR_DENSITY; i++) {
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
            (headX < -80 || headX > w + 80 || headY < -80 || headY > h + 80) &&
            (tailX < -80 || tailX > w + 80 || tailY < -80 || tailY > h + 80)
          ) {
            continue
          }

          const depthNorm = 1 - (s.z - Z_NEAR_STAR) / (Z_FAR_STAR - Z_NEAR_STAR)
          const alpha = Math.pow(Math.max(0, Math.min(1, depthNorm)), 0.85) * s.brightness
          const headWidth = s.thickness * (0.35 + depthNorm * 1.65)

          // Classic Star Wars icy blue-white halation
          const haloGrad = ctx.createLinearGradient(tailX, tailY, headX, headY)
          const blueR = Math.round(140 + (1 - s.coolness) * 70)
          const blueG = Math.round(182 + (1 - s.coolness) * 55)
          haloGrad.addColorStop(0.0, `rgba(${blueR}, ${blueG}, 255, 0)`)
          haloGrad.addColorStop(
            0.55,
            `rgba(${blueR}, ${blueG}, 255, ${(alpha * 0.24 * ICE_BLUE_GLOW).toFixed(3)})`,
          )
          haloGrad.addColorStop(
            1.0,
            `rgba(195, 222, 255, ${(alpha * 0.42 * ICE_BLUE_GLOW).toFixed(3)})`,
          )
          ctx.strokeStyle = haloGrad
          ctx.lineWidth = headWidth * 3.2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(tailX, tailY)
          ctx.lineTo(headX, headY)
          ctx.stroke()

          // Tapered pure-white needle core
          const dx = headX - tailX
          const dy = headY - tailY
          const segLen = Math.hypot(dx, dy)

          if (segLen < 1.2) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.9).toFixed(3)})`
            ctx.beginPath()
            ctx.arc(headX, headY, Math.max(0.6, headWidth * 0.65), 0, Math.PI * 2)
            ctx.fill()
          } else {
            const nx = (-dy / segLen) * (headWidth * 0.55)
            const ny = (dx / segLen) * (headWidth * 0.55)
            const coreGrad = ctx.createLinearGradient(tailX, tailY, headX, headY)
            coreGrad.addColorStop(0.0, 'rgba(220, 235, 255, 0)')
            coreGrad.addColorStop(0.35, `rgba(240, 246, 255, ${(alpha * 0.55).toFixed(3)})`)
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

        // 2. COLORED OPTICAL LIGHT-COMETS EMERGING FROM FAR AWAY (Comet Speed 220%)
        if (snapTargetRef.current !== null) {
          let diff = snapTargetRef.current - cometClockRef.current
          if (diff > 0.5) diff -= 1
          if (diff < -0.5) diff += 1
          cometClockRef.current = (cometClockRef.current + diff * Math.min(1, dt * 6.5) + 1) % 1
          if (Math.abs(diff) < 0.004) {
            snapTargetRef.current = null
            holdTimerRef.current = 1.6
          }
        } else {
          holdTimerRef.current = Math.max(0, holdTimerRef.current - dt)
          const brake = hoveredIdxRef.current >= 0 ? 0.06 : holdTimerRef.current > 0 ? 0.05 : 1.0
          cometClockRef.current = (cometClockRef.current + dt * 0.22 * COMET_SPEED * brake) % 1
        }

        const maxR = Math.hypot(w, h) * 0.64
        const ordered = projects
          .map((frag, idx) => ({
            frag,
            idx,
            z: (frag.zOffset + cometClockRef.current) % 1,
          }))
          .sort((a, b) => a.z - b.z)

        uC0.fill(0)
        const nextHitBoxes = []
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

          // Tighter, smaller optical core radius
          const coreR = (fov * 0.022) / zd

          const fadeIn = Math.min(1, z / 0.14)
          const fadeOut = 1 - Math.min(1, Math.max(0, (rHead - maxR * 0.88) / (maxR * 0.34)))
          const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut))
          if (alpha < 0.01) continue

          const isSel = idx === activeIdxRef.current
          const isHot = idx === hoveredIdxRef.current
          const boost = isHot ? 1.45 : isSel ? 1.18 : 1.0
          const tailLen = Math.min(rHead * 0.9, coreR * 26 + 16 + COMET_SPEED * 14)

          if (nGL < 4) {
            const o = nGL * 4
            uC0[o] = hx
            uC0[o + 1] = hy
            uC0[o + 2] = coreR
            uC0[o + 3] = alpha
            uC1[o] = dirX
            uC1[o + 1] = dirY
            uC1[o + 2] = tailLen
            uC1[o + 3] = boost
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

          // Crisp minimal uppercase label once approaching mid-distance
          if (z > 0.25 && rHead < maxR * 0.94) {
            const uiFade = Math.min(1, (z - 0.25) / 0.14) * alpha
            ctx.save()
            ctx.globalAlpha = uiFade
            ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace'
            ctx.fillStyle = isSel || isHot ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
            ctx.textAlign = 'center'
            ctx.fillText(
              `${frag.num} · ${frag.id.toUpperCase()}`,
              hx,
              hy + Math.max(20, coreR * 3.0 + 12),
            )
            ctx.restore()
          }

          // Large forgiving hover capsule around the light & inner trail
          if (z > 0.22 && alpha > 0.2) {
            nextHitBoxes.push({
              idx,
              hx,
              hy,
              tx: hx - dirX * tailLen * 0.45,
              ty: hy - dirY * tailLen * 0.45,
              r: Math.max(82, coreR * 5.5),
            })
          }
        }

        hitBoxesRef.current = nextHitBoxes

        // Draw WebGL colored optical light-comets
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

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
    }
  }, [projects])

  const hitTestComets = (mx, my) => {
    let best = -1
    let bestD = Infinity
    for (const hb of hitBoxesRef.current) {
      const d = distToSeg(mx, my, hb.hx, hb.hy, hb.tx, hb.ty)
      if (d <= hb.r && d < bestD) {
        bestD = d
        best = hb.idx
      }
    }
    return best
  }

  const focusWork = (idx) => {
    activeIdxRef.current = idx
    setActiveIdx(idx)
    snapTargetRef.current = (FOCUS_PHASE - projects[idx].zOffset + 1) % 1
  }

  const handleCanvasMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    mouseRef.current.tx = (mx / rect.width - 0.5) * 2
    mouseRef.current.ty = (my / rect.height - 0.5) * 2
    const hit = hitTestComets(mx, my)
    hoveredIdxRef.current = hit
    e.currentTarget.style.cursor = hit >= 0 ? 'pointer' : 'crosshair'
  }

  const handleCanvasLeave = () => {
    mouseRef.current.tx = 0
    mouseRef.current.ty = 0
    hoveredIdxRef.current = -1
  }

  const handleCanvasClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = hitTestComets(e.clientX - rect.left, e.clientY - rect.top)
    if (hit >= 0) focusWork(hit)
  }

  const maskStyle = {
    maskImage: 'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
    WebkitMaskImage:
      'linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)',
  }

  return (
    <>
      <section
        ref={sectionRef}
        id="works"
        aria-label="Act II — Selected Works"
        className="relative min-h-[100svh] w-full flex flex-col justify-between p-6 md:p-11 pt-24 pb-14 md:pt-28 md:pb-16 overflow-hidden"
      >
        {/* Top optical thread continuing seamlessly from Breathe interlude */}
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-14 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(0, 210, 255, 0.35) 0%, rgba(255, 180, 70, 0.14) 65%, transparent 100%)',
          }}
        />

        {/* Layer 1: 2D True-3D Star Wars Hyperspace Starlines */}
        <canvas
          ref={starCanvasRef}
          onMouseMove={handleCanvasMove}
          onMouseLeave={handleCanvasLeave}
          onClick={handleCanvasClick}
          className="absolute inset-0 w-full h-full z-0"
          style={maskStyle}
        />

        {/* Layer 2: WebGL Colored Optical Light-Comets */}
        <canvas
          ref={glCanvasRef}
          className="absolute inset-0 w-full h-full z-10 pointer-events-none"
          style={maskStyle}
        />

        {/* Top Frameless Header & Work Index */}
        <div
          className="relative z-20 flex flex-wrap items-start justify-between gap-6 pointer-events-none transition-transform duration-150"
          style={{
            opacity: 0.25 + revealProgress * 0.75,
            transform: `translateY(${((1 - revealProgress) * 14).toFixed(1)}px)`,
          }}
        >
          <div className="max-w-sm space-y-1.5">
            <div className="font-pf-label text-[11px] uppercase text-white/40">
              02 // {PORTFOLIO_DATA.actTwo.eyebrow}
            </div>
            <h2 className="font-pf-main font-normal text-3xl sm:text-4xl uppercase leading-[1.08] text-white/95">
              {PORTFOLIO_DATA.actTwo.heading}
            </h2>
            <p className="font-pf-label text-[11px] uppercase text-white/35 pt-0.5">
              Hover around a light to slow · Click to focus
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 pointer-events-auto">
            <div className="flex items-center gap-4">
              {projects.map((p, idx) => {
                const isActive = idx === activeIdx
                const [r, g, b] = spectralRGB(p.uColor)
                const c = `rgb(${r}, ${g}, ${b})`
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => focusWork(idx)}
                    className={`font-pf-label text-[12px] uppercase py-1 transition-colors cursor-pointer relative ${
                      isActive ? 'text-white' : 'text-white/35 hover:text-white/80'
                    }`}
                  >
                    {p.num}
                    {isActive && (
                      <span
                        className="absolute left-0 right-0 -bottom-0.5 h-px"
                        style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}` }}
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="font-pf-label text-[12px] uppercase text-white/85 hover:text-amber-300 transition-colors cursor-pointer border-l border-white/10 pl-5"
            >
              ALL REPOSITORIES ({repos.length}) →
            </button>
          </div>
        </div>

        {/* Bottom Frameless Active Project Dossier */}
        <div
          className="relative z-20 mt-auto pt-64 flex flex-wrap items-end justify-between gap-8 pointer-events-none transition-transform duration-150"
          style={{
            opacity: 0.25 + revealProgress * 0.75,
            transform: `translateY(${((1 - revealProgress) * 14).toFixed(1)}px)`,
          }}
        >
          <div className="max-w-md w-full pointer-events-auto border-t border-white/[0.12] pt-4 space-y-2.5">
            <div className="flex items-center justify-between gap-4">
              <span
                className="font-pf-label text-[11px] uppercase flex items-center gap-2"
                style={{ color: `rgb(${actR}, ${actG}, ${actB})` }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: `rgb(${actR}, ${actG}, ${actB})`,
                    boxShadow: `0 0 8px rgb(${actR}, ${actG}, ${actB})`,
                  }}
                />
                {activeProject.wave}
              </span>
              <span className="font-pf-label text-[11px] uppercase text-white/35 tabular-nums">
                {activeProject.num} / 0{projects.length} · {activeProject.year}
              </span>
            </div>

            <h3 className="font-pf-main font-medium text-xl sm:text-2xl uppercase text-white/95 leading-[1.16]">
              {activeProject.title}
            </h3>

            <p className="font-pf-main text-[13.5px] text-white/50 leading-[1.45]">
              {activeProject.description}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-3 font-pf-label text-[11px] uppercase text-white/40">
                {activeProject.tags.map((tag, i) => (
                  <span key={tag} className="flex items-center gap-3">
                    {i > 0 && <span className="text-white/15">·</span>}
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-5 font-pf-label text-[12px] uppercase">
                {activeProject.liveUrl && (
                  <a
                    href={activeProject.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300/85 hover:text-white transition-colors"
                  >
                    LIVE →
                  </a>
                )}
                <a
                  href={activeProject.repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/85 hover:text-amber-300 transition-colors"
                >
                  SOURCE →
                </a>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-col items-start sm:items-end gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="font-pf-label text-[12px] uppercase text-white/75 hover:text-white transition-colors cursor-pointer pb-1 border-b border-white/25 hover:border-amber-300"
            >
              BROWSE FULL REPOSITORY INDEX ({repos.length}) →
            </button>
            <span className="font-pf-label text-[10px] uppercase text-white/30">
              {repoStatus === 'live'
                ? `SYNCED LIVE · GITHUB.COM/${PORTFOLIO_DATA.githubUsername.toUpperCase()}`
                : 'USING PLACEHOLDER ARCHIVE DATA'}
            </span>
          </div>
        </div>

        {/* Bottom optical thread leading seamlessly into Act III */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-14 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, rgba(146, 52, 255, 0.25) 60%, rgba(255, 255, 255, 0.22) 100%)',
          }}
        />
      </section>

      <RepoArchiveDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        repos={repos}
        status={repoStatus}
      />
    </>
  )
}
