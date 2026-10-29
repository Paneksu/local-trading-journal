// Magazyn świec: pliki binarne na dzień UTC w dwóch warstwach (1m: historia, 1s: okna wokół trade'ów), pokrycie jako zakresy czasu, odczyt zakresu, zapis atomowy.
// Układ: <baza>/candles/<ES|NQ>/{1s,1m}/YYYY-MM-DD.bin oraz <baza>/candles/<ES|NQ>/coverage.json (baza domyślnie CONFIG_DIR/chart-data).
// Rekord 24 B little-endian: t u32 (sekundy epoki UTC początku świecy), o,h,l,c i32 (cena × 100, tick 0,25 = 25), v u32.
// Bez nagłówka, rosnąco po t. Dzień pliku = dzień UTC (granice żądań Databento są w UTC, sesje liczy agregacja).
// P25 (27.10.2026, słowa użytkownika: «okej zwiekszam limit do 50 usd ale sie upewniaj ze wszystko jest pobierane z darmowych kredytow akceptuje plan»):
// warstwa 1m pochodzi z serwera (ohlcv-1m) i NIE jest liczona z 1s; warstwa 1s istnieje tylko w oknach wokół trade'ów.
// coverage.json: { "1m": [[od, do], …], "1s": [[od, do], …], "rolls": [{ t, label }] }, zakresy [od, do) w sekundach epoki, scalane i posortowane.
// Pokrycie mówi "o to pytaliśmy serwer": sekunda bez transakcji nie ma świecy (nie zakładamy ciągłości), a mimo to leży w zakresie pokrycia.
// Moduł nie zna sieci ani serwera; nie używa SQL. English: binary candle store, two layers (1m history, 1s windows), time-range coverage.
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR } from './env.mjs';

export const REC = 24;
export const SYMBOLS = ['ES', 'NQ'];
export const RESOLUTIONS = ['1s', '1m'];
// P35 (28.10.2026): warstwa konkretnego kontraktu (symbol surowy Databento) obok serii .v.0, np. "1m-ESH2026", "1s-NQZ2025". Trzyma świece kontraktu,
// którego nie ma w .v.0 w danej chwili (okna rolla, okna trade'ów z polem „Kontrakt”). Rok czterocyfrowy: kod ESH6 powtarza się co 10 lat.
export const LAYER_RE = /^(1s|1m)(-(ES|NQ)[HMUZ]\d{4})?$/;
export const contractLayer = (res, code4) => `${res}-${code4}`;
const layerKeys = (j) => Object.keys(j || {}).filter((k) => LAYER_RE.test(k));
// Pokrycie warstwy (pusta lista dla warstwy kontraktu, której jeszcze nie ma).
export const layerCoverage = (cov, layer) => cov[layer] || [];
export const defaultBase = () => path.join(CONFIG_DIR, 'chart-data');

// Punkty wstrzyknięcia dla testów (symulacja przerwanego zapisu); w produkcji zawsze null.
export const _hooks = { beforeRename: null };

