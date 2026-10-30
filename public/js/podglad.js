// Podgląd wykresu świecowego trade'a: własny SVG w stylu krzywej kapitału (charts.js). Tylko do odczytu: świece, osie, poziomy
// i prostokąty pozycji z pól trade'a, znacznik zmiany kontraktu, rysunki z JSON, TF, przesuwanie, przybliżanie, dymek OHLC.
// Kolory wyłącznie z CSS (klasy .candle.up/.down, .wick, .lvl.*, .pos-*, .roll, .drw); tło przezroczyste. Kolor zapisany w stylu
// rysunku (dane użytkownika) trafia do atrybutu stroke/fill. Świece tylko z lokalnego magazynu (GET /api/candles); pobranie z Databento
// wyłącznie po kliknięciu „Sprawdź koszt” i potwierdzeniu kwoty. Rysunków nie pobiera (dostaje je w opcjach).
// Oś X po indeksie świecy (geometria.js): sekundy bez transakcji nie mają świecy, luki się zwijają. Oś czasu w strefie z Ustawień
// albo z szybkiego przełącznika na wykresie (P26); domyślnie strefa przeglądarki. Skala ceny: automatyczna albo swobodna (przełącznik „Auto”).
// Wspólny stan kadru { tf, fromIndex, toIndex } (indeksy w tablicy wczytanych świec, ułamkowe) przejmuje tryb edycji (etap 8).
// English: read-only SVG candlestick preview for a trade (local candles only, pan/zoom, OHLC tooltip, levels, drawings).
import { esc, num } from './format.js';
import { t, locale } from './i18n.js';
import { niceTicks, placeTip, ensureTip } from './charts.js';
import { parseTf, SESSIONS, sessionWindows, pdhlSpans, overlayLevels } from './swiece.js';
import { dateRef } from './kontrakty.js';
import { confirmDialog, toast } from './modal.js';
import * as G from './geometria.js';
import { themed, CSS_COLORS } from './rysunki-kolory.js';
import { newsDefaults, normNews, buildNewsModel, newsGeometry, newsSvg, timeToX, candleWindow, feed as newsFeed, NEWS_IMPS, EARN_CLASSES } from './newsy.js';
import { mountNewsLayer } from './newsy-warstwa.js';
import { chartSettings, closePoints } from './styl-wykresu.js'; // cykl importów jest bezpieczny: nic z tego modułu nie jest wołane w czasie ładowania

// P27 (28.10.2026): domyślna lista ulubionych interwałów, z tygodniem i miesiącem; użytkownik zmienia ją na wykresie (loadFavTfs).
export const TFS = ['15s', '1m', '5m', '15m', '1h', '4h', '1D', '1W', '1M'];
// P26 (28.10.2026), słowa użytkownika: «usuniecie tego ze jak sie za bardzo oddali wykres to sam zmienia interwal, nie powinien».
// Odstępstwo od karty etapu 7 (było: powyżej 1 500 świec podgląd sam podnosił TF z etykietą „wyświetlane X (wybrano Y)”).
// Teraz interwał zmienia tylko użytkownik, a wydajność trzyma limit oddalenia: najwięcej MAX_VISIBLE świec wybranego TF w kadrze.
export const MAX_VISIBLE = 1500;
export const AUTO_KEY = 'thq.chart.autoscale.v1'; // P26: przełącznik automatycznej skali ceny, wspólny dla podglądu i trybu edycji
const TF_KEY = 'thq.chart.tf.v1';
const MIN_SPAN = 12; // najmniej świec w kadrze
const ATTRIB_URL = 'https://www.tradingview.com/';

// ---- funkcje czyste (testy w Node) ----
// Świece do narysowania: kadr [from, to] i po jednym ekranie zapasu z każdej strony, przycięte do [0, n − 1]. null, gdy nic.
export function visibleRange(n, from, to, pad = 1) {
  if (!(n > 0) || !(to >= from)) return null;
  const w = Math.max(1, to - from);
  const start = Math.max(0, Math.floor(from - w * pad)), end = Math.min(n - 1, Math.ceil(to + w * pad));
  return end >= start ? { start, end } : null;
}
// P26: limit oddalenia. Kadr szerszy niż `max` świec skracany od prawej (kadr startowy: wejście zostaje w kadrze) albo wokół środka (kółko).
export function limitSpan(from, to, max = MAX_VISIBLE, keep = 'left') {
  if (!(to - from > max)) return { fromIndex: from, toIndex: to };
  if (keep === 'center') { const c = (from + to) / 2; return { fromIndex: c - max / 2, toIndex: c + max / 2 }; }
  return { fromIndex: from, toIndex: from + max };
}

// ---- P26: skala ceny (słowa użytkownika 28.10.2026: «powinna dac sie ruszac gora dol takze, czyli wylaczyc ta automatyczne
// dostosowanie sie do wysokosci» + «ma byc przelacznik»). Wł. = jak dotąd (skala ze świec w kadrze); wył. = zakres { min, max } trzymany ręcznie.
// Przesunięcie w pionie o dy px przy wysokości pola ph px (dy > 0: treść w dół, widać wyższe ceny).
export function panPrice({ min, max }, dy, ph) {
  const d = (dy * (max - min)) / (ph || 1);
  return { min: min + d, max: max + d };
}
// Przybliżenie (factor < 1) albo oddalenie (factor > 1) zakresu wokół ceny pod kursorem; jeden krok w granicach 0,05-20.
export function zoomPrice({ min, max }, at, factor) {
  const f = Math.min(20, Math.max(0.05, Number(factor) || 1));
  return { min: at - (at - min) * f, max: at + (max - at) * f };
}
// P32: zakres ceny przy wyłączonym „Auto”. Brak ręcznego zakresu = zakres skali automatycznej (lo..hi z marginesami 8%, jak w trybie Auto), żeby
// przycisk i zachowanie zgadzały się od pierwszej klatki. Przy włączonym „Auto” zwraca to, co dostał (zakres ręczny czeka na wyłączenie).
export function startRange(autoY, yr, lo, hi) {
  if (autoY || (yr && yr.max > yr.min)) return yr;
  if (!(hi > lo)) { const c = Number.isFinite(lo) ? lo : 0; lo = c - 1; hi = c + 1; }
  const k = (hi - lo) / (1 - 0.16);
  return { min: lo - 0.08 * k, max: hi + 0.08 * k };
}
export function loadAutoScale() { try { return globalThis.localStorage?.getItem(AUTO_KEY) !== '0'; } catch { return true; } }
export function saveAutoScale(on) { try { globalThis.localStorage?.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* localStorage niedostępny */ } }
// P29 (28.10.2026): ustawienia rysunku jako okienko ('pop') albo panel przypięty z lewej strony wykresu ('pin'); stan urządzenia (localStorage), nie synchronizowany.
// Decyzja sesji głównej (domyślne): komputer = panel przypięty, telefon (do 640 px) = okienko. Zmiana: Ustawienia → Ogólne, przycisk w okienku albo w panelu.
export const STYLE_DOCK_KEY = 'thq.chart.styleDock.v1';
export function loadStyleDock() {
  try { const v = globalThis.localStorage?.getItem(STYLE_DOCK_KEY); if (v === 'pin' || v === 'pop') return v; } catch { /* localStorage niedostępny */ }
  try { return globalThis.matchMedia?.('(max-width: 640px)').matches ? 'pop' : 'pin'; } catch { return 'pin'; }
}
export function saveStyleDock(v) { try { globalThis.localStorage?.setItem(STYLE_DOCK_KEY, v === 'pop' ? 'pop' : 'pin'); } catch { /* localStorage niedostępny */ } }

