// Newsy makro USD i earningsy spółek na wykresie (pakiet C, 1.4.0): ustawienia nakładek, filtry, grupowanie, geometria znaczników i dymki.
// Jedna logika czysta dla podglądu SVG (podglad.js) i edytora Lightweight Charts (wykres.js): model (buildNewsModel) i geometria w pikselach (newsGeometry)
// liczą się tu, a oba tryby tylko je rysują. Dane z lokalnego serwera: GET /api/news i GET /api/earnings (tylko odczyt, bez sieci zewnętrznej).
// Nie trafia do miniatur listy trade'ów ani do kart i filmów udostępniania (prostota i prawo: dane ForexFactory nie wychodzą poza dashboard).
// Kolory wyłącznie z tokenów motywu (NEWS_TOKENS / EARN_TOKENS), bez literałów. Wszystkie godziny to chwile UTC; wyświetlanie przez Intl w strefie wykresu.
// English: news/earnings overlay logic shared by the SVG preview and the Lightweight Charts editor: settings, filters, grouping, marker geometry, tooltips, data client.
import { esc, num } from './format.js';
import { t, locale } from './i18n.js';
import { timeToIndex, timeToIndexF } from './geometria.js';
import { tradingDayRange } from './dzien-handlowy.js';

// ---- ustawienia (część settings.chart.overlays, synchronizowana jak reszta nakładek) ----
export const NEWS_IMPS = ['high', 'medium', 'low', 'holiday', 'opex'];
export const EARN_CLASSES = [1, 2, 3, 4];
// Czerwone, pomarańczowe, żółte, szare jak w ForexFactory; OPEX ma własny kolor i własny przełącznik.
export const NEWS_TOKENS = { high: '--n-red', medium: '--n-orange', low: '--n-yellow', holiday: '--fg-2', opex: '--n-blue' };
export const EARN_TOKENS = { 1: '--n-red', 2: '--n-orange', 3: '--n-yellow', 4: '--fg-2' };
const IMP_RANK = { high: 0, opex: 1, medium: 2, low: 3, holiday: 4 };

// Decyzja gustu (29.10.2026): domyślnie czerwone i pomarańczowe (wymaganie z planu) oraz OPEX, bo to tylko etykieta dnia bez linii, a użytkownik prosił o informowanie o OPEX.
export function newsDefaults() {
  return { news: false, earnings: false, newsImp: { high: true, medium: true, low: false, holiday: false, opex: true }, earnCls: { 1: true, 2: true, 3: false, 4: false } };
}
// Zgodność wstecz: zapisy sprzed 1.4.0 nie mają tych kluczy, więc dostają domyślne (przełączniki wyłączone). Złe wartości wracają do domyślnych.
export function normNews(x) {
  const d = newsDefaults(), o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const flags = (src, keys, def) => {
    const s = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
    return Object.fromEntries(keys.map((k) => [k, typeof s[k] === 'boolean' ? s[k] : def[k]]));
  };
  return { news: o.news === true, earnings: o.earnings === true, newsImp: flags(o.newsImp, NEWS_IMPS, d.newsImp), earnCls: flags(o.earnCls, EARN_CLASSES, d.earnCls) };
}

// ---- nazwy i opisy ----
// Nazwy newsów z feedu i katalogu zostają po angielsku (CPI m/m, Non-Farm Employment Change); po polsku tylko zdarzenia całodzienne generowane przez aplikację.
export function eventName(e) {
  if (e.kind === 'opex') return e.variant === 'quarterly' ? t('OPEX kwartalny (triple witching)') : t('OPEX miesięczny');
  if (e.kind === 'holiday') return t('Bank Holiday');
  return e.name;
}
// Waga słowem (czytnik ekranu nie widzi koloru kropki): do dymków, aria-label znaczników i kart
export const impWord = (imp) => ({ high: t('czerwony'), medium: t('pomarańczowy'), low: t('żółty'), holiday: t('szary'), opex: 'OPEX' }[imp] || '');
export const sessionText = (s) => ({ bmo: t('przed otwarciem'), amc: t('po zamknięciu'), dmh: t('w trakcie sesji') }[s] || t('pora nieznana'));
export function earningText(e) {
  const q = Number.isInteger(e.quarter) && Number.isInteger(e.year) ? ` · Q${e.quarter} ${e.year}` : '';
  const eps = Number.isFinite(e.epsEst) ? ` · ${t('szac. EPS')} ${num(e.epsEst, 2)}` : '';
  return `${e.symbol} · ${t('klasa {n}', { n: e.cls })} · ${sessionText(e.session)}${q}${eps}`;
}

