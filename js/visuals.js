// Visual system: top-down road scenes (animated) and car-control icons.
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
    ? `<g transform="translate(140 146)"><path d="M6 0h8l6 6v8l-6 6H6l-6-6V6Z" fill="var(--bad)"/><path d="M10 20v14" stroke="var(--sc-paint)" stroke-width="2"/></g>`
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

// Car-control icons, 48×48, stroke drawn in currentColor.
const ICONS = {
  car: '<path d="M10 30v-6l4-10h20l4 10v6M8 30h32v6H8zM14 36v4M34 36v4"/><circle cx="15" cy="31" r="1.5"/><circle cx="33" cy="31" r="1.5"/>',
  window: '<path d="M8 34V20l8-10h24v24Z"/><path d="M14 20h20v-6"/><path d="M24 24v10m-4-4 4 4 4-4"/>',
  armLeft: '<rect x="28" y="10" width="12" height="28" rx="3"/><path d="M28 22H8"/><circle cx="8" cy="22" r="2.5"/>',
  armRight: '<rect x="28" y="10" width="12" height="28" rx="3"/><path d="M28 26H16V8"/><circle cx="16" cy="8" r="2.5"/>',
  armStop: '<rect x="28" y="10" width="12" height="28" rx="3"/><path d="M28 20H16v20"/><circle cx="16" cy="40" r="2.5"/>',
  key: '<circle cx="15" cy="24" r="7"/><path d="M22 24h20m-6 0v6m-6-6v4"/>',
  signalLeft: '<path d="M22 12 8 24l14 12v-7h14v-10H22Z"/><path d="M42 18v12" class="blink"/>',
  signalRight: '<path d="M26 12l14 12-14 12v-7H12v-10h14Z"/><path d="M6 18v12" class="blink"/>',
  brake: '<rect x="12" y="10" width="24" height="18" rx="5"/><path d="M16 15h16M16 20h16M16 25h16M24 30v10m-5-5 5 5 5-5"/>',
  horn: '<circle cx="20" cy="26" r="12"/><circle cx="20" cy="26" r="4"/><path d="M20 14v8M10 30l6-2M30 30l-6-2M36 14a10 10 0 0 1 0 12M40 10a16 16 0 0 1 0 20"/>',
  parkingBrake: '<circle cx="24" cy="24" r="11"/><path d="M21 30V18h4a3.5 3.5 0 0 1 0 7h-4"/><path d="M9 14a18 18 0 0 0 0 20M39 14a18 18 0 0 1 0 20"/>',
  flashers: '<path d="M24 8 42 38H6Z"/><path d="M24 18l9 15H15Z"/>',
  headlights: '<path d="M20 12c-8 0-12 6-12 12s4 12 12 12Z"/><path d="M26 14h14M26 20h14M26 28h14M26 34h14"/>',
  wipers: '<path d="M6 34c4-14 12-22 18-22s14 8 18 22Z"/><path d="M24 34 14 18"/><circle cx="24" cy="34" r="2"/>',
  defroster: '<path d="M6 36c4-14 12-22 18-22s14 8 18 22Z"/><path d="M16 32c-2-3 2-5 0-8M24 32c-2-3 2-5 0-8M32 32c-2-3 2-5 0-8"/>',
  auto: '<circle cx="24" cy="24" r="16"/><path d="M18 31l6-15 6 15M20.5 25h7"/>',
  gearPark: '<rect x="14" y="6" width="20" height="36" rx="6"/><path d="M21 18v-7h3.5a3.5 3.5 0 0 1 0 7H21" stroke-width="3"/><path d="M20 26h8M20 31h8M20 36h8" opacity=".45"/>',
  engineOff: '<path d="M24 8v14"/><path d="M15 14a14 14 0 1 0 18 0"/>',
  seatbelt: '<circle cx="24" cy="10" r="5"/><path d="M14 42V24a10 10 0 0 1 20 0v18M16 20l18 22"/>',
  talk: '<path d="M8 12h32v20H22l-8 8v-8H8Z"/><path d="M16 22h16"/>',
  flag: '<path d="M12 42V8M12 8h24l-5 8 5 8H12"/>',
  exam: '<rect x="10" y="8" width="28" height="34" rx="4"/><path d="M18 8V5h12v3M17 22l4 4 9-9M17 34h14"/>',
  turnLeft: '<path d="M30 40V26a8 8 0 0 0-8-8H10m0 0 7-7m-7 7 7 7"/>',
  laneLeft: '<path d="M30 40V30c0-6-12-6-12-12V8m0 0-6 6m6-6 6 6"/>',
  parkSpace: '<rect x="10" y="8" width="28" height="32" rx="4"/><path d="M20 32V16h5a4.5 4.5 0 0 1 0 9h-5"/>',
};

export function icon(name, size = 48) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Render any visual key: "scene:turnLeft" or "icon:horn".
export function visual(key, opts) {
  if (!key) return '';
  const [kind, name] = key.split(':');
  return kind === 'scene' ? scene(name, opts) : `<div class="icon-tile">${icon(name, 64)}</div>`;
}

export function visualKind(key) {
  return key ? key.split(':')[0] : null;
}

// Small UI glyphs
export const UI = {
  speaker: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  slow: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16c0-4.5 3.5-8 8-8s7 3 7 7h2.5a1.5 1.5 0 0 0 0-3"/><path d="M4 16h14M7 16v3M15 16v3"/></svg>',
  mic: '<svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-3 0h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  home: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  practice: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  profile: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  book: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11"/></svg>',
  bolt: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 3 5 14h6l-1 7 8-11h-6Z"/></svg>',
  check: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  flame: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z" fill="currentColor"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  globe: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  chevron: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function mark(size = 22) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--accent)"/><path d="M20 25V16a5 5 0 0 0-5-5H9m0 0 4-4m-4 4 4 4" fill="none" stroke="var(--on-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