// ---- P26: strefa czasowa osi (słowa użytkownika 28.10.2026: «nie mam pojecia jaki czas utc jest ustawiony dla dziennika, wiec powinien byc
// do ustawienia na wykresie jak i staly w ustawieniach»). Czasy trade'ów i świec są momentami UTC (Notion zwraca datę z przesunięciem,
// parseDT liczy moment); strefa zmienia tylko opis osi, dymka i linijek. Stała strefa: Ustawienia → Ogólne (settings.chartTz, '' = przeglądarka).
// Szybki przełącznik na wykresie nadpisuje ją tymczasowo (do przeładowania strony albo zmiany w Ustawieniach), bez zapisu: decyzja gustu.
export const BROWSER_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();
// P27 (28.10.2026), słowa użytkownika: «strefy czasowe powinny byc wszystkie i na wykresie tez powinna byc lista rozwijana, a nie przelaczniki».
// Odstępstwo od P26 (przycisk przełączający po kolei UTC, Nowy Jork, Chicago): na wykresie lista rozwijana ze wszystkimi strefami IANA
// (szybki wybór na górze), w Ustawieniach lista wszystkich stref z polem filtra. Wybór na wykresie dalej tymczasowy (decyzja gustu z P26).
// P29 (28.10.2026), słowa użytkownika: «utc nie mialoby by wszystkich, mialy byc najpopularniejsze ale kazde utc zeby dalo sie wybrac przynajmniej
// kazda godzine, aktualna lista jest za duza». Odstępstwo od P27 (wszystkie strefy IANA): lista = strefy popularne wśród traderów (z czasem letnim)
// + po jednej pozycji na każde pełne przesunięcie UTC−12…UTC+14 (strefy Etc/GMT, bez czasu letniego). Zapisana wcześniej strefa spoza listy
// zostaje widoczna (Ustawienia: na górze listy; wykres: pozycja „Z Ustawień”).
export const TZ_POPULAR = ['UTC', 'Europe/Warsaw', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney'];
// Etc/GMT ma odwrócony znak (POSIX): Etc/GMT+5 to UTC−5, Etc/GMT-14 to UTC+14.
export const TZ_HOURS = Array.from({ length: 27 }, (_, k) => k - 12).filter((h) => h !== 0).map((h) => `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`);
const TZ_NAMES = {
  'Europe/Warsaw': 'Warszawa', 'Europe/London': 'Londyn', 'America/New_York': 'Nowy Jork', 'America/Chicago': 'Chicago', 'America/Los_Angeles': 'Los Angeles',
  'Asia/Tokyo': 'Tokio', 'Asia/Hong_Kong': 'Hongkong', 'Asia/Singapore': 'Singapur', 'Asia/Dubai': 'Dubaj', 'Australia/Sydney': 'Sydney',
};
let tzBase = '', tzOver = '';
export function validTz(z) {
  if (typeof z !== 'string' || !z || z.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; }
}
export function setChartTzDefault(z) { tzBase = validTz(z) ? z : ''; tzOver = ''; }
export const chartTz = () => tzOver || tzBase || BROWSER_TZ;
// Tymczasowa strefa z listy na wykresie ('' albo strefa z Ustawień = bez nadpisania). Zwraca strefę osi.
export function setChartTzOverride(z) {
  const base = tzBase || BROWSER_TZ;
  tzOver = validTz(z) && z !== base ? z : '';
  return chartTz();
}
export const chartTzOverride = () => tzOver;
// P29: lista stref do wyboru (popularne + pełne godziny UTC); strefy, których przeglądarka nie zna, odpadają.
let zonesCache = null;
export function allZones() {
  if (!zonesCache) zonesCache = [...new Set([...TZ_POPULAR, ...TZ_HOURS])].filter(validTz);
  return zonesCache;
}
// Pełna godzina UTC jako strefa Etc/GMT: przesunięcie w godzinach (UTC+5 = 5) albo null.
export function etcHours(z) {
  const m = /^Etc\/GMT([+-])(\d{1,2})$/.exec(String(z));
  return m ? (m[1] === '-' ? 1 : -1) * Number(m[2]) : null;
}
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[_/]/g, ' ');
// Filtr listy stref: każde słowo zapytania musi wystąpić w identyfikatorze, polskiej nazwie albo przesunięciu („warsz”, „new york”, „+5:30”).
export function filterZones(q, zones = allZones(), sec = Date.now() / 1000) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return zones.slice();
  return zones.filter((z) => { const hay = fold(`${z} ${TZ_NAMES[z] || ''} ${tzLabel(z, sec)}`); return words.every((w) => hay.includes(w)); });
}
// Opis strefy na liście: „Warszawa UTC+1 · Europe/Warsaw”, „UTC”.
export const tzOptionLabel = (z, sec) => (z === 'UTC' || etcHours(z) != null ? tzLabel(z, sec) : `${tzLabel(z, sec)} · ${z}`);
const offFmt = new Map(), offCache = new Map();
// Przesunięcie strefy w sekundach dla momentu `sec` (z czasem letnim). Zmiany czasu wypadają o pełnej godzinie UTC, więc wynik pamiętany per godzina.
export function tzOffset(tz, sec) {
  const key = `${tz}|${Math.floor(sec / 3600)}`;
  let v = offCache.get(key);
  if (v != null) return v;
  let f = offFmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); offFmt.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(Math.floor(sec) * 1000)).map((x) => [x.type, x.value]));
  v = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) / 1000 - Math.floor(sec);
  if (offCache.size > 5000) offCache.clear();
  offCache.set(key, v);
  return v;
}
// Krótki opis strefy przy przełączniku: „UTC”, „Warszawa UTC+1”, „Nowy Jork UTC−4” (przesunięcie z chwili `sec`, np. wejścia w trade).
export function tzLabel(tz, sec = Date.now() / 1000) {
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  const eh = etcHours(tz);
  if (eh != null) return `UTC${eh < 0 ? '−' : '+'}${Math.abs(eh)}`; // P29: pełna godzina UTC ze znakiem jak w opisie UTC (nie odwróconym POSIX)
  const o = tzOffset(tz, sec), a = Math.abs(o), h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  const name = TZ_NAMES[tz] ? t(TZ_NAMES[tz]) : tz.split('/').pop().replace(/_/g, ' ');
  return `${name} UTC${o < 0 ? '−' : '+'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}
// Formatery czasu w strefie `tz` (pamiętane: Intl.DateTimeFormat jest drogi).
const fmtCache = new Map();
export function fmtIn(tz, loc = locale()) {
  const k = `${tz}|${loc}`;
  if (!fmtCache.has(k)) {
    const d = (o) => new Intl.DateTimeFormat(loc, { ...o, timeZone: tz });
    fmtCache.set(k, {
      HM: d({ hour: '2-digit', minute: '2-digit' }), HMS: d({ hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      DAY: d({ day: 'numeric', month: 'short' }), FULL: d({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      MONTH: d({ month: 'short' }), YEAR: d({ year: 'numeric' }),
    });
  }
  return fmtCache.get(k);
}

// P29: dwie grupy listy stref: popularne i pełne godziny UTC (wspólne dla wykresu i Ustawień).
// P32 (28.10.2026), słowa użytkownika: «utc powinno byc w poprawnej kolejnosci». Odstępstwo od P29 (dwie grupy): jedna lista rosnąco po przesunięciu UTC
// w chwili `sec` (z czasem letnim), popularne strefy wplecione w swoje miejsce; przy tym samym przesunięciu najpierw pełna godzina („UTC+1”), potem miasta.
export function sortedZones(sec = Date.now() / 1000, zones = allZones()) {
  const off = (z) => (z === 'UTC' ? 0 : etcHours(z) != null ? etcHours(z) * 3600 : tzOffset(z, sec));
  const rank = (z) => (z === 'UTC' || etcHours(z) != null ? 0 : 1);
  return zones.slice().sort((a, b) => off(a) - off(b) || rank(a) - rank(b) || tzOptionLabel(a, sec).localeCompare(tzOptionLabel(b, sec)));
}
export function tzGroupsHtml(opt, sec = Date.now() / 1000) {
  return sortedZones(sec).map((x) => opt(x, tzOptionLabel(x, sec))).join('');
}
// P26: „Auto” (skala ceny) w stylu segmentu TF; P27: strefa czasowa jako lista rozwijana (wartość '' = strefa z Ustawień).
// Lista stref powstaje raz na pasek (ok. 400 pozycji, przesunięcie liczone na chwilę `sec`, np. wejścia w trade).
export function tzSelectHtml(sec = Date.now() / 1000) {
  const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
  const base = tzBase || BROWSER_TZ;
  return `<select class="sp-in sp-sel swc-tz" data-swc="tz" aria-label="${esc(t('Strefa czasowa osi'))}" title="${esc(t('Strefa czasowa osi. Zmiana tutaj jest tymczasowa; stałą ustawisz w Ustawieniach → Ogólne.'))}">` +
    opt('', t('Z Ustawień: {tz}', { tz: tzLabel(base, sec) })) +
    tzGroupsHtml(opt, sec) + '</select>';
}
// ---- P35 (28.10.2026): kontrakt trade'a i back-adjust ----
// Słowa użytkownika: «Opcja, domyślnie wył.» (back-adjust jak B-ADJ w TradingView, zapamiętany na urządzeniu) i «Tak, pole „Kontrakt”».
// P38 (28.10.2026), słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik»: wartość domyślna pochodzi z Ustawień
// (chartBadj, domyślnie WŁĄCZONY, synchronizowana między urządzeniami); przycisk B-ADJ na wykresie przełącza widok tylko chwilowo (bez zapisu).
// Kotwicą jest kontrakt trade'a, więc ceny trade'a i rysunków są prawdziwe także przy włączonym B-ADJ (także w trybie edycji).
let badjBase = true;
export function setBadjDefault(on) { badjBase = on !== false; }
export function loadBadj() { return badjBase; }
// Ostrzeżenie pod wykresem przy włączonym B-ADJ (podgląd i edytor); adjust = pole `adjust` odpowiedzi serwera.
export const badjWarning = (adjust) => t('Back-adjust włączony: ceny pozostałych kontraktów są przeliczone do kontraktu trade\'a, więc poziomy trade\'a i rysunki pasują do świec.')
  + (adjust?.missing?.length ? ' ' + t('Bez luki (brak świec obu kontraktów): {list}.', { list: adjust.missing.join(', ') }) : '');
// Parametry zapytania o świece trade'a: czas wejścia i wyjścia (trade bez godziny: południe w Chicago dnia handlowego) i pole „Kontrakt”.
export function tradeQuery(trade) {
  if (!trade || !Number.isFinite(trade.at)) return {};
  const ref = !trade.time && trade.date ? dateRef(trade.date) : null;
  const a = ref ?? Math.floor(trade.at / 1000);
  const b = ref == null && Number.isFinite(trade.exitAt) && trade.exitAt >= trade.at ? Math.floor(trade.exitAt / 1000) : a;
  return { tfrom: a, tto: b, ...(trade.contract ? { contract: String(trade.contract).trim().toUpperCase() } : {}) };
}
const BADJ_TITLE = () => t('Back-adjust (jak B-ADJ w TradingView): ceny pozostałych kontraktów przeliczone o luki rolli do kontraktu trade\'a. Przełącza widok tylko chwilowo; stałe ustawienie jest w Ustawieniach.');
export function barToggles(sec) {
  return `<div class="seg sm" role="group" aria-label="${esc(t('Skala ceny'))}"><button type="button" data-swc="auto" aria-pressed="true" title="${esc(t('Automatyczna skala ceny. Wyłącz, żeby przesuwać wykres w pionie i skalować oś ceny (przeciąganie, kółko).'))}">${esc(t('Auto'))}</button>` +
    `<button type="button" data-swc="badj" aria-pressed="false" title="${esc(BADJ_TITLE())}">B-ADJ</button></div>` +
    tzSelectHtml(sec) +
    `<select class="sp-in sp-sel swc-contract" data-swc="contract" aria-label="${esc(t('Kontrakt'))}" title="${esc(t('Kontrakt, z którego są świece w sesjach trade\'a. Wybór zapisuje się w polu „Kontrakt”.'))}" hidden></select>`;
}
// Lista kontraktów z odpowiedzi serwera (contract: { code, auto, rule, options, shown }); pierwsza pozycja „Auto (wg daty)” czyści pole.
export function paintContract(root, c, { canSave = true } = {}) {
  const sel = root.querySelector('select[data-swc="contract"]');
  if (!sel) return;
  if (!c || !c.options?.length) { sel.hidden = true; return; }
  const opt = (v, label) => `<option value="${esc(v)}">${esc(label)}</option>`;
  sel.innerHTML = opt('', t('Auto: {c}', { c: c.rule })) + c.options.map((o) => opt(o, o)).join('');
  sel.value = c.auto ? '' : c.code;
  sel.disabled = !canSave;
  sel.hidden = false;
}
export function markToggles(root, auto, sec, prefs = null, badj = null) {
  const a = root.querySelector('[data-swc="auto"]'), z = root.querySelector('select[data-swc="tz"]');
  const bj = root.querySelector('[data-swc="badj"]');
  if (bj && badj != null) bj.setAttribute('aria-pressed', String(!!badj));
  if (prefs) markOverlays(root, prefs, sec);
  if (a) a.setAttribute('aria-pressed', String(!!auto));
  if (z) {
    z.options[0].textContent = t('Z Ustawień: {tz}', { tz: tzLabel(tzBase || BROWSER_TZ, sec) });
    if (z.value !== tzOver) z.value = tzOver;
  }
}

// ---- P27: ulubione interwały (słowa użytkownika 28.10.2026: «interwaly ktore sa na liscie i jest szybki do nich dostep powinna byc ta lista
// modyfikowana i mozna swobodnie dodawac wszystkie jakie sie tam chce jak i odejmowac plus dodaj timeframe tygodniowy i miesieczny»).
// Lista wspólna dla podglądu i trybu edycji, w localStorage (jak wybrany TF), posortowana od najkrótszego; najmniej jeden interwał.
export const TF_FAV_KEY = 'thq.chart.tfs.v1';
export const TF_FAV_MAX = 20;
const tfOrder = (tf) => parseTf(tf)?.sec ?? Infinity;
export function normFavTfs(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) { const p = parseTf(String(v).trim()); if (p && !out.includes(p.str)) out.push(p.str); }
  return out.sort((a, b) => tfOrder(a) - tfOrder(b)).slice(0, TF_FAV_MAX);
}
export function loadFavTfs() {
  try { const l = normFavTfs(JSON.parse(globalThis.localStorage?.getItem(TF_FAV_KEY) || 'null')); return l.length ? l : TFS.slice(); } catch { return TFS.slice(); }
}
export function saveFavTfs(list) { try { globalThis.localStorage?.setItem(TF_FAV_KEY, JSON.stringify(normFavTfs(list))); } catch { /* localStorage niedostępny */ } }
export const addFavTf = (list, tf) => normFavTfs([...list, tf]);
export const removeFavTf = (list, tf) => { const l = list.filter((x) => x !== tf); return l.length ? l : list.slice(); };
const PEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
// Pasek interwałów: segment ulubionych + przycisk listy (popover z usuwaniem i dodawaniem). Kliknięcie interwału obsługuje właściciel paska ([data-swc-tf]).
export function tfBarHtml() {
  return `<div class="seg sm swc-tfs" role="group" aria-label="${esc(t('Interwał'))}"></div>` +
    `<span class="swc-tfwrap"><button type="button" class="icon-btn swc-tfedit" data-swc="tfedit" aria-expanded="false" aria-label="${esc(t('Edytuj listę interwałów'))}" title="${esc(t('Edytuj listę interwałów'))}">${PEN}</button>` +
    `<div class="swc-tfpop popover" hidden></div></span>`;
}
export function mountTfBar(root, { current }) {
  const seg = root.querySelector('.swc-tfs'), pop = root.querySelector('.swc-tfpop'), btn = root.querySelector('.swc-tfedit');
  let favs = loadFavTfs();
  const paint = () => {
    const cur = current();
    seg.innerHTML = favs.map((v) => `<button type="button" data-swc-tf="${esc(v)}" aria-pressed="${v === cur}">${esc(v)}</button>`).join('');
    if (!pop.hidden) paintPop();
  };
  const paintPop = () => {
    pop.innerHTML = `<p class="lbl">${esc(t('Ulubione interwały'))}</p><div class="swc-chips">${favs.map((v) => `<span class="swc-chip">${esc(v)}<button type="button" data-swc-tfdel="${esc(v)}" aria-label="${esc(t('Usuń {tf}', { tf: v }))}"${favs.length < 2 ? ' disabled' : ''}>×</button></span>`).join('')}</div>` +
      `<form class="swc-tfadd"><input class="sp-in" type="text" maxlength="6" placeholder="2h" spellcheck="false" autocomplete="off" aria-label="${esc(t('Nowy interwał'))}"><button type="submit" class="btn sm">${esc(t('Dodaj'))}</button></form>` +
      `<p class="note">${esc(t('Liczba i jednostka: s, m, h, D, W (tydzień) albo M (miesiąc), np. 45s, 3m, 2h, 1W, 1M.'))}</p>`;
  };
  const open = (on) => { pop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) { paintPop(); pop.querySelector('input')?.focus(); } };
  btn.addEventListener('click', () => open(pop.hidden));
  pop.addEventListener('click', (ev) => {
    const d = ev.target.closest('[data-swc-tfdel]');
    if (d) { favs = removeFavTf(favs, d.dataset.swcTfdel); saveFavTfs(favs); paint(); }
  });
  pop.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const inp = pop.querySelector('input'), p = parseTf(inp.value.trim());
    if (!p) { inp.setAttribute('aria-invalid', 'true'); inp.title = t('Interwał to liczba i jednostka: s, m, h, D, W albo M, np. 45s, 3m, 2h, 1W.'); return; }
    favs = addFavTf(favs, p.str); saveFavTfs(favs); paint(); pop.querySelector('input')?.focus();
  });
  pop.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { open(false); btn.focus(); } });
  const outside = (ev) => { if (!pop.hidden && !ev.target.closest?.('.swc-tfwrap')) open(false); };
  document.addEventListener('pointerdown', outside, true);
  paint();
  return { paint, favs: () => favs.slice(), destroy: () => document.removeEventListener('pointerdown', outside, true) };
}
// ---- nakładki (etap 10): tło sesji i PDH/PDL; te same funkcje czyste (swiece.js) i te same przełączniki w podglądzie i w trybie edycji ----
// Stan w jednym miejscu: tu. Do etapu 14 w localStorage (try/catch); od P42 (28.10.2026, słowa użytkownika: «Tak, synchronizować») w settings.chart.overlays
// (synchronizacja przez Notion, biała lista w styl-wykresu.js). Gdy app.js podłączy magazyn (useOverlayBackend), klucz localStorage jest czytany tylko raz
// jako wartość początkowa (legacyOverlays w app.js). Bez magazynu (Node, testy) działa jak dotąd na localStorage.
// P32 (28.10.2026), słowa użytkownika: «dopracuj te dwie rzeczy i dodaj do nich ustawienia zeby uzytkownik mogl je dostosowac»: poza dwoma przełącznikami
// stan trzyma ustawienia sesji (włączenie, godziny w czasie NY, kolor i krycie boxa), linii high/low (pokaż, opis, styl, grubość, koniec na sweepie, ramka boxa)
// i PDH/PDL (kolor, styl, grubość). Ten sam klucz localStorage co w etapie 10 (stary zapis { sessions, pdhl } czyta się dalej). Kolor '' = token motywu.
export const OVERLAY_KEY = 'thq.chart.overlays.v1';
export const SESSION_IDS = SESSIONS.map((s) => s.id);
export const OV_OPACITIES = [0, 4, 8, 12, 16, 24, 32];
export const OV_WIDTHS = [1, 2, 3, 4];
export const OV_BOX_WIDTHS = [0, 1, 2, 3, 4]; // P32, słowa użytkownika: «rysunek kwadrata powinna miec grubosc scian 0 czyli by znikaly» (boxy sesji też)
export const OV_STYLES = ['solid', 'dashed', 'dotted'];
export const SESSION_TOKENS = { asia: '--n-blue', london: '--n-orange', ny: '--n-purple', pd: '--fg-2' };
export function overlayDefaults() {
  return {
    sessions: false, pdhl: false, ...newsDefaults(), // 1.4.0: newsy i earningsy (domyślnie wyłączone), filtry wag i klas
    sess: Object.fromEntries(SESSIONS.map((s) => [s.id, { on: true, from: s.from, to: s.to, color: '', opacity: 8 }])),
    boxWidth: 1, lines: true, labels: true, sweep: true, lineStyle: 'dashed', lineWidth: 1,
    pdColor: '', pdStyle: 'solid', pdWidth: 1,
  };
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const isHex6 = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
// Ochrona przed złymi danymi: każda wartość spoza dozwolonych wraca do domyślnej; godziny „od” = „do” (okno zerowe albo całodobowe) też.
export function normOverlays(o) {
  const d = overlayDefaults(), x = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const one = (v, list, def) => (list.includes(v) ? v : def);
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);
  const col = (v) => (isHex6(v) ? v.toLowerCase() : '');
  const out = {
    sessions: x.sessions === true, pdhl: x.pdhl === true, ...normNews(x), sess: {},
    boxWidth: one(x.boxWidth, OV_BOX_WIDTHS, d.boxWidth), lines: bool(x.lines, d.lines), labels: bool(x.labels, d.labels), sweep: bool(x.sweep, d.sweep),
    lineStyle: one(x.lineStyle, OV_STYLES, d.lineStyle), lineWidth: one(x.lineWidth, OV_WIDTHS, d.lineWidth),
    pdColor: col(x.pdColor), pdStyle: one(x.pdStyle, OV_STYLES, d.pdStyle), pdWidth: one(x.pdWidth, OV_WIDTHS, d.pdWidth),
  };
  for (const id of SESSION_IDS) {
    const s = x.sess && typeof x.sess[id] === 'object' && x.sess[id] ? x.sess[id] : {}, ds = d.sess[id];
    // security HIJ, N1: RegExp.test na obiekcie ({"toString":1}) rzuca TypeError, więc najpierw typ
    let from = typeof s.from === 'string' && HHMM.test(s.from) ? s.from : ds.from, to = typeof s.to === 'string' && HHMM.test(s.to) ? s.to : ds.to;
    if (from === to) { from = ds.from; to = ds.to; }
    out.sess[id] = { on: bool(s.on, true), from, to, color: col(s.color), opacity: one(s.opacity, OV_OPACITIES, ds.opacity) };
  }
  return out;
}
let ovBackend = null;
export function useOverlayBackend(b) { ovBackend = b && typeof b.get === 'function' && typeof b.set === 'function' ? b : null; }
const ovListeners = new Set();
export function notifyOverlays() { for (const f of [...ovListeners]) f(); } // app.js: po zmianie ustawień albo synchronizacji wykresy czytają stan od nowa
export function loadOverlays() {
  if (ovBackend) return normOverlays(ovBackend.get());
  try { return normOverlays(JSON.parse(globalThis.localStorage?.getItem(OVERLAY_KEY) || 'null')); } catch { return overlayDefaults(); }
}
export function saveOverlays(p) { if (ovBackend) { ovBackend.set(normOverlays(p)); return; } try { globalThis.localStorage?.setItem(OVERLAY_KEY, JSON.stringify(normOverlays(p))); } catch { /* localStorage niedostępny */ } }
// Definicje okien dla sessionWindows: tylko włączone sesje, godziny z ustawień.
export const sessionDefs = (p) => SESSION_IDS.filter((id) => p.sess[id].on).map((id) => ({ id, from: p.sess[id].from, to: p.sess[id].to }));
const SESSION_NAMES = { asia: 'Azja', london: 'Londyn', ny: 'Nowy Jork' };
export const NEWS_IMP_NAMES = { high: 'Czerwone', medium: 'Pomarańczowe', low: 'Żółte', holiday: 'Szare (Bank Holiday)', opex: 'OPEX' };
const SESSION_SHORT = { asia: 'Azja', london: 'Londyn', ny: 'NY' };
// Opis linii: „Azja H”, „Londyn L”, „NY H”, „PDH”, „PDL”.
export const levelLabel = (l) => (l.kind === 'pd' ? (l.side === 'hi' ? 'PDH' : 'PDL') : `${l.id === 'ny' ? 'NY' : t(SESSION_SHORT[l.id])} ${l.side === 'hi' ? 'H' : 'L'}`);
const GEAR_SM = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
export function overlayToggles() {
  return `<div class="swc-ov" role="group" aria-label="${esc(t('Nakładki wykresu'))}">` +
    `<label class="check"><input type="checkbox" data-swc-ov="sessions"><span>${esc(t('Sesje'))}</span></label>` +
    `<label class="check"><input type="checkbox" data-swc-ov="pdhl"><span>${esc(t('PDH/PDL'))}</span></label>` +
    `<label class="check swc-nw"><input type="checkbox" data-swc-ov="news"><span>${esc(t('Newsy'))}</span></label>` +
    `<label class="check swc-nw"><input type="checkbox" data-swc-ov="earnings"><span>${esc(t('Earningsy'))}</span></label>` +
    `<span class="swc-ovwrap"><button type="button" class="icon-btn swc-ovbtn" data-swc="ovset" aria-expanded="false" aria-label="${esc(t('Ustawienia nakładek'))}" title="${esc(t('Ustawienia nakładek'))}">${GEAR_SM}</button>` +
    `<div class="swc-ovpop popover" role="group" aria-label="${esc(t('Ustawienia nakładek'))}" hidden></div></span></div>`;
}
// Kolor tokenu jako #rrggbb (pole koloru przyjmuje tylko taki zapis): sonda canvas jak probe() w wykres.js.
let hexCtx = null;
export function tokenHex(el, name) {
  try {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    if (!hexCtx) { const c = document.createElement('canvas'); c.width = c.height = 1; hexCtx = c.getContext('2d', { willReadFrequently: true }); }
    hexCtx.clearRect(0, 0, 1, 1); hexCtx.fillStyle = 'transparent'; hexCtx.fillStyle = v; hexCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = hexCtx.getImageData(0, 0, 1, 1).data;
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}
// P35: popover zakotwiczony do prawej krawędzi przycisku dosuwany do ekranu (margines 8 px): położenie przycisku zależy od zawinięcia paska
// (np. przy 375 px po dodaniu B-ADJ zębatka nakładek stoi bliżej lewej krawędzi i popover wychodził poza ekran).
export function fitPop(pop) {
  pop.style.transform = '';
  const r = pop.getBoundingClientRect(), vw = document.documentElement.clientWidth, m = 8;
  const dx = r.left < m ? m - r.left : r.right > vw - m ? vw - m - r.right : 0;
  if (dx) pop.style.transform = `translateX(${Math.round(dx)}px)`;
}
// Popover ustawień nakładek (wzór: popover ulubionych interwałów). ov: model z createOverlays. Zmiana pola zapisuje się od razu i przerysowuje wykres.
export function mountOverlayPop(root, ov, { refSec = () => Date.now() / 1000 } = {}) {
  const btn = root.querySelector('.swc-ovbtn'), pop = root.querySelector('.swc-ovpop');
  if (!btn || !pop) return { destroy() {} };
  const seg = (k, cur) => `<div class="seg sm" role="group" aria-label="${esc(t('Styl linii'))}">${[['solid', '—', t('Linia ciągła')], ['dashed', '- -', t('Linia przerywana')], ['dotted', '···', t('Linia kropkowana')]]
    .map(([v, lab, title]) => `<button type="button" data-ovk="${k}" data-v="${v}" aria-pressed="${cur === v}" title="${esc(title)}" aria-label="${esc(title)}">${lab}</button>`).join('')}</div>`;
  const sel = (k, cur, list, label, fmt = (v) => String(v)) => `<select class="sp-in sp-sel" data-ovk="${k}" aria-label="${esc(label)}">${list.map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(fmt(v))}</option>`).join('')}</select>`;
  const chk = (k, on, label) => `<label class="check"><input type="checkbox" data-ovk="${k}"${on ? ' checked' : ''}> ${esc(label)}</label>`;
  const colorIn = (k, v, token, label) => `<input type="color" data-ovk="${k}" value="${esc(v || tokenHex(root, token) || '')}" aria-label="${esc(label)}" title="${esc(label)}">`;
  function paint() {
    const p = ov.prefs();
    const rows = SESSION_IDS.map((id) => {
      const s = p.sess[id], name = t(SESSION_NAMES[id]);
      return `<div class="swc-ovs">${chk(`sess.${id}.on`, s.on, name)}` +
        `<span class="swc-ovt"><input class="sp-in" type="time" data-ovk="sess.${id}.from" value="${s.from}" aria-label="${esc(t('{s}: początek', { s: name }))}"><span aria-hidden="true">–</span>` +
        `<input class="sp-in" type="time" data-ovk="sess.${id}.to" value="${s.to}" aria-label="${esc(t('{s}: koniec', { s: name }))}"></span>` +
        `<span class="swc-ovc">${colorIn(`sess.${id}.color`, s.color, SESSION_TOKENS[id], t('{s}: kolor boxa', { s: name }))}${sel(`sess.${id}.opacity`, s.opacity, OV_OPACITIES, t('{s}: krycie boxa', { s: name }), (v) => `${v}%`)}</span></div>`;
    }).join('');
    // telefon: przełączniki Newsy i Earningsy są tu, a nie w pasku (pasek wraca do jednego rzędu); na szerokim ekranie ukryte (.swc-ovnw)
    pop.innerHTML = `<div class="swc-ovnw">${chk('news', p.news, t('Newsy'))}${chk('earnings', p.earnings, t('Earningsy'))}</div><p class="lbl">${esc(t('Sesje'))}</p>${rows}<p class="note swc-ovhint">${esc(sessionHint(refSec(), p))}</p>` +
      `<p class="lbl">${esc(t('Linie high/low'))}</p>` +
      `<div class="swc-ovchk">${chk('lines', p.lines, t('Pokaż linie'))}${chk('labels', p.labels, t('Opisy'))}${chk('sweep', p.sweep, t('Kończ na sweepie'))}</div>` +
      `<div class="swc-ovr"><span class="note">${esc(t('Linia'))}</span>${seg('lineStyle', p.lineStyle)}${sel('lineWidth', p.lineWidth, OV_WIDTHS, t('Grubość linii'), (v) => `${v} px`)}</div>` +
      `<div class="swc-ovr"><span class="note">${esc(t('Ramka boxa'))}</span>${sel('boxWidth', p.boxWidth, OV_BOX_WIDTHS, t('Grubość ramki boxa'), (v) => (v ? `${v} px` : t('brak')))}</div>` +
      `<p class="lbl">PDH/PDL</p>` +
      `<div class="swc-ovr"><span class="note">${esc(t('Linia'))}</span>${colorIn('pdColor', p.pdColor, SESSION_TOKENS.pd, t('Kolor PDH/PDL'))}${seg('pdStyle', p.pdStyle)}${sel('pdWidth', p.pdWidth, OV_WIDTHS, t('Grubość PDH/PDL'), (v) => `${v} px`)}</div>` +
      `<p class="lbl">${esc(t('Newsy'))}</p>` +
      `<div class="swc-ovchk">${NEWS_IMPS.map((k) => chk(`newsImp.${k}`, p.newsImp[k], t(NEWS_IMP_NAMES[k]))).join('')}</div>` +
      `<p class="lbl">${esc(t('Earningsy'))}</p>` +
      `<div class="swc-ovchk">${EARN_CLASSES.map((k) => chk(`earnCls.${k}`, p.earnCls[k], t('Klasa {n}', { n: k }))).join('')}</div>` +
      `<button type="button" class="btn ghost sm" data-ovreset="1">${esc(t('Przywróć domyślne'))}</button>`;
  }
  // „sess.asia.from” → patch zagnieżdżony
  const setPath = (key, val) => {
    const p = ov.prefs(), path = key.split('.');
    if (path[0] === 'sess') p.sess = { ...p.sess, [path[1]]: { ...p.sess[path[1]], [path[2]]: val } };
    else if (path[0] === 'newsImp' || path[0] === 'earnCls') p[path[0]] = { ...p[path[0]], [path[1]]: val };
    else p[key] = val;
    ov.setAll(p);
  };
  const valueOf = (el) => {
    if (el.type === 'checkbox') return el.checked;
    if (el.tagName === 'SELECT') return Number(el.value);
    return el.value;
  };
  const open = (on) => { pop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) { paint(); fitPop(pop); } };
  btn.addEventListener('click', () => open(pop.hidden));
  pop.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-ovk]');
    if (!el) return;
    if (el.type === 'time' && !HHMM.test(el.value)) { el.setAttribute('aria-invalid', 'true'); return; }
    el.removeAttribute('aria-invalid');
    setPath(el.dataset.ovk, valueOf(el));
    const h = pop.querySelector('.swc-ovhint'); if (h) h.textContent = sessionHint(refSec(), ov.prefs());
  });
  pop.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.ovreset) { const p = ov.prefs(); ov.setAll({ ...overlayDefaults(), sessions: p.sessions, pdhl: p.pdhl, news: p.news, earnings: p.earnings }); paint(); return; }
    if (b.dataset.ovk && b.dataset.v) { setPath(b.dataset.ovk, b.dataset.v); b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
  });
  pop.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { open(false); btn.focus(); } });
  const outside = (ev) => { if (!pop.hidden && !ev.target.closest?.('.swc-ovwrap')) open(false); };
  document.addEventListener('pointerdown', outside, true);
  return { paint: () => { if (!pop.hidden) paint(); }, destroy: () => document.removeEventListener('pointerdown', outside, true) };
}
// P32: geometria nakładek w pikselach. sc: { x(i) dla ułamkowego indeksu świecy, y(cena) }, box: { left, right }. Ta sama funkcja liczy piksele w podglądzie SVG
// (skala podglądu) i w edytorze LWC (skala z logicalToCoordinate/priceToCoordinate), więc box i linie stoją w obu trybach w tym samym miejscu.
// Wynik: { rects: [{ id, x, y, w, h, opacity, width, color }], lines: [{ kind, id, side, x1, x2, y, dash, width, color, label, lx, ly }] }.
// color: kolor z ustawień (#rrggbb) albo '' (renderer bierze token: SESSION_TOKENS).
export function overlayGeometry(m, sc, p, box) {
  const rects = [], lines = [];
  for (const b of m.boxes || []) {
    const xa = sc.x(b.a - 0.5), xb = sc.x(b.b + 0.5), ya = sc.y(b.hi), yb = sc.y(b.lo), s = p.sess[b.id];
    rects.push({ id: b.id, x: xa, y: Math.min(ya, yb), w: xb - xa, h: Math.abs(yb - ya), opacity: (s?.opacity ?? 8) / 100, width: p.boxWidth, color: s?.color || '' });
  }
  for (const l of m.lines || []) {
    if (l.kind === 'sess' && !p.lines) continue;
    const x1 = sc.x(l.x0), x2 = sc.x(l.x1), y = sc.y(l.price);
    const pd = l.kind === 'pd';
    const out = { kind: l.kind, id: l.id, side: l.side, x1, x2, y, swept: l.swept, dash: pd ? p.pdStyle : p.lineStyle, width: pd ? p.pdWidth : p.lineWidth, color: pd ? p.pdColor : (p.sess[l.id]?.color || ''), label: '' };
    const lx = Math.max(x1, box.left) + 4;
    if (p.labels && x2 - lx > 40) Object.assign(out, { label: levelLabel(l), lx, ly: l.side === 'hi' ? y - 4 : y + 12 });
    lines.push(out);
  }
  spreadLabels(lines);
  return { rects, lines };
}
// H2 (ocena wyglądu #5, P1): dwie etykiety w tym samym miejscu (np. PDL i Londyn L przy prawie tej samej cenie) stały jedna na drugiej. Etykieta, która
// nachodzi na już postawioną (w pionie < LABEL_H i w poziomie na szerokość tekstu), przesuwa się w prawo za nią. Szerokość szacowana z liczby znaków
// (czcionka etykiet 10–11 px), bez pomiaru: wystarcza do rozsunięcia, a pojedyncze etykiety zostają tam, gdzie były.
export const LABEL_H = 12, LABEL_CH = 6.2, LABEL_GAP = 6;
export function spreadLabels(lines) {
  const placed = [];
  for (const l of lines) {
    if (!l.label) continue;
    const w = l.label.length * LABEL_CH;
    for (let guard = 0; guard < 50; guard++) {
      const hit = placed.find((p) => Math.abs(p.ly - l.ly) < LABEL_H && l.lx < p.lx + p.w + LABEL_GAP && p.lx < l.lx + w + LABEL_GAP);
      if (!hit) break;
      l.lx = hit.lx + hit.w + LABEL_GAP;
    }
    placed.push({ lx: l.lx, ly: l.ly, w });
  }
  return lines;
}
export const DASHES = { dashed: [5, 4], dotted: [1, 3] };
export const BOX_STROKE_ALPHA = 0.5; // ramka boxa sesji: kolor sesji przy 50% (wypełnienie ma krycie z ustawień)
// Opis pasów sesji w strefie osi. P26 (28.10.2026), słowa użytkownika: «nie mam pojecia jaki czas utc jest ustawiony dla dziennika, wiec powinien byc do ustawienia na wykresie
// jak i staly w ustawieniach»: godziny sesji są stałe w czasie Nowego Jorku (P8), więc dla osi w innej strefie pokazujemy je przeliczone w dymku przełącznika.
// P32: godziny w ustawieniach są w czasie Nowego Jorku (ET); dymek i popover pokazują je przeliczone na strefę osi dla dnia `refSec`.
export function sessionHint(refSec, prefs = loadOverlays()) {
  const tz = chartTz(), f = fmtIn(tz).HM;
  const defs = sessionDefs(prefs);
  const ws = sessionWindows(refSec - 86400, refSec + 86400, defs);
  const parts = defs.map((d) => {
    const w = ws.filter((x) => x.id === d.id).sort((a, b) => Math.abs(a.from - refSec) - Math.abs(b.from - refSec))[0];
    return w ? `${t(SESSION_NAMES[d.id])} ${f.format(new Date(w.from * 1000))}-${f.format(new Date(w.to * 1000))}` : '';
  }).filter(Boolean);
  return `${t('Godziny w czasie Nowego Jorku (ET). W strefie osi ({tz}):', { tz: tzLabel(tz, refSec) })} ${parts.join(', ') || '–'}`;
}
export function markOverlays(root, prefs, refSec) {
  root.querySelectorAll('[data-swc-ov]').forEach((i) => { i.checked = !!prefs[i.dataset.swcOv]; });
  const s = root.querySelector('[data-swc-ov="sessions"]')?.closest('label');
  if (s) s.title = `${t('Box zakresu sesji i linie jej high/low do pierwszego sweepu.')} ${sessionHint(refSec, prefs)}`;
  const p = root.querySelector('[data-swc-ov="pdhl"]')?.closest('label');
  if (p) p.title = t('Najwyższa i najniższa cena poprzedniej sesji CME, z lokalnych świec, do pierwszego sweepu. Po dniu bez sesji (święto) bierze ostatnią sesję, która się odbyła. Bez linii, gdy poprzednia sesja nie jest w całości pobrana.');
  const nw = root.querySelector('[data-swc-ov="news"]')?.closest('label');
  if (nw) nw.title = t('Newsy makro USD: linia i znacznik w godzinie publikacji, w kolorze najważniejszej wagi. Zdarzenia całodzienne (Bank Holiday, OPEX) jako etykieta u góry. Godziny w strefie wykresu.');
  const er = root.querySelector('[data-swc-ov="earnings"]')?.closest('label');
  if (er) er.title = t('Wyniki spółek z S&P 100: romb w chwili ogłoszenia (przed otwarciem, po zamknięciu); bez pory jako etykieta dnia.');
}
// Model nakładek jednego wykresu: przełączniki, dzienne świece do PDH/PDL (GET /api/candles?tf=1D, tylko lokalne) i zakresy indeksów do narysowania.
// onChange() woła się po wczytaniu danych dziennych (renderer przerysowuje). Wynik spans() jest pamiętany dla tej samej tablicy świec.
// extra(): parametry kontraktu i back-adjust (P35) tego samego wykresu, więc PDH/PDL liczą się z kontraktu i cen, które widać (prevIn z serwera).
export function createOverlays(instrument, onChange = () => {}, extra = () => ({})) {
  let prefs = loadOverlays(), daily = null, busy = false, alive = true, cache = null, ver = 0, nm = null;
  const reload = () => { if (!alive) return; prefs = loadOverlays(); cache = null; nm = null; onChange(); }; // P42: zmiana w Ustawieniach albo z innego urządzenia
  ovListeners.add(reload);
  const ok = /^[A-Za-z0-9]{1,12}$/.test(instrument);
  // 1.4.0: newsy i earningsy z lokalnego serwera (GET /api/news, /api/earnings), tylko gdy warstwa jest włączona; po wczytaniu wykres przerysowuje się sam
  async function ensureNews(candles) {
    const w = candleWindow(candles);
    if (!alive || !w || !(prefs.news || prefs.earnings)) return;
    const [a, b] = await Promise.all([prefs.news ? newsFeed.ensure('news', w.from, w.to) : false, prefs.earnings ? newsFeed.ensure('earn', w.from, w.to) : false]);
    if (alive && (a || b)) { nm = null; onChange(); }
  }
  async function ensure(candles) {
    ensureNews(candles);
    if (!alive || !ok || !prefs.pdhl || !candles?.length || busy) return;
    const t0 = candles[0][0], t1 = candles[candles.length - 1][0] + 1;
    const from = Math.max(Math.floor(t0 - 8 * 86400), t1 - 390 * 86400), to = Math.ceil(t1 + 86400);
    const key = JSON.stringify(extra());
    if (daily && daily.key === key && daily.from <= from && daily.to >= to) return;
    busy = true;
    try {
      const j = await fetchCandles(instrument, from, Math.max(to, from + 60), '1D', extra());
      if (!alive) return;
      daily = { key, from, to, bars: j.bars || [], missing: j.missing || [], derived: j.derived || [], availableEnd: j.availableEnd ?? null, prevIn: j.prevIn || [], gaps: j.gaps || [] };
    } catch { daily = { key, from, to, bars: [], missing: [], derived: [], availableEnd: null, prevIn: [], gaps: [] }; } finally { busy = false; }
    ver++; cache = null;
    if (alive) onChange();
  }
  return {
    prefs: () => JSON.parse(JSON.stringify(prefs)),
    set(key, on) { prefs = normOverlays({ ...prefs, [key]: !!on }); saveOverlays(prefs); cache = null; nm = null; onChange(); },
    // P32: zapis wszystkich ustawień nakładek naraz (popover)
    setAll(p) { prefs = normOverlays(p); saveOverlays(prefs); cache = null; nm = null; onChange(); },
    ensure,
    // P35: zmiana kontraktu albo back-adjust: dane dzienne wczytują się od nowa
    reset() { daily = null; cache = null; ver++; },
    // P32: { boxes: [{ id, a, b, hi, lo }], lines: [{ kind, id, side, price, x0, x1, swept }], pdN } (overlayLevels); puste, gdy nakładki wyłączone
    model(candles) {
      if (!candles?.length) return { boxes: [], lines: [], pdN: 0 };
      if (cache && cache.c === candles && cache.n === candles.length && cache.v === ver) return cache.r;
      const times = candles.map((c) => c[0]);
      const pd = prefs.pdhl && daily ? pdhlSpans(times, daily.bars, daily) : [];
      const windows = prefs.sessions ? sessionWindows(times[0], times[times.length - 1] + 1, sessionDefs(prefs)) : [];
      const r = { ...overlayLevels(candles, { windows, pd, sweep: prefs.sweep }), pdN: pd.length };
      cache = { c: candles, n: candles.length, v: ver, r };
      return r;
    },
    // 1.4.0: model newsów i earningsów dla tych świec (pamięć podręczna do zmiany danych, ustawień albo świec); { groups, eGroups, labels, on }
    news(candles) {
      const v = newsFeed.version();
      if (nm && nm.c === candles && nm.n === candles?.length && nm.v === v) return nm.r;
      const r = buildNewsModel({ news: newsFeed.events('news'), earn: newsFeed.events('earn'), prefs });
      nm = { c: candles, n: candles?.length, v, r };
      return r;
    },
    newsFailed: () => (prefs.news && newsFeed.failed('news')) || (prefs.earnings && newsFeed.failed('earn')),
    // PDH/PDL włączone, dane dzienne wczytane, a żadna sesja wśród świec nie ma linii: poprzednia sesja nie jest w całości pobrana
    pdhlGap: (candles) => prefs.pdhl && !!daily && !!candles?.length && !(cache?.r.pdN),
    destroy() { alive = false; ovListeners.delete(reload); },
  };
}

