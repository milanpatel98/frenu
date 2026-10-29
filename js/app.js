import { STAGES, PHRASES, LANGUAGES, lessonsOf, EXAM_PASS } from './content.js';
import { loadLanguage, t, phraseEn, phraseNative, esc, isEnglishUi, currentCode } from './i18n.js';
import { store, liveStreak } from './store.js';
import { speak, stopSpeaking, canListen, listen, requestMic, grade, words, englishVoices, RATES } from './speech.js';
import { buildLesson, buildPractice, buildExam, phrase, stageProgress, sameSentence, weakIds, shuffle } from './engine.js';
import { visual, scene, icon, UI, mark } from './visuals.js';
import { TERMS, PRIVACY } from './legal.js';

const VERSION = '1.0.0';
const app = document.getElementById('app');
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let actions = {};
let session = null;      // running lesson / practice / exam
let onbStep = 'lang';
let onbLang = null;

// ---------------------------------------------------------------- helpers

function on(name, fn) { actions[name] = fn; }

function render(html, { tabs = null } = {}) {
  stopSpeaking();
  actions = {};
  app.innerHTML = html + (tabs ? tabBar(tabs) : '');
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

// Feedback sounds (generated, no files)
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
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + 0.24);
    });
  } catch (e) { /* audio unavailable */ }
  if (store.get().settings.haptics && navigator.vibrate) try { navigator.vibrate(good ? 12 : [20, 40, 20]); } catch (e) { /* ignore */ }
}

function say(id, opts) { return speak(phraseEn(id), opts); }

function playButton(id, cls = 'play-big', act = 'play') {
  return `<button class="${cls}" data-a="${act}" data-id="${id}" aria-label="${esc(t('ex.play'))}">${UI.speaker}</button>`;
}

async function playWithPulse(el, opts) {
  const id = el.dataset.id;
  el.classList.add('playing');
  await say(id, opts);
  el.classList.remove('playing');
}

function enSpan(id) { return `<span class="en" lang="en">${esc(phraseEn(id))}</span>`; }

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

function readiness() {
  const learnStages = STAGES.filter((s) => !s.exam);
  const frac = learnStages.reduce((a, s) => { const p = stageProgress(s.id); return a + p.done / p.total; }, 0) / learnStages.length;
  return Math.round(100 * (frac * 0.7 + store.get().examBest * 0.3));
}

function learnedCount() { return Object.values(store.get().stats).filter((s) => s.ok > 0).length; }

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
  const part = hour >= 20 || hour < 6 ? 'night' : hour >= 17 ? 'dusk' : 'day';
  const motion = reduceMotion ? '' :
    `<animateMotion dur="7s" repeatCount="indefinite" rotate="${rev ? 'auto-reverse' : 'auto'}" keyPoints="0;0;1;1" keyTimes="0;0.12;0.88;1" calcMode="spline" keySplines="0 0 1 1;0.45 0 0.35 1;0 0 1 1"><mpath href="#homePath"/></animateMotion>`;
  const still = reduceMotion ? 'transform="translate(217 600) rotate(-90)"' : '';
  return `<div class="home-scene" data-part="${part}" aria-hidden="true">
  <svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet">
    <rect x="-1400" y="-800" width="3200" height="2600" fill="var(--sc-ground)"/>
    <rect x="-1400" y="-800" width="1546" height="1096" rx="22" fill="var(--sc-block)"/>
    <rect x="244" y="-800" width="1560" height="1096" rx="22" fill="var(--sc-block)"/>
    <rect x="-1400" y="396" width="1546" height="1400" rx="22" fill="var(--sc-block)"/>
    <rect x="244" y="396" width="1560" height="1400" rx="22" fill="var(--sc-block)"/>
    <circle cx="60" cy="470" r="22" fill="var(--sc-tree)"/><circle cx="104" cy="520" r="16" fill="var(--sc-tree)"/>
    <circle cx="320" cy="120" r="24" fill="var(--sc-tree)"/><circle cx="290" cy="200" r="15" fill="var(--sc-tree)"/>
    <circle cx="330" cy="640" r="20" fill="var(--sc-tree)"/><circle cx="72" cy="150" r="18" fill="var(--sc-tree)"/>
    <rect x="152" y="-800" width="86" height="2600" fill="var(--sc-road)"/>
    <rect x="-1400" y="300" width="3200" height="92" fill="var(--sc-road)"/>
    <path d="M195 -800V270M195 420V1800M-1400 346H122M268 346H1800" stroke="var(--sc-paint)" stroke-width="2.5" stroke-dasharray="18 16"/>
    <rect x="197" y="402" width="40" height="5" fill="var(--sc-paint)"/>
    <g fill="var(--sc-paint)" opacity=".9">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${158 + i * 12}" y="276" width="6" height="18"/>`).join('')}${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="128" y="${306 + i * 12}" width="18" height="6"/>`).join('')}</g>
    <path id="homePath" d="${d}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" opacity=".9"/>
    <g ${still}><g>
      <rect x="-22" y="-12" width="44" height="24" rx="7" fill="var(--accent)"/>
      <rect x="${rev ? -16 : 4}" y="-8" width="10" height="16" rx="3" fill="var(--sc-glass)"/>
      ${motion}
    </g></g>
  </svg></div>`;
}

