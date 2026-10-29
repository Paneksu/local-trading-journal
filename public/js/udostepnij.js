// Okno „Udostępnij”: wybór rodzaju karty (trade, dzień, tydzień, miesiąc, rok), okresu, jednostki, formatu, koloru liczby i tła,
// podgląd na canvasie (ten sam, w pełnej rozdzielczości, skalowany CSS-em) oraz akcje Pobierz PNG / Kopiuj / Udostępnij.
// Dane kart: udostepnij-dane.js, rysowanie: udostepnij-render.js. Wzór okna: confirmDialog w modal.js.
// Zapamiętywane: format, jednostka, kolor liczby i nick w ustawieniach synchronizowanych między urządzeniami (prefs, patrz sanitizeShare);
// tło (motyw / zdjęcie) i samo zdjęcie tylko w localStorage tego urządzenia (zdjęcie jest duże i prywatne, nie trafia do Notion).
// Pakiet J (etap 18, P16): segment „Obraz | Film”. Film to ta sama karta animowana w renderCard({ …, at }) i nagrana w film.js (MP4, WebM jako zapas),
// BEZ DŹWIĘKU (P21, słowa użytkownika «bez muzyki narazie»). Tło filmu: motyw, zdjęcie albo film z dysku; film tła żyje tylko w tym oknie
// (URL.createObjectURL, zwalniany przy zamknięciu), nigdy nie jest wysyłany ani zapisywany. Wartości początkowe opcji filmu z Ustawień → Wykresy
// (settings.chart: filmFormat, filmSeconds, filmBw, filmDim); zmiana w oknie jest chwilowa, jakość 1080p/720p tylko w oknie (decyzje gustu pakietu J).
// English: the share window (cards as PNG: download, copy, native share; animated cards as silent MP4/WebM videos).
import { esc, addDays, parseKey, pad, daysInMonth, todayKey, longDate, monthTitle } from './format.js';
import { t } from './i18n.js';
import { overlay, trapTab, toast } from './modal.js';
import { tradeCard, dayCard, weekCard, monthCard, yearCard, weekStart, liveOnly, availableMetrics, METRICS } from './udostepnij-dane.js';
import { renderCard, readTokens, ensureFonts, FORMATS, fileName, range, cardModel, ROW_LABELS } from './udostepnij-render.js';
import { chartSettings, FILM_FORMATS, FILM_SECONDS, FILM_DIMS, SHARE_STYLES, SHARE_DRAWS, TRADE_ROWS, PERIOD_ROWS, CARD_ROWS_MAX, setChartSettings, TRADE_ROWS_TOP, PERIOD_ROWS_TOP, visibleRows } from './styl-wykresu.js';
import { parseTf, aggregate } from './swiece.js';
import { miniEligible, tradeQuery, loadBadj } from './podglad.js';
import { supportedMime, filterSupported, filmSize, bitrate, record, loadVideo, releaseVideo, QUALITIES } from './film.js';

