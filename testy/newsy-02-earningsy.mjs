// newsy-02: earningsy spółek S&P 100, pakiet A2. Bez sieci: SEC i Finnhub to atrapy z wymyślonymi danymi (testy/atrapa-edgar.mjs, testy/atrapa-finnhub.mjs),
// serwer HTTP startuje z THQ_NO_NEWS=1. Pora BMO/AMC na granicach 9:30 i 16:00 ET i przy zmianie czasu, klasyfikacja 1-4, scalanie EDGAR + Finnhub, klienty, usługa, API.
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { block, fakeSec } from './atrapa-edgar.mjs';
import { fakeFinnhub, FAKE_FH_KEY } from './atrapa-finnhub.mjs';

export default ({ test, H, assert, ROOT }) => {
  const load = async (f) => import(pathToFileURL(path.join(ROOT, 'lib', f)).href);
  const E = () => load('earnings.mjs');
  const ES = () => load('earnings-sources.mjs');
  const SV = () => load('earnings-service.mjs');
  const K = () => load('earnings-katalog.mjs');
  const u = (s) => Date.parse(s) / 1000;
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';
  const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
  const shippedEdgar = () => JSON.parse(readFileSync(path.join(ROOT, 'data/earnings/edgar-8k.json'), 'utf8'));

  // ---------- pora BMO / AMC ----------
  test('newsy-02: pora ogłoszenia: BMO przed 9:30 ET, w trakcie sesji, AMC od 16:00 ET; granice, północ ET i dzień ET', async () => {
    const { classifyAcceptance, sessionOfHour, scheduledTime, sessionOfEtSeconds } = await E();
    const c = (s) => { const r = classifyAcceptance(u(s)); return `${r.day} ${r.session}`; };
    // czas letni (EDT = UTC-4)
    assert.equal(c('2026-10-30T13:29:59Z'), '2026-10-30 bmo'); // 9:29:59
    assert.equal(c('2026-10-30T13:30:00Z'), '2026-10-30 dmh'); // 9:30:00
    assert.equal(c('2026-10-30T19:59:59Z'), '2026-10-30 dmh'); // 15:59:59
    assert.equal(c('2026-10-30T20:00:00Z'), '2026-10-30 amc'); // 16:00:00
    assert.equal(c('2026-10-30T03:59:59Z'), '2026-10-29 amc'); // 23:59:59 poprzedniego dnia ET
    assert.equal(c('2026-10-30T04:00:00Z'), '2026-10-30 bmo'); // północ ET
    // czas zimowy (EST = UTC-5): te same godziny ET to inne chwile UTC
    assert.equal(c('2026-11-02T14:29:59Z'), '2026-11-02 bmo');
    assert.equal(c('2026-11-02T14:30:00Z'), '2026-11-02 dmh');
    assert.equal(c('2026-11-02T20:59:59Z'), '2026-11-02 dmh');
    assert.equal(c('2026-11-02T21:00:00Z'), '2026-11-02 amc');
    assert.equal(c('2026-11-02T05:00:00Z'), '2026-11-02 bmo');
    // ta sama chwila UTC w obu strefach: 13:45Z to 9:45 EDT (sesja) w październiku i 8:45 EST (przed otwarciem) w listopadzie
    assert.equal(c('2026-10-30T13:45:00Z'), '2026-10-30 dmh');
    assert.equal(c('2026-11-02T13:45:00Z'), '2026-11-02 bmo');
    // zmiana czasu wiosną: piątek 6.03 (EST), poniedziałek 9.03 (EDT)
    assert.equal(c('2026-03-06T14:29:59Z'), '2026-03-06 bmo');
    assert.equal(c('2026-03-06T14:30:00Z'), '2026-03-06 dmh');
    assert.equal(c('2026-03-09T13:29:59Z'), '2026-03-09 bmo');
    assert.equal(c('2026-03-09T13:30:00Z'), '2026-03-09 dmh');
    assert.equal(c('2026-03-09T20:00:00Z'), '2026-03-09 amc');
    // dni zmiany czasu wypadają w niedzielę (1.11.2026 i 8.03.2026): to weekend, więc znacznik idzie na poniedziałek, niezależnie od godziny
    assert.equal(c('2026-11-01T20:59:59Z'), '2026-11-02 weekend');
    assert.equal(c('2026-11-01T21:00:00Z'), '2026-11-02 weekend');
    assert.equal(c('2026-03-08T19:59:59Z'), '2026-03-09 weekend');
    assert.equal(c('2026-03-08T20:00:00Z'), '2026-03-09 weekend');
    // doba z 25 godzinami (poniedziałek po jesiennej zmianie ma 24, ale niedziela 25): poniedziałek 2.11 zaczyna się o 05:00 UTC
    assert.equal(c('2026-11-02T04:59:59Z'), '2026-11-02 weekend');
    assert.equal(c('2026-11-02T05:00:00Z'), '2026-11-02 bmo');
    assert.equal(sessionOfEtSeconds(0), 'bmo');
    assert.equal(sessionOfEtSeconds(9 * 3600 + 29 * 60 + 59), 'bmo');
    assert.equal(sessionOfEtSeconds(9 * 3600 + 30 * 60), 'dmh');
    assert.equal(sessionOfEtSeconds(16 * 3600), 'amc');
    assert.equal(sessionOfEtSeconds(86399), 'amc');
    // pole hour Finnhub i czas znacznika dla terminów bez dokładnej godziny
    assert.deepEqual(['bmo', 'AMC', ' dmh ', '', null, undefined, 'xyz'].map(sessionOfHour), ['bmo', 'amc', 'dmh', 'unknown', 'unknown', 'unknown', 'unknown']);
    const { parseDay } = await load('news.mjs');
    assert.equal(iso(scheduledTime(parseDay('2026-10-30'), 'bmo')), '2026-10-30T13:30Z');
    assert.equal(iso(scheduledTime(parseDay('2026-10-30'), 'amc')), '2026-10-30T20:00Z');
    assert.equal(iso(scheduledTime(parseDay('2026-11-02'), 'bmo')), '2026-11-02T14:30Z');
    assert.equal(iso(scheduledTime(parseDay('2026-11-02'), 'amc')), '2026-11-02T21:00Z');
    assert.equal(iso(scheduledTime(parseDay('2026-11-02'), 'unknown')), '2026-11-02T05:00Z');
  });

  // ---------- EDGAR ----------
  test('newsy-02: EDGAR: tylko 8-K z dokładnie Item 2.02 (nie 12.02), bez 8-K/A i sprzed 2010, jedno ogłoszenie na dobę ET, mapowanie tickerów', async () => {
    const { parseFilings, dedupeByDay, parseTickerMap } = await ES();
    const b = block([
      ['8-K', '2.02,9.01', '2026-07-30T20:30:28.000Z'],
      ['8-K', '12.02', '2026-07-31T20:30:28.000Z'],
      ['8-K/A', '2.02', '2026-08-01T20:30:28.000Z'],
      ['10-Q', '2.02', '2026-08-02T20:30:28.000Z'],
      ['8-K', '7.01, 2.02', '2026-05-01T12:00:00.000Z'],
      ['8-K', '2.02', '2009-12-31T21:00:00.000Z'],
      ['8-K', '2.02', 'nie-data'],
      ['8-K', '5.02', '2026-04-01T12:00:00.000Z'],
      ['8-K', null, '2026-03-01T12:00:00.000Z'],
    ]);
    assert.deepEqual(parseFilings(b).map((r) => iso(r.t)), ['2026-07-30T20:30Z', '2026-05-01T12:00Z']);
    assert.deepEqual(parseFilings({ form: ['8-K'] }), []);
    assert.deepEqual(parseFilings(null), []);
    // dwa raporty w jednej dobie ET: zostaje wcześniejszy; północ UTC to jeszcze poprzedni dzień ET
    const rows = dedupeByDay([{ t: u('2026-07-31T03:00:00Z') }, { t: u('2026-07-30T22:00:00Z') }, { t: u('2026-07-31T13:00:00Z') }]);
    assert.deepEqual(rows.map((r) => iso(r.t)), ['2026-07-30T22:00Z', '2026-07-31T13:00Z']);
    const m = parseTickerMap({ 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple' }, 1: { cik_str: 1067983, ticker: 'BRK-B' }, 2: { cik_str: 5, ticker: 'AAPL' }, 3: { cik_str: 'x', ticker: 'ZZZ' }, 4: null });
    assert.equal(m.get('AAPL'), '0000320193', 'pierwszy wpis wygrywa, CIK dopełniony do 10 cyfr');
    assert.equal(m.get('BRK.B'), '0001067983');
    assert.equal(m.has('ZZZ'), false);
    assert.throws(() => parseTickerMap({}), (e) => e.code === 'bad-reply');
    assert.throws(() => parseTickerMap(null), (e) => e.code === 'bad-reply');
  });

  test('newsy-02: klient EDGAR: User-Agent bez adresu e-mail i bez URL, limit 8 zapytań/s, pliki dodatkowe, tylko hosty SEC', async () => {
    const { createEdgar, buildUserAgent, createPacer } = await ES();
    const ua = buildUserAgent({ version: '1.4.0', repo: 'Paneksu/local-trading-journal' });
    assert.equal(ua, 'JustJournal/1.4.0 Paneksu/local-trading-journal');
    assert.ok(!/@|https?:|github\.com/i.test(ua), 'SEC odrzuca URL w User-Agent (403), a e-mail użytkownika nie wchodzi bez jego zgody');
    assert.equal(buildUserAgent({ version: '1.4.0', repo: 'a/b', contact: ' ktos@example.test ' }), 'JustJournal/1.4.0 a/b ktos@example.test');
    // pacer: 17 zapytań na wirtualnym zegarze, odstęp co najmniej 125 ms, nigdy więcej niż 8 w oknie 1 s
    let clock = 0;
    const pace = createPacer({ rps: 8, now: () => clock, sleep: async (ms) => { clock += ms; } });
    const starts = [];
    for (let i = 0; i < 17; i++) { await pace(); starts.push(clock); }
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 125 - 1e-9, `odstęp ${i}`);
    for (const s of starts) assert.ok(starts.filter((x) => x >= s && x < s + 1000).length <= 8);
    assert.throws(() => createEdgar({ userAgent: ua, rps: 11 }), /10 zapytań/);
    assert.throws(() => createEdgar({}), /User-Agent/);
    // submissions: blok recent + plik dodatkowy (starszy), plik o złej nazwie pominięty, plik tylko sprzed 2010 pominięty
    const sec = fakeSec({
      tickers: { AAPL: 320193 },
      submissions: { '0000320193': { filings: { recent: block([['8-K', '2.02', '2026-07-30T20:30:28.000Z']]), files: [
        { name: 'CIK0000320193-submissions-001.json', filingFrom: '2015-01-01', filingTo: '2022-01-01' },
        { name: 'CIK0000320193-submissions-002.json', filingFrom: '1995-01-01', filingTo: '2009-12-31' },
        { name: '../../etc/passwd', filingTo: '2022-01-01' }] } } },
      files: { 'CIK0000320193-submissions-001.json': block([['8-K', '2.02', '2018-02-01T21:30:00.000Z'], ['8-K', '1.01', '2018-03-01T21:30:00.000Z']]) },
    });
    const ed = createEdgar({ userAgent: ua, fetchImpl: sec, pacer: async () => {} });
    assert.equal((await ed.tickerMap()).get('AAPL'), '0000320193');
    const rows = await ed.earnings('0000320193');
    assert.deepEqual(rows.map((r) => iso(r.t)), ['2018-02-01T21:30Z', '2026-07-30T20:30Z']);
    assert.deepEqual(sec.calls.map((c) => `${c.host}${c.path}`), ['www.sec.gov/files/company_tickers.json', 'data.sec.gov/submissions/CIK0000320193.json', 'data.sec.gov/submissions/CIK0000320193-submissions-001.json']);
    assert.ok(sec.calls.every((c) => c.ua === ua && c.redirect === 'error'));
    await assert.rejects(ed.earnings('320193'), (e) => e.code === 'bad-cik');
    // obcy adres bazowy: zero zapytań
    const f2 = fakeSec({});
    await assert.rejects(createEdgar({ userAgent: ua, fetchImpl: f2, dataBase: 'https://example.com', pacer: async () => {} }).earnings('0000320193'), (e) => e.code === 'bad-base');
    assert.equal(f2.calls.length, 0);
    await assert.rejects(createEdgar({ userAgent: ua, fetchImpl: fakeSec({ status: 429 }), pacer: async () => {} }).tickerMap(), (e) => e.code === 'rate-limit');
    // atrapa odrzuca zapytanie bez User-Agent jak SEC
    const noUa = fakeSec({ tickers: { AAPL: 1 } });
    await assert.rejects(createEdgar({ userAgent: ua, fetchImpl: (url, init) => noUa(url, { ...init, headers: {} }), pacer: async () => {} }).tickerMap(), (e) => e.code === 'upstream' && e.upstream === 403);
  });

  // ---------- Finnhub ----------
  test('newsy-02: klient Finnhub: klucz tylko w nagłówku, pola kalendarza, 401 i 429, klucz wycięty z błędów, obcy adres bez zapytania', async () => {
    const { createFinnhub, parseCalendar } = await ES();
    const rows = [
      { symbol: 'NVDA', date: '2026-11-18', hour: 'amc', quarter: 3, year: 2026, epsEstimate: 1.23, revenueEstimate: 5e10 },
      { symbol: 'zzz', date: '2026-11-19', hour: '' },
      { symbol: 'BRK-B', date: '2026-11-20', hour: 'bmo', epsEstimate: null },
      { symbol: '', date: '2026-11-20' }, { symbol: 'X', date: 'zła' },
    ];
    const fh = fakeFinnhub({ rows, caps: { NVDA: 4500000 } });
    const c = createFinnhub({ key: FAKE_FH_KEY, fetchImpl: fh });
    const got = await c.calendar('2026-11-15', '2026-11-21');
    assert.deepEqual(got.map((r) => `${r.symbol}|${r.date}|${r.hour}`), ['NVDA|2026-11-18|amc', 'ZZZ|2026-11-19|', 'BRK.B|2026-11-20|bmo']);
    assert.deepEqual([got[0].quarter, got[0].year, got[0].epsEstimate, got[0].revenueEstimate], [3, 2026, 1.23, 5e10]);
    assert.equal(got[2].epsEstimate, undefined);
    const call = fh.calls[0];
    assert.equal(call.host, 'finnhub.io');
    assert.equal(call.path, '/api/v1/calendar/earnings');
    assert.deepEqual(call.query, { from: '2026-11-15', to: '2026-11-21' });
    assert.equal(call.headers['X-Finnhub-Token'], FAKE_FH_KEY);
    assert.ok(!call.url.includes(FAKE_FH_KEY), 'klucz nie wchodzi do adresu (logi, historia)');
    assert.equal(call.redirect, 'error');
    assert.equal(await c.marketCap('NVDA'), 4500000);
    assert.equal(await c.marketCap('nieznany'), null);
    await assert.rejects(c.marketCap('../x'), (e) => e.code === 'bad-symbol');
    await assert.rejects(c.calendar('2026-11-21', '2026-11-15'), (e) => e.code === 'bad-range');
    await assert.rejects(c.calendar('x', 'y'), (e) => e.code === 'bad-range');
    assert.throws(() => parseCalendar({}), (e) => e.code === 'bad-reply');
    // zły klucz → 401 bad-key; klucz w treści błędu serwera nie wycieka
    await assert.rejects(createFinnhub({ key: 'zlyklucz1234567890zlyklucz1234567890zlyk', fetchImpl: fakeFinnhub({}) }).calendar('2026-11-15', '2026-11-21'), (e) => e.code === 'bad-key' && !e.message.includes('zlyklucz'));
    await assert.rejects(createFinnhub({ key: FAKE_FH_KEY, fetchImpl: fakeFinnhub({ status: 500 }) }).calendar('2026-11-15', '2026-11-21'), (e) => { assert.equal(e.code, 'upstream'); assert.ok(!e.message.includes(FAKE_FH_KEY)); return true; });
    await assert.rejects(createFinnhub({ key: FAKE_FH_KEY, fetchImpl: fakeFinnhub({ status: 429, headers: { 'retry-after': '30' } }) }).calendar('2026-11-15', '2026-11-21'), (e) => e.code === 'rate-limit' && e.retryAfterSec === 30);
    await assert.rejects(createFinnhub({ fetchImpl: fh }).calendar('2026-11-15', '2026-11-21'), (e) => e.code === 'no-key');
    const f2 = fakeFinnhub({});
    await assert.rejects(createFinnhub({ key: FAKE_FH_KEY, fetchImpl: f2, base: 'https://example.com' }).calendar('2026-11-15', '2026-11-21'), (e) => e.code === 'bad-base' && !e.message.includes(FAKE_FH_KEY));
    assert.equal(f2.calls.length, 0);
  });

  // ---------- klasy ----------
  test('newsy-02: klasy 1-4: stałe listy, klasa 3 wg kapitalizacji do łącznie 50, zapas bez kapitalizacji, wyjątki z konfiguracji', async () => {
    const { buildClassMap } = await E();
    const k = await K();
    const uni = k.SP100.map(([symbol]) => ({ symbol }));
    const base = buildClassMap(uni);
    assert.deepEqual(base.counts, { 1: 8, 2: 17, 3: 25, 4: uni.length - 50 });
    for (const s of k.CLASS1) assert.equal(base.map.get(s), 1, s);
    for (const s of k.CLASS2) assert.equal(base.map.get(s), 2, s);
    assert.equal(base.map.get('JNJ'), 3, 'bez kapitalizacji: kolejność zapasowa, JNJ jest pierwszą spółką spoza klas 1-2');
    assert.equal(base.map.get('BNY'), 4);
    // kapitalizacja zmienia klasę 3/4, nie rusza klas 1-2; spółki bez kapitalizacji idą po tych z kapitalizacją
    const caps = { BNY: 900000, NVDA: 1, JNJ: 10, HD: 20 };
    const withCaps = buildClassMap(uni, { caps });
    assert.equal(withCaps.map.get('BNY'), 3);
    assert.equal(withCaps.map.get('NVDA'), 1);
    assert.equal(withCaps.map.get('JNJ'), 3, 'JNJ ma kapitalizację 10: jest wśród spółek z kapitalizacją, więc nadal przed spółkami bez niej');
    assert.equal(withCaps.counts[3], 25);
    const small = buildClassMap(uni, { caps: Object.fromEntries(uni.map((x, i) => [x.symbol, 1000 - i])) });
    assert.deepEqual(small.counts, base.counts);
    // wyjątki: przeniesienie klasy, dopisanie tickera, ignorowanie niepoprawnych
    const ov = buildClassMap(uni, { overrides: { XOM: 3, bny: 1, ZZZZ: 1, AAPL: 9, MSFT: 'x' }, extra: ['zm', 'AAPL', '???', 'brk-b'] });
    assert.equal(ov.map.get('XOM'), 3);
    assert.equal(ov.map.get('BNY'), 1);
    assert.equal(ov.map.has('ZZZZ'), false, 'override nie dopisuje spółek');
    assert.equal(ov.map.get('AAPL'), 1);
    assert.equal(ov.map.get('MSFT'), 1);
    assert.equal(ov.map.get('ZM'), 4, 'dopisana ręcznie: klasa 4');
    assert.equal(ov.map.has('???'), true, 'ticker nie jest tu walidowany (robi to usługa)');
    assert.equal(buildClassMap(uni, { extra: ['ZM'], overrides: { ZM: 2 } }).map.get('ZM'), 2);
    // lista klas 1-2 jest podzbiorem S&P 100 z katalogu
    const all = new Set(uni.map((x) => x.symbol));
    assert.ok([...k.CLASS1, ...k.CLASS2].every((s) => all.has(s)));
    assert.equal(new Set([...k.CLASS1, ...k.CLASS2]).size, 25);
  });

  // ---------- scalanie ----------
  test('newsy-02: scalanie: EDGAR z rzeczywistą godziną wygrywa, Finnhub dokłada szacunki i kwartał, terminy bez pory to etykieta dnia, spoza listy pomijane', async () => {
    const { mergeEarnings, buildClassMap } = await E();
    const k = await K();
    const classes = buildClassMap(k.SP100.map(([symbol]) => ({ symbol }))).map;
    const names = { AAPL: 'Apple', NVDA: 'NVIDIA' };
    const ev = mergeEarnings({
      edgar: [{ symbol: 'AAPL', t: u('2026-07-30T20:30:28Z') }, { symbol: 'NVDA', t: u('2026-08-26T20:20:00Z') }, { symbol: 'JPM', t: u('2026-07-14T10:45:00Z') }, { symbol: 'NIEZNANA', t: u('2026-07-14T10:45:00Z') }, { symbol: 'MSFT', t: 'x' }],
      finnhub: [
        { symbol: 'AAPL', date: '2026-07-30', hour: 'amc', quarter: 3, year: 2026, epsEstimate: 1.5, revenueEstimate: 9e10 }, // ta sama data: dokłada szacunki
        { symbol: 'NVDA', date: '2026-08-27', hour: 'amc', quarter: 2, year: 2026 }, // dzień później niż EDGAR (błąd daty Finnhub): to samo ogłoszenie
        { symbol: 'NVDA', date: '2026-11-18', hour: 'amc', quarter: 3, year: 2027, epsEstimate: 2.8 },
        { symbol: 'META', date: '2026-10-29', hour: 'bmo' },
        { symbol: 'MSFT', date: '2026-10-28', hour: '' },
        { symbol: 'GOOGL', date: '2026-10-28', hour: 'dmh' },
        { symbol: 'META', date: '2026-10-29', hour: 'bmo' }, // duplikat wiersza
        { symbol: 'OBCA', date: '2026-10-29', hour: 'bmo' }, { symbol: 'AMZN', date: 'zła' },
      ],
      names, classes,
    });
    const by = (s, d) => ev.filter((e) => e.symbol === s && e.day === d);
    const a = by('AAPL', '2026-07-30');
    assert.equal(a.length, 1);
    assert.deepEqual([a[0].src, a[0].session, a[0].cls, a[0].name, iso(a[0].t), a[0].allDay, a[0].quarter, a[0].epsEst, a[0].revEst], ['edgar', 'amc', 1, 'Apple', '2026-07-30T20:30Z', false, 3, 1.5, 9e10]);
    assert.equal(by('NVDA', '2026-08-27').length, 0, 'termin Finnhub o dzień później niż EDGAR nie jest osobnym ogłoszeniem');
    assert.equal(by('NVDA', '2026-08-26')[0].quarter, 2);
    assert.equal(by('NVDA', '2026-11-18').length, 1, 'kolejny kwartał, daleko od EDGAR: osobne ogłoszenie z Finnhub');
    const j = by('JPM', '2026-07-14')[0];
    assert.deepEqual([j.session, j.cls, j.src], ['bmo', 2, 'edgar']);
    const m = by('META', '2026-10-29');
    assert.equal(m.length, 1, 'duplikat wiersza Finnhub odrzucony');
    assert.deepEqual([m[0].session, m[0].src, iso(m[0].t), m[0].allDay], ['bmo', 'finnhub', '2026-10-29T13:30Z', false]);
    const ms = by('MSFT', '2026-10-28')[0];
    assert.deepEqual([ms.session, iso(ms.t), ms.allDay], ['unknown', '2026-10-28T04:00Z', true]);
    const g = by('GOOGL', '2026-10-28')[0];
    assert.deepEqual([g.session, g.allDay], ['dmh', true]);
    assert.equal(ev.some((e) => e.symbol === 'NIEZNANA' || e.symbol === 'OBCA'), false);
    assert.deepEqual(ev.map((e) => e.t), [...ev.map((e) => e.t)].sort((x, y) => x - y), 'posortowane');
    assert.equal(ev.find((e) => e.symbol === 'AMZN'), undefined);
  });

  // ---------- „dziś” ----------
  test('newsy-02: karta „dziś”: dziś po zamknięciu, jutro przed otwarciem, najbliższe klasy 1 w tygodniu; granica doby ET i zmiana czasu', async () => {
    const { todayOf, makeEarning } = await E();
    const mk = (symbol, cls, session, day) => { const [y, mo, d] = day.split('-').map(Number); const t = session === 'bmo' ? utc(y, mo, d, 13, 30) : session === 'amc' ? utc(y, mo, d, 20) : utc(y, mo, d, 4); return makeEarning({ t, symbol, cls, session, src: 'finnhub' }); };
    const list = [
      mk('MSFT', 1, 'bmo', '2026-10-29'), mk('AAPL', 1, 'amc', '2026-10-29'), mk('WFC', 2, 'amc', '2026-10-29'),
      mk('JPM', 2, 'bmo', '2026-10-30'), mk('AMZN', 1, 'amc', '2026-10-30'), mk('XOM', 2, 'unknown', '2026-10-30'),
      mk('NVDA', 1, 'amc', '2026-11-04'), mk('TSLA', 1, 'amc', '2026-11-05'), mk('GS', 2, 'bmo', '2026-11-02'), mk('META', 1, 'amc', '2026-11-12'),
    ].sort((a, b) => a.t - b.t);
    const t = todayOf(list, u('2026-10-29T18:00:00Z')); // czwartek 14:00 ET
    assert.equal(t.day, '2026-10-29');
    assert.deepEqual(t.events.map((e) => e.symbol), ['MSFT', 'AAPL', 'WFC']);
    assert.deepEqual(t.amcToday.map((e) => e.symbol), ['AAPL', 'WFC']);
    assert.deepEqual(t.bmoTomorrow.map((e) => e.symbol), ['JPM']);
    assert.deepEqual(t.tomorrowOther.map((e) => e.symbol), ['XOM', 'AMZN'], 'posortowane po czasie znacznika: etykieta dnia (północ) przed 16:00');
    assert.deepEqual(t.soon.map((e) => e.symbol), ['AMZN', 'NVDA', 'TSLA'], 'klasa 1 do 7 dni; META za 14 dni i klasy 2 odpadają; dzisiejsze AMC nie dublują się');
    // granica doby ET: 23:30 EDT to jeszcze czwartek, 00:30 EDT już piątek
    assert.equal(todayOf(list, u('2026-10-30T03:30:00Z')).day, '2026-10-29');
    assert.equal(todayOf(list, u('2026-10-30T04:30:00Z')).day, '2026-10-30');
    // po zmianie czasu (niedziela 1.11): 23:30 EST to jeszcze niedziela, 00:30 EST poniedziałek
    assert.equal(todayOf(list, u('2026-11-02T04:30:00Z')).day, '2026-11-01');
    assert.equal(todayOf(list, u('2026-11-02T05:30:00Z')).day, '2026-11-02');
    assert.deepEqual(todayOf(list, u('2026-11-02T15:00:00Z')).bmoTomorrow, [], 'poniedziałek: jutro (wtorek) bez BMO');
    assert.deepEqual(todayOf(list, u('2026-11-01T18:00:00Z')).bmoTomorrow.map((e) => e.symbol), ['GS']);
    assert.deepEqual(todayOf([], u('2026-10-29T18:00:00Z')).soon, []);
  });

  test('newsy-02: raport przyjęty w weekend to „weekend”, a nie sesja: znacznik przed otwarciem poniedziałku, rzeczywisty czas w filedAt, karta „jutro przed otwarciem”', async () => {
    const { classifyAcceptance, mergeEarnings, buildClassMap, todayOf } = await E();
    const k = await K();
    // sobota 31.10.2026 15:00 UTC (11:00 EDT): poniedziałek 2.11 jest już po zmianie czasu (EST), otwarcie 9:30 ET = 14:30 UTC
    const sat = classifyAcceptance(u('2026-10-31T15:00:00Z'));
    assert.deepEqual([sat.day, sat.session, iso(sat.t), sat.filedAt], ['2026-11-02', 'weekend', '2026-11-02T14:30Z', u('2026-10-31T15:00:00Z')]);
    const sun = classifyAcceptance(u('2026-11-02T01:00:00Z')); // niedziela 1.11 20:00 EST
    assert.deepEqual([sun.day, sun.session, iso(sun.t)], ['2026-11-02', 'weekend', '2026-11-02T14:30Z']);
    assert.equal(classifyAcceptance(u('2026-10-31T03:59:59Z')).session, 'amc', 'piątek 23:59:59 ET to jeszcze AMC');
    assert.equal(classifyAcceptance(u('2026-10-31T04:00:00Z')).session, 'weekend', 'sobota 00:00 ET');
    assert.equal(classifyAcceptance(u('2026-11-02T04:59:59Z')).session, 'weekend', 'niedziela 23:59:59 EST');
    assert.equal(classifyAcceptance(u('2026-11-02T05:00:00Z')).session, 'bmo', 'poniedziałek 00:00 EST');
    const classes = buildClassMap(k.SP100.map(([symbol]) => ({ symbol }))).map;
    const ev = mergeEarnings({ edgar: [{ symbol: 'BRK.B', t: u('2026-10-31T15:00:00Z') }], classes, names: { 'BRK.B': 'Berkshire Hathaway' } });
    assert.equal(ev.length, 1);
    assert.deepEqual([ev[0].session, ev[0].day, iso(ev[0].t), ev[0].allDay, ev[0].filedAt, ev[0].cls], ['weekend', '2026-11-02', '2026-11-02T14:30Z', false, u('2026-10-31T15:00:00Z'), 2]);
    // karta: w piątek wieczorem i w weekend „jutro przed otwarciem” (poniedziałek) widzi raport z weekendu dopiero w niedzielę; w niedzielę dzień ET = niedziela, jutro = poniedziałek
    assert.deepEqual(todayOf(ev, u('2026-11-01T18:00:00Z')).bmoTomorrow.map((e) => e.symbol), ['BRK.B']);
    assert.deepEqual(todayOf(ev, u('2026-10-30T18:00:00Z')).bmoTomorrow, []);
  });

  test('newsy-02: czyszczenie ogłoszeń EDGAR: w parze bliższej niż 40 dni zostaje późniejsze (raporty dostaw, zapowiedzi, wstępne wyniki)', async () => {
    const { dropCloseAnnouncements, createEdgar, buildUserAgent } = await ES();
    const d = (s) => ({ t: u(s + 'T21:00:00Z') });
    // dostawy 2 stycznia i 2 kwietnia, wyniki pod koniec stycznia i kwietnia
    const tsla = [d('2024-01-02'), d('2024-01-24'), d('2024-04-02'), d('2024-04-23'), d('2024-07-02'), d('2024-07-23')];
    assert.deepEqual(dropCloseAnnouncements(tsla).map((r) => iso(r.t).slice(0, 10)), ['2024-01-24', '2024-04-23', '2024-07-23']);
    // zapowiedź i wstępne wyniki tydzień przed raportem; łańcuch trzech wpisów < 40 dni zostawia ostatni
    assert.deepEqual(dropCloseAnnouncements([d('2022-08-08'), d('2022-08-24'), d('2022-11-16')]).map((r) => iso(r.t).slice(0, 10)), ['2022-08-24', '2022-11-16']);
    assert.deepEqual(dropCloseAnnouncements([d('2022-07-01'), d('2022-07-20'), d('2022-08-05')]).map((r) => iso(r.t).slice(0, 10)), ['2022-08-05']);
    // granica: dokładnie 40 dni zostaje, 39 nie; pojedynczy wpis i pusta lista
    assert.equal(dropCloseAnnouncements([d('2024-01-01'), d('2024-02-10')]).length, 2);
    assert.equal(dropCloseAnnouncements([d('2024-01-01'), d('2024-02-09')]).length, 1);
    assert.equal(dropCloseAnnouncements([d('2024-01-01')]).length, 1);
    assert.deepEqual(dropCloseAnnouncements([]), []);
    assert.deepEqual(dropCloseAnnouncements([d('2024-04-23'), d('2024-01-02'), d('2024-01-24')]).map((r) => iso(r.t).slice(0, 10)), ['2024-01-24', '2024-04-23'], 'kolejność wejścia nie ma znaczenia');
    // klient stosuje to do wyniku
    const filings = [['8-K', '2.02', '2024-01-02T21:00:00.000Z'], ['8-K', '2.02', '2024-01-24T21:00:00.000Z'], ['8-K', '2.02', '2024-04-23T21:00:00.000Z']];
    const sec = fakeSec({ submissions: { '0001318605': { filings: { recent: block(filings) } } } });
    const rows = await createEdgar({ userAgent: buildUserAgent({ version: '1' }), fetchImpl: sec, pacer: async () => {} }).earnings('0001318605');
    assert.deepEqual(rows.map((r) => iso(r.t).slice(0, 10)), ['2024-01-24', '2024-04-23']);
  });

  test('newsy-02: karta „dziś” w strefie użytkownika (tz) jak w newsach, a pora BMO/AMC nadal z ET; zła strefa to 400', async () => {
    const { todayOf, makeEarning } = await E();
    const aapl = makeEarning({ t: u('2026-10-29T20:00:00Z'), symbol: 'AAPL', cls: 1, session: 'amc', src: 'finnhub' }); // 16:00 EDT, 21:00 w Warszawie (CET od 25.10)
    const msft = makeEarning({ t: u('2026-10-30T13:30:00Z'), symbol: 'MSFT', cls: 1, session: 'bmo', src: 'finnhub' }); // 9:30 EDT = 14:30 w Warszawie
    const list = [aapl, msft];
    // 30.10 00:30 UTC: w Nowym Jorku nadal czwartek 29.10 (20:30 EDT), w Warszawie już piątek 30.10 (01:30)
    const ny = todayOf(list, u('2026-10-30T00:30:00Z'));
    assert.deepEqual([ny.day, ny.tz, ny.amcToday.map((e) => e.symbol), ny.bmoTomorrow.map((e) => e.symbol)], ['2026-10-29', 'America/New_York', ['AAPL'], ['MSFT']]);
    const wa = todayOf(list, u('2026-10-30T00:30:00Z'), { tz: 'Europe/Warsaw' });
    assert.deepEqual([wa.day, wa.tz, wa.amcToday.map((e) => e.symbol), wa.events.map((e) => e.symbol)], ['2026-10-30', 'Europe/Warsaw', [], ['MSFT']], 'AAPL było wczoraj czasu warszawskiego; MSFT dziś, a pora BMO zostaje z ET');
    assert.equal(wa.events[0].session, 'bmo');
    // serwis: domyślnie strefa systemowa, zła strefa to bad-tz
    const m = mkSvc();
    const svc = await m.make();
    assert.equal(svc.today({ tz: 'Europe/Warsaw' }).tz, 'Europe/Warsaw');
    assert.ok(svc.today().tz.length > 0);
    assert.throws(() => svc.today({ tz: 'Nie/Strefa' }), (e) => e.code === 'bad-tz' && e.status === 400);
    assert.throws(() => svc.today({ tz: '../../etc' }), (e) => e.code === 'bad-tz');
  });

  // ---------- pliki z wydania ----------
  test('newsy-02: pliki z wydania: schemat, CIK, czasy rosnące, każda spółka klasy 1 ma ogłoszenia z EDGAR (≥ 30, to nie dowód pełności), TSLA bez raportów dostaw, brak par bliższych niż 40 dni, brak kluczy i adresów e-mail', async () => {
    const k = await K();
    const rawSp = readFileSync(path.join(ROOT, 'data/earnings/sp100.json'), 'utf8'), rawEd = readFileSync(path.join(ROOT, 'data/earnings/edgar-8k.json'), 'utf8');
    for (const raw of [rawSp, rawEd]) {
      assert.ok(!/[0-9a-f]{32}/i.test(raw), 'ciąg przypominający klucz');
      assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(raw), 'adres e-mail');
    }
    const sp = JSON.parse(rawSp), ed = JSON.parse(rawEd);
    assert.equal(sp.schema, 1);
    assert.ok(sp.companies.length >= 95);
    assert.equal(sp.verified.date, '2026-10-29');
    assert.match(sp.verified.url, /wikipedia\.org/);
    assert.ok(sp.companies.some((c) => c.symbol === 'BNY' && c.cik === '0001390777'), 'BNY: CIK z ręcznego mapowania');
    assert.ok(!sp.companies.some((c) => ['CHTR', 'BK', 'HON'].includes(c.symbol)));
    assert.ok(sp.companies.every((c) => /^\d{10}$/.test(c.cik) && c.name && c.symbol));
    assert.ok(sp.companies.every((c) => c.cap === undefined || (Number.isInteger(c.cap) && c.cap > 0)));
    assert.equal(ed.from, '2010-01-01');
    for (const [sym, list] of Object.entries(ed.rows)) {
      assert.ok(list.every((t, i) => Number.isInteger(t) && t >= utc(2010, 1, 1) && (i === 0 || t > list[i - 1])), `${sym}: czasy rosnąco, od 2010`);
    }
    for (const s of k.CLASS1) assert.ok(ed.rows[s].length >= 30, `${s}: ${ed.rows[s]?.length} ogłoszeń`);
    // Item 2.02 to też raporty dostaw Tesli i zapowiedzi: po czyszczeniu TSLA ma kwartał w kwartał (było 117), a w żadnej spółce nie ma pary ogłoszeń bliższych niż 40 dni
    assert.ok(ed.rows.TSLA.length <= 70, `TSLA: ${ed.rows.TSLA.length}`);
    const close = [];
    for (const [sym, list] of Object.entries(ed.rows)) for (let i = 1; i < list.length; i++) if (list[i] - list[i - 1] < 40 * 86400) close.push(`${sym} ${iso(list[i - 1])}`);
    assert.deepEqual(close, [], 'pary < 40 dni');
    assert.ok(ed.rows.AAPL.length >= 66 && ed.rows.AAPL.length <= 70, 'Apple: kwartał w kwartał od 2010');
    assert.ok(ed.rows.AAPL.includes(u('2026-07-30T20:30:28Z')), 'Apple 30.07.2026 20:30:28 UTC');
    assert.ok(!sp.companies.some((c) => c.symbol === 'GOOG'));
  });

  // ---------- usługa ----------
  const mkSvc = (over = {}) => {
    const base = H.tmp();
    let clock = u('2026-10-29T18:00:00Z') * 1000;
    return { base, tick: (ms) => { clock += ms; }, clk: () => clock, make: async (extra = {}) => { const { createEarnings } = await SV(); return createEarnings({ baseDir: base, now: () => clock, capsPauseMs: 0, log: () => {}, ...over, ...extra }); } };
  };
  test('newsy-02: usługa bez klucza: historia z pliku wydania działa, tick nie robi żadnego zapytania, klasy i liczby w statusie, zakresy i filtr klasy', async () => {
    const m = mkSvc();
    const f = fakeFinnhub({});
    const svc = await m.make({ fetchImpl: f });
    assert.deepEqual(await svc.tick(), {});
    assert.equal(f.calls.length, 0, 'bez klucza zero sieci');
    await assert.rejects(svc.refreshCalendar(), (e) => e.code === 'no-key');
    await assert.rejects(svc.refreshCaps(), (e) => e.code === 'no-key');
    const st = svc.status();
    assert.equal(st.hasKey, false);
    assert.equal(st.history.edgarOk, true);
    assert.deepEqual(st.history.classes, { 1: 8, 2: 17, 3: 25, 4: st.history.symbols - 50 });
    assert.ok(st.history.events > 5500 && st.history.byClass[1] > 400);
    assert.equal(st.caps.source, 'shipped');
    // weryfikacja listy i luki historii w statusie
    assert.equal(st.history.verified.date, '2026-10-29');
    assert.match(st.history.verified.source, /S&P 100/);
    const inc = Object.fromEntries(st.history.incomplete.map((x) => [x.symbol, x]));
    assert.ok(inc.XOM && inc.XOM.reason === 'sparse' && inc.XOM.count < 8, 'XOM: prawie bez 8-K Item 2.02');
    assert.ok(inc.BLK || st.history.lateStart.some((x) => x.symbol === 'BLK'), 'BLK: 8-K Item 2.02 dopiero od 2024 (luka widoczna jako późny start)');
    assert.ok(!inc.AAPL && !inc.NVDA, 'pełna historia nie trafia na listę');
    assert.ok(st.history.lateStart.some((x) => x.symbol === 'PLTR'), 'młoda spółka to osobna lista, nie luka');
    assert.ok(st.history.incomplete.every((x) => x.count >= 0 && ['none', 'sparse', 'gaps', 'stale'].includes(x.reason)));
    const r = svc.range(u('2026-07-30T00:00:00Z'), u('2026-07-31T12:00:00Z'));
    const aapl = r.events.find((e) => e.symbol === 'AAPL');
    assert.deepEqual([aapl.session, aapl.cls, aapl.src, aapl.name, iso(aapl.t), aapl.day], ['amc', 1, 'edgar', 'Apple', '2026-07-30T20:30Z', '2026-07-30']);
    assert.ok(r.events.every((e, i) => i === 0 || e.t >= r.events[i - 1].t));
    const only1 = svc.range(u('2026-07-01T00:00:00Z'), u('2026-08-15T00:00:00Z'), { maxClass: 1 }).events;
    assert.ok(only1.length > 3 && only1.every((e) => e.cls === 1));
    assert.ok(svc.range(u('2026-07-01T00:00:00Z'), u('2026-08-15T00:00:00Z')).events.length > only1.length);
    assert.throws(() => svc.range(5, 1), (e) => e.code === 'bad-range' && e.status === 400);
    assert.throws(() => svc.range(0, 401 * 86400), (e) => e.code === 'range-too-big');
    assert.throws(() => svc.range(0, 10, { maxClass: 7 }), (e) => e.code === 'bad-class');
    assert.deepEqual(walk(m.base), [], 'bez klucza nic się nie zapisuje');
    // wyjątki z konfiguracji
    const cfgSvc = await m.make({ getConfig: () => ({ earningsClassOverrides: { XOM: 1, nieznana: 1 }, earningsExtra: ['zm', 'to nie ticker'] }) });
    assert.equal(cfgSvc.classes().map.get('XOM'), 1);
    assert.equal(cfgSvc.classes().map.get('ZM'), 4);
    assert.equal(cfgSvc.classes().map.has('TO NIE TICKER'), false);
  });

  test('newsy-02: odświeżenie kalendarza Finnhub: okna tygodniowe, podział przepełnionego okna, raz na 4 godziny, 429, zapis, klucz nigdy w plikach i logach', async () => {
    const m = mkSvc();
    const logs = [];
    // wiersze: NVDA za 3 dni (amc), MSFT za 10 dni, JPM wczoraj, spółka spoza S&P 100; w tygodniu startowym przepełnione okno (1600 wypełniaczy w ostatni dzień) i klasa 1 pierwszego dnia
    const filler = Array.from({ length: 1600 }, (_, i) => ({ symbol: `FIL${i}`, date: '2026-11-04', hour: 'amc' }));
    const rows = [
      { symbol: 'NVDA', date: '2026-11-01', hour: 'amc', quarter: 3, year: 2027, epsEstimate: 2.5 },
      { symbol: 'MSFT', date: '2026-11-08', hour: 'bmo' }, { symbol: 'JPM', date: '2026-10-28', hour: 'bmo' }, { symbol: 'OBCA', date: '2026-11-09', hour: 'amc' },
      { symbol: 'AAPL', date: '2026-10-19', hour: 'amc' }, // przed oknem
      ...filler,
    ];
    const f = fakeFinnhub({ rows, limit: 1500 });
    const svc = await m.make({ getKey: () => FAKE_FH_KEY, fetchImpl: f, log: (x) => logs.push(x) });
    const r = await svc.refreshCalendar();
    assert.equal(r.ok, true);
    assert.ok(f.calls.every((c) => c.host === 'finnhub.io' && c.path === '/api/v1/calendar/earnings' && c.headers['X-Finnhub-Token'] === FAKE_FH_KEY && !c.url.includes(FAKE_FH_KEY)));
    const wins = f.calls.map((c) => c.query);
    assert.equal(wins[0].from, '2026-10-19', 'okno startuje 10 dni wstecz');
    assert.ok(wins.slice(0, 2).every((w) => (Date.parse(w.to) - Date.parse(w.from)) / 86400000 <= 6), 'okna po tygodniu');
    assert.ok(wins.some((w) => w.from === w.to), 'przepełnione okno (1500 wierszy) dzielone aż do dnia');
    const ev = svc.events();
    assert.ok(ev.some((e) => e.symbol === 'NVDA' && e.day === '2026-11-01' && e.session === 'amc' && e.epsEst === 2.5), 'NVDA z Finnhub (wiersz z początku przepełnionego okna odzyskany po podziale)');
    assert.ok(ev.some((e) => e.symbol === 'MSFT' && e.day === '2026-11-08' && e.session === 'bmo'));
    assert.equal(ev.filter((e) => e.symbol.startsWith('FIL') || e.symbol === 'OBCA').length, 0, 'spoza S&P 100 nie zapisujemy');
    const saved = JSON.parse(readFileSync(path.join(m.base, 'earnings/finnhub.json'), 'utf8')).rows;
    assert.ok(saved.every((x) => !x.symbol.startsWith('FIL')) && saved.length >= 3);
    // nie częściej niż co 4 godziny
    const cal = () => f.calls.filter((c) => c.path.includes('calendar')).length;
    const n1 = cal();
    m.tick(3 * 3600_000);
    assert.deepEqual(Object.keys(await svc.tick()).filter((k) => k === 'calendar'), []);
    assert.equal(cal(), n1);
    m.tick(1.1 * 3600_000);
    assert.equal((await svc.tick()).calendar.ok, true);
    assert.ok(cal() > n1);
    // restart: zapisane terminy zostają i działają bez sieci; termin przesunięty (znika z odpowiedzi w oknie) znika, starszy niż okno zostaje
    const f2 = fakeFinnhub({ rows: rows.filter((x) => x.symbol !== 'MSFT'), limit: 1500 });
    const again = await m.make({ getKey: () => FAKE_FH_KEY, fetchImpl: fakeFinnhub({}, {}), now: undefined });
    assert.ok(again.events().some((e) => e.symbol === 'NVDA' && e.day === '2026-11-01'));
    m.tick(5 * 3600_000);
    const svc2 = await m.make({ getKey: () => FAKE_FH_KEY, fetchImpl: f2 });
    await svc2.refreshCalendar();
    assert.ok(!svc2.events().some((e) => e.symbol === 'MSFT' && e.day === '2026-11-08' && e.src === 'finnhub'), 'przesunięty termin zniknął');
    assert.ok(svc2.events().some((e) => e.symbol === 'NVDA'));
    // 429 z Retry-After: kolejna próba nie wcześniej niż po 15 minutach i po czasie z serwera
    const base429 = mkSvc();
    const s429 = await base429.make({ getKey: () => FAKE_FH_KEY, fetchImpl: fakeFinnhub({ status: 429, headers: { 'retry-after': '3600' } }), log: (x) => logs.push(x) });
    await assert.rejects(s429.refreshCalendar(), (e) => e.code === 'rate-limit');
    assert.equal(s429.status().calendar.nextAllowedAt, base429.clk() + 3600_000);
    // zły klucz: kod w statusie, ponowienie za 6 godzin, bez klucza w statusie
    const baseBad = mkSvc();
    const sBad = await baseBad.make({ getKey: () => 'zlyklucz1234567890zlyklucz1234567890zlyk', fetchImpl: fakeFinnhub({}), log: (x) => logs.push(x) });
    const out = await sBad.tick();
    assert.equal(out.calendar.error, 'bad-key');
    assert.equal(sBad.status().calendar.nextAllowedAt, baseBad.clk() + 6 * 3600_000);
    // brak sieci: ponowienie za 15 minut
    const baseNet = mkSvc();
    const sNet = await baseNet.make({ getKey: () => FAKE_FH_KEY, fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed ' + FAKE_FH_KEY), { cause: Object.assign(new Error('refused ' + FAKE_FH_KEY), { code: 'ECONNREFUSED' }) }); }, log: (x) => logs.push(x) });
    await assert.rejects(sNet.refreshCalendar(), (e) => e.code === 'network' && e.preSend === true && !e.message.includes(FAKE_FH_KEY));
    assert.equal(sNet.status().calendar.nextAllowedAt, baseNet.clk() + 15 * 60_000, 'ECONNREFUSED: żądanie nie wyszło');
    // zerwane połączenie, timeout i przekierowanie mogły dotrzeć do Finnhub: długa przerwa
    for (const err of [Object.assign(new Error('t'), { name: 'TimeoutError' }), Object.assign(new TypeError('fetch failed'), { cause: new Error('unexpected redirect') })]) {
      const b = mkSvc();
      const s = await b.make({ getKey: () => FAKE_FH_KEY, fetchImpl: async () => { throw err; }, log: () => {} });
      await assert.rejects(s.refreshCalendar(), (e) => ['timeout', 'network'].includes(e.code) && !e.preSend);
      assert.equal(s.status().calendar.nextAllowedAt, b.clk() + 6 * 3600_000);
    }
    assert.ok(sNet.events().length > 5500, 'brak sieci nie psuje historii');
    for (const dir of [m.base, baseBad.base, baseNet.base, base429.base]) for (const p of walk(dir)) assert.ok(!readFileSync(p, 'utf8').includes(FAKE_FH_KEY) && !readFileSync(p, 'utf8').includes('zlyklucz'), p);
    assert.ok(logs.every((l) => !l.includes(FAKE_FH_KEY) && !l.includes('zlyklucz')));
  });

  test('newsy-02: kapitalizacje z Finnhub: raz na kwartał, zmieniają klasę 3/4, częściowy wynik zapisany, błędy bez klucza', async () => {
    const m = mkSvc();
    const k = await K();
    const fh = fakeFinnhub({ caps: { BNY: 9e6, JNJ: 5 } });
    const svc = await m.make({ getKey: () => FAKE_FH_KEY, fetchImpl: fh });
    const before = svc.classes().map.get('BNY');
    assert.equal(before, 4);
    assert.equal(svc.classes().map.get('NVDA'), 1);
    const r = await svc.refreshCaps();
    assert.equal(r.count, 2);
    assert.equal(fh.calls.length, svc.status().history.companies, 'jedno zapytanie na spółkę');
    assert.ok(fh.calls.every((c) => c.path === '/api/v1/stock/profile2' && !c.url.includes(FAKE_FH_KEY)));
    assert.equal(svc.classes().map.get('BNY'), 3, 'największa kapitalizacja spoza klas 1-2 wchodzi do klasy 3');
    assert.equal(svc.classes().counts[3], 25);
    assert.equal(svc.status().caps.source, 'key');
    // kwartał: tick nie powtarza przed upływem 90 dni, po 90 dniach tak
    const n = fh.calls.length;
    m.tick(60 * 86400_000);
    const t1 = await svc.tick();
    assert.equal(t1.caps, undefined);
    assert.ok(!fh.calls.slice(n).some((c) => c.path.includes('profile2')));
    m.tick(31 * 86400_000);
    assert.equal((await svc.tick()).caps.ok, true);
    // restart: kapitalizacje zapisane
    const again = await m.make({ getKey: () => undefined, fetchImpl: fakeFinnhub({}) });
    assert.equal(again.classes().map.get('BNY'), 3);
    // pusta odpowiedź dla wszystkich spółek to błąd, nie sukces
    const m2 = mkSvc();
    const s2 = await m2.make({ getKey: () => FAKE_FH_KEY, fetchImpl: fakeFinnhub({}) });
    await assert.rejects(s2.refreshCaps(), (e) => e.code === 'bad-reply');
    assert.ok(k.SP100.length > 90);
  });

  // ---------- API ----------
  test('newsy-02: API: /api/earnings, /today, /status z ochroną Sec-Fetch-Site; filtr klasy; błędy po polsku bez szczegółów technicznych', async () => {
    const A = await H.atrapa(4711);
    const dir = H.tmp();
    const S = await H.server(4712, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    const get = (pth, h = {}) => fetch(S.base + pth, { headers: h });
    const q = `/api/earnings?from=${u('2026-07-30T00:00:00Z')}&to=${u('2026-07-31T12:00:00Z')}`;
    const ok = await get(q);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    const body = await ok.json();
    const aapl = body.events.find((e) => e.symbol === 'AAPL');
    assert.deepEqual([aapl.session, aapl.cls, aapl.t, aapl.src], ['amc', 1, u('2026-07-30T20:30:28Z'), 'edgar']);
    for (const key of ['t', 'day', 'symbol', 'name', 'cls', 'session', 'allDay', 'src']) assert.ok(key in aapl, key);
    const c1 = await (await get(q + '&maxClass=1')).json();
    assert.ok(c1.events.length > 0 && c1.events.every((e) => e.cls === 1) && c1.events.length < body.events.length);
    for (const p of [q, '/api/earnings/today', '/api/earnings/status']) {
      assert.equal((await get(p, { 'Sec-Fetch-Site': 'cross-site' })).status, 403, p);
      assert.equal((await get(p, { 'Sec-Fetch-Site': 'same-site' })).status, 403, p);
      assert.equal((await get(p, { 'Sec-Fetch-Site': 'same-origin' })).status, 200, p);
      assert.equal((await get(p, { 'Sec-Fetch-Site': 'none' })).status, 200, p);
    }
    const td = await (await get('/api/earnings/today')).json();
    assert.deepEqual(Object.keys(td).sort(), ['amcToday', 'bmoTomorrow', 'day', 'events', 'soon', 'tomorrow' + 'Other', 'tz']);
    assert.equal((await (await get('/api/earnings/today?tz=Europe/Warsaw')).json()).tz, 'Europe/Warsaw');
    const badTz = await get('/api/earnings/today?tz=Nie/Strefa');
    assert.equal(badTz.status, 400);
    assert.match((await badTz.json()).error, /Nieznana strefa czasowa: Nie\/Strefa/);
    const st = await (await get('/api/earnings/status')).json();
    assert.equal(st.hasKey, false);
    assert.deepEqual(st.history.classes[1], 8);
    assert.equal(st.history.edgarOk, true);
    assert.equal((await (await get('/api/meta')).json()).hasFinnhubKey, false);
    for (const [pth, re] of [['/api/earnings', /Zły zakres czasu/], ['/api/earnings?from=5&to=1', /od 5, do 1/], [`/api/earnings?from=0&to=${400 * 86400 + 1}`, /za duży/], [`${q}&maxClass=9`, /Zła klasa: 9/], [`${q}&maxClass=x`, /Zła klasa: NaN|Zła klasa/]]) {
      const r = await get(pth);
      assert.equal(r.status, 400, pth);
      const j = await r.json();
      assert.match(j.error, re, pth);
      assert.ok(!/\bat \w|node_modules|\.mjs|[A-Z]:\\/.test(JSON.stringify(j)), 'bez szczegółów technicznych');
    }
    const post = await fetch(S.base + '/api/earnings', { method: 'POST', headers: { Origin: S.base, 'X-THQ': '1', 'Content-Type': 'application/json' }, body: '{}' });
    assert.notEqual(post.status, 200);
    S.stop(); A.stop();
  });

  test('newsy-02: aplikacja nie łączy się z SEC, tylko z finnhub.io; klucze i kontakt poza repozytorium', async () => {
    const lib = ['earnings-service.mjs'].map((n) => readFileSync(path.join(ROOT, 'lib', n), 'utf8')).join('\n') + readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
    assert.ok(!/sec\.gov/i.test(lib), 'usługa i serwer nie znają adresów SEC');
    const src = readFileSync(path.join(ROOT, 'lib/earnings-sources.mjs'), 'utf8');
    assert.ok(/EDGAR_DATA_BASE/.test(src) && /finnhub\.io/.test(src));
    const k = readFileSync(path.join(ROOT, 'lib/earnings-katalog.mjs'), 'utf8');
    assert.deepEqual([...k.matchAll(/https:\/\/[a-z.]+/g)].map((x) => x[0]).sort(), ['https://data.sec.gov', 'https://en.wikipedia.org', 'https://finnhub.io', 'https://www.sec.gov']);
    for (const f of ['lib/earnings.mjs', 'lib/earnings-sources.mjs', 'lib/earnings-service.mjs', 'lib/earnings-katalog.mjs', 'narzedzia/generuj-earningsy-edgar.mjs', 'testy/atrapa-edgar.mjs', 'testy/atrapa-finnhub.mjs']) {
      const s = readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(s.replace(/ktos@example\.test/g, '')), `${f}: adres e-mail`);
    }
    void writeFileSync;
  });
};