// Kadr startowy (sekundy): wejście − 2 h do wyjścia + 1 h; bez wyjścia: wejście + 2 h.
export function startFrame(entrySec, exitSec) {
  return { from: entrySec - 2 * 3600, to: exitSec != null && exitSec >= entrySec ? exitSec + 3600 : entrySec + 2 * 3600 };
}
// Świece z lokalnego magazynu (GET /api/candles); wspólne dla podglądu i trybu edycji.
// extra (P35): { tfrom, tto, contract, adjust } — kontrakt trade'a w jego sesjach i back-adjust.
export async function fetchCandles(instrument, from, to, tf, extra = {}) {
  const q = new URLSearchParams({ instrument, from: String(Math.floor(from)), to: String(Math.ceil(to)), tf });
  for (const [k, v] of Object.entries(extra || {})) if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, v === true ? '1' : String(v));
  const r = await fetch(`/api/candles?${q}`, { cache: 'no-store' });
  let j = null;
  try { j = await r.json(); } catch { /* brak treści */ }
  if (!r.ok) throw Object.assign(new Error(j?.error || t('Nie udało się wczytać świec.')), { code: j?.code });
  return j;
}
// Zapas świec wczytywany z obu stron kadru (sekundy).
// P55 (29.10.2026): TF poniżej minuty ma teraz świece w całym kadrze (z podziału 1m), więc zapas liczony w sekundach (doba) dawałby setki tysięcy świec; dla nich zapas
// to najwyżej 8000 świec z każdej strony (30s: ponad dobę, 5s: 11 godzin, 1s: 2,2 godziny), a odpowiedź serwera ma limit 50 000 świec.
export const padFor = (tf, span) => {
  const sec = tfSec(tf), pad = Math.min(150 * 86400, Math.max(span * 2, 86400, sec * 400));
  return sec < 60 ? Math.min(pad, sec * 8000) : pad;
};
// P37 (P2): podpis znacznika dziury w danych: „brak danych 12–13.06.2014”
export const gapLabel = (g) => t('brak danych {d}', { d: G.gapDates(g) });
// Przegląd 1.3.0, pkt 1 (29.10.2026): przejście na TF poniżej minuty z oddalonego widoku (np. 12 godzin z 1h na 1s) żądałoby setek tysięcy świec i kończyło się
// odmową 422. Kadr przycinany jest w czasie do MAX_VISIBLE świec nowego TF wokół środka (ta sama reguła co limitSpan z 'center') jeszcze przed żądaniem.
export function clampFrameTf(a, b, tf, max = MAX_VISIBLE) {
  const sec = tfSec(tf);
  if (sec >= 60 || !(b - a > max * sec)) return [a, b];
  const c = (a + b) / 2, h = (max * sec) / 2;
  return [c - h, c + h];
}
// Przegląd 1.3.0, pkt 8 (decyzja gustu 29.10.2026): TF poniżej minuty trzyma w pamięci najwyżej 40 000 świec (ok. 27 widoków po 1500), przy doładowaniu odrzucane są
// świece najdalsze od widoku. Przed P55 poniżej minuty prawie nie było danych, teraz każde doładowanie (do 8000 świec) rosłoby bez końca.
export const SUB_MINUTE_MAX_BARS = 40_000;
// Przycina tablicę świec do max od strony przeciwnej do kierunku doładowania (dir 'left' = historia dołożona z lewej, odcinamy prawy koniec). Nie przycina, gdy widok
// ({ from, to } w indeksach) leży w odcinanej części. Wynik: { candles, cut, side }.
export function capBars(cs, view, max, dir) {
  const over = cs.length - max;
  if (over <= 0) return { candles: cs, cut: 0, side: null };
  if (dir === 'left') return view.to + 1 >= cs.length - over ? { candles: cs, cut: 0, side: null } : { candles: cs.slice(0, cs.length - over), cut: over, side: 'right' };
  return view.from <= over ? { candles: cs, cut: 0, side: null } : { candles: cs.slice(over), cut: over, side: 'left' };
}
export const tfSec = (tf) => { const p = parseTf(tf); return p ? (p.unit === 'D' ? 86400 : p.unit === 'W' ? 604800 : p.unit === 'M' ? 2592000 : p.sec) : 60; };

