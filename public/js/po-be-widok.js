// Wynik po BE w interfejsie: etykieta statusu, wiersze do pobrania (dashboard, statystyki backtestu), pobieranie porcjami z buforem i sekcja statystyk.
// Liczy serwer (POST /api/after-be, lib/po-be.mjs); tu tylko pytamy i pokazujemy. Dashboard ani Backtest nigdy nie liczą wyniku sami: Backtest idzie jako { key, typ } (serwer zna granicę sesji),
// a trade Backtestu bez znacznika [sesja/trade] dostaje lokalnie status „bez sesji” bez żadnego żądania.
// [U] 04.11.2026 (decyzje przy zadaniu): typy «Wszystkie trzy» (Live, Paper i Backtest, także w zwykłym dashboardzie z filtrem Typ); statystyki «Procenty + R bez BE, per setup (Recommended)»;
// bez sesji «Osobny status „bez sesji” (Recommended)»; zapis «Tylko w aplikacji (Recommended)» (nic nie idzie do Notion).
// [U] 04.11.2026 «jak zapisuje trade i journaluje jeszcze podczas jak nie poznalem przyszlych swiec w backtestingowej sesji to nnie powinny mi sie ujawniac wtedy»:
// status pending ma ten sam tekst i ten sam DOM niezależnie od przyszłości, a nie wchodzi do procentów ani do sum.
// English: "result after break-even" UI helpers: status label, request rows, chunked fetch with a buffer, and the statistics section.
import { t } from './i18n.js';
import { esc, fmtR, fmtPct, cls } from './format.js';
import { afterBeStats, tradingDayEnd } from './po-be.js';
import { notionBeHit } from './bt-staty.js';
import { parseBtSession } from './stats.js';
import { FAMILY } from './kontrakty.js';

// Poniżej tylu rozstrzygniętych (tp, sl, open) notka „za mało do wniosków” (decyzja zadania: 10, nie MIN_N = 20 z reszty statystyk backtestu).
export const MIN_AFTER_BE = 10;
// Porcja zapytania: serwer liczy synchronicznie, ok. 10 ms na trade z dysku (pomiar 04.11.2026: 200 pozycji naraz blokowało go na ok. 2 s), więc pytamy po 50 (limit serwera to 500),
// a między porcjami serwer obsługuje inne żądania.
export const AFTER_BE_CHUNK = 50;
const FINAL = new Set(['tp', 'sl', 'open', 'mfe', 'no-levels', 'no-session']);
const BT_KEY_RE = /^bt-[a-z0-9]{6,20}\/[A-Za-z0-9_-]{1,40}$/;
const LIVE_KEY_RE = /^[A-Za-z0-9_:.\/-]{1,100}$/;
const CONTRACT_RE = /^[A-Za-z0-9]{0,12}$/;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const res = (status) => ({ status, at: null, rIfHeld: null, mfeR: null, hitSl: null });

