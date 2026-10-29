// Karty panelu „Dzisiaj” (newsy USD dnia) i „Wyniki spółek” (earningsy) oraz sekcje Ustawienia → Wykresy → Newsy / Earningsy (pakiet D, 1.4.0).
// Logika widoku to czyste funkcje (newsTodayView, earnTodayView); sklep (createNewsCards) pobiera dane z lokalnego serwera raz, potem co minutę
// przelicza widok BEZ zapytań do sieci i odświeża dane najwyżej co kwadrans albo po zmianie dnia lub strefy. Kolory tylko z tokenów (NEWS_TOKENS, EARN_TOKENS).
// English: panel cards (today's USD news, earnings) and their settings sections; pure view functions plus a store that refetches rarely and recomputes every minute.
import * as F from './format.js';
import { t, locale } from './i18n.js';
import { eventName, impWord, sessionText, NEWS_TOKENS, EARN_TOKENS, NEWS_IMPS, EARN_CLASSES, normNews } from './newsy.js';

const { esc } = F;
const L = (s) => esc(t(s));
export const REFRESH_MS = 15 * 60_000, TICK_MS = 60_000;
export const FRED_ATTRIBUTION = 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.';

// ---- widoki (czyste) ----
// 29.10.2026 decyzja użytkownika: bez odliczania do następnego newsa. Minutowe przeliczanie zostaje tylko dla przygaszania minionych.
// ta sama godzina: najwyższa waga pierwsza, jak w dymku na wykresie (przegląd 29.10.2026)
const ROW_RANK = { high: 0, medium: 1, low: 2 };
// today: odpowiedź GET /api/news/today ({ day, events, tomorrow }), prefs: overlays (filtr wag).
// Filtr wag dotyczy godzinowych newsów; informacje o OPEX i Bank Holiday zawsze (o to prosił użytkownik), niezależnie od filtra na wykresie.
// 29.10.2026 decyzja użytkownika: karta tylko z dniem dzisiejszym (bez zapowiedzi „Jutro OPEX” i „Jutro Bank Holiday”).
export function newsTodayView({ today, prefs, nowSec }) {
  const p = normNews(prefs), evs = today?.events || [];
  const rows = evs.filter((e) => !e.allDay && p.newsImp[e.imp]).sort((a, b) => a.t - b.t || ROW_RANK[a.imp] - ROW_RANK[b.imp] || (a.name < b.name ? -1 : 1))
    .map((e) => ({ t: e.t, name: eventName(e), imp: e.imp, tentative: !!e.tentative, past: e.t < nowSec, next: false }));
  const first = rows.find((r) => !r.past);
  if (first) first.next = true;
  const banners = [];
  const o = evs.find((e) => e.kind === 'opex'), h = evs.find((e) => e.kind === 'holiday');
  if (o) banners.push({ kind: 'opex', text: o.variant === 'quarterly' ? t('Dziś OPEX kwartalny (triple witching)') : t('Dziś OPEX miesięczny') });
  if (h) banners.push({ kind: 'holiday', text: t('Dziś Bank Holiday') });
  return { day: today?.day || '', rows, banners, empty: !rows.length && !evs.length };
}
// today: odpowiedź GET /api/earnings/today ({ amcToday, bmoTomorrow, soon, ... }); prefs: filtr klas.
export function earnTodayView({ today, prefs }) {
  const p = normNews(prefs), keep = (e) => p.earnCls[e.cls];
  const row = (e, withDay) => ({ symbol: e.symbol, name: e.name, cls: e.cls, sub: withDay ? `${F.WEEKDAYS[F.weekdayIdx(e.day)]} ${F.shortDate(e.day)} · ${sessionText(e.session)}` : '', epsEst: e.epsEst });
  const groups = [
    { id: 'amc', title: t('Dziś po zamknięciu'), rows: (today?.amcToday || []).filter(keep).map((e) => row(e, false)) },
    { id: 'bmo', title: t('Jutro przed otwarciem'), rows: (today?.bmoTomorrow || []).filter(keep).map((e) => row(e, false)) },
    { id: 'soon', title: t('Najbliższe z klasy 1'), rows: (today?.soon || []).filter(keep).map((e) => row(e, true)) },
  ].filter((g) => g.rows.length);
  return { groups, empty: !groups.length };
}

