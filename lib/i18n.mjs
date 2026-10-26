// Tłumaczenia po stronie serwera i skryptów (przeglądarka ma własny moduł public/js/i18n.js z tym samym formatem słowników).
// Kluczem jest polski tekst źródłowy; public/i18n/pl.json jest identyczny z kluczami (pełna lista), a en.json zawiera tłumaczenia.
// Parametry w tekście zapisujemy jako {nazwa}. Liczby mnoge: wpis w słowniku jest obiektem {one, few, many, other}.
// English: the key is the Polish source text; en.json holds translations; {name} placeholders; plural entries are objects.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'i18n');
const dicts = {};
export function loadDict(lang) {
  if (!dicts[lang]) {
    const f = path.join(DIR, `${lang}.json`);
    try { dicts[lang] = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; } catch { dicts[lang] = {}; }
  }
  return dicts[lang];
}
const fill = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s));

export function makeT(lang) {
  const dict = lang === 'pl' ? {} : loadDict(lang);
  const rules = new Intl.PluralRules(lang === 'en' ? 'en' : 'pl');
  const t = (key, params) => {
    const v = dict[key];
    return fill(typeof v === 'string' ? v : key, params);
  };
  t.p = (key, n, params) => {
    const v = lang === 'pl' ? loadDict('pl')[key] : dict[key];
    if (v && typeof v === 'object') return fill(v[rules.select(n)] ?? v.other ?? key, { n, ...params });
    return fill(key, { n, ...params });
  };
  t.lang = lang;
  return t;
}

// domyślne tłumaczenie skryptów i serwera: język z config.local.json (ustawiany przy starcie)
let current = makeT('pl');
export function setLang(lang) { current = makeT(lang === 'en' ? 'en' : 'pl'); }
export function tr(key, params) { return current(key, params); }
tr.p = (key, n, params) => current.p(key, n, params);
export const getLang = () => current.lang;