// ---- powód braku danych ----
// [U] 04.11.2026 «Wyłącznik, u ciebie włączony»: projekt wymaga no-data „z powodem”. Result zostaje bez zmian, bo powód to stan globalny, a nie stan trade'a: klient liczy podpowiedź z /api/meta i /api/sources.
// Backtest nigdy niczego nie pobiera, więc dostaje wyłącznie informację o danych lokalnych, taką samą przy każdym stanie (nic nie zdradza i o niczym płatnym nie mówi).
const noLocalData = () => t('Brak lokalnych świec na to okno. Wynik Backtestu liczy się tylko z danych na dysku.');
const FALLBACK_DELAY_SEC = 8 * 3600;
// typ: 'Live' | 'Paper' | 'Backtest' | null (wiersz bez pozycji dla serwera); exitAt w ms; src: { afterBe, key, credit, dailyLimitUsd, spentTodayUsd, afterBeReadyTo, queue } albo null, gdy stan nieznany.
// held: serwer oznaczył trade jako trwale zablokowany pamięcią zakupów (świece kupiono już w innej warstwie kontraktu, drugi raz nie kupi ich nic), więc obietnica kolejki byłaby fałszywa.
// exitWhy: dlaczego trade nie ma exitAt (afterBeRows): 'none' | 'entry-no-time' | 'exit-no-time' | 'before-entry'.
export function afterBeNoDataReason({ typ = null, exitAt = null, exitWhy = null, src = null, held = false, now = Date.now() } = {}) {
  if (typ === 'Backtest') return noLocalData();
  if (!typ) return t('Trade nie ma instrumentu ES, NQ, MES ani MNQ albo kierunku, więc świec nie da się dobrać.');
  if (!isNum(exitAt)) {
    if (exitWhy === 'entry-no-time') return t('Data trade\'a nie ma godziny, więc nie wiadomo, od której świecy liczyć. Uzupełnij godzinę w polu Data.');
    if (exitWhy === 'exit-no-time') return t('Wyjście nie ma godziny, więc nie wiadomo, od której świecy liczyć. Uzupełnij godzinę w polu Wyjście.');
    if (exitWhy === 'before-entry') return t('Wyjście jest wcześniej niż wejście, więc nie wiadomo, od której świecy liczyć. Popraw daty trade\'a.');
    return t('Trade nie ma czasu wyjścia, więc nie ma czego dobrać.');
  }
  if (!src) return t('Stan dobierania świec jest nieznany. Sprawdź Ustawienia → Źródła danych.');
  if (src.afterBe !== true) return t('Dobieranie świec jest wyłączone. Włączysz je w Ustawieniach → Źródła danych.');
  if (held) return t('Te świece kupiono już wcześniej w innej warstwie kontraktu i nie będą pobierane drugi raz, więc ten trade zostaje bez danych.');
  if (!src.key) return t('Brak klucza Databento, więc świece się nie pobiorą. Zapisz go w Ustawieniach → Źródła danych.');
  const c = src.credit, q = src.queue || {};
  if (!c?.configured) return t('Brak wpisanego stanu kredytu Databento, więc świece się nie pobiorą. Wpisz go w Ustawieniach → Źródła danych.');
  if (c.expired) return t('Kredyt Databento wygasł, więc świece się nie pobiorą, żeby nie płacić z karty.');
  // pole z /api/sources (databento.afterBeReadyTo), nie readyTo
  const ready = isNum(src.afterBeReadyTo) ? src.afterBeReadyTo : now / 1000 - FALLBACK_DELAY_SEC;
  // przed końcem dnia handlowego Live i Paper mają pending, a nie no-data, więc tu dzień już się skończył
  if (tradingDayEnd(Math.floor(exitAt / 1000)) > ready) return t('Databento jeszcze nie udostępnił tych świec (zwykle ok. 8 godzin po końcu dnia handlowego). Dobiorą się później.');
  if (q.reason === 'credit' || (isNum(c.leftUsd) && c.leftUsd < AFTER_BE_DAY_USD)) return t('Pozostały kredyt Databento jest za mały na to pobranie.');
  if (q.reason === 'daily-limit' || (isNum(src.dailyLimitUsd) && isNum(src.spentTodayUsd) && src.spentTodayUsd + AFTER_BE_DAY_USD > src.dailyLimitUsd)) return t('Dzisiejszy limit dzienny wydatków jest wyczerpany. Pobieranie wróci jutro (doba UTC).');
  if (q.pausedUntil > now) return t('Kolejka czeka po nieudanym płatnym pobraniu i ponowi próbę sama.');
  if (q.blocked > 0) return t('Część pozycji w kolejce jest zablokowana i czeka na Twoją decyzję w Ustawieniach → Źródła danych.');
  if (q.pending > 0) return t('Świece czekają w kolejce pobierania. Kolejka rusza co 5 minut, po porcji naraz.');
  return t('Świece trafią do kolejki przy następnym otwarciu tego widoku.');
}

// Dymek przy pending w Live i Paper (decyzja sesji głównej 05.11.2026). Backtest go nie dostaje, bo tam pending musi wyglądać zawsze tak samo.
export const afterBeLivePending = () => t('Dzień handlowy trade\'a jeszcze trwa. Wynik będzie po 17:00 ET, gdy okno się zamknie.');

