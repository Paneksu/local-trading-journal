// Zakres replayu modułu Backtest (pakiet K, 31.10.2026): ciągła oś czasu jak w FX Replay zamiast „dnia replayu” (lib/backtest-day.mjs z 1.5.0).
// [U] 31.10.2026 «powinines miec pelna przeszlosc tak daleko jak siega historia w danym momencie oraz nie powinno byc takiego czegos jak koniec dnia».
// Dwa rodzaje odczytu (tylko lokalne świece, readRaw bez świec syntetycznych, nic z Databento, nic płatnego):
//  - tf=base: strumień bazowy do kursora (NQ/MNQ: prawdziwe 1s tam, gdzie są, plus 1m; ES/MES: tylko 1m, [U] 30.10.2026 «Nie potrzebuje narazie tego jednak»),
//    zakres najwyżej BASE_MAX_DAYS dni; przeglądarka składa go przez mergeBase (bt-swieca.js) i sama pilnuje „brak przyszłości”;
//  - tf poprawny wg isReplayTf (także własne, np. 7m): historia wykresu (świece tego interwału, zagregowane tak samo jak w przeglądarce, TF < 1 min z mergeBase: poza 1s świece minutowe)
//    plus świece 1D do PDH/PDL; zakres najwyżej HIST_MAX_DAYS dni, odpowiedź najwyżej RANGE_MAX_BARS świec (422 too-many).
// bounds: pierwsza i ostatnia świeca danych i pokrycie prawdziwego 1s, żeby kursor wiedział, gdzie kończą się dane («Do końca danych»).
// 1.7-4 (prawy klik i nawigacja): findPrice = skok do ceny. Pierwsza świeca bazowa instrumentu (1s tam, gdzie jest prawdziwe, inaczej 1m) zaczynająca się po kursorze, której high (w górę)
// albo low (w dół) dotyka ceny; luka przez cenę też się liczy (high/low świecy po luce ją obejmują), świeca w budowie (zaczęta przed kursorem) nie jest jeszcze faktem. Wyszukiwanie idzie oknami
// po 24 h od kursora, limit w dniach handlowych (okna ze świecami, 1–20), z budżetem czasu i liczby świec, z przerwaniem (AbortSignal) i z oddawaniem pętli zdarzeń między oknami.
// Trasa GET ma parametry liczbowe, więc wszystko przechodzi przez parseFindQuery/checkFind: typy, zakresy i długości.
// English: replay range API: base stream chunks, pre-aggregated chart history (lazy, to the start of data), data bounds and the go-to-price search; local candles only.
import { DatabentoError } from './databento.mjs';
import { readCoverage, mergeRanges, continuousEnd } from './candles-store.mjs';
import { aggregate, parseTf } from '../public/js/swiece.js';
import { mergeBase, isReplayTf } from '../public/js/bt-swieca.js';
import { FAMILY } from '../public/js/kontrakty.js';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const MAX_INSTRUMENTS = 4;
export const BASE_MAX_DAYS = 8;
export const HIST_MAX_DAYS = 400;
export const SEC_HIST_MAX_DAYS = 8;
export const RANGE_MAX_BARS = 60_000;
// 1.7-4: skok do ceny. Limit dni handlowych (okien 24 h ze świecami), domyślnie 5; budżet czasu i liczby świec jednego wyszukiwania; najwyżej tyle wyszukiwań naraz
export const FIND_MAX_DAYS = 20;
export const FIND_DEFAULT_DAYS = 5;
export const FIND_MAX_MS = 8000;
export const FIND_MAX_BARS = 2_000_000;
export const FIND_MAX_INFLIGHT = 3;
// cena w punktach: do 6 cyfr całkowitych i 4 miejsc po przecinku (ES i NQ to ułamki ćwierć punktu)
export const FIND_PRICE_MAX = 1_000_000;
const MIN_FROM = Date.UTC(2010, 0, 1) / 1000, MAX_TO = Date.UTC(2100, 0, 1) / 1000;
// odczyt 1s dobami (limit 50 000 świec na odczyt readRaw)
const S1_CHUNK = 86400;
// brzegi danych: okno odczytu wokół pierwszego i ostatniego pliku dnia
const EDGE = 4 * 86400;
// ile okien w głąb danych, zanim uznamy, że świec nie ma (pliki dni bez świec, np. święta)
const EDGE_TRIES = 15;
const tt = (t, s, v) => (t ? t(s, v) : v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s);
const bad = (t, key, vars, status = 400, code = 'bad-request') => new DatabentoError(tt(t, key, vars), status, code);
const layerUnion = (cov, layer) => mergeRanges(Object.keys(cov).filter((k) => k === layer || k.startsWith(layer + '-')).flatMap((k) => cov[k] || []));
const clip = (ranges, a, b) => ranges.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x);

