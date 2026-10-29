// Frenu drive test: a 3D town, a real examiner voice, and the learner's own
// actions (signal, steer, brake, gear, blind-spot check). Scored like the DMV
// score sheet: up to 15 errors, no critical errors.
import { icon, UI, armScene } from './visuals.js';
import { VOICE_IDS } from './speech.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const G = 80;          // block size (m)
const W2 = 7.6;        // half road width
const LANE = { inner: 1.8, outer: 5.4, curb: 6.6 };
const CRUISE = 11;     // m/s ≈ 25 mph
const BOUND = 3;       // blocks from centre
const MAX_ERRORS = 15;
const TIME_SCALE = /fast/.test(location.search) ? 2.5 : 1;

let THREE = null;

export function prepare() {
  return new Promise((resolve) => {
    const glOk = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } })();
    if (!glOk) return resolve(false);
    if (window.THREE) { THREE = window.THREE; return resolve(true); }
    const s = document.createElement('script');
    s.src = THREE_URL; s.async = true;
    s.onload = () => { THREE = window.THREE; resolve(!!THREE); };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(!!window.THREE), 15000);
  });
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

const SAY = {
  left: ['dir.cornerLeft', 'dir.makeLeft', 'dir.nextLeft'],
  right: ['dir.cornerRight', 'dir.makeRight', 'dir.nextRight'],
  straight: ['dir.straight', 'dir.goStraight'],
  stopLeft: ['dir.stopLeft'], stopRight: ['dir.stopRight'],
  laneL: ['lane.left', 'lane.moveLeft'], laneR: ['lane.right', 'lane.moveRight'],
  pull: ['lane.pullOver', 'lane.curb', 'park.right'],
  stopHere: ['park.okStop', 'park.stopHere'],
  back: ['park.backUp', 'park.backSlow'],
  merge: ['lane.back', 'lane.pullAway'],
};

const PREDRIVE = [
  ['car.horn', 'horn'], ['car.wipers', 'wipers'], ['car.defroster', 'defroster'], ['car.flashers', 'flashers'],
  ['car.headlights', 'headlights'], ['car.parkingBrake', 'parkingBrake'], ['car.armLeft', 'armLeft'], ['car.armRight', 'armRight'],
  ['car.armStop', 'armStop'], ['car.signalLeft', 'signalLeft'], ['car.signalRight', 'signalRight'], ['car.window', 'window'],
];
const PRE_LABEL = {
  horn: 'ctl.horn', wipers: 'ctl.wipers', defroster: 'ctl.defrost', flashers: 'ctl.flashers', headlights: 'ctl.lights', parkingBrake: 'ctl.pbrake',
  armLeft: 'ctl.armLeft', armRight: 'ctl.armRight', armStop: 'ctl.armStop', signalLeft: null, signalRight: null, brake: 'ctl.brake', window: 'ctl.window',
};
const CRITICAL = new Set(['err.noLook', 'err.ranStop', 'err.rolling']);
const ARMS = PREDRIVE.filter(([, c]) => c.startsWith('arm'));
const STOP_ZONE = 20;   // a full stop counts within this many metres before the limit line
const STOPPED = 0.15;   // m/s: below this the car is fully stopped

