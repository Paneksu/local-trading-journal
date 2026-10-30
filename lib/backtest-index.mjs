// Indeks cech dnia modułu Backtest (1.5.0): pokrycie danych (C1) oraz cechy dnia handlowego (F1): kalendarz, newsy, OPEX, wygasanie, earningsy i rynek przed 9:30.
// Pula dni (00-wspolne): NQ/MNQ wymagają prawdziwego 1s w [9:30, 11:00) NY (has1s.NQ), ES/MES pokrycia 1m w [9:30, 16:00) NY (has1m.ES).
// ES nie ma has1s: [U] 30.10.2026 «Nie potrzebuje narazie tego jednak» (zakup ES 1s anulowany), ES tylko 1m.
// Cechy rynku liczone WYŁĄCZNIE z danych sprzed 9:30 dnia D (noc 18:00–9:30, otwarcie 9:30, ostatnia cena przed 9:30) i z zakończonych sesji dni wcześniejszych:
// świece po 9:30 dnia D nigdy nie wchodzą do jego cech (test backtest-F1: bez przyszłości w cechach rynku).
// Pamięć: do pliku <baza>/backtest/day-index-<SYM>.json trafiają tylko podsumowania świec dnia (sesja i noc), zależne od pokrycia; cechy kalendarza i newsów
// składane są przy każdym get (tanie, więc nowy news albo święto nie wymaga unieważniania pliku). Dzień czyta świece tylko raz, dopóki jego pokrycie się nie zmieni.
// Znane ograniczenie: dane nadpisane w miejscu przy tym samym pokryciu nie są wykrywane (prawdziwe świece po pobraniu są niezmienne).
// English: per-day feature index (coverage, calendar, news, OPEX, earnings, pre-open market stats), incremental on disk, no data after 9:30 used for that day.
import { readCoverage, coverageVersion, mergeRanges } from './candles-store.mjs';
import { etToUtc, etOffsetSec } from './news.mjs';
import { DatabentoError } from './databento.mjs';
import { dayNum, fromDayNum, weekdayOf } from '../public/js/swiece.js';
import { FAMILY, thirdFriday, qOf } from '../public/js/kontrakty.js';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';

// 2 (H2, 30.10.2026): rekord dnia ma też `at[HH:MM]` = { pre, onH, onL } nocy do godziny startu replayu (gap od ceny startu)
export const INDEX_VERSION = 2;
const START_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 2010;
const MAX_SPAN_DAYS = 366 * 20;
const HIST_DAYS = 125;           // dni kalendarzowe wstecz od początku zakresu: 74 sesje na ATR(14) i jego średnią z 60 dni
const SHARED_MARGIN = 10;        // dni zapasu na święta i wyniki spółek po sąsiedzku zakresu
const READ_GROUP_DAYS = 20;      // dni kalendarzowe w jednym odczycie 1m (limit 50 000 świec na odczyt)
const NEWS_CHUNK_DAYS = 380;     // limit zakresu newsów to 400 dni
const IMP_RANK = { high: 3, medium: 2, low: 1 };
const tt = (t, s, v) => (t ? t(s, v) : v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s);
const bad = (t, key, vars) => new DatabentoError(tt(t, key, vars), 400, 'bad-request');
const pad = (n) => String(n).padStart(2, '0');
const dateStr = (n) => { const { y, mo, d } = fromDayNum(n); return `${y}-${pad(mo)}-${pad(d)}`; };
const isWeekday = (n) => weekdayOf(n) >= 1 && weekdayOf(n) <= 5;
const nextWeekday = (n) => { let m = n + 1; while (!isWeekday(m)) m++; return m; };
const prevWeekday = (n) => { let m = n - 1; while (!isWeekday(m)) m--; return m; };
const mondayOf = (n) => n - ((weekdayOf(n) + 6) % 7);

function parseDay(day, t) {
  const m = typeof day === 'string' ? DAY_RE.exec(day) : null;
  if (m) {
    const n = dayNum(Number(m[1]), Number(m[2]), Number(m[3]));
    if (Number(m[1]) >= MIN_YEAR && dateStr(n) === day) return n;
  }
  throw bad(t, 'Nieprawidłowy dzień: {day} (oczekiwany format RRRR-MM-DD).', { day: String(day).slice(0, 12) });
}