// ---- HTML kart ----
const timeFmt = (tz) => new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: tz });
const dot = (token) => `<i class="nws-dot" style="background:var(${token})" aria-hidden="true"></i>`;
// limit > 0: wersja kompaktowa do lewego panelu; najpierw nadchodzące, potem ostatnie minione, reszta jako „+N więcej” (otwiera Kalendarz na dzisiaj)
export function pickRows(rows, limit) {
  if (!limit || rows.length <= limit) return { shown: rows, hidden: 0 };
  const fut = rows.filter((r) => !r.past).slice(0, limit), slots = limit - fut.length;
  const shown = [...(slots > 0 ? rows.filter((r) => r.past).slice(-slots) : []), ...fut];
  return { shown, hidden: rows.length - shown.length };
}
const moreBtn = (n, act = 'cal-today') => (n > 0 ? `<button type="button" class="nws-more" data-act="${act}">${esc(t('+{n} więcej', { n }))}</button>` : '');
export function newsCardHtml(v, { tz, error = false, loaded = true, limit = 0 } = {}) {
  if (!loaded) return `<p class="note">${L('Wczytuję newsy…')}</p>`;
  const f = timeFmt(tz);
  let h = '';
  for (const b of v.banners) h += `<p class="nws-ban ${b.kind}">${esc(b.text)}</p>`;
  if (v.rows.length) {
    const pk = pickRows(v.rows, limit);
    h += `<ul class="nws-list${limit ? ' compact' : ''}">${pk.shown.map((r) => `<li class="${r.past ? 'past' : ''}${r.next ? ' next' : ''}"${limit ? ` title="${esc(r.name)}"` : ''}><span class="nws-t">${esc(f.format(new Date(r.t * 1000)))}</span>${dot(NEWS_TOKENS[r.imp])}<span class="nws-n"><span class="sr">${esc(impWord(r.imp))}: </span>${esc(r.name)}${r.tentative ? ` <small class="muted">${L('godzina niepewna')}</small>` : ''}</span></li>`).join('')}</ul>${moreBtn(pk.hidden)}`;
  } else if (!v.banners.length) h += `<p class="note">${error ? L('Nie udało się wczytać newsów.') : v.empty ? L('Brak newsów na dziś.') : L('Dziś bez newsów o wybranych wagach.')}</p>`;
  return h;
}
export function earnCardHtml(v, { error = false, loaded = true, hasKey = true, limit = 0 } = {}) {
  if (!loaded) return `<p class="note">${L('Wczytuję wyniki spółek…')}</p>`;
  if (v.empty) return `<p class="note">${error ? L('Nie udało się wczytać wyników spółek.') : hasKey ? L('Brak wyników wybranych klas w najbliższych dniach.') : L('Bez klucza Finnhub nie mamy terminów wyników. Dodasz go w Ustawienia → Wykresy → Earningsy.')}</p>`;
  let left = limit || Infinity, hidden = 0;
  const groups = v.groups.map((g) => { const rows = g.rows.slice(0, Math.max(0, left)); left -= rows.length; hidden += g.rows.length - rows.length; return { ...g, rows }; }).filter((g) => g.rows.length);
  return groups.map((g) => `<p class="lbl nws-gh">${esc(g.title)}</p><ul class="nws-list${limit ? ' compact' : ''}">${g.rows.map((r) => `<li><span class="nws-t"><b>${esc(r.symbol)}</b></span>${dot(EARN_TOKENS[r.cls])}<span class="nws-n">${r.sub ? `<span class="sr">${esc(t('klasa {n}', { n: r.cls }))}: </span>${esc(r.sub)}` : `<small class="muted">${esc(t('klasa {n}', { n: r.cls }))}</small>`}</span></li>`).join('')}</ul>`).join('') + moreBtn(hidden, 'cal-earn');
}