// ---- filtry i grupowanie ----
export const filterNews = (events, prefs) => (events || []).filter((e) => prefs.newsImp?.[e.imp]);
export const filterEarn = (events, prefs) => (events || []).filter((e) => prefs.earnCls?.[e.cls]);
const bestImp = (items) => items.reduce((b, e) => (IMP_RANK[e.imp] < IMP_RANK[b] ? e.imp : b), items[0].imp);

// Kilka zdarzeń o tej samej chwili = jeden znacznik z liczbą. Zdarzenie z niepewną godziną (tentative) dostaje znacznik bez linii; grupa ma linię,
// gdy zawiera choć jedno zdarzenie z pewną godziną, a jej kolor to najwyższa waga wśród takich zdarzeń.
export function groupNews(events) {
  const by = new Map();
  for (const e of events) {
    if (e.allDay) continue;
    if (!by.has(e.t)) by.set(e.t, []);
    by.get(e.t).push(e);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([tt, items]) => {
    items.sort((a, b) => IMP_RANK[a.imp] - IMP_RANK[b.imp] || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const sure = items.filter((e) => !e.tentative);
    return { key: `n:${tt}`, kind: 'news', t: tt, items, count: items.length, imp: bestImp(sure.length ? sure : items), line: sure.length > 0, tentative: sure.length === 0 };
  });
}
// ---- zakres dnia handlowego CME dla zdarzeń całodziennych ----
// [U] 04.11.2026 «nie ma zakrywac calego pola wykresu tylko np kolorowy pasek na dole lub na gorze pokazujacy zakres czasowy newsa»; wybory użytkownika:
// zakres = dzień handlowy CME, czyli 18:00 ET dnia poprzedniego do 17:00 ET danego dnia; miejsce = na dole pola, tuż nad osią czasu.
// Zakres liczony przez strefę America/New_York (Intl), nie stałym offsetem, więc dni zmiany czasu mają 22 h (marzec) i 24 h (listopad) zamiast 23 h.
// To tylko rysowanie: semantyka „dnia” w filtrach i statystykach (news.mjs dayEnd/sameDay, bt-filtr dayTags) zostaje północ–północ ET.
// Czyste liczenie granic (Intl, America/New_York) mieszka w dzien-handlowy.js, bo importuje je też serwer; tu reeksport dla widoków newsów.
export { tradingDayRange };
// „pt 20.11”: dzień tygodnia i data dnia ET (niezależnie od strefy wykresu), żeby napis nie mylił, gdy początek paska jest poza ekranem.
export function dayShort(day, loc = locale()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  if (!m) return '';
  // skrót dnia tygodnia z kropką w polskim („pt.”) bez kropki, w angielskim („Fri”) bez zmian
  const wd = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))).replace(/\.$/, '');
  return `${wd} ${m[3]}.${m[2]}`;
}
const rangeOf = (day) => { const r = tradingDayRange(day); return r ? { r0: r.from, r1: r.to } : {}; };
// Zdarzenia całodzienne (Bank Holiday, OPEX) jako etykieta dnia u góry wykresu, bez linii, i pasek zakresu u dołu (r0, r1). Jedna etykieta na dzień ET.
export function dayLabelsNews(events) {
  const by = new Map();
  for (const e of events) if (e.allDay) { if (!by.has(e.day)) by.set(e.day, []); by.get(e.day).push(e); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, items]) => {
    items.sort((a, b) => IMP_RANK[a.imp] - IMP_RANK[b.imp]);
    return { key: `nd:${day}`, kind: 'news', day, t0: items[0].t, t1: items[0].t + 86400, ...rangeOf(day), items, imp: bestImp(items), text: `${items.map(eventName).join(' · ')} · ${dayShort(day)}` };
  });
}
// Earningsy z godziną (BMO przed 9:30 ET, AMC od 16:00 ET, w trakcie sesji z rzeczywistej chwili raportu) mają znacznik; bez pory (allDay) etykietę dnia.
export function groupEarnings(events) {
  const by = new Map();
  for (const e of events) {
    if (e.allDay) continue;
    if (!by.has(e.t)) by.set(e.t, []);
    by.get(e.t).push(e);
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([tt, items]) => {
    items.sort((a, b) => a.cls - b.cls || (a.symbol < b.symbol ? -1 : 1));
    return { key: `e:${tt}`, kind: 'earn', t: tt, items, count: items.length, cls: items[0].cls };
  });
}
export function dayLabelsEarn(events) {
  const by = new Map();
  for (const e of events) if (e.allDay) { if (!by.has(e.day)) by.set(e.day, []); by.get(e.day).push(e); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, items]) => {
    items.sort((a, b) => a.cls - b.cls || (a.symbol < b.symbol ? -1 : 1));
    const shown = items.slice(0, 3).map((e) => e.symbol).join(', ');
    const more = items.length > 3 ? ` +${items.length - 3}` : '';
    return { key: `ed:${day}`, kind: 'earn', day, t0: items[0].t, t1: items[0].t + 86400, ...rangeOf(day), items, cls: items[0].cls, text: `${t('Wyniki')}: ${shown}${more} · ${dayShort(day)}` };
  });
}

