// Smooth continuous optical wavelength RGB lookup (u = 0.0 Crimson -> 1.0 Deep Violet)
export const SPECTRAL_STOPS = [
  [0.0, 255, 32, 68],   // Deep Crimson (680nm)
  [0.16, 255, 98, 16],  // Vermilion-Orange (620nm)
  [0.32, 255, 208, 12], // Solar Gold (580nm)
  [0.48, 16, 228, 118], // Emerald (530nm)
  [0.64, 0, 210, 255],  // Electric Cyan (490nm)
  [0.82, 46, 92, 255],  // Ultramarine (450nm)
  [1.0, 146, 52, 255],  // Ultraviolet (410nm)
]

export function spectralRGB(u) {
  const c = Math.max(0, Math.min(1, u))
  for (let i = 0; i < SPECTRAL_STOPS.length - 1; i++) {
    const a = SPECTRAL_STOPS[i]
    const b = SPECTRAL_STOPS[i + 1]
    if (c >= a[0] && c <= b[0]) {
      const f = (c - a[0]) / (b[0] - a[0])
      return [
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
      ]
    }
  }
  return [146, 52, 255]
}

export function setupHiDPICanvas(canvas) {
  if (!canvas) return null
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { w: rect.width, h: rect.height, ctx }
}

// Paint a silky, seamless multi-wavelength rainbow beam/fan using additive optical blending
export function drawRainbowFan(
  ctx,
  ox,
  oy,
  baseAngle,
  spreadAngle,
  length,
  startHalfW,
  intensity,
  slices,
  reverseOrder = false,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const stepSpan = spreadAngle / slices
  const coneHalf = Math.max(0.006, Math.abs(stepSpan) * 2.1)

  for (let i = 0; i < slices; i++) {
    const u = i / (slices - 1)
    const colU = reverseOrder ? 1 - u : u
    const [r, g, b] = spectralRGB(colU)

    const ang = baseAngle + (u - 0.5) * spreadAngle
    const a1 = ang - coneHalf
    const a2 = ang + coneHalf

    const perpX = -Math.sin(baseAngle) * (u - 0.5) * startHalfW * 2
    const perpY = Math.cos(baseAngle) * (u - 0.5) * startHalfW * 2
    const sx = ox + perpX
    const sy = oy + perpY

    const ex1 = sx + Math.cos(a1) * length
    const ey1 = sy + Math.sin(a1) * length
    const ex2 = sx + Math.cos(a2) * length
    const ey2 = sy + Math.sin(a2) * length
    const mx = sx + Math.cos(ang) * length
    const my = sy + Math.sin(ang) * length

    const grad = ctx.createLinearGradient(sx, sy, mx, my)
    grad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, ${(0.26 * intensity).toFixed(4)})`)
    grad.addColorStop(0.22, `rgba(${r}, ${g}, ${b}, ${(0.2 * intensity).toFixed(4)})`)
    grad.addColorStop(0.62, `rgba(${r}, ${g}, ${b}, ${(0.09 * intensity).toFixed(4)})`)
    grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0)`)

    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex1, ey1)
    ctx.lineTo(ex2, ey2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}
