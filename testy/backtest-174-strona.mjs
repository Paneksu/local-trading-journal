// backtest-174 (strona): pakiet 1.7-4 „Prawy klik i nawigacja” w przeglądarce (Chrome/Edge headless, CDP) na serwerze testowym ze świecami syntetycznymi.
// Strona robocza testy/backtest-174.html (1920 i ?w=375, Onyx i Platinum): menu prawego kliku (preset, panel, Dołóż, SL/TP tutaj, „Użyj 1 kontraktu”, klawiatura, Esc, krawędzie),
// brak menu przy narzędziu rysowania, na rysunku, osiach i plakietkach, drugi wykres zleca swój instrument, krok niezależny od interwału, skok do daty (przód, wstecz, przed startem,
// weekend) i do ceny (znaleziono, SL po drodze, nie znaleziono, Szukaj dalej, Anuluj), brak przykrywania (elementFromPoint), przytrzymanie na dotyku przy 375 px.
// Dane: NQ (z 1s w 9:30–11:00) i ES (tylko 1m) z 12 i 13 marca 2024 oraz ES z prawdziwą przerwą weekendową (15–18 marca 2024) zapisany tutaj.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const runs = {};
  // ES z weekendem: piątek 15.03 08:00–17:00 NY, niedziela 17.03 18:00 NY – poniedziałek 18.03 12:00 NY (1 świeca na minutę, ceny losowe z ziarnem)
  async function weekendEs(baseDir) {
    const { writeRange } = await imp('lib/candles-store.mjs');
    const { nyAt } = await imp('public/js/bt-czas.js');
    const mk = (a, b, px0) => {
      const bars = []; let px = px0 * 100;
      for (let t = a; t < b; t += 60) { const o = px; px += (((t / 60) % 7) - 3) * 25; bars.push([t, o, Math.max(o, px) + 25, Math.min(o, px) - 25, px, 10]); }
      return { a, b, bars };
    };
    for (const w of [mk(nyAt('2024-03-15', '08:00'), nyAt('2024-03-15', '17:00'), 5100), mk(nyAt('2024-03-17', '18:00'), nyAt('2024-03-18', '12:00'), 5110)]) writeRange('ES', '1m', w.a, w.b, w.bars, {}, { baseDir });
  }
  function pageResult(variant) {
    runs[variant] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      const cd = path.join(dir, 'chart-data');
      await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(cd, { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      await syntheticDay(cd, { instrument: 'ES', day: '2024-03-12', seed: 5, has1s: false });
      await weekendEs(cd);
      const narrow = variant.startsWith('375');
      const S = await H.server({ desktop: 4956, 'desktop-platinum': 4957, 375: 4958, '375-platinum': 4959 }[variant], { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const q = `?${narrow ? 'w=375&' : ''}${variant.endsWith('platinum') ? 'theme=platinum' : 'theme=onyx'}`;
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-174.html${q}`, narrow ? { width: 375, height: 812, mobile: true, timeoutMs: 300_000 } : { width: 1920, height: 1080, timeoutMs: 300_000 });
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

  test('backtest-174: prawy klik: menu nad i pod rynkiem, opis z presetu i z panelu, klawiatura, Esc, Dołóż, SL i TP tutaj, Użyj 1 kontraktu', () => tagged('menu', 40));
  test('backtest-174: prawy klik przy aktywnym narzędziu rysowania, na rysunku, osiach i plakietce nie otwiera menu', () => tagged('bezmenu', 6));
  test('backtest-174: prawy klik na drugim wykresie zleca jego instrument', () => tagged('drugi', 7));
  test('backtest-174: wybór kroku: Krok 15s na wykresie 5m przesuwa o 15 s, zapis w sesji, własny 7m, sekundy poza oknem 1s', () => tagged('krok', 19));
  test('backtest-174: skok do daty w przód i wstecz (przeglądanie), przed startem, okno z klawiatury i z menu skoków', () => tagged('data', 17));
  test('backtest-174: skok do daty w środku weekendu ląduje na otwarciu niedzieli 18:00 NY', () => tagged('weekend', 1));
  test('backtest-174: skok do ceny: znaleziono, SL po drodze z komunikatem, nie znaleziono z „Szukaj dalej”, Anuluj', () => tagged('cena', 28));
  test('backtest-174: nic nie przykrywa pozycji menu, paska kroku i skoków, okien daty i ceny (elementFromPoint)', () => tagged('warstwy', 11));
  // runda 2 (przeglądy kodu i wyglądu pakietu 1.7-4)
  test('backtest-174: r2: fokus po otwarciu menu, Esc, strzałki i Enter na dokumencie, Spacja i skróty replayu pod otwartym menu nic nie robią', () => tagged('fokus', 11));
  test('backtest-174: r2: menu wstrzymuje odtwarzanie, pozycja nieaktualna po zmianie rynku jest odrzucana z komunikatem i przerysowaniem', () => tagged('zmiana', 15));
  test('backtest-174: r2: wygląd menu (12 px, kolor kierunku), cena menu = cena linii kursora, ilość jak w polu Wielkość (preset w $ i w %), okna skoku nad przyciskiem Skocz', () => tagged('wyglad', 23));
  test('backtest-174: r2: skok wstecz: pozycja, zlecenia i trade z przyszłości nie są rysowane, P&L po ostatniej prawdziwej cenie, handel zablokowany z wyjaśnieniem', () => tagged('wstecz', 20));
  test('backtest-174: Platinum: menu, brak menu, krok, skoki i warstwy jak w Onyx', async () => { for (const t of [['menu', 40], ['bezmenu', 6], ['drugi', 7], ['krok', 19], ['data', 17], ['weekend', 1], ['cena', 28], ['warstwy', 11], ['fokus', 11], ['zmiana', 15], ['wyglad', 23], ['wstecz', 20]]) await tagged(t[0], t[1], 'desktop-platinum'); });
  test('backtest-174: 375: przytrzymanie otwiera arkusz menu, ruch przewija, bez poziomego przewijania, przyciski nie są przykryte', () => tagged('telefon', 10, '375'));
};
