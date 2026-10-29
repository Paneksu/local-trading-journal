// Atrapa Databento (historyczne HTTP) do testów. Uruchomienie: node testy/atrapa-databento.mjs [port]
// Sprawdza Basic Auth z kluczem testowym, symbols ∈ {ES.v.0, NQ.v.0} przy stype_in=continuous albo kontrakt kwartalny (ESH6) przy raw_symbol (P35), schema ∈ {ohlcv-1s, ohlcv-1m} (P25); wszystko, co łamie
// zasady, ląduje w violations. Dane syntetyczne: jedna świeca co `step` s w oknie żądania. Nagłówek CSV generowany z listy kolumn
// (prawdziwy nagłówek potwierdzony 27.10.2026 na żywo: ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume).
// Databento nie ma API salda ani kredytów (sprawdzone w dokumentacji 27.10.2026), więc atrapa go nie udaje; kredyt liczy aplikacja lokalnie.
// gaps: lista [od, do) w sekundach epoki, w których nie ma wierszy (sekundy bez transakcji nie mają świecy). Zapisuje też wycenę per schema: costs1m. Sterowanie: POST /__test/config, odczyt: GET /__test/log.
import http from 'node:http';

const PORT = Number(process.argv[2] || process.env.ATRAPA_PORT) || 4398;
export const TEST_KEY = 'db-test-key-0123456789abcdef';
const KEY = process.env.ATRAPA_DB_KEY || TEST_KEY;
const cfg = {
  cost: 0.002, costs: [], // costs: kolejka wycen (kolejne get_cost), potem `cost`
  end: '2026-10-27T10:00:00.000000000Z', // koniec dostępnych danych (get_dataset_range)
  step: 60, // co ile sekund świeca w wygenerowanym CSV dla ohlcv-1s (dla ohlcv-1m zawsze 60)
  failRangeAfter: null, // po tylu udanych get_range kolejne kończą się 429 (przerwany import)
  failRangeCount: null, // P49: ile razy 429 po failRangeAfter (null = zawsze); potem get_range znów działa (wznowienie)
  gaps: [], cost1m: null, // cost1m: wycena dla schemy ohlcv-1m (gdy null, to samo co cost)
  header: ['ts_event', 'rtype', 'publisher_id', 'instrument_id', 'open', 'high', 'low', 'close', 'volume'],
  rollAt: null, // sekunda epoki: od niej instrument_id = 2
  fail: null, // { path: '/v0/...', status: 429 } wymusza błąd
  empty: false,
  rangeMethod: 'both',
  // P35: symbol surowy kontraktu (ESH6, stype_in=raw_symbol): ceny o rawOffset wyżej niż seria .v.0 (test widzi, z której warstwy są świece);
  // resolve: { symbol: [{ d0, d1, s }] } dla symbology.resolve (brak wpisu = pusta lista)
  rawOffset: 55, resolve: {},
};
let rangeOk = 0, rangeFailed = 0;
const log = [];
const violations = [];
const send = (res, status, obj, raw) => { res.writeHead(status, { 'Content-Type': raw ? 'text/csv' : 'application/json' }); res.end(raw ?? JSON.stringify(obj)); };
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString())); });
const ns = (s) => BigInt(Math.round(s)) * 1_000_000_000n;

