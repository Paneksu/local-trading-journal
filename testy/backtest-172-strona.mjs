// backtest-172 (strona): pakiet 1.7-2 „Dokładanie i odwracanie” w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-172.html (1920 i ?w=375, Onyx i Platinum): podpis trybu na Kup/Sprzedaj (Dołóż, Zmniejsz, Zamknij, Odwróć), podgląd ryzyka dokładki, netting,
// „Odwróć” z okna ×, szuflady i skrótu R, oczekująca dokładka, szuflada z porcjami, Journal z tabelą wejść i wyjść, markery porcji, brak przykrywania przycisków, układ 375 px.
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
      const S = await H.server({ desktop: 4906, 'desktop-platinum': 4907, 375: 4908, '375-platinum': 4909 }[variant], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const q = `?${narrow ? 'w=375&' : ''}${variant.endsWith('platinum') ? 'theme=platinum' : 'theme=onyx'}`;
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-172.html${q}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 240_000 } : { width: 1920, height: 1080, timeoutMs: 240_000 });
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

  test('backtest-172: Kup przy Longu: podpis „Dołóż 2”, podgląd ryzyka teraz, po kliknięciu LONG 5 ze średnią; ilość z ryzyka do SL pozycji', () => tagged('dokladka', 17));
  test('backtest-172: Sprzedaj większe od pozycji: podpis „Odwróć: zamknie 5, Short 2”, dwa wyniki, komunikat, odnośnik w Historii', () => tagged('netting', 9));
  test('backtest-172: Odwróć z okna ×, z szuflady i skrótem R (przytrzymanie nie mnoży); bez pamięci panelu pozycja bez SL i TP', () => tagged('odwroc', 11));
  test('backtest-172: P1 przycisk przeciwny liczy ilość od SL panelu, nie od SL pozycji (Long 3 tuż nad SL: Zmniejsz 2 z 3, nie Short 97); zmniejszanie bez ręcznej ilości', () => tagged('wielkosc', 7));
  test('backtest-172: oczekująca dokładka anulowana (SL ponad nią, zamknięcie pozycji) daje komunikat aria-live i toast', () => tagged('anulowanie', 6));
  test('backtest-172: oczekująca dokładka: plakietka „Dołóż limit”, przeciągnięcie, odrzucenie za SL, wypełnienie zmienia średnią', () => tagged('oczekujaca', 11));
  test('backtest-172: szuflada: 5/7 i średnia (3), rozwinięcie porcji; markery porcji na świecach; Journal z tabelą wejść i wyjść', async () => { await tagged('szuflada', 8); await tagged('markery', 3); await tagged('journal', 5); });
  test('backtest-172: nic nie przykrywa przycisków okna części, panelu zleceń, szuflady i szybkiego journala (elementFromPoint)', () => tagged('warstwy', 6));
  test('backtest-172: Platinum: dokładka, odwrócenie, szuflada i warstwy jak w Onyx', async () => { for (const t of [['dokladka', 17], ['netting', 9], ['odwroc', 11], ['szuflada', 8], ['warstwy', 6]]) await tagged(t[0], t[1], 'desktop-platinum'); });
  test('backtest-172: 375: podpisy trybu mieszczą się w przyciskach, przyciski nie są przykryte, bez poziomego przewijania', () => tagged('telefon', 8, '375'));
  test('backtest-172: 375 Platinum: układ jak w Onyx', () => tagged('telefon', 8, '375-platinum'));
};
