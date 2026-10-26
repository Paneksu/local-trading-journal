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
      const p = page.properties?.[r.name];
      const om = sch.optMaps[role];
      o[role] = p ? simplifyValue(p, om ? (n) => om.toToken.get(n) ?? n : null) : null;
    }
    return o;
  }

  function buildImgEntry(page, sch) {
    const props = page.properties || {};
    const files = [];
    const fp = sch.roles.files && props[sch.roles.files.name];
    for (const f of fp?.files || []) {
      if (f.type === 'file' && f.file?.url) files.push({ kind: 'file', url: f.file.url, expiry: Date.parse(f.file.expiry_time) || 0 });
      else if (f.type === 'external' && f.external?.url) files.push({ kind: 'external', url: f.external.url, expiry: 0 });
    }
    const cp = sch.roles.chart && props[sch.roles.chart.name];
    const m = (cp?.url || '').match(TV_RE);
    return { files, tv: m ? m[1] : null };
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
    DBS.forEach((k, i) => {
      const sch = schs[i];
      const live = pages[i].filter((p) => !p.archived && !p.in_trash);
      payload.data[k] = live.map((p) => {
        const o = normalizePage(p, k, sch);
        if (k === 'trades') {
          const e = applyTestStale(buildImgEntry(p, sch));
          imgIndex.set(p.id, e);
          o._imgs = e.files.length + (e.tv ? 1 : 0);
        }
        return o;
      });
      payload.colors[k] = sch.colors;
      payload.fields[k] = sch.types;
      if (sch.missing.length) payload.requiredMissing[k] = sch.missing;
    });
    return payload;
  }

  async function getPayload(force) {
    if (!force && cache && Date.now() - cache.at < cacheMs) return { ...cache.payload, cached: true };
    if (!inflight) {
      inflight = buildPayload()
        .then((payload) => { cache = { at: Date.now(), payload }; return payload; })
        .finally(() => { inflight = null; });
    }
    return { ...(await inflight), cached: false };
  }

  async function refreshImgEntry(pageId) {
    stats.imgRefresh++;
    const page = await notion.get(`/v1/pages/${pageId}`);
    const sch = schemas.trades || (await loadSchema('trades'));
    const e = buildImgEntry(page, sch);
    imgIndex.set(pageId, e);
    return e;
  }

  return {
    getPayload, loadSchema, imgIndex, stats, refreshImgEntry,
    invalidate: () => { cache = null; },
    cachedPayload: () => cache?.payload || null,
    schemaOf: (db) => schemas[db],
  };
}