// Walidator zapytania GET /api/backtest/find-price: napisy z adresu → liczby albo błąd 400. Powtórzony parametr, wykładnik, liczby szesnastkowe, zbyt długie liczby i wartości poza zakresem są odrzucane.
export function parseFindQuery(sp, t) {
  const one = (k) => { const all = sp.getAll(k); if (all.length > 1) throw bad(t, 'Powtórzony parametr: {name}.', { name: k }); return all.length ? all[0] : null; };
  const inst = String(one('instrument') ?? '').toUpperCase();
  const from = one('from'), price = one('price'), dir = one('dir'), days = one('days');
  if (!/^\d{1,11}$/.test(from ?? '')) throw bad(t, 'Nieprawidłowy czas startu: {from}.', { from: String(from ?? '').slice(0, 14) });
  if (!/^\d{1,6}(\.\d{1,4})?$/.test(price ?? '')) throw bad(t, 'Nieprawidłowa cena: {price}.', { price: String(price ?? '').slice(0, 14) });
  if (days !== null && !/^\d{1,2}$/.test(days)) throw bad(t, 'Nieprawidłowy limit dni: {days}.', { days: String(days).slice(0, 14) });
  return checkFind({ instrument: inst, from: Number(from), price: Number(price), dir, days: days === null ? FIND_DEFAULT_DAYS : Number(days) }, t);
}
// Sprawdzenie typów i zakresów argumentów wyszukiwania (wspólne dla trasy i wywołań z kodu). Zwraca czysty obiekt { instrument, from, price, dir, days }.
export function checkFind(o, t) {
  const x = o && typeof o === 'object' ? o : {};
  if (typeof x.instrument !== 'string' || !Object.hasOwn(FAMILY, x.instrument)) throw bad(t, 'Nieprawidłowy instrument (ES, NQ, MES albo MNQ).');
  if (!Number.isInteger(x.from) || x.from < MIN_FROM || x.from > MAX_TO) throw bad(t, 'Nieprawidłowy czas startu: {from}.', { from: String(x.from).slice(0, 14) });
  if (typeof x.price !== 'number' || !Number.isFinite(x.price) || !(x.price > 0) || x.price > FIND_PRICE_MAX) throw bad(t, 'Nieprawidłowa cena: {price}.', { price: String(x.price).slice(0, 14) });
  if (x.dir !== 'up' && x.dir !== 'down') throw bad(t, 'Kierunek wyszukiwania to up albo down.');
  if (!Number.isInteger(x.days) || x.days < 1 || x.days > FIND_MAX_DAYS) throw bad(t, 'Limit dni to liczba całkowita od 1 do {max}.', { max: FIND_MAX_DAYS });
  return { instrument: x.instrument, from: x.from, price: x.price, dir: x.dir, days: x.days };
}

