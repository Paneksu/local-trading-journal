// Statystyki backtestu (1.5.0, pakiet G): czyste liczenie, bez DOM. Nagłówek sesji, krzywa kapitału w R, „Gdzie mam przewagę” (rozbicia z progiem MIN_N),
// „Wykonanie” z MAE/MFE i porównanie z Live. Liczy na tych samych regułach co dashboard (outcome/calc z stats.js, margines BE z ustawień).
// English: backtest statistics (pure): header, R equity, edge table with a minimum-sample threshold, execution (MAE/MFE) and backtest vs live comparison.
// [U] 30.10.2026 §13: «statystyki powinny dawać prawdziwą wartość … zrozumiałe i przejrzyste»; każdy wiersz z N < MIN_N jest oznaczony `few` i nie wyciąga się z niego wniosków.
import { calc, outcome, equityPoints, parseBtSession } from './stats.js';

export const MIN_N = 20;
export const NO_SETUP = 'bez setupu';
export const NO_DAYTYPE = 'brak danych o dniu';
export const NO_HOUR = 'brak godziny';
const EPS = 1e-9;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Czas w Nowym Jorku (dzień handlowy i godzina wejścia): Notion trzyma czas lokalny przeglądarki, plik sesji sekundy UTC, więc wszystko sprowadzamy do NY.
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function nyParts(ms) {
  const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

// ---- nagłówek ----
export function summary(trades) {
  const c = calc(trades);
  return {
    n: c.n, wins: c.wins, losses: c.losses, be: c.be,
    wr: c.winRate, avgR: c.avgR, sumR: c.nR ? c.sumR : 0, nR: c.nR,
    few: c.n < MIN_N,
  };
}

// Krzywa kapitału w R: punkt startowy + po jednym punkcie na trade (kolejność: dzień, godzina).
export const equityR = (trades) => equityPoints(trades, 'R');

// ---- rozbicia ----
export const BY = ['setup', 'wd', 'hour', 'dayType', 'dir'];
const minutes = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const HOUR_BEFORE = 'przed 9:30';
export const HOUR_AFTER = 'po 16:00';
export function hourBucket(hm) {
  const m = minutes(hm);
  if (m == null) return NO_HOUR;
  if (m < 570) return HOUR_BEFORE;
  if (m >= 960) return HOUR_AFTER;
  const b = 570 + Math.floor((m - 570) / 15) * 15;
  return `${Math.floor(b / 60)}:${String(b % 60).padStart(2, '0')}`;
}
const HOUR_ORDER = (() => { const o = [HOUR_BEFORE]; for (let m = 570; m < 960; m += 15) o.push(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`); o.push(HOUR_AFTER, NO_HOUR); return o; })();
function weekday(day) { // 1 = poniedziałek … 7 = niedziela
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return d === 0 ? 7 : d;
}
const dayOf = (t) => t.day || t.date || null;

// tagsOf(trade) → tablica etykiet typu dnia (trade liczy się w każdym kubełku, więc suma wierszy może przekroczyć liczbę trade'ów).
export function edgeTable(trades, by, { tagsOf = () => [] } = {}) {
  if (!BY.includes(by)) throw new Error(`Nieznane rozbicie: ${by}`);
  const keysOf = {
    setup: (t) => [t.setup || NO_SETUP],
    wd: (t) => { const w = weekday(dayOf(t)); return w == null ? [] : [w]; },
    hour: (t) => [hourBucket(t.time)],
    dir: (t) => [t.dir || null],
    dayType: (t) => { const g = tagsOf(t) || []; return g.length ? [...new Set(g)] : [NO_DAYTYPE]; },
  }[by];
  const buckets = new Map();
  for (const t of trades) for (const k of keysOf(t)) { if (k == null) continue; (buckets.get(k) || buckets.set(k, []).get(k)).push(t); }
  const rows = [...buckets].map(([key, ts]) => { const s = summary(ts); return { key, n: s.n, wr: s.wr, avgR: s.avgR, sumR: s.sumR, wins: s.wins, losses: s.losses, be: s.be, few: s.few }; });
  if (by === 'wd') rows.sort((a, b) => a.key - b.key);
  else if (by === 'hour') rows.sort((a, b) => HOUR_ORDER.indexOf(a.key) - HOUR_ORDER.indexOf(b.key));
  else if (by === 'dir') rows.sort((a, b) => (a.key === 'Long' ? -1 : b.key === 'Long' ? 1 : 0));
  else rows.sort((a, b) => (a.key === NO_DAYTYPE) - (b.key === NO_DAYTYPE) || (a.key === NO_SETUP) - (b.key === NO_SETUP) || b.n - a.n || String(a.key).localeCompare(String(b.key)));
  return rows;
}

// ---- wykonanie ----
const hasData = (t) => isNum(t.maeR) && isNum(t.mfeR);
export function execution(trades) {
  const ds = trades.filter(hasData);
  const mean = (f) => (ds.length ? ds.reduce((a, t) => a + f(t), 0) / ds.length : null);
  const winners = ds.filter((t) => outcome(t) === 'win');
  const depth = (t) => Math.abs(t.maeR);
  const maeWinners = Array.from({ length: 10 }, (_, i) => ({ bin: i / 10, n: 0 }));
  for (const t of winners) maeWinners[Math.min(9, Math.floor(depth(t) * 10 + EPS))].n++;
  // głębokość MAE (w R, zaokrąglona w górę do 0,1), której nie przekroczyło 80% zwycięzców
  let maeP80 = null;
  if (winners.length) {
    const d = winners.map(depth).sort((a, b) => a - b);
    maeP80 = Math.min(1, Math.ceil(d[Math.ceil(0.8 * d.length) - 1] * 10 - EPS) / 10);
  }
  const left = (t) => Math.max(0, t.mfeR - (t.r ?? 0));
  const be = ds.filter((t) => t.beHit), early = ds.filter((t) => (t.exit === 'manual' || t.exit === 'partial') && (t.r ?? 0) > EPS);
  return {
    withData: ds.length, without: trades.length - ds.length,
    avgMae: mean((t) => t.maeR), avgMfe: mean((t) => t.mfeR),
    maeWinners, nWinners: winners.length, maeP80,
    leftOnTable: { be: be.reduce((a, t) => a + left(t), 0), early: early.reduce((a, t) => a + left(t), 0), nBe: be.length, nEarly: early.length },
    maxLossStreak: calc(trades).maxLossStreak,
  };
}

// ---- backtest kontra Live ----
// Po jednym wierszu na setup obecny w obu zbiorach; Live liczony w R jak w Statystykach (trade'y bez R nie mają jak być porównane).
export function compareLive(bt, live) {
  const named = (ts) => ts.filter((t) => t.setup && t.setup !== NO_SETUP && isNum(t.r));
  const by = (ts) => { const m = new Map(); for (const t of named(ts)) (m.get(t.setup.trim()) || m.set(t.setup.trim(), []).get(t.setup.trim())).push(t); return m; };
  const a = by(bt), b = by(live);
  return [...a.keys()].filter((k) => b.has(k)).map((setup) => ({ setup, bt: summary(a.get(setup)), live: summary(b.get(setup)) }))
    .sort((x, y) => y.bt.n + y.live.n - (x.bt.n + x.live.n) || x.setup.localeCompare(y.setup));
}

// ---- źródło trade'ów ----
// Lokalny trade z pliku sesji → wspólny kształt. Tylko zamknięte (z R).
function fromSession(s, tr) {
  const e = nyParts(tr.entryT * 1000);
  const last = (tr.exits || [])[(tr.exits || []).length - 1];
  const reason = last?.reason || null;
  return {
    id: tr.id, key: `${s.id}/${tr.id}`, src: 'local', session: s.id, sessionName: s.name || s.id,
    day: tr.day || e.day, date: tr.day || e.day, time: e.time, created: '', instrument: tr.instrument || null, dir: tr.dir || null,
    setup: tr.setup ? String(tr.setup).trim() : null, r: tr.r, pnl: isNum(tr.pnl) ? tr.pnl : null,
    maeR: isNum(tr.maeR) ? tr.maeR : null, mfeR: isNum(tr.mfeR) ? tr.mfeR : null,
    exit: reason, beHit: tr.be === true && reason === 'sl' && outcome({ r: tr.r }) === 'be', // „po BE” tak samo jak z Notion: stop na wejściu i wynik w marginesie BE (częściowy zysk to nie „po BE”)
  };
}
// Trade Backtest z Notion (znormalizowany przez normalizeTrades). Powód wyjścia w Notion nie istnieje, więc „po BE” to stop przesunięty na wejście (pole BE)
// i wynik w marginesie BE; „wyjście ręczne” nieznane (exit: null).
function fromNotion(t) {
  const m = parseBtSession(t.btSession);
  const p = isNum(t.at) ? nyParts(t.at) : null;
  const day = p?.day || t.date || null;
  return {
    id: m?.tradeId || t.id || t._id || null, key: m ? `${m.sessionId}/${m.tradeId}` : null, src: 'notion', session: m ? m.sessionId : null, sessionName: m ? m.name : null,
    day, date: day, time: p?.time || null, created: t.created || '', instrument: t.instrument || null, dir: t.dir || null,
    setup: t.setup ? String(t.setup).trim() : null, r: t.r, pnl: isNum(t.pnl) ? t.pnl : null,
    maeR: isNum(t.btMae) ? t.btMae : null, mfeR: isNum(t.btMfe) ? t.btMfe : null,
    manual: t.manual || null, // „Wynik ręcznie” z Notion (outcome liczy go przed R, jak Statystyki dashboardu)
    exit: null, beHit: isNum(t.be) && isNum(t.r) && outcome({ r: t.r }) === 'be',
  };
}
// Trade'y Backtest: z Notion + z lokalnych plików sesji. Duplikat po znaczniku [sesja/trade] → wygrywa lokalny (ma powód wyjścia).
// Review G #3: w sesji z kolejnością losową dzień o statusie innym niż 'done' ma ukrytą datę (bt-replay.js: hidden), więc jego trade'y nie wchodzą do statystyk
// (data widoczna w podpowiedzi krzywej i w rozbiciach). To samo dotyczy kopii takiego trade'a wysłanej do Notion przyciskiem „Zapisz do Notion” (ten sam znacznik).
const isHidden = (s, tr) => s?.def?.order === 'random' && s?.days?.[tr.day || nyParts(tr.entryT * 1000).day]?.status !== 'done';
const closedLocal = (tr) => !!tr && isNum(tr.r) && isNum(tr.entryT);
export const hiddenCount = (sessions) => (sessions || []).reduce((a, s) => a + (s?.trades || []).filter((tr) => closedLocal(tr) && isHidden(s, tr)).length, 0);
export function mergeBacktest(notionTrades, sessions) {
  const out = [];
  const seen = new Set();
  for (const s of sessions || []) for (const tr of s?.trades || []) {
    if (!closedLocal(tr)) continue;
    const x = fromSession(s, tr);
    seen.add(x.key);
    if (!isHidden(s, tr)) out.push(x);
  }
  for (const t of notionTrades || []) {
    // jak dashboard (app.js): tylko typ === 'Backtest' (wpis bez typu nie jest backtestem)
    if (!t || t.typ !== 'Backtest' || t.counted === false || !isNum(t.r)) continue;
    const x = fromNotion(t);
    if (x.key) { if (seen.has(x.key)) continue; seen.add(x.key); } // dwie strony Notion z tym samym znacznikiem liczą się raz
    out.push(x);
  }
  return out;
}

// ids: tablica id sesji (null = „Bez sesji”) albo null = wszystkie.
export const pickSessions = (trades, ids) => (ids == null ? trades : trades.filter((t) => ids.includes(t.session ?? null)));
// Lista sesji występujących w trade'ach (id, nazwa, liczba), najliczniejsze pierwsze; „Bez sesji” (id null) na końcu.
export function sessionsOf(trades) {
  const m = new Map();
  for (const t of trades) { const k = t.session ?? null; const g = m.get(k) || { id: k, name: t.sessionName || null, n: 0 }; g.n++; if (!g.name && t.sessionName) g.name = t.sessionName; m.set(k, g); }
  return [...m.values()].sort((a, b) => (a.id === null) - (b.id === null) || b.n - a.n || String(a.id).localeCompare(String(b.id)));
}
