import { useCallback, useEffect, useRef, useState } from 'react'

const QUAD_VERT = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`

// Pass 1: 60fps Open-Ocean Shallow-Water Heightfield Simulation
// R = current water elevation h(t)
// G = previous water elevation h(t - dt)
// B = subtle lingering wake agitation (modulates micro-ripples & underwater caustics, NOT chalk paint)
// A = high-speed surface meniscus / micro-bubble shimmer right at fast cursor flicks
const WATER_SIM_FRAG = `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D uPrevState;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uTime;
  uniform vec2 uSegA;
  uniform vec2 uSegB;
  uniform float uSpeed;
  uniform float uPointerActive;

  const float WAKE_STRENGTH = 0.15;

  // tanh is not built into this GLSL version
  float tanh1(float x) {
    float e = exp(-2.0 * min(abs(x), 20.0));
    return sign(x) * (1.0 - e) / (1.0 + e);
  }

  float distToSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(1e-6, dot(ba, ba)), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    // Non-reflecting Sommerfeld open-water outflow at outermost offscreen texels
    if (
      vUv.x <= uTexel.x * 1.5 ||
      vUv.x >= 1.0 - uTexel.x * 1.5 ||
      vUv.y <= uTexel.y * 1.5 ||
      vUv.y >= 1.0 - uTexel.y * 1.5
    ) {
      vec2 inwardUv = clamp(vUv, uTexel * 2.5, 1.0 - uTexel * 2.5);
      vec4 interior = texture2D(uPrevState, inwardUv);
      gl_FragColor = vec4(interior.r * 0.92, interior.r * 0.92, 0.0, 0.0);
      return;
    }

    vec4 center = texture2D(uPrevState, vUv);
    vec4 nL = texture2D(uPrevState, vUv - vec2(uTexel.x, 0.0));
    vec4 nR = texture2D(uPrevState, vUv + vec2(uTexel.x, 0.0));
    vec4 nD = texture2D(uPrevState, vUv - vec2(0.0, uTexel.y));
    vec4 nU = texture2D(uPrevState, vUv + vec2(0.0, uTexel.y));

    float dLU = texture2D(uPrevState, vUv + vec2(-uTexel.x, uTexel.y)).r;
    float dRU = texture2D(uPrevState, vUv + vec2(uTexel.x, uTexel.y)).r;
    float dLD = texture2D(uPrevState, vUv + vec2(-uTexel.x, -uTexel.y)).r;
    float dRD = texture2D(uPrevState, vUv + vec2(uTexel.x, -uTexel.y)).r;

    float hCurr = center.r;
    float hPrev = center.g;

    // Smooth, isotropic 9-point shallow-water wave equation with natural water viscosity
    float avgNeighbors = (nL.r + nR.r + nD.r + nU.r) * 0.16 + (dLU + dRU + dLD + dRD) * 0.09;
    float rawNext = (avgNeighbors * 2.0 - hPrev) * 0.974;
    float hNext = mix(rawNext, avgNeighbors, 0.032);

    // Offscreen-only viscous velocity sponge (strictly outside visible [0.15..0.85] screen)
    vec2 over = max(max(vec2(0.145) - vUv, vUv - vec2(0.855)), vec2(0.0)) / 0.145;
    float offscreenDist = clamp(length(over), 0.0, 1.0);
    if (offscreenDist > 0.0) {
      float vel = hNext - hCurr;
      float velDamp = 1.0 - offscreenDist * offscreenDist * 0.38;
      hNext = (hCurr + vel * velDamp) * (1.0 - pow(offscreenDist, 2.6) * 0.18);
    }

    vec2 waveGrad = vec2(nR.r - nL.r, nU.r - nD.r);
    vec2 toCenter = vec2(0.5, 0.5) - vUv;
    float rCenter = length(vec2(toCenter.x * uAspect, toCenter.y));

    vec2 advUv = clamp(vUv - waveGrad * 0.006, uTexel * 2.0, 1.0 - uTexel * 2.0);
    float trailEnergy = mix(texture2D(uPrevState, advUv).b, (nL.b + nR.b + nD.b + nU.b) * 0.25, 0.16) * 0.962;
    float crestFoam = mix(center.a, (nL.a + nR.a + nD.a + nU.a) * 0.25, 0.22) * 0.915;

    // Smooth liquid trough displaced by cursor skimming the surface
    if (uPointerActive > 0.5) {
      vec2 segASim = vec2(0.15) + uSegA * 0.70;
      vec2 segBSim = vec2(0.15) + uSegB * 0.70;
      vec2 pA = vec2(vUv.x * uAspect, vUv.y);
      vec2 sA = vec2(segASim.x * uAspect, segASim.y);
      vec2 sB = vec2(segBSim.x * uAspect, segBSim.y);
      float d = distToSegment(pA, sA, sB);

      float moveAmt = clamp(uSpeed * 0.75, 0.0, 1.0);
      float rWake = 0.012;
      vec2 path = sB - sA;
      float len = length(path);
      if (len > 1e-6) {
        vec2 dir = path / len;
        float along = dot(pA - sA, dir);
        float across = dot(pA - sA, vec2(-dir.y, dir.x));
        float cover = 0.5 * (tanh1(1.25 * along / rWake) - tanh1(1.25 * (along - len) / rWake));
        float push = exp(-(across * across) / (rWake * rWake)) * cover;
        // uSegA..uSegB covers the last two steps, so each one gets half. This scheme treats
        // odd and even steps almost separately, which showed up as ribs on fast swipes.
        hNext -= push * 0.5 * WAKE_STRENGTH * smoothstep(0.0, 0.5, moveAmt);
      }

      // Sleek liquid wake ribbon advected by the ripples (gives the crisp water-meniscus reflection)
      float eRad = (0.0052 + 0.0040 * moveAmt) * 0.70;
      float eStroke = exp(-(d * d) / (eRad * eRad)) * clamp(uSpeed * 1.45, 0.0, 1.0);
      trailEnergy = clamp(max(trailEnergy, eStroke * 0.88) + eStroke * 0.18, 0.0, 1.15);

      float fRad = 0.0044 * 0.70;
      float fStroke = exp(-(d * d) / (fRad * fRad)) * clamp(uSpeed * 1.25, 0.0, 1.0);
      crestFoam = clamp(max(crestFoam, fStroke), 0.0, 1.0);
    }

    hNext = clamp(hNext, -1.2, 1.2);
    gl_FragColor = vec4(hNext, hCurr, trailEnergy, crestFoam);
  }
