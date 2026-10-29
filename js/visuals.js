// Visual system: top-down road scenes (animated) and car-control icons.
import { CTRL, UIB, FILLED } from './icons.js';
// Everything is drawn from CSS variables so it follows light and dark themes.

const SCENE_PATHS = {
  turnLeft:  'M115 214 L115 128 C115 98 102 85 76 85 L-16 85',
  turnRight: 'M115 214 L115 138 C115 124 124 115 140 115 L216 115',
  straight:  'M115 214 L115 -16',
  laneLeft:  'M115 214 L115 150 C115 118 85 112 85 80 L85 -16',
  laneRight: 'M85 214 L85 150 C85 118 115 112 115 80 L115 -16',
  pullOver:  'M100 214 L100 140 C100 108 132 104 132 70 L132 44',
  merge:     'M132 170 L132 150 C132 120 100 114 100 82 L100 -16',
  backUp:    'M115 50 L115 150',
  stop:      'M115 214 L115 142',
  parkLot:   'M85 214 L85 128 C85 104 98 96 120 96 L178 96',
  parkSpace: 'M30 150 L96 150 C118 150 124 138 124 118 L124 80',
};

function base(kind) {
  const g = 'var(--sc-ground)', r = 'var(--sc-road)', p = 'var(--sc-paint)', b = 'var(--sc-block)';
  if (kind === 'cross') {
    return `<rect width="200" height="200" fill="${g}"/>
      <rect x="-10" y="-10" width="76" height="76" rx="12" fill="${b}"/><rect x="134" y="-10" width="76" height="76" rx="12" fill="${b}"/>
      <rect x="-10" y="134" width="76" height="76" rx="12" fill="${b}"/><rect x="134" y="134" width="76" height="76" rx="12" fill="${b}"/>
      <rect x="70" y="0" width="60" height="200" fill="${r}"/><rect x="0" y="70" width="200" height="60" fill="${r}"/>
      <path d="M100 0v62M100 138v62M0 100h62M138 100h62" stroke="${p}" stroke-width="1.6" stroke-dasharray="9 8"/>
      <rect x="101" y="135" width="28" height="3" fill="${p}"/>`;
  }
  if (kind === 'road2') {
    return `<rect width="200" height="200" fill="${g}"/>
      <rect x="-10" y="-10" width="70" height="220" rx="12" fill="${b}"/><rect x="146" y="-10" width="70" height="220" rx="12" fill="${b}"/>
      <rect x="66" y="0" width="74" height="200" fill="${r}"/>
      <path d="M100 0v200" stroke="${p}" stroke-width="1.6" stroke-dasharray="9 8"/>
      <path d="M68 0v200M138 0v200" stroke="${p}" stroke-width="1.6"/>`;
  }
  if (kind === 'curb') {
    return `<rect width="200" height="200" fill="${g}"/>
      <rect x="146" y="-10" width="70" height="220" rx="0" fill="${b}"/>
      <rect x="60" y="0" width="86" height="200" fill="${r}"/>
      <path d="M100 0v200" stroke="${p}" stroke-width="1.6" stroke-dasharray="9 8"/>
      <path d="M146 0v200" stroke="var(--sc-curb)" stroke-width="4"/>`;
  }
  if (kind === 'lot') {
    let stalls = '';
    for (let i = 0; i < 4; i++) stalls += `<path d="M${108 + i * 26} 24v46" stroke="${p}" stroke-width="2"/>`;
    return `<rect width="200" height="200" fill="${g}"/>
      <rect x="0" y="0" width="200" height="200" fill="${r}" opacity=".9"/>
      ${stalls}<path d="M108 70h78" stroke="${p}" stroke-width="2"/>
      <rect x="0" y="176" width="200" height="24" fill="${b}"/>`;
  }
  return `<rect width="200" height="200" fill="${g}"/>`;
}