export function createReplayRange({ candles, news, earnings, baseDir, t, findLimits = null } = {}) {
  const instList = (instruments) => {
    const list = [...new Set((instruments || []).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
    if (!list.length || list.length > MAX_INSTRUMENTS || list.some((i) => !Object.hasOwn(FAMILY, i))) throw bad(t, 'Nieprawidłowe instrumenty (od 1 do {max}: ES, NQ, MES, MNQ).', { max: MAX_INSTRUMENTS });
    return list;
  };
  // dni (YYYY-MM-DD) z plikami świec 1m na dysku, ze wszystkich warstw 1m rodziny (1m i 1m-<kontrakt>), rosnąco
  function layerDays(fam) {
    const dir = path.join(baseDir || '.', 'candles', fam);
    if (!existsSync(dir)) return [];
    const set = new Set();
    for (const l of readdirSync(dir)) {
      if (!(l === '1m' || l.startsWith('1m-'))) continue;
      const ld = path.join(dir, l);
      try { if (!statSync(ld).isDirectory()) continue; } catch { continue; }
      for (const f of readdirSync(ld)) { const m = /^(\d{4}-\d{2}-\d{2})\.bin$/.exec(f); if (m) set.add(m[1]); }
    }
    return [...set].sort();
  }
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,11}$/.test(v) ? Number(v) : NaN);

  function readM1(inst, from, to, tf = '1m') {
    const r = candles.readRaw({ instrument: inst, from: String(from), to: String(to), tf });
    if (r.noSource) throw bad(t, 'Brak źródła danych dla tego instrumentu');
    return r.bars.filter((b) => b[0] >= from && b[0] < to);
  }
  // prawdziwe 1s (tylko NQ): świece i pokrycie, dobami
  function read1s(inst, from, to) {
    const s1 = [], cov = [];
    for (let a = from; a < to; a += S1_CHUNK) {
      const b = Math.min(to, a + S1_CHUNK);
      const r = candles.readRaw({ instrument: inst, from: String(a), to: String(b), tf: '1s' }, { noSynth: true });
      if (r.noSource) break;
      for (const x of r.bars) if (x.length === 6 && x[0] >= a && x[0] < b) s1.push(x);
      cov.push(...clip(r.covered || [], a, b));
    }
    return { s1, real1s: mergeRanges(cov) };
  }

  function bounds({ instruments } = {}) {
    const list = instList(instruments);
    const inst = {}, byFam = new Map();
    for (const i of list) {
      const fam = FAMILY[i];
      if (!byFam.has(fam)) {
        const cov = readCoverage(fam, { baseDir });
        // Pokrycie bywa szersze niż świece (zakres pokrycia całych lat, kopia danych od wybranego dnia, święto na brzegu), więc brzegi danych liczone są z plików dni
        // warstw 1m (także warstw kontraktów) i potwierdzane odczytem: pierwsza i ostatnia prawdziwa świeca.
        const days = layerDays(fam);
        let first = null, last = null;
        if (days.length) {
          const d0 = Date.parse(days[0] + 'T00:00:00Z') / 1000, d1 = Date.parse(days[days.length - 1] + 'T00:00:00Z') / 1000 + 86400;
          for (let k = 0; k < EDGE_TRIES && first == null; k++) { const a = d0 - 86400 + k * EDGE; const xs = readM1(i, a, a + EDGE); if (xs.length) first = xs[0][0]; }
          for (let k = 0; k < EDGE_TRIES && last == null; k++) { const b = d1 + 86400 - k * EDGE; const xs = readM1(i, b - EDGE, b); if (xs.length) last = xs[xs.length - 1][0] + 60; }
        }
        byFam.set(fam, { data: fam, first, last, real1s: fam === 'NQ' ? layerUnion(cov, '1s') : [] });
      }
      inst[i] = byFam.get(fam);
    }
    const firsts = Object.values(inst).map((x) => x.first).filter(Number.isFinite), lasts = Object.values(inst).map((x) => x.last).filter(Number.isFinite);
    return { first: firsts.length ? Math.min(...firsts) : null, last: lasts.length ? Math.max(...lasts) : null, inst };
  }

  function read({ instruments, from, to, tf = 'base' } = {}) {
    const list = instList(instruments);
    const a = num(from), b = num(to);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < MIN_FROM || b > MAX_TO || b <= a) throw bad(t, 'Nieprawidłowy zakres czasu: od {from}, do {to} (sekundy epoki, "do" musi być po "od").', { from: String(from).slice(0, 14), to: String(to).slice(0, 14) });
    const base = tf === 'base';
    if (!base && !isReplayTf(tf)) throw bad(t, 'Nieprawidłowy interwał: {tf}.', { tf: String(tf).slice(0, 10) });
    const p = base ? null : parseTf(tf);
    const maxDays = base ? BASE_MAX_DAYS : p.sec < 60 ? SEC_HIST_MAX_DAYS : HIST_MAX_DAYS;
    if (b - a > maxDays * 86400) throw bad(t, 'Zakres jest za długi (najwyżej {days} dni).', { days: maxDays }, 422, 'too-long');
    const out = {}, byFam = new Map();
    let total = 0;
    for (const i of list) {
      const fam = FAMILY[i];
      if (!byFam.has(fam)) {
        let v;
        if (base) {
          const m1 = readM1(i, a, b);
          const x = fam === 'NQ' ? read1s(i, a, b) : { s1: [], real1s: [] };
          v = { data: fam, m1, s1: x.s1, real1s: x.real1s };
          total += m1.length + x.s1.length;
        } else {
          let bars;
          if (p.sec < 60) {
            const x = fam === 'NQ' ? read1s(i, a, b) : { s1: [], real1s: [] };
            bars = aggregate(mergeBase(readM1(i, a, b), x.s1, x.real1s).bars, p) || [];
          } else bars = readM1(i, a, b, tf);
          // PDH/PDL: świece 1D od 10 dni przed zakresem (pierwsza widoczna sesja potrzebuje poprzedniej)
          const daily = readM1(i, a - 10 * 86400, b, '1D');
          v = { data: fam, bars, daily };
          total += bars.length;
        }
        if (total > RANGE_MAX_BARS) throw bad(t, 'Wybierz większy interwał albo krótszy zakres', null, 422, 'too-many');
        byFam.set(fam, v);
      }
      out[i] = byFam.get(fam);
    }
    return {
      from: a, to: b, tf: base ? 'base' : tf, inst: out,
      news: news ? news.range(a, b).events : [],
      earnings: earnings ? earnings.range(a, b).events : [],
    };
  }
  // po-be-02 (04.11.2026): odczyt dla wyniku po BE, bez limitu widoku i bez limitu dni trasy read: świece 1m i prawdziwe 1s [from, to) tych samych warstw co read/base (readRaw, bez świec syntetycznych).
  // covered to prawda tylko wtedy, gdy pokrycie 1m obejmuje [from, to) do końca ostatniej PEŁNEJ minuty (minuta trwająca w chwili `to` nie jest jeszcze faktem, więc jej brak nie może zmienić statusu): wołający podaje to = min(granica sesji, koniec okna), więc brak danych za granicą nie zmienia wyniku.
  // coveredTo to koniec ciągłego pokrycia od `from` (także minuty złożone z 1s, pole derived): świec za nim wynik nie liczy, bo za dziurą nie wiadomo, co było wcześniej.
  // Nic z Databento ani płatnego. Zakres pusty (to <= from) nic nie czyta i jest pokryty. Wywołanie tylko z serwera (lib/po-be.mjs), nigdy z parametrów żądania.
  function readAfterBe(instrument, from, to) {
    const [inst] = instList([instrument]);
    if (!Number.isInteger(from) || !Number.isInteger(to)) throw bad(t, 'Nieprawidłowy zakres czasu: od {from}, do {to} (sekundy epoki, "do" musi być po "od").', { from: String(from).slice(0, 14), to: String(to).slice(0, 14) });
    if (to <= from) return { m1: [], s1: [], real1s: [], covered: true, coveredTo: from };
    const r = candles.readRaw({ instrument: inst, from: String(from), to: String(to), tf: '1m' });
    if (r.noSource) throw bad(t, 'Brak źródła danych dla tego instrumentu');
    const m1 = r.bars.filter((b) => b[0] >= from && b[0] < to);
    const x = FAMILY[inst] === 'NQ' ? read1s(inst, from, to) : { s1: [], real1s: [] };
    const coveredTo = continuousEnd([...(r.covered || []), ...(r.derived || [])], from, to), c = Math.floor(to / 60) * 60;
    return { m1, s1: x.s1, real1s: x.real1s, covered: c <= from || coveredTo >= c, coveredTo };
  }
  // ---- 1.7-4: skok do ceny ----
  let findInflight = 0;
  const lim = { maxMs: FIND_MAX_MS, maxBars: FIND_MAX_BARS, ...(findLimits || {}) };
  // findPrice({ instrument, from, price, dir, days, signal? }) → { t, end } (świeca dotknięcia: początek i koniec) | { none: true, until, why: 'limit'|'data-end'|'budget' }; przerwanie → błąd z kodem 'aborted'
  async function findPrice(args) {
    const { instrument, from, price, dir, days } = checkFind(args, t);
    const signal = args.signal;
    if (findInflight >= FIND_MAX_INFLIGHT) throw bad(t, 'Za dużo wyszukiwań naraz. Poczekaj chwilę.', null, 429, 'busy');
    findInflight++;
    // runda 2 (przegląd bezpieczeństwa P3-1): miejsce w limicie zwalnia się raz, przy pierwszym z dwóch zdarzeń: przerwaniu żądania albo końcu wyszukiwania (pętla zauważa przerwanie dopiero przy następnym oknie)
    let held = true;
    const release = () => { if (held) { held = false; findInflight--; } };
    signal?.addEventListener('abort', release, { once: true });
    try {
      const fam = FAMILY[instrument];
      const last = bounds({ instruments: [instrument] }).last;
      if (!Number.isFinite(last)) throw bad(t, 'Brak źródła danych dla tego instrumentu');
      const t0 = performance.now();
      let a = from, seen = 0, nBars = 0;
      const maxChunks = days * 3 + 7;
      for (let k = 0; ; k++) {
        if (signal?.aborted) throw bad(t, 'Wyszukiwanie przerwane.', null, 499, 'aborted');
        if (a >= last) return { none: true, until: last, why: 'data-end' };
        if (seen >= days || k >= maxChunks) return { none: true, until: a, why: 'limit' };
        if (nBars >= lim.maxBars || performance.now() - t0 >= lim.maxMs) return { none: true, until: a, why: 'budget' };
        const b = a + 86400;
        const m1 = readM1(instrument, a, b);
        const x = fam === 'NQ' ? read1s(instrument, a, b) : { s1: [], real1s: [] };
        const st = mergeBase(m1, x.s1, x.real1s);
        if (st.bars.length) seen++;
        nBars += st.bars.length;
        for (let i = 0; i < st.bars.length; i++) {
          const bar = st.bars[i];
          if (dir === 'up' ? bar[2] >= price : bar[3] <= price) return { t: bar[0], end: bar[0] + st.len[i] };
        }
        a = b;
        // oddanie pętli zdarzeń między oknami (przerwanie żądania i inne odczyty serwera nie czekają na całe wyszukiwanie)
        await new Promise((r) => setImmediate(r));
      }
    } finally { release(); signal?.removeEventListener('abort', release); }
  }
  return { read, bounds, findPrice, readAfterBe };
}