function loadTf() { try { const v = localStorage.getItem(TF_KEY); return v && parseTf(v) ? v : '1m'; } catch { return '1m'; } }
function saveTf(v) { try { localStorage.setItem(TF_KEY, v); } catch { /* localStorage niedostępny */ } }

const SVGNS = 'http://www.w3.org/2000/svg';
export const DECIMAL = () => (num(1.5, 1).includes(',') ? ',' : '.');
const f1 = (v) => (Math.round(v * 10) / 10).toString();

// P27: kolor części (poziom Fibonacciego/Gann, tekst, wypełnienie) wygrywa z kolorem rysunku; grubość i styl linii, przezroczystość wypełnienia
// i rozmiar tekstu z danych rysunku. Bez danych: klasy CSS (tokeny).
// D2: jedna funkcja SVG dla podglądu, miniatur i kart Udostępnij (testy: backtest-D2).
// H2 (30.10.2026): kształty rysunków podglądu; kolory domyślne jako zmienne CSS bieżącego motywu (rysunki-kolory.js), ręczne bez zmian
export const previewShapes = (drawings, s) => G.drawingShapes((drawings || []).map((d) => themed(d, CSS_COLORS)), s);
export function drawingSvgOf(sh) {
  const col0 = sh.color ? esc(sh.color) : null;
  return sh.parts.map((p) => {
    const col = p.color ? esc(p.color) : col0;
    const dash = p.dash && p.dash !== 'solid' ? ` stroke-dasharray="${p.dash === 'dotted' ? '1 3' : '5 4'}"` : '';
    // dane rysunku w style= (atrybuty prezentacji przegrywają z regułami CSS .drw)
    const sw = Number.isFinite(p.width) ? ` style="stroke-width:${f1(p.width)}"` : '';
    if (p.t === 'line') return `<line class="${p.cls}" x1="${f1(p.x1)}" y1="${f1(p.y1)}" x2="${f1(p.x2)}" y2="${f1(p.y2)}"${col ? ` stroke="${col}"` : ''}${dash}${sw}/>`;
    if (p.t === 'rect') {
      const fc = p.fillColor ? esc(p.fillColor) : col;
      const css = [Number.isFinite(p.fillOpacity) ? `fill-opacity:${Math.round(p.fillOpacity * 1000) / 1000}` : '', Number.isFinite(p.width) ? `stroke-width:${f1(p.width)}` : ''].filter(Boolean).join(';');
      return `<rect class="${p.cls}${p.fill ? ' fill' : ''}${p.stroke === false ? ' nostroke' : ''}" x="${f1(p.x)}" y="${f1(p.y)}" width="${f1(Math.max(0, p.w))}" height="${f1(Math.max(0, p.h))}"${col && p.stroke !== false ? ` stroke="${col}"` : ''}${fc && p.fill ? ` fill="${fc}"` : ''}${css ? ` style="${css}"` : ''}${dash}/>`;
    }
    if (p.t === 'text') {
      const base = p.baseline === 'hanging' ? 'hanging' : 'middle';
      const rot = p.angle ? ` transform="rotate(${f1(p.angle)} ${f1(p.ax)} ${f1(p.ay)})"` : '';
      const fs = Number.isFinite(p.size) || p.fontWeight ? ` style="${[Number.isFinite(p.size) ? `font-size:${f1(p.size)}px` : '', p.fontWeight ? `font-weight:${p.fontWeight}` : ''].filter(Boolean).join(';')}"` : '';
      return `<text class="${p.cls}" x="${f1(p.x)}" y="${f1(p.y)}" text-anchor="${p.anchor}"${p.anchor === 'end' && p.baseline !== 'hanging' ? ' dx="-4"' : ''} dominant-baseline="${base}"${col ? ` fill="${col}"` : ''}${fs}${rot}>${esc(p.text)}</text>`;
    }
    if (p.t === 'path') {
      // D2: dymek calloutu: obrys w kolorze ramki, wypełnienie tłem z krytem (jak rect.fill)
      const fc = p.fillColor ? esc(p.fillColor) : col;
      const css = [Number.isFinite(p.fillOpacity) ? `fill-opacity:${Math.round(p.fillOpacity * 1000) / 1000}` : '', Number.isFinite(p.width) ? `stroke-width:${f1(p.width)}` : ''].filter(Boolean).join(';');
      return `<path class="${p.cls}${p.fill ? ' fill' : ''}" d="${p.d}"${col ? ` stroke="${col}"` : ''}${fc && p.fill ? ` fill="${fc}"` : ''}${css ? ` style="${css}"` : ''} stroke-linejoin="round"/>`;
    }
    if (p.t === 'circle') return `<circle class="${p.cls}" cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r)}"/>`; // P28: kropka wyjścia pozycji (jak levelsSvg)
    return '';
  }).join('');
}