`

// Pass 2: Photorealistic Dark Water + Underwater Cenote/Abyssal Sinkhole Shader:
// - Exact 4-tap C2 Cubic B-Spline heightfield filtering (100% glass-smooth liquid normals, zero texel grid)
// - Snell's Law (IOR 1.333) underwater refraction of a dark submerged rock basin dropping off a cliff
//   into a bottomless #020204 underwater abyssal sinkhole in the center
// - Real Jacobian wave-focused underwater caustics + Beer-Lambert deep-water light absorption
// - Continuous ray-reflected nocturnal sky/mist dome (reflect(-V, N)) + Schlick Fresnel + GGX water specular
const PORTAL_FRAG = `
  precision highp float;
  varying vec2 vUv;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uCam;
  uniform vec2 uCursorUv;
  uniform float uPointerActive;
  uniform float uPull;
  uniform float uStare;
  uniform float uLook;
  uniform float uLookT;
  uniform float uDiveIn;
  uniform float uDive;
  uniform float uAperture;
  uniform float uIntroFade;
  uniform sampler2D uWaterTex;
  uniform vec2 uSimSize;
  uniform vec2 uSimTexel;
  uniform float uHasWaterSim;

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
    float a = 0.5;
    mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = m * p * 2.03 + vec2(11.3, 23.7);
      a *= 0.5;
    }
    return v;
  }

  // Exact 4-tap C2 Cubic B-Spline texture filter (eliminates all linear grid facets on water normals!)
  vec4 sampleBicubic(sampler2D tex, vec2 uv) {
    vec2 coord = uv * uSimSize - 0.5;
    vec2 i = floor(coord);
    vec2 f = coord - i;
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;

    vec2 o = vec2(1.0) - f;
    vec2 w0 = (o * o * o) / 6.0;
    vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
    vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
    vec2 w3 = f3 / 6.0;

    vec2 g0 = w0 + w1;
    vec2 g1 = w2 + w3;
    vec2 h0 = (i - 0.5 + w1 / max(g0, vec2(1e-5))) * uSimTexel;
    vec2 h1 = (i + 1.5 + w3 / max(g1, vec2(1e-5))) * uSimTexel;

    vec4 s00 = texture2D(tex, vec2(h0.x, h0.y));
    vec4 s10 = texture2D(tex, vec2(h1.x, h0.y));
    vec4 s01 = texture2D(tex, vec2(h0.x, h1.y));
    vec4 s11 = texture2D(tex, vec2(h1.x, h1.y));

    return mix(mix(s11, s01, g0.x), mix(s10, s00, g0.x), g0.y);
  }

  // Three octaves of noise, mostly broad with a little fine chop
  float ripple(vec2 p) {
    mat2 m = mat2(0.80, 0.60, -0.60, 0.80);
    vec2 q = m * p * 5.0;
    vec2 q2 = m * q * 2.1 + 7.3;
    vec2 q3 = m * q2 * 2.2 + 3.9;
    return (noise(q) - 0.5) + (noise(q2) - 0.5) * 0.40 + (noise(q3) - 0.5) * 0.13;
  }

  // Still water: a faint, unmoving unevenness so the reflection is not a perfect mirror
  float waterSurfaceHeight(vec2 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec2(0.86, 0.51)) * 7.5) * 0.0006;
    h += sin(dot(p, vec2(-0.62, 0.78)) * 10.2 + 1.4) * 0.0005;
    h += ripple(p) * 0.0022;
    return h;
  }

  // Slope of the finest ripples
  vec2 fineSlope(vec2 q) {
    return vec2(0.34, 0.94) * cos(dot(q, vec2(0.34, 0.94)) * 34.0)
         + vec2(-0.77, 0.64) * cos(dot(q, vec2(-0.77, 0.64)) * 47.0 + 1.7)
         + vec2(0.93, 0.36) * cos(dot(q, vec2(0.93, 0.36)) * 61.0 + 4.2);
  }

  // Unlit, moonless dark-blue night dome so curved water waves read as liquid without any bright light
  vec3 sampleDarkWaterEnv(vec3 R) {
    vec2 skyUv = R.xy / max(0.20, R.z + 0.38);
    float cloudA = fbm(skyUv * 1.7 + vec2(uTime * 0.010, -uTime * 0.007));
    float cloudB = fbm(skyUv * 3.4 - vec2(uTime * 0.012, uTime * 0.009));
    float tone = smoothstep(0.22, 0.82, cloudA * 0.65 + cloudB * 0.35);

    vec3 abyssNavy = vec3(0.012, 0.030, 0.068); // #030811 deep unlit midnight blue
    vec3 darkWater = vec3(0.032, 0.082, 0.158); // #081528 subdued dark-blue water sheen
    vec3 softCrest = vec3(0.062, 0.148, 0.265); // #102644 muted slate-blue wave fold (zero glare)

    vec3 env = mix(abyssNavy, darkWater, tone * 0.85);
    env = mix(env, softCrest, pow(tone, 2.2) * 0.65);
    return env;
  }

  // Dual-layer optical underwater caustic network
  float evalCaustics(vec2 p, float t) {
    vec2 a = p * 7.5 + vec2(t * 0.22, -t * 0.17);
    vec2 b = p * 11.2 - vec2(t * 0.19, t * 0.24) + vec2(3.7, 8.1);
    float c1 = 1.0 - abs(2.0 * noise(a) - 1.0);
    float c2 = 1.0 - abs(2.0 * noise(b) - 1.0);
    return pow(clamp(c1 * c2, 0.0, 1.0), 2.2) * 2.4;
  }

  // Physically based Trowbridge-Reitz GGX microfacet specular distribution for real liquid water
  float D_GGX(float NdotH, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float d = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
    return a2 / max(1e-5, 3.14159265 * d * d);
  }

  void main() {
    float minDim = max(1.0, min(uRes.x, uRes.y));
    float aspect = uRes.x / max(1.0, uRes.y);
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / minDim;

    float camDamp = 1.0 - smoothstep(0.0, 0.45, uDive);
    float diveFadeTrail = 1.0 - smoothstep(0.18, 0.78, uDive);

    // ================================================================
    // 1. SAMPLE BICUBIC-SMOOTHED INTERACTIVE SHALLOW-WATER WAVES
    // ================================================================
    float hSim = 0.0;
    vec2 simGrad = vec2(0.0);

    if (uHasWaterSim > 0.5) {
      vec2 waterUv = vec2(0.15) + vUv * 0.70;
      vec2 stepUv = uSimTexel * 1.15;

      vec4 cState = sampleBicubic(uWaterTex, waterUv);
      float hL = sampleBicubic(uWaterTex, waterUv - vec2(stepUv.x, 0.0)).r;
      float hR = sampleBicubic(uWaterTex, waterUv + vec2(stepUv.x, 0.0)).r;
      float hD = sampleBicubic(uWaterTex, waterUv - vec2(0.0, stepUv.y)).r;
      float hU = sampleBicubic(uWaterTex, waterUv + vec2(0.0, stepUv.y)).r;

      hSim = cState.r;
      simGrad = vec2(hR - hL, hU - hD);
    }

    // ================================================================
    // 2. 3D WATER SURFACE NORMALS & VIEW / SNELL / FRESNEL OPTICS
    // ================================================================
    vec2 p = uv - uCam * 0.030 * camDamp;
    float r = length(p);

    float funnelZoom = exp(uDive * 2.55);
    vec2 pWorld = p / funnelZoom;

    // Finite-difference gradient of ambient dark water waves
    float eps = 0.004;
    float h0 = waterSurfaceHeight(pWorld, uTime);
    float hx = waterSurfaceHeight(pWorld + vec2(eps, 0.0), uTime);
    float hy = waterSurfaceHeight(pWorld + vec2(0.0, eps), uTime);
    vec2 ambGrad = vec2(hx - h0, hy - h0) / eps;

    // Darkness under the water: same size always, it only fades. Gone, then faintly there, then gone.
    // How long you have been staring (0 = just moved, 1 = it has come all the way up)
    float stare = uStare * uStare * (3.0 - 2.0 * uStare);
    float diveOpen = smoothstep(0.0, 0.22, uDive);
    float baseThroat = 0.004 * funnelZoom;
    float aperturePush = 0.0;
    float sinkholeR = baseThroat + aperturePush;

    vec2 warp = vec2(noise(pWorld * 3.0), noise(pWorld * 3.0 + 4.7)) - 0.5;
    vec2 fp = pWorld + warp * 0.16;
    vec2 fine = fineSlope(fp);
    vec2 totalSlope = ambGrad * 1.25 + simGrad * 9.5 * diveFadeTrail + fine * 0.016;

    // The moment it notices you: a single swell rises from it and spreads out across the surface
    float ringCrest = 0.0;
    if (uLookT >= 0.0) {
      vec2 lookAt = (uCursorUv - 0.5) * uRes / minDim;
      vec2 ringFrom = lookAt / max(length(lookAt), 1e-3) * 0.05 * uPointerActive;
      vec2 dR = uv - ringFrom;
      float dist = length(dR);
      float ringR = 0.03 + uLookT * 0.26;
      float x = (dist - ringR) / 0.060;
      float ringSlope = -2.0 * x * exp(-x * x) * 0.055 * exp(-uLookT * 0.9);
      totalSlope += dR / max(dist, 1e-3) * ringSlope;
      ringCrest = exp(-x * x) * exp(-uLookT * 0.9) * smoothstep(0.0, 0.15, uLookT);
    }
    vec3 N = normalize(vec3(-totalSlope.x, -totalSlope.y, 1.0));
    // The moon only bends when the water is disturbed; the faint unevenness barely moves it
    vec2 wakeSlope = simGrad * 9.5 * diveFadeTrail;
    vec2 calmSlope = wakeSlope + (totalSlope - wakeSlope) * 0.08;
    vec3 Nmoon = normalize(vec3(-calmSlope.x, -calmSlope.y, 1.0));

    // Slightly oblique perspective view vector so water has realistic Fresnel sheen across the surface!
    vec3 V = normalize(vec3(-uv.x * 0.58, -uv.y * 0.58 - 0.30, 1.0));
    float NdotV = max(0.02, dot(N, V));

    // Physical Schlick Fresnel for air-to-water (IOR = 1.333 -> F0 = 0.02)
    float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

    // ================================================================
    // 3. UNLIT DEEP DARK-BLUE WATER & CENTRAL ABYSSAL SINKHOLE
    // ================================================================
    vec3 actOneVoid = vec3(0.00784, 0.00784, 0.01569); // Exact #020204 for seamless plunge handoff
    float plungeToAbyss = smoothstep(0.60, 1.0, uDive);  // late, so the shape's spread is seen first
    vec3 deepAbyssBlue = mix(vec3(0.010, 0.024, 0.056), actOneVoid, plungeToAbyss);

    float rockRimNoise = (fbm(pWorld * 5.2 + 3.1) - 0.5) * 0.28 * sinkholeR;
    float cliffMask = smoothstep(sinkholeR * mix(0.0, 0.78, diveOpen), sinkholeR * mix(2.6, 1.42, diveOpen), r + rockRimNoise);
    float waterDepth = mix(14.0, 0.85 + 0.65 * length(uv), cliffMask);

    // Snell's Law refraction into unlit dark-blue deep water (no cursor spotlight, no bright caustics)
    vec3 refrRay = refract(-V, N, 1.0 / 1.333);
    vec2 subP = pWorld + refrRay.xy * 0.18;
    float deepCurrent = fbm(subP * 4.5 + vec2(uTime * 0.02, -uTime * 0.015));

    vec3 submergedBlue = vec3(0.020, 0.056, 0.118) * (0.65 + 0.55 * deepCurrent);
    vec3 absorption = exp(-waterDepth * vec3(2.9, 1.65, 0.92));
    vec3 underwaterCol = mix(deepAbyssBlue, submergedBlue, cliffMask) * absorption
                       + deepAbyssBlue * (1.0 - absorption);

    // ================================================================
    // 4. DARK LIQUID SURFACE + CRISP CLEAR-BLUE CURSOR WATER REFLECTIONS
    // ================================================================
    vec3 R = reflect(-V, N);
    vec3 envReflect = sampleDarkWaterEnv(R) * (1.0 - plungeToAbyss * 0.88);

    float pitDim = 0.35 + 0.65 * cliffMask;
    vec3 col = mix(underwaterCol, envReflect * pitDim, clamp(fresnel * 2.1 + 0.08, 0.0, 0.88));

    // Soft glow of a hidden moon on the water (no disc), bent by the waves
    vec2 skyQ = R.xy / max(0.2, R.z);
    vec2 sheenD = (skyQ - vec2(-0.12, 0.58)) / vec2(0.62, 0.30);
    float sheen = exp(-dot(sheenD, sheenD));
    float onWater = (0.28 + 0.72 * cliffMask) * (1.0 - plungeToAbyss);
    vec3 Rm = reflect(-V, Nmoon);
    vec2 skyM = Rm.xy / max(0.2, Rm.z);
    vec2 pathD = (skyM - vec2(0.05, 0.44)) / vec2(0.17, 0.20);
    float glow = exp(-dot(pathD, pathD));
    col += (vec3(0.052, 0.076, 0.112) * sheen + vec3(0.070, 0.098, 0.138) * glow) * onWater * (1.0 - 0.55 * uLook);

    // "When you stare into the abyss, the abyss stares back."
    // Something far below: it rises into focus while you keep still, and turns toward you
    // when it is closest. It never grows; only its sharpness and darkness change.
    // On Enter it comes all the way up at once, then its darkness spreads and swallows everything
    float diveSpread = pow(smoothstep(0.0, 0.85, uDiveIn), 1.5);
    stare = max(stare, smoothstep(0.0, 0.35, uDiveIn));
    float faceYou = smoothstep(0.65, 1.0, stare) * uPointerActive;
    vec2 cursorAt = (uCursorUv - 0.5) * uRes / minDim;
    vec2 toYou = cursorAt / max(length(cursorAt), 1e-3);

    vec2 under = uv - uCam * 0.010 * camDamp;          // deeper than the surface, so it drifts less
    under += (totalSlope - wakeSlope) * mix(2.6, 1.4, stare) + wakeSlope * 0.8;  // seen through the ripples
    under -= toYou * (0.035 * faceYou + 0.030 * uLook * uPointerActive);  // edges toward you, lurches when it notices you
    float rr = length(under * vec2(1.0, 0.86));
    vec2 dir = under / max(rr, 1e-4);
    float morph = uTime * 0.035;
    float outline = 0.31 + 0.12 * (fbm(dir * 1.7 + vec2(morph, -morph * 0.7)) - 0.5) * 2.0;
    float reach = pow(max(0.0, sin(atan(dir.y, dir.x) * 5.0 + 3.0 * fbm(dir * 2.3 - morph))), 7.0);
    outline += reach * 0.13 * smoothstep(0.0, 0.5, fbm(dir * 3.1 + morph));
    // when it faces you, the side toward you reaches out further
    outline += pow(max(0.0, dot(dir, toYou)), 3.0) * 0.09 * faceYou;
    outline *= 1.0 + 4.6 * diveSpread;

    // far away it is a soft blur; closer it gets sharper (edge width shrinks around the same outline)
    float soft = mix(0.95, 0.36, stare);
    float murk = 1.0 - smoothstep(outline * (0.98 - soft), outline * (0.98 + soft), rr);
    float coreSoft = mix(0.75, 0.34, stare);
    float core = 1.0 - smoothstep(outline * (0.50 - coreSoft * 0.5), outline * (0.50 + coreSoft), rr);
    // its reaching edges arrive first, the dark core only when it is close
    float murkShow = smoothstep(0.0, 0.55, stare);
    float coreShow = smoothstep(0.35, 1.0, stare);
    float depthShade = sqrt(clamp(murk * 0.60 * murkShow + core * 0.40 * coreShow, 0.0, 1.0));
    float alive = 0.94 + 0.06 * sin(uTime * 0.7);
    float presence = depthShade * mix(0.35, 0.96, stare) * alive * (1.0 + 0.12 * uLook);
    presence = clamp(mix(presence, depthShade, diveSpread), 0.0, 1.0);
    // faint light scattered deep in the water, which the shape blocks
    float deepLight = (1.0 - smoothstep(0.05, 0.75, length(uv * vec2(0.85, 1.0)))) * (1.0 - plungeToAbyss);
    col += vec3(0.016, 0.030, 0.055) * deepLight * (1.0 + 1.8 * smoothstep(0.0, 0.3, uDiveIn));  // the deep light flares as it comes for you
    col = mix(col, mix(vec3(0.002, 0.004, 0.009), actOneVoid, diveSpread), presence);
    float shapeHole = core * coreShow;

    // Surface texture: each tiny ripple faces a little toward or away from the moonlit sky
    vec2 texSlope = totalSlope - wakeSlope;
    float facing = dot(texSlope, normalize(vec2(0.10, 0.85)));
    col += vec3(0.045, 0.065, 0.095) * clamp(facing * 26.0, -1.0, 1.0) * (0.40 + 0.60 * sheen) * onWater;
    col += vec3(0.050, 0.072, 0.105) * ringCrest * onWater;  // the swell catches a little light

    // Pure specular water reflections ONLY (zero painted light-blue cursor trail —
    // only the actual curved 3D water wave slopes catch wet specular reflections!)
    float waterGlint = 0.0;

    if (uPointerActive > 0.5) {
      // Crisp droplet glint right at the live cursor tip (no trailing paint)
      vec2 curD = vec2((vUv.x - uCursorUv.x) * aspect, vUv.y - uCursorUv.y) * (uRes.y / 780.0);
      float rCur = length(curD);
      float dropCore = exp(-pow(rCur / 0.0042, 2.0)) * 0.92;
      float tensionRing = exp(-pow((rCur - 0.0095) / 0.0015, 2.0)) * 0.30;
      waterGlint = max(waterGlint, (dropCore + tensionRing) * diveFadeTrail);
    }

    // Specular glints strictly along the curved 3D slopes of the transparent water ripples
    vec3 wLightA = normalize(vec3(-0.38, 0.54, 0.75));
    vec3 wLightB = normalize(vec3(0.45, -0.42, 0.78));
    float rSpecA = pow(max(0.0, dot(N, normalize(wLightA + V))), 52.0);
    float rSpecB = pow(max(0.0, dot(N, normalize(wLightB + V))), 62.0);
    float simSlope = clamp(length(simGrad) * 12.0, 0.0, 1.0);

    float rippleSpecular = (rSpecA * 1.10 + rSpecB * 0.82) * smoothstep(0.014, 0.075, simSlope);
    waterGlint = clamp(waterGlint + rippleSpecular * diveFadeTrail, 0.0, 1.0);

    vec3 wetReflectTint = vec3(0.78, 0.91, 1.00);
    col = mix(col, wetReflectTint, waterGlint * 0.92);

    // Deep dark-blue outer depth vignette -> deepens smoothly into #020204 during plunge
    float outerVig = mix(0.32, 1.0, smoothstep(1.18, 0.22, length(uv)));
    col = mix(deepAbyssBlue, col, outerVig * (1.0 - plungeToAbyss * 0.80));

    float dither = (hash21(gl_FragCoord.xy + fract(uTime * 7.13) * 137.0) - 0.5) / 255.0;
    col = clamp(col + vec3(dither), 0.0, 1.0);

    // ================================================================
    // 5. TRUE-ALPHA APERTURE HANDOFF INTO ACT I'S STARLESS #020204 VOID
    // ================================================================
    float throatMask = 1.0 - shapeHole * smoothstep(0.30, 0.85, diveSpread);
    col = mix(actOneVoid, col, mix(1.0, throatMask, smoothstep(0.0, 0.38, uAperture)));

    float eyeOpen = smoothstep(0.0, 0.55, uAperture) * (1.0 - throatMask);
    float finalSweep = smoothstep(0.74, 1.0, uAperture);
    float alpha = clamp(1.0 - max(eyeOpen, finalSweep), 0.0, 1.0) * uIntroFade;

    gl_FragColor = vec4(col, alpha);
  }