// Model jednego wykresu: tylko włączone warstwy, po filtrach. news/earn: surowe tablice z API (mogą być puste albo null).
export function buildNewsModel({ news = [], earn = [], prefs }) {
  const p = normNews(prefs);
  const ns = p.news ? filterNews(news, p) : [], es = p.earnings ? filterEarn(earn, p) : [];
  return { groups: groupNews(ns), eGroups: groupEarnings(es), labels: [...dayLabelsNews(ns), ...dayLabelsEarn(es)], on: p.news || p.earnings };
}

// ---- geometria (piksele) ----
export const NEWS_DASH = [4, 4];
const LABEL_ROWS = 3, MARK_R = 5;
// Pasek zakresu dnia: 2 px wysokości przy dolnej krawędzi pola, co najmniej 4 px szerokości (święto na wykresie 1D bez świecy).
// [U] 04.11.2026 «niech ten pasek bedzie bardzo delikatny i cienki i tylko po najechaniu na tekst danego dnia»: pasek jest domyślnie niewidoczny, pojawia się
// wyłącznie dla napisu dnia, nad którym jest wskaźnik albo fokus z klawiatury (dymek napisu zostaje); geometria liczy paski wszystkich dni, rysunek pokazuje jeden.
const BAND_H = 2, BAND_MIN_W = 4;
// Odwzorowanie chwili UTC na piksel: początek świecy i = x(i − 0,5) (jak w nakładkach sesji). sc.x(i) to skala indeksu świecy, candles posortowane po czasie.
// future: rosnące początki świec za ostatnią świecą (backtest, 04.11.2026 «maja sie rysowac w przyszlosci tamgdzie nie ma swieczek»; bt-czas.js futureBuckets), te same czasy co
// punkty bez wartości na osi wykresu: indeksy n, n + 1, ... Punkty odniesienia za początkiem ostatniej świecy to [ostatnia świeca, ...future]; wewnątrz przedziału między sąsiednimi
// punktami pozycja jest interpolowana liniowo, dokładnie jak timeToIndexF między świecami, więc po dojściu kursora (świece zajmują te same punkty) nic nie przeskakuje, także przy
// przerwie 17:00-18:00 ET, weekendzie i zmianie czasu. Zwraca { k, a, b } (k = numer punktu licząc od ostatniej świecy, a = jego czas, b = czas następnego punktu albo null) albo null.
function extPoint(candles, future, tt) {
  const n = candles?.length ?? 0;
  if (!n || !(tt >= candles[n - 1][0])) return null;
  const last = candles[n - 1][0], F = future?.length ?? 0, from = future?.from || 0;
  let lo = from, hi = F - 1, j = from - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (future[m] <= tt) { j = m; lo = m + 1; } else hi = m - 1; }
  return { k: j - from + 1, a: j < from ? last : future[j], b: j + 1 < F ? future[j + 1] : null };
}
// czy siatka ma jeszcze punkty za ostatnią świecą (future.from = punkty zajęte już przez świece)
const hasFuture = (future) => !!future && future.length - (future.from || 0) > 0;
export function timeToX(candles, step, sc, future = null) {
  return (tt) => {
    const n = candles?.length ?? 0;
    if (hasFuture(future) && n && tt >= candles[n - 1][0] + step) {
      const p = extPoint(candles, future, tt);
      if (p.b == null && tt > p.a + step) return null; // dalej niż siatka: poza oknem
      return sc.x(n - 1 + p.k + (p.b == null ? (tt - p.a) / step : (tt - p.a) / (p.b - p.a)) - 0.5);
    }
    const i = timeToIndexF(candles, tt, step);
    return i == null ? null : sc.x(i - 0.5);
  };
}
// Krawędzie paska zakresu [from, to): from(t) = lewa krawędź, to(t) = prawa. Różnią się od timeToX w przerwach między świecami (17:00-18:00 ET, weekend, święto bez sesji):
// początek w przerwie schodzi na lewą krawędź następnej świecy, koniec na prawą krawędź ostatniej świecy przed nim (indeksy świec nie znają przerw, więc
// liniowa interpolacja rozmazałaby pasek na pół weekendu). Na 1D (świeca ≈ doba) krawędzie przyciągają się do całych świec: pasek obejmuje świecę dnia handlowego.
export function bandX(candles, step, sc, future = null) {
  const n = candles?.length ?? 0;
  const daily = step >= 79200 && step <= 108000;
  const X = (i) => sc.x(i - 0.5);
  return {
    from(tt) {
      if (n && hasFuture(future) && tt >= candles[n - 1][0] + step) {
        const p = extPoint(candles, future, tt);
        if (tt >= p.a + step) return X(n + p.k);
        return X(daily ? n - 1 + p.k : n - 1 + p.k + (tt - p.a) / (p.b == null ? step : p.b - p.a));
      }
      const i = n ? timeToIndex(candles, tt, step) : null;
      if (i == null) return null;
      const k = Math.floor(i + 1e-9);
      if (k >= 0 && k < n - 1 && tt >= candles[k][0] + step) return X(k + 1);
      return X(daily ? k : timeToIndexF(candles, tt, step));
    },
    to(tt) {
      if (n && hasFuture(future) && tt - 1 >= candles[n - 1][0] + step) {
        const p = extPoint(candles, future, tt - 1);
        if (daily || tt - 1 >= p.a + step) return X(n + p.k);
        return X(n - 1 + p.k + Math.min(1, (tt - p.a) / step));
      }
      const j = n ? timeToIndex(candles, tt - 1, step) : null;
      if (j == null) return null;
      const k = Math.floor(j + 1e-9);
      if (k >= 0 && k < n - 1) {
        if (daily || tt - 1 >= candles[k][0] + step) return X(k + 1);
        return X(k + Math.min(1, (tt - candles[k][0]) / step));
      }
      return X(daily ? k + 1 : timeToIndexF(candles, tt, step));
    },
  };
}
// m: model z buildNewsModel; xt(t) → px albo null; box { left, right, top, bottom }. Wynik:
//  lines: pionowe linie newsów z pewną godziną; marks: znaczniki u dołu pola (newsy i earningsy), earningsy podniesione, gdy stoją tuż przy newsie;
//  labels: etykiety dni u góry w co najwyżej trzech rzędach; hits: prostokąty dla przycisków dostępnych z klawiatury, dotyku i myszy (ten sam zapis w SVG i LWC).
export function newsGeometry(m, xt, box, bx = null) {
  const lines = [], marks = [], labels = [], hits = [], bands = [];
  const inside = (x) => x != null && Number.isFinite(x) && x >= box.left - MARK_R && x <= box.right + MARK_R;
  // pasek zakresu dnia (zdarzenia całodzienne) przy osi czasu; jeden na etykietę dnia, klucz paska = klucz etykiety (pokazuje go najechanie na napis)
  const bandFrom = bx?.from || xt, bandTo = bx?.to || xt;
  for (const l of m.labels) {
    if (!Number.isFinite(l.r0) || !Number.isFinite(l.r1)) continue;
    let xa = bandFrom(l.r0), xb = bandTo(l.r1);
    if (xa == null || xb == null || !Number.isFinite(xa) || !Number.isFinite(xb)) continue;
    if (xb - xa < BAND_MIN_W) { const mid = (xa + xb) / 2; xa = mid - BAND_MIN_W / 2; xb = mid + BAND_MIN_W / 2; }
    if (xb <= box.left || xa >= box.right) continue;
    const a = Math.max(xa, box.left), b = Math.min(xb, box.right);
    bands.push({ key: l.key, kind: l.kind, imp: l.imp, cls: l.cls, x: a, w: b - a, y: box.bottom - BAND_H, h: BAND_H, clipL: xa < box.left, clipR: xb > box.right });
  }
  const yMark = box.bottom - 9;
  for (const g of m.groups) {
    const x = xt(g.t);
    if (!inside(x)) continue;
    if (g.line) lines.push({ key: g.key, x, imp: g.imp, y1: box.top, y2: box.bottom });
    marks.push({ key: g.key, kind: 'news', x, y: yMark, count: g.count, imp: g.imp, hollow: g.tentative });
  }
  for (const g of m.eGroups) {
    const x = xt(g.t);
    if (!inside(x)) continue;
    const near = marks.some((k) => k.kind === 'news' && Math.abs(k.x - x) < 14);
    marks.push({ key: g.key, kind: 'earn', x, y: near ? yMark - 13 : yMark, count: g.count, cls: g.cls, hollow: false });
  }
  const rowEnd = [];
  for (const l of m.labels) {
    // napis stoi na początku paska (zakres dnia handlowego), a bez zakresu (stare dane) na północy ET
    const xa = Number.isFinite(l.r0) ? bandFrom(l.r0) : xt(l.t0), xb = Number.isFinite(l.r1) ? bandTo(l.r1) : xt(l.t1);
    if (xa == null || xb == null || xb <= box.left || xa >= box.right) continue;
    const x = Math.max(xa, box.left) + 4, w = Math.ceil(l.text.length * 5.9) + 8;
    let row = rowEnd.findIndex((end) => x >= end + 6);
    if (row < 0) row = rowEnd.length < LABEL_ROWS ? rowEnd.length : LABEL_ROWS - 1;
    rowEnd[row] = x + w;
    labels.push({ key: l.key, kind: l.kind, x, y: box.top + 11 + row * 13, w, imp: l.imp, cls: l.cls, text: l.text });
  }
  // przycisk znacznika z liczbą obejmuje też liczbę (rysowaną od x + 8), żeby obwódka fokusu jej nie przecinała (przegląd 29.10.2026)
  for (const k of marks) { const extra = k.count > 1 ? String(k.count).length * 6 + 2 : 0; hits.push({ key: k.key, x: k.x + extra / 2, y: k.y, w: 24 + extra, h: 24 }); }
  for (const l of labels) hits.push({ key: l.key, x: l.x + l.w / 2 - 4, y: l.y - 4, w: Math.max(20, l.w), h: 18 });
  return { lines, marks, labels, hits, bands };
}
export const markPath = (kind, x, y) => (kind === 'earn'
  ? `M${f1(x)} ${f1(y - 5)}L${f1(x + 5)} ${f1(y)}L${f1(x)} ${f1(y + 5)}L${f1(x - 5)} ${f1(y)}Z`
  : `M${f1(x - 4.5)} ${f1(y + 4)}L${f1(x + 4.5)} ${f1(y + 4)}L${f1(x)} ${f1(y - 4.5)}Z`);
