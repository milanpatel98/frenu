// Saved state lives only on this device (localStorage). Every access is guarded:
// private windows and blocked storage must never break the app.

const KEY = 'frenu.v1';
const OLD_KEY = 'roadword.v1';

const DEFAULTS = {
  lang: null,
  name: '',
  agreed: false,
  onboarded: false,
  settings: { speed: 'normal', voice: 'mix', voiceURI: '', sounds: true, haptics: true, showText: false },
  progress: {},            // { stageId: lessonsDone }
  xp: 0,
  streak: { count: 0, last: '' },
  stats: {},               // { phraseId: { ok, bad, last } }
  examBest: 0,
  driveBest: null,        // { ok, total, errors, critical, passed }
  mic: 'unknown',          // unknown | granted | denied | unsupported
};

let state = load();
const listeners = new Set();

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if (!raw) return clone(DEFAULTS);
    const saved = JSON.parse(raw);
    return { ...clone(DEFAULTS), ...saved, settings: { ...DEFAULTS.settings, ...(saved.settings || {}) } };
  } catch (e) {
    return clone(DEFAULTS);
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: keep in memory */ }
  listeners.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; save(); },
  setting(key, value) { state = { ...state, settings: { ...state.settings, [key]: value } }; save(); },
  reset() {
    const keep = { lang: state.lang, agreed: state.agreed, onboarded: state.onboarded, name: state.name, settings: state.settings, mic: state.mic };
    state = { ...clone(DEFAULTS), ...keep };
    save();
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  lessonDone(stageId) {
    const p = { ...state.progress, [stageId]: (state.progress[stageId] || 0) + 1 };
    state = { ...state, progress: p };
    save();
  },
  addXp(n) { state = { ...state, xp: state.xp + n }; touchStreak(); save(); },
  record(phraseId, ok) {
    const s = state.stats[phraseId] || { ok: 0, bad: 0, last: 0 };
    const next = { ok: s.ok + (ok ? 1 : 0), bad: s.bad + (ok ? 0 : 1), last: Date.now() };
    state = { ...state, stats: { ...state.stats, [phraseId]: next } };
    save();
  },
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function touchStreak() {
  const t = today();
  const { count, last } = state.streak;
  if (last === t) return;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
  state = { ...state, streak: { count: last === yesterday ? count + 1 : 1, last: t } };
}

// Streak shown on screen: drops to 0 if a day was missed.
export function liveStreak() {
  const { count, last } = state.streak;
  if (!last) return 0;
  const t = today();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
  return last === t || last === yesterday ? count : 0;
}
