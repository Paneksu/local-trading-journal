// Wynik po BE: co zrobiłaby cena przy pierwotnych poziomach (SL0 i ostatni TP) po tym, jak trade wybito stopem na BE.
// Czysta logika, bez DOM-u i bez i18n: importuje ją przeglądarka i serwer (endpoint wyniku po BE).
// [U] 04.11.2026 «brakuje takiego czegos, jak rezulat trade po BE, nie wiemy czy nasze BE dziala i nasze trady nie trafiaja SL, bo BE jest nie prawidlowe jesli czesto trafiaja TP»
// [U] 04.11.2026 «W tej świecy tylko SL»: w świecy wyjścia liczy się wyłącznie dotknięcie pierwotnego SL, TP dopiero od następnej świecy.
// [U] 04.11.2026 «jak zapisuje trade i journaluje jeszcze podczas jak nie poznalem przyszlych swiec w backtestingowej sesji to nnie powinny mi sie ujawniac wtedy»:
// funkcja liczy tylko na świecach z t < limit (granica sesji), a status pending jest zawsze identyczny, niezależnie od przyszłości.
// Świeca: [t, o, h, l, c, v], t = początek świecy w sekundach UTC (jak w swiece.js). Dotknięcie bez poślizgu: long TP przy high >= tp, SL przy low <= sl; short odwrotnie.
// English: pure "result after break-even" resolver: first touch of the original SL/TP after the BE exit, future-safe via limit.
import { tradingDayEnd } from './dzien-handlowy.js';

// Wersja algorytmu: wchodzi do klucza pamięci podręcznej wyniku.
// 2 (05.11.2026): koniec ciągłego pokrycia, świece z zapasu innego kontraktu i 1s dla Live zmieniają wynik, a klucz ma instrument i kierunek.
export const AFTER_BE_VERSION = 2;
export { tradingDayEnd };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isLong = (dir) => String(dir).toLowerCase() === 'long';

// Long wymaga sl < entry, short sl > entry. Remis albo zła strona to brak poziomów.
// 04.11.2026 (decyzja sesji głównej): TP po złej stronie wejścia (long z tp <= entry, short z tp >= entry) też to brak poziomów; brak TP (null) jest dozwolony.
export function isAfterBeLevels({ dir, entry, sl, tp } = {}) {
  if (!isNum(entry) || !isNum(sl)) return false;
  if (isNum(tp) && (isLong(dir) ? tp <= entry : tp >= entry)) return false;
  return isLong(dir) ? sl < entry : sl > entry;
}

// R bez BE: tp daje |tp-entry|/|entry-sl|, sl daje -1, reszta (open, mfe, pending, no-data, no-levels, no-session) null.
export function rWithoutBe(result, { entry, sl, tp } = {}) {
  const st = result && result.status;
  if (st === 'sl') return -1;
  if (st !== 'tp' || !isNum(tp) || !isNum(entry) || !isNum(sl)) return null;
  const risk = Math.abs(entry - sl);
  return risk > 0 ? Math.abs(tp - entry) / risk : null;
}

const res = (status, at = null, rIfHeld = null, mfeR = null, hitSl = null) => ({ status, at, rIfHeld, mfeR, hitSl });

