// newsy-01: newsy makro USD, pakiet A (dane po stronie serwera). Bez sieci: źródła dostają atrapy fetch (testy/atrapa-ff.mjs, testy/atrapa-fred.mjs, nazwy zdarzeń wymyślone),
// serwer HTTP startuje z THQ_NO_NEWS=1. Model, czas Nowego Jorku, dni wolne, OPEX, FOMC, reguły, czyszczenie dat FRED, feed (parser, 429, limit godzinny), RSS Fed, scalanie, API.
import { pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { item, weekOct2026, weekMar2026, fakeFetch } from './atrapa-ff.mjs';
import { fakeFred, FAKE_KEY } from './atrapa-fred.mjs';

export default ({ test, H, assert, ROOT }) => {
  const load = async (f) => import(pathToFileURL(path.join(ROOT, 'lib', f)).href);
  const N = () => load('news.mjs');
  const S = () => load('news-sources.mjs');
  const K = () => load('news-katalog.mjs');
  const SV = () => load('news-service.mjs');
  const utc = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
  const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';
  const walk = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);

  // ---------- model i czas ----------
  test('newsy-01: model zdarzenia: walidacja, dzień ET, całodniowe od północy ET', async () => {
    const { makeEvent, makeAllDay, parseDay, etToUtc } = await N();
    const e = makeEvent({ t: utc(2026, 11, 6, 13, 30), name: ' Zorblat ', imp: 'high', kind: 'data', basis: 'rule' });
    assert.deepEqual(e, { t: utc(2026, 11, 6, 13, 30), day: '2026-11-06', name: 'Zorblat', imp: 'high', kind: 'data', allDay: false, tentative: false, src: 'off', basis: 'rule' });
    assert.equal(makeEvent({ t: utc(2026, 11, 7, 3, 30), name: 'x', imp: 'low', kind: 'data' }).day, '2026-11-06', 'noc UTC to jeszcze wieczór poprzedniego dnia w Nowym Jorku');
    assert.throws(() => makeEvent({ t: 1.5, name: 'x', imp: 'high', kind: 'data' }), /zły czas/);
    assert.throws(() => makeEvent({ t: 1, name: '  ', imp: 'high', kind: 'data' }), /bez nazwy/);
    assert.throws(() => makeEvent({ t: 1, name: 'x', imp: 'purple', kind: 'data' }), /zła waga „purple”/);
    assert.throws(() => makeEvent({ t: 1, name: 'x', imp: 'high', kind: 'party' }), /zły rodzaj/);
    assert.throws(() => makeEvent({ t: 1, name: 'x', imp: 'high', kind: 'data', src: 'web' }), /złe źródło/);
    const d = makeAllDay(parseDay('2026-07-03'), { name: 'Bank Holiday', imp: 'holiday', kind: 'holiday' });
    assert.equal(d.t, utc(2026, 7, 3, 4), 'północ ET w lipcu = 04:00 UTC');
    assert.equal(d.allDay, true);
    assert.equal(etToUtc(parseDay('2026-01-02'), 0), utc(2026, 1, 2, 5), 'północ ET zimą = 05:00 UTC');
    assert.throws(() => parseDay('2026-02-30'), /zła data/);
    assert.throws(() => parseDay('26-02-03'), /zła data/);
  });

  test('newsy-01: czas Nowego Jorku zgadza się z Intl dla każdego dnia 2010-2030 (godziny 0:00, 8:15, 8:30, 10:00, 14:00, 14:30)', async () => {
    const { etToUtc, dayNum, dateStr, etDayOf } = await N();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    let n = 0;
    for (let d = dayNum(2010, 1, 1); d < dayNum(2031, 1, 1); d++) {
      for (const [h, m] of [[0, 0], [8, 15], [8, 30], [10, 0], [14, 0], [14, 30]]) {
        const u = etToUtc(d, h, m);
        const p = Object.fromEntries(fmt.formatToParts(new Date(u * 1000)).map((x) => [x.type, x.value]));
        const got = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
        const want = `${dateStr(d)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (got !== want) assert.fail(`ET ${want} -> UTC ${iso(u)} -> Intl ${got}`);
        assert.equal(etDayOf(u), d);
        n++;
      }
    }
    assert.equal(n, 7670 * 6);
  });

  test('newsy-01: czas letni i zimowy: różnica ET-CET raz 6 h, raz 5 h, raz 6 h (tygodnie zmian w USA i w UE)', async () => {
    const { etToUtc, parseDay, todayOf, makeEvent } = await N();
    const at = (day) => etToUtc(parseDay(day), 8, 30);
    // USA zmienia czas 8.03.2026 i 1.11.2026, UE 29.03.2026 i 25.10.2026
    assert.equal(iso(at('2026-03-06')), '2026-03-06T13:30Z'); // zima USA (EST = UTC-5)
    assert.equal(iso(at('2026-03-09')), '2026-03-09T12:30Z'); // już EDT = UTC-4
    assert.equal(iso(at('2026-10-30')), '2026-10-30T12:30Z');
    assert.equal(iso(at('2026-11-02')), '2026-11-02T13:30Z');
    const warsaw = (iso8) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso8));
    assert.equal(warsaw('2026-03-06T13:30Z'), '14:30'); // 6 h różnicy
    assert.equal(warsaw('2026-03-09T12:30Z'), '13:30'); // USA przeszły na lato, UE jeszcze nie: 5 h
    assert.equal(warsaw('2026-03-31T12:30Z'), '14:30'); // obie strony na lato: 6 h
    assert.equal(warsaw('2026-10-30T12:30Z'), '13:30'); // UE wróciła do zimy (25.10), USA jeszcze lato: 5 h
    assert.equal(warsaw('2026-11-02T13:30Z'), '14:30'); // obie na zimie: 6 h
    // „dziś” w Warszawie w dniu zmiany czasu w UE (29.03.2026, doba ma 23 h): zdarzenie 8:30 ET = 12:30 UTC należy do doby, a granica doby to 23:00 UTC poprzedniego dnia
    const ev = makeEvent({ t: at('2026-03-29'), name: 'x', imp: 'high', kind: 'data' });
    const td = todayOf([ev], utc(2026, 3, 29, 10), 'Europe/Warsaw');
    assert.equal(td.from, utc(2026, 3, 28, 23));
    assert.equal(td.to - td.from, 23 * 3600);
    assert.equal(td.events.length, 1);
    assert.equal(td.day, '2026-03-29');
  });

  // ---------- dni wolne ----------
  test('newsy-01: dni wolne: przesunięcie z soboty i niedzieli, profile fed i federal, Juneteenth od 2021, Good Friday, Columbus, żałoba', async () => {
    const { holidaysUSD } = await S();
    const { dateStr } = await N();
    const set = (y, p) => new Set(holidaysUSD(y, p).map((h) => dateStr(h.day)));
    // 4 lipca 2015 w sobotę: rząd ma wolny piątek 3.07, Rezerwy Fed nie
    assert.ok(set(2015, 'federal').has('2015-07-03'));
    assert.ok(!set(2015, 'fed').has('2015-07-03'));
    assert.ok(set(2020, 'federal').has('2020-07-03'));
    // Nowy Rok w sobotę 1.01.2011: rząd 31.12.2010 (rok wcześniej), Fed nic, NYSE nic
    assert.ok(set(2010, 'federal').has('2010-12-31'));
    assert.ok(!set(2010, 'fed').has('2010-12-31'));
    assert.ok(!set(2010, 'nyse').has('2010-12-31'));
    // niedziela → poniedziałek: Boże Narodzenie 25.12.2011 → 26.12; Nowy Rok 1.01.2012 → 2.01; 4.07.2010 → 5.07; Juneteenth 19.06.2022 → 20.06
    for (const p of ['fed', 'federal', 'nyse']) {
      assert.ok(set(2011, p).has('2011-12-26'), `${p}: 26.12.2011`);
      assert.ok(set(2012, p).has('2012-01-02'), `${p}: 2.01.2012`);
      assert.ok(set(2010, p).has('2010-07-05'), `${p}: 5.07.2010`);
      assert.ok(set(2022, p).has('2022-06-20'), `${p}: Juneteenth 2022`);
    }
    // Juneteenth: pierwsza obserwacja federalna 18.06.2021 (sobota 19.06 → piątek), w 2020 jeszcze nie ma; NYSE dopiero od 2022
    assert.ok(set(2021, 'federal').has('2021-06-18'));
    assert.deepEqual([...set(2020, 'federal')].filter((d) => d.startsWith('2020-06')), []);
    assert.ok(!set(2021, 'nyse').has('2021-06-18'));
    assert.ok(set(2026, 'fed').has('2026-06-19'));
    // Good Friday tylko w NYSE; Columbus i Veterans w fed i federal, nie w NYSE
    assert.ok(set(2026, 'nyse').has('2026-04-03') && !set(2026, 'fed').has('2026-04-03'));
    assert.ok(set(2010, 'fed').has('2010-10-11') && !set(2010, 'nyse').has('2010-10-11'));
    assert.ok(set(2019, 'fed').has('2019-11-11') && !set(2019, 'nyse').has('2019-11-11'));
    assert.ok(set(2017, 'federal').has('2017-11-10'), '11.11.2017 w sobotę → piątek 10.11');
    assert.ok(!set(2017, 'fed').has('2017-11-10'));
    // święta ruchome 2026 (lista Fed k8 z raportu etapu 0)
    assert.deepEqual([...set(2026, 'fed')], ['2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25']);
    // dni żałoby i huragan
    assert.ok(set(2018, 'fed').has('2018-12-05') && set(2025, 'nyse').has('2025-01-09'));
    assert.ok(set(2012, 'nyse').has('2012-10-29') && set(2012, 'nyse').has('2012-10-30') && !set(2012, 'fed').has('2012-10-29'));
    assert.throws(() => holidaysUSD(2026, 'nieznany'), /nieznany profil/);
  });

  test('newsy-01: Bank Holiday jako zdarzenia: całodniowe, waga holiday, notatka z nazwą święta; profil wybiera konfiguracja', async () => {
    const { holidayEvents } = await S();
    const ev = holidayEvents(2026).find((e) => e.day === '2026-11-26');
    assert.deepEqual([ev.name, ev.imp, ev.kind, ev.allDay, ev.note, ev.src], ['Bank Holiday', 'holiday', 'holiday', true, 'Thanksgiving Day', 'off']);
    assert.ok(holidayEvents(2015, 'federal').some((e) => e.day === '2015-07-03'));
    assert.ok(!holidayEvents(2015, 'fed').some((e) => e.day === '2015-07-03'));
    const k = await K();
    assert.equal(k.DEFAULT_HOLIDAY_PROFILE, 'ff', 'pakiet B: domyślny profil zgodny z FF (D3)');
  });

  // ---------- OPEX ----------
  test('newsy-01: OPEX: 3. piątek, kwartalne, przesunięcie na czwartek (Good Friday 2014, Juneteenth 2026), Juneteenth 2021 jeszcze otwarta', async () => {
    const { opexDays, opexEvents } = await S();
    const { dateStr } = await N();
    const of = (y) => opexDays(y).map((o) => `${dateStr(o.day)}${o.variant === 'quarterly' ? 'Q' : ''}`);
    // 18.04.2014 = Wielki Piątek (3. piątek kwietnia): wygaśnięcie w czwartek 17.04
    assert.equal(of(2014)[3], '2014-04-17');
    assert.deepEqual(of(2014).filter((_, i) => [0, 1, 2, 4, 5].includes(i)), ['2014-01-17', '2014-02-21', '2014-03-21Q', '2014-05-16', '2014-06-20Q']);
    // 19.06.2026 = Juneteenth w piątek (NYSE zamknięta): czwartek 18.06, kwartalne
    assert.equal(of(2026)[5], '2026-06-18Q');
    // 18.06.2021: Juneteenth jeszcze nie był dniem wolnym NYSE
    assert.equal(of(2021)[5], '2021-06-18Q');
    assert.equal(of(2022)[3], '2022-04-14', 'Wielki Piątek 15.04.2022');
    assert.equal(of(2025)[3], '2025-04-17', 'Wielki Piątek 18.04.2025');
    assert.equal(of(2010)[0], '2010-01-15');
    assert.equal(of(2026)[11], '2026-12-18Q');
    for (let y = 2010; y <= 2030; y++) assert.equal(opexDays(y).length, 12);
    assert.deepEqual(of(2026).filter((s) => s.endsWith('Q')).length, 4);
    const e = opexEvents(2026)[2];
    assert.deepEqual([e.name, e.imp, e.kind, e.allDay, e.variant, e.day], ['Quarterly OPEX (triple witching)', 'opex', 'opex', true, 'quarterly', '2026-03-20']);
    assert.equal(opexEvents(2026)[0].name, 'Monthly OPEX');
  });

  // ---------- FOMC ----------
  test('newsy-01: FOMC: godziny 14:15 (do 2012), 12:30 w dni z konferencją 2011-2012, 14:00 od 20.03.2013; konferencja 14:15 i 14:30; Minutes 14:00', async () => {
    const { fomcEvents, fomcTimes } = await S();
    const ev = fomcEvents();
    const on = (day, name) => ev.filter((e) => e.day === day && e.name === name).map((e) => iso(e.t));
    assert.deepEqual(on('2010-03-16', 'FOMC Statement'), ['2010-03-16T18:15Z']); // 14:15 EDT
    assert.deepEqual(on('2010-03-16', 'FOMC Press Conference'), [], 'przed 27.04.2011 brak konferencji');
    assert.deepEqual(on('2011-04-27', 'FOMC Statement'), ['2011-04-27T16:30Z']); // 12:30 EDT
    assert.deepEqual(on('2011-04-27', 'FOMC Press Conference'), ['2011-04-27T18:15Z']); // 14:15 EDT
    assert.deepEqual(on('2012-12-12', 'FOMC Statement'), ['2012-12-12T17:30Z']); // 12:30 EST
    assert.deepEqual(on('2012-12-12', 'FOMC Press Conference'), ['2012-12-12T19:15Z']); // 14:15 EST
    assert.deepEqual(on('2012-12-12', 'FOMC Economic Projections'), ['2012-12-12T19:00Z'], 'pakiet B: projekcje 2011-2012 o 14:00 (jak FF)');
    assert.deepEqual(on('2012-08-01', 'FOMC Statement'), ['2012-08-01T18:15Z'], 'posiedzenie bez konferencji: nadal 14:15');
    // przed 2013 konferencje i projekcje tylko w dni z listy (reguła kwartalna od 2013): 21.09.2011, 13.12.2011 i 13.03.2012 bez konferencji i bez projekcji
    for (const d of ['2011-09-21', '2011-12-13', '2012-03-13', '2011-01-26', '2012-08-01']) {
      assert.deepEqual([on(d, 'FOMC Press Conference'), on(d, 'FOMC Economic Projections')], [[], []], d);
      assert.equal(on(d, 'FOMC Statement').length, 1, d);
    }
    for (const d of ['2011-04-27', '2011-06-22', '2011-11-02', '2012-01-25', '2012-04-25', '2012-06-20', '2012-09-13', '2012-12-12']) assert.equal(on(d, 'FOMC Press Conference').length, 1, d);
    assert.equal(ev.find((e) => e.day === '2012-12-12' && e.name === 'FOMC Economic Projections').unverified, undefined, 'pakiet B: godzina SEP 2011-2012 potwierdzona, flaga zdjęta');
    assert.equal(ev.find((e) => e.day === '2013-03-20' && e.name === 'FOMC Economic Projections').unverified, undefined);
    assert.deepEqual(on('2013-03-20', 'FOMC Statement'), ['2013-03-20T18:00Z']); // 14:00 EDT
    assert.deepEqual(on('2013-03-20', 'FOMC Press Conference'), ['2013-03-20T18:30Z']); // 14:30 EDT
    assert.deepEqual(on('2026-06-17', 'FOMC Statement'), ['2026-06-17T18:00Z']);
    assert.deepEqual(on('2026-06-17', 'FOMC Press Conference'), ['2026-06-17T18:30Z']);
    assert.deepEqual(on('2026-01-28', 'FOMC Statement'), ['2026-01-28T19:00Z']); // 14:00 EST
    assert.deepEqual(on('2026-01-28', 'FOMC Economic Projections'), [], 'styczeń bez projekcji');
    assert.deepEqual(on('2018-01-31', 'FOMC Press Conference'), [], '2018: konferencje tylko przy projekcjach');
    assert.equal(on('2018-03-21', 'FOMC Press Conference').length, 1);
    assert.equal(on('2019-01-30', 'FOMC Press Conference').length, 1, 'od 2019 po każdym posiedzeniu');
    assert.deepEqual(on('2019-01-30', 'FOMC Economic Projections'), []);
    assert.deepEqual(on('2014-04-09', 'FOMC Meeting Minutes'), ['2014-04-09T18:00Z'], 'Minutes z tabeli Fed (decyzja 19.03.2014)');
    // minutes nieogłoszone: decyzja + 21 dni
    const rule = ev.filter((e) => e.name === 'FOMC Meeting Minutes' && e.basis === 'rule').map((e) => e.day);
    assert.ok(rule.includes('2026-11-18') && rule.includes('2026-12-30'));
    assert.deepEqual(on('2026-01-07', 'FOMC Meeting Minutes'), [], 'rok Minutes: grudniowa decyzja 2025 ma Minutes 30.12.2025, a 2020 przechodzi na styczeń 2021');
    assert.deepEqual(on('2021-01-06', 'FOMC Meeting Minutes'), ['2021-01-06T19:00Z']);
    // nadzwyczajne 2020: 3.03 o 10:00 ET (potwierdzone), reszta z niepewną godziną
    assert.deepEqual(on('2020-03-03', 'FOMC Statement'), ['2020-03-03T15:00Z']);
    assert.equal(ev.find((e) => e.day === '2020-03-15' && e.name === 'Federal Funds Rate').tentative, false, 'pakiet B: 15.03.2020 17:00 potwierdzone');
    assert.equal(ev.find((e) => e.day === '2020-03-03' && e.name === 'Federal Funds Rate').tentative, false);
    assert.equal(ev.filter((e) => e.name === 'Federal Funds Rate').length, ev.filter((e) => e.name === 'FOMC Statement').length);
    // reguły czasu wprost
    assert.deepEqual(fomcTimes('2012-12-12'), { press: true, sep: true, statement: '12:30', conference: '14:15', projections: '14:00' });
    assert.deepEqual(fomcTimes('2026-09-16'), { press: true, sep: true, statement: '14:00', conference: '14:30', projections: '14:00' });
    assert.ok(ev.every((e) => ['high', 'medium'].includes(e.imp) && e.kind === 'fomc' && e.src === 'off'), 'waga z tabeli wag zależnych od daty (pakiet B)');
    assert.ok(ev.filter((e) => e.name === 'FOMC Statement').every((e) => e.imp === 'high'), 'oświadczenie zawsze czerwone');
  });

  // ---------- reguły ----------
  test('newsy-01: reguły: ISM (1. i 3. dzień roboczy), Claims (święto = środa), ADP (środa przed NFP), CB (ostatni wtorek)', async () => {
    const { ruleEvents } = await S();
    const { parseDay } = await N();
    const find = (list, name) => list.filter((e) => e.name === name).map((e) => e.day);
    const r12 = ruleEvents(2012);
    assert.ok(find(r12, 'ISM Manufacturing PMI').includes('2012-01-03'), 'Nowy Rok w niedzielę 1.01 → święto poniedziałek 2.01 → pierwszy dzień roboczy to 3.01');
    assert.ok(find(r12, 'ISM Services PMI').includes('2012-01-05'));
    const r15 = ruleEvents(2015);
    assert.ok(find(r15, 'ISM Services PMI').includes('2015-07-06'), '3.07.2015 święto rządowe: trzeci dzień roboczy to 6.07');
    assert.ok(find(r15, 'ISM Manufacturing PMI').includes('2015-07-01'));
    const r26 = ruleEvents(2026, [parseDay('2026-07-02'), parseDay('2026-11-06')]);
    assert.ok(find(r26, 'ISM Manufacturing PMI').includes('2026-11-02') && find(r26, 'ISM Services PMI').includes('2026-11-04'));
    assert.ok(find(r26, 'Unemployment Claims').includes('2026-11-25') && !find(r26, 'Unemployment Claims').includes('2026-11-26'), 'Thanksgiving: środa');
    assert.ok(find(r26, 'Unemployment Claims').includes('2026-11-05'));
    assert.ok(find(r26, 'Unemployment Claims').includes('2026-12-24') && find(r26, 'Unemployment Claims').includes('2026-12-31') && find(r26, 'Unemployment Claims').includes('2026-01-08'));
    assert.ok(find(ruleEvents(2025), 'Unemployment Claims').includes('2025-06-18'), 'Juneteenth w czwartek 19.06.2025: środa');
    assert.equal(find(r26, 'Unemployment Claims').filter((d) => d.startsWith('2026-01')).join(), '2026-01-08,2026-01-15,2026-01-22,2026-01-29');
    assert.ok(find(r26, 'Unemployment Claims').includes('2025-12-31'), '1.01.2026 to czwartek i święto: Claims w środę 31.12.2025');
    assert.deepEqual(find(r26, 'ADP Non-Farm Employment Change'), ['2026-07-01', '2026-11-04'], 'środa przed NFP: piątek 6.11 → 4.11, czwartek 2.07 → 1.07');
    assert.ok(find(r26, 'CB Consumer Confidence').includes('2026-10-27'));
    assert.deepEqual(ruleEvents(2026).filter((e) => e.name.startsWith('ADP')), [], 'bez dat NFP nie zgadujemy ADP');
    const adp = r26.find((e) => e.name.startsWith('ADP'));
    assert.equal(iso(adp.t), '2026-07-01T12:15Z');
    assert.ok(r26.every((e) => e.basis === 'rule' && e.src === 'off'));
  });

  // ---------- FRED ----------
  test('newsy-01: czyszczenie dat FRED: pierwsza data miesiąca, luty ostatnia, odrzucenie rewizji rocznej, GDP z wyjątkami po shutdownach', async () => {
    const { curateDates, gdpKind, umichKind, fredEvents } = await S();
    const k = await K();
    const rel = (rid) => k.FRED_RELEASES.find((r) => r.rid === rid);
    assert.deepEqual(curateDates(rel(50).curate, ['2024-08-02', '2024-08-21', '2024-09-06']), ['2024-08-02', '2024-09-06']);
    assert.deepEqual(curateDates(rel(10).curate, ['2023-01-12', '2023-02-10', '2023-02-14', '2023-03-14']), ['2023-01-12', '2023-02-14', '2023-03-14']);
    assert.deepEqual(curateDates(rel(46).curate, ['2026-01-14', '2026-01-30']), ['2026-01-14', '2026-01-30'], 'dwie prawdziwe daty w styczniu zostają');
    assert.deepEqual(curateDates(rel(9).curate, ['2024-04-15', '2024-04-23', '2019-04-01', '2019-04-18']), ['2019-04-01', '2019-04-18', '2024-04-15']);
    assert.deepEqual(curateDates(rel(9).curate, ['2024-05-30']), ['2024-05-30'], 'jedyna data miesiąca zostaje');
    assert.deepEqual(curateDates(rel(11).curate, ['2011-01-18', '2011-01-28', '2013-11-19']), ['2011-01-28', '2013-11-19']);
    assert.deepEqual(curateDates(rel(53).curate, ['2014-01-10', '2014-01-30', '2013-08-01', '2013-08-29', '2013-12-05', '2013-12-20', '2013-11-01', '2013-11-07', '2021-09-24', '2021-09-30']),
      ['2013-08-29', '2013-11-07', '2013-12-05', '2013-12-20', '2014-01-30', '2021-09-30']);
    assert.equal(curateDates(null, ['2020-01-01'])[0], '2020-01-01');
    assert.throws(() => curateDates({ rule: 'x' }, ['2020-01-01']), /nieznana reguła/);
    // rodzaj publikacji GDP: z miesiąca, z wyjątkami
    assert.deepEqual(['2026-10-29', '2026-11-25', '2026-12-23', '2019-02-28', '2019-03-28', '2026-02-20', '2026-04-09'].map(gdpKind), ['advance', 'second', 'third', 'advance', 'third', 'advance', 'third']);
    assert.deepEqual(['2026-11-12', '2026-11-25', '2026-10-01'].map(umichKind), ['final', 'final', 'final'], 'pakiet B: każda data FRED rid 91 to odczyt końcowy');
    // zdarzenia: godziny z katalogu, czas zimowy i letni
    const ev = fredEvents({ 10: ['2026-11-10', '2026-07-14'], 53: ['2026-10-29'], 91: ['2026-11-25', '2026-10-01'], 192: ['2026-11-03'] });
    const at = (name, day) => ev.filter((e) => e.name === name && e.day === day).map((e) => iso(e.t));
    assert.deepEqual(at('CPI m/m', '2026-11-10'), ['2026-11-10T13:30Z']);
    assert.deepEqual(at('Core CPI m/m', '2026-07-14'), ['2026-07-14T12:30Z']);
    assert.deepEqual(at('Advance GDP q/q', '2026-10-29'), ['2026-10-29T12:30Z']);
    assert.deepEqual(at('Advance GDP Price Index q/q', '2026-10-29'), ['2026-10-29T12:30Z']);
    assert.deepEqual(at('Prelim GDP q/q', '2026-10-29'), [], 'wydanie z października to pierwsza estymata');
    assert.deepEqual(at('JOLTS Job Openings', '2026-11-03'), ['2026-11-03T15:00Z']);
    assert.deepEqual(at('Revised UoM Consumer Sentiment', '2026-11-25'), ['2026-11-25T15:00Z']);
    assert.deepEqual(at('Revised UoM Consumer Sentiment', '2026-10-01'), ['2026-10-01T14:00Z'], 'pakiet B: odczyt końcowy bywa 1. dnia następnego miesiąca (FF tak go pokazuje)');
    assert.deepEqual(at('Prelim UoM Consumer Sentiment', '2026-11-13'), ['2026-11-13T15:00Z'], 'wstępny: piątek tygodnia „końcowy - 14 dni”');
    assert.ok(ev.every((e) => e.basis === 'fred' && e.kind === 'data'));
    assert.deepEqual(fredEvents({ 10: ['2009-12-10'] }), [], 'przed 2010 pomijamy');
  });

  test('newsy-01: klient FRED: klucz tylko w zapytaniu do api.stlouisfed.org, redirect zabroniony, błędy bez klucza, adres obcy odrzucony', async () => {
    const { createFred } = await S();
    const f = fakeFred({ 10: ['2026-11-10', '2026-12-10', '2026-11-10', 'zepsuta'] });
    const c = createFred({ key: FAKE_KEY, fetchImpl: f });
    assert.deepEqual(await c.releaseDates(10), ['2026-11-10', '2026-12-10'], 'duplikaty i śmieci odpadają, wynik posortowany');
    const call = f.calls[0];
    assert.equal(call.host, 'api.stlouisfed.org');
    assert.equal(call.path, '/fred/release/dates');
    assert.equal(call.redirect, 'error');
    assert.match(call.url, /include_release_dates_with_no_data=true/);
    // zły klucz: 400 → bad-key, komunikat nie zawiera klucza
    const bad = createFred({ key: 'zlyklucz1234567890zlyklucz12345678', fetchImpl: fakeFred({}) });
    await assert.rejects(bad.releaseDates(10), (e) => { assert.equal(e.code, 'bad-key'); assert.ok(!e.message.includes('zlyklucz'), e.message); return true; });
    // 400 z kluczem w treści błędu serwera: wycięty
    const echo = createFred({ key: FAKE_KEY, fetchImpl: fakeFred({}, { status: 400 }) });
    await assert.rejects(echo.releaseDates(10), (e) => { assert.ok(!e.message.includes(FAKE_KEY), e.message); assert.ok(e.message.includes('***')); return true; });
    await assert.rejects(createFred({ fetchImpl: f }).releaseDates(10), (e) => e.code === 'no-key' && e.status === 409);
    await assert.rejects(createFred({ key: FAKE_KEY, fetchImpl: f, base: 'https://example.com' }).releaseDates(10), (e) => e.code === 'bad-base' && !e.message.includes(FAKE_KEY));
    assert.equal(f.calls.length, 1, 'obcy adres: zero zapytań');
    await assert.rejects(c.releaseDates(0), (e) => e.code === 'bad-rid');
    await assert.rejects(createFred({ key: FAKE_KEY, fetchImpl: async () => { throw new TypeError('fetch failed ' + FAKE_KEY); } }).releaseDates(10), (e) => e.code === 'network' && !e.message.includes(FAKE_KEY));
    await assert.rejects(createFred({ key: FAKE_KEY, fetchImpl: fakeFred({}, { status: 429 }) }).releaseDates(10), (e) => e.code === 'rate-limit');
  });

  // ---------- feed FF ----------
  test('newsy-01: rodzaj zdarzenia z tytułu feedu: przemówienia, FOMC, dane (1.4.1)', async () => {
    const { feedKind } = await S();
    for (const n of ['Plonk Member Zib Speaks', 'Plonk Chair Testifies', 'Zib Remarks']) assert.equal(feedKind(n), 'speech', n);
    for (const n of ['FOMC Statement', 'FOMC Press Conference', 'FOMC Meeting Minutes', 'Federal Funds Rate', 'Fed Announcement']) assert.equal(feedKind(n), 'fomc', n);
    for (const n of ['Zorblat Index m/m', 'Speakers Index', 'Kwarkle Stocks']) assert.equal(feedKind(n), 'data', n);
  });

  test('newsy-01: parser feedu: tylko USD, wagi, Holiday = cały dzień, północ ET = Tentative, tydzień niedziela-niedziela i etykieta ISO', async () => {
    const { parseFeed } = await S();
    const w = parseFeed(weekOct2026());
    assert.equal(w.week.label, '2026-W44');
    assert.equal(iso(w.week.start), '2026-10-25T04:00Z');
    assert.equal(iso(w.week.end), '2026-11-01T04:00Z', 'tydzień kończy się w niedzielę 1.11 o północy ET (EDT: 04:00 UTC), zmiana czasu o 2:00');
    assert.equal(w.events.length, 6);
    assert.ok(w.events.every((e) => e.src === 'ff' && e.basis === 'feed'));
    const by = (n) => w.events.find((e) => e.name === n);
    assert.deepEqual([by('Zorblat Index m/m').imp, iso(by('Zorblat Index m/m').t)], ['high', '2026-10-27T12:30Z']);
    assert.equal(by('Wibbly Output q/q').imp, 'medium');
    assert.equal(by('Kwarkle Stocks').imp, 'low');
    const tent = by('Plonk Chair Speaks');
    assert.deepEqual([tent.tentative, tent.allDay, iso(tent.t)], [true, false, '2026-10-29T04:00Z']);
    assert.equal(tent.kind, 'speech', 'wystąpienie z feedu to przemówienie, nie dane (1.4.1)');
    assert.equal(by('Zorblat Index m/m').kind, 'data');
    const hol = by('Grundle Holiday');
    assert.deepEqual([hol.imp, hol.kind, hol.allDay, hol.tentative, hol.day], ['holiday', 'holiday', true, false, '2026-10-30']);
    // tydzień ze zmianą czasu w USA: offsety -04:00 po niedzieli 8.03
    const m = parseFeed(weekMar2026());
    assert.equal(m.week.label, '2026-W11');
    assert.equal(iso(m.events[0].t), '2026-03-10T12:30Z');
    // nieznana waga albo brak zdarzeń USD to błąd formatu (bad-feed): odpowiedź odrzucona w całości; USD bez tytułu lub daty liczy się jako pominięte
    assert.throws(() => parseFeed([item('Zorblat Index m/m', '2026-10-27T08:30:00-04:00', 'Strange')]), (e) => e.code === 'bad-feed' && /Strange/.test(e.message));
    assert.throws(() => parseFeed([item('Zorblat Index m/m', '2026-10-27T08:30:00-04:00', 'High'), item('Wibbly Output q/q', '2026-10-27T09:00:00-04:00', 'Non-Economic')]), (e) => e.code === 'bad-feed');
    assert.throws(() => parseFeed([item('Zorblat Index m/m', '2026-10-27T08:30:00-04:00', 'High', 'EUR'), item('Snorf Balance', '2026-10-28T08:30:00-04:00', 'Low', 'CAD')]), (e) => e.code === 'bad-feed', 'zero zdarzeń USD');
    const odd = parseFeed([item('Zorblat Index m/m', '2026-10-27T08:30:00-04:00', 'Low'), item('', '2026-10-27T08:30:00-04:00'), item('Brak daty', 'nie-data')]);
    assert.equal(odd.events.length, 1);
    assert.equal(odd.skipped, 2);
    for (const bad of [null, {}, [], 'x', [{ country: 'USD' }]]) assert.throws(() => parseFeed(bad), (e) => e.code === 'bad-feed');
  });

  test('newsy-01: usługa feedu: zapis tygodnia, limit 1 zapytanie/h, 429 z Retry-After, brak sieci ponawiany po 10 min, tylko adres feedu', async () => {
    const { createNews, FEED_MIN_INTERVAL_MS } = await SV();
    const k = await K();
    const base = H.tmp();
    let clock = utc(2026, 10, 28, 15) * 1000;
    const f = fakeFetch([{ json: weekOct2026() }]);
    const svc = createNews({ baseDir: base, shippedFile: path.join(base, 'brak.json'), fetchImpl: f, now: () => clock, userAgent: 'JustJournal/test', log: () => {} });
    const r = await svc.refreshFeed();
    assert.deepEqual(r, { ok: true, week: '2026-W44', count: 6 });
    const feedCalls = () => f.calls.filter((c) => c.url === k.FEED_URL);
    assert.equal(feedCalls().length, 1);
    assert.equal(f.calls[0].url, k.FEED_URL);
    assert.equal(new URL(f.calls[0].url).hostname, 'nfs.faireconomy.media');
    assert.equal(f.calls[0].headers['User-Agent'], 'JustJournal/test');
    assert.equal(f.calls[0].redirect, 'error');
    const file = path.join(base, 'news/ff/2026-W44.json');
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.events.length, 6);
    assert.equal(saved.start, utc(2026, 10, 25, 4));
    // drugie wywołanie w ciągu godziny: bez zapytania
    clock += 59 * 60_000;
    assert.equal((await svc.refreshFeed()).skipped, true);
    assert.equal(feedCalls().length, 1);
    assert.equal((await svc.tick()).feed, undefined, 'tick też czeka');
    assert.equal(feedCalls().length, 1);
    clock += 2 * 60_000;
    assert.equal((await svc.refreshFeed()).ok, true);
    assert.equal(feedCalls().length, 2);
    // status po restarcie (nowy obiekt, ten sam katalog): nextAllowedAt przeżywa
    const again = createNews({ baseDir: base, shippedFile: path.join(base, 'brak.json'), fetchImpl: f, now: () => clock + 5 * 60_000, log: () => {} });
    assert.equal((await again.refreshFeed()).skipped, true);
    assert.equal(feedCalls().length, 2);
    // 429 z Retry-After 2 h: czekamy 2 h, nie godzinę
    const base2 = H.tmp();
    let c2 = utc(2026, 10, 28, 15) * 1000;
    const f2 = fakeFetch([{ status: 429, headers: { 'Retry-After': '7200' }, json: {} }, { json: weekOct2026() }]);
    const s2 = createNews({ baseDir: base2, shippedFile: path.join(base2, 'brak.json'), fetchImpl: f2, now: () => c2, log: () => {} });
    await assert.rejects(s2.refreshFeed(), (e) => e.code === 'rate-limit' && e.status === 429 && e.retryAfterSec === 7200);
    assert.equal(s2.status().feed.nextAllowedAt, c2 + 7200_000);
    assert.equal(s2.status().feed.lastError.code, 'rate-limit');
    c2 += 3600_000 + 1;
    assert.equal((await s2.refreshFeed()).skipped, true, 'po godzinie nadal czekamy: serwer kazał 2 h');
    c2 += 3600_000;
    assert.equal((await s2.refreshFeed()).ok, true);
    assert.equal(f2.calls.length, 2);
    // 429 bez nagłówka: godzina
    const base3 = H.tmp();
    let c3 = utc(2026, 10, 28, 15) * 1000;
    const s3 = createNews({ baseDir: base3, shippedFile: path.join(base3, 'brak.json'), fetchImpl: fakeFetch([{ status: 429, json: {} }]), now: () => c3, log: () => {} });
    await assert.rejects(s3.refreshFeed(), (e) => e.code === 'rate-limit');
    assert.equal(s3.status().feed.nextAllowedAt, c3 + FEED_MIN_INTERVAL_MS);
    // brak sieci: ponowienie po 10 minutach, nic się nie psuje, odczyty działają
    const base4 = H.tmp();
    let c4 = utc(2026, 10, 28, 15) * 1000;
    const f4 = fakeFetch([Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND nfs.faireconomy.media'), { code: 'ENOTFOUND' }) })]);
    const s4 = createNews({ baseDir: base4, shippedFile: path.join(base4, 'brak.json'), fetchImpl: f4, now: () => c4, log: () => {} });
    await assert.rejects(s4.refreshFeed(), (e) => e.code === 'network' && e.preSend === true);
    assert.equal(s4.status().feed.nextAllowedAt, c4 + 10 * 60_000, 'ENOTFOUND: żądanie nie wyszło, ponowienie po 10 minutach');
    assert.ok(Array.isArray(s4.range(utc(2026, 10, 26), utc(2026, 10, 27)).events));
    c4 += 11 * 60_000;
    await assert.rejects(s4.refreshFeed(), (e) => e.code === 'network');
    assert.equal(f4.calls.length, 2);
    // błędy, po których żądanie mogło dotrzeć do FF (timeout, przekierowanie, zerwane połączenie): pełna godzina; ECONNREFUSED i EAI_AGAIN: 10 minut
    const sec = [
      [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), 'timeout', 3600_000],
      [Object.assign(new TypeError('fetch failed'), { cause: new Error('unexpected redirect') }), 'network', 3600_000],
      [Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' }) }), 'network', 3600_000],
      [new TypeError('fetch failed'), 'network', 3600_000],
      [Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) }), 'network', 600_000],
      [Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('again'), { code: 'EAI_AGAIN' }) }), 'network', 600_000],
    ];
    for (const [err, code, wait] of sec) {
      const b = H.tmp();
      const s = createNews({ baseDir: b, shippedFile: path.join(b, 'brak.json'), fetchImpl: fakeFetch([err]), now: () => c3, log: () => {} });
      await assert.rejects(s.refreshFeed(), (e) => e.code === code);
      assert.equal(s.status().feed.nextAllowedAt, c3 + wait, `${err.cause?.code ?? err.name}: ${wait / 60_000} min`);
    }
    // odpowiedź nie jest feedem: nie nadpisuje, kod bad-feed
    const base5 = H.tmp();
    const s5 = createNews({ baseDir: base5, shippedFile: path.join(base5, 'brak.json'), fetchImpl: fakeFetch([{ json: { error: 'x' } }]), now: () => c3, log: () => {} });
    await assert.rejects(s5.refreshFeed(), (e) => e.code === 'bad-feed');
    assert.deepEqual(walk(path.join(base5, 'news/ff')), []);
    // nieznana waga i zero zdarzeń USD: błąd w statusie, brak zapisu tygodnia, dane oficjalne tego tygodnia zostają
    for (const bad of [[...weekOct2026(), item('Plonk Zeta', '2026-10-28T11:00:00-04:00', 'Critical')], weekOct2026().map((x) => ({ ...x, country: 'EUR' }))]) {
      const b = H.tmp();
      const s = createNews({ baseDir: b, shippedFile: path.join(b, 'brak.json'), fetchImpl: fakeFetch([{ json: bad }]), now: () => c3, log: () => {} });
      await assert.rejects(s.refreshFeed(), (e) => e.code === 'bad-feed');
      assert.equal(s.status().feed.lastError.code, 'bad-feed');
      assert.equal(s.status().feed.weeksStored, 0);
      assert.deepEqual(walk(path.join(b, 'news/ff')), []);
      assert.ok(s.range(utc(2026, 10, 28), utc(2026, 10, 29)).events.some((e) => e.src === 'off' && e.name === 'Federal Funds Rate'), 'dane oficjalne nie zostały zastąpione');
    }
  });

  test('newsy-01: limity rozmiaru odpowiedzi: content-length odrzuca bez czytania, strumień przerywany po limicie (feed 1 MB, FRED 2 MB, Fed 5 MB)', async () => {
    const { readCapped, MAX_BYTES, createFeedClient, createFred, createFedArchiveClient } = await S();
    assert.deepEqual([MAX_BYTES.feed, MAX_BYTES.fred, MAX_BYTES.finnhub, MAX_BYTES.fed], [1048576, 2097152, 2097152, 5242880]);
    // wczesne odrzucenie po content-length: treść nie jest czytana ani jednego bajtu
    let pulled = 0;
    const big = new Response(new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); } }), { headers: { 'content-length': String(3 * 1048576) } });
    await assert.rejects(readCapped(big, 1048576, 'Feed'), (e) => e.code === 'too-big' && /Feed/.test(e.message) && /1 MB/.test(e.message));
    assert.ok(pulled <= 1, 'strumień nie był czytany');
    // bez content-length: czytanie przerwane tuż po przekroczeniu limitu (nie do końca nieskończonego strumienia)
    let chunks = 0;
    const endless = new Response(new ReadableStream({ pull(c) { chunks++; c.enqueue(new Uint8Array(65536)); } }));
    await assert.rejects(readCapped(endless, 1048576, 'Feed'), (e) => e.code === 'too-big');
    assert.ok(chunks > 15 && chunks < 40, `przerwano po ${chunks} porcjach`);
    // mieści się w limicie; zwykłe odpowiedzi atrap (tylko text())
    assert.equal(await readCapped(new Response('abc'), 10), 'abc');
    assert.equal(await readCapped({ headers: { get: () => null }, text: async () => 'xyz' }, 10), 'xyz');
    await assert.rejects(readCapped({ headers: { get: () => null }, text: async () => 'x'.repeat(11) }, 10), (e) => e.code === 'too-big');
    // klienci: każdy z własnym limitem
    const tooBig = (n) => async () => new Response('x'.repeat(8), { status: 200, headers: { 'content-length': String(n) } });
    await assert.rejects(createFeedClient({ fetchImpl: tooBig(1048577) }).fetchWeek(), (e) => e.code === 'too-big');
    await assert.rejects(createFred({ key: FAKE_KEY, fetchImpl: tooBig(2097153) }).releaseDates(10), (e) => e.code === 'too-big' && !e.message.includes(FAKE_KEY));
    await assert.rejects(createFedArchiveClient({ fetchImpl: tooBig(5242881) }).fetchItems(), (e) => e.code === 'too-big');
    const ok = await createFedArchiveClient({ fetchImpl: async () => new Response('[]', { status: 200, headers: { 'content-length': '5242880' } }) }).fetchItems().catch((e) => e);
    assert.equal(ok.code, undefined, 'dokładnie 5 MB wg nagłówka mieści się w limicie');
    // usługa: odpowiedź za duża to błąd bez zapisu
    const { createNews } = await SV();
    const b = H.tmp();
    const svc = createNews({ baseDir: b, shippedFile: path.join(b, 'brak.json'), fetchImpl: tooBig(5 << 20), now: () => utc(2026, 10, 28, 15) * 1000, log: () => {} });
    await assert.rejects(svc.refreshFeed(), (e) => e.code === 'too-big');
    assert.deepEqual(walk(path.join(b, 'news/ff')), []);
  });

  test('newsy-01: adres spoza listy: strony forexfactory.com nigdy nie są pobierane, obcy adres feedu i RSS odrzucony bez zapytania', async () => {
    const { createFeedClient, createFedArchiveClient, checkHost } = await S();
    for (const url of ['https://www.forexfactory.com/calendar?month=this', 'https://forexfactory.com/calendar', 'http://nfs.faireconomy.media/x', 'https://evil.example/ff_calendar_thisweek.json']) {
      const f = fakeFetch([{ json: [] }]);
      await assert.rejects(createFeedClient({ url, fetchImpl: f }).fetchWeek(), (e) => e.code === 'bad-base', url);
      assert.equal(f.calls.length, 0, url);
    }
    const f = fakeFetch([{ text: '' }]);
    await assert.rejects(createFedArchiveClient({ base: 'https://example.com', fetchImpl: f }).fetchItems(), (e) => e.code === 'bad-base');
    assert.equal(f.calls.length, 0);
    assert.ok(checkHost('http://127.0.0.1:9/x', ['www.federalreserve.gov']) && !checkHost('http://example.com', ['example.com']));
    // w kodzie aplikacji jedyny adres FF to feed
    const src = readdirSync(path.join(ROOT, 'lib')).filter((n) => /^news/.test(n)).map((n) => readFileSync(path.join(ROOT, 'lib', n), 'utf8')).join('\n') + readFileSync(path.join(ROOT, 'server.mjs'), 'utf8');
    const urls = [...src.matchAll(/https?:\/\/[a-z0-9.-]*(forexfactory|faireconomy)[a-z0-9./_?=-]*/gi)].map((m) => m[0]);
    assert.deepEqual([...new Set(urls)], ['https://nfs.faireconomy.media/ff_calendar_thisweek.json']);
  });

  // ---------- archiwa Fed ----------
  const archive = (rows) => '\uFEFF\r\n\r\n[' + rows.map((r) => JSON.stringify({ d: r[0], t: r[1], s: r[2], lo: 'At a wymyslone miejsce', l: r[3], a: '', o: 'no', v: '', video: 'No' })).join(',') + ']';
  const SPEECHES = archive([
    ['8/26/2022 10:00:00 AM', 'Wymyslony temat Jackson', 'Chair Jerome H. Powell', '/newsevents/speech/powell20220826a.htm'],
    ['8/27/2020 9:10:00 AM', 'Wymyslony temat 2020 &amp; &quot;cytat&quot;', 'Chair Jerome H. Powell', '/newsevents/speech/powell20200827a.htm'],
    ['12/3/2014 12:00:00 PM', 'Wymyslone poludnie', 'Chair Janet L. Yellen', '/newsevents/speech/yellen20141203a.htm'],
    ['1/5/2011 12:00:00 AM', 'Wymyslona polnoc', 'Chairman  Ben S. Bernanke', '/newsevents/speech/bernanke20110105a.htm'],
    ['8/22/2008', 'Wymyslony stary bez godziny', 'Chairman Ben S. Bernanke', '/newsevents/speech/bernanke20080822a.htm'],
    ['3/15/2011', 'Wymyslony bez godziny po 2010', 'Chairman Ben S. Bernanke', '/newsevents/speech/bernanke20110315a.htm'],
    ['10/14/2026 10:55:00 PM', 'Wymyslony wice', 'Vice Chair for Supervision Michelle W. Bowman', '/newsevents/speech/bowman20261014a.htm'],
    ['5/31/2026 9:00:00 AM', 'Wymyslony gubernator', 'Governor Jerome H. Powell', '/newsevents/speech/powell20260531a.htm'],
    ['9/9/2026 9:00:00 AM', 'Wymyslony zly format', 'Chairman Kevin Warsh', '/newsevents/speech/warsh20260909a.htm'],
    ['nie-data', 'Wymyslona zla data', 'Chair Jerome H. Powell', '/newsevents/speech/powell0a.htm'],
  ]);
  const TESTIMONY = archive([
    ['2/11/2025 10:00:00 AM', 'Semiannual Monetary Policy Report to the Congress', 'Chair Jerome H. Powell', '/newsevents/testimony/powell20250211a.htm'],
    ['3/2/2022 8:30:00 AM', 'Wymyslone zeznanie pro tempore', 'Chair Pro Tempore Jerome H. Powell ', '/newsevents/testimony/powell20220302a.htm'],
    ['7/14/2026 8:30:00 AM', 'Wymyslone zeznanie Warsha', 'Chairman Kevin Warsh', '/newsevents/testimony/warsh20260714a.htm'],
  ]);

  test('newsy-01: archiwa Fed: data ET (AM/PM, południe i północ, DST), pozycje bez godziny, BOM, przewodniczący z tytułu mówcy, flaga unverified', async () => {
    const { parseArchiveDate, chairOfSpeaker, parseFedArchives, speechEvents, chairOn, unent } = await S();
    // trzy znane przykłady z archiwum: Jackson Hole 10:00 ET (lato), 9:10 ET (lato), zeznanie 10:00 ET (zima)
    assert.equal(iso(parseArchiveDate('8/26/2022 10:00:00 AM').t), '2022-08-26T14:00Z');
    assert.equal(iso(parseArchiveDate('8/27/2020 9:10:00 AM').t), '2020-08-27T13:10Z');
    assert.equal(iso(parseArchiveDate('2/11/2025 10:00:00 AM').t), '2025-02-11T15:00Z');
    assert.equal(iso(parseArchiveDate('10/14/2026 10:55:00 PM').t), '2026-10-15T02:55Z', 'zgodne z RSS Fed (02:55 GMT)');
    assert.equal(iso(parseArchiveDate('10/8/2026 4:30:00 AM').t), '2026-10-08T08:30Z', 'zgodne z RSS Fed (08:30 GMT)');
    assert.equal(iso(parseArchiveDate('12/3/2014 12:00:00 PM').t), '2014-12-03T17:00Z', '12 PM to południe');
    assert.equal(iso(parseArchiveDate('1/5/2011 12:00:00 AM').t), '2011-01-05T05:00Z', '12 AM to północ');
    assert.deepEqual(parseArchiveDate('8/22/2008'), { t: utc(2008, 8, 22, 4), timed: false });
    for (const bad of ['nie-data', '', null, '13/1/2020', '2/30/2020 10:00:00 AM', '2/3/2020 13:00:00 AM', '2/3/2020 10:61:00 AM']) assert.equal(parseArchiveDate(bad), null, String(bad));
    // przewodniczący z tytułu
    assert.deepEqual(chairOfSpeaker('Chair Jerome H. Powell'), { role: 'Chair', who: 'Powell' });
    assert.deepEqual(chairOfSpeaker('Chairman  Ben S. Bernanke'), { role: 'Chairman', who: 'Bernanke' });
    assert.deepEqual(chairOfSpeaker('Chair Pro Tempore Jerome H. Powell '), { role: 'Chair', who: 'Powell' });
    for (const no of ['Vice Chair for Supervision Michelle W. Bowman', 'Vice Chair Philip N. Jefferson', 'Governor Jerome H. Powell', 'President John Williams', '', null]) assert.equal(chairOfSpeaker(no), null, String(no));
    // parser: BOM i puste linie, tylko od 2010, tylko przewodniczący, nieczytelne daty policzone
    const r = parseFedArchives({ speech: SPEECHES, testimony: TESTIMONY });
    assert.equal(r.total, 13);
    assert.equal(r.skipped, 1, 'zła data przewodniczącego');
    assert.deepEqual(r.items.map((x) => x.link.split('/').pop()), ['bernanke20110105a.htm', 'bernanke20110315a.htm', 'yellen20141203a.htm', 'powell20200827a.htm', 'powell20220302a.htm', 'powell20220826a.htm', 'powell20250211a.htm', 'warsh20260714a.htm', 'warsh20260909a.htm']);
    assert.equal(r.items.find((x) => x.link.includes('powell20200827a')).title, 'Wymyslony temat 2020 & "cytat"', 'encje HTML rozkodowane');
    assert.deepEqual(r.items.filter((x) => !x.timed).map((x) => x.link.split('/').pop()), ['bernanke20110315a.htm']);
    assert.equal(r.items.find((x) => x.link.includes('powell20220302a')).k, 'testimony');
    assert.throws(() => parseFedArchives({ speech: '<html>', testimony: '[]' }), (e) => e.code === 'bad-archive');
    // zdarzenia: waga high, godzina z archiwum, flaga unverified zamiast tentative, brak godziny = tentative
    const ev = speechEvents(r.items);
    const jh = ev.find((e) => e.name.includes('Jackson'));
    assert.deepEqual([jh.name, jh.imp, jh.kind, jh.basis, jh.unverified, jh.tentative, jh.note, iso(jh.t)], ['Chair Powell: Wymyslony temat Jackson', 'high', 'speech', 'fed', true, false, 'Speech', '2022-08-26T14:00Z']);
    assert.equal(ev.find((e) => e.name.includes('2025') || e.name.includes('Semiannual')).note, 'Testimony');
    assert.deepEqual(ev.filter((e) => e.tentative).map((e) => e.day), ['2011-03-15']);
    assert.ok(ev.every((e) => e.src === 'off' && e.unverified === true));
    assert.equal(unent('a &amp; b &#39;c&#39; &uuml;'), "a & b 'c' &uuml;");
    assert.ok(chairOn('Powell', '2020-03-15') && !chairOn('Powell', '2026-06-01'), 'zapas FED_CHAIRS');
  });

  test('newsy-01: usługa archiwów Fed: odświeżenie raz dziennie, zapis, kumulacja z plikiem wydania, tylko adres Fed, pusta odpowiedź nie nadpisuje', async () => {
    const { createNews } = await SV();
    const base = H.tmp();
    let clock = utc(2026, 10, 29, 10) * 1000;
    const fetchFed = (sp = SPEECHES, te = TESTIMONY) => fakeFetch([{ text: sp }, { text: te }, { text: sp }, { text: te }]);
    const f = fetchFed();
    const shipped = path.join(base, 'wydanie-chair.json');
    const svc = createNews({ baseDir: base, shippedFile: path.join(base, 'brak.json'), shippedChairFile: shipped, fetchImpl: f, now: () => clock, log: () => {} });
    assert.equal(svc.official().filter((e) => e.kind === 'speech').length, 0);
    assert.equal((await svc.refreshSpeeches()).count, 9);
    assert.deepEqual(f.calls.map((c) => c.url), ['https://www.federalreserve.gov/json/ne-speeches.json', 'https://www.federalreserve.gov/json/ne-testimony.json']);
    assert.ok(f.calls.every((c) => c.redirect === 'error'));
    const day = svc.range(utc(2022, 8, 26), utc(2022, 8, 27)).events.filter((e) => e.kind === 'speech');
    assert.deepEqual(day.map((e) => iso(e.t)), ['2022-08-26T14:00Z']);
    // tick: archiwa dopiero po dobie
    clock += 3600_000;
    assert.equal((await svc.tick()).speeches, undefined);
    assert.equal(f.calls.filter((c) => c.url.includes('/json/')).length, 2);
    clock += 24 * 3600_000;
    const out = await svc.tick();
    assert.equal(out.speeches.ok, true);
    assert.equal(f.calls.filter((c) => c.url.includes('/json/')).length, 4);
    // plik wydania + odświeżenia: ten sam link = jedna pozycja
    const { writeFileSync } = await import('node:fs');
    writeFileSync(shipped, JSON.stringify({ schema: 1, items: [{ t: utc(2012, 6, 1, 14), timed: true, title: 'Stara z wydania', role: 'Chairman', who: 'Bernanke', k: 'speech', link: '/newsevents/speech/bernanke20120601a.htm' }, { t: 1, timed: true, title: 'Zdublowana', role: 'Chair', who: 'Powell', k: 'speech', link: '/newsevents/speech/powell20220826a.htm' }, { zepsuta: true }] }));
    const again = createNews({ baseDir: base, shippedFile: path.join(base, 'brak.json'), shippedChairFile: shipped, fetchImpl: fakeFetch([new TypeError('x')]), now: () => clock, log: () => {} });
    const all = again.official().filter((e) => e.kind === 'speech');
    assert.equal(all.length, 10);
    assert.ok(all.some((e) => e.name.includes('Stara z wydania')) && !all.some((e) => e.name.includes('Zdublowana')), 'odświeżenie wygrywa z plikiem wydania');
    // odpowiedź bez pozycji przewodniczącego nie nadpisuje zapisu
    const base2 = H.tmp();
    const empty = archive([['9/9/2026 9:00:00 AM', 'x', 'Governor Ktos Inny', '/x.htm']]);
    const s2 = createNews({ baseDir: base2, shippedFile: path.join(base2, 'b.json'), shippedChairFile: path.join(base2, 'c.json'), fetchImpl: fetchFed(empty, '[]'), now: () => clock, log: () => {} });
    await assert.rejects(s2.refreshSpeeches(), (e) => e.code === 'bad-archive');
    assert.deepEqual(walk(path.join(base2, 'news')).map((p) => path.basename(p)), ['status.json']);
  });

  test('newsy-01: plik historii przewodniczącego Fed z wydania: schemat, pozycje od 2010 posortowane, Jackson Hole 10:00 ET, wszystkie godziny z godziną', async () => {
    const j = JSON.parse(readFileSync(path.join(ROOT, 'data/news/fed-chair.json'), 'utf8'));
    assert.equal(j.schema, 1);
    assert.ok(j.items.length > 250);
    assert.ok(j.items.every((x, i) => Number.isInteger(x.t) && x.t >= utc(2010, 1, 1) && (i === 0 || x.t >= j.items[i - 1].t) && ['speech', 'testimony'].includes(x.k) && typeof x.who === 'string' && x.link.startsWith('/newsevents/')));
    const jh = j.items.find((x) => x.link === '/newsevents/speech/powell20220826a.htm');
    assert.equal(iso(jh.t), '2022-08-26T14:00Z');
    assert.ok(j.items.some((x) => x.who === 'Warsh') && j.items.some((x) => x.who === 'Bernanke') && j.items.some((x) => x.who === 'Yellen'));
    const { speechEvents } = await S();
    assert.equal(speechEvents(j.items).length, j.items.length);
  });

  // ---------- scalanie ----------
  test('newsy-01: scalanie: w tygodniu z feedu wygrywa FF, poza nim źródła oficjalne, OPEX przeżywa, duplikaty łączone po (nazwa, dzień)', async () => {
    const { mergeFeed, dedupe, makeEvent, makeAllDay, parseDay, compareEvents } = await N();
    const { parseFeed } = await S();
    const w = parseFeed(weekOct2026());
    const off = (t, name, imp = 'high') => makeEvent({ t, name, imp, kind: 'data' });
    const official = [
      off(utc(2026, 10, 27, 12, 30), 'Zorblat Index m/m'), // w tygodniu feedu, ma też odpowiednik FF → zostaje tylko FF
      off(utc(2026, 10, 27, 13, 0), 'Stare oficjalne tylko u nas'), // w tygodniu feedu, FF go nie ma → znika
      makeAllDay(parseDay('2026-10-30'), { name: 'Bank Holiday', imp: 'holiday', kind: 'holiday' }), // FF ma swoje święto
      makeAllDay(parseDay('2026-10-23'), { name: 'Monthly OPEX', imp: 'opex', kind: 'opex' }), // przed tygodniem feedu
      makeAllDay(parseDay('2026-10-28'), { name: 'Monthly OPEX', imp: 'opex', kind: 'opex' }), // OPEX w tygodniu feedu: przeżywa (FF go nie zna)
      off(utc(2026, 11, 3, 15), 'Po tygodniu feedu'),
    ];
    const merged = mergeFeed(official, [{ start: w.week.start, end: w.week.end, events: w.events }]);
    const names = merged.map((e) => `${e.src}:${e.name}`);
    assert.ok(names.includes('ff:Zorblat Index m/m') && !names.includes('off:Zorblat Index m/m'));
    assert.ok(!names.includes('off:Stare oficjalne tylko u nas'));
    assert.ok(!merged.some((e) => e.src === 'off' && e.kind === 'holiday'));
    assert.ok(merged.some((e) => e.src === 'ff' && e.kind === 'holiday'));
    assert.equal(merged.filter((e) => e.kind === 'opex').length, 2);
    assert.ok(names.includes('off:Po tygodniu feedu'));
    assert.deepEqual([...merged].sort(compareEvents), merged, 'wynik posortowany');
    assert.deepEqual(mergeFeed(official, []).length, official.length);
    // dedupe: ten sam (nazwa, dzień) → feed ponad oficjalne, godzina pewna ponad niepewną
    const a = makeEvent({ t: utc(2026, 10, 27, 12, 30), name: 'X', imp: 'high', kind: 'data' });
    const b = makeEvent({ t: utc(2026, 10, 27, 12, 45), name: 'X', imp: 'high', kind: 'data', src: 'ff', basis: 'feed' });
    const c = makeEvent({ t: utc(2026, 10, 27, 4), name: 'X', imp: 'high', kind: 'data', tentative: true });
    assert.deepEqual(dedupe([a, b]).map((e) => e.src), ['ff']);
    assert.deepEqual(dedupe([c, a]).map((e) => iso(e.t)), ['2026-10-27T12:30Z']);
    assert.equal(dedupe([a, a]).length, 1);
    // dwa zdarzenia FF o tym samym tytule tego samego dnia, ale o różnych godzinach, zostają oba; identyczne (nazwa, godzina) łączone
    const f1 = makeEvent({ t: utc(2026, 10, 27, 14), name: 'Plonk Speaks', imp: 'high', kind: 'data', src: 'ff' });
    const f2 = makeEvent({ t: utc(2026, 10, 27, 18), name: 'Plonk Speaks', imp: 'high', kind: 'data', src: 'ff' });
    assert.deepEqual(dedupe([f1, f2]).map((e) => iso(e.t)), ['2026-10-27T14:00Z', '2026-10-27T18:00Z']);
    assert.equal(dedupe([f1, { ...f1 }]).length, 1);
    // zdarzenie oficjalne o tej samej (nazwie, dniu) co któreś z feedu znika
    const offPlonk = makeEvent({ t: utc(2026, 10, 27, 12), name: 'Plonk Speaks', imp: 'high', kind: 'data' });
    assert.deepEqual(dedupe([offPlonk, f1, f2]).map((e) => e.src), ['ff', 'ff']);
  });

  // ---------- usługa: źródła oficjalne, klucz, brak sieci ----------
  test('newsy-01: plik dat z wydania: schemat, 10 wydań, posortowane daty ISO, atrybucja FRED, brak klucza; znane daty publikacji', async () => {
    const k = await K();
    const raw = readFileSync(path.join(ROOT, 'data/news/usd-oficjalne.json'), 'utf8');
    const j = JSON.parse(raw);
    assert.equal(j.schema, 1);
    assert.equal(j.attribution, k.FRED_ATTRIBUTION);
    assert.equal(j.from, '2010-01-01');
    assert.deepEqual(Object.keys(j.releases).map(Number).sort((a, b) => a - b), [...k.FRED_RIDS].sort((a, b) => a - b));
    for (const [rid, r] of Object.entries(j.releases)) {
      assert.ok(r.dates.length > 60, `wydanie ${rid}: ${r.dates.length} dat`);
      assert.ok(r.dates.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= '2010-01-01' && (i === 0 || d > r.dates[i - 1])), `wydanie ${rid}: daty ISO rosnąco`);
    }
    assert.ok(!/api_key|[0-9a-f]{32}/i.test(raw), 'w pliku nie ma klucza ani niczego, co go przypomina');
    const has = (rid, d) => j.releases[rid].dates.includes(d);
    assert.ok(has(50, '2020-06-05') && has(50, '2020-07-02') && has(50, '2015-07-02'), 'NFP: czerwiec 2020, czwartek przed 3.07');
    assert.ok(has(10, '2022-06-10') && has(10, '2026-11-10'), 'CPI: 10.06.2022 i ogłoszona przyszłość');
    assert.ok(has(53, '2023-01-26') && has(54, '2026-10-29'));
    const { buildOfficial } = await S();
    const o = buildOfficial({ fredDates: Object.fromEntries(Object.entries(j.releases).map(([r, v]) => [r, v.dates])), toYear: 2027 });
    const nfp = o.filter((e) => e.name === 'Non-Farm Employment Change');
    assert.equal(nfp.length, 203, 'jedna publikacja NFP na miesiąc 2010-2026 poza wrześniem 2025 (shutdown: brak 3.10.2025)');
    assert.equal(new Set(nfp.map((e) => e.day.slice(0, 7))).size, nfp.length, 'nie ma dwóch NFP w jednym miesiącu');
    assert.ok(nfp.every((e) => e.imp === 'high' && /T1[23]:30Z$/.test(iso(e.t))));
    const cpi = o.filter((e) => e.name === 'CPI m/m');
    assert.equal(cpi.length, 203);
    assert.equal(new Set(cpi.map((e) => e.day.slice(0, 7))).size, cpi.length);
    const c = (f) => o.filter(f).length;
    assert.ok(c((e) => e.imp === 'high') > 3000 && c((e) => e.kind === 'holiday') > 150 && c((e) => e.kind === 'opex') === 216);
    assert.deepEqual(o.filter((e) => e.t !== Math.round(e.t) || !e.name).length, 0);
  });

  test('newsy-01: usługa bez klucza i bez sieci: historia z pliku wydania działa, tick niczego nie psuje i nie woła FRED; zakresy i „dziś”', async () => {
    const { createNews } = await SV();
    const base = H.tmp();
    let clock = utc(2026, 6, 17, 16) * 1000; // środa 17.06.2026, dzień decyzji FOMC
    const f = fakeFetch([new TypeError('fetch failed')]);
    const logs = [];
    const svc = createNews({ baseDir: base, getKey: () => undefined, fetchImpl: f, now: () => clock, log: (m) => logs.push(m) });
    const out = await svc.tick();
    assert.equal(out.feed.error, 'network');
    assert.equal(out.fred, undefined, 'bez klucza FRED nie jest wołany');
    assert.ok(f.calls.every((c) => !/stlouisfed/.test(c.url)), 'zero zapytań do FRED');
    assert.ok(logs.length >= 1 && logs.every((l) => !/key|klucz=|api_key/i.test(l)));
    const st = svc.status();
    assert.equal(st.hasKey, false);
    assert.equal(st.fred.source, 'shipped');
    assert.equal(st.fred.shippedOk, true);
    assert.equal(st.holidayProfile, 'ff');
    assert.match(st.attribution, /FRED® API but is not endorsed/);
    assert.ok(st.history.byImp.high > 3000 && st.history.byKind.fomc > 500 && st.history.byKind.opex === 216);
    // zakres jednego dnia: FOMC o 14:00 ET = 18:00 UTC, PCE/CPI poza tym dniem
    const r = svc.range(utc(2026, 6, 17), utc(2026, 6, 18));
    const stmt = r.events.filter((e) => e.name === 'FOMC Statement');
    assert.deepEqual(stmt.map((e) => iso(e.t)), ['2026-06-17T18:00Z']);
    assert.ok(r.events.every((e) => e.t >= r.from || e.allDay));
    // „dziś” w Warszawie: 17.06 18:00 UTC to 20:00 lokalnie; jutro OPEX kwartalny 18.06
    const td = svc.today({ tz: 'Europe/Warsaw' });
    assert.equal(td.day, '2026-06-17');
    assert.ok(td.events.some((e) => e.name === 'FOMC Statement'));
    assert.deepEqual(td.tomorrow.map((e) => e.name), ['Quarterly OPEX (triple witching)']);
    assert.deepEqual(svc.today({ tz: 'Pacific/Kiritimati' }).day, '2026-06-18', 'strefa +14: tu już czwartek');
    // całodniowe święto widać w zakresie nachodzącym na dobę ET
    const hol = svc.range(utc(2026, 11, 26, 20), utc(2026, 11, 26, 21)).events;
    assert.deepEqual(hol.map((e) => e.name), ['Bank Holiday']);
    assert.equal(svc.range(utc(2026, 11, 27, 6), utc(2026, 11, 27, 7)).events.length, 0, 'piątek po Thanksgiving: święto już się skończyło');
    assert.throws(() => svc.range(10, 5), (e) => e.code === 'bad-range' && e.status === 400);
    assert.throws(() => svc.range(NaN, 5), (e) => e.code === 'bad-range');
    assert.throws(() => svc.range(0, 401 * 86400), (e) => e.code === 'range-too-big');
    assert.throws(() => svc.today({ tz: 'Nie/Strefa' }), (e) => e.code === 'bad-tz');
    assert.throws(() => svc.today({ tz: '../../etc' }), (e) => e.code === 'bad-tz');
    await assert.rejects(svc.refreshFred(), (e) => e.code === 'no-key');
    assert.deepEqual(walk(base).map((p) => path.basename(p)).sort(), ['status.json']);
  });

  test('newsy-01: odświeżenie FRED kluczem: raz na dobę, zastępuje daty z wydania, zbyt krótka lista odrzucona, klucz nigdy w plikach, statusie ani logu', async () => {
    const { createNews } = await SV();
    const k = await K();
    const base = H.tmp();
    let clock = utc(2026, 10, 29, 12) * 1000;
    const shipped = JSON.parse(readFileSync(path.join(ROOT, 'data/news/usd-oficjalne.json'), 'utf8'));
    const mine = Object.fromEntries(k.FRED_RIDS.map((rid) => [rid, shipped.releases[rid].dates.map((d) => d)]));
    // wersja „z klucza”: CPI ma przesunięty listopadowy termin (ogłoszona przyszłość się zmieniła)
    mine[10] = mine[10].map((d) => (d === '2026-11-10' ? '2026-11-12' : d));
    const f = fakeFred(mine);
    const logs = [];
    const svc = createNews({ baseDir: base, getKey: () => FAKE_KEY, fetchImpl: f, now: () => clock, fredPauseMs: 0, log: (m) => logs.push(m) });
    const before = svc.official().filter((e) => e.name === 'CPI m/m' && e.day.startsWith('2026-11')).map((e) => e.day);
    assert.deepEqual(before, ['2026-11-10']);
    const r = await svc.refreshFred();
    assert.deepEqual(r, { ok: true, releases: k.FRED_RIDS.length });
    assert.equal(f.calls.length, k.FRED_RIDS.length);
    assert.ok(f.calls.every((c) => c.host === 'api.stlouisfed.org'));
    assert.deepEqual(svc.official().filter((e) => e.name === 'CPI m/m' && e.day.startsWith('2026-11')).map((e) => e.day), ['2026-11-12']);
    assert.equal(svc.status().fred.source, 'key');
    // restart: odświeżone daty zostają
    const again = createNews({ baseDir: base, getKey: () => FAKE_KEY, fetchImpl: fakeFred({}), now: () => clock, log: () => {} });
    assert.deepEqual(again.official().filter((e) => e.name === 'CPI m/m' && e.day.startsWith('2026-11')).map((e) => e.day), ['2026-11-12']);
    // tick: FRED dopiero po dobie od udanego przebiegu
    const f2 = fakeFred(mine);
    const s2 = createNews({ baseDir: base, getKey: () => FAKE_KEY, fetchImpl: async (u, i) => (String(u).includes('stlouisfed') ? f2(u, i) : Promise.reject(new TypeError('fetch failed'))), now: () => clock, fredPauseMs: 0, log: () => {} });
    clock += 3600_000;
    let o = await s2.tick();
    assert.equal(o.fred, undefined);
    assert.equal(f2.calls.length, 0);
    clock += 24 * 3600_000;
    o = await s2.tick();
    assert.equal(o.fred.ok, true);
    assert.equal(f2.calls.length, k.FRED_RIDS.length);
    // podejrzanie krótka lista (np. uszkodzona odpowiedź) nie nadpisuje poprzedniej
    const short = { ...mine, 50: mine[50].slice(0, 5) };
    const f3 = fakeFred(short);
    clock += 48 * 3600_000;
    const s3 = createNews({ baseDir: base, getKey: () => FAKE_KEY, fetchImpl: f3, now: () => clock, fredPauseMs: 0, log: () => {} });
    await assert.rejects(s3.refreshFred(), (e) => e.code === 'suspicious');
    assert.equal(s3.official().filter((e) => e.name === 'Non-Farm Employment Change').length, 203, 'NFP z poprzedniej listy');
    // zły klucz: przerwanie po pierwszym wydaniu, status z kodem, bez klucza gdziekolwiek
    const badKey = 'zlyklucz1234567890zlyklucz12345678';
    const f4 = fakeFred(mine);
    const base4 = H.tmp();
    const s4 = createNews({ baseDir: base4, getKey: () => badKey, fetchImpl: f4, now: () => clock, fredPauseMs: 0, log: (m) => logs.push(m) });
    await assert.rejects(s4.refreshFred(), (e) => e.code === 'bad-key');
    assert.equal(f4.calls.length, 1, 'zły klucz: stop po pierwszym zapytaniu');
    assert.equal(s4.status().fred.lastError.code, 'bad-key');
    for (const dir of [base, base4]) for (const p of walk(dir)) {
      const txt = readFileSync(p, 'utf8');
      assert.ok(!txt.includes(FAKE_KEY) && !txt.includes(badKey), `klucz w pliku ${path.relative(dir, p)}`);
    }
    assert.ok(logs.every((l) => !l.includes(FAKE_KEY) && !l.includes(badKey)));
    assert.ok(!JSON.stringify(s4.status()).includes(badKey));
  });

  test('newsy-01: tygodnie z feedu w pamięci: po restarcie usługa scala zapisane tygodnie z danymi oficjalnymi', async () => {
    const { createNews } = await SV();
    const base = H.tmp();
    let clock = utc(2026, 10, 28, 15) * 1000;
    const svc = createNews({ baseDir: base, fetchImpl: fakeFetch([{ json: weekOct2026() }]), now: () => clock, log: () => {} });
    const offBefore = svc.range(utc(2026, 10, 28), utc(2026, 10, 29)).events.map((e) => `${e.src}:${e.name}`);
    assert.ok(offBefore.includes('off:Federal Funds Rate'), 'przed feedem: decyzja FOMC 28.10 z tabeli');
    await svc.refreshFeed();
    const now = svc.range(utc(2026, 10, 28), utc(2026, 10, 29)).events.map((e) => `${e.src}:${e.name}`);
    assert.ok(!now.includes('off:Federal Funds Rate') && now.includes('ff:Frobnicate Rate'), 'po feedzie wygrywa FF');
    assert.ok(now.includes('off:Monthly OPEX') === false && now.some((n) => n.includes('Frobnicate')));
    const again = createNews({ baseDir: base, fetchImpl: fakeFetch([new TypeError('x')]), now: () => clock + 7200_000, log: () => {} });
    assert.ok(again.range(utc(2026, 10, 28), utc(2026, 10, 29)).events.some((e) => e.name === 'Frobnicate Rate' && e.src === 'ff'));
    assert.equal(again.status().feed.weeksStored, 1);
    // uszkodzony plik tygodnia nie psuje usługi
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(base, 'news/ff/2026-W45.json'), '{ nie json');
    const broken = createNews({ baseDir: base, fetchImpl: fakeFetch([new TypeError('x')]), now: () => clock, log: () => {} });
    assert.equal(broken.status().feed.weeksStored, 1);
  });

  // ---------- API HTTP ----------
  test('newsy-01: API: /api/news, /today, /status z ochroną Sec-Fetch-Site; błędy po polsku bez szczegółów technicznych', async () => {
    const A = await H.atrapa(4701);
    const dir = H.tmp();
    const S = await H.server(4702, { NOTION_API_BASE: A.base, NOTION_TOKEN: 'secret_x', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir });
    const get = (pth, h = {}) => fetch(S.base + pth, { headers: h });
    const q = `/api/news?from=${utc(2026, 6, 17)}&to=${utc(2026, 6, 18)}`;
    const ok = await get(q);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.from, utc(2026, 6, 17));
    assert.deepEqual(body.events.filter((e) => e.name === 'FOMC Statement').map((e) => e.t), [utc(2026, 6, 17, 18)]);
    const e0 = body.events[0];
    for (const key of ['t', 'day', 'name', 'imp', 'kind', 'allDay', 'tentative', 'src', 'basis']) assert.ok(key in e0, `pole ${key}`);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    // te same ochrony co inne odczyty /api/*
    assert.equal((await get(q, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await get(q, { 'Sec-Fetch-Site': 'same-site' })).status, 403);
    assert.equal((await get(q, { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
    assert.equal((await get(q, { 'Sec-Fetch-Site': 'none' })).status, 200);
    for (const p of ['/api/news/today', '/api/news/status']) assert.equal((await get(p, { 'Sec-Fetch-Site': 'cross-site' })).status, 403, p);
    // /today
    const td = await (await get('/api/news/today?tz=Europe/Warsaw')).json();
    assert.deepEqual(Object.keys(td).sort(), ['day', 'events', 'from', 'to', 'tomorrow', 'tz']);
    assert.equal(td.tz, 'Europe/Warsaw');
    assert.match(td.day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal((await get('/api/news/today')).status, 200);
    // błędy: 400 z komunikatem, bez śladów stosu i ścieżek
    for (const [pth, re] of [['/api/news', /Zły zakres czasu/], [`/api/news?from=5&to=1`, /Zły zakres czasu: od 5, do 1/], ['/api/news?from=abc&to=10', /Zły zakres/], [`/api/news?from=0&to=${400 * 86400 + 1}`, /za duży/], ['/api/news/today?tz=Nie/Strefa', /Nieznana strefa czasowa: Nie\/Strefa/]]) {
      const r = await get(pth);
      assert.equal(r.status, 400, pth);
      const j = await r.json();
      assert.match(j.error, re, pth);
      assert.ok(!/\bat \w|node_modules|\.mjs|[A-Z]:\\/.test(JSON.stringify(j)), 'bez szczegółów technicznych');
    }
    // /status
    const st = await (await get('/api/news/status')).json();
    assert.equal(st.hasKey, false);
    assert.equal(st.feed.lastOkAt, null, 'THQ_NO_NEWS: serwer testowy niczego nie pobiera');
    assert.equal(st.fred.source, 'shipped');
    assert.ok(st.history.byImp.opex === 216);
    const meta = await (await get('/api/meta')).json();
    assert.equal(meta.hasFredKey, false);
    // zapis na tych trasach nie istnieje
    const post = await fetch(S.base + '/api/news', { method: 'POST', headers: { Origin: S.base, 'X-THQ': '1', 'Content-Type': 'application/json' }, body: '{}' });
    assert.notEqual(post.status, 200);
    S.stop(); A.stop();
  });

  test('newsy-01: wyniki feedu i klucz zostają poza repozytorium: chart-data/ i .env w .gitignore, brak nazw FF w plikach newsów', async () => {
    const ign = readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/);
    assert.ok(ign.includes('chart-data/') && ign.includes('.env'));
    const files = ['lib/news.mjs', 'lib/news-sources.mjs', 'lib/news-service.mjs', 'lib/news-katalog.mjs', 'testy/atrapa-ff.mjs', 'testy/atrapa-fred.mjs', 'narzedzia/generuj-daty-fred.mjs', 'data/news/usd-oficjalne.json'];
    for (const f of files) {
      const s = readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/[0-9a-f]{32}/i.test(s.replace(/testkey0123456789abcdef0123456789/g, '')), `${f}: ciąg przypominający klucz`);
      assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(s.replace(/@types|@param/g, '')) || f === 'lib/news-katalog.mjs' && false, `${f}: adres e-mail`);
    }
    assert.ok(statSync(path.join(ROOT, 'data/news/usd-oficjalne.json')).size < 100_000);
  });
};