// ---- szacunek zaległości ----
// [U] 04.11.2026 «Jedna zgoda z wyceną (Recommended)» (opis opcji: „Włączając przełącznik, widzisz szacunkowy koszt zaległości i potwierdzasz raz. Potem dobiera się samo małymi porcjami, zawsze w limitach i kredycie”).
// Liczone bez płatnej wyceny: dni handlowe na rodzinę instrumentu (ES i MES to te same dane) z trade'ów Live i Paper bez świec × cena z CHANGELOG 1.7.1. POST /api/after-be czyta tylko dysk, a przy wyłączonym przełączniku niczego nie kolejkuje.
export const AFTER_BE_DAY_USD = 0.005;
export function afterBeBacklogOf(rows, results, held = null) {
  const days = new Set();
  for (const x of rows || []) {
    const it = x && x.item;
    if (!it || !isNum(it.exitAt) || results.get(x.key)?.status !== 'no-data') continue;
    // trwale zablokowany pamięcią zakupów: nic go nie kupi, więc jego dnia nie liczymy do kosztu
    if (held && held.has(x.key)) continue;
    days.add(`${FAMILY[it.instrument] ?? it.instrument}|${tradingDayEnd(Math.floor(it.exitAt / 1000))}`);
  }
  return { days: days.size, usd: days.size * AFTER_BE_DAY_USD };
}
// Liczba nieznana (trade'y niewczytane, błąd pytania) to null, nigdy 0: 0 znaczyłoby „nic nie zapłacisz”.
export async function loadAfterBeBacklog(trades, { fetchImpl, rowsOf = afterBeRows } = {}) {
  if (!Array.isArray(trades)) return null;
  const rows = [...rowsOf(trades, { typ: 'Live' }), ...rowsOf(trades, { typ: 'Niewzięty' })];
  const got = await fetchAfterBe(rows.filter((x) => x.item).map((x) => x.item), fetchImpl ? { fetchImpl } : {});
  return got.error ? null : afterBeBacklogOf(rows, got, got.held);
}

// ---- etykieta statusu ----
// text: pełne zdanie do wiersza faktów, value: to samo bez przedrostka „Po BE”, short: do komórki tabeli, amount: sama kwota w R (w kolorze neutralnym, żeby zielone „−1R” nie mylało),
// title: znaczenie wyniku, tone: kolor kropki i tekstu (bez podkładki). Ton: tp = „be” (kolor BE: BE kosztowało zysk), sl = „pos” (BE ochroniło przed stratą), reszta bez rozstrzygnięcia: „muted”.
// reason: podpowiedź przy no-data (afterBeNoDataReason), bez niej informacja o danych lokalnych, jak dla Backtestu. Pozostałych statusów nie dotyczy.
// pendingTitle: dymek przy pending, podaje go tylko dashboard dla Live i Paper; bez niego (Backtest) pending ma zawsze ten sam DOM co brak wyniku.
export function afterBeLabel(r, { reason, pendingTitle } = {}) {
  const st = r && r.status;
  const R = (x) => fmtR(x);
  const pre = (v) => ({ text: `${t('Po BE')}: ${v}`, value: v });
  if (st === 'tp') return { ...pre(t('doszedłby do TP · {r}', { r: R(r.rIfHeld) })), short: t('TP · {r}', { r: R(r.rIfHeld) }), amount: R(r.rIfHeld), title: t('BE kosztowało zysk: cena doszłaby do TP'), tone: 'be' };
  if (st === 'sl') return { ...pre(t('doszedłby do SL · {r}', { r: R(r.rIfHeld) })), short: t('SL · {r}', { r: R(r.rIfHeld) }), amount: R(r.rIfHeld), title: t('BE ochroniło przed stratą: cena doszłaby do SL'), tone: 'pos' };
  if (st === 'open') return { ...pre(t('nierozstrzygnięty')), short: t('otwarty'), tone: 'muted' };
  if (st === 'mfe') {
    const v = r.hitSl ? t('bez TP, przeszedł {r}, potem dotknął SL', { r: R(r.mfeR) }) : t('bez TP, przeszedł {r}', { r: R(r.mfeR) });
    return { ...pre(v), short: t('bez TP · {r}', { r: R(r.mfeR) }), amount: R(r.mfeR), tone: 'muted' };
  }
  if (st === 'no-data') return { ...pre(t('brak danych')), short: t('brak danych'), title: reason || noLocalData(), tone: 'muted' };
  if (st === 'no-levels') return { ...pre(t('brak poziomów')), short: t('brak poziomów'), tone: 'muted' };
  if (st === 'no-session') return { ...pre(t('bez sesji')), short: t('bez sesji'), tone: 'muted' };
  // błąd pobrania (sieć, 400): osobny tekst, nie „czeka na świece”, bo to byłby fałszywy status
  if (st === 'error') return { ...pre(t('nie udało się pobrać')), short: t('błąd'), title: t('Nie udało się pobrać wyniku po BE.'), tone: 'muted' };
  // pending i wynik jeszcze nie pobrany: ten sam tekst, żeby DOM nie zdradzał niczego
  return { ...pre(t('czeka na świece')), short: t('czeka'), ...(st === 'pending' && pendingTitle ? { title: pendingTitle } : {}), tone: 'muted' };
}
// tekst z kwotą w osobnym znaczniku (neutralny kolor)
const markup = (txt, amount) => { const e = esc(txt); if (!amount) return e; const m = esc(amount); return e.includes(m) ? e.replace(m, `<span class="abe-r">${m}</span>`) : e; };
// Kropka i tekst w kolorze (bez podkładki pod statycznym tekstem).
export const afterBeBadge = (r, { short = false, reason, pendingTitle } = {}) => {
  const l = afterBeLabel(r, { reason, pendingTitle });
  const title = l.title || (short ? l.text : '');
  return `<span class="abe abe-${l.tone}"${title ? ` title="${esc(title)}"` : ''}>${markup(short ? l.short : l.text, l.amount)}</span>`;
};

