// Popover Ustawień (koło zębate): zakładka „Kolory danych” (gotowe palety, własna paleta osobno dla Onyx i Platinum, kontrast, podgląd na żywo),
// „Wynik BE” (marginesy) i „Wykresy” (etap 14, pakiet H: styl i kolory świec, siatka, poziomy trade'a, nakładki, strefa czasowa, B-ADJ, dane Databento, licencje). Układ w dwóch zakładkach zamiast jednej długiej kolumny: popover mieści się przy 1080 px bez przewijania
// okna, a sekcja własnych kolorów rozwija się tylko wtedy, gdy jest potrzebna.
import * as F from './format.js';
import { BE_DEFAULTS } from './stats.js';
import { PALETTES, THEMES, SWATCHES, SURFACES, normHex, ratioOn, fixContrast, defaultCustom, resolve } from './palety.js';
import { t, getLang } from './i18n.js';
import { sanitizeShare } from './udostepnij.js';
import { sanitizeChart, resetChartGroup, chartContrast, fixChartColor, previewSvg, FILM_FORMATS, FILM_SECONDS, FILM_DIMS } from './styl-wykresu.js';
import { filterSupported } from './film.js';
import { SESSION_IDS } from './podglad.js';
import { newsSettingsHtml, earnSettingsHtml } from './newsy-karty.js';
import { btDefaults, sanitizeBt, collisions, skrotOf, SKROT_ACTIONS, CEL_KINDS, BT_SPEEDS } from './bt-czas.js';
import { SESSIONS } from './swiece.js';
import { BROWSER_TZ, validTz, tzLabel, tzOptionLabel, allZones, tzGroupsHtml, loadStyleDock, saveStyleDock } from './podglad.js';