// ---------- wykres ceny w karcie trade'a (etap 17, pakiet I) ----------
// P15 (27.10.2026), słowa użytkownika (AskUserQuestion): «Nasz wykres w kartach na moje ryzyko»; o mailach do CME/Databento: «nie pytamy».
// Wariant C: pełny wykres (świece albo linia, oś cen i czasu) w kartach, bez progu wieku. CHART_IN_SHARE włącza funkcję w kodzie; użytkownik
// wyłącza ją w Ustawieniach → Wykresy → „Wykres ceny w kartach” (settings.chart.shareChart). Odpowiedzialność za licencję danych: README i sekcja Licencje.
export const CHART_IN_SHARE = true;
// ---- kadr i interwał wykresu karty (v2, P43: «jak jest rozplaszczony to nic nie widac») ----
// Kadr: pozycja (wejście → wyjście) zajmuje ok. 55% szerokości wykresu (CARD_POS), 60% reszty przed wejściem, 40% po wyjściu (decyzja gustu v2: widać,
// skąd cena przyszła i co zrobiła po wyjściu). Minimalny kadr zależy od danych: świece 1s (okna NQ 9:30-11:00 NY i okna wokół trade'ów) od 150 s,
// świece 1m od 45 minut. Trade bez wyjścia: 15 minut przed wejściem i 45 po nim (1s: 2 i 6 minut).
// Interwał pobrania: najmniejszy z CARD_TFS, przy którym kadr ma najwyżej CARD_POINTS świec (gęsta linia ceny jak na inspiracjach); świece karty łączą się
// w przeglądarce do najwyżej CARD_CANDLES (cardBars), więc zmiana wyglądu w oknie nie wysyła nowego żądania.
// Krótki trade (do CARD_1S_MAX_SEC) najpierw próbuje świec 1s; gdy magazyn nie ma całego kadru w 1s (missing albo mało świec), drugie żądanie w 1m.
export const CARD_POS = 0.55;
// Seria 2022-2026 (29.10.2026, decyzja gustu): kadr 1s od 150 s zamiast 4 min, bo trade 45-60 s zajmował tylko 20-25% szerokości wykresu.
export const CARD_MIN_SPAN = { '1s': 150, '1m': 45 * 60 };
export const CARD_1S_MAX_SEC = 30 * 60;
export const CARD_POINTS = 320;
export const CARD_CANDLES = 72;
export const CARD_TFS = ['1s', '2s', '5s', '10s', '15s', '30s', '1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h'];
const tfSecOf = (tf) => parseTf(tf).sec;
export function cardFrame(atMs, exitMs, res = '1m') {
  const a = Math.floor(atMs / 1000), b = exitMs != null && exitMs >= atMs ? Math.floor(exitMs / 1000) : null;
  if (b == null) return res === '1s' ? { from: a - 120, to: a + 360 } : { from: a - 15 * 60, to: a + 45 * 60 };
  const dur = b - a, span = Math.max(dur / CARD_POS, CARD_MIN_SPAN[res] || CARD_MIN_SPAN['1m']);
  const pre = Math.round((span - dur) * 0.6), post = Math.round(span - dur - pre);
  return { from: a - pre, to: b + post };
}
// Najmniejszy interwał (nie mniejszy niż rozdzielczość danych), przy którym kadr ma najwyżej `max` świec.
export function cardTf(spanSec, res, max = CARD_POINTS) {
  const min = res === '1s' ? 1 : 60;
  return CARD_TFS.find((tf) => tfSecOf(tf) >= min && spanSec / tfSecOf(tf) <= max) || CARD_TFS[CARD_TFS.length - 1];
}
// Plan żądań karty: [1s, 1m] dla krótkiego trade'a, inaczej [1m].
export function cardChartPlan(card) {
  const b = card.exitAt != null && card.exitAt >= card.at ? card.exitAt : null;
  const short = b != null && (b - card.at) / 1000 <= CARD_1S_MAX_SEC;
  return (short ? ['1s', '1m'] : ['1m']).map((res) => { const f = cardFrame(card.at, card.exitAt, res); return { res, ...f, tf: cardTf(f.to - f.from, res) }; });
}
// Adres żądania świec karty albo null (bez żądania): przełącznik wyłączony, karta okresu, instrument bez źródła (EURUSD, XAUUSD), trade bez czasu.
// Tylko lokalny magazyn (GET /api/candles z jawnym tf): okno Udostępnij nigdy nie pobiera brakujących świec z Databento ani nie pyta o koszt.
// Ceny jak w podglądzie trade'a: P38 B-ADJ wg ustawienia „B-ADJ domyślnie włączony” (loadBadj), kotwica = kontrakt trade'a (tradeQuery: tfrom, tto, contract).
// res: '1s' albo '1m' (krok planu); bez res = ostatni krok (1m).
export function cardChartRequest(card, { cfg = chartSettings(), badj = loadBadj() } = {}, res = null) {
  if (!CHART_IN_SHARE || !cfg?.shareChart || card?.kind !== 'trade' || card.at == null || !miniEligible(card)) return null;
  const plan = cardChartPlan(card), step = plan.find((p) => p.res === res) || plan[plan.length - 1];
  const q = new URLSearchParams({ instrument: String(card.instrument).trim().toUpperCase(), from: String(step.from), to: String(step.to), tf: step.tf });
  for (const [k, v] of Object.entries(tradeQuery({ at: card.at, exitAt: card.exitAt, contract: card.contract, date: card.date, time: card.time }))) q.set(k, String(v));
  if (badj) q.set('adjust', '1');
  return `/api/candles?${q}`;
}
// Odpowiedź 1s jest pełna, gdy magazyn ma cały kadr (bez missing) i co najmniej połowę spodziewanych świec (sekundy bez transakcji nie mają świecy).
// P55 (29.10.2026): TF poniżej minuty ma od teraz świece z podziału 1m (pole synth w odpowiedzi); karta chce prawdziwych sekund, więc odpowiedź z częścią syntetyczną
// nie jest „pełna” i karta bierze świece 1m jak przed P55 (decyzja gustu: karty bez przygaszonych świec).
const full1s = (j, step) => !(Array.isArray(j.missing) && j.missing.length) && !(Array.isArray(j.synth) && j.synth.length) && j.bars.length >= Math.max(30, 0.5 * (step.to - step.from) / tfSecOf(step.tf));
// Świece kart jednego okna: plan żądań na kartę (cache po adresie, także w trakcie lotu); brak świec, noSource albo błąd → null (karta bez wykresu).
// Wynik: odpowiedź serwera z polem res ('1s' / '1m').
export function createCardCharts({ fetch: fetchFn = (...a) => globalThis.fetch(...a), cfg = chartSettings, badj = loadBadj } = {}) {
  const cache = new Map();
  const one = (url) => {
    if (!cache.has(url)) {
      cache.set(url, (async () => {
        try {
          const r = await fetchFn(url, { cache: 'no-store' });
          if (!r?.ok) return null;
          const j = await r.json();
          return j && !j.noSource && Array.isArray(j.bars) && j.bars.length ? j : null;
        } catch { return null; }
      })());
    }
    return cache.get(url);
  };
  return {
    async get(card) {
      const c = cfg(), b = badj();
      if (!cardChartRequest(card, { cfg: c, badj: b })) return null;
      const plan = cardChartPlan(card);
      for (const step of plan) {
        const j = await one(cardChartRequest(card, { cfg: c, badj: b }, step.res));
        if (!j) continue;
        if (step.res === '1s' && !full1s(j, step)) continue;
        return { ...j, res: step.res, from: step.from, to: step.to };
      }
      return null;
    },
  };
}
// Świece do narysowania: linia = wszystkie punkty pobrania; świece = połączone do najwyżej CARD_CANDLES (te same reguły sesji co serwer, swiece.aggregate).
export function cardBars(resp, style) {
  if (!resp?.bars?.length) return [];
  if (style !== 'candles') return resp.bars;
  const span = (resp.to ?? resp.bars[resp.bars.length - 1][0]) - (resp.from ?? resp.bars[0][0]);
  const tf = cardTf(span, resp.res === '1s' ? '1s' : '1m', CARD_CANDLES);
  if (tfSecOf(tf) <= tfSecOf(resp.tf || '1m')) return resp.bars;
  return aggregate(resp.bars.map((x) => [...x]), tf) || resp.bars;
}

export const SHARE_DEFAULTS = { nick: '', format: '9:16', metric: 'R', numberColor: 'result' };
const NICK_MAX = 40;
const PHOTO_KEY = 'thq.share.photo';
const BG_KEY = 'thq.share.bg';
const PHOTO_MAX = 1920;
const KINDS = ['trade', 'day', 'week', 'month', 'year'];

// Ustawienia karty z zewnątrz (localStorage, synchronizacja z innego urządzenia): tylko znane pola i dozwolone wartości.
export function sanitizeShare(o) {
  const s = o && typeof o === 'object' ? o : {};
  return {
    nick: typeof s.nick === 'string' ? s.nick.replace(/\s+/g, ' ').trim().slice(0, NICK_MAX) : SHARE_DEFAULTS.nick,
    format: typeof s.format === 'string' && Object.hasOwn(FORMATS, s.format) ? s.format : SHARE_DEFAULTS.format, // hasOwn, nie `in`: „toString” itp. nie przechodzi
    metric: METRICS.includes(s.metric) ? s.metric : SHARE_DEFAULTS.metric,
    numberColor: s.numberColor === 'neutral' ? 'neutral' : 'result',
  };
}

