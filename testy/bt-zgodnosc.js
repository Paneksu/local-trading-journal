// Pomocnik stron testowych backtestu (K, 31.10.2026): dzień w kształcie dawnego ReplayDay z 1.5.0 (GET /api/backtest/day usunięte) zbudowany z API zakresu.
// Strony testowe porównują świece wykresu ze wzorcem candlesAt(mergeBase(m1, s1, real1s)) dnia; okno bazowe replayu zaczyna się w tym samym miejscu (2 sesje przed sesją kursora),
// więc wzorzec dnia = świece okna do kursora (chart.liveBars()). To NIE jest test (pętla ładuje tylko backtest-*.mjs). Podawany przez /__testy/ (THQ_TEST_PAGES=1).
// English: test-page helper: old ReplayDay shape built from the range API.
import { nyAt } from '/js/bt-czas.js';
import { sessionOpenAt, prevOpen } from '/js/bt-dane.js';

export async function replayDay(day, instruments = ['NQ']) {
  const open = nyAt(day, '09:30'), w1sEnd = nyAt(day, '11:00'), end = nyAt(day, '16:00');
  let ctxFrom = sessionOpenAt(open);
  for (let i = 0; i < 2; i++) ctxFrom = prevOpen(ctxFrom);
  const r = await (await fetch(`/api/backtest/range?instruments=${instruments.join(',')}&from=${ctxFrom}&to=${end}&tf=base`, { cache: 'no-store' })).json();
  const inst = {};
  for (const i of instruments) { const q = r.inst[i]; inst[i] = { ...q, has1s: (q.real1s || []).some(([a, b]) => a <= open && b >= w1sEnd), contract: null, rolls: [] }; }
  return { day, tz: 'America/New_York', times: { ctxFrom, open, w1sEnd, end }, inst, news: r.news || [], earnings: r.earnings || [] };
}