export function start(opts) {
  const { root, length, t, hear, stopAudio, onExit, onDone } = opts;
  const tr = t; // `t` is shadowed by time variables inside the physics loop
  const voice = pick(VOICE_IDS);
  const BLOCKS = length === 'full' ? 18 : 8;

  // ------------------------------------------------------------------ DOM
  root.innerHTML = `<div class="drv" id="drv">
    <canvas class="drv-gl" id="drvGl" aria-label="${esc(t('drive.title'))}"></canvas>
    <div class="drv-top">
      <button class="drv-chip" id="dExit" aria-label="${esc(t('ex.quit'))}">${UI.close}</button>
      <span class="drv-chip" id="dTime">0:00</span>
      <span class="drv-chip" id="dSpeed">0 mph</span>
      <span class="drv-chip" id="dErr" aria-label="${esc(t('drive.errors'))}"><i class="dot"></i><b>0</b>/15</span>
    </div>
    <div class="drv-voice" id="dVoice" aria-hidden="true"><span></span><span></span><span></span></div>
    <button class="drv-repeat" id="dRepeat" aria-label="Can you repeat that, please?">${UI.repeat}<span lang="en">Repeat</span></button>
    <div class="drv-toast" id="dToast" aria-live="polite"></div>
    <div class="drv-arm" id="dArm" aria-hidden="true"></div>
    <div class="drv-panel" id="dPanel"></div>
    <div class="drv-cover" id="dCover" hidden></div>
  </div>`;
  const $ = (id) => document.getElementById(id);
  const panel = $('dPanel');

  // ------------------------------------------------------------------ 3D
  const canvas = $('drvGl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  const SKY = 0xDCE8F2;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 60, 230);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.05, 500);
  scene.add(new THREE.HemisphereLight(0xEEF4FA, 0xE6E1D6, 0.95));
  const sun = new THREE.DirectionalLight(0xFFF3DF, 0.8);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 5, far: 220 });
  scene.add(sun); scene.add(sun.target);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, ...o });
  const M = {
    ground: mat(0xE6E8E3), walk: mat(0xD8DBD5), road: mat(0x43474D, { roughness: 1 }), white: mat(0xF4F4F0), yellow: mat(0xE8B92A),
    trunk: mat(0x8A7A66), leaf: mat(0x9FB590), leaf2: mat(0xB6C7A5), pole: mat(0x8C9399), dash: mat(0x1E2125, { roughness: 0.7 }),
    hood: mat(0xFFB224, { roughness: 0.4, metalness: 0.1 }), trim: mat(0x2A2E33), win: mat(0xC2CCD5, { roughness: 0.3, metalness: 0.2 }),
  };
  const BLD = [0xF3F1EC, 0xE8EBEE, 0xECE6DD, 0xDDE3E8, 0xEFEBE3, 0xD7DDE2].map((c) => mat(c));
  const geos = { box: new THREE.BoxGeometry(1, 1, 1) };
  function box(w, h, d, m, x, y, z, cast = true) {
    const b = new THREE.Mesh(geos.box, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = cast; b.receiveShadow = true; scene.add(b); return b;
  }

  const N = BOUND + 1;
  const LINES = []; for (let k = -N; k <= N; k++) LINES.push(k * G);
  const EXT = N * G + G;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(EXT * 3, EXT * 3), M.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  LINES.forEach((p) => { box(W2 * 2, 0.02, EXT * 2, M.road, p, 0.01, 0, false); box(EXT * 2, 0.021, W2 * 2, M.road, 0, 0.011, p, false); });

  // lane markings between intersections: double yellow centre, dashed white lanes, solid edges
  const inGap = (s) => LINES.some((q) => Math.abs(s - q) < W2 + 0.5);
  const mark = (w, d, m, x, z) => { const b = new THREE.Mesh(geos.box, m); b.scale.set(w, 0.03, d); b.position.set(x, 0.03, z); scene.add(b); };
  LINES.forEach((p) => {
    for (let k = -N; k < N + 1; k++) {
      const a = k * G + W2 + 0.5, b = (k + 1) * G - W2 - 0.5, mid = (a + b) / 2, len = b - a;
      if (len <= 0) continue;
      [-0.16, 0.16].forEach((o) => { mark(0.12, len, M.yellow, p + o, mid); mark(len, 0.12, M.yellow, mid, p + o); });
      [-7.2, 7.2].forEach((o) => { mark(0.14, len, M.white, p + o, mid); mark(len, 0.14, M.white, mid, p + o); });
      for (let s = a + 1; s < b - 2; s += 9) {
        [-3.6, 3.6].forEach((o) => { mark(0.13, 3, M.white, p + o, s + 1.5); mark(3, 0.13, M.white, s + 1.5, p + o); });
      }
    }
  });
  void inGap;

  // blocks: sidewalk, buildings, trees
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const treeGeo = new THREE.IcosahedronGeometry(1.8, 0), trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 2.2, 6);
  for (let i = 0; i < LINES.length - 1; i++) for (let j = 0; j < LINES.length - 1; j++) {
    const x0 = LINES[i] + W2, x1 = LINES[i + 1] - W2, z0 = LINES[j] + W2, z1 = LINES[j + 1] - W2;
    const w = x1 - x0, d = z1 - z0;
    box(w, 0.16, d, M.walk, (x0 + x1) / 2, 0.08, (z0 + z1) / 2, false);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      if (rnd() < 0.15) continue;
      const bw = 18 + rnd() * 8, bd = 18 + rnd() * 8, bh = 6 + Math.floor(rnd() * 5) * 3.4;
      const bx = x0 + 7 + a * (w - 14 - bw) + bw / 2, bz = z0 + 7 + b * (d - 14 - bd) + bd / 2;
      box(bw, bh, bd, BLD[Math.floor(rnd() * BLD.length)], bx, bh / 2 + 0.16, bz);
      for (let f = 3; f < bh - 1; f += 3.4) { box(bw + 0.05, 1.1, bd * 0.7, M.win, bx, f, bz, false); box(bw * 0.7, 1.1, bd + 0.05, M.win, bx, f, bz, false); }
    }
    for (let s = x0 + 5; s < x1 - 3; s += 12) [z0 + 2.4, z1 - 2.4].forEach((z) => {
      if (rnd() < 0.4) return;
      const tr = new THREE.Mesh(trunkGeo, M.trunk); tr.position.set(s, 1.3, z); tr.castShadow = true; scene.add(tr);
      const lf = new THREE.Mesh(treeGeo, rnd() < 0.5 ? M.leaf : M.leaf2); lf.position.set(s, 3.4, z); lf.castShadow = true; scene.add(lf);
    });
  }

  // ---- U.S. signs drawn to the federal (MUTCD) spec on canvas textures
  function signTexture(kind) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    if (kind === 'stop') {
      const oct = (inset) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; const r = 128 - inset; g.lineTo(128 + r * Math.cos(a), 128 + r * Math.sin(a)); } g.closePath(); };
      oct(0); g.fillStyle = '#FFFFFF'; g.fill(); oct(6); g.fillStyle = '#C8102E'; g.fill();
      oct(14); g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#FFFFFF'; g.font = '800 82px Overpass, "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 128, 134);
    } else {
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#111111'; g.lineWidth = 8; g.strokeRect(14, 10, 228, 236);
      g.fillStyle = '#111111'; g.textAlign = 'center'; g.font = '700 38px Overpass, "Arial Narrow", Arial, sans-serif';
      g.fillText('SPEED', 128, 62); g.fillText('LIMIT', 128, 104); g.font = '800 104px Overpass, "Arial Narrow", Arial, sans-serif'; g.fillText('25', 128, 208);
    }
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4; return tex;
  }
  const stopMat = new THREE.MeshBasicMaterial({ map: signTexture('stop'), transparent: true });
  const speedMat = new THREE.MeshBasicMaterial({ map: signTexture('speed') });
  const signPlane = new THREE.PlaneGeometry(0.9, 0.9), speedPlane = new THREE.PlaneGeometry(0.7, 0.85), poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6);
  function sign(matl, plane, at, face, h = 2.5) {
    const pole = new THREE.Mesh(poleGeo, M.pole); pole.position.set(at.x, 1.2, at.z); pole.castShadow = true; scene.add(pole);
    const s = new THREE.Mesh(plane, matl); s.position.set(at.x, h, at.z); s.lookAt(at.x + face.x, h, at.z + face.z); scene.add(s);
    const back = new THREE.Mesh(plane, M.pole); back.position.copy(s.position); back.lookAt(at.x - face.x, h, at.z - face.z); back.position.addScaledVector(new THREE.Vector3(-face.x, 0, -face.z), 0.01); scene.add(back);
  }
  const DIRS = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)];
  const rightOf = (f) => new THREE.Vector3(-f.z, 0, f.x);
  const isStop = (ix, iz) => ((ix * 2 + iz * 3) % 3 + 3) % 3 === 0 && !(ix === 0 && iz === 0);
  for (let i = -N; i <= N; i++) for (let k = -N; k <= N; k++) {
    if (!isStop(i, k)) continue;
    const C = new THREE.Vector3(i * G, 0, k * G);
    DIRS.forEach((f) => {
      const r = rightOf(f);
      const at = C.clone().addScaledVector(f, -(W2 + 1.6)).addScaledVector(r, W2 + 1.2);
      sign(stopMat, signPlane, at, f.clone().negate());
      const lineC = C.clone().addScaledVector(f, -(W2 + 1.2)).addScaledVector(r, 3.6);
      const ln = new THREE.Mesh(geos.box, M.white); ln.scale.set(Math.abs(f.x) ? 0.5 : 7.2, 0.035, Math.abs(f.x) ? 7.2 : 0.5); ln.position.set(lineC.x, 0.03, lineC.z); scene.add(ln);
    });
  }
  for (let i = -N; i < N; i++) for (let k = -N; k <= N; k++) {
    if ((i + k) % 2) continue;
    const at = new THREE.Vector3(k * G + W2 + 1.2, 0, i * G + G / 2);
    sign(speedMat, speedPlane, at, new THREE.Vector3(0, 0, -1), 2.3);
  }

  // ---- the car (driver's view: hood, dash, pillars)
  const car = new THREE.Group(); scene.add(car);
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; car.add(o); return o; };
  add(new THREE.BoxGeometry(1.9, 0.08, 1.9), M.hood, 0, 0.92, 2.0, 0.05);
  add(new THREE.BoxGeometry(1.95, 0.24, 0.6), M.dash, 0, 0.95, 1.05);
  add(new THREE.BoxGeometry(0.22, 0.07, 0.03), M.trim, 0.05, 1.86, 0.62);
  [-0.93, 0.93].forEach((x) => { const p = add(new THREE.BoxGeometry(0.07, 0.95, 0.07), M.dash, x, 1.5, 0.75, -0.55); p.rotation.z = x < 0 ? -0.08 : 0.08; });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 58; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  // ------------------------------------------------------------------ state
  const S = {
    phase: 'predrive', pos: new THREE.Vector3(), f: DIRS[0].clone(), r: rightOf(DIRS[0]), base: new THREE.Vector3(),
    v: 0, mode: 'parked', gear: 'P', signal: null, brake: false, look: -99, lookSide: 'left',
    lat: null, curve: null, cu: 0, intent: null, plan: null, blocks: 0, cmds: 0, okCmds: 0,
    errors: 0, critical: 0, missed: [], task: null, t0: performance.now(), engine: true, yaw: 0, steerVis: 0,
    queue: Promise.resolve(), lastSaid: null, speaking: false, ended: false, events: [], stoppedAt: -1, holdFor: null,
  };

  // start parked at the curb on the road x = 0, heading north (+z)
  S.base.set(0, 0, 0);
  S.pos.set(0, 0, -G * 1.5).addScaledVector(S.r, LANE.curb);

  const now = () => performance.now() / 1000;
  const offset = () => S.pos.clone().sub(S.base).dot(S.r);
  const along = () => S.pos.dot(S.f);
  function nextCenter() { return (Math.floor((along() + W2 + 2) / G) + 1) * G; }
  function centerPoint(c) { return S.pos.clone().addScaledVector(S.f, c - along()).addScaledVector(S.r, -offset()); }
  function gridIndex(C) { return [Math.round(C.x / G), Math.round(C.z / G)]; }

  // ------------------------------------------------------------------ voice
  function say(id) {
    S.lastSaid = id;
    S.queue = S.queue.then(() => { S.speaking = true; $('dVoice').classList.add('on'); return hear(id, voice); })
      .then(() => { S.speaking = false; $('dVoice').classList.remove('on'); });
    return S.queue;
  }

  // ------------------------------------------------------------------ scoring
  function error(err, id) {
    S.errors++; const crit = CRITICAL.has(err); if (crit) S.critical++;
    S.missed.push({ err, id: id || null, critical: crit });
    if (S.task) S.task.failed = true;
    const e = $('dErr'); e.querySelector('b').textContent = String(S.errors); e.classList.add('bump'); setTimeout(() => e.classList.remove('bump'), 500);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (x) { /* ignore */ }
  }
  function newTask(kind, id, extra = {}) {
    S.cmds++;
    S.task = { kind, id, failed: false, ...extra };
    return say(id).then(() => { if (S.task && S.task.id === id) S.task.heardAt = now(); });
  }
  function closeTask() { if (S.task) { if (!S.task.failed) S.okCmds++; S.task = null; } }
  let toastTimer = 0;
  function flash(text, kind = 'good') {
    const el = $('dToast'); if (!el) return;
    el.textContent = text; el.className = `drv-toast show ${kind}`;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = 'drv-toast'; }, 1400);
  }
  let armTimer = 0;
  function showArm(kind) {
    const el = $('dArm'); if (!el) return;
    el.innerHTML = armScene(kind, { animate: false }); el.classList.add('show');
    clearTimeout(armTimer); armTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }

  // ------------------------------------------------------------------ panels
  const ic = (name, size = 26) => icon(name, size);
  const btn = (id, inner, cls = '', label = '') => `<button class="dbtn ${cls}" data-c="${id}" ${label ? `aria-label="${esc(label)}"` : ''}>${inner}</button>`;
  function predrivePanel() {
    panel.className = 'drv-panel pre';
    panel.innerHTML = `<p class="drv-label">${esc(t('drive.predrive'))}</p><div class="pre-grid">${PREDRIVE.map(([, c]) => {
      const lbl = PRE_LABEL[c];
      const extra = c === 'signalLeft' ? 'Left turn signal' : c === 'signalRight' ? 'Right turn signal' : t(lbl);
      return btn(c, `${ic(c, 30)}${lbl ? `<span>${esc(t(lbl))}</span>` : ''}`, '', extra);
    }).join('')}</div>`;
  }
  const WHEEL = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="9"/><circle cx="60" cy="60" r="12" fill="currentColor"/><path d="M14 64h34M72 64h34M60 72v38" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>`;
  function drivePanel() {
    panel.className = 'drv-panel go';
    panel.innerHTML = `
      <div class="drv-row top">
        ${btn('sigL', UI.arrowL, 'sig', 'Left turn signal')}
        ${btn('look', UI.eye + '<span>' + esc(t('ctl.look')) + '</span>', 'look', t('ctl.look'))}
        ${btn('sigR', UI.arrowR, 'sig', 'Right turn signal')}
      </div>
      <div class="drv-row mid">
        <div class="gear" role="group" aria-label="Gear">${['P', 'R', 'D'].map((g) => `<button class="gbtn" data-c="gear" data-g="${g}" aria-pressed="${S.gear === g}">${g}</button>`).join('')}</div>
        <div class="wheel" id="dWheel">
          <button class="wzone l" data-c="steerL" aria-label="Steer left"></button>
          <div class="wheel-art" id="dWheelArt">${WHEEL}</div>
          <button class="wzone r" data-c="steerR" aria-label="Steer right"></button>
        </div>
        <div class="pedals">
          ${btn('brake', '<span>' + esc(t('ctl.brake')) + '</span>', 'pedal brake', t('ctl.brake'))}
          ${btn('gas', '<span>' + esc(t('ctl.gas')) + '</span>', 'pedal gas', t('ctl.gas'))}
        </div>
      </div>
      <div class="drv-row bot">${btn('engine', ic('engineOff', 22) + '<span>' + esc(t('ctl.engine')) + '</span>', 'small', t('ctl.engine'))}</div>`;
    syncPanel();
  }
  function syncPanel() {
    panel.querySelectorAll('[data-c="gear"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.g === S.gear)));
    const l = panel.querySelector('[data-c="sigL"]'), r = panel.querySelector('[data-c="sigR"]');
    if (l) l.classList.toggle('on', S.signal === 'L'); if (r) r.classList.toggle('on', S.signal === 'R');
  }

  // ------------------------------------------------------------------ input
  panel.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-c]'); if (!b || S.ended) return;
    e.preventDefault();
    const c = b.dataset.c;
    b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 160);
    if (S.phase === 'predrive') return predriveTap(c);
    if (c === 'brake') { S.brake = true; S.brakeT = now(); b.classList.add('held'); return; }
    control(c, b);
  });
  const release = (e) => {
    const b = e.target.closest && e.target.closest('[data-c="brake"]');
    if (b || e.type === 'pointercancel' || e.type === 'pointerup') { S.brake = false; const p = panel.querySelector('[data-c="brake"]'); if (p) p.classList.remove('held'); }
  };
  panel.addEventListener('pointerup', release); panel.addEventListener('pointercancel', release); panel.addEventListener('pointerleave', release);
  $('dRepeat').addEventListener('click', () => { if (S.lastSaid && !S.speaking) say(S.lastSaid); });
  $('dExit').addEventListener('click', () => confirmExit());

  function confirmExit() {
    const cv = $('dCover'); cv.hidden = false;
    cv.innerHTML = `<div class="drv-card"><h2>${esc(t('ex.quitConfirm'))}</h2><button class="btn btn-primary btn-block" id="dKeep">${esc(t('ex.keepGoing'))}</button><button class="btn btn-ghost btn-block" id="dLeave">${esc(t('ex.quit'))}</button></div>`;
    S.paused = true;
    $('dKeep').onclick = () => { cv.hidden = true; S.paused = false; };
    $('dLeave').onclick = () => { cleanup(); onExit(); };
  }

  function control(c, b) {
    if (c === 'sigL' || c === 'sigR') { const s = c === 'sigL' ? 'L' : 'R'; S.signal = S.signal === s ? null : s; S.sigAt = now(); syncPanel(); return; }
    if (c === 'look') { S.look = now(); S.lookSide = S.gear === 'R' ? 'back' : S.signal === 'R' ? 'right' : 'left'; return; }
    if (c === 'gear') { if (S.v > 0.5 && b.dataset.g !== S.gear) { error('err.wrongGear', S.task && S.task.id); return; } S.gear = b.dataset.g; syncPanel(); onGear(); return; }
    if (c === 'engine') return onEngine();
    if (c === 'gas') return onGas();
    if (c === 'steerL' || c === 'steerR') return onSteer(c === 'steerL' ? 'L' : 'R');
  }

  // ------------------------------------------------------------------ pre-drive check
  let preQ = [];
  function runPredrive() {
    predrivePanel();
    // the real test always asks for all three hand signals, plus a few controls
    preQ = shuffle([...ARMS, ...shuffle(PREDRIVE.filter(([, c]) => !c.startsWith('arm'))).slice(0, 3)]);
    say('sys.begin').then(() => nextPre());
  }
  function nextPre() {
    if (!preQ.length) { say('sys.okay'); S.phase = 'drive'; drivePanel(); setTimeout(beginDrive, 900); return; }
    const [id, ctl] = preQ.shift();
    newTask('pre', id, { ctl });
    S.task.deadline = null;
  }
  function predriveTap(c) {
    if (c.startsWith('arm')) showArm(c === 'armLeft' ? 'left' : c === 'armRight' ? 'right' : 'stop');
    if (!S.task || S.task.kind !== 'pre' || !S.task.heardAt) return;
    const ok = c === S.task.ctl;
    if (!ok) error('err.wrongControl', S.task.id);
    closeTask();
    setTimeout(nextPre, 500);
  }

  // ------------------------------------------------------------------ drive script
  function beginDrive() {
    newTask('gear', 'park.drive', { want: 'D' });
  }
  function onGear() {
    const tk = S.task;
    if (tk && tk.kind === 'gear' && S.gear === tk.want) {
      closeTask();
      if (tk.then) tk.then(); else setTimeout(() => newTask('merge', pick(SAY.merge), { from: 'curb' }), 600);
    } else if (tk && tk.kind === 'gear' && S.gear !== tk.want && S.gear !== 'P') error('err.wrongGear', tk.id);
    else if (tk && tk.kind === 'back' && S.gear === 'R') tk.inR = true;
  }
  function signalOk(side, id) {
    if (S.signal === side) return true;
    error(S.signal ? 'err.wrongSignal' : 'err.noSignal', id); return false;
  }
  const looked = (secs = 6) => now() - S.look <= secs;

  function onGas() {
    const tk = S.task;
    if (S.mode === 'parked' || S.mode === 'hold' || S.mode === 'curbStop') {
      if (S.gear === 'P') return; // nothing happens in park
      if (S.gear === 'R') {
        if (tk && tk.kind === 'back') {
          if (!looked()) error('err.noLook', tk.id);
          tk.started = true; S.mode = 'backing'; S.backFrom = along();
        } else error('err.wrongGear', tk && tk.id);
        return;
      }
      // gear D
      if (tk && tk.kind === 'merge') {
        signalOk('L', tk.id); if (!looked()) error('err.noLook', tk.id);
        closeTask(); S.signal = null; syncPanel();
        S.mode = 'cruise'; laneShift(LANE.outer, 3); scheduleBlock();
        return;
      }
      if (tk && tk.kind === 'go') { closeTask(); }
      if (S.mode === 'curbStop' && !(tk && tk.kind === 'merge')) return; // wait for the examiner
      S.mode = 'cruise';
    }
  }

  function onEngine() {
    const tk = S.task;
    if (tk && tk.kind === 'engine') { S.engine = false; closeTask(); finish(); }
    else if (S.phase === 'drive') error('err.wrongControl', tk && tk.id);
  }

  function laneShift(target, secs) {
    S.lat = { from: offset(), to: target, t0: now(), dur: secs, sig: S.signal, sigAt: S.sigAt || 0 };
  }

  function onSteer(side) {
    S.steerVis = side === 'L' ? -1 : 1;
    if (S.mode !== 'cruise' && S.mode !== 'hold') return;
    const c = nextCenter();
    const toDecision = (c - W2) - along();
    const turnCalled = S.task && S.task.kind === 'turn';
    // a turn at the coming corner (also while waiting at a stop sign)
    if ((turnCalled || toDecision < 30 || S.mode === 'hold') && !S.curve) { S.intent = side; return; }
    if (S.lat) return;
    const o = offset();
    const tk = S.task;
    if (side === 'L') {
      if (o > LANE.inner + 1) { // outer or curb → one lane left
        const ok = tk && tk.kind === 'lane' && tk.side === 'L';
        if (!ok) error('err.wrongLane', tk && tk.id);
        else { signalOk('L', tk.id); if (!looked()) error('err.noLook', tk.id); closeTask(); }
        laneShift(o > LANE.outer + 0.5 ? LANE.outer : LANE.inner, 2.6);
      } else error('err.wrongLane', tk && tk.id);
    } else {
      if (o < LANE.outer - 1) { // inner → outer
        const ok = tk && ((tk.kind === 'lane' && tk.side === 'R') || tk.kind === 'pull');
        if (!ok) error('err.wrongLane', tk && tk.id);
        else { signalOk('R', tk.id); if (!looked()) error('err.noLook', tk.id); if (tk.kind === 'lane') closeTask(); else tk.inOuter = true; }
        laneShift(LANE.outer, 2.6);
      } else if (tk && tk.kind === 'pull') { // outer → curb
        if (!tk.inOuter) { signalOk('R', tk.id); if (!looked()) error('err.noLook', tk.id); }
        tk.atCurb = true; laneShift(LANE.curb, 2.4);
      } else error('err.wrongLane', tk && tk.id);
    }
  }

  // Choose what happens on the next block.
  function scheduleBlock() {
    if (S.ended) return;
    S.blocks++;
    const c = nextCenter();
    const C = centerPoint(c);
    const [ix, iz] = gridIndex(C);
    const stop = isStop(ix, iz);
    // keep the route inside the town
    const fL = S.r.clone().negate(), fR = S.r.clone();
    const ahead = C.clone().addScaledVector(S.f, G), viaL = C.clone().addScaledVector(fL, G), viaR = C.clone().addScaledVector(fR, G);
    const inside = (p) => Math.abs(p.x) <= BOUND * G && Math.abs(p.z) <= BOUND * G;
    const opts = [];
    if (inside(ahead)) opts.push('S', 'S');
    if (inside(viaL)) opts.push('L', 'L');
    if (inside(viaR)) opts.push('R', 'R');
    const turn = pick(opts.length ? opts : ['R']);
    S.plan = { c, C, stop, turn, said: false, stopped: false, done: false };
    S.intent = null;
    // mid-block event on this stretch
    const last = S.blocks >= BLOCKS;
    S.event = null;
    if (last) S.event = { kind: 'end' };
    else if (S.blocks === Math.ceil(BLOCKS / 2)) S.event = { kind: 'pullBack' };
    else if (S.blocks === 3) S.event = { kind: 'stopHere' };
    else if (S.blocks > 1 && Math.random() < 0.55) S.event = { kind: 'lane' };
    if (S.event) { S.event.at = along() + 3; S.plan.turn = 'S'; S.plan.eventBlock = true; }
  }

  function startEvent(ev) {
    ev.started = true;
    const o = offset();
    if (ev.kind === 'lane') {
      const side = o > (LANE.inner + LANE.outer) / 2 ? 'L' : 'R';
      newTask('lane', pick(side === 'L' ? SAY.laneL : SAY.laneR), { side, deadline: null });
    } else if (ev.kind === 'stopHere') {
      newTask('stop', pick(SAY.stopHere));
    } else if (ev.kind === 'pullBack' || ev.kind === 'end') {
      newTask('pull', pick(SAY.pull), { end: ev.kind === 'end' });
    }
  }

  // ------------------------------------------------------------------ per-frame logic
  function tickTasks(dt) {
    const tk = S.task;
    const t = now();
    if (!tk || !tk.heardAt) return;
    const since = t - tk.heardAt;
    if (tk.kind === 'lane' && since > 9) { error('err.late', tk.id); closeTask(); }
    if (tk.kind === 'stop') {
      if (S.v < STOPPED) { closeTask(); flash(tr('drive.fullStop')); S.mode = 'hold'; setTimeout(() => { if (!S.ended) newTask('go', pick(SAY.straight)); }, 1800); }
      else if (since > 7) { error('err.noStop', tk.id); closeTask(); }
    }
    if (tk.kind === 'go' && since > 8) { error('err.late', tk.id); closeTask(); if (S.mode === 'hold') S.mode = 'cruise'; }
    if (tk.kind === 'pull') {
      if (!tk.atCurb && since > 14) { error('err.late', tk.id); tk.atCurb = true; laneShift(LANE.curb, 2.4); }
      if (tk.atCurb && !S.lat && S.v < 0.3) {
        closeTask(); S.mode = 'curbStop'; S.signal = null; syncPanel();
        if (tk.end) setTimeout(() => newTask('gear', 'park.inPark', { want: 'P', then: () => setTimeout(() => newTask('engine', 'park.engineOff'), 500) }), 900);
        else setTimeout(() => newTask('back', pick(SAY.back)), 900);
      }
      if (tk.atCurb && !S.lat && since > 20 && S.v > 0.3) { error('err.noStop', tk.id); S.v = 0; }
    }
    if (tk.kind === 'back') {
      if (!tk.started && since > 12) { error('err.late', tk.id); tk.started = true; S.mode = 'backing'; S.backFrom = along(); }
      if (tk.started && S.mode === 'backing' && S.backFrom - along() > 10 && !tk.okSaid) {
        tk.okSaid = true; closeTask(); newTask('stopB', 'park.okStop');
      }
    }
    if (tk.kind === 'stopB') {
      if (S.brake || S.v > -0.2 && S.mode !== 'backing') { /* handled in physics */ }
      if (S.mode === 'curbStop') { closeTask(); setTimeout(() => newTask('gear', 'park.drive', { want: 'D', then: () => setTimeout(() => newTask('merge', pick(SAY.merge), { from: 'curb' }), 500) }), 700); }
      else if (since > 4) { error('err.noStop', tk.id); S.mode = 'curbStop'; S.v = 0; }
    }
    if (tk.kind === 'gear' && since > 10) { error('err.late', tk.id); S.gear = tk.want; syncPanel(); onGear(); }
    if (tk.kind === 'engine' && since > 10) { error('err.late', tk.id); closeTask(); finish(); }
    if (tk.kind === 'merge' && since > 15) { error('err.late', tk.id); closeTask(); S.mode = 'cruise'; S.signal = null; syncPanel(); laneShift(LANE.outer, 3); scheduleBlock(); }
    void dt;
  }

  function physics(dt) {
    if (S.paused) return;
    dt *= TIME_SCALE;
    const t = now();
    // speed
    if (S.mode === 'backing') {
      if (S.brake) { S.v = Math.min(0, S.v + 6 * dt); if (S.v > -0.05) { S.v = 0; S.mode = 'curbStop'; } }
      else S.v = Math.max(-1.8, S.v - 1.5 * dt);
    } else if (S.brake) {
      // gentle at first, firmer the longer the pedal is held
      const held = Math.min(1, (now() - (S.brakeT || now())) / 0.7);
      S.v = Math.max(0, S.v - (3 + 5 * held) * dt);
      if (S.v < STOPPED) S.v = 0;
    } else if (S.mode === 'cruise') {
      const pulling = S.task && S.task.kind === 'pull' && S.task.atCurb;
      const turning = S.plan && S.plan.turn !== 'S' && S.plan.said && !S.plan.done;
      const target = S.curve ? 5.5 : pulling ? 3.5 : turning ? 7.5 : CRUISE;
      S.v += Math.sign(target - S.v) * Math.min(Math.abs(target - S.v), (target > S.v ? 2.2 : 4) * dt);
    } else S.v = Math.max(0, S.v - 6 * dt);
    if (S.mode === 'cruise' && S.v < STOPPED && S.brake) {
      // stopped by the driver
      const pl = S.plan;
      const toLine = pl ? (pl.c - W2 - 1.2) - along() : 99;
      const nearStop = pl && pl.stop && !pl.stopped && (!pl.passedLine ? toLine < STOP_ZONE : pl.overPending);
      const asked = S.task && (S.task.kind === 'stop' || S.task.kind === 'pull');
      if (nearStop) {
        pl.stopped = true; S.mode = 'hold';
        if (pl.overPending) { pl.overPending = false; error('err.overLine', pl.cmdId || null); flash(tr('err.overLine'), 'bad'); }
        else flash(tr('drive.fullStop'));
      } else if (pl && pl.stop && !pl.passedLine && toLine < STOP_ZONE * 2 && !asked) { S.mode = 'hold'; flash(tr('drive.pullUp'), 'info'); }
      else if (asked) { /* task logic handles */ }
      else if (S.stoppedAt < 0) S.stoppedAt = t;
    }
    if (S.stoppedAt > 0 && (S.v > 1 || S.mode !== 'cruise')) {
      if (S.v > 1 && t - S.stoppedAt > 1.5) { /* resumed */ }
      S.stoppedAt = -1;
    }
    if (S.mode === 'cruise' && S.stoppedAt > 0 && t - S.stoppedAt > 2 && S.v < 0.3) { error('err.stopped', null); S.stoppedAt = -1; }
    if (S.mode === 'hold' && !S.brake && S.v === 0) { /* waiting for gas */ }

    // movement
    if (S.curve) {
      S.cu += (S.v * dt) / S.curveLen;
      const u = Math.min(1, S.cu);
      const p = S.curve.getPointAt(u); S.pos.set(p.x, 0, p.z);
      const tg = S.curve.getTangentAt(Math.min(u, 0.999));
      S.heading = Math.atan2(tg.x, tg.z);
      if (u >= 1) {
        S.f.copy(S.curveF); S.r = rightOf(S.f); S.base.copy(S.plan.C); S.curve = null; S.heading = null;
        S.signal = null; syncPanel();
        scheduleBlock();
      }
    } else {
      S.pos.addScaledVector(S.f, S.v * dt);
      if (S.lat) {
        const k = Math.min(1, (t - S.lat.t0) / S.lat.dur);
        const e = k * k * (3 - 2 * k);
        const target = S.lat.from + (S.lat.to - S.lat.from) * e;
        S.pos.addScaledVector(S.r, target - offset());
        if (k >= 1) {
          const keep = (S.task && S.task.kind === 'pull') || (S.task && S.task.kind === 'turn') || S.signal !== S.lat.sig || (S.sigAt || 0) > S.lat.t0;
          S.lat = null; if (S.signal && !keep) { S.signal = null; syncPanel(); }
        }
      }
    }

    // corner logic
    const pl = S.plan;
    if (pl && !S.curve && !pl.done && S.mode !== 'backing') {
      const toLine = (pl.c - W2 - 1.2) - along();
      const toDecision = (pl.c - W2) - along();
      if (!pl.said && !pl.eventBlock && toDecision < 78 && !S.task) {
        pl.said = true;
        if (pl.turn === 'L') { pl.cmdId = pick(pl.stop ? [...SAY.stopLeft, ...SAY.left] : SAY.left); newTask('turn', pl.cmdId, { turn: 'L' }); }
        else if (pl.turn === 'R') { pl.cmdId = pick(pl.stop ? [...SAY.stopRight, ...SAY.right] : SAY.right); newTask('turn', pl.cmdId, { turn: 'R' }); }
        else if (Math.random() < 0.5) { pl.cmdId = pick(SAY.straight); newTask('turn', pl.cmdId, { turn: 'S' }); }
        else { pl.silent = true; S.cmds++; S.task = { kind: 'turn', turn: 'S', id: 'dir.follow', failed: false, heardAt: now(), silent: true }; }
      }
      if (pl.stop && !pl.passedLine && toLine > 0 && toLine < STOP_ZONE) pl.minV = Math.min(pl.minV ?? 99, S.v);
      if (pl.stop && !pl.passedLine && toLine <= 0) {
        pl.passedLine = true;
        if (!pl.stopped) {
          // still braking just over the line: decide once the car stops
          if (S.brake && S.v < 4) pl.overPending = true;
          else { const roll = (pl.minV ?? 99) < 2.2; error(roll ? 'err.rolling' : 'err.ranStop', pl.cmdId || null); flash(tr(roll ? 'err.rolling' : 'err.ranStop'), 'bad'); }
        }
      }
      if (pl.overPending && toLine < -4) { pl.overPending = false; error('err.ranStop', pl.cmdId || null); flash(tr('err.ranStop'), 'bad'); }
      if (toDecision <= 0) {
        pl.done = true;
        const want = pl.turn, got = S.intent || 'S';
        const tk = S.task && S.task.kind === 'turn' ? S.task : null;
        const id = tk ? tk.id : (pl.cmdId || 'dir.follow');
        if (want !== got) error(want !== 'S' && got === 'S' ? 'err.late' : 'err.wrongTurn', id);
        if (got !== 'S') signalOk(got, id);
        if (tk) closeTask();
        if (want !== got) say('sys.keepGoing');
        if (got === 'S') { S.signal = null; syncPanel(); setTimeout(scheduleBlockAfterCross, 0); }
        else buildTurn(got);
      }
    }
    if (S.event && !S.event.started && along() > S.event.at && !S.task && !S.curve && S.mode === 'cruise') startEvent(S.event);
    tickTasks(dt);
  }

  function scheduleBlockAfterCross() {
    // wait until the car has crossed the intersection
    const c = S.plan.c;
    const wait = () => { if (S.ended) return; if (along() > c + W2) scheduleBlock(); else requestAnimationFrame(wait); };
    wait();
  }

  function buildTurn(side) {
    const C = S.plan.C;
    const f2 = side === 'R' ? S.r.clone() : S.r.clone().negate();
    const r2 = rightOf(f2);
    const E = S.pos.clone();
    const X = C.clone().addScaledVector(f2, W2 + 1).addScaledVector(r2, side === 'L' ? LANE.inner : LANE.outer);
    const P = E.clone().addScaledVector(S.f, X.clone().sub(E).dot(S.f));
    S.curve = new THREE.QuadraticBezierCurve3(E, P, X);
    S.curveLen = S.curve.getLength(); S.cu = 0; S.curveF = f2;
  }

  // ------------------------------------------------------------------ render loop
  let last = performance.now(), raf = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (!S.ended) physics(dt);
    const heading = S.heading != null ? S.heading : Math.atan2(S.f.x, S.f.z);
    car.position.copy(S.pos);
    car.rotation.y = heading + (S.lat ? (S.lat.to - S.lat.from) * -0.02 * Math.sin(Math.PI * Math.min(1, (now() - S.lat.t0) / S.lat.dur)) : 0);
    car.updateMatrixWorld(true);
    // head check: glance over the shoulder for a moment
    const glance = now() - S.look < 1.1;
    const yawTarget = glance ? (S.lookSide === 'right' ? -1.25 : S.lookSide === 'back' ? -2.6 : 1.25) : 0;
    S.yaw += (yawTarget - S.yaw) * Math.min(1, dt * 7);
    const eye = new THREE.Vector3(-0.4, 1.38, -0.45).applyMatrix4(car.matrixWorld);
    camera.position.copy(eye);
    const dir = new THREE.Vector3(Math.sin(heading + S.yaw), -0.02, Math.cos(heading + S.yaw));
    camera.lookAt(eye.clone().add(dir));
    sun.position.set(S.pos.x - 50, 80, S.pos.z - 30); sun.target.position.copy(S.pos);
    // HUD
    const secs = Math.floor((performance.now() - S.t0) / 1000);
    $('dTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('dSpeed').textContent = `${Math.round(Math.abs(S.v) * 2.237)} mph`;
    const art = document.getElementById('dWheelArt');
    if (art) {
      const turnVis = S.curve ? (S.curveF && S.r ? 0 : 0) : 0;
      const target = S.curve ? (S.intent === 'L' ? -120 : 120) : S.lat ? (S.lat.to < S.lat.from ? -30 : 30) : (S.intent ? (S.intent === 'L' ? -25 : 25) : 0);
      S.wheelRot = (S.wheelRot || 0) + ((target + turnVis) - (S.wheelRot || 0)) * Math.min(1, dt * 6);
      art.style.transform = `rotate(${S.wheelRot}deg)`;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (S.ended) return;
    S.ended = true;
    const passed = S.errors <= MAX_ERRORS && S.critical === 0;
    say(passed ? 'res.pass' : 'res.fail').then(() => {
      const res = { passed, errors: S.errors, critical: S.critical, ok: S.okCmds, total: S.cmds, missed: S.missed, secs: Math.floor((performance.now() - S.t0) / 1000) };
      setTimeout(() => { cleanup(); onDone(res); }, 600);
    });
  }

  function cleanup() {
    S.ended = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    try { stopAudio(); } catch (e) { /* ignore */ }
    try { renderer.dispose(); } catch (e) { /* ignore */ }
  }

  if (/debug/.test(location.search)) window.__drv = S;
  raf = requestAnimationFrame(frame);
  setTimeout(runPredrive, 700);
  return { stop: cleanup };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