const f1 = (n) => Math.round(n * 10) / 10;
export const tokenOf = (o) => (o.kind === 'earn' ? EARN_TOKENS[o.cls] : NEWS_TOKENS[o.imp]);

// Podgląd SVG: warstwa pod świecami (linie) i nad świecami (znaczniki, etykiety). Kolory przez var(--token) i klasy CSS (.nwl, .nwm, .nwd).
export function newsSvg(geo) {
  const under = geo.lines.map((l) => `<line class="nwl" x1="${f1(l.x)}" x2="${f1(l.x)}" y1="${f1(l.y1)}" y2="${f1(l.y2)}" stroke-dasharray="${NEWS_DASH.join(' ')}" style="stroke:var(${NEWS_TOKENS[l.imp]})"/>`).join('');
  const bandSvg = (geo.bands || []).map((b) => `<rect class="nwb ${b.kind}" data-k="${esc(b.key)}" x="${f1(b.x)}" y="${f1(b.y)}" width="${f1(b.w)}" height="${b.h}" style="fill:var(${tokenOf(b)})"/>`).join('');
  const over = bandSvg + geo.marks.map((k) => {
    const c = `var(${tokenOf(k)})`;
    const style = k.hollow ? `fill:none;stroke:${c}` : `fill:${c};stroke:none`;
    return `<path class="nwm ${k.kind}${k.hollow ? ' hollow' : ''}" d="${markPath(k.kind, k.x, k.y)}" style="${style}"/>` +
      (k.count > 1 ? `<text class="nwc" x="${f1(k.x + 8)}" y="${f1(k.y + 4)}" style="fill:${c}">${k.count}</text>` : '');
  }).join('') + geo.labels.map((l) => `<text class="nwd ${l.kind}" x="${f1(l.x)}" y="${f1(l.y)}" style="fill:var(${tokenOf(l)})">${esc(l.text)}</text>`).join('');
  return { under, over };
}