function csv(form) {
  const a = Date.parse(form.get('start')) / 1000, b = Date.parse(form.get('end')) / 1000;
  const idx = (n) => cfg.header.indexOf(n);
  const rows = [cfg.header.join(',')];
  if (cfg.empty) return rows[0] + '\n';
  let k = 0;
  const step = form.get('schema') === 'ohlcv-1m' ? 60 : cfg.step;
  const raw = form.get('stype_in') === 'raw_symbol';
  for (let t = a; t < b; t += step, k++) {
    if (cfg.gaps.some(([x, y]) => t >= x && t < y)) continue;
    const base = (5025 + (raw ? cfg.rawOffset : 0) + (k % 8) * 0.25) * 1e9;
    const id = raw ? 100 : cfg.rollAt != null && t >= cfg.rollAt ? 2 : 1;
    const val = { ts_event: ns(t), rtype: 32, publisher_id: 1, instrument_id: id, open: BigInt(Math.round(base)), high: BigInt(Math.round(base + 0.5e9)), low: BigInt(Math.round(base - 0.25e9)), close: BigInt(Math.round(base + 0.25e9)), volume: 3 + (k % 5) };
    rows.push(cfg.header.map((h) => String(val[h] ?? '')).join(','));
  }
  void idx;
  return rows.join('\n') + '\n';
}

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/__test/log') return send(res, 200, { log, violations });
  if (p === '/__test/config') { const c = JSON.parse((await readBody(req)) || '{}'); if ('failRangeAfter' in c) { rangeOk = 0; rangeFailed = 0; } Object.assign(cfg, c); return send(res, 200, cfg); }
  if (p === '/__test/reset') { log.length = 0; violations.length = 0; return send(res, 200, {}); }
  const raw = req.method === 'GET' ? new URL(req.url, 'http://x').searchParams.toString() : await readBody(req);
  const form = new URLSearchParams(raw);
  const entry = { method: req.method, path: p, params: Object.fromEntries(form) };
  log.push(entry);
  if (req.headers.authorization !== 'Basic ' + Buffer.from(`${KEY}:`).toString('base64')) { violations.push(`zły Basic Auth: ${p}`); return send(res, 401, { detail: { message: 'bad key' } }); }
  if (cfg.fail && cfg.fail.path === p) return send(res, cfg.fail.status, { detail: { message: `symulowany błąd ${cfg.fail.status}` } });
  if (p === '/v0/metadata.get_dataset_range') {
    if (cfg.rangeMethod === 'post' && req.method === 'GET') return send(res, 405, {});
    return send(res, 200, { start: '2010-06-06T00:00:00.000000000Z', end: cfg.end, schema: { 'ohlcv-1s': { start: '2010-06-06T00:00:00.000000000Z', end: cfg.end } } });
  }
  if (p === '/v0/symbology.resolve') {
    const syms = String(form.get('symbols') || '').split(',');
    for (const s of syms) if (!(['ES.v.0', 'NQ.v.0'].includes(s) || /^(ES|NQ)[HMUZ]\d$/.test(s))) violations.push(`zły symbol symbology: ${s}`);
    return send(res, 200, { result: Object.fromEntries(syms.map((s) => [s, cfg.resolve[s] || []])), not_found: [], partial: [] });
  }
  if (p === '/v0/metadata.get_cost' || p === '/v0/timeseries.get_range') {
    const sym = form.get('symbols');
    const raw = /^(ES|NQ)[HMUZ]\d$/.test(sym || '');
    if (!(['ES.v.0', 'NQ.v.0'].includes(sym) || raw) || /\.FUT$|\.c\./.test(sym || '')) violations.push(`zły symbol: ${sym}`);
    if (form.get('stype_in') !== (raw ? 'raw_symbol' : 'continuous')) violations.push(`zły stype_in: ${form.get('stype_in')}`);
    if (!['ohlcv-1s', 'ohlcv-1m'].includes(form.get('schema'))) violations.push(`zły schema: ${form.get('schema')}`);
    if (form.get('dataset') !== 'GLBX.MDP3') violations.push(`zły dataset: ${form.get('dataset')}`);
    if (p.endsWith('get_cost')) return send(res, 200, null, String(cfg.costs.length ? cfg.costs.shift() : (form.get('schema') === 'ohlcv-1m' && cfg.cost1m != null ? cfg.cost1m : cfg.cost)));
    if (form.get('encoding') !== 'csv') violations.push('brak encoding=csv');
    if (cfg.failRangeAfter != null && rangeOk >= cfg.failRangeAfter && (cfg.failRangeCount == null || rangeFailed++ < cfg.failRangeCount)) return send(res, 429, { detail: { message: 'symulowany limit po N pobraniach' } });
    rangeOk++;
    return send(res, 200, null, csv(form));
  }
  send(res, 404, { detail: { message: 'nie ma' } });
}).listen(PORT, '127.0.0.1');
