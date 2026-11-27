// Procedural Web Audio API synesthetic soundscape (zero external audio files).
// Opt-in via SpectrumHUD or Intro splash; responds dynamically to prism angle,
// wavelength selection, solar eclipse exposure, Taste vinyl sleeves, and lunar constellations.

const WAVELENGTH_FREQS = {
  '680nm': 293.66, // D4 (Warm Crimson)
  '580nm': 369.99, // F#4 (Solar Amber)
  '490nm': 440.0,  // A4 (Electric Cyan)
  '410nm': 659.25, // E5 (Ultraviolet)
}

const STAR_PENTATONIC = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51]

class OpticalSoundscape {
  constructor() {
    this.ctx = null
    this.enabled = false
    this.listeners = new Set()

    this.masterGain = null
    this.padFilter = null
    this.padGain = null
    this.shimmerGain = null
    this.shimmerFilter = null

    this.biasNorm = 0.28
    this.eclipseExposure = 0
    this.totalityActive = false
    this.heartbeatTimer = null
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  notify() {
    for (const fn of this.listeners) {
      fn(this.enabled)
    }
  }

  isEnabled() {
    return this.enabled
  }

  initGraph() {
    if (this.ctx) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    this.ctx = ctx

    const master = ctx.createGain()
    master.gain.value = 0.0001
    master.connect(ctx.destination)
    this.masterGain = master

    // 1. Warm Pink-Floyd-inspired harmonic pad (D2 + A2 + F#3 + E4 Dorian/Lydian suspension)
    const padGain = ctx.createGain()
    padGain.gain.value = 0.22
    const padFilter = ctx.createBiquadFilter()
    padFilter.type = 'lowpass'
    padFilter.frequency.value = 340
    padFilter.Q.value = 1.4

    padFilter.connect(padGain)
    padGain.connect(master)
    this.padFilter = padFilter
    this.padGain = padGain

    const voices = [
      { freq: 73.42, type: 'sine', gain: 0.42, detune: -3 },
      { freq: 110.0, type: 'triangle', gain: 0.24, detune: 4 },
      { freq: 185.0, type: 'sine', gain: 0.16, detune: -5 },
      { freq: 329.63, type: 'sine', gain: 0.09, detune: 6 },
    ]

    for (const v of voices) {
      const osc = ctx.createOscillator()
      const vg = ctx.createGain()
      osc.type = v.type
      osc.frequency.value = v.freq
      osc.detune.value = v.detune
      vg.gain.value = v.gain
      osc.connect(vg)
      vg.connect(padFilter)
      osc.start()
    }

    // Slow breathing LFO on pad filter
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.type = 'sine'
    lfo.frequency.value = 0.11
    lfoGain.gain.value = 48
    lfo.connect(lfoGain)
    lfoGain.connect(padFilter.frequency)
    lfo.start()

    // 2. Solar Eclipse coronal wind shimmer (bandpass-filtered procedural noise)
    const bufLen = ctx.sampleRate * 2
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1
      data[i] = (lastOut + 0.02 * white) / 1.02
      lastOut = data[i]
      data[i] *= 3.2
    }

    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = noiseBuf
    noiseSrc.loop = true

    const shimmerFilter = ctx.createBiquadFilter()
    shimmerFilter.type = 'bandpass'
    shimmerFilter.frequency.value = 520
    shimmerFilter.Q.value = 4.5

    const shimmerGain = ctx.createGain()
    shimmerGain.gain.value = 0.0

    noiseSrc.connect(shimmerFilter)
    shimmerFilter.connect(shimmerGain)
    shimmerGain.connect(master)
    noiseSrc.start()

    this.shimmerFilter = shimmerFilter
    this.shimmerGain = shimmerGain
  }