// ---- sklep danych kart ----
// Dane pobierane raz (dziś + najbliższy tydzień newsów + dziś earningsów), potem tylko przeliczane lokalnie. Błędy sieci nie wywracają panelu: karta pokazuje komunikat.
export function createNewsCards({ getTz = () => '', getPrefs = () => ({}), fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(), onChange = () => {} } = {}) {
  const S = { news: null, earn: null, at: 0, tz: '', day: '', newsErr: false, earnErr: false, loaded: false, busy: null, timer: 0, wantEarn: false };
  const sec = () => Math.floor(now() / 1000);
  const localDay = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now()));
  const get = async (url) => { const r = await fetchImpl(url, { cache: 'no-store' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
  async function load() {
    if (S.busy) return S.busy;
    const tz = getTz() || '';
    S.busy = (async () => {
      const n = sec();
      const [a, c] = await Promise.allSettled([
        get(`/api/news/today${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`),
        S.wantEarn ? get(`/api/earnings/today${tz ? `?tz=${encodeURIComponent(tz)}` : ''}`) : Promise.resolve(S.earn),
      ]);
      S.newsErr = a.status !== 'fulfilled'; S.earnErr = c.status !== 'fulfilled';
      if (a.status === 'fulfilled') S.news = a.value;
      if (c.status === 'fulfilled') S.earn = c.value;
      S.at = now(); S.tz = tz; S.day = localDay(tz); S.loaded = true;
      S.busy = null;
      onChange();
    })();
    return S.busy;
  }
  // Wywoływana co minutę: lokalne przeliczenie; dane z serwera tylko po kwadransie, zmianie strefy albo dnia.
  async function tick() {
    const tz = getTz() || '';
    if (!S.loaded || now() - S.at >= REFRESH_MS || tz !== S.tz || localDay(tz) !== S.day) return load();
    onChange();
    return null;
  }
  return {
    state: S,
    load, tick,
    start() { if (!S.timer) S.timer = setInterval(() => { tick(); }, TICK_MS); return load(); },
    stop() { clearInterval(S.timer); S.timer = 0; },
    wantEarnings(on) { if (on && !S.wantEarn) { S.wantEarn = true; if (S.loaded) load(); } else S.wantEarn = !!on; },
    news({ limit = 0 } = {}) {
      const tz = S.tz || getTz() || undefined;
      return { html: newsCardHtml(newsTodayView({ today: S.news, prefs: getPrefs(), nowSec: sec() }), { tz, error: S.newsErr && !S.news, loaded: S.loaded, limit }) };
    },
    earnings(meta = {}, { limit = 0 } = {}) {
      return { html: earnCardHtml(earnTodayView({ today: S.earn, prefs: getPrefs() }), { limit, error: S.earnErr && !S.earn, loaded: S.loaded && (!S.wantEarn || !!S.earn || S.earnErr), hasKey: !!meta.hasFinnhubKey }) };
    },
  };
}

// ---- Ustawienia → Wykresy: sekcje Newsy i Earningsy ----
const fmtAt = (ms, tz) => (ms ? new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz || undefined }).format(new Date(ms)) : '-');
const kvRow = (k, v) => `<div class="sp-kv"><span>${esc(k)}</span><b>${v}</b></div>`;
const NEWS_IMP_LABEL = { high: 'Czerwone', medium: 'Pomarańczowe', low: 'Żółte', holiday: 'Szare (Bank Holiday)', opex: 'OPEX' };
const keyRow = (id, kind, has, msg, descId) => `<div class="sp-f"><label class="lbl" for="${id}">${L(kind === 'fred' ? 'Klucz FRED' : 'Klucz Finnhub')}</label>
  <div class="sp-keyrow"><input id="${id}" class="sp-in sp-key" type="password" autocomplete="off" spellcheck="false" maxlength="100" data-fk="${id}" placeholder="${esc(has ? t('Zapisany. Wklej nowy, aby zmienić') : t('Wklej klucz (opcjonalnie)'))}" aria-describedby="${descId}">
    <button type="button" class="btn sm" data-act="${kind === 'fred' ? 'news-key-save' : 'earn-key-save'}" data-fk="${id}-save">${L('Zapisz')}</button></div>
  <p class="note" id="${descId}" aria-live="polite">${msg ? `<span class="${msg.error ? 'warnb' : 'okb'}">${esc(msg.text)}</span> ` : ''}${kind === 'fred' ? L('Opcjonalny. Daty z lat 2010–2026 są w programie, klucz odświeża przyszłe terminy raz dziennie. Darmowy klucz założysz na fred.stlouisfed.org. Trafia tylko do pliku .env na tym komputerze, nie do Notion ani synchronizacji.') : L('Opcjonalny. Historia działa bez klucza, nowe terminy wyników go wymagają. Darmowy klucz założysz na finnhub.io. Trafia tylko do pliku .env na tym komputerze, nie do Notion ani synchronizacji.')}</p></div>`;