// Wynik do wiersza w szczegółach trade'a: po nieudanym pobraniu (429, sieć) osobny stan błędu, a nie „czeka na świece”; bez wyniku i bez błędu null, czyli ten sam tekst co pending.
export const afterBeResult = (store, key) => store.get(key) || (store.failed() ? { status: 'error' } : null);

// Wiersz „Po BE” w faktach trade'a (Journal backtestu i szczegóły trade'a w dashboardzie): etykieta kropka + tekst, przez całą szerokość siatki faktów. Bez wyniku: ten sam tekst co pending.
export const afterBeFact = (r, { reason, pendingTitle } = {}) => {
  const l = afterBeLabel(r || null, { reason, pendingTitle });
  return `<div class="abe-fact" data-abe><dt>${esc(t('Po BE'))}</dt><dd><span class="abe abe-${l.tone}"${l.title ? ` title="${esc(l.title)}"` : ''}>${markup(l.value, l.amount)}</span></dd></div>`;
};

// ---- wiersze do pobrania ----
// Wiersz: { key, id, setup, r, item, local, exitWhy }. item = ciało pozycji dla serwera albo null; local = wynik ustalony bez serwera (bez sesji, nieobsługiwany instrument);
// exitWhy = powód braku exitAt do podpowiedzi przy no-data (nie idzie do serwera).
const exitWhyOf = (x) => (x.exitDate == null ? 'none' : !isNum(x.at) ? 'entry-no-time' : x.exitTime == null ? 'exit-no-time' : 'before-entry');
const localRow = (key, base, status) => ({ ...base, key, item: null, local: res(status) });