const svgI = (body, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICO = {
  close: svgI('<path d="M6 6l12 12M18 6 6 18"/>', 18),
  download: svgI('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', 14),
  copy: svgI('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>', 14),
  share: svgI('<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>', 14),
  rec: svgI('<circle cx="12" cy="12" r="6"/>', 14),
};
const pct = (v) => `${Math.round(v * 100)}%`;

// ---------- okresy ----------
const clampDay = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
// clip (tylko tydzień): zakres przycięty do dni, które sumuje komórka „Tydz.” w kalendarzu (patrz weekCard).
function periodOf(kind, a, clip = null) {
  const { y, m } = parseKey(a);
  if (kind === 'week') { const from = weekStart(a), to = addDays(from, 6); return clip ? { from: clip.from > from ? clip.from : from, to: clip.to < to ? clip.to : to } : { from, to }; }
  if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` };
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: a, to: a };
}
function stepAnchor(kind, a, dir) {
  const { y, m, d } = parseKey(a);
  if (kind === 'day') return addDays(a, dir);
  if (kind === 'week') return addDays(a, 7 * dir);
  if (kind === 'month') { const n = y * 12 + (m - 1) + dir; return clampDay(Math.floor(n / 12), (n % 12) + 1, d); }
  return clampDay(y + dir, m, d);
}
function periodLabel(kind, a, clip = null) {
  const { y, m } = parseKey(a);
  if (kind === 'day') return longDate(a);
  if (kind === 'month') { const mt = monthTitle(y, m); return mt[0].toUpperCase() + mt.slice(1); }
  if (kind === 'year') return String(y);
  const { from, to } = periodOf('week', a, clip);
  const body = range(from, to); // ta sama etykieta zakresu co na karcie (udostepnij-render.js)
  return `${body[0].toUpperCase()}${body.slice(1)} ${parseKey(to).y}`;
}

// ---------- zdjęcie ----------
// Zdjęcie użytkownika zmniejszamy do 1920 px na dłuższym boku i zapisujemy jako JPEG (mały wpis w localStorage).
async function downscale(file) {
  let src, w, h;
  if (window.createImageBitmap) {
    src = await createImageBitmap(file);
    w = src.width; h = src.height;
  } else {
    const url = URL.createObjectURL(file);
    try {
      src = new Image(); src.src = url; await src.decode();
      w = src.naturalWidth; h = src.naturalHeight;
    } finally { URL.revokeObjectURL(url); }
  }
  const k = Math.min(1, PHOTO_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); // przezroczyste PNG-i na czarnym, bo JPEG nie ma kanału alfa
  x.drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', 0.86) };
}
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } }

const blobOf = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));

// getModel(): { trades, konta } (znormalizowane, jak w statystykach); prefs: obiekt z ustawień (mutowany); save(): zapis ustawień;
// onClose(): np. odroczone przerysowanie widoku po zamknięciu okna.
// saveChart(patch): zapis wyborów okna w settings.chart (v2: wygląd wykresu, rysunek pozycji, wiersze danych); bez niego zmiana działa do przeładowania strony.
export function createShare({ getModel, prefs, save, onClose = () => {}, saveChart = (p) => { setChartSettings({ ...chartSettings(), ...p }); } }) {
  let photo = null;          // canvas / obraz do narysowania
  let photoLoaded = false;   // czy próbowaliśmy już odczytać zdjęcie z localStorage
  let fontsP = null;
  let opening = false;       // blokada podwójnego otwarcia w czasie await restorePhoto()

  async function restorePhoto() {
    if (photoLoaded) return;
    photoLoaded = true;
    const url = lsGet(PHOTO_KEY);
    if (!url) return;
    try { const im = new Image(); im.src = url; await im.decode(); photo = im; } catch { photo = null; lsSet(PHOTO_KEY, null); }
  }

  // opts: { tradeId?, kind?, anchor? (dowolny dzień okresu), clip? ({ from, to }, tylko dla tygodnia), opener? }
  // getModel() zwraca trades = trade'y po filtrach widoku (konta, setupy, wyszukiwarka: baseTrades() w app.js) i allTrades = wszystkie
  // (karta pojedynczego trade'a). Decyzja 26.10.2026, słowa użytkownika «To samo co komórka»: karty okresów biorą te same filtry co kalendarz
  // i statystyki (odwraca wcześniejszą decyzję gustu „okno ignoruje filtry”); filtered = czy jakikolwiek filtr jest aktywny (notka w oknie).
  async function open(opts = {}) {
    if (opening || overlay.current?.share) return;
    const model = getModel();
    if (!model) return;
    opening = true;
    try { await restorePhoto(); } finally { opening = false; } // dalej do przypisania overlay.current nie ma już await
    const everyTrade = model.allTrades || model.trades;
    const live = liveOnly(model.trades);
    const dates = live.map((x) => x.date).sort();
    const firstDay = dates[0] || null, lastLive = dates[dates.length - 1] || null;
    const trade = opts.tradeId ? everyTrade.find((x) => x.id === opts.tradeId) : null;
    const st = {
      kind: trade ? 'trade' : KINDS.includes(opts.kind) ? opts.kind : 'week',
      anchor: opts.anchor || (trade && trade.typ === 'Live' ? trade.date : lastLive) || todayKey(),
      clip: opts.kind === 'week' && opts.clip?.from && opts.clip?.to ? { from: opts.clip.from, to: opts.clip.to } : null,
      bg: lsGet(BG_KEY) === 'photo' && photo ? 'photo' : 'theme',
      // etap 16: przełącznik „Krzywa kapitału” kart okresu; wartość początkowa z Ustawień → Wykresy (settings.chart.equity), w oknie zmiana chwilowa (bez zapisu)
      equity: chartSettings().equity !== false,
      // pakiet J: tryb okna i opcje filmu (wartości początkowe z Ustawień → Wykresy, zmiana chwilowa); fbg = tło filmu (motyw / zdjęcie / film)
      mode: 'image',
      film: (() => { const c = chartSettings(); return { format: FILM_FORMATS.includes(c.filmFormat) ? c.filmFormat : FILM_FORMATS[0], seconds: FILM_SECONDS.includes(c.filmSeconds) ? c.filmSeconds : 10, bw: !!c.filmBw, dim: FILM_DIMS.includes(c.filmDim) ? c.filmDim : 0.6, quality: QUALITIES[0] }; })(),
      fbg: null,
      // v2 (P45, P46): wygląd wykresu i rysunek pozycji; wartości początkowe z settings.chart, wybór w oknie zapisuje się jako następna wartość początkowa
      style: chartSettings().shareStyle, draw: chartSettings().shareDraw, more: false, allRows: false, chartAsk: false, chartResp: undefined,
    };
    st.fbg = st.bg;
    const charts = createCardCharts(); // etap 17: świece karty trade'a, jedno żądanie na okno
    // pakiet J: film tła tylko w tym oknie (nie w createShare: nie przeżywa zamknięcia), wynik nagrania i nagrywanie w toku
    let video = null;          // <video> z pliku użytkownika (URL.createObjectURL), zwalniany przy zmianie i zamknięciu
    let filmOut = null;        // { blob, mime, ext, fps, stats, name } po nagraniu; zmiana opcji go unieważnia
    let recState = null;       // { ctrl: AbortController } w trakcie nagrywania
    const mimeInfo = supportedMime();
    const filterOk = filterSupported();
    const prev = overlay.current;
    const opener = opts.opener || document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'scrim sh-scrim';
    wrap.innerHTML = `<div class="modal sh" role="dialog" aria-modal="true" aria-labelledby="sh-t" tabindex="-1">
      <div class="mh"><h2 id="sh-t">${esc(t('Udostępnij'))}</h2><button type="button" class="icon-btn" data-sh="close" data-fk="close" aria-label="${esc(t('Zamknij'))}">${ICO.close}</button></div>
      <div class="mb sh-body">
        <div class="sh-prev"><div class="sh-stage"><canvas id="sh-cv" role="img" aria-label=""></canvas><p class="sh-empty" id="sh-empty" hidden></p></div></div>
        <div class="sh-ctl" id="sh-ctl"></div>
      </div>
      <div class="mf"><span class="fmsg" id="sh-msg" role="status" aria-live="polite"></span><span class="sh-rec" id="sh-rec" role="status" aria-live="polite" hidden></span><span class="grow"></span>
        <button type="button" class="btn" data-sh="cancel" data-fk="cancel" hidden>${esc(t('Anuluj'))}</button>
        <button type="button" class="btn" data-sh="copy" data-fk="copy" hidden>${ICO.copy}${esc(t('Kopiuj'))}</button>
        <button type="button" class="btn" data-sh="share" data-fk="share" hidden>${ICO.share}${esc(t('Udostępnij'))}</button>
        <button type="button" class="btn" data-sh="record" data-fk="record" hidden>${ICO.rec}${esc(t('Nagraj film'))}</button>
        <button type="button" class="btn primary" data-sh="download" data-fk="download">${ICO.download}${esc(t('Pobierz PNG'))}</button></div>
      <input type="file" id="sh-file" accept="image/*" hidden><input type="file" id="sh-vfile" accept="video/*" hidden></div>`;
    document.body.appendChild(wrap);
    const hadLock = document.documentElement.classList.contains('lb-lock');
    document.documentElement.classList.add('lb-lock');
    const dlg = wrap.firstElementChild;
    const $ = (s) => dlg.querySelector(s);
    const cv = $('#sh-cv');
    // v2: wymiary podglądu = karta wpasowana w pole (ramka i cień obejmują samą kartę); przeliczane po każdym rysunku i przy zmianie rozmiaru okna
    const fitCanvas = () => {
      const r = $('.sh-stage').getBoundingClientRect();
      if (!r.width || !r.height || !cv.width) return;
      const ar = cv.width / cv.height;
      let w = r.width, h = w / ar;
      if (h > r.height) { h = r.height; w = h * ar; }
      cv.style.setProperty('--sh-cw', `${Math.floor(w)}px`); cv.style.setProperty('--sh-ch', `${Math.floor(h)}px`);
    };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fitCanvas) : null;
    ro?.observe($('.sh-stage'));

    const canCopy = !!(navigator.clipboard?.write && window.ClipboardItem && window.isSecureContext);
    const canShareFiles = () => {
      try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })); } catch { return false; }
    };
    // pakiet J: udostępnianie filmu na telefonie (navigator.canShare z plikiem wideo)
    const canShareVideo = (type) => {
      try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([''], `a.${type === 'video/webm' ? 'webm' : 'mp4'}`, { type })] })); } catch { return false; }
    };
    const shareFiles = canShareFiles();
    // Stopka: obraz = Kopiuj / Udostępnij / Pobierz PNG; film = Nagraj film, po nagraniu Pobierz MP4 (WebM) i Udostępnij; „Kopiuj” ukryte dla filmu;
    // w trakcie nagrywania tylko postęp i „Anuluj” (kontrolki okna nieaktywne).
    function syncFooter() {
      const film = st.mode === 'film', busy = !!recState;
      const ftype = filmOut ? filmOut.mime.split(';')[0] : '';
      $('[data-sh="copy"]').hidden = film || busy || !canCopy;
      $('[data-sh="share"]').hidden = busy || (film ? !(filmOut && canShareVideo(ftype)) : !shareFiles);
      const dl = $('[data-sh="download"]');
      dl.hidden = busy || (film && !filmOut);
      dl.innerHTML = ICO.download + esc(film ? (filmOut?.ext === 'webm' ? t('Pobierz WebM') : t('Pobierz MP4')) : t('Pobierz PNG'));
      const rb = $('[data-sh="record"]');
      rb.hidden = !film || busy;
      rb.classList.toggle('primary', film && !filmOut);
      rb.innerHTML = ICO.rec + esc(filmOut ? t('Nagraj ponownie') : t('Nagraj film'));
      $('[data-sh="cancel"]').hidden = !busy;
      $('#sh-rec').hidden = !busy;
      $('#sh-msg').hidden = busy;
      $('#sh-ctl').inert = busy;
    }
    syncFooter();

    let seq = 0;
    let cur = null; // { card, metric, name, info, blob }: blob liczony w draw(), żeby share/pobieranie nie czekały na toBlob (Safari wymaga gestu)

    // ----- dane karty dla bieżącego wyboru -----
    function build() {
      const m = getModel();
      const trades = m.trades, konta = m.konta;
      const make = (metric) => {
        if (st.kind === 'trade') { const x = (m.allTrades || m.trades).find((q) => q.id === opts.tradeId); return x ? tradeCard(x, konta) : null; }
        const { y, m: mo } = parseKey(st.anchor);
        if (st.kind === 'day') return dayCard(trades, konta, st.anchor, metric);
        if (st.kind === 'week') return weekCard(trades, konta, st.anchor, metric, st.clip);
        if (st.kind === 'month') return monthCard(trades, konta, y, mo, metric);
        return yearCard(trades, konta, y, metric);
      };
      const c0 = make('R');
      if (!c0) return { card: null, avail: [], metric: prefs.metric, empty: t('Nie znaleziono tego trade’a') };
      const avail = availableMetrics(c0);
      if (st.kind === 'trade') return { card: c0, avail, metric: avail.includes(prefs.metric) ? prefs.metric : avail[0] || 'R', empty: avail.length ? null : t('Ten trade nie ma wyniku do pokazania') };
      if (!c0.n) return { card: c0, avail, metric: prefs.metric, empty: t("Brak trade'ów Live w tym okresie") };
      const metric = avail.includes(prefs.metric) ? prefs.metric : avail[0] || 'R';
      return { card: metric === 'R' ? c0 : make(metric), avail, metric, empty: avail.length ? null : t('Brak wyniku do pokazania w tym okresie') };
    }

    // ----- elementy sterujące (P52, 29.10.2026: słowa użytkownika «zreworkuj takze wyglad ustawien tworzenia tych zdjec/filmu, jest zbyt napakowany, a za malo
    // funckjonalna designowy, ma byc bardzo dorpacowny»). Wzory z Refero: Luma AI (podgląd jako bohater po lewej, ustawienia w grupach po prawej, akcje na dole)
    // i Arcade (eksport: najpierw format i rodzaj pliku, rzadsze opcje schowane w „Więcej”). Hierarchia: Plik (obraz/film, format) → Karta → Wykres → Duża liczba
    // → Dane → Tło; rzadsze (kolor liczby, jakość i długość filmu, czarno-białe, przyciemnienie) w zwijanym „Więcej”. Kontrolki aplikacji: .seg, .pill, .btn.
    const segBtns = (attr, items, cls = 'seg sm full') => `<div class="${cls}" role="group"${items.label ? ` aria-label="${esc(items.label)}"` : ''}>${items.list.map((i) => `<button type="button" data-sh="${attr}" data-v="${esc(i.v)}" data-fk="${attr}-${esc(i.v)}" aria-pressed="${!!i.on}"${i.dis ? ` disabled aria-disabled="true"` : ''}${i.title ? ` title="${esc(i.title)}"` : ''}>${esc(i.label)}</button>`).join('')}</div>`;
    const seg = (label, key, list, attr) => `<div class="sh-f"><span class="sh-fl" id="sh-l-${key}">${esc(label)}</span>${segBtns(attr, { list }).replace('role="group"', `role="group" aria-labelledby="sh-l-${key}"`)}</div>`;
    const group = (id, title, body, extra = '') => `<section class="sh-g" aria-labelledby="sh-g-${id}"><h3 class="sh-gh" id="sh-g-${id}">${esc(title)}${extra}</h3>${body}</section>`;
    const filtered = !!getModel()?.filtered;
    const rowName = (id) => (id === 'alt' ? t('Druga jednostka') : t(ROW_LABELS[id]));
    function rowsHtml(b) {
      const trade = st.kind === 'trade';
      const list = trade ? TRADE_ROWS : PERIOD_ROWS;
      const sel = chartSettings()[trade ? 'rowsTrade' : 'rowsPeriod'];
      const tokens = readTokens();
      const full = sel.length >= CARD_ROWS_MAX;
      // P54: 6 najczęstszych, reszta po „Pokaż wszystkie” (zaznaczone spoza szóstki zawsze widoczne)
      const top = trade ? TRADE_ROWS_TOP : PERIOD_ROWS_TOP;
      const more = list.length > top.length;
      const pills = visibleRows(list, top, sel, st.allRows).map((id) => {
        const on = sel.includes(id);
        const same = id === b.metric; // P52: duża liczba nie powtarza się w wierszach
        const solo = cardModel(st.kind, b.card, b.metric, tokens, prefs.numberColor, { rows: [id] }).rows.length > 0;
        const dis = !on && full;
        const title = same ? t('To jest duża liczba') : !solo ? t('Brak tych danych na tej karcie') : !on && full ? t('Najwyżej {n} wiersze', { n: CARD_ROWS_MAX }) : '';
        return `<button type="button" class="pill sh-pill${solo ? '' : ' is-empty'}" data-sh="row" data-v="${esc(id)}" data-fk="row-${esc(id)}" aria-pressed="${on}"${dis ? ' disabled aria-disabled="true"' : ''}${title ? ` title="${esc(title)}"` : ''}>${esc(rowName(id))}</button>`;
      }).join('');
      const toggle = more ? `<button type="button" class="btn ghost sm sh-rows-all" data-sh="rows-all" data-v="toggle" data-fk="rows-all" aria-expanded="${!!st.allRows}" aria-controls="sh-pills">${esc(st.allRows ? t('Zwiń') : t('Pokaż wszystkie'))}</button>` : '';
      return group('rows', t('Dane'), `<div class="pills sh-pills" id="sh-pills" role="group" aria-labelledby="sh-g-rows">${pills}</div>${toggle}`, ` <span class="sh-cnt" aria-label="${esc(t('Wybrane {a} z {b}', { a: sel.length, b: CARD_ROWS_MAX }))}">${sel.length}/${CARD_ROWS_MAX}</span>`);
    }
    function ctlHtml(b) {
      const film = st.mode === 'film', f = st.film;
      const kinds = [['trade', t('Trade')], ['day', t('Dzień')], ['week', t('Tydzień')], ['month', t('Miesiąc')], ['year', t('Rok')]].filter(([k]) => k !== 'trade' || opts.tradeId);
      // 1. Plik: obraz albo film (pakiet J: bez MediaRecorder film wyłączony z podpowiedzią) i format
      let h = group('file', t('Plik'), segBtns('mode', { label: t('Rodzaj pliku'), list: [{ v: 'image', label: t('Obraz'), on: !film },
        { v: 'film', label: t('Film'), on: film, dis: !mimeInfo, title: mimeInfo ? '' : t('Ta przeglądarka nie nagrywa filmów. Użyj Chrome, Edge albo Safari.') }] }, 'seg full sh-big')
        + (film ? segBtns('fformat', { label: t('Format'), list: FILM_FORMATS.map((v) => ({ v, label: v, on: f.format === v })) })
          : segBtns('format', { label: t('Format'), list: Object.keys(FORMATS).map((v) => ({ v, label: v, on: prefs.format === v })) })));
      // 2. Karta: rodzaj i okres
      let card = segBtns('kind', { label: t('Rodzaj karty'), list: kinds.map(([k, l]) => ({ v: k, label: l, on: st.kind === k })) });
      if (st.kind !== 'trade') {
        const p = periodOf(st.kind, st.anchor, st.clip);
        const canPrev = firstDay != null && p.from > firstDay, canNext = p.to < (lastLive && lastLive > todayKey() ? lastLive : todayKey());
        card += `<div class="sh-per" role="group" aria-label="${esc(t('Okres'))}"><button type="button" class="icon-btn" data-sh="prev" data-fk="prev" aria-label="${esc(t('Poprzedni okres'))}"${canPrev ? '' : ' disabled'}>‹</button>
          <span class="sh-per-t" aria-live="polite">${esc(periodLabel(st.kind, st.anchor, st.clip))}</span>
          <button type="button" class="icon-btn" data-sh="next" data-fk="next" aria-label="${esc(t('Następny okres'))}"${canNext ? '' : ' disabled'}>›</button></div>`;
        if (filtered) card += `<p class="note" id="sh-filt">${esc(t('Uwzględnia filtry widoku.'))}</p>`;
      }
      h += group('card', t('Karta'), card);
      if (b.card && !b.empty) {
        // 3. Wykres: wygląd i rysunek pozycji (trade, P45, P46) albo krzywa kapitału (okres, P47)
        if (st.kind === 'trade') {
          if (st.chartAsk) {
            h += group('chart', t('Wykres'), segBtns('style', { label: t('Wygląd wykresu'), list: [{ v: 'candles', label: t('Świece'), on: st.style === 'candles' }, { v: 'line', label: t('Linia'), on: st.style === 'line' }] })
              + segBtns('draw', { label: t('Rysunek pozycji'), list: [{ v: 'position', label: t('Pozycja'), on: st.draw === 'position' }, { v: 'marks', label: t('Wejście i wyjście'), on: st.draw === 'marks' }] })
              + (st.chartResp === null ? `<p class="note" id="sh-nochart">${esc(t('Brak pobranych świec dla tego trade’a.'))}</p>` : ''));
          }
        } else {
          h += group('chart', t('Wykres'), segBtns('equity', { label: t('Krzywa kapitału'), list: [{ v: 'on', label: t('Krzywa kapitału'), on: st.equity }, { v: 'off', label: t('Bez wykresu'), on: !st.equity }] }));
        }
        // 4. Duża liczba (P44): R / $ / %, wartość początkowa z zapisanej jednostki kart
        const why = { R: t('Brak wyniku w R'), $: t('Ta karta nie ma wyniku w $'), '%': t('Brak rozmiaru konta przy tych trade’ach, więc nie da się policzyć % konta') };
        h += group('metric', t('Duża liczba'), segBtns('metric', { label: t('Duża liczba'), list: METRICS.map((u) => { const ok = b.avail.includes(u); return { v: u, label: u, on: b.metric === u, dis: !ok, title: ok ? '' : why[u] }; }) }, 'seg full sh-big'));
        // 5. Dane (P52)
        h += rowsHtml(b);
      }
      // 6. Tło
      const photoCtl = `<div class="sh-ph"><button type="button" class="btn sm" data-sh="pick" data-fk="pick">${esc(photo ? t('Zmień zdjęcie') : t('Wybierz zdjęcie'))}</button>${photo ? `<button type="button" class="btn ghost sm" data-sh="rmphoto" data-fk="rmphoto">${esc(t('Usuń'))}</button>` : ''}</div>`;
      if (film) {
        let bg = segBtns('fbg', { label: t('Tło'), list: [{ v: 'theme', label: t('Motyw'), on: st.fbg === 'theme' }, { v: 'photo', label: t('Zdjęcie'), on: st.fbg === 'photo' }, { v: 'video', label: t('Film'), on: st.fbg === 'video' }] });
        if (st.fbg === 'photo') bg += photoCtl;
        if (st.fbg === 'video') bg += `<div class="sh-ph"><button type="button" class="btn sm" data-sh="vpick" data-fk="vpick">${esc(video ? t('Zmień film') : t('Wybierz film'))}</button></div>
          <p class="note" id="sh-vnote">${esc(t('Film zostaje na tym urządzeniu. Używaj tylko nagrań, do których masz prawa (także muzyki).'))}</p>`;
        h += group('bg', t('Tło'), bg);
      } else {
        h += group('bg', t('Tło'), segBtns('bg', { label: t('Tło'), list: [{ v: 'theme', label: t('Motyw'), on: st.bg === 'theme' }, { v: 'photo', label: t('Zdjęcie'), on: st.bg === 'photo' }] }) + (st.bg === 'photo' ? photoCtl : ''));
      }
      // 7. Więcej (zwinięte): kolor liczby; film: jakość, długość, czarno-białe, przyciemnienie tła
      let more = seg(t('Kolor liczby'), 'ncolor', [{ v: 'result', label: t('Wynik'), on: prefs.numberColor === 'result' }, { v: 'neutral', label: t('Neutralny'), on: prefs.numberColor === 'neutral' }], 'ncolor');
      if (film) {
        more += seg(t('Jakość'), 'quality', QUALITIES.map((v) => ({ v, label: v, on: f.quality === v })), 'quality');
        more += seg(t('Długość'), 'seconds', FILM_SECONDS.map((v) => ({ v: String(v), label: `${v} s`, on: f.seconds === v })), 'seconds');
        if (st.fbg !== 'theme') {
          if (filterOk) more += `<div class="sh-f"><label class="check"><input type="checkbox" data-sh-chk="bw" data-fk="bw"${f.bw ? ' checked' : ''}> ${esc(t('Czarno-białe'))}</label></div>`;
          more += `<div class="sh-f"><label class="sh-fl" for="sh-dim">${esc(t('Przyciemnienie tła'))}</label>
            <span class="sh-range"><input type="range" id="sh-dim" data-sh-range="dim" data-fk="dim" min="${FILM_DIMS[0]}" max="${FILM_DIMS[FILM_DIMS.length - 1]}" step="0.1" value="${f.dim}"><output for="sh-dim" id="sh-dim-v">${pct(f.dim)}</output></span></div>`;
        }
        more += `<p class="note">${esc(t('Film bez dźwięku, nagrywa się w czasie rzeczywistym: zostaw kartę przeglądarki na wierzchu.'))}</p>`;
        if (mimeInfo && !mimeInfo.mp4) more += `<p class="note" id="sh-webm">${esc(t('Instagram i TikTok wolą MP4: nagraj w Chrome albo Edge.'))}</p>`;
      }
      h += `<details class="sh-more" data-fk="more"${st.more ? ' open' : ''}><summary data-fk="more-s">${esc(t('Więcej opcji'))}</summary><div class="sh-more-b">${more}</div></details>`;
      return h;
    }

    function setMsg(s) { $('#sh-msg').textContent = s || ''; }
    function setButtons(on) { for (const b of dlg.querySelectorAll('[data-sh="download"],[data-sh="copy"],[data-sh="share"],[data-sh="record"]')) b.disabled = !on; }

    // ctl: false = bez przebudowy kontrolek (suwak przyciemnienia w trakcie przesuwania)
    async function draw({ ctl: rebuild = true } = {}) {
      const my = ++seq;
      const b = build();
      cur = null;
      const film = st.mode === 'film';
      const format = film ? st.film.format : prefs.format;
      { const [fw, fh] = FORMATS[format] || FORMATS['9:16']; $('.sh-prev').style.setProperty('--sh-ar', String(fw / fh)); } // proporcja podglądu na wąskich ekranach (features.css)
      // etap 17 / v2: świece karty trade'a przed kontrolkami (grupa „Wykres” wie, czy są świece); lokalne, bez pobierania z Databento
      st.chartAsk = st.kind === 'trade' && !!b.card && !!cardChartRequest(b.card);
      st.chartResp = undefined;
      if (st.chartAsk) {
        const resp = await charts.get(b.card);
        if (my !== seq) return;
        st.chartResp = resp;
      }
      const ctl = $('#sh-ctl');
      if (rebuild) {
        const fk = document.activeElement && ctl.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
        ctl.innerHTML = ctlHtml(b);
        if (fk) (ctl.querySelector(`[data-fk="${fk}"]:not(:disabled)`) || dlg).focus();
      }
      syncFooter();
      const empty = $('#sh-empty');
      const showEmpty = (msg) => { cv.hidden = true; empty.hidden = false; empty.textContent = msg; setButtons(false); setMsg(''); };
      if (b.empty) { showEmpty(b.empty); return; }
      empty.hidden = true; cv.hidden = false;
      try {
        // błąd z filmu v2: wynik „nie wszystkie wagi wczytane” nie jest zapamiętywany, następny rysunek pyta ponownie
        fontsP ||= ensureFonts();
        if (!(await fontsP)) fontsP = null;
        if (my !== seq) return;
        // v2: wygląd (świece / linia, P46) i rysunek pozycji (P45) z okna; świece łączone w przeglądarce (cardBars), więc zmiana wyglądu nie wysyła żądania
        const resp = st.chartResp;
        const chart = resp ? { bars: cardBars(resp, st.style), tf: resp.tf, style: st.style, draw: st.draw } : null;
        const photoOn = st.bg === 'photo' && photo;
        const rows = chartSettings()[st.kind === 'trade' ? 'rowsTrade' : 'rowsPeriod'];
        const base = { kind: st.kind, format, metric: b.metric, numberColor: prefs.numberColor, data: b.card, photo: photoOn ? photo : null, nick: prefs.nick, tokens: readTokens(), equity: st.kind !== 'trade' && st.equity, chart, rows };
        if (film) {
          // pakiet J: podgląd filmu = ostatnia klatka (at = ∞) z bieżącą klatką filmu tła; nagranie rysuje na tym samym płótnie
          const src = st.fbg === 'video' ? video : st.fbg === 'photo' ? photo : null;
          const fopts = { ...base, photo: src, film: true, bg: st.fbg === 'video' ? 'video' : 'photo', dim: st.film.dim, bw: st.film.bw && filterOk };
          const info = renderCard(cv, fopts); fitCanvas();
          const size = filmSize(st.film.format, st.film.quality);
          cv.setAttribute('aria-label', `${t('Podgląd filmu')}: ${st.kind === 'trade' ? '' : periodLabel(st.kind, st.anchor, st.clip)} ${size.w}×${size.h}`.replace(/\s+/g, ' ').trim());
          cur = { card: b.card, metric: b.metric, info, film: fopts };
          setButtons(true);
          syncFooter();
          setMsg(filmOut ? `${size.w}×${size.h} px, ${st.film.seconds} s${filmOut.fps === 30 ? `, ${t('30 kl./s')}` : ''}` : `${size.w}×${size.h} px, ${st.film.seconds} s`);
          return;
        }
        const info = renderCard(cv, base); fitCanvas();
        cv.setAttribute('aria-label', `${t('Podgląd karty')}: ${st.kind === 'trade' ? '' : periodLabel(st.kind, st.anchor, st.clip)} ${info.width}×${info.height}`.replace(/\s+/g, ' ').trim());
        const blob = await blobOf(cv);
        if (my !== seq) return;
        cur = { card: b.card, metric: b.metric, name: fileName(st.kind, b.card, format), info, blob };
        setButtons(true);
        setMsg(`${info.width}×${info.height} px`);
      } catch (e) {
        if (my !== seq) return;
        cur = null;
        console.error('[udostepnij]', e);
        showEmpty(t('Nie udało się narysować karty.'));
      }
    }
    const redraw = (o) => { draw(o).catch(() => {}); };

    // ----- film (pakiet J) -----
    let recSec = -1;
    function setRec(s) {
      const n = Math.min(st.film.seconds, Math.floor(s));
      if (n === recSec) return;
      recSec = n;
      $('#sh-rec').textContent = t('Nagrywanie {a} / {b} s, nie przełączaj karty', { a: n, b: st.film.seconds });
    }
    async function recordFilm() {
      if (!cur?.film || recState || !mimeInfo) return;
      // błąd z filmu v2: przed pierwszą klatką nagrania wszystkie wagi kroju karty wczytane (ta sama rodzina i waga w całym filmie)
      fontsP ||= ensureFonts();
      if (!(await fontsP)) fontsP = null;
      if (!dlg.isConnected || !cur?.film || recState) return; // przegląd 1.3.0, pkt 5: okno zamknięte w czasie wczytywania kroju (nagranie nie rusza na odłączonym canvas)
      const size = filmSize(st.film.format, st.film.quality);
      const fopts = { ...cur.film, scale: size.scale, keep: true, cache: {} };
      const ctrl = new AbortController();
      recState = { ctrl };
      filmOut = null; recSec = -1; setRec(0);
      syncFooter();
      $('[data-sh="cancel"]').focus();
      $('.sh-prev').scrollIntoView?.({ block: 'nearest' }); // telefon: nagrywany podgląd na ekranie (kontrolki są pod nim)
      const card = cur.card;
      try {
        const r = await record({ canvas: cv, seconds: st.film.seconds, draw: (at) => renderCard(cv, { ...fopts, at }), video: st.fbg === 'video' ? video : null,
          mimeInfo, bitrate: bitrate(st.film.quality), onProgress: setRec, signal: ctrl.signal });
        if (!dlg.isConnected) return; // okno zamknięte w trakcie
        filmOut = { ...r, name: fileName(st.kind, card, st.film.format, r.ext) };
        // pomiar czasu klatki na komputerze użytkownika (plan, p. 3.11): konsola przeglądarki
        console.info('[film]', `${r.mime}, ${r.blob.size} B, ${r.fps} kl./s, klatka śr. ${r.stats.mean.toFixed(1)} ms, p95 ${r.stats.p95.toFixed(1)} ms`);
      } catch (e) {
        if (!dlg.isConnected) return;
        if (e?.name === 'AbortError') toast(t('Nagrywanie anulowane.'));
        else if (e?.name === 'HiddenError') toast(t('Nagrywanie przerwane: karta przeglądarki zeszła na drugi plan. Nagraj jeszcze raz i zostaw ją na wierzchu.'), { error: true });
        else { console.error('[film]', e); toast(t('Nie udało się nagrać filmu.'), { error: true }); }
      } finally {
        recState = null;
        if (dlg.isConnected) { await draw(); ($(filmOut ? '[data-sh="download"]' : '[data-sh="record"]') || dlg).focus(); }
      }
    }
    async function onVideoFile(file) {
      if (!file) return;
      try {
        const v = await loadVideo(file);
        if (!dlg.isConnected) { releaseVideo(v); return; }
        releaseVideo(video);
        video = v; st.fbg = 'video'; filmOut = null;
      } catch { toast(t('Nie udało się wczytać tego pliku jako filmu.'), { error: true }); }
      redraw();
    }

    // ----- akcje -----
    async function download() {
      if (st.mode === 'film') { downloadFilm(); return; }
      if (!cur) return;
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(cur.blob); a.download = cur.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(t('Zapisano plik {name}', { name: cur.name }));
      } catch { toast(t('Nie udało się zapisać obrazu.'), { error: true }); }
    }
    async function copy() {
      if (!cur) return;
      try {
        // blob jest już policzony w draw(), więc zapis do schowka idzie od razu w geście kliknięcia (Safari)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': cur.blob })]);
        toast(t('Skopiowano obraz do schowka'));
      } catch { toast(t('Nie udało się skopiować obrazu do schowka.'), { error: true }); }
    }
    // pakiet J: gotowy film (blob z film.js) do pobrania albo udostępnienia na telefonie; nazwa jak fileName() z .mp4 / .webm
    function downloadFilm() {
      if (!filmOut) return;
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(filmOut.blob); a.download = filmOut.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(t('Zapisano plik {name}', { name: filmOut.name }));
      } catch { toast(t('Nie udało się zapisać filmu.'), { error: true }); }
    }
    async function shareFilm() {
      if (!filmOut) return;
      try {
        const file = new File([filmOut.blob], filmOut.name, { type: filmOut.mime.split(';')[0] });
        await navigator.share({ files: [file], title: 'JustJournal' });
        toast(t('Udostępniono'));
      } catch (e) { if (e?.name !== 'AbortError') toast(t('Nie udało się udostępnić filmu.'), { error: true }); }
    }
    async function share() {
      if (st.mode === 'film') { shareFilm(); return; }
      if (!cur) return;
      try {
        const file = new File([cur.blob], cur.name, { type: 'image/png' }); // bez await przed share(): Safari wymaga gestu użytkownika
        await navigator.share({ files: [file], title: 'JustJournal' });
        toast(t('Udostępniono'));
      } catch (e) { if (e?.name !== 'AbortError') toast(t('Nie udało się udostępnić obrazu.'), { error: true }); }
    }
    async function onFile(file) {
      if (!file) return;
      try {
        const r = await downscale(file);
        photo = r.canvas; st.bg = 'photo';
        if (st.mode === 'film') { st.fbg = 'photo'; filmOut = null; }
        const ok = lsSet(PHOTO_KEY, r.dataUrl);
        lsSet(BG_KEY, 'photo');
        if (!ok) toast(t('Zdjęcie działa do zamknięcia okna, ale nie udało się go zapamiętać w tej przeglądarce.'));
      } catch { toast(t('Nie udało się wczytać tego pliku jako zdjęcia.'), { error: true }); }
      redraw();
    }

    function setPref(key, v) { if (prefs[key] === v) return; prefs[key] = v; save(); }
    // akcje, które nie zmieniają karty ani filmu (reszta unieważnia nagrany film)
    const KEEP_FILM = ['close', 'download', 'copy', 'share', 'record', 'cancel', 'pick', 'vpick', 'rows-all'];
    function click(ev) {
      const b = ev.target.closest('[data-sh]');
      if (ev.target === wrap) { if (!recState) done(); return; } // kliknięcie obok nie przerywa nagrywania
      if (!b || b.disabled) return;
      const v = b.dataset.v;
      if (recState && b.dataset.sh !== 'cancel' && b.dataset.sh !== 'close') return;
      if (!KEEP_FILM.includes(b.dataset.sh)) filmOut = null;
      switch (b.dataset.sh) {
        case 'mode': if (v === 'film' && !mimeInfo) return; st.mode = v === 'film' ? 'film' : 'image'; redraw(); return;
        case 'fformat': if (FILM_FORMATS.includes(v)) st.film.format = v; redraw(); return;
        case 'quality': if (QUALITIES.includes(v)) st.film.quality = v; redraw(); return;
        case 'seconds': if (FILM_SECONDS.includes(Number(v))) st.film.seconds = Number(v); redraw(); return;
        case 'fbg':
          if (v === 'photo' && !photo) { $('#sh-file').click(); return; }
          if (v === 'video' && !video) { $('#sh-vfile').click(); return; }
          st.fbg = v; redraw(); return;
        case 'vpick': $('#sh-vfile').click(); return;
        case 'record': recordFilm(); return;
        case 'cancel': recState?.ctrl.abort(); return;
        case 'close': done(); return;
        case 'kind': st.kind = v; st.clip = null; redraw(); return;
        case 'prev': case 'next': st.clip = null; st.anchor = stepAnchor(st.kind, st.anchor, b.dataset.sh === 'next' ? 1 : -1); redraw(); return;
        case 'metric': setPref('metric', v); redraw(); return;
        case 'format': setPref('format', v); redraw(); return;
        case 'ncolor': setPref('numberColor', v); redraw(); return;
        case 'equity': st.equity = v === 'on'; redraw(); return;
        case 'style': if (SHARE_STYLES.includes(v)) { st.style = v; saveChart({ shareStyle: v }); } redraw(); return;
        case 'draw': if (SHARE_DRAWS.includes(v)) { st.draw = v; saveChart({ shareDraw: v }); } redraw(); return;
        case 'rows-all': st.allRows = !st.allRows; redraw(); return; // P54: „Pokaż wszystkie” / „Zwiń” (fokus wraca na przycisk po przebudowie)
        case 'row': {
          // P52: przełącznik wiersza danych; kolejność = kolejność katalogu, najwyżej CARD_ROWS_MAX, zapis w settings.chart (synchronizowane)
          const key = st.kind === 'trade' ? 'rowsTrade' : 'rowsPeriod', list = st.kind === 'trade' ? TRADE_ROWS : PERIOD_ROWS;
          const sel = new Set(chartSettings()[key]);
          if (sel.has(v)) sel.delete(v); else if (sel.size < CARD_ROWS_MAX && list.includes(v)) sel.add(v);
          saveChart({ [key]: list.filter((x) => sel.has(x)) });
          redraw(); return;
        }
        case 'bg':
          if (v === 'photo' && !photo) { $('#sh-file').click(); return; }
          st.bg = v; lsSet(BG_KEY, v); redraw(); return;
        case 'pick': $('#sh-file').click(); return;
        case 'rmphoto': photo = null; st.bg = 'theme'; if (st.fbg === 'photo') st.fbg = 'theme'; lsSet(PHOTO_KEY, null); lsSet(BG_KEY, 'theme'); redraw(); return;
        case 'download': download(); return;
        case 'copy': copy(); return;
        case 'share': share(); return;
        default:
      }
    }
    wrap.addEventListener('click', click);
    $('#sh-file').addEventListener('change', (ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; onFile(f); });
    $('#sh-vfile').addEventListener('change', (ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; onVideoFile(f); });
    // pakiet J: czarno-białe (zmiana) i suwak przyciemnienia (w trakcie przesuwania bez przebudowy kontrolek)
    wrap.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-sh-chk="bw"]')) { st.film.bw = ev.target.checked; filmOut = null; redraw(); }
      if (ev.target.matches('[data-sh-range="dim"]')) redraw();
    });
    wrap.addEventListener('toggle', (ev) => { if (ev.target.matches?.('.sh-more')) st.more = ev.target.open; }, true); // „Więcej opcji” zostaje otwarte po przerysowaniu
    wrap.addEventListener('input', (ev) => {
      if (!ev.target.matches('[data-sh-range="dim"]')) return;
      const x = Math.round(Number(ev.target.value) * 10) / 10;
      st.film.dim = FILM_DIMS.includes(x) ? x : st.film.dim;
      filmOut = null;
      const o = $('#sh-dim-v'); if (o) o.textContent = pct(st.film.dim);
      redraw({ ctl: false });
    });

    function done() {
      seq++;
      // pakiet J: przerwane nagrywanie i zwolniony film tła (adres obiektu), nic nie zostaje po zamknięciu okna
      if (recState) { const r = recState; recState = null; r.ctrl.abort(); }
      releaseVideo(video); video = null; filmOut = null; ro?.disconnect();
      wrap.remove();
      overlay.current = prev;
      if (!hadLock) document.documentElement.classList.remove('lb-lock');
      if (opener && document.contains(opener)) opener.focus();
      onClose();
    }
    // Esc w trakcie nagrywania tylko je anuluje (pakiet J); drugi Esc zamyka okno
    overlay.current = { share: true, onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); if (recState) recState.ctrl.abort(); else done(); } else trapTab(ev, dlg); } };
    await draw();
    ($('[data-fk="kind-' + st.kind + '"]') || dlg).focus();
  }

  return { open, isOpen: () => !!overlay.current?.share };
}
