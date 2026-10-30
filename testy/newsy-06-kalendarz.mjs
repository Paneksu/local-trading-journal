// newsy-06: zakładka Kalendarz (1.4.0): zakres dnia, tygodnia i miesiąca, filtry, grupowanie po dniach w strefie z Ustawień, wiersze i znaczniki, linia „teraz”,
// wyszukiwanie po stronie serwera (GET /api/news/search, /api/earnings/search), wersja kompaktowa kart w lewym panelu. Nazwy zdarzeń w atrapach wymyślone.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const ev = (t, name, imp, o = {}) => ({ t, day: new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10), name, imp, kind: 'data', allDay: false, tentative: false, src: 'off', basis: 'rule', ...o });
  const earn = (t, symbol, cls, session, o = {}) => ({ t, day: new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10), symbol, name: symbol + ' Corp', cls, session, allDay: false, src: 'edgar', ...o });

  test('newsy-06: zakres: dzień, tydzień od poniedziałku, miesiąc kalendarzowy; przesuwanie o miesiąc z końcem miesiąca; granice 2010 i +400 dni', async () => {
    const C = await lib('public/js/kalendarz.js');
    assert.deepEqual(C.calRange('day', '2026-10-29'), { from: '2026-10-29', to: '2026-10-29', keys: ['2026-10-29'] });
    const w = C.calRange('week', '2026-10-29'); // czwartek
    assert.deepEqual([w.from, w.to, w.keys.length], ['2026-10-26', '2026-11-01', 7]);
    assert.deepEqual([C.calRange('week', '2026-11-01').from, C.calRange('week', '2026-10-26').from], ['2026-10-26', '2026-10-26'], 'niedziela należy do tygodnia od poniedziałku');
    const m = C.calRange('month', '2026-02-10');
    assert.deepEqual([m.from, m.to, m.keys.length], ['2026-02-01', '2026-02-28', 28]);
    assert.equal(C.calRange('month', '2028-02-10').keys.length, 29, 'rok przestępny');
    assert.equal(C.shiftAnchor('month', '2026-01-31', 1), '2026-02-28', 'koniec miesiąca nie przeskakuje');
    assert.equal(C.shiftAnchor('month', '2026-01-15', -1), '2025-12-15');
    assert.equal(C.shiftAnchor('week', '2026-10-29', -1), '2026-10-22');
    assert.equal(C.shiftAnchor('day', '2026-12-31', 1), '2027-01-01');
    assert.equal(C.clampDay('2009-05-01', '2026-10-29'), '2010-01-01');
    assert.equal(C.clampDay('2031-05-01', '2026-10-29'), '2027-12-03', 'ogłoszona przyszłość do 400 dni');
    assert.equal(C.clampDay('2026-05-01', '2026-10-29'), '2026-05-01');
    assert.match(C.rangeLabel('month', C.calRange('month', '2026-10-10')), /październik 2026/);
  });

  test('newsy-06: początek doby w strefie: lato, zima, dzień zmiany czasu (23 i 25 godzin) i brak zmiany w UTC', async () => {
    const C = await lib('public/js/kalendarz.js');
    assert.equal(C.dayStart('2026-07-01', 'Europe/Warsaw'), utc(2026, 6, 30, 22), 'CEST: północ = 22:00 UTC poprzedniego dnia');
    assert.equal(C.dayStart('2026-12-01', 'Europe/Warsaw'), utc(2026, 11, 30, 23), 'CET');
    assert.equal(C.dayStart('2026-10-26', 'Europe/Warsaw') - C.dayStart('2026-10-25', 'Europe/Warsaw'), 25 * 3600, '25.10.2026 (koniec czasu letniego) ma 25 godzin');
    assert.equal(C.dayStart('2026-03-30', 'Europe/Warsaw') - C.dayStart('2026-03-29', 'Europe/Warsaw'), 23 * 3600, '29.03.2026 ma 23 godziny');
    assert.equal(C.dayStart('2026-10-25', 'UTC'), utc(2026, 10, 25));
    assert.equal(C.dayKeyOf(utc(2026, 10, 29, 23, 30), 'Europe/Warsaw'), '2026-10-30', '23:30 UTC to już następny dzień w Warszawie');
    assert.equal(C.dayKeyOf(utc(2026, 10, 29, 23, 30), 'America/New_York'), '2026-10-29');
  });

  test('newsy-06: filtry kalendarza: wagi, rodzaje, earningsy z klasami; normalizacja stanu (zła wartość = domyślna)', async () => {
    const C = await lib('public/js/kalendarz.js');
    const d = C.calDefaults();
    assert.deepEqual([d.mode, d.imp.low, d.earn.on, d.earn.cls[1], d.earn.cls[3]], ['week', true, true, true, false]);
    const bad = C.normCal({ mode: 'rok', imp: { high: 'x', low: false, purple: true }, kind: [], earn: { on: 1, cls: { 4: true } } });
    assert.deepEqual([bad.mode, bad.imp.high, bad.imp.low, 'purple' in bad.imp, bad.kind.data, bad.earn.on, bad.earn.cls[4], bad.earn.cls[1]], ['week', true, false, false, true, true, true, true]);
    const st = C.normCal({ imp: { high: true, medium: false, low: false, holiday: false, opex: false }, kind: { data: true, fomc: false, speech: true, holiday: true, opex: true }, earn: { on: true, cls: { 1: true, 2: false, 3: false, 4: false } } });
    const news = [ev(1, 'A', 'high'), ev(2, 'B', 'medium'), ev(3, 'C', 'high', { kind: 'fomc' }), ev(4, 'D', 'high', { kind: 'speech' })];
    const es = [earn(5, 'NVDA', 1, 'amc'), earn(6, 'JPM', 2, 'bmo')];
    const f = C.filterCal(news, es, st);
    assert.deepEqual([f.news.map((e) => e.name), f.earn.map((e) => e.symbol)], [['A', 'D'], ['NVDA']]);
    assert.deepEqual(C.filterCal(news, es, { ...st, earn: { ...st.earn, on: false } }).earn, [], 'earningsy wyłączone');
  });

  test('newsy-06: grupowanie po dniach w strefie: doba lokalna, całodzienne po dniu ET, kolejność, earningsy w tej samej tabeli, dzień „dziś” z linią „teraz”', async () => {
    const C = await lib('public/js/kalendarz.js');
    const tz = 'Europe/Warsaw', now = utc(2026, 10, 29, 14, 0);
    const keys = C.calRange('week', '2026-10-29').keys;
    const news = [
      ev(utc(2026, 10, 29, 12, 30), 'Past Index', 'high'), ev(utc(2026, 10, 29, 12, 30), 'Past Minor', 'low'), ev(utc(2026, 10, 29, 15, 30), 'Later Index', 'medium', { tentative: true }),
      ev(utc(2026, 10, 29, 23, 30), 'Late Night', 'high'), // 30.10 00:30 w Warszawie
      ev(utc(2026, 10, 29, 4), 'Monthly OPEX', 'opex', { kind: 'opex', allDay: true, day: '2026-10-29', variant: 'monthly' }),
      ev(utc(2026, 11, 20, 5), 'Poza tygodniem', 'high'),
    ];
    const es = [earn(utc(2026, 10, 29, 20), 'AAPL', 1, 'amc', { quarter: 4, year: 2026, epsEst: 1.5 }), earn(utc(2026, 10, 30, 12, 30), 'XOM', 2, 'bmo', { src: 'finnhub' })];
    const days = C.buildDays({ news, earn: es, tz, nowSec: now, keys });
    assert.deepEqual(days.map((d) => d.day), ['2026-10-29', '2026-10-30'], 'dni bez wydarzeń i spoza zakresu odpadają');
    const d29 = days[0];
    assert.equal(d29.today, true);
    assert.deepEqual(d29.rows.map((r) => r.name), ['OPEX miesięczny', 'Past Index', 'Past Minor', 'Later Index', 'AAPL'], 'całodzienne pierwsze, potem godziny i waga w obrębie godziny, earning po newsach w kolejności czasu');
    assert.deepEqual(d29.rows.map((r) => r.past), [false, true, true, false, false], 'minione: godzinowe sprzed teraz; całodzienne dzisiaj nie są minione');
    assert.equal(d29.nowAt, 3, 'linia „teraz” przed pierwszym nieminionym wierszem godzinowym');
    assert.deepEqual(days[1].rows.map((r) => r.name), ['Late Night', 'XOM'], '23:30 UTC jest już 30.10 w Warszawie');
    assert.deepEqual(days[1].rows[1].tags.includes('termin przybliżony'), true, 'earning z kalendarza Finnhub ma znacznik przybliżonego terminu');
    assert.deepEqual(d29.rows[3].tags, ['godzina niepewna']);
    const aapl = d29.rows[4];
    assert.ok(aapl.tags.includes('Q4 2026') && aapl.tags.some((x) => /szac\. EPS 1,5/.test(x)) && aapl.tags.includes('klasa 1'));
    // wszystko minęło: linia „teraz” na końcu dnia
    const late = C.buildDays({ news: [ev(utc(2026, 10, 29, 10), 'Early', 'high')], earn: [], tz, nowSec: now, keys });
    assert.equal(late[0].nowAt, 1);
    // dzisiaj bez wydarzeń pokazuje się mimo to (alwaysShow)
    assert.deepEqual(C.buildDays({ news: [], earn: [], tz, nowSec: now, keys, alwaysShow: ['2026-10-29'] }).map((d) => [d.day, d.rows.length]), [['2026-10-29', 0]]);
    // inna strefa: ten sam news ląduje w innym dniu
    assert.equal(C.buildDays({ news: [ev(utc(2026, 10, 29, 23, 30), 'Late Night', 'high')], tz: 'America/New_York', nowSec: now, keys })[0].day, '2026-10-29');
  });

  test('newsy-06: wiersze HTML: waga słowem dla czytnika ekranu, znaczniki, escapowanie nazw, earning z porą i EPS, minione z klasą past, linia „teraz”, przycisk trade\'ów dnia', async () => {
    const C = await lib('public/js/kalendarz.js');
    const tz = 'UTC', now = utc(2026, 10, 29, 14, 0);
    const days = C.buildDays({ news: [ev(utc(2026, 10, 29, 12, 30), 'Past <b>Index</b>', 'high'), ev(utc(2026, 10, 29, 15), 'Tent', 'medium', { tentative: true }), ev(utc(2026, 10, 29, 4), 'Bank Holiday', 'holiday', { kind: 'holiday', allDay: true, day: '2026-10-29' })],
      earn: [earn(utc(2026, 10, 29, 20), 'AAPL', 1, 'amc'), earn(utc(2026, 10, 29, 20), 'GE', 2, 'unknown', { allDay: true, src: 'finnhub', t: utc(2026, 10, 29, 4) })], tz, nowSec: now, keys: ['2026-10-29'] });
    const html = C.dayHtml(days[0], { tz, nowSec: now, trades: 2 });
    assert.ok(!html.includes('<b>Index</b>') && html.includes('&lt;b&gt;Index'), 'nazwa z feedu jest escapowana');
    assert.match(html, /<span class="sr">czerwony<\/span>/);
    assert.match(html, /<span class="sr">klasa 1<\/span>/);
    assert.match(html, /<tr class="cal-r past">/);
    assert.match(html, /cal-now/);
    assert.match(html, /godzina niepewna/);
    assert.match(html, /bez pory/);
    assert.match(html, /cały dzień/);
    assert.match(html, /<td class="cal-k">Wyniki<\/td>/);
    assert.match(html, /data-cal-trades="2026-10-29"/);
    assert.match(html, /<h3 class="cal-dh"><span>[^<]*<\/span><em>dziś<\/em>/);
    assert.match(C.dayHtml({ day: '2026-10-28', today: false, rows: [], nowAt: -1 }, { tz, nowSec: now }), /Brak wydarzeń w tym dniu/);
    const res = C.searchHtml({ up: { rows: [], total: 0 }, past: { rows: days[0].rows, total: 250, more: true } }, { tz });
    assert.match(res, /Znaleziono 250 wyników/);
    assert.match(res, /pokazuję 5/);
    assert.match(res, /data-cal-more="1"/);
    assert.match(res, /data-cal-go="2026-10-29"/);
    assert.match(C.searchHtml({ up: { rows: [], total: 0 }, past: { rows: [], total: 0, more: false } }, { tz }), /Nic nie znaleziono/);
  });

  test('newsy-06: kontroler: stan (tryb i filtry) zapisany lokalnie i odczytany, goTo ustawia dzień i tryb, uszkodzony zapis wraca do domyślnych', async () => {
    const C = await lib('public/js/kalendarz.js');
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const a = C.createCalendar({ storage, getTz: () => 'UTC', now: () => Date.UTC(2026, 9, 29, 12) });
    assert.equal(a.anchor(), '2026-10-29');
    assert.equal(a.state().mode, 'week');
    a.goTo('2026-11-06', 'day');
    assert.deepEqual([a.anchor(), a.state().mode], ['2026-11-06', 'day']);
    mem.set(C.CAL_KEY, JSON.stringify({ mode: 'month', imp: { low: false } }));
    const b = C.createCalendar({ storage, getTz: () => 'UTC', now: () => Date.UTC(2026, 9, 29, 12) });
    assert.deepEqual([b.state().mode, b.state().imp.low, b.state().imp.high], ['month', false, true]);
    mem.set(C.CAL_KEY, '{zepsute');
    assert.equal(C.createCalendar({ storage, getTz: () => 'UTC' }).state().mode, 'week');
    b.goTo('2009-01-01'); assert.equal(b.anchor(), '2010-01-01', 'przed 2010 nie ma danych');
  });

  test('newsy-06: wyszukiwanie (czyste): bez wielkości liter i polskich znaków, najnowsze pierwsze, limit i znacznik ucięcia, filtry rodzajów i wag', async () => {
    const N = await lib('lib/news.mjs');
    const E = await lib('lib/earnings.mjs');
    const events = [ev(100, 'Zorblat Index m/m', 'high'), ev(200, 'Święto Zorblatu', 'holiday', { kind: 'holiday' }), ev(300, 'Core Zorblat', 'medium'), ev(400, 'Monthly OPEX', 'opex', { kind: 'opex' }), ev(500, 'Plumbus', 'low')];
    const r = N.searchEvents(events, { q: 'ZORBLAT' });
    assert.deepEqual([r.total, r.truncated, r.events.map((e) => e.t)], [3, false, [300, 200, 100]], 'od najnowszych');
    assert.deepEqual(N.searchEvents(events, { q: 'swieto' }).events.map((e) => e.t), [200], 'bez polskich znaków');
    assert.deepEqual(N.searchEvents(events, { q: 'opex' }).events.map((e) => e.t), [400]);
    const lim = N.searchEvents(events, { q: 'zorblat', limit: 2 });
    assert.deepEqual([lim.total, lim.truncated, lim.events.map((e) => e.t)], [3, true, [300, 200]]);
    assert.deepEqual(N.searchEvents(events, { q: 'zorblat', imps: ['high'] }).events.map((e) => e.t), [100]);
    assert.deepEqual(N.searchEvents(events, { q: 'zorblat', kinds: ['holiday'] }).events.map((e) => e.t), [200]);
    const es = [earn(100, 'NVDA', 1, 'amc'), earn(200, 'NVDL', 4, 'amc', { name: 'Ładna Spółka' }), earn(300, 'AAPL', 1, 'bmo')];
    assert.deepEqual(E.searchEarnings(es, { q: 'nv' }).events.map((e) => e.symbol), ['NVDL', 'NVDA'], 'ticker po prefiksie');
    assert.deepEqual(E.searchEarnings(es, { q: 'ladna' }).events.map((e) => e.symbol), ['NVDL'], 'nazwa bez polskich znaków');
    assert.deepEqual(E.searchEarnings(es, { q: 'nv', classes: [1] }).events.map((e) => e.symbol), ['NVDA']);
    assert.equal(N.fold('Łódź Żółć'), 'lodz zolc');
    assert.throws(() => N.parseSearch({ q: 'a' }), /od 2 do 60/);
    assert.throws(() => N.parseSearch({ q: 'cpi', kinds: 'x' }), /Zły filtr/);
    assert.throws(() => N.parseSearch({ q: 'cpi', limit: '9999' }), /od 1 do 500/);
    assert.deepEqual(N.parseSearch({ q: ' cpi ', kinds: 'data,fomc', limit: '5' }), { q: 'cpi', kinds: ['data', 'fomc'], imps: null, limit: 5, before: null, from: null, year: null });
  });

  test('newsy-06: API wyszukiwania: /api/news/search i /api/earnings/search na wydaniowej historii (od 2010), limit, filtry, błędy po polsku, ochrona Sec-Fetch-Site', async () => {
    const A = await H.atrapa(4751);
    const dir = H.tmp();
    const S = await H.server(4752, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    const get = (p, h = {}) => fetch(S.base + p, { headers: h });
    const r = await get('/api/news/search?q=cpi&limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const j = await r.json();
    assert.ok(j.total > 100 && j.events.length >= 5 && j.events.length <= 8 && j.truncated === true, 'CPI od 2010 daje setki wyników, ucięte limitem (strona kończy się na całej grupie o tej samej chwili)');
    assert.ok(j.events.every((e) => /cpi/i.test(e.name)) && j.events.every((e, i) => i === 0 || e.t <= j.events[i - 1].t), 'najnowsze pierwsze');
    const old = await (await get('/api/news/search?q=non-farm&limit=500')).json();
    assert.ok(old.events.some((e) => e.day < '2012-01-01'), 'historia sięga 2010 mimo limitu 400 dni zakresu');
    const hi = await (await get('/api/news/search?q=cpi&imps=high&kinds=data')).json();
    assert.ok(hi.events.length > 0 && hi.events.every((e) => e.imp === 'high' && e.kind === 'data'));
    const op = await (await get('/api/news/search?q=opex&kinds=opex&limit=500')).json();
    assert.ok(op.total > 100 && op.events.every((e) => e.kind === 'opex'));
    const ea = await (await get('/api/earnings/search?q=nvda&classes=1&limit=10')).json();
    assert.ok(ea.events.length > 0 && ea.events.every((e) => e.symbol === 'NVDA' && e.cls === 1));
    for (const [p, re] of [['/api/news/search', /od 2 do 60/], ['/api/news/search?q=x', /od 2 do 60/], ['/api/news/search?q=cpi&kinds=zly', /Zły filtr/], ['/api/news/search?q=cpi&limit=0', /od 1 do 500/], ['/api/earnings/search?q=nv&classes=9', /Zła klasa/], ['/api/earnings/search?q=nv&limit=abc', /od 1 do 500/]]) {
      const x = await get(p);
      assert.equal(x.status, 400, p);
      assert.match((await x.json()).error, re, p);
    }
    for (const p of ['/api/news/search?q=cpi', '/api/earnings/search?q=nvda']) {
      assert.equal((await get(p, { 'Sec-Fetch-Site': 'cross-site' })).status, 403, p);
      assert.equal((await get(p, { 'Sec-Fetch-Site': 'same-origin' })).status, 200, p);
    }
    const td = await (await get('/api/news/today')).json();
    assert.ok(Array.isArray(td.events), 'serwer dalej zwraca dzień (pole tomorrow może zostać, interfejs go nie używa)');
    S.stop(); A.stop();
  });

  // ---------- kontroler z atrapą DOM i serwera ----------
  const fakeRoot = () => {
    const writes = { bar: 0 };
    const out = { innerHTML: '', setAttribute() {} };
    const bar = { set innerHTML(v) { writes.bar++; this._v = v; }, get innerHTML() { return this._v; } };
    const range = { textContent: '' }, q = { value: 'x' };
    const nodes = { '.cal-bar': bar, '.cal-out': out, '.cal-range': range, '[data-cal-q]': q };
    const handlers = {};
    return { innerHTML: '', isConnected: true, out, writes, range, q, handlers, addEventListener(type, fn) { (handlers[type] ||= []).push(fn); }, querySelector: (sel) => nodes[sel] ?? null };
  };
  const click = (root, dataset) => root.handlers.click.forEach((h) => h({ target: { closest: () => ({ dataset }) } }));
  const change = (root, target) => root.handlers.change.forEach((h) => h({ target }));
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
  const NOW = Date.UTC(2026, 9, 29, 12);

  test('newsy-06: B1 powrót do oglądanego zakresu (‹ potem ›) rysuje jego dane, a zmiana zakresu pokazuje „Wczytuję”, nie pusty tydzień', async () => {
    const C = await lib('public/js/kalendarz.js');
    const corpus = [ev(utc(2026, 10, 28, 13, 30), 'EVENT_W44', 'high'), ev(utc(2026, 10, 21, 13, 30), 'EVENT_W43', 'high')];
    const gates = [];
    const fetchImpl = async (url) => {
      const m = url.match(/^\/api\/news\?from=(\d+)&to=(\d+)$/);
      if (!m) return { ok: true, json: async () => ({ events: [] }) };
      const found = corpus.filter((e) => e.t >= +m[1] && e.t < +m[2]);
      await new Promise((r) => gates.push(r)); // odpowiedź dopiero po zwolnieniu bramki: widać stan „w trakcie”
      return { ok: true, json: async () => ({ events: found }) };
    };
    const cal = C.createCalendar({ storage: mem(), getTz: () => 'UTC', fetchImpl, now: () => NOW });
    const root = fakeRoot();
    cal.mount(root);
    assert.match(root.out.innerHTML, /Wczytuję kalendarz/, 'pierwsze ładowanie: „Wczytuję”');
    await new Promise((r) => setTimeout(r, 5)); gates.shift()(); await cal.idle();
    assert.match(root.out.innerHTML, /EVENT_W44/);
    click(root, { calStep: '-1' });
    assert.match(root.out.innerHTML, /Wczytuję kalendarz/, 'po zmianie zakresu nie ma mignięcia „Brak wydarzeń”');
    assert.ok(!/Brak wydarzeń/.test(root.out.innerHTML));
    await new Promise((r) => setTimeout(r, 5)); gates.shift()(); await cal.idle();
    assert.match(root.out.innerHTML, /EVENT_W43/);
    assert.ok(!/EVENT_W44/.test(root.out.innerHTML));
    click(root, { calStep: '1' }); // zakres z pamięci
    await cal.idle();
    assert.match(root.out.innerHTML, /EVENT_W44/, 'powrót do zakresu z pamięci pokazuje jego wydarzenia');
    assert.ok(!/Brak wydarzeń w tym zakresie/.test(root.out.innerHTML));
    assert.equal(gates.length, 0, 'z pamięci bez nowego zapytania');
  });

  test('newsy-06: pole daty nie przerysowuje paska (wpisywanie roku z klawiatury), uaktualnia tylko nagłówek i wyniki; goTo bez argumentu liczy dziś w strefie', async () => {
    const C = await lib('public/js/kalendarz.js');
    const fetchImpl = async () => ({ ok: true, json: async () => ({ events: [] }) });
    const cal = C.createCalendar({ storage: mem(), getTz: () => 'Pacific/Kiritimati', fetchImpl, now: () => Date.UTC(2026, 9, 29, 12) }); // UTC+14: tam jest już 30.10
    assert.equal(cal.anchor(), '2026-10-30', 'dziś w strefie z Ustawień, nie w przeglądarce');
    const root = fakeRoot();
    cal.mount(root); await cal.idle();
    const before = root.writes.bar;
    change(root, { matches: (s) => s === '[data-cal-date]', value: '2026-11-04', dataset: {} });
    await cal.idle();
    assert.equal(root.writes.bar, before, 'pasek z polem daty nie jest przerysowany');
    assert.equal(cal.anchor(), '2026-11-04');
    assert.ok(root.range.textContent.length > 0, 'nagłówek zakresu zaktualizowany');
    cal.goTo(null, 'day');
    assert.equal(cal.anchor(), '2026-10-30');
    cal.applyEarn({ 1: true, 2: false, 3: false, 4: true });
    assert.deepEqual([cal.state().earn.on, cal.state().earn.cls[1], cal.state().earn.cls[2], cal.state().earn.cls[4]], [true, true, false, true], 'klasy z karty „Wyniki spółek”');
    assert.equal(cal.isMounted(root), true);
    cal.unmount(); assert.equal(cal.isMounted(root), false);
  });

  // korpus wyszukiwania: 250 CPI od 2010, 3 nadchodzące; atrapa serwera używa prawdziwych funkcji lib/news.mjs (strony, remisy)
  const searchCorpus = async () => {
    const N = await lib('lib/news.mjs');
    const events = [];
    for (let i = 0; i < 250; i++) events.push(ev(utc(2010, 1, 1) + i * 28 * 86400 + 13 * 3600, `CPI m/m #${i}`, 'high', i % 2 ? { note: 'Fed Announcement: tytuł próbny' } : {}));
    events.push(ev(utc(2026, 11, 10, 13, 30), 'CPI m/m FUTURE1', 'high'), ev(utc(2026, 11, 10, 13, 30), 'CPI y/y FUTURE1', 'high'), ev(utc(2026, 12, 10, 13, 30), 'CPI m/m FUTURE2', 'high'));
    events.sort((a, b) => a.t - b.t);
    return { N, events };
  };
  const searchApi = (N, events, log) => async (url) => {
    const u = new URL(url, 'http://x');
    if (!u.pathname.endsWith('/search')) return { ok: true, json: async () => ({ events: [] }) };
    log.push(url);
    if (u.pathname.startsWith('/api/earnings')) return { ok: true, json: async () => ({ events: [], total: 0, truncated: false }) };
    try {
      const p = N.parseSearch(Object.fromEntries(u.searchParams));
      return { ok: true, json: async () => N.searchEvents(events, p) };
    } catch (e) { return { ok: false, status: e.status, json: async () => ({ error: e.message }) }; }
  };

  test('newsy-06: B2 wyszukiwanie sięga całej historii: nadchodzące osobno, przeszłość od dziś wstecz stronami („Pokaż wcześniejsze”) aż do 2010, bez dubli', async () => {
    const C = await lib('public/js/kalendarz.js');
    const { N, events } = await searchCorpus();
    const log = [];
    const cal = C.createCalendar({ storage: mem(), getTz: () => 'UTC', fetchImpl: searchApi(N, events, log), now: () => NOW });
    const root = fakeRoot();
    cal.mount(root); await cal.idle();
    await cal.find('cpi'); await cal.idle();
    let h = root.out.innerHTML;
    assert.match(h, /Nadchodzące/);
    assert.match(h, /FUTURE1/);
    assert.match(h, /Wcześniejsze/);
    assert.match(h, /data-cal-more="1"/, 'jest przycisk „Pokaż wcześniejsze”');
    assert.match(h, /Znaleziono 253 wyników/);
    assert.ok(!/CPI m\/m #0</.test(h), 'pierwsza strona to najnowsze, nie 2010');
    for (let i = 0; i < 5 && /data-cal-more/.test(root.out.innerHTML); i++) { click(root, { calMore: '1' }); await new Promise((r) => setTimeout(r, 30)); }
    h = root.out.innerHTML;
    assert.match(h, /CPI m\/m #0</, 'po stronicowaniu widać 2010');
    assert.ok(!/data-cal-more/.test(h), 'koniec historii: bez przycisku');
    const names = [...h.matchAll(/CPI [my]\/[my] (?:#\d+|FUTURE\d)/g)].map((m) => m[0]);
    assert.equal(names.length, 253);
    assert.equal(new Set(names).size, 253, 'bez dublowania na granicach stron');
    assert.ok(log.some((u) => /from=\d+/.test(u)) && log.some((u) => /before=\d+/.test(u)));
    // rok: parametr przechodzi do serwera i zawęża wyniki
    await cal.find('cpi', { year: '2012' }); await cal.idle();
    assert.ok(log.some((u) => /year=2012/.test(u)));
    assert.ok(!/Nadchodzące/.test(root.out.innerHTML) && /CPI m\/m #/.test(root.out.innerHTML));
  });

  test('newsy-06: wyszukiwanie: błąd 400 serwera jako komunikat walidacji, tytuł komunikatu Fed (note) widoczny i przeszukiwany; pole szukaj ma maxlength 60', async () => {
    const C = await lib('public/js/kalendarz.js');
    const { N, events } = await searchCorpus();
    const cal = C.createCalendar({ storage: mem(), getTz: () => 'UTC', fetchImpl: searchApi(N, events, []), now: () => NOW });
    const root = fakeRoot();
    cal.mount(root); await cal.idle();
    await cal.find('x'.repeat(61)); await cal.idle(); // serwer odmówi (w polu frazę ucina maxlength)
    assert.match(root.out.innerHTML, /od 2 do 60 znaków/);
    assert.match(root.out.innerHTML, /role="alert"/);
    assert.ok(!/Sprawdź, czy dashboard działa/.test(root.out.innerHTML));
    assert.match(cal.html(), /maxlength="60"/);
    await cal.find('tytuł próbny'); await cal.idle();
    assert.match(root.out.innerHTML, /<small class="cal-tags cal-note">Fed Announcement: tytuł próbny<\/small>/, 'tytuł z note jako drugi wiersz');
    const row = C.rowHtml(C.newsRow(ev(utc(2026, 10, 29, 18, 20), 'Fed Announcement', 'high', { note: 'Statement <b>x</b>' }), 'UTC', utc(2026, 10, 29)), 'UTC');
    assert.ok(row.includes('cal-note') && row.includes('Statement &lt;b&gt;x&lt;/b&gt;'));
  });

  test('newsy-06: ciche odświeżenie Notion nie montuje kalendarza od nowa (isMounted), refresh przeładowuje dane bez zrywania pola', async () => {
    const C = await lib('public/js/kalendarz.js');
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ events: [] }) }; };
    const cal = C.createCalendar({ storage: mem(), getTz: () => 'UTC', fetchImpl, now: () => NOW });
    const root = fakeRoot();
    cal.mount(root); await cal.idle();
    const n = calls;
    assert.equal(cal.isMounted(root), true, 'ten sam element: app.js nie montuje drugi raz');
    cal.refresh(); await cal.idle();
    assert.ok(calls > n, 'refresh pobiera dane od nowa (zmiana strefy)');
    assert.equal(root.q.value, 'x', 'pole szukaj nietknięte');
    const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    const at = app.indexOf("if (state.view === 'calendar') {");
    assert.ok(at > 0 && at < app.indexOf('if (loading && !model) return;'), 'gałąź kalendarza stoi przed sprawdzeniem modelu (działa bez Notion)');
    assert.ok(app.slice(at, at + 700).includes('cal.isMounted(host)'), 'bez ponownego montowania');
    assert.ok(/cal-earn/.test(app) && /openCalendarEarnings/.test(app) && /cal\.goTo\(null, mode\)/.test(app), '„+N więcej” z wyników spółek otwiera tydzień z klasami z karty; dziś w strefie z Ustawień');
  });

  test('newsy-06: API: stronicowanie wyszukiwania (before, from, year) obejmuje całą historię od 2010 bez luk; nadchodzące rosnąco; błędy parametrów po polsku', async () => {
    const A = await H.atrapa(4761);
    const dir = H.tmp();
    const S = await H.server(4762, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    const get = async (p) => (await fetch(S.base + p)).json();
    const total = (await get('/api/news/search?q=cpi&limit=1')).total;
    let cur = null, all = [], pages = 0;
    for (;;) {
      const r = await get(`/api/news/search?q=cpi&limit=100${cur ? `&before=${cur}` : ''}`);
      all = all.concat(r.events); pages++;
      if (!r.truncated) break;
      cur = r.events.at(-1).t;
    }
    assert.equal(all.length, total, 'wszystkie strony razem to wszystkie wyniki');
    assert.equal(new Set(all.map((e) => `${e.t}|${e.name}`)).size, total, 'bez dubli na granicach stron');
    assert.ok(pages >= 8 && all.at(-1).day < '2010-03-01', 'ostatnia strona sięga stycznia 2010');
    assert.ok(all.every((e, i) => i === 0 || e.t <= all[i - 1].t));
    const up = await get(`/api/news/search?q=cpi&from=${Math.floor(Date.now() / 1000)}&limit=5`);
    assert.ok(up.events.length > 0 && up.events.every((e, i) => i === 0 || e.t >= up.events[i - 1].t), 'nadchodzące od dziś, rosnąco');
    const y = await get('/api/news/search?q=cpi&year=2013&limit=100');
    assert.ok(y.total > 0 && y.events.every((e) => e.day.startsWith('2013')));
    const ey = await get('/api/earnings/search?q=nvda&year=2025&limit=50');
    assert.ok(ey.events.every((e) => e.day.startsWith('2025')));
    for (const p of ['/api/news/search?q=cpi&before=abc', '/api/news/search?q=cpi&before=5&from=6', '/api/news/search?q=cpi&year=1999', '/api/earnings/search?q=nv&before=-1']) {
      const r = await fetch(S.base + p);
      assert.equal(r.status, 400, p);
      assert.match((await r.json()).error, /Zły filtr/, p);
    }
    S.stop(); A.stop();
  });

  test('newsy-06: karty w lewym panelu: wersja kompaktowa pokazuje nadchodzące i ostatnie minione, reszta jako „+N więcej” otwierające Kalendarz; earningsy z limitem', async () => {
    const K = await lib('public/js/newsy-karty.js');
    const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ t: i, name: `N${i}`, imp: 'high', tentative: false, past: i <= 3, next: i === 4 }));
    const p = K.pickRows(rows, 4);
    assert.deepEqual([p.shown.map((r) => r.name), p.hidden], [['N4', 'N5', 'N6', 'N7'], 3], 'cztery nadchodzące, minione zostają pod „+3 więcej”');
    const p2 = K.pickRows(rows, 5);
    assert.deepEqual(p2.shown.map((r) => r.name), ['N3', 'N4', 'N5', 'N6', 'N7'], 'wolne miejsce zajmuje ostatni miniony');
    assert.deepEqual(K.pickRows(rows, 0), { shown: rows, hidden: 0 });
    const html = K.newsCardHtml({ rows, banners: [], empty: false }, { tz: 'UTC', limit: 4 });
    assert.match(html, /nws-list compact/);
    assert.match(html, /data-act="cal-today">\+3 więcej<\/button>/);
    assert.ok(!/N1</.test(html));
    assert.ok(!/cal-today/.test(K.newsCardHtml({ rows: rows.slice(0, 3), banners: [], empty: false }, { tz: 'UTC', limit: 4 })), 'bez ucięcia nie ma przycisku');
    assert.ok(!/cal-today/.test(K.newsCardHtml({ rows, banners: [], empty: false }, { tz: 'UTC' })), 'karta pod statystykami na telefonie pokazuje całość');
    const v = { empty: false, groups: [{ id: 'amc', title: 'A', rows: ['A1', 'A2', 'A3'].map((s) => ({ symbol: s, cls: 1, sub: '' })) }, { id: 'bmo', title: 'B', rows: ['B1', 'B2'].map((s) => ({ symbol: s, cls: 2, sub: '' })) }] };
    const eh = K.earnCardHtml(v, { limit: 4 });
    assert.ok(/B1/.test(eh) && !/B2/.test(eh) && /\+1 więcej/.test(eh));
    assert.ok(!/\+\d+ więcej/.test(K.earnCardHtml(v)));
  });

  test('newsy-06: zakładka i panele podpięte: Kalendarz w #tabs i w tabbarze, karty w lewym panelu (renderDesk), tylko tokeny w CSS kalendarza, telefon bez tabeli', () => {
    const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    assert.ok(/data-v="calendar"/.test(app) && /item\('view', 'calendar'/.test(app) && /VIEWS = \['stats', 'trades', 'prop', 'gallery', 'calendar'(, 'backtest')?\]/.test(app)); // 1.5.0 (backtest-C1): zakładka Backtest po Kalendarzu
    const desk = app.slice(app.indexOf('function renderDesk'), app.indexOf('const DAYS_FULL'));
    assert.ok(/newsDeskHtml\(\)/.test(desk), 'karty w lewym panelu');
    const side = app.slice(app.indexOf('function renderSide'), app.indexOf('const cmpRecent'));
    assert.ok(!/newsDeskHtml|newsSideHtml|newsSlot/.test(side), 'prawy panel bez kart newsów');
    const css = readFileSync(path.join(ROOT, 'public/features.css'), 'utf8');
    const block = css.slice(css.indexOf('Kalendarz newsów i earningów'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block.replace(/rgb\(var\(--fg-rgb\)/g, '')), 'CSS kalendarza: tylko tokeny');
    assert.ok(/max-width: 640px\) \{[\s\S]*\.cal-r \{ display: grid/.test(block), 'telefon: wiersze jako siatka, bez poziomego przewijania');
    assert.ok(/\.nws-desk \{ display: none; \}/.test(css), 'na telefonie karty z lewego panelu ukryte (stoją pod statystykami)');
  });
};
