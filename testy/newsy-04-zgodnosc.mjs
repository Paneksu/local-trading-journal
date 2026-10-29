// newsy-04: pakiet B (29.10.2026), poprawki po weryfikacji historii z ForexFactory na próbie. Bez sieci i bez danych FF: tylko reguły, daty urzędowe
// (święta, kalendarz FOMC) i atrapy z wymyślonymi datami FRED. Wyniki porównania: docs/plany/newsy-zgodnosc.md.
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export default ({ test, assert, ROOT }) => {
  const load = async (f) => import(pathToFileURL(path.join(ROOT, 'lib', f)).href);
  const S = () => load('news-sources.mjs');
  const N = () => load('news.mjs');
  const K = () => load('news-katalog.mjs');
  const iso = (t) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';

  test('newsy-04: profil świąt ff (domyślny): sobota → piątek dla 4 lipca i Bożego Narodzenia od 2011, bez Nowego Roku i Veterans w sobotę, Juneteenth od 2022, bez żałoby i Good Friday', async () => {
    const { holidaysUSD, holidayEvents } = await S();
    const { dateStr } = await N();
    const k = await K();
    assert.equal(k.DEFAULT_HOLIDAY_PROFILE, 'ff');
    const has = (d) => new Set(holidaysUSD(Number(d.slice(0, 4)), 'ff').map((h) => dateStr(h.day))).has(d);
    for (const d of ['2015-07-03', '2020-07-03', '2021-12-24', '2026-07-03', '2022-06-20', '2010-10-11', '2020-10-12', '2016-11-11', '2019-11-11', '2012-01-02', '2010-07-05', '2018-12-25', '2026-06-19']) assert.ok(has(d), `Bank Holiday ${d}`);
    for (const d of ['2010-12-24', '2010-12-31', '2021-12-31', '2017-11-10', '2021-06-18', '2018-12-05', '2025-01-09', '2010-04-02', '2021-04-02', '2026-04-03', '2012-10-29']) assert.ok(!has(d), `bez Bank Holiday ${d}`);
    assert.ok(has('2027-06-18'), 'Juneteenth w sobotę 2027: piątek (decyzja gustu, jak 4 lipca)');
    // domyślny profil w zdarzeniach i w buildOfficial
    assert.ok(holidayEvents(2021).some((e) => e.day === '2021-12-24') && !holidayEvents(2021).some((e) => e.day === '2021-06-18'));
    // inne profile bez zmian
    assert.ok(new Set(holidaysUSD(2015, 'federal').map((h) => dateStr(h.day))).has('2015-07-03'));
    assert.ok(!new Set(holidaysUSD(2015, 'fed').map((h) => dateStr(h.day))).has('2015-07-03'));
  });

  test('newsy-04: ADP w czwartek, gdy w tygodniu NFP przed środą jest dzień wolny (także żałoba); inaczej środa', async () => {
    const { ruleEvents } = await S();
    const { parseDay } = await N();
    const adp = (y, nfp) => ruleEvents(y, nfp.map(parseDay)).filter((e) => e.name === 'ADP Non-Farm Employment Change').map((e) => e.day).sort();
    assert.deepEqual(adp(2012, ['2012-01-06', '2012-09-07', '2012-04-06']), ['2012-01-05', '2012-04-04', '2012-09-06']);
    assert.deepEqual(adp(2018, ['2018-12-07']), ['2018-12-06'], '5.12.2018 żałoba narodowa');
    assert.deepEqual(adp(2015, ['2015-07-02']), ['2015-07-01'], 'NFP w czwartek: ADP w środę');
    assert.deepEqual(adp(2024, ['2024-09-06', '2024-10-04']), ['2024-09-05', '2024-10-02']);
  });

  test('newsy-04: ISM: Good Friday liczy się jak dzień roboczy, ale publikacja z niego przechodzi dalej; styczeń od 2018 o dzień roboczy później', async () => {
    const { ruleEvents } = await S();
    const on = (y, name, ym) => ruleEvents(y).filter((e) => e.name === name && e.day.startsWith(ym)).map((e) => e.day);
    assert.deepEqual(on(2010, 'ISM Services PMI', '2010-04'), ['2010-04-05']);
    assert.deepEqual(on(2021, 'ISM Services PMI', '2021-04'), ['2021-04-05']);
    assert.deepEqual(on(2015, 'ISM Services PMI', '2015-04'), ['2015-04-06']);
    assert.deepEqual(on(2026, 'ISM Services PMI', '2026-04'), ['2026-04-06']);
    assert.deepEqual([on(2025, 'ISM Manufacturing PMI', '2025-01'), on(2025, 'ISM Services PMI', '2025-01')], [['2025-01-03'], ['2025-01-07']]);
    assert.deepEqual([on(2013, 'ISM Manufacturing PMI', '2013-01'), on(2012, 'ISM Manufacturing PMI', '2012-01')], [['2013-01-02'], ['2012-01-03']], 'przed 2018: 1. dzień roboczy');
  });

  test('newsy-04: Philly Fed, Empire State, Chicago PMI, zapasy ropy, wybory: reguły i godziny zależne od daty', async () => {
    const { ruleEvents } = await S();
    const ev = (y) => ruleEvents(y);
    const at = (y, name, ym) => ev(y).filter((e) => e.name === name && e.day.startsWith(ym)).map((e) => `${e.day} ${iso(e.t)}`);
    // Philly: 3. czwartek także w styczniu (FRED rid 351 ma w styczniu 2. czwartek jako osobną publikację); 10:00 do 2015, 8:30 od 2016
    assert.deepEqual(at(2010, 'Philly Fed Manufacturing Index', '2010-04'), ['2010-04-15 2010-04-15T14:00Z']);
    assert.deepEqual(at(2020, 'Philly Fed Manufacturing Index', '2020-07'), ['2020-07-16 2020-07-16T12:30Z']);
    // styczeń 2022-2024 oraz 2016-2026 zgodne z 3. czwartkiem z dat FRED rid 351 (pobrane 29.10.2026; 2. czwartek tych styczni to inna publikacja)
    const jan = (y) => at(y, 'Philly Fed Manufacturing Index', `${y}-01`).map((s) => s.slice(0, 10));
    assert.deepEqual([jan(2022), jan(2023), jan(2024)], [['2022-01-20'], ['2023-01-19'], ['2024-01-18']]);
    const fredThird = { 2016: 21, 2017: 19, 2018: 18, 2019: 17, 2020: 16, 2021: 21, 2022: 20, 2023: 19, 2024: 18, 2025: 16, 2026: 15 };
    for (const [y, d] of Object.entries(fredThird)) assert.deepEqual(jan(Number(y)), [`${y}-01-${d}`], `Philly Fed styczeń ${y}`);
    assert.deepEqual(at(2025, 'Philly Fed Manufacturing Index', '2025-01').map((s) => s.slice(0, 10)), ['2025-01-16']);
    assert.deepEqual(at(2013, 'Philly Fed Manufacturing Index', '2013-01').map((s) => s.slice(0, 10)), ['2013-01-17']);
    // Empire: 15. albo następny dzień roboczy
    assert.deepEqual(at(2024, 'Empire State Manufacturing Index', '2024-09'), ['2024-09-16 2024-09-16T12:30Z']);
    assert.deepEqual(at(2010, 'Empire State Manufacturing Index', '2010-04').map((s) => s.slice(0, 10)), ['2010-04-15']);
    // Chicago PMI: ostatni dzień roboczy; bez 31.12, piątku po Thanksgiving i Good Friday
    const chi = (y, ym) => at(y, 'Chicago PMI', ym).map((s) => s.slice(0, 10));
    assert.deepEqual([chi(2018, '2018-12'), chi(2019, '2019-11'), chi(2013, '2013-03'), chi(2023, '2023-03'), chi(2012, '2012-04')], [['2018-12-28'], ['2019-11-27'], ['2013-03-28'], ['2023-03-31'], ['2012-04-30']]);
    // ropa: środa 10:30; poniedziałek wolny → czwartek 11:00; wtorek wolny → piątek 11:00; piątek poprzedniego tygodnia bez wpływu
    const crude = (y, ym) => at(y, 'Crude Oil Inventories', ym);
    assert.ok(crude(2012, '2012-01').includes('2012-01-05 2012-01-05T16:00Z'), '2.01.2012 poniedziałek wolny: czwartek 11:00 EST');
    assert.ok(crude(2013, '2013-01').includes('2013-01-04 2013-01-04T16:00Z'), '1.01.2013 wtorek: piątek');
    assert.ok(crude(2018, '2018-12').includes('2018-12-06 2018-12-06T16:00Z'), 'żałoba w środę 5.12.2018: czwartek');
    assert.ok(crude(2015, '2015-07').includes('2015-07-08 2015-07-08T14:30Z'), 'święto w piątek 3.07 nie przesuwa środy 8.07');
    assert.equal(crude(2024, '2024-09').length, 4);
    // wybory prezydenckie co 4 lata, cały dzień
    const el = (y) => ev(y).filter((e) => e.name === 'Presidential Election').map((e) => [e.day, e.allDay]);
    assert.deepEqual([el(2016), el(2024), el(2026)], [[['2016-11-08', true]], [['2024-11-05', true]], []]);
  });

  test('newsy-04: UoM: wstępny = piątek tygodnia „końcowy - 14 dni”, godzina 9:55 do 2014 i 10:00 od 2015; nowe wydania FRED i czyszczenie lateFirst', async () => {
    const { fredEvents, umichPrelim, curateDates } = await S();
    const { parseDay, dateStr } = await N();
    const k = await K();
    const p = (d) => dateStr(umichPrelim(parseDay(d)));
    // odczyt końcowy w czwartek albo w środę przed świętem: wstępny i tak w piątek
    assert.deepEqual(['2010-04-30', '2010-12-23', '2016-11-23', '2013-02-01', '2010-10-01'].map(p), ['2010-04-16', '2010-12-10', '2016-11-11', '2013-01-18', '2010-09-17']);
    const ev = fredEvents({ 91: ['2012-01-27', '2026-04-24'] });
    const at = (name, day) => ev.filter((e) => e.name === name && e.day === day).map((e) => iso(e.t));
    assert.deepEqual(at('Prelim UoM Consumer Sentiment', '2012-01-13'), ['2012-01-13T14:55Z']);
    assert.deepEqual(at('Revised UoM Consumer Sentiment', '2012-01-27'), ['2012-01-27T14:55Z']);
    assert.deepEqual(at('Prelim UoM Consumer Sentiment', '2026-04-10'), ['2026-04-10T14:00Z']);
    // nowe wydania: Building Permits / Housing Starts (pierwsza data miesiąca), dobra trwałe (pierwsza data od 18.), produkcja 9:15, CPI bazowy r/r
    assert.deepEqual(curateDates(k.FRED_RELEASES.find((r) => r.rid === 95).curate, ['2024-09-04', '2024-09-26', '2024-10-03', '2024-10-25', '2024-10-28']), ['2024-09-26', '2024-10-25']);
    const ev2 = fredEvents({ 27: ['2024-09-18', '2024-09-25'], 95: ['2024-09-04', '2024-09-26'], 13: ['2024-09-17'], 10: ['2024-09-11'] });
    const names = (d) => ev2.filter((e) => e.day === d).map((e) => `${e.name} ${iso(e.t).slice(11)}`).sort();
    assert.deepEqual(names('2024-09-18'), ['Building Permits 12:30Z', 'Housing Starts 12:30Z']);
    assert.deepEqual(names('2024-09-25'), []);
    assert.deepEqual(names('2024-09-26'), ['Core Durable Goods Orders m/m 12:30Z', 'Durable Goods Orders m/m 12:30Z']);
    assert.deepEqual(names('2024-09-17'), ['Capacity Utilization Rate 13:15Z', 'Industrial Production m/m 13:15Z']);
    assert.ok(names('2024-09-11').includes('Core CPI y/y 12:30Z'));
    // plik z wydania ma nowe wydania
    const j = JSON.parse(readFileSync(path.join(ROOT, 'data/news/usd-oficjalne.json'), 'utf8'));
    for (const rid of [27, 97, 95, 13, 188, 25]) assert.ok(j.releases[rid]?.dates.length > 150, `wydanie ${rid}`);
  });

  test('newsy-04: FOMC 2020 i zeznania: nadzwyczajne konferencje 3.03 11:00 i 15.03 18:30, bez decyzji 23.03; zeznania przewodniczącego o 10:00 ET', async () => {
    const { fomcEvents, speechEvents } = await S();
    const { etToUtc, parseDay } = await N();
    const ev = fomcEvents();
    const on = (day, name) => ev.filter((e) => e.day === day && e.name === name).map((e) => iso(e.t));
    assert.deepEqual(on('2020-03-03', 'FOMC Press Conference'), ['2020-03-03T16:00Z']);
    assert.deepEqual(on('2020-03-15', 'FOMC Press Conference'), ['2020-03-15T22:30Z']);
    assert.deepEqual(on('2020-03-15', 'FOMC Statement'), ['2020-03-15T21:00Z']);
    assert.deepEqual(on('2020-03-23', 'Federal Funds Rate'), []);
    assert.deepEqual(on('2012-01-25', 'FOMC Economic Projections'), ['2012-01-25T19:00Z']);
    const items = [
      { t: etToUtc(parseDay('2025-02-11'), 8, 30), timed: true, title: 'Wymyslone zeznanie', who: 'Powell', role: 'Chair', k: 'testimony', link: '/a' },
      { t: etToUtc(parseDay('2022-08-26'), 10, 0), timed: true, title: 'Wymyslone przemowienie', who: 'Powell', role: 'Chair', k: 'speech', link: '/b' },
    ];
    const sp = speechEvents(items);
    assert.deepEqual(sp.map((e) => iso(e.t)), ['2025-02-11T15:00Z', '2022-08-26T14:00Z']);
    assert.ok(sp.every((e) => e.unverified === true), 'godziny przemówień nadal niepewne');
  });

  test('newsy-04: wagi zależne od daty: tabela poprawna (rosnące daty, znane wagi, tylko nazwy z katalogu), waga wygrywa z domyślną; status pokazuje próbę', async () => {
    const W = await load('news-wagi.mjs');
    const { impOf } = await S();
    const { IMPS } = await N();
    const k = await K();
    const names = new Set([...k.FRED_RELEASES.flatMap((r) => r.events.map((e) => e.name)), ...Object.values(k.RULE_EVENTS).map((e) => e.name), ...Object.values(k.FOMC_NAMES), k.TIC_EVENT.name, k.FED_ANNOUNCEMENT.name]);
    for (const [n, st] of Object.entries(W.FF_WEIGHTS)) {
      assert.ok(names.has(n), `nazwa spoza katalogu: ${n}`);
      assert.equal(st[0].from, '2010-01-01', n);
      assert.ok(st.every((s, i) => /^\d{4}-\d{2}-01$/.test(s.from) && (i === 0 || s.from > st[i - 1].from) && IMPS.includes(s.v) && (i === 0 || s.v !== st[i - 1].v)), n);
    }
    assert.ok(W.FF_SAMPLE.months >= 16 && /^\d{4}-\d{2}-\d{2}$/.test(W.FF_SAMPLE.checked));
    // tabela wygrywa z wagą domyślną, a nieznana nazwa bierze domyślną
    const n0 = Object.keys(W.FF_WEIGHTS)[0], st = W.FF_WEIGHTS[n0];
    assert.equal(impOf({ name: n0, imp: 'opex' }, st.at(-1).from), st.at(-1).v);
    assert.equal(impOf({ name: 'Wymyslony Indeks', imp: 'low' }, '2020-01-01'), 'low');
    // ustawienia: wynik zgodności jako „zweryfikowane na próbie N miesięcy (data)”
    const kart = readFileSync(path.join(ROOT, 'public/js/newsy-karty.js'), 'utf8');
    assert.match(kart, /zweryfikowane na próbie \{n\} miesięcy \(\{date\}\)/);
    const svc = readFileSync(path.join(ROOT, 'lib/news-service.mjs'), 'utf8');
    assert.match(svc, /verified: \{ \.\.\.FF_SAMPLE \}/);
  });

  test('newsy-04 (B2): TIC z tabeli Skarbu: wiersze roczne (grudzień i listopad w roku następnym), lista najnowszych z poprawką roku; godzina 9:00 do 2014, 16:00 od 2015', async () => {
    const { parseTicSchedule, scheduleEvents } = await S();
    // atrapa w kształcie strony Skarbu (daty wymyślone, nie kopia)
    const html = `<p>02/10/2031 TIC Data for December 2030</p><p>01/09/2030 TIC Data for November 2030</p>
      <div>2029, release date: <span>02/11</span> 01/12/2030 12/13 11/14 10/15 09/16 08/17 07/18 06/19 05/20 04/21 03/22/2029</div>`;
    const d = parseTicSchedule(html);
    assert.ok(d.includes('2030-02-11') && d.includes('2030-01-12') && d.includes('2029-12-13') && d.includes('2029-03-22'), 'wiersz roczny');
    assert.ok(d.includes('2031-02-10') && d.includes('2031-01-09') && !d.includes('2030-01-09'), 'publikacja przed miesiącem danych = literówka roku');
    assert.equal(d.length, 14);
    assert.deepEqual(parseTicSchedule('<p>nic</p>'), []);
    const ev = scheduleEvents({ tic: ['2012-04-16', '2026-04-15', 'zła'] });
    assert.deepEqual(ev.map((e) => [e.name, e.day, iso(e.t), e.basis]), [['TIC Long-Term Purchases', '2012-04-16', '2012-04-16T13:00Z', 'schedule'], ['TIC Long-Term Purchases', '2026-04-15', '2026-04-15T20:00Z', 'schedule']]);
  });

  test('newsy-04 (B2): komunikaty Fed poza posiedzeniami: tylko Monetary Policy, bez rutynowych i bez dnia decyzji FOMC, jeden na minutę, BOM', async () => {
    const { fedAnnouncements, scheduleEvents } = await S();
    const it = (d, t, pt = 'Monetary Policy') => ({ d, t, pt, l: '/x.htm' });
    const text = '﻿\n' + JSON.stringify([
      it('3/15/2020 5:00:00 PM', 'Wymyslona skoordynowana akcja banków centralnych'),
      it('3/15/2020 5:00:00 PM', 'Druga wymyslona akcja tej samej minuty'),
      it('3/17/2020 10:45:00 AM', 'Wymyslony nowy program kredytowy'),
      it('4/8/2026 2:00:00 PM', 'Minutes of the Federal Open Market Committee, wymyslone'),
      it('4/14/2026 12:00:00 PM', 'Federal Reserve announces results of auction of wymyslone'),
      it('4/29/2026 3:00:00 PM', 'Wymyslony komunikat w dniu decyzji FOMC'),
      it('5/1/2026 3:00:00 PM', 'Wymyslony komunikat nadzorczy', 'Enforcement Actions'),
      it('5/2/2009 3:00:00 PM', 'Wymyslony stary komunikat'),
      it('5/3/2026', 'Bez godziny'),
    ]);
    const a = fedAnnouncements(text);
    assert.deepEqual(a.map((x) => [iso(x.t), x.title]), [['2020-03-15T21:00Z', 'Wymyslona skoordynowana akcja banków centralnych'], ['2020-03-17T14:45Z', 'Wymyslony nowy program kredytowy']]);
    assert.throws(() => fedAnnouncements('nie json'), (e) => e.code === 'bad-archive');
    const ev = scheduleEvents({ fed: a });
    assert.deepEqual(ev.map((e) => [e.name, e.kind, e.imp, e.basis]), [['Fed Announcement', 'fomc', 'high', 'fed'], ['Fed Announcement', 'fomc', 'high', 'fed']]);
  });

  test('newsy-04 (B2): plik terminarzy z wydania: schemat, TIC od 2010 rosnąco, komunikaty Fed z godziną; usługa i historia je mają', async () => {
    const j = JSON.parse(readFileSync(path.join(ROOT, 'data/news/usd-terminarze.json'), 'utf8'));
    assert.equal(j.schema, 1);
    assert.ok(j.tic.length > 150 && j.tic.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= '2010-01-01' && (i === 0 || d > j.tic[i - 1])));
    assert.ok(j.fed.length >= 20 && j.fed.every((x) => Number.isInteger(x.t) && typeof x.title === 'string'));
    assert.ok(j.tic.includes('2015-04-15') && j.tic.includes('2024-01-19'), 'znane daty publikacji TIC (2024-01-19: poprawiona literówka roku na stronie Skarbu)');
    const { buildOfficial } = await S();
    const o = buildOfficial({ schedules: j, toYear: 2027 });
    assert.ok(o.some((e) => e.name === 'Fed Announcement' && e.day === '2020-03-23'), '23.03.2020 8:00 jako komunikat Fed');
    assert.ok(o.filter((e) => e.name === 'TIC Long-Term Purchases').length === j.tic.length);
    const svc = readFileSync(path.join(ROOT, 'lib/news-service.mjs'), 'utf8');
    assert.match(svc, /schedules: loadSchedules\(\)/);
  });
};