// Dashboard (Notion): kwalifikują się trade'y zamknięte stopem na BE (pole BE i wynik w marginesie BE z ustawień), w danym typie. typ = wartość pola Typ ('Live', 'Backtest', 'Niewzięty').
export function afterBeRows(trades, { typ } = {}) {
  const out = [];
  for (const x of trades || []) {
    if (!x || x.typ !== typ || x.counted === false || !notionBeHit(x)) continue;
    const base = { id: x.id, setup: x.setup || null, r: x.r };
    if (typ === 'Backtest') {
      const m = parseBtSession(x.btSession);
      const key = m ? `${m.sessionId}/${m.tradeId}` : null;
      if (!key || !BT_KEY_RE.test(key)) { out.push(localRow(`ns:${x.id}`, base, 'no-session')); continue; }
      out.push({ ...base, key, item: { key, typ: 'Backtest' }, local: null });
      continue;
    }
    const key = String(x.id || '');
    const instrument = typeof x.instrument === 'string' ? x.instrument.trim().toUpperCase() : '';
    const dir = typeof x.dir === 'string' && /^(long|short)$/i.test(x.dir) ? x.dir : null;
    if (!LIVE_KEY_RE.test(key) || !Object.hasOwn(FAMILY, instrument) || !dir) { out.push(localRow(`nd:${x.id}`, base, 'no-data')); continue; }
    const contract = typeof x.contract === 'string' && CONTRACT_RE.test(x.contract.trim()) ? x.contract.trim().toUpperCase() : '';
    const at = isNum(x.at) ? x.at : null;
    // serwer zna typ Paper, w dashboardzie wartość pola to „Niewzięty”
    const exitAt = at != null && isNum(x.dur) ? at + x.dur * 60000 : null;
    out.push({ ...base, key, local: null, exitWhy: exitAt == null ? exitWhyOf(x) : null, item: { key, typ: x.typ === 'Niewzięty' ? 'Paper' : 'Live', instrument, contract, dir, entryPrice: isNum(x.entryPrice) ? x.entryPrice : null, sl: isNum(x.sl) ? x.sl : null, tp: isNum(x.tp) ? x.tp : null, exitAt, at } });
  }
  return out;
}

// Statystyki backtestu: trade'y ze wspólnego kształtu bt-staty.js (beHit liczy fromSession albo fromNotion).
export function btAfterBeRows(ts) {
  const out = [];
  let i = 0;
  for (const x of ts || []) {
    i++;
    if (!x || !x.beHit) continue;
    const base = { id: x.id, setup: x.setup || null, r: x.r };
    if (typeof x.key === 'string' && BT_KEY_RE.test(x.key)) out.push({ ...base, key: x.key, item: { key: x.key, typ: 'Backtest' }, local: null });
    else out.push(localRow(`ns:${x.id ?? i}`, base, 'no-session'));
  }
  return out;
}

// ---- pobieranie ----
// Powtórzony klucz daje na serwerze 400, więc duplikaty zbieramy do jednego; pozycje idą porcjami (AFTER_BE_CHUNK, serwer przyjmuje do 500). Zwraca Map klucz → Result; błąd porcji w `map.error`.
// 429 (serwer liczy już kilka list naraz) kończy przebieg: kolejne porcje też by odbiły, a odstęp po błędzie ma bufor.
export async function fetchAfterBe(items, { fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  const uniq = new Map();
  for (const it of items || []) if (it && !uniq.has(it.key)) uniq.set(it.key, it);
  const list = [...uniq.values()];
  const map = new Map();
  map.error = null;
  map.held = new Set();
  for (let i = 0; i < list.length; i += AFTER_BE_CHUNK) {
    try {
      const r = await fetchImpl('/api/after-be', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify({ items: list.slice(i, i + AFTER_BE_CHUNK) }) });
      const j = await r.json().catch(() => null);
      if (r.status === 429) { map.error = new Error((j && j.error) || '429'); break; }
      if (!r.ok || !j || typeof j.results !== 'object') throw new Error((j && j.error) || String(r.status));
      for (const [k, v] of Object.entries(j.results)) if (v && typeof v.status === 'string') map.set(k, v);
      if (Array.isArray(j.held)) for (const k of j.held) map.held.add(k);
    } catch (e) { map.error = e; }
  }
  return map;
}