// ---- dymki ----
// fmt: { HM, DAY } (Intl.DateTimeFormat w strefie wykresu). Zwraca { html, text } (text do aria-label przycisku).
export function groupTip(g, fmt) {
  const when = `${fmt.DAY.format(new Date((g.t ?? g.t0) * 1000))} ${g.t != null ? fmt.HM.format(new Date(g.t * 1000)) : ''}`.trim();
  if (g.kind === 'earn') {
    const rows = g.items.map((e) => ({ c: EARN_TOKENS[e.cls], main: e.symbol, sub: [e.name !== e.symbol ? e.name : '', t('klasa {n}', { n: e.cls }), sessionText(e.session), Number.isInteger(e.quarter) && Number.isInteger(e.year) ? `Q${e.quarter} ${e.year}` : '', Number.isFinite(e.epsEst) ? `${t('szac. EPS')} ${num(e.epsEst, 2)}` : ''].filter(Boolean).join(' · ') }));
    return tipOf(t('Wyniki spółek'), when, rows);
  }
  const rows = g.items.map((e) => ({ c: NEWS_TOKENS[e.imp], main: eventName(e), w: impWord(e.imp), sub: e.tentative ? t('godzina niepewna') : '' }));
  return tipOf(t('Newsy USD'), when, rows);
}
export function dayTip(l, fmt) {
  const when = fmt.DAY.format(new Date(l.t0 * 1000));
  if (l.kind === 'earn') return tipOf(t('Wyniki spółek'), when, l.items.map((e) => ({ c: EARN_TOKENS[e.cls], main: e.symbol, sub: [t('klasa {n}', { n: e.cls }), sessionText(e.session)].join(' · ') })));
  return tipOf(t('Newsy USD'), when, l.items.map((e) => ({ c: NEWS_TOKENS[e.imp], main: eventName(e), w: impWord(e.imp), sub: '' })));
}
function tipOf(head, when, rows) {
  const html = `<b>${esc(head)}</b> <span class="t-muted">${esc(when)}</span>` +
    rows.slice(0, 12).map((r) => `<div class="nws-row"><i class="nws-dot" style="background:var(${r.c})" aria-hidden="true"></i><span>${r.w ? `<span class="sr">${esc(r.w)}: </span>` : ''}<b>${esc(r.main)}</b>${r.sub ? ` <span class="t-muted">${esc(r.sub)}</span>` : ''}</span></div>`).join('') +
    (rows.length > 12 ? `<div class="t-muted">${esc(t('i jeszcze {n}', { n: rows.length - 12 }))}</div>` : '');
  const text = `${head} ${when}: ${rows.map((r) => { const x = [r.w, r.sub].filter(Boolean).join(', '); return r.main + (x ? ` (${x})` : ''); }).join(', ')}`;
  return { html, text };
}
export function tipFor(key, model, fmt) {
  const g = model.groups.find((x) => x.key === key) || model.eGroups.find((x) => x.key === key);
  if (g) return groupTip(g, fmt);
  const l = model.labels.find((x) => x.key === key);
  return l ? dayTip(l, fmt) : null;
}

