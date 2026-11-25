// Crisp pop-surreal graphic SVG artwork inspired by Yusuke Nakamura's iconic flat-color + ink-line aesthetic
// (vermilion red, mustard gold, cerulean sky, vintage ivory, emerald mint, midnight ink).
// Automatically replaced tile-by-tile whenever real images are placed in public/art/nakamura/01.jpg .. 18.jpg.

const PALETTES = [
  { bg: '#f4ecdc', pri: '#d63329', sec: '#1c5d99', acc: '#e8a824', ink: '#141318' }, // Classic AKFG Fanclub / Summer
  { bg: '#e8eff5', pri: '#1f4e79', sec: '#d9483b', acc: '#f2b705', ink: '#12151c' }, // Cerulean Nostalgia
  { bg: '#f5e4c8', pri: '#c92a2a', sec: '#2b8a6e', acc: '#1d3557', ink: '#161214' }, // Tatami Vintage Ivory
  { bg: '#dceee8', pri: '#1864ab', sec: '#e03131', acc: '#f08c00', ink: '#11161b' }, // Mint & Cobalt
  { bg: '#181c2e', pri: '#e03131', sec: '#f5c438', acc: '#4dabf7', ink: '#f5efe2' }, // Night Is Short Nocturne
  { bg: '#f3e7de', pri: '#2f6f4e', sec: '#d94136', acc: '#e9b44c', ink: '#151419' }, // Retro Record Sleeve
]

function encodeSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function buildTileSvg(index) {
  const p = PALETTES[index % PALETTES.length]
  const motif = index % 6
  let inner = ''

  if (motif === 0) {
    // Vinyl record + sunbeam fan + guitar headstock silhouette
    inner = `
      <rect width="240" height="240" fill="${p.bg}"/>
      <path d="M0 165 L240 120 L240 240 L0 240 Z" fill="${p.sec}" opacity="0.9"/>
      <circle cx="122" cy="112" r="76" fill="${p.ink}" stroke="${p.ink}" stroke-width="3"/>
      <circle cx="122" cy="112" r="56" fill="none" stroke="${p.bg}" stroke-width="1.2" opacity="0.35"/>
      <circle cx="122" cy="112" r="40" fill="none" stroke="${p.bg}" stroke-width="1.2" opacity="0.35"/>
      <circle cx="122" cy="112" r="24" fill="${p.pri}"/>
      <circle cx="122" cy="112" r="5" fill="${p.bg}"/>
      <path d="M22 44 L92 114 M22 54 L84 116" stroke="${p.acc}" stroke-width="5" stroke-linecap="round"/>
      <circle cx="196" cy="46" r="18" fill="${p.acc}" stroke="${p.ink}" stroke-width="2.5"/>
    `
  } else if (motif === 1) {
    // Surreal geometric Ferris wheel & twilight crescent
    inner = `
      <rect width="240" height="240" fill="${p.bg}"/>
      <rect x="0" y="150" width="240" height="90" fill="${p.pri}"/>
      <circle cx="120" cy="116" r="68" fill="none" stroke="${p.ink}" stroke-width="3"/>
      <circle cx="120" cy="116" r="46" fill="none" stroke="${p.sec}" stroke-width="2"/>
      <line x1="52" y1="116" x2="188" y2="116" stroke="${p.ink}" stroke-width="2"/>
      <line x1="120" y1="48" x2="120" y2="184" stroke="${p.ink}" stroke-width="2"/>
      <line x1="72" y1="68" x2="168" y2="164" stroke="${p.ink}" stroke-width="2"/>
      <line x1="168" y1="68" x2="72" y2="164" stroke="${p.ink}" stroke-width="2"/>
      <path d="M90 220 L120 116 L150 220" fill="none" stroke="${p.ink}" stroke-width="3.5"/>
      <circle cx="120" cy="48" r="7" fill="${p.acc}" stroke="${p.ink}" stroke-width="2"/>
      <circle cx="188" cy="116" r="7" fill="${p.acc}" stroke="${p.ink}" stroke-width="2"/>
      <circle cx="52" cy="116" r="7" fill="${p.acc}" stroke="${p.ink}" stroke-width="2"/>
      <path d="M36 30 A20 20 0 1 0 58 54 A15 15 0 1 1 36 30 Z" fill="${p.acc}" stroke="${p.ink}" stroke-width="2"/>
    `
  } else if (motif === 2) {
    // Electric guitar body + geometric soundwave stripes
    inner = `
      <rect width="240" height="240" fill="${p.bg}"/>
      <circle cx="176" cy="64" r="52" fill="${p.acc}"/>
      <path d="M0 24 L240 24 M0 38 L240 38 M0 52 L240 52" stroke="${p.sec}" stroke-width="2.5" opacity="0.65"/>
      <rect x="108" y="16" width="24" height="118" fill="${p.ink}"/>
      <path d="M68 128 C54 148 56 196 90 212 C110 222 132 222 152 212 C184 196 186 150 172 128 C160 112 142 122 138 112 L102 112 C98 122 80 112 68 128 Z" fill="${p.pri}" stroke="${p.ink}" stroke-width="3"/>
      <rect x="98" y="148" width="44" height="14" rx="4" fill="${p.bg}" stroke="${p.ink}" stroke-width="2"/>
      <rect x="98" y="174" width="44" height="10" rx="3" fill="${p.ink}"/>
      <line x1="114" y1="16" x2="114" y2="184" stroke="${p.bg}" stroke-width="1"/>
      <line x1="120" y1="16" x2="120" y2="184" stroke="${p.bg}" stroke-width="1"/>
      <line x1="126" y1="16" x2="126" y2="184" stroke="${p.bg}" stroke-width="1"/>
    `
  } else if (motif === 3) {
    // Nostalgic train window looking onto summer clouds & sea
    inner = `
      <rect width="240" height="240" fill="${p.pri}"/>
      <rect x="26" y="26" width="188" height="162" rx="18" fill="${p.sec}" stroke="${p.ink}" stroke-width="3.5"/>
      <rect x="26" y="136" width="188" height="52" rx="4" fill="${p.bg}"/>
      <circle cx="158" cy="76" r="24" fill="${p.acc}" stroke="${p.ink}" stroke-width="2.5"/>
      <path d="M44 108 Q64 82 90 96 Q110 78 134 104 L134 120 L44 120 Z" fill="${p.bg}" stroke="${p.ink}" stroke-width="2.5"/>
      <line x1="26" y1="136" x2="214" y2="136" stroke="${p.ink}" stroke-width="3"/>
      <line x1="120" y1="26" x2="120" y2="188" stroke="${p.ink}" stroke-width="3"/>
      <circle cx="80" cy="214" r="10" fill="${p.acc}" stroke="${p.ink}" stroke-width="2"/>
      <circle cx="160" cy="214" r="10" fill="${p.acc}" stroke="${p.ink}" stroke-width="2"/>
    `
  } else if (motif === 4) {
    // Surreal cassette tape + floating stars & geometric ribbon
    inner = `
      <rect width="240" height="240" fill="${p.bg}"/>
      <path d="M0 0 L240 0 L240 90 Q120 130 0 90 Z" fill="${p.sec}"/>
      <rect x="34" y="66" width="172" height="112" rx="12" fill="${p.pri}" stroke="${p.ink}" stroke-width="3"/>
      <rect x="52" y="84" width="136" height="48" rx="6" fill="${p.bg}" stroke="${p.ink}" stroke-width="2.5"/>
      <circle cx="86" cy="108" r="15" fill="${p.ink}"/>
      <circle cx="86" cy="108" r="6" fill="${p.acc}"/>
      <circle cx="154" cy="108" r="15" fill="${p.ink}"/>
      <circle cx="154" cy="108" r="6" fill="${p.acc}"/>
      <path d="M66 178 L78 152 L162 152 L174 178 Z" fill="${p.acc}" stroke="${p.ink}" stroke-width="2.5"/>
      <polygon points="196,24 201,38 216,38 204,46 208,60 196,52 184,60 188,46 176,38 191,38" fill="${p.acc}"/>
    `
  } else {
    // Geometric prism sun, paper crane & stacked art books
    inner = `
      <rect width="240" height="240" fill="${p.bg}"/>
      <circle cx="120" cy="96" r="62" fill="${p.acc}" stroke="${p.ink}" stroke-width="3"/>
      <polygon points="120,38 176,138 64,138" fill="${p.pri}" stroke="${p.ink}" stroke-width="3"/>
      <polygon points="120,70 150,124 90,124" fill="${p.bg}" stroke="${p.ink}" stroke-width="2"/>
      <rect x="24" y="164" width="192" height="24" fill="${p.sec}" stroke="${p.ink}" stroke-width="2.5"/>
      <rect x="38" y="188" width="164" height="24" fill="${p.pri}" stroke="${p.ink}" stroke-width="2.5"/>
      <line x1="62" y1="164" x2="62" y2="188" stroke="${p.bg}" stroke-width="2.5"/>
      <line x1="172" y1="188" x2="172" y2="212" stroke="${p.acc}" stroke-width="2.5"/>
    `
  }

  return encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">${inner}</svg>`,
  )
}