// c: settings.chart (po sanitizeChart), st: { news, earnings } ze statusów serwera (albo null przed wczytaniem), meta: /api/meta, msg: { fred, finnhub }
export function newsSettingsHtml({ c, st, meta = {}, msg = {}, chk }) {
  const o = c.overlays, ns = st?.news;
  const lines = [];
  if (ns) {
    const h = ns.history || {}, by = h.byImp || {};
    lines.push(kvRow(t('Feed tygodnia'), esc(ns.feed?.lastOkAt ? fmtAt(ns.feed.lastOkAt) : t('jeszcze nie pobrany'))));
    lines.push(kvRow('FRED', esc(ns.fred?.source === 'key' ? t('z Twojego klucza, {at}', { at: fmtAt(ns.fred.lastOkAt) }) : ns.fred?.source === 'shipped' ? t('daty z wydania programu') : t('brak dat'))));
    lines.push(kvRow(t('Historia od'), esc(h.from || '-')));
    if (h.verified?.months) lines.push(kvRow(t('Zgodność z ForexFactory'), esc(t('zweryfikowane na próbie {n} miesięcy ({date})', { n: h.verified.months, date: h.verified.checked.split('-').reverse().join('.') }))));
    lines.push(kvRow(t('Zdarzeń w historii'), esc(t('{n} (czerwone {r}, pomarańczowe {o})', { n: h.officialEvents ?? 0, r: by.high ?? 0, o: by.medium ?? 0 }))));
  }
  return `<h3 class="sp-g" id="ch-g-news">${L('Newsy')}</h3>
      <div class="sp-f">${chk('news', o.news, 'Newsy na wykresie')}
        <p class="note">${L('Linia i znacznik w godzinie publikacji, w kolorze najważniejszej wagi. Godziny w strefie wykresu. Domyślnie wyłączone.')}</p></div>
      <div class="sp-f"><span class="lbl" id="ch-news-imp">${L('Wagi na wykresie i na karcie')}</span>
        <div class="sp-chk" role="group" aria-labelledby="ch-news-imp">${NEWS_IMPS.map((k) => chk(`newsImp-${k}`, o.newsImp[k], NEWS_IMP_LABEL[k])).join('')}</div>
        <p class="note">${L('Szare to dni wolne (Bank Holiday), OPEX to wygasanie opcji w 3. piątek miesiąca. Zdarzenia całodzienne są etykietą dnia, bez linii.')}</p></div>
      <div class="sp-f">${chk('newsCard', c.newsCard, 'Karta „Dzisiaj” w panelu')}
        <p class="note">${L('Dzisiejsze newsy USD oraz wzmianka o OPEX i Bank Holiday. Godziny w strefie wykresu.')}</p></div>
      ${keyRow('sp-fredkey', 'fred', meta.hasFredKey, msg.fred, 'sp-fredkey-d')}
      <div class="sp-f sp-kvs">${lines.join('') || `<p class="note">${L('Wczytuję stan…')}</p>`}
        <details class="sp-more"><summary>${L('Czego brakuje w historii')}</summary><p class="note">${L('Brakuje przemówień prezydenta, sekretarza skarbu i członków FOMC poza przewodniczącym. Godziny przemówień przewodniczącego są niepewne. Existing i Pending Home Sales, wstępne PMI S&P Global i raport walutowy Skarbu pojawiają się tylko z cotygodniowego feedu, od dnia instalacji.')}</p></details>
        <details class="sp-more"><summary>${L('Źródła i prawa')}</summary><p class="note">${L('Fed (kalendarz FOMC, przemówienia), FRED i ForexFactory (tylko publiczny feed eksportu z bieżącego tygodnia). Nie mamy powiązania z ForexFactory, dane służą do własnego użytku i nie trafiają na karty ani filmy.')}</p>
        <p class="note">${esc(FRED_ATTRIBUTION)}</p></details></div>`;
}
export function earnSettingsHtml({ c, st, meta = {}, msg = {}, chk }) {
  const o = c.overlays, es = st?.earnings, h = es?.history;
  const lines = [];
  if (es) {
    lines.push(kvRow(t('Kalendarz Finnhub'), esc(es.calendar?.lastOkAt ? fmtAt(es.calendar.lastOkAt) : t('jeszcze nie pobrany'))));
    lines.push(kvRow(t('Historia od'), esc(h?.from || '-')));
    lines.push(kvRow(t('Wyników w historii'), esc(String(h?.events ?? 0))));
  }
  const gaps = [...(h?.incomplete || [])];
  const gapList = gaps.length ? `<details class="sp-more"><summary>${esc(t('Spółki z niepełną historią ({n})', { n: gaps.length }))}</summary><p class="note">${esc(gaps.map((g) => `${g.symbol} (${g.count})`).join(', '))}</p>
      <p class="note">${L('Luki wypełnia kalendarz Finnhub, ale dopiero od dnia instalacji. Starszych wyników tych spółek nie odzyskamy.')}</p></details>` : '';
  const ov = Object.entries(es?.overrides || {}).map(([s, n]) => [s, n, false]).concat((es?.extra || []).filter((s) => !(es?.overrides || {})[s]).map((s) => [s, 4, true]));
  const manual = `<div class="sp-f"><span class="lbl" id="ch-earn-man">${L('Ręczne wyjątki klas')}</span>
      ${ov.length ? `<ul class="nws-man">${ov.map(([s, n, ex]) => `<li><b>${esc(s)}</b> <span class="muted">${esc(t('klasa {n}', { n }))}${ex ? ` · ${esc(t('dopisana'))}` : ''}</span> <button type="button" class="btn ghost sm" data-act="earn-class-del" data-v="${esc(s)}" data-fk="earn-del-${esc(s)}" aria-label="${esc(t('Usuń wyjątek {s}', { s }))}">${L('Usuń')}</button></li>`).join('')}</ul>` : `<p class="note">${L('Brak wyjątków.')}</p>`}
      <div class="sp-keyrow"><input id="sp-earn-sym" class="sp-in" type="text" maxlength="10" autocomplete="off" spellcheck="false" autocapitalize="characters" data-fk="earn-sym" placeholder="TICKER" aria-label="${L('Ticker spółki')}">
        <select id="sp-earn-cls" class="sp-in sp-sel" data-fk="earn-cls" aria-label="${L('Klasa')}">${EARN_CLASSES.map((n) => `<option value="${n}">${esc(t('Klasa {n}', { n }))}</option>`).join('')}</select>
        <button type="button" class="btn sm" data-act="earn-class-add" data-fk="earn-add">${L('Dodaj')}</button></div>
      <p class="note" id="sp-earn-man-d" aria-live="polite">${msg.classes ? `<span class="${msg.classes.error ? 'warnb' : 'okb'}">${esc(msg.classes.text)}</span> ` : ''}${L('Przenosi spółkę z S&P 100 do wybranej klasy albo dodaje własną. Terminy nowej spółki pochodzą tylko z Finnhub.')}</p></div>`;
  const counts = h?.classes || {};
  return `<h3 class="sp-g" id="ch-g-earn">${L('Earningsy')}</h3>
      <div class="sp-f">${chk('earnings', o.earnings, 'Earningsy na wykresie')}
        <p class="note">${L('Wyniki spółek z S&P 100 jako romb w chwili ogłoszenia: BMO przed 9:30, AMC po 16:00 czasu Nowego Jorku. Bez pory pokazują się jako etykieta dnia. Domyślnie wyłączone.')}</p></div>
      <div class="sp-f"><span class="lbl" id="ch-earn-cls">${L('Klasy na wykresie i na karcie')}</span>
        <div class="sp-chk" role="group" aria-labelledby="ch-earn-cls">${EARN_CLASSES.map((n) => chk(`earnCls-${n}`, o.earnCls[n], t('Klasa {n}', { n }) + (counts[n] != null ? ` (${counts[n]})` : ''))).join('')}</div>
        <p class="note">${L('Klasa 1 to największe spółki (czerwone), 4 to reszta S&P 100 (szare).')}</p></div>
      <div class="sp-f">${chk('earningsCard', c.earningsCard ?? !!meta.hasFinnhubKey, 'Karta „Wyniki spółek” w panelu')}
        <p class="note">${L('Dziś po zamknięciu, jutro przed otwarciem i najbliższe wyniki klasy 1. Jeśli jej nie ustawisz, pojawi się po dodaniu klucza Finnhub.')}</p></div>
      ${keyRow('sp-fhkey', 'finnhub', meta.hasFinnhubKey, msg.finnhub, 'sp-fhkey-d')}
      <div class="sp-f sp-kvs">${lines.join('') || `<p class="note">${L('Wczytuję stan…')}</p>`}${gapList}
        <p class="note">${L('Źródła: SEC EDGAR (historia) i Finnhub (terminy, własny klucz).')}</p></div>
      ${manual}`;
}
