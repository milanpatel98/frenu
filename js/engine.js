// Builds lessons, drills and the fallback exam. Every exercise ends with the
// learner choosing what to DO after hearing the English, not reading it.
import { PHRASES, lessonsOf, EXAM_LENGTH } from './content.js';
import { store } from './store.js';

const byId = Object.fromEntries(PHRASES.map((p) => [p.id, p]));
export const phrase = (id) => byId[id];
const learnable = PHRASES.filter((p) => p.stage !== 'sys');

export function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

const kind = (v) => (v ? v.split(':')[0] : null);

// Pictures to choose from: same kind (scene vs control), all different from the answer.
function actOptions(id) {
  const p = byId[id];
  const seen = new Set([p.visual]);
  const out = [id];
  const pool = [...shuffle(learnable.filter((q) => q.stage === p.stage)), ...shuffle(learnable.filter((q) => q.stage !== p.stage))];
  for (const q of pool) {
    if (out.length >= 4) break;
    if (!q.visual || kind(q.visual) !== kind(p.visual) || seen.has(q.visual)) continue;
    seen.add(q.visual); out.push(q.id);
  }
  return shuffle(out);
}

// Meanings to choose from (for phrases that are said to you, not acted on).
function meaningOptions(id) {
  const p = byId[id];
  const same = shuffle(learnable.filter((q) => q.id !== id && q.stage === p.stage));
  const rest = shuffle(learnable.filter((q) => q.id !== id && q.stage !== p.stage && !q.visual));
  return shuffle([id, ...[...same, ...rest].slice(0, 3).map((q) => q.id)]);
}

export const intro = (id) => ({ type: 'intro', id });
export const quiz = (id) => (byId[id].visual ? { type: 'act', id, options: actOptions(id) } : { type: 'listen', id, options: meaningOptions(id) });
const speakItem = (id) => ({ type: 'speak', id });

const micOn = () => store.get().mic !== 'denied' && store.get().mic !== 'unsupported';

export function buildLesson(stageId, index) {
  const lessons = lessonsOf(stageId);
  const lesson = lessons[Math.min(index, lessons.length - 1)];
  const items = [];
  if (lesson.kind === 'learn') {
    // learn each phrase, then hear-and-do each one twice in a new order
    lesson.ids.forEach((id) => { items.push(intro(id)); items.push(quiz(id)); });
    shuffle(lesson.ids).forEach((id) => items.push(quiz(id)));
    lesson.ids.filter((id) => byId[id].learnerSays).forEach((id) => { if (micOn()) items.push(speakItem(id)); });
  } else {
    shuffle(lesson.ids).slice(0, 10).forEach((id) => items.push(quiz(id)));
    lesson.ids.filter((id) => byId[id].learnerSays).forEach((id) => { if (micOn()) items.push(speakItem(id)); });
  }
  return { stageId, index, kind: lesson.kind, items, total: lessons.length };
}

export function weakIds(limit = 8) {
  const stats = store.get().stats;
  return Object.entries(stats)
    .filter(([id, s]) => byId[id] && byId[id].stage !== 'sys' && s.bad > 0)
    .sort((a, b) => (b[1].bad - b[1].ok) - (a[1].bad - a[1].ok))
    .slice(0, limit)
    .map(([id]) => id);
}

function learnedPool() {
  const learned = Object.keys(store.get().stats).filter((id) => byId[id] && byId[id].stage !== 'sys');
  return learned.length >= 6 ? learned : learnable.filter((p) => ['car', 'dir', 'lane'].includes(p.stage)).map((p) => p.id);
}

// Practice: weakest first, then anything learned.
export function buildPractice() {
  const ids = [...new Set([...weakIds(6), ...shuffle(learnedPool())])].slice(0, 10);
  return { stageId: null, index: 0, kind: 'practice', items: ids.map(quiz), total: 1 };
}

// Quick reaction: commands with an action only, random voices, a timer on each.
export function buildDrill(length = 12) {
  const pool = learnedPool().filter((id) => byId[id].visual);
  const base = pool.length >= 4 ? pool : learnable.filter((p) => p.visual).map((p) => p.id);
  const seq = [];
  while (seq.length < length) for (const id of shuffle(base)) { if (seq.length < length && seq[seq.length - 1] !== id) seq.push(id); }
  return { stageId: null, index: 0, kind: 'drill', items: seq.map((id) => ({ ...quiz(id), timed: true, voice: 'random' })), total: 1 };
}

// Fallback exam when 3D isn't available.
export function buildExam() {
  const pool = learnable.filter((p) => p.visual && p.stage !== 'talk');
  const seq = [];
  while (seq.length < EXAM_LENGTH) for (const p of shuffle(pool)) { if (seq.length < EXAM_LENGTH && seq[seq.length - 1] !== p.id) seq.push(p.id); }
  return { kind: 'exam', items: seq.map((id) => ({ ...quiz(id), exam: true })) };
}

export function stageProgress(stageId) {
  const total = lessonsOf(stageId).length;
  const done = Math.min(store.get().progress[stageId] || 0, total);
  return { done, total, complete: done >= total };
}
