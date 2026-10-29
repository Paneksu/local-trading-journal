// Rysunki wykresu w Notion: właściwość rich_text „Rysunki” trade'a (JSON w kawałkach do 2 000 znaków), odczyt oraz cache offline.
// Format: {"v":1,"lib":"0.6.2","at":"<ISO>","d":[…]} bez spacji. Cięcie na kawałki po stronie serwera, jedno PATCH z samą tą właściwością.
// Limit 190 000 znaków (Notion: 2 000 znaków × 100 elementów = 200 000, zapas na zmiany). Powyżej: odmowa, zero żądań do Notion.
// Cache: <baza>/drawings-cache/<tradeId>.json = { at, json, pending }. Awaria Notion (sieć, 429, 5xx) zostawia pending:true; zaległy stan
// idzie do Notion przy następnym odczycie i zapisie. Przy odczycie wygrywa nowszy `at`; konflikt dwóch urządzeń: ostatni zapis wygrywa.
// Rysunki nie trafiają do /api/data (patrz data.mjs). English: drawings stored as chunked rich_text in Notion with an offline cache.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { NotionError } from './notion.mjs';
import { ValidationError, PAGE_ID_RE, sameId } from './writes.mjs';

export const MAX_CHARS = 190_000;
export const CHUNK = 2000;
// Limit ciała żądania zapisu: 190 000 znaków (jednostek UTF-16) × najwyżej 3 bajty UTF-8 = 570 KB, plus identyfikator i obwiednia. Wcześniej 256 KB: zapis w limicie znaków,
// ale z wielobajtowymi znakami (np. tekst z polskimi literami, €), dostawał ogólne 413 zamiast komunikatu o rysunkach (D4, przegląd 28.10.2026).
export const BODY_LIMIT = 640 * 1024;
// Notion przyjmuje ciało żądania do 500 KB. Zapis w limicie znaków z samymi trzybajtowymi literami (np. €) ma ok. 570 KB, więc rozmiar liczymy też w bajtach żądania do Notion
// (zapas 20 KB) i odmawiamy z komunikatem o rysunkach, zanim cokolwiek pójdzie do sieci (D4).
export const NOTION_MAX_BYTES = 480 * 1024;
export const notionBytes = (text) => Buffer.byteLength(JSON.stringify(chunkText(text).map((content) => ({ type: 'text', text: { content } }))));
const VENDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js');
let lib = null;
const drawingLib = () => (lib ||= import(pathToFileURL(VENDOR).href));

