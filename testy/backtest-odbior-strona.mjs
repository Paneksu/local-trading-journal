// backtest-odbior (strona): odbiór 1.7.0, poprawki z przeglądu wyglądu (Onyx 7,5, Platinum 7,5, cel ≥ 8,5) w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-odbior-poprawki.html (1920 i ?w=375, Onyx i Platinum): P1-1 zlecenia oczekujące (dokładki) w rozsuwaniu plakietek z pozycją, drabiną i progiem BE, środki wszystkich × klikalne
// (elementFromPoint), własne znaczniki osi także dla zleceń oczekujących; P1-2 notka przeglądania przed komunikatem, komunikat gaśnie; P2-1/P2-2 ręczna część i odwrócenie jako toast w jednym formacie
// „nazwa godzina strefa · szczegóły”; P2-4 poziomy drabiny bez ilości nie są rysowane; P2-5 kwoty w pełnych dolarach; P2-6 podpis BE w Journalu w marginesie; P3-1/P3-8; cena z separatorem tysięcy (R2-P3-1).
// [U] 3.11.2026 «Wszędzie, z opisem „NY” (Recommended)»; [U] 2.11.2026 «nie musisz tyle pracowac nad telefonem…»: przy 375 tylko minimum.
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
      const S = await H.server({ desktop: 5321, 'desktop-platinum': 5322, 375: 5323, '375-platinum': 5324 }[variant], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const q = `?${narrow ? 'w=375&' : ''}${variant.endsWith('platinum') ? 'theme=platinum' : 'theme=onyx'}`;
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-odbior-poprawki.html${q}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 300_000 } : { width: 1920, height: 1080, timeoutMs: 300_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return runs[variant];
  }
  async function tagged(tag, min, variant = 'desktop') {
    const res = await pageResult(variant);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    if (res.fatal && /Failed to fetch dynamically imported module/.test(res.fatal)) delete runs[variant];
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length}, minimum ${min})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
  }

  test('backtest-odbior: zlecenia oczekujące (dokładki) w rozsuwaniu: bez nakładania z pozycją, drabiną i progiem BE, środki × trafiają w siebie, znaczniki osi rozsunięte', () => tagged('kolizja', 5));
  test('backtest-odbior: notka „Przeglądasz wstecz” przed komunikatem, zwykły komunikat gaśnie, odwrócenie nie zostaje w bilecie', () => tagged('notka', 8));
  test('backtest-odbior: komunikaty zdarzeń: ręczna część, TP, auto BE, zamknięcie i odwrócenie w formacie „nazwa godzina NY · szczegóły” (toast i aria-live)', () => tagged('komunikaty', 5));
  test('backtest-odbior: poziomy drabiny bez ilości nie są rysowane, kwoty na plakietkach w pełnych dolarach', () => tagged('ilosci', 6));
  test('backtest-odbior: znaczniki osi poziomów zlecenia oczekującego (bez pozycji) są własne i rozsunięte (R2-P3-2)', () => tagged('osie', 2));
  test('backtest-odbior: SL na BE stoi po stronie straty (Long pod wejściem, Short nad nim), bez „+BE” przy SL na BE', () => tagged('drobne', 4));
  test('backtest-odbior: r2: kierunek w szufladzie po dwóch „Odwróć”, kwoty w pełnych dolarach wszędzie, cena progu na tickach, bilet i menu bez poziomów 0, komunikat odwrócenia po części', () => tagged('r2', 7));
  test('backtest-odbior: cena z separatorem tysięcy w bilecie i w szufladzie (R2-P3-1)', () => tagged('cena', 2));
  test('backtest-odbior: Journal: podpis BE w prawym marginesie z ceną, nie na świecy; godziny z podpisem strefy', () => tagged('journal', 4));
  test('backtest-odbior: Platinum: kolizja, notka, komunikaty, ilości, drobne i Journal jak w Onyx', async () => { for (const t of [['kolizja', 5], ['osie', 2], ['notka', 8], ['komunikaty', 5], ['ilosci', 6], ['drobne', 4], ['r2', 7], ['cena', 2], ['journal', 4]]) await tagged(t[0], t[1], 'desktop-platinum'); });
  test('backtest-odbior: 375 (minimum): bez poziomego przewijania, plakietki zleceń oczekujących nie nachodzą, środki × nie są przykryte', async () => { await tagged('telefon', 3, '375'); await tagged('telefon', 3, '375-platinum'); });
};