const { esc } = F;
const L = (s) => esc(t(s));
const NAMES = { profit: t('Zysk'), loss: t('Strata'), be: t('Remis (BE)') };
const PREVIEW = { profit: F.fmtR(1.25), loss: F.fmtR(-1.25), be: '0R' };
const THEME_NAME = { onyx: 'Onyx', platinum: 'Platinum' };
const fmtMargin = (x) => F.num(x, 2);
const ratioTxt = (r) => F.num(Math.floor(r * 10) / 10, 1);
const svgI = (body, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// getMeta(): { lang, version, updateCheck } z serwera; onConfig(patch): zapis do config.local.json (język, sprawdzanie aktualizacji)
// updateHtml(): sekcja „Aktualizacje” z modułu aktualizacja.js (wersja, stan, „Sprawdź teraz”, przycisk okna aktualizacji)
// devicesHtml(): zakładka „Urządzenia” (synchronizacja ustawień, lista urządzeń, dodanie urządzenia) z modułu urzadzenia.js
// onChartTz(tz): zmiana stałej strefy osi wykresu (P26, '' = strefa przeglądarki)
// onChart(chart): etap 14, zmiana settings.chart (app.js: stan bieżący, kolory świec, przerysowanie podglądu i miniatur)
// onDatabentoKey(key): zapis klucza Databento do .env po bezpłatnym sprawdzeniu (POST /api/candles/key); loadDataSize(): rozmiar chart-data/ w bajtach (GET /api/candles/size)
// onChartBadj(on): P38, „B-ADJ domyślnie włączony” (wartość początkowa przycisku B-ADJ na wykresie; przycisk przełącza chwilowo)
export function createSettings({ settings, save, getTheme, applyAll, onBe, getMeta = () => ({}), onConfig = async () => {}, updateHtml = () => '', devicesHtml = () => '', onSyncToggle = () => {}, onTab = () => {}, onChartTz = () => {}, onChartBadj = () => {}, onChart = () => {}, onDatabentoKey = async () => ({}), loadDataSize = async () => null, loadNewsStatus = async () => null, onNewsKey = async () => ({}), onEarnClass = async () => ({}), onBt = () => {}, btCopyInfo = () => null }) {
  let pop = null, scrim = null;
  let tab = 'dane';
  let editTheme = getTheme();
  let picker = null; // klucz wiersza z otwartym wyborem koloru
  let btDraft = null, btMsg = ''; // zakładka Backtest: szkic edycji; do settings.bt trafia tylko szkic bez kolizji skrótów
  const isSheet = () => window.matchMedia('(max-width: 1023px)').matches;
  const gear = () => document.getElementById('gear');
  const body = () => pop?.querySelector('#sp-body');

  // ---------- zakładka: kolory danych ----------
  function previewHtml() {
    return `<div class="pv" aria-label="${L('Podgląd palety na żywo')}" role="group">
      <div class="pv-nums"><b class="pos">${F.fmtR(2.4)}</b><b class="neg">${F.fmtR(-1)}</b><b class="be">0R</b></div>
      <svg class="pv-chart" width="132" height="34" viewBox="0 0 132 34" aria-hidden="true"><rect class="col-pos" x="4" y="6" width="14" height="22" rx="3"/><rect class="col-neg" x="24" y="17" width="14" height="11" rx="3"/><rect class="col-be" x="44" y="26" width="14" height="2" rx="1"/>
        <line class="lp-stem" x1="82" x2="82" y1="28" y2="9" style="stroke:var(--profit)"/><circle cx="82" cy="9" r="4" style="fill:var(--profit)"/><line class="lp-stem" x1="100" x2="100" y1="28" y2="22" style="stroke:var(--loss)"/><circle cx="100" cy="22" r="4" style="fill:var(--loss)"/><line class="lp-stem" x1="118" x2="118" y1="28" y2="28" style="stroke:var(--be)"/><circle cx="118" cy="28" r="4" style="fill:var(--be)"/></svg></div>`;
  }
  function cardsHtml() {
    const th = getTheme();
    return `<div class="pcards" role="group" aria-label="${L('Gotowe palety')}">${PALETTES.map((p) => {
      const c = p.id === 'wlasna' ? resolve({ palette: 'wlasna', custom: settings.custom }, th) : p.colors[th];
      const on = settings.palette === p.id;
      return `<button type="button" class="pcard" data-act="palette" data-v="${p.id}" data-fk="pal-${p.id}" aria-pressed="${on}" aria-label="${esc(t('Paleta {name}: {hint}', { name: t(p.name), hint: t(p.hint) }))}">
        <span class="dots" aria-hidden="true"><i style="background:${c.profit}"></i><i style="background:${c.loss}"></i><i style="background:${c.be}"></i></span><span class="pn">${L(p.name)}</span></button>`;
    }).join('')}</div>`;
  }
  function rowHtml(k) {
    const hex = settings.custom[editTheme][k];
    const r = ratioOn(hex, editTheme);
    const weak = r < 4.5;
    const surf = SURFACES[editTheme];
    const open = picker === k;
    return `<div class="cr" data-k="${k}"><span class="lbl cr-l" id="cr-l-${k}">${NAMES[k]}</span>
      <button type="button" class="cr-sw" data-act="sw-open" data-k="${k}" data-fk="sw-${k}" aria-expanded="${open}" aria-label="${esc(t('{name}: kolor {hex}. Wybierz kolor', { name: NAMES[k], hex }))}" style="--c:${hex}"></button>
      <span class="cr-pv" style="color:${hex};background:${surf.float}">${PREVIEW[k]}</span>
      <span class="cr-hex mono">${hex}</span>
      <span class="cr-ct${weak ? ' weak' : ''}" data-ct="${k}">${ctHtml(k, r)}</span>
      ${open ? pickerHtml(k, hex) : ''}</div>`;
  }
  function ctHtml(k, r) {
    return r < 4.5
      ? `<span class="warnb">${esc(t('słaby kontrast {ratio}:1', { ratio: ratioTxt(r) }))}</span><button type="button" class="btn ghost sm" data-act="ct-fix" data-k="${k}" data-fk="fix-${k}">${L('Popraw')}</button>`
      : `<span class="okb">${esc(t('kontrast {ratio}:1', { ratio: ratioTxt(r) }))}</span>`;
  }
  function pickerHtml(k, hex) {
    return `<div class="cr-pick" role="group" aria-label="${esc(t('Wybór koloru: {name}', { name: NAMES[k] }))}">
      <div class="swgrid">${SWATCHES[editTheme].map((c) => `<button type="button" class="sw${c === hex ? ' on' : ''}" data-act="sw-pick" data-k="${k}" data-v="${c}" data-fk="g-${k}-${c}" style="--c:${c}" aria-label="${esc(t('Kolor {hex}', { hex: c }))}" aria-pressed="${c === hex}"></button>`).join('')}</div>
      <div class="hexrow"><label class="lbl" for="hex-${k}">HEX</label><input id="hex-${k}" class="sp-in hexin" data-k="${k}" type="text" maxlength="7" value="${hex}" spellcheck="false" autocomplete="off" aria-describedby="hexe-${k}"><button type="button" class="btn sm" data-act="sw-any" data-k="${k}" data-fk="any-${k}">${L('Dowolny…')}</button>
        <input class="anycolor" data-k="${k}" type="color" value="${hex}" tabindex="-1" aria-label="${esc(t('Dowolny kolor: {name}', { name: NAMES[k] }))}"></div>
      <p class="ferr" id="hexe-${k}" hidden>${L('Wpisz kolor w formacie #RRGGBB.')}</p></div>`;
  }
  function customHtml() {
    if (settings.palette !== 'wlasna') return '';
    return `<div class="cust"><div class="cust-h"><span class="lbl" id="cust-t">${L('Własna paleta dla motywu')}</span>
      <div class="seg sm" role="group" aria-labelledby="cust-t">${THEMES.map((th) => `<button type="button" data-act="pal-edit-theme" data-v="${th}" data-fk="et-${th}" aria-pressed="${editTheme === th}">${THEME_NAME[th]}</button>`).join('')}</div></div>
      <p class="note">${L('Każdy motyw ma osobne kolory. Zmiana w jednym nie rusza drugiego. Kontrast liczony względem karty i kafla tego motywu.')}</p>
      ${['profit', 'loss', 'be'].map(rowHtml).join('')}</div>`;
  }
  function daneHtml() {
    return `${previewHtml()}<span class="lbl" id="sp-pal">${L('Paleta danych')}</span>${cardsHtml()}<div id="cust">${customHtml()}</div>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="pal-reset" data-fk="pal-reset">${L('Przywróć domyślne (Kolor)')}</button></div>
      <p class="note sp-foot">${L('Palety zmieniają kolor liczb, wykresów, heatmapy, kalendarza, rozkładu R, lizaków i plakietek Win / Loss / BE. Kolory serii wykresów zostają.')}</p>`;
  }

  // ---------- zakładka: ogólne (język, aktualizacje, wersja) ----------
  function ogolneHtml() {
    const m = getMeta() || {};
    const lang = getLang();
    const upd = m.updateCheck !== false;
    return `<div class="sp-f"><span class="lbl" id="sp-lang">${L('Język')}</span>
      <div class="seg full" role="group" aria-labelledby="sp-lang"><button type="button" data-act="sp-lang" data-v="pl" data-fk="lang-pl" aria-pressed="${lang === 'pl'}" lang="pl">Polski</button><button type="button" data-act="sp-lang" data-v="en" data-fk="lang-en" aria-pressed="${lang === 'en'}" lang="en">English</button></div>
      <p class="note">${L('Język interfejsu. Nazwy baz i pól w Notion zostają bez zmian.')}</p></div>
    <div class="rule-x"></div>
    <div class="sp-f"><label class="lbl" for="sp-nick">${L('Nick do podpisu')}</label>
      <input id="sp-nick" class="sp-in sp-nick" type="text" maxlength="40" value="${esc(settings.share?.nick || '')}" placeholder="JustJournal" autocomplete="off" spellcheck="false" aria-describedby="sp-nick-d">
      <p class="note" id="sp-nick-d">${L('Podpis na kartach z okna Udostępnij: „JustJournal × nick”. Puste pole oznacza sam podpis JustJournal.')}</p></div>
    <div class="rule-x"></div>
    ${dockHtml()}
    <div class="rule-x"></div>
    <div class="sp-f"><label class="check"><input type="checkbox" data-act="sp-upd" data-fk="upd" ${upd ? 'checked' : ''}> ${L('Sprawdzaj aktualizacje')}</label>
      <p class="note">${L('Raz na dobę serwer pyta publiczne API GitHub o najnowsze wydanie. To jedyne połączenie poza Notion; nie wysyła żadnych danych.')}</p></div>
    ${updateHtml()}
    <div class="rule-x"></div>
    <p class="note sp-foot">${m.installedSchema != null ? esc(t('schemat baz {v}', { v: m.installedSchema })) : ''}</p>`;
  }

  // P26 (28.10.2026): stała strefa czasowa osi wykresów świecowych; słowa użytkownika: «nie mam pojecia jaki czas utc jest ustawiony
  // dla dziennika, wiec powinien byc do ustawienia na wykresie jak i staly w ustawieniach». Szybki przełącznik na wykresie nadpisuje ją tymczasowo.
  // P27 (28.10.2026), słowa użytkownika: «strefy czasowe powinny byc wszystkie»: wszystkie strefy IANA z przesunięciem UTC w opisie
  // i pole filtra nad listą (wpisanie „warsz”, „new york” albo „+5:30” zawęża listę; wybrana strefa zostaje na liście zawsze).
  // P29 (28.10.2026), słowa użytkownika: «utc nie mialoby by wszystkich, mialy byc najpopularniejsze ale kazde utc zeby dalo sie wybrac przynajmniej
  // kazda godzine, aktualna lista jest za duza»: krótka lista (popularne + pełne godziny UTC) bez pola filtra; zapisana strefa spoza listy zostaje na górze.
  function tzOptions() {
    const cur = validTz(settings.chartTz) ? settings.chartTz : '';
    const opt = (v, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    return opt('', t('Strefa przeglądarki ({tz})', { tz: tzLabel(BROWSER_TZ) })) + (cur && !allZones().includes(cur) ? opt(cur, tzOptionLabel(cur)) : '') + tzGroupsHtml(opt);
  }
  function tzHtml() {
    return `<div class="sp-f"><label class="lbl" for="sp-tz">${L('Strefa czasowa wykresu')}</label>
      <select id="sp-tz" class="sp-in sp-sel" data-fk="tz" aria-describedby="sp-tz-d">${tzOptions()}</select>
      <p class="note" id="sp-tz-d">${L('Oś czasu wykresów świecowych. Czasy trade\'ów zostają te same, zmienia się tylko opis osi. Lista na wykresie zmienia strefę tymczasowo.')}</p></div>`;
  }
  // P38 (28.10.2026), słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik»: wartość początkowa przycisku B-ADJ na wykresie.
  function badjHtml() {
    return `<div class="sp-f"><label class="check"><input type="checkbox" id="sp-badj" data-fk="badj" ${settings.chartBadj !== false ? 'checked' : ''} aria-describedby="sp-badj-d"> ${L('B-ADJ domyślnie włączony')}</label>
      <p class="note" id="sp-badj-d">${L('Wykresy świecowe pokazują ceny wszystkich kontraktów przeliczone o luki rolli do kontraktu trade\'a (struktura wyższych interwałów bez skoków na rollach). Wejście, SL, TP i rysunki zostają w prawdziwych cenach kontraktu trade\'a. Przycisk B-ADJ na wykresie przełącza widok tylko chwilowo.')}</p></div>`;
  }
  // P29 (28.10.2026), słowa użytkownika: «powinien byc do tego tez przelacznik ogolny» (ustawienia rysunku: okienko po kliknięciu zębatki albo stały panel z lewej).
  function dockHtml() {
    const v = loadStyleDock();
    const b = (k, label) => `<button type="button" data-act="sp-dock" data-v="${k}" data-fk="dock-${k}" aria-pressed="${v === k}">${L(label)}</button>`;
    return `<div class="sp-f"><span class="lbl" id="sp-dock">${L('Ustawienia rysunku')}</span>
      <div class="seg full" role="group" aria-labelledby="sp-dock">${b('pop', 'Okienko')}${b('pin', 'Panel przypięty')}</div>
      <p class="note">${L('Okienko otwiera zębatka przy rysunku i znika po kliknięciu obok. Panel przypięty stoi stale po lewej stronie wykresu w trybie edycji, bez zmiany rozmiaru wykresu.')}</p></div>`;
  }

  // ---------- zakładka: wykresy (etap 14, pakiet H) ----------
  // Jeden obiekt settings.chart (styl-wykresu.js), synchronizowany przez Notion. Strefa czasowa (P26/P33) i B-ADJ (P38) przeniesione z „Ogólne” (P41, 28.10.2026,
  // słowa użytkownika: «Przenieść do „Wykresy”»; klucze chartTz i chartBadj bez zmian). Dane Databento tylko lokalne: klucz w .env, limity w config.local.json;
  // P40 (28.10.2026, «Tylko podgląd»): limity, dzisiejsze wydatki i kredyt bez pól edycji; P39 («Bez przycisku»): rozmiar chart-data/ bez usuwania.
  // Grupa „Karty i filmy”: kontrolki kart od pakietu I (karty()), opcje filmów bez kontrolek do pakietu J (decyzja sesji głównej, 28.10.2026: kontrolka razem z funkcją).
  let dataBytes = null; // rozmiar chart-data/ (bajty), wczytywany po wejściu w zakładkę
  let keyMsg = null;    // { text, error } po próbie zapisu klucza
  let newsSt = null;    // 1.4.0: statusy serwera { news, earnings } do sekcji Newsy i Earningsy (wczytywane po wejściu w zakładkę)
  let newsMsg = {};     // 1.4.0: komunikaty po zapisie kluczy FRED i Finnhub oraz ręcznych wyjątków klas
  const chart = () => (settings.chart = sanitizeChart(settings.chart));
  const fmtBytes = (n) => (n == null ? '-' : n < 1024 ? `${F.num(n, 0)} B` : n < 1024 ** 2 ? `${F.num(n / 1024, 1)} KB` : n < 1024 ** 3 ? `${F.num(n / 1024 ** 2, 1)} MB` : `${F.num(n / 1024 ** 3, 2)} GB`);
  const usdTxt = (x) => `${F.num(x, 2)} USD`;
  function setChart(p, { render = false } = {}) {
    settings.chart = sanitizeChart({ ...chart(), ...p });
    save();
    onChart(settings.chart);
    if (render) rerender(); else refreshPreview();
  }
  function setOverlays(fn) { const o = JSON.parse(JSON.stringify(chart().overlays)); fn(o); setChart({ overlays: o }); }
  const refreshPreview = () => { const el = pop?.querySelector('.pvc'); if (el) el.innerHTML = previewSvg(chart()); };
  const gHead = (id, label) => `<h3 class="sp-g" id="${id}">${L(label)}</h3>`;
  const chk = (key, on, label) => `<label class="check"><input type="checkbox" data-chk="${key}" data-fk="chk-${key}" ${on ? 'checked' : ''}> ${L(label)}</label>`;

  function chartContrastHtml(k, hex) {
    const { ratio, weak } = chartContrast(hex, editTheme);
    return weak
      ? `<span class="warnb">${esc(t('słaby kontrast {ratio}:1', { ratio: ratioTxt(ratio) }))}</span><button type="button" class="btn ghost sm" data-act="ch-fix" data-ck="${k}" data-fk="chfix-${k}">${L('Popraw')}</button>`
      : `<span class="okb">${esc(t('kontrast {ratio}:1', { ratio: ratioTxt(ratio) }))}</span>`;
  }
  function chartColorRow(k, label) {
    const hex = chart().custom[editTheme][k];
    return `<div class="cr cc" data-ck="${k}"><span class="lbl cr-l" id="cc-l-${k}">${L(label)}</span>
      <input type="color" class="cc-c" data-ck="${k}" data-fk="cc-${k}" value="${hex}" aria-labelledby="cc-l-${k}">
      <span class="cc-x"><input type="text" class="sp-in hexin cc-h" data-ck="${k}" data-fk="cch-${k}" maxlength="7" value="${hex}" spellcheck="false" autocomplete="off" aria-label="${esc(t('{name}: kolor HEX', { name: t(label) }))}"></span>
      <span class="cr-ct${chartContrast(hex, editTheme).weak ? ' weak' : ''}" data-cct="${k}">${chartContrastHtml(k, hex)}</span></div>`;
  }
  function wyglad() {
    const c = chart();
    const seg = (name, act, cur, items) => `<div class="seg full" role="group" aria-labelledby="${name}">${items.map(([v, label]) => `<button type="button" data-act="${act}" data-v="${v}" data-fk="${act}-${v}" aria-pressed="${cur === v}">${L(label)}</button>`).join('')}</div>`;
    return `${gHead('ch-g-look', 'Wygląd wykresu')}
      <div class="sp-f"><span class="lbl" id="ch-style">${L('Styl wykresu')}</span>${seg('ch-style', 'ch-style', c.style, [['candles', 'Świece'], ['line', 'Linia zamknięć']])}
        <p class="note">${L('Świece to domyślny wygląd. Linia zamknięć łączy ceny zamknięcia kolejnych świec; rysunki zostają w tym samym miejscu.')}</p></div>
      <div class="sp-f"><span class="lbl" id="ch-mini">${L('Styl miniatur na liście')}</span>${seg('ch-mini', 'ch-mini-style', c.miniStyle, [['candles', 'Świece'], ['line', 'Linia zamknięć']])}</div>
      <div class="sp-f"><span class="lbl" id="ch-col">${L('Kolory świec')}</span>${seg('ch-col', 'ch-colors', c.colorMode, [['palette', 'Z palety'], ['custom', 'Własne']])}
        ${c.colorMode === 'custom' ? `<div class="cust"><div class="cust-h"><span class="lbl" id="cc-t">${L('Własne kolory świec dla motywu')}</span>
          <div class="seg sm" role="group" aria-labelledby="cc-t">${THEMES.map((th) => `<button type="button" data-act="ch-edit-theme" data-v="${th}" data-fk="cet-${th}" aria-pressed="${editTheme === th}">${THEME_NAME[th]}</button>`).join('')}</div></div>
          ${chartColorRow('up', 'Świeca wzrostowa')}${chartColorRow('down', 'Świeca spadkowa')}</div>`
        : `<p class="note">${L('Świece mają kolory zysku i straty z wybranej palety danych (zakładka Kolory).')}</p>`}</div>
      <div class="sp-f">${chk('grid', c.grid, 'Siatka pozioma')}</div>
      <div class="sp-f"><span class="lbl" id="ch-lv">${L("Poziomy trade'a")}</span>
        <div class="sp-chk" role="group" aria-labelledby="ch-lv">${chk('entry', c.entry, 'Wejście')}${chk('exit', c.exit, 'Wyjście')}${chk('sl', c.sl, 'Stop Loss (SL)')}${chk('tp', c.tp, 'Take Profit (TP)')}</div>
        <p class="note">${L('Dotyczy podglądu, miniatur i edycji wykresu. Linia BE zostaje zawsze.')}</p></div>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="ch-reset" data-v="look" data-fk="ch-reset-look">${L('Przywróć domyślne (Wygląd)')}</button></div>`;
  }
  const SESS_NAME = { asia: 'Azja', london: 'Londyn', ny: 'NY' };
  function nakladki() {
    const o = chart().overlays;
    const rows = SESSION_IDS.map((id) => `<div class="sp-sess"><label class="check"><input type="checkbox" data-chk="sess-${id}" data-fk="chk-sess-${id}" ${o.sess[id].on ? 'checked' : ''}> ${esc(t(SESS_NAME[id]))}</label>
        <input type="time" class="sp-in" data-ovt="${id}.from" data-fk="ovf-${id}" value="${o.sess[id].from}" aria-label="${esc(t('Początek sesji {name}', { name: t(SESS_NAME[id]) }))}">
        <span aria-hidden="true">-</span>
        <input type="time" class="sp-in" data-ovt="${id}.to" data-fk="ovt-${id}" value="${o.sess[id].to}" aria-label="${esc(t('Koniec sesji {name}', { name: t(SESS_NAME[id]) }))}"></div>`).join('');
    return `${gHead('ch-g-ov', 'Nakładki')}
      <div class="sp-f">${chk('sessions', o.sessions, 'Tło sesji')}
        <div class="sp-sessions" role="group" aria-label="${L('Godziny sesji (czas Nowego Jorku)')}">${rows}</div>
        <p class="note">${L('Godziny sesji w czasie Nowego Jorku (domyślnie Azja 20:00-00:00, Londyn 02:00-05:00, NY 09:30-16:00). Kolory, linie high/low i krycie ustawisz w oknie nakładek na wykresie.')}</p></div>
      <div class="sp-f">${chk('pdhl', o.pdhl, 'PDH/PDL')}
        <p class="note">${L('Wysoki i niski punkt poprzedniej sesji; linie wymagają pobranych świec całej poprzedniej sesji.')}</p></div>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="ch-reset" data-v="overlays" data-fk="ch-reset-overlays">${L('Przywróć domyślne (Nakładki)')}</button></div>`;
  }
  // Pakiet I (etapy 16 i 17): grupa „Karty udostępniania” z kontrolkami funkcji, które już działają (decyzja sesji głównej: kontrolka razem z funkcją).
  // Pakiet J (etap 18, decyzja sesji głównej 28.10.2026): w tej samej grupie opcje filmów (format, długość, czarno-białe, przyciemnienie tła) jako
  // wartości początkowe okna Udostępnij → Film; „Przywróć domyślne (Karty)” przywraca też je. P21 («bez muzyki narazie»): bez opcji dźwięku.
  const pctTxt = (v) => `${F.num(v * 100, 0)}%`;
  function filmy() {
    const c = chart();
    const seg = (name, act, cur, items) => `<div class="seg full" role="group" aria-labelledby="${name}">${items.map(([v, label]) => `<button type="button" data-act="${act}" data-v="${v}" data-fk="${act}-${v}" aria-pressed="${String(cur) === String(v)}">${esc(label)}</button>`).join('')}</div>`;
    return `<div class="sp-f"><span class="lbl" id="ch-film-format">${L('Format filmu')}</span>${seg('ch-film-format', 'ch-film-format', c.filmFormat, FILM_FORMATS.map((v) => [v, v]))}</div>
      <div class="sp-f"><span class="lbl" id="ch-film-seconds">${L('Długość filmu')}</span>${seg('ch-film-seconds', 'ch-film-seconds', c.filmSeconds, FILM_SECONDS.map((v) => [v, `${v} s`]))}</div>
      ${filterSupported() ? `<div class="sp-f">${chk('filmBw', c.filmBw, 'Czarno-białe')}</div>` : ''}
      <div class="sp-f sp-range"><label class="lbl" for="sp-film-dim">${L('Przyciemnienie tła')}</label>
        <span class="sp-range-row"><input type="range" id="sp-film-dim" data-range="filmDim" data-fk="film-dim" min="${FILM_DIMS[0]}" max="${FILM_DIMS[FILM_DIMS.length - 1]}" step="0.1" value="${c.filmDim}" aria-describedby="sp-film-d"><output data-out="filmDim" for="sp-film-dim">${pctTxt(c.filmDim)}</output></span>
        <p class="note" id="sp-film-d">${L('Wartości początkowe okna Udostępnij → Film. Czarno-białe i przyciemnienie dotyczą tła ze zdjęcia albo filmu. Filmy nagrywają się bez dźwięku.')}</p></div>`;
  }
  function karty() {
    const c = chart();
    // v2 (P45, P46): dwa style kart (świece, linia) i rysunek pozycji; to wartości początkowe okna Udostępnij (wybór w oknie je zapisuje)
    const st = [['candles', 'Świece'], ['line', 'Linia']];
    const dr = [['position', 'Pozycja'], ['marks', 'Wejście i wyjście']];
    return `${gHead('ch-g-cards', 'Karty udostępniania')}
      <div class="sp-f">${chk('shareChart', c.shareChart, 'Wykres ceny w kartach')}
        <p class="note">${L('Karta trade\'a pokazuje wykres z pobranych świec (bez pobierania nowych). Ceny jak w podglądzie trade\'a, także B-ADJ.')}</p></div>
      <div class="sp-f"><span class="lbl" id="ch-share-style">${L('Styl wykresu w karcie')}</span><div class="seg full" role="group" aria-labelledby="ch-share-style">${st.map(([v, label]) => `<button type="button" data-act="ch-share-style" data-v="${v}" data-fk="ch-share-style-${v}" aria-pressed="${c.shareStyle === v}"${c.shareChart ? '' : ' disabled'}>${L(label)}</button>`).join('')}</div></div>
      <div class="sp-f"><span class="lbl" id="ch-share-draw">${L('Rysunek pozycji w karcie')}</span><div class="seg full" role="group" aria-labelledby="ch-share-draw">${dr.map(([v, label]) => `<button type="button" data-act="ch-share-draw" data-v="${v}" data-fk="ch-share-draw-${v}" aria-pressed="${c.shareDraw === v}"${c.shareChart ? '' : ' disabled'}>${L(label)}</button>`).join('')}</div>
        <p class="note">${L('Pozycja: strefy zysku i straty do TP i SL jak w TradingView. Wejście i wyjście: same znaczniki. Wybór w oknie Udostępnij zapisuje się tutaj.')}</p></div>
      <div class="sp-f">${chk('equity', c.equity, 'Krzywa kapitału na kartach okresu')}
        <p class="note">${L('Wartość początkowa przełącznika w oknie Udostępnij (dzień, tydzień, miesiąc, rok).')}</p></div>
      ${filmy()}
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="ch-reset" data-v="cards" data-fk="ch-reset-cards">${L('Przywróć domyślne (Karty)')}</button></div>`;
  }
  function czas() {
    return `${gHead('ch-g-time', 'Czas i ceny')}${tzHtml()}<div class="rule-x"></div>${badjHtml()}
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="ch-reset" data-v="time" data-fk="ch-reset-time">${L('Przywróć domyślne (Czas i ceny)')}</button></div>`;
  }
  function daneDatabento() {
    const m = getMeta() || {}, cr = m.chartCredit;
    const kv = (k, v) => `<div class="sp-kv"><span>${L(k)}</span><b>${v}</b></div>`;
    const credit = cr ? (cr.expired ? esc(t('wygasł {expires}', { expires: cr.expires })) : esc(t('{left} z {start} USD, ważny do {expires}', { left: F.num(cr.leftUsd, 2), start: F.num(cr.startUsd, 2), expires: cr.expires }))) : '-';
    return `${gHead('ch-g-data', 'Dane Databento')}
      <div class="sp-f"><label class="lbl" for="sp-dbkey">${L('Klucz Databento')}</label>
        <div class="sp-keyrow"><input id="sp-dbkey" class="sp-in sp-key" type="password" autocomplete="off" spellcheck="false" maxlength="100" data-fk="dbkey" placeholder="${esc(m.hasDatabentoKey ? t('Zapisany. Wklej nowy, aby zmienić') : t('Wklej klucz Databento'))}" aria-describedby="sp-dbkey-d">
          <button type="button" class="btn sm" data-act="ch-key-save" data-fk="dbkey-save">${L('Zapisz i sprawdź')}</button></div>
        <p class="note" id="sp-dbkey-d" aria-live="polite">${keyMsg ? `<span class="${keyMsg.error ? 'warnb' : 'okb'}">${esc(keyMsg.text)}</span> ` : ''}${L('Klucz zapisuje się tylko w pliku .env na tym komputerze, po bezpłatnym sprawdzeniu u Databento. Nie trafia do Notion ani do synchronizacji ustawień.')}</p></div>
      <div class="sp-f sp-kvs">${kv('Limit na jedno pobranie', usdTxt(m.chartCostLimitUsd ?? 0))}${kv('Limit dzienny', usdTxt(m.chartDailyLimitUsd ?? 0))}${kv('Wydano dziś', usdTxt(m.chartSpentTodayUsd ?? 0))}${kv('Kredyt Databento', credit)}${kv('Pobrane świece na dysku', esc(fmtBytes(dataBytes)))}
        <p class="note">${L('Limity i kredyt tylko do podglądu. Zmieniasz je w pliku config.local.json (chartCostLimitUsd, chartDailyLimitUsd, chartCredit); świece usuwasz ręcznie z folderu chart-data. Ponowne pobranie jest płatne.')}</p></div>
      <div class="sp-f"><label class="check"><input type="checkbox" data-act="ch-nq1s" data-fk="ch-nq1s" ${m.chartNq1sDaily !== false ? 'checked' : ''}> ${L('Codziennie pobieraj 1s NQ 9:30–11:00 NY')}</label>
        <p class="note">${L('Kolejka dokłada okno sekundowe NQ z pierwszych 90 minut sesji Nowego Jorku każdego dnia, gdy Databento je udostępni (ok. 0,02 USD na dzień, w zwykłych limitach). Nadrabia dni, w których dashboard był wyłączony. Ustawienie tylko na tym komputerze.')}</p></div>`;
  }
  function licencje() {
    return `${gHead('ch-g-lic', 'Licencje')}
      <div class="sp-f sp-lic"><p class="note">TradingView Lightweight Charts™, Copyright © 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noopener">https://www.tradingview.com/</a> (Apache-2.0).</p>
        <p class="note">${L('Narzędzia rysowania: lightweight-charts-drawing 0.6.2 (MIT).')}</p>
        <p class="note">${L('Świece pochodzą z Databento (dane CME Group) i służą do użytku własnego w dzienniku. Udostępniając wykres publicznie, odpowiadasz za prawa do danych według licencji Databento i CME.')}</p>
        <p class="note">${L('Filmy tła wybierasz z dysku przy każdym nagraniu. Zostają w tej przeglądarce (nie trafiają do Notion ani do synchronizacji ustawień), a gotowy film nie ma dźwięku. Używaj tylko nagrań, do których masz prawa (obraz i muzyka).')}</p></div>`;
  }
  function wykresyHtml() {
    return `<div class="pv pvc" role="img" aria-label="${L('Podgląd wykresu na żywo')}">${previewSvg(chart())}</div>
      ${wyglad()}<div class="rule-x"></div>${nakladki()}<div class="rule-x"></div>${newsSettingsHtml({ c: chart(), st: newsSt, meta: getMeta() || {}, msg: newsMsg, chk })}<div class="rule-x"></div>${earnSettingsHtml({ c: chart(), st: newsSt, meta: getMeta() || {}, msg: newsMsg, chk })}<div class="rule-x"></div>${karty()}<div class="rule-x"></div>${czas()}<div class="rule-x"></div>${daneDatabento()}<div class="rule-x"></div>${licencje()}`;
  }
  async function loadSize() {
    try { dataBytes = await loadDataSize(); } catch { dataBytes = null; }
    if (pop && tab === 'wykresy') { const fk = document.activeElement?.dataset?.fk; rerender({ keep: false }); if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus(); }
  }
  async function loadNews() {
    try { newsSt = await loadNewsStatus(); } catch { newsSt = null; }
    if (pop && tab === 'wykresy') { const fk = document.activeElement?.dataset?.fk; rerender({ keep: false }); if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus(); }
  }
  async function saveNewsKey(kind) {
    const id = kind === 'fred' ? '#sp-fredkey' : '#sp-fhkey', slot = kind === 'fred' ? 'fred' : 'finnhub';
    const key = pop?.querySelector(id)?.value.trim();
    if (!key) { newsMsg[slot] = { text: t(kind === 'fred' ? 'Wklej klucz FRED.' : 'Wklej klucz Finnhub.'), error: true }; rerender(); return; }
    newsMsg[slot] = { text: t('Zapisuję…'), error: false }; rerender();
    try { const r = await onNewsKey(kind, key); newsMsg[slot] = r?.ok ? { text: t('Klucz zapisany. Dane pobierają się w tle, stan zobaczysz niżej.'), error: false } : { text: r?.error || t('Nie udało się zapisać klucza.'), error: true }; }
    catch { newsMsg[slot] = { text: t('Nie udało się zapisać klucza.'), error: true }; }
    if (!newsMsg[slot].error) { const k = pop?.querySelector(id); if (k) k.value = ''; setTimeout(loadNews, 4000); setTimeout(loadNews, 12000); }
    rerender();
  }
  async function earnClass(body) {
    try { const r = await onEarnClass(body); newsMsg.classes = r?.ok ? { text: t('Zapisano.'), error: false } : { text: r?.error || t('Nie udało się zapisać.'), error: true }; }
    catch { newsMsg.classes = { text: t('Nie udało się zapisać.'), error: true }; }
    await loadNews();
  }
  async function saveKey() {
    const inp = pop?.querySelector('#sp-dbkey');
    const key = inp?.value.trim();
    if (!key) { keyMsg = { text: t('Wklej klucz Databento.'), error: true }; rerender(); return; }
    keyMsg = { text: t('Sprawdzam klucz…'), error: false }; rerender();
    try { const r = await onDatabentoKey(key); keyMsg = r?.ok ? { text: t('Klucz sprawdzony i zapisany.'), error: false } : { text: r?.error || t('Nie udało się zapisać klucza.'), error: true }; }
    catch { keyMsg = { text: t('Nie udało się zapisać klucza.'), error: true }; }
    // zapisany klucz znika z pola (jest w .env); po błędzie zostaje do poprawienia (przegląd HIJ, pkt 7)
    if (!keyMsg.error) { const k = pop?.querySelector('#sp-dbkey'); if (k) k.value = ''; }
    rerender();
  }
  function setCustomColor(k, hex) {
    const c = chart();
    setChart({ custom: { ...c.custom, [editTheme]: { ...c.custom[editTheme], [k]: hex } } });
  }
  function refreshChartRow(k) {
    const row = pop?.querySelector(`.cc[data-ck="${k}"]`);
    if (!row) return;
    const hex = chart().custom[editTheme][k];
    const c = row.querySelector('.cc-c'); if (c && c.value !== hex) c.value = hex;
    const h = row.querySelector('.cc-h'); if (h && document.activeElement !== h) h.value = hex;
    const ct = row.querySelector('.cr-ct'); ct.classList.toggle('weak', chartContrast(hex, editTheme).weak); ct.innerHTML = chartContrastHtml(k, hex);
  }

  // ---------- zakładka: wynik BE ----------
  function beHtml() {
    return `<div class="sp-f"><label class="lbl" for="be-r">${L('Margines BE (R)')}</label>
      <input id="be-r" class="sp-in" type="number" inputmode="decimal" min="0" max="0.5" step="0.05" value="${settings.beR}" aria-describedby="be-r-d">
      <p class="note" id="be-r-d">${L('Trade z wynikiem w granicach ±tego marginesu liczy się jako BE. Rekomendacja 0,1R: koszty, spread i poślizg przy wyjściu na BE mieszczą się zwykle w tym zakresie.')}</p>
      <button type="button" class="btn ghost sm" data-act="be-reset" data-v="beR">${esc(t('Przywróć rekomendowane ({v})', { v: fmtMargin(BE_DEFAULTS.beR) + 'R' }))}</button></div>
    <div class="rule-x"></div>
    <div class="sp-f"><label class="lbl" for="be-usd">${L('Margines BE ($)')}</label>
      <input id="be-usd" class="sp-in" type="number" inputmode="decimal" min="0" max="100000" step="1" value="${settings.beUsd}" aria-describedby="be-usd-d">
      <p class="note" id="be-usd-d">${L('Działa tylko dla wpisów bez R. 0 wyłącza go (rekomendowane, bo bez R nie znamy ryzyka).')}</p>
      <button type="button" class="btn ghost sm" data-act="be-reset" data-v="beUsd">${esc(t('Przywróć rekomendowane ({v})', { v: F.fmtMoney(BE_DEFAULTS.beUsd, { plus: false }) }))}</button></div>
    <p class="note sp-foot">${L('Zmiana przelicza widok od razu. Sumy R i $, profit factor i krzywa zostają na surowych wartościach.')}</p>`;
  }

  // ---------- zakładka: Backtest (1.5.0, pakiet C2) ----------
  // Skoki (nazwa, cel, skrót), skróty akcji replayu, domyślna godzina startu, ryzyko i szybkość. Skrót wpisuje się naciśnięciem klawisza w polu (Backspace czyści).
  // Kolizja skrótów (z zarezerwowanym, między skokami i akcjami) blokuje zapis: pola się podświetlają, w ustawieniach zostaje ostatni poprawny stan.
  const btClone = (x) => JSON.parse(JSON.stringify(x));
  const btActionLabel = () => ({
    play: t('Odtwarzaj / pauza'), stepFwd: t('Krok w przód'), stepBack: t('Krok wstecz'), jump: t('Skok wybrany na liście'), speedUp: t('Szybciej'), speedDown: t('Wolniej'),
    buy: t('Kup rynkowo'), sell: t('Sprzedaj rynkowo'), closeAll: t('Zamknij pozycję'), endDay: t('Zakończ dzień'), drawEntry: t('Wejdź według rysunku'),
  });
  const btCelLabel = () => ({ time: t('Godzina NY'), session: t('Początek sesji'), news: t('Następny news'), offset: t('Przesunięcie (min)'), nextDay: t('Następny dzień z puli') });
  const btSessionName = (id) => ({ asia: t('Azja'), london: t('Londyn'), ny: 'NY' }[id] || id);
  function btCelParam(j, i) {
    const c = j.cel;
    if (c.kind === 'time') return `<input class="sp-in" type="time" data-btf="cel.at" data-i="${i}" data-fk="btj-${i}-at" value="${esc(c.at)}" aria-label="${L('Godzina NY')}">`;
    if (c.kind === 'session') return `<select class="sp-in sp-sel" data-btf="cel.id" data-i="${i}" data-fk="btj-${i}-id" aria-label="${L('Początek sesji')}">${SESSIONS.map((x) => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(btSessionName(x.id))}</option>`).join('')}</select>`;
    if (c.kind === 'news') return `<select class="sp-in sp-sel" data-btf="cel.minImp" data-i="${i}" data-fk="btj-${i}-imp" aria-label="${L('Waga newsa')}"><option value="high"${c.minImp === 'high' ? ' selected' : ''}>${L('wysoka')}</option><option value="medium"${c.minImp === 'medium' ? ' selected' : ''}>${L('średnia i wysoka')}</option></select>`;
    if (c.kind === 'offset') return `<input class="sp-in" type="number" min="1" max="600" step="1" data-btf="cel.min" data-i="${i}" data-fk="btj-${i}-min" value="${Math.round(c.sec / 60)}" aria-label="${L('Przesunięcie (min)')}">`;
    return '';
  }
  function btHtml() {
    btDraft ||= btClone(sanitizeBt(settings.bt));
    const d = btDraft, cols = collisions(d.skroty, d.jumps), bad = new Set(cols.flatMap((c) => [c.a, c.b]));
    const inv = (id) => (bad.has(id) ? ' aria-invalid="true"' : '');
    const kinds = btCelLabel(), acts = btActionLabel();
    const rows = d.jumps.map((j, i) => `<div class="bt-sj" data-i="${i}">
        <input class="sp-in" type="text" maxlength="60" data-btf="name" data-i="${i}" data-fk="btj-${i}-name" value="${esc(j.name)}" aria-label="${L('Nazwa skoku')}">
        <select class="sp-in sp-sel" data-btf="cel.kind" data-i="${i}" data-fk="btj-${i}-kind" aria-label="${L('Cel skoku')}">${CEL_KINDS.map((k) => `<option value="${k}"${k === j.cel.kind ? ' selected' : ''}>${esc(kinds[k])}</option>`).join('')}</select>
        ${btCelParam(j, i)}
        <span class="note bt-sjk" aria-hidden="true">${L('Skrót')}</span><input class="sp-in bt-skrot" type="text" readonly title="${esc(j.skrot)}" data-bts="jump:${esc(j.id)}" data-i="${i}" data-fk="btj-${i}-skrot" value="${esc(j.skrot)}" placeholder="${L('skrót')}" aria-label="${L('Skrót skoku')}"${inv('jump:' + j.id)}>
        <button type="button" class="icon-btn" data-act="bt-del" data-v="${i}" data-fk="btj-${i}-del" aria-label="${L('Usuń skok')}">${svgI('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>`).join('');
    const actRows = SKROT_ACTIONS.map((a) => `<label class="bt-sa"><span>${esc(acts[a] || a)}</span><input class="sp-in bt-skrot" type="text" readonly title="${esc(d.skroty[a])}" data-bts="skroty:${a}" data-fk="bta-${a}" value="${esc(d.skroty[a])}" placeholder="${L('skrót')}" aria-label="${esc(acts[a] || a)}"${inv(a)}></label>`).join('');
    const mode = (m, l) => `<button type="button" data-act="bt-risk-mode" data-v="${m}" data-fk="btd-mode-${m}" aria-pressed="${d.risk.mode === m}">${esc(l)}</button>`;
    return `<div class="sp-f"><span class="lbl">${L('Skoki')}</span>
        <div class="bt-sjl">${rows || `<p class="note">${L('Brak skoków.')}</p>`}</div>
        <div class="bt-sjb"><button type="button" class="btn ghost sm" data-act="bt-add" data-fk="bt-add">${L('Dodaj skok')}</button><button type="button" class="btn ghost sm" data-act="bt-reset" data-fk="bt-reset">${L('Przywróć domyślne')}</button></div>
        <p class="note">${L('Skok jest pod przyciskiem „Skocz” przy pasku replayu i pod własnym skrótem. Skrót wpisujesz, naciskając klawisze w polu; Backspace czyści.')}</p></div>
      <div class="rule-x"></div>
      <div class="sp-f"><span class="lbl">${L('Skróty akcji')}</span><div class="bt-sal">${actRows}</div></div>
      <p class="note bt-serr" role="alert"${cols.length ? '' : ' hidden'}>${L('Skróty kolidują ze sobą albo z klawiszami wykresu (Escape, strzałki, Ctrl+Z, +, −, Enter). Zmiana nie została zapisana.')}</p>
      <div class="rule-x"></div>
      <div class="sp-f"><span class="lbl">${L('Szablony filtra dni')}</span>${btTemplatesHtml()}</div>
      <div class="rule-x"></div>
      <div class="sp-f"><span class="lbl">${L('Domyślne wartości nowej sesji')}</span>
        <div class="bt-sdef"><label class="bt-sa"><span>${L('Godzina startu (NY)')}</span><input class="sp-in" type="time" data-btd="startTime" data-fk="btd-start" value="${esc(d.startTime)}"></label>
        <div class="bt-sa"><span>${L('Ryzyko na trade')}</span><div class="bt-row"><div class="seg sm" role="group" aria-label="${L('Rodzaj ryzyka')}">${mode('usd', 'USD')}${mode('pct', t('% salda'))}</div><input class="sp-in" type="number" min="0" step="any" data-btd="risk" data-fk="btd-risk" value="${d.risk.value}" aria-label="${L('Wartość ryzyka')}"></div></div>
        <label class="bt-sa"><span>${L('Szybkość odtwarzania')}</span><select class="sp-in sp-sel" data-btd="speed" data-fk="btd-speed">${BT_SPEEDS.map((v) => `<option value="${v}"${v === d.speed ? ' selected' : ''}>${v}×</option>`).join('')}</select></label></div>
        <p class="note bt-smsg" role="status">${esc(btMsg)}</p></div>${btCopyNote()}`;
  }
  // F2: szablony filtra dni zapisane w kreatorze (bt.templates = [{ name, filterJ }]); tu tylko zmiana nazwy i usunięcie, bez szkicu (kreator też je zapisuje)
  function btTemplatesHtml() {
    const list = sanitizeBt(settings.bt).templates;
    if (!list.length) return `<p class="note">${L('Szablony zapisujesz w kreatorze sesji, w sekcji Filtr dni (zaawansowane).')}</p>`;
    return `<div class="bt-tpl">${list.map((e, i) => `<div class="bt-tpl-r"><input class="sp-in" type="text" maxlength="60" data-btt="${i}" data-fk="btt-${i}" value="${esc(e.name)}" aria-label="${L('Nazwa szablonu')}"><button type="button" class="icon-btn" data-act="bt-tdel" data-v="${i}" data-fk="btt-${i}-del" aria-label="${L('Usuń szablon')}">${svgI('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>`).join('')}</div>`;
  }
  function btTplSet(list) { settings.bt = sanitizeBt({ ...settings.bt, templates: list }); save(); onBt(settings.bt); rerender(); }
  // E2: część sesji nie mieści się w kopii definicji w bloku ustawień: te sesje zostają tylko na tym komputerze
  function btCopyNote() {
    const c = btCopyInfo();
    return c?.skipped ? `<div class="rule-x"></div><p class="note bt-scopy">${esc(t('Sesje backtestu poza kopią w synchronizacji ustawień (limit 30 000 znaków): {n}. Te sesje są zapisane tylko na tym komputerze.', { n: c.skipped }))}</p>` : '';
  }
  // Zapis szkicu: tylko bez kolizji skrótów. settings.bt przechodzi sanitizeBt (zły skok odpada), potem zapis i synchronizacja.
  function btCommit() {
    if (collisions(btDraft.skroty, btDraft.jumps).length) { rerender(); return false; }
    settings.bt = sanitizeBt({ ...btClone(btDraft), sessionsCopy: settings.bt?.sessionsCopy || [], templates: settings.bt?.templates || [] }); // E2: kopię definicji sesji prowadzi app.js, szkic jej nie cofa; F2: szablony filtra też (zapisuje je kreator)
    save(); onBt(settings.bt);
    rerender();
    return true;
  }
  function btField(el) {
    const d = btDraft, f = el.dataset.btf, i = Number(el.dataset.i), j = d.jumps[i];
    if (!j) return;
    btMsg = '';
    if (f === 'name') j.name = el.value.trim().slice(0, 60) || j.name;
    else if (f === 'cel.kind') j.cel = ({ time: { kind: 'time', at: '09:30' }, session: { kind: 'session', id: 'ny' }, news: { kind: 'news', minImp: 'high' }, offset: { kind: 'offset', sec: 900 }, nextDay: { kind: 'nextDay' } })[el.value] || j.cel;
    else if (f === 'cel.at') { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(el.value)) j.cel.at = el.value; else btMsg = t('Podaj godzinę w formacie GG:MM.'); }
    else if (f === 'cel.id') j.cel.id = el.value;
    else if (f === 'cel.minImp') j.cel.minImp = el.value === 'medium' ? 'medium' : 'high';
    else if (f === 'cel.min') { const m = Math.round(Number(el.value)); if (m >= 1 && m <= 600) j.cel.sec = m * 60; else btMsg = t('Przesunięcie: od 1 do 600 minut.'); }
    btCommit();
  }
  function btDefault(el) {
    const d = btDraft, k = el.dataset.btd;
    btMsg = '';
    if (k === 'startTime') { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(el.value) && el.value < '16:00') d.startTime = el.value; else btMsg = t('Godzina startu: od 00:00 do 15:59 NY.'); }
    else if (k === 'risk') { const v = Number(el.value); if (v > 0 && !(d.risk.mode === 'pct' && v > 100)) d.risk.value = v; else btMsg = d.risk.mode === 'pct' ? t('Ryzyko w % salda: od 0 do 100.') : t('Ryzyko musi być większe od zera.'); }
    else if (k === 'speed') d.speed = Number(el.value);
    btCommit();
  }
  // Pole skrótu: naciśnięty klawisz zamienia się w tekst skrótu (skrotOf). Tab i Escape zostają (nawigacja i zamknięcie okna).
  function onBtKey(ev) {
    const el = ev.target;
    if (!el?.matches?.('[data-bts]') || !btDraft) return;
    if (ev.key === 'Tab' || ev.key === 'Escape') return;
    ev.preventDefault();
    const [grp, id] = el.dataset.bts.split(':');
    const value = ev.key === 'Backspace' || ev.key === 'Delete' ? '' : skrotOf(ev);
    if (value === '' && ev.key !== 'Backspace' && ev.key !== 'Delete') return; // sam modyfikator
    if (grp === 'skroty') btDraft.skroty[id] = value;
    else { const j = btDraft.jumps.find((x) => x.id === id); if (j) j.skrot = value; }
    btMsg = '';
    btCommit();
  }

  function html() {
    const tabBtn = (v, label) => `<button type="button" role="tab" data-act="sp-tab" data-v="${v}" data-fk="tab-${v}" aria-selected="${tab === v}">${L(label)}</button>`;
    return `<div class="sp-h"><h2 id="sp-t">${L('Ustawienia')}</h2><button type="button" class="icon-btn" data-act="settings" aria-label="${L('Zamknij ustawienia')}">${svgI('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="seg full sp-tabs" role="tablist" aria-label="${L('Sekcje ustawień')}">${tabBtn('dane', 'Kolory')}${tabBtn('be', 'Wynik BE')}${tabBtn('wykresy', 'Wykresy')}${tabBtn('backtest', 'Backtest')}${tabBtn('ogolne', 'Ogólne')}${tabBtn('urzadzenia', 'Urządzenia')}</div>
      <div id="sp-body" role="tabpanel">${tab === 'dane' ? daneHtml() : tab === 'be' ? beHtml() : tab === 'wykresy' ? wykresyHtml() : tab === 'backtest' ? btHtml() : tab === 'urzadzenia' ? devicesHtml() : ogolneHtml()}</div>`;
  }

  // odświeża zawartość, zachowując fokus (po kluczu data-fk)
  function rerender({ keep = true } = {}) {
    if (!pop) return;
    const fk = keep ? document.activeElement?.dataset?.fk : null;
    // przegląd HIJ, pkt 7 (29.10.2026): wklejony, jeszcze niezapisany klucz Databento przeżywa przerysowanie (np. po wczytaniu rozmiaru chart-data);
    // wartość zostaje tylko w polu na stronie, nigdzie nie jest zapisywana
    const typed = ['#sp-dbkey', '#sp-fredkey', '#sp-fhkey', '#sp-earn-sym'].map((id) => [id, pop.querySelector(id)?.value || '']);
    pop.innerHTML = html();
    for (const [id, v] of typed) if (v) { const k = pop.querySelector(id); if (k) k.value = v; }
    if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus();
  }

  // ---------- otwieranie i zamykanie ----------
  function open(at) {
    if (pop) return;
    editTheme = getTheme();
    tab = typeof at === 'string' ? at : 'dane';
    picker = null;
    pop = document.createElement('div');
    pop.className = 'sp';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-labelledby', 'sp-t');
    pop.innerHTML = html();
    scrim = document.createElement('div');
    scrim.className = 'rp-scrim';
    scrim.addEventListener('click', () => close());
    document.body.append(scrim, pop);
    gear().setAttribute('aria-expanded', 'true');
    pop.addEventListener('keydown', onBtKey);
    pop.querySelector(`[data-fk="tab-${tab}"]`).focus();
    if (tab === 'wykresy') { loadSize(); loadNews(); }
  }
  function close({ restore = true } = {}) {
    if (!pop) return;
    pop.remove(); scrim.remove();
    pop = null; scrim = null; picker = null; btDraft = null; btMsg = '';
    gear().setAttribute('aria-expanded', 'false');
    if (restore) gear().focus();
  }
  const toggle = (at) => (pop ? close() : open(at));

  // ---------- zmiany kolorów ----------
  function setColor(k, hex) {
    settings.custom[editTheme][k] = hex;
    settings.palette = 'wlasna';
    save();
    if (editTheme === getTheme()) applyAll();
  }
  function refreshRow(k) {
    const row = pop?.querySelector(`.cr[data-k="${k}"]`);
    if (!row) return;
    const hex = settings.custom[editTheme][k];
    const r = ratioOn(hex, editTheme);
    row.querySelector('.cr-sw').style.setProperty('--c', hex);
    row.querySelector('.cr-sw').setAttribute('aria-label', t('{name}: kolor {hex}. Wybierz kolor', { name: NAMES[k], hex }));
    row.querySelector('.cr-pv').style.color = hex;
    row.querySelector('.cr-hex').textContent = hex;
    const ct = row.querySelector('.cr-ct');
    ct.classList.toggle('weak', r < 4.5);
    ct.innerHTML = ctHtml(k, r);
    row.querySelectorAll('.sw').forEach((b) => { const on = b.dataset.v === hex; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    const anyI = row.querySelector('.anycolor'); if (anyI) anyI.value = hex;
    // karty gotowych palet: kropki „Własnej” zależą od kolorów
    const cust = pop.querySelector('[data-act="palette"][data-v="wlasna"] .dots');
    if (cust && editTheme === getTheme()) { const c = settings.custom[getTheme()]; const d = cust.querySelectorAll('i'); d[0].style.background = c.profit; d[1].style.background = c.loss; d[2].style.background = c.be; }
  }

  function handle(act, v, el) {
    switch (act) {
      case 'settings': toggle(); return true;
      case 'sp-tab': tab = v; picker = null; btDraft = null; btMsg = ''; rerender(); pop.querySelector(`[data-fk="tab-${v}"]`)?.focus(); /* H2 #28: fokus idzie z zakładką (bez obwódki na poprzedniej) */ if (v === 'urzadzenia') onTab(v); if (v === 'wykresy') { loadSize(); loadNews(); } return true;
      case 'bt-add': btDraft.jumps.push({ id: 'j' + Date.now().toString(36), name: t('Nowy skok'), cel: { kind: 'offset', sec: 300 }, skrot: '' }); btCommit(); pop.querySelector('[data-fk="bt-add"]')?.focus(); return true;
      case 'bt-tdel': { const list = sanitizeBt(settings.bt).templates; list.splice(Number(v), 1); btTplSet(list); return true; }
      case 'bt-del': btDraft.jumps.splice(Number(v), 1); btCommit(); return true;
      case 'bt-reset': { const dflt = btDefaults(); btDraft.jumps = dflt.jumps; btCommit(); return true; }
      case 'bt-risk-mode': if (btDraft.risk.mode !== v) { btDraft.risk.mode = v === 'pct' ? 'pct' : 'usd'; if (v === 'pct' && btDraft.risk.value > 100) btDraft.risk.value = 1; } btCommit(); return true;
      case 'ch-style': setChart({ style: v }, { render: true }); return true;
      case 'ch-colors': setChart({ colorMode: v }, { render: true }); return true;
      case 'ch-share-style': setChart({ shareStyle: v }, { render: true }); return true;
      case 'ch-share-draw': setChart({ shareDraw: v }, { render: true }); return true;
      case 'ch-mini-style': setChart({ miniStyle: v }, { render: true }); return true;
      case 'ch-film-format': setChart({ filmFormat: v }, { render: true }); return true;
      case 'ch-film-seconds': setChart({ filmSeconds: Number(v) }, { render: true }); return true;
      case 'ch-edit-theme': editTheme = v; rerender(); return true;
      case 'ch-fix': { const k = el.dataset.ck; setCustomColor(k, fixChartColor(chart().custom[editTheme][k], editTheme)); rerender(); return true; }
      case 'ch-key-save': saveKey(); return true;
      case 'news-key-save': saveNewsKey('fred'); return true;
      case 'earn-key-save': saveNewsKey('finnhub'); return true;
      case 'earn-class-add': { const sym = pop.querySelector('#sp-earn-sym')?.value.trim(), cls = Number(pop.querySelector('#sp-earn-cls')?.value); if (!sym) { newsMsg.classes = { text: t('Wpisz ticker.'), error: true }; rerender(); return true; } earnClass({ symbol: sym, cls }).then(() => { const i = pop?.querySelector('#sp-earn-sym'); if (i) i.value = ''; }); return true; }
      case 'earn-class-del': earnClass({ symbol: v, remove: true }); return true;
      case 'ch-reset': {
        if (v === 'time') { settings.chartTz = ''; settings.chartBadj = true; save(); onChartTz(''); onChartBadj(true); rerender(); return true; }
        settings.chart = resetChartGroup(chart(), v === 'look' || v === 'cards' ? v : 'overlays');
        if (v === 'look') settings.chart = resetChartGroup(settings.chart, 'levels');
        save(); onChart(settings.chart); rerender(); return true;
      }
      case 'palette': {
        if (v === 'wlasna' && !settings.customSeeded) {
          // pierwsze wejście w „Własną”: zaczynamy od kolorów aktualnie używanej palety
          const cur = { palette: settings.palette, custom: settings.custom };
          settings.custom = { onyx: { ...resolve(cur, 'onyx') }, platinum: { ...resolve(cur, 'platinum') } };
          for (const t of THEMES) delete settings.custom[t].cellmix;
          settings.customSeeded = true;
        }
        settings.palette = v;
        editTheme = getTheme();
        picker = null;
        save(); applyAll(); rerender();
        return true;
      }
      case 'pal-edit-theme': editTheme = v; picker = null; rerender(); return true;
      case 'sp-dock': saveStyleDock(v); pop.querySelectorAll('[data-act="sp-dock"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); return true;
      case 'sp-lang': if (v !== getLang()) onConfig({ lang: v }); return true;
      case 'sw-open': { const k = el.dataset.k; picker = picker === k ? null : k; rerender(); if (picker) (pop.querySelector(`[data-fk="g-${k}-${settings.custom[editTheme][k]}"]`) || pop.querySelector(`#hex-${k}`))?.focus(); return true; }
      case 'sw-pick': setColor(el.dataset.k, el.dataset.v); refreshRow(el.dataset.k); refreshCards(); return true;
      case 'sw-any': { const i = pop.querySelector(`.anycolor[data-k="${el.dataset.k}"]`); if (i.showPicker) { try { i.showPicker(); } catch { i.click(); } } else i.click(); return true; }
      case 'ct-fix': { const k = el.dataset.k; setColor(k, fixContrast(settings.custom[editTheme][k], editTheme)); rerender(); return true; }
      case 'pal-reset': settings.palette = 'color'; settings.custom = defaultCustom(); settings.customSeeded = false; picker = null; save(); applyAll(); rerender(); return true;
      case 'be-reset': { const inp = pop.querySelector(v === 'beR' ? '#be-r' : '#be-usd'); inp.value = BE_DEFAULTS[v]; onBe(v, inp.value); inp.focus(); return true; }
      default: return false;
    }
  }
  function refreshCards() {
    if (!pop) return;
    const cards = pop.querySelector('.pcards');
    if (cards) { const fk = document.activeElement?.dataset?.fk; cards.outerHTML = cardsHtml(); if (fk) pop.querySelector(`[data-fk="${fk}"]`)?.focus(); }
  }

  function onInput(ev) {
    const el = ev.target;
    if (el.matches('#be-r')) { onBe('beR', el.value); return true; }
    if (el.matches('#be-usd')) { onBe('beUsd', el.value); return true; }
    if (el.matches('#sp-nick')) { settings.share = settings.share || sanitizeShare(); settings.share.nick = sanitizeShare({ nick: el.value }).nick; save(); return true; }
    // pakiet J: suwak przyciemnienia tła filmu; w trakcie przesuwania tylko podpis wartości, zapis po puszczeniu (onChange)
    if (el.matches('[data-range="filmDim"]')) { const o = pop.querySelector('[data-out="filmDim"]'); if (o) o.textContent = pctTxt(Number(el.value)); return true; }
    if (el.matches('.cc-h')) { const hex = normHex(el.value); el.setAttribute('aria-invalid', String(!hex)); if (hex) { setCustomColor(el.dataset.ck, hex); refreshChartRow(el.dataset.ck); } return true; }
    if (el.matches('.cc-c')) { const hex = normHex(el.value); if (hex) { setCustomColor(el.dataset.ck, hex); refreshChartRow(el.dataset.ck); const h = pop.querySelector(`.cc-h[data-ck="${el.dataset.ck}"]`); if (h) { h.value = hex; h.removeAttribute('aria-invalid'); } } return true; }
    if (el.matches('.hexin')) {
      const k = el.dataset.k, hex = normHex(el.value);
      const err = pop.querySelector(`#hexe-${k}`);
      el.setAttribute('aria-invalid', String(!hex));
      err.hidden = !!hex;
      if (hex) { setColor(k, hex); refreshRow(k); refreshCards(); }
      return true;
    }
    if (el.matches('.anycolor')) {
      const k = el.dataset.k, hex = normHex(el.value);
      if (hex) { setColor(k, hex); refreshRow(k); const h = pop.querySelector(`#hex-${k}`); if (h) { h.value = hex; h.removeAttribute('aria-invalid'); pop.querySelector(`#hexe-${k}`).hidden = true; } refreshCards(); }
      return true;
    }
    return false;
  }

  // Esc najpierw zamyka wybór koloru, potem cały popover
  function onKey(ev) {
    if (!pop) return false;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (picker) { const k = picker; picker = null; rerender({ keep: false }); pop.querySelector(`[data-fk="sw-${k}"]`)?.focus(); } else close();
      return true;
    }
    if (ev.key === 'Tab') {
      const f = [...pop.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), a[href]')].filter((e) => e.getClientRects().length);
      if (!f.length) return false;
      const first = f[0], last = f[f.length - 1];
      if (isSheet()) {
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); return true; }
        if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); return true; }
      }
    }
    return false;
  }
  function onPointerDown(ev) {
    if (pop && !pop.contains(ev.target) && !ev.target.closest('#gear') && !ev.target.closest('.rp-scrim')) close({ restore: false });
  }
  // checkbox „Sprawdzaj aktualizacje” (zdarzenie change)
  function onChange(ev) {
    if (!pop) return false;
    if (ev.target.matches('[data-act="sync-toggle"]')) { onSyncToggle(ev.target.checked); return true; }
    // P50 (29.10.2026): codzienne okno 1s NQ, stan w config.local.json (chartNq1sDaily), nie w settings ani w Notion
    if (ev.target.matches('[data-act="ch-nq1s"]')) { onConfig({ chartNq1sDaily: ev.target.checked }); return true; }
    if (ev.target.matches('[data-chk]')) {
      const k = ev.target.dataset.chk, on = ev.target.checked;
      if (k === 'sessions' || k === 'pdhl' || k === 'news' || k === 'earnings') setOverlays((o) => { o[k] = on; });
      else if (k.startsWith('newsImp-')) setOverlays((o) => { o.newsImp[k.slice(8)] = on; });
      else if (k.startsWith('earnCls-')) setOverlays((o) => { o.earnCls[k.slice(8)] = on; });
      else if (k.startsWith('sess-')) setOverlays((o) => { o.sess[k.slice(5)].on = on; });
      else setChart({ [k]: on }, { render: k === 'shareChart' }); // pakiet I: wyłączony wykres w kartach wyszarza wybór stylu karty
      return true;
    }
    if (ev.target.matches('[data-range="filmDim"]')) { setChart({ filmDim: Math.round(Number(ev.target.value) * 10) / 10 }); return true; }
    if (ev.target.matches('[data-ovt]')) { const [id, which] = ev.target.dataset.ovt.split('.'); setOverlays((o) => { o.sess[id][which] = ev.target.value; }); rerender(); return true; }
    if (ev.target.matches('[data-btt]')) {
      const list = sanitizeBt(settings.bt).templates, i = Number(ev.target.dataset.btt), name = ev.target.value.trim().slice(0, 60);
      if (list[i] && name && !list.some((e, k) => k !== i && e.name === name)) { list[i].name = name; btTplSet(list); } else rerender();
      return true;
    }
    if (ev.target.matches('[data-btf]')) { btField(ev.target); return true; }
    if (ev.target.matches('[data-btd]')) { btDefault(ev.target); return true; }
    if (ev.target.matches('#sp-badj')) { settings.chartBadj = ev.target.checked; save(); onChartBadj(settings.chartBadj); return true; }
    if (ev.target.matches('#sp-tz')) { settings.chartTz = validTz(ev.target.value) ? ev.target.value : ''; save(); onChartTz(settings.chartTz); return true; }
    if (!ev.target.matches('[data-act="sp-upd"]')) return false;
    onConfig({ updateCheck: ev.target.checked });
    return true;
  }
  return { toggle, handle, onInput, onChange, onKey, onPointerDown, isOpen: () => !!pop, rerender, refreshTheme() { editTheme = getTheme(); if (pop) rerender(); } };
}