  async setEnabled(next) {
    if (next) {
      this.initGraph()
      if (!this.ctx) return false
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume()
        } catch {
          return false
        }
      }
      this.enabled = true
      const now = this.ctx.currentTime
      this.masterGain.gain.cancelScheduledValues(now)
      this.masterGain.gain.setTargetAtTime(0.32, now, 0.35)
      this.syncHeartbeatLoop()
    } else {
      this.enabled = false
      if (this.ctx && this.masterGain) {
        const now = this.ctx.currentTime
        this.masterGain.gain.cancelScheduledValues(now)
        this.masterGain.gain.setTargetAtTime(0.0001, now, 0.22)
      }
      this.syncHeartbeatLoop()
    }
    this.notify()
    return this.enabled
  }

  toggle() {
    return this.setEnabled(!this.enabled)
  }

  setPrismBias(deg) {
    this.biasNorm = Math.max(-1, Math.min(1, deg / 100))
    if (!this.enabled || !this.ctx || !this.padFilter) return
    // -100° Crimson = deep 210Hz warmth; +100° Violet = 640Hz crystalline harmonic clarity
    const u = (this.biasNorm + 1) * 0.5
    const targetHz = 210 + u * 430
    this.padFilter.frequency.setTargetAtTime(targetHz, this.ctx.currentTime, 0.16)
  }

  setEclipseExposure(amount) {
    const clamped = Math.max(0, Math.min(1, amount))
    this.eclipseExposure = clamped
    if (!this.enabled || !this.ctx || !this.shimmerGain || !this.shimmerFilter) return
    const now = this.ctx.currentTime
    this.shimmerGain.gain.setTargetAtTime(clamped * 0.16, now, 0.12)
    this.shimmerFilter.frequency.setTargetAtTime(380 + clamped * 760, now, 0.14)
  }

  setTotalityActive(active) {
    if (this.totalityActive === active) return
    this.totalityActive = active
    this.syncHeartbeatLoop()
  }

  syncHeartbeatLoop() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.enabled && this.totalityActive) {
      this.triggerHeartbeatPulse()
      this.heartbeatTimer = window.setInterval(() => {
        this.triggerHeartbeatPulse()
      }, 1040)
    }
  }

  triggerHeartbeatPulse() {
    if (!this.enabled || !this.ctx || !this.masterGain) return
    const now = this.ctx.currentTime
    this.scheduleThump(now, 58, 34, 0.24)
    this.scheduleThump(now + 0.23, 48, 29, 0.16)
  }

  scheduleThump(startTime, startHz, endHz, peakGain) {
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(startHz, startTime)
    osc.frequency.exponentialRampToValueAtTime(endHz, startTime + 0.16)

    g.gain.setValueAtTime(0.0001, startTime)
    g.gain.linearRampToValueAtTime(peakGain, startTime + 0.024)
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22)

    osc.connect(g)
    g.connect(this.masterGain)
    osc.start(startTime)
    osc.stop(startTime + 0.24)
  }

  playWavelengthTone(nm) {
    if (!this.enabled || !this.ctx || !this.masterGain) return
    const freq = WAVELENGTH_FREQS[nm] || 440
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const overtone = this.ctx.createOscillator()
    const g = this.ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)
    overtone.type = 'triangle'
    overtone.frequency.setValueAtTime(freq * 2, now)

    const otGain = this.ctx.createGain()
    otGain.gain.value = 0.18

    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.18, now + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.85)

    osc.connect(g)
    overtone.connect(otGain)
    otGain.connect(g)
    g.connect(this.masterGain)

    osc.start(now)
    overtone.start(now)
    osc.stop(now + 0.9)
    overtone.stop(now + 0.9)
  }

  playSleeveClick(isVinyl = false) {
    if (!this.enabled || !this.ctx || !this.masterGain) return
    const now = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = isVinyl ? 'triangle' : 'sine'
    osc.frequency.setValueAtTime(isVinyl ? 220 : 520, now)
    osc.frequency.exponentialRampToValueAtTime(isVinyl ? 88 : 260, now + 0.09)

    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.12, now + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)

    osc.connect(g)
    g.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 0.12)
  }

  playStarChime(normX = 0.5) {
    if (!this.enabled || !this.ctx || !this.masterGain) return
    const idx = Math.min(
      STAR_PENTATONIC.length - 1,
      Math.max(0, Math.floor(normX * STAR_PENTATONIC.length)),
    )
    const freq = STAR_PENTATONIC[idx]
    const now = this.ctx.currentTime

    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)

    g.gain.setValueAtTime(0.0001, now)
    g.gain.linearRampToValueAtTime(0.14, now + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.15)

    osc.connect(g)
    g.connect(this.masterGain)
    osc.start(now)
    osc.stop(now + 1.2)
  }

  playHyperspaceSurge() {
    if (!this.enabled || !this.ctx || !this.masterGain) return
    const now = this.ctx.currentTime
    const freqs = [146.83, 220.0, 293.66, 440.0]
    for (const f of freqs) {
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(f * 0.75, now)
      osc.frequency.exponentialRampToValueAtTime(f * 2.0, now + 1.25)

      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(240, now)
      lp.frequency.exponentialRampToValueAtTime(2400, now + 1.15)

      g.gain.setValueAtTime(0.0001, now)
      g.gain.linearRampToValueAtTime(0.055, now + 0.85)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.65)

      osc.connect(lp)
      lp.connect(g)
      g.connect(this.masterGain)
      osc.start(now)
      osc.stop(now + 1.7)
    }
  }
}

export const soundscape = new OpticalSoundscape()