// [a, b) w całości pokryte zakresami (posortowanymi, scalonymi).
// Pokrycie warstwy razem z warstwami kontraktów (np. 1s + 1s-NQH2024): trasa dnia replayu czyta też z warstwy kontraktu (tydzień rolla), więc pula dni
// musi liczyć to samo. Usterka P1 z odbioru H1 (30.10.2026): 39 dni 2020–2024 (m.in. CPI 2024-03-12) wypadało z powodem „brak sekund”, choć replay miał pełne 1s.
const layerUnion = (cov, layer) => mergeRanges(Object.keys(cov).filter((k) => k === layer || k.startsWith(layer + '-')).flatMap((k) => cov[k] || []));
const covers = (ranges, a, b) => { let at = a; for (const [x, y] of ranges) { if (x <= at && y > at) at = y; } return at >= b; };

// ---- nazwy wydarzeń: odczyty z jednej publikacji (np. cztery CPI o 8:30) to jedno wydarzenie dnia ----
const CANON = [
  [/^(Core )?CPI\b/i, 'CPI'], [/^(Core )?PPI\b/i, 'PPI'],
  [/^(Non-Farm Employment Change|Unemployment Rate|Average Hourly Earnings)/i, 'NFP'],
  [/^Core PCE\b/i, 'PCE'], [/GDP/i, 'GDP'], [/^(Core )?Retail Sales\b/i, 'Retail Sales'], [/^(Core )?Durable Goods\b/i, 'Durable Goods'],
  [/^FOMC Meeting Minutes\b/i, 'FOMC Minutes'], [/^FOMC Press Conference\b/i, 'FOMC Press Conference'],
  [/^(FOMC Statement|FOMC Economic Projections|Federal Funds Rate)\b/i, 'FOMC'],
];
export const canonName = (name) => { const s = String(name || '').trim(); for (const [re, c] of CANON) if (re.test(s)) return c; return s; };

