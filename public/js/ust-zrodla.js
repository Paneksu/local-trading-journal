// N4 (1.6.0): Ustawienia → Źródła danych: skąd dashboard bierze świece (Databento), newsy makro (FRED) i earningsy (Finnhub) i ile to kosztuje.
// Karty źródeł: stan klucza z 4 ostatnimi znakami, „Zapisz i sprawdź” (zapis do .env dopiero po bezpłatnym teście u dostawcy), „Testuj”, „Usuń klucz”.
// Databento: kredyt i limity z potwierdzeniem, codzienne okno 1s NQ z potwierdzeniem kosztu, kolejka z powodem czekania, import historii 1m i okien 1s:
// bezpłatna wycena (get_cost) → wpisanie kwoty → pobranie z postępem. Serwer zostawia swoich strażników (sufity 100 / 125 / 50 / 36 USD), UI ich nie omija.
// Wygląd newsów i earningsów (wagi, klasy, karty, ręczne wyjątki) jest w sekcji Wykresy. Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.2, §5.1.
// N6: te same karty w kroku „Dane rynkowe” pierwszych kroków (wizardHtml: klucze, koszty, kredyt, okno 1s; bez kolejki, importu i limitów do edycji).
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 1: klucze w Ustawieniach z „Testuj” i „Usuń”, zapis wyłącznie do .env przez serwer, nigdy do Notion ani localStorage)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 2: limity, korekta kredytu i import z wyceną i potwierdzeniem kwotą, bez podnoszenia twardych sufitów)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 3: nowa instalacja bez kredytu, dopóki użytkownik go nie wpisze)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 4: codzienne okno 1s NQ domyślnie wyłączone w nowych instalacjach)
import { t, getLang, locale } from './i18n.js';
import { formatDate } from './wybor-daty-logika.js';
import { newsSourceHtml, earnSourceHtml } from './newsy-karty.js';
import { esc, L, gHead, grp, dot, docLink, kv, getJson, postJson, centsUp, amountMatches } from './ust-wspolne.js';

// Instrukcje w README wydania (adres repozytorium z /api/diag); kotwice nagłówków README.md i README.en.md
export const DOCS = {
  candles: { pl: '#wykresy-świecowe', en: '/blob/main/README.en.md#candlestick-charts' },
  news: { pl: '#newsy-makro-i-kalendarz', en: '/blob/main/README.en.md#macro-news-and-calendar' },
  backup: { pl: '#kopia-i-przywracanie', en: '/blob/main/README.en.md#backup-and-restore' },
  files: { pl: '#pliki-projektu', en: '/blob/main/README.en.md#project-files' },
  faq: { pl: '#faq', en: '/blob/main/README.en.md#faq' },
};
export const docUrl = (repo, k) => (repo && DOCS[k] ? repo + DOCS[k][getLang() === 'en' ? 'en' : 'pl'] : '');

// Karty kluczy: pole, przycisk zapisu i opis jak w 1.5.0 (identyfikatory pól zostają: głębokie linki, testy)
const KEYS = {
  databento: { name: 'Databento', input: 'sp-dbkey', save: 'ch-key-save', label: 'Klucz Databento', paste: 'Wklej klucz Databento' },
  fred: { name: 'FRED', input: 'sp-fredkey', save: 'news-key-save', label: 'Klucz FRED', paste: 'Wklej klucz FRED (opcjonalnie)' },
  finnhub: { name: 'Finnhub', input: 'sp-fhkey', save: 'earn-key-save', label: 'Klucz Finnhub', paste: 'Wklej klucz Finnhub (opcjonalnie)' },
};
const SAVE_OF = { 'ch-key-save': 'databento', 'news-key-save': 'fred', 'earn-key-save': 'finnhub' };
const IMPORT_FROM_1M = '2010-06-07', IMPORT_FROM_1S = '2020-01-02';
const daySec = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);
const todayIso = () => new Date().toISOString().slice(0, 10);
// kwoty zawsze z dwoma miejscami po przecinku (124,50 USD), jak w potwierdzeniach kwotą
const money = (x) => new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
// wydatki dobierania są rzędu 0,005 USD, więc licznik pokazuje do czterech miejsc
const moneyFine = (x) => new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(x);
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
const fmtT = (sec) => new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(sec * 1000));