function maneuverOf(id) {
  const p = phrase(id);
  if (p && p.visual && p.visual.startsWith('scene:')) {
    const name = p.visual.split(':')[1];
    return HOME_PATHS[name] ? name : 'turnRight';
  }
  return p && p.stage === 'car' ? 'stop' : 'straight';
}

// ---------------------------------------------------------------- tab bar

function tabBar(current) {
  const tab = (name, label, svg) => `<button class="tab" data-a="tab-${name}" ${current === name ? 'aria-current="page"' : ''}>${svg}<span>${esc(label)}</span></button>`;
  on('tab-home', () => go('home'));
  on('tab-practice', () => go('practice'));
  on('tab-profile', () => go('profile'));
  return `<nav class="tabs glass" aria-label="Roadword">${tab('home', t('nav.home'), UI.home)}${tab('practice', t('nav.practice'), UI.practice)}${tab('profile', t('nav.profile'), UI.profile)}</nav>`;
}

// ---------------------------------------------------------------- onboarding

function viewOnboarding() {
  const dots = ['lang', 'name', 'mic', 'agree'].map((s) => `<i class="${s === onbStep ? 'on' : ''}"></i>`).join('');
  if (onbStep === 'lang') {
    const sel = onbLang || store.get().lang;
    const list = (q = '') => LANGUAGES
      .filter((l) => !q || `${l.nativeName} ${l.name}`.toLowerCase().includes(q.toLowerCase()))
      .map((l) => `<button class="lang" data-a="pick" data-code="${l.code}" aria-pressed="${l.code === sel}"><span><span class="native" lang="${l.code}">${esc(l.nativeName)}</span><br><span class="eng">${esc(l.name)}</span></span><span class="tick">${UI.check}</span></button>`).join('');
    render(`<main class="view onb">
      <div class="bar"><span class="brand">${mark(24)} Roadword</span><span class="dots" aria-hidden="true">${dots}</span></div>
      <div class="onb-hero">
        <h1 class="en" lang="en">Know every word of your drive test.</h1>
        ${sel && sel !== 'en' ? `<p class="tr">${esc(t('onb.welcome'))}</p>` : ''}
      </div>
      <div class="onb-scene">${scene('turnLeft', { animate: !reduceMotion, dur: 4.2 })}</div>
      <h2 class="section-label" id="langLabel">${esc(sel ? t('onb.chooseLanguage') : 'Your language')}</h2>
      <div class="search">${UI.search}<input type="search" id="langSearch" data-input="search" placeholder="${esc(sel ? t('onb.searchLanguage') : 'Search languages')}" aria-labelledby="langLabel" autocomplete="off"></div>
      <div class="lang-list" id="langList">${list()}</div>
      <div class="sticky-foot"><button class="btn btn-primary btn-block" data-a="next" ${sel ? '' : 'aria-disabled="true"'}>${esc(sel ? t('onb.continue') : 'Continue')}</button></div>
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
  // agree
  render(`<main class="view onb">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button><span class="dots" aria-hidden="true">${dots}</span></div>
    <div class="onb-scene" style="margin-top:4vh">${scene('straight', { animate: !reduceMotion, dur: 3 })}</div>
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
    store.set({ agreed: true, onboarded: true });
    go('home');
  });
}

function legalSheet(which) {
  sheet(`<div class="legal en" lang="en">${which === 'terms' ? TERMS : PRIVACY}</div><button class="btn btn-ghost btn-block" data-sheet-a="close">${esc(t('gen.close'))}</button>`, { close: closeSheet });
}

// ---------------------------------------------------------------- home

function routeCard() {
  const cur = currentStage();
  const curIdx = stageIndex(cur.id);
  let html = '';
  STAGES.forEach((s, i) => {
    const p = stageProgress(s.id);
    const isLast = i === STAGES.length - 1;
    if (isLast) { html += `<span class="goal ${store.get().examBest >= EXAM_PASS ? 'done' : ''}"></span>`; return; }
    const cls = p.complete ? 'done' : s.id === cur.id ? 'now' : '';
    html += `<span class="stop ${cls}"></span><span class="seg ${p.complete && i < curIdx ? 'done' : ''}"></span>`;
  });
  const n = Math.min(curIdx + 1, STAGES.length);
  return `<button class="route glass" data-a="stages" aria-label="${esc(t('home.stopOf', { n, total: STAGES.length }))}">
    <span class="track">${html}</span>
    <span class="route-meta"><span><b>${esc(t('home.stopOf', { n, total: STAGES.length }))}</b> ${esc(t(`stage.${cur.id}`))}</span><span>${esc(t('home.exam'))}</span></span>
  </button>`;
}

