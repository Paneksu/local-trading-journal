// backtest-173 (strona): pakiet 1.7-3 „Auto-BE i nazwane presety zleceń” w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-173.html (1920 i ?w=375, Onyx i Platinum): auto BE w bilecie, próg BE na pozycji (+BE, przeciąganie, strzałki, Cofnij), edycja w panelu × i w szufladzie,
// wyzwolenie z komunikatem i plakietką BE, Journal z linią BE, chipy presetów, „Zapisz jako preset…”, przycisk przeciwny „Zamknij n”, brak przykrywania (elementFromPoint), układ 375 px.
// Ustawienia → Presety zleceń: osobny scenariusz na pełnym dashboardzie (testy/scen-173.js).
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const runs = {};
  function pageResult(variant) {
    runs[variant] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const narrow = variant.startsWith('375');
      const S = await H.server({ desktop: 4936, 'desktop-platinum': 4937, 375: 4938, '375-platinum': 4939 }[variant], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const q = `?${narrow ? 'w=375&' : ''}${variant.endsWith('platinum') ? 'theme=platinum' : 'theme=onyx'}`;
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-173.html${q}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 300_000 } : { width: 1920, height: 1080, timeoutMs: 300_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return runs[variant];
  }
  async function tagged(tag, min, variant = 'desktop') {
    const res = await pageResult(variant);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    // przejściowy błąd ładowania modułu nie może zostać w pamięci podręcznej: ponowienie testu przez runner uruchomi stronę od nowa
    if (res.fatal && /Failed to fetch dynamically imported module/.test(res.fatal)) delete runs[variant];
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length}, minimum ${min})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }

  test('backtest-173: bilet: auto BE z jednostkami R, pkt, ticki, $, cena, podgląd progu, R bez SL nieaktywne, offset z Ustawień', () => tagged('bilet', 18));
  test('backtest-173: pozycja: +BE, plakietka progu, przeciąganie z odczytem, strzałki, odrzucenie po złej stronie, chwyt linii, × z Cofnij', () => tagged('pozycja', 25));
  test('backtest-173: panel ×: opis progu, Zmień, Wyłącz, +Auto BE, R bez SL nieaktywne; kolumna Auto BE w szufladzie', () => tagged('panel', 15));
  test('backtest-173: wyzwolenie: komunikat aria-live, plakietka SL zmienia się w BE, próg znika, log, trade z beAt, Journal z linią BE', () => tagged('wyzwolenie', 16));
  test('backtest-173: chipy presetów: aktywacja wypełnia pola, Kup jednym kliknięciem z SL/TP/auto BE, edycja odłącza, Zapisz jako preset…, Odwróć z presetu', () => tagged('presety', 25));
  test('backtest-173: przycisk przeciwny bez SL w panelu zamyka całą otwartą ilość „Zamknij n” (Long i Short), z ręczną ilością nadal netting', () => tagged('zamknij', 6));
  test('backtest-173: nic nie przykrywa chipów, rzędu pod wejściem, × plakietek, okna części, formularzy i szuflady (elementFromPoint)', () => tagged('warstwy', 12));
  test('backtest-173: Platinum: bilet, pozycja, wyzwolenie, presety i warstwy jak w Onyx', async () => { for (const t of [['bilet', 18], ['pozycja', 25], ['wyzwolenie', 16], ['presety', 25], ['warstwy', 12], ['runda3', 14], ['runda4', 8]]) await tagged(t[0], t[1], 'desktop-platinum'); });
  test('backtest-173: 375: chipy zawijają się w rzędy na szerokość panelu, bez poziomego przewijania, przyciski nie są przykryte', () => tagged('telefon', 11, '375'));
  test('backtest-173 r4: granica plakietki BE +20t / SL przy 21t, przyklejony TP i próg BE rozsunięte, środki obu × trafiają w siebie', () => tagged('runda4', 8));
  test('backtest-173 r3: plakietka „BE +2t” w kolorze BE po wyzwoleniu z offsetem, podpis „BE” w Journalu, fakt „Wyjście z luką pod BE”, komunikat pominięcia auto BE', () => tagged('runda3', 14));

  // ---- Ustawienia → Presety zleceń na pełnym dashboardzie (atrapa Notion) ----
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  let setRes = null;
  function settingsResult() {
    setRes ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const A = await H.atrapa(4951);
      // atrapa po migracjach do najnowszej (pole „BE” z migracji 004 jest w schemacie trade'ów), jak w odbiorze e2e
      const dir = H.tmp();
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
      const env = { NOTION_TOKEN: 'secret_atrapa', NOTION_VERSION: '2026-03-11', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir };
      const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ ...env, NOTION_API_BASE: A.base }));
      assert.equal(mig.code, 0, String(mig.err || mig.out).slice(0, 300));
      const S = await H.server(4950, { ...env, NOTION_API_BASE: A.base });
      try {
        const txt = await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 180_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-173.js') });
        return JSON.parse(txt);
      } finally { S.stop(); A.stop(); }
    })();
    return setRes;
  }
  async function settingsTag(tag, min) {
    const res = await settingsResult();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length}, minimum ${min})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
  }
  test('backtest-173: Ustawienia → Presety zleceń: lista, edytor z walidacją przy polu, kolejność klawiaturą i przeciąganiem, usunięcie aktywnego, offset auto BE', async () => { await settingsTag('lista', 6); await settingsTag('edytor', 12); await settingsTag('kolejnosc', 5); await settingsTag('aktywny', 3); await settingsTag('offset', 3); });
  test('backtest-173: dziennik: pole „BE” w formularzu trade\'a ma opis i widoczną linię BE na rysunku pozycji', () => settingsTag('dziennik', 4));
};
