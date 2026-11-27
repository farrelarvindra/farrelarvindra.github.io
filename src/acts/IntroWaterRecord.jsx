import { useCallback, useEffect, useRef, useState } from 'react'
import { PORTFOLIO_DATA } from '../data/portfolio'
import { setupHiDPICanvas } from '../utils/optics'

// Warm brownish sunset room + dark walnut turntable + exact #0096FF (rgb(0, 150, 255)) water palette
const PALETTE = {
  // Sunset house room & furniture
  floorBrownA: '#be8856',
  floorBrownB: '#b07a49',
  wallWood: '#7d4d2d',
  windowSill: '#f5d6a3',
  sunsetTop: '#e65a28',
  sunsetBot: '#f8be42',
  rugOuter: '#b8522a',
  rugStripe: '#edd09d',
  rugInner: '#4e2c1a',
  plantPot: '#c95326',
  plantSoil: '#29150c',
  leafDark: '#4d5621',
  leafLight: '#6f782e',

  // Honey-caramel wooden table & tabletop props
  tableRim: '#b8824c',
  tableTop: '#d9ab76',
  tableGrain: '#a97440',
  coaster: '#c87d32',
  coffeeDark: '#2e160b',

  // Deep roasted walnut-brown record player
  woodFrame: '#4d2711',
  woodDeck: '#733d1d',
  woodGrain: '#3d1e0c',
  mustardSun: '#f6c846',
  chartreuse: '#e4b84a',
  vermilion: '#e86630',
  wellRed: '#d9381e',
  platterSlate: '#161312',
  paperWarm: '#f7e5c4',

  // Exact uploaded blue swatch: RGB(0, 150, 255) = #0096FF
  waterCore: '#0096ff',
  waterDeep: '#006ed4',
  waterLight: '#3db6ff',
  waterSheen: '#9cdcff',
  foamWhite: '#f4fbff',

  inkBlack: '#1a0f09',
  shadowDark: '#0b0604',
}

