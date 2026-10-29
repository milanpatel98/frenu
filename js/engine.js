// Builds lessons and exams from the phrase list.
import { PHRASES, lessonsOf, EXAM_LENGTH } from './content.js';
import { phraseEn } from './i18n.js';
import { words } from './speech.js';
import { store } from './store.js';

const byId = Object.fromEntries(PHRASES.map((p) => [p.id, p]));
export const phrase = (id) => byId[id];

export function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

function sample(list, n, exclude = []) {
  return shuffle(list.filter((x) => !exclude.includes(x))).slice(0, n);
}

// Distractor phrases: prefer the same stage, fall back to all.
function distractors(id, n, { needVisual = false } = {}) {
  const p = byId[id];
  const ok = (q) => q.id !== id && (!needVisual || (q.visual && q.visual !== p.visual && q.visual.split(':')[0] === p.visual.split(':')[0]));
  const same = PHRASES.filter((q) => q.stage === p.stage && ok(q));
  const rest = PHRASES.filter((q) => q.stage !== p.stage && ok(q));
  const picked = [];
  const seenVisual = new Set([p.visual]);
  for (const q of [...shuffle(same), ...shuffle(rest)]) {
    if (picked.length >= n) break;
    if (needVisual) { if (seenVisual.has(q.visual)) continue; seenVisual.add(q.visual); }
    picked.push(q.id);
  }
  return picked;
}

function listenItem(id) {
  return { type: 'listen', id, options: shuffle([id, ...distractors(id, 3)]) };
}

function actItem(id) {
  return { type: 'act', id, options: shuffle([id, ...distractors(id, 3, { needVisual: true })]) };
}

function buildItem(id) {
  const tokens = tokenize(phraseEn(id));
  const pool = new Set(tokens.map((t) => t.toLowerCase()));
  const extra = [];
  for (const other of shuffle(PHRASES.filter((q) => q.id !== id))) {
    for (const w of tokenize(phraseEn(other.id))) {
      if (extra.length >= 3) break;
      if (!pool.has(w.toLowerCase())) { pool.add(w.toLowerCase()); extra.push(w); }
    }
    if (extra.length >= 3) break;
  }
  return { type: 'build', id, answer: tokens, bank: shuffle([...tokens, ...extra]).map((w, i) => ({ w, k: i })) };
}

function speakItem(id) { return { type: 'speak', id }; }

function matchItem(ids) {
  const four = ids.slice(0, 4);
  return { type: 'match', ids: four, left: shuffle(four), right: shuffle(four) };
}

// Word tiles keep capitalization of the first word only, no punctuation.
export function tokenize(s) {
  return s.replace(/[.,?!]/g, '').split(/\s+/).filter(Boolean);
}

export function sameSentence(a, b) {
  return words(a.join(' ')).join(' ') === words(b.join(' ')).join(' ');
}

function canBuild(id) { return tokenize(phraseEn(id)).length <= 9; }

export function buildLesson(stageId, index) {
  const lessons = lessonsOf(stageId);
  const lesson = lessons[Math.min(index, lessons.length - 1)];
  const micOn = store.get().mic !== 'denied' && store.get().mic !== 'unsupported';
  const items = [];

  if (lesson.kind === 'learn') {
    const ids = lesson.ids;
    ids.forEach((id) => items.push(listenItem(id)));
    shuffle(ids).forEach((id) => {
      const p = byId[id];
      if (p.visual) items.push(actItem(id));
      else if (canBuild(id)) items.push(buildItem(id));
      else items.push(listenItem(id));
    });
    const speakable = shuffle(ids).slice(0, Math.min(3, ids.length));
    speakable.forEach((id) => items.push(micOn ? speakItem(id) : (canBuild(id) ? buildItem(id) : listenItem(id))));
    if (ids.length >= 4) items.push(matchItem(shuffle(ids)));
  } else {
    const ids = shuffle(lesson.ids).slice(0, 8);
    ids.forEach((id, i) => {
      const p = byId[id];
      const kinds = [p.visual ? 'act' : 'listen', canBuild(id) ? 'build' : 'listen', micOn ? 'speak' : 'listen'];
      const k = kinds[i % kinds.length];
      items.push(k === 'act' ? actItem(id) : k === 'build' ? buildItem(id) : k === 'speak' ? speakItem(id) : listenItem(id));
    });
    items.push(matchItem(shuffle(lesson.ids)));
  }
  return { stageId, index, kind: lesson.kind, items, total: lessons.length };
}

// Practice: weakest phrases first, mixed exercise types.
export function weakIds(limit = 8) {
  const stats = store.get().stats;
  return Object.entries(stats)
    .filter(([id, s]) => byId[id] && s.bad > 0)
    .sort((a, b) => (b[1].bad - b[1].ok) - (a[1].bad - a[1].ok))
    .slice(0, limit)
    .map(([id]) => id);
}

export function buildPractice(mode = 'mixed') {
  const learned = Object.keys(store.get().stats).filter((id) => byId[id]);
  const weak = weakIds(6);
  const pool = learned.length ? learned : PHRASES.filter((p) => p.stage === 'car' || p.stage === 'dir').map((p) => p.id);
  const ids = [...new Set([...weak, ...shuffle(pool)])].slice(0, 8);
  const micOn = store.get().mic !== 'denied' && store.get().mic !== 'unsupported';
  const items = ids.map((id, i) => {
    if (mode === 'listen') return byId[id].visual && i % 2 ? actItem(id) : listenItem(id);
    if (mode === 'speak' && micOn) return speakItem(id);
    const p = byId[id];
    const opts = [p.visual ? 'act' : 'listen', canBuild(id) ? 'build' : 'listen', micOn ? 'speak' : 'listen'];
    const k = opts[i % 3];
    return k === 'act' ? actItem(id) : k === 'build' ? buildItem(id) : k === 'speak' ? speakItem(id) : listenItem(id);
  });
  return { stageId: null, index: 0, kind: 'practice', items, total: 1 };
}

// Mock exam: commands with a visual, no translations.
export function buildExam() {
  const pool = PHRASES.filter((p) => p.visual && p.stage !== 'talk');
  const picked = [];
  while (picked.length < EXAM_LENGTH) picked.push(...shuffle(pool));
  // avoid the same command twice in a row
  const seq = [];
  for (const p of picked) { if (seq.length && seq[seq.length - 1] === p.id) continue; seq.push(p.id); if (seq.length === EXAM_LENGTH) break; }
  return { kind: 'exam', items: seq.map((id) => ({ ...actItem(id), exam: true })) };
}

export function stageProgress(stageId) {
  const total = lessonsOf(stageId).length;
  const done = Math.min(store.get().progress[stageId] || 0, total);
  return { done, total, complete: done >= total };
}
