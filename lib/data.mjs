// Odczyt danych z Notion: schemat baz → role pól, normalizacja stron do obiektów z kluczami ról (nie nazw z Notion), cache, indeks zrzutów.
// Reads the data from Notion: schema → field roles, pages normalised to role-keyed objects, cache, screenshot index.
import { DBS, resolveRoles, resolveOptionMap, OPTION_ROLES } from './roles.mjs';

const plain = (arr) => (arr || []).map((t) => t.plain_text).join('');

export function simplifyValue(p, tokenize) {
  switch (p.type) {
    case 'title': return plain(p.title);
    case 'rich_text': return plain(p.rich_text);
    case 'number': return p.number;
    case 'select': return p.select ? { name: tokenize ? tokenize(p.select.name) : p.select.name, color: p.select.color } : null;
    case 'status': return p.status ? { name: p.status.name, color: p.status.color } : null;
    case 'multi_select': return p.multi_select.map((o) => ({ name: o.name, color: o.color }));
    case 'date': return p.date ? p.date.start : null;
    case 'checkbox': return p.checkbox;
    case 'url': return p.url;
    case 'files': return (p.files || []).map((f) => ({ name: f.name, type: f.type }));
    case 'relation': return p.relation.map((r) => r.id);
    case 'formula': {
      const f = p.formula;
      return f ? (f.type === 'date' ? f.date?.start ?? null : f[f.type] ?? null) : null;
    }
    case 'rollup': {
      const r = p.rollup;
      if (!r) return null;
      if (r.type === 'array') return r.array.map((x) => simplifyValue(x));
      if (r.type === 'date') return r.date?.start ?? null;
      return r[r.type] ?? null;
    }
    default: return null;
  }
}