// Bufor po kluczu. Wynik ostateczny (tp, sl, open, mfe, no-levels, no-session) zostaje do końca widoku; pending i no-data pobieramy ponownie tylko na prośbę (refresh: wejście na widok),
// nigdy z timera i nigdy przy zwykłym renderze, więc render nie robi pętli pobrań. ensure(rows, { refresh }) → true, gdy coś się zmieniło (wtedy widok odświeża tylko swoje komórki).
// Po błędzie te same klucze nie są pytane częściej niż co retryMs (domyślnie 30 s), więc ponowne rendery nie ponawiają żądania w kółko.
// Edycja trade'a (inna treść pozycji) pyta od razu, także przy wyniku ostatecznym i po błędzie, a stary wynik znika: należał do innych poziomów. Backtest ma stałą treść { key, typ }, więc tego nie dotyczy.
export function createAfterBeStore({ fetchImpl, now = () => Date.now(), retryMs = 30000 } = {}) {
  const buf = new Map();
  const failedAt = new Map();
  const heldKeys = new Set();
  // klucz → treść pozycji z ostatniego pytania
  const sigs = new Map();
  const inflight = new Map(); // klucz → obietnica trwającego pobrania (drugi ensure czeka na nią zamiast pytać drugi raz)
  let failed = false;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  async function ensure(rows, { refresh = false } = {}) {
    let changed = false;
    const need = new Map();
    const waits = new Set();
    let stale = false;
    for (const row of rows || []) {
      if (!row) continue;
      if (row.local) { if (!buf.has(row.key)) { buf.set(row.key, row.local); changed = true; } continue; }
      if (!row.item || need.has(row.key)) continue;
      const sig = JSON.stringify(row.item);
      const edited = sigs.has(row.key) && sigs.get(row.key) !== sig;
      if (inflight.has(row.key)) {
        // pytanie w locie dotyczy starej treści: po jego końcu pytamy o nową
        if (edited) stale = true;
        if (edited || !buf.has(row.key)) waits.add(inflight.get(row.key));
        continue;
      }
      if (edited) { buf.delete(row.key); failedAt.delete(row.key); heldKeys.delete(row.key); changed = true; }
      if (failedAt.has(row.key) && now() - failedAt.get(row.key) < retryMs) continue;
      const cur = buf.get(row.key);
      if (!cur || (refresh && !FINAL.has(cur.status))) { need.set(row.key, row.item); sigs.set(row.key, sig); }
    }
    let run = null;
    if (need.size) {
      failed = false;
      run = (async () => {
        try {
          const got = await fetchAfterBe([...need.values()], fetchImpl ? { fetchImpl } : {});
          if (got.error) failed = true;
          for (const k of need.keys()) { if (got.held?.has(k)) heldKeys.add(k); else heldKeys.delete(k); }
          for (const [k, v] of got) { failedAt.delete(k); if (!same(buf.get(k), v)) { buf.set(k, v); changed = true; } }
          for (const k of need.keys()) if (!got.has(k)) failedAt.set(k, now());
        } catch { failed = true; for (const k of need.keys()) failedAt.set(k, now()); } finally { for (const k of need.keys()) inflight.delete(k); }
      })();
      for (const k of need.keys()) inflight.set(k, run);
      await run;
    }
    // klucze pobierane przez inne wywołanie: czekamy na jego wynik i oddajemy true, żeby widok dorysował komórkę
    if (waits.size) { await Promise.all([...waits].map((p) => p.catch(() => {}))); changed = true; }
    if (stale) { await ensure(rows, { refresh }); changed = true; }
    return changed;
  }
  return { ensure, get: (k) => buf.get(k), has: (k) => buf.has(k), isHeld: (k) => heldKeys.has(k), failed: () => failed, busy: () => inflight.size > 0 };
}

// Wyniki wierszy z bufora w kształcie dla afterBeStats (wiersz bez wyniku jeszcze się ładuje i jest pomijany).
export const statRows = (rows, store) => (rows || []).map((x) => ({ setup: x.setup, r: x.r, afterBe: store.get(x.key) || null }));