// Kawałki po najwyżej 2 000 jednostek UTF-16, bez rozcinania pary zastępczej (Array.from chodzi po punktach kodowych).
export function chunkText(s) {
  const out = [];
  let cur = '';
  for (const ch of Array.from(s)) {
    if (cur.length + ch.length > CHUNK) { out.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// Dokument z przeglądarki albo z Notion → obiekt albo wyjątek. Każdy rysunek musi być rozpoznany przez parseDrawings paczki.
export async function parseDoc(doc, t) {
  const bad = (m) => new ValidationError({ drawings: m }, m);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw bad(t('Nieprawidłowe dane rysunków.'));
  if (doc.v !== 1) throw bad(t('Nieznana wersja zapisu rysunków.'));
  if (typeof doc.at !== 'string' || Number.isNaN(Date.parse(doc.at))) throw bad(t('Nieprawidłowe dane rysunków.'));
  if (!Array.isArray(doc.d)) throw bad(t('Nieprawidłowe dane rysunków.'));
  const { parseDrawings } = await drawingLib();
  if (parseDrawings(doc.d).length !== doc.d.length) throw bad(t('Nieprawidłowe dane rysunków.'));
  return doc;
}

export function createDrawings({ notion, sources, data, t, baseDir }) {
  const dir = path.join(baseDir, 'drawings-cache');
  const file = (id) => path.join(dir, `${id}.json`);
  const queues = new Map();
  // Jedna operacja na trade naraz (zapis i odczyt nie ścigają się o cache ani o PATCH).
  const serial = (id, fn) => {
    const run = (queues.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(id, run);
    run.finally(() => { if (queues.get(id) === run) queues.delete(id); }).catch(() => {});
    return run;
  };

  function readCache(id) {
    try {
      const c = JSON.parse(readFileSync(file(id), 'utf8'));
      return c && typeof c.json === 'string' && typeof c.at === 'string' ? { at: c.at, json: c.json, pending: c.pending === true } : null;
    } catch { return null; }
  }
  function writeCache(id, c) {
    try {
      mkdirSync(dir, { recursive: true });
      const tmp = file(id) + '.tmp';
      writeFileSync(tmp, JSON.stringify(c));
      renameSync(tmp, file(id));
    } catch (e) { console.error('[drawings] cache:', e.message); }
  }

  const transient = (e) => !(e instanceof NotionError) || e.status === 429 || e.status >= 500;

  async function property() {
    if (!sources.trades) throw new NotionError(t('Brak identyfikatora bazy w pliku .env ({db}).', { db: 'trades' }), 500);
    const sch = await data.loadSchema('trades');
    const name = sch.roles.drawings?.name;
    if (!name) throw Object.assign(new NotionError(t('W bazie Trade\'y nie ma pola „Rysunki”. Uruchom aktualizację dashboardu.'), 409), { code: 'no-field' });
    return name;
  }
  // Strona musi należeć do bazy Trade'y i nie leżeć w koszu (jak przy edycji trade'a).
  async function pageOf(id) {
    const page = await notion.get(`/v1/pages/${id}`);
    if (page.archived || page.in_trash) throw new NotionError(t('Ten wpis jest w koszu Notion. Przywróć go w Notion albo odśwież dane.'), 409);
    if (!sameId(page.parent?.data_source_id, sources.trades)) throw new NotionError(t('Ten wpis nie należy do właściwej bazy.'), 403);
    return page;
  }
  async function send(id, text) {
    const name = await property();
    const page = await pageOf(id);
    const out = await notion.patch(`/v1/pages/${id}`, { properties: { [name]: { rich_text: chunkText(text).map((content) => ({ type: 'text', text: { content } })) } } });
    // previous = znacznik edycji strony tuż przed naszym zapisem: klient po nim poznaje, czy między jego zapisami ktoś inny zmienił trade'a (P27, przegląd 28.10.2026)
    return { edited: out?.last_edited_time || null, previous: page.last_edited_time || null };
  }

  // Zapis: walidacja, cache z pending, wysyłka. Zwraca { ok, pending }.
  function save(id, doc) {
    if (!PAGE_ID_RE.test(String(id || ''))) return Promise.reject(new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.'));
    id = id.toLowerCase();
    return serial(id, async () => {
      await parseDoc(doc, t);
      const text = JSON.stringify(doc);
      if (text.length > MAX_CHARS) {
        throw new ValidationError({ drawings: 'size' }, t('Za dużo rysunków na tym trade\'zie ({n} z 190 000 znaków). Usuń część rysunków, zanim zapiszesz.', { n: text.length.toLocaleString('pl-PL') }));
      }
      const bytes = notionBytes(text);
      if (bytes > NOTION_MAX_BYTES) {
        throw new ValidationError({ drawings: 'size' }, t('Za dużo rysunków na tym trade\'zie (zapis ma {kb} KB, Notion przyjmuje do 500 KB). Usuń część rysunków albo skróć teksty, zanim zapiszesz.', { kb: String(Math.round(bytes / 1024)) }));
      }
      try {
        // P27: znacznik edycji strony po zapisie rysunków wraca do edytora, żeby zapis cen pozycji (PATCH trade'a z kontrolą 409) nie trafił na własny zapis
        const { edited, previous } = await send(id, text);
        writeCache(id, { at: doc.at, json: text, pending: false });
        data.invalidate();
        return { ok: true, pending: false, ...(edited ? { edited } : {}), ...(previous ? { previous } : {}) };
      } catch (e) {
        if (!transient(e)) throw e;
        console.error('[drawings] zapis odłożony:', e.message);
        writeCache(id, { at: doc.at, json: text, pending: true });
        return { ok: true, pending: true };
      }
    });
  }

  // Odczyt: najpierw zaległy stan z cache, potem Notion; nowszy `at` wygrywa. Zły JSON w Notion: pusty wykres, cache nietknięty.
  function read(id) {
    if (!PAGE_ID_RE.test(String(id || ''))) return Promise.reject(new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.'));
    id = id.toLowerCase();
    return serial(id, async () => {
      let cache = readCache(id);
      // flushed: odczyt wysłał zaległy zapis do Notion, więc strona w Notion ma nowy znacznik edycji (W4): dane w pamięci unieważniamy, a klient odświeża swoje
      let flushed = false;
      const fromCache = (extra = {}) => (cache ? { doc: JSON.parse(cache.json), pending: cache.pending, source: 'cache', ...extra, ...(flushed ? { flushed } : {}) } : { doc: null, pending: false, source: 'none', ...extra, ...(flushed ? { flushed } : {}) });
      let name;
      try { name = await property(); } catch (e) {
        if (e.code === 'no-field') return { doc: null, pending: false, source: 'none', noField: true };
        if (!transient(e)) throw e;
        return fromCache({ offline: true });
      }
      try {
        if (cache?.pending) {
          await send(id, cache.json);
          cache = { ...cache, pending: false };
          writeCache(id, cache);
          flushed = true;
          data.invalidate();
        }
        const page = await pageOf(id);
        const text = (page.properties?.[name]?.rich_text || []).map((x) => x.plain_text ?? x.text?.content ?? '').join('');
        if (!text) return fromCache();
        let doc;
        try { doc = await parseDoc(JSON.parse(text), t); } catch { return { ...fromCache(), doc: null, source: 'bad', bad: true }; }
        if (cache && Date.parse(cache.at) > Date.parse(doc.at)) return fromCache();
        writeCache(id, { at: doc.at, json: text, pending: false });
        return { doc, pending: false, source: 'notion', ...(flushed ? { flushed } : {}) };
      } catch (e) {
        if (!transient(e)) throw e;
        return fromCache({ offline: true });
      }
    });
  }

  return { save, read, cacheFile: file, hasCache: (id) => existsSync(file(id)) };
}