// 1.6.1 (przegląd wizualny P3-A3): data ważności kredytu w tym samym formacie co pole „Ważny do” (dd.mm.rrrr), nie ISO
const fmtExp = (iso) => formatDate(iso, getLang()) || String(iso ?? '');
export function createZrodla(ctx) {
  const root = () => ctx.root();
  // stan z GET /api/sources (klucze tak/nie + 4 znaki, limity, kredyt, kolejka, import), statusy newsów i earningsów
  let src = null, srcErr = '', newsSt = null, pollTimer = 0;
  // komunikaty kart kluczy { [source]: { text, error } }, źródło z otwartym potwierdzeniem usunięcia klucza
  const keyMsg = {};
  let removing = null;
  // formularze kredytu i limitów: null | { step: 'edit' | 'confirm', values, msg }
  let credit = null, limits = null, nqConfirm = false, minConfirm = false, min1Opt = null, abeConfirm = false, abeOpt = null, abeBack = null, money1 = null;
  // final (ocena wyglądu P2-8): w kreatorze koszty, okno 1s NQ, FRED i Finnhub są pod „Więcej (opcjonalne)”; stan rozwinięcia przeżywa przerysowanie
  let wizMore = false;
  // komunikat stanu: błąd jako ostrzeżenie, „Sprawdzam…” jako oczekiwanie, reszta jako sukces (tekst z kropką)
  const msgCls = (m) => (m.error ? 'warnb' : /…$/.test(m.text) ? 'waitb' : 'okb');
  // import: { kind: '1m' | '1s', busy, quote, msg, from, to, sym }
  const imp = { '1m': null, '1s': null };
  const v = (id) => root()?.querySelector(id)?.value ?? '';
  const D = () => src?.databento || {};
  const msgHtml = (m, id = '') => (m ? `<p class="note"${id ? ` id="${id}"` : ''} role="status"><span class="${msgCls(m)}">${esc(m.text)}</span></p>` : '');

  // ---------- karty kluczy ----------
  function keyState(s) {
    const k = src?.keys?.[s], c = ctx.diag()?.connections?.[s], last = c?.last;
    if (!k) return { st: 'wait', text: t('Sprawdzam…') };
    if (!k.configured) return { st: 'off', text: s === 'databento' ? t('Bez klucza: wykresy pokazują tylko świece, które już są na dysku.') : t('Bez klucza (opcjonalny).') };
    const saved = t('Klucz zapisany, kończy się na …{hint}', { hint: k.hint || '••••' });
    if (ctx.testing().has(s)) return { st: 'wait', text: `${saved}. ${t('Sprawdzam…')}` };
    if (!last) return { st: 'wait', text: `${saved}. ${t('Nie sprawdzono w tej sesji.')}` };
    return { st: last.ok ? 'ok' : last.ok === null ? 'wait' : 'bad', text: `${saved}. ${last.detail || ''}` };
  }
  function keyCard(s, desc) {
    const K = KEYS[s], k = src?.keys?.[s], m = keyMsg[s], st = keyState(s);
    const confirm = removing === s ? `<div class="sv-confirm" role="group" aria-label="${esc(t('Usunąć klucz {name}?', { name: K.name }))}"><p><b>${esc(t('Usunąć klucz {name}?', { name: K.name }))}</b> ${L('Linia zniknie z pliku .env na tym komputerze. Dane już pobrane zostają.')}</p>
        <div class="upd-actions"><button type="button" class="btn primary danger sm" data-act="zr-key-del-ok" data-v="${s}" data-fk="zr-key-del-ok-${s}">${L('Usuń klucz')}</button><button type="button" class="btn ghost sm" data-act="zr-key-del-no" data-fk="zr-key-del-no-${s}">${L('Anuluj')}</button></div></div>` : '';
    return `<div class="sv-src">${dot(st.st)}<span class="sv-src-t">${esc(st.text)}</span></div>
      <div class="sp-f"><label class="lbl" for="${K.input}">${L(K.label)}</label>
        <div class="sp-keyrow"><input id="${K.input}" class="sp-in sp-key" type="password" autocomplete="off" spellcheck="false" maxlength="100" data-fk="${K.input}" placeholder="${esc(k?.configured ? t('Zapisany. Wklej nowy, aby zmienić') : t(K.paste))}" aria-describedby="${K.input}-d">
          <button type="button" class="btn sm" data-act="${K.save}" data-fk="${K.input}-save">${L('Zapisz i sprawdź')}</button></div>
        <p class="note" id="${K.input}-d" aria-live="polite">${m ? `<span class="${msgCls(m)}">${esc(m.text)}</span> ` : ''}${esc(desc)}</p>
        ${k?.configured ? `<div class="upd-actions"><button type="button" class="btn sm${ctx.testing().has(s) ? ' busy' : ''}" data-act="diag-test" data-v="${s}" data-fk="zr-test-${s}"${ctx.testing().has(s) ? ' disabled aria-busy="true"' : ''}>${ctx.testing().has(s) ? `<span class="spin" aria-hidden="true"></span>${L('Sprawdzam…')}` : L('Testuj')}</button>
          <button type="button" class="btn ghost sm" data-act="zr-key-del" data-v="${s}" data-fk="zr-key-del-${s}">${L('Usuń klucz')}</button></div>` : ''}${confirm}</div>`;
  }

  // ---------- Databento ----------
  function creditLine(c) {
    if (!c?.configured) return `<span class="sv-low">${L('nie wpisany')}</span>`;
    if (c.expired) return `<span class="sv-low">${esc(t('wygasł {expires}', { expires: fmtExp(c.expires) }))}</span>`;
    return esc(t('{left} z {start} USD, ważny do {expires}', { left: money(c.leftUsd), start: money(c.startUsd), expires: fmtExp(c.expires) }));
  }
  function databentoHtml() {
    const d = D();
    return `${gHead('ch-g-data', 'Świece: Databento')}
      <p class="note sv-gd">${L('Wykresy świecowe i Backtest biorą świece z Databento. Pobierasz je własnym kluczem i płacisz za zużycie; nowe konto dostaje kredyt na start. Bez klucza dashboard pokazuje tylko świece, które już są na dysku.')}</p>
      ${keyCard('databento', t('Klucz zapisuje się tylko w pliku .env na tym komputerze, po bezpłatnym sprawdzeniu u Databento. Nie trafia do Notion ani do synchronizacji ustawień.'))}
      <div class="sp-f sp-kvs">${kv('Kredyt Databento', !src ? '…' : d.credit?.configured && !d.credit.expired ? esc(t('{left} z {start} USD', { left: money(d.credit.leftUsd), start: money(d.credit.startUsd) })) : creditLine(d.credit))}</div>
      ${srcErr ? `<p class="note sv-warn">${esc(srcErr)}</p>` : ''}`;
  }
  // compact (N6, krok „Dane rynkowe”): bez nagłówka, limitów i instrukcji; tylko stan kredytu z wpisem i korektą
  function creditHtml({ compact = false } = {}) {
    const d = D(), c = d.credit, caps = d.caps || {};
    let body = '';
    // poprawki po review N1–N4 (P2-3): pusty stan dla każdej instalacji bez wpisanego kredytu ([U] 31.10.2026 «Wpisz tylko u mnie»): co, skąd wziąć i jeden przycisk
    // N6: w kreatorze spokojniejszy pusty stan (krok opcjonalny); w Ustawieniach ostrzeżenie jak po review N1–N4
    if (compact && src && !c?.configured && !credit) body += `<div class="sv-confirm" role="status"><p class="note"><b>${L('Kredyt Databento nie jest wpisany.')}</b> ${L('Stan znajdziesz w portalu Databento: Billing → Credits (kwota startowa, wydane i data wygaśnięcia). Wpiszesz go teraz albo później.')}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-cr-edit" data-fk="zr-cr-edit-empty">${L('Wpisz stan kredytu…')}</button></div></div>`;
    else if (src && !c?.configured && !credit) body += `<div class="sv-confirm" role="status"><p class="note sv-warn"><b>${L('Kredyt Databento nie jest wpisany.')}</b> ${L('Płatne pobieranie świec czeka, aż wpiszesz stan z portalu Databento: Billing → Credits pokazuje kwotę startową, wydane i datę wygaśnięcia. Dashboard nie widzi salda Databento, więc liczy wydatki sam i nie pobierze nic ponad wpisany kredyt.')}</p>
        <div class="upd-actions"><button type="button" class="btn primary sm" data-act="zr-cr-edit" data-fk="zr-cr-edit-empty">${L('Wpisz stan kredytu…')}</button></div></div>`;
    if (c?.configured) {
      const left = pct(c.leftUsd, c.startUsd);
      body += `<div class="sp-f sp-kvs">${kv('Kredyt', creditLine(c))}<div class="sv-bar${left < 15 || c.expired ? ' warn' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${left}" aria-label="${esc(t('Pozostały kredyt: {p}%', { p: left }))}"><i style="width:${left}%"></i></div></div>`;
    }
    if (!compact) body += `<div class="sp-f sp-kvs">${kv('Limit na jedno pobranie', src ? esc(`${money(d.limitUsd)} USD`) : '…')}${kv('Limit dzienny (doba UTC)', src ? esc(`${money(d.dailyLimitUsd)} USD`) : '…')}${kv('Wydano dziś', src ? esc(`${money(d.spentTodayUsd ?? 0)} USD`) : '…')}</div>`;
    if (credit?.step === 'edit') {
      const cv = credit.values;
      body += `<div class="sv-confirm" role="group" aria-labelledby="sv-cr-h"><p id="sv-cr-h"><b>${L('Stan kredytu z portalu Databento')}</b></p>
        <div class="sv-fields"><label><span class="lbl">${L('Kwota startowa (USD)')}</span><input id="sv-cr-start" class="sp-in" type="number" min="0.01" max="${caps.creditMaxUsd ?? 125}" step="0.01" data-fk="sv-cr-start" value="${esc(cv.start)}"></label>
          <label><span class="lbl">${L('Wydano do dziś (USD)')}</span><input id="sv-cr-spent" class="sp-in" type="number" min="0" step="0.01" data-fk="sv-cr-spent" value="${esc(cv.spent)}"></label>
          <label><span class="lbl">${L('Ważny do')}</span><input id="sv-cr-exp" class="sp-in" type="text" data-wd="date" data-fk="sv-cr-exp" value="${esc(cv.expires)}"></label></div>
        <p class="note">${esc(t('Kwota startowa najwyżej {max} USD. Datę weź z portalu (dzień przed wygaśnięciem to bezpieczny zapas).', { max: caps.creditMaxUsd ?? 125 }))}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-cr-next" data-fk="zr-cr-next">${L('Dalej')}</button><button type="button" class="btn ghost sm" data-act="zr-cr-no" data-fk="zr-cr-no">${L('Anuluj')}</button></div>${msgHtml(credit.msg)}</div>`;
    } else if (credit?.step === 'confirm') {
      const cv = credit.values;
      body += `<div class="sv-confirm" role="group" aria-labelledby="sv-cr-c"><p id="sv-cr-c"><b>${esc(t('Zapisać stan kredytu: zostaje {left} z {start} USD, ważny do {expires}?', { left: money(cv.startN - cv.spentN), start: money(cv.startN), expires: fmtExp(cv.expires) }))}</b></p>
        <p class="note">${L('Strażnik pobierania zatrzyma płatne pobranie, gdy wycena przekroczy pozostały kredyt albo minie data wygaśnięcia.')}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-cr-save" data-fk="zr-cr-save">${esc(t('Zapisz stan kredytu ({left} USD)', { left: money(cv.startN - cv.spentN) }))}</button><button type="button" class="btn ghost sm" data-act="zr-cr-back" data-fk="zr-cr-back">${L('Wróć')}</button></div>${msgHtml(credit.msg)}</div>`;
    }
    if (limits?.step === 'edit') {
      const lv = limits.values;
      body += `<div class="sv-confirm" role="group" aria-labelledby="sv-lim-h"><p id="sv-lim-h"><b>${L('Limity wydatków')}</b></p>
        <div class="sv-fields"><label><span class="lbl">${L('Limit na jedno pobranie (USD)')}</span><input id="sv-lim-one" class="sp-in" type="number" min="0.01" max="${caps.limitMaxUsd ?? 100}" step="0.01" data-fk="sv-lim-one" value="${esc(lv.one)}"></label>
          <label><span class="lbl">${L('Limit dzienny (USD)')}</span><input id="sv-lim-day" class="sp-in" type="number" min="0.01" max="${caps.limitMaxUsd ?? 100}" step="0.01" data-fk="sv-lim-day" value="${esc(lv.day)}"></label></div>
        <p class="note">${esc(t('Od 0,01 do {max} USD. Podniesienie wymaga potwierdzenia kwotą.', { max: caps.limitMaxUsd ?? 100 }))}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-lim-next" data-fk="zr-lim-next">${L('Zapisz')}</button><button type="button" class="btn ghost sm" data-act="zr-lim-no" data-fk="zr-lim-no">${L('Anuluj')}</button></div>${msgHtml(limits.msg)}</div>`;
    } else if (limits?.step === 'confirm') {
      const lv = limits.values, ups = [];
      if (lv.oneN > d.limitUsd) ups.push(t('na jedno pobranie z {a} do {b} USD', { a: money(d.limitUsd), b: money(lv.oneN) }));
      if (lv.dayN > d.dailyLimitUsd) ups.push(t('dzienny z {a} do {b} USD', { a: money(d.dailyLimitUsd), b: money(lv.dayN) }));
      body += `<div class="sv-confirm" role="group" aria-labelledby="sv-lim-c"><p id="sv-lim-c"><b>${esc(t('Podnosisz limit {what}.', { what: ups.join(t(' i ')) }))}</b></p>
        <p class="note">${esc(t('Pobieranie świec może wtedy wydać do {day} USD na dobę z kredytu Databento.', { day: money(lv.dayN) }))}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-lim-save" data-fk="zr-lim-save">${esc(t('Potwierdzam {day} USD na dobę', { day: money(lv.dayN) }))}</button><button type="button" class="btn ghost sm" data-act="zr-lim-back" data-fk="zr-lim-back">${L('Wróć')}</button></div>${msgHtml(limits.msg)}</div>`;
    }
    const btns = !credit && !limits && src ? `<div class="upd-actions">${c?.configured ? `<button type="button" class="btn sm" data-act="zr-cr-edit" data-fk="zr-cr-edit">${L('Popraw stan kredytu…')}</button>` : ''}${compact ? '' : `<button type="button" class="btn sm" data-act="zr-lim-edit" data-fk="zr-lim-edit">${L('Zmień limity…')}</button>`}</div>` : '';
    if (compact) return `${body}${btns}${msgHtml(money1)}`;
    return `${gHead('sv-zr-kredyt', 'Kredyt i limity wydatków')}
      <p class="note sv-gd">${L('Databento nie podaje salda przez API, więc dashboard liczy kredyt sam: od kwoty startowej odejmuje każde pobranie. Każde płatne pobranie przechodzi limit jednego pobrania, limit dzienny i kredyt.')}</p>
      ${body}${btns}${msgHtml(money1)}
      <p class="note">${docLink(docUrl(ctx.diag()?.repoUrl, 'candles'), 'Instrukcja: koszty i limity')}</p>`;
  }
  function queueHtml() {
    const q = D().queue;
    if (!q) return '';
    const st = (i) => (i.state === 'blocked' ? t('zablokowane: {why}', { why: i.reason || '' }) : i.retryAfter ? t('czeka na dane Databento (ok. {at} UTC)', { at: fmtT(i.retryAfter) }) : t('czeka'));
    const items = q.items.slice(0, 5).map((i) => `<li><b>${esc(`${i.instrument} ${i.layer}`)}</b><span>${esc(`${fmtT(i.from)} – ${fmtT(i.to)} UTC`)}</span><span>${esc(st(i))}</span></li>`).join('');
    const head = q.pending + q.blocked ? t('Czeka {p}, zablokowanych {b}.', { p: q.pending, b: q.blocked }) : t('Kolejka jest pusta.');
    const abeBlocked = q.afterBeBlocked ? `<p class="note sv-warn">${esc(t('Zablokowane pozycje dobierania do wyniku po BE: {n}. Nowe trade\'y dobierają się dalej, a te czekają na decyzję: aby je ponowić, zapisz limity jeszcze raz albo wyłącz i włącz przełącznik.', { n: q.afterBeBlocked }))}</p>` : '';
    return `<p class="sv-sub">${L('Kolejka pobierania')}</p>
      <p class="note">${esc(head)}${q.message ? ` ${esc(q.message)}` : ''}</p>${abeBlocked}${items ? `<ul class="sv-q">${items}</ul>` : ''}`;
  }
  // compact (N6): sam przełącznik okna 1s NQ z potwierdzeniem kosztu, bez nagłówka i kolejki
  function autoHtml({ compact = false } = {}) {
    const m = ctx.getMeta() || {};
    const on = D().nq1sDaily ?? m.chartNq1sDaily === true;
    // min1Opt: stan wybrany przed odpowiedzią serwera, żeby pole nie mignęło starą wartością
    const on1m = min1Opt ?? D().min1Daily ?? m.chart1mDaily === true;
    const onAbe = abeOpt ?? D().afterBe ?? m.chartAfterBe === true;
    // bez klucza albo kredytu włączenie niczego nie pobierze: potwierdzenie mówi, czego brakuje
    const needs = !src?.keys?.databento?.configured ? t('Pobieranie ruszy dopiero po zapisaniu klucza Databento.') : !D().credit?.configured ? t('Pobieranie ruszy dopiero po wpisaniu stanu kredytu Databento.') : '';
    const needsHtml = needs ? `<p class="note sv-warn">${esc(needs)}</p>` : '';
    const conf = nqConfirm ? `<div class="sv-confirm" role="group" aria-labelledby="sv-nq-c"><p id="sv-nq-c"><b>${L('Włączyć codzienne okno 1s NQ?')}</b> ${L('Kolejka wyda ok. 0,02 USD za każdy dzień, a przy pierwszym przebiegu nadrobi do 7 dni (ok. 0,14 USD). Zawsze w limitach i kredycie.')}</p>${needsHtml}
      <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-nq-ok" data-fk="zr-nq-ok">${L('Włącz (ok. 0,02 USD dziennie)')}</button><button type="button" class="btn ghost sm" data-act="zr-nq-no" data-fk="zr-nq-no">${L('Anuluj')}</button></div></div>` : '';
    // P57 (3.11.2026): minutówki ES i NQ, stan w config.local.json (chart1mDaily), domyślnie wyłączone; włączenie z potwierdzeniem kosztu
    const conf1m = minConfirm ? `<div class="sv-confirm" role="group" aria-labelledby="sv-1m-c"><p id="sv-1m-c"><b>${L('Włączyć automatyczne pobieranie minutówek ES i NQ?')}</b> ${L('Kolejka pobierze brakujące świece minutowe ES i NQ. Cena to ok. 0,005 USD na dzień na instrument. Przy pierwszym przebiegu nadrobi najwyżej 92 dni, razem z oknami wokół zmiany kontraktu: pierwszy przebieg razem do ok. 0,80 USD. Zawsze w limitach i kredycie.')}</p>${needsHtml}
      <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-1m-ok" data-fk="zr-1m-ok">${L('Włącz (ok. 0,01 USD dziennie)')}</button><button type="button" class="btn ghost sm" data-act="zr-1m-no" data-fk="zr-1m-no">${L('Anuluj')}</button></div></div>` : '';
    // [U] 04.11.2026 «Dobieraj automatycznie świece 1m», «Wyłącznik, u ciebie włączony»: stan w config.local.json (chartAfterBe), domyślnie wyłączone; włączenie z potwierdzeniem kosztu, wzorem minutówek
    // [U] 04.11.2026 «Jedna zgoda z wyceną (Recommended)» (opis opcji: „Włączając przełącznik, widzisz szacunkowy koszt zaległości i potwierdzasz raz. Potem dobiera się samo małymi porcjami, zawsze w limitach i kredycie”):
    // potwierdzenie pokazuje szacunek zaległości, a dopóki liczenie trwa, nie da się włączyć. Liczba nieznana jest nazwana wprost, nie jako 0.
    const backHtml = abeBack === 'busy' ? `<p class="note" role="status">${L('Liczę dni handlowe bez świec…')}</p>`
      : !abeBack || abeBack === 'unknown' ? `<p class="note sv-warn">${L('Liczba dni handlowych bez świec jest nieznana, bo trade\'y nie są wczytane albo pytanie się nie udało. Szacunku zaległości tu nie podajemy, a zaległości mogą kosztować więcej niż jeden dzień.')}</p>`
        : abeBack.days ? `<p class="note">${esc(t('Dni handlowe bez świec: {n}. Szacunkowy koszt zaległości: ok. {usd} USD ({n} × 0,005 USD). To szacunek, bez płatnej wyceny.', { n: abeBack.days, usd: moneyFine(abeBack.usd) }))}</p>`
          : `<p class="note">${L('Nie ma trade\'ów po BE bez świec, więc szacunek zaległości to 0 USD. Liczone z wczytanych trade\'ów.')}</p>`;
    const abeOkLabel = abeBack && abeBack !== 'busy' && abeBack !== 'unknown' && abeBack.days ? esc(t('Włącz (zaległości ok. {usd} USD)', { usd: moneyFine(abeBack.usd) })) : L('Włącz dobieranie');
    const confAbe = abeConfirm ? `<div class="sv-confirm" role="group" aria-labelledby="sv-abe-c"><p id="sv-abe-c"><b>${L('Włączyć dobieranie świec do wyniku po BE?')}</b> ${L('Gdy trade Live albo Paper wybity na BE nie ma świec 1m do końca swojego dnia handlowego, kolejka pobierze je sama, także dla starszych trade\'ów. Cena to ok. 0,005 USD za dzień handlowy na instrument. Trade\'y typu Backtest nigdy niczego nie pobierają.')}</p>${backHtml}<p class="note">${L('Po tej jednej zgodzie dobiera się samo, najwyżej 20 pozycji na przebieg co 5 minut, zawsze w limitach i kredycie.')}</p>${needsHtml}
      <div class="upd-actions"><button type="button" class="btn sm" data-act="zr-abe-ok" data-fk="zr-abe-ok"${abeBack === 'busy' ? ' disabled' : ''}>${abeOkLabel}</button><button type="button" class="btn ghost sm" data-act="zr-abe-no" data-fk="zr-abe-no">${L('Anuluj')}</button></div></div>` : '';
    if (compact) {
      return `<div class="sp-f"><label class="check"><input type="checkbox" data-act="ch-nq1s" data-fk="ch-nq1s" ${on || nqConfirm ? 'checked' : ''}> ${L('Codziennie pobieraj 1s NQ 9:30–11:00 NY')}</label>
        <p class="note">${L('Sekundowe świece NQ z pierwszych 90 minut sesji Nowego Jorku, każdego dnia. Przydają się do Backtestu na sekundach. Wyłączone, dopóki ich nie włączysz.')}</p>${conf}</div>`;
    }
    return `${gHead('sv-zr-auto', 'Automatyczne pobieranie')}
      <p class="note sv-gd">${L('Po zapisaniu trade\'a kolejka sama dokłada okno 1s wokół niego (ok. 0,02 USD za trade), gdy Databento je udostępni, zwykle po ok. 8 godzinach.')}</p>
      <div class="sp-f"><label class="check"><input type="checkbox" data-act="ch-nq1s" data-fk="ch-nq1s" ${on || nqConfirm ? 'checked' : ''}> ${L('Codziennie pobieraj 1s NQ 9:30–11:00 NY')}</label>
        <p class="note">${L('Okno sekundowe NQ z pierwszych 90 minut sesji Nowego Jorku każdego dnia (ok. 0,02 USD na dzień, w zwykłych limitach). Nadrabia dni, w których dashboard był wyłączony, najwyżej 7. Ustawienie tylko na tym komputerze.')}</p>${conf}</div>
      <div class="sp-f"><label class="check"><input type="checkbox" data-act="ch-1m" data-fk="ch-1m" ${on1m || minConfirm ? 'checked' : ''}> ${L('Automatycznie pobieraj minutówki ES i NQ')}</label>
        <p class="note">${L('Pobiera brakujące świece minutowe ES i NQ (ok. 0,005 USD na dzień na instrument, w zwykłych limitach i kredycie). Nadrabia najwyżej 92 dni (pierwszy przebieg razem do ok. 0,80 USD), starszą historię pobierzesz importem. Ustawienie tylko na tym komputerze.')}</p>${conf1m}</div>
      <div class="sp-f"><label class="check"><input type="checkbox" data-act="ch-after-be" data-fk="ch-after-be" ${onAbe || abeConfirm ? 'checked' : ''}> ${L('Dobieraj świece do wyniku po BE (ok. 0,005 USD za dzień)')}</label>
        <p class="note">${L('Pobiera świece 1m tylko na dni trade\'ów Live i Paper wybitych na BE, gdy dzień handlowy trade\'a już się skończył, a Databento je udostępnił. Starsze trade\'y też, bez limitu 92 dni. Bez tego, a także bez klucza, bez kredytu albo po limicie, wynik po BE pokazuje „brak danych”, a powód podaje podpowiedź przy trade\'zie. Ustawienie tylko na tym komputerze.')} ${esc(t('Wydano dotąd: {usd} USD.', { usd: moneyFine(D().afterBeSpentUsd ?? 0) }))}</p>${confAbe}</div>
      ${queueHtml()}`;
  }
  function importHtml() {
    const d = D(), m = ctx.getMeta() || {}, st = d.status || {};
    const running = st.running && (st.phase === 'import' || st.phase === 'import-1s');
    const blocked = !src?.keys?.databento?.configured ? t('Najpierw zapisz klucz Databento.') : !d.credit?.configured ? t('Najpierw wpisz stan kredytu Databento.') : '';
    const part = (kind) => {
      const s = imp[kind], is1m = kind === '1m';
      const fields = `<div class="sv-fields">${is1m ? `<label><span class="lbl">${L('Instrument')}</span><select id="sv-imp-sym" class="sp-in sp-sel" data-fk="sv-imp-sym">${['NQ', 'ES'].map((x) => `<option value="${x}"${(s?.sym || 'NQ') === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
          <label><span class="lbl">${L('Od')}</span><input id="sv-imp${kind}-from" class="sp-in" type="text" data-wd="date" data-fk="sv-imp${kind}-from" min="${is1m ? IMPORT_FROM_1M : IMPORT_FROM_1S}" value="${esc(s?.from || (is1m ? IMPORT_FROM_1M : IMPORT_FROM_1S))}"></label>
          <label><span class="lbl">${L('Do')}</span><input id="sv-imp${kind}-to" class="sp-in" type="text" data-wd="date" data-fk="sv-imp${kind}-to" value="${esc(s?.to || todayIso())}"></label>
          <button type="button" class="btn sm" data-act="zr-imp-quote" data-v="${kind}" data-fk="zr-imp-quote-${kind}"${s?.busy || running || blocked ? ' disabled' : ''}>${s?.busy === 'quote' ? L('Wyceniam…') : L('Wyceń')}</button></div>`;
      let res = '';
      const q = s?.quote;
      if (s?.busy === 'quote') res = `<p class="note" role="status">${L('Wyceniam w Databento (bezpłatnie). Przy wielu latach to może potrwać kilka minut.')}</p>`;
      else if (q) {
        const amount = centsUp(q.totalUsd);
        const lines = [is1m
          ? t('Wycena: {cost} USD za {sym} {from} – {to} (zakresów do pobrania: {runs}).', { cost: money(amount), runs: q.runs, sym: q.instrument, from: q.fromDay, to: q.toDay })
          : t('Wycena: {cost} USD za okna NQ {from} – {to} (dni z oknem: {days}, zakresów do pobrania: {runs}).', { cost: money(amount), days: q.days, runs: q.runs, from: q.fromDay, to: q.toDay })];
        let stop = '';
        if (q.nothing) stop = t('Nic do pobrania: te dni są już na dysku.');
        else if (!d.credit?.configured) stop = t('Najpierw wpisz stan kredytu Databento.');
        else if (q.totalUsd > d.credit.leftUsd) stop = t('To więcej niż pozostały kredyt ({left} USD). Zawęź zakres dat.', { left: money(d.credit.leftUsd) });
        else if (is1m && q.override && q.override > (d.caps?.importMaxUsd ?? 50)) stop = t('Jeden import może kosztować najwyżej {max} USD. Zawęź zakres dat.', { max: d.caps?.importMaxUsd ?? 50 });
        else if (!is1m && q.budget > (d.caps?.open1sMaxUsd ?? 36)) stop = t('Budżet importu okien 1s to {max} USD (wydano {spent} USD). Zawęź zakres dat.', { max: d.caps?.open1sMaxUsd ?? 36, spent: money(d.open1s?.spentUsd ?? 0) });
        if (!stop) {
          lines.push(t('Kredyt po imporcie: ok. {left} USD.', { left: money(d.credit.leftUsd - q.totalUsd) }));
          if (is1m && q.override) lines.push(t('To więcej niż zwykłe limity ({one} USD na pobranie, {day} USD na dobę), więc ten jeden import podniesie je tylko dla siebie do {ov} USD.', { one: money(d.limitUsd), day: money(d.dailyLimitUsd), ov: money(q.override) }));
          if (!is1m) lines.push(t('Budżet importu okien 1s: wydano {spent} z {max} USD.', { spent: money(d.open1s?.spentUsd ?? 0), max: d.caps?.open1sMaxUsd ?? 36 }));
        }
        res = `<div class="sv-confirm">${lines.map((l, i) => `<p${i ? ' class="note"' : ''}>${i ? '' : '<b>'}${esc(l)}${i ? '' : '</b>'}</p>`).join('')}
          ${stop ? `<p class="note sv-warn">${esc(stop)}</p>` : `<label class="lbl" for="sv-imp${kind}-ok">${esc(t('Wpisz kwotę {amount}, aby potwierdzić pobranie', { amount: money(amount) }))}</label>
          <div class="sp-keyrow"><input id="sv-imp${kind}-ok" class="sp-in" type="text" inputmode="decimal" autocomplete="off" maxlength="12" data-fk="sv-imp${kind}-ok" placeholder="${esc(money(amount))}">
            <button type="button" class="btn sm" data-act="zr-imp-go" data-v="${kind}" data-fk="zr-imp-go-${kind}"${s.busy || running ? ' disabled' : ''}>${esc(t('Pobierz za {amount} USD', { amount: money(amount) }))}</button>
            <button type="button" class="btn ghost sm" data-act="zr-imp-no" data-v="${kind}" data-fk="zr-imp-no-${kind}">${L('Anuluj')}</button></div>`}</div>`;
      }
      return `<p class="sv-sub">${L(is1m ? 'Minutówki ES i NQ (od 2010)' : 'Okna 1s NQ 9:30–11:00 NY (od 2020)')}</p>${fields}${res}${msgHtml(s?.msg)}`;
    };
    let prog = '';
    // ostatni zakończony przebieg pobierania (import albo kolejka): wynik albo błąd, żeby po powrocie do Ustawień było widać, jak się skończył
    if (!running && st.finishedAt && (st.error || st.result?.added)) {
      prog = st.error ? `<p class="note sv-warn">${esc(t('Ostatnie pobieranie przerwane: {msg}', { msg: st.error.message || '' }))}</p>`
        : `<p class="note">${esc(t('Ostatnie pobieranie: {n} świec za {cost} USD.', { n: st.result.added, cost: money(st.result.costUsd || 0) }))}</p>`;
    }
    if (running) {
      const p = pct(st.done, st.total);
      const line = t('Pobieram: {done} z {total} zakresów (wycena {cost} USD). Możesz zamknąć Ustawienia, import działa w tle.', { done: st.done, total: st.total, cost: money(st.costUsd || 0) });
      prog = `<div class="sv-prog"><div class="sv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(line)}"><i style="width:${p}%"></i></div><p class="note" aria-live="polite">${esc(line)}</p></div>`;
    }
    void m;
    return `${gHead('ch-g-import', 'Import historii')}
      <p class="note sv-gd">${L('Dłuższa historia do Backtestu. Najpierw bezpłatna wycena w Databento; pobranie rusza dopiero po wpisaniu kwoty i liczy się do kredytu.')}</p>
      ${blocked ? `<p class="note sv-warn">${esc(blocked)}</p>` : ''}${prog}${part('1m')}${part('1s')}
      <p class="note">${docLink(docUrl(ctx.diag()?.repoUrl, 'candles'), 'Instrukcja importu z budżetem')}</p>`;
  }

  // ---------- newsy i earningsy (klucze i stan; wygląd w Wykresach) ----------
  function newsHtml() {
    return `${gHead('ch-g-news', 'Newsy makro: FRED')}
      <p class="note sv-gd">${L('Daty publikacji danych makro z USA. Daty z lat 2010–2026 są w programie; bezpłatny klucz FRED odświeża przyszłe terminy raz dziennie (rejestracja na fred.stlouisfed.org → API Keys).')}</p>
      ${keyCard('fred', t('Trafia tylko do pliku .env na tym komputerze, po sprawdzeniu jednym zapytaniem do FRED. Nie trafia do Notion ani do synchronizacji.'))}
      ${newsSourceHtml({ st: newsSt })}
      <p class="note">${L('Wagi newsów, linie na wykresie i karta „Dzisiaj”:')} <a class="sv-doc" href="#ustawienia/wykresy/newsy">${L('Wykresy → Newsy')}</a></p>`;
  }
  function earnHtml() {
    return `${gHead('ch-g-earn', 'Earningsy: Finnhub')}
      <p class="note sv-gd">${L('Terminy wyników spółek z S&P 100. Historia jest w programie; bezpłatny klucz Finnhub dokłada przyszłe terminy (rejestracja na finnhub.io).')}</p>
      ${keyCard('finnhub', t('Trafia tylko do pliku .env na tym komputerze, po sprawdzeniu jednym zapytaniem do Finnhub. Nie trafia do Notion ani do synchronizacji.'))}
      ${earnSourceHtml({ st: newsSt })}
      <p class="note">${L('Klasy spółek, romby na wykresie i ręczne wyjątki:')} <a class="sv-doc" href="#ustawienia/wykresy/earningsy">${L('Wykresy → Earningsy')}</a></p>`;
  }
  // ---------- N6: krok „Dane rynkowe” w pierwszych krokach ----------
  // Koszty z kodu i README (wyceny Databento z października 2026); prawdziwy koszt zawsze pokazuje wycena przed pobraniem
  function costHtml() {
    const d = D();
    const items = [
      t('Okno sekundowe wokół jednego trade\'a: ok. 0,02 USD. Dokłada się samo po zapisaniu trade\'a.'),
      t('Codzienne okno 1s NQ: ok. 0,02 USD dziennie, tylko jeśli je włączysz.'),
      t('Pełna historia minutówek ES i NQ od 2010 roku: ok. 41 USD według wycen z października 2026. Import robisz w Ustawieniach, po bezpłatnej wycenie.'),
      src ? t('Strażnik wydatków: najwyżej {one} USD na jedno pobranie i {day} USD na dobę. Limity zmienisz w Ustawieniach.', { one: money(d.limitUsd), day: money(d.dailyLimitUsd) }) : '',
    ].filter(Boolean);
    return `<ul class="sv-costs">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  }
  function wizardHtml() {
    // rozwinięte także wtedy, gdy w środku czeka potwierdzenie albo komunikat (np. włączenie okna 1s, zapis klucza FRED)
    const more = wizMore || nqConfirm || !!keyMsg.fred || !!keyMsg.finnhub || removing === 'fred' || removing === 'finnhub';
    return grp(`${gHead('ob-g-db', 'Świece: Databento')}
        <p class="note sv-gd">${L('Wykresy świecowe i Backtest biorą świece z Databento. Zakładasz konto na databento.com, w portalu kopiujesz klucz API (zakładka API Keys) i wklejasz go tutaj. Płacisz za zużycie, a nowe konto dostaje kredyt na start.')}</p>
        ${keyCard('databento', t('Klucz zapisuje się tylko w pliku .env na tym komputerze, po bezpłatnym sprawdzeniu u Databento.'))}`, 'databento')
      + grp(`${gHead('ob-g-kredyt', 'Kredyt Databento')}
        <p class="note">${L('Databento nie podaje salda przez API, więc dashboard liczy wydatki sam od stanu, który wpiszesz. Bez wpisu nic płatnego się nie pobierze.')}</p>
        ${creditHtml({ compact: true })}`, 'kredyt')
      + `<details class="sv-more ob-dane-more"${more ? ' open' : ''}><summary>${L('Więcej (opcjonalne): koszty, okno 1s NQ, newsy i earningsy')}</summary>`
      + grp(`${gHead('ob-g-koszt', 'Ile to kosztuje')}${costHtml()}${autoHtml({ compact: true })}`, 'koszty')
      + grp(`${gHead('ob-g-fred', 'Newsy makro: FRED')}
        <p class="note sv-gd">${L('Bezpłatny i opcjonalny. Daty publikacji danych makro z lat 2010–2026 są w programie; klucz z fred.stlouisfed.org (API Keys) dokłada przyszłe terminy.')}</p>
        ${keyCard('fred', t('Zapisuje się tylko w pliku .env na tym komputerze.'))}`, 'newsy')
      + grp(`${gHead('ob-g-fh', 'Earningsy: Finnhub')}
        <p class="note sv-gd">${L('Bezpłatny i opcjonalny. Terminy wyników spółek z S&P 100: historia jest w programie, klucz z finnhub.io dokłada przyszłe terminy.')}</p>
        ${keyCard('finnhub', t('Zapisuje się tylko w pliku .env na tym komputerze.'))}`, 'earningsy')
      + '</details>';
  }
  function html() {
    return grp(databentoHtml(), 'databento') + grp(creditHtml(), 'kredyt') + grp(autoHtml(), 'automat') + grp(importHtml(), 'import')
      + grp(newsHtml(), 'newsy') + grp(earnHtml(), 'earningsy');
  }

  // ---------- dane ----------
  // szacunek zaległości: bezpłatne pytanie o wyniki wczytanych trade'ów; po odpowiedzi fokus na przycisku, chyba że użytkownik już anulował
  async function askAbe() {
    abeConfirm = true;
    abeBack = 'busy';
    ctx.rerender();
    let got = null;
    try { got = await ctx.opts.afterBeBacklog?.(); } catch { got = null; }
    if (!abeConfirm) return;
    abeBack = got || 'unknown';
    ctx.rerender();
    root()?.querySelector('[data-fk="zr-abe-ok"]')?.focus();
  }
  function setAbe(on) {
    abeOpt = on;
    ctx.rerender();
    Promise.resolve(ctx.opts.onConfig({ chartAfterBe: on })).then(() => loadSources()).finally(() => { abeOpt = null; ctx.rerender(); });
  }
  function setMin1(on) {
    min1Opt = on;
    ctx.rerender();
    Promise.resolve(ctx.opts.onConfig({ chart1mDaily: on })).then(() => loadSources()).finally(() => { min1Opt = null; ctx.rerender(); });
  }
  async function loadSources() {
    try { src = await getJson('/api/sources'); srcErr = ''; } catch (e) { srcErr = e.message; }
    if (ctx.isActive('zrodla')) ctx.rerender();
    clearTimeout(pollTimer);
    const st = src?.databento?.status;
    if (st?.running && ctx.isActive('zrodla')) pollTimer = setTimeout(loadSources, 1500);
  }
  async function loadNews() {
    try { newsSt = await ctx.opts.loadNewsStatus(); } catch { newsSt = null; }
    if (ctx.isActive('zrodla')) ctx.rerender();
  }
  async function changed() {
    await Promise.all([loadSources(), ctx.reloadDiag(), ctx.opts.onSourcesChanged?.()]);
  }

  // ---------- klucze ----------
  async function saveKey(s) {
    const K = KEYS[s], el = root()?.querySelector(`#${K.input}`), key = el?.value.trim() || '';
    if (!key) { keyMsg[s] = { text: t('Wklej klucz {name}.', { name: K.name }), error: true }; ctx.rerender(); return; }
    keyMsg[s] = { text: t('Sprawdzam klucz…'), error: false }; ctx.rerender();
    try {
      await postJson('/api/sources/key', { source: s, key });
      keyMsg[s] = { text: t('Klucz sprawdzony i zapisany.'), error: false };
      // zapisany klucz znika z pola (jest w .env); po błędzie zostaje do poprawienia (przegląd HIJ, pkt 7)
      const k = root()?.querySelector(`#${K.input}`); if (k) k.value = '';
      ctx.testing().delete(s);
      await changed();
      if (s !== 'databento') { setTimeout(loadNews, 4000); setTimeout(loadNews, 12000); }
    } catch (e) { keyMsg[s] = { text: e.message || t('Nie udało się zapisać klucza.'), error: true }; }
    ctx.rerender();
  }
  async function removeKey(s) {
    removing = null;
    try { await postJson('/api/sources/key', { source: s, remove: true }); keyMsg[s] = { text: t('Klucz usunięty z pliku .env.'), error: false }; await changed(); }
    catch (e) { keyMsg[s] = { text: e.message, error: true }; }
    ctx.rerender();
    root()?.querySelector(`#${KEYS[s].input}`)?.focus();
  }

  // ---------- kredyt i limity ----------
  function creditNext() {
    const startN = Number(v('#sv-cr-start')), spentN = Number(v('#sv-cr-spent') || 0), expires = v('#sv-cr-exp');
    credit.values = { start: v('#sv-cr-start'), spent: v('#sv-cr-spent'), expires, startN, spentN };
    const max = D().caps?.creditMaxUsd ?? 125;
    if (!(startN > 0 && startN <= max)) credit.msg = { text: t('Kwota startowa: od 0,01 do {max} USD.', { max }), error: true };
    else if (!(spentN >= 0 && spentN <= startN)) credit.msg = { text: t('Wydano: od 0 do kwoty startowej.'), error: true };
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) credit.msg = { text: t('Wybierz datę wygaśnięcia.'), error: true };
    else { credit.step = 'confirm'; credit.msg = null; }
    ctx.rerender();
  }
  async function creditSave() {
    const cv = credit.values;
    try {
      await postJson('/api/candles/limit', { creditStartUsd: cv.startN, creditSpentUsd: cv.spentN, creditExpires: cv.expires, confirm: true });
      credit = null; money1 = { text: t('Stan kredytu zapisany.'), error: false };
      await changed();
    } catch (e) { credit.msg = { text: e.message, error: true }; ctx.rerender(); }
  }
  function limitsNext() {
    const oneN = Number(v('#sv-lim-one')), dayN = Number(v('#sv-lim-day')), max = D().caps?.limitMaxUsd ?? 100;
    limits.values = { one: v('#sv-lim-one'), day: v('#sv-lim-day'), oneN, dayN };
    if (!(oneN >= 0.01 && oneN <= max && dayN >= 0.01 && dayN <= max)) { limits.msg = { text: t('Limity: od 0,01 do {max} USD.', { max }), error: true }; ctx.rerender(); return; }
    // obniżenie bez potwierdzenia, podniesienie z potwierdzeniem kwotą (§5.1 pkt 8)
    if (oneN > D().limitUsd || dayN > D().dailyLimitUsd) { limits.step = 'confirm'; limits.msg = null; ctx.rerender(); return; }
    limitsSave();
  }
  async function limitsSave() {
    const lv = limits.values;
    try {
      await postJson('/api/candles/limit', { maxCostUsd: lv.oneN, dailyLimitUsd: lv.dayN });
      limits = null; money1 = { text: t('Limity zapisane.'), error: false };
      await changed();
    } catch (e) { limits.msg = { text: e.message, error: true }; ctx.rerender(); }
  }

  // ---------- import ----------
  async function quote(kind) {
    const is1m = kind === '1m';
    const from = v(`#sv-imp${kind}-from`) || (is1m ? IMPORT_FROM_1M : IMPORT_FROM_1S), to = v(`#sv-imp${kind}-to`) || todayIso();
    const sym = is1m ? v('#sv-imp-sym') || 'NQ' : 'NQ';
    if (!(daySec(from) < daySec(to) + 86400)) { imp[kind] = { from, to, sym, msg: { text: t('Data „do” musi być po dacie „od”.'), error: true } }; ctx.rerender(); return; }
    imp[kind] = { from, to, sym, busy: 'quote' }; ctx.rerender();
    const body = { instrument: sym, from: daySec(from), to: Math.min(daySec(to) + 86400, Math.floor(Date.now() / 1000)), dryRun: true };
    try {
      const r = await postJson(is1m ? '/api/candles/import' : '/api/candles/import-1s', body);
      const d = D(), total = r.totalUsd || 0;
      const q = { ...r, body, fromDay: from, toDay: to };
      // 1m: limity aplikacji podnoszone tylko dla tego importu (limitsOverrideUsd ≥ wycena + 5%, najwyżej 50 USD); 1s: budżet = wydane + wycena + 5%, najwyżej 36 USD
      if (is1m && !r.withinLimits && !r.nothing) q.override = Math.max(0.01, centsUp(total * 1.05 + 0.005));
      if (!is1m) q.budget = centsUp((d.open1s?.spentUsd ?? 0) + total * 1.05 + 0.005);
      imp[kind] = { from, to, sym, quote: q };
    } catch (e) { imp[kind] = { from, to, sym, msg: { text: e.message, error: true } }; }
    ctx.rerender();
    root()?.querySelector(`#sv-imp${kind}-ok`)?.focus();
  }
  async function go(kind) {
    const s = imp[kind], q = s?.quote;
    if (!q) return;
    const amount = centsUp(q.totalUsd);
    if (!amountMatches(v(`#sv-imp${kind}-ok`), amount)) { s.msg = { text: t('Wpisz dokładnie kwotę {amount}.', { amount: money(amount) }), error: true }; ctx.rerender(); return; }
    s.busy = 'go'; s.msg = null; ctx.rerender();
    const body = { ...q.body, dryRun: undefined, confirmedCostUsd: q.totalUsd };
    if (kind === '1m' && q.override) body.limitsOverrideUsd = q.override;
    if (kind === '1s') body.budgetUsd = Math.min(D().caps?.open1sMaxUsd ?? 36, q.budget);
    try {
      const r = await postJson(kind === '1m' ? '/api/candles/import' : '/api/candles/import-1s', body);
      imp[kind] = { from: s.from, to: s.to, sym: s.sym, msg: { text: r.started ? t('Import ruszył: {runs} zakresów za ok. {cost} USD.', { runs: r.runs, cost: money(r.costUsd) }) : t('Nic do pobrania.'), error: false } };
    } catch (e) { s.busy = null; s.msg = { text: e.message, error: true }; }
    await loadSources();
  }

  function handle(act, val) {
    if (SAVE_OF[act]) { saveKey(SAVE_OF[act]); return true; }
    switch (act) {
      case 'zr-key-del': removing = val; ctx.rerender(); root()?.querySelector(`[data-fk="zr-key-del-ok-${val}"]`)?.focus(); return true;
      case 'zr-key-del-no': { const s = removing; removing = null; ctx.rerender(); root()?.querySelector(`[data-fk="zr-key-del-${s}"]`)?.focus(); return true; }
      case 'zr-key-del-ok': removeKey(val); return true;
      case 'zr-cr-edit': { const c = D().credit; credit = { step: 'edit', values: c?.configured ? { start: String(c.startUsd), spent: String(c.spentUsd), expires: c.expires } : { start: '', spent: '0', expires: '' } }; limits = null; money1 = null; ctx.rerender(); root()?.querySelector('#sv-cr-start')?.focus(); return true; }
      case 'zr-cr-next': creditNext(); return true;
      case 'zr-cr-back': credit.step = 'edit'; ctx.rerender(); return true;
      case 'zr-cr-no': credit = null; ctx.rerender(); return true;
      case 'zr-cr-save': creditSave(); return true;
      case 'zr-lim-edit': limits = { step: 'edit', values: { one: String(D().limitUsd), day: String(D().dailyLimitUsd) } }; credit = null; money1 = null; ctx.rerender(); root()?.querySelector('#sv-lim-one')?.focus(); return true;
      case 'zr-lim-next': limitsNext(); return true;
      case 'zr-lim-back': limits.step = 'edit'; ctx.rerender(); return true;
      case 'zr-lim-no': limits = null; ctx.rerender(); return true;
      case 'zr-lim-save': limitsSave(); return true;
      case 'zr-nq-ok': nqConfirm = false; ctx.opts.onConfig({ chartNq1sDaily: true }).then(() => loadSources()); return true;
      case 'zr-nq-no': nqConfirm = false; ctx.rerender(); root()?.querySelector('[data-fk="ch-nq1s"]')?.focus(); return true;
      case 'zr-1m-ok': minConfirm = false; setMin1(true); return true;
      case 'zr-1m-no': minConfirm = false; ctx.rerender(); root()?.querySelector('[data-fk="ch-1m"]')?.focus(); return true;
      case 'zr-abe-ok': abeConfirm = false; setAbe(true); return true;
      case 'zr-abe-no': abeConfirm = false; ctx.rerender(); root()?.querySelector('[data-fk="ch-after-be"]')?.focus(); return true;
      case 'zr-imp-quote': quote(val); return true;
      case 'zr-imp-go': go(val); return true;
      case 'zr-imp-no': imp[val] = null; ctx.rerender(); return true;
      default: return false;
    }
  }
  function onChange(ev) {
    // P50 (29.10.2026): codzienne okno 1s NQ, stan w config.local.json (chartNq1sDaily), nie w settings ani w Notion; N4: włączenie z potwierdzeniem kosztu
    if (ev.target.matches('[data-act="ch-nq1s"]')) {
      if (ev.target.checked) { nqConfirm = true; ctx.rerender(); root()?.querySelector('[data-fk="zr-nq-ok"]')?.focus(); return true; }
      nqConfirm = false;
      ctx.opts.onConfig({ chartNq1sDaily: false }).then(() => loadSources());
      return true;
    }
    if (ev.target.matches('[data-act="ch-1m"]')) {
      if (ev.target.checked) { minConfirm = true; ctx.rerender(); root()?.querySelector('[data-fk="zr-1m-ok"]')?.focus(); return true; }
      minConfirm = false;
      setMin1(false);
      return true;
    }
    if (ev.target.matches('[data-act="ch-after-be"]')) {
      if (ev.target.checked) { askAbe(); return true; }
      abeConfirm = false;
      setAbe(false);
      return true;
    }
    // zmiana instrumentu albo dat unieważnia wycenę (pobranie idzie zawsze za wyceną z tych samych pól)
    const im = /^#?sv-imp(1m|1s)-(from|to)$/.exec(ev.target.id || '');
    if (ev.target.matches('#sv-imp-sym') || im) {
      const kind = im ? im[1] : '1m';
      imp[kind] = { ...(imp[kind] || {}), quote: null, msg: null, busy: null, sym: kind === '1m' ? v('#sv-imp-sym') || 'NQ' : 'NQ', from: v(`#sv-imp${kind}-from`), to: v(`#sv-imp${kind}-to`) };
      ctx.rerender();
      return true;
    }
    return false;
  }
  function onEscape() {
    if (removing || credit || limits || nqConfirm || minConfirm || abeConfirm) { removing = null; credit = null; limits = null; nqConfirm = false; minConfirm = false; abeConfirm = false; ctx.rerender(); return true; }
    return false;
  }
  return {
    id: 'zrodla', html, wizardHtml, setWizMore: (v) => { wizMore = !!v; }, sources: () => src, handle, onInput: () => false, onChange, onEscape,
    enter() { loadSources(); loadNews(); }, leave() { clearTimeout(pollTimer); },
    keepTyped: ['#sp-dbkey', '#sp-fredkey', '#sp-fhkey', '#sv-cr-start', '#sv-cr-spent', '#sv-cr-exp', '#sv-lim-one', '#sv-lim-day', '#sv-imp1m-ok', '#sv-imp1s-ok', '#sv-imp1m-from', '#sv-imp1m-to', '#sv-imp1s-from', '#sv-imp1s-to'],
  };
}
