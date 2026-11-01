// N2 (1.6.0): Ustawienia → Wykresy: podgląd na żywo, wygląd wykresu, nakładki, karty i filmy, czas i ceny, ustawienia rysunku.
// Logika przeniesiona bez zmian z zakładki „Wykresy” popovera (etap 14, pakiety H, I, J; P26, P29, P38, P41). Klucze i pieniądze (Databento,
// FRED, Finnhub) są w sekcji Źródła danych, licencje w Kopie i diagnostyka (backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.2).
// N4 (1.6.0): newsy i earningsy rozcięte: tu wygląd na wykresie i w panelu (wagi, klasy, karty, ręczne wyjątki klas), klucze i stan w Źródłach danych.
// Jeden obiekt settings.chart (styl-wykresu.js), synchronizowany przez Notion; strefa (chartTz) i B-ADJ (chartBadj) osobno, jak dotąd.
import * as F from './format.js';
import { THEMES } from './palety.js';
import { t } from './i18n.js';
import { resetChartGroup, chartContrast, fixChartColor, previewSvg, FILM_FORMATS, FILM_SECONDS, FILM_DIMS } from './styl-wykresu.js';
import { filterSupported } from './film.js';
import { SESSION_IDS, BROWSER_TZ, validTz, tzLabel, tzOptionLabel, allZones, tzGroupsHtml, loadStyleDock, saveStyleDock } from './podglad.js';
import { normHex } from './palety.js';
import { esc, L, THEME_NAME, ratioTxt, gHead, chk, grp, chartOps, onChk } from './ust-wspolne.js';
import { newsLookHtml, earnLookHtml } from './newsy-karty.js';

const SESS_NAME = { asia: 'Azja', london: 'Londyn', ny: 'NY' };
const pctTxt = (v) => `${F.num(v * 100, 0)}%`;

