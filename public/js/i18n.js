// Tłumaczenia interfejsu (PL / EN). Ten sam format słowników co lib/i18n.mjs na serwerze:
// kluczem jest polski tekst źródłowy, parametry zapisujemy jako {nazwa}, a wpis mnogi to obiekt {one, few, many, other}.
// public/i18n/pl.json zawiera tylko wpisy mnogie (zwykły klucz to już polski tekst), en.json wszystkie tłumaczenia.
// Język pochodzi z config.local.json (GET /api/meta), z kopią w localStorage na wypadek, gdyby serwer nie odpowiedział.
// Moduł używa top-level await, więc każdy moduł, który go importuje, startuje dopiero z wczytanym słownikiem.
// English: UI translations. Keys are the Polish source strings; en.json holds the English text.

const LANG_KEY = 'thq.lang';
let lang = 'pl';
let dict = {};
let plDict = {};
let meta = null;

try { const s = localStorage.getItem(LANG_KEY); if (s === 'en' || s === 'pl') lang = s; } catch { /* localStorage niedostępny */ }
try {
  const r = await fetch('/api/meta', { signal: AbortSignal.timeout(3000) });
  if (r.ok) { meta = await r.json(); if (meta.lang === 'en' || meta.lang === 'pl') lang = meta.lang; }
} catch { /* serwer nie odpowiada: zostaje język z localStorage */ }
try { localStorage.setItem(LANG_KEY, lang); } catch { /* brak */ }

async function loadJson(name) {
  try { const r = await fetch(`i18n/${name}.json`, { cache: 'no-cache' }); return r.ok ? await r.json() : {}; } catch { return {}; }
}
[plDict, dict] = await Promise.all([loadJson('pl'), lang === 'en' ? loadJson('en') : Promise.resolve({})]);

const rules = new Intl.PluralRules(lang === 'en' ? 'en-US' : 'pl-PL');
const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s));

export function t(key, params) {
  const v = lang === 'en' ? dict[key] : null;
  return fill(typeof v === 'string' ? v : key, params);
}
// Liczba mnoga: t.p("{n} trade'ów", 3) → „3 trade'y” / „3 trades”. Wpis w słowniku to obiekt z formami Intl.PluralRules.
t.p = (key, n, params) => {
  const v = lang === 'en' ? dict[key] : plDict[key];
  if (v && typeof v === 'object') return fill(v[rules.select(n)] ?? v.other ?? key, { n, ...params });
  return fill(key, { n, ...params });
};

export const getLang = () => lang;
export const locale = () => (lang === 'en' ? 'en-US' : 'pl-PL');
export const bootMeta = () => meta;
export function rememberLang(l) { try { localStorage.setItem(LANG_KEY, l); } catch { /* brak */ } }

// teksty statyczne w index.html: data-i18n (treść), data-i18n-aria (aria-label), data-i18n-title (title)
export function translateStatic(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((e) => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-title]').forEach((e) => e.setAttribute('title', t(e.dataset.i18nTitle)));
}