function viewHome() {
  const s = store.get();
  const cur = currentStage();
  const streak = liveStreak();
  const code = LANGUAGES.find((l) => l.code === s.lang);
  let featured, cta, kicker;
  if (cur.exam) {
    featured = 'dir.cornerLeft';
    cta = `<button class="btn btn-primary btn-block" data-a="exam">${esc(t('exam.begin'))}</button>`;
    kicker = t('stage.exam');
  } else {
    const p = stageProgress(cur.id);
    const lesson = lessonsOf(cur.id)[p.done];
    featured = lesson.ids[0];
    cta = `<button class="btn btn-primary btn-block" data-a="start">${esc(p.done ? t('home.continue') : t('home.start'))}</button>`;
    kicker = t(`stage.${cur.id}`);
  }
  render(`${homeScene(maneuverOf(featured))}
  <main class="home-ui">
    <div class="bar">
      <span class="brand">${mark(24)} Roadword</span>
      <span class="chips">
        <button class="chip" data-a="lang" aria-label="${esc(t('set.language'))}">${UI.globe}<span>${esc(code ? code.code.split('-')[0].toUpperCase() : 'EN')}</span></button>
        <span class="chip" aria-label="${esc(t('pro.streak'))}: ${streak}">${UI.flame}<span>${streak}</span></span>
      </span>
    </div>
    ${routeCard()}
    <div class="spacer"></div>
    <section class="lesson-card glass" aria-label="${esc(t('home.today'))}">
      <div class="card-row">
        <span class="kicker">${esc(kicker)} <button class="icon-btn" style="width:32px;height:32px" data-a="info" aria-label="${esc(t('gen.more'))}">${UI.info}</button></span>
        ${playButton(featured)}
      </div>
      <p class="cmd" lang="en">${esc(phraseEn(featured))}</p>
      ${isEnglishUi() ? '<div style="height:12px"></div>' : `<p class="cmd-tr">${esc(phraseNative(featured))}</p>`}
      ${cta}
    </section>
    <div class="quick">
      <button class="glass" data-a="practice">${UI.bolt}<span>${esc(t('home.practice'))}</span></button>
      <button class="glass" data-a="phrases">${UI.book}<span>${esc(t('home.phrases'))}</span></button>
    </div>
  </main>`, { tabs: 'home' });
  on('play', (el) => playWithPulse(el));
  on('start', () => startLesson(cur.id));
  on('exam', () => go('exam'));
  on('practice', () => startPractice('mixed'));
  on('phrases', () => go('phrases'));
  on('stages', () => stagesSheet());
  on('lang', () => languageSheet());
  on('info', () => infoSheet(cur.id));
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

function stagesSheet() {
  const rows = STAGES.map((s) => {
    const p = s.exam ? null : stageProgress(s.id);
    const open = unlocked(s.id);
    const sub = s.exam ? (store.get().examBest ? `${Math.round(store.get().examBest * 100)}%` : '') : `${p.done} / ${p.total}`;
    return `<button class="stage-row ${open ? '' : 'locked'}" data-sheet-a="${open ? `stage-${s.id}` : 'locked'}">
      <span class="ico">${icon(s.icon, 30)}</span>
      <span class="grow"><b>${esc(t(`stage.${s.id}`))}</b><span class="sub">${esc(sub)}</span></span>
      ${open ? UI.chevron : UI.lock}
    </button>`;
  }).join('');
  const acts = { close: closeSheet, locked: () => toast(t(`stage.${STAGES.find((s) => !unlocked(s.id)).id}.info`)) };
  STAGES.forEach((s) => { acts[`stage-${s.id}`] = () => { closeSheet(); if (s.exam) go('exam'); else startLesson(s.id); }; });
  sheet(`<h2>${esc(t('home.stopOf', { n: stageIndex(currentStage().id) + 1, total: STAGES.length }))}</h2><div class="stage-list">${rows}</div>
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
  const plan = buildLesson(stageId, idx);
  begin(plan);
}

function startPractice(mode) { begin(buildPractice(mode)); }

function begin(plan) {
  session = { ...plan, pos: 0, right: 0, wrong: 0, started: Date.now(), requeued: new Set(), noSpeak: false, xp: 0 };
  if (isEnglishUi()) session.items = session.items.map((it) => (it.type === 'match' ? { type: 'listen', id: it.ids[0], options: shuffle(it.ids.slice(0, 4)) } : it));
  go('lesson');
}

function viewLesson() {
  if (!session) return go('home');
  const item = session.items[session.pos];
  if (!item) return finishLesson();
  if (item.type === 'speak' && (session.noSpeak || store.get().mic === 'denied' || !canListen())) {
    session.items[session.pos] = { type: 'listen', id: item.id, options: shuffle([item.id, ...shuffle(PHRASES.filter((p) => p.id !== item.id && p.stage === phrase(item.id).stage)).slice(0, 3).map((p) => p.id)]) };
    return viewLesson();
  }
  const pct = Math.round((session.pos / session.items.length) * 100);
  const isExam = session.kind === 'exam';
  const top = `<div class="lesson-top">
      <button class="icon-btn" data-a="quit" aria-label="${esc(t('ex.quit'))}">${UI.close}</button>
      <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      ${isExam ? `<span class="chip" aria-label="${esc(t('exam.errors'))}">${UI.x}<span>${session.wrong}</span></span>` : ''}
    </div>`;
  const body = ({ listen: exListen, act: exAct, build: exBuild, speak: exSpeak, match: exMatch })[item.type](item, isExam);
  render(`<main class="view lesson">${top}${body}</main><div class="feedback" id="fb" aria-live="assertive"><div class="inner" id="fbInner"></div></div>`);
  on('quit', () => {
    if (session.pos === 0) { session = null; return go('home'); }
    sheet(`<h2>${esc(t('ex.quitConfirm'))}</h2>
      <button class="btn btn-primary btn-block" data-sheet-a="keep">${esc(t('ex.keepGoing'))}</button>
      <button class="btn btn-ghost btn-block" data-sheet-a="leave">${esc(t('ex.quit'))}</button>`,
    { keep: closeSheet, leave: () => { closeSheet(); session = null; go('home'); } });
  });
  on('play', (el) => playWithPulse(el));
  on('slow', (el) => playWithPulse(el, { slow: true }));
  if (item.type !== 'match') setTimeout(() => { const b = app.querySelector('[data-a="play"]'); if (b && session && session.items[session.pos] === item) playWithPulse(b); }, 350);
}

function audioRow(id, { showText = true, big = false } = {}) {
  const text = store.get().settings.showText && showText;
  return `<div class="audio-row">${playButton(id)}<button class="play-sm" data-a="slow" data-id="${id}" aria-label="${esc(t('ex.playSlow'))}">${UI.slow}</button></div>
    ${showText ? `<p class="en-line ${text ? '' : 'hidden-text'}" lang="en" id="enLine" ${text ? '' : 'aria-hidden="true"'}>${esc(phraseEn(id))}</p>${text ? '' : `<button class="reveal" data-a="reveal">${esc(t('gen.more'))}</button>`}` : ''}`;
}

function bindReveal() {
  on('reveal', (el) => { const l = document.getElementById('enLine'); l.classList.remove('hidden-text'); l.removeAttribute('aria-hidden'); el.remove(); });
}

function footer(label = t('ex.check'), disabled = true, extra = '') {
  return `<div class="lesson-foot">${extra}<button class="btn btn-primary btn-block" id="checkBtn" data-a="check" ${disabled ? 'aria-disabled="true"' : ''}>${esc(label)}</button></div>`;
}

// ---- Listen: hear English, choose the meaning
function exListen(item) {
  const p = phrase(item.id);
  const nativeOpts = !isEnglishUi();
  const opts = item.options.map((id) => `<button class="opt" data-a="opt" data-id="${id}" aria-pressed="false" ${nativeOpts ? '' : 'lang="en"'}>${esc(nativeOpts ? phraseNative(id) : phraseEn(id))}</button>`).join('');
  setTimeout(() => {
    let chosen = null;
    bindReveal();
    on('opt', (el) => { app.querySelectorAll('.opt').forEach((o) => o.setAttribute('aria-pressed', 'false')); el.setAttribute('aria-pressed', 'true'); chosen = el.dataset.id; document.getElementById('checkBtn').removeAttribute('aria-disabled'); });
    on('check', () => {
      if (!chosen) return;
      const ok = chosen === item.id;
      app.querySelectorAll('.opt').forEach((o) => { o.setAttribute('aria-disabled', 'true'); if (o.dataset.id === item.id) o.classList.add('is-good'); else if (o.dataset.id === chosen) o.classList.add('is-bad'); });
      result(item, ok);
    });
  });
  return `<h1 class="prompt">${esc(t('ex.listen'))}</h1>
    ${p.visual && p.visual.startsWith('scene:') ? `<div class="stage-visual">${visual(p.visual, { animate: !reduceMotion })}</div>` : ''}
    ${audioRow(item.id, { showText: nativeOpts })}
    <div class="options">${opts}</div>${footer()}`;
}

// ---- Act: hear the command, tap the picture
function exAct(item, isExam) {
  const opts = item.options.map((id, i) => `<button class="vopt" data-a="opt" data-id="${id}" aria-pressed="false" aria-label="${i + 1}">${visual(phrase(id).visual, { animate: false })}</button>`).join('');
  setTimeout(() => {
    let chosen = null;
    bindReveal();
    on('opt', (el) => { app.querySelectorAll('.vopt').forEach((o) => o.setAttribute('aria-pressed', 'false')); el.setAttribute('aria-pressed', 'true'); chosen = el.dataset.id; document.getElementById('checkBtn').removeAttribute('aria-disabled'); });
    on('check', () => {
      if (!chosen) return;
      const ok = phrase(chosen).visual === phrase(item.id).visual;
      app.querySelectorAll('.vopt').forEach((o) => {
        o.setAttribute('aria-disabled', 'true');
        const v = phrase(o.dataset.id).visual;
        if (v === phrase(item.id).visual) { o.classList.add('is-good'); if (!reduceMotion && v.startsWith('scene:')) o.innerHTML = visual(v, { animate: true, dur: 2.6 }); }
        else if (o.dataset.id === chosen) o.classList.add('is-bad');
      });
      result(item, ok);
    });
  });
  return `<h1 class="prompt">${esc(t('ex.act'))}</h1>${audioRow(item.id, { showText: !isExam })}<div class="grid-2">${opts}</div>${footer()}`;
}

// ---- Build: hear it, tap the words in order
function exBuild(item) {
  const bank = item.bank.map((b) => `<button class="word en" lang="en" data-a="w" data-k="${b.k}">${esc(b.w)}</button>`).join('');
  setTimeout(() => {
    const picked = [];
    const ans = document.getElementById('ans');
    const draw = () => {
      ans.innerHTML = picked.map((k) => `<button class="word en" lang="en" data-a="un" data-k="${k}">${esc(item.bank.find((b) => b.k === k).w)}</button>`).join('');
      app.querySelectorAll('.bank .word').forEach((w) => w.classList.toggle('used', picked.includes(Number(w.dataset.k))));
      const btn = document.getElementById('checkBtn');
      if (picked.length) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true');
    };
    on('w', (el) => { picked.push(Number(el.dataset.k)); draw(); });
    on('un', (el) => { const i = picked.indexOf(Number(el.dataset.k)); if (i > -1) picked.splice(i, 1); draw(); });
    on('check', () => {
      const built = picked.map((k) => item.bank.find((b) => b.k === k).w);
      const ok = sameSentence(built, item.answer);
      app.querySelectorAll('.word').forEach((w) => w.setAttribute('aria-disabled', 'true'));
      result(item, ok);
    });
  });
  return `<h1 class="prompt">${esc(t('ex.build'))}</h1>
    ${audioRow(item.id, { showText: false })}
    ${isEnglishUi() ? '' : `<p class="reveal" style="color:var(--ink-2);font-size:var(--t-md)">${esc(phraseNative(item.id))}</p>`}
    <div class="build-answer" id="ans" aria-live="polite"></div>
    <div class="bank">${bank}</div>${footer()}`;
}

// ---- Speak: say it, get word-by-word feedback
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
        if (err.code === 'denied') { store.set({ mic: 'denied' }); toast(t('ex.micBlocked')); session.noSpeak = true; skipItem(); }
        else if (err.code === 'unsupported') { store.set({ mic: 'unsupported' }); toast(t('ex.micUnsupported')); session.noSpeak = true; skipItem(); }
        else label.textContent = t('ex.heardNothing');
      } finally { busy = false; btn && btn.classList.remove('on'); }
    });
    on('cant', () => { session.noSpeak = true; skipItem(); });
  });
  return `<h1 class="prompt">${esc(t('ex.speak'))}</h1>
    <div class="audio-row">${playButton(item.id)}<button class="play-sm" data-a="slow" data-id="${item.id}" aria-label="${esc(t('ex.playSlow'))}">${UI.slow}</button></div>
    <p class="marks" id="marks" lang="en">${esc(phraseEn(item.id))}</p>
    ${isEnglishUi() ? '' : `<p style="color:var(--ink-2)">${esc(phraseNative(item.id))}</p>`}
    <div class="speak-zone">
      <button class="mic-btn" id="micBtn" data-a="mic" aria-label="${esc(t('ex.tapToSpeak'))}">${UI.mic}</button>
      <p class="mic-label" id="micLabel" aria-live="polite">${esc(t('ex.tapToSpeak'))}</p>
    </div>
    <div class="lesson-foot"><button class="text-btn" data-a="cant">${esc(t('ex.cantSpeak'))}</button></div>`;
}

function marksHtml(target, g) {
  // align normalized marks back to the original words
  const original = target.split(/\s+/);
  let k = 0;
  return original.map((w) => {
    const n = words(w).length || 1;
    const slice = g.marks.slice(k, k + n); k += n;
    const ok = slice.length && slice.every((m) => m.ok);
    return `<span class="${ok ? 'ok' : 'miss'}">${esc(w)}</span>`;
  }).join(' ');
}

// ---- Match: pair English with meaning
function exMatch(item) {
  const left = item.left.map((id) => `<button class="pair en" lang="en" data-a="l" data-id="${id}" aria-pressed="false">${esc(phraseEn(id))}</button>`).join('');
  const right = item.right.map((id) => `<button class="pair" data-a="r" data-id="${id}" aria-pressed="false">${esc(phraseNative(id))}</button>`).join('');
  setTimeout(() => {
    let L = null, R = null, matched = 0, mistakes = 0;
    const tryPair = () => {
      if (!L || !R) return;
      const lEl = app.querySelector(`.pair[data-a="l"][data-id="${L}"]`), rEl = app.querySelector(`.pair[data-a="r"][data-id="${R}"]`);
      if (L === R) {
        lEl.classList.add('matched'); rEl.classList.add('matched'); matched++; chime(true); store.record(L, true);
        if (matched === item.ids.length) setTimeout(() => result(item, true, { silent: true, mistakes }), 250);
      } else {
        mistakes++; chime(false); store.record(L, false);
        [lEl, rEl].forEach((e) => { e.classList.add('wrong'); setTimeout(() => e.classList.remove('wrong'), 400); });
      }
      lEl.setAttribute('aria-pressed', 'false'); rEl.setAttribute('aria-pressed', 'false');
      L = R = null;
    };
    on('l', (el) => { app.querySelectorAll('.pair[data-a="l"]').forEach((o) => o.setAttribute('aria-pressed', 'false')); el.setAttribute('aria-pressed', 'true'); L = el.dataset.id; speak(phraseEn(L)); tryPair(); });
    on('r', (el) => { app.querySelectorAll('.pair[data-a="r"]').forEach((o) => o.setAttribute('aria-pressed', 'false')); el.setAttribute('aria-pressed', 'true'); R = el.dataset.id; tryPair(); });
  });
  return `<h1 class="prompt">${esc(t('ex.match'))}</h1><div class="pairs"><div class="col">${left}</div><div class="col">${right}</div></div>`;
}

// ---- Result sheet
function result(item, ok, { almost = false, heard = '', retry = false, silent = false } = {}) {
  const isExam = session.kind === 'exam';
  if (item.type !== 'match') { chime(ok && !almost ? true : ok); store.record(item.id, ok); }
  let pushed = false;
  if (ok) { session.right++; session.xp += almost ? 1 : 2; }
  else {
    session.wrong++;
    if (!isExam && !session.requeued.has(session.pos)) {
      session.requeued.add(session.items.length);
      session.items.push({ ...item, again: true });
      pushed = true;
    }
  }
  const fb = document.getElementById('fb');
  const inner = document.getElementById('fbInner');
  const id = item.id || (item.ids && item.ids[0]);
  const title = ok ? (almost ? t('ex.almost') : t('ex.correct')) : t('ex.incorrect');
  const showAnswer = item.type !== 'match';
  inner.innerHTML = `<div class="fb-head"><span class="fb-icon">${ok ? UI.check : UI.x}</span><span class="fb-title">${esc(title)}</span></div>
    ${showAnswer ? `<div class="fb-body">${heard ? `<span class="tr">${esc(t('ex.youSaid'))}: <span class="en" lang="en">“${esc(heard)}”</span></span>` : ''}<span class="en" lang="en">${esc(phraseEn(id))}</span>${isEnglishUi() ? '' : `<span class="tr">${esc(phraseNative(id))}</span>`}</div>` : ''}
    <div style="display:flex;gap:10px">
      ${retry && item.type === 'speak' ? `<button class="btn btn-ghost" style="flex:1" data-fb="retry">${esc(t('ex.tryAgain'))}</button>` : ''}
      <button class="btn ${ok ? 'btn-good' : 'btn-bad'}" style="flex:2" data-fb="next" data-autofocus>${esc(t('ex.continue'))}</button>
    </div>`;
  fb.className = `feedback show ${ok ? 'good' : 'bad'}`;
  const nextBtn = inner.querySelector('[data-fb="next"]');
  setTimeout(() => nextBtn.focus(), 60);
  nextBtn.addEventListener('click', () => next());
  const retryBtn = inner.querySelector('[data-fb="retry"]');
  if (retryBtn) retryBtn.addEventListener('click', () => {
    // undo this attempt and try again
    if (ok) { session.right--; session.xp -= almost ? 1 : 2; }
    else { session.wrong--; if (pushed) { session.items.pop(); session.requeued.delete(session.items.length); } }
    viewLesson();
  });
}

function skipItem() { next(); }

function next() {
  session.pos++;
  const item = session.items[session.pos];
  if (item && item.again && !session.toldMistakes) { session.toldMistakes = true; toast(t('ex.reviewMistakes')); }
  if (session.kind === 'exam') return session.pos >= session.items.length ? finishExam() : viewExamItem();
  viewLesson();
}

function finishLesson() {
  const s = session;
  const answered = s.right + s.wrong;
  const acc = answered ? Math.round((s.right / answered) * 100) : 100;
  const secs = Math.round((Date.now() - s.started) / 1000);
  const bonus = s.kind === 'learn' || s.kind === 'review' ? 10 : 5;
  store.addXp(s.xp + bonus);
  if (s.stageId) store.lessonDone(s.stageId);
  const nextStage = currentStage();
  const firstId = s.items[0] && (s.items[0].id || s.items[0].ids[0]);
  session = null;
  render(`<main class="view done">
    <div class="done-visual">${scene(firstId ? (maneuverOf(firstId) === 'stop' ? 'straight' : maneuverOf(firstId)) : 'straight', { animate: !reduceMotion, dur: 3 })}</div>
    <h1 class="done-title">${esc(t('done.title'))}</h1>
    <div class="stats">
      <div class="stat"><span>XP</span><b>+${s.xp + bonus}</b></div>
      <div class="stat"><span>${esc(t('done.accuracy'))}</span><b>${acc}%</b></div>
      <div class="stat"><span>${esc(t('done.time'))}</span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b></div>
    </div>
    <div class="lesson-foot">
      <button class="btn btn-primary btn-block" data-a="next" data-autofocus>${esc(nextStage.exam ? t('exam.begin') : t('done.next'))}</button>
      <button class="btn btn-ghost btn-block" data-a="home">${esc(t('done.home'))}</button>
    </div>
  </main>`);
  chime(true);
  on('next', () => (nextStage.exam ? go('exam') : startLesson(nextStage.id)));
  on('home', () => go('home'));
}

// ---------------------------------------------------------------- exam

function viewExamIntro() {
  render(`<main class="view lesson">
    <div class="bar"><button class="icon-btn" data-a="home" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <div class="stage-visual">${scene('laneLeft', { animate: !reduceMotion, dur: 3.4 })}</div>
    <h1 class="page-title">${esc(t('exam.title'))}</h1>
    <p style="color:var(--ink-2)">${esc(t('exam.intro'))}</p>
    <div class="exam-stats"><div class="stat"><span>${esc(t('exam.commands'))}</span><b>20</b></div><div class="stat"><span>${esc(t('pro.ready'))}</span><b>${Math.round(EXAM_PASS * 100)}%</b></div></div>
    <div class="lesson-foot"><button class="btn btn-accent btn-block" data-a="go" data-autofocus>${esc(t('exam.begin'))}</button></div>
  </main>`);
  on('home', () => go('home'));
  on('go', () => {
    const plan = buildExam();
    session = { ...plan, pos: 0, right: 0, wrong: 0, started: Date.now(), requeued: new Set(), xp: 0 };
    viewExamItem();
  });
}

function viewExamItem() { viewLesson(); }

function finishExam() {
  const s = session;
  const total = s.items.length;
  const share = s.right / total;
  const pass = share >= EXAM_PASS;
  if (share > store.get().examBest) store.set({ examBest: share });
  store.addXp(s.xp + (pass ? 30 : 5));
  session = null;
  render(`<main class="view done">
    <div class="done-visual">${scene(pass ? 'parkSpace' : 'backUp', { animate: !reduceMotion, dur: 3 })}</div>
    <h1 class="done-title">${esc(pass ? t('exam.pass') : t('exam.fail'))}</h1>
    <p style="color:var(--ink-2);font-size:var(--t-lg)">${esc(t(pass ? 'exam.passBody' : 'exam.failBody', { n: s.right, total }))}</p>
    <div class="lesson-foot">
      <button class="btn ${pass ? 'btn-primary' : 'btn-accent'} btn-block" data-a="again">${esc(t('exam.retry'))}</button>
      ${pass ? '' : `<button class="btn btn-ghost btn-block" data-a="practice">${esc(t('home.practice'))}</button>`}
      <button class="btn btn-ghost btn-block" data-a="home">${esc(t('done.home'))}</button>
    </div>
  </main>`);
  chime(pass);
  on('again', () => viewExamIntro());
  on('practice', () => startPractice('mixed'));
  on('home', () => go('home'));
}

// ---------------------------------------------------------------- practice

function viewPractice() {
  const weak = weakIds(8);
  const list = weak.length
    ? weak.map((id) => phraseRow(id)).join('')
    : `<p class="empty">${esc(t('prc.weakEmpty'))}</p>`;
  render(`<main class="view has-tabs" style="gap:16px">
    <h1 class="page-title">${esc(t('prc.title'))}</h1>
    <div class="list">
      <button class="row" data-a="mixed"><span style="display:flex;gap:12px;align-items:center">${UI.bolt}<b>${esc(t('prc.quick'))}</b></span>${UI.chevron}</button>
      <button class="row" data-a="listen"><span style="display:flex;gap:12px;align-items:center">${UI.speaker}<b>${esc(t('prc.listenOnly'))}</b></span>${UI.chevron}</button>
      ${canListen() && store.get().mic !== 'denied' ? `<button class="row" data-a="speak"><span style="display:flex;gap:12px;align-items:center">${UI.mic.replace('width="32" height="32"', 'width="22" height="22"')}<b>${esc(t('prc.speakOnly'))}</b></span>${UI.chevron}</button>` : ''}
    </div>
    <h2 class="section-label">${esc(t('prc.weak'))}</h2>
    <div>${list}</div>
  </main>`, { tabs: 'practice' });
  on('mixed', () => startPractice('mixed'));
  on('listen', () => startPractice('listen'));
  on('speak', () => startPractice('speak'));
  on('play', (el) => playWithPulse(el));
}

function phraseRow(id) {
  return `<div class="phr">${playButton(id, 'play-sm')}<div class="txt"><span class="en" lang="en">${esc(phraseEn(id))}</span>${isEnglishUi() ? '' : `<span class="tr">${esc(phraseNative(id))}</span>`}</div></div>`;
}

// ---------------------------------------------------------------- phrase book

function viewPhrases() {
  const groups = (q) => STAGES.filter((s) => !s.exam).map((s) => {
    const items = PHRASES.filter((p) => p.stage === s.id).filter((p) => !q || `${phraseEn(p.id)} ${phraseNative(p.id)}`.toLowerCase().includes(q.toLowerCase()));
    if (!items.length) return '';
    return `<h2 class="section-label">${esc(t(`stage.${s.id}`))}</h2>${items.map((p) => phraseRow(p.id)).join('')}`;
  }).join('') || `<p class="empty">${esc(t('phr.empty'))}</p>`;
  render(`<main class="view" style="gap:14px">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <h1 class="page-title">${esc(t('phr.title'))}</h1>
    <div class="search">${UI.search}<input type="search" data-input="q" placeholder="${esc(t('phr.search'))}" aria-label="${esc(t('phr.search'))}"></div>
    <div id="groups">${groups('')}</div>
  </main>`);
  on('back', () => history.length > 1 ? history.back() : go('home'));
  on('q', (el) => { document.getElementById('groups').innerHTML = groups(el.value); });
  on('play', (el) => playWithPulse(el));
}

// ---------------------------------------------------------------- profile

function viewProfile() {
  const s = store.get();
  render(`<main class="view has-tabs" style="gap:16px">
    <div class="bar"><h1 class="page-title">${esc(s.name || t('pro.title'))}</h1><button class="icon-btn" data-a="prefs" aria-label="${esc(t('set.title'))}">${UI.gear}</button></div>
    <div class="big-stats">
      <div class="stat"><span>${esc(t('pro.ready'))}</span><b>${readiness()}%</b></div>
      <div class="stat"><span>${esc(t('pro.streak'))}</span><b>${liveStreak()}</b></div>
      <div class="stat"><span>${esc(t('pro.xp'))}</span><b>${s.xp}</b></div>
      <div class="stat"><span>${esc(t('pro.learned'))}</span><b>${learnedCount()} / ${PHRASES.length}</b></div>
    </div>
    <div class="stage-list">${STAGES.map((st) => {
      const open = unlocked(st.id);
      const p = st.exam ? null : stageProgress(st.id);
      const sub = st.exam ? (s.examBest ? `${Math.round(s.examBest * 100)}%` : '') : `${p.done} / ${p.total}`;
      return `<button class="stage-row ${open ? '' : 'locked'}" data-a="${open ? 'stage' : 'locked'}" data-id="${st.id}"><span class="ico">${icon(st.icon, 30)}</span><span class="grow"><b>${esc(t(`stage.${st.id}`))}</b><span class="sub">${esc(sub)}</span></span>${open ? UI.chevron : UI.lock}</button>`;
    }).join('')}</div>
    <div class="list">
      <button class="row" data-a="how"><span>${esc(t('set.howItWorks'))}</span>${UI.chevron}</button>
      <button class="row" data-a="terms"><span>${esc(t('set.terms'))}</span>${UI.chevron}</button>
      <button class="row" data-a="privacy"><span>${esc(t('set.privacy'))}</span>${UI.chevron}</button>
    </div>
  </main>`, { tabs: 'profile' });
  on('prefs', () => go('prefs'));
  on('stage', (el) => (el.dataset.id === 'exam' ? go('exam') : startLesson(el.dataset.id)));
  on('locked', () => toast(t('home.stopOf', { n: stageIndex(currentStage().id) + 1, total: STAGES.length })));
  on('how', () => howSheet());
  on('terms', () => go('terms'));
  on('privacy', () => go('privacy'));
}

// ---------------------------------------------------------------- settings

function viewPrefs() {
  const s = store.get();
  const voices = englishVoices();
  const lang = LANGUAGES.find((l) => l.code === s.lang);
  const sw = (key, label) => `<div class="row"><span id="lbl-${key}">${esc(label)}</span><button class="switch" role="switch" aria-checked="${!!s.settings[key]}" aria-labelledby="lbl-${key}" data-a="sw" data-key="${key}"></button></div>`;
  render(`<main class="view" style="gap:14px">
    <div class="bar"><button class="icon-btn" data-a="back" aria-label="${esc(t('gen.back'))}">${UI.back}</button></div>
    <h1 class="page-title">${esc(t('set.title'))}</h1>

    <h2 class="section-label">${esc(t('set.speed'))}</h2>
    <div class="seg-ctl" role="group" aria-label="${esc(t('set.speed'))}">
      ${['slow', 'normal', 'fast'].map((k) => `<button data-a="speed" data-k="${k}" aria-pressed="${s.settings.speed === k}">${esc(t(`set.${k}`))}</button>`).join('')}
    </div>
    <div class="list">
      <div class="row"><label for="voiceSel">${esc(t('set.voice'))}</label>
        <select class="select" id="voiceSel" data-input="voice">
          <option value="">${esc(t('set.voiceDefault'))}</option>
          ${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === s.settings.voiceURI ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
        </select></div>
      <button class="row" data-a="test"><span>${esc(t('set.test'))}</span>${UI.speaker}</button>
    </div>

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
    <p style="color:var(--ink-3);font-size:var(--t-xs);text-align:center;padding:8px 0">Roadword · ${esc(t('set.version', { v: VERSION }))} · © 2026 Patron LLC</p>
  </main>`);
  on('back', () => go('profile'));
  on('speed', (el) => {
    store.setting('speed', el.dataset.k);
    app.querySelectorAll('[data-a="speed"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === el.dataset.k)));
    speak('At the corner, turn left.', { rate: RATES[el.dataset.k] });
  });
  on('voice', (el) => { store.setting('voiceURI', el.value); speak('Pull over and stop.'); });
  on('test', () => speak('Lane change right.'));
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
  </main>`);
  on('back', () => (history.length > 1 ? history.back() : go('profile')));
}

// ---------------------------------------------------------------- router

function route() {
  closeSheet();
  const name = location.hash.replace('#', '');
  const s = store.get();
  if (name === 'terms') return viewLegal('terms');
  if (name === 'privacy') return viewLegal('privacy');
  if (!s.onboarded) { onbLang = onbLang || s.lang; return viewOnboarding(); }
  switch (name) {
    case 'lesson': return session ? viewLesson() : go('home');
    case 'exam': return unlocked('exam') ? viewExamIntro() : go('home');
    case 'practice': return viewPractice();
    case 'profile': return viewProfile();
    case 'prefs': return viewPrefs();
    case 'phrases': return viewPhrases();
    default: return viewHome();
  }
}

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
    app.innerHTML = `<main class="view"><p class="empty">Something went wrong. Reload the page to try again.</p></main>`;
  }
  try {
    if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (e) { /* sandboxed: no offline cache */ }
}

boot();
