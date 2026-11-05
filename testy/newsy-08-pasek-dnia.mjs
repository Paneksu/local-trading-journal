// newsy-08: pasek zakresu zdarzeń całodziennych (OPEX, Bank Holiday, wyniki bez pory) na dole pola wykresu, 04.11.2026.
// Zakres to dzień handlowy CME w czasie Nowego Jorku: 18:00 ET dnia poprzedniego do 17:00 ET danego dnia, liczony przez strefę (zmiana czasu), nie stałym offsetem.
// Zmiana 04.11.2026 «niech ten pasek bedzie bardzo delikatny i cienki i tylko po najechaniu na tekst danego dnia»: pasek jest domyślnie niewidoczny i pojawia się
// tylko dla napisu dnia pod wskaźnikiem albo fokusem; geometria nadal liczy zakres. Bez sieci i bez przeglądarki: czysta logika i spójność rysowania w SVG i na canvasie.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const ev = (day, name, imp, kind, o = {}) => ({ t: 0, day, name, imp, kind, allDay: true, tentative: false, src: 'off', basis: 'rule', ...o });
  const range = async (day) => { const N = await lib('public/js/newsy.js'); return N.tradingDayRange(day); };

  test('newsy-08: zakres dnia handlowego CME: 18:00 ET dnia poprzedniego do 17:00 ET (zima, lato, OPEX kwartalny)', async () => {
    // piątek zimą (EST = UTC-5): czwartek 18:00 = 23:00Z, piątek 17:00 = 22:00Z
    assert.deepEqual(await range('2026-12-18'), { from: utc(2026, 12, 17, 23), to: utc(2026, 12, 18, 22) }, 'OPEX kwartalny grudzień (zima)');
    // piątek latem (EDT = UTC-4): czwartek 18:00 = 22:00Z, piątek 17:00 = 21:00Z
    assert.deepEqual(await range('2026-09-18'), { from: utc(2026, 9, 17, 22), to: utc(2026, 9, 18, 21) }, 'OPEX kwartalny wrzesień (lato)');
    // dzień trwa 23 godziny (18:00 → 17:00)
    const r = await range('2026-11-20');
    assert.equal(r.to - r.from, 23 * 3600);
  });

  test('newsy-08: zakres w dniach zmiany czasu: marzec (22 h) i listopad (24 h), poniedziałek po zmianie liczony z nowego offsetu', async () => {
    // niedziela 8.03.2026, 2:00 EST → 3:00 EDT: start w sobotę 18:00 EST (23:00Z), koniec w niedzielę 17:00 EDT (21:00Z)
    const mar = await range('2026-03-08');
    assert.deepEqual(mar, { from: utc(2026, 3, 7, 23), to: utc(2026, 3, 8, 21) });
    assert.equal((mar.to - mar.from) / 3600, 22, 'dzień ze zmianą czasu wiosną ma 22 godziny, stały offset dałby 23');
    // poniedziałek 9.03: start w niedzielę 18:00 już EDT (22:00Z)
    assert.deepEqual(await range('2026-03-09'), { from: utc(2026, 3, 8, 22), to: utc(2026, 3, 9, 21) });
    // niedziela 1.11.2026, 2:00 EDT → 1:00 EST: start w sobotę 18:00 EDT (22:00Z), koniec w niedzielę 17:00 EST (22:00Z)
    const nov = await range('2026-11-01');
    assert.deepEqual(nov, { from: utc(2026, 10, 31, 22), to: utc(2026, 11, 1, 22) });
    assert.equal((nov.to - nov.from) / 3600, 24, 'dzień ze zmianą czasu jesienią ma 24 godziny, stały offset dałby 23');
    // poniedziałek 2.11: start w niedzielę 18:00 EST (23:00Z)
    assert.deepEqual(await range('2026-11-02'), { from: utc(2026, 11, 1, 23), to: utc(2026, 11, 2, 22) });
  });

  test('newsy-08: zakres zgodny z lib/news.mjs (etToUtc) dla każdego dnia 2020-2031', async () => {
    const N = await lib('public/js/newsy.js');
    const L = await lib('lib/news.mjs');
    let n = 0;
    for (let d = L.dayNum(2020, 1, 1); d < L.dayNum(2031, 1, 1); d++) {
      const r = N.tradingDayRange(L.dateStr(d));
      if (r.from !== L.etToUtc(d - 1, 18, 0) || r.to !== L.etToUtc(d, 17, 0)) assert.fail(`zakres dnia ${L.dateStr(d)} rozjechany z etToUtc`);
      n++;
    }
    assert.ok(n > 4000);
  });

  test('newsy-08: model: etykiety dni dostają zakres i datę w napisie; semantyka dnia (day, t0, t1) bez zmian', async () => {
    const N = await lib('public/js/newsy.js');
    // Bank Holiday w poniedziałek (MLK 19.01.2026) i OPEX kwartalny w piątek (18.12.2026)
    const news = [ev('2026-01-19', 'Bank Holiday', 'holiday', 'holiday', { t: utc(2026, 1, 19, 5) }), ev('2026-12-18', 'OPEX', 'opex', 'opex', { variant: 'quarterly', t: utc(2026, 12, 18, 5) })];
    const m = N.buildNewsModel({ news, prefs: { news: true, newsImp: { holiday: true, opex: true, high: true, medium: true } } });
    assert.equal(m.labels.length, 2);
    const [mlk, opex] = m.labels;
    assert.deepEqual([mlk.r0, mlk.r1], [utc(2026, 1, 18, 23), utc(2026, 1, 19, 22)], 'poniedziałek: od niedzieli 18:00 ET');
    assert.deepEqual([opex.r0, opex.r1], [utc(2026, 12, 17, 23), utc(2026, 12, 18, 22)]);
    assert.deepEqual([mlk.t0, mlk.t1, opex.t0, opex.t1], [utc(2026, 1, 19, 5), utc(2026, 1, 19, 5) + 86400, utc(2026, 12, 18, 5), utc(2026, 12, 18, 5) + 86400], 't0/t1 jak dotąd (północ ET + doba)');
    assert.match(mlk.text, /^Bank Holiday · \S+ 19\.01$/, 'napis niesie dzień tygodnia i datę, więc nie myli, gdy początek jest poza ekranem');
    assert.match(opex.text, /^OPEX kwartalny \(triple witching\) · \S+ 18\.12$/);
    // wyniki bez pory: ten sam zakres, własny rząd
    const e = { t: utc(2026, 12, 18, 5), day: '2026-12-18', symbol: 'GE', name: 'GE Corp', cls: 2, session: 'unknown', allDay: true, src: 'edgar' };
    const m2 = N.buildNewsModel({ earn: [e], prefs: { earnings: true, earnCls: { 2: true } } });
    assert.deepEqual([m2.labels[0].r0, m2.labels[0].r1], [opex.r0, opex.r1]);
    assert.match(m2.labels[0].text, /^Wyniki: GE · \S+ 18\.12$/);
  });

  // oś 1 s = 1 px w gołej skali: x(i) = i * spacing
  const scale = (spacing) => ({ x: (i) => 50 + i * spacing });
  const box = { left: 50, right: 850, top: 0, bottom: 400 };
  const lab = (key, kind, r0, r1, o = {}) => ({ key, kind, day: 'd', t0: r0, t1: r1, r0, r1, items: [], text: 'OPEX · pt 20.11', imp: 'opex', cls: 1, ...o });
  const emptyModel = (labels) => ({ groups: [], eGroups: [], labels, on: true });

  test('newsy-08: pasek 1m: od początku do końca dnia handlowego, nad osią, w kolorze wagi; świece (górna część pola) nietknięte', async () => {
    const N = await lib('public/js/newsy.js');
    // świece 1m od czwartku 18:00 ET (23:00Z) do piątku 16:59 ET (21:59Z), 23 h = 1380 świec
    const t0 = utc(2026, 12, 17, 23), candles = [];
    for (let i = 0; i < 1380; i++) candles.push([t0 + i * 60, 1, 2, 0, 1, 1]);
    const sc = scale(0.5);
    const r = await range('2026-12-18');
    const m = N.buildNewsModel({ news: [ev('2026-12-18', 'OPEX', 'opex', 'opex', { variant: 'quarterly', t: utc(2026, 12, 18, 5) })], prefs: { news: true, newsImp: { opex: true } } });
    const bx = N.bandX(candles, 60, sc);
    const g = N.newsGeometry(m, N.timeToX(candles, 60, sc), { ...box, left: 0, right: 50 + 1380 * 0.5 + 100 }, bx);
    assert.equal(g.bands.length, 1);
    const b = g.bands[0];
    assert.equal(b.x, 50 - 0.25, 'początek paska = lewa krawędź pierwszej świecy');
    assert.equal(b.x + b.w, 50 + 1379 * 0.5 + 0.25, 'koniec paska = prawa krawędź ostatniej świecy przed 17:00 ET');
    assert.equal(r.to, t0 + 1380 * 60, 'kontrola: 17:00 ET to chwila tuż po ostatniej świecy');
    assert.ok(b.y + b.h <= box.bottom && b.y >= box.bottom - 4 && b.h <= 2, 'bardzo cienki pasek (2 px) tuż nad osią');
    assert.equal(b.key, m.labels[0].key, 'klucz paska to klucz napisu dnia, nad którym się pojawia');
    assert.equal(b.imp, 'opex');
    // pasek nie wchodzi w górę pola: świece i linie zajmują resztę wysokości
    assert.ok(b.y > box.top + (box.bottom - box.top) * 0.9);
    assert.equal(N.tokenOf(b), '--n-blue');
  });

  test('newsy-08: pasek przycięty do widocznego obszaru; początek poza ekranem nie zostaje przyklejony napisem w błędnym miejscu', async () => {
    const N = await lib('public/js/newsy.js');
    const xt = (t) => (t - 1000) / 10;
    const bx = { from: xt, to: xt };
    const g = N.newsGeometry(emptyModel([lab('nd:a', 'news', -2000, 3000)]), xt, { left: 0, right: 500, top: 0, bottom: 200 }, bx);
    assert.equal(g.bands.length, 1);
    assert.equal(g.bands[0].x, 0, 'lewy brzeg przycięty do pola');
    assert.equal(g.bands[0].x + g.bands[0].w, 200, 'prawy brzeg w x końca dnia');
    assert.equal(g.bands[0].clipL, true, 'oznaczone przycięcie z lewej (początek poza ekranem)');
    assert.equal(g.bands[0].clipR, false);
    const right = N.newsGeometry(emptyModel([lab('nd:a', 'news', 2000, 90000)]), xt, { left: 0, right: 500, top: 0, bottom: 200 }, bx);
    assert.equal(right.bands[0].x + right.bands[0].w, 500);
    assert.equal(right.bands[0].clipR, true);
    // całkiem poza kadrem: brak paska
    assert.equal(N.newsGeometry(emptyModel([lab('nd:a', 'news', -9000, -5000)]), xt, { left: 0, right: 500, top: 0, bottom: 200 }, bx).bands.length, 0);
    assert.equal(N.newsGeometry(emptyModel([lab('nd:a', 'news', 80000, 90000)]), xt, { left: 0, right: 500, top: 0, bottom: 200 }, bx).bands.length, 0);
  });

  test('newsy-08: każdy dzień ma własny pasek o kluczu napisu; znaczniki nie są przesuwane; paska nie obsługuje osobny przycisk, dymek napisu bez zmian', async () => {
    const N = await lib('public/js/newsy.js');
    const xt = (t) => (t - 1000) / 10;
    const bx = { from: xt, to: xt };
    const two = N.newsGeometry(emptyModel([lab('nd:a', 'news', 1000, 3000), lab('ed:a', 'earn', 1000, 3000, { cls: 2 })]), xt, box, bx);
    assert.deepEqual(two.bands.map((b) => b.key), ['nd:a', 'ed:a'], 'newsy i wyniki tego samego dnia: osobne paski, każdy pokazywany tylko dla swojego napisu');
    assert.equal(N.tokenOf(two.bands[1]), '--n-orange', 'wyniki w kolorze klasy');
    assert.ok(two.bands.every((b) => b.y === box.bottom - 2 && b.h === 2));
    // pasek nie ma przycisku: tylko napis (hit-area paska nie jest potrzebna)
    assert.equal(two.hits.filter((h) => h.key.endsWith(':b')).length, 0);
    assert.equal(two.hits.length, two.marks.length + two.labels.length);
    // znacznik newsa zostaje na swojej wysokości niezależnie od paska
    const grp = { key: 'n:2000', kind: 'news', t: 2000, items: [], count: 1, imp: 'high', line: true, tentative: false };
    assert.equal(N.newsGeometry({ groups: [grp], eGroups: [], labels: two.bands.length ? [lab('nd:a', 'news', 1000, 3000)] : [], on: true }, xt, box, bx).marks[0].y, box.bottom - 9);
    // krótki zakres: co najmniej 4 px (święto na wykresie 1D bez świecy)
    assert.ok(N.newsGeometry(emptyModel([lab('nd:a', 'news', 2000, 2000)]), xt, box, bx).bands[0].w >= 4);
    // dymek napisu: sama data, bez zakresu (zostaje jak był); wersja z sufiksem :b już nie istnieje
    const model = N.buildNewsModel({ news: [ev('2026-12-18', 'OPEX', 'opex', 'opex', { variant: 'quarterly', t: utc(2026, 12, 18, 5) })], prefs: { news: true, newsImp: { opex: true } } });
    const fmt = (tz) => ({ HM: new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz }), DAY: new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: tz }) });
    const tip = N.tipFor(model.labels[0].key, model, fmt('Europe/Warsaw'));
    assert.ok(/OPEX kwartalny/.test(tip.text) && !/23:00/.test(tip.text));
    assert.equal(N.tipFor(`${model.labels[0].key}:b`, model, fmt('Europe/Warsaw')), null);
  });

  test('newsy-08: 1D: pasek obejmuje całą świecę dnia handlowego (także piątek przed weekendem); święto bez świecy dostaje wąski znak w szwie', async () => {
    const N = await lib('public/js/newsy.js');
    // świece 1D: t = otwarcie sesji CME (18:00 ET dnia poprzedniego). Wt 17:00?, cz 15.10 i pt 16.10.2026 (EDT, 22:00Z), pon 19.10 otwiera w niedzielę 18.10 22:00Z
    const d = (day, h) => utc(2026, 10, day, h);
    const candles = [[d(13, 22), 1, 2, 0, 1, 1], [d(14, 22), 1, 2, 0, 1, 1], [d(15, 22), 1, 2, 0, 1, 1], [d(18, 22), 1, 2, 0, 1, 1], [d(19, 22), 1, 2, 0, 1, 1]];
    // czwartek 15.10 (i=2) to sesja 'czwartek': t = śr 14.10 22:00Z; piątek 16.10: t = czw 15.10 22:00Z; poniedziałek 19.10: t = niedz 18.10 22:00Z
    // (powyżej: indeks 0 = wt 13.10 22:00Z sesja śr 14.10, 1 = śr 14.10 22:00Z sesja czw 15.10, 2 = czw 15.10 22:00Z sesja pt 16.10, 3 = niedz 18.10 sesja pon 19.10, 4 = pon 19.10 sesja wt 20.10)
    const sc = scale(40), step = 86400;
    const bx = N.bandX(candles, step, sc);
    const fri = await range('2026-10-16'), mon = await range('2026-10-19');
    assert.equal(fri.from, candles[2][0], 'kontrola: piątkowy dzień handlowy zaczyna się w t świecy');
    assert.equal(bx.from(fri.from), sc.x(2 - 0.5), 'lewa krawędź świecy piątkowej');
    assert.equal(bx.to(fri.to), sc.x(2 + 0.5), 'prawa krawędź świecy piątkowej, mimo 72 h do następnej świecy');
    assert.equal(bx.from(mon.from), sc.x(3 - 0.5));
    assert.equal(bx.to(mon.to), sc.x(3 + 0.5));
    // święto w czwartek 22.10 nie ma świecy: obie krawędzie w szwie za ostatnią świecą dnia przed nim (tu: przed pierwszą świecą po przerwie)
    const gap = [[d(13, 22), 1, 2, 0, 1, 1], [d(15, 22), 1, 2, 0, 1, 1]]; // brak sesji czwartku 15.10 (świeca o t = d(14, 22))
    const thu = await range('2026-10-15');
    const a = N.bandX(gap, step, sc).from(thu.from), b = N.bandX(gap, step, sc).to(thu.to);
    assert.equal(a, b, 'brak świecy: zero szerokości w szwie, geometria rozszerza do 4 px');
  });

  test('newsy-08: godzinowe interwały: początek w przerwie (17-18 ET, weekend) schodzi na lewą krawędź następnej świecy, koniec na prawą poprzedniej', async () => {
    const N = await lib('public/js/newsy.js');
    // świece 5 min: pn 6.07.2026 od 18:00 ET niedzielę (22:00Z 5.07) ... dla prostoty dwa pasma: do 17:00 ET (21:00Z) i od 18:00 ET (22:00Z) tego samego dnia
    const a0 = utc(2026, 7, 6, 20, 0), candles = [];
    for (let t = a0; t < utc(2026, 7, 6, 21); t += 300) candles.push([t, 1, 2, 0, 1, 1]); // 16:00-17:00 ET: 12 świec
    for (let t = utc(2026, 7, 6, 22); t < utc(2026, 7, 6, 23); t += 300) candles.push([t, 1, 2, 0, 1, 1]); // 18:00-19:00 ET: 12 świec
    const sc = scale(10), bx = N.bandX(candles, 300, sc);
    assert.equal(bx.to(utc(2026, 7, 6, 21)), sc.x(11 + 0.5), '17:00 ET = prawa krawędź ostatniej świecy przed przerwą');
    assert.equal(bx.from(utc(2026, 7, 6, 21, 30)), sc.x(12 - 0.5), 'start w przerwie = lewa krawędź pierwszej świecy po niej');
    assert.equal(bx.from(utc(2026, 7, 6, 20, 30)), sc.x(6 - 0.5), 'w środku danych: dokładna chwila');
    assert.equal(bx.to(utc(2026, 7, 6, 20, 30)), sc.x(6 - 0.5), 'koniec dokładnie na początku świecy 20:30 (świeca 20:25 kończy się tam)');
  });

  test('newsy-08: rysowanie: pasek domyślnie niewidoczny, pokazywany tylko dla napisu pod wskaźnikiem (SVG przez klasę, canvas przez getActiveBand), kolory z tokenów', async () => {
    const N = await lib('public/js/newsy.js');
    const xt = (t) => (t - 1000) / 10;
    const g = N.newsGeometry(emptyModel([lab('nd:a', 'news', 1000, 3000)]), xt, box, { from: xt, to: xt });
    const svg = N.newsSvg(g);
    assert.ok(/class="nwb news" data-k="nd:a"/.test(svg.over) && /var\(--n-blue\)/.test(svg.over), 'pasek w SVG z tokenem wagi i kluczem napisu');
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(/i.test(svg.over), 'żadnych literałów kolorów');
    assert.ok(/class="nwd news"/.test(svg.over), 'napis dnia u góry nadal jest');
    const css = src('public/features.css');
    assert.ok(/svg \.nwb \{[^}]*opacity: 0/.test(css), 'domyślnie niewidoczny');
    assert.ok(/svg \.nwb\.on \{ opacity: \.[3-6]/.test(css), 'po najechaniu delikatny (przygaszony kolor wagi)');
    const wykres = src('public/js/wykres.js'), warstwa = src('public/js/newsy-warstwa.js');
    assert.ok(/b\.key !== getActiveBand\(\)/.test(wykres) && /fillRect/.test(wykres) && /globalAlpha = 0\.55/.test(wykres), 'edytor LWC rysuje na canvasie tylko aktywny pasek, przygaszony');
    assert.ok(/bandX\(/.test(wykres) && /bandX\(/.test(src('public/js/podglad.js')), 'oba tryby podają bandX do geometrii');
    assert.ok(/classList\.toggle\('on'/.test(warstwa) && /\(nd\|ed\):/.test(warstwa) && /onActive/.test(warstwa), 'warstwa przycisków włącza pasek przy dymku napisu dnia (mysz, fokus, dotyk) i wyłącza przy zamknięciu');
  });
};