`

function compileProgram(gl, vsSrc, fsSrc) {
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

  const vs = compile(gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc)
  if (!vs || !fs) return null

  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return null
  }
  return { prog, vs, fs }
}

function createWaterSimTargets(gl, isWebGL2, simW, simH) {
  let internalFormat = gl.RGBA
  let format = gl.RGBA
  let type = null

  if (isWebGL2) {
    const extFloatBuf = gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')
    if (extFloatBuf) {
      internalFormat = gl.RGBA16F
      format = gl.RGBA
      type = gl.HALF_FLOAT
    }
  } else {
    const extHalf = gl.getExtension('OES_texture_half_float')
    const extHalfLin = gl.getExtension('OES_texture_half_float_linear')
    if (extHalf && extHalfLin) {
      type = extHalf.HALF_FLOAT_OES
    } else {
      const extFloat = gl.getExtension('OES_texture_float')
      const extFloatLin = gl.getExtension('OES_texture_float_linear')
      if (extFloat && extFloatLin) {
        type = gl.FLOAT
      }
    }
  }

  if (type === null) return null

  const targets = []
  for (let i = 0; i < 2; i++) {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, simW, simH, 0, format, type, null)

    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fbo)
      gl.deleteTexture(tex)
      for (const t of targets) {
        gl.deleteFramebuffer(t.fbo)
        gl.deleteTexture(t.tex)
      }
      return null
    }

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    targets.push({ tex, fbo })
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return { targets, simW, simH, readIdx: 0 }
}

function initPortalGL(canvas) {
  const ctxOpts = {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    powerPreference: 'high-performance',
  }
  let gl = canvas.getContext('webgl2', ctxOpts)
  const isWebGL2 = Boolean(gl)
  if (!gl) {
    gl = canvas.getContext('webgl', ctxOpts)
  }
  if (!gl) return null

  const simProgObj = compileProgram(gl, QUAD_VERT, WATER_SIM_FRAG)
  const mainProgObj = compileProgram(gl, QUAD_VERT, PORTAL_FRAG)
  if (!simProgObj || !mainProgObj) return null

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )

  const bindQuad = (prog) => {
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  }
  bindQuad(simProgObj.prog)
  bindQuad(mainProgObj.prog)

  return {
    gl,
    isWebGL2,
    buf,
    sim: {
      ...simProgObj,
      loc: {
        uPrevState: gl.getUniformLocation(simProgObj.prog, 'uPrevState'),
        uTexel: gl.getUniformLocation(simProgObj.prog, 'uTexel'),
        uAspect: gl.getUniformLocation(simProgObj.prog, 'uAspect'),
        uTime: gl.getUniformLocation(simProgObj.prog, 'uTime'),
        uSegA: gl.getUniformLocation(simProgObj.prog, 'uSegA'),
        uSegB: gl.getUniformLocation(simProgObj.prog, 'uSegB'),
        uSpeed: gl.getUniformLocation(simProgObj.prog, 'uSpeed'),
        uPointerActive: gl.getUniformLocation(simProgObj.prog, 'uPointerActive'),
      },
    },
    main: {
      ...mainProgObj,
      loc: {
        uRes: gl.getUniformLocation(mainProgObj.prog, 'uRes'),
        uTime: gl.getUniformLocation(mainProgObj.prog, 'uTime'),
        uCam: gl.getUniformLocation(mainProgObj.prog, 'uCam'),
        uCursorUv: gl.getUniformLocation(mainProgObj.prog, 'uCursorUv'),
        uPointerActive: gl.getUniformLocation(mainProgObj.prog, 'uPointerActive'),
        uPull: gl.getUniformLocation(mainProgObj.prog, 'uPull'),
        uStare: gl.getUniformLocation(mainProgObj.prog, 'uStare'),
        uLook: gl.getUniformLocation(mainProgObj.prog, 'uLook'),
        uLookT: gl.getUniformLocation(mainProgObj.prog, 'uLookT'),
        uDiveIn: gl.getUniformLocation(mainProgObj.prog, 'uDiveIn'),
        uDive: gl.getUniformLocation(mainProgObj.prog, 'uDive'),
        uAperture: gl.getUniformLocation(mainProgObj.prog, 'uAperture'),
        uIntroFade: gl.getUniformLocation(mainProgObj.prog, 'uIntroFade'),
        uWaterTex: gl.getUniformLocation(mainProgObj.prog, 'uWaterTex'),
        uSimSize: gl.getUniformLocation(mainProgObj.prog, 'uSimSize'),
        uSimTexel: gl.getUniformLocation(mainProgObj.prog, 'uSimTexel'),
        uHasWaterSim: gl.getUniformLocation(mainProgObj.prog, 'uHasWaterSim'),
      },
    },
  }
}

// Water simulation runs on its own clock so it moves the same at 60Hz, 120Hz or 144Hz
const SIM_STEP = 1 / 120
const MAX_SIM_STEPS = 6

// The abyss: seconds of stillness before it starts to rise, seconds to come all the way up,
// and seconds to vanish once you move
const STARE_DELAY = 1.2
const STARE_RISE = 7
const STARE_SINK = 0.6

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

  const [plunging, setPlunging] = useState(false)
  const [nearChasm, setNearChasm] = useState(false)
  const [uiEntered, setUiEntered] = useState(!isReplay)

  const plungeStartRef = useRef(null)
  const apertureOpenedRef = useRef(false)
  const completedRef = useRef(false)
  const reducedMotionRef = useRef(false)

  const pointerRef = useRef({
    active: false,
    uvX: 0.5,
    uvY: 0.5,
    smoothUvX: 0.5,
    smoothUvY: 0.5,
    prevSimUvX: 0.5,
    prevSimUvY: 0.5,
    tailUvX: 0.5,
    tailUvY: 0.5,
    camX: 0,
    camY: 0,
    targetCamX: 0,
    targetCamY: 0,
    hoverPull: 0,
    scrollPull: 0,
    smoothPull: 0,
    stare: 0,
    lastMoveTs: -1e9,
    looked: false,
    lookStart: -1e9,
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

  const handleQuickSkip = useCallback(
    (e) => {
      if (e) e.stopPropagation()
      if (completedRef.current) return
      completedRef.current = true
      if (onSkip) {
        onSkip()
      } else if (onComplete) {
        onComplete()
      }
    },
    [onComplete, onSkip],
  )

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
      pointerRef.current.lastMoveTs = performance.now()
      if (plungeStartRef.current !== null) return
      if (e.deltaY > 0) {
        const next = Math.min(1, pointerRef.current.scrollPull + Math.min(0.42, e.deltaY * 0.003))
        pointerRef.current.scrollPull = next
        if (next >= 0.85) {
          triggerPlunge()
        }
      } else if (e.deltaY < 0) {
        pointerRef.current.scrollPull = Math.max(0, pointerRef.current.scrollPull + e.deltaY * 0.002)
      }
    }

    const onTouchStart = (e) => {
      const t = e.touches[0]
      if (!t) return
      pointerRef.current.lastMoveTs = performance.now()
      touchStartY = t.clientY
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      const ux = t.clientX / w
      const uy = 1 - t.clientY / h
      const p = pointerRef.current
      p.active = true
      p.uvX = ux
      p.uvY = uy
      p.smoothUvX = ux
      p.smoothUvY = uy
      p.prevSimUvX = ux
      p.prevSimUvY = uy
      p.tailUvX = ux
      p.tailUvY = uy
    }

    const onTouchMove = (e) => {
      const t = e.touches[0]
      if (!t) return
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      pointerRef.current.active = true
      pointerRef.current.lastMoveTs = performance.now()
      pointerRef.current.uvX = t.clientX / w
      pointerRef.current.uvY = 1 - t.clientY / h

      if (touchStartY === null || plungeStartRef.current !== null) return
      const dy = touchStartY - t.clientY
      if (dy > 58) {
        triggerPlunge()
      } else if (dy > 0) {
        pointerRef.current.scrollPull = Math.max(pointerRef.current.scrollPull, dy / 64)
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
    pointerRef.current.hoverPull = nearChasm ? 0.65 : 0
  }, [nearChasm])

  useEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas) return undefined

    const glState = initPortalGL(canvas)
    let simState = null
    let lastAspectBucket = 0

    const destroySim = () => {
      if (!simState || !glState) return
      const { gl } = glState
      for (const t of simState.targets) {
        gl.deleteFramebuffer(t.fbo)
        gl.deleteTexture(t.tex)
      }
      simState = null
    }

    const mountTs = performance.now()
    let lastTs = mountTs
    let rafId = 0
    let simClock = 0

    const render = (ts) => {
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) * 0.001))
      lastTs = ts

      const isReduced = reducedMotionRef.current
      const totalDuration = isReduced ? 0.95 : 4.3
      const apertureStart = isReduced ? 0.2 : 2.7
      const introFade = isReplay ? Math.min(1, (ts - mountTs) / 620) : 1

      let diveU = 0
      let diveInU = 0
      let apertureU = 0
      if (plungeStartRef.current !== null) {
        const elapsed = Math.max(0, (ts - plungeStartRef.current) * 0.001)
        const rawU = Math.min(1, elapsed / totalDuration)
        diveU = isReduced ? rawU * 0.22 : quinticInOut(rawU)
        // the darkness creeps out and swallows the screen, holds black briefly, then the next page appears through it
        const swallowU = Math.min(1, elapsed / (apertureStart - 0.3))
        diveInU = isReduced ? rawU : swallowU * swallowU * (3 - 2 * swallowU)

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
        pointerRef.current.scrollPull = Math.max(0, pointerRef.current.scrollPull - dt * 0.32)
      }

      const p = pointerRef.current
      const targetPull = Math.min(1, Math.max(p.hoverPull, p.scrollPull))
      p.smoothPull += (targetPull - p.smoothPull) * Math.min(1, dt * 4.5)

      // Staring: after a moment of stillness it slowly rises; any movement sends it down fast
      const stillFor = (ts - p.lastMoveTs) * 0.001
      if (stillFor > STARE_DELAY) {
        p.stare = Math.min(1, p.stare + dt / STARE_RISE)
      } else if (stillFor < 0.2) {
        p.stare = Math.max(0, p.stare - dt / STARE_SINK)
      }

      // The moment it notices you: once per stare, when it has come all the way up
      if (p.stare >= 1 && !p.looked && plungeStartRef.current === null) {
        p.looked = true
        p.lookStart = ts
      }
      if (p.stare < 0.3) p.looked = false
      const sinceLook = (ts - p.lookStart) * 0.001
      const lookT = sinceLook >= 0 && sinceLook < 4 ? sinceLook : -1
      const look = sinceLook < 0 ? 0 : sinceLook < 0.25 ? sinceLook / 0.25 : Math.max(0, 1 - (sinceLook - 0.25) / 1.8)
      p.camX += (p.targetCamX - p.camX) * Math.min(1, dt * 3.5)
      p.camY += (p.targetCamY - p.camY) * Math.min(1, dt * 3.5)

      p.smoothUvX += (p.uvX - p.smoothUvX) * Math.min(1, dt * 28.0)
      p.smoothUvY += (p.uvY - p.smoothUvY) * Math.min(1, dt * 28.0)

      if (glState) {
        const { gl, isWebGL2, buf, sim, main } = glState
        const dpr = Math.min(window.devicePixelRatio || 1, 1.85)
        const rect = canvas.getBoundingClientRect()
        const pw = Math.max(1, Math.round(rect.width * dpr))
        const ph = Math.max(1, Math.round(rect.height * dpr))
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw
          canvas.height = ph
        }

        const aspect = pw / ph
        const aspectBucket = Math.round(aspect * 20)
        if (!simState || aspectBucket !== lastAspectBucket) {
          destroySim()
          lastAspectBucket = aspectBucket
          const simH = 512
          const simW = Math.max(320, Math.min(1100, Math.round(simH * aspect)))
          simState = createWaterSimTargets(gl, isWebGL2, simW, simH)
        }

        const timeSec = (isReduced ? ts * 0.00015 : ts * 0.001) % 3600
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)

        // ============================================================
        // STEP 1: SHALLOW-WATER WAVE SIMULATION
        // ============================================================
        simClock = Math.min(simClock + dt, SIM_STEP * MAX_SIM_STEPS)
        const steps = Math.floor(simClock / SIM_STEP + 1e-3)

        if (simState && steps > 0) {
          simClock = Math.max(0, simClock - steps * SIM_STEP)
          const { targets, simW, simH } = simState
          const dxAspect = (p.smoothUvX - p.prevSimUvX) * aspect
          const dyAspect = p.smoothUvY - p.prevSimUvY
          const cursorSpeed = Math.hypot(dxAspect, dyAspect) / (steps * SIM_STEP)

          gl.useProgram(sim.prog)
          const posLoc = gl.getAttribLocation(sim.prog, 'aPos')
          gl.enableVertexAttribArray(posLoc)
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

          gl.viewport(0, 0, simW, simH)
          gl.uniform1i(sim.loc.uPrevState, 0)
          gl.uniform2f(sim.loc.uTexel, 1 / simW, 1 / simH)
          gl.uniform1f(sim.loc.uAspect, aspect)
          gl.uniform1f(sim.loc.uTime, timeSec)
          gl.uniform1f(sim.loc.uSpeed, cursorSpeed)
          gl.uniform1f(sim.loc.uPointerActive, p.active ? 1.0 : 0.0)

          const fromX = p.prevSimUvX
          const fromY = p.prevSimUvY
          const moveX = p.smoothUvX - fromX
          const moveY = p.smoothUvY - fromY

          for (let step = 0; step < steps; step++) {
            const readIdx = simState.readIdx
            const writeIdx = 1 - readIdx

            gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIdx].fbo)
            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, targets[readIdx].tex)

            const a = step / steps
            const b = (step + 1) / steps
            gl.uniform2f(sim.loc.uSegA, p.tailUvX, p.tailUvY)
            gl.uniform2f(sim.loc.uSegB, fromX + moveX * b, fromY + moveY * b)
            p.tailUvX = fromX + moveX * a
            p.tailUvY = fromY + moveY * a

            gl.drawArrays(gl.TRIANGLES, 0, 6)
            simState.readIdx = writeIdx
          }

          p.prevSimUvX = p.smoothUvX
          p.prevSimUvY = p.smoothUvY
        }

        // ============================================================
        // STEP 2: RENDER PHOTOREALISTIC DARK WATER & ABYSSAL SINKHOLE
        // ============================================================
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, pw, ph)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)

        gl.useProgram(main.prog)
        const mainPosLoc = gl.getAttribLocation(main.prog, 'aPos')
        gl.enableVertexAttribArray(mainPosLoc)
        gl.vertexAttribPointer(mainPosLoc, 2, gl.FLOAT, false, 0, 0)

        gl.uniform2f(main.loc.uRes, pw, ph)
        gl.uniform1f(main.loc.uTime, timeSec)
        gl.uniform2f(main.loc.uCam, p.camX, p.camY)
        gl.uniform2f(main.loc.uCursorUv, p.smoothUvX, p.smoothUvY)
        gl.uniform1f(main.loc.uPointerActive, p.active ? 1.0 : 0.0)
        gl.uniform1f(main.loc.uPull, p.smoothPull)
        gl.uniform1f(main.loc.uStare, p.stare)
        gl.uniform1f(main.loc.uLook, look * p.stare)
        gl.uniform1f(main.loc.uLookT, lookT)
        gl.uniform1f(main.loc.uDiveIn, diveInU)
        gl.uniform1f(main.loc.uDive, diveU)
        gl.uniform1f(main.loc.uAperture, apertureU)
        gl.uniform1f(main.loc.uIntroFade, introFade)

        if (simState) {
          gl.activeTexture(gl.TEXTURE0)
          gl.bindTexture(gl.TEXTURE_2D, simState.targets[simState.readIdx].tex)
          gl.uniform1i(main.loc.uWaterTex, 0)
          gl.uniform2f(main.loc.uSimSize, simState.simW, simState.simH)
          gl.uniform2f(main.loc.uSimTexel, 1 / simState.simW, 1 / simState.simH)
          gl.uniform1f(main.loc.uHasWaterSim, 1.0)
        } else {
          gl.uniform1f(main.loc.uHasWaterSim, 0.0)
        }

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      } else if (fallbackBgRef.current) {
        fallbackBgRef.current.style.opacity = ((1 - apertureU) * introFade).toFixed(3)
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafId)
      destroySim()
      if (glState) {
        const { gl, buf, sim, main } = glState
        gl.deleteBuffer(buf)
        gl.deleteProgram(sim.prog)
        gl.deleteShader(sim.vs)
        gl.deleteShader(sim.fs)
        gl.deleteProgram(main.prog)
        gl.deleteShader(main.vs)
        gl.deleteShader(main.fs)
      }
    }
  }, [isReplay, onApertureOpen, onComplete])

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ux = (e.clientX - rect.left) / Math.max(1, rect.width)
    const uy = 1 - (e.clientY - rect.top) / Math.max(1, rect.height)
    const p = pointerRef.current
    p.lastMoveTs = performance.now()

    if (!p.active) {
      p.active = true
      p.smoothUvX = ux
      p.smoothUvY = uy
      p.prevSimUvX = ux
      p.prevSimUvY = uy
      p.tailUvX = ux
      p.tailUvY = uy
    }
    p.uvX = ux
    p.uvY = uy
    p.targetCamX = (ux - 0.5) * 2
    p.targetCamY = (uy - 0.5) * 2

    const minDim = Math.max(1, Math.min(rect.width, rect.height))
    const cx = (e.clientX - (rect.left + rect.width * 0.5)) / minDim
    const cy = (rect.top + rect.height * 0.5 - e.clientY) / minDim
    const isClose = Math.hypot(cx, cy) < 0.22
    if (isClose !== nearChasm) {
      setNearChasm(isClose)
    }
  }

  const handlePointerLeave = () => {
    pointerRef.current.active = false
    setNearChasm(false)
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={triggerPlunge}
      className="fixed inset-0 z-50 bg-transparent flex items-center justify-center overflow-hidden select-none cursor-none"
    >
      {/* Non-WebGL fallback */}
      <div
        ref={fallbackBgRef}
        aria-hidden="true"
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          opacity: 0,
          background:
            'radial-gradient(circle at 50% 50%, #02040a 0%, #02040a 22%, #061224 48%, #030914 80%, #02040a 100%)',
        }}
      />

      {/* Real-Time Unlit Dark-Blue Water & Submerged Abyssal Sinkhole */}
      <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Minimal Threshold Cue Over the Central Underwater Sinkhole */}
      <button
        type="button"
        onClick={triggerPlunge}
        onFocus={() => setNearChasm(true)}
        onBlur={() => setNearChasm(false)}
        aria-label="Enter"
        className={`group relative z-20 w-36 h-36 flex items-center justify-center cursor-none focus-visible:outline-none transition-all duration-700 ${
          plunging
            ? 'opacity-0 scale-75 blur-[3px] pointer-events-none'
            : uiEntered
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-95'
        }`}
      >
        <span
          className={`font-pf-label text-[11px] uppercase transition-all duration-500 ${
            nearChasm
              ? 'tracking-[0.54em] pl-[0.54em] text-sky-200/80'
              : 'tracking-[0.44em] pl-[0.44em] text-sky-200/38'
          }`}
        >
          ENTER
        </span>
      </button>

      {/* Quiet corner skip */}
      <button
        type="button"
        onClick={handleQuickSkip}
        className={`fixed bottom-7 right-8 z-20 font-pf-label text-[10px] uppercase tracking-[0.22em] text-sky-200/24 hover:text-sky-100/75 transition-all duration-500 cursor-none ${
          plunging ? 'opacity-0 pointer-events-none' : uiEntered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        SKIP →
      </button>
    </div>
  )
}
