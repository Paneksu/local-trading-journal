// backtest-odbior-strefa: odbiór 1.7.0, strefa czasu NY (słowa użytkownika 3.11.2026).
// [U] 3.11.2026 «mala poprawka do notion i do journalingu, ja wpisuje godziny wedle nowojorskiego czasu nie polskiego»
// [U] 3.11.2026 «Popraw strefę na NY (Recommended)» i «Wszędzie, z opisem „NY” (Recommended)»
// Pokrycie: strefa.js (zegar ścienny, DST, skrót), parseDT i dzień w NY niezależnie od strefy komputera, domyślna strefa zapisu w serwerze, poprawa starych wpisów w Notion
// (plan, idempotencja, kopia przed pierwszą zmianą, błąd jednej strony, tylko pola dat) wyłącznie na atrapie Notion, e2e formularza: 10:30 w formularzu → atrapa dostaje 10:30 America/New_York.
import path from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const NOTION_ENV = (A, dir) => ({ NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_TZFIX_PACE_MS: '0' });

  test('backtest-odbior-strefa: strefa.js: zegar ścienny, odwrotność przez zmianę czasu, skrót NY/UTC/UTC+1, zła strefa wraca do NY', async () => {
    const Z = await imp('public/js/strefa.js');
    assert.equal(Z.DEFAULT_TZ, 'America/New_York');
    assert.equal(Z.appTz(), 'America/New_York', 'domyślnie NY');
    // 30.10.2026 14:30 UTC = 10:30 w NY (czas letni, UTC−4), 15:30 w Warszawie (UTC+1 od 25.10)
    const ms = Date.UTC(2026, 9, 30, 14, 30, 5);
    assert.deepEqual(Z.wallParts(ms), { date: '2026-10-30', time: '10:30', sec: '05' });
    assert.deepEqual(Z.wallParts(ms, 'Europe/Warsaw'), { date: '2026-10-30', time: '15:30', sec: '05' });
    // północ: 23:30 w NY to już następny dzień w Warszawie
    const late = Date.UTC(2026, 9, 31, 3, 30);
    assert.equal(Z.dayKeyIn(late, 'America/New_York'), '2026-10-30');
    assert.equal(Z.dayKeyIn(late, 'Europe/Warsaw'), '2026-10-31');
    // odwrotność, także w dniach zmiany czasu (NY: 8.03.2026 wiosna, 1.11.2026 jesień)
    for (const [d, h] of [['2026-10-30', '10:30'], ['2026-11-02', '09:30'], ['2026-03-09', '09:30'], ['2026-03-06', '09:30'], ['2026-11-01', '12:00']]) {
      assert.equal(Z.wallParts(Z.wallToMs(d, h, 'America/New_York'), 'America/New_York').time, h, `${d} ${h}`);
      assert.equal(Z.wallParts(Z.wallToMs(d, h, 'America/New_York'), 'America/New_York').date, d);
    }
    assert.equal(Z.wallToMs('2026-10-30', '10:30', 'America/New_York'), Date.UTC(2026, 9, 30, 14, 30));
    assert.equal(Z.wallToMs('2026-12-15', '10:30', 'America/New_York'), Date.UTC(2026, 11, 15, 15, 30), 'zima UTC−5');
    // skrót strefy
    assert.equal(Z.tzShort('America/New_York'), 'NY');
    assert.equal(Z.tzShort('UTC'), 'UTC');
    assert.equal(Z.tzShort('Europe/Warsaw', Date.UTC(2026, 6, 1)), 'UTC+2');
    assert.equal(Z.tzShort('Europe/Warsaw', Date.UTC(2026, 0, 1)), 'UTC+1');
    assert.equal(Z.tzShort('Asia/Kolkata', Date.UTC(2026, 0, 1)), 'UTC+5:30');
    assert.equal(Z.tzShort('Etc/GMT+5'), 'UTC−5');
    // ustawienie i walidacja
    Z.setAppTz('Europe/Warsaw'); assert.equal(Z.appTz(), 'Europe/Warsaw');
    Z.setAppTz('Nie/Ma'); assert.equal(Z.appTz(), 'America/New_York', 'zła strefa = domyślna');
    Z.setAppTz(''); assert.equal(Z.appTz(), 'America/New_York', 'pusta = domyślna');
    Z.setAppTz('x'.repeat(80)); assert.equal(Z.appTz(), 'America/New_York');
  });

  test('backtest-odbior-strefa: parseDT i todayKey liczą dzień i godzinę na zegarze strefy aplikacji, nie komputera (komputer testowy jest w Warszawie)', async () => {
    const F = await imp('public/js/format.js');
    const Z = await imp('public/js/strefa.js');
    Z.setAppTz('');
    // wpis zapisany jako 10:30 NY (Notion oddaje przesunięcie strefy zapisu)
    assert.deepEqual({ ...F.parseDT('2026-10-30T10:30:00.000-04:00'), at: 0 }, { date: '2026-10-30', time: '10:30', at: 0 });
    // 23:30 NY: w Warszawie to już 31.10 05:30, dzień trade'a ma zostać 30.10
    const late = F.parseDT('2026-10-30T23:30:00.000-04:00');
    assert.equal(late.date, '2026-10-30'); assert.equal(late.time, '23:30');
    // stary wpis zapisany jako 10:30 Warszawa (+01:00) widać w NY jako 05:30 (to właśnie poprawia „Strefa starych wpisów”)
    const old = F.parseDT('2026-10-30T10:30:00.000+01:00');
    assert.equal(old.time, '05:30'); assert.equal(old.date, '2026-10-30');
    // sama data bez godziny bez zmian
    assert.deepEqual(F.parseDT('2026-10-30'), { date: '2026-10-30', time: null, at: null });
    // inna strefa z Ustawień zmienia zegar
    Z.setAppTz('Europe/Warsaw');
    assert.equal(F.parseDT('2026-10-30T10:30:00.000-04:00').time, '15:30');
    Z.setAppTz('');
    assert.equal(F.todayKey(), Z.dayKeyIn(Date.now(), 'America/New_York'));
    // dateTimeShort z podpisem strefy
    const d = new Date(Date.UTC(2026, 9, 30, 14, 30));
    assert.match(F.dateTimeShort(d, d, { withTz: true }), /10:30[\s\u00a0\u202f]NY$/);
    assert.doesNotMatch(F.dateTimeShort(d, d), /NY/);
  });

  test('backtest-odbior-strefa: źródła: formularz, wykres, kalendarz i serwer nie sięgają po strefę przeglądarki ani Europe/Warsaw', () => {
    const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
    for (const f of ['public/js/form.js', 'public/js/wykres.js', 'public/js/podglad.js', 'public/js/ust-wykresy.js', 'lib/writes.mjs', 'lib/workspace.mjs']) {
      assert.doesNotMatch(read(f), /resolvedOptions\(\)\.timeZone|BROWSER_TZ|time_zone: 'Europe\/Warsaw'|\|\| 'Europe\/Warsaw'/, `${f}: bez strefy przeglądarki ani Warszawy na sztywno`);
    }
    // jedyne miejsce, które czyta strefę komputera, to serwerowy domyślny dla newsów bez parametru tz (lib/news.mjs)
    assert.match(read('public/js/form.js'), /tz: appTz\(\)/);
    assert.match(read('public/js/wykres.js'), /tz: appTz\(\)/);
  });

  test('backtest-odbior-strefa: serwer: zapis bez strefy w żądaniu (albo ze złą) idzie w America/New_York, jawna strefa zostaje, data bez godziny bez strefy', async () => {
    const A = await H.atrapa(5301);
    const dir = H.tmp();
    const S = await H.server(5302, NOTION_ENV(A, dir));
    try {
      const mk = async (body) => { const r = await H.dash(S.base, '/api/trades', { name: 'TZ', typ: 'Live', ...body }); assert.equal(r.status, 200, JSON.stringify(r.j)); return r.j; };
      const dump = async () => (await A.get('/__test/pages?ds=trades'));
      const find = (pages, name) => pages.filter((p) => (p.p.Trade?.title || []).map((x) => x.plain_text).join('') === name);
      await mk({ name: 'TZ-bez', date: '2026-10-30', time: '10:30' });
      await mk({ name: 'TZ-zla', date: '2026-10-30', time: '10:31', tz: 'Nie/Ma' });
      await mk({ name: 'TZ-jawna', date: '2026-10-30', time: '10:32', tz: 'Europe/London' });
      await mk({ name: 'TZ-sama-data', date: '2026-10-30' });
      await mk({ name: 'TZ-wyjscie', date: '2026-10-30', time: '10:33', exitDate: '2026-10-30', exitTime: '10:50' });
      const pages = await dump();
      // strefa wysłana do Notion jest w atrapie w polu tz (Notion przy odczycie oddaje przesunięcie, time_zone: null)
      const bez = find(pages, 'TZ-bez')[0];
      assert.equal(bez.tz.Data, 'America/New_York');
      assert.equal(bez.p.Data.date.start, '2026-10-30T10:30:00.000-04:00', 'zegar 10:30, przesunięcie NY');
      assert.equal(bez.p.Data.date.time_zone, null, 'jak prawdziwy Notion: time_zone null przy odczycie');
      assert.equal(find(pages, 'TZ-zla')[0].tz.Data, 'America/New_York');
      assert.equal(find(pages, 'TZ-jawna')[0].tz.Data, 'Europe/London');
      assert.equal(find(pages, 'TZ-sama-data')[0].tz.Data, null);
      const w = find(pages, 'TZ-wyjscie')[0];
      assert.equal(w.tz['Wyjście'], 'America/New_York');
      assert.match(w.p['Wyjście'].date.start, /T10:50:00/);
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-odbior-strefa: planField i planPages: kandydat to godzina z przesunięciem Warszawy; NY, inne przesunięcie, sama data i godzina bez przesunięcia zostają; DEMO w grupie „moment”', async () => {
    const N = await imp('lib/strefa-notion.mjs');
    // dokładnie takie kształty zwrócił prawdziwy Notion (3.11.2026): start z przesunięciem, time_zone null
    const warsawWinter = { start: '2026-11-02T09:54:00.000+01:00', end: null, time_zone: null };
    assert.deepEqual(N.planField(warsawWinter), { action: 'change', group: 'clock', clock: '2026-11-02T09:54:00', endClock: null, from: 'Europe/Warsaw' });
    // lato: +02:00 w dniu wpisu
    assert.equal(N.planField({ start: '2026-07-01T10:30:00.000+02:00', time_zone: null }).clock, '2026-07-01T10:30:00');
    // +01:00 w lipcu to nie Warszawa (tam jest +02:00): pominięte
    assert.deepEqual(N.planField({ start: '2026-07-01T10:30:00.000+01:00', time_zone: null }), { action: 'skip', why: 'other' });
    // NY (z backtestu i nowych wpisów) zostaje, także zimą i latem
    assert.deepEqual(N.planField({ start: '2025-09-30T09:35:00.000-04:00', time_zone: null }), { action: 'skip', why: 'same' });
    assert.deepEqual(N.planField({ start: '2026-01-05T09:35:00.000-05:00', time_zone: null }), { action: 'skip', why: 'same' });
    // sama data (stare wpisy), brak daty, nieczytelne, godzina bez przesunięcia i bez strefy
    assert.deepEqual(N.planField({ start: '2023-07-11', time_zone: null }), { action: 'skip', why: 'no-time' });
    assert.deepEqual(N.planField(null), { action: 'skip', why: 'none' });
    assert.deepEqual(N.planField({ start: 'śmieci-w-środku-T10:30', time_zone: null }), { action: 'skip', why: 'bad' });
    assert.deepEqual(N.planField({ start: '2026-10-30T10:30:00', time_zone: null }), { action: 'skip', why: 'no-zone' });
    // inne przesunięcie niż Warszawa i NY (np. Tokio)
    assert.deepEqual(N.planField({ start: '2026-10-30T10:30:00.000+09:00', time_zone: null }), { action: 'skip', why: 'other' });
    // start bez przesunięcia z time_zone (kształt, który przyjmuje zapis): Warszawa tak, NY pomijane
    assert.equal(N.planField({ start: '2026-10-30T10:30:00', time_zone: 'Europe/Warsaw' }).clock, '2026-10-30T10:30:00');
    assert.deepEqual(N.planField({ start: '2026-10-30T10:30:00', time_zone: 'America/New_York' }), { action: 'skip', why: 'same' });
    // koniec zakresu przechodzi tak samo; koniec z innym przesunięciem unieważnia pole
    assert.equal(N.planField({ start: '2026-10-30T10:30:00.000+01:00', end: '2026-10-30T11:45:00.000+01:00', time_zone: null }).endClock, '2026-10-30T11:45:00');
    assert.deepEqual(N.planField({ start: '2026-10-30T10:30:00.000+01:00', end: '2026-10-30T11:45:00.000+09:00', time_zone: null }), { action: 'skip', why: 'bad' });
    // grupa „moment”: ten sam moment na zegarze NY (15:35+01:00 = 09:35 NY zimą po zmianie czasu w NY 1.11; 10.10 NY jeszcze letni: 15:35+02:00 = 09:35)
    assert.equal(N.planField({ start: '2026-10-20T15:35:00.000+02:00', time_zone: null }, { moment: true }).clock, '2026-10-20T09:35:00');
    assert.equal(N.planField({ start: '2026-11-02T15:35:00.000+01:00', time_zone: null }, { moment: true }).clock, '2026-11-02T09:35:00');
    assert.equal(N.planField({ start: '2026-11-02T15:35:00.000+01:00', time_zone: null }, { moment: true }).group, 'moment');
    // tydzień rozjazdu zmian czasu (8–28.03: NY już letni, Warszawa jeszcze zimowa): różnica 5 godzin, a nie 6
    assert.equal(N.planField({ start: '2026-03-10T15:35:00.000+01:00', time_zone: null }, { moment: true }).clock, '2026-03-10T10:35:00');
    // strony: archiwalne pominięte, wejście i wyjście razem, DEMO w grupie moment, liczby grup
    const pg = (id, title, d, e, extra = {}) => ({ id, ...extra, properties: { Trade: { type: 'title', title: [{ plain_text: title }] }, Data: { type: 'date', date: d }, Wyjście: { type: 'date', date: e } } });
    const ny = { start: '2026-10-30T09:35:00.000-04:00', time_zone: null };
    const p = N.planPages([
      pg('a', 'ES', warsawWinter, { ...warsawWinter, start: '2026-11-02T10:10:00.000+01:00' }), pg('b', 'NQ', { start: '2026-10-30', time_zone: null }, null), pg('c', 'NQ', ny, null),
      pg('d', 'x', warsawWinter, null, { archived: true }), pg('e', 'DEMO · Przykład 1', { start: '2026-11-02T15:35:00.000+01:00', time_zone: null }, { start: '2026-11-02T15:58:00.000+01:00', time_zone: null }),
      pg('f', 'NQ', { start: '2026-10-30T10:30:00.000+09:00', time_zone: null }, null),
    ], { date: 'Data', exit: 'Wyjście' });
    assert.equal(p.total, 5, 'archiwalna pominięta');
    assert.deepEqual(p.pages.map((x) => [x.id, x.group, x.fields.map((f) => `${f.role}:${(x.group === 'moment' ? f.momentClock : f.clock).slice(11, 16)}`)]), [['a', 'clock', ['date:09:54', 'exit:10:10']], ['e', 'moment', ['date:09:35', 'exit:09:58']]]);
    // oba warianty zapisu są w każdym polu: zegar (15:35) i moment (09:35)
    assert.deepEqual(p.pages[1].fields.map((f) => [f.clock.slice(11, 16), f.momentClock.slice(11, 16)]), [['15:35', '09:35'], ['15:58', '09:58']]);
    assert.deepEqual(p.groups, { clock: { pages: 1, fields: 2 }, moment: { pages: 1, fields: 2 } });
    assert.equal(p.byReason['no-time'], 1); assert.equal(p.byReason.same, 1); assert.equal(p.byReason.other, 1);
    assert.equal(p.example.group, 'clock');
    // klucz zgody obejmuje koniec zakresu (zmiana samego końca po podglądzie unieważnia zgodę)
    const k1 = N.planKey(N.planPages([pg('a', 'ES', { ...warsawWinter, end: '2026-11-02T10:10:00.000+01:00' }, null)], { date: 'Data', exit: 'Wyjście' }));
    const k2 = N.planKey(N.planPages([pg('a', 'ES', { ...warsawWinter, end: '2026-11-02T10:20:00.000+01:00' }, null)], { date: 'Data', exit: 'Wyjście' }));
    assert.notEqual(k1, k2);
  });

  async function tzEnv(ports, atrapaEnv = {}) {
    const A = await H.atrapa(ports[0], atrapaEnv);
    const dir = H.tmp();
    const S = await H.server(ports[1], NOTION_ENV(A, dir));
    const waitJob = async (ms = 30000) => {
      const t0 = Date.now();
      for (;;) {
        const j = await (await fetch(`${S.base}/api/tz-fix`)).json();
        if (!j.running) return j;
        if (Date.now() - t0 > ms) throw new Error('zadanie nie skończyło się');
        await H.sleep(100);
      }
    };
    const pages = async () => (await A.get('/__test/pages?ds=trades')).map((x) => ({ id: x.id, d: x.p.Data?.date, e: x.p['Wyjście']?.date, name: (x.p.Trade?.title || []).map((y) => y.plain_text).join('') }));
    return { A, S, dir, waitJob, pages, stop: () => { S.stop(); A.stop(); } };
  }
  const isTimed = (d) => !!d?.start && d.start.length > 10;

  test('backtest-odbior-strefa: poprawa starych wpisów: podgląd tylko czyta, ręczne „TAK”, kopia przed pierwszą zmianą, godzina zegarowa zachowana, DEMO ten sam moment, ponowny podgląd 0 kandydatów', async () => {
    const E = await tzEnv([5303, 5304], { ATRAPA_DEMO: '3' });
    try {
      const before = await E.pages();
      const warsaw = (d) => isTimed(d) && /\+0[12]:00$/.test(d.start);
      const cand = before.filter((p) => warsaw(p.d) || warsaw(p.e));
      const demo = cand.filter((p) => p.name.startsWith('DEMO · '));
      const dateOnly = before.filter((p) => p.d?.start && p.d.start.length <= 10);
      assert.ok(cand.length > 10 && demo.length === 3 && dateOnly.length > 0, `atrapa: kandydaci ${cand.length}, DEMO ${demo.length}, same daty ${dateOnly.length}`);
      assert.ok(before.every((p) => p.d?.time_zone == null), 'stan wyjściowy jak w prawdziwym Notion: time_zone null, przesunięcie w start');
      const w0 = (await E.A.writes()).length;

      // bez podglądu nie da się poprawić; obcy Origin; inna strefa niż NY odrzucona
      let r = await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: 'x' });
      assert.equal(r.status, 409); assert.equal(r.j.code, 'preview-required');
      const evil = await fetch(`${E.S.base}/api/tz-fix/preview`, { method: 'POST', headers: { Origin: 'http://evil.example', 'X-THQ': '1', 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(evil.status, 403);
      r = await H.dash(E.S.base, '/api/tz-fix/preview', { tz: 'Europe/Warsaw' });
      assert.equal(r.status, 400); assert.equal(r.j.code, 'bad-zone');
      r = await H.dash(E.S.base, '/api/tz-fix/preview', { tz: 'America/Chicago' });
      assert.equal(r.status, 400);

      // podgląd
      r = await H.dash(E.S.base, '/api/tz-fix/preview', {});
      assert.equal(r.status, 200, JSON.stringify(r.j));
      let j = await E.waitJob();
      assert.equal(j.error, null, JSON.stringify(j.error));
      const pv = j.result;
      assert.equal(pv.tz, 'America/New_York');
      assert.equal(pv.pages, cand.length);
      assert.equal(pv.groups.moment.pages, 3, 'osobna grupa DEMO z liczbą');
      assert.equal(pv.groups.clock.pages, cand.length - 3);
      assert.ok(pv.skipped.noTime >= dateOnly.length && pv.skipped.other === 0);
      assert.equal(pv.example.group, 'clock'); assert.match(pv.example.from, /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
      assert.ok(pv.token && pv.word === 'TAK');
      assert.equal((await E.A.writes()).length, w0, 'podgląd nie zapisał niczego w Notion');
      assert.equal(existsSync(path.join(E.dir, 'backups')) ? readdirSync(path.join(E.dir, 'backups')).length : 0, 0, 'podgląd nie robi kopii');

      // zła zgoda i zły token nie zmieniają niczego (a zgoda przepada)
      r = await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'nie', token: pv.token });
      assert.equal(r.status, 400); assert.equal(r.j.code, 'confirm-required');
      r = await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token });
      assert.equal(r.status, 409, 'zgoda z podglądu jest jednorazowa i przepadła po odrzuconej próbie');
      assert.equal((await E.A.writes()).length, w0);

      // właściwa poprawa: nowy podgląd → ręczne TAK
      await H.dash(E.S.base, '/api/tz-fix/preview', {});
      j = await E.waitJob();
      const log0 = (await E.A.get('/__test/log')).length;
      r = await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: j.result.token });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      // w czasie poprawy zapis, edycja i usuwanie trade'ów dają 409 (zadanie z odstępem 0 ms kończy się szybko, więc blokadę sprawdza test modułu niżej)
      j = await E.waitJob();
      assert.equal(j.error, null, JSON.stringify(j.error));
      const rep = j.result;
      assert.equal(rep.errors.length, 0); assert.equal(rep.changed, cand.length);
      assert.ok(rep.backup, 'nazwa kopii w raporcie');

      // kopia istnieje, ma powód before-tz-fix i STARE przesunięcia, a odczyty kopii (cztery bazy) poprzedzają pierwszy PATCH
      const bdir = path.join(E.dir, 'backups', rep.backup);
      assert.equal(JSON.parse(readFileSync(path.join(bdir, 'manifest.json'), 'utf8')).reason, 'before-tz-fix');
      const bk = JSON.parse(readFileSync(path.join(bdir, 'trades.json'), 'utf8'));
      assert.ok(bk.pages.some((p) => /\+0[12]:00$/.test(p.properties.Data?.date?.start || '')), 'kopia trzyma stare przesunięcia');
      const log = (await E.A.get('/__test/log')).slice(log0);
      const firstPatch = log.findIndex((l) => /^PATCH \/v1\/pages\//.test(l));
      assert.ok(firstPatch > 0 && log.slice(0, firstPatch).filter((l) => /\/query$/.test(l)).length >= 4, 'cztery bazy odczytane zanim ruszył pierwszy PATCH');

      // po poprawie Notion oddaje przesunięcie NY; zegar zachowany (zwykłe), moment zachowany (DEMO); same daty nietknięte
      const raw = await E.A.get('/__test/pages?ds=trades');
      const after = await E.pages();
      const clock = (d) => d.start.slice(0, 16);
      const ms = (d) => Date.parse(d.start);
      for (const b of cand) {
        const a = after.find((x) => x.id === b.id);
        for (const [fa, fb] of [[a.d, b.d], [a.e, b.e]]) {
          if (!warsaw(fb)) continue;
          assert.match(fa.start, /-0[45]:00$/, `NY po poprawie: ${b.name}`);
          if (b.name.startsWith('DEMO · ')) assert.equal(ms(fa), ms(fb), `ten sam moment: ${b.name}`);
          else assert.equal(clock(fa), clock(fb), `ta sama godzina na zegarze: ${b.name}`);
        }
        assert.equal(raw.find((x) => x.id === b.id).tz.Data === 'America/New_York' || !warsaw(b.d), true, 'wysłana strefa to NY');
      }
      for (const b of dateOnly) assert.deepEqual(after.find((x) => x.id === b.id).d, b.d, `data bez godziny bez zmian: ${b.name}`);
      assert.ok(raw.every((x) => x.p.Trade && x.p.Typ), 'pola poza datami na miejscu');

      // idempotencja: ponowny podgląd ma 0 kandydatów, poprawa na pustym planie nic nie zapisuje
      const w1 = (await E.A.writes()).length;
      await H.dash(E.S.base, '/api/tz-fix/preview', {});
      j = await E.waitJob();
      assert.equal(j.result.pages, 0, 'po poprawie podgląd pokazuje 0 kandydatów'); assert.ok(j.result.skipped.same >= cand.length);
      await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: j.result.token });
      j = await E.waitJob();
      assert.equal(j.result.changed, 0); assert.equal(j.result.backup, null, 'nic do zmiany = bez kopii');
      assert.equal((await E.A.writes()).length, w1, 'druga poprawa niczego nie zapisała');
    } finally { E.stop(); }
  });

  test('backtest-odbior-strefa: wybór na wpis: podgląd listuje wszystkie wpisy (id, tytuł, instrument, godzina z przesunięciem), serwer przyjmuje wybory tylko dla id z podglądu (inaczej 400 bad-choice), „pomiń” nie dotyka strony, „ten sam moment” i „ta sama godzina” zapisują różne godziny, DEMO domyślnie moment', async () => {
    const N = await imp('lib/strefa-notion.mjs');
    const E = await tzEnv([5311, 5312], { ATRAPA_DEMO: '3' });
    try {
      const before = await E.pages();
      const warsaw = (d) => isTimed(d) && /\+0[12]:00$/.test(d.start);
      const cand = before.filter((p) => warsaw(p.d) || warsaw(p.e));
      const preview = async () => { await H.dash(E.S.base, '/api/tz-fix/preview', {}); const j = await E.waitJob(); assert.equal(j.error, null); return j.result; };
      let pv = await preview();
      // lista pełna (bez limitu 200), każdy wpis ma id, tytuł, instrument i datę z przesunięciem
      assert.equal(pv.items.length, cand.length);
      assert.deepEqual(pv.items.filter((it) => !(it.id && typeof it.title === "string" && it.fields.length && /^[+-]\d\d:\d\d$/.test(it.fields[0].offset) && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(it.fields[0].was))).slice(0, 1), []);
      assert.ok(pv.items.some((it) => it.instrument), 'instrument z pola wyboru');
      assert.deepEqual(new Set(pv.items.map((it) => it.id)), new Set(cand.map((c) => c.id)));
      const plain = pv.items.filter((it) => it.group === 'clock'), demo = pv.items.filter((it) => it.group === 'moment');
      assert.equal(demo.length, 3);

      // złe wybory: obce id, zła wartość, tablica, tekst: 400 bad-choice i zgoda przepada (nic nie zapisano)
      const w0 = (await E.A.writes()).length;
      for (const bad of [{ 'obce-id': 'skip' }, { [plain[0].id]: 'nie-ma-takiego' }, [plain[0].id], 'skip', { [plain[0].id]: null }]) {
        const r = await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token, choices: bad });
        assert.equal(r.status, 400, JSON.stringify(bad)); assert.equal(r.j.code, 'bad-choice');
        pv = await preview();
      }
      assert.equal((await E.A.writes()).length, w0, 'złe wybory niczego nie zapisały');

      // wybory: trzy zwykłe wpisy → moment / pomiń / pomiń, jeden DEMO → zegar
      const [mom, sk1, sk2] = plain, demoClock = demo[0];
      const choices = { [mom.id]: 'moment', [sk1.id]: 'skip', [sk2.id]: 'skip', [demoClock.id]: 'clock' };
      const r = await H.dash(E.S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token, choices });
      assert.equal(r.status, 200, JSON.stringify(r.j));
      const j = await E.waitJob();
      assert.equal(j.error, null, JSON.stringify(j.error));
      const rep = j.result;
      assert.deepEqual(rep.byChoice, { clock: plain.length - 3 + 1, moment: 1 + 2, skip: 2 });
      assert.equal(rep.changed, cand.length - 2); assert.equal(rep.errors.length, 0);
      const after = await E.pages();
      const get = (id, arr) => arr.find((x) => x.id === id);
      const clock = (d) => d.start.slice(0, 16), ms = (d) => Date.parse(d.start);
      // pominięte: dokładnie takie same jak przed (przesunięcie Warszawy), bez zapisu strefy
      for (const s of [sk1, sk2]) assert.deepEqual(get(s.id, after).d, get(s.id, before).d, 'pominięty wpis nietknięty');
      const raw = await E.A.get('/__test/pages?ds=trades');
      for (const s of [sk1, sk2]) assert.notEqual(raw.find((x) => x.id === s.id).tz.Data, 'America/New_York', 'pominięty wpis bez strefy NY w zapisie');
      // moment: ten sam moment, inny zegar; DEMO z wyborem „zegar”: ten sam zegar
      const b1 = get(mom.id, before), a1 = get(mom.id, after);
      assert.equal(ms(a1.d), ms(b1.d), 'ten sam moment'); assert.notEqual(clock(a1.d), clock(b1.d));
      const b2 = get(demoClock.id, before), a2 = get(demoClock.id, after);
      assert.equal(clock(a2.d), clock(b2.d), 'DEMO z wyborem zegara: ta sama godzina');
      // reszta zwykłych: zegar; reszta DEMO: moment
      for (const it of plain.slice(3)) { const b = get(it.id, before), a = get(it.id, after); assert.equal(clock(a.d), clock(b.d), it.title); }
      for (const it of demo.slice(1)) { const b = get(it.id, before), a = get(it.id, after); assert.equal(ms(a.d), ms(b.d), it.title); }
      // poprawione wpisy są w NY, pominięte dalej są kandydatami
      pv = await preview();
      assert.deepEqual(new Set(pv.items.map((x) => x.id)), new Set([sk1.id, sk2.id]), 'po poprawie na liście zostają tylko pominięte');
    } finally { E.stop(); }
    // klucz zgody wiąże zgodę z danymi podglądu, a nie z wyborami: wybory przychodzą w tym samym żądaniu co „TAK” (jedna zgoda), serwer waliduje je osobno.
    // Inna godzina albo inna domyślna grupa (DEMO) to inny klucz; parametr wyborów nie istnieje (dodatkowy argument nic nie zmienia).
    const pg = (id, title, d) => ({ id, properties: { Trade: { type: 'title', title: [{ plain_text: title }] }, Data: { type: 'date', date: d } } });
    const w1 = { start: '2026-11-02T09:54:00.000+01:00', time_zone: null };
    const plan = N.planPages([pg('a', 'ES', w1), pg('b', 'ES', { start: '2026-11-02T10:54:00.000+01:00', time_zone: null })], { date: 'Data' });
    assert.equal(N.planKey(plan, { a: 'moment' }), N.planKey(plan), 'wybory nie wchodzą do klucza zgody');
    assert.notEqual(N.planKey(plan), N.planKey(N.planPages([pg('a', 'ES', w1), pg('b', 'ES', { start: '2026-11-02T11:54:00.000+01:00', time_zone: null })], { date: 'Data' })), 'zmiana godziny w Notion zmienia klucz');
    assert.notEqual(N.planKey(N.planPages([pg('a', 'ES', w1)], { date: 'Data' })), N.planKey(N.planPages([pg('a', 'DEMO · ES', w1)], { date: 'Data' })), 'inna domyślna grupa to inny klucz');
    assert.equal(N.planKey.length, 1, 'planKey przyjmuje tylko plan');
  });

  test('backtest-odbior-strefa: w czasie poprawy zapis, edycja i usuwanie trade\'ów dają 409; po zakończeniu znowu działają', async () => {
    const A = await H.atrapa(5310);
    const dir = H.tmp();
    // odstęp 150 ms między stronami: zadanie trwa kilka sekund, więc zdążymy uderzyć w trasy zapisu
    const S = await H.server(5311, { ...NOTION_ENV(A, dir), THQ_TZFIX_PACE_MS: '150' });
    try {
      const trades = await (await fetch(`${S.base}/api/data`)).json();
      const id = trades.data.trades[0]._id;
      await H.dash(S.base, '/api/tz-fix/preview', {});
      let j;
      for (;;) { j = await (await fetch(`${S.base}/api/tz-fix`)).json(); if (!j.running) break; await H.sleep(80); }
      const ok = await H.dash(S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: j.result.token });
      assert.equal(ok.status, 200);
      await H.sleep(1500);
      const st = await (await fetch(`${S.base}/api/tz-fix`)).json();
      assert.equal(st.running, true, 'poprawa jeszcze trwa');
      const post = await H.dash(S.base, '/api/trades', { name: 'w trakcie', typ: 'Live', date: '2026-10-30', time: '10:30' });
      assert.equal(post.status, 409, JSON.stringify(post.j)); assert.equal(post.j.code, 'running');
      assert.equal((await H.dash(S.base, `/api/trades/${id}`, { notes: 'x' }, { method: 'PATCH' })).status, 409);
      assert.equal((await H.dash(S.base, `/api/trades/${id}/trash`, {})).status, 409);
      // R3-2: kosz i przywracanie trade'ów backtestu oraz usuwanie wpisów DEMO też dają 409 (strony z planu poprawy)
      for (const u of ['/api/backtest/trade/trash', '/api/backtest/trade/restore']) {
        const r = await H.dash(S.base, u, { sessionId: 'x', tradeId: 'y' });
        assert.equal(r.status, 409, u); assert.equal(r.j.code, 'running', u);
      }
      const dm = await H.dash(S.base, '/api/demo/remove', { apply: true });
      assert.equal(dm.status, 409, JSON.stringify(dm.j)); assert.equal(dm.j.code, 'running');
      for (;;) { const x = await (await fetch(`${S.base}/api/tz-fix`)).json(); if (!x.running) break; await H.sleep(200); }
      const after = await H.dash(S.base, '/api/trades', { name: 'po poprawie', typ: 'Live', date: '2026-10-30', time: '10:30' });
      assert.equal(after.status, 200, JSON.stringify(after.j));
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-odbior-strefa: wierność atrapy Notion: przesunięcie liczone dla zegara w nocy zmiany czasu, koniec zakresu zachowany, regex przesunięcia zakotwiczony na końcu', async () => {
    const A = await H.atrapa(5318);
    try {
      const pg = (await A.get('/__test/pages?ds=trades'))[0];
      const patch = async (date) => {
        const r = await fetch(`${A.base}/v1/pages/${pg.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json', 'Notion-Version': '2025-09-03' }, body: JSON.stringify({ properties: { Data: { date } } }) });
        assert.equal(r.status, 200, await r.clone().text());
        return (await A.get('/__test/pages?ds=trades')).find((x) => x.id === pg.id).p.Data.date;
      };
      // noc zmiany czasu: kontrola wartości, które dawały złe przesunięcie, gdy zegar ścienny był liczony jak UTC
      assert.match((await patch({ start: '2026-03-08T04:00:00', time_zone: 'America/New_York' })).start, /T04:00:00\.000-04:00$/, 'NY po zmianie wiosennej (8.03): -04:00');
      assert.match((await patch({ start: '2026-11-01T03:30:00', time_zone: 'America/New_York' })).start, /T03:30:00\.000-05:00$/, 'NY po zmianie jesiennej (1.11): -05:00');
      assert.match((await patch({ start: '2026-03-29T01:30:00', time_zone: 'Europe/Warsaw' })).start, /T01:30:00\.000\+01:00$/, 'Warszawa przed zmianą wiosenną (29.03 01:30): +01:00');
      assert.match((await patch({ start: '2026-10-25T03:30:00', time_zone: 'Europe/Warsaw' })).start, /T03:30:00\.000\+01:00$/, 'Warszawa po zmianie jesiennej (25.10 03:30): +01:00');
      // godzina, której nie ma (NY 8.03 02:30) i dwuznaczna (NY 1.11 01:30): wartości wpisane na sztywno, żeby błąd wallToMs z kodu aplikacji nie przechodził do atrapy po cichu
      assert.match((await patch({ start: '2026-03-08T02:30:00', time_zone: 'America/New_York' })).start, /T02:30:00\.000-05:00$/, 'godzina nieistniejąca: konwencja atrapy to przesunięcie sprzed zmiany (-05:00)');
      assert.match((await patch({ start: '2026-11-01T01:30:00', time_zone: 'America/New_York' })).start, /T01:30:00\.000-04:00$/, 'godzina dwuznaczna: konwencja atrapy to pierwsze wystąpienie (-04:00)');
      // koniec zakresu nie ginie przy zapisie, w tej samej strefie
      const r = await patch({ start: '2026-10-30T10:30:00', end: '2026-10-30T11:45:00', time_zone: 'America/New_York' });
      assert.match(r.start, /T10:30:00\.000-04:00$/); assert.match(r.end, /T11:45:00\.000-04:00$/, 'end zachowany z przesunięciem NY');
      // start z przesunięciem bez strefy zostaje jak podano, koniec też
      const k = await patch({ start: '2026-10-30T10:30:00.000+01:00', end: '2026-10-30T11:45:00.000+01:00' });
      assert.equal(k.start, '2026-10-30T10:30:00.000+01:00'); assert.equal(k.end, '2026-10-30T11:45:00.000+01:00');
      // regex przesunięcia kotwiczony na końcu: godzina bez przesunięcia i bez strefy jest odrzucana także wtedy, gdy w tekście jest litera z / Z
      const bad = await fetch(`${A.base}/v1/pages/${pg.id}`, { method: 'PATCH', headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json', 'Notion-Version': '2025-09-03' }, body: JSON.stringify({ properties: { Data: { date: { start: '2026-10-30T10:30:00-garbage-Z-tekst' } } } }) });
      assert.equal(bad.status, 400, 'start z Z w środku nie jest przesunięciem');
    } finally { A.stop(); }
  });

  test('backtest-odbior-strefa: lista w podglądzie: kolumna „Po poprawie (NY)” podaje datę, gdy „ten sam moment” zmienia dzień; tytuł z HTML jest escapowany', async () => {
    const oldFetch = globalThis.fetch;
    const hadLs = 'localStorage' in globalThis;
    if (!hadLs) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    const item = (id, title, group, was, to, toMoment) => ({ id, title, instrument: 'ES', group, fields: [{ role: 'date', was, offset: '+01:00', to, toMoment }] });
    const result = { token: 't', word: 'TAK', pages: 3, fields: 3, total: 3, groups: { clock: { pages: 1, fields: 1 }, moment: { pages: 2, fields: 2 } }, skipped: {}, example: { from: 'a', to: 'b', zone: 'America/New_York' }, items: [
      item('a', 'DEMO · noc', 'moment', '2026-11-02 03:00', '2026-11-02 03:00', '2026-11-01 21:00'),
      item('b', 'DEMO · dzień', 'moment', '2026-11-02 15:35', '2026-11-02 15:35', '2026-11-02 09:35'),
      item('c', '<img src=x onerror=alert(1)>', 'clock', '2026-11-02 03:00', '2026-11-02 03:00', '2026-11-01 21:00'),
    ] };
    globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ running: false, kind: 'preview', finishedAt: 'x', result }), text: async () => '' });
    let sec;
    try {
      const { createTzSec } = await imp('public/js/ust-strefa.js');
      sec = createTzSec({ opts: {}, isActive: () => false, rerender() {}, root: () => null });
      sec.enter(); await H.sleep(60);
      sec.handle('tz-preview'); await H.sleep(60);
      const h = sec.html();
      const cell = (id) => (h.match(new RegExp(`data-tzo="${id}">([^<]*)<`)) || [])[1];
      assert.equal(cell('a'), '11-01 21:00', 'noc: moment przechodzi na poprzedni dzień, z datą');
      assert.equal(cell('b'), '09:35', 'ten sam dzień: sama godzina');
      assert.equal(cell('c'), '03:00', 'domyślny zegar: ta sama godzina, bez daty');
      assert.ok(!h.includes('<img src=x'), 'tytuł z HTML escapowany');
    } finally { sec?.leave(); globalThis.fetch = oldFetch; if (!hadLs) delete globalThis.localStorage; }
  });

  test('backtest-odbior-strefa: zapis trade\'a przyjęty tuż przed poprawą (jeszcze w toku) blokuje jej start: apply 409, po zakończeniu zapisu poprawa działa', async () => {
    const A = await H.atrapa(5316);
    const dir = H.tmp();
    const S = await H.server(5317, NOTION_ENV(A, dir));
    try {
      const id = (await (await fetch(`${S.base}/api/data`)).json()).data.trades[0]._id;
      const preview = async () => { await H.dash(S.base, '/api/tz-fix/preview', {}); for (;;) { const j = await (await fetch(`${S.base}/api/tz-fix`)).json(); if (!j.running) return j.result; await H.sleep(60); } };
      let pv = await preview();
      // wolny zapis strony w Notion (1,5 s): PATCH trade'a jest przyjęty przez serwer, ale jeszcze nie skończony
      await A.post('/__test/delay', { match: 'PATCH /v1/pages', ms: 1500 });
      const slow = H.dash(S.base, `/api/trades/${id}`, { notes: 'zapis w toku' }, { method: 'PATCH' });
      await H.sleep(300);
      const w0 = (await A.writes()).length;
      const r = await H.dash(S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token });
      assert.equal(r.status, 409, JSON.stringify(r.j)); assert.equal(r.j.code, 'running');
      assert.equal((await A.writes()).length, w0, 'odrzucona poprawa nie zapisała stron (liczba zapisów w atrapie bez zmian)');
      assert.equal((await slow).status, 200, 'zapis w toku dokończył się');
      await A.post('/__test/delay', { match: '', ms: 0 });
      // licznik wrócił do zera: nowy podgląd i poprawa przechodzą
      pv = await preview();
      const ok = await H.dash(S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token });
      assert.equal(ok.status, 200, JSON.stringify(ok.j));
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-odbior-strefa: klient przerywa zapis trade\'a w trakcie: licznik zapisów trwa do końca pracy serwera, apply dostaje 409 aż do końca zapisu w Notion', async () => {
    const A = await H.atrapa(5319);
    const dir = H.tmp();
    const S = await H.server(5320, NOTION_ENV(A, dir));
    try {
      const id = (await (await fetch(`${S.base}/api/data`)).json()).data.trades[0]._id;
      const preview = async () => { await H.dash(S.base, '/api/tz-fix/preview', {}); for (;;) { const j = await (await fetch(`${S.base}/api/tz-fix`)).json(); if (!j.running) return j.result; await H.sleep(60); } };
      let pv = await preview();
      // zapis w Notion trwa 2,5 s; klient zrywa połączenie po 300 ms (zamknięta karta, przeładowanie)
      await A.post('/__test/delay', { match: 'PATCH /v1/pages', ms: 2500 });
      const t0 = Date.now();
      const ac = new AbortController();
      const slow = fetch(`${S.base}/api/trades/${id}`, { method: 'PATCH', signal: ac.signal, headers: { Origin: S.base, 'X-THQ': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'przerwany zapis' }) }).then(() => 'ok', (e) => e.name);
      await H.sleep(300);
      ac.abort();
      assert.equal(await slow, 'AbortError', 'klient przerwał żądanie');
      await H.sleep(300);
      // serwer dalej czeka na Notion, więc poprawa nie może wystartować
      const r = await H.dash(S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token });
      assert.ok(Date.now() - t0 < 2200, 'próba przed końcem zapisu w Notion');
      assert.equal(r.status, 409, JSON.stringify(r.j)); assert.equal(r.j.code, 'running');
      // po zakończeniu zapisu licznik wraca do zera i poprawa przechodzi (nowy podgląd, bo zgoda jest jednorazowa)
      await H.sleep(2300);
      await A.post('/__test/delay', { match: '', ms: 0 });
      pv = await preview();
      const ok = await H.dash(S.base, '/api/tz-fix/apply', { confirm: 'TAK', token: pv.token });
      assert.equal(ok.status, 200, JSON.stringify(ok.j));
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-odbior-strefa: poprawa przerwana błędem jednej strony: reszta poprawiona, błąd w raporcie, ponowienie dokańcza tylko brakujące; bez kopii nic się nie zmienia', async () => {
    const N = await imp('lib/strefa-notion.mjs');
    const { createNotion } = await imp('lib/notion.mjs');
    const A = await H.atrapa(5305);
    try {
      const notion = createNotion({ token: 'x', base: A.base });
      const ds = H.IDS.DS_TRADES;
      const roles = { date: 'Data', exit: 'Wyjście' };
      const all = async () => notion.queryAll(ds);
      const plan0 = N.planPages(await all(), roles);
      assert.ok(plan0.pages.length > 3);
      const badId = plan0.pages[1].id;
      let failed = 0;
      const flaky = Object.create(notion);
      flaky.patch = async (p, b) => { if (p.includes(badId) && !failed++) throw new Error('Notion: chwilowy błąd'); return notion.patch(p, b); };
      const rep = await N.applyPlan(flaky, plan0, { pace: 0 });
      assert.equal(rep.errors.length, 1); assert.equal(rep.changed, plan0.pages.length - 1);
      assert.match(rep.errors[0].message, /chwilowy/);
      // ponowienie: plan liczy się od nowa, zostaje tylko strona z błędu
      const plan1 = N.planPages(await all(), roles);
      assert.deepEqual(plan1.pages.map((p) => p.id), [badId]);
      const rep2 = await N.applyPlan(flaky, plan1, { pace: 0 });
      assert.equal(rep2.errors.length, 0); assert.equal(rep2.changed, 1);
      assert.equal(N.planPages(await all(), roles).pages.length, 0, 'wszystko poprawione, podgląd pusty');

      // odstęp między zapisami: z pace > 0 co najmniej tyle czasu
      const A2 = await H.atrapa(5306);
      try {
        const n2 = createNotion({ token: 'x', base: A2.base });
        const p2 = N.planPages(await n2.queryAll(ds), roles);
        const t0 = Date.now();
        await N.applyPlan(n2, { ...p2, pages: p2.pages.slice(0, 4) }, { pace: 120 });
        assert.ok(Date.now() - t0 >= 3 * 120 - 10, `odstęp między zapisami (${Date.now() - t0} ms)`);
      } finally { A2.stop(); }

      // bez kopii nic się nie zmienia; w czasie zadania busy() mówi powód (serwer zwraca z tego 409)
      const A3 = await H.atrapa(5307);
      try {
        const n3 = createNotion({ token: 'x', base: A3.base });
        const fix = N.createTzFix({ notion: n3, sources: { trades: ds }, loadRoles: async () => roles, copy: async () => { throw new Error('dysk pełny'); }, pace: 0, log: () => {} });
        assert.equal(fix.busy(), null);
        await fix.preview();
        let st; for (let i = 0; i < 100; i++) { st = fix.status(); if (!st.running) break; await H.sleep(50); }
        await fix.apply('', 'TAK', st.result.token);
        assert.ok(fix.busy(), 'zadanie trwa: busy() niesie powód');
        for (let i = 0; i < 100; i++) { st = fix.status(); if (!st.running) break; await H.sleep(50); }
        assert.match(st.error.message, /dysk pełny/);
        assert.equal((await A3.writes()).length, 0, 'bez kopii żaden zapis do Notion');
      } finally { A3.stop(); }
    } finally { A.stop(); }
  });

  test('backtest-odbior-strefa: edycja starego wpisu nie wysyła daty i godziny, jeśli ich nie zmieniono (formularz), a zmieniona godzina idzie w NY', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const A = await H.atrapa(5312);
    const dir = H.tmp();
    const S = await H.server(5313, { ...NOTION_ENV(A, dir), THQ_TEST_PAGES: '1' });
    try {
      const txt = await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: readFileSync(path.join(ROOT, 'testy/scen-odbior-edycja.js'), 'utf8') });
      const res = JSON.parse(txt);
      assert.ok(!res.fatal, res.fatal);
      assert.deepEqual(res.checks.filter((c) => !c.ok).map((c) => c.msg), []);
      assert.ok(res.checks.length >= 4, `sprawdzenia strony: ${res.checks.length}`);
      const pages = await A.get('/__test/pages?ds=trades');
      const p = pages.find((x) => x.id === res.id);
      assert.match(p.p.Notatki.rich_text.map((y) => y.plain_text).join(''), /tylko notatka/);
      assert.equal(p.p.Data.date.start, res.startBefore, 'data i godzina starego wpisu bez zmian po edycji samej notatki');
      assert.equal(p.tz.Data, 'Europe/Warsaw', 'strefa zapisu starego wpisu nietknięta (zostaje do poprawy strefy)');
      const p2 = pages.find((x) => x.id === res.id2);
      assert.match(p2.p.Data.date.start, /T08:15:00\.000-0[45]:00$/, 'zmieniona godzina idzie w NY');
      assert.equal(p2.tz.Data, 'America/New_York');
    } finally { S.stop(); A.stop(); }
  });

  test('backtest-odbior-strefa: e2e: formularz dashboardu: 10:30 → atrapa dostaje 10:30 America/New_York; etykieta NY przy polach godziny, w liście i w kartach newsów; Ustawienia: pole strefy i poprawa starych wpisów z podglądem, ręcznym „TAK”, kopią i wynikiem', async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    const A = await H.atrapa(5308, { ATRAPA_DEMO: '2' });
    const dir = H.tmp();
    const S = await H.server(5309, { ...NOTION_ENV(A, dir), THQ_TEST_PAGES: '1' });
    try {
      const txt = await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: readFileSync(path.join(ROOT, 'testy/scen-odbior-strefa.js'), 'utf8') });
      const res = JSON.parse(txt);
      assert.ok(!res.fatal, res.fatal);
      assert.deepEqual(res.checks.filter((c) => !c.ok).map((c) => c.msg), []);
      assert.ok(res.checks.length >= 30, `sprawdzenia strony: ${res.checks.length}`);
      const pages = (await A.get('/__test/pages?ds=trades')).filter((x) => (x.p.Trade?.title || []).map((y) => y.plain_text).join('') === 'Strefa NY e2e');
      assert.equal(pages.length, 1, 'trade zapisany w atrapie');
      assert.equal(pages[0].tz.Data, 'America/New_York');
      assert.match(pages[0].p.Data.date.start, /T10:30:00\.000-0[45]:00$/);
      assert.equal(pages[0].tz['Wyjście'], 'America/New_York');
      assert.match(pages[0].p['Wyjście'].date.start, /T11:05:00/);
    } finally { S.stop(); A.stop(); }
  });
};