// bars: 1m rosnąco, secs: 1s rosnąco albo []. exitPrecise: false (Notion, wyjście co do minuty): cała minuta to świeca wyjścia;
// true i sekundy z tej minuty: świecą wyjścia jest sekunda exitT.
// [U] 04.11.2026 blokada przyszłości: do rozstrzygania wchodzi tylko świeca ZAKOŃCZONA do limitu (minuta: t + 60 <= limit, sekunda: t + 1 <= limit). Świeca zaczęta przed limitem, a trwająca
// po nim, ma high/low z chwil, których sesja jeszcze nie pokazała, więc nie może dać tp ani sl (zostaje pending).
// secsMayCome: dla instrumentu, który ma albo może dostać prawdziwe 1s; tylko wtedy wynik zależny od braku sekund jest oznaczany jako niejednoznaczny (patrz resolveAfterBeDetail).
// coveredTo: koniec ciągłego pokrycia od minuty wyjścia. Świeca za nim nie liczy się: dotknięcie za dziurą nic nie mówi, bo w dziurze mógł paść drugi poziom. Bez coveredTo: covered true to całe okno, covered false to nic.
// secsOf(minuta): leniwy odczyt sekund minuty z oboma poziomami (Live czyta dysk tylko wtedy, gdy trzeba).
// pendingFirst (Live i Paper, decyzja sesji głównej 05.11.2026): przed końcem okna brak świec to pending, a nie no-data. Backtest bez tej flagi: najpierw no-data, potem pending, oba liczone wyłącznie do granicy.
function core({ dir, entry, sl, tp, exitT, exitPrecise = false, end, limit = Infinity, bars = [], secs = [], covered = false, coveredTo = null, secsMayCome = false, secsOf = null, pendingFirst = false } = {}, trace = {}) {
  if (!isAfterBeLevels({ dir, entry, sl, tp })) return res('no-levels');
  if (!isNum(exitT) || !isNum(end)) return res('no-data');
  const long = isLong(dir);
  const risk = Math.abs(entry - sl);
  const hasTp = isNum(tp);
  const slHit = (c) => (long ? c[3] <= sl : c[2] >= sl);
  const tpHit = (c) => hasTp && (long ? c[2] >= tp : c[3] <= tp);
  // postęp zysku w R w świecy (do mfeR)
  const favR = (c) => ((long ? c[2] - entry : entry - c[3]) / risk);
  const stop = Math.min(limit, end);
  const m0 = Math.floor(exitT / 60) * 60;
  const covEnd = isNum(coveredTo) ? coveredTo : covered ? Infinity : -Infinity;
  const sOk = (secs || []).filter((c) => c[0] + 1 <= limit && c[0] + 1 <= covEnd);
  const barsOk = (bars || []).filter((c) => c[0] + 60 <= limit && c[0] + 60 <= covEnd);
  const secsIn = (a, b) => sOk.filter((c) => c[0] >= a && c[0] < b);
  const precise = exitPrecise === true && secsIn(m0, m0 + 60).length > 0;

  const done = (status, at, mfeR = null, hitSl = null) => res(status, at, status === 'mfe' ? null : rWithoutBe({ status }, { entry, sl, tp }), mfeR, hitSl);

  // wynik policzony bez sekund wyjścia (NQ może je dostać później) mógłby się zmienić po ich dojściu
  if (exitPrecise === true && secsMayCome && !precise) trace.amb = true;
  // świeca wyjścia: tylko SL
  if (precise) {
    const x = sOk.find((c) => c[0] === exitT);
    if (x && slHit(x)) return hasTp ? done('sl', x[0]) : done('mfe', x[0], 0, true);
  } else {
    const x = barsOk.find((c) => c[0] === m0);
    if (x && slHit(x)) return hasTp ? done('sl', x[0]) : done('mfe', x[0], 0, true);
  }

  // następne świece: do końca minuty wyjścia sekundy (tylko precyzyjnie), potem minuty
  const next = [];
  if (precise) for (const c of secsIn(exitT + 1, m0 + 60)) next.push({ c, sec: true });
  for (const c of barsOk) if (c[0] >= m0 + 60 && c[0] < stop) next.push({ c, sec: false });
  // sekundy wewnątrz dalszych minut służą tylko do rozstrzygania świecy, w której oba poziomy padły naraz
  let mfe = 0;
  for (const { c, sec } of next) {
    const hs = slHit(c), ht = tpHit(c);
    if (hs && ht) {
      if (!sec) {
        const inside = (secsOf ? secsOf(c[0]).filter((s) => s[0] + 1 <= limit) : secsIn(c[0], c[0] + 60)).filter((s) => s[0] < stop);
        const ts = inside.find(slHit), tt = inside.find(tpHit);
        if (tt && (!ts || tt[0] < ts[0])) return done('tp', c[0]);
        // oba poziomy w jednej minucie bez sekund, które by to rozstrzygnęły: sl z braku danych
        if (!(ts && tt) && secsMayCome) trace.amb = true;
      }
      return done('sl', c[0]);
    }
    if (hs) return hasTp ? done('sl', c[0]) : done('mfe', c[0], mfe, true);
    if (ht) return done('tp', c[0]);
    if (!hasTp) mfe = Math.max(mfe, favR(c));
  }

  if (pendingFirst && limit < end) return res('pending');
  if (!covered) return res('no-data');
  if (limit < end) return res('pending');
  if (!hasTp) return done('mfe', null, mfe, false);
  return done('open', null);
}

export function resolveAfterBe(a) { return core(a, {}); }
// { result, ambiguous }: ambiguous = wynik zależy od braku prawdziwych 1s (rozstrzygnięcie "oba naraz" bez sekund albo wyjście bez sekund przy secsMayCome), więc nie wolno go trwale zapamiętać.
export function resolveAfterBeDetail(a) { const trace = { amb: false }; const result = core(a, trace); return { result, ambiguous: trace.amb }; }

// Statystyki po BE. rows: { setup, r, afterBe }. afterBe to wynik resolveAfterBe albo { status: 'no-session' }; null oznacza trade bez BE (pomijany).
// Mianownik procentów (0 do 100): tp + sl + open. sumIfHeld to suma R bez BE z trade'ów rozstrzygniętych (tp, sl), sumActual to faktyczne R dokładnie tych samych trade'ów.
const emptyStats = () => ({ n: 0, tp: 0, sl: 0, open: 0, mfe: 0, pending: 0, noData: 0, noLevels: 0, noSession: 0 });
const FIELD = { tp: 'tp', sl: 'sl', open: 'open', mfe: 'mfe', pending: 'pending', 'no-data': 'noData', 'no-levels': 'noLevels', 'no-session': 'noSession' };
function statsOf(rows) {
  const s = emptyStats();
  let sumIfHeld = 0, sumActual = 0;
  for (const row of rows) {
    const a = row && row.afterBe;
    if (!a) continue;
    s.n++;
    if (FIELD[a.status]) s[FIELD[a.status]]++;
    // 04.11.2026: wiersz bez liczbowego r nie wchodzi do żadnej z sum R (porównanie dotyczy tych samych trade'ów)
    if (isNum(a.rIfHeld) && isNum(row.r)) { sumIfHeld += a.rIfHeld; sumActual += row.r; }
  }
  const den = s.tp + s.sl + s.open;
  const pct = (k) => (den > 0 ? (k / den) * 100 : null);
  return { ...s, pctTp: pct(s.tp), pctSl: pct(s.sl), pctOpen: pct(s.open), sumIfHeld, sumActual };
}
export function afterBeStats(rows = []) {
  const list = (rows || []).filter((r) => r && r.afterBe);
  const by = new Map();
  for (const r of list) {
    const k = r.setup == null ? '' : String(r.setup);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const bySetup = [...by.entries()].map(([setup, rs]) => ({ setup, ...statsOf(rs) })).sort((a, b) => b.n - a.n || (a.setup < b.setup ? -1 : a.setup > b.setup ? 1 : 0));
  return { ...statsOf(list), bySetup };
}