const SCENE_BASE = {
  turnLeft: 'cross', turnRight: 'cross', straight: 'cross', stop: 'cross',
  laneLeft: 'road2', laneRight: 'road2',
  pullOver: 'curb', merge: 'curb', backUp: 'road2',
  parkLot: 'cross', parkSpace: 'lot',
};

let uid = 0;
export function scene(name, { animate = true, dur = 3.6 } = {}) {
  const d = SCENE_PATHS[name];
  if (!d) return '';
  const id = `p${++uid}`;
  const reverse = name === 'backUp';
  const extra = name === 'stop'
    ? `<g transform="translate(140 140)">${stopSign(24)}</g>`
    : name === 'parkSpace' ? `<rect x="112" y="26" width="24" height="42" rx="3" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 4"/>` : '';
  const motion = animate
    ? `<animateMotion dur="${dur}s" repeatCount="indefinite" rotate="${reverse ? 'auto-reverse' : 'auto'}" keyPoints="0;0;1;1" keyTimes="0;0.12;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.35 1;0 0 1 1"><mpath href="#${id}"/></animateMotion>`
    : '';
  // static car sits at the start of the path, rotated along it
  const start = staticPose(name);
  return `<svg class="scene" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    ${base(SCENE_BASE[name])}${extra}
    <path id="${id}" d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 6" opacity=".95"/>
    <g ${animate ? '' : `transform="${start}"`}>
      <g class="car-body">
        <rect x="-11" y="-6.5" width="22" height="13" rx="3.6" fill="var(--accent)"/>
        <rect x="${reverse ? -8 : 2}" y="-4.5" width="5.5" height="9" rx="1.6" fill="var(--sc-glass)"/>
        ${motion}
      </g>
    </g>
  </svg>`;
}

function staticPose(name) {
  const poses = {
    turnLeft: 'translate(115 172) rotate(-90)', turnRight: 'translate(115 172) rotate(-90)',
    straight: 'translate(115 172) rotate(-90)', stop: 'translate(115 172) rotate(-90)',
    laneLeft: 'translate(115 172) rotate(-90)', laneRight: 'translate(85 172) rotate(-90)',
    pullOver: 'translate(100 172) rotate(-90)', merge: 'translate(132 160) rotate(-90)',
    backUp: 'translate(115 70) rotate(-90)', parkLot: 'translate(85 172) rotate(-90)',
    parkSpace: 'translate(40 150) rotate(0)',
  };
  return poses[name] || 'translate(100 100)';
}

// Car-control icons: Phosphor duotone (see icons.js). Hand signals and gear letters are
// drawn here in the same 256 grid, regular weight, with the same 20% fill.
const S16 = 'fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"';
const WIN = '<rect x="168" y="40" width="48" height="176" rx="16" opacity=".2"/><rect x="168" y="40" width="48" height="176" rx="16" ' + S16 + '/>';
// ISO 2575 dashboard symbols (what the learner sees in a real car), same weight as Phosphor.
const WS = 'M36 184C92 168 164 168 220 184L198 76C152 64 104 64 58 76Z';
const wave = (x) => `<path d="M${x} 164c-12-10 12-20 0-30s12-20 0-30" ${S16}/><path d="M${x - 11} 112l11-14 11 14" ${S16}/>`;
const CUSTOM = {
  wipers: `<path d="${WS}" opacity=".2"/><path d="${WS}" ${S16}/><path d="M104 178 72 104M176 178 144 104" ${S16} stroke-width="18"/><circle cx="104" cy="178" r="10"/><circle cx="176" cy="178" r="10"/>`,
  defroster: `<path d="${WS}" opacity=".2"/><path d="${WS}" ${S16}/>${wave(92)}${wave(128)}${wave(164)}`,
  window: `<path d="M36 176V116l52-52h132v112Z" opacity=".2"/><path d="M36 176V116l52-52h132v112Z" ${S16}/><path d="M150 92v56m-24-24 24 24 24-24" ${S16} stroke-width="18"/>`,
  armLeft: WIN + '<path d="M168 112H52" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round"/><circle cx="44" cy="112" r="18"/>',
  armRight: WIN + '<path d="M168 136H96V60" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><circle cx="96" cy="48" r="18"/>',
  armStop: WIN + '<path d="M168 96H96v100" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><circle cx="96" cy="208" r="18"/>',
  gearPark: '<rect x="56" y="28" width="144" height="200" rx="44" opacity=".2"/><rect x="56" y="28" width="144" height="200" rx="44" ' + S16 + '/><path d="M108 176V80h30a30 30 0 0 1 0 60h-30" ' + S16 + ' stroke-width="20"/>',
  gearDrive: '<rect x="56" y="28" width="144" height="200" rx="44" opacity=".2"/><rect x="56" y="28" width="144" height="200" rx="44" ' + S16 + '/><path d="M104 80v96h22a48 48 0 0 0 0-96Z" ' + S16 + ' stroke-width="20"/>',
};

