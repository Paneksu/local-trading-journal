// newsy-03: interfejs newsów makro USD i earningsów, pakiety C i D (1.4.0). Bez sieci i bez przeglądarki: logika czysta (grupowanie, filtry, pozycje BMO/AMC, strefy,
// normalizacja ustawień), klient danych z atrapą fetch, karty „Dzisiaj” i „Wyniki spółek”, ochrona prawna (brak newsów w miniaturach, kartach i filmach), API kluczy i wyjątków klas.
// Nazwy zdarzeń w atrapach są wymyślone (dane ForexFactory nie trafiają do repo).
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  // zdarzenie newsa w kształcie z /api/news (nazwy wymyślone)
  const ev = (t, name, imp, o = {}) => ({ t, day: new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10), name, imp, kind: 'data', allDay: false, tentative: false, src: 'off', basis: 'rule', ...o });
  const earn = (t, symbol, cls, session, o = {}) => ({ t, day: new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10), symbol, name: symbol + ' Corp', cls, session, allDay: false, src: 'edgar', ...o });
  const fmtIn = (tz) => ({ HM: new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz }), DAY: new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: tz }) });

  // ---------- ustawienia ----------
  test('newsy-03: ustawienia nakładek: domyślnie wyłączone, filtry domyślne, zgodność wstecz i ochrona przed złymi danymi', async () => {
    const N = await lib('public/js/newsy.js');
    const P = await lib('public/js/podglad.js');
    const d = P.overlayDefaults();
    assert.deepEqual([d.news, d.earnings], [false, false], 'oba przełączniki wyłączone');
    assert.deepEqual(d.newsImp, { high: true, medium: true, low: false, holiday: false, opex: true });
    assert.deepEqual(d.earnCls, { 1: true, 2: true, 3: false, 4: false });
    // zapis sprzed 1.4.0 (bez kluczy newsów) czyta się dalej i dostaje domyślne
    const old = P.normOverlays({ sessions: true, pdhl: true, sess: { asia: { from: '21:00' } } });
    assert.deepEqual([old.sessions, old.pdhl, old.news, old.earnings, old.newsImp.high, old.earnCls[1]], [true, true, false, false, true, true]);
    assert.equal(old.sess.asia.from, '21:00');
    // złe wartości wracają do domyślnych, nieznane klucze odpadają
    const bad = P.normOverlays({ news: 'tak', earnings: 1, newsImp: { high: 'x', low: true, purple: true }, earnCls: { 1: null, 3: true, 9: true } });
    assert.deepEqual([bad.news, bad.earnings, bad.newsImp.high, bad.newsImp.low, 'purple' in bad.newsImp, bad.earnCls[1], bad.earnCls[3], 9 in bad.earnCls], [false, false, true, true, false, true, true, false]);
    assert.deepEqual(N.normNews({ newsImp: [] }).newsImp, N.newsDefaults().newsImp, 'tablica zamiast obiektu');
    assert.deepEqual(P.normOverlays(P.normOverlays({ news: true, earnings: true, earnCls: { 4: true } })), P.normOverlays({ news: true, earnings: true, earnCls: { 4: true } }), 'normalizacja jest idempotentna');
    // settings.chart: karta „Dzisiaj” domyślnie wł., karta earningów bez wyboru (null = zależy od klucza Finnhub)
    const C = await lib('public/js/styl-wykresu.js');
    const c = C.chartDefaults();
    assert.deepEqual([c.newsCard, c.earningsCard], [true, null]);
    assert.deepEqual([C.sanitizeChart({ newsCard: 'x', earningsCard: 'x' }).newsCard, C.sanitizeChart({ earningsCard: false }).earningsCard, C.sanitizeChart({ earningsCard: 'x' }).earningsCard], [true, false, null]);
    assert.ok(C.CHART_KEYS.includes('newsCard') && C.CHART_KEYS.includes('earningsCard'));
    assert.deepEqual(C.sanitizeChart({ newsCard: false }).overlays.news, false);
    const r = C.resetChartGroup(C.sanitizeChart({ newsCard: false, earningsCard: true, style: 'line' }), 'news');
    assert.deepEqual([r.newsCard, r.earningsCard, r.style], [true, null, 'line'], 'reset grupy „news” rusza tylko karty');
    // przełączniki są w pasku obok Sesje i PDH/PDL
    const html = P.overlayToggles();
    assert.ok(html.indexOf('data-swc-ov="pdhl"') < html.indexOf('data-swc-ov="news"') && html.indexOf('data-swc-ov="news"') < html.indexOf('data-swc-ov="earnings"'));
    // klucze nie pasują do SECRET_KEY synchronizacji (inaczej znikałyby z ustawień)
    const { sanitizeSettings } = await lib('lib/sync.mjs');
    const kept = sanitizeSettings({ chart: { newsCard: true, earningsCard: false, overlays: P.normOverlays({ news: true, earnings: true }) } });
    assert.deepEqual([kept.chart.newsCard, kept.chart.earningsCard, kept.chart.overlays.news, kept.chart.overlays.earnings, kept.chart.overlays.newsImp.high, kept.chart.overlays.earnCls['1']], [true, false, true, true, true, true]);
  });

  // ---------- filtr i grupowanie ----------
  test('newsy-03: grupowanie: ta sama chwila = jeden znacznik z liczbą, kolor najwyższej wagi, tentative bez linii, całodzienne jako etykieta dnia', async () => {
    const N = await lib('public/js/newsy.js');
    const t0 = utc(2026, 11, 6, 13, 30);
    const news = [
      ev(t0, 'Zorblat Index m/m', 'medium'), ev(t0, 'Plumbus Orders', 'high'), ev(t0, 'Core Zorblat', 'low'),
      ev(utc(2026, 11, 6, 15), 'Glorp Speech', 'medium', { tentative: true }),
      ev(utc(2026, 11, 6, 19), 'Mixed Tent', 'high', { tentative: true }), ev(utc(2026, 11, 6, 19), 'Mixed Sure', 'low'),
      ev(utc(2026, 11, 7, 5), 'Monthly OPEX', 'opex', { kind: 'opex', allDay: true, variant: 'monthly' }),
      ev(utc(2026, 11, 7, 5), 'Bank Holiday', 'holiday', { kind: 'holiday', allDay: true }),
      ev(utc(2026, 11, 20, 5), 'Quarterly OPEX (triple witching)', 'opex', { kind: 'opex', allDay: true, variant: 'quarterly' }),
    ];
    const all = { high: true, medium: true, low: true, holiday: true, opex: true };
    const m = N.buildNewsModel({ news, prefs: { news: true, newsImp: all } });
    assert.equal(m.groups.length, 3);
    const g = m.groups[0];
    assert.deepEqual([g.count, g.imp, g.line, g.tentative], [3, 'high', true, false], 'trzy newsy o 13:30 UTC to jeden znacznik, kolor czerwony');
    assert.deepEqual(g.items.map((e) => e.name), ['Plumbus Orders', 'Zorblat Index m/m', 'Core Zorblat'], 'lista: najwyższa waga pierwsza');
    const tent = m.groups[1];
    assert.deepEqual([tent.line, tent.tentative, tent.imp], [false, true, 'medium'], 'samo tentative: znacznik bez linii');
    const mixed = m.groups[2];
    assert.deepEqual([mixed.line, mixed.imp, mixed.count], [true, 'low', 2], 'kolor liczy się z pewnych zdarzeń (niepewne czerwone go nie podbija)');
    // całodzienne: etykieta dnia, bez znacznika i linii
    assert.deepEqual(m.labels.map((l) => [l.day, l.text]), [['2026-11-07', 'OPEX miesięczny · Bank Holiday'], ['2026-11-20', 'OPEX kwartalny (triple witching)']]);
    assert.equal(m.groups.some((x) => x.items.some((e) => e.allDay)), false);
    // przełączniki warstw: wyłączona warstwa nie liczy się wcale
    assert.deepEqual(N.buildNewsModel({ news, prefs: { news: false, newsImp: all } }).groups, []);
    assert.equal(N.buildNewsModel({ news, prefs: { news: false, earnings: false } }).on, false);
  });

  test('newsy-03: filtr wag: domyślnie czerwone i pomarańczowe, szare osobno, OPEX osobny przełącznik; filtr klas earningów 1-2', async () => {
    const N = await lib('public/js/newsy.js');
    const news = [ev(utc(2026, 11, 6, 13, 30), 'A', 'high'), ev(utc(2026, 11, 6, 14), 'B', 'medium'), ev(utc(2026, 11, 6, 15), 'C', 'low'),
      ev(utc(2026, 11, 6, 5), 'Bank Holiday', 'holiday', { kind: 'holiday', allDay: true }), ev(utc(2026, 11, 20, 5), 'Monthly OPEX', 'opex', { kind: 'opex', allDay: true })];
    const def = N.newsDefaults();
    assert.deepEqual(N.filterNews(news, def).map((e) => e.name), ['A', 'B', 'Monthly OPEX'], 'domyślnie: czerwone, pomarańczowe i OPEX; żółte i szare ukryte');
    const noOpex = { ...def, newsImp: { ...def.newsImp, opex: false } };
    assert.deepEqual(N.filterNews(news, noOpex).map((e) => e.name), ['A', 'B'], 'OPEX ma własny przełącznik');
    const grey = { ...def, newsImp: { ...def.newsImp, holiday: true, low: true } };
    assert.deepEqual(N.filterNews(news, grey).map((e) => e.name), ['A', 'B', 'C', 'Bank Holiday', 'Monthly OPEX'].sort((a, b) => news.findIndex((e) => e.name === a) - news.findIndex((e) => e.name === b)));
    const ee = [earn(utc(2026, 11, 4, 21), 'NVDA', 1, 'amc'), earn(utc(2026, 11, 4, 21), 'JPM', 2, 'amc'), earn(utc(2026, 11, 4, 21), 'ADBE', 3, 'amc'), earn(utc(2026, 11, 4, 21), 'F', 4, 'amc')];
    assert.deepEqual(N.filterEarn(ee, def).map((e) => e.symbol), ['NVDA', 'JPM'], 'domyślnie klasy 1-2');
    assert.deepEqual(N.filterEarn(ee, { earnCls: { 1: false, 2: false, 3: true, 4: true } }).map((e) => e.symbol), ['ADBE', 'F']);
  });

  // ---------- earningsy: pozycje BMO / AMC ----------
  test('newsy-03: earningsy: BMO przed otwarciem 9:30 ET, AMC po 16:00 ET, w jednym oknie czasu; bez pory = etykieta dnia; ten sam czas = jeden znacznik', async () => {
    const N = await lib('public/js/newsy.js');
    const G = await lib('public/js/geometria.js');
    // świece 5 min od 9:00 do 17:00 ET (13:00-21:00 UTC, czas letni) 2026-10-30
    const candles = []; for (let t = utc(2026, 10, 30, 13); t < utc(2026, 10, 30, 21); t += 300) candles.push([t, 1, 2, 0, 1, 1]);
    const sc = { x: (i) => 100 + i * 10 };
    const xt = N.timeToX(candles, 300, sc);
    const open = utc(2026, 10, 30, 13, 30), close = utc(2026, 10, 30, 20);
    assert.equal(xt(open), 100 + 6 * 10 - 5, 'początek świecy 9:30 stoi pół świecy przed jej środkiem (indeks 6)');
    assert.equal(xt(close), 100 + 84 * 10 - 5, 'początek świecy 16:00');
    const es = [earn(open - 300, 'NVDA', 1, 'bmo'), earn(close, 'AAPL', 1, 'amc'), earn(close, 'MSFT', 1, 'amc'), earn(close, 'F', 4, 'amc'), earn(utc(2026, 10, 30, 4), 'GE', 2, 'unknown', { allDay: true, day: '2026-10-30' })];
    const m = N.buildNewsModel({ earn: es, prefs: { earnings: true, earnCls: { 1: true, 2: true, 3: true, 4: true } } });
    assert.equal(m.eGroups.length, 2, 'BMO i AMC; trzy spółki AMC o 16:00 to jeden znacznik');
    assert.deepEqual(m.eGroups.map((g) => [g.count, g.cls]), [[1, 1], [3, 1]]);
    assert.deepEqual(m.eGroups[1].items.map((e) => e.symbol), ['AAPL', 'MSFT', 'F'], 'wewnątrz grupy: klasa, potem ticker');
    assert.deepEqual(m.labels.map((l) => l.text), ['Wyniki: GE'], 'bez pory: etykieta dnia z tickerami');
    const geo = N.newsGeometry(m, xt, { left: 100, right: 960, top: 0, bottom: 300 });
    const [bmo, amc] = geo.marks;
    assert.ok(bmo.x < xt(open) && amc.x >= xt(close) - 0.01, 'BMO przed otwarciem, AMC od zamknięcia');
    assert.ok(amc.x > bmo.x);
    assert.deepEqual([bmo.kind, amc.kind, amc.count], ['earn', 'earn', 3]);
    assert.equal(geo.lines.length, 0, 'earningsy nie mają pionowych linii');
    // pory: znaczniki nie wychodzą poza pole wykresu
    const narrow = N.newsGeometry(m, xt, { left: 100, right: 400, top: 0, bottom: 300 });
    assert.equal(narrow.marks.length, 1, 'AMC poza kadrem znika, BMO zostaje');
    // etykieta dnia całkiem poza kadrem znika
    const outside = N.newsGeometry({ ...m, labels: [{ key: 'ed:x', kind: 'earn', t0: utc(2026, 10, 25, 4), t1: utc(2026, 10, 26, 4), items: [], text: 'x', cls: 1 }] }, xt, { left: 100, right: 960, top: 0, bottom: 300 });
    assert.equal(outside.labels.length, 0);
    assert.ok(G.timeToIndexF);
  });

  test('newsy-03: geometria: linie tylko dla pewnych godzin, znaczniki u dołu, earning obok newsa podniesiony, etykiety dni w rzędach, przyciski mają 24 px', async () => {
    const N = await lib('public/js/newsy.js');
    const xt = (t) => (t - 1000) / 10; // 10 s na piksel
    const box = { left: 0, right: 500, top: 10, bottom: 210 };
    const news = [ev(2000, 'Line', 'high'), ev(2500, 'Tent', 'medium', { tentative: true }), ev(3000, 'Other', 'medium')];
    const es = [earn(3040, 'AAPL', 1, 'amc')];
    const labels = [ev(1000, 'Bank Holiday', 'holiday', { kind: 'holiday', allDay: true, day: '2026-11-03' }), ev(1010, 'Monthly OPEX', 'opex', { kind: 'opex', allDay: true, day: '2026-11-03' }), ev(1020, 'Monthly OPEX', 'opex', { kind: 'opex', allDay: true, day: '2026-11-04' })];
    const m = N.buildNewsModel({ news: [...news, ...labels], earn: es, prefs: { news: true, earnings: true, newsImp: { high: true, medium: true, low: true, holiday: true, opex: true }, earnCls: { 1: true } } });
    const g = N.newsGeometry(m, xt, box);
    assert.deepEqual(g.lines.map((l) => [l.x, l.imp, l.y1, l.y2]), [[100, 'high', 10, 210], [200, 'medium', 10, 210]], 'linia tylko dla Line i Other (Tent ma godzinę niepewną)');
    const marks = Object.fromEntries(g.marks.map((k) => [k.key, k]));
    assert.deepEqual([marks['n:2000'].y, marks['n:2500'].hollow, marks['n:2500'].y], [201, true, 201], 'znaczniki u dołu pola, niepewny pusty w środku');
    assert.equal(marks['e:3040'].y, 201 - 13, 'earning stojący obok newsa jest podniesiony, żeby się nie nakładały');
    assert.equal(g.labels.length, 2, 'dwa dni = dwie etykiety');
    assert.ok(g.labels[0].y >= box.top + 11 && g.labels[1].y >= box.top + 11);
    assert.ok(g.hits.length === g.marks.length + g.labels.length && g.hits.filter((h) => h.key.startsWith('n:') || h.key.startsWith('e:')).every((h) => h.w >= 24 && h.h >= 24), 'cel dotykowy znacznika to co najmniej 24 px (WCAG 2.2)');
    // SVG: kolory tylko jako tokeny motywu
    const svg = N.newsSvg(g);
    assert.ok(/var\(--n-red\)/.test(svg.under) && /var\(--n-orange\)/.test(svg.under) && /stroke-dasharray/.test(svg.under));
    assert.ok(/class="nwm earn"/.test(svg.over) && /class="nwm news hollow"/.test(svg.over) && /class="nwd news"/.test(svg.over));
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(/i.test(svg.under + svg.over), 'żadnych literałów kolorów');
    // kształty znaczników różne: newsy trójkąt, earningsy romb
    assert.notEqual(N.markPath('news', 10, 10).replace(/[\d.-]+/g, ''), N.markPath('earn', 10, 10).replace(/[\d.-]+/g, ''));
    // wiele etykiet blisko siebie schodzi do kolejnych rzędów, ale najwyżej trzech
    const many = N.newsGeometry({ groups: [], eGroups: [], on: true, labels: Array.from({ length: 6 }, (_, i) => ({ key: `nd:${i}`, kind: 'news', t0: 1000 + i, t1: 5000, imp: 'opex', text: 'OPEX miesięczny', items: [] })) }, xt, box);
    assert.deepEqual([...new Set(many.labels.map((l) => l.y))].sort((a, b) => a - b), [21, 34, 47]);
  });

  // ---------- strefy ----------
  test('newsy-03: dymki i karta pokazują godziny w strefie wykresu (czas letni i zimowy, rozjazd zmiany czasu USA i Europy)', async () => {
    const N = await lib('public/js/newsy.js');
    const K = await lib('public/js/newsy-karty.js');
    const t0 = utc(2026, 10, 29, 12, 30); // 8:30 w Nowym Jorku (EDT); Europa już na czasie zimowym od 25.10, USA jeszcze nie do 1.11
    const g = N.groupNews([ev(t0, 'Zorblat Index', 'high')])[0];
    const hm = (tz) => N.groupTip(g, fmtIn(tz)).html.match(/(\d{2}:\d{2})/)[1];
    assert.equal(hm('America/New_York'), '08:30');
    assert.equal(hm('Europe/Warsaw'), '13:30', 'Warszawa po zmianie czasu 25.10: UTC+1');
    assert.equal(hm('Asia/Tokyo'), '21:30');
    assert.equal(hm('UTC'), '12:30');
    // po zmianie czasu w USA (1.11) ta sama godzina w NY to inna chwila UTC, a różnica do Warszawy wraca do 6 h
    const t1 = utc(2026, 11, 2, 13, 30);
    const g1 = N.groupNews([ev(t1, 'Zorblat Index', 'high')])[0];
    assert.equal(N.groupTip(g1, fmtIn('America/New_York')).html.match(/(\d{2}:\d{2})/)[1], '08:30');
    assert.equal(N.groupTip(g1, fmtIn('Europe/Warsaw')).html.match(/(\d{2}:\d{2})/)[1], '14:30');
    // karta „Dzisiaj” w strefie z Ustawień
    const today = { day: '2026-10-29', events: [ev(t0, 'Zorblat Index', 'high')], tomorrow: [] };
    const view = K.newsTodayView({ today, prefs: N.newsDefaults(), nowSec: t0 - 600 });
    assert.match(K.newsCardHtml(view, { tz: 'Europe/Warsaw' }), /<span class="nws-t">13:30<\/span>/);
    assert.match(K.newsCardHtml(view, { tz: 'America/New_York' }), /<span class="nws-t">08:30<\/span>/);
  });

  // ---------- opisy i dymki ----------
  test('newsy-03: dymek: lista z godziną niepewną, opis earningu (ticker, klasa, pora, kwartał, szacunek EPS), ucieczka HTML, aria-label bez znaczników', async () => {
    const N = await lib('public/js/newsy.js');
    const f = fmtIn('UTC');
    const gs = N.groupNews([ev(utc(2026, 11, 6, 13, 30), 'Plumbus <b>Orders</b>', 'high'), ev(utc(2026, 11, 6, 13, 30), 'Glorp', 'medium', { tentative: true })])[0];
    const tip = N.groupTip(gs, f);
    assert.ok(!tip.html.includes('<b>Orders</b>') && tip.html.includes('&lt;b&gt;Orders'), 'nazwa z feedu jest escapowana');
    assert.match(tip.html, /godzina niepewna/);
    assert.match(tip.text, /Plumbus <b>Orders<\/b> \(czerwony\)/, 'aria-label znacznika zawiera wagę słowem');
    assert.match(tip.html, /<span class="sr">czerwony: <\/span>/);
    const P2 = await lib('public/js/podglad.js');
    assert.ok(/class="check swc-nw"/.test(P2.overlayToggles()), 'przełączniki warstw mają klasę chowaną na telefonie');
    const css = readFileSync(path.join(ROOT, 'public/features.css'), 'utf8');
    assert.ok(/max-width: 640px\) \{[^}]*\.swc-ov \.check\.swc-nw \{ display: none/.test(css) && /paint-order: stroke/.test(css), 'telefon: Newsy i Earningsy w oknie nakładek, etykiety z obrysem');
    const eg = N.groupEarnings([earn(utc(2026, 11, 5, 21), 'AAPL', 1, 'amc', { quarter: 4, year: 2026, epsEst: 1.234 })])[0];
    const et = N.groupTip(eg, f);
    assert.match(et.text, /AAPL \(AAPL Corp · klasa 1 · po zamknięciu · Q4 2026 · szac\. EPS 1,23\)/);
    assert.match(et.html, /nws-dot/);
    // brak szacunku i kwartału: tylko to, co jest
    const bare = N.groupTip(N.groupEarnings([earn(utc(2026, 11, 5, 12), 'GE', 2, 'bmo')])[0], f).text;
    assert.ok(!/EPS|Q\d/.test(bare) && /przed otwarciem/.test(bare));
    assert.equal(N.sessionText('dmh'), 'w trakcie sesji');
    assert.equal(N.sessionText('unknown'), 'pora nieznana');
    // całodzienne mają polskie nazwy własne zdarzeń aplikacji; reszta zostaje jak w źródle
    assert.equal(N.eventName({ kind: 'opex', variant: 'quarterly', name: 'Quarterly OPEX (triple witching)' }), 'OPEX kwartalny (triple witching)');
    assert.equal(N.eventName({ kind: 'opex', variant: 'monthly', name: 'Monthly OPEX' }), 'OPEX miesięczny');
    assert.equal(N.eventName({ kind: 'data', name: 'CPI m/m' }), 'CPI m/m');
  });

  // ---------- klient danych ----------
  const fakeApi = (routes) => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const r = routes(url);
      if (r instanceof Error) throw r;
      return { ok: r.ok !== false, status: r.status ?? 200, json: async () => r.body };
    };
    return { fetchImpl, calls };
  };
  test('newsy-03: klient danych wykresu: okno z zapasem, bez ponownych zapytań gdy okno wystarcza, odświeżenie po 10 minutach, błąd nie blokuje i ponawia po minucie, limit 400 dni', async () => {
    const N = await lib('public/js/newsy.js');
    let now = 1_800_000_000_000;
    const api = fakeApi((u) => ({ body: { events: [ev(utc(2026, 11, 6, 13, 30), 'Zorblat', 'high')] } }));
    const d = N.createNewsData({ fetchImpl: api.fetchImpl, now: () => now });
    const from = utc(2026, 11, 3), to = utc(2026, 11, 8);
    assert.equal(await d.ensure('news', from, to), true);
    assert.match(api.calls[0], new RegExp(`^/api/news\\?from=${from - 2 * 86400}&to=${to + 2 * 86400}$`), 'okno zaokrąglone do dni z zapasem po 2 dni');
    assert.equal(d.events('news').length, 1);
    assert.equal(await d.ensure('news', from + 86400, to - 86400), false);
    assert.equal(api.calls.length, 1, 'kadr w oknie: zero zapytań');
    now += 11 * 60_000;
    assert.equal(await d.ensure('news', from, to), false, 'po 10 minutach odświeżenie z tymi samymi danymi nie zmienia wersji (brak przerysowania)');
    assert.equal(api.calls.length, 2);
    // kadr wychodzi poza okno: okno rośnie, ale nie powyżej 399 dni
    await d.ensure('news', utc(2026, 12, 1), utc(2026, 12, 5));
    assert.ok(/from=\d+&to=\d+/.test(api.calls[2]));
    const [, a, b] = api.calls[2].match(/from=(\d+)&to=(\d+)/);
    assert.ok(Number(b) - Number(a) <= 399 * 86400);
    await d.ensure('news', utc(2020, 1, 1), utc(2026, 1, 1));
    const [, a2, b2] = api.calls.at(-1).match(/from=(\d+)&to=(\d+)/);
    assert.ok(Number(b2) - Number(a2) <= 399 * 86400, 'duże okno przycięte do 399 dni');
    // earningsy: osobne okno i osobny adres
    await d.ensure('earn', from, to);
    assert.match(api.calls.at(-1), /^\/api\/earnings\?/);
    assert.equal(d.events('earn').length, 1);
    // błąd: bez wyjątku, ponowienie najwcześniej po minucie
    let fail = true;
    const api2 = fakeApi(() => (fail ? new Error('sieć') : { body: { events: [] } }));
    const d2 = N.createNewsData({ fetchImpl: api2.fetchImpl, now: () => now });
    assert.equal(await d2.ensure('news', from, to), false);
    assert.equal(d2.failed('news'), true);
    assert.equal(await d2.ensure('news', from, to), false);
    assert.equal(api2.calls.length, 1, 'w ciągu minuty bez ponownego zapytania');
    now += 61_000; fail = false;
    await d2.ensure('news', from, to);
    assert.equal(api2.calls.length, 2, 'po minucie ponowna próba');
    assert.equal(d2.failed('news'), false);
    // odpowiedź bez tablicy zdarzeń to błąd, nie zapis
    const d3 = N.createNewsData({ fetchImpl: fakeApi(() => ({ body: { nope: 1 } })).fetchImpl, now: () => now });
    assert.equal(await d3.ensure('news', from, to), false);
    assert.deepEqual(d3.events('news'), []);
    assert.equal(await d3.ensure('news', to, from), false, 'zły zakres');
  });

  test('newsy-03: kadr szerszy niż 399 dni: jedno zapytanie na 20 wywołań ensure, okno przycięte wokół końca kadru, zdarzenia przy tradzie są; ta sama zasada dla earningsów', async () => {
    const N = await lib('public/js/newsy.js');
    let now = 1_800_000_000_000, n = 0;
    const end = utc(2026, 11, 6);
    const api = fakeApi((u) => { n++; const m = u.match(/from=(\d+)&to=(\d+)/); return { body: { events: [ev(end - 3600, 'Przy trade', 'high')], w: [m[1], m[2]] } }; });
    const d = N.createNewsData({ fetchImpl: api.fetchImpl, now: () => now });
    const from = end - 500 * 86400;
    let changes = 0;
    for (let i = 0; i < 20; i++) if (await d.ensure('news', from, end)) changes++;
    assert.equal(api.calls.length, 1, '20 × ensure na 500 dniach = 1 zapytanie');
    assert.equal(changes, 1, 'onChange tylko raz');
    const [, a, b] = api.calls[0].match(/from=(\d+)&to=(\d+)/);
    assert.ok(Number(b) - Number(a) <= 399 * 86400 && Number(b) >= end, 'okno kończy się za końcem kadru, więc obejmuje trade na końcu');
    assert.equal(d.events('news').length, 1);
    for (let i = 0; i < 20; i++) await d.ensure('earn', from, end);
    assert.equal(api.calls.filter((u) => u.startsWith('/api/earnings')).length, 1, 'earningsy: to samo');
    // wersja rośnie tylko przy zmianie zdarzeń
    const v = d.version();
    now += 11 * 60_000;
    await d.ensure('news', from, end);
    assert.equal(d.version(), v);
  });

  // ---------- karty ----------
  test('newsy-03: karta „Dzisiaj”: minione przygaszone, Dziś OPEX i Bank Holiday (bez zapowiedzi na jutro), filtr wag tylko dla godzinowych', async () => {
    const K = await lib('public/js/newsy-karty.js');
    const N = await lib('public/js/newsy.js');
    const now = utc(2026, 11, 6, 13, 0);
    const today = { day: '2026-11-06', tz: 'UTC', events: [ev(utc(2026, 11, 6, 12, 30), 'Past Index', 'high'), ev(utc(2026, 11, 6, 15), 'Soon Index', 'medium'), ev(utc(2026, 11, 6, 15, 30), 'Minor Thing', 'low'),
      ev(utc(2026, 11, 6, 4), 'Quarterly OPEX (triple witching)', 'opex', { kind: 'opex', allDay: true, variant: 'quarterly' })], tomorrow: [ev(utc(2026, 11, 7, 5), 'Monthly OPEX', 'opex', { kind: 'opex', allDay: true, variant: 'monthly' }), ev(utc(2026, 11, 7, 5), 'Bank Holiday', 'holiday', { kind: 'holiday', allDay: true })] };
    const v = K.newsTodayView({ today, prefs: N.newsDefaults(), nowSec: now });
    assert.deepEqual(v.rows.map((r) => [r.name, r.past, r.next]), [['Past Index', true, false], ['Soon Index', false, true]], 'żółty ukryty filtrem; pierwszy nieminiony jest „następny”');
    assert.deepEqual(v.banners.map((b) => b.text), ['Dziś OPEX kwartalny (triple witching)'], '29.10.2026 decyzja użytkownika: tylko dzień dzisiejszy, bez Jutro OPEX i Jutro Bank Holiday');
    const html = K.newsCardHtml(v, { tz: 'UTC' });
    assert.match(html, /<li class="past">/);
    assert.match(html, /<li class=" next">|<li class="next">| next"/);
    assert.ok(!/Minor Thing/.test(html));
    assert.ok(!/Następny|za \d+ (min|h)/.test(html), 'bez odliczania do następnego newsa (decyzja użytkownika 29.10.2026)');
    assert.match(html, /<span class="sr">czerwony: <\/span>Past Index/, 'waga słowem dla czytnika ekranu');
    // filtr szarych/żółtych włączony pokazuje żółty
    assert.ok(K.newsTodayView({ today, prefs: { newsImp: { low: true } }, nowSec: now }).rows.some((r) => r.name === 'Minor Thing'));
    // OPEX i Bank Holiday pokazują się mimo wyłączonego filtra OPEX
    const off = K.newsTodayView({ today, prefs: { newsImp: { opex: false, holiday: false } }, nowSec: now });
    assert.equal(off.banners.length, 1);
    // pusty dzień i błąd
    const empty = K.newsTodayView({ today: { day: '2026-11-06', events: [], tomorrow: [] }, prefs: N.newsDefaults(), nowSec: now });
    assert.equal(empty.empty, true);
    assert.match(K.newsCardHtml(empty, { tz: 'UTC' }), /Brak newsów na dziś/);
    assert.match(K.newsCardHtml(empty, { tz: 'UTC', error: true }), /Nie udało się wczytać newsów/);
    assert.match(K.newsCardHtml(empty, { loaded: false }), /Wczytuję/);
    assert.match(K.newsCardHtml(K.newsTodayView({ today: { events: [ev(now + 3600, 'Y', 'low')], tomorrow: [] }, prefs: N.newsDefaults(), nowSec: now }), { tz: 'UTC' }), /Dziś bez newsów o wybranych wagach/);
    // nazwa z feedu jest escapowana
    assert.ok(!K.newsCardHtml(K.newsTodayView({ today: { events: [ev(now + 3600, '<img src=x>', 'high')], tomorrow: [] }, prefs: N.newsDefaults(), nowSec: now }), { tz: 'UTC' }).includes('<img'));
  });

  test('newsy-03: karta „Wyniki spółek”: dziś po zamknięciu, jutro przed otwarciem, najbliższe klasy 1; klasa kolorem; stany puste', async () => {
    const K = await lib('public/js/newsy-karty.js');
    const N = await lib('public/js/newsy.js');
    const today = {
      amcToday: [earn(utc(2026, 11, 5, 21), 'AAPL', 1, 'amc'), earn(utc(2026, 11, 5, 21), 'ADBE', 3, 'amc')],
      bmoTomorrow: [earn(utc(2026, 11, 6, 12), 'JPM', 2, 'bmo')],
      soon: [earn(utc(2026, 11, 9, 21), 'NVDA', 1, 'amc', { day: '2026-11-09' })],
    };
    const v = K.earnTodayView({ today, prefs: N.newsDefaults() });
    assert.deepEqual(v.groups.map((g) => [g.id, g.rows.map((r) => r.symbol)]), [['amc', ['AAPL']], ['bmo', ['JPM']], ['soon', ['NVDA']]], 'domyślny filtr klas 1-2 odrzuca ADBE (klasa 3)');
    assert.match(v.groups[2].rows[0].sub, /po zamknięciu/);
    const html = K.earnCardHtml(v);
    assert.match(html, /Dziś po zamknięciu/);
    assert.match(html, /Jutro przed otwarciem/);
    assert.match(html, /Najbliższe z klasy 1/);
    assert.ok(html.includes('var(--n-red)') && html.includes('var(--n-orange)'), 'klasa kolorem z tokenów');
    const all = K.earnTodayView({ today, prefs: { earnCls: { 1: true, 2: true, 3: true, 4: true } } });
    assert.equal(all.groups[0].rows.length, 2);
    assert.equal(K.earnTodayView({ today: null, prefs: N.newsDefaults() }).empty, true);
    assert.match(K.earnCardHtml({ empty: true, groups: [] }, { hasKey: false }), /klucza Finnhub/);
    assert.match(K.earnCardHtml({ empty: true, groups: [] }, { hasKey: true }), /Brak wyników wybranych klas/);
    assert.match(K.earnCardHtml({ empty: true, groups: [] }, { error: true }), /Nie udało się wczytać/);
  });

  test('newsy-03: sklep kart: dane raz, potem przeliczanie bez sieci; ponowne pobranie po kwadransie, zmianie strefy albo dnia; earningsy tylko gdy karta włączona', async () => {
    const K = await lib('public/js/newsy-karty.js');
    const N = await lib('public/js/newsy.js');
    let now = Date.UTC(2026, 10, 6, 12, 0);
    const api = fakeApi((u) => {
      if (u.startsWith('/api/news/today')) return { body: { day: '2026-11-06', events: [ev(utc(2026, 11, 6, 13, 30), 'Zorblat', 'high')], tomorrow: [] } };
      if (u.startsWith('/api/news?')) return { body: { events: [] } };
      if (u.startsWith('/api/earnings/today')) return { body: { amcToday: [earn(utc(2026, 11, 6, 21), 'AAPL', 1, 'amc')], bmoTomorrow: [], soon: [] } };
      return new Error('nieznany adres');
    });
    let tz = 'UTC', changes = 0;
    const s = K.createNewsCards({ getTz: () => tz, getPrefs: () => N.newsDefaults(), fetchImpl: api.fetchImpl, now: () => now, onChange: () => { changes++; } });
    assert.match(s.news().html, /Wczytuję/);
    await s.load();
    const n0 = api.calls.length;
    assert.deepEqual(api.calls.filter((u) => u.includes('earnings')), [], 'bez karty earningów zero zapytań o earningsy');
    assert.match(s.news().html, /Zorblat/);
    now += 60_000; await s.tick(); now += 60_000; await s.tick();
    assert.equal(api.calls.length, n0, 'minutowe przeliczenia bez zapytań do sieci');
    assert.ok(changes >= 3);
    now += 16 * 60_000; await s.tick();
    assert.ok(api.calls.length > n0, 'po kwadransie dane odświeżone');
    const n1 = api.calls.length;
    tz = 'Europe/Warsaw'; await s.tick();
    assert.ok(api.calls.length > n1, 'zmiana strefy: nowe zapytanie');
    const n2 = api.calls.length;
    now += 14 * 3600_000; await s.tick(); // 6.11 02:00 UTC -> 7.11 w Warszawie dopiero po północy lokalnej
    assert.ok(api.calls.length > n2, 'zmiana dnia lokalnego: nowe zapytanie');
    s.wantEarnings(true); await s.load();
    assert.ok(api.calls.some((u) => u.startsWith('/api/earnings/today') && u.includes('tz=')), 'earningsy po włączeniu karty, ze strefą z Ustawień');
    assert.match(s.earnings({ hasFinnhubKey: true }).html, /AAPL/);
    s.stop();
  });

  // ---------- prawo i prostota ----------
  test('newsy-03: newsy i earningsy nie trafiają do miniatur, kart ani filmów udostępniania; moduły bez literałów kolorów i bez zależności z serwera', () => {
    for (const f of ['udostepnij-render.js', 'udostepnij.js', 'udostepnij-dane.js', 'film.js', 'shots.js']) {
      const s = readFileSync(path.join(ROOT, 'public/js', f), 'utf8');
      assert.ok(!/newsy|buildNewsModel|newsGeometry|overlayGeometry|loadOverlays|createOverlays/.test(s), `${f} nie zna newsów ani nakładek`);
    }
    const pod = readFileSync(path.join(ROOT, 'public/js/podglad.js'), 'utf8');
    const mini = pod.slice(pod.indexOf('export function miniSvg'));
    assert.ok(!/news|ov\.|createOverlays/.test(mini.slice(0, mini.indexOf('\nexport ', 10) > 0 ? mini.indexOf('\nexport ', 10) : 4000)), 'miniSvg bez newsów');
    for (const f of ['newsy.js', 'newsy-karty.js', 'newsy-warstwa.js']) {
      const s = readFileSync(path.join(ROOT, 'public/js', f), 'utf8');
      assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(|oklch\(/.test(s.replace(/&#39;/g, '')), `${f}: kolory tylko z tokenów`);
      assert.ok(!/from '\.\.\//.test(s), `${f}: nie importuje z lib/`);
      assert.ok(!/(forexfactory.com|faireconomy)/i.test(s), `${f}: nie zna adresu ForexFactory`);
    }
    const css = readFileSync(path.join(ROOT, 'public/features.css'), 'utf8');
    const block = css.slice(css.indexOf('newsy makro USD (1.4.0)'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block), 'CSS newsów: tylko tokeny');
    assert.ok(!/(^|\n)\s*\.nws-(tip|hit|slot|list|ban)[^{]*\{[^}]*border-radius:\s*(?!4px|50%)[^;}]+/.test(block), 'bez zaokrąglonych podkładek pod tekstem');
  });

  // ---------- API: klucze i wyjątki klas ----------
  test('newsy-03: API kluczy FRED i Finnhub (tylko .env, walidacja kształtu, brak klucza w odpowiedziach) i ręcznych wyjątków klas earningów', async () => {
    const A = await H.atrapa(4741);
    const dir = H.tmp();
    const S = await H.server(4742, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    const post = (p, body) => H.dash(S.base, p, body);
    const fred = 'abcdef0123456789abcdef0123456789', fh = 'ct1234567890abcdefgh';
    assert.equal((await post('/api/news/key', { key: 'za-krotki' })).status, 400, 'zły kształt klucza FRED');
    assert.match((await post('/api/news/key', { key: 'za-krotki' })).j.error, /FRED/);
    assert.equal((await post('/api/earnings/key', { key: 'x y' })).status, 400);
    assert.equal((await post('/api/news/key', { key: `${fred}\nEVIL=1` })).status, 400, 'nowa linia w kluczu odrzucona (wstrzyknięcie do .env)');
    let meta = await (await fetch(S.base + '/api/meta')).json();
    assert.deepEqual([meta.hasFredKey, meta.hasFinnhubKey], [false, false]);
    const ok1 = await post('/api/news/key', { key: fred });
    const ok2 = await post('/api/earnings/key', { key: fh });
    assert.deepEqual([ok1.status, ok2.status, ok1.j.ok, ok2.j.ok], [200, 200, true, true]);
    meta = await (await fetch(S.base + '/api/meta')).json();
    assert.deepEqual([meta.hasFredKey, meta.hasFinnhubKey], [true, true]);
    const env = readFileSync(path.join(dir, '.env'), 'utf8');
    assert.ok(env.includes(`FRED_API_KEY=${fred}`) && env.includes(`FINNHUB_API_KEY=${fh}`) && !env.includes('EVIL'));
    for (const p of ['/api/meta', '/api/news/status', '/api/earnings/status', '/api/data']) {
      const body = await (await fetch(S.base + p)).text();
      assert.ok(!body.includes(fred) && !body.includes(fh), `${p}: klucz nie wraca w odpowiedzi`);
    }
    // wyjątki klas
    assert.equal((await post('/api/earnings/classes', { symbol: 'AAPL', cls: 9 })).status, 400);
    assert.equal((await post('/api/earnings/classes', { symbol: 'zły ticker', cls: 2 })).status, 400);
    const set = await post('/api/earnings/classes', { symbol: 'aapl', cls: 3 });
    assert.deepEqual([set.status, set.j.overrides.AAPL, set.j.extra], [200, 3, []], 'spółka z S&P 100 dostaje wyjątek, bez dopisywania');
    const add = await post('/api/earnings/classes', { symbol: 'zzzx', cls: 2 });
    assert.deepEqual([add.j.extra, add.j.overrides.ZZZX], [['ZZZX'], 2], 'nieznany ticker zostaje dopisany do własnych');
    const st = await (await fetch(S.base + '/api/earnings/status')).json();
    assert.deepEqual([st.overrides.AAPL, st.extra], [3, ['ZZZX']], 'status oddaje wyjątki do Ustawień');
    await new Promise((r) => setTimeout(r, 400)); // zapis konfiguracji jest opóźniony o 50 ms
    const cfg = JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8'));
    assert.deepEqual([cfg.earningsClassOverrides.AAPL, cfg.earningsExtra], [3, ['ZZZX']]);
    const rm = await post('/api/earnings/classes', { symbol: 'AAPL', remove: true });
    assert.equal(rm.j.overrides.AAPL, undefined);
    await post('/api/earnings/classes', { symbol: 'ZZZX', remove: true });
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(JSON.parse(readFileSync(path.join(dir, 'config.local.json'), 'utf8')).earningsExtra, []);
    // zapis tylko z samego dashboardu
    const evil = await H.dash(S.base, '/api/news/key', { key: fred }, { origin: 'http://evil.example' });
    assert.equal(evil.status, 403);
    S.stop(); A.stop();
  });

  test('newsy-03: pliki interfejsu istnieją i są podpięte (arkusz, panel, ustawienia, wykres)', () => {
    for (const f of ['public/js/newsy.js', 'public/js/newsy-karty.js', 'public/js/newsy-warstwa.js']) assert.ok(existsSync(path.join(ROOT, f)), f);
    const app = readFileSync(path.join(ROOT, 'public/js/app.js'), 'utf8');
    assert.ok(/newsDeskHtml\(\)/.test(app) && /newsMainHtml\(\)/.test(app) && /createNewsCards/.test(app));
    const w = readFileSync(path.join(ROOT, 'public/js/wykres.js'), 'utf8');
    assert.ok(/newsPrimitive/.test(w) && /attachPrimitive\(nprim\)/.test(w));
    const u = readFileSync(path.join(ROOT, 'public/js/ustawienia.js'), 'utf8');
    assert.ok(/newsSettingsHtml/.test(u) && /earnSettingsHtml/.test(u));
  });
};
