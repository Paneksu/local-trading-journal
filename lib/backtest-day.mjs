// Dzień replayu (moduł Backtest, 1.5.0): jedno zapytanie oddaje cały dzień handlowy NY: kontekst 1m + okno 1s (NQ) + newsy i earningsy.
// "Brak przyszłości" pilnują czyste moduły przeglądarki (public/js/bt-*.js); serwer oddaje komplet danych dnia, bez żadnej logiki kursora.
// NQ/MNQ: m1 od otwarcia sesji CME `ctx` sesji wstecz do 16:00 NY, s1 tylko PRAWDZIWE 1s z [9:30, 11:00) NY (bez świec syntetycznych).
// ES/MES: tylko 1m. [U] 30.10.2026 «Nie potrzebuje narazie tego jednak» (zakup ES 1s anulowany): s1 = [], real1s = [], has1s = false.
// Godziny 9:30/11:00/16:00 liczone w America/New_York (etToUtc), więc czas letni i zimowy wychodzą same.
// English: one-call replay day (1m context + real 1s window for NQ, 1m only for ES), times in New York time.
import { etToUtc } from './news.mjs';
import { DatabentoError } from './databento.mjs';
import { dayNum, sessionBounds, previousSession } from '../public/js/swiece.js';
import { FAMILY } from '../public/js/kontrakty.js';

export const MAX_INSTRUMENTS = 4;
export const MAX_CTX = 5;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 2010;
const tt = (t, s, v) => (t ? t(s, v) : v ? s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? '')) : s);
const bad = (t, key, vars) => new DatabentoError(tt(t, key, vars), 400, 'bad-request');

function parseDay(day, t) {
  const m = typeof day === 'string' ? DAY_RE.exec(day) : null;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const n = dayNum(y, mo, d), x = new Date(n * 86400000);
    if (y >= MIN_YEAR && x.getUTCFullYear() === y && x.getUTCMonth() + 1 === mo && x.getUTCDate() === d) return n;
  }
  throw bad(t, 'Nieprawidłowy dzień: {day} (oczekiwany format RRRR-MM-DD).', { day: String(day).slice(0, 12) });
}

// 9:30, 11:00 i 16:00 NY w sekundach UTC.
export function dayTimes(day) {
  const n = parseDay(day);
  return { open: etToUtc(n, 9, 30), w1sEnd: etToUtc(n, 11, 0), end: etToUtc(n, 16, 0) };
}

const covers = (ranges, a, b) => { let at = a; for (const [x, y] of ranges) { if (x <= at && y > at) at = y; } return at >= b; };

export function createReplayDay({ candles, news, earnings, t } = {}) {
  async function read({ instruments, day, ctx = 2 } = {}) {
    parseDay(day, t);
    const times = dayTimes(day);
    if (!Number.isInteger(ctx) || ctx < 0 || ctx > MAX_CTX) throw bad(t, 'Nieprawidłowa liczba dni kontekstu: {ctx} (0 do {max}).', { ctx: String(ctx).slice(0, 6), max: MAX_CTX });
    const list = [...new Set((instruments || []).map((x) => String(x).trim().toUpperCase()))];
    if (!list.length || list.length > MAX_INSTRUMENTS || list.some((i) => !Object.hasOwn(FAMILY, i))) throw bad(t, 'Nieprawidłowe instrumenty (od 1 do {max}: ES, NQ, MES, MNQ).', { max: MAX_INSTRUMENTS });
    // początek kontekstu: otwarcie sesji CME `ctx` sesji przed sesją, w której leży 9:30 NY (sesja dnia otwiera się poprzedniego wieczoru)
    let s = sessionBounds(times.open);
    for (let i = 0; i < ctx; i++) s = previousSession(s.open);
    const { open, w1sEnd, end } = times;
    const ctxFrom = s.open;
    // dane czytane raz na rodzinę: MNQ i NQ dostają te same świece (kopia płytka tablic, bez przeliczania)
    const byFamily = new Map();
    const family = async (fam, instrument) => {
      if (byFamily.has(fam)) return byFamily.get(fam);
      const m = await candles.readRaw({ instrument, from: String(ctxFrom), to: String(end), tf: '1m' });
      if (m.noSource) throw bad(t, 'Brak źródła danych dla tego instrumentu');
      let s1 = [], real1s = [];
      if (fam === 'NQ') {
        const r = await candles.readRaw({ instrument, from: String(open), to: String(w1sEnd), tf: '1s' }, { noSynth: true });
        if (!r.noSource) { s1 = r.bars.filter((b) => b.length === 6); real1s = (r.covered || []).map(([a, b]) => [Math.max(a, open), Math.min(b, w1sEnd)]).filter(([a, b]) => b > a); }
      }
      const out = { fam, m1: m.bars.filter((b) => b[0] >= ctxFrom && b[0] < end), s1, real1s, has1s: covers(real1s, open, w1sEnd), rolls: m.rolls || [] };
      byFamily.set(fam, out);
      return out;
    };
    const inst = {};
    for (const i of list) {
      const f = await family(FAMILY[i], i);
      // contract: nazwa kontraktu dnia nie jest jeszcze znana serwerowi bez nadpisania trade'a (tfrom); null do czasu, aż dojdzie potrzeba (B1+)
      inst[i] = { data: f.fam, contract: null, m1: f.m1, s1: f.s1, real1s: f.real1s, has1s: f.has1s, rolls: f.rolls };
    }
    const n = parseDay(day);
    const e0 = etToUtc(n - 1, 16, 0); // earningsy od poprzedniego zamknięcia (16:00 NY dzień wcześniej)
    return {
      day, tz: 'America/New_York', times: { ctxFrom, open, w1sEnd, end }, inst,
      news: news.range(ctxFrom, end).events,
      earnings: earnings.range(e0, end).events,
    };
  }
  return { read };
}