// Świece jako dwie ścieżki na kierunek (mało elementów DOM przy 1 500 świecach); wspólne dla podglądu i miniatury.
// P55 (29.10.2026), «Lekko przygaszone»: świece z podziału 1m (c.synth) idą do osobnych ścieżek z klasą .synth (krycie w CSS), prawdziwe wyglądają jak dotąd.
export function candlePaths(cs) {
  const path = { up: ['', ''], down: ['', ''], 'up synth': ['', ''], 'down synth': ['', ''] };
  for (const c of cs) {
    const k = (c.up ? 'up' : 'down') + (c.synth ? ' synth' : '');
    path[k][0] += `M${f1(c.x)},${f1(c.wick.y1)}V${f1(c.wick.y2)}`;
    path[k][1] += `M${f1(c.body.x)},${f1(c.body.y)}h${f1(c.body.w)}v${f1(c.body.h)}h${f1(-c.body.w)}Z`;
  }
  return Object.keys(path).filter((k) => path[k][0]).map((k) => `<path class="wick ${k}" d="${path[k][0]}"/><path class="candle ${k}" d="${path[k][1]}"/>`).join('');
}

// Etap 15: linia zamknięć jako jedna ścieżka (klasa .close-line: bez wypełnienia, kolor --chart-line); wspólne dla podglądu i miniatury.
export function linePath(pts) {
  if (!pts.length) return '';
  return `<path class="close-line" d="${pts.map((p, k) => `${k ? 'L' : 'M'}${f1(p.x)},${f1(p.y)}`).join('')}"/>`;
}
// Seria ceny w wybranym stylu (Ustawienia → Wykresy): świece (domyślnie, P18) albo linia zamknięć. cfg = settings.chart.
export function seriesSvg(bars, s, offset = 0, cfg = chartSettings()) {
  return cfg.style === 'line' ? linePath(G.lineShapes(closePoints(bars), s, offset)) : candlePaths(G.candleShapes(bars, s, {}, offset));
}

// Poziomy z pól trade'a: prostokąty zysku/straty od wejścia do wyjścia, linie SL/TP/BE, wejście i wyjście jako kreska + kropka (P19: 'text').
// P26 (28.10.2026), słowa użytkownika: «usun napisy wejsie, wyjscie, po kropkach i pasku widac miejsca te»: bez podpisu „Wejście/Wyjście cena”.
// P26: «dodaj punkt BE, widoczny na pozycji» (pole „BE”, migracja 004): linia w kolorze --be na szerokości pozycji + cena na osi.
export function levelsSvg(trade, s, iEntry, iExit, xRight, W, { mini = false, cfg = chartSettings() } = {}) {
  const mode = G.markerStyle('theme');
  const { entryPrice: ep, exitPrice: xp, sl, tp, be } = trade;
  const x1 = s.x(iEntry), x2 = iExit != null ? s.x(iExit) : xRight;
  const xa = f1(Math.min(x1, x2)), w = f1(Math.max(1, Math.abs(x2 - x1)));
  let back = '', front = '', labels = '';
  const rect = (pA, pB, cls) => { const ya = s.y(pA), yb = s.y(pB); return `<rect class="${cls}" x="${xa}" y="${f1(Math.min(ya, yb))}" width="${w}" height="${f1(Math.max(1, Math.abs(yb - ya)))}"/>`; };
  if (Number.isFinite(ep)) {
    if (Number.isFinite(tp) && cfg.tp) back += rect(ep, tp, 'pos-profit');
    if (Number.isFinite(sl) && cfg.sl) back += rect(ep, sl, 'pos-loss');
    if (!Number.isFinite(tp) && !Number.isFinite(sl) && Number.isFinite(xp)) back += rect(ep, xp, (trade.r ?? trade.pnl ?? (xp - ep)) >= 0 ? 'pos-profit' : 'pos-loss');
  }
  const hline = (p, cls) => {
    const y = f1(s.y(p));
    front += `<line class="lvl ${cls}" x1="${xa}" x2="${f1(Math.max(x1, x2))}" y1="${y}" y2="${y}"/>`;
    labels += `<text class="lvl-l ${cls}" x="${W - 4}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(num(p, 2))}</text>`;
  };
  if (Number.isFinite(sl) && cfg.sl) hline(sl, 'sl');
  if (Number.isFinite(tp) && cfg.tp) hline(tp, 'tp');
  if (Number.isFinite(be)) hline(be, 'be');
  const mark = (i, p, cls) => {
    const x = f1(s.x(i));
    front += `<line class="lvl-t ${cls}" x1="${x}" x2="${x}" y1="${s.top}" y2="${s.bottom}"/>`;
    if (!Number.isFinite(p)) return;
    const y = s.y(p);
    if (mode === 'text') front += `${mini ? '' : `<line class="lvl-k ${cls}" x1="${x}" x2="${x}" y1="${f1(y - 7)}" y2="${f1(y + 7)}"/>`}<circle class="lvl-d ${cls}" cx="${x}" cy="${f1(y)}" r="${mini ? 2.25 : 3.5}"/>`;
  };
  if (cfg.entry) mark(iEntry, ep, 'entry');
  if (iExit != null && cfg.exit) mark(iExit, xp, 'exit');
  if (cfg.entry && cfg.exit && Number.isFinite(ep) && Number.isFinite(xp) && iExit != null) front += `<line class="lvl path" x1="${f1(x1)}" y1="${f1(s.y(ep))}" x2="${f1(x2)}" y2="${f1(s.y(xp))}"/>`;
  return { back, front, labels };
}