const FLUID_VERT = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Realistic #0096FF Water Burst & Gravity Drop WebGL Shader:
// - Phase 0 (Burst): Crown-splash Rayleigh-Taylor fingers, metaball ligaments & flying droplets,
//   concentric pressure waves, 3D surface normals, Fresnel specular glints, caustics & aerated whitewater.
// - Phase 1 (Drop): Gravity-accelerated sloshing free surface, frothy meniscus crest, leaping splash beads,
//   rising internal air bubbles, and realistic lens teardrops clinging & sliding down the screen.
const FLUID_FRAG = `
  precision highp float;

  uniform vec2 uRes;
  uniform float uDpr;
  uniform float uTime;
  uniform float uPhase;      // 0.0 = Burst filling screen, 1.0 = Dropping down screen
  uniform float uBurstProg;  // 0.0 -> 1.0
  uniform float uDrainProg;  // 0.0 -> 1.0
  uniform vec2 uOrigin;      // Platter center in top-down pixel coords
  uniform float uStartR;     // Initial burst radius in pixels

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash21(vec2 p) {
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
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.03 + vec2(13.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  // Cellular / Voronoi underwater caustic pattern
  float caustics(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float md1 = 8.0;
    float md2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = hash22(i + g);
        o = 0.5 + 0.42 * sin(uTime * 2.4 + 6.2831 * o);
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < md1) {
          md2 = md1;
          md1 = d;
        } else if (d < md2) {
          md2 = d;
        }
      }
    }
    return smoothstep(0.0, 0.55, sqrt(md2) - sqrt(md1));
  }

  // Smooth metaball union for realistic liquid ligament stretching & pinch-off
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // Burst SDF (< 0 inside bursting water & splash droplets)
  float burstSDF(vec2 p) {
    vec2 d = p - uOrigin;
    float dist = length(d);
    float ang = atan(d.y, d.x);

    float maxR = length(uRes) * 1.08;
    float easeB = smoothstep(0.0, 0.05, uBurstProg) * pow(uBurstProg, 0.80);
    float baseR = uStartR + easeB * maxR;

    // Rayleigh-Taylor liquid crown fingers & multi-scale splash turbulence
    vec2 angUv = vec2(cos(ang), sin(ang));
    float n1 = fbm(angUv * 2.5 + vec2(1.7, -uTime * 1.3));
    float n2 = fbm(angUv * 6.2 + vec2(-uTime * 1.9, 3.4));
    float fingers = (n1 - 0.5) * 0.28 + (n2 - 0.5) * 0.15
                  + 0.045 * sin(ang * 13.0 - uTime * 5.5)
                  + 0.025 * cos(ang * 21.0 + uTime * 7.2);

    float fingerFade = 1.0 - smoothstep(0.76, 0.97, uBurstProg);
    float fingerAmp = min(baseR * 0.46, 145.0 * uDpr) * fingerFade;
    float frontR = baseR + fingers * fingerAmp;

    float sdf = dist - frontR;

    // Detached & stretching radial crown-splash droplets ahead of the main surge
    if (fingerFade > 0.01 && abs(sdf) < 220.0 * uDpr) {
      float sectors = 28.0;
      float aNorm = (ang + 3.14159265) / 6.2831853;
      float baseSec = floor(aNorm * sectors);

      for (int k = -1; k <= 1; k++) {
        float sec = mod(baseSec + float(k) + sectors, sectors);
        float h1 = hash11(sec * 17.3 + 3.1);
        float h2 = hash11(sec * 31.7 + 9.4);
        float secAng = ((sec + 0.22 + 0.56 * h1) / sectors) * 6.2831853 - 3.14159265;
        vec2 dir = vec2(cos(secAng), sin(secAng));

        // Close ligament droplet stretching out of the splash rim
        float lead1 = (16.0 + 68.0 * h2) * uDpr * sin(uBurstProg * 3.14159) * fingerFade;
        vec2 c1 = uOrigin + dir * (frontR + lead1);
        float r1 = (5.5 + 9.5 * h1) * uDpr * fingerFade;
        sdf = smin(sdf, length(p - c1) - r1, 18.0 * uDpr);

        // Faster outer ballistic spray bead
        float lead2 = (48.0 + 135.0 * h1) * uDpr * pow(uBurstProg, 0.65) * fingerFade;
        vec2 c2 = uOrigin + dir * (frontR + lead2);
        float r2 = (3.2 + 5.8 * h2) * uDpr * fingerFade;
        sdf = min(sdf, length(p - c2) - r2);
      }
    }

    return sdf;
  }

  // Gravity-drop free surface Y in top-down pixels
  float dropSurfaceY(float x) {
    float dropEase = smoothstep(0.0, 0.12, uDrainProg) * pow(uDrainProg, 1.32);
    float baseY = -68.0 * uDpr + dropEase * (uRes.y + 190.0 * uDpr);

    // Realistic tank sloshing + choppy capillary surface waves
    float slosh1 = sin(x / (uRes.x * 0.23) + uTime * 3.5) * (24.0 * uDpr);
    float slosh2 = cos(x / (uRes.x * 0.12) - uTime * 4.8) * (12.0 * uDpr);
    float chop = (fbm(vec2(x / (48.0 * uDpr) + uTime * 0.7, uTime * 2.1)) - 0.5) * (28.0 * uDpr);
    return baseY + slosh1 + slosh2 + chop;
  }

  // Drop SDF (< 0 inside main falling water & leaping crest splashes)
  float dropSDF(vec2 p) {
    float sy = dropSurfaceY(p.x);
    float sdf = sy - p.y;

    // Splashing crest tongues & droplets leaping just above the sloshing free surface
    if (abs(sdf) < 120.0 * uDpr) {
      float colW = 42.0 * uDpr;
      float baseCol = floor(p.x / colW);
      for (int k = -1; k <= 1; k++) {
        float col = baseCol + float(k);
        float h1 = hash11(col * 19.7 + 5.3);
        float h2 = hash11(col * 43.1 + 1.9);
        float cx = (col + 0.2 + 0.6 * h1) * colW;
        float cSy = dropSurfaceY(cx);

        // Parabolic hopping droplet cycle
        float cyc = fract(uTime * (1.15 + 0.65 * h2) + h1 * 7.0);
        float hopArc = 4.0 * cyc * (1.0 - cyc);
        float leapH = (12.0 + 54.0 * h2) * uDpr * hopArc;
        vec2 dc = vec2(cx + sin(uTime * 2.5 + col) * 6.0 * uDpr, cSy - leapH);
        float dr = (3.8 + 6.5 * h1) * uDpr * (0.45 + 0.55 * hopArc);
        sdf = smin(sdf, length(p - dc) - dr, 14.0 * uDpr);
      }
    }

    return sdf;
  }

  // Internal 3D liquid surface heightfield for realistic normals, waves & caustics
  float waterHeight(vec2 p, float sdf, float flowDownY) {
    float depthIn = max(-sdf, 0.0);
    // Rounded 3D surface-tension meniscus / splash lip along water boundaries
    float meniscus = (1.0 - exp(-depthIn / (16.0 * uDpr))) * 0.55
                   + exp(-pow((depthIn - 10.0 * uDpr) / (14.0 * uDpr), 2.0)) * 0.42;

    // Smoothly blend radial burst waves into downward gravity-advected fluid motion
    float toDrain = (uPhase > 0.5) ? 1.0 : smoothstep(0.68, 1.0, uBurstProg);

    vec2 d = p - uOrigin;
    float dist = length(d);
    vec2 radDir = d / max(dist, 1.0);

    vec2 uvBurst = p / (56.0 * uDpr) - radDir * (uTime * 1.65);
    float burstWaves = sin(dist / (17.0 * uDpr) - uTime * 10.5) * 0.24 * (1.0 - toDrain)
                     + fbm(uvBurst) * 0.55;

    vec2 uvDrop = vec2(p.x, p.y - flowDownY * 0.86) / (58.0 * uDpr) + vec2(0.0, -uTime * 0.85);
    float dropWaves = fbm(uvDrop) * 0.62 + fbm(uvDrop * 2.15 + 5.2) * 0.28;

    return meniscus + mix(burstWaves, dropWaves, toDrain);
  }

  // Realistic clinging glass teardrops sliding down above the receding water line
  vec4 renderGlassDroplets(vec2 p, float surfY, float flowDownY) {
    if (p.y >= surfY - 2.0 * uDpr) return vec4(0.0);

    // Droplets slide downward under gravity slightly slower than the main water sheet
    vec2 gp = vec2(p.x, p.y - flowDownY * 0.52) / (68.0 * uDpr);
    vec2 cell = floor(gp);
    vec2 f = fract(gp) - 0.5;

    float rnd = hash21(cell);
    // Keep glass droplets tasteful & sparse (~38% of cells)
    if (rnd < 0.62) return vec4(0.0);

    vec2 jitter = (hash22(cell + 11.3) - 0.5) * 0.44;
    vec2 q = f - jitter;

    // Teardrop deformation: plump rounded bottom, slender tapered upper tail
    float rBase = 0.11 + 0.13 * hash21(cell + 27.9);
    vec2 tq = q;
    tq.x *= 1.0 + clamp(-q.y * 2.6, -0.25, 0.85);
    tq.y *= (q.y < 0.0) ? 0.68 : 1.12;

    float d = length(tq);
    if (d > rBase) return vec4(0.0);

    float normR = d / rBase;
    float z = sqrt(max(0.0, 1.0 - normR * normR));
    vec3 N = normalize(vec3(tq / rBase, z));

    vec3 L = normalize(vec3(-0.45, -0.62, 0.64));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);

    float spec = pow(max(dot(N, H), 0.0), 72.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float bottomRefract = smoothstep(-0.1, 0.85, q.y / rBase) * (1.0 - fres);

    // Exact #0096FF (0.0, 0.5882, 1.0) refractive glass bead tint
    vec3 col = mix(vec3(0.0, 0.5882, 1.0), vec3(0.45, 0.84, 1.0), bottomRefract * 0.75);
    col = mix(col, vec3(0.0, 0.36, 0.78), fres * 0.55);
    col += vec3(1.0) * spec * 1.15;

    // Fade droplets smoothly as they slide out near the end of the drain
    float endFade = 1.0 - smoothstep(0.78, 0.98, uDrainProg);
    float edgeAA = smoothstep(rBase, rBase * 0.78, d);
    float alpha = clamp((0.42 + fres * 0.42 + spec * 0.85) * edgeAA * endFade, 0.0, 0.95);
    return vec4(clamp(col, 0.0, 1.0), alpha);
  }

  void main() {
    // Top-down pixel coordinates matching 2D canvas 1:1
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);

    float dropEase = smoothstep(0.0, 0.12, uDrainProg) * pow(uDrainProg, 1.32);
    float flowDownY = (uPhase > 0.5) ? (dropEase * (uRes.y + 190.0 * uDpr)) : 0.0;

    float sdf = (uPhase < 0.5) ? burstSDF(p) : dropSDF(p);

    // Outside main water body: render sliding glass droplets during drain, else transparent
    if (sdf > 1.5 * uDpr) {
      if (uPhase > 0.5) {
        gl_FragColor = renderGlassDroplets(p, dropSurfaceY(p.x), flowDownY);
      } else {
        gl_FragColor = vec4(0.0);
      }
      return;
    }

    // Finite-difference 3D surface normal for realistic wet reflections & refraction
    float eps = 2.2 * uDpr;
    float hc = waterHeight(p, sdf, flowDownY);
    float hx = waterHeight(p + vec2(eps, 0.0), sdf, flowDownY);
    float hy = waterHeight(p + vec2(0.0, eps), sdf, flowDownY);
    vec3 N = normalize(vec3((hc - hx) * 2.6, (hc - hy) * 2.6, 1.0));

    vec3 L1 = normalize(vec3(-0.42, -0.58, 0.70));
    vec3 L2 = normalize(vec3(0.38, -0.32, 0.86));
    vec3 V = vec3(0.0, 0.0, 1.0);

    float diff = 0.62 + 0.38 * max(dot(N, L1), 0.0);
    float spec1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 88.0);
    float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 34.0) * 0.28;
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

    // Exact #0096FF = vec3(0.0, 0.5882, 1.0) volumetric water shading + caustics
    vec3 coreBlue = vec3(0.0, 0.5882, 1.0);
    vec3 deepBlue = vec3(0.0, 0.40, 0.84);
    vec3 brightCyan = vec3(0.28, 0.74, 1.0);

    float toDrain = (uPhase > 0.5) ? 1.0 : smoothstep(0.68, 1.0, uBurstProg);
    vec2 caustUv = mix(
      p / (64.0 * uDpr),
      vec2(p.x, p.y - flowDownY * 0.86) / (64.0 * uDpr),
      toDrain
    ) + N.xy * 0.35;

    float cNet = caustics(caustUv);
    float waveShade = clamp((hc - 0.35) * 1.15, -0.45, 0.55);

    vec3 waterCol = mix(deepBlue, coreBlue, smoothstep(-0.42, 0.12, waveShade));
    waterCol = mix(waterCol, brightCyan, smoothstep(0.10, 0.55, waveShade) * 0.58 + (1.0 - cNet) * 0.28);
    waterCol *= (0.88 + 0.18 * diff);

    // Internal buoyant 3D refractive air bubbles rising inside the #0096FF water
    vec2 bubUv = vec2(p.x, p.y - flowDownY * 0.82 + uTime * 48.0 * uDpr) / (54.0 * uDpr);
    vec2 bCell = floor(bubUv);
    vec2 bFrac = fract(bubUv) - 0.5;
    float bSeed = hash21(bCell);
    if (bSeed > 0.52) {
      vec2 bOff = (hash22(bCell + 4.7) - 0.5) * 0.52;
      bOff.x += sin(uTime * 3.4 + bSeed * 12.0) * 0.08;
      vec2 bq = bFrac - bOff;
      float bRad = 0.06 + 0.11 * hash21(bCell + 19.1);
      float bd = length(bq);
      if (bd < bRad) {
        float bn = bd / bRad;
        float bRim = pow(bn, 2.8);
        float bGlint = smoothstep(0.38, 0.08, length(bq - vec2(-0.32, -0.32) * bRad) / bRad);
        waterCol = mix(waterCol, vec3(0.65, 0.90, 1.0), bRim * 0.65);
        waterCol += vec3(1.0) * bGlint * 0.72;
      }
    }

    // Realistic aerated whitewater foam lace along turbulent splash & sloshing meniscus rim
    float rimDist = max(-sdf, 0.0);
    float foamNoise = fbm(caustUv * 3.4 + vec2(uTime * 0.9, -uTime * 1.2));
    float rimBand = exp(-rimDist / (20.0 * uDpr));
    float foamFadeFull = (uPhase < 0.5) ? (1.0 - smoothstep(0.80, 0.98, uBurstProg)) : 1.0;
    float foamMask = smoothstep(0.36, 0.76, rimBand * (0.52 + 0.72 * foamNoise)) * foamFadeFull;

    waterCol = mix(waterCol, vec3(0.92, 0.98, 1.0), foamMask * 0.88);
    waterCol += vec3(0.55, 0.86, 1.0) * fresnel * 0.35;
    waterCol += vec3(1.0) * (spec1 * 1.05 + spec2);

    // Anti-aliased wet meniscus edge with slight glassy translucency right at the 2px rim
    float edgeAlpha = smoothstep(1.5 * uDpr, -1.5 * uDpr, sdf);
    float bodyOpacity = mix(0.86, 1.0, smoothstep(0.0, 14.0 * uDpr, rimDist));
    if (uPhase < 0.5 && uBurstProg > 0.95) {
      bodyOpacity = 1.0;
      edgeAlpha = 1.0;
    }

    gl_FragColor = vec4(clamp(waterCol, 0.0, 1.0), clamp(edgeAlpha * bodyOpacity, 0.0, 1.0));
  }
`