// ---- cechy kalendarza i newsów jednego dnia ----
const hmOf = (t, n) => { const sec = t + etOffsetSec(t) - n * 86400; return `${pad(Math.floor(sec / 3600) % 24)}:${pad(Math.floor((sec % 3600) / 60))}`; };
function newsOf(n, events) {
  const open = etToUtc(n, 9, 30), w1sEnd = etToUtc(n, 11, 0);
  const map = new Map();
  for (const e of events) {
    if (e.kind === 'holiday' || e.kind === 'opex') continue;
    const name = canonName(e.name);
    // [gust] wydarzenie całodzienne (np. wybory) nie ma godziny: 00:00 i pora „open”, bo trwa przez całą sesję
    const hm = e.allDay ? '00:00' : hmOf(e.t, n), when = e.allDay ? 'open' : e.t < open ? 'pre' : e.t < w1sEnd ? 'open' : 'post';
    const key = `${name}|${hm}`, cur = map.get(key);
    if (!cur) map.set(key, { name, kind: e.kind, imp: e.imp, hm, when, ...(e.allDay ? { allDay: true } : {}) });
    else if ((IMP_RANK[e.imp] || 0) > (IMP_RANK[cur.imp] || 0)) cur.imp = e.imp;
  }
  return [...map.values()].sort((x, y) => (x.hm < y.hm ? -1 : x.hm > y.hm ? 1 : x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
}
function earningsOf(n, byDay) {
  const out = [];
  for (const e of byDay.get(dateStr(n)) || []) if (e.session === 'bmo' || e.session === 'weekend') out.push({ cls: e.cls, when: 'bmo' }); // weekend: reakcja przy otwarciu poniedziałku
  for (const e of byDay.get(dateStr(prevWeekday(n))) || []) if (e.session === 'amc') out.push({ cls: e.cls, when: 'prevAmc' });
  return out.sort((x, y) => x.cls - y.cls || (x.when < y.when ? -1 : x.when > y.when ? 1 : 0));
}
// tydzień rolla = tydzień (pon–pt) z trzecim piątkiem marca, czerwca, września i grudnia (kontrakty ES i NQ wygasają, rynek przechodzi na następny)
const rollMondays = (y) => new Set([3, 6, 9, 12].map((m) => thirdFriday(qOf(y, m)) - 4));

// Cechy jednego dnia. src = { NQ: { '1m', '1s' }, ES: { '1m' } } (pokrycie); ctx (opcjonalnie, F1) = { events, earn, holidays, opexMondays, mkt: { [Sym]: mkt|undefined } }.
export function dayFeatures(day, src, ctx = null) {
  const n = typeof day === 'number' ? day : parseDay(day);
  const open = etToUtc(n, 9, 30), w1sEnd = etToUtc(n, 11, 0), end = etToUtc(n, 16, 0);
  const f = { day: dateStr(n), wd: weekdayOf(n), has1s: {}, has1m: {} };
  for (const sym of ['NQ', 'ES']) {
    const cov = src[sym];
    if (!cov) continue;
    f.has1m[sym] = covers(cov['1m'] || [], open, end);
    if (sym === 'NQ') f.has1s.NQ = covers(cov['1s'] || [], open, w1sEnd);
  }
  if (!ctx) return f;
  const { events, earn, holidays, opexMondays } = ctx;
  const dayEvents = events.get(f.day) || [];
  const opexEv = dayEvents.find((e) => e.kind === 'opex');
  f.month = fromDayNum(n).mo;
  f.holiday = { before: holidays.has(dateStr(nextWeekday(n))), after: holidays.has(dateStr(prevWeekday(n))) };
  f.rollWeek = rollMondays(fromDayNum(n).y).has(mondayOf(n));
  f.news = newsOf(n, dayEvents);
  f.fedChair = dayEvents.some((e) => e.kind === 'speech');
  f.opex = opexEv ? (opexEv.variant === 'quarterly' ? 'quarterly' : 'monthly') : null;
  f.opexWeek = opexMondays.has(mondayOf(n));
  f.earnings = earningsOf(n, earn);
  f.mkt = {};
  for (const [sym, m] of Object.entries(ctx.mkt || {})) if (m) f.mkt[sym] = m;
  return f;
}

// ---- podsumowania świec dnia (sesja i noc) ----
const dayWin = (n) => ({ onFrom: etToUtc(n - 1, 18, 0), open: etToUtc(n, 9, 30), end: etToUtc(n, 16, 0) });
// Podpis pokrycia 1m okna dnia [18:00 poprzedniego dnia, 16:00): zmiana pokrycia = nowy odczyt tego dnia. ranges posortowane, dni rosnąco (wskaźnik p idzie do przodu).
function sigMaker(ranges) {
  let p = 0, lastA = -Infinity;
  return (a, b) => {
    if (a < lastA) p = 0;
    lastA = a;
    while (p < ranges.length && ranges[p][1] <= a) p++;
    const out = [];
    for (let q = p; q < ranges.length && ranges[q][0] < b; q++) out.push(`${Math.max(ranges[q][0], a)}-${Math.min(ranges[q][1], b)}`);
    return out.join(',');
  };
}
// [U] 30.10.2026 «Gap od ceny startu»: noc [18:00 poprzedniego dnia, godzina startu) dla startu przed 9:30: ostatnia cena przed startem, maksimum i minimum nocy.
// Wyłącznie świece zaczęte przed startem, więc cechy nie widzą nic po godzinie startu (także 9:00–9:30 przy starcie 9:00).
function summarizeTo(bars, from, cut) {
  const r = { pre: null, onH: null, onL: null };
  for (const b of bars) {
    if (b[0] < from || b[0] >= cut) continue;
    if (r.onH === null || b[2] > r.onH) r.onH = b[2];
    if (r.onL === null || b[3] < r.onL) r.onL = b[3];
    r.pre = b[4];
  }
  return r;
}
function summarize(bars, win) {
  const r = { onH: null, onL: null, pre: null, open: null, o: null, h: null, l: null, c: null };
  for (const b of bars) {
    const t = b[0];
    if (t < win.open) {
      if (r.onH === null || b[2] > r.onH) r.onH = b[2];
      if (r.onL === null || b[3] < r.onL) r.onL = b[3];
      r.pre = b[4];
    } else {
      if (r.o === null) r.o = b[1];
      if (r.open === null && t < win.open + 300) r.open = b[1]; // otwarcie 9:30 = otwarcie pierwszej świecy w pierwszych 5 minutach
      if (r.h === null || b[2] > r.h) r.h = b[2];
      if (r.l === null || b[3] < r.l) r.l = b[3];
      r.c = b[4];
    }
  }
  return r;
}

export function createDayIndex({ candles, news, earnings, baseDir, t, log = (...a) => console.error(...a) } = {}) {
  const stats = { reads: 0 };
  const states = new Map();
  const fileOf = (sym) => path.join(baseDir || '.', 'backtest', `day-index-${sym}.json`);
  function stateOf(sym) {
    if (states.has(sym)) return states.get(sym);
    const st = { recs: new Map(), dirty: false };
    try {
      const j = JSON.parse(readFileSync(fileOf(sym), 'utf8'));
      if (j && j.version === INDEX_VERSION && j.days && typeof j.days === 'object') for (const [d, r] of Object.entries(j.days)) st.recs.set(d, r);
    } catch { /* brak pliku albo uszkodzony: indeks zbuduje się od nowa */ }
    states.set(sym, st);
    return st;
  }
  function save(sym, st) {
    if (!st.dirty || !baseDir) return;
    const f = fileOf(sym);
    // review G #9: plik indeksu to tylko pamięć podręczna; błąd zapisu (EPERM na Windows, gdy plik trzyma antywirus albo indeksator) nie może wywrócić odpowiedzi.
    // Zostaje dirty = true, więc następne get spróbuje jeszcze raz.
    try {
      mkdirSync(path.dirname(f), { recursive: true });
      const doc = { version: INDEX_VERSION, coverageVersion: coverageVersion(baseDir), days: Object.fromEntries([...st.recs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) };
      writeFileSync(f + '.tmp', JSON.stringify(doc) + '\n');
      renameSync(f + '.tmp', f);
      st.dirty = false;
    } catch (e) {
      log('[backtest] indeks dni: nie udało się zapisać pliku pamięci podręcznej', path.basename(f), e.code || e.message);
      try { unlinkSync(f + '.tmp'); } catch { /* nie było pliku tymczasowego */ }
    }
  }

  // Cechy rynku jednego instrumentu dla dni [a, b]: Map(numer dnia → mkt) tylko dla dni z danymi.
  // start: 'HH:MM' przed 9:30 = cechy nocy i gap do tej godziny ([U] 30.10.2026 «Gap od ceny startu»); null albo ≥ 9:30 = jak dotąd (od otwarcia 9:30).
  function marketFor(sym, a, b, cov, start = null) {
    const out = new Map();
    out.empty = new Set(); // dni z pokryciem 1m, ale bez żadnej świecy 9:30–16:00 NY (rynek zamknięty: 1.01, Wielki Piątek, 25.12)
    if (!candles || !baseDir) return out;
    const st = stateOf(sym);
    const sig = sigMaker(cov['1m'] || []);
    const nums = [];
    for (let n = a - HIST_DAYS; n <= b; n++) if (isWeekday(n)) nums.push(n);
    const need = [];
    for (const n of nums) {
      const w = dayWin(n), s = sig(w.onFrom, w.end), key = dateStr(n), rec = st.recs.get(key);
      if (rec && rec.cov === s) continue;
      if (s === '') { st.recs.set(key, { cov: '' }); st.dirty = true; continue; }
      need.push({ n, key, cov: s });
    }
    for (let i = 0; i < need.length;) {
      let j = i;
      while (j + 1 < need.length && need[j + 1].n - need[i].n < READ_GROUP_DAYS) j++;
      const group = need.slice(i, j + 1);
      const from = dayWin(group[0].n).onFrom, to = dayWin(group[group.length - 1].n).end;
      const r = candles.readRaw({ instrument: sym, from: String(from), to: String(to), tf: '1m' });
      const bars = (r && r.bars) || [];
      let p = 0;
      for (const g of group) {
        const w = dayWin(g.n);
        while (p < bars.length && bars[p][0] < w.onFrom) p++;
        let q = p;
        while (q < bars.length && bars[q][0] < w.end) q++;
        st.recs.set(g.key, { cov: g.cov, ...summarize(bars.slice(p, q), w) });
        stats.reads++;
        p = q;
      }
      st.dirty = true;
      i = j + 1;
    }
    if (start) {
      const [hh, mm] = start.split(':').map(Number);
      const late = [];
      for (let n = a; n <= b; n++) {
        if (!isWeekday(n)) continue;
        const rec = st.recs.get(dateStr(n));
        if (rec && rec.cov && !rec.at?.[start]) late.push(n);
      }
      for (let i = 0; i < late.length;) {
        let j = i;
        while (j + 1 < late.length && late[j + 1] - late[i] < READ_GROUP_DAYS) j++;
        const group = late.slice(i, j + 1);
        const r = candles.readRaw({ instrument: sym, from: String(dayWin(group[0]).onFrom), to: String(etToUtc(group[group.length - 1], hh, mm)), tf: '1m' });
        const bars = (r && r.bars) || [];
        for (const n of group) {
          const rec = st.recs.get(dateStr(n));
          st.recs.set(dateStr(n), { ...rec, at: { ...(rec.at || {}), [start]: summarizeTo(bars, dayWin(n).onFrom, etToUtc(n, hh, mm)) } });
          stats.reads++;
        }
        st.dirty = true;
        i = j + 1;
      }
    }
    save(sym, st);
    // sesje z danymi w kolejności; ATR(14) z dziennych zakresów sesji: TR = max(h−l, |h−c₋₁|, |l−c₋₁|)
    const arr = nums.filter((n) => st.recs.get(dateStr(n))?.h != null).map((n) => ({ n, ...st.recs.get(dateStr(n)) }));
    const tr = arr.map((x, i) => (i === 0 ? null : Math.max(x.h - x.l, Math.abs(x.h - arr[i - 1].c), Math.abs(x.l - arr[i - 1].c))));
    const atr = arr.map((_, i) => (i < 14 ? null : tr.slice(i - 13, i + 1).reduce((s, v) => s + v, 0) / 14));
    const ratio = arr.map((_, i) => {
      if (i < 14 + 59) return null;
      const w = atr.slice(i - 59, i + 1);
      return atr[i] / (w.reduce((s, v) => s + v, 0) / 60);
    });
    for (let n = a; n <= b; n++) {
      if (!isWeekday(n)) continue;
      const rec = st.recs.get(dateStr(n));
      if (rec && rec.cov && rec.h == null) out.empty.add(n);
      let lo = 0, hi = arr.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].n < n) lo = m + 1; else hi = m; }
      const prev = arr[lo - 1], prev2 = arr[lo - 2]; // wyłącznie dni wcześniejsze niż n
      // [U] 30.10.2026 «Gap od ceny startu»: przy starcie przed 9:30 gap = ostatnia cena przed startem − zamknięcie poprzedniej sesji, noc i cena „przed” do startu
      const pre = start ? rec?.at?.[start] : null;
      const ref = start ? pre?.pre : rec?.open, last = start ? pre?.pre : rec?.pre, onH = start ? pre?.onH : rec?.onH, onL = start ? pre?.onL : rec?.onL;
      if (!rec || ref == null || !prev) continue;
      const gapPts = ref - prev.c;
      out.set(n, {
        gapPts, gapPct: (gapPts / prev.c) * 100,
        onRange: onH != null && onL != null ? onH - onL : null,
        prevRange: prev.h - prev.l, prevDir: prev.c >= prev.o ? 'up' : 'down',
        inside: prev2 ? prev.h <= prev2.h && prev.l >= prev2.l : null,
        preVsPd: last == null ? null : last > prev.h ? 'above' : last < prev.l ? 'below' : 'inside',
        atr14: atr[lo - 1], atrRatio: ratio[lo - 1],
      });
    }
    return out;
  }

  // newsy i earningsy z okolic zakresu, pogrupowane po dniu ET (kilka wywołań, bo zakres ma limit 400 dni)
  function sharedFor(a, b) {
    const events = new Map(), earn = new Map(), seen = new Set();
    const add = (m, e) => { const k = `${e.t}|${e.name || e.symbol}|${e.day}|${e.session}|${e.cls}`; if (seen.has(k)) return; seen.add(k); (m.get(e.day) || m.set(e.day, []).get(e.day)).push(e); };
    for (let s = a - SHARED_MARGIN; s <= b + SHARED_MARGIN; s += NEWS_CHUNK_DAYS) {
      const from = etToUtc(s, 0, 0), to = etToUtc(Math.min(s + NEWS_CHUNK_DAYS, b + SHARED_MARGIN + 1), 0, 0);
      if (news) for (const e of news.range(from, to).events) add(events, e);
      if (earnings) for (const e of earnings.range(from, to).events) add(earn, e);
    }
    const holidays = new Set(), opexMondays = new Set();
    for (const list of events.values()) for (const e of list) {
      if (e.kind === 'holiday') holidays.add(e.day);
      if (e.kind === 'opex') opexMondays.add(mondayOf(parseDay(e.day)));
    }
    return { events, earn, holidays, opexMondays };
  }

  // mkt: false = bez cech rynku (statystyki używają tylko typu dnia z kalendarza i newsów; cechy rynku czytają świece 1m całego zakresu). Domyślnie liczone jak dotąd.
  // start: godzina startu replayu sesji (def.startTime, 'HH:MM' NY); przed 9:30 cechy rynku liczone do tej godziny ([U] 30.10.2026 «Gap od ceny startu»)
  function get({ instruments = [], from, to, mkt: withMkt = true, start } = {}) {
    const a = parseDay(from, t), b = parseDay(to, t);
    if (start != null && start !== '' && !START_RE.test(String(start))) throw bad(t, 'Nieprawidłowa godzina startu: {v} (oczekiwany format GG:MM).', { v: String(start).slice(0, 8) });
    const cut = start && String(start) < '09:30' ? String(start) : null;
    if (b < a || b - a > MAX_SPAN_DAYS) throw bad(t, 'Nieprawidłowy zakres dat: od {from} do {to}.', { from: String(from).slice(0, 12), to: String(to).slice(0, 12) });
    const list = [...new Set((instruments || []).map((x) => String(x).trim().toUpperCase()))];
    if (list.some((i) => !Object.hasOwn(FAMILY, i))) throw bad(t, 'Nieprawidłowe instrumenty (od 1 do {max}: ES, NQ, MES, MNQ).', { max: 4 });
    const fams = list.length ? [...new Set(list.map((i) => FAMILY[i]))] : ['NQ', 'ES'];
    const src = {}, mkt = {};
    for (const s of fams) {
      const c = readCoverage(s, { baseDir });
      src[s] = { '1m': layerUnion(c, '1m'), '1s': layerUnion(c, '1s') };
      mkt[s] = withMkt ? marketFor(s, a, b, src[s], cut) : new Map();
    }
    const shared = sharedFor(a, b);
    const days = [];
    for (let n = a; n <= b; n++) {
      if (!isWeekday(n)) continue;
      const f = dayFeatures(n, src, { ...shared, mkt: Object.fromEntries(fams.map((s) => [s, mkt[s].get(n)])) });
      // Usterka P1 z odbioru H1 (Review Focus 1): pokrycie bez świec (Databento oddał pusty zakres dla zamkniętego rynku) to nie są dane. Dzień bez świecy 1m
      // w 9:30–16:00 NY wypada z puli (no1s dla NQ, no1m dla ES). Tylko gdy cechy rynku są liczone (kreator); mkt: false (statystyki) zostaje przy pokryciu.
      for (const s of fams) if (mkt[s].empty?.has(n)) { f.has1m[s] = false; if (s === 'NQ') f.has1s.NQ = false; }
      days.push(f);
    }
    return { days, version: INDEX_VERSION };
  }
  return { get, stats };
}