export function createWykresy(ctx) {
  const { settings } = ctx;
  const { chart, setChart, setOverlays } = chartOps(ctx);
  const root = () => ctx.root();
  // N4: statusy newsów i earningsów (liczby spółek w klasach, ręczne wyjątki) i komunikat po zmianie wyjątku klasy
  let newsSt = null, classMsg = null;

  // P26 (28.10.2026): stała strefa czasowa osi wykresów świecowych; słowa użytkownika: «nie mam pojecia jaki czas utc jest ustawiony
  // dla dziennika, wiec powinien byc do ustawienia na wykresie jak i staly w ustawieniach». Szybki przełącznik na wykresie nadpisuje ją tymczasowo.
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
  // N2: z „Ogólne” do Wykresów, bo dotyczy edytora wykresu (§4.2)
  function dockHtml() {
    const v = loadStyleDock();
    const b = (k, label) => `<button type="button" data-act="sp-dock" data-v="${k}" data-fk="dock-${k}" aria-pressed="${v === k}">${L(label)}</button>`;
    return `<div class="sp-f"><span class="lbl" id="sp-dock">${L('Ustawienia rysunku')}</span>
      <div class="seg full" role="group" aria-labelledby="sp-dock">${b('pop', 'Okienko')}${b('pin', 'Panel przypięty')}</div>
      <p class="note">${L('Okienko otwiera zębatka przy rysunku i znika po kliknięciu obok. Panel przypięty stoi stale po lewej stronie wykresu w trybie edycji, bez zmiany rozmiaru wykresu.')}</p></div>`;
  }

  function chartContrastHtml(k, hex) {
    const { ratio, weak } = chartContrast(hex, ctx.edit.theme);
    return weak
      ? `<span class="warnb">${esc(t('słaby kontrast {ratio}:1', { ratio: ratioTxt(ratio) }))}</span><button type="button" class="btn ghost sm" data-act="ch-fix" data-ck="${k}" data-fk="chfix-${k}">${L('Popraw')}</button>`
      : `<span class="okb">${esc(t('kontrast {ratio}:1', { ratio: ratioTxt(ratio) }))}</span>`;
  }
  function chartColorRow(k, label) {
    const hex = chart().custom[ctx.edit.theme][k];
    return `<div class="cr cc" data-ck="${k}"><span class="lbl cr-l" id="cc-l-${k}">${L(label)}</span>
      <input type="color" class="cc-c" data-ck="${k}" data-fk="cc-${k}" value="${hex}" aria-labelledby="cc-l-${k}">
      <span class="cc-x"><input type="text" class="sp-in hexin cc-h" data-ck="${k}" data-fk="cch-${k}" maxlength="7" value="${hex}" spellcheck="false" autocomplete="off" aria-label="${esc(t('{name}: kolor HEX', { name: t(label) }))}"></span>
      <span class="cr-ct${chartContrast(hex, ctx.edit.theme).weak ? ' weak' : ''}" data-cct="${k}">${chartContrastHtml(k, hex)}</span></div>`;
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
          <div class="seg sm" role="group" aria-labelledby="cc-t">${THEMES.map((th) => `<button type="button" data-act="ch-edit-theme" data-v="${th}" data-fk="cet-${th}" aria-pressed="${ctx.edit.theme === th}">${THEME_NAME[th]}</button>`).join('')}</div></div>
          ${chartColorRow('up', 'Świeca wzrostowa')}${chartColorRow('down', 'Świeca spadkowa')}</div>`
        : `<p class="note">${L('Świece mają kolory zysku i straty z wybranej palety danych (sekcja Wygląd).')}</p>`}</div>
      <div class="sp-f">${chk('grid', c.grid, 'Siatka pozioma')}</div>
      <div class="sp-f"><span class="lbl" id="ch-lv">${L("Poziomy trade'a")}</span>
        <div class="sp-chk" role="group" aria-labelledby="ch-lv">${chk('entry', c.entry, 'Wejście')}${chk('exit', c.exit, 'Wyjście')}${chk('sl', c.sl, 'Stop Loss (SL)')}${chk('tp', c.tp, 'Take Profit (TP)')}</div>
        <p class="note">${L('Dotyczy podglądu, miniatur i edycji wykresu. Linia BE zostaje zawsze.')}</p></div>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="ch-reset" data-v="look" data-fk="ch-reset-look">${L('Przywróć domyślne (Wygląd)')}</button></div>`;
  }
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
      <p class="note">${L('Newsy makro i earningsy na wykresie ustawisz niżej; klucze FRED i Finnhub są w sekcji Źródła danych.')}</p>
      <div class="sp-reset"><button type="button" class="btn ghost sm" data-act="ch-reset" data-v="overlays" data-fk="ch-reset-overlays">${L('Przywróć domyślne (Nakładki)')}</button></div>`;
  }
  // Pakiet I (etapy 16 i 17): grupa „Karty udostępniania” z kontrolkami funkcji, które już działają (decyzja sesji głównej: kontrolka razem z funkcją).
  // Pakiet J (etap 18, decyzja sesji głównej 28.10.2026): w tej samej grupie opcje filmów (format, długość, czarno-białe, przyciemnienie tła) jako
  // wartości początkowe okna Udostępnij → Film; „Przywróć domyślne (Karty)” przywraca też je. P21 («bez muzyki narazie»): bez opcji dźwięku.
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
  function rysunki() {
    return `${gHead('ch-g-draw', 'Edytor rysunków')}${dockHtml()}`;
  }
  function wykresyHtml() {
    return `<div class="pv pvc" role="img" aria-label="${L('Podgląd wykresu na żywo')}">${previewSvg(chart())}</div>
      ${grp(wyglad(), 'wyglad')}${grp(nakladki(), 'nakladki')}${grp(newsLookHtml({ c: chart(), chk }), 'newsy')}${grp(earnLookHtml({ c: chart(), st: newsSt, meta: ctx.getMeta(), msg: { classes: classMsg }, chk }), 'earningsy')}${grp(czas(), 'czas')}${grp(rysunki(), 'rysunki')}${grp(karty(), 'karty')}`;
  }

  function setCustomColor(k, hex) {
    const c = chart();
    setChart({ custom: { ...c.custom, [ctx.edit.theme]: { ...c.custom[ctx.edit.theme], [k]: hex } } });
  }
  function refreshChartRow(k) {
    const row = root()?.querySelector(`.cc[data-ck="${k}"]`);
    if (!row) return;
    const hex = chart().custom[ctx.edit.theme][k];
    const c = row.querySelector('.cc-c'); if (c && c.value !== hex) c.value = hex;
    const h = row.querySelector('.cc-h'); if (h && document.activeElement !== h) h.value = hex;
    const ct = row.querySelector('.cr-ct'); ct.classList.toggle('weak', chartContrast(hex, ctx.edit.theme).weak); ct.innerHTML = chartContrastHtml(k, hex);
  }

  function handle(act, v, el) {
    switch (act) {
      case 'ch-style': setChart({ style: v }, { render: true }); return true;
      case 'ch-colors': setChart({ colorMode: v }, { render: true }); return true;
      case 'ch-share-style': setChart({ shareStyle: v }, { render: true }); return true;
      case 'ch-share-draw': setChart({ shareDraw: v }, { render: true }); return true;
      case 'ch-mini-style': setChart({ miniStyle: v }, { render: true }); return true;
      case 'ch-film-format': setChart({ filmFormat: v }, { render: true }); return true;
      case 'ch-film-seconds': setChart({ filmSeconds: Number(v) }, { render: true }); return true;
      case 'ch-edit-theme': ctx.edit.theme = v; ctx.rerender(); return true;
      case 'ch-fix': { const k = el.dataset.ck; setCustomColor(k, fixChartColor(chart().custom[ctx.edit.theme][k], ctx.edit.theme)); ctx.rerender(); return true; }
      case 'ch-reset': {
        if (v === 'time') { settings.chartTz = ''; settings.chartBadj = true; ctx.save(); ctx.opts.onChartTz(''); ctx.opts.onChartBadj(true); ctx.rerender(); return true; }
        settings.chart = resetChartGroup(chart(), v === 'look' || v === 'cards' ? v : 'overlays');
        if (v === 'look') settings.chart = resetChartGroup(settings.chart, 'levels');
        ctx.save(); ctx.opts.onChart(settings.chart); ctx.rerender(); return true;
      }
      case 'earn-class-add': { const sym = root().querySelector('#sp-earn-sym')?.value.trim(), cls = Number(root().querySelector('#sp-earn-cls')?.value); if (!sym) { classMsg = { text: t('Wpisz ticker.'), error: true }; ctx.rerender(); return true; } earnClass({ symbol: sym, cls }).then(() => { const i = root()?.querySelector('#sp-earn-sym'); if (i) i.value = ''; }); return true; }
      case 'earn-class-del': earnClass({ symbol: v, remove: true }); return true;
      case 'sp-dock': saveStyleDock(v); root().querySelectorAll('[data-act="sp-dock"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); return true;
      default: return false;
    }
  }
  function onInput(ev) {
    const el = ev.target;
    // pakiet J: suwak przyciemnienia tła filmu; w trakcie przesuwania tylko podpis wartości, zapis po puszczeniu (onChange)
    if (el.matches('[data-range="filmDim"]')) { const o = root().querySelector('[data-out="filmDim"]'); if (o) o.textContent = pctTxt(Number(el.value)); return true; }
    if (el.matches('.cc-h')) { const hex = normHex(el.value); el.setAttribute('aria-invalid', String(!hex)); if (hex) { setCustomColor(el.dataset.ck, hex); refreshChartRow(el.dataset.ck); } return true; }
    if (el.matches('.cc-c')) { const hex = normHex(el.value); if (hex) { setCustomColor(el.dataset.ck, hex); refreshChartRow(el.dataset.ck); const h = root().querySelector(`.cc-h[data-ck="${el.dataset.ck}"]`); if (h) { h.value = hex; h.removeAttribute('aria-invalid'); } } return true; }
    return false;
  }
  function onChange(ev) {
    if (ev.target.matches('[data-chk]')) return onChk(ev.target, { setChart, setOverlays });
    if (ev.target.matches('[data-range="filmDim"]')) { setChart({ filmDim: Math.round(Number(ev.target.value) * 10) / 10 }); return true; }
    if (ev.target.matches('[data-ovt]')) { const [id, which] = ev.target.dataset.ovt.split('.'); setOverlays((o) => { o.sess[id][which] = ev.target.value; }); ctx.rerender(); return true; }
    if (ev.target.matches('#sp-badj')) { settings.chartBadj = ev.target.checked; ctx.save(); ctx.opts.onChartBadj(settings.chartBadj); return true; }
    if (ev.target.matches('#sp-tz')) { settings.chartTz = validTz(ev.target.value) ? ev.target.value : ''; ctx.save(); ctx.opts.onChartTz(settings.chartTz); return true; }
    return false;
  }
  async function loadNews() {
    try { newsSt = await ctx.opts.loadNewsStatus(); } catch { newsSt = null; }
    if (ctx.isActive('wykresy')) ctx.rerender();
  }
  async function earnClass(body) {
    try { const r = await ctx.opts.onEarnClass(body); classMsg = r?.ok ? { text: t('Zapisano.'), error: false } : { text: r?.error || t('Nie udało się zapisać.'), error: true }; }
    catch { classMsg = { text: t('Nie udało się zapisać.'), error: true }; }
    await loadNews();
  }
  const refreshPreview = () => { const el = root()?.querySelector('.pvc'); if (el) el.innerHTML = previewSvg(chart()); };
  return { id: 'wykresy', html: wykresyHtml, handle, onInput, onChange, onEscape: () => false, refreshPreview, enter() { loadNews(); }, keepTyped: ['#sp-earn-sym'] };
}