// trade: { at (ms), exitAt (ms|null), instrument, entryPrice, exitPrice, sl, tp, r, pnl }
// opcje: drawings (JSON paczki), meta() → { hasDatabentoKey }, openSettings(), onState(state)
// frame: { from, to } w sekundach i tf: kadr oraz interwał, od którego zaczyna podgląd po powrocie z trybu edycji (bez skoku kadru)
// onEdit(): przycisk „Edytuj wykres” (tryb edycji w wykres.js); setDrawings(lista) podmienia rysunki po wczytaniu z Notion
// onContract(code) (P35): zapis pola „Kontrakt” z listy na wykresie (pusty kod = Auto); zwraca Promise, błąd zostawia poprzedni wybór. Bez niej lista jest tylko do odczytu.
export function createPodglad(root, { trade, drawings: drawings0 = [], meta = () => ({}), openSettings = null, onState = null, onEdit = null, frame = null, tf = null, onContract = null, badj: badj0 = null } = {}) {
  let drawings = drawings0;
  const entry = Math.floor(trade.at / 1000);
  const exit = trade.exitAt != null ? Math.floor(trade.exitAt / 1000) : null;
  const instrument = String(trade.instrument || '').trim();
  const S = {
    tf: tf && parseTf(tf) ? parseTf(tf).str : loadTf(), candles: [], rolls: [], gaps: [], availableEnd: null, fromIndex: 0, toIndex: 0, loadedFrom: 0, loadedTo: 0,
    status: 'loading', message: '', layer: '1m', busy: false, seq: 0, inflight: null, loadedBadj: false, edgeBusy: false, extendable: { left: true, right: true },
    autoY: loadAutoScale(), yr: null, // P26: skala ceny automatyczna albo ręczny zakres { min, max }
    badj: badj0 == null ? loadBadj() : !!badj0, contract: null, adjust: null, missing: [], // P35: back-adjust, kontrakt trade'a z serwera, brakujące świece kadru
  };
  const extra = () => ({ ...tradeQuery(trade), ...(S.badj ? { adjust: 1 } : {}) });
  let alive = true, raf = 0, ro = null;
  const ac = new AbortController(); // W1 (przegląd 28.10.2026): listenery na trwałym root (.lb-chart) znikają razem z podglądem, nie z elementem
  const uid = Math.random().toString(36).slice(2, 8);

  root.classList.add('swc');
  root.innerHTML = `<div class="swc-bar">
      ${tfBarHtml()}
      <label class="swc-own"><span class="note">${esc(t('Własny'))}</span><input class="sp-in" type="text" inputmode="text" maxlength="6" placeholder="3m" aria-label="${esc(t('Własny interwał, np. 3m, 45s, 2h'))}" spellcheck="false" autocomplete="off"></label>
      ${barToggles(entry)}
      ${overlayToggles()}
      <button type="button" class="btn sm swc-edit" data-swc="edit" hidden>${esc(t('Edytuj wykres'))}</button>
    </div>
    <div class="swc-plot chart" tabindex="0" role="img" aria-label="${esc(t('Wykres świecowy trade\'a'))}"></div>
    <div class="swc-state" hidden></div>
    <p class="swc-warn" hidden></p>
    <div class="swc-foot note"><span class="swc-avail"></span><span class="swc-skip"></span><span class="swc-ov-note"></span><span class="swc-k-note"></span><span>${esc(t('Wykres:'))} <a href="${ATTRIB_URL}" target="_blank" rel="noopener">TradingView Lightweight Charts™</a></span></div>`;
  const plot = root.querySelector('.swc-plot');
  const stateEl = root.querySelector('.swc-state');
  const ownIn = root.querySelector('.swc-own input');
  const tip = ensureTip(plot);
  const ov = createOverlays(instrument, () => { markTf(); schedule(); }, extra);
  const nwl = mountNewsLayer(plot, { fmt: () => F() }); // 1.4.0: przyciski i dymek nad znacznikami newsów i earningsów
  const tfBar = mountTfBar(root, { current: () => S.tf });
  const ovPop = mountOverlayPop(root, ov, { refSec: () => entry }); // P32: ustawienia sesji i PDH/PDL
  // P32 (28.10.2026): ręczny zakres ceny przekazany z trybu edycji (ten sam widok po „Gotowe”), tylko przy wyłączonym „Auto”
  if (!S.autoY && frame?.yr && frame.yr.max > frame.yr.min) S.yr = { min: frame.yr.min, max: frame.yr.max };

  const emit = () => onState?.({ tf: S.tf, fromIndex: S.fromIndex, toIndex: S.toIndex });
  function markTf() {
    tfBar.paint();
    if (!tfBar.favs().includes(S.tf)) ownIn.value = S.tf;
    markToggles(root, S.autoY, entry, ov.prefs(), S.badj);
  }
  // P35: ostrzeżenie back-adjust (wyraźne, nad stopką) i notka o kontrakcie trade'a bez świec (z przyciskiem pobrania po wycenie)
  function paintNotes() {
    const w = root.querySelector('.swc-warn');
    w.textContent = S.badj ? badjWarning(S.adjust) : '';
    w.hidden = !S.badj;
    const k = root.querySelector('.swc-k-note');
    const tw = tradeQuery(trade);
    const gap = S.missing.some(([a, b]) => b > tw.tfrom - 1800 && a < (tw.tto ?? tw.tfrom) + 1800);
    k.innerHTML = '';
    if (S.contract && !S.contract.shown) k.textContent = t('Kontrakt {c} nie był notowany w części sesji trade\'a: tam świece {r}.', { c: S.contract.code, r: S.contract.rule });
    else if (gap && S.status === 'ok' && meta().hasDatabentoKey) k.innerHTML = `${esc(t('Brak części świec w czasie trade\'a.'))} <button type="button" class="link" data-swc="quote">${esc(t('Sprawdź koszt'))}</button>`;
    paintContract(root, S.contract, { canSave: !!onContract });
  }

  // ---- dane ----
  const getCandles = (from, to, tf) => fetchCandles(instrument, from, to, tf, extra());
  const takeMeta = (j) => { S.contract = j.contract || null; S.adjust = j.adjust || null; S.missing = j.missing || []; paintNotes(); };

  // Wczytuje świece TF `tf` dla kadru [fromT, toT] (z zapasem) i ustawia indeksy kadru po czasie.
  // P35-poprawki W1 (przegląd 28.10.2026): każde ładowanie ma numer; odpowiedź starsza niż ostatnie żądanie jest odrzucana, więc spóźniona odpowiedź B-ADJ
  // nie nadpisze świec cenami przesuniętymi. S.loadedBadj mówi, czy świece w S.candles przyszły z back-adjust.
  function loadFrame(fromT, toT, tf, keep = 'left') { const p = loadFrameRun(fromT, toT, tf, keep); S.inflight = p; return p; }
  async function loadFrameRun(fromT, toT, tf, keep = 'left') {
    if (!/^[A-Za-z0-9]{1,12}$/.test(instrument)) return setState('nosource');
    const my = ++S.seq, adj = S.badj;
    S.busy = true;
    const pad = padFor(tf, toT - fromT);
    const now = Math.floor(Date.now() / 1000);
    const lf = Math.floor(fromT - pad), lt = Math.min(now, Math.ceil(toT + pad));
    try {
      const j = await getCandles(lf, Math.max(lt, lf + 60), tf);
      if (!alive || my !== S.seq) return; // spóźniona odpowiedź: nowsze żądanie ma pierwszeństwo
      if (j.noSource) return setState('nosource');
      S.loadedBadj = adj;
      S.layer = j.layer || '1m';
      S.mixed = Array.isArray(j.synth); // P55: odpowiedź z podziałem 1m (TF poniżej minuty): pusto znaczy brak świec 1m, nie „1s tylko wokół trade'ów”
      S.availableEnd = j.availableEnd ?? S.availableEnd;
      S.candles = j.bars || [];
      S.rolls = j.rolls || [];
      S.gaps = j.gaps || [];
      takeMeta(j);
      S.loadedFrom = lf; S.loadedTo = lt;
      S.extendable = { left: true, right: lt < now };
      if (!S.candles.length) {
        if (j.unavailable) return setState('unavailable', j.retryAfter);
        return setState('empty');
      }
      const step = tfSec(tf);
      let a = G.timeToIndexF(S.candles, fromT, step), b = G.timeToIndexF(S.candles, toT, step);
      if (b - a < MIN_SPAN) { const c = (a + b) / 2; a = c - MIN_SPAN / 2; b = c + MIN_SPAN / 2; }
      ({ fromIndex: S.fromIndex, toIndex: S.toIndex } = limitSpan(a, b, MAX_VISIBLE, keep)); // P26: zamiast podnoszenia TF
      setState('ok');
    } catch (e) {
      if (!alive || my !== S.seq) return;
      setState('error', e.message);
    } finally { if (my === S.seq) S.busy = false; }
  }

  // Dociąganie przy krawędzi kadru: wcześniejsze albo późniejsze świece tego samego TF (lokalnie, bez sieci zewnętrznej).
  async function extend(dir) {
    if (S.edgeBusy || S.busy || !S.extendable[dir]) return;
    S.edgeBusy = true;
    const tf = S.tf, pad = padFor(tf, (S.toIndex - S.fromIndex) * tfSec(tf));
    const now = Math.floor(Date.now() / 1000);
    const [f, to] = dir === 'left' ? [S.loadedFrom - pad, S.loadedFrom] : [S.loadedTo, Math.min(now, S.loadedTo + pad)];
    try {
      if (to - f < 60) { S.extendable[dir] = false; return; }
      const j = await getCandles(f, to, tf);
      if (!alive || tf !== S.tf) return;
      const bars = (j.bars || []).filter((b) => (dir === 'left' ? b[0] < S.candles[0][0] : b[0] > S.candles[S.candles.length - 1][0]));
      if (dir === 'left') {
        S.loadedFrom = f;
        if (!bars.length && f < 1275782400) S.extendable.left = false;
        S.candles = bars.concat(S.candles); S.fromIndex += bars.length; S.toIndex += bars.length;
        const cp = tfSec(tf) < 60 ? capBars(S.candles, { from: S.fromIndex, to: S.toIndex }, SUB_MINUTE_MAX_BARS, 'left') : null;
        if (cp?.cut) { S.candles = cp.candles; S.loadedTo = S.candles[S.candles.length - 1][0] + tfSec(tf); S.extendable.right = true; }
      } else {
        S.loadedTo = to;
        if (to >= now) S.extendable.right = false;
        S.candles = S.candles.concat(bars);
        const cp = tfSec(tf) < 60 ? capBars(S.candles, { from: S.fromIndex, to: S.toIndex }, SUB_MINUTE_MAX_BARS, 'right') : null;
        if (cp?.cut) { S.candles = cp.candles; S.fromIndex -= cp.cut; S.toIndex -= cp.cut; S.loadedFrom = S.candles[0][0]; S.extendable.left = true; }
      }
      S.rolls = mergeRolls(S.rolls, j.rolls || []);
      S.gaps = mergeGaps(S.gaps, j.gaps || []);
      schedule();
    } catch { S.extendable[dir] = false; } finally { S.edgeBusy = false; }
  }
  const mergeRolls = (a, b) => [...new Map([...a, ...b].map((r) => [r.t, r])).values()];
  const mergeGaps = (a, b) => [...new Map([...a, ...b].map((g) => [g.t, g])).values()];

  // ---- stany bez wykresu ----
  function setState(kind, extra) {
    S.status = kind;
    const ok = kind === 'ok';
    plot.hidden = !ok;
    stateEl.hidden = ok;
    root.querySelector('.swc-bar').hidden = kind === 'nosource'; // bez źródła danych przełącznik TF nic nie zmienia
    root.querySelector('.swc-avail').textContent = S.availableEnd ? t('Świece dostępne do: {d}', { d: fmtFull(S.availableEnd) }) : '';
    root.querySelector('.swc-edit').hidden = !ok || !onEdit;
    if (ok) { schedule(); emit(); return; }
    tip.hidden = true;
    const box = (title, body = '', actions = '') => `<div class="empty mini"><h3>${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ''}${actions}</div>`;
    if (kind === 'loading') stateEl.innerHTML = box(t('Wczytuję świece…'));
    else if (kind === 'nosource') stateEl.innerHTML = box(t('Brak źródła danych dla tego instrumentu'), t('Wykres świecowy jest dostępny dla futures ES i NQ (także MES i MNQ).'));
    else if (kind === 'unavailable') stateEl.innerHTML = box(t('Świece z tej sesji będą dostępne ok. {d}', { d: fmtFull(extra) }), t('Databento udostępnia świece z opóźnieniem.'));
    else if (kind === 'error') stateEl.innerHTML = box(t('Nie udało się wczytać świec.'), String(extra || ''));
    else if (kind === 'empty') {
      const root1s = S.layer === '1s' && !S.mixed;
      const sym = instrument.toUpperCase().replace(/^M(ES|NQ)$/, '$1');
      const title = t('Brak świec {sym} dla {d}', { sym, d: fmtDay(entry) });
      if (root1s) stateEl.innerHTML = box(title, t('Świece poniżej minuty są pobierane tylko wokół trade\'ów. Wybierz 1m albo większy interwał.'));
      else if (meta().hasDatabentoKey) stateEl.innerHTML = box(title, t('Świece pobierasz z Databento po sprawdzeniu kosztu.'), `<button type="button" class="btn primary" data-swc="quote">${esc(t('Sprawdź koszt'))}</button><div class="swc-progress" hidden><div class="swc-progress-bar"></div></div>`);
      else stateEl.innerHTML = box(title, t('Do pobrania świec potrzebny jest klucz Databento.'), openSettings ? `<button type="button" class="btn" data-swc="settings">${esc(t('Otwórz Ustawienia'))}</button>` : '');
    }
  }

  // ---- pobranie z Databento: tylko po kliknięciu i potwierdzeniu kwoty ----
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-THQ': '1' }, body: JSON.stringify(body) });
    let j = null;
    try { j = await r.json(); } catch { /* brak treści */ }
    if (!r.ok) throw new Error(j?.error || t('Nie udało się połączyć z serwerem.'));
    return j;
  }
  async function quoteAndFetch(btn) {
    const ex = exit ?? entry;
    const body = { instrument, from: entry - 12 * 3600, to: Math.min(Math.floor(Date.now() / 1000), ex + 12 * 3600), layer: '1m', ...tradeQuery(trade) }; // P35: plan dokłada świece kontraktu trade'a
    btn.disabled = true;
    try {
      const q = await post('/api/candles/quote', body);
      if (q.noSource) return setState('nosource');
      if (q.unavailable) return setState('unavailable', q.retryAfter);
      if (q.nothing) return loadFrame(...frameNow(), S.tf);
      if (q.overLimit || q.overCredit) { toast(t('Koszt {cost} USD przekracza limit albo pozostały kredyt. Nic nie pobrano.', { cost: q.costUsd.toFixed(4) }), { error: true }); return; }
      const lb = root.closest('.lb');
      const ok = await confirmDialog({ title: t('Pobrać świece?'), text: t('Koszt pobrania świec 1m: {cost} USD (limit jednego pobrania {limit} USD).', { cost: q.costUsd.toFixed(4), limit: num(q.limitUsd, 2) }), ok: t('Pobierz') });
      if (lb && !lb.hidden) document.documentElement.classList.add('lb-lock'); // okno potwierdzenia zdejmuje blokadę przewijania lightboxa
      if (!ok || !alive) return;
      await post('/api/candles/fetch', { ...body, confirmedCostUsd: q.costUsd });
      await poll();
    } catch (e) {
      toast(e.message, { error: true });
    } finally { if (btn.isConnected) btn.disabled = false; }
  }
  async function poll() {
    const bar = stateEl.querySelector('.swc-progress');
    if (bar) bar.hidden = false;
    for (;;) {
      await new Promise((r) => setTimeout(r, 800));
      if (!alive) return;
      let s;
      try { s = await (await fetch('/api/candles/status', { cache: 'no-store' })).json(); } catch { continue; }
      const fill = stateEl.querySelector('.swc-progress-bar');
      if (fill) fill.style.width = `${s.total ? Math.round((100 * s.done) / s.total) : 10}%`;
      if (!s.running) {
        if (s.error) { toast(s.error.message || t('Pobieranie przerwane.'), { error: true }); return; }
        clearMiniCache(); // nowe świece: miniatury na liście liczą się od nowa
        return loadFrame(...frameNow(), S.tf);
      }
    }
  }
  const frameNow = () => {
    if (S.status === 'ok' && S.candles.length) return [G.indexToTimeF(S.candles, S.fromIndex, tfSec(S.tf)), G.indexToTimeF(S.candles, S.toIndex, tfSec(S.tf))];
    const f = startFrame(entry, exit);
    return [f.from, f.to];
  };

  // ---- P35: back-adjust i kontrakt ----
  function reload() { ov.reset(); return loadFrame(...frameNow(), S.tf); }
  function setBadj(on) {
    if (S.busy) return;
    S.badj = !!on; // P38: chwilowo, bez zapisu (stała wartość w Ustawieniach)
    S.yr = null; // ceny przesunięte: ręczny zakres ceny z innego poziomu nie pasuje
    markTf(); paintNotes(); reload();
  }
  // Czeka na zakończenie ładowania i gwarantuje, że świece w S.candles zgadzają się ze stanem B-ADJ (S.loadedBadj === S.badj). P38: edytor pracuje przy włączonym
  // B-ADJ tak samo jak podgląd (kotwica = kontrakt trade'a), więc nic nie wyłączamy. Spóźniona odpowiedź z innym B-ADJ przegrywa numerem żądania (S.seq, W1).
  // Zwraca true, gdy podgląd jest gotowy do edycji.
  async function settle() {
    for (let n = 0; n < 6 && alive; n++) {
      if (S.busy) { await S.inflight; continue; }
      if (S.status !== 'ok') return false;
      if (S.loadedBadj === S.badj) return true;
      await reload(); // świece z innym B-ADJ niż stan przełącznika
    }
    return false;
  }
  async function pickContract(sel) {
    if (!onContract) return;
    const code = sel.value, prev = trade.contract || '';
    if (code === prev) return;
    sel.disabled = true;
    try {
      await onContract(code);
      trade = { ...trade, contract: code };
      S.yr = null;
      await reload();
    } catch (e) {
      toast(e.message || t('Nie udało się zapisać kontraktu.'), { error: true });
      sel.value = prev;
    } finally { if (sel.isConnected) sel.disabled = false; }
  }

  // ---- TF ----
  function setTf(tf) {
    const p = parseTf(tf);
    if (!p || S.busy) return false;
    const [a0, b0] = frameNow();
    S.tf = p.str; saveTf(S.tf);
    // P26 (28.10.2026): wyświetlany jest zawsze wybrany TF (bez automatycznego podnoszenia)
    markTf();
    // P55, decyzja gustu (29.10.2026, przegląd 1.3.0): gdy kadr z poprzedniego TF nie mieści się w limicie świec nowego (np. 10 godzin z 1h na 15s), zostaje jego środek,
    // a nie lewa krawędź (dawniej kadr uciekał o kilka godzin wstecz od trade'a); przycięcie następuje przed żądaniem (clampFrameTf), więc serwer nie odmawia
    const [a, b] = clampFrameTf(a0, b0, S.tf);
    loadFrame(a, b, S.tf, 'center');
    return true;
  }

  // ---- rysowanie ----
  function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (alive && S.status === 'ok') draw(); }); }
  const F = () => fmtIn(chartTz()); // P26: strefa z Ustawień albo przełącznika na wykresie
  function fmtFull(sec) { return F().FULL.format(new Date(sec * 1000)); }
  function fmtDay(sec) { return F().DAY.format(new Date(sec * 1000)); }
  const priceDec = (step) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

  function draw() {
    const W = Math.max(240, plot.clientWidth || 600);
    const H = Math.max(180, plot.clientHeight || 320);
    const narrow = W < 520;
    const ml = 4, mr = narrow ? 52 : 64, mt = 10, mb = 24;
    const pw = W - ml - mr, ph = H - mt - mb;
    const n = S.candles.length;
    const span = Math.max(MIN_SPAN, S.toIndex - S.fromIndex);
    const xs = G.indexScale({ lastIndex: S.toIndex, right: ml + pw, spacing: pw / span });
    // skala ceny: świece w kadrze, poziomy trade'a gdy jego czas jest w kadrze
    const a0 = Math.max(0, Math.floor(S.fromIndex)), b0 = Math.min(n - 1, Math.ceil(S.toIndex));
    let lo = Infinity, hi = -Infinity;
    for (let i = a0; i <= b0; i++) { const c = S.candles[i]; if (c[3] < lo) lo = c[3]; if (c[2] > hi) hi = c[2]; }
    const step = tfSec(S.tf);
    const iEntry = G.timeToIndex(S.candles, entry, step), iExit = exit != null ? G.timeToIndex(S.candles, exit, step) : null;
    const tradeIn = (iEntry != null && iEntry <= S.toIndex && (iExit ?? iEntry) >= S.fromIndex);
    if (tradeIn) for (const v of [trade.entryPrice, trade.exitPrice, trade.sl, trade.tp, trade.be]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    // P26: przy wyłączonym „Auto” zakres ceny jest ręczny (bez marginesów: to dokładnie to, co widać)
    // P32 (28.10.2026), słowa użytkownika: «tryb auto nawet jak jest wylaczony po wejsciu na wykres to jest on wlaczony i trzeba go przeklikac dwa razy»:
    // wyłączone „Auto” bez ręcznego zakresu (świeże otwarcie, następny trade) zaczyna od zakresu, który dałaby skala automatyczna, i od razu trzyma go ręcznie.
    S.yr = startRange(S.autoY, S.yr, lo, hi);
    const ys = !S.autoY ? G.priceScale({ min: S.yr.min, max: S.yr.max, top: mt, height: ph, margins: { top: 0, bottom: 0 } })
      : G.priceScale({ min: lo, max: hi, top: mt, height: ph, margins: { top: 0.08, bottom: 0.08 } });
    const s = G.chartScales({ candles: S.candles, xs, ys, box: { left: ml, right: ml + pw, top: mt, bottom: mt + ph }, pip: 0.25, step, decimal: DECIMAL(), measure: G.canvasMeasure });

    // siatka i oś ceny (po prawej, jak w terminalach)
    // etykiety SL/TP stoją na osi ceny: podziałka zbyt blisko nich znika
    const lvY = tradeIn ? [trade.sl, trade.tp, trade.be].filter(Number.isFinite).map(ys.y) : [];
    const ticks = niceTicks(ys.price(mt + ph), ys.price(mt), H < 300 ? 4 : 6).filter((v) => { const y = ys.y(v); return y >= mt - 0.5 && y <= mt + ph + 0.5 && lvY.every((q) => Math.abs(q - y) >= 12); });
    const dec = priceDec(ticks.length > 1 ? ticks[1] - ticks[0] : 1);
    const cfg = chartSettings(); // Ustawienia → Wykresy: styl, siatka i poziomy trade'a
    const grid = ticks.map((v) => { const y = f1(ys.y(v)); return `${cfg.grid ? `<line class="grid" x1="${ml}" x2="${ml + pw}" y1="${y}" y2="${y}"/>` : ''}<text class="axis" x="${W - 4}" y="${y}" text-anchor="end" dominant-baseline="middle">${esc(num(v, dec))}</text>`; }).join('');

    // świece: kadr + ekran zapasu; jedna ścieżka na kierunek (mało elementów DOM przy 1 500 świecach)
    const vr = visibleRange(n, S.fromIndex, S.toIndex, 1);
    const candlesSvg = vr ? seriesSvg(S.candles.slice(vr.start, vr.end + 1), s, vr.start, cfg) : '';

    // nakładki (P32): box sesji pod świecami, linie high/low i PDH/PDL nad nimi; ten sam model (swiece.overlayLevels) i ta sama geometria (overlayGeometry) co w edycji
    const og = overlayGeometry(ov.model(S.candles), s, ov.prefs(), { left: ml, right: ml + pw });
    const sessSvg = og.rects.filter((r) => r.x + r.w >= ml && r.x <= ml + pw).map((r) => {
      const c = r.color ? esc(r.color) : `var(${SESSION_TOKENS[r.id]})`;
      return `<rect class="sess ${r.id}" x="${f1(r.x)}" y="${f1(r.y)}" width="${f1(Math.max(0, r.w))}" height="${f1(Math.max(1, r.h))}" style="fill:${c};fill-opacity:${r.opacity};stroke:${c};stroke-opacity:${BOX_STROKE_ALPHA};stroke-width:${r.width}"/>`;
    }).join('');
    const pdSvg = og.lines.filter((l) => l.x2 >= ml && l.x1 <= ml + pw).map((l) => {
      const c = l.color ? esc(l.color) : `var(${SESSION_TOKENS[l.kind === 'pd' ? 'pd' : l.id]})`;
      const da = DASHES[l.dash] ? ` stroke-dasharray="${DASHES[l.dash].join(' ')}"` : '';
      return `<line class="ovl ${l.kind === 'pd' ? 'pdhl' : 'sessl'} ${l.side}" x1="${f1(l.x1)}" x2="${f1(l.x2)}" y1="${f1(l.y)}" y2="${f1(l.y)}" style="stroke:${c};stroke-width:${l.width}"${da}/>` +
        (l.label ? `<text class="ovl-l" x="${f1(l.lx)}" y="${f1(l.ly)}" style="fill:${c}">${esc(l.label)}</text>` : '');
    }).join('');
    // newsy i earningsy (1.4.0): linie pod świecami, znaczniki i etykiety dni nad nimi; ta sama logika (newsy.js) co w edycji
    const nmod = ov.news(S.candles);
    const ng = nmod.on ? newsGeometry(nmod, timeToX(S.candles, step, s), { left: ml, right: ml + pw, top: mt, bottom: mt + ph }) : null;
    const nsvg = ng ? newsSvg(ng) : { under: '', over: '' };
    root.querySelector('.swc-ov-note').textContent = [ov.pdhlGap(S.candles) ? t('PDH/PDL: do linii potrzebne są pobrane świece całej poprzedniej sesji.') : '', ov.newsFailed() ? t('Newsy: nie udało się wczytać danych.') : ''].filter(Boolean).join(' ');

    // oś czasu w strefie wykresu (z Ustawień albo wybranej na wykresie, P26)
    const xl = timeLabels(s, vr, W, ml, pw, H);

    // znacznik zmiany kontraktu
    // P35: napisy blisko siebie (np. sesja trade'a z innym kontraktem tuż przed rollem) schodzą piętro niżej zamiast nachodzić na siebie
    // P37 (P2): do znaczników rolla dochodzą znaczniki dziur w danych („brak danych 12–13.06.2014”), w tym samym układzie pięter
    const marks = [
      ...S.rolls.map((r) => ({ i: G.rollIndex(S.candles, r.t, step, step), label: r.label || t('Zmiana kontraktu'), cls: 'roll' })), // P37: pierwsza świeca nowego kontraktu (>= chwila rolla)
      ...S.gaps.map((g) => ({ i: G.gapIndex(S.candles, g), label: gapLabel(g), cls: 'gap' })),
    ].filter((m) => m.i != null).sort((a, b) => a.i - b.i);
    let lastX = -Infinity, lastW = 0, row = 0;
    const rolls = marks.map((m) => {
      const i = m.i;
      if (i < S.fromIndex - 1 || i > S.toIndex + 1) return '';
      const xv = s.x(i), x = f1(xv), label = m.label;
      row = xv - lastX < lastW ? (row + 1) % 3 : 0;
      lastX = xv; lastW = label.length * 6 + 10;
      return `<line class="${m.cls}" x1="${x}" x2="${x}" y1="${mt}" y2="${mt + ph}"/><text class="${m.cls}-l" x="${x}" y="${mt + 10 + row * 13}" dx="4">${esc(label)}</text>`;
    }).join('');

    // poziomy i pozycja trade'a
    const lv = tradeIn ? levels(s, iEntry, iExit, ml + pw, W) : '';
    // rysunki z JSON (bez edycji)
    const dr = previewShapes(drawings, s);
    root.querySelector('.swc-skip').textContent = dr.skipped ? t.p('{n} rysunek widoczny tylko w trybie edycji', dr.skipped) : '';
    const drw = dr.items.map(drawingSvgOf).join('');

    const cid = `pvc-${uid}`;
    plot.querySelector('svg')?.remove();
    plot.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <defs><clipPath id="${cid}"><rect x="${ml}" y="${mt}" width="${pw}" height="${ph}"/></clipPath></defs>
      ${grid}${xl}
      <g clip-path="url(#${cid})">${sessSvg}${nsvg.under}${lv.back || ''}${rolls}${candlesSvg}${pdSvg}${nsvg.over}<g class="drw">${drw}</g>${lv.front || ''}</g>
      ${lv.labels || ''}
      <g class="cross" hidden><line class="cross-v" y1="${mt}" y2="${mt + ph}"/></g>
    </svg>`);
    S.geo = { s, ys, ml, mr, mt, mb, pw, ph, W, H };
    nwl.update(ng, nmod, `${chartTz()}|${newsFeed.version()}|${nmod.groups.length}|${nmod.eGroups.length}|${nmod.labels.length}`);
    if (S.fromIndex < 30) extend('left');
    if (S.toIndex > n - 30) extend('right');
    ov.ensure(S.candles);
  }

  function timeLabels(s, vr, W, ml, pw, H) {
    if (!vr) return '';
    const shown = tfSec(S.tf);
    const steps = [15, 30, 60, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400, 604800, 2592000];
    const step = steps.find((v) => v >= shown && (v / shown) * s.spacing >= 70) ?? 2592000;
    const tz = chartTz(), fm = F();
    const off = (sec) => tzOffset(tz, sec);
    let prevKey = null, prevDay = null, lastX = -1e9, out = '';
    for (let i = vr.start; i <= vr.end; i++) {
      const tt = S.candles[i][0];
      // dzień i przedział liczone z przesunięcia strefy (Intl.format na każdą świecę jest za wolne przy 1 500 świecach)
      const loc = tt + off(tt), day = Math.floor(loc / 86400);
      const key = step > 86400 ? Math.floor(loc / step) : step === 86400 ? day : Math.floor(loc / step);
      if (key !== prevKey && prevKey !== null) {
        const x = s.x(i);
        if (x >= ml + 18 && x <= ml + pw - 18 && x - lastX >= 64) {
          const newDay = day !== prevDay;
          const txt = step >= 86400 || newDay ? fm.DAY.format(new Date(tt * 1000)) : (step < 60 ? fm.HMS : fm.HM).format(new Date(tt * 1000));
          out += `<text class="axis${newDay && step < 86400 ? ' day' : ''}" x="${f1(x)}" y="${H - 8}" text-anchor="middle">${esc(txt)}</text>`;
          lastX = x;
        }
      }
      prevKey = key; prevDay = day;
    }
    return out;
  }

  const levels = (...args) => levelsSvg(trade, ...args, { cfg: chartSettings() });

  // ---- dymek OHLC ----
  function showTip(px) {
    const g = S.geo;
    if (!g) return;
    const xs = curXs();
    const i = Math.round(xs.index(px));
    const c = S.candles[i];
    const cross = plot.querySelector('.cross');
    if (!c || px < g.ml || px > g.ml + g.pw) { if (cross) cross.hidden = true; tip.hidden = true; return; }
    const x = xs.x(i);
    cross.hidden = false;
    const v = cross.querySelector('.cross-v'); v.setAttribute('x1', x); v.setAttribute('x2', x);
    const fmt = tfSec(S.tf) < 60 ? F().HMS : F().HM;
    const d = new Date(c[0] * 1000);
    const cl = c[4] >= c[1] ? 'pos' : 'neg';
    tip.innerHTML = `<b>${esc(fmtDay(c[0]))} ${esc(fmt.format(d))}</b> <span class="t-muted">${esc(S.tf)}</span><br>` +
      `<span class="t-muted">O</span> ${esc(num(c[1], 2))} <span class="t-muted">H</span> ${esc(num(c[2], 2))}<br>` +
      `<span class="t-muted">L</span> ${esc(num(c[3], 2))} <span class="t-muted">C</span> <b class="${cl}">${esc(num(c[4], 2))}</b>` +
      (c[5] != null ? `<br><span class="t-muted">${esc(t('Wolumen'))}</span> ${esc(num(c[5], 0))}` : '') +
      (c[6] === 1 ? `<br><span class="t-muted">${esc(t('z 1m'))}</span>` : ''); // P55: świeca z podziału 1m, nie prawdziwa 1s
    placeTip(plot, tip, x, g.s.y(c[2]));
  }

  // ---- przesuwanie i przybliżanie ----
  const pointers = new Map();
  let drag = null, pinch = null;
  const localX = (ev) => ev.clientX - plot.getBoundingClientRect().left;
  const localY = (ev) => ev.clientY - plot.getBoundingClientRect().top;
  // skala X dla bieżącego kadru (zdarzenia między klatkami rysowania widzą już nowe indeksy)
  const curXs = () => { const g = S.geo; return G.indexScale({ lastIndex: S.toIndex, right: g.ml + g.pw, spacing: g.pw / Math.max(MIN_SPAN, S.toIndex - S.fromIndex) }); };
  function clampView() {
    const n = S.candles.length, span = S.toIndex - S.fromIndex;
    const maxTo = n - 1 + span * 0.5, minFrom = -span * 0.5;
    if (S.toIndex > maxTo) { S.fromIndex -= S.toIndex - maxTo; S.toIndex = maxTo; }
    if (S.fromIndex < minFrom) { S.toIndex += minFrom - S.fromIndex; S.fromIndex = minFrom; }
  }
  function zoomAt(px, factor) {
    const g = S.geo;
    if (!g) return;
    const a = curXs().index(px);
    let f = S.fromIndex, to = S.toIndex;
    const span = (to - f) * factor;
    if (span < MIN_SPAN) factor = MIN_SPAN / (to - f);
    if (span > MAX_VISIBLE) factor = Math.max(1, MAX_VISIBLE / (to - f)); // P26: limit oddalenia zamiast zmiany TF
    f = a - (a - f) * factor; to = a + (to - a) * factor;
    S.fromIndex = f; S.toIndex = to;
    clampView(); schedule(); emit();
  }
  function pan(dxPx, dyPx = 0) {
    const g = S.geo;
    if (!g) return;
    const d = dxPx / curXs().spacing;
    S.fromIndex -= d; S.toIndex -= d;
    if (dyPx && !S.autoY && S.yr) S.yr = panPrice(S.yr, dyPx, g.ph);
    clampView(); schedule(); emit();
  }
  // P26: skala ceny. Wyłączenie „Auto” zaczyna od zakresu, który był właśnie na ekranie (bez skoku).
  function setAuto(on) {
    S.autoY = !!on;
    if (!on && S.geo) S.yr = { min: S.geo.ys.price(S.geo.mt + S.geo.ph), max: S.geo.ys.price(S.geo.mt) };
    saveAutoScale(S.autoY);
    markTf(); schedule();
  }
  function zoomY(py, factor) {
    const g = S.geo;
    if (!g) return;
    if (S.autoY) setAuto(false);
    S.yr = zoomPrice(S.yr, g.ys.price(py), factor);
    schedule();
  }
  const onAxis = (px) => !!S.geo && px > S.geo.ml + S.geo.pw;
  // P26: na osi ceny (pas z cenami po prawej) przeciąganie w pionie i kółko skalują cenę, dwa palce skalują w pionie; to wyłącza „Auto”
  // (jak w trybie edycji LWC), dwuklik na osi włącza je z powrotem. Przy wyłączonym „Auto” przeciąganie wykresu przesuwa go też w pionie.
  plot.addEventListener('pointerdown', (ev) => {
    if (S.status !== 'ok') return;
    try { plot.setPointerCapture(ev.pointerId); } catch { /* wskaźnik już zwolniony */ }
    const x = localX(ev), y = localY(ev);
    pointers.set(ev.pointerId, { x, y });
    if (pointers.size === 1) drag = { x, y, moved: false, axis: onAxis(x) };
    else if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinch = onAxis(p.x) && onAxis(q.x) ? { axis: true, d: Math.abs(p.y - q.y) || 1 } : { axis: false, d: Math.abs(p.x - q.x) || 1 };
      drag = null;
    }
    if (ev.pointerType !== 'mouse' && !onAxis(x)) showTip(x);
  });
  plot.addEventListener('pointermove', (ev) => {
    if (S.status !== 'ok') return;
    const x = localX(ev), y = localY(ev);
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x, y });
    if (pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      if (pinch.axis) { const d = Math.abs(p.y - q.y) || 1; zoomY((p.y + q.y) / 2, pinch.d / d); pinch.d = d; return; }
      const d = Math.abs(p.x - q.x) || 1;
      zoomAt((p.x + q.x) / 2, pinch.d / d); pinch.d = d;
      return;
    }
    if (drag) {
      const dx = x - drag.x, dy = y - drag.y;
      if (drag.axis) {
        if (Math.abs(dy) > 2 || drag.moved) { drag.moved = true; plot.classList.add('dragging'); tip.hidden = true; zoomY(S.geo.mt + S.geo.ph / 2, Math.exp(dy * 0.005)); drag.y = y; }
        return;
      }
      const vert = !S.autoY && Math.abs(dy) > 2;
      if (Math.abs(dx) > 2 || vert || drag.moved) { drag.moved = true; plot.classList.add('dragging'); tip.hidden = true; pan(dx, S.autoY ? 0 : dy); drag.x = x; drag.y = y; return; }
    }
    plot.classList.toggle('on-axis', onAxis(x));
    if (onAxis(x)) { tip.hidden = true; return; }
    showTip(x);
  });
  const up = (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) { drag = null; plot.classList.remove('dragging'); }
  };
  plot.addEventListener('pointerup', up);
  plot.addEventListener('pointercancel', up);
  plot.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { tip.hidden = true; const c = plot.querySelector('.cross'); if (c) c.hidden = true; } });
  plot.addEventListener('dblclick', (ev) => { if (S.status === 'ok' && onAxis(localX(ev)) && !S.autoY) setAuto(true); });
  plot.addEventListener('wheel', (ev) => {
    if (S.status !== 'ok') return;
    ev.preventDefault();
    if (onAxis(localX(ev))) { zoomY(localY(ev), Math.exp(Math.max(-1, Math.min(1, ev.deltaY * 0.0015)))); return; }
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { pan(-ev.deltaX); return; }
    zoomAt(localX(ev), Math.exp(Math.max(-1, Math.min(1, ev.deltaY * 0.0015))));
  }, { passive: false });
  // klawiatura na wykresie: strzałki przesuwają, + i − przybliżają (nie przełączają trade'a w lightboxie)
  plot.addEventListener('keydown', (ev) => {
    if (S.status !== 'ok' || !S.geo) return;
    const g = S.geo;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); pan((ev.key === 'ArrowLeft' ? 1 : -1) * g.pw * 0.15); }
    else if (ev.key === '+' || ev.key === '=' || ev.key === '-') { ev.preventDefault(); ev.stopPropagation(); zoomAt(g.ml + g.pw / 2, ev.key === '-' ? 1.25 : 0.8); }
    else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && !S.autoY) { ev.preventDefault(); ev.stopPropagation(); pan(0, (ev.key === 'ArrowUp' ? 1 : -1) * g.ph * 0.1); }
  });

  // ---- przyciski ----
  root.addEventListener('click', (ev) => {
    if (!alive) return; // po destroy() ten sam element przejmuje tryb edycji (wykres.js)
    const b = ev.target.closest('[data-swc-tf]');
    if (b) { setTf(b.dataset.swcTf); return; }
    const a = ev.target.closest('[data-swc]');
    if (!a) return;
    if (a.dataset.swc === 'quote') quoteAndFetch(a);
    else if (a.dataset.swc === 'settings') openSettings?.();
    else if (a.dataset.swc === 'edit') {
      // P38: edycja pracuje przy włączonym B-ADJ tak jak podgląd (kotwica = kontrakt trade'a: zapisywane ceny są prawdziwe)
      settle().then((ok) => { if (alive && ok) onEdit?.(); });
    }
    else if (a.dataset.swc === 'auto') setAuto(!S.autoY);
    else if (a.dataset.swc === 'badj') setBadj(!S.badj);
  }, { signal: ac.signal });
  root.addEventListener('change', (ev) => {
    if (alive && ev.target.matches?.('select[data-swc="contract"]')) { pickContract(ev.target); return; }
    if (alive && ev.target.matches?.('select[data-swc="tz"]')) { setChartTzOverride(ev.target.value); markTf(); if (S.status === 'ok') setState('ok'); return; }
    const i = alive && ev.target.closest?.('[data-swc-ov]');
    if (i) { ov.set(i.dataset.swcOv, i.checked); ov.ensure(S.candles); }
  }, { signal: ac.signal });
  const applyOwn = () => {
    const v = ownIn.value.trim();
    if (!v) { ownIn.removeAttribute('aria-invalid'); return; }
    const ok = !!parseTf(v);
    ownIn.toggleAttribute('aria-invalid', !ok);
    ownIn.title = ok ? '' : t('Interwał to liczba i jednostka: s, m, h, D, W albo M, np. 45s, 3m, 2h, 1W.');
    if (ok && v !== S.tf) setTf(v);
  };
  ownIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); applyOwn(); } ev.stopPropagation(); });
  ownIn.addEventListener('change', applyOwn);

  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => schedule()); ro.observe(plot); }

  markTf();
  setState('loading');
  const f0 = frame && Number.isFinite(frame.from) && frame.to > frame.from ? frame : startFrame(entry, exit);
  const ready = loadFrame(f0.from, f0.to, S.tf);

  return {
    ready,
    state: () => ({ tf: S.tf, fromIndex: S.fromIndex, toIndex: S.toIndex, autoY: S.autoY, yr: S.yr ? { ...S.yr } : null }),
    rolls: () => S.rolls,
    gaps: () => S.gaps,
    badj: () => S.badj,
    adjust: () => S.adjust,
    setDrawings(list) { drawings = Array.isArray(list) ? list : []; schedule(); },
    candles: () => S.candles,
    status: () => S.status,
    settle,
    redraw: () => { markTf(); schedule(); },
    destroy() { alive = false; ac.abort(); ov.destroy(); nwl.destroy(); tfBar.destroy(); ovPop.destroy(); if (raf) cancelAnimationFrame(raf); ro?.disconnect(); root.innerHTML = ''; root.classList.remove('swc'); },
  };
}

// ---- miniatury (etap 11, pakiet F) ----
// Ten sam wygląd co podgląd (te same klasy CSS i funkcje levelsSvg/candlePaths), ale w małym polu: świece i poziomy z pól trade'a (wejście, wyjście, SL, TP, BE),
// bez osi, napisów, kontrolek, dymka i bez rysunków (P13: rysunki są tylko w szczegółach trade'a, bo Notion przyjmuje ok. 3 żądań na sekundę).
// Dane wyłącznie z lokalnego magazynu: GET /api/candles z interwałem z miniPlan. Miniatura nigdy nie wyzwala pobrania ani wyceny, nie czyta rysunków i nie zapisuje
// świec poza pamięcią strony. Brak świec, instrument spoza mapy albo trade po availableEnd: dotychczasowa miniatura zrzutu, a gdy jej brak, kreska.
// P29 (28.10.2026), słowa użytkownika: «niech miniatury pokazuja tylko szerokosc wykresu taka jaka byla dlugosc trade oraz deliaktnie rozszczweszyc o 2-3
// swieczki w lewo i prawo, idealnym przykladem co wedlug mnie okej wyglada jest trade 26 paź 14:50 ES break even (test D) i jego minaitura».
// Odstępstwo od etapu 11 (kadr −15%/+15%, minimum 20 minut, tf=auto do 80 świec): kadr = świece trade'a + 3 z każdej strony; interwał najmniejszy z listy,
// przy którym sam trade ma najwyżej 16 świec (wzór: 13 minut na 1m = 14 świec + 6). Trade bez wyjścia: 1m, 3 świece przed wejściem i 12 po nim (decyzja gustu).
export const MINI_TFS = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1D'];
export const MINI_TRADE_BARS = 16;
export const MINI_PAD = 3;
export const MINI_OPEN_BARS = 12;
// P31 (28.10.2026), słowa użytkownika: «dla miniatur poprawka, jest taka ze jak trade jest krotki to powinno byc mniej swiec z boku, rysunek pozycji na wykresie
// powinien zawsze zajmowac okolo 80-90% niezaleznie od jego szerokosci». Kadr rysowany: pozycja (wejście → wyjście) zajmuje MINI_POS szerokości miniatury, resztę dzielą
// równo dwa marginesy liczone proporcjonalnie do długości trade'a (ułamek świecy przy krótkim trade'zie), a nie stałe 3 świece z P29. miniPlan zostaje zakresem POBRANIA
// (3 świece zapasu z każdej strony wystarczają na margines do 1,5 świecy przy trade'ach do 16 świec); miniSvg wybiera z nich widoczne. Trade bez wyjścia: kadr jak dotąd.
// Trade w jednej świecy (szerokość pozycji 0) liczy się jako 1 świeca, bo 85% z zera nie istnieje.
export const MINI_POS = 0.85;
export function miniWindow(i0, i1) {
  const wp = Math.max(i1 - i0, 1), pad = wp * (1 / MINI_POS - 1) / 2;
  return { wp, pad, from: i0 - pad, to: i1 + pad };
}
export function miniPlan(entrySec, exitSec) {
  const open = exitSec == null || !(exitSec >= entrySec);
  let tf = open ? '1m' : MINI_TFS[MINI_TFS.length - 1];
  if (!open) for (const x of MINI_TFS) { const s = tfSec(x); if (Math.floor(exitSec / s) - Math.floor(entrySec / s) + 1 <= MINI_TRADE_BARS) { tf = x; break; } }
  const s = tfSec(tf), a = Math.floor(entrySec / s) * s, b = open ? a + MINI_OPEN_BARS * s : Math.floor(exitSec / s) * s;
  return { tf, from: a - MINI_PAD * s, to: b + (MINI_PAD + 1) * s };
}
// Odczyt → miniatura (wykres) albo powrót do zrzutu.
export const miniOutcome = (resp) => (resp && !resp.noSource && Array.isArray(resp.bars) && resp.bars.length ? 'chart' : 'fallback');
export const miniEligible = (tr) => tr?.at != null && /^M?(ES|NQ)$/i.test(String(tr.instrument || '').trim());
let miniId = 0;
// SVG miniatury albo null (brak świec, trade poza pobranym zakresem).
// cfg: settings.chart (domyślnie bieżące); full: wszystkie podane świece bez dopasowania kadru do pozycji (podgląd w Ustawieniach → Wykresy).
export function miniSvg(trade, { tf, bars }, { w = 96, h = 30, cfg = chartSettings(), full = false } = {}) {
  const n0 = bars?.length;
  if (!n0) return null;
  const step = tfSec(tf), entry = Math.floor(trade.at / 1000), exit = trade.exitAt != null ? Math.floor(trade.exitAt / 1000) : null;
  if (entry > bars[n0 - 1][0] + step || (exit ?? entry) < bars[0][0]) return null;
  const ml = 1, mr = 1, mt = 2, mb = 2, pw = w - ml - mr, ph = h - mt - mb;
  // P31: z pobranych świec zostają widoczne (z zapasem na ułamek) te z kadru, w którym pozycja ma MINI_POS szerokości
  let fit = null;
  if (!full && exit != null && exit >= entry) {
    const win = miniWindow(G.timeToIndex(bars, entry, step), G.timeToIndex(bars, exit, step));
    bars = bars.slice(Math.max(0, Math.floor(win.from) - 1), Math.min(n0 - 1, Math.ceil(win.to) + 1) + 1);
    fit = win;
  }
  const n = bars.length;
  const iExit0 = fit ? G.timeToIndex(bars, exit, step) : null, slack = fit ? (fit.wp - (iExit0 - G.timeToIndex(bars, entry, step))) / 2 : 0; // slack: trade w jednej świecy jest liczony jako 1, pozycja stoi pośrodku
  const xs = fit ? G.indexScale({ lastIndex: iExit0 + fit.pad + slack, right: ml + pw, spacing: pw / (fit.wp + 2 * fit.pad) }) : G.indexScale({ lastIndex: n - 0.5, right: ml + pw, spacing: pw / n });
  const iEntry = G.timeToIndex(bars, entry, step), iExit = exit != null ? G.timeToIndex(bars, exit, step) : null;
  let lo = Infinity, hi = -Infinity;
  for (const c of bars) { if (c[3] < lo) lo = c[3]; if (c[2] > hi) hi = c[2]; }
  for (const v of [trade.entryPrice, trade.exitPrice, trade.sl, trade.tp, trade.be]) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const ys = G.priceScale({ min: lo, max: hi, top: mt, height: ph, margins: { top: 0.06, bottom: 0.06 } });
  const s = G.chartScales({ candles: bars, xs, ys, box: { left: ml, right: ml + pw, top: mt, bottom: mt + ph }, pip: 0.25, step, decimal: DECIMAL(), measure: G.canvasMeasure });
  const lv = levelsSvg(trade, s, iEntry, iExit, ml + pw, w, { mini: true, cfg });
  const cid = `swm-${++miniId}`;
  return `<svg class="swc-mini-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false"><defs><clipPath id="${cid}"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath></defs>` +
    `<g clip-path="url(#${cid})">${lv.back}${seriesSvg(bars, s, 0, cfg)}${lv.front}</g></svg>`;
}
// Kolejka ładowania: najwyżej `limit` żądań naraz, cache po kluczu (także w trakcie lotu), błąd nie zostaje w cache, pozycja z `skip()` (zniknęła z ekranu) bez żądania.
// W5 (przegląd 28.10.2026): ten sam klucz zamawia po ponownym renderze nowy element, więc czekające żądanie pomijamy dopiero, gdy WSZYSTKIE zamawiające je elementy zniknęły;
// wcześniej nowy element dostawał null od starego i zostawał pusty.
export function createMiniQueue({ load, limit = 4 }) {
  const cache = new Map(), done = new Map(), waiting = [], queued = new Map();
  let running = 0;
  function pump() {
    while (running < limit && waiting.length) {
      const job = waiting.shift();
      queued.delete(job.key);
      if (job.skips.every((s) => s())) { if (cache.get(job.key) === job.p) cache.delete(job.key); job.resolve(null); continue; }
      running++;
      load(job.key, job.arg).then((v) => { done.set(job.key, v); job.resolve(v); }, job.reject).finally(() => { running--; pump(); });
    }
  }
  return {
    get(key, { skip, arg } = {}) {
      const have = cache.get(key);
      if (have) { queued.get(key)?.skips.push(skip || (() => false)); return have; }
      let resolve, reject;
      const p = new Promise((a, b) => { resolve = a; reject = b; });
      cache.set(key, p);
      p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
      const job = { key, skips: [skip || (() => false)], arg, resolve, reject, p };
      queued.set(key, job);
      waiting.push(job);
      pump();
      return p;
    },
    peek: (key) => done.get(key),
    clear() { cache.clear(); done.clear(); },
  };
}
let miniVer = 0;
const miniQueue = createMiniQueue({
  limit: 4,
  load: async (_key, a) => {
    const q = new URLSearchParams({ instrument: a.instrument, from: String(a.from), to: String(a.to), tf: a.tf });
    const r = await fetch(`/api/candles?${q}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
});
// Po pobraniu świec miniatury liczą się od nowa.
export function clearMiniCache() { miniVer++; miniQueue.clear(); }
let miniIO = null;
// Opis miniatury (dymek i etykieta): czas wejścia i wyjścia w strefie z Ustawień (P26, 28.10.2026: miniatura nie ma osi, więc strefa jest w opisie) oraz informacja, gdzie są rysunki (R14).
function miniTitle(tr) {
  const f = fmtIn(chartTz()), a = Math.floor(tr.at / 1000), b = tr.exitAt != null ? Math.floor(tr.exitAt / 1000) : null;
  const when = `${f.DAY.format(new Date(a * 1000))} ${f.HM.format(new Date(a * 1000))}${b != null ? `-${f.HM.format(new Date(b * 1000))}` : ''} (${tzLabel(chartTz(), a)})`;
  return `${when}. ${t('Rysunki w szczegółach trade\'a')}`;
}
// Podpina leniwe ładowanie miniatur do elementów [data-mini="<id>"] w `root`: IntersectionObserver z marginesem 200 px, kolejka po 4, cache w pamięci.
// getTrade(id) → trade (pola z listy), fallback(trade) → HTML zamiast wykresu (zrzut albo kreska). Zwraca funkcję odpinającą.
export function observeMinis(root, getTrade, { fallback = () => '' } = {}) {
  miniIO?.disconnect();
  const show = (el, tr, resp) => {
    if (!el.isConnected) return;
    // P46 (29.10.2026), słowa użytkownika: «w ustawieniach powinna byc opcja osobno ustawienia stylu wykresu dla miniatur»: miniatury listy rysują styl miniStyle
    const cfg = chartSettings();
    const svg = miniOutcome(resp) === 'chart' ? miniSvg(tr, resp, { w: el.clientWidth || 96, h: el.clientHeight || 30, cfg: { ...cfg, style: cfg.miniStyle || cfg.style } }) : null;
    el.innerHTML = svg || fallback(tr);
    el.classList.toggle('is-chart', !!svg);
    el.classList.add('is-ready');
    if (svg) { const ti = miniTitle(tr); el.title = ti; el.setAttribute('role', 'img'); el.setAttribute('aria-label', ti); }
  };
  const start = (el) => {
    const tr = getTrade(el.dataset.mini);
    if (!tr) return;
    const entry = Math.floor(tr.at / 1000), fr = miniPlan(entry, tr.exitAt != null ? Math.floor(tr.exitAt / 1000) : null);
    const instrument = String(tr.instrument).trim().toUpperCase();
    const key = `${el.dataset.mini}|${instrument}|${fr.tf}|${fr.from}|${fr.to}|${miniVer}`;
    const have = miniQueue.peek(key);
    if (have) { show(el, tr, have); return; }
    miniQueue.get(key, { skip: () => !el.isConnected, arg: { instrument, from: fr.from, to: fr.to, tf: fr.tf } }).then((resp) => { if (resp) show(el, tr, resp); }, () => show(el, tr, null));
  };
  const els = [...root.querySelectorAll('[data-mini]:not(.is-ready)')];
  if (typeof IntersectionObserver === 'undefined') { els.forEach(start); return () => {}; }
  miniIO = new IntersectionObserver((list, obs) => {
    for (const e of list) if (e.isIntersecting) { obs.unobserve(e.target); start(e.target); }
  }, { rootMargin: '200px' });
  els.forEach((el) => miniIO.observe(el));
  return () => miniIO?.disconnect();
}
// ---- koniec miniatur ----