// ---- dane z lokalnego serwera ----
const DAY = 86400, MAX_WINDOW = 399 * DAY, TTL_MS = 10 * 60_000, RETRY_MS = 60_000;
// Pamięć okien z GET /api/news i /api/earnings: jedno okno na rodzaj, rozszerzane o brakujące strony. Zapytanie tylko, gdy kadr wychodzi poza okno albo okno jest starsze niż 10 minut.
// Błąd sieci lub serwera nie przerywa wykresu: kolejna próba najwcześniej po minucie, a nakładka pokazuje to, co już ma.
export function createNewsData({ fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now() } = {}) {
  const kinds = { news: { path: '/api/news', win: null, events: [], at: 0, failAt: 0, busy: null }, earn: { path: '/api/earnings', win: null, events: [], at: 0, failAt: 0, busy: null } };
  let version = 0;
  async function ensure(kind, from, to) {
    const k = kinds[kind];
    if (!k || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return false;
    from = Math.floor(from / DAY) * DAY - 2 * DAY; to = Math.ceil(to / DAY) * DAY + 2 * DAY;
    // Kadr szerszy niż okno serwera (399 dni) przycinamy wokół KOŃCA kadru (tam jest trade i bieżące newsy) i to przycięte okno liczy się jako pokrycie kadru;
    // inaczej okno nigdy nie pokrywałoby kadru i każde ensure pytałoby serwer od nowa (pętla: odpowiedź → przerysowanie → ensure).
    if (to - from > MAX_WINDOW) from = to - MAX_WINDOW;
    const covered = k.win && k.win.from <= from && k.win.to >= to;
    if (covered && now() - k.at < TTL_MS) return false;
    if (k.busy) return k.busy;
    if (k.failAt && now() - k.failAt < RETRY_MS) return false;
    let a = from, b = to;
    if (k.win && covered) { a = k.win.from; b = k.win.to; } // tylko odświeżenie
    else if (k.win && k.win.from <= to && k.win.to >= from && Math.max(to, k.win.to) - Math.min(from, k.win.from) <= MAX_WINDOW) { a = Math.min(from, k.win.from); b = Math.max(to, k.win.to); }
    k.busy = (async () => {
      try {
        const r = await fetchImpl(`${k.path}?from=${Math.floor(a)}&to=${Math.floor(b)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (!Array.isArray(j.events)) throw new Error('bad');
        // wersja rośnie (a wykres przerysowuje się) tylko, gdy zdarzenia faktycznie się zmieniły; samo odświeżenie tych samych danych nie wywołuje kolejnego ensure
        const changed = JSON.stringify(j.events) !== JSON.stringify(k.events);
        k.events = j.events; k.win = { from: a, to: b }; k.at = now(); k.failAt = 0;
        if (changed) version++;
        return changed;
      } catch { k.failAt = now(); return false; } finally { k.busy = null; }
    })();
    return k.busy;
  }
  return { ensure, events: (kind) => kinds[kind].events, version: () => version, failed: (kind) => !!kinds[kind].failAt };
}
export const feed = createNewsData();

// Okno danych dla świec wykresu: od pierwszej świecy do ostatniej (+ doba, bo przyszły news tuż za ostatnią świecą też ma być na osi).
export function candleWindow(candles) {
  if (!candles?.length) return null;
  return { from: candles[0][0], to: candles[candles.length - 1][0] + DAY };
}