function initFluidGL(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
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

  const vs = compile(gl.VERTEX_SHADER, FLUID_VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FLUID_FRAG)
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
      uDpr: gl.getUniformLocation(prog, 'uDpr'),
      uTime: gl.getUniformLocation(prog, 'uTime'),
      uPhase: gl.getUniformLocation(prog, 'uPhase'),
      uBurstProg: gl.getUniformLocation(prog, 'uBurstProg'),
      uDrainProg: gl.getUniformLocation(prog, 'uDrainProg'),
      uOrigin: gl.getUniformLocation(prog, 'uOrigin'),
      uStartR: gl.getUniformLocation(prog, 'uStartR'),
    },
  }
}

// Orbiting bubbles inside the spinning #0096FF water record
const RECORD_BUBBLES = Array.from({ length: 16 }, (_, i) => ({
  baseAngle: (i / 16) * Math.PI * 2 + (i % 3) * 0.21,
  radiusFrac: 0.35 + ((i * 37) % 55) / 100,
  size: 2.5 + (i % 4) * 1.3,
  speedMult: 0.88 + (i % 3) * 0.12,
  bobPhase: i * 1.7,
}))

// Tiny centrifugal #0096FF water droplets beading just outside the spinning rim
const RIM_DROPLETS = Array.from({ length: 5 }, (_, i) => ({
  baseAngle: (i / 5) * Math.PI * 2 + 0.4,
  distOffset: 6 + (i % 3) * 4.5,
  size: 2.8 + (i % 2) * 1.4,
  phase: i * 2.1,
}))

function smoothstep01(x) {
  const c = Math.max(0, Math.min(1, x))
  return c * c * (3 - 2 * c)
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
  ctx.lineTo(x + rad, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad)
  ctx.lineTo(x, y + rad)
  ctx.quadraticCurveTo(x, y, x + rad, y)
  ctx.closePath()
}