// ---- sekcja statystyk ----
const rcls = (x) => cls(x);
const R = (x) => fmtR(x);
const pct = (x) => (x == null ? '–' : fmtPct(x, 0));
function statLine(s, label, tag) {
  const den = s.tp + s.sl + s.open;
  const sums = s.tp + s.sl > 0;
  const few = den < MIN_AFTER_BE;
  return `<tr class="${few ? 'bt-few' : ''}"><td>${esc(label)}${few && tag ? ` <span class="bt-few-tag note">${esc(t('za mało danych'))}</span>` : ''}</td>
    <td class="num">${esc(String(s.n))}</td><td class="num">${esc(pct(s.pctTp))}</td><td class="num">${esc(pct(s.pctSl))}</td><td class="num">${esc(pct(s.pctOpen))}</td>
    <td class="num ${sums ? rcls(s.sumIfHeld) : ''}">${esc(sums ? R(s.sumIfHeld) : '–')}</td><td class="num ${sums ? rcls(s.sumActual) : ''}">${esc(sums ? R(s.sumActual) : '–')}</td></tr>`;
}
// stats = afterBeStats(wiersze); opts: loading (część wyników jeszcze się pobiera), error (błąd sieci), total (ile trade'ów po BE jest w zakresie). Bez trade'ów po BE sekcji nie ma.
export function afterBeSection(stats, { loading = false, error = false, total = 0 } = {}) {
  const s = stats || afterBeStats([]);
  if (!s.n && !total) return '';
  const wrap = (inner) => `<section class="sec abe-sec" data-abe-sec aria-label="${esc(t('Wynik po BE'))}"><div class="sec-h"><h2>${esc(t('Wynik po BE'))}</h2></div><div class="card bt-st-card">${inner}</div></section>`;
  const notes = `${loading ? `<p class="note abe-note" role="status">${esc(t('Liczę wynik po BE…'))}</p>` : ''}${error ? `<p class="note abe-note abe-err" role="status">${esc(t('Nie udało się pobrać wyniku po BE.'))}</p>` : ''}`;
  if (!s.n) return wrap(notes);
  const den = s.tp + s.sl + s.open;
  const tile = (label, val, sub, c = '') => `<div class="tile"><span class="lbl">${esc(label)}</span><span class="val ${c}">${val}</span><span class="sub">${esc(sub)}</span></div>`;
  const sums = s.tp + s.sl > 0;
  const tiles = `<div class="tiles bt-st-ex abe-tiles">
    ${tile(t("Trade'y po BE"), esc(String(s.n)), t('rozstrzygniętych: {n}', { n: den }))}
    ${tile(t('Doszłyby do TP'), esc(pct(s.pctTp)), t('{n} z {d} rozstrzygniętych', { n: s.tp, d: den }))}
    ${tile(t('Trafiłyby SL'), esc(pct(s.pctSl)), t('{n} z {d} rozstrzygniętych', { n: s.sl, d: den }))}
    ${tile(t('Nierozstrzygnięte'), esc(pct(s.pctOpen)), t('{n} z {d} rozstrzygniętych', { n: s.open, d: den }))}
    ${tile(t('R bez BE'), `<span class="${sums ? rcls(s.sumIfHeld) : ''}">${esc(sums ? R(s.sumIfHeld) : '–')}</span>`, sums ? t('faktycznie: {r}', { r: R(s.sumActual) }) : t('brak rozstrzygniętych'))}
  </div>`;
  const parts = [];
  if (s.mfe) parts.push(t('Bez TP: {n}', { n: s.mfe }));
  if (s.pending) parts.push(t('Czeka na świece: {n}', { n: s.pending }));
  if (s.noData) parts.push(t('Brak danych: {n}', { n: s.noData }));
  if (s.noLevels) parts.push(t('Brak poziomów: {n}', { n: s.noLevels }));
  if (s.noSession) parts.push(t('Bez sesji: {n}', { n: s.noSession }));
  const counts = parts.length ? `<p class="note abe-counts">${esc(parts.join(' · '))}</p>` : '';
  const few = den < MIN_AFTER_BE ? `<p class="note bt-st-few abe-few" role="status">${esc(t('Rozstrzygniętych: {n}. Poniżej {min} to za mało do wniosków.', { n: den, min: MIN_AFTER_BE }))}</p>` : '';
  const body = s.bySetup.map((x) => statLine(x, x.setup === '' ? t('bez setupu') : x.setup, true)).join('');
  const table = `<div class="bt-st-tw"><table class="bt-tab abe-tab"><thead><tr><th>${esc(t('Setup'))}</th><th class="num">${esc(t("Trade'y po BE"))}</th><th class="num">${esc(t('Doszłyby do TP'))}</th><th class="num">${esc(t('Trafiłyby SL'))}</th><th class="num">${esc(t('Nierozstrzygnięte'))}</th><th class="num">${esc(t('R bez BE'))}</th><th class="num">${esc(t('R faktycznie'))}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  return wrap(`<p class="note">${esc(t('Co zrobiłaby cena po wybiciu stopem na BE, gdyby stop został na pierwotnym SL, a cel na TP. Procenty liczone z trade\'ów rozstrzygniętych (TP, SL, nierozstrzygnięte). Wybicie TP po BE znaczy, że BE kosztowało zysk.'))}</p>${notes}${few}${tiles}${counts}${table}`);
}