const I32_MIN = -2147483648, I32_MAX = 2147483647, U32_MAX = 4294967295;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function check(sym, res, date) {
  if (!SYMBOLS.includes(sym)) throw new Error(`candles-store: nieznany symbol ${sym}`);
  if (res != null && !(LAYER_RE.test(res) && (res.length === 2 || res.slice(3, 5) === sym))) throw new Error(`candles-store: nieznana rozdzielczość albo warstwa ${res} dla ${sym} (1s, 1m albo 1s-/1m-<kontrakt z rokiem>, np. 1m-ESH2026)`);
  if (date != null && !(DATE_RE.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z')))) throw new Error(`candles-store: zła data ${date}`);
}
const symDir = (base, sym) => path.join(base, 'candles', sym);
const dayFile = (base, sym, res, date) => path.join(symDir(base, sym), res, date + '.bin');
const coverageFile = (base, sym) => path.join(symDir(base, sym), 'coverage.json');

export const dayOf = (tSec) => new Date(tSec * 1000).toISOString().slice(0, 10);
const dayStart = (date) => Date.parse(date + 'T00:00:00Z') / 1000;

// ---- kodowanie ----
export function encode(bars) {
  const buf = Buffer.alloc(bars.length * REC);
  let prev = -1;
  bars.forEach((b, i) => {
    const [t, o, h, l, c, v] = b;
    if (!Number.isInteger(t) || t < 0 || t > U32_MAX || t <= prev) throw new Error(`candles-store: zły czas świecy #${i} (${t}), wymagany rosnący u32`);
    for (const x of [o, h, l, c]) if (!Number.isInteger(x) || x < I32_MIN || x > I32_MAX) throw new Error(`candles-store: zła cena w świecy #${i} (${x}), wymagany całkowity i32 (cena × 100)`);
    if (!Number.isInteger(v) || v < 0 || v > U32_MAX) throw new Error(`candles-store: zły wolumen w świecy #${i} (${v})`);
    prev = t;
    const p = i * REC;
    buf.writeUInt32LE(t, p); buf.writeInt32LE(o, p + 4); buf.writeInt32LE(h, p + 8); buf.writeInt32LE(l, p + 12); buf.writeInt32LE(c, p + 16); buf.writeUInt32LE(v, p + 20);
  });
  return buf;
}
const rec = (buf, i) => { const p = i * REC; return [buf.readUInt32LE(p), buf.readInt32LE(p + 4), buf.readInt32LE(p + 8), buf.readInt32LE(p + 12), buf.readInt32LE(p + 16), buf.readUInt32LE(p + 20)]; };
export function decode(buf) {
  if (buf.length % REC) throw new Error('candles-store: uszkodzony plik (rozmiar nie jest wielokrotnością 24 B)');
  const n = buf.length / REC, out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = rec(buf, i);
  return out;
}
// pierwszy indeks rekordu z t >= x (wyszukiwanie binarne po surowych bajtach)
function lowerBound(buf, x) {
  let lo = 0, hi = buf.length / REC;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (buf.readUInt32LE(mid * REC) < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// ---- zapis atomowy ----
function writeAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  try {
    writeFileSync(tmp, data);
    if (_hooks.beforeRename) _hooks.beforeRename(file);
    renameSync(tmp, file);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nie było pliku tymczasowego */ }
    throw e;
  }
}
const readBuf = (file) => (existsSync(file) ? readFileSync(file) : Buffer.alloc(0));

// ---- zakresy czasu [od, do) ----
// Scala nakładające się i stykające się zakresy; wynik posortowany rosnąco, bez pustych.
export function mergeRanges(ranges) {
  const r = ranges.filter((x) => x[1] > x[0]).map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const x of r) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1]) { if (x[1] > last[1]) last[1] = x[1]; } else out.push(x);
  }
  return out;
}
// Części [from, to), których nie pokrywają zakresy `cover` (posortowane i scalone, patrz mergeRanges).
export function subtractRanges(from, to, cover) {
  const out = [];
  let cur = from;
  for (const [a, b] of cover) {
    if (b <= cur) continue;
    if (a >= to) break;
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
    if (cur >= to) break;
  }
  if (cur < to) out.push([cur, to]);
  return out;
}
// Część wspólna [from, to) z zakresami (przycięte).
export function clipRanges(from, to, ranges) {
  const out = [];
  for (const [a, b] of ranges) { const x = Math.max(a, from), y = Math.min(b, to); if (y > x) out.push([x, y]); }
  return out;
}
// Część wspólna dwóch list zakresów (obie posortowane i scalone).
export function intersectRanges(A, B) {
  const out = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    const x = Math.max(A[i][0], B[j][0]), y = Math.min(A[i][1], B[j][1]);
    if (y > x) out.push([x, y]);
    if (A[i][1] < B[j][1]) i++; else j++;
  }
  return out;
}

// ---- pokrycie (coverage.json) ----
export function readCoverage(sym, { baseDir = defaultBase() } = {}) {
  check(sym);
  const f = coverageFile(baseDir, sym);
  const empty = { '1m': [], '1s': [], rolls: [] };
  if (!existsSync(f)) return empty;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const out = { '1m': [], '1s': [] };
  for (const k of layerKeys(j)) out[k] = mergeRanges(j[k] || []);
  out.rolls = j.rolls || [];
  return out;
}
// Licznik zapisów pokrycia w tym procesie (na katalog): pamięci podręczne pochodne od pokrycia (pomiar rolla) unieważniają się po każdym
// dopisaniu świec, także gdy zakres wydłuża się w środku listy i ani długość, ani ostatni zakres się nie zmieniają (przegląd P35, W2).
const coverageVersions = new Map();
export const coverageVersion = (baseDir = defaultBase()) => coverageVersions.get(baseDir) || 0;
function saveCoverage(sym, cov, baseDir) {
  coverageVersions.set(baseDir, coverageVersion(baseDir) + 1);
  const out = { '1m': cov['1m'], '1s': cov['1s'] };
  for (const k of layerKeys(cov).sort()) if (!(k in out) && cov[k]?.length) out[k] = cov[k];
  out.rolls = cov.rolls;
  writeAtomic(coverageFile(baseDir, sym), JSON.stringify(out, null, 1) + '\n');
}
// Brakujące kawałki [from, to) w danej warstwie.
export function missingRanges(sym, res, from, to, { baseDir = defaultBase() } = {}) {
  check(sym, res);
  return subtractRanges(from, to, layerCoverage(readCoverage(sym, { baseDir }), res));
}

