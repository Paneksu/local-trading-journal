// Atrapa Notion API do testów dashboardu (bez dotykania prawdziwego Notion).
// Uruchomienie: node testy/atrapa-notion.mjs [port]   (domyślnie 4399)
// Potem serwer dashboardu: PORT=4331 NOTION_API_BASE=http://127.0.0.1:4399 NOTION_TOKEN=test DS_TRADES=... (patrz testy/start-test.mjs)
// Obsługuje: GET /v1/data_sources/:id, POST /v1/data_sources/:id/query, PATCH /v1/data_sources/:id (dodanie pola),
// GET/PATCH /v1/pages/:id, POST /v1/pages. Pomocnicze: GET /__test/log, POST /__test/notion-edit (zmiana "zrobiona w Notion").
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.argv[2] || process.env.ATRAPA_PORT) || 4399;
export const IDS = {
  trades: '11111111-1111-4111-8111-111111111111',
  konta: '22222222-2222-4222-8222-222222222222',
  dziennik: '33333333-3333-4333-8333-333333333333',
  finanse: '44444444-4444-4444-8444-444444444444',
};

const opt = (names) => names.map((name, i) => ({ name, color: ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'][i % 10] }));
const schemas = {
  trades: {
    Trade: { type: 'title' }, Typ: { type: 'select', select: { options: opt(['Live', 'Backtest', 'Niewzięty']) } },
    Data: { type: 'date' }, Instrument: { type: 'select', select: { options: opt(['EURUSD', 'GBPUSD', 'XAUUSD', 'NAS100', 'US30', 'ES', 'NQ']) } },
    Kierunek: { type: 'select', select: { options: opt(['Long', 'Short', 'NO TRADE']) } },
    Setup: { type: 'select', select: { options: opt(['Breakout', 'Pullback', 'Reversal', 'Range', 'MECH MODEL']) } },
    Sesja: { type: 'select', select: { options: opt(['Azja', 'Londyn', 'Nowy Jork']) } },
    R: { type: 'number' }, 'P&L $': { type: 'number' }, 'Zgodnie z planem': { type: 'checkbox' },
    Emocje: { type: 'multi_select', multi_select: { options: opt(['Spokój', 'FOMO', 'Strach', 'Chciwość', 'Rewanż', 'Nuda']) } },
    Konta: { type: 'relation' }, Wykres: { type: 'url' }, Notatki: { type: 'rich_text' }, Zrzut: { type: 'files' },
    'Wynik ręcznie': { type: 'select', select: { options: opt(['✅ Win', '❌ Loss', '➖ BE']) } },
    'Powód': { type: 'select', select: { options: opt(['Koniec dnia', 'Limit trade’ów', 'Nie było mnie', 'Strach / zawahanie', 'Poza planem', 'Inne']) } },
  },
  konta: {
    Konto: { type: 'title' }, Status: { type: 'select', select: { options: opt(['Challenge', 'Weryfikacja', 'Funded', 'Przegrane', 'Zamknięte']) } },
    Firma: { type: 'select', select: { options: opt(['FTMO', 'FundedNext', 'The5ers', 'Apex', 'Topstep', 'Alpha Capital', 'Inna']) } }, Rozmiar: { type: 'number' },
    Saldo: process.env.ATRAPA_SALDO_LICZBA ? { type: 'number' } : { type: 'formula' }, Aktywne: { type: 'formula' }, 'Data zakupu': { type: 'date' }, Notatki: { type: 'rich_text' },
    'Trade’y': { type: 'relation' }, 'Wydatki i payouty': { type: 'relation' },
  },
  dziennik: { Dzień: { type: 'title' } },
  finanse: {
    Opis: { type: 'title' }, Data: { type: 'date' }, Kwota: { type: 'number' }, Konto: { type: 'relation' },
    Rodzaj: { type: 'select', select: { options: opt(['Zakup challenge', 'Reset', 'Aktywacja / opłata', 'Payout']) } },
    Firma: { type: 'select', select: { options: opt(['FTMO', 'FundedNext', 'The5ers', 'Apex', 'Topstep', 'Alpha Capital', 'Inna']) } }, Bilans: { type: 'formula' }, Wydatek: { type: 'formula' }, 'Wypłata': { type: 'formula' },
  },
};
const dsByName = Object.fromEntries(Object.entries(IDS).map(([k, v]) => [v, k]));

// ---------- dane startowe ----------
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pages = { trades: [], konta: [], dziennik: [], finanse: [] };
const stamp = (d) => d.toISOString().replace(/:\d\d\.\d{3}Z$/, ':00.000Z'); // Notion zaokragla do minuty

function offsetFor(tz, y, m, d, hh, mm) {
  const probe = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(probe);
  const v = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  return v === 'GMT' ? '+00:00' : v.replace('GMT', '');
}
function dateValue(local, tz = 'Europe/Warsaw') { // local: 'YYYY-MM-DD' albo 'YYYY-MM-DDTHH:MM[:SS]'
  if (!local) return null;
  if (local.length <= 10) return { start: local, end: null, time_zone: null };
  const [d, t] = local.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm, ss = 0] = t.split(':').map(Number);
  return { start: `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.000${offsetFor(tz, y, m, dd, hh, mm)}`, end: null, time_zone: tz };
}
const txt = (s) => (s ? [{ plain_text: s, text: { content: s } }] : []);
const sel = (ds, prop, name) => (name ? { type: 'select', select: { name, color: schemas[ds][prop].select.options.find((o) => o.name === name)?.color || 'default' } } : { type: 'select', select: null });

function addDays(k, n) { const [y, m, d] = k.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }

function mkPage(ds, id, props, created) {
  const t = created || stamp(new Date());
  return { object: 'page', id, created_time: t, last_edited_time: t, archived: false, in_trash: false, url: `https://www.notion.so/${id.replace(/-/g, '')}`, parent: { type: 'data_source_id', data_source_id: IDS[ds] }, properties: props };
}

const kontaIds = [randomUUID(), randomUUID(), randomUUID()];
[['Apex 50k #1', 'Funded', 'Apex', 50000, 51840, true], ['FTMO 100k', 'Challenge', 'FTMO', 100000, 98760, true], ['Topstep 50k', 'Przegrane', 'Topstep', 50000, 0, false]].forEach((k, i) => {
  pages.konta.push(mkPage('konta', kontaIds[i], {
    Konto: { type: 'title', title: txt(k[0]) }, Status: sel('konta', 'Status', k[1]), Firma: sel('konta', 'Firma', k[2]),
    Rozmiar: { type: 'number', number: k[3] },
    Saldo: process.env.ATRAPA_SALDO_LICZBA ? { type: 'number', number: k[4] } : { type: 'formula', formula: { type: 'number', number: k[4] } },
    Aktywne: { type: 'formula', formula: { type: 'boolean', boolean: k[5] } }, Notatki: { type: 'rich_text', rich_text: txt('') },
    'Data zakupu': { type: 'date', date: dateValue('2026-06-0' + (i + 1)) },
  }));
});
[['2026-06-01', 'Zakup challenge', 'Apex', 147, 0], ['2026-06-02', 'Zakup challenge', 'FTMO', 540, 1], ['2026-06-03', 'Zakup challenge', 'Topstep', 165, 2], ['2026-07-05', 'Reset', 'Topstep', 100, 2], ['2026-07-22', 'Payout', 'Apex', 1200, 0], ['2026-08-10', 'Aktywacja / opłata', 'Apex', 130, 0], ['2026-08-30', 'Payout', 'Apex', 900, 0], ['2026-09-14', 'Reset', 'FTMO', 99, 1], ['2026-09-29', 'Payout', 'FTMO', 350, 1], ['2026-10-08', 'Zakup challenge', 'FTMO', 250, 1], ['2026-10-19', 'Payout', 'Apex', 600, 0]].forEach(([d, r, f, k, ki]) => {
  pages.finanse.push(mkPage('finanse', randomUUID(), {
    Opis: { type: 'title', title: txt(`${r} ${f}`) }, Data: { type: 'date', date: dateValue(d) }, Kwota: { type: 'number', number: k },
    Rodzaj: sel('finanse', 'Rodzaj', r), Firma: sel('finanse', 'Firma', f), Konto: { type: 'relation', relation: [{ id: kontaIds[ki] }] },
  }));
});

function tradeProps(o) {
  const p = {
    Trade: { type: 'title', title: txt(o.name || '') }, Typ: sel('trades', 'Typ', o.typ), Data: { type: 'date', date: dateValue(o.date) },
    Instrument: sel('trades', 'Instrument', o.instrument), Kierunek: sel('trades', 'Kierunek', o.dir), Setup: sel('trades', 'Setup', o.setup),
    Sesja: sel('trades', 'Sesja', o.session), R: { type: 'number', number: o.r ?? null }, 'P&L $': { type: 'number', number: o.pnl ?? null },
    'Zgodnie z planem': { type: 'checkbox', checkbox: !!o.plan }, Emocje: { type: 'multi_select', multi_select: (o.emotions || []).map((n) => ({ name: n, color: 'default' })) },
    Konta: { type: 'relation', relation: (o.konta || []).map((id) => ({ id })) }, Wykres: { type: 'url', url: o.chart || null },
    Notatki: { type: 'rich_text', rich_text: txt(o.notes || '') }, Zrzut: { type: 'files', files: [] }, 'Wynik ręcznie': sel('trades', 'Wynik ręcznie', null),
    'Powód': sel('trades', 'Powód', o.reason),
  };
  return p;
}

(function seedTrades() {
  const today = new Date().toISOString().slice(0, 10);
  const setups = ['Breakout', 'Pullback', 'Reversal', 'Range', 'MECH MODEL'];
  const emos = ['Spokój', 'FOMO', 'Strach', 'Chciwość', 'Rewanż', 'Nuda'];
  const notes = ['Czekałem na zamknięcie świecy, wejście po retestcie.', 'Za szybko, bez potwierdzenia.', 'Czysty układ, trzymałem do celu.', 'Przesunąłem SL, nie powinienem.', ''];
  for (let back = 0; back < 150; back++) {
    const day = addDays(today, -back);
    const wd = new Date(day + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6 || rnd() < 0.25) continue;
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const kind = rnd();
      const typ = kind < 0.6 ? 'Live' : kind < 0.85 ? 'Backtest' : 'Niewzięty';
      const win = rnd() < 0.52;
      const r = win ? Math.round((0.6 + rnd() * 2.4) * 10) / 10 : -Math.round((0.5 + rnd() * 0.7) * 10) / 10;
      // godziny wejścia skupione 15:30 do 17:45 (czas polski), czasem poza
      const minute = rnd() < 0.9 ? 15 * 60 + 30 + Math.floor(rnd() * 135) : 9 * 60 + Math.floor(rnd() * 360);
      const dur = 4 + Math.floor(rnd() * (win ? 70 : 35));
      const hasTime = !(typ === 'Backtest' && rnd() < 0.5);
      const loc = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const o = {
        name: rnd() < 0.5 ? `${pick(['NQ', 'ES', 'EURUSD', 'XAUUSD'])} ${pick(['long', 'short'])} ${pick(setups)}` : '', typ, instrument: pick(['NQ', 'ES', 'EURUSD', 'XAUUSD', 'NAS100']),
        dir: pick(['Long', 'Short']), setup: pick(setups), session: pick(['Londyn', 'Nowy Jork']), r, pnl: typ === 'Live' ? Math.round(r * 250) : null,
        plan: rnd() < 0.7, emotions: rnd() < 0.5 ? [pick(emos)] : [], konta: typ === 'Live' ? [kontaIds[rnd() < 0.6 ? 0 : 1]] : [], notes: pick(notes),
        reason: typ === 'Niewzięty' ? pick(['Koniec dnia', 'Poza planem', 'Nie było mnie']) : null,
      };
      const page = mkPage('trades', randomUUID(), tradeProps({ ...o, date: hasTime ? `${day}T${loc(minute)}` : day }), `${day}T12:${String(10 + i).padStart(2, '0')}:00.000Z`);
      if (hasTime && typ !== 'Niewzięty') page.properties['Wyjście'] = { type: 'date', date: dateValue(`${day}T${loc(minute + dur)}`) };
      pages.trades.push(page);
    }
  }
  // test rozkładu R: ATRAPA_ROZKLAD=1 dodaje trzy grupy Live nazwane RZW (szeroki zakres od -3 do +8R), RZ4 (cztery trade'y) i RZO (outlier +15R i -12R)
  if (process.env.ATRAPA_ROZKLAD) {
    const day = addDays(today, -1);
    const mkR = (name, i, r) => pages.trades.push(mkPage('trades', randomUUID(), tradeProps({ name: name + ' ' + i, typ: 'Live', date: day + 'T1' + (i % 10) + ':' + String(10 + (i % 40)), instrument: 'NQ', dir: 'Long', setup: 'Range', session: 'Nowy Jork', r, pnl: Math.round(r * 250), konta: [kontaIds[0]] }), day + 'T12:' + String(10 + (i % 50)) + ':00.000Z'));
    for (let i = 0; i < 40; i++) mkR('RZW', i, Math.round((-3 + (11 * i) / 39) * 100) / 100);
    [-0.5, 0.3, 1.2, 0.05].forEach((r, i) => mkR('RZ4', i, r));
    [0.5, 1, 1.5, -0.5, -1, 0.25, 2, 15, -12].forEach((r, i) => mkR('RZO', i, r));
  }
  // test wyboru roku w heatmapie: ATRAPA_STARE=1 dodaje trade'y Live z 2025 (tylko w atrapie)
  if (process.env.ATRAPA_STARE) {
    for (let i = 0; i < 24; i++) {
      const day = addDays('2025-09-30', -i * 11);
      const r = i % 3 === 0 ? -0.8 : 1.4;
      pages.trades.push(mkPage('trades', randomUUID(), tradeProps({ name: 'STARY ' + i, typ: 'Live', date: day + 'T15:' + String(10 + i).padStart(2, '0'), instrument: 'ES', dir: 'Long', setup: 'Range', session: 'Nowy Jork', r, pnl: Math.round(r * 250), konta: [kontaIds[0]] }), day + 'T12:00:00.000Z'));
    }
  }
  // test czasu trwania: ATRAPA_KROTKIE=1 dodaje trade'y 30 s, 90 s, 4 min, 12 min, 45 min i jeden z samą datą wyjścia (tylko w atrapie)
  if (process.env.ATRAPA_KROTKIE) {
    const day = addDays(today, -1);
    [['30 s', '10:00:00', '10:00:30', 0.6], ['90 s', '10:10:00', '10:11:30', -0.5], ['4 min', '10:20:00', '10:24:00', 1.2], ['12 min', '10:30:00', '10:42:00', -1], ['45 min', '10:50:00', '11:35:00', 2.4]].forEach(([n, a, b, r], i) => {
      const pg = mkPage('trades', randomUUID(), tradeProps({ name: 'DUR ' + n, typ: 'Live', date: day + 'T' + a, instrument: 'NQ', dir: 'Long', setup: 'Breakout', session: 'Londyn', r, pnl: Math.round(r * 250), konta: [kontaIds[0]] }), day + 'T12:5' + i + ':00.000Z');
      pg.properties['Wyjście'] = { type: 'date', date: dateValue(day + 'T' + b) };
      pages.trades.push(pg);
    });
    const pg = mkPage('trades', randomUUID(), tradeProps({ name: 'DUR sama data', typ: 'Live', date: day + 'T11:40:00', instrument: 'NQ', dir: 'Short', setup: 'Range', session: 'Londyn', r: 0.3, pnl: 75, konta: [kontaIds[0]] }), day + 'T12:59:00.000Z');
    pg.properties['Wyjście'] = { type: 'date', date: dateValue(day) };
    pages.trades.push(pg);
  }
  // test gęstości wykresu godzin: ATRAPA_GESTE=300 dodaje tyle sztucznych wejść Live z ostatnich 25 dni (tylko w atrapie)
  const dense = Number(process.env.ATRAPA_GESTE) || 0;
  for (let i = 0; i < dense; i++) {
    const day = addDays(today, -Math.floor(rnd() * 25));
    const win = rnd() < 0.5;
    const r = win ? Math.round((0.2 + rnd() * 3) * 10) / 10 : -Math.round((0.2 + rnd() * 1.2) * 10) / 10;
    const minute = 14 * 60 + 30 + Math.floor(rnd() * 270);
    const loc = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    pages.trades.push(mkPage('trades', randomUUID(), tradeProps({ name: `GESTY ${i}`, typ: 'Live', date: `${day}T${loc(minute)}`, instrument: 'NQ', dir: rnd() < 0.5 ? 'Long' : 'Short', setup: pick(setups), session: minute < 15 * 60 + 30 ? 'Londyn' : 'Nowy Jork', r, pnl: Math.round(r * 250), konta: [kontaIds[0]] }), `${day}T12:${String(10 + (i % 50)).padStart(2, '0')}:00.000Z`));
  }
  // wpis bez tytułu, jak w prawdziwej bazie
  pages.trades.push(mkPage('trades', randomUUID(), tradeProps({ name: '', typ: 'Backtest', date: '2023-07-11', instrument: 'NQ', dir: 'Long', setup: 'MECH MODEL', r: 1 })));
})();

// pole „Wyjście” istnieje dopiero po dodaniu go do schematu (jak w prawdziwej bazie przed uruchomieniem skryptu)
let withExit = process.env.ATRAPA_BEZ_WYJSCIA ? false : true;
if (withExit) schemas.trades['Wyjście'] = { type: 'date' };
else for (const p of pages.trades) delete p.properties['Wyjście'];

// ---------- magazyn danych (po identyfikatorach źródeł danych) ----------
// Dane startowe powyżej są nazwane logicznie (trades, konta...), a serwer HTTP działa na identyfikatorach, tak jak prawdziwe Notion.
// Dzięki temu atrapa obsługuje też tworzenie baz (POST /v1/databases), zmianę nazw pól i relacje dwustronne.
const PARENT_PAGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const store = new Map(); // dsId -> { name, dbId, schema, pages }
let pidn = 0;
const assignIds = (schema) => { for (const d of Object.values(schema)) if (!d.id) d.id = `pr${(++pidn).toString(36)}x`; };
for (const k of Object.keys(IDS)) { assignIds(schemas[k]); store.set(IDS[k], { name: k, dbId: `db-${k}`, schema: schemas[k], pages: pages[k] }); }
if (process.env.ATRAPA_PUSTA) store.clear(); // pusty obszar roboczy: tylko strona nadrzędna, bazy powstają przez setup.mjs

const violations = []; // operacje, których aktualizacje i migracje nie mogą robić (usuwanie, zmiana typu, usuwanie opcji, zmiana nazwy pola z danymi)
const log = [];
const send = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { try { r(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch { r({}); } }); });
const dsObject = (id) => {
  const ds = store.get(id);
  return { object: 'data_source', id, title: txt(ds.name), parent: { type: 'database_id', database_id: ds.dbId }, properties: Object.fromEntries(Object.entries(ds.schema).map(([k, v]) => [k, { name: k, ...JSON.parse(JSON.stringify(v)) }])) };
};
// strony poza bazami (strona nadrzędna i strony utworzone przez setup.mjs) oraz widoki baz
const loosePages = new Map([[PARENT_PAGE, { object: 'page', id: PARENT_PAGE, url: 'https://www.notion.so/Atrapa-Parent-aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa', parent: { type: 'workspace', workspace: true }, properties: { title: { type: 'title', title: txt('Atrapa: strona nadrzędna') } }, children: [] }]]);
const views = new Map(); // viewId -> { id, database_id, data_source_id, name, type, filter, sorts, configuration }
// bloki treści stron (akapity, nagłówki, toggle z blokiem kodu ustawień): id -> blok; dzieci w polu children
const blocks = new Map();
function mkBlocks(raw, parentId) {
  return (raw || []).map((r) => {
    const { children, object, ...rest } = JSON.parse(JSON.stringify(r)); void object;
    const kids = children || rest[rest.type]?.children || [];
    if (rest[rest.type]) delete rest[rest.type].children;
    const blk = { object: 'block', id: rest.id || randomUUID(), parent: { type: 'block_id', block_id: parentId }, ...rest, has_children: false, children: [] };
    blocks.set(blk.id, blk);
    blk.children = mkBlocks(kids, blk.id);
    blk.has_children = blk.children.length > 0;
    return blk;
  });
}
const strip = (b) => { const { children, ...o } = b; void children; return o; };
// treść użytkownika na stronie nadrzędnej (migracja bloku ustawień nie może jej ruszyć)
loosePages.get(PARENT_PAGE).children.push(...mkBlocks([
  { type: 'heading_2', heading_2: { rich_text: txt('Moje notatki') } },
  { type: 'paragraph', paragraph: { rich_text: txt('Plan na tydzień: tylko A+ setupy.') } },
], PARENT_PAGE));
const UNSUPPORTED_VIEWS = new Set(String(process.env.ATRAPA_VIEWS_BEZ || '').split(',').filter(Boolean)); // typy widoków, których „API nie obsługuje”
const findLoose = (id) => (shared ? [...loosePages.values()].find((p) => sameId(p.id, id)) : null);
let shared = !process.env.ATRAPA_NIEUDOSTEPNIONA; // czy użytkownik dodał integrację do strony nadrzędnej („Connections”)
let failRule = null;
// po cofnięciu udostępnienia (/__test/share {shared:false}) bazy i strony pod stroną nadrzędną są niewidoczne, jak w Notion (404)
const visibleDs = (d) => (d && (shared || !d.parentPage) ? d : null);
const sameId = (a, b) => String(a || '').replace(/-/g, '') === String(b || '').replace(/-/g, '');
const findProp = (schema, key) => { if (schema[key]) return [key, schema[key]]; const e = Object.entries(schema).find(([, d]) => d.id === key); return e || null; };
const hasData = (ds, name) => ds.pages.some((p) => { const v = p.properties[name]; return v && JSON.stringify(v).replace(/"(type|id)":"[^"]*"/g, '').match(/[0-9A-Za-z]/) && !/^\{"\w+":(null|\[\]|"")\}$/.test(JSON.stringify(v).replace(/"type":"\w+",?/, '').replace(/^\{,/, '{')); });

function convertDef(spec, ds, propName, title) {
  const type = Object.keys(spec).find((k) => !['name', 'description'].includes(k));
  const def = { type };
  if (type === 'select' || type === 'multi_select') def[type] = { options: (spec[type]?.options || []).map((o, i) => ({ name: o.name, color: o.color || 'default', id: `o${i}` })) };
  else if (type === 'relation') {
    const targetId = spec.relation?.data_source_id;
    const target = store.get(targetId);
    if (!target) return { error: 'relation target data source not found' };
    def.relation = { data_source_id: targetId, type: spec.relation.type || 'single_property' };
    if (spec.relation.dual_property || def.relation.type === 'dual_property') {
      def.relation.type = 'dual_property';
      const synced = { id: `pr${(++pidn).toString(36)}x`, type: 'relation', relation: { data_source_id: ds.id, type: 'dual_property', dual_property: { synced_property_id: null, synced_property_name: propName } } };
      let name = `Related to ${title} (${propName})`;
      while (target.schema[name]) name += '_';
      target.schema[name] = synced;
      def.relation.dual_property = { synced_property_id: synced.id, synced_property_name: name };
    } else def.relation.single_property = {};
  } else if (type === 'number') def.number = { format: spec.number?.format || 'number' };
  else if (type === 'formula') {
    if (!spec.formula?.expression) return { error: 'formula.expression is required' };
    // jak prawdziwe API (sprawdzone 26.10.2026): map(current.prop(...)) po relacji daje „Type error with formula”
    if (/\.map\(\s*(toNumber\()?current\.prop/.test(spec.formula.expression)) return { error: 'Type error with formula' };
    for (const m of spec.formula.expression.matchAll(/prop\("((?:[^"\\]|\\.)*)"\)/g)) if (!ds.schema[m[1].replace(/\\"/g, '"')]) return { error: `Formula references unknown property ${m[1]}` };
    def.formula = { expression: spec.formula.expression };
  } else if (type === 'rollup') {
    const r = spec.rollup || {};
    const rel = ds.schema[r.relation_property_name];
    const target = rel?.relation?.data_source_id && store.get(rel.relation.data_source_id);
    if (!rel || rel.type !== 'relation' || !target?.schema[r.rollup_property_name]) return { error: 'rollup: relation or target property not found' };
    def.rollup = { relation_property_name: r.relation_property_name, rollup_property_name: r.rollup_property_name, function: r.function || 'sum' };
  }
  else def[type] = {};
  return { def };
}

function applyProps(ds, page, props) {
  const schema = ds.schema;
  for (const [key, v] of Object.entries(props || {})) {
    const hit = findProp(schema, key); // jak w Notion: klucz to nazwa albo identyfikator pola
    if (!hit) return `Property "${key}" does not exist`;
    const [name, def] = hit;
    const t = def.type;
    if (t === 'formula' || t === 'rollup') return `Property "${name}" is a ${t} and cannot be set.`;
    const colorOf = (n) => def[t]?.options?.find((o) => o.name === n)?.color || 'default';
    if (t === 'title') page.properties[name] = { type: 'title', title: txt((v.title || []).map((x) => x.text.content).join('')) };
    else if (t === 'rich_text') page.properties[name] = { type: 'rich_text', rich_text: txt((v.rich_text || []).map((x) => x.text.content).join('')) };
    else if (t === 'select') {
      if (v.select && !def.select.options.some((o) => o.name === v.select.name)) def.select.options.push({ name: v.select.name, color: 'default' }); // jak prawdziwe Notion: tworzy opcję
      page.properties[name] = v.select ? { type: 'select', select: { name: v.select.name, color: colorOf(v.select.name) } } : { type: 'select', select: null };
    } else if (t === 'multi_select') {
      for (const x of v.multi_select) if (!def.multi_select.options.some((o) => o.name === x.name)) def.multi_select.options.push({ name: x.name, color: 'default' });
      page.properties[name] = { type: 'multi_select', multi_select: v.multi_select.map((x) => ({ name: x.name, color: colorOf(x.name) })) };
    } else if (t === 'number') page.properties[name] = { type: 'number', number: v.number };
    else if (t === 'checkbox') page.properties[name] = { type: 'checkbox', checkbox: !!v.checkbox };
    else if (t === 'url') page.properties[name] = { type: 'url', url: v.url };
    else if (t === 'relation') page.properties[name] = { type: 'relation', relation: v.relation };
    else if (t === 'date') {
      if (!v.date) page.properties[name] = { type: 'date', date: null };
      else {
        const s = v.date.start;
        if (s.length > 10 && !/[zZ]|[+-]\d\d:\d\d$/.test(s) && !v.date.time_zone) return 'time_zone required for datetime without offset';
        page.properties[name] = { type: 'date', date: s.length <= 10 ? { start: s, end: null, time_zone: null } : dateValue(s.slice(0, 16), v.date.time_zone) };
      }
    }
  }
  return null;
}
const newPage = (ds, props, created) => {
  const t = created || stamp(new Date());
  const id = randomUUID();
  return { object: 'page', id, created_time: t, last_edited_time: t, archived: false, in_trash: false, url: `https://www.notion.so/${id.replace(/-/g, '')}`, parent: { type: 'data_source_id', data_source_id: ds.id }, properties: props };
};
const resolveDs = (key) => { if (store.has(key)) return [key, store.get(key)]; const hit = [...store.entries()].find(([, d]) => d.name === key); return hit || [null, null]; };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  log.push(`${req.method} ${p}`);
  // wstrzyknięta awaria (test wznawiania instalacji): POST /__test/fail { match, after, status }
  if (failRule && !p.startsWith('/__test/') && `${req.method} ${p}`.includes(failRule.match)) {
    if (failRule.after-- <= 0) { const st = failRule.status || 500; failRule = null; return send(res, st, { object: 'error', code: 'internal_server_error', message: 'Atrapa: wstrzyknięta awaria' }); }
  }
  if (!/^Bearer .+/.test(req.headers.authorization || '')) return send(res, 401, { message: 'API token is invalid.' });
  // ATRAPA_TOKEN: atrapa przyjmuje tylko ten token (test wygasłego lub błędnego tokenu); /__test/* działa zawsze
  if (process.env.ATRAPA_TOKEN && !p.startsWith('/__test/') && req.headers.authorization !== `Bearer ${process.env.ATRAPA_TOKEN}`) return send(res, 401, { object: 'error', code: 'unauthorized', message: 'API token is invalid.' });
  let m;
  if (p === '/__test/log') return send(res, 200, log);
  if (p === '/__test/violations') return send(res, 200, violations);
  if (p === '/__test/dump') return send(res, 200, Object.fromEntries([...store.entries()].map(([id, d]) => [id, { name: d.name, dbId: d.dbId, schema: d.schema, pages: d.pages }])));
  if (p === '/__test/views') return send(res, 200, [...views.values()]);
  if (p === '/__test/duplicate' && req.method === 'POST') {
    // „Duplicate” w Notion (np. szablonu): kopia strony z bazami, nowe identyfikatory baz, stron i relacji, te same nazwy
    const b = await body(req);
    const src = findLoose(b.pageId);
    if (!src) return send(res, 404, { message: 'brak strony' });
    const newPageId = randomUUID();
    const dsMap = new Map(), pageMap = new Map();
    const srcDs = [...store.entries()].filter(([, d]) => d.parentPage && sameId(d.parentPage, src.id));
    for (const [id] of srcDs) dsMap.set(id, randomUUID());
    for (const [, d] of srcDs) for (const pg of d.pages) pageMap.set(pg.id, randomUUID());
    const remap = (o) => JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' ? dsMap.get(v) || pageMap.get(v) || v : v));
    const children = [];
    for (const [id, d] of srcDs) {
      const nd = { ...remap({ ...d, pages: [] }), id: dsMap.get(id), dbId: randomUUID(), parentPage: newPageId };
      nd.pages = d.pages.map((pg) => ({ ...remap(pg), id: pageMap.get(pg.id), parent: { type: 'data_source_id', data_source_id: dsMap.get(id) } }));
      store.set(nd.id, nd);
      children.push(...mkBlocks([{ id: nd.dbId, type: 'child_database', child_database: { title: nd.name } }], newPageId));
      for (const v of [...views.values()].filter((x) => x.data_source_id === id)) { const vid = randomUUID(); views.set(vid, { ...remap(v), id: vid, data_source_id: nd.id, parent: { type: 'database_id', database_id: nd.dbId } }); }
    }
    const other = mkBlocks(src.children.filter((c) => c.type !== 'child_database').map(function clone(c) { const { id, children, parent, has_children, ...o } = c; void id; void parent; void has_children; return { ...o, children: (children || []).map(clone) }; }), newPageId);
    loosePages.set(newPageId, { ...JSON.parse(JSON.stringify({ ...src, children: [] })), id: newPageId, url: `https://www.notion.so/Kopia-${newPageId.replace(/-/g, '')}`, parent: { type: 'page_id', page_id: PARENT_PAGE }, children: [...other, ...children] });
    return send(res, 200, { id: newPageId, dsIds: Object.fromEntries([...dsMap.entries()]) });
  }
  if (p === '/__test/fail' && req.method === 'POST') { failRule = await body(req); return send(res, 200, { ok: true }); }
  if (p === '/__test/share' && req.method === 'POST') { const b = await body(req); shared = b.shared !== false; return send(res, 200, { ok: true, shared }); }
  if (p === '/__test/loose') return send(res, 200, [...loosePages.values()]);
  if (p === '/__test/writes') return send(res, 200, log.filter((l) => !/^GET /.test(l) && !/\/query$/.test(l) && l !== 'POST /v1/search' && !l.includes('/__test/')));
  if (p === '/__test/pages') { const [, ds] = resolveDs(url.searchParams.get('ds') || 'trades'); return send(res, 200, (ds?.pages || []).map((x) => ({ id: x.id, p: x.properties, edited: x.last_edited_time }))); }
  if (p === '/__test/schema') { const [, ds] = resolveDs(url.searchParams.get('ds') || 'trades'); return send(res, 200, ds?.schema || {}); }
  if (p === '/__test/rename-prop' && req.method === 'POST') {
    // użytkownik zmienia nazwę pola w Notion (identyfikator pola zostaje): { ds, from, to }
    const b = await body(req);
    const [, ds] = resolveDs(b.ds);
    if (!ds?.schema[b.from]) return send(res, 404, { message: 'brak pola' });
    ds.schema[b.to] = ds.schema[b.from]; delete ds.schema[b.from];
    for (const pg of ds.pages) if (b.from in pg.properties) { pg.properties[b.to] = pg.properties[b.from]; delete pg.properties[b.from]; }
    return send(res, 200, { ok: true });
  }
  if (p === '/__test/notion-edit' && req.method === 'POST') {
    // symuluje zmianę zrobioną w Notion: { id, set: { R: 2.5 } }
    const b = await body(req);
    const ds = [...store.values()].find((d) => d.pages.some((x) => x.id === b.id));
    const page = ds && ds.pages.find((x) => x.id === b.id);
    if (!page) return send(res, 404, { message: 'brak' });
    for (const [k, v] of Object.entries(b.set || {})) page.properties[k] = { type: ds.schema[k].type, ...(ds.schema[k].type === 'number' ? { number: v } : ds.schema[k].type === 'rich_text' ? { rich_text: txt(v) } : {}) };
    page.last_edited_time = stamp(new Date(Date.parse(page.last_edited_time) + 60000));
    return send(res, 200, { ok: true });
  }
  // ---------- Notion API ----------
  if (p === '/v1/databases' && req.method === 'POST') {
    const b = await body(req);
    if (!findLoose(b.parent?.page_id)) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find page with ID. Make sure the relevant pages and databases are shared with your integration.' });
    const title = (b.title || []).map((x) => x.text?.content || '').join('');
    const dsId = randomUUID(), dbId = randomUUID();
    const ds = { id: dsId, name: title, dbId, parentPage: findLoose(b.parent.page_id).id, schema: {}, pages: [] };
    store.set(dsId, ds);
    for (const [name, spec] of Object.entries(b.initial_data_source?.properties || {})) {
      const { def, error } = convertDef(spec, ds, name, title);
      if (error) { store.delete(dsId); return send(res, 400, { message: error }); }
      def.id = `pr${(++pidn).toString(36)}x`;
      ds.schema[name] = def;
      if (def.type === 'relation' && def.relation.dual_property) { const t = store.get(def.relation.data_source_id); const sp = Object.values(t.schema).find((d) => d.id === def.relation.dual_property.synced_property_id); sp.relation.dual_property.synced_property_id = def.id; }
    }
    if (![...Object.values(ds.schema)].some((d) => d.type === 'title')) { store.delete(dsId); return send(res, 400, { message: 'A database must have a title property' }); }
    findLoose(b.parent.page_id).children.push(...mkBlocks([{ id: dbId, type: 'child_database', child_database: { title } }], b.parent.page_id));
    const dv = randomUUID(); // jak w Notion: nowa baza ma widok domyślny
    views.set(dv, { object: 'view', id: dv, parent: { type: 'database_id', database_id: dbId }, data_source_id: dsId, name: 'Default view', type: 'table', filter: null, sorts: null, configuration: null });
    const out = { object: 'database', id: dbId, url: `https://www.notion.so/${dbId.replace(/-/g, '')}`, title: b.title };
    if (!process.env.ATRAPA_BEZ_DS_W_ODPOWIEDZI) out.data_sources = [{ id: dsId, name: title }];
    return send(res, 200, out);
  }
  if ((m = p.match(/^\/v1\/databases\/([0-9a-f-]{36})$/)) && req.method === 'GET') {
    const ds = visibleDs([...store.values()].find((d) => d.dbId === m[1]));
    if (!ds) return send(res, 404, { message: 'Could not find database' });
    return send(res, 200, { object: 'database', id: ds.dbId, parent: ds.parentPage ? { type: 'page_id', page_id: ds.parentPage } : { type: 'workspace', workspace: true }, data_sources: [{ id: ds.id, name: ds.name }] });
  }
  if ((m = p.match(/^\/v1\/data_sources\/([0-9a-f-]{36})(\/query)?$/))) {
    const ds = visibleDs(store.get(m[1]));
    if (!ds) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find data source' });
    if (m[2] && req.method === 'POST') {
      const b = await body(req);
      const start = Number(b.start_cursor || 0), size = b.page_size || 100;
      const live = ds.pages.filter((x) => !x.in_trash && !x.archived); // jak w Notion: zapytanie pomija strony w koszu
      return send(res, 200, { results: live.slice(start, start + size), has_more: start + size < live.length, next_cursor: String(start + size) });
    }
    if (req.method === 'GET') return send(res, 200, dsObject(m[1]));
    if (req.method === 'PATCH') {
      const b = await body(req);
      for (const [key, v] of Object.entries(b.properties || {})) {
        const hit = findProp(ds.schema, key);
        if (v === null) { violations.push({ kind: 'delete', ds: ds.name, prop: key }); return send(res, 400, { message: 'Atrapa: usuwanie pól jest zabronione w aktualizacjach i migracjach' }); }
        if (hit) {
          const [name, def] = hit;
          if (v.name && v.name !== name) {
            if (hasData(ds, name)) { violations.push({ kind: 'rename', ds: ds.name, prop: name, to: v.name }); return send(res, 400, { message: 'Atrapa: zmiana nazwy pola z danymi jest zabroniona' }); }
            ds.schema[v.name] = def; delete ds.schema[name];
            for (const pg of ds.pages) if (name in pg.properties) { pg.properties[v.name] = pg.properties[name]; delete pg.properties[name]; }
          }
          const typeKey = Object.keys(v).find((k) => !['name', 'description'].includes(k));
          if (typeKey && typeKey !== def.type) { violations.push({ kind: 'type-change', ds: ds.name, prop: name, to: typeKey }); return send(res, 400, { message: 'Atrapa: zmiana typu pola jest zabroniona' }); }
          if (typeKey === 'select' || typeKey === 'multi_select') {
            const next = (v[typeKey].options || []);
            const removed = def[typeKey].options.filter((o) => !next.some((n) => n.name === o.name));
            if (removed.length) { violations.push({ kind: 'option-removed', ds: ds.name, prop: name, options: removed.map((o) => o.name) }); return send(res, 400, { message: 'Atrapa: usuwanie opcji jest zabronione (wyślij pełną listę opcji)' }); }
            def[typeKey].options = next.map((o, i) => ({ name: o.name, color: o.color || def[typeKey].options.find((x) => x.name === o.name)?.color || 'default', id: `o${i}` }));
          }
        } else {
          const { def, error } = convertDef(v, ds, key, ds.name);
          if (error) return send(res, 400, { message: error });
          def.id = `pr${(++pidn).toString(36)}x`;
          ds.schema[key] = def;
          if (def.type === 'relation' && def.relation.dual_property) { const t = store.get(def.relation.data_source_id); const sp = Object.values(t.schema).find((d) => d.id === def.relation.dual_property.synced_property_id); sp.relation.dual_property.synced_property_id = def.id; }
        }
      }
      return send(res, 200, dsObject(m[1]));
    }
  }
  if (p === '/v1/pages' && req.method === 'POST') {
    const b = await body(req);
    if (b.parent?.page_id) {
      const parent = findLoose(b.parent.page_id);
      if (!parent) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find page with ID. Make sure the relevant pages and databases are shared with your integration.' });
      const id = randomUUID();
      const title = (b.properties?.title?.title || []).map((x) => x.text?.content || '').join('');
      const pg = { object: 'page', id, created_time: stamp(new Date()), last_edited_time: stamp(new Date()), archived: false, in_trash: false, url: `https://www.notion.so/${title.replace(/\W+/g, '-')}-${id.replace(/-/g, '')}`, parent: { type: 'page_id', page_id: parent.id }, icon: b.icon || null, properties: { title: { id: 'title', type: 'title', title: txt(title) } }, children: [] };
      pg.children = mkBlocks(b.children || [], id);
      loosePages.set(id, pg);
      parent.children.push(...mkBlocks([{ id, type: 'child_page', child_page: { title } }], parent.id));
      return send(res, 200, pg);
    }
    const ds = visibleDs(store.get(b.parent?.data_source_id));
    if (!ds) return send(res, 400, { message: 'Atrapa: nieznany parent' });
    const page = newPage(ds, {});
    const bad = applyProps(ds, page, b.properties);
    if (bad) return send(res, 400, { message: bad });
    ds.pages.push(page);
    return send(res, 200, page);
  }
  if ((m = p.match(/^\/v1\/pages\/([0-9a-f-]{36})$/))) {
    const loose = findLoose(m[1]);
    if (loose) { const { children, ...pg } = loose; void children; return send(res, 200, pg); }
    const ds = visibleDs([...store.values()].find((d) => d.pages.some((x) => x.id === m[1])));
    const page = ds && ds.pages.find((x) => x.id === m[1]);
    if (!page) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find page' });
    if (req.method === 'GET') return send(res, 200, page);
    if (req.method === 'PATCH') {
      const b = await body(req);
      if (typeof b.in_trash === 'boolean') { page.in_trash = b.in_trash; page.archived = b.in_trash; }
      if (typeof b.archived === 'boolean') { page.archived = b.archived; page.in_trash = b.archived; }
      const bad = applyProps(ds, page, b.properties);
      if (bad) return send(res, 400, { message: bad });
      page.last_edited_time = stamp(new Date(Math.max(Date.now(), Date.parse(page.last_edited_time) + 60000)));
      return send(res, 200, page);
    }
  }
  if (p === '/v1/users/me' && req.method === 'GET') return send(res, 200, { object: 'user', id: 'bot-atrapa', type: 'bot', name: 'Atrapa', bot: { owner: { type: 'workspace', workspace: true }, workspace_name: 'Atrapa Workspace' } });
  if (p === '/v1/search' && req.method === 'POST') {
    // strony i źródła danych widoczne dla integracji: strona nadrzędna tylko po udostępnieniu (/__test/share), wszystko pod nią też
    const b = await body(req);
    const kind = b.filter?.value;
    const visiblePage = () => shared; // w atrapie wszystko leży pod stroną nadrzędną
    let results = [];
    if (!kind || kind === 'page') {
      results.push(...[...loosePages.values()].filter(visiblePage).map(({ children, ...pg }) => (void children, pg)));
      for (const d of store.values()) if (shared || !d.parentPage) results.push(...d.pages.filter((x) => !x.in_trash));
    }
    if (!kind || kind === 'data_source') {
      for (const [id, d] of store.entries()) if (shared || !d.parentPage) results.push({ ...dsObject(id), database_parent: d.parentPage ? { type: 'page_id', page_id: d.parentPage } : { type: 'workspace', workspace: true } });
    }
    const q = String(b.query || '').toLowerCase();
    if (q) results = results.filter((r) => JSON.stringify(r.title || r.properties?.title || '').toLowerCase().includes(q));
    const start = Number(b.start_cursor || 0), size = b.page_size || 100;
    return send(res, 200, { object: 'list', results: results.slice(start, start + size), has_more: start + size < results.length, next_cursor: start + size < results.length ? String(start + size) : null });
  }
  if ((m = p.match(/^\/v1\/blocks\/([0-9a-f-]{36})\/children$/)) && req.method === 'PATCH') {
    const parent = findLoose(m[1]) || (shared ? blocks.get(m[1]) : null);
    if (!parent) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find block' });
    const b = await body(req);
    const made = mkBlocks(b.children || [], parent.id);
    parent.children.push(...made);
    if (parent.object === 'block') parent.has_children = true;
    return send(res, 200, { object: 'list', results: made.map(strip) });
  }
  if ((m = p.match(/^\/v1\/blocks\/([0-9a-f-]{36})\/children$/)) && req.method === 'GET') {
    const parent = findLoose(m[1]) || (shared ? blocks.get(m[1]) : null);
    if (!parent) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find block' });
    return send(res, 200, { object: 'list', results: parent.children.map(strip), has_more: false, next_cursor: null });
  }
  if ((m = p.match(/^\/v1\/blocks\/([0-9a-f-]{36})$/)) && req.method === 'PATCH') {
    const blk = shared ? blocks.get(m[1]) : null;
    if (!blk) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find block' });
    const b = await body(req);
    if (b[blk.type]) { const { children, ...rest } = b[blk.type]; void children; blk[blk.type] = { ...blk[blk.type], ...rest }; }
    blk.last_edited_time = new Date().toISOString();
    return send(res, 200, strip(blk));
  }
  if (p === '/v1/views' && req.method === 'POST') {
    const b = await body(req);
    const ds = store.get(b.data_source_id);
    const VIEW_TYPES = ['table', 'board', 'list', 'calendar', 'timeline', 'gallery', 'form', 'chart', 'map', 'dashboard'];
    if (!ds || !sameId(ds.dbId, b.database_id)) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find database' });
    if (!b.name || !VIEW_TYPES.includes(b.type)) return send(res, 400, { object: 'error', code: 'validation_error', message: 'body.type should be a valid view type' });
    if (UNSUPPORTED_VIEWS.has(b.type)) return send(res, 400, { object: 'error', code: 'validation_error', message: `View type ${b.type} is not supported` });
    if (b.configuration && b.configuration.type !== b.type) return send(res, 400, { object: 'error', code: 'validation_error', message: 'configuration.type must match type' });
    const propIds = new Set(Object.values(ds.schema).map((d) => d.id));
    const cfg = b.configuration || {};
    for (const k of ['date_property_id']) if (cfg[k] && !propIds.has(cfg[k])) return send(res, 400, { message: `${k} not found` });
    if (cfg.cover?.property_id && !propIds.has(cfg.cover.property_id)) return send(res, 400, { message: 'cover property not found' });
    if (b.filter?.property && !findProp(ds.schema, b.filter.property)) return send(res, 400, { message: `filter property ${b.filter.property} not found` });
    for (const s of b.sorts || []) if (!findProp(ds.schema, s.property)) return send(res, 400, { message: `sort property ${s.property} not found` });
    const id = randomUUID();
    const v = { object: 'view', id, parent: { type: 'database_id', database_id: ds.dbId }, data_source_id: ds.id, name: b.name, type: b.type, filter: b.filter || null, sorts: b.sorts || null, configuration: b.configuration || null };
    views.set(id, v);
    return send(res, 200, v);
  }
  if (p === '/v1/views' && req.method === 'GET') {
    const dbId = url.searchParams.get('database_id');
    if (!dbId) return send(res, 400, { message: 'database_id is required' });
    if (![...store.values()].some((d) => sameId(d.dbId, dbId))) return send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find database' });
    return send(res, 200, { object: 'list', results: [...views.values()].filter((v) => sameId(v.parent.database_id, dbId)).map((v) => ({ object: 'view', id: v.id })), has_more: false, next_cursor: null, type: 'view', view: {} });
  }
  if ((m = p.match(/^\/v1\/views\/([0-9a-f-]{36})$/)) && req.method === 'GET') {
    const v = views.get(m[1]);
    return v ? send(res, 200, v) : send(res, 404, { object: 'error', code: 'object_not_found', message: 'Could not find view' });
  }
  send(res, 404, { message: 'Atrapa: nieobsługiwane ' + req.method + ' ' + p });
}).listen(PORT, '127.0.0.1', () => console.log(`Atrapa Notion: http://127.0.0.1:${PORT} (pole Wyjście: ${withExit ? 'jest' : 'brak'}${process.env.ATRAPA_PUSTA ? ', pusty obszar roboczy' : ''})`));
