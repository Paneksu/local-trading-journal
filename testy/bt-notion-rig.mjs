// Wspólne dla testów backtest-E2 (poprawki po review): atrapa Notion po migracjach do 006 i prawdziwe moduły serwera w procesie testu (notion, data, writes,
// drawings, magazyn sesji, wysyłka) z wstrzykiwaną awarią klienta Notion i sterowanym zegarem wysyłki. Nigdy prawdziwe Notion.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SID = 'bt-k3f9x2abc';
export const DAY1 = '2024-03-12', DAY2 = '2024-03-13';
export const T0 = Date.UTC(2024, 2, 12, 13, 45) / 1000; // 9:45 NY

export const trade = (n, o = {}) => ({
  id: `t${n}`, day: DAY1, instrument: 'NQ', contract: 'NQH4', dir: 'Long', qty: 1, entryT: T0 + n * 600, entryPrice: 18000 + n, sl0: 17990 + n, sl: 17990 + n, tp: 18020 + n, be: false,
  exits: [{ t: T0 + n * 600 + 300, price: 18010 + n, qty: 1, reason: 'tp' }], exitT: T0 + n * 600 + 300, exitPrice: 18010 + n, r: 1, pnl: 200, maeR: -0.4, mfeR: 1.5,
  setup: 'Breakout', notes: `notatka ${n}`, journal: 'done', drawings: null, notion: { id: null, state: 'pending', error: null }, ...o,
});
export const session = (trades, o = {}) => ({
  v: 1, id: SID, name: 'CPI 2024', created: '2024-01-01T00:00:00.000Z',
  def: { instruments: ['NQ'], from: '2024-03-11', to: '2024-03-15', balance: 50000, risk: { mode: 'usd', value: 500 }, startTime: '09:00', order: 'chrono', seed: 1, accountId: null, filter: null, excluded: [] },
  pool: [DAY1, DAY2], dayIdx: 0, cursor: null, hw: 0, layout: { kind: '1', charts: [{ instrument: 'NQ', tf: '1m' }], active: 0 }, days: { [DAY1]: { status: 'active' } }, book: null, trades, drawings: {}, ...o,
});

export function envDir(H, lang = 'pl', version = 2) {
  const I = H.IDS, dir = H.tmp();
  writeFileSync(path.join(dir, '.env'), `NOTION_TOKEN=x\nNOTION_ROOT_URL=${H.PARENT_URL}\nDS_TRADES=${I.DS_TRADES}\nDS_KONTA=${I.DS_KONTA}\nDS_DZIENNIK=${I.DS_DZIENNIK}\nDS_FINANSE=${I.DS_FINANSE}\n`);
  writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: version, lang }));
  return dir;
}

export async function rig(H, assert, ROOT, port, { timeoutMs } = {}) {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const I = H.IDS;
  const A = await H.atrapa(port);
  const dir = envDir(H);
  const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir }));
  assert.equal(mig.code, 0, mig.err);
  const { createNotion, NotionError } = await lib('lib/notion.mjs');
  const { createData } = await lib('lib/data.mjs');
  const { createWriter } = await lib('lib/writes.mjs');
  const { createDrawings } = await lib('lib/drawings.mjs');
  const { createBacktestStore } = await lib('lib/backtest-store.mjs');
  const { createBacktestSync } = await lib('lib/backtest-sync.mjs');
  const { tr: t } = await lib('lib/i18n.mjs');
  const real = createNotion({ token: 'x', base: A.base, t });
  const R = { A, dir, fault: null, calls: [], clock: Date.UTC(2026, 9, 30, 12) };
  const wrap = (method, fn) => async (p, b) => {
    R.calls.push(`${method} ${p}`);
    const f = R.fault?.(method, p);
    if (f === 'before-429') throw new NotionError('Notion API: za dużo żądań (429), spróbuj za chwilę.', 429);
    if (f === 'before-409c') throw Object.assign(new NotionError('Conflict occurred while saving. Please try again.', 409), { notionCode: 'conflict_error' });
    if (f === 'before-net') throw new TypeError('fetch failed');
    if (f === 'hang') return new Promise(() => {});
    const out = await fn(p, b);
    if (f === 'after-lost') throw new TypeError('fetch failed');
    return out;
  };
  const notion = { ...real, get: wrap('GET', real.get), post: wrap('POST', real.post), patch: wrap('PATCH', real.patch), queryAll: async (ds) => { const f = R.fault?.('QUERY', ds); if (f === 'before-net') throw new TypeError('fetch failed'); return real.queryAll(ds); } };
  const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
  const SOURCES = { trades: I.DS_TRADES, konta: I.DS_KONTA, dziennik: I.DS_DZIENNIK, finanse: I.DS_FINANSE };
  const data = createData({ notion, sources: SOURCES, getConfig: () => cfg, persistConfig: () => {}, rootUrl: H.PARENT_URL });
  const writer = createWriter({ notion, sources: SOURCES, data, t });
  const drawings = createDrawings({ notion, sources: SOURCES, data, t, baseDir: path.join(dir, 'chart-data') });
  const store = createBacktestStore({ baseDir: path.join(dir, 'chart-data'), t, log: () => {} });
  const sync = createBacktestSync({ store, writer, drawings, data, t, log: () => {}, now: () => R.clock, ...(timeoutMs ? { timeoutMs } : {}) });
  Object.assign(R, { store, sync, data, writer, notion });
  R.pages = async () => (await A.get('/__test/pages?ds=trades')).filter((p) => (p.p['Sesja backtestu']?.rich_text || []).length);
  R.text = (p, k) => (p.p[k]?.rich_text || []).map((x) => x.text?.content ?? x.plain_text ?? '').join('');
  R.page = async (tid) => (await R.pages()).find((p) => R.text(p, 'Sesja backtestu').endsWith(`/${tid}]`));
  R.tr = (tid) => R.store.read(SID).trades.find((x) => x.id === tid);
  // zapis jak z przeglądarki: bieżący plik + zmiana, wersja z pliku
  R.edit = (fn) => { const d = R.store.read(SID); fn(d); return R.store.save(SID, d, d.rev); };
  return R;
}