// ---- dni świec ----
export function readDay(sym, res, date, { baseDir = defaultBase() } = {}) {
  check(sym, res, date);
  return decode(readBuf(dayFile(baseDir, sym, res, date)));
}

// Zapis zakresu [from, to) jednej warstwy: świece muszą leżeć w zakresie. Istniejące świece z tego zakresu są zastępowane (powtórne
// pobranie jest idempotentne), świece spoza zakresu zostają. Pliki dni zapisywane atomowo, potem dopiero pokrycie: awaria pomiędzy
// zostawia świece bez pokrycia, czyli zakres zostanie pobrany ponownie. rolls: [{ t, label }] dopisywane bez duplikatów po t.
// Zwraca { written, coverage } (coverage: zakresy tej warstwy po scaleniu).
export function writeRange(sym, res, from, to, bars, { rolls = [] } = {}, { baseDir = defaultBase() } = {}) {
  check(sym, res);
  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) throw new Error(`candles-store: zły zakres ${from}..${to} (sekundy epoki, koniec po początku)`);
  const sorted = [...bars].sort((a, b) => a[0] - b[0]);
  for (const b of sorted) if (b[0] < from || b[0] >= to) throw new Error(`candles-store: świeca t=${b[0]} spoza zakresu ${from}..${to}`);
  encode(sorted); // walidacja całości przed pierwszym zapisem
  for (let d = dayStart(dayOf(from)); d < to; d += 86400) {
    const date = dayOf(d);
    const file = dayFile(baseDir, sym, res, date);
    const old = decode(readBuf(file));
    const keep = old.filter((b) => b[0] < from || b[0] >= to);
    const fresh = sorted.filter((b) => b[0] >= d && b[0] < d + 86400);
    if (!fresh.length && keep.length === old.length) continue; // nic się nie zmienia w tym dniu
    const merged = [...keep, ...fresh].sort((a, b) => a[0] - b[0]);
    if (!merged.length && !existsSync(file)) continue;
    writeAtomic(file, encode(merged));
  }
  const cov = readCoverage(sym, { baseDir });
  cov[res] = mergeRanges([...layerCoverage(cov, res), [from, to]]);
  const known = new Set(cov.rolls.map((r) => r.t));
  for (const r of rolls) if (!known.has(r.t)) { cov.rolls.push({ t: r.t, label: r.label }); known.add(r.t); }
  cov.rolls.sort((a, b) => a.t - b.t);
  saveCoverage(sym, cov, baseDir);
  return { written: sorted.length, coverage: cov[res] };
}

// Świece z zakresu [fromSec, toSec) przez granice dni UTC. Dni bez pliku dają zero świec. Nie sprawdza pokrycia (patrz readCoverage).
export function readRange(sym, res, fromSec, toSec, { baseDir = defaultBase() } = {}) {
  check(sym, res);
  const out = [];
  if (!(toSec > fromSec)) return out;
  for (let d = dayStart(dayOf(fromSec)); d < toSec; d += 86400) {
    const buf = readBuf(dayFile(baseDir, sym, res, dayOf(d)));
    if (buf.length % REC) throw new Error('candles-store: uszkodzony plik dnia ' + dayOf(d));
    for (let i = lowerBound(buf, fromSec), n = buf.length / REC; i < n; i++) {
      const r = rec(buf, i);
      if (r[0] >= toSec) break;
      out.push(r);
    }
  }
  return out;
}

// Pomocnicze pliki JSON obok świec (np. kolejka okien): zapis atomowy, nazwa tylko [a-z0-9-].
export function readAux(name, { baseDir = defaultBase() } = {}) {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error(`candles-store: zła nazwa pliku ${name}`);
  const f = path.join(baseDir, name + '.json');
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8'));
}
export function writeAux(name, obj, { baseDir = defaultBase() } = {}) {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error(`candles-store: zła nazwa pliku ${name}`);
  writeAtomic(path.join(baseDir, name + '.json'), JSON.stringify(obj, null, 1) + '\n');
}