const TV_RE = /^https:\/\/www\.tradingview\.com\/x\/([A-Za-z0-9]{6,12})\/?(?:[?#].*)?$/;
const TEST_STALE = process.env.THQ_TEST_STALE || ''; // tylko do testów: 'expired' | 'badurl'

export function createData({ notion, sources, getConfig, persistConfig, rootUrl, cacheMs = 30_000 }) {
  const imgIndex = new Map(); // pageId -> { files: [{kind,url,expiry}], tv: id|null }
  const stats = { imgRefresh: 0, imgRetry: 0 };
  const schemas = {};          // db -> ostatnio pobrany opis (role, opcje, kolory)
  let cache = null, inflight = null;

  // Pobiera schemat bazy i zamienia go na role. Nowo rozpoznane identyfikatory zapisuje do config.local.json.
  async function loadSchema(db) {
    const ds = await notion.get(`/v1/data_sources/${sources[db]}`);
    const cfg = getConfig();
    const { map, learned, missing } = resolveRoles(db, ds.properties || {}, cfg.fields?.[db] || {});
    if (Object.keys(learned).length) {
      cfg.fields = cfg.fields || {};
      cfg.fields[db] = { ...(cfg.fields[db] || {}), ...learned };
      persistConfig();
    }
    const optMaps = {}, colors = {}, types = {}, optionNames = {};
    for (const [role, r] of Object.entries(map)) {
      types[role] = r.type;
      const p = ds.properties[r.name];
      const opts = p.select?.options || p.multi_select?.options || p.status?.options;
      if (opts) {
        const names = opts.map((o) => o.name);
        optionNames[role] = names;
        const key = `${db}.${role}`;
        const om = OPTION_ROLES[key] ? resolveOptionMap(key, names, cfg.options?.[key] || {}) : null;
        if (om) optMaps[role] = om;
        colors[role] = Object.fromEntries(opts.map((o) => [om?.toToken.get(o.name) ?? o.name, o.color]));
      }
    }
    const sch = { db, props: ds.properties || {}, roles: map, missing, optMaps, colors, types, optionNames };
    schemas[db] = sch;
    return sch;
  }

  function normalizePage(page, db, sch) {
    const o = { _id: page.id, _url: page.url, _created: page.created_time, _edited: page.last_edited_time };
    for (const [role, r] of Object.entries(sch.roles)) {
      // rysunki wykresu (rich_text do ~200 tys. znaków) czyta tylko osobny endpoint; w /api/data rosłaby lista trade'ów
      if (db === 'trades' && role === 'drawings') continue;
      const p = page.properties?.[r.name];
      const om = sch.optMaps[role];
      o[role] = p ? simplifyValue(p, om ? (n) => om.toToken.get(n) ?? n : null) : null;
    }
    return o;
  }

  // Zrzuty dodane z dashboardu leżą jako bloki obrazu na stronie trade'a (pole „Zrzut” nie jest ruszane, bo zapis pola
  // zastępuje całą tablicę). Bloki skanujemy dla WSZYSTKICH trade'ów (decyzja sesji głównej 26.10.2026: zrzut dodany na jednym
  // urządzeniu ma być widoczny na drugim, bez lokalnej listy), ale oszczędnie: wynik skanu jest w pamięci pod kluczem
  // last_edited_time strony, więc strona bez zmian nie jest skanowana drugi raz. Skan idzie w tle (do 3 naraz), a /api/data
  // wraca od razu z tym, co jest w pamięci; pole `scanning` mówi stronie, że warto zapytać jeszcze raz.
  // Screenshots added from the dashboard are image blocks on the trade page. All trades are scanned in the background (max 3 at a time),
  // cached in memory by the page's last_edited_time; /api/data never waits for the scan and reports `scanning` while it runs.
  const MAX_SCAN_PAGES = 20; // 20 × 100 = 2000 bloków najwyższego poziomu na stronę; ponad to log i skan częściowy
  const SCAN_CONCURRENCY = 3;
  const blockCache = new Map(); // pageId -> { edited, files }
  const scanQueue = new Map();  // pageId -> edited (oczekujące)
  const scanFailed = new Map(); // pageId -> czas ostatniego błędu (ponowna próba po minucie)
  let scanWorkers = 0, gen = 0;
  const blockFilesOf = (blocks) => {
    const out = [];
    for (const b of blocks) {
      if (b.type !== 'image' || b.archived || b.in_trash) continue;
      const f = b.image;
      if (f?.type === 'file' && f.file?.url) out.push({ kind: 'file', url: f.file.url, expiry: Date.parse(f.file.expiry_time) || 0 });
      else if (f?.type === 'external' && f.external?.url) out.push({ kind: 'external', url: f.external.url, expiry: 0 });
    }
    return out;
  };
  async function scanBlocks(pageId) {
    const blocks = [];
    let cursor;
    for (let n = 0; ; n++) {
      if (n >= MAX_SCAN_PAGES) { console.error(`[shots] strona ${pageId}: ponad ${MAX_SCAN_PAGES * 100} bloków, skan częściowy (dalsze zrzuty pominięte)`); break; }
      const r = await notion.get(`/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
      blocks.push(...r.results);
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
    return blockFilesOf(blocks);
  }
  async function scanWorker() {
    scanWorkers++;
    try {
      while (scanQueue.size) {
        const [id, edited] = scanQueue.entries().next().value;
        scanQueue.delete(id);
        try { blockCache.set(id, { edited, files: await scanBlocks(id) }); scanFailed.delete(id); }
        catch (e) { scanFailed.set(id, Date.now()); console.error('[shots] skan bloków nieudany:', e.message); }
      }
    } finally {
      scanWorkers--;
      if (!scanWorkers) { gen++; cache = null; } // koniec skanu: następne /api/data złoży dane ze świeżymi zrzutami
    }
  }
  function queueScan(id, edited) {
    const c = blockCache.get(id);
    if (c && c.edited === edited) return;
    if (Date.now() - (scanFailed.get(id) || 0) < 60_000) return;
    scanQueue.set(id, edited);
  }
  function startScan() { while (scanWorkers < SCAN_CONCURRENCY && scanWorkers < scanQueue.size) scanWorker(); }

  function buildImgEntry(page, sch, blockFiles = []) {
    const props = page.properties || {};
    const files = [];
    const fp = sch.roles.files && props[sch.roles.files.name];
    for (const f of fp?.files || []) {
      if (f.type === 'file' && f.file?.url) files.push({ kind: 'file', url: f.file.url, expiry: Date.parse(f.file.expiry_time) || 0 });
      else if (f.type === 'external' && f.external?.url) files.push({ kind: 'external', url: f.external.url, expiry: 0 });
    }
    files.push(...blockFiles);
    const cp = sch.roles.chart && props[sch.roles.chart.name];
    const m = (cp?.url || '').match(TV_RE);
    return { files, tv: m ? m[1] : null, blockFiles };
  }
  function applyTestStale(entry) {
    if (!TEST_STALE) return entry;
    for (const f of entry.files) {
      if (f.kind !== 'file') continue;
      f.url = f.url.replace(/(X-Amz-Signature=)[^&]*/i, '$1deadbeef');
      f.expiry = TEST_STALE === 'expired' ? Date.now() - 1000 : Date.now() + 3600_000;
    }
    return entry;
  }

  async function buildPayload() {
    const missingDs = DBS.filter((k) => !sources[k]);
    if (missingDs.length) throw Object.assign(new Error(`DS: ${missingDs.join(', ')}`), { status: 500, missingDs });
    const [pages, schs] = await Promise.all([
      Promise.all(DBS.map((k) => notion.queryAll(sources[k]))),
      Promise.all(DBS.map((k) => loadSchema(k))),
    ]);
    const payload = { fetchedAt: new Date().toISOString(), notionUrl: typeof rootUrl === 'function' ? rootUrl() : rootUrl, data: {}, colors: {}, fields: {}, requiredMissing: {} };
    // bloki zrzutów: z pamięci (klucz: last_edited_time), brakujące i zmienione trafiają do skanu w tle
    const tIdx = DBS.indexOf('trades');
    for (const p of pages[tIdx]) if (!p.archived && !p.in_trash) queueScan(p.id, p.last_edited_time);
    DBS.forEach((k, i) => {
      const sch = schs[i];
      const live = pages[i].filter((p) => !p.archived && !p.in_trash);
      payload.data[k] = live.map((p) => {
        const o = normalizePage(p, k, sch);
        if (k === 'trades') {
          const e = applyTestStale(buildImgEntry(p, sch, blockCache.get(p.id)?.files || []));
          imgIndex.set(p.id, e);
          o._imgs = e.files.length + (e.tv ? 1 : 0);
        }
        return o;
      });
      payload.colors[k] = sch.colors;
      payload.fields[k] = sch.types;
      if (sch.missing.length) payload.requiredMissing[k] = sch.missing;
    });
    startScan();
    return payload;
  }

  // gen rośnie przy każdym unieważnieniu: odpowiedź budowana przed zapisem (albo przed końcem skanu) nie trafia do pamięci podręcznej,
  // a żądanie po unieważnieniu (albo z ?refresh) zawsze startuje nowe budowanie, zamiast dołączać do starszego.
  async function getPayload(force) {
    if (!force && cache && Date.now() - cache.at < cacheMs) return { ...cache.payload, cached: true, scanning: scanQueue.size + scanWorkers > 0 };
    if (force || !inflight) {
      const g = gen;
      const p = buildPayload()
        .then((payload) => { if (g === gen) cache = { at: Date.now(), payload }; return payload; })
        .finally(() => { if (inflight === p) inflight = null; });
      inflight = p;
    }
    const payload = await inflight;
    return { ...payload, cached: false, scanning: scanQueue.size + scanWorkers > 0 };
  }

  async function refreshImgEntry(pageId) {
    stats.imgRefresh++;
    const page = await notion.get(`/v1/pages/${pageId}`);
    const sch = schemas.trades || (await loadSchema('trades'));
    const files = await scanBlocks(pageId);
    blockCache.set(pageId, { edited: page.last_edited_time, files });
    const e = buildImgEntry(page, sch, files);
    e.edited = page.last_edited_time;
    imgIndex.set(pageId, e);
    return e;
  }

  return {
    getPayload, loadSchema, imgIndex, stats, refreshImgEntry,
    invalidate: () => { cache = null; inflight = null; gen++; },
    cachedPayload: () => cache?.payload || null,
    schemaOf: (db) => schemas[db],
  };
}
