// backtest-T (przeglądarka): licznik do zamknięcia świecy na prawej osi ceny, pod etykietą bieżącej ceny (Chrome/Edge headless, CDP), w obu motywach.
// [U] 05.11.2026 «do zamkniecia swiecy mialo byc na tej osi z prawej strony». Strona testy/backtest-T.html, prawdziwy replay na świecach syntetycznych.
// Pozycja licznika jest sprawdzana na pikselach płótna osi (dół etykiety ceny = góra licznika), nie z geometrii DOM. Asercje negatywne mają mutacje (strona dopisuje błąd i sprawdza, że sprawdzenie go łapie).
// Zrzuty 1920×1080 (uruchom z BT_T_ZRZUTY=1): R:/PROJEKTY/trading-hq-wt/backtest-wyniki/licznik-os/<scena>-<motyw>.png.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const SHOTS = 'R:/PROJEKTY/trading-hq-wt/backtest-wyniki/licznik-os';
  const runs = {};
  function pageResult(theme, dpr = 1) {
    const rk = `${theme}|${dpr}`;
    runs[rk] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const store = await imp('lib/candles-store.mjs');
      const dir = H.tmp();
      const base = path.join(dir, 'chart-data');
      await syntheticDay(base, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(base, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      // dziura w danych 1m 12:00–12:20 NY (EDT = UTC-4): pod kursorem sesja, wykres bez świecy → „Brak”
      const h0 = Date.UTC(2024, 2, 12, 16, 0) / 1000;
      store.writeRange('NQ', '1m', h0, h0 + 20 * 60, [], {}, { baseDir: base });
      const S = await H.server({ 'onyx|1': 4930, 'platinum|1': 4931, 'onyx|1.25': 4932, 'onyx|1.5': 4933 }[rk], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const want = process.env.BT_T_ZRZUTY === '1';
        let bridge = null;
        if (want) { try { mkdirSync(SHOTS, { recursive: true }); bridge = { shotDir: SHOTS }; } catch { bridge = null; } }
        return JSON.parse(await P.cdpPage(`${S.base}/__testy/backtest-T.html?theme=${theme}${bridge ? '&shots=1' : ''}`, { width: 1920, height: 1080, timeoutMs: 240_000, dpr: dpr === 1 ? 0 : dpr, ...(bridge ? { bridge } : {}) }));
      } finally { S.stop(); }
    })();
    return runs[rk];
  }
  async function tagged(theme, tag, min, dpr = 1) {
    const res = await pageResult(theme, dpr);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    if (process.env.SHOW_CHECKS) console.log(mine.map((c) => `${c.ok ? 'ok' : 'NOK'} ${c.msg}`).join('\n'));
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }
  // DPR 1 w obu motywach oraz 1,25 i 1,5 (skalowanie Windows 125% i 150%, prawdziwy DPR przeglądarki) w Onyx: wymiary etykiety w pikselach urządzenia zmierzone z płótna osi
  for (const [theme, dpr] of [['onyx', 1], ['platinum', 1], ['onyx', 1.25], ['onyx', 1.5]]) {
    test(`backtest-T: licznika nie ma w nagłówku wykresu, jest jeden i w wykresie, mutacja wykrywana (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'nagłówek', 5, dpr));
    test(`backtest-T: licznik tuż pod etykietą ceny co do piksela: krok, interwał, skala ręczna, auto-skala, rozmiar (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'pozycja', 14, dpr));
    test(`backtest-T: kolor licznika zmienia się z etykietą, kontrast tekstu min. 4,5:1 (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'kolor', 4, dpr));
    test(`backtest-T: cena przy krawędzi i poza widokiem: licznik nie wchodzi na oś czasu ani na etykietę (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'krawędź', 10, dpr));
    test(`backtest-T: przerwa i brak notowań: krótki tekst w szerokości osi, pełne znaczenie w aria-label; długie czasy 4h i 1D (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'przerwa', 12, dpr));
    test(`backtest-T: układy 2h, 2v i 4 wykresów: własny licznik według własnego interwału, pod własną etykietą (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'układ', 30, dpr));
    test(`backtest-T: pozycja z SL i TP tuż przy cenie: licznik zawsze pod etykietą ceny, przepuszcza zdarzenia, plakietki do chwytania (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'warstwy', 10, dpr));
    test(`backtest-T: bez pojemnika płótna osi licznik się chowa i loguje ostrzeżenie (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'kontener', 4, dpr));
    test(`backtest-T: licznik znika, gdy krzyż celownika stoi w jego paśmie osi, i wraca (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'krzyż', 5, dpr));
    test(`backtest-T: dostępność (role timer, brak aria-live) i zero zbędnych mutacji DOM (${theme}${dpr === 1 ? '' : ` DPR ${dpr}`})`, () => tagged(theme, 'a11y', 7, dpr));
  }
};
