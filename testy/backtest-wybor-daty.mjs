// wybor-daty (1.6.1): własny wybierak daty i godziny zamiast natywnych pól date/time.
// [U] 1.11.2026 «stworz w naszym stylu design okna ustawiania czasu i daty, ma byc proste w uzytku najlepiej»
// Logika czysta w Node (public/js/wybor-daty-logika.js), zachowanie komponentu w przeglądarce (testy/wybor-daty.html),
// a podmienione pola na prawdziwym dashboardzie testowym na atrapie Notion (testy/scen-wybor-daty.js): każde zapisuje to samo co natywne pole.
import path from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const L = () => imp('public/js/wybor-daty-logika.js');

  // ---------- logika ----------
  test('wybor-daty: wpisana data PL (dd.mm.rrrr) i EN (mm/dd/yyyy), ISO w obu, nazwy miesięcy', async () => {
    const { parseDate, formatDate } = await L();
    assert.equal(parseDate('01.11.2026', 'pl'), '2026-11-01');
    assert.equal(parseDate('1.11.2026', 'pl'), '2026-11-01');
    assert.equal(parseDate('1/11/2026', 'pl'), '2026-11-01', 'ukośnik też w PL');
    assert.equal(parseDate('11/01/2026', 'en'), '2026-11-01');
    assert.equal(parseDate('11.01.2026', 'en'), '2026-11-01', 'EN: miesiąc przed dniem także z kropką');
    assert.equal(parseDate('2026-11-01', 'pl'), '2026-11-01');
    assert.equal(parseDate('2026-11-01', 'en'), '2026-11-01');
    assert.equal(parseDate('1 lis 2026', 'pl'), '2026-11-01');
    assert.equal(parseDate('1 listopada 2026', 'pl'), '2026-11-01');
    assert.equal(parseDate('3 października 2025', 'pl'), '2025-10-03', 'polskie znaki w nazwie miesiąca');
    assert.equal(parseDate('Nov 1, 2026', 'en'), '2026-11-01');
    assert.equal(parseDate('  ', 'pl'), '');
    assert.equal(parseDate('', 'en'), '');
    for (const bad of ['31.11.2026', '00.01.2026', '12.13.2026', 'abc', '1.11', '1.11.26', '1.11.2026.5', '01112026']) assert.equal(parseDate(bad, 'pl'), null, `odrzucone w trakcie pisania: ${bad}`);
    assert.equal(formatDate('2026-11-01', 'pl'), '01.11.2026');
    assert.equal(formatDate('2026-11-01', 'en'), '11/01/2026');
    assert.equal(formatDate('', 'pl'), '');
    for (const iso of ['2024-02-29', '2025-12-31', '2026-01-01', '2000-02-29']) for (const lang of ['pl', 'en']) assert.equal(parseDate(formatDate(iso, lang), lang), iso, `${lang}: ${iso} w obie strony`);
  });

  test('wybor-daty: zatwierdzenie (loose): rok dwucyfrowy, bez roku, 8 cyfr; dalej odrzuca złe dni', async () => {
    const { parseDate } = await L();
    const o = { loose: true, today: '2026-11-01' };
    assert.equal(parseDate('1.11.26', 'pl', o), '2026-11-01');
    assert.equal(parseDate('5.3', 'pl', o), '2026-03-05', 'bez roku: rok bieżący');
    assert.equal(parseDate('3/5', 'en', o), '2026-03-05');
    assert.equal(parseDate('01112026', 'pl', o), '2026-11-01');
    assert.equal(parseDate('11012026', 'en', o), '2026-11-01');
    assert.equal(parseDate('1.1.99', 'pl', o), '1999-01-01', 'rok dwucyfrowy daleko w przyszłości to poprzedni wiek');
    assert.equal(parseDate('30.2.24', 'pl', o), null);
    assert.equal(parseDate('lis', 'pl', o), null);
  });

  test('wybor-daty: luty przestępny i przełom roku', async () => {
    const { parseDate, isLeap, daysIn, addDays, addMonths, addYears, moveKey } = await L();
    assert.ok(isLeap(2024) && isLeap(2000) && !isLeap(1900) && !isLeap(2026));
    assert.equal(daysIn(2024, 2), 29); assert.equal(daysIn(2026, 2), 28); assert.equal(daysIn(2100, 2), 28);
    assert.equal(parseDate('29.02.2024', 'pl'), '2024-02-29');
    assert.equal(parseDate('29.02.2026', 'pl'), null);
    assert.equal(parseDate('02/29/2100', 'en'), null);
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2025-12-31', 1), '2026-01-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addMonths('2024-01-31', 1), '2024-02-29', '31 stycznia + miesiąc = koniec lutego');
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2025-12-15', 1), '2026-01-15');
    assert.equal(addMonths('2026-01-15', -1), '2025-12-15');
    assert.equal(addYears('2024-02-29', 1), '2025-02-28');
    assert.equal(moveKey('2025-12-31', 'ArrowRight'), '2026-01-01');
    assert.equal(moveKey('2026-01-01', 'ArrowLeft'), '2025-12-31');
    assert.equal(moveKey('2025-12-29', 'ArrowDown'), '2026-01-05');
    assert.equal(moveKey('2026-01-05', 'ArrowUp'), '2025-12-29');
    assert.equal(moveKey('2025-12-15', 'PageDown'), '2026-01-15');
    assert.equal(moveKey('2024-02-29', 'PageDown', { shift: true }), '2025-02-28');
    assert.equal(moveKey('2026-01-10', 'PageUp', { shift: true }), '2025-01-10');
  });

  test('wybor-daty: siatka miesiąca od poniedziałku (6 tygodni), Home/End tygodnia', async () => {
    const { monthGrid, weekdayMon, moveKey } = await L();
    const g = monthGrid('2026-11');
    assert.equal(g.length, 42);
    assert.equal(g[0], '2026-10-26', '1 listopada 2026 to niedziela: siatka od poniedziałku 26 października');
    assert.equal(g[6], '2026-11-01');
    assert.equal(weekdayMon('2026-11-02'), 0, 'poniedziałek = 0');
    assert.equal(weekdayMon('2026-11-01'), 6, 'niedziela = 6');
    const f = monthGrid('2024-02');
    assert.equal(f[0], '2024-01-29'); assert.ok(f.includes('2024-02-29'));
    assert.equal(monthGrid('2026-06')[0], '2026-06-01', 'miesiąc od poniedziałku zaczyna siatkę od 1.');
    assert.equal(moveKey('2026-11-04', 'Home'), '2026-11-02');
    assert.equal(moveKey('2026-11-04', 'End'), '2026-11-08');
    assert.equal(moveKey('2026-11-04', 'Enter'), null);
  });

  test('wybor-daty: zakres min/max', async () => {
    const { inRange, clamp } = await L();
    assert.ok(inRange('2024-03-12', '2024-01-02', '2024-12-31'));
    assert.ok(!inRange('2024-01-01', '2024-01-02', '2024-12-31'));
    assert.ok(!inRange('2025-01-01', '2024-01-02', '2024-12-31'));
    assert.ok(inRange('1990-01-01', '', ''), 'puste granice nie ograniczają');
    assert.equal(clamp('2023-05-05', '2024-01-02', '2024-12-31'), '2024-01-02');
    assert.equal(clamp('2025-05-05', '2024-01-02', '2024-12-31'), '2024-12-31');
    assert.equal(clamp('2024-05-05', '2024-01-02', '2024-12-31'), '2024-05-05');
    assert.equal(clamp('2024-05-05', 'zle', ''), '2024-05-05', 'zła granica jest pomijana');
  });

  test('wybor-daty: godzina: wpisywanie, kroki strzałkami z przeniesieniem i zawinięciem doby, wyrównanie do 5 min', async () => {
    const { parseTime, stepTime, partAt } = await L();
    assert.equal(parseTime('09:30'), '09:30'); assert.equal(parseTime('9:30'), '09:30'); assert.equal(parseTime('9.30'), '09:30');
    assert.equal(parseTime(''), '');
    for (const bad of ['24:00', '9:60', '930', '9', 'ab:cd', '9:5']) assert.equal(parseTime(bad), null, `w trakcie pisania: ${bad}`);
    const o = { loose: true };
    assert.equal(parseTime('930', o), '09:30'); assert.equal(parseTime('1430', o), '14:30'); assert.equal(parseTime('9', o), '09:00');
    assert.equal(parseTime('14', o), '14:00'); assert.equal(parseTime('9 30', o), '09:30'); assert.equal(parseTime('9h30', o), '09:30'); assert.equal(parseTime('9:5', o), '09:05');
    assert.equal(parseTime('2460', o), null); assert.equal(parseTime('99', o), null);
    assert.equal(stepTime('09:59', 'm', 1), '10:00', 'przeniesienie na godzinę');
    assert.equal(stepTime('23:59', 'm', 1), '00:00', 'zawinięcie doby');
    assert.equal(stepTime('00:00', 'm', -1), '23:59');
    assert.equal(stepTime('23:30', 'h', 1), '00:30');
    assert.equal(stepTime('00:30', 'h', -1), '23:30');
    assert.equal(stepTime('09:32', 'm', 5, { snap: true }), '09:35');
    assert.equal(stepTime('09:32', 'm', -5, { snap: true }), '09:30');
    assert.equal(stepTime('09:30', 'm', 5, { snap: true }), '09:35');
    assert.equal(stepTime('09:30', 'm', -5, { snap: true }), '09:25');
    assert.equal(stepTime('09:57', 'm', 5, { snap: true }), '10:00');
    assert.equal(stepTime('', 'h', 1), '01:00', 'puste pole startuje od 00:00');
    assert.equal(partAt(0), 'h'); assert.equal(partAt(2), 'h'); assert.equal(partAt(3), 'm'); assert.equal(partAt(5), 'm');
  });

  // ---------- źródła: żadnego natywnego pola daty i godziny, każde pole ma wybierak ----------
  test('wybor-daty: w public/js nie ma natywnych pól date/time ani datetime-local; podmienione pola mają data-wd', () => {
    const dir = path.join(ROOT, 'public/js');
    const left = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const s = src(`public/js/${f}`);
      s.split(/\r?\n/).forEach((line, i) => { if (/type=\\?["']?(date|time|datetime-local)\b/.test(line)) left.push(`${f}:${i + 1}`); });
    }
    assert.deepEqual(left, [], 'natywne pola daty/godziny');
    const want = {
      'bt-kreator.js': ['name="from"', 'name="startTime"'], 'ust-backtest.js': ['data-btd="startTime"', 'data-btf="cel.at"'],
      'ust-zrodla.js': ['id="sv-cr-exp"', 'id="sv-imp${kind}-from"', 'id="sv-imp${kind}-to"'], 'bt-filtr-widok.js': ['data-p="${spec.p}"'],
      'form.js': ['id="f-date"', 'id="f-time"', 'id="f-exitDate"', 'id="f-exitTime"'], 'prop.js': ['id="f-bought"', 'id="f-date"'],
      'kalendarz.js': ['data-cal-date="1"'], 'podglad.js': ['data-ovk="sess.${id}.from"', 'data-ovk="sess.${id}.to"'], 'ust-wykresy.js': ['data-ovt="${id}.from"', 'data-ovt="${id}.to"'],
    };
    const missing = [];
    for (const [f, marks] of Object.entries(want)) {
      const lines = src(`public/js/${f}`).split(/\r?\n/);
      for (const m of marks) if (!lines.some((l) => l.includes(m) && /data-wd="(date|time)"/.test(l.slice(Math.max(0, l.indexOf(m) - 200), l.indexOf(m) + 300)))) missing.push(`${f}: ${m}`);
    }
    assert.deepEqual(missing, [], 'pola bez wybieraka');
    // pola godziny NY mają etykietę strefy
    for (const [f, m] of [['bt-kreator.js', 'name="startTime"'], ['ust-backtest.js', 'data-btd="startTime"'], ['ust-backtest.js', 'data-btf="cel.at"'], ['ust-wykresy.js', 'data-ovt="${id}.from"'], ['podglad.js', 'data-ovk="sess.${id}.from"']]) {
      const l = src(`public/js/${f}`).split(/\r?\n/).find((x) => x.includes(m));
      assert.match(l, /data-wd-tz="NY"/, `${f}: ${m} z etykietą NY`);
    }
    // komponent ładuje się z aplikacją, a i18n ma tłumaczenia
    assert.match(src('public/js/app.js'), /import ['"]\.\/wybor-daty\.js['"]|from ['"]\.\/wybor-daty\.js['"]/);
    assert.match(src('public/js/wybor-daty.js'), /prefers-reduced-motion|matchMedia/);
    assert.match(src('public/features.css'), /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.wd-pop/);
  });

  // ---------- przeglądarka: komponent na stronie testowej i podmienione pola w dashboardzie ----------
  const runs = {};
  function pageRun(key, port, url, opts) {
    runs[key] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      for (const [day, seed] of [['2024-03-11', 1], ['2024-03-12', 2], ['2024-03-14', 3]]) await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day, seed });
      const A = url.app ? await H.atrapa(port + 1, { ATRAPA_DEMO: '3' }) : null;
      if (url.app) writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: url.lang || 'pl', onboarded: true, defaultsUpgraded: '1.6.0' }));
      const env = url.app ? { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_TEST_PAGES: '1' } : { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir };
      const S = await H.server(port, env);
      try {
        const txt = await P.cdpPage(S.base + url.path, { timeoutMs: 150_000, ...opts });
        return JSON.parse(txt);
      } finally { S.stop(); A?.stop(); }
    })();
    return runs[key];
  }
  async function tagged(run, tag, min) {
    const res = await run();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
  }
  const comp = (w) => () => pageRun(`comp-${w}`, w === 375 ? 4973 : 4971, { path: '/__testy/wybor-daty.html' }, { width: w, height: w === 375 ? 812 : 1080, mobile: w === 375 });
  const C = (tag, min, w = 1920) => tagged(comp(w), tag, min);
  test('wybor-daty: komponent: wartość w starym formacie, wpisywanie PL, zdarzenia input/change, FormData', () => C('wartosc', 10));
  test('wybor-daty: komponent: kalendarz: ARIA (combobox, dialog, grid), poniedziałek pierwszy, klawiatura (strzałki, PageUp/Down, Home/End, Enter, Esc, Tab)', () => C('klawiatura', 14));
  test('wybor-daty: komponent: min/max i dni wyłączone z powodem w title, „Dziś”, szybki wybór miesiąca i roku', () => C('zakres', 10));
  test('wybor-daty: komponent: godzina: strzałki i kółko, presety, etykieta NY, Esc cofa', () => C('godzina', 10));
  test('wybor-daty: komponent: 375 px: arkusz od dołu na całą szerokość, cele dotyku ≥ 44 px, bez poziomego przewijania', () => C('mobile', 9, 375));
  test('wybor-daty: komponent: wersja EN: mm/dd/yyyy, tydzień od poniedziałku', () => C('en', 4));

  const app = () => pageRun('app', 4975, { path: '/', app: true }, { width: 1920, height: 1080, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-wybor-daty.js') });
  const A = (tag, min) => tagged(app, tag, min);
  test('wybor-daty: podmienione pola zapisują to samo: formularz trade\'a (data i godzina wejścia, wyjście)', () => A('trade', 6));
  test('wybor-daty: podmienione pola zapisują to samo: Prop (data zakupu, data wydatku)', () => A('prop', 2));
  test('wybor-daty: podmienione pola zapisują to samo: kreator sesji (data startu z dniami bez danych, godzina startu NY)', () => A('kreator', 7));
  test('wybor-daty: podmienione pola zapisują to samo: filtr dni (zakres dat)', () => A('filtr', 2));
  test('wybor-daty: podmienione pola zapisują to samo: Ustawienia → Backtest (godzina startu, skok „do godziny”)', () => A('ust-bt', 3));
  test('wybor-daty: podmienione pola zapisują to samo: Ustawienia → Źródła danych (kredyt „Ważny do”) i Wykresy (godziny sesji)', () => A('ust-inne', 3));
  test('wybor-daty: podmienione pola zapisują to samo: Kalendarz (wybór dnia)', () => A('kalendarz', 2));
};
