// Loads one language pack at a time; English is always loaded as the source and fallback.
import { LANGUAGES, SCRIPT_FONTS } from './content.js';

let en = null;
let pack = null;

async function fetchPack(code) {
  const res = await fetch(`./i18n/${code}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Language pack ${code} failed to load`);
  return res.json();
}

export async function loadLanguage(code) {
  if (!en) en = await fetchPack('en');
  pack = code === 'en' ? en : await fetchPack(code).catch(() => en);
  const lang = LANGUAGES.find((l) => l.code === code) || LANGUAGES[LANGUAGES.length - 1];
  const root = document.documentElement;
  root.lang = code;
  root.dir = lang.rtl ? 'rtl' : 'ltr';
  loadScriptFont(code);
  return pack;
}

function loadScriptFont(code) {
  const family = SCRIPT_FONTS[code];
  const root = document.documentElement;
  if (!family) { root.style.removeProperty('--font-native'); return; }
  const id = `font-${code}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
  root.style.setProperty('--font-native', `'${family}'`);
}

// UI string with {placeholder} fill.
export function t(key, vars) {
  let s = (pack && pack.ui[key]) ?? (en && en.ui[key]) ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

// English examiner phrase
export function phraseEn(id) { return (en && en.phrases[id]) || id; }

// Meaning in the learner's language
export function phraseNative(id) { return (pack && pack.phrases[id]) || phraseEn(id); }

export function currentCode() { return pack ? pack.meta.code : 'en'; }
export function isEnglishUi() { return currentCode() === 'en'; }

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
