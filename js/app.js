import { STAGES, PHRASES, LANGUAGES, lessonsOf, EXAM_PASS } from './content.js';
import { loadLanguage, t, phraseEn, phraseNative, phraseSay, esc, isEnglishUi } from './i18n.js';
import { store, liveStreak } from './store.js';
import { stopSpeaking, canListen, listen, requestMic, grade, words, playPhrase, warmAudio, VOICE_IDS } from './speech.js';
import { buildLesson, buildPractice, buildPracticeFrom, buildDrill, buildExam, phrase, stageProgress, weakIds, shuffle } from './engine.js';
import { visual, scene, icon, UI, mark, flag, steps, hasSteps } from './visuals.js';
import { TERMS, PRIVACY } from './legal.js';

const VERSION = '1.3.0';
const app = document.getElementById('app');
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DRILL_SECONDS = 5;

let actions = {};
let session = null;      // running lesson / practice / drill / fallback exam
let onbStep = 'lang';
let onbLang = null;
let driveResult = null;

// ---------------------------------------------------------------- helpers

function on(name, fn) { actions[name] = fn; }

function render(html, { tabs = null, side = null } = {}) {
  stopSpeaking();
  clearTimer();
  actions = {};
  // tabs: bottom bar on phones + sidebar on wide screens. side: sidebar only (wide screens).
  const nav = tabs || side;
  app.classList.toggle('with-side', !!nav);
  app.innerHTML = html + (nav ? tabBar(nav, { sideOnly: !tabs }) : '');
  window.scrollTo(0, 0);
  const focusTarget = app.querySelector('[data-autofocus]');
  if (focusTarget) setTimeout(() => focusTarget.focus(), 50);
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.getAttribute('aria-disabled') === 'true') return;
  const fn = actions[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-sheet-a]');
  if (!el) return;
  const fn = sheetActions[el.dataset.sheetA];
  if (fn) { e.preventDefault(); fn(el); }
});
app.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && actions[el.dataset.input]) actions[el.dataset.input](el, e);
});

function go(name) {
  if (location.hash === `#${name}`) route(); else location.hash = name;
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const n = document.createElement('div');
  n.className = 'toast'; n.setAttribute('role', 'status'); n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2600);
}