export default function IntroWaterRecord({ onComplete }) {
  const sceneCanvasRef = useRef(null)
  const fluidCanvasRef = useRef(null)
  const rootRef = useRef(null)

  const [jumping, setJumping] = useState(false)
  const [rpmMode, setRpmMode] = useState(33)
  const [hoveringInteractive, setHoveringInteractive] = useState(false)

  const rpmRef = useRef(33)
  const jumpStartRef = useRef(null)
  const completedRef = useRef(false)
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const ripplesRef = useRef([])
  const splashDropsRef = useRef([])
  const hitZonesRef = useRef({
    waterCx: 0,
    waterCy: 0,
    waterR: 0,
    rpmBox: { x: 0, y: 0, w: 0, h: 0 },
    armBox: { x: 0, y: 0, w: 0, h: 0 },
  })
  const lastHoverRippleRef = useRef(0)

  const spawnSplashDroplets = useCallback((ox, oy, count = 10, power = 1) => {
    const drops = splashDropsRef.current
    for (let i = 0; i < count; i++) {
      const ang = (i / Math.max(1, count)) * Math.PI * 2 + (Math.random() - 0.5) * 0.35
      const spd = (65 + Math.random() * 115) * power
      drops.push({
        x: ox,
        y: oy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 2.8 + Math.random() * 3.2,
        age: 0,
        maxAge: 0.68 + Math.random() * 0.3,
        isFoam: i % 3 === 0,
      })
    }
  }, [])

  const triggerEnter = useCallback(() => {
    if (jumpStartRef.current !== null) return
    jumpStartRef.current = performance.now()
    setJumping(true)
  }, [])

  // Lock page scroll & allow Enter / Space key to play the record
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        triggerEnter()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [triggerEnter])

  useEffect(() => {
    const sceneCanvas = sceneCanvasRef.current
    const fluidCanvas = fluidCanvasRef.current
    if (!sceneCanvas || !fluidCanvas) return undefined

    let sizeState = setupHiDPICanvas(sceneCanvas)
    const glState = initFluidGL(fluidCanvas)

    let spinAngle = 0
    let lastTs = 0
    let rafId = 0

    const onResize = () => {
      sizeState = setupHiDPICanvas(sceneCanvas)
    }
    window.addEventListener('resize', onResize)

    const drawLiquidBoundaryPath = (ctx, cx, cy, radius, t, spin, extraAmp = 0) => {
      const steps = 104
      const amp = 0.012 + extraAmp
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * Math.PI * 2
        const wob =
          1 +
          amp * Math.sin(th * 5 - spin * 1.35) +
          amp * 0.65 * Math.cos(th * 8 + spin * 1.9 + t * 2.0) +
          amp * 0.4 * Math.sin(th * 11 - t * 3.1)
        const px = cx + Math.cos(th) * radius * wob
        const py = cy + Math.sin(th) * radius * wob
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
    }

    const drawTopDownHouseplant = (ctx, px, py, radius) => {
      ctx.fillStyle = PALETTE.shadowDark
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.25
        ctx.save()
        ctx.translate(px + radius * 0.15, py + radius * 0.16)
        ctx.rotate(a)
        ctx.beginPath()
        ctx.ellipse(radius * 0.56, 0, radius * 0.48, radius * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.fillStyle = PALETTE.plantPot
      ctx.strokeStyle = PALETTE.inkBlack
      ctx.lineWidth = 2.0
      ctx.beginPath()
      ctx.arc(px, py, radius * 0.48, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = PALETTE.plantSoil
      ctx.beginPath()
      ctx.arc(px, py, radius * 0.34, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.25
        const leafLen = radius * (i % 2 === 0 ? 0.96 : 0.8)
        const leafWid = radius * (i % 2 === 0 ? 0.25 : 0.21)
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(a)

        ctx.fillStyle = i % 2 === 0 ? PALETTE.leafDark : PALETTE.leafLight
        ctx.strokeStyle = PALETTE.inkBlack
        ctx.lineWidth = 1.8
        ctx.beginPath()
        ctx.moveTo(radius * 0.12, 0)
        ctx.quadraticCurveTo(leafLen * 0.52, -leafWid, leafLen, 0)
        ctx.quadraticCurveTo(leafLen * 0.52, leafWid, radius * 0.12, 0)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(radius * 0.16, 0)
        ctx.lineTo(leafLen * 0.84, 0)
        ctx.stroke()
        ctx.restore()
      }
    }

    // Realistic Fluid Timeline:
    //   0.00s -> 0.48s : Tonearm swings from armrest onto the spinning #0096FF water record
    //   0.46s -> 2.06s : Realistic #0096FF water BURSTS outward (crown fingers, droplets, waves), filling 100% of screen
    //   2.06s -> 4.30s : Realistic #0096FF water SLOSHES & DROPS down the screen (with sliding glass droplets), revealing Act I!
    const BURST_START = 0.46
    const DRAIN_START = 2.06
    const DRAIN_DURATION = 2.22

    const render = (ts) => {
      const dt = Math.min(0.05, (ts - lastTs) * 0.001 || 0.016)
      lastTs = ts
      const t = ts * 0.001

      let jumpElapsed = 0
      let isJumping = false
      if (jumpStartRef.current !== null) {
        isJumping = true
        jumpElapsed = Math.max(0, (ts - jumpStartRef.current) * 0.001)
      }

      const inBurstPhase = isJumping && jumpElapsed >= BURST_START && jumpElapsed < DRAIN_START
      const inDrainPhase = isJumping && jumpElapsed >= DRAIN_START

      // Once burst fills 100% of the screen, make root + scene canvas transparent so Act I shines behind the dropping water!
      if (rootRef.current) {
        rootRef.current.style.backgroundColor = inDrainPhase
          ? 'transparent'
          : PALETTE.floorBrownA
      }

      if (isJumping && jumpElapsed >= DRAIN_START + DRAIN_DURATION + 0.05 && !completedRef.current) {
        completedRef.current = true
        if (onComplete) onComplete()
        return
      }

      if (!sizeState) sizeState = setupHiDPICanvas(sceneCanvas)

      let platCxCss = (window.innerWidth || 1280) * 0.5
      let platCyCss = (window.innerHeight || 800) * 0.5
      let waterRCss = 110

      if (sizeState) {
        const { w, h, ctx } = sizeState

        if (inDrainPhase) {
          // Clear room scene completely during drain so Act I is visible above the dropping #0096FF water
          ctx.clearRect(0, 0, w, h)
        } else {
          const parallaxFade = isJumping ? Math.max(0, 1 - jumpElapsed * 1.1) : 1
          mouseRef.current.x += (mouseRef.current.tx * parallaxFade - mouseRef.current.x) * 0.07
          mouseRef.current.y += (mouseRef.current.ty * parallaxFade - mouseRef.current.y) * 0.07

          const baseAngularVel = rpmRef.current === 45 ? 2.55 : 1.75
          const surgeMult = isJumping
            ? 1 + Math.pow(Math.min(1, Math.max(0, jumpElapsed - 0.35) / 1.4), 1.5) * 3.2
            : 1
          spinAngle += dt * baseAngularVel * surgeMult

          ctx.globalCompositeOperation = 'source-over'
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'

          const roomShiftX = mouseRef.current.x * 5
          const roomShiftY = mouseRef.current.y * 5

          // 1. Warm Brownish Sunset Room Floorboards
          ctx.fillStyle = PALETTE.floorBrownA
          ctx.fillRect(0, 0, w, h)

          const plankH = Math.max(38, Math.round(h / 13))
          const numPlanks = Math.ceil(h / plankH) + 2
          ctx.lineWidth = 1.2
          ctx.strokeStyle = 'rgba(26, 15, 9, 0.28)'
          for (let row = -1; row < numPlanks; row++) {
            const py = row * plankH + (roomShiftY % plankH)
            if (row % 2 === 0) {
              ctx.fillStyle = PALETTE.floorBrownB
              ctx.fillRect(0, py, w, plankH)
            }
            ctx.beginPath()
            ctx.moveTo(0, py)
            ctx.lineTo(w, py)
            ctx.stroke()

            const seamSpan = Math.max(180, w * 0.28)
            const seamOffset = ((row * 137) % seamSpan) + roomShiftX * 0.6
            for (let sx = seamOffset; sx < w; sx += seamSpan) {
              ctx.beginPath()
              ctx.moveTo(sx, py)
              ctx.lineTo(sx, py + plankH)
              ctx.stroke()
            }
          }

          // Cozy dusk room corner warmth
          const roomShade = ctx.createRadialGradient(
            w * 0.35,
            h * 0.45,
            Math.min(w, h) * 0.18,
            w * 0.55,
            h * 0.5,
            Math.hypot(w, h) * 0.72,
          )
          roomShade.addColorStop(0, 'rgba(255, 190, 95, 0.08)')
          roomShade.addColorStop(1, 'rgba(38, 16, 6, 0.28)')
          ctx.fillStyle = roomShade
          ctx.fillRect(0, 0, w, h)

          // Left wall casement window glowing with orange-gold sunset + diagonal sunset beam
          const wallW = Math.max(15, Math.min(32, w * 0.028))
          const winTop = h * 0.15
          const winBot = h * 0.59
          const winMid = (winTop + winBot) * 0.5

          const sunGrad = ctx.createLinearGradient(wallW, winMid, w * 0.9, winMid + w * 0.35)
          sunGrad.addColorStop(0, 'rgba(255, 166, 58, 0.36)')
          sunGrad.addColorStop(0.55, 'rgba(255, 184, 78, 0.22)')
          sunGrad.addColorStop(1, 'rgba(255, 196, 98, 0.04)')
          ctx.fillStyle = sunGrad
          ctx.beginPath()
          ctx.moveTo(wallW, winTop)
          ctx.lineTo(w * 0.96, winTop + w * 0.36)
          ctx.lineTo(w * 0.96, winBot + w * 0.42)
          ctx.lineTo(wallW, winBot)
          ctx.closePath()
          ctx.fill()

          ctx.fillStyle = 'rgba(72, 34, 12, 0.10)'
          ctx.beginPath()
          ctx.moveTo(wallW, winMid - 5)
          ctx.lineTo(w * 0.96, winMid - 5 + w * 0.39)
          ctx.lineTo(w * 0.96, winMid + 6 + w * 0.39)
          ctx.lineTo(wallW, winMid + 5)
          ctx.closePath()
          ctx.fill()

          ctx.fillStyle = PALETTE.wallWood
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.2
          ctx.fillRect(-2, -2, wallW + 2, h + 4)
          ctx.strokeRect(-2, -2, wallW + 2, h + 4)

          ctx.fillStyle = PALETTE.windowSill
          ctx.fillRect(0, winTop, wallW + 5, winBot - winTop)
          ctx.strokeRect(0, winTop, wallW + 5, winBot - winTop)

          const winPaneGrad = ctx.createLinearGradient(0, winTop, 0, winBot)
          winPaneGrad.addColorStop(0, PALETTE.sunsetTop)
          winPaneGrad.addColorStop(1, PALETTE.sunsetBot)
          ctx.fillStyle = winPaneGrad
          ctx.fillRect(2, winTop + 8, wallW * 0.52, winBot - winTop - 16)
          ctx.strokeRect(2, winTop + 8, wallW * 0.52, winBot - winTop - 16)

          ctx.fillStyle = PALETTE.windowSill
          ctx.fillRect(0, winMid - 4, wallW + 5, 8)
          ctx.strokeRect(0, winMid - 4, wallW + 5, 8)

          // Furniture & turntable master scale
          const u = Math.min(w * 0.78, h * 0.5, 430)
          const roomCx = w * 0.5 - mouseRef.current.x * 7
          const roomCy = h * 0.505 - mouseRef.current.y * 7
          const wideTable = w >= 720

          // Earthy terracotta & cocoa-brown woven area rug
          const rugW = wideTable ? Math.min(w * 0.84, u * 2.16) : Math.min(w * 0.9, u * 1.56)
          const rugH = Math.min(h * 0.66, u * 1.44)
          const rugX = roomCx - rugW * 0.5
          const rugY = roomCy - rugH * 0.5

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.8
          const tasselCount = 17
          const tasselLen = Math.max(8, u * 0.032)
          for (let ti = 1; ti < tasselCount; ti++) {
            const ty = rugY + (ti / tasselCount) * rugH
            ctx.beginPath()
            ctx.moveTo(rugX - tasselLen, ty)
            ctx.lineTo(rugX, ty)
            ctx.moveTo(rugX + rugW, ty)
            ctx.lineTo(rugX + rugW + tasselLen, ty)
            ctx.stroke()
          }

          ctx.fillStyle = PALETTE.rugOuter
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.3
          ctx.fillRect(rugX, rugY, rugW, rugH)
          ctx.strokeRect(rugX, rugY, rugW, rugH)

          const rPad1 = u * 0.045
          ctx.fillStyle = PALETTE.rugStripe
          ctx.lineWidth = 1.6
          ctx.fillRect(rugX + rPad1, rugY + rPad1, rugW - rPad1 * 2, rugH - rPad1 * 2)
          ctx.strokeRect(rugX + rPad1, rugY + rPad1, rugW - rPad1 * 2, rugH - rPad1 * 2)

          const rPad2 = u * 0.072
          ctx.fillStyle = PALETTE.rugInner
          ctx.fillRect(rugX + rPad2, rugY + rPad2, rugW - rPad2 * 2, rugH - rPad2 * 2)
          ctx.strokeRect(rugX + rPad2, rugY + rPad2, rugW - rPad2 * 2, rugH - rPad2 * 2)

          if (w >= 560) {
            const plantX = Math.min(w - u * 0.16, rugX + rugW - u * 0.04)
            const plantY = Math.max(h * 0.19, rugY + u * 0.08)
            drawTopDownHouseplant(ctx, plantX, plantY, u * 0.145)
          }

          // 2. Warm Honey-Caramel Wooden Listening Table
          const tableW = wideTable ? Math.min(w * 0.74, u * 1.74) : Math.min(w * 0.88, u * 1.28)
          const tableH = u * 1.08
          const tableX = roomCx - tableW * 0.5
          const tableY = roomCy - tableH * 0.5
          const tableRadius = u * 0.035

          const tShX = u * 0.072 + mouseRef.current.x * 3.5
          const tShY = u * 0.078 + mouseRef.current.y * 3.5
          ctx.fillStyle = PALETTE.shadowDark
          drawRoundedRect(ctx, tableX + tShX, tableY + tShY, tableW, tableH, tableRadius)
          ctx.fill()

          ctx.fillStyle = PALETTE.tableRim
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.6
          drawRoundedRect(ctx, tableX, tableY, tableW, tableH, tableRadius)
          ctx.fill()
          ctx.stroke()

          const tbIn = u * 0.026
          ctx.fillStyle = PALETTE.tableTop
          ctx.lineWidth = 1.7
          drawRoundedRect(
            ctx,
            tableX + tbIn,
            tableY + tbIn,
            tableW - tbIn * 2,
            tableH - tbIn * 2,
            Math.max(4, tableRadius - tbIn * 0.6),
          )
          ctx.fill()
          ctx.stroke()

          ctx.strokeStyle = PALETTE.tableGrain
          ctx.lineWidth = 1.25
          ctx.beginPath()
          ctx.moveTo(tableX + tableW * 0.08, tableY + tableH * 0.18)
          ctx.lineTo(tableX + tableW * 0.28, tableY + tableH * 0.18)
          ctx.moveTo(tableX + tableW * 0.66, tableY + tableH * 0.88)
          ctx.lineTo(tableX + tableW * 0.88, tableY + tableH * 0.88)
          ctx.stroke()

          const playerCx = wideTable ? roomCx + u * 0.185 : roomCx
          const playerCy = roomCy

          if (wideTable) {
            const propCx = tableX + u * 0.265

            // Sunset LP sleeve on tabletop
            const slvSize = u * 0.34
            ctx.save()
            ctx.translate(propCx, roomCy - u * 0.145)
            ctx.rotate(-0.11)

            ctx.fillStyle = PALETTE.shadowDark
            ctx.fillRect(-slvSize * 0.5 + 5, -slvSize * 0.5 + 5, slvSize, slvSize)

            ctx.fillStyle = PALETTE.platterSlate
            ctx.strokeStyle = PALETTE.inkBlack
            ctx.lineWidth = 1.8
            ctx.beginPath()
            ctx.arc(slvSize * 0.16, 0, slvSize * 0.44, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = PALETTE.vermilion
            ctx.lineWidth = 2.0
            ctx.fillRect(-slvSize * 0.5, -slvSize * 0.5, slvSize, slvSize)
            ctx.strokeRect(-slvSize * 0.5, -slvSize * 0.5, slvSize, slvSize)

            ctx.fillStyle = PALETTE.mustardSun
            ctx.lineWidth = 1.4
            ctx.beginPath()
            ctx.arc(slvSize * 0.14, -slvSize * 0.15, slvSize * 0.15, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = PALETTE.rugInner
            ctx.beginPath()
            ctx.moveTo(-slvSize * 0.5, slvSize * 0.12)
            ctx.quadraticCurveTo(-slvSize * 0.12, -slvSize * 0.08, slvSize * 0.5, slvSize * 0.16)
            ctx.lineTo(slvSize * 0.5, slvSize * 0.5)
            ctx.lineTo(-slvSize * 0.5, slvSize * 0.5)
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
            ctx.restore()

            // Ceramic coffee mug on coaster
            const mugX = propCx - u * 0.02
            const mugY = roomCy + u * 0.255
            const mugR = u * 0.068

            ctx.fillStyle = PALETTE.shadowDark
            ctx.beginPath()
            ctx.arc(mugX + 3.5, mugY + 3.5, mugR * 1.32, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = PALETTE.coaster
            ctx.strokeStyle = PALETTE.inkBlack
            ctx.lineWidth = 1.8
            ctx.beginPath()
            ctx.arc(mugX, mugY, mugR * 1.32, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.save()
            ctx.translate(mugX, mugY)
            ctx.rotate(0.55)
            ctx.fillStyle = PALETTE.paperWarm
            ctx.lineWidth = 1.9
            drawRoundedRect(ctx, mugR * 0.75, -mugR * 0.22, mugR * 0.58, mugR * 0.44, 4)
            ctx.fill()
            ctx.stroke()
            ctx.restore()

            ctx.fillStyle = PALETTE.paperWarm
            ctx.lineWidth = 2.0
            ctx.beginPath()
            ctx.arc(mugX, mugY, mugR, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = PALETTE.coffeeDark
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(mugX, mugY, mugR * 0.76, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.strokeStyle = PALETTE.paperWarm
            ctx.lineWidth = 1.6
            ctx.beginPath()
            ctx.arc(mugX, mugY, mugR * 0.42, -0.8, 1.35)
            ctx.stroke()
          }

          // 3. Dark Walnut-Brown Record Player on the Table
          const deckW = u * 1.12
          const deckH = u * 0.88
          const deckX = playerCx - deckW * 0.5
          const deckY = playerCy - deckH * 0.5
          const framePad = u * 0.036

          ctx.save()
          const cordStartX = deckX + deckW - u * 0.02
          const cordStartY = deckY + deckH * 0.24
          const traceCord = () => {
            ctx.beginPath()
            ctx.moveTo(cordStartX, cordStartY)
            ctx.bezierCurveTo(
              cordStartX + u * 0.18,
              cordStartY - u * 0.05,
              cordStartX + u * 0.14,
              cordStartY + u * 0.28,
              cordStartX + u * 0.34,
              cordStartY + u * 0.24,
            )
            ctx.bezierCurveTo(
              cordStartX + u * 0.52,
              cordStartY + u * 0.2,
              w * 0.94,
              cordStartY + u * 0.42,
              w + 20,
              cordStartY + u * 0.36,
            )
          }
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 4.8
          traceCord()
          ctx.stroke()
          ctx.strokeStyle = PALETTE.paperWarm
          ctx.lineWidth = 1.9
          traceCord()
          ctx.stroke()
          ctx.restore()

          const pShX = u * 0.036 + mouseRef.current.x * 2
          const pShY = u * 0.038 + mouseRef.current.y * 2
          ctx.fillStyle = PALETTE.shadowDark
          ctx.fillRect(deckX + pShX, deckY + pShY, deckW, deckH)

          ctx.fillStyle = PALETTE.woodFrame
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.6
          ctx.fillRect(deckX, deckY, deckW, deckH)
          ctx.strokeRect(deckX, deckY, deckW, deckH)

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.6
          const corners = [
            [deckX, deckY, deckX + framePad, deckY + framePad],
            [deckX + deckW, deckY, deckX + deckW - framePad, deckY + framePad],
            [deckX + deckW, deckY + deckH, deckX + deckW - framePad, deckY + deckH - framePad],
            [deckX, deckY + deckH, deckX + framePad, deckY + deckH - framePad],
          ]
          for (const [x1, y1, x2, y2] of corners) {
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
          }

          const inX = deckX + framePad
          const inY = deckY + framePad
          const inW = deckW - framePad * 2
          const inH = deckH - framePad * 2
          ctx.fillStyle = PALETTE.woodDeck
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.0
          ctx.fillRect(inX, inY, inW, inH)
          ctx.strokeRect(inX, inY, inW, inH)

          ctx.save()
          ctx.strokeStyle = PALETTE.woodGrain
          ctx.lineWidth = 1.25
          const grainRows = [0.14, 0.31, 0.54, 0.76, 0.9]
          grainRows.forEach((gy, idx) => {
            const yLine = inY + inH * gy
            const xStart = inX + inW * (idx % 2 === 0 ? 0.04 : 0.68)
            const segW = inW * (idx % 2 === 0 ? 0.2 : 0.26)
            ctx.beginPath()
            ctx.moveTo(xStart, yLine)
            ctx.quadraticCurveTo(
              xStart + segW * 0.5,
              yLine + (idx % 2 === 0 ? -3 : 3),
              xStart + segW,
              yLine,
            )
            ctx.stroke()
          })
          ctx.restore()

          const puckX = inX + u * 0.062
          const puckY = inY + u * 0.062
          const puckR = u * 0.032
          ctx.fillStyle = PALETTE.shadowDark
          ctx.beginPath()
          ctx.arc(puckX + 2.5, puckY + 2.5, puckR, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = PALETTE.paperWarm
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(puckX, puckY, puckR, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = PALETTE.woodFrame
          ctx.beginPath()
          ctx.arc(puckX, puckY, puckR * 0.28, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          // ============================================================
          // 4. OVERHEAD PLATTER & EXACT #0096FF SPINNING WATER RECORD
          // ============================================================
          const platCx = playerCx - u * 0.105
          const platCy = playerCy
          const bezelR = u * 0.352
          const waterR = u * 0.326

          platCxCss = platCx
          platCyCss = platCy
          waterRCss = waterR

          hitZonesRef.current.waterCx = platCx
          hitZonesRef.current.waterCy = platCy
          hitZonesRef.current.waterR = waterR

          ctx.fillStyle = PALETTE.shadowDark
          ctx.beginPath()
          ctx.arc(platCx + u * 0.012, platCy + u * 0.012, bezelR, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = PALETTE.platterSlate
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.4
          ctx.beginPath()
          ctx.arc(platCx, platCy, bezelR, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = PALETTE.paperWarm
          for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2 + spinAngle * 0.5
            const dx = platCx + Math.cos(a) * (bezelR * 0.962)
            const dy = platCy + Math.sin(a) * (bezelR * 0.962)
            ctx.beginPath()
            ctx.arc(dx, dy, Math.max(1, u * 0.0032), 0, Math.PI * 2)
            ctx.fill()
          }

          const extraWobble = isJumping ? Math.min(0.025, jumpElapsed * 0.02) : 0

          ctx.save()
          drawLiquidBoundaryPath(ctx, platCx, platCy, waterR, t, spinAngle, extraWobble)
          ctx.clip()

          // Core #0096FF water base fill
          ctx.fillStyle = PALETTE.waterCore
          ctx.fillRect(platCx - waterR * 1.2, platCy - waterR * 1.2, waterR * 2.4, waterR * 2.4)

          // Deeper #006ED4 undulating water wave rings
          ctx.fillStyle = PALETTE.waterDeep
          const midBands = [
            { rIn: 0.74, rOut: 0.88, lobes: 6, phase: 0.4 },
            { rIn: 0.5, rOut: 0.62, lobes: 5, phase: 2.1 },
            { rIn: 0.31, rOut: 0.4, lobes: 4, phase: 4.0 },
          ]
          for (const band of midBands) {
            ctx.beginPath()
            for (let i = 0; i <= 76; i++) {
              const th = (i / 76) * Math.PI * 2
              const r =
                band.rOut +
                0.022 * Math.sin(th * band.lobes + spinAngle + band.phase) +
                0.012 * Math.cos(th * (band.lobes + 2) - t * 2.1)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            for (let i = 76; i >= 0; i--) {
              const th = (i / 76) * Math.PI * 2
              const r =
                band.rIn +
                0.02 * Math.cos(th * band.lobes + spinAngle + band.phase) +
                0.01 * Math.sin(th * (band.lobes + 1) + t * 1.8)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.fill()
          }

          // Bright #3DB6FF sunlit water crescents
          ctx.fillStyle = PALETTE.waterLight
          for (let k = 0; k < 2; k++) {
            const baseA = spinAngle * 0.72 + k * Math.PI + 0.35
            ctx.beginPath()
            for (let i = 0; i <= 40; i++) {
              const frac = i / 40
              const th = baseA + (frac - 0.5) * 1.55
              const r =
                0.82 - Math.pow(frac - 0.5, 2) * 0.28 + 0.024 * Math.sin(frac * 14 + t * 3.4)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            for (let i = 40; i >= 0; i--) {
              const frac = i / 40
              const th = baseA + (frac - 0.5) * 1.55
              const r =
                0.42 + Math.pow(frac - 0.5, 2) * 0.22 + 0.02 * Math.cos(frac * 12 - t * 3.0)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.fill()
          }

          // Two opposing specular water sheen wedges
          for (const sheenBase of [-0.68, Math.PI - 0.68]) {
            ctx.fillStyle = PALETTE.waterSheen
            ctx.beginPath()
            for (let i = 0; i <= 26; i++) {
              const f = i / 26
              const r = 0.33 + f * 0.63
              const halfSpan = 0.14 + 0.05 * Math.sin(f * Math.PI * 3 + t * 3.8)
              const th = sheenBase - halfSpan + 0.03 * Math.sin(r * 16 - spinAngle * 1.6)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            for (let i = 26; i >= 0; i--) {
              const f = i / 26
              const r = 0.33 + f * 0.63
              const halfSpan = 0.14 + 0.05 * Math.sin(f * Math.PI * 3 + t * 3.8)
              const th = sheenBase + halfSpan + 0.03 * Math.cos(r * 16 - spinAngle * 1.6)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              ctx.lineTo(px, py)
            }
            ctx.closePath()
            ctx.fill()

            ctx.strokeStyle = PALETTE.foamWhite
            ctx.lineWidth = Math.max(2.2, u * 0.0078)
            ctx.beginPath()
            for (let i = 0; i <= 20; i++) {
              const f = i / 20
              const r = 0.38 + f * 0.52
              const th = sheenBase + 0.045 * Math.sin(f * 9 - t * 4.2)
              const px = platCx + Math.cos(th) * waterR * r
              const py = platCy + Math.sin(th) * waterR * r
              if (i === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.stroke()
          }

          // Spinning concentric water grooves
          const grooveRadii = [0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 0.91]
          grooveRadii.forEach((gr, gi) => {
            const arcStart = spinAngle * (gi % 2 === 0 ? 1 : 0.86) + gi * 1.15
            const span = 1.55 + (gi % 3) * 0.42

            ctx.strokeStyle = 'rgba(0, 58, 128, 0.72)'
            ctx.lineWidth = 1.35
            ctx.beginPath()
            for (let s = 0; s <= 32; s++) {
              const th = arcStart + (s / 32) * span
              const rw = gr + 0.008 * Math.sin(th * 7 - t * 3.0)
              const px = platCx + Math.cos(th) * waterR * rw
              const py = platCy + Math.sin(th) * waterR * rw
              if (s === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.stroke()

            const foamStart = arcStart + Math.PI * 0.92
            ctx.strokeStyle = PALETTE.foamWhite
            ctx.lineWidth = 1.45
            ctx.beginPath()
            for (let s = 0; s <= 22; s++) {
              const th = foamStart + (s / 22) * (span * 0.68)
              const rw = gr + 0.008 * Math.cos(th * 6 + t * 2.6)
              const px = platCx + Math.cos(th) * waterR * rw
              const py = platCy + Math.sin(th) * waterR * rw
              if (s === 0) ctx.moveTo(px, py)
              else ctx.lineTo(px, py)
            }
            ctx.stroke()
          })

          // Orbiting bubbles inside the #0096FF water record
          for (const b of RECORD_BUBBLES) {
            const ang = b.baseAngle + spinAngle * b.speedMult
            const rf = b.radiusFrac + 0.015 * Math.sin(t * 2.4 + b.bobPhase)
            const bx = platCx + Math.cos(ang) * waterR * rf
            const by = platCy + Math.sin(ang) * waterR * rf
            const br = b.size * (u / 430)

            ctx.fillStyle = PALETTE.waterSheen
            ctx.strokeStyle = PALETTE.inkBlack
            ctx.lineWidth = 1.35
            ctx.beginPath()
            ctx.arc(bx, by, br, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            ctx.fillStyle = PALETTE.foamWhite
            ctx.beginPath()
            ctx.arc(bx - br * 0.28, by - br * 0.28, Math.max(0.8, br * 0.34), 0, Math.PI * 2)
            ctx.fill()
          }

          // Interactive user pointer / click ripples on the #0096FF water disc
          const activeRipples = ripplesRef.current
          for (let i = activeRipples.length - 1; i >= 0; i--) {
            const rp = activeRipples[i]
            rp.r += dt * rp.speed
            if (rp.r >= rp.maxR) {
              activeRipples.splice(i, 1)
              continue
            }
            const life = 1 - rp.r / rp.maxR
            const rxCenter = platCx + rp.nx * waterR
            const ryCenter = platCy + rp.ny * waterR

            ctx.strokeStyle = `rgba(244, 251, 255, ${Math.min(0.96, life * 1.2).toFixed(3)})`
            ctx.lineWidth = 2.0
            ctx.beginPath()
            ctx.arc(rxCenter, ryCenter, rp.r * waterR, 0, Math.PI * 2)
            ctx.stroke()

            ctx.strokeStyle = `rgba(0, 74, 155, ${(life * 0.65).toFixed(3)})`
            ctx.lineWidth = 1.15
            ctx.beginPath()
            ctx.arc(rxCenter, ryCenter, Math.max(1, (rp.r - 0.018) * waterR), 0, Math.PI * 2)
            ctx.stroke()
          }

          ctx.restore()

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.5
          drawLiquidBoundaryPath(ctx, platCx, platCy, waterR, t, spinAngle, extraWobble)
          ctx.stroke()

          // Centrifugal #0096FF water droplets beading off the rim
          for (const d of RIM_DROPLETS) {
            const a = d.baseAngle + spinAngle * 0.95
            const pulse = Math.sin(t * 3.0 + d.phase) * 2.2
            const distScale = (u / 450) * (d.distOffset + pulse)
            const dx = platCx + Math.cos(a) * (waterR + distScale)
            const dy = platCy + Math.sin(a) * (waterR + distScale)
            const dr = d.size * (u / 430)

            ctx.fillStyle = PALETTE.waterCore
            ctx.strokeStyle = PALETTE.inkBlack
            ctx.lineWidth = 1.6
            ctx.beginPath()
            ctx.arc(dx, dy, dr, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }

          // 5. Scalloped Foam Collar + Murakami Vermilion & Sun Center Label
          const labelR = waterR * 0.29

          ctx.fillStyle = PALETTE.foamWhite
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.8
          ctx.beginPath()
          for (let i = 0; i <= 64; i++) {
            const th = (i / 64) * Math.PI * 2
            const scallop = 1.13 + 0.055 * Math.abs(Math.sin(th * 6 - spinAngle * 0.8))
            const px = platCx + Math.cos(th) * labelR * scallop
            const py = platCy + Math.sin(th) * labelR * scallop
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.closePath()
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = PALETTE.vermilion
          ctx.lineWidth = 2.2
          ctx.beginPath()
          ctx.arc(platCx, platCy, labelR, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = PALETTE.mustardSun
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.arc(platCx, platCy, labelR * 0.62, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.5
          for (let m = 0; m < 4; m++) {
            const ma = spinAngle + (m * Math.PI) / 2
            ctx.beginPath()
            ctx.moveTo(
              platCx + Math.cos(ma) * labelR * 0.68,
              platCy + Math.sin(ma) * labelR * 0.68,
            )
            ctx.lineTo(
              platCx + Math.cos(ma) * labelR * 0.86,
              platCy + Math.sin(ma) * labelR * 0.86,
            )
            ctx.stroke()
          }

          ctx.fillStyle = PALETTE.shadowDark
          ctx.beginPath()
          ctx.arc(platCx, platCy, labelR * 0.19, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.5
          ctx.stroke()

          // 6. Top-Down Deck Controls & Tonearm
          const lampX = inX + u * 0.055
          const lampY = inY + inH - u * 0.056
          ctx.fillStyle = PALETTE.wellRed
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(lampX, lampY, u * 0.014, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          const btnW = u * 0.112
          const btnH = u * 0.052
          const btnX = lampX + u * 0.03
          const btnY = lampY - btnH * 0.5
          hitZonesRef.current.rpmBox = { x: btnX, y: btnY, w: btnW, h: btnH }

          ctx.fillStyle = PALETTE.shadowDark
          ctx.fillRect(btnX + 3, btnY + 3, btnW, btnH)
          ctx.fillStyle = rpmRef.current === 45 ? PALETTE.chartreuse : PALETTE.paperWarm
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.9
          ctx.fillRect(btnX, btnY, btnW, btnH)
          ctx.strokeRect(btnX, btnY, btnW, btnH)

          ctx.fillStyle = PALETTE.inkBlack
          ctx.font = `600 ${Math.max(9, Math.round(u * 0.023))}px "IBM Plex Mono", monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(`${rpmRef.current} RPM`, btnX + btnW * 0.5, btnY + btnH * 0.52)

          const faderX = inX + inW - u * 0.072
          const faderTopY = playerCy + u * 0.11
          const faderLen = u * 0.2

          ctx.strokeStyle = PALETTE.woodGrain
          ctx.lineWidth = 1.3
          for (let tk = 0; tk <= 6; tk++) {
            const ty = faderTopY + (tk / 6) * faderLen
            const tickW = tk === 3 ? u * 0.02 : u * 0.012
            ctx.beginPath()
            ctx.moveTo(faderX + u * 0.015, ty)
            ctx.lineTo(faderX + u * 0.015 + tickW, ty)
            ctx.stroke()
          }

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 3.4
          ctx.beginPath()
          ctx.moveTo(faderX, faderTopY)
          ctx.lineTo(faderX, faderTopY + faderLen)
          ctx.stroke()

          const knobFrac = rpmRef.current === 45 ? 0.28 : 0.62
          const fKnobY = faderTopY + faderLen * knobFrac
          ctx.fillStyle = PALETTE.shadowDark
          ctx.fillRect(faderX - u * 0.022 + 2.5, fKnobY - u * 0.013 + 2.5, u * 0.044, u * 0.026)
          ctx.fillStyle = PALETTE.mustardSun
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.8
          ctx.fillRect(faderX - u * 0.022, fKnobY - u * 0.013, u * 0.044, u * 0.026)
          ctx.strokeRect(faderX - u * 0.022, fKnobY - u * 0.013, u * 0.044, u * 0.026)

          const pivotX = playerCx + u * 0.375
          const pivotY = playerCy - u * 0.21
          const restX = playerCx + u * 0.355
          const restY = playerCy + u * 0.055

          ctx.fillStyle = PALETTE.paperWarm
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 1.8
          ctx.fillRect(restX - u * 0.016, restY - u * 0.045, u * 0.032, u * 0.022)
          ctx.strokeRect(restX - u * 0.016, restY - u * 0.045, u * 0.032, u * 0.022)

          const playSwing = isJumping ? smoothstep01(jumpElapsed / BURST_START) : 0
          const playTargetX = platCx + Math.cos(-0.08) * waterR * 0.68
          const playTargetY = platCy + Math.sin(-0.08) * waterR * 0.68
          const needleX = restX + (playTargetX - restX) * playSwing
          const needleY = restY + (playTargetY - restY) * playSwing

          hitZonesRef.current.armBox = {
            x: Math.min(pivotX, restX) - u * 0.06,
            y: pivotY - u * 0.06,
            w: u * 0.14,
            h: restY - pivotY + u * 0.12,
          }

          const gimR = u * 0.065
          ctx.fillStyle = PALETTE.shadowDark
          ctx.beginPath()
          ctx.arc(pivotX + 4, pivotY + 4, gimR, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = PALETTE.paperWarm
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.2
          ctx.beginPath()
          ctx.arc(pivotX, pivotY, gimR, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = PALETTE.platterSlate
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.arc(pivotX, pivotY, gimR * 0.56, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()

          const armDirX = needleX - pivotX
          const armDirY = needleY - pivotY
          const armLen = Math.hypot(armDirX, armDirY) || 1
          const ux = armDirX / armLen
          const uy = armDirY / armLen
          const cwX = pivotX - ux * u * 0.072
          const cwY = pivotY - uy * u * 0.072

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = u * 0.02
          ctx.beginPath()
          ctx.moveTo(pivotX, pivotY)
          ctx.lineTo(cwX, cwY)
          ctx.stroke()

          ctx.save()
          ctx.translate(cwX, cwY)
          ctx.rotate(Math.atan2(uy, ux))
          ctx.fillStyle = PALETTE.mustardSun
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.0
          ctx.fillRect(-u * 0.022, -u * 0.028, u * 0.044, u * 0.056)
          ctx.strokeRect(-u * 0.022, -u * 0.028, u * 0.044, u * 0.056)
          ctx.restore()

          const midCtrl1X = pivotX + ux * armLen * 0.36 - uy * u * 0.045
          const midCtrl1Y = pivotY + uy * armLen * 0.36 + ux * u * 0.045
          const midCtrl2X = pivotX + ux * armLen * 0.72 + uy * u * 0.035
          const midCtrl2Y = pivotY + uy * armLen * 0.72 - ux * u * 0.035

          ctx.strokeStyle = 'rgba(11, 6, 4, 0.48)'
          ctx.lineWidth = Math.max(4, u * 0.013)
          ctx.beginPath()
          ctx.moveTo(pivotX + 5, pivotY + 6)
          ctx.bezierCurveTo(
            midCtrl1X + 6,
            midCtrl1Y + 8,
            midCtrl2X + 6,
            midCtrl2Y + 8,
            needleX + 4,
            needleY + 5,
          )
          ctx.stroke()

          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = Math.max(6, u * 0.017)
          ctx.beginPath()
          ctx.moveTo(pivotX, pivotY)
          ctx.bezierCurveTo(midCtrl1X, midCtrl1Y, midCtrl2X, midCtrl2Y, needleX, needleY)
          ctx.stroke()

          ctx.strokeStyle = PALETTE.paperWarm
          ctx.lineWidth = Math.max(2.6, u * 0.008)
          ctx.beginPath()
          ctx.moveTo(pivotX, pivotY)
          ctx.bezierCurveTo(midCtrl1X, midCtrl1Y, midCtrl2X, midCtrl2Y, needleX, needleY)
          ctx.stroke()

          const headAng = Math.atan2(needleY - midCtrl2Y, needleX - midCtrl2X)
          ctx.save()
          ctx.translate(needleX, needleY)
          ctx.rotate(headAng)
          const hsLen = u * 0.058
          const hsW = u * 0.03
          ctx.fillStyle = PALETTE.wellRed
          ctx.strokeStyle = PALETTE.inkBlack
          ctx.lineWidth = 2.0
          ctx.beginPath()
          ctx.rect(-hsLen * 0.78, -hsW * 0.5, hsLen, hsW)
          ctx.fill()
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(-hsLen * 0.2, hsW * 0.5)
          ctx.lineTo(-hsLen * 0.05, hsW * 1.1)
          ctx.stroke()
          ctx.restore()

          // Interactive user click splash droplets on the record
          const drops = splashDropsRef.current
          for (let i = drops.length - 1; i >= 0; i--) {
            const dp = drops[i]
            dp.age += dt
            if (dp.age >= dp.maxAge) {
              drops.splice(i, 1)
              continue
            }
            dp.vx *= 0.97
            dp.vy *= 0.97
            dp.x += dp.vx * dt
            dp.y += dp.vy * dt
            const scale = 1 - (dp.age / dp.maxAge) * 0.6
            const rr = Math.max(1.2, dp.r * scale)

            ctx.fillStyle = dp.isFoam ? PALETTE.foamWhite : PALETTE.waterCore
            ctx.strokeStyle = PALETTE.inkBlack
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(dp.x, dp.y, rr, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        }
      }

      // =========================================================================
      // REALISTIC #0096FF WEBGL FLUID BURST & GRAVITY-DROP OVERLAY
      // =========================================================================
      if (glState) {
        const { gl, prog, loc } = glState
        const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
        const rect = fluidCanvas.getBoundingClientRect()
        const pw = Math.max(1, Math.round(rect.width * dpr))
        const ph = Math.max(1, Math.round(rect.height * dpr))
        if (fluidCanvas.width !== pw || fluidCanvas.height !== ph) {
          fluidCanvas.width = pw
          fluidCanvas.height = ph
        }

        gl.viewport(0, 0, pw, ph)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        if (inBurstPhase || inDrainPhase) {
          const burstProg = inDrainPhase
            ? 1.0
            : Math.min(1, (jumpElapsed - BURST_START) / (DRAIN_START - BURST_START))
          const drainProg = inDrainPhase
            ? Math.min(1, (jumpElapsed - DRAIN_START) / DRAIN_DURATION)
            : 0.0

          gl.useProgram(prog)
          gl.uniform2f(loc.uRes, pw, ph)
          gl.uniform1f(loc.uDpr, dpr)
          gl.uniform1f(loc.uTime, t)
          gl.uniform1f(loc.uPhase, inDrainPhase ? 1.0 : 0.0)
          gl.uniform1f(loc.uBurstProg, burstProg)
          gl.uniform1f(loc.uDrainProg, drainProg)
          gl.uniform2f(loc.uOrigin, platCxCss * dpr, platCyCss * dpr)
          gl.uniform1f(loc.uStartR, waterRCss * 0.25 * dpr)
          gl.drawArrays(gl.TRIANGLES, 0, 6)
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

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    mouseRef.current.tx = (px / rect.width - 0.5) * 2
    mouseRef.current.ty = (py / rect.height - 0.5) * 2

    const { waterCx, waterCy, waterR, rpmBox, armBox } = hitZonesRef.current
    const dx = waterR > 0 ? (px - waterCx) / waterR : 99
    const dy = waterR > 0 ? (py - waterCy) / waterR : 99
    const onWater = dx * dx + dy * dy <= 1
    const onRpm =
      px >= rpmBox.x &&
      px <= rpmBox.x + rpmBox.w &&
      py >= rpmBox.y &&
      py <= rpmBox.y + rpmBox.h
    const onArm =
      px >= armBox.x &&
      px <= armBox.x + armBox.w &&
      py >= armBox.y &&
      py <= armBox.y + armBox.h

    setHoveringInteractive(onWater || onRpm || onArm)

    if (onWater && jumpStartRef.current === null) {
      const now = performance.now()
      if (now - lastHoverRippleRef.current > 155 && ripplesRef.current.length < 10) {
        lastHoverRippleRef.current = now
        ripplesRef.current.push({
          nx: dx * 0.85,
          ny: dy * 0.85,
          r: 0.02,
          maxR: 0.34,
          speed: 0.52,
        })
      }
    }
  }

  const handleCanvasClick = (e) => {
    if (jumpStartRef.current !== null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top

    const { waterCx, waterCy, waterR, rpmBox, armBox } = hitZonesRef.current

    if (
      px >= rpmBox.x &&
      px <= rpmBox.x + rpmBox.w &&
      py >= rpmBox.y &&
      py <= rpmBox.y + rpmBox.h
    ) {
      const next = rpmMode === 33 ? 45 : 33
      rpmRef.current = next
      setRpmMode(next)
      return
    }

    if (
      px >= armBox.x &&
      px <= armBox.x + armBox.w &&
      py >= armBox.y &&
      py <= armBox.y + armBox.h
    ) {
      triggerEnter()
      return
    }

    if (waterR > 0) {
      const dx = (px - waterCx) / waterR
      const dy = (py - waterCy) / waterR
      const distSq = dx * dx + dy * dy
      if (distSq <= 0.1) {
        triggerEnter()
        return
      }
      if (distSq <= 1.02) {
        ripplesRef.current.push({
          nx: dx * 0.9,
          ny: dy * 0.9,
          r: 0.03,
          maxR: 0.62,
          speed: 0.72,
        })
        spawnSplashDroplets(px, py, 6, 0.68)
      }
    }
  }

  return (
    <div
      ref={rootRef}
      onPointerMove={handlePointerMove}
      style={{ backgroundColor: PALETTE.floorBrownA }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-between p-6 sm:p-8 md:p-11 overflow-hidden select-none"
    >
      {/* Layer 1: Overhead Brownish Sunset Room, Table, Walnut Player & #0096FF Water Record */}
      <canvas
        ref={sceneCanvasRef}
        onClick={handleCanvasClick}
        className={`absolute inset-0 w-full h-full z-0 ${
          hoveringInteractive && !jumping ? 'cursor-pointer' : 'cursor-default'
        }`}
      />

      {/* Layer 2: Realistic WebGL #0096FF Fluid Burst & Gravity-Drop Shader */}
      <canvas
        ref={fluidCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full z-[15] pointer-events-none"
      />

      {/* Subtle vintage book-paper print grain (active at idle, fades cleanly when water erupts) */}
      <div
        aria-hidden="true"
        className={`dark-grain absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ${
          jumping ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* Top Editorial Book-Jacket Masthead */}
      <div
        className={`relative z-20 text-center pointer-events-none transition-all duration-400 ${
          jumping ? 'opacity-0 -translate-y-3' : 'opacity-100'
        }`}
      >
        <div className="font-pf-main font-medium text-2xl sm:text-3xl md:text-4xl uppercase tracking-[0.18em] text-[#1a0f09]">
          {PORTFOLIO_DATA.name}
        </div>
        <div className="font-pf-main italic text-sm sm:text-base text-[#1a0f09]/80 mt-0.5">
          water pressing · {rpmMode === 33 ? '33⅓' : '45'} rpm
        </div>
      </div>

      {/* Bottom CTA Stack + Whisper Metadata */}
      <div
        className={`relative z-20 w-full max-w-5xl flex flex-col items-center gap-5 transition-all duration-400 ${
          jumping ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex flex-col items-center gap-2.5">
          <button
            type="button"
            onClick={triggerEnter}
            className="group relative px-9 py-3 bg-[#f7e5c4] hover:bg-[#f8c353] text-[#1a0f09] border-2 border-[#1a0f09] shadow-[4px_4px_0px_#0b0604] hover:shadow-[2px_2px_0px_#0b0604] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all duration-150 cursor-pointer"
          >
            <span className="font-pf-label text-[12.5px] sm:text-[13.5px] uppercase tracking-[0.22em] font-medium">
              PLAY RECORD · ENTER
            </span>
          </button>

          <span className="font-pf-label text-[10.5px] uppercase tracking-[0.16em] text-[#1a0f09]/80">
            CLICK WATER TO RIPPLE · PRESS ENTER
          </span>
        </div>

        <div className="w-full flex items-center justify-between font-pf-label text-[11px] uppercase tracking-[0.16em] text-[#1a0f09]/80 pt-1">
          <span>@{PORTFOLIO_DATA.handle}</span>
          <button
            type="button"
            onClick={() => {
              if (!completedRef.current) {
                completedRef.current = true
                if (onComplete) onComplete()
              }
            }}
            className="text-[#1a0f09]/80 hover:text-[#1a0f09] underline-offset-4 hover:underline transition-colors cursor-pointer"
          >
            SKIP →
          </button>
        </div>
      </div>
    </div>
  )
}