export function icon(name, size = 48) {
  const body = CUSTOM[name] || CTRL[name];
  if (!body) return '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Hand signals, seen from behind the car: the driver's left arm out of the window.
// left = straight out, right = bent up, stop = bent down (California DMV handbook).
const ARM_ANGLE = { left: 0, right: 90, stop: -90 };
export function armScene(kind, { animate = true } = {}) {
  const a = ARM_ANGLE[kind] ?? 0;
  const hint = kind === 'left'
    ? '<path d="M150 40h-34m0 0 10-10m-10 10 10 10" />'
    : kind === 'right' ? '<path d="M116 40h34m0 0-10-10m10 10-10 10" />'
      : '<path d="M122 28v24M138 28v24" />';
  const fore = animate
    ? `<animateTransform attributeName="transform" type="rotate" values="0;0;${a};${a};0" keyTimes="0;.18;.42;.86;1" dur="3.2s" repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;.4 0 .2 1;0 0 1 1;.4 0 .2 1"/>`
    : '';
  const upper = animate
    ? '<animateTransform attributeName="transform" type="rotate" values="-75;0;0;0;-75" keyTimes="0;.18;.42;.86;1" dur="3.2s" repeatCount="indefinite" calcMode="spline" keySplines=".4 0 .2 1;0 0 1 1;0 0 1 1;.4 0 .2 1"/>'
    : '';
  return `<svg class="scene arm" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    <rect width="200" height="200" fill="var(--sc-ground)"/>
    <path d="M0 168h200v32H0z" fill="var(--sc-road)"/>
    <g fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".9">${hint}</g>
    <g transform="translate(18 0)">
      <rect x="44" y="154" width="22" height="20" rx="5" fill="#1D1F22"/><rect x="138" y="154" width="22" height="20" rx="5" fill="#1D1F22"/>
      <path d="M62 104 74 70c2-6 6-9 12-9h44c6 0 10 3 12 9l12 34Z" fill="var(--accent)"/>
      <path d="M71 101 80 74c1-4 4-6 8-6h40c4 0 7 2 8 6l9 27Z" fill="var(--sc-glass)"/>
      <circle cx="91" cy="84" r="9.5" fill="#1D1F22" opacity=".8"/>
      <rect x="38" y="102" width="128" height="56" rx="14" fill="var(--accent)"/>
      <rect x="46" y="116" width="20" height="10" rx="3" fill="#D8433A"/><rect x="138" y="116" width="20" height="10" rx="3" fill="#D8433A"/>
      <rect x="86" y="132" width="32" height="12" rx="3" fill="#F4F1E8"/>
      <g transform="translate(64 96)">
        <g>${upper}
          <path d="M0 0h-28" stroke="#3F5F8F" stroke-width="13" stroke-linecap="round"/>
          <g transform="translate(-28 0)">
            <g ${animate ? '' : `transform="rotate(${a})"`}>${fore}
              <path d="M0 0h-26" stroke="#D9A27A" stroke-width="11" stroke-linecap="round"/>
              <path d="M-27 -6c-6 0-9 3-9 6s3 6 9 6" fill="#D9A27A"/>
            </g>
          </g>
        </g>
      </g>
    </g>
  </svg>`;
}

// Render any visual key: "scene:turnLeft", "arm:left" or "icon:horn".
export function visual(key, opts) {
  if (!key) return '';
  const [kind, name] = key.split(':');
  if (kind === 'scene') return scene(name, opts);
  if (kind === 'arm') return armScene(name, opts);
  return `<div class="icon-tile">${icon(name, 64)}</div>`;
}

// What the learner physically does, as a row of the same controls used in the drive test.
const STEPS = {
  'scene:turnLeft': ['sigL', 'look', 'steerL'], 'scene:turnRight': ['sigR', 'look', 'steerR'],
  'scene:laneLeft': ['sigL', 'look', 'steerL'], 'scene:laneRight': ['sigR', 'look', 'steerR'],
  'scene:pullOver': ['sigR', 'look', 'steerR', 'brake'], 'scene:merge': ['sigL', 'look', 'gas'],
  'scene:backUp': ['gearR', 'look', 'gas'], 'scene:stop': ['brake'], 'scene:straight': ['gas'],
  'scene:parkLot': ['sigR', 'steerR'], 'scene:parkSpace': ['steerR', 'brake'],
  'icon:gearPark': ['brake', 'gearP'], 'icon:gearDrive': ['brake', 'gearD'], 'icon:engineOff': ['gearP', 'engine'],
  'arm:left': ['armLeft'], 'arm:right': ['armRight'], 'arm:stop': ['armStop'],
};
const STEP_LABEL = { look: 'ctl.look', brake: 'ctl.brake', gas: 'ctl.gas', engine: 'ctl.engine', armLeft: 'ctl.armLeft', armRight: 'ctl.armRight', armStop: 'ctl.armStop' };
const STEP_ICON = { sigL: ['arrowL', FILLED], sigR: ['arrowR', FILLED], look: ['eye', UIB], steerL: ['steer', UIB], steerR: ['steer', UIB], brake: ['brake', CTRL], gas: ['gas', null], engine: ['power', UIB], armLeft: ['armLeft', null], armRight: ['armRight', null], armStop: ['armStop', null] };
const GAS = '<rect x="80" y="24" width="96" height="208" rx="32" opacity=".2"/><rect x="80" y="24" width="96" height="208" rx="32" ' + S16 + '/><path d="M108 76h40M108 112h40M108 148h40" ' + S16 + '/>';
function stepGlyph(s) {
  const [n, src] = STEP_ICON[s];
  const body = s === 'gas' ? GAS : src ? src[n] : CUSTOM[n];
  const svg = (b) => `<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${b}</svg>`;
  if (s === 'steerL') return svg(UIB.turnL) + svg(body);
  if (s === 'steerR') return svg(body) + svg(UIB.turnR);
  return svg(body);
}
export function hasSteps(key) { return !!STEPS[key]; }
export function steps(key, t) {
  const list = STEPS[key];
  if (!list) return '';
  return `<ol class="steps" aria-label="${t('ex.doIt')}">${list.map((s, i) => {
    const gear = s.startsWith('gear') ? s.slice(4) : null;
    const g = gear ? `<b class="step-gear">${gear}</b>` : stepGlyph(s);
    const lbl = STEP_LABEL[s] ? t(STEP_LABEL[s]) : '';
    const cls = s.startsWith('sig') ? 'sig' : s === 'brake' ? 'brake' : s === 'gas' ? 'gas' : '';
    return `${i ? '<li class="step-arrow" aria-hidden="true">›</li>' : ''}<li class="step ${cls}">${g}${lbl ? `<span>${lbl}</span>` : ''}</li>`;
  }).join('')}</ol>`;
}

export function visualKind(key) {
  return key ? key.split(':')[0] : null;
}

// Small UI glyphs: Phosphor bold (see icons.js).
const g = (name, size, src = UIB) => `<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${src[name]}</svg>`;
export const UI = {
  speaker: g('speaker', 24),
  mic: g('mic', 32),
  close: g('close', 22),
  back: g('back', 22),
  info: g('info', 22),
  gear: g('gear', 22),
  home: g('home', 22),
  practice: g('practice', 22),
  profile: g('profile', 22),
  book: g('book', 22),
  bolt: g('bolt', 22),
  check: g('check', 22),
  x: g('x', 22),
  lock: g('lock', 18),
  flame: g('flame', 16),
  search: g('search', 20),
  globe: g('globe', 18),
  chevron: g('chevron', 18),
  repeat: g('repeat', 20),
  eye: g('eye', 26),
  steer: g('steer', 26),
  power: g('power', 22),
  car: g('car', 22),
  flag: g('flag', 22),
  arrowL: g('arrowL', 26, FILLED), arrowR: g('arrowR', 26, FILLED),
  slow: `<svg width="26" height="26" viewBox="0 0 256 256" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"><path d="M44 160a80 80 0 0 1 160 0Z"/><path d="M84 160l24-44h40l24 44M108 116l20-28 20 28"/><path d="M204 148c10 0 20-6 24-18 2-8-4-14-12-14-10 0-14 10-16 20"/><path d="M72 160v28M176 160v28M44 160l-20 10"/></svg>`,
};
export const glyph = g;

// Frenu mark: an F whose top bar is a turn arrow.
export function mark(size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="116" fill="var(--accent)"/><path d="M196 404V214a54 54 0 0 1 54-54h96M300 112l50 48-50 48M196 286h96" fill="none" stroke="var(--on-accent)" stroke-width="50" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// U.S. flag (13 stripes, blue field with a star grid)
export function flag(w = 22) {
  const h = Math.round(w * 10 / 19 * 100) / 100;
  let stripes = '';
  for (let i = 0; i < 13; i += 2) stripes += `<rect y="${(i * 10 / 13).toFixed(3)}" width="19" height="${(10 / 13).toFixed(3)}" fill="#B22234"/>`;
  let stars = '';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) stars += `<circle cx="${0.66 + c * 1.32 + (r % 2 ? 0.66 : 0)}" cy="${0.6 + r * 1.05}" r=".28" fill="#FFFFFF"/>`;
  return `<svg class="flag" width="${w}" height="${h}" viewBox="0 0 19 10" role="img" aria-label="United States"><rect width="19" height="10" fill="#FFFFFF"/>${stripes}<rect width="7.6" height="${(70 / 13).toFixed(3)}" fill="#3C3B6E"/>${stars}</svg>`;
}

// MUTCD R1-1 stop sign: red octagon, white border, white legend
export function stopSign(size = 48) {
  const s = size, k = s * 0.2929;
  const pts = (inset) => { const a = k - inset * 0.414, b = s - a; return `${a},${inset} ${b},${inset} ${s - inset},${a} ${s - inset},${b} ${b},${s - inset} ${a},${s - inset} ${inset},${b} ${inset},${a}`; };
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><polygon points="${pts(0)}" fill="#FFFFFF"/><polygon points="${pts(s * 0.04)}" fill="#C8102E"/><polygon points="${pts(s * 0.075)}" fill="none" stroke="#FFFFFF" stroke-width="${s * 0.03}"/><text x="${s / 2}" y="${s * 0.6}" text-anchor="middle" font-family="Overpass, 'Arial Narrow', Arial, sans-serif" font-weight="800" font-size="${s * 0.3}" fill="#FFFFFF" letter-spacing="${s * 0.005}">STOP</text></svg>`;
}