let sheetActions = {};
function sheet(inner, acts = {}) {
  closeSheet();
  sheetActions = acts;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${inner}</div>`;
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeSheet(); });
  document.body.appendChild(scrim);
  const f = scrim.querySelector('button, input, select');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeSheet() { document.querySelectorAll('.scrim').forEach((n) => n.remove()); sheetActions = {}; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

let audioCtx = null;
function chime(good) {
  if (!store.get().settings.sounds) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = good ? [660, 880] : [220, 180];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = good ? 'sine' : 'triangle'; o.frequency.value = f;
      const t0 = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.24);
    });
  } catch (e) { /* audio unavailable */ }
  if (store.get().settings.haptics && navigator.vibrate) try { navigator.vibrate(good ? 12 : [20, 40, 20]); } catch (e) { /* ignore */ }
}

// Play the examiner phrase in a real voice.
function hear(id, opts = {}) { return playPhrase(id, phraseEn(id), opts); }

function playButton(id, cls = 'play-big', voice = '') {
  return `<button class="${cls}" data-a="play" data-id="${id}" ${voice ? `data-voice="${voice}"` : ''} aria-label="${esc(t('ex.play'))}">${UI.speaker}</button>`;
}
function slowButton(id, voice = '') {
  return `<button class="play-sm" data-a="slow" data-id="${id}" ${voice ? `data-voice="${voice}"` : ''} aria-label="${esc(t('ex.playSlow'))}">${UI.slow}</button>`;
}

async function playWithPulse(el, opts = {}) {
  el.classList.add('playing');
  await hear(el.dataset.id, { voice: el.dataset.voice || undefined, ...opts });
  el.classList.remove('playing');
}

// The English line, how it sounds, and the meaning, stacked.
function phraseBlock(id, { big = false } = {}) {
  const say = phraseSay(id);
  return `<div class="pblock">
    <p class="${big ? 'en-line' : 'pb-en'}" lang="en">${esc(phraseEn(id))}</p>
    ${say ? `<p class="pb-say"><span class="pb-label">${esc(t('ex.howSounds'))}</span>${esc(say)}</p>` : ''}
    ${isEnglishUi() ? '' : `<p class="pb-tr">${esc(phraseNative(id))}</p>`}
  </div>`;
}

// ---------------------------------------------------------------- progress model

function stageIndex(id) { return STAGES.findIndex((s) => s.id === id); }

function unlocked(stageId) {
  const i = stageIndex(stageId);
  if (i <= 0) return true;
  if (STAGES[i].exam) return ['car', 'dir', 'lane', 'park'].every((s) => stageProgress(s).done >= 1);
  return stageProgress(STAGES[i - 1].id).done >= 1;
}

function currentStage() {
  for (const s of STAGES) { if (s.exam) return s; if (!stageProgress(s.id).complete) return s; }
  return STAGES[STAGES.length - 1];
}

function drivePassed() { const b = store.get().driveBest; return !!(b && b.passed); }

function readiness() {
  const learnStages = STAGES.filter((s) => !s.exam);
  const frac = learnStages.reduce((a, s) => { const p = stageProgress(s.id); return a + p.done / p.total; }, 0) / learnStages.length;
  const b = store.get().driveBest;
  const drive = b ? (b.passed ? 1 : Math.min(0.8, b.ok / Math.max(1, b.total))) : 0;
  return Math.round(100 * (frac * 0.6 + drive * 0.4));
}

function learnedCount() { return Object.entries(store.get().stats).filter(([id, s]) => phrase(id) && phrase(id).stage !== 'sys' && s.ok > 0).length; }
const LEARNABLE = PHRASES.filter((p) => p.stage !== 'sys');

// ---------------------------------------------------------------- scenes

const HOME_PATHS = {
  turnLeft: 'M217 900 L217 440 C217 352 196 322 130 322 L-80 322',
  turnRight: 'M217 900 L217 430 C217 392 232 370 262 370 L470 370',
  straight: 'M217 900 L217 -60',
  laneLeft: 'M217 900 L217 640 C217 580 173 560 173 500 L173 -60',
  laneRight: 'M173 900 L173 640 C173 580 217 560 217 500 L217 -60',
  pullOver: 'M210 900 L210 660 C210 610 228 590 228 540',
  merge: 'M228 760 C228 700 212 680 212 630 L212 -60',
  backUp: 'M217 470 L217 760',
  stop: 'M217 900 L217 452',
};

function homeScene(maneuver) {
  const d = HOME_PATHS[maneuver] || HOME_PATHS.turnLeft;
  const rev = maneuver === 'backUp';
  const hour = new Date().getHours();
  const part = hour >= 17 && hour < 20 ? 'dusk' : 'day';
  const motion = reduceMotion ? '' :
    `<animateMotion dur="7s" repeatCount="indefinite" rotate="${rev ? 'auto-reverse' : 'auto'}" keyPoints="0;0;1;1" keyTimes="0;0.12;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.35 1;0 0 1 1"><mpath href="#homePath"/></animateMotion>`;
  const still = reduceMotion ? 'transform="translate(217 600) rotate(-90)"' : '';
  return `<div class="home-scene" data-part="${part}" aria-hidden="true">
  <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet"><g transform="translate(0 -130)">
    <rect x="-1400" y="-800" width="3200" height="2600" fill="var(--sc-ground)"/>
    <rect x="-1400" y="-800" width="1546" height="1096" rx="22" fill="var(--sc-block)"/>
    <rect x="244" y="-800" width="1560" height="1096" rx="22" fill="var(--sc-block)"/>
    <rect x="-1400" y="396" width="1546" height="1400" rx="22" fill="var(--sc-block)"/>
    <rect x="244" y="396" width="1560" height="1400" rx="22" fill="var(--sc-block)"/>
    <rect x="152" y="-800" width="86" height="2600" fill="var(--sc-road)"/>
    <rect x="-1400" y="300" width="3200" height="92" fill="var(--sc-road)"/>
    <path d="M195 -800V270M195 420V1800M-1400 346H122M268 346H1800" stroke="var(--sc-paint)" stroke-width="2.5" stroke-dasharray="18 16"/>
    <rect x="197" y="402" width="40" height="5" fill="var(--sc-paint)"/>
    <path id="homePath" d="${d}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" opacity=".9"/>
    <g ${still}><g>
      <rect x="-22" y="-12" width="44" height="24" rx="7" fill="var(--accent)"/>
      <rect x="${rev ? -16 : 4}" y="-8" width="10" height="16" rx="3" fill="var(--sc-glass)"/>
      ${motion}
    </g></g>
  </g></svg></div>`;
}

function maneuverOf(id) {
  const p = phrase(id);
  if (p && p.visual && p.visual.startsWith('scene:')) {
    const name = p.visual.split(':')[1];
    return HOME_PATHS[name] ? name : 'turnRight';
  }
  return p && p.stage === 'car' ? 'stop' : 'straight';
}

function heroVisual(id) {
  const p = phrase(id);
  const fallback = { talk: 'icon:talk', res: 'icon:flag', lane: 'scene:laneRight', park: 'scene:backUp' };
  const key = p.visual || fallback[p.stage] || 'icon:car';
  if (key.startsWith('scene:') || key.startsWith('arm:')) return `<div class="hero-visual">${visual(key, { animate: !reduceMotion, dur: 3.2 })}</div>`;
  return `<div class="hero-visual is-icon">${icon(key.split(':')[1], 56)}</div>`;
}

// ---------------------------------------------------------------- tab bar

function tabBar(current, { sideOnly = false } = {}) {
  const tab = (name, label, svg, cls = '') => `<button class="tab ${cls}" data-a="tab-${name}" ${current === name ? 'aria-current="page"' : ''}>${svg}<span>${esc(label)}</span></button>`;
  on('tab-home', () => go('home'));
  on('tab-practice', () => go('practice'));
  on('tab-profile', () => go('profile'));
  on('tab-phrases', () => go('phrases'));
  on('tab-checklist', () => go('checklist'));
  on('tab-prefs', () => go('prefs'));
  on('tab-drive', () => (unlocked('exam') ? go('drive') : toast(t('stage.exam.info'))));
  const lang = LANGUAGES.find((l) => l.code === store.get().lang);
  on('tab-lang', () => languageSheet());
  return `<nav class="tabs glass ${sideOnly ? 'side-only' : ''}" aria-label="Frenu">
    <span class="side-brand brand">${mark(28)} Frenu ${flag(18)}</span>
    ${tab('home', t('nav.home'), UI.home)}${tab('practice', t('nav.practice'), UI.practice)}${tab('profile', t('nav.profile'), UI.profile)}
    <span class="side-sep" aria-hidden="true"></span>
    ${tab('drive', t('drive.title'), UI.car, 'side')}${tab('phrases', t('home.phrases'), UI.book, 'side')}${tab('checklist', t('chk.title'), UI.check, 'side')}${tab('prefs', t('set.title'), UI.gear, 'side')}
    <button class="side-lang side" data-a="tab-lang">${UI.globe}<span>${esc(lang ? lang.nativeName : 'English')}</span></button>
  </nav>`;
}

// ---------------------------------------------------------------- onboarding

function viewOnboarding() {
  const dots = ['lang', 'name', 'mic', 'agree'].map((s) => `<i class="${s === onbStep ? 'on' : ''}"></i>`).join('');
  if (onbStep === 'lang') {
    const sel = onbLang || store.get().lang;
    const list = (q = '') => LANGUAGES
      .filter((l) => !q || `${l.nativeName} ${l.name}`.toLowerCase().includes(q.toLowerCase()))
      .map((l) => `<button class="lang" data-a="pick" data-code="${l.code}" aria-pressed="${l.code === sel}"><span><span class="native" lang="${l.code}">${esc(l.nativeName)}</span><br><span class="eng">${esc(l.name)}</span></span><span class="tick">${UI.check}</span></button>`).join('');
    render(`<main class="view onb onb-lang">
      <div class="bar"><span class="brand">${mark(24)} Frenu</span><span class="dots" aria-hidden="true">${dots}</span></div>
      <div class="split onb-split"><div class="col-a">
      <div class="onb-hero">
        <span class="us-pill">${flag(20)}<span>${esc(t('app.badge'))}</span></span>
        <h1 class="en" lang="en">Know every word of your drive test.</h1>
        ${sel && sel !== 'en' ? `<p class="tr">${esc(t('onb.welcome'))}</p>` : ''}
      </div>
      <div class="onb-scene">${scene('turnLeft', { animate: !reduceMotion, dur: 4.2 })}</div>
      </div><div class="col-b">
      <h2 class="section-label" id="langLabel">${esc(t('onb.chooseLanguage'))}</h2>
      <div class="search">${UI.search}<input type="search" id="langSearch" data-input="search" placeholder="${esc(t('onb.searchLanguage'))}" aria-labelledby="langLabel" autocomplete="off"></div>
      <div class="lang-list" id="langList">${list()}</div>
      <div class="sticky-foot"><button class="btn btn-primary btn-block" data-a="next" ${sel ? '' : 'aria-disabled="true"'}>${esc(t('onb.continue'))}</button></div>
      </div></div>
    </main>`);
    on('search', (el) => { document.getElementById('langList').innerHTML = list(el.value); });
    on('pick', async (el) => {
      onbLang = el.dataset.code;
      await loadLanguage(onbLang);
      const q = document.getElementById('langSearch').value;
      viewOnboarding();
      if (q) { const s = document.getElementById('langSearch'); s.value = q; document.getElementById('langList').innerHTML = list(q); }
      const picked = app.querySelector(`[data-code="${onbLang}"]`); if (picked) picked.focus();
    });
    on('next', () => { store.set({ lang: onbLang || store.get().lang }); onbStep = 'name'; viewOnboarding(); });
    return;
  }
  if (onbStep === 'name') {
    render(`<main class="view onb">
      <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button><span class="dots" aria-hidden="true">${dots}</span></div>
      <h1 class="onb-title" style="margin-top:6vh">${esc(t('onb.nameTitle'))}</h1>
      <div class="field"><input id="nameIn" type="text" maxlength="30" autocomplete="given-name" placeholder="${esc(t('onb.namePlaceholder'))}" value="${esc(store.get().name)}" aria-label="${esc(t('onb.namePlaceholder'))}" data-autofocus></div>
      <div class="sticky-foot">
        <button class="btn btn-primary btn-block" data-a="next">${esc(t('onb.continue'))}</button>
        <button class="btn btn-ghost btn-block" data-a="skip">${esc(t('onb.skip'))}</button>
      </div>
    </main>`);
    const saveName = () => store.set({ name: document.getElementById('nameIn').value.trim() });
    on('back', () => { onbStep = 'lang'; viewOnboarding(); });
    on('next', () => { saveName(); onbStep = 'mic'; viewOnboarding(); });
    on('skip', () => { store.set({ name: '' }); onbStep = 'mic'; viewOnboarding(); });
    document.getElementById('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { saveName(); onbStep = 'mic'; viewOnboarding(); } });
    return;
  }
  if (onbStep === 'mic') {
    const supported = canListen();
    render(`<main class="view onb">
      <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button><span class="dots" aria-hidden="true">${dots}</span></div>
      <div class="mic-hero">${UI.mic}</div>
      <h1 class="onb-title">${esc(t('onb.micTitle'))}</h1>
      <p class="onb-body">${esc(supported ? t('onb.micBody') : t('ex.micUnsupported'))}</p>
      <div class="sticky-foot">
        ${supported ? `<button class="btn btn-primary btn-block" data-a="allow">${esc(t('onb.micAllow'))}</button>` : ''}
        <button class="btn btn-ghost btn-block" data-a="later">${esc(supported ? t('onb.micLater') : t('onb.continue'))}</button>
      </div>
    </main>`);
    on('back', () => { onbStep = 'name'; viewOnboarding(); });
    on('allow', async () => { const r = await requestMic(); store.set({ mic: r }); if (r === 'denied') toast(t('ex.micBlocked')); onbStep = 'agree'; viewOnboarding(); });
    on('later', () => { if (!supported) store.set({ mic: 'unsupported' }); onbStep = 'agree'; viewOnboarding(); });
    return;
  }
  render(`<main class="view onb">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button><span class="dots" aria-hidden="true">${dots}</span></div>
    <div class="onb-scene" style="margin-top:4vh">${scene('straight', { animate: !reduceMotion, dur: 3 })}</div>
    <span class="us-pill">${flag(20)}<span>${esc(t('app.badgeSub'))}</span></span>
    <h1 class="onb-title">${esc(t('app.tagline'))}</h1>
    <div class="sticky-foot">
      <label class="agree"><input type="checkbox" id="agreeBox" ${store.get().agreed ? 'checked' : ''}><span>${esc(t('onb.agree'))} · <button class="link" data-a="terms" type="button">${esc(t('set.terms'))}</button> · <button class="link" data-a="privacy" type="button">${esc(t('set.privacy'))}</button></span></label>
      <p class="hint-err" id="agreeErr" aria-live="polite"></p>
      <button class="btn btn-accent btn-block" data-a="start">${esc(t('onb.start'))}</button>
    </div>
  </main>`);
  on('back', () => { onbStep = 'mic'; viewOnboarding(); });
  on('terms', () => legalSheet('terms'));
  on('privacy', () => legalSheet('privacy'));
  on('start', () => {
    if (!document.getElementById('agreeBox').checked) { document.getElementById('agreeErr').textContent = t('onb.agreeFirst'); return; }
    warmAudio();
    store.set({ agreed: true, onboarded: true });
    go('home');
  });
}

function legalSheet(which) {
  sheet(`<div class="legal en" lang="en">${which === 'terms' ? TERMS : PRIVACY}</div><button class="btn btn-ghost btn-block" data-sheet-a="close">${esc(t('gen.close'))}</button>`, { close: closeSheet });
}

// ---------------------------------------------------------------- home

function routeDots(cur) {
  return `<span class="mini-track" aria-hidden="true">${STAGES.map((s) => {
    const done = s.exam ? drivePassed() : stageProgress(s.id).complete;
    return `<i class="${done ? 'done' : s.id === cur.id ? 'now' : ''}"></i>`;
  }).join('')}</span>`;
}

function viewHome() {
  const cur = currentStage();
  let featured, label, act;
  if (cur.exam) { featured = 'dir.stopLeft'; label = t('drive.start'); act = 'drive'; }
  else {
    const p = stageProgress(cur.id);
    featured = lessonsOf(cur.id)[p.done].ids[0];
    label = p.done ? t('home.continue') : t('home.start');
    act = 'start';
  }
  const n = stageIndex(cur.id) + 1;
  const driveOpen = unlocked('exam');
  render(`${homeScene(maneuverOf(featured))}
  <main class="home-ui">
    <div class="bar">
      <span class="brand">${mark(24)} Frenu ${flag(18)}</span>
      <button class="step-pill glass" data-a="stages" aria-label="${esc(t('home.stopOf', { n, total: STAGES.length }))}">${routeDots(cur)}<span>${n}/${STAGES.length}</span></button>
    </div>
    <div class="spacer"></div>
    <section class="lesson-card glass" aria-label="${esc(t('home.today'))}">
      <button class="kicker" data-a="info">${esc(t(`stage.${cur.id}`))}</button>
      <div class="cmd-row">
        <p class="cmd" lang="en">${esc(phraseEn(featured))}</p>
        ${playButton(featured, 'play-big')}
      </div>
      ${isEnglishUi() ? '' : `<p class="cmd-tr">${esc(phraseNative(featured))}</p>`}
      <button class="btn btn-primary btn-block" data-a="${act}">${esc(label)}</button>
    </section>
    ${!cur.exam ? `<button class="drive-btn glass" data-a="${driveOpen ? 'drive' : 'locked'}">${icon('car', 26)}<span>${esc(t('home.drive'))}</span>${driveOpen ? UI.chevron : UI.lock}</button>` : ''}
    <aside class="home-side glass" aria-label="${esc(t('home.stopOf', { n, total: STAGES.length }))}">
      <h2 class="section-label">${esc(t('home.stopOf', { n, total: STAGES.length }))}</h2>
      <div class="stage-list">${stageRows('page')}</div>
      <button class="feature" data-a="drill"><span class="feature-ico">${UI.bolt}</span><span class="grow"><b>${esc(t('drill.title'))}</b><span class="sub">${esc(t('drill.body'))}</span></span>${UI.chevron}</button>
    </aside>
  </main>`, { tabs: 'home' });
  on('play', (el) => { warmAudio(); playWithPulse(el); });
  on('start', () => { warmAudio(); startLesson(cur.id); });
  on('drive', () => { warmAudio(); go('drive'); });
  on('locked', () => toast(t('stage.exam.info')));
  on('stages', () => stagesSheet());
  on('info', () => infoSheet(cur.id));
  on('stage', (el) => { warmAudio(); openStage(el.dataset.id); });
  on('drill', () => { warmAudio(); begin(buildDrill()); });
}

function infoSheet(stageId) {
  sheet(`<h2>${esc(t(`stage.${stageId}`))}</h2><p>${esc(t(`stage.${stageId}.info`))}</p>
    <button class="btn btn-ghost btn-block" data-sheet-a="how">${esc(t('set.howItWorks'))}</button>
    <button class="btn btn-primary btn-block" data-sheet-a="close">${esc(t('gen.close'))}</button>`,
  { close: closeSheet, how: () => howSheet() });
}

function howSheet() {
  sheet(`<h2>${esc(t('info.title'))}</h2>
    <p>${esc(t('info.p1'))}</p><p>${esc(t('info.p2'))}</p><p>${esc(t('info.p3'))}</p>
    <p style="font-size:var(--t-sm)">${esc(t('info.source'))} ${esc(t('info.p4'))}</p>
    <button class="btn btn-primary btn-block" data-sheet-a="close">${esc(t('info.close'))}</button>`, { close: closeSheet });
}

function stageRows(mode) {
  return STAGES.map((s) => {
    const p = s.exam ? null : stageProgress(s.id);
    const open = unlocked(s.id);
    const b = store.get().driveBest;
    const sub = s.exam ? (b ? `${b.passed ? t('drive.pass') : t('drive.fail')} · ${b.ok}/${b.total}` : '') : `${p.done} / ${p.total}`;
    const attr = mode === 'sheet' ? `data-sheet-a="${open ? `stage-${s.id}` : 'locked'}"` : `data-a="${open ? 'stage' : 'locked'}" data-id="${s.id}"`;
    return `<button class="stage-row ${open ? '' : 'locked'}" ${attr}>
      <span class="ico">${icon(s.exam ? 'car' : s.icon, 30)}</span>
      <span class="grow"><b>${esc(t(s.exam ? 'drive.title' : `stage.${s.id}`))}</b><span class="sub">${esc(sub)}</span></span>
      ${open ? UI.chevron : UI.lock}
    </button>`;
  }).join('');
}

function openStage(id) { if (id === 'exam') go('drive'); else startLesson(id); }

function stagesSheet() {
  const acts = { close: closeSheet, locked: () => toast(t('home.stopOf', { n: stageIndex(currentStage().id) + 1, total: STAGES.length })) };
  STAGES.forEach((s) => { acts[`stage-${s.id}`] = () => { closeSheet(); openStage(s.id); }; });
  sheet(`<h2>${esc(t('home.stopOf', { n: stageIndex(currentStage().id) + 1, total: STAGES.length }))}</h2><div class="stage-list">${stageRows('sheet')}</div>
    <button class="btn btn-ghost btn-block" data-sheet-a="close">${esc(t('gen.close'))}</button>`, acts);
}

function languageSheet() {
  const cur = store.get().lang;
  const rows = LANGUAGES.map((l) => `<button class="lang" data-sheet-a="l-${l.code}" aria-pressed="${l.code === cur}"><span><span class="native" lang="${l.code}">${esc(l.nativeName)}</span><br><span class="eng">${esc(l.name)}</span></span><span class="tick">${UI.check}</span></button>`).join('');
  const acts = { close: closeSheet };
  LANGUAGES.forEach((l) => { acts[`l-${l.code}`] = async () => { store.set({ lang: l.code }); await loadLanguage(l.code); closeSheet(); route(); toast(t('set.saved')); }; });
  sheet(`<h2>${esc(t('set.language'))}</h2><div class="lang-list">${rows}</div>`, acts);
}

// ---------------------------------------------------------------- lessons

function startLesson(stageId) {
  if (!unlocked(stageId)) return;
  const p = stageProgress(stageId);
  const idx = p.complete ? lessonsOf(stageId).length - 1 : p.done;
  begin(buildLesson(stageId, idx));
}

function begin(plan) {
  session = { ...plan, pos: 0, right: 0, wrong: 0, started: Date.now(), requeued: new Set(), missed: [] };
  if (location.hash === '#lesson') viewLesson(); else go('lesson');
}

let timer = null;
function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }

function viewLesson() {
  if (!session) return go('home');
  const item = session.items[session.pos];
  if (!item) return finishLesson();
  if (item.type === 'speak' && (store.get().mic === 'denied' || !canListen())) { session.pos++; return viewLesson(); }
  const pct = Math.round((session.pos / session.items.length) * 100);
  const isExam = session.kind === 'exam';
  if (item.voice === 'random' && !item.v) item.v = VOICE_IDS[Math.floor(Math.random() * VOICE_IDS.length)];
  const top = `<div class="lesson-top">
      <button class="icon-btn" data-a="quit" aria-label="${esc(t('ex.quit'))}">${UI.close}</button>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      ${isExam ? `<span class="chip" aria-label="${esc(t('exam.errors'))}">${UI.x}<span>${session.wrong}</span></span>` : ''}
    </div>
    ${item.timed ? '<div class="timebar" aria-hidden="true"><i id="timeFill"></i></div>' : ''}`;
  const body = ({ intro: exIntro, listen: exListen, act: exAct, speak: exSpeak })[item.type](item, isExam);
  render(`<main class="view lesson">${top}${body}</main><div class="feedback" id="fb" aria-live="assertive"><div class="inner" id="fbInner"></div></div>`);
  on('quit', () => {
    if (session.pos === 0 || session.kind === 'drill') { session = null; return go('home'); }
    sheet(`<h2>${esc(t('ex.quitConfirm'))}</h2>
      <button class="btn btn-primary btn-block" data-sheet-a="keep">${esc(t('ex.keepGoing'))}</button>
      <button class="btn btn-ghost btn-block" data-sheet-a="leave">${esc(t('ex.quit'))}</button>`,
    { keep: closeSheet, leave: () => { closeSheet(); session = null; go('home'); } });
  });
  on('play', (el) => playWithPulse(el));
  on('slow', (el) => playWithPulse(el, { slow: true }));
  on('show', (el) => { const box = document.getElementById('reveal'); if (box) { box.hidden = false; el.remove(); } });
  // Speak the command right away (this runs inside the tap that brought us here).
  if (item.type !== 'speak') {
    const b = app.querySelector('[data-a="play"]');
    if (b) playWithPulse(b).then(() => { if (item.timed && session && session.items[session.pos] === item) startTimer(item); });
  }
}

function startTimer(item) {
  const fill = document.getElementById('timeFill');
  if (!fill) return;
  const t0 = Date.now();
  clearTimer();
  timer = setInterval(() => {
    const left = 1 - (Date.now() - t0) / (DRILL_SECONDS * 1000);
    fill.style.width = `${Math.max(0, left) * 100}%`;
    if (left <= 0) {
      clearTimer();
      if (session && session.items[session.pos] === item && !item.answered) {
        item.answered = true;
        app.querySelectorAll('.vopt, .opt').forEach((o) => { o.setAttribute('aria-disabled', 'true'); if (o.dataset.id === item.id || (phrase(o.dataset.id).visual && phrase(o.dataset.id).visual === phrase(item.id).visual)) o.classList.add('is-good'); });
        result(item, false, { late: true });
      }
    }
  }, 60);
}

// Hidden-by-default text: the learner should react to sound, not reading.
function revealBox(id, { show = store.get().settings.showText } = {}) {
  return `${show ? '' : `<button class="reveal-btn" data-a="show">${esc(t('ex.showText'))}</button>`}
    <div id="reveal" ${show ? '' : 'hidden'}>${phraseBlock(id)}</div>`;
}

// ---- Intro: learn a new phrase (hear it, see the action, meaning, how it sounds)
function exIntro(item) {
  setTimeout(() => { on('next', () => { store.record(item.id, true); next(); }); });
  return `<div class="ex"><div class="ex-a"><h1 class="prompt">${esc(t('ex.learn'))}</h1>
    ${heroVisual(item.id)}
    <div class="audio-row">${playButton(item.id)}${slowButton(item.id)}</div></div>
    <div class="ex-b">${phraseBlock(item.id, { big: true })}
    ${doBlock(item.id)}</div></div>
    <div class="lesson-foot"><button class="btn btn-primary btn-block" data-a="next">${esc(t('ex.gotIt'))}</button></div>`;
}

// The physical action, shown with the same buttons as the drive test.
function doBlock(id) {
  const v = phrase(id).visual;
  if (!hasSteps(v)) return '';
  return `<div class="do-block"><span class="pb-label">${esc(t('ex.doIt'))}</span>${steps(v, (k) => esc(t(k)))}</div>`;
}

// ---- Act: hear the command, tap what you do
function exAct(item, isExam) {
  const opts = item.options.map((id, i) => `<button class="vopt" data-a="opt" data-id="${id}" aria-pressed="false" aria-label="${i + 1}">${visual(phrase(id).visual, { animate: false })}</button>`).join('');
  setTimeout(() => {
    on('opt', (el) => {
      if (item.answered) return;
      if (item.timed) { // drill: first tap counts
        item.answered = true; clearTimer();
        checkAct(item, el.dataset.id); return;
      }
      app.querySelectorAll('.vopt').forEach((o) => o.setAttribute('aria-pressed', 'false'));
      el.setAttribute('aria-pressed', 'true');
      item.chosen = el.dataset.id;
      document.getElementById('checkBtn').removeAttribute('aria-disabled');
    });
    on('check', () => { if (item.chosen && !item.answered) { item.answered = true; checkAct(item, item.chosen); } });
  });
  const v = item.v || '';
  return `<div class="ex"><div class="ex-a"><h1 class="prompt">${esc(t('ex.act'))}</h1>
    <div class="audio-row">${playButton(item.id, 'play-big', v)}${isExam || item.timed ? '' : slowButton(item.id, v)}</div>
    ${isExam || item.timed ? '' : revealBox(item.id)}</div>
    <div class="ex-b"><div class="grid-2">${opts}</div></div></div>
    ${item.timed ? '' : `<div class="lesson-foot"><button class="btn btn-primary btn-block" id="checkBtn" data-a="check" aria-disabled="true">${esc(t('ex.check'))}</button></div>`}`;
}

function checkAct(item, chosen) {
  const ok = phrase(chosen).visual === phrase(item.id).visual;
  app.querySelectorAll('.vopt').forEach((o) => {
    o.setAttribute('aria-disabled', 'true');
    const v = phrase(o.dataset.id).visual;
    if (v === phrase(item.id).visual) { o.classList.add('is-good'); if (!reduceMotion && (v.startsWith('scene:') || v.startsWith('arm:'))) o.innerHTML = visual(v, { animate: true, dur: 2.6 }); }
    else if (o.dataset.id === chosen) o.classList.add('is-bad');
  });
  result(item, ok);
}

// ---- Listen: things the examiner says to you; pick what it means
function exListen(item) {
  const nativeOpts = !isEnglishUi();
  const opts = item.options.map((id) => `<button class="opt" data-a="opt" data-id="${id}" aria-pressed="false" ${nativeOpts ? '' : 'lang="en"'}>${esc(nativeOpts ? phraseNative(id) : phraseEn(id))}</button>`).join('');
  setTimeout(() => {
    on('opt', (el) => {
      if (item.answered) return;
      app.querySelectorAll('.opt').forEach((o) => o.setAttribute('aria-pressed', 'false'));
      el.setAttribute('aria-pressed', 'true'); item.chosen = el.dataset.id;
      document.getElementById('checkBtn').removeAttribute('aria-disabled');
    });
    on('check', () => {
      if (!item.chosen || item.answered) return;
      item.answered = true;
      const ok = item.chosen === item.id;
      app.querySelectorAll('.opt').forEach((o) => { o.setAttribute('aria-disabled', 'true'); if (o.dataset.id === item.id) o.classList.add('is-good'); else if (o.dataset.id === item.chosen) o.classList.add('is-bad'); });
      result(item, ok);
    });
  });
  return `<div class="ex"><div class="ex-a"><h1 class="prompt">${esc(t('ex.listen'))}</h1>
    <div class="audio-row">${playButton(item.id, 'play-big')}${slowButton(item.id)}</div></div>
    <div class="ex-b"><div class="options">${opts}</div></div></div>
    <div class="lesson-foot"><button class="btn btn-primary btn-block" id="checkBtn" data-a="check" aria-disabled="true">${esc(t('ex.check'))}</button></div>`;
}

// ---- Speak: phrases the learner says (e.g. asking the examiner to repeat)
function exSpeak(item) {
  setTimeout(() => {
    let busy = false;
    const btn = document.getElementById('micBtn');
    const label = document.getElementById('micLabel');
    const marksEl = document.getElementById('marks');
    on('mic', async () => {
      if (busy) { listen.stop && listen.stop(); return; }
      busy = true; stopSpeaking();
      btn.classList.add('on'); label.textContent = t('ex.listening');
      try {
        const { alternatives } = await listen();
        if (store.get().mic !== 'granted') store.set({ mic: 'granted' });
        const g = grade(phraseEn(item.id), alternatives);
        marksEl.innerHTML = marksHtml(phraseEn(item.id), g);
        const ok = g.score >= 0.8;
        const almost = !ok && g.score >= 0.5;
        label.textContent = '';
        result(item, ok || almost, { almost, heard: g.heard, retry: !ok });
      } catch (err) {
        if (err.code === 'denied') { store.set({ mic: 'denied' }); toast(t('ex.micBlocked')); next(); }
        else if (err.code === 'unsupported') { store.set({ mic: 'unsupported' }); toast(t('ex.micUnsupported')); next(); }
        else label.textContent = t('ex.heardNothing');
      } finally { busy = false; if (btn) btn.classList.remove('on'); }
    });
    on('cant', () => next());
  });
  const say = phraseSay(item.id);
  return `<div class="ex"><div class="ex-a"><h1 class="prompt">${esc(t('ex.speak'))}</h1>
    <div class="audio-row">${playButton(item.id)}${slowButton(item.id)}</div>
    <p class="marks" id="marks" lang="en">${esc(phraseEn(item.id))}</p>
    ${say ? `<p class="pb-say"><span class="pb-label">${esc(t('ex.howSounds'))}</span>${esc(say)}</p>` : ''}
    ${isEnglishUi() ? '' : `<p class="pb-tr">${esc(phraseNative(item.id))}</p>`}</div>
    <div class="ex-b"><div class="speak-zone">
      <button class="mic-btn" id="micBtn" data-a="mic" aria-label="${esc(t('ex.tapToSpeak'))}">${UI.mic}</button>
      <p class="mic-label" id="micLabel" aria-live="polite">${esc(t('ex.tapToSpeak'))}</p>
    </div></div></div>
    <div class="lesson-foot"><button class="text-btn" data-a="cant">${esc(t('ex.cantSpeak'))}</button></div>`;
}

function marksHtml(target, g) {
  const original = target.split(/\s+/);
  let k = 0;
  return original.map((w) => {
    const n = words(w).length || 1;
    const slice = g.marks.slice(k, k + n); k += n;
    const ok = slice.length && slice.every((m) => m.ok);
    return `<span class="${ok ? 'ok' : 'miss'}">${esc(w)}</span>`;
  }).join(' ');
}

// ---- Result sheet
function result(item, ok, { almost = false, heard = '', retry = false, late = false } = {}) {
  const isExam = session.kind === 'exam';
  chime(ok && !almost);
  store.record(item.id, ok);
  let pushed = false;
  if (ok) session.right++;
  else {
    session.wrong++;
    session.missed.push(item.id);
    if (!isExam && session.kind !== 'drill' && !session.requeued.has(session.pos)) {
      session.requeued.add(session.items.length);
      session.items.push({ ...quizCopy(item), again: true });
      pushed = true;
    }
  }
  const fb = document.getElementById('fb');
  const inner = document.getElementById('fbInner');
  const title = late ? t('ex.timeUp') : ok ? (almost ? t('ex.almost') : t('ex.correct')) : t('ex.incorrect');
  inner.innerHTML = `<div class="fb-head"><span class="fb-icon">${ok ? UI.check : UI.x}</span><span class="fb-title">${esc(title)}</span></div>
    <div class="fb-body">${heard ? `<span class="tr">${esc(t('ex.youSaid'))}: <span class="en" lang="en">“${esc(heard)}”</span></span>` : ''}
      <span class="en" lang="en">${esc(phraseEn(item.id))}</span>
      ${phraseSay(item.id) ? `<span class="say">${esc(phraseSay(item.id))}</span>` : ''}
      ${isEnglishUi() ? '' : `<span class="tr">${esc(phraseNative(item.id))}</span>`}</div>
    ${!ok && item.type !== 'speak' ? doBlock(item.id) : ''}
    <div style="display:flex;gap:10px">
      ${retry && item.type === 'speak' ? `<button class="btn btn-ghost" style="flex:1" data-fb="retry">${esc(t('ex.tryAgain'))}</button>` : ''}
      <button class="btn ${ok ? 'btn-good' : 'btn-bad'}" style="flex:2" data-fb="next">${esc(t('ex.continue'))}</button>
    </div>`;
  fb.className = `feedback show ${ok ? 'good' : 'bad'}`;
  const nextBtn = inner.querySelector('[data-fb="next"]');
  setTimeout(() => nextBtn.focus(), 60);
  nextBtn.addEventListener('click', () => next());
  const retryBtn = inner.querySelector('[data-fb="retry"]');
  if (retryBtn) retryBtn.addEventListener('click', () => {
    if (ok) session.right--; else { session.wrong--; session.missed.pop(); if (pushed) { session.items.pop(); session.requeued.delete(session.items.length); } }
    viewLesson();
  });
}

function quizCopy(item) {
  const c = { ...item };
  delete c.answered; delete c.chosen; delete c.v;
  return c;
}

function next() {
  clearTimer();
  session.pos++;
  const item = session.items[session.pos];
  if (item && item.again && !session.toldMistakes) { session.toldMistakes = true; toast(t('ex.reviewMistakes')); }
  viewLesson();
}

function finishLesson() {
  const s = session;
  const answered = s.right + s.wrong;
  const acc = answered ? Math.round((s.right / answered) * 100) : 100;
  const secs = Math.round((Date.now() - s.started) / 1000);
  store.addXp(0);
  if (s.stageId) store.lessonDone(s.stageId);
  const nextStage = currentStage();
  const firstId = s.items[0] && s.items[0].id;
  const isExam = s.kind === 'exam';
  const isDrill = s.kind === 'drill';
  session = null;
  if (isExam) return finishFallbackExam(s);
  const missed = [...new Set(s.missed)].slice(0, 6);
  render(`<main class="view done">
    <div class="split"><div class="col-a">
    <div class="done-visual">${scene(firstId ? (maneuverOf(firstId) === 'stop' ? 'straight' : maneuverOf(firstId)) : 'straight', { animate: !reduceMotion, dur: 3 })}</div>
    </div><div class="col-b">
    <h1 class="done-title">${esc(isDrill ? t('drill.result', { n: s.right, total: s.items.length }) : t('done.title'))}</h1>
    <div class="stats">
      <div class="stat"><span>${esc(t('done.accuracy'))}</span><b>${acc}%</b></div>
      <div class="stat"><span>${esc(t('done.time'))}</span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></div>
      <div class="stat"><span>${esc(t('pro.streak'))}</span><b>${liveStreak()}</b></div>
    </div>
    ${missed.length ? `<div><h2 class="section-label">${esc(t('drive.review'))}</h2>${missed.map((id) => phraseRow(id)).join('')}</div>` : ''}
    <div class="lesson-foot">
      ${isDrill ? `<button class="btn btn-primary btn-block" data-a="again">${esc(t('exam.retry'))}</button>`
        : `<button class="btn btn-primary btn-block" data-a="next">${esc(nextStage.exam ? t('drive.start') : t('done.next'))}</button>`}
      <button class="btn btn-ghost btn-block" data-a="home">${esc(t('done.home'))}</button>
    </div>
    </div></div>
  </main>`);
  chime(true);
  on('next', () => (nextStage.exam ? go('drive') : startLesson(nextStage.id)));
  on('again', () => begin(buildDrill()));
  on('home', () => go('home'));
  on('play', (el) => playWithPulse(el));
}

// ---------------------------------------------------------------- drive test

function viewDriveIntro() {
  render(`<main class="view lesson drv-intro">
    <div class="bar"><button class="icon-btn" data-a="home" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <div class="split"><div class="col-a">
    <div class="stage-visual">${scene('turnLeft', { animate: !reduceMotion, dur: 3.4 })}</div>
    </div><div class="col-b">
    <span class="us-pill">${flag(20)}<span>${esc(t('app.badgeSub'))}</span></span>
    <h1 class="page-title">${esc(t('drive.title'))}</h1>
    <p style="color:var(--ink-2)">${esc(t('drive.body'))}</p>
    <button class="reveal-btn" data-a="how" style="align-self:flex-start">${UI.info} ${esc(t('drive.controls'))}</button>
    <div class="lesson-foot">
      <button class="btn btn-accent btn-block" data-a="short" data-autofocus>${esc(t('drive.short'))}</button>
      <button class="btn btn-ghost btn-block" data-a="full">${esc(t('drive.full'))}</button>
    </div>
    </div></div>
  </main>`, { side: 'drive' });
  on('home', () => go('home'));
  on('how', () => controlsSheet());
  on('short', () => runDrive('short'));
  on('full', () => runDrive('full'));
}

function controlsSheet() {
  sheet(`<h2>${esc(t('drive.controls'))}</h2>
    <p>${esc(t('drive.cSignal'))}</p><p>${esc(t('drive.cArm'))}</p><p>${esc(t('drive.cLook'))}</p><p>${esc(t('drive.cSteer'))}</p><p>${esc(t('drive.cPedals'))}</p><p>${esc(t('drive.cGear'))}</p>
    <button class="btn btn-primary btn-block" data-sheet-a="close">${esc(t('gen.close'))}</button>`, { close: closeSheet });
}

async function runDrive(length) {
  warmAudio();
  render(`<main class="view" style="justify-content:center;align-items:center"><p style="color:var(--ink-2)">${esc(t('drive.loading'))}…</p></main>`);
  let mod;
  try { mod = await import('./drive.js'); } catch (e) { mod = null; }
  const ok = mod && (await mod.prepare().catch(() => false));
  if (!ok) { toast(t('drive.unsupported')); return startFallbackExam(); }
  mod.start({
    root: app, length, t, hear: (id, voice) => playPhrase(id, phraseEn(id), { voice }), stopAudio: stopSpeaking,
    onExit: () => go('home'),
    onDone: (res) => { driveResult = res; saveDrive(res); go('drive-result'); },
  });
}

function saveDrive(res) {
  res.missed.forEach((m) => { if (m.id) store.record(m.id, false); });
  const prev = store.get().driveBest;
  const better = !prev || (res.passed && !prev.passed) || (res.passed === prev.passed && res.ok / res.total > prev.ok / prev.total);
  if (better) store.set({ driveBest: { ok: res.ok, total: res.total, errors: res.errors, critical: res.critical, passed: res.passed } });
  store.addXp(0);
}

function viewDriveResult() {
  const r = driveResult;
  if (!r) return go('home');
  const rows = r.missed.length
    ? r.missed.map((m) => `<div class="phr">${m.id ? playButton(m.id, 'play-sm') : `<span class="play-sm">${UI.x}</span>`}<div class="txt">
        <span class="err-label ${m.critical ? 'crit' : ''}">${esc(t(m.err))}</span>
        ${m.id ? `<span class="en" lang="en">${esc(phraseEn(m.id))}</span>${phraseSay(m.id) ? `<span class="say">${esc(phraseSay(m.id))}</span>` : ''}${isEnglishUi() ? '' : `<span class="tr">${esc(phraseNative(m.id))}</span>`}` : ''}
      </div></div>`).join('')
    : `<p class="empty">${esc(t('drive.noMistakes'))}</p>`;
  render(`<main class="view done" style="justify-content:flex-start;gap:20px">
    <div class="split"><div class="col-a">
    <span class="us-pill">${flag(20)}<span>${esc(t('app.badgeSub'))}</span></span>
    <h1 class="done-title ${r.passed ? 'pass' : 'fail'}">${esc(r.passed ? t('drive.pass') : t('drive.fail'))}</h1>
    <p style="color:var(--ink-2);font-size:var(--t-md)">${esc(t('drive.passBody', { n: r.ok, total: r.total }))} ${r.passed ? '' : esc(t('drive.failBody'))}</p>
    <div class="stats">
      <div class="stat"><span>${esc(t('drive.errors'))}</span><b>${r.errors} / 15</b></div>
      <div class="stat"><span>${esc(t('drive.critical'))}</span><b class="${r.critical ? 'warn' : ''}">${r.critical}</b></div>
      <div class="stat"><span>${esc(t('done.time'))}</span><b>${Math.floor(r.secs / 60)}:${String(r.secs % 60).padStart(2, '0')}</b></div>
    </div>
    <div class="lesson-foot">
      <button class="btn btn-primary btn-block" data-a="again">${esc(t('drive.again'))}</button>
      ${r.missed.length ? `<button class="btn btn-ghost btn-block" data-a="practice">${esc(t('home.practice'))}</button>` : ''}
      <button class="btn btn-ghost btn-block" data-a="home">${esc(t('done.home'))}</button>
    </div>
    </div><div class="col-b">
    <div><h2 class="section-label">${esc(t('drive.review'))}</h2>${rows}</div>
    </div></div>
  </main>`);
  chime(r.passed);
  on('again', () => go('drive'));
  on('practice', () => { warmAudio(); begin(buildPracticeFrom(r.missed.map((m) => m.id).filter(Boolean))); });
  on('home', () => go('home'));
  on('play', (el) => playWithPulse(el));
}

function startFallbackExam() {
  session = { ...buildExam(), pos: 0, right: 0, wrong: 0, started: Date.now(), requeued: new Set(), missed: [] };
  if (location.hash === '#lesson') viewLesson(); else go('lesson');
}

function finishFallbackExam(s) {
  const total = s.items.length;
  const share = s.right / total;
  const pass = share >= EXAM_PASS;
  if (share > store.get().examBest) store.set({ examBest: share });
  render(`<main class="view done">
    <div class="done-visual">${scene(pass ? 'parkSpace' : 'backUp', { animate: !reduceMotion, dur: 3 })}</div>
    <h1 class="done-title">${esc(pass ? t('exam.pass') : t('exam.fail'))}</h1>
    <p style="color:var(--ink-2);font-size:var(--t-lg)">${esc(t(pass ? 'exam.passBody' : 'exam.failBody', { n: s.right, total }))}</p>
    <div class="lesson-foot">
      <button class="btn btn-primary btn-block" data-a="again">${esc(t('exam.retry'))}</button>
      <button class="btn btn-ghost btn-block" data-a="home">${esc(t('done.home'))}</button>
    </div>
  </main>`);
  on('again', () => startFallbackExam());
  on('home', () => go('home'));
}

// ---------------------------------------------------------------- practice

function viewPractice() {
  const weak = weakIds(8);
  const list = weak.length ? weak.map((id) => phraseRow(id)).join('') : `<p class="empty">${esc(t('prc.weakEmpty'))}</p>`;
  render(`<main class="view has-tabs prc" style="gap:16px">
    <h1 class="page-title">${esc(t('prc.title'))}</h1>
    <div class="split"><div class="col-a">
    <button class="feature glass-flat" data-a="drill">
      <span class="feature-ico">${UI.bolt}</span>
      <span class="grow"><b>${esc(t('drill.title'))}</b><span class="sub">${esc(t('drill.body'))}</span></span>${UI.chevron}
    </button>
    <div class="list">
      <button class="row" data-a="mixed"><span class="row-l">${UI.practice}<b>${esc(t('prc.quick'))}</b></span>${UI.chevron}</button>
      <button class="row" data-a="drive"><span class="row-l">${icon('car', 22)}<b>${esc(t('drive.title'))}</b></span>${unlocked('exam') ? UI.chevron : UI.lock}</button>
      <button class="row" data-a="book"><span class="row-l">${UI.book}<b>${esc(t('home.phrases'))}</b></span>${UI.chevron}</button>
      <button class="row" data-a="check"><span class="row-l">${icon('exam', 22)}<b>${esc(t('chk.title'))}</b></span>${UI.chevron}</button>
    </div>
    </div><div class="col-b">
    <h2 class="section-label">${esc(t('prc.weak'))}</h2>
    <div>${list}</div>
    </div></div>
  </main>`, { tabs: 'practice' });
  on('drill', () => { warmAudio(); begin(buildDrill()); });
  on('mixed', () => { warmAudio(); begin(buildPractice()); });
  on('drive', () => (unlocked('exam') ? go('drive') : toast(t('stage.exam.info'))));
  on('book', () => go('phrases'));
  on('check', () => go('checklist'));
  on('play', (el) => playWithPulse(el));
}

function phraseRow(id) {
  const say = phraseSay(id);
  return `<div class="phr">${playButton(id, 'play-sm')}<div class="txt"><span class="en" lang="en">${esc(phraseEn(id))}</span>${say ? `<span class="say">${esc(say)}</span>` : ''}${isEnglishUi() ? '' : `<span class="tr">${esc(phraseNative(id))}</span>`}</div></div>`;
}

function viewPhrases() {
  const groups = (q) => STAGES.filter((s) => !s.exam).map((s) => {
    const items = LEARNABLE.filter((p) => p.stage === s.id).filter((p) => !q || `${phraseEn(p.id)} ${phraseNative(p.id)}`.toLowerCase().includes(q.toLowerCase()));
    if (!items.length) return '';
    return `<h2 class="section-label">${esc(t(`stage.${s.id}`))}</h2>${items.map((p) => phraseRow(p.id)).join('')}`;
  }).join('') || `<p class="empty">${esc(t('phr.empty'))}</p>`;
  render(`<main class="view phrs" style="gap:14px">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <h1 class="page-title">${esc(t('phr.title'))}</h1>
    <div class="search">${UI.search}<input type="search" data-input="q" placeholder="${esc(t('phr.search'))}" aria-label="${esc(t('phr.search'))}"></div>
    <div id="groups" class="phr-groups">${groups('')}</div>
  </main>`, { side: 'phrases' });
  on('back', () => (history.length > 1 ? history.back() : go('practice')));
  on('q', (el) => { document.getElementById('groups').innerHTML = groups(el.value); });
  on('play', (el) => playWithPulse(el));
}

// ---------------------------------------------------------------- checklist

function viewChecklist() {
  const sec = (title, keys) => `<section class="chk-sec"><h2 class="section-label">${esc(t(title))}</h2><ul class="checks">${keys.map((k) => `<li>${UI.check}<span>${esc(t(k))}</span></li>`).join('')}</ul></section>`;
  render(`<main class="view chk" style="gap:12px">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <span class="us-pill">${flag(20)}<span>${esc(t('app.badgeSub'))}</span></span>
    <h1 class="page-title">${esc(t('chk.title'))}</h1>
    <div class="chk-grid">
    ${sec('chk.bring', ['chk.permit', 'chk.driver', 'chk.registration', 'chk.insurance', 'chk.glasses'])}
    ${sec('chk.car', ['chk.lights', 'chk.horn', 'chk.tires', 'chk.glass', 'chk.inside'])}
    ${sec('chk.atDmv', ['chk.early', 'chk.wait', 'chk.noHelp', 'chk.ask'])}
    </div>
    <div class="phr" style="border:0">${playButton('talk.repeat', 'play-sm')}<div class="txt"><span class="en" lang="en">${esc(phraseEn('talk.repeat'))}</span>${phraseSay('talk.repeat') ? `<span class="say">${esc(phraseSay('talk.repeat'))}</span>` : ''}</div></div>
    <p style="color:var(--ink-3);font-size:var(--t-xs)">${esc(t('chk.source'))} ${esc(t('info.p4'))}</p>
  </main>`, { side: 'checklist' });
  on('back', () => (history.length > 1 ? history.back() : go('practice')));
  on('play', (el) => playWithPulse(el));
}

// ---------------------------------------------------------------- profile

function viewProfile() {
  const s = store.get();
  const b = s.driveBest;
  render(`<main class="view has-tabs pro" style="gap:16px">
    <div class="bar"><h1 class="page-title">${esc(s.name || t('pro.title'))}</h1><button class="icon-btn" data-a="prefs" aria-label="${esc(t('set.title'))}">${UI.gear}</button></div>
    <div class="big-stats">
      <div class="stat"><span>${esc(t('pro.ready'))}</span><b>${readiness()}%</b></div>
      <div class="stat"><span>${esc(t('pro.streak'))}</span><b>${liveStreak()}</b></div>
      <div class="stat"><span>${esc(t('pro.learned'))}</span><b>${learnedCount()} / ${LEARNABLE.length}</b></div>
      <div class="stat"><span>${esc(t('pro.bestDrive'))}</span><b class="${b && b.passed ? 'okc' : ''}">${b ? `${b.ok}/${b.total}` : '—'}</b></div>
    </div>
    <div class="split"><div class="col-a">
    <div class="stage-list">${stageRows('page')}</div>
    </div><div class="col-b">
    <div class="list">
      <button class="row" data-a="check"><span>${esc(t('chk.title'))}</span>${UI.chevron}</button>
      <button class="row" data-a="how"><span>${esc(t('set.howItWorks'))}</span>${UI.chevron}</button>
      <button class="row" data-a="terms"><span>${esc(t('set.terms'))}</span>${UI.chevron}</button>
      <button class="row" data-a="privacy"><span>${esc(t('set.privacy'))}</span>${UI.chevron}</button>
    </div>
    </div></div>
  </main>`, { tabs: 'profile' });
  on('prefs', () => go('prefs'));
  on('stage', (el) => openStage(el.dataset.id));
  on('locked', () => toast(t('home.stopOf', { n: stageIndex(currentStage().id) + 1, total: STAGES.length })));
  on('check', () => go('checklist'));
  on('how', () => howSheet());
  on('terms', () => go('terms'));
  on('privacy', () => go('privacy'));
}

// ---------------------------------------------------------------- settings

function viewPrefs() {
  const s = store.get();
  const lang = LANGUAGES.find((l) => l.code === s.lang);
  const sw = (key, label) => `<div class="row"><span id="lbl-${key}">${esc(label)}</span><button class="switch" role="switch" aria-checked="${!!s.settings[key]}" aria-labelledby="lbl-${key}" data-a="sw" data-key="${key}"></button></div>`;
  const voices = [
    ['mix', t('set.voiceMix')], ['w1', t('set.voiceWoman', { n: 1 })], ['w2', t('set.voiceWoman', { n: 2 })],
    ['m1', t('set.voiceMan', { n: 1 })], ['m2', t('set.voiceMan', { n: 2 })],
  ];
  render(`<main class="view prefs" style="gap:14px">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <h1 class="page-title">${esc(t('set.title'))}</h1>
    <div class="split"><div class="col-a">
    <h2 class="section-label">${esc(t('set.voices'))}</h2>
    <div class="list" role="radiogroup" aria-label="${esc(t('set.voices'))}">
      ${voices.map(([k, label]) => `<button class="row" role="radio" aria-checked="${(s.settings.voice || 'mix') === k}" data-a="voice" data-k="${k}"><span>${esc(label)}</span><span class="val">${(s.settings.voice || 'mix') === k ? UI.check : UI.speaker}</span></button>`).join('')}
    </div>

    <h2 class="section-label">${esc(t('set.speed'))}</h2>
    <div class="seg-ctl" role="group" aria-label="${esc(t('set.speed'))}">
      ${['slow', 'normal', 'fast'].map((k) => `<button data-a="speed" data-k="${k}" aria-pressed="${s.settings.speed === k}">${esc(t(`set.${k}`))}</button>`).join('')}
    </div>

    </div><div class="col-b">
    <div class="list">
      <button class="row" data-a="lang"><span>${esc(t('set.language'))}</span><span class="val">${esc(lang ? lang.nativeName : 'English')} ${UI.chevron}</span></button>
      <div class="row"><label for="nameEdit">${esc(t('set.name'))}</label><input id="nameEdit" class="inline-input" data-input="name" value="${esc(s.name)}" placeholder="${esc(t('onb.namePlaceholder'))}" maxlength="30"></div>
    </div>

    <div class="list">
      ${sw('showText', t('set.showText'))}
      ${sw('sounds', t('set.sounds'))}
      ${'vibrate' in navigator ? sw('haptics', t('set.haptics')) : ''}
    </div>

    <div class="list">
      <button class="row" data-a="install"><span>${esc(t('set.install'))}</span>${UI.chevron}</button>
      <button class="row" data-a="how"><span>${esc(t('set.howItWorks'))}</span>${UI.chevron}</button>
      <button class="row" data-a="terms"><span>${esc(t('set.terms'))}</span>${UI.chevron}</button>
      <button class="row" data-a="privacy"><span>${esc(t('set.privacy'))}</span>${UI.chevron}</button>
    </div>

    <div class="list"><button class="row" data-a="reset" style="color:var(--bad)"><span>${esc(t('set.reset'))}</span></button></div>
    <p style="color:var(--ink-3);font-size:var(--t-xs);text-align:center;padding:8px 0">Frenu · ${esc(t('set.version', { v: VERSION }))} · © 2026 Patron LLC</p>
    </div></div>
  </main>`, { side: 'prefs' });
  on('back', () => go('profile'));
  on('voice', (el) => {
    const k = el.dataset.k;
    store.setting('voice', k);
    app.querySelectorAll('[data-a="voice"]').forEach((b) => {
      const on_ = b.dataset.k === k;
      b.setAttribute('aria-checked', String(on_));
      b.querySelector('.val').innerHTML = on_ ? UI.check : UI.speaker;
    });
    hear('dir.cornerLeft', { voice: k === 'mix' ? undefined : k });
  });
  on('speed', (el) => {
    store.setting('speed', el.dataset.k);
    app.querySelectorAll('[data-a="speed"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === el.dataset.k)));
    hear('lane.pullOver');
  });
  on('lang', () => languageSheet());
  on('name', (el) => store.set({ name: el.value.trim() }));
  on('sw', (el) => { const k = el.dataset.key; const v = !store.get().settings[k]; store.setting(k, v); el.setAttribute('aria-checked', String(v)); });
  on('install', () => sheet(`<h2>${esc(t('set.install'))}</h2><p>${esc(t('set.installHow'))}</p><button class="btn btn-primary btn-block" data-sheet-a="close">${esc(t('gen.close'))}</button>`, { close: closeSheet }));
  on('how', () => howSheet());
  on('terms', () => go('terms'));
  on('privacy', () => go('privacy'));
  on('reset', () => sheet(`<h2>${esc(t('set.reset'))}</h2><p>${esc(t('set.resetConfirm'))}</p>
    <button class="btn btn-bad btn-block" data-sheet-a="yes">${esc(t('set.resetYes'))}</button>
    <button class="btn btn-ghost btn-block" data-sheet-a="close">${esc(t('set.cancel'))}</button>`,
  { close: closeSheet, yes: () => { store.reset(); closeSheet(); toast(t('set.resetDone')); go('home'); } }));
}

function viewLegal(which) {
  render(`<main class="view" style="gap:10px">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button>${isEnglishUi() ? '' : `<span class="chip">${esc(t('gen.legalEnglish'))}</span>`}</div>
    <article class="legal en" lang="en">${which === 'terms' ? TERMS : PRIVACY}</article>
  </main>`, { side: 'profile' });
  on('back', () => (history.length > 1 ? history.back() : go('profile')));
}

// ---------------------------------------------------------------- router

let leaving = null;
function route() {
  closeSheet();
  if (leaving) { try { leaving(); } catch (e) { /* ignore */ } leaving = null; }
  const name = location.hash.replace('#', '');
  const s = store.get();
  if (name === 'terms') return viewLegal('terms');
  if (name === 'privacy') return viewLegal('privacy');
  if (!s.onboarded) { onbLang = onbLang || s.lang; return viewOnboarding(); }
  switch (name) {
    case 'lesson': return session ? viewLesson() : go('home');
    case 'drive': return unlocked('exam') ? viewDriveIntro() : go('home');
    case 'drive-result': return viewDriveResult();
    case 'practice': return viewPractice();
    case 'profile': return viewProfile();
    case 'prefs': return viewPrefs();
    case 'phrases': return viewPhrases();
    case 'checklist': return viewChecklist();
    default: return viewHome();
  }
}
export function onLeave(fn) { leaving = fn; }

window.addEventListener('hashchange', route);

function offlinePill() {
  document.querySelectorAll('.offline-pill').forEach((n) => n.remove());
  if (navigator.onLine === false) {
    const n = document.createElement('div'); n.className = 'offline-pill'; n.textContent = t('gen.offline');
    document.body.appendChild(n); setTimeout(() => n.remove(), 4000);
  }
}
window.addEventListener('offline', offlinePill);

async function boot() {
  try {
    const s = store.get();
    const guess = (navigator.language || 'en').toLowerCase();
    const auto = LANGUAGES.find((l) => guess.startsWith(l.code.toLowerCase().split('-')[0]) && l.code !== 'en');
    const code = s.lang || (s.onboarded ? 'en' : (auto ? auto.code : 'en'));
    await loadLanguage(code);
    if (!s.lang && auto) onbLang = auto.code;
    route();
  } catch (e) {
    app.innerHTML = '<main class="view"><p class="empty">Something went wrong. Reload the page to try again.</p></main>';
  }
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (e) { /* sandboxed: no offline cache */ }
}

boot();
