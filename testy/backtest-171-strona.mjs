// backtest-171 (strona): pakiet 1.7-1 „Pozycja na wykresie” w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-171.html (1920 i ?w=375, Onyx i Platinum): plakietki po prawej przy osi, przeciąganie SL/TP z odczytem, +SL/+TP, usuwanie z „Cofnij”, BE,
// zamknięcie części z podglądem, edycja SL/TP w szufladzie, rysunek pozycji jako tło, dwa wykresy jednego instrumentu, sesja 1.6 z otwartą pozycją, układ 375 px.
import path from 'node:path';
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
      const S = await H.server({ desktop: 4896, 'desktop-platinum': 4897, 375: 4898, '375-platinum': 4899 }[variant], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const q = `?${narrow ? 'w=375&' : ''}${variant.endsWith('platinum') ? 'theme=platinum' : 'theme=onyx'}`;
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-171.html${q}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 240_000 } : { width: 1920, height: 1080, timeoutMs: 240_000 });
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
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }

  test('backtest-171: plakietki po prawej przy osi i za ostatnią świecą (wejście, SL, TP; zoom ×0,5 i ×3)', async () => { await tagged('plakietki', 16); await tagged('margines', 3); });
  test('backtest-171: przeciąganie SL: odczyt pkt/$/R na żywo, zapis po puszczeniu, Esc anuluje, odrzucenie wraca z komunikatem', () => tagged('przeciaganie', 10));
  test('backtest-171: +SL i +TP tylko przy braku poziomu; klik stawia linię w ręku; Enter z klawiatury', () => tagged('plusy', 8));
  test('backtest-171: × na SL i TP usuwa; Cofnij przywraca; +SL wraca', () => tagged('usun', 7));
  test('backtest-171: BE nieaktywne po stronie straty z podpowiedzią; klawisz E daje komunikat; po stronie zysku ustawia SL', () => tagged('be', 8));
  test('backtest-171: × wejścia: od pozostałej/pierwotnej, „zamknie 4 z 6”, kwota, pole ilości, 1 kontrakt', () => tagged('czesc', 16));
  test('backtest-171: szuflada: edycja SL/TP z klawiatury, pusta wartość usuwa, błąd pod polem, Część…', () => tagged('szuflada', 12));
  test('backtest-171: rysunek pozycji zablokowany, strefy idą za liniami', () => tagged('rysunek', 2));
  test('backtest-171: pozycja zamknięta w trakcie przeciągania kończy przeciąganie z komunikatem', () => tagged('zamkniecie', 3));
  test('backtest-171: „Cofnij” po usunięciu SL nie zmienia innej pozycji', () => tagged('cofnij', 4));
  test('backtest-171: kolizja poziomów: kreska łącząca plakietkę z linią, cele ≥ 24 px', () => tagged('lacznik', 4));
  test('backtest-171: 375: każdy przycisk kolumny wejścia trafia sam w siebie i mieści się w wykresie (SL blisko, dolna i górna krawędź); odczyt przeciągania w dwóch wierszach w marginesie', () => tagged('kolumna', 12, '375'));
  test('backtest-171: odrzucenie zapisu legacy-copy pokazuje powód, nie ogólny komunikat o dashboardzie', () => tagged('zapis', 2));
  test('backtest-171: szybki panel journala po trade\'u: 1920 w pełnej postaci, 375 pasek jednowierszowy rozwijany stuknięciem', async () => { await tagged('journal', 1); await tagged('journal', 5, '375'); });
  test('backtest-171: dwa wykresy jednego instrumentu widzą tę samą zmianę', () => tagged('dwa', 3));
  test('backtest-171: sesja 1.6 otwiera się z liniami i R', () => tagged('stara', 5));
  test('backtest-171: Platinum: plakietki, przeciąganie i szuflada jak w Onyx', async () => { for (const t of [['plakietki', 12], ['przeciaganie', 10], ['szuflada', 12]]) await tagged(t[0], t[1], 'desktop-platinum'); });
  test('backtest-171: 375: krótkie plakietki, stuknięcie pokazuje przyciski ≥ 44 px, chwyt linii palcem, bez poziomego przewijania', () => tagged('telefon', 10, '375'));
  test('backtest-171: 375 Platinum: układ jak w Onyx', () => tagged('telefon', 10, '375-platinum'));
};
