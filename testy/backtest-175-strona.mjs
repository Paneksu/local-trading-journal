// backtest-175 (strona): pakiet 1.7-5 „Kilka TP z procentem wielkości (drabinka)” w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-175.html (1920 i ?w=375, Onyx i Platinum): bilet z listą TP (+ TP, podział procentów, walidacja kolejności i procentów, podgląd celu i R:R, pamięć panelu),
// plakietki TP1..TP4 z ilością i procentem, edytor procentu, przeciąganie ze zmianą numeracji, × z Cofnij, rozstaw plakietek (także przyklejonych do krawędzi, elementFromPoint środka każdego ×),
// trafienie TP1 (komunikat, szuflada, Journal), „+ TP” po wejściu do 4 poziomów i prawy klik „Dodaj TP tutaj”, preset z drabiną, edytor listy w szufladzie, przeglądanie przeszłości, 375 px.
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
      const S = await H.server({ desktop: 4981, 'desktop-platinum': 4982, 375: 4983, '375-platinum': 4984 }[variant], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const q = `?${narrow ? 'w=375&' : ''}${variant.endsWith('platinum') ? 'theme=platinum' : 'theme=onyx'}`;
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-175.html${q}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 300_000 } : { width: 1920, height: 1080, timeoutMs: 300_000 });
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

  test('backtest-175: bilet: + TP, podział procentów, walidacja kolejności i sumy, podgląd celu i R:R, pamięć panelu, zlecenie z drabiną', () => tagged('bilet', 15));
  test('backtest-175: wykres: plakietki TP1/TP2 z ilością i procentem, edytor procentu, przeciąganie z numeracją, × z Cofnij, chwyt linii, strzałki', () => tagged('wykres', 24));
  test('backtest-175: rozstaw: SL, 4 TP, BE i wejście bez nakładania, także przyklejone do krawędzi; środek każdego × trafia w siebie', () => tagged('rozstaw', 9));
  test('backtest-175: trafienie TP1: linia znika, komunikat aria-live, szuflada i Journal pokazują trafienie, trade z oboma poziomami', () => tagged('trafienie', 11));
  test('backtest-175: + TP po wejściu do 4 poziomów (procenty po równo) i prawy klik „Dodaj TP tutaj” z limitem', () => tagged('dodaj', 13));
  test('backtest-175: preset z drabiną: Kup jednym kliknięciem daje 2 poziomy, opis na chipie, zapis presetu z listy TP', () => tagged('preset', 6));
  test('backtest-175: szuflada: kolumna TP „cena (procent) · cena”, edytor listy (cena, nowy poziom, błąd pod polem, pusta cena usuwa, Esc)', () => tagged('szuflada', 8));
  test('backtest-175: dokładka i ręczne wyjście przeliczają ilości na plakietkach; przeglądanie przeszłości nie rysuje plakietek TP', () => tagged('przeszlosc', 5));
  test('backtest-175: Platinum: bilet, wykres, rozstaw, trafienie, dodawanie, preset, szuflada i przeszłość jak w Onyx', async () => { for (const t of [['bilet', 15], ['wykres', 24], ['rozstaw', 9], ['trafienie', 11], ['dodaj', 13], ['preset', 6], ['szuflada', 8], ['przeszlosc', 5]]) await tagged(t[0], t[1], 'desktop-platinum'); });
  test('backtest-175: 375: krótkie plakietki poziomów rozsunięte, bez poziomego przewijania, × nie przykryte', () => tagged('telefon', 5, '375'));

  // ---- Ustawienia → Backtest → Presety zleceń z listą TP na pełnym dashboardzie (atrapa Notion) ----
  let setRes = null;
  function settingsResult() {
    setRes ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const A = await H.atrapa(4987);
      // atrapa po migracjach do najnowszej, jak w odbiorze e2e
      const dir = H.tmp();
      writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ schemaVersion: 2, lang: 'pl' }));
      const env = { NOTION_TOKEN: 'secret_atrapa', NOTION_VERSION: '2026-03-11', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL, THQ_CONFIG_DIR: dir };
      const mig = await H.run(path.join(ROOT, 'update.mjs'), ['--migrate-only', '--json'], H.cleanEnv({ ...env, NOTION_API_BASE: A.base }));
      assert.equal(mig.code, 0, String(mig.err || mig.out).slice(0, 300));
      const S = await H.server(4988, { ...env, NOTION_API_BASE: A.base });
      try {
        const txt = await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 180_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: readFileSync(path.join(ROOT, 'testy/scen-175.js'), 'utf8') });
        return JSON.parse(txt);
      } finally { S.stop(); A.stop(); }
    })();
    return setRes;
  }
  test('backtest-175: Ustawienia → Presety zleceń: lista TP w edytorze (+ TP po równo, „reszta”, walidacja kolejności i procentów, × oddaje procent, limit 4, zapis i opis)', async () => {
    const res = await settingsResult();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === 'edytor');
    assert.ok(mine.length >= 12, `edytor: strona wykonała sprawdzenia (${mine.length}, minimum 12)`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], 'edytor: nieudane sprawdzenia');
  });
};
