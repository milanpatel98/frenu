// Text to speech (English examiner voice) and speech recognition (learner speaking).
import { store } from './store.js';

export const RATES = { slow: 0.72, normal: 0.95, fast: 1.18 };
const SLOWEST = 0.55;

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang) || v.lang === 'en');
}
if (synth) {
  refreshVoices();
  if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices);
  else synth.onvoiceschanged = refreshVoices;
}

const PREFERRED = [/premium/i, /enhanced/i, /natural/i, /neural/i, /samantha/i, /ava/i, /allison/i, /google us english/i, /zoe/i, /nicky/i, /aria/i, /jenny/i];

function score(v) {
  let s = 0;
  if (/en[-_]US/i.test(v.lang)) s += 50;
  PREFERRED.forEach((re, i) => { if (re.test(v.name)) s += 30 - i; });
  if (v.localService) s += 5;
  if (/compact|novelty|whisper|bells|bad news|bahh|boing|bubbles|cellos|jester|organ|superstar|trinoids|wobble|zarvox|albert|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i.test(v.name)) s -= 100;
  return s;
}

export function englishVoices() {
  refreshVoices();
  return [...voices].sort((a, b) => score(b) - score(a));
}

function pickVoice() {
  const list = englishVoices();
  const chosen = store.get().settings.voiceURI;
  return list.find((v) => v.voiceURI === chosen) || list[0] || null;
}

export function canSpeak() { return !!synth; }

export function speak(text, { slow = false, rate } = {}) {
  return new Promise((resolve) => {
    if (!synth) return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-US';
      u.rate = rate ?? (slow ? SLOWEST : RATES[store.get().settings.speed] || RATES.normal);
      u.pitch = 1;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
      // Safety net: some browsers never fire onend.
      setTimeout(() => resolve(true), Math.max(2500, text.length * 140 / u.rate));
    } catch (e) { resolve(false); }
  });
}

export function stopSpeaking() { try { synth && synth.cancel(); } catch (e) { /* ignore */ } }

// ---- Recognition -----------------------------------------------------------

const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function canListen() { return !!Rec; }

// Returns { alternatives: string[] } or throws { code: 'denied'|'nothing'|'unsupported'|'error' }
export function listen({ timeout = 7000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!Rec) return reject({ code: 'unsupported' });
    let rec;
    try { rec = new Rec(); } catch (e) { return reject({ code: 'unsupported' }); }
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); try { rec.abort(); } catch (e) { /* ignore */ } fn(v); };
    const timer = setTimeout(() => finish(reject, { code: 'nothing' }), timeout);
    rec.onresult = (e) => {
      const alts = [];
      for (let i = 0; i < e.results.length; i++) for (let j = 0; j < e.results[i].length; j++) alts.push(e.results[i][j].transcript);
      finish(resolve, { alternatives: alts });
    };
    rec.onerror = (e) => {
      const code = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'nothing' : 'error';
      finish(reject, { code });
    };
    rec.onend = () => finish(reject, { code: 'nothing' });
    try { rec.start(); } catch (e) { finish(reject, { code: 'error' }); }
    listen.stop = () => { try { rec.stop(); } catch (e) { /* ignore */ } };
  });
}

// Ask for microphone access up front (onboarding). Resolves 'granted' | 'denied' | 'unsupported'.
export async function requestMic() {
  if (!Rec) return 'unsupported';
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return 'granted';
    }
    return 'granted';
  } catch (e) {
    return 'denied';
  }
}

// ---- Scoring ---------------------------------------------------------------

const NUMBERS = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five' };
const CONTRACTIONS = { "don't": 'do not', "didn't": 'did not', "it's": 'it is', "i'm": 'i am', 'ok': 'okay', "won't": 'will not' };

export function words(s) {
  let x = String(s).toLowerCase().replace(/[’']/g, "'");
  for (const k in CONTRACTIONS) x = x.replace(new RegExp(`\\b${k.replace(/'/g, "'")}\\b`, 'g'), CONTRACTIONS[k]);
  x = x.replace(/[^a-z0-9' ]+/g, ' ');
  return x.split(/\s+/).filter(Boolean).map((w) => NUMBERS[w] || w.replace(/'/g, ''));
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}

function similar(a, b) {
  if (a === b) return 1;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}

// Compare what was heard with the target phrase.
// Returns { score: 0..1, marks: [{ word, ok }] } using the best alternative.
export function grade(target, alternatives) {
  const tw = words(target);
  let best = { score: 0, marks: tw.map((w) => ({ word: w, ok: false })), heard: '' };
  for (const alt of alternatives) {
    const hw = words(alt);
    const used = new Array(hw.length).fill(false);
    let hits = 0;
    let cursor = 0;
    const marks = tw.map((w) => {
      let found = -1;
      for (let j = cursor; j < hw.length; j++) {
        if (!used[j] && similar(w, hw[j]) >= 0.75) { found = j; break; }
      }
      if (found === -1) for (let j = 0; j < hw.length; j++) if (!used[j] && similar(w, hw[j]) >= 0.75) { found = j; break; }
      if (found !== -1) { used[found] = true; hits++; cursor = found + 1; return { word: w, ok: true }; }
      return { word: w, ok: false };
    });
    const extra = used.filter((u) => !u).length;
    const s = Math.max(0, (hits - extra * 0.25) / tw.length);
    if (s > best.score) best = { score: s, marks, heard: alt };
  }
  return best;
}
