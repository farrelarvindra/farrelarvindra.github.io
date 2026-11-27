// Shared 60fps mutable state bridging PelagicDiveBackdrop (WebGL), InterludeBreathe (Safety Lock, 3s Quote & Well),
// SpectrumHUD (Real-time Bathymetry), and App (Seamless Well-Shaft Emergence).

const WELL_IMG_ASPECT = 16 / 9
// Exact center of the circular pitch-black shaft opening in public/art/abyss-well.jpg (top-down v)
const WELL_IMG_UV = { u: 0.502, v: 0.515 }

export const abyssWellState = {
  // Fixed screen-space WebGL UV of the Stone Well opening (x: 0..1 left->right, y: 0..1 bottom->top)
  wellUv: { x: 0.502, y: 1 - 0.515 },
  texRect: { minU: 0, minV: 0, spanU: 1, spanV: 1 },

  cursorUv: { x: 0.28, y: 0.62 },
  smoothCursorUv: { x: 0.28, y: 0.62 },

  // Sea -> Abyss safety lock & fixed timed sequence state
  transitionLocked: false,
  sequenceStarted: false,
  sequenceDone: false,
  rearmAfterMs: 0,
  diveElapsedSec: 0,
  abyssTimeP: 0,       // 0.0 -> 1.0 time-driven darkening to -1000m pitch black
  spatialBlend: 0,     // 0.0 -> 1.0 smooth spatial blend across Sea <-> Abyss boundary
  autoDiveShift: 0,    // continuous upward bubble/snow offset during autonomous dive
  autoDiveSpeed: 0,
  currentMeters: 62,

  flashlightArmed: false,
  isAimedAtWell: false,

  // Smooth two-stage descent into the Stone Well shaft
  isHoldingDescent: false,
  spoolProgress: 0,
  glideCommitted: false,
  glideProgress: 0,
  wellEntered: false,
}

export function updateWellViewportMapping(vw, vh) {
  const screenAspect = Math.max(1, vw) / Math.max(1, vh)
  let spanU = 1
  let spanV = 1

  if (screenAspect > WELL_IMG_ASPECT) {
    spanU = 1
    spanV = WELL_IMG_ASPECT / screenAspect
  } else {
    spanV = 1
    spanU = screenAspect / WELL_IMG_ASPECT
  }

  const anchorU = Math.max(spanU * 0.5, Math.min(1 - spanU * 0.5, 0.502))
  const anchorV = Math.max(spanV * 0.5, Math.min(1 - spanV * 0.5, 0.52))
  const minU = anchorU - spanU * 0.5
  const minV = anchorV - spanV * 0.5

  abyssWellState.texRect.minU = minU
  abyssWellState.texRect.minV = minV
  abyssWellState.texRect.spanU = spanU
  abyssWellState.texRect.spanV = spanV

  const screenX = (WELL_IMG_UV.u - minU) / spanU
  const screenTopY = (WELL_IMG_UV.v - minV) / spanV
  abyssWellState.wellUv.x = screenX
  abyssWellState.wellUv.y = 1 - screenTopY
}

export function resetAbyssSequenceWithCooldown(cooldownMs = 900) {
  abyssWellState.transitionLocked = false
  abyssWellState.sequenceStarted = false
  abyssWellState.sequenceDone = false
  abyssWellState.rearmAfterMs = performance.now() + cooldownMs
  abyssWellState.diveElapsedSec = 0
  abyssWellState.abyssTimeP = 0
  abyssWellState.autoDiveSpeed = 0
  abyssWellState.flashlightArmed = false
  abyssWellState.isAimedAtWell = false
  abyssWellState.isHoldingDescent = false
  abyssWellState.spoolProgress = 0
  abyssWellState.glideCommitted = false
  abyssWellState.glideProgress = 0
}

export function resetAbyssWellForReplay() {
  abyssWellState.wellEntered = false
  abyssWellState.autoDiveShift = 0
  abyssWellState.currentMeters = 62
  resetAbyssSequenceWithCooldown(0)
}