export const NAKAMURA_FALLBACK_TILES = Array.from({ length: 18 }, (_, i) => buildTileSvg(i))

// Bespoke minimalist fallback cover emblems for the 9 Top-3 items until user drops real cover art in public/art/covers/
export const COVER_FALLBACKS = {
  'code-geass': encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0d060a"/><path d="M18 36 C32 22 44 38 48 56 C52 38 64 22 78 36 C68 42 56 48 48 70 C40 48 28 42 18 36 Z" fill="none" stroke="#ff2044" stroke-width="3.2"/><circle cx="48" cy="36" r="4" fill="#ff2044"/></svg>`,
  ),
  oregairu: encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0b1220"/><circle cx="48" cy="48" r="24" fill="none" stroke="#38bdf8" stroke-width="2.2"/><path d="M26 68 L70 28" stroke="#f8fafc" stroke-width="1.8" opacity="0.65"/></svg>`,
  ),
  gintama: encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0a0e16"/><path d="M16 62 Q34 38 50 54 T82 34" fill="none" stroke="#93c5fd" stroke-width="3.2"/><path d="M16 74 Q36 52 54 64 T82 48" fill="none" stroke="#e2e8f0" stroke-width="1.6" opacity="0.6"/></svg>`,
  ),
  'tokyo-ghoul': encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#080406"/><circle cx="48" cy="48" r="26" fill="#0d0d12" stroke="#e11d48" stroke-width="2.5"/><circle cx="48" cy="48" r="11" fill="#e11d48"/><circle cx="48" cy="48" r="4.5" fill="#080406"/></svg>`,
  ),
  horimiya: encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#181214"/><circle cx="38" cy="48" r="18" fill="none" stroke="#fbbf24" stroke-width="2.4"/><circle cx="58" cy="48" r="18" fill="none" stroke="#f472b6" stroke-width="2.4"/></svg>`,
  ),
  'one-piece': encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0d111a"/><ellipse cx="48" cy="58" rx="34" ry="8" fill="#eab308"/><path d="M26 56 C28 34 68 34 70 56 Z" fill="#facc15"/><rect x="27" y="48" width="42" height="7" fill="#dc2626"/></svg>`,
  ),
  'new-abnormal': encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#0f2942"/><path d="M14 70 L40 24 L62 60 L82 28" fill="none" stroke="#fbbf24" stroke-width="3.5"/><circle cx="64" cy="34" r="9" fill="#ef4444"/><rect x="18" y="68" width="60" height="8" fill="#38bdf8" opacity="0.8"/></svg>`,
  ),
  fanclub: encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#1b1414"/><circle cx="48" cy="48" r="28" fill="#d63329"/><circle cx="48" cy="48" r="14" fill="#f4ecdc"/><circle cx="48" cy="48" r="4" fill="#141318"/></svg>`,
  ),
  'the-wall': encodeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#16161a"/><path d="M0 24 H96 M0 48 H96 M0 72 H96 M32 0 V24 M64 0 V24 M16 24 V48 M48 24 V48 M80 24 V48 M32 48 V72 M64 48 V72 M16 72 V96 M48 72 V96 M80 72 V96" stroke="#f8fafc" stroke-width="1.6" opacity="0.72"/></svg>`,
  ),
}
