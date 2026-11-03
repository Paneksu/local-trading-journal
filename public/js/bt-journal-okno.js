// Journal trade'a backtestu (pakiet L, 31.10.2026): klasyczne okno trade'a z Live (lightbox .lb: licznik, poprzedni/następny, schowaj szczegóły, zamknij; wykres
// createPodglad z „Edytuj wykres” → createEditor) w trybie Backtest. Słowa użytkownika (31.10.2026): «przemysl dzialanie journalingu zeby bylo jak najbardziej logiczne
// w backtestingu, dodaj moze po prsotu po trade przycisk journal i wyskakuje ci pole nasze klasyczne do journalingu gdzie mozesz dopracowac rysunki i teksty na wykresie».
// [U] 31.10.2026 «Przyjmuję wszystkie» (J2: Journal dopiero po zamknięciu trade'a; J3: bez zrzutów; J4: rysunki w Journalu zmieniają tylko migawkę tego trade'a;
// J6: pola Setup, Notatka, rysunki, bez tagów, checklist i oceny pewności)
// Różnice wobec Live: świece z danych sesji (API zakresu) przycięte do chwili zamknięcia trade'a i nigdy po kursorze (journalSource), rysunki z migawki trade'a w pliku
// sesji (saveDoc, nie Notion; rysunki sesji bez zmian), ceny, czasy, R i $ tylko do odczytu (pozycja w edytorze bez kłódki), nawigacja po zamkniętych trade'ach sesji.
// English: backtest trade journal in the classic Live trade window: chart preview + chart editor on session candles cut at the trade's close, drawings snapshot, setup and note.
import { t } from './i18n.js';
import { esc, fmtR, fmtUsdFull as fmtMoney } from './format.js';
import { createPodglad, tfSec } from './podglad.js';
import { aggregate } from './swiece.js';
import { mergeBase, candlesAt, isReplayTf } from './bt-swieca.js';
import { pxText } from './bt-journal.js';
import { SETUP_RE, SETUP_MAX, journalState } from './bt-notion.js';
import { STATE_LABEL, fmtHeld } from './bt-szuflada.js';
import { MULT } from './bt-wypelnienia.js';
import { fillsOf, gapUnderBe } from './bt-ksiega.js';
import { tpOrder } from './bt-drabinka.js';
import { overlay } from './modal.js';

const HIST_DAYS = 390, SEC_DAYS = 8, MAX_BARS = 50_000;
const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I_PREV = svg('<path d="m15 6-6 6 6 6"/>'), I_NEXT = svg('<path d="m9 6 6 6-6 6"/>'), I_CLOSE = svg('<path d="M6 6l12 12M18 6 6 18"/>');
const I_PANEL = svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>');
const inside = (ranges, c) => (ranges || []).some(([a, b]) => c >= a && c < b);

// Koniec świec Journala: koniec świecy bazowej wyjścia (SL/TP wypełniają się w świecy zaczętej o exitT; wyjście ręczne o exitT = koniec ostatniej widocznej świecy),
// nigdy po kursorze. real1s = pokrycie prawdziwych sekund instrumentu (świeca bazowa 1 s), poza nim 1 min.
export function journalMaxT(trade, { cursor = Infinity, real1s = [] } = {}) {
  const ex = (trade?.exits || [])[trade.exits.length - 1];
  const t0 = ex ? ex.t : trade?.exitT;
  if (!Number.isFinite(t0)) return Number.isFinite(cursor) ? cursor : null;
  const end = ex && (ex.reason === 'sl' || ex.reason === 'tp') ? t0 + (inside(real1s, t0) ? 1 : 60) : t0;
  return Math.min(cursor, end);
}

// Źródło świec Journala zgodne z GET /api/candles ({ bars }): API zakresu replayu (te same świece co w replayu), bez świec po maxT. Świeca interwału, która w chwili maxT
// jeszcze trwała, jest złożona tylko ze świec bazowych zakończonych do maxT (jak na wykresie replayu w tej chwili). Interwały, które nie są interwałami replayu (4h, 1D, 1W, 1M; ważne są też własne jak 7m), z 1h.
export function journalSource({ fetchRange, instrument, maxT }) {
  const sym = instrument;
  async function hist(from, to, tf) {
    const sec = tfSec(tf);
    const span = Math.min((sec < 60 ? SEC_DAYS : HIST_DAYS) * 86400, MAX_BARS * sec);
    const a = Math.max(Math.floor(from), Math.ceil(to) - span), b = Math.ceil(to);
    if (!(b > a)) return [];
    const r = await fetchRange({ instruments: [sym], from: a, to: b, tf });
    return r?.inst?.[sym]?.bars || [];
  }
  async function partial(pStart, tf) {
    const a = Math.max(Math.floor(pStart), Math.floor(maxT) - SEC_DAYS * 86400 + 60);
    const b = Math.ceil(maxT);
    if (!(b > a)) return [];
    const r = await fetchRange({ instruments: [sym], from: a, to: b, tf: 'base' });
    const x = r?.inst?.[sym];
    if (!x) return [];
    return candlesAt(mergeBase(x.m1 || [], x.s1 || [], x.real1s || []), tf, maxT).filter((k) => k[0] >= pStart);
  }
  async function bars(from, to, tf) {
    const sec = tfSec(tf);
    const end = Math.min(to, maxT);
    if (!(end > from)) return [];
    const full = (await hist(from, end, tf)).filter((k) => k[0] + sec <= maxT && k[0] >= from - sec);
    // świeca w budowie w chwili maxT tylko, gdy żądanie sięga końca
    if (to < maxT) return full;
    const pStart = full.length ? full[full.length - 1][0] + sec : Math.max(from, maxT - sec);
    const tail = await partial(pStart, tf);
    return [...full, ...tail];
  }
  return {
    maxT,
    async get(from, to, tf) {
      const want = String(tf);
      const base = isReplayTf(want) ? want : '1h';
      let out = await bars(from, to, base);
      if (base !== want) out = aggregate(out, want) || [];
      // przyszłość wykluczona drugi raz: żadna świeca nie zaczyna się po maxT
      out = out.filter((k) => k[0] < maxT).map((k) => k.slice(0, 6));
      return { bars: out, layer: '1m', rolls: [], gaps: [] };
    },
  };
}

// trade backtestu → argument podglądu i edytora (jak tradeArg w app.js: czasy w ms, sl = pierwotny SL, be = cena BE)
export const tradeArgOf = (x) => ({
  at: x.entryT * 1000, exitAt: Number.isFinite(x.exitT) ? x.exitT * 1000 : null, instrument: x.instrument, entryPrice: x.entryPrice, exitPrice: x.exitPrice,
  sl: x.sl0, tp: x.tp ?? null,
  // [U] 2.11.2026 «na backtestingu jak i na normalnym journalingu powinno byc miejsce do wpisania gdzie trade jest juz bez ryzyka»: linia BE jak w dzienniku (ta sama geometria positionExtras)
  // stoi na cenie, przy której trade stał się bez ryzyka (próg auto-BE albo cena bieżąca przy ręcznym BE); trade bez beAt z BE: cena wejścia, jak dotąd
  be: Number.isFinite(x.beAt) ? x.beAt : x.be ? x.entryPrice : null, r: x.r, pnl: x.pnl, contract: '', date: '', time: '',
});

// openJournalWindow(opts) → { close, el, tradeId(), show(id), editing(), view() }
// opts: trades() → zamknięte trade'y sesji (kolejność sesji), id, fetchRange, maxTOf(trade), setups, known, fmtTime(sec), onSave(id, { setup, notes }) → void,
// onDrawings(id, doc) → void (migawka rysunków trade'a), onClose(), loadEditor() → import('./wykres.js')
export function openJournalWindow({ root = document.body, trades, id, fetchRange, maxTOf, setups = [], known = [], fmtTime = (s) => String(s), onSave = () => {}, onDrawings = () => {}, onDelete = null, onClose = () => {}, loadEditor = () => import('./wykres.js'), setup: preset = '' }) {
  const el = document.createElement('div');
  el.className = 'lb bt-jw';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', t('Journal trade\'a backtestu'));
  const dl = 'btjw-setups';
  el.innerHTML = `<div class="lb-top"><div class="lb-tl"><span class="lb-count" aria-live="polite"></span><span class="bt-jw-mode">${esc(t('Journal · Backtest'))}</span></div>
      <div class="lb-navs"><button type="button" class="icon-btn lb-nav prev" data-jw="prev" aria-label="${esc(t('Poprzedni'))}" title="${esc(t('Poprzedni (←)'))}">${I_PREV}</button><button type="button" class="icon-btn lb-nav next" data-jw="next" aria-label="${esc(t('Następny'))}" title="${esc(t('Następny (→)'))}">${I_NEXT}</button></div>
      <div class="lb-tr"><button type="button" class="icon-btn lb-det" data-jw="details" aria-pressed="false">${I_PANEL}</button><button type="button" class="icon-btn lb-close" data-jw="close" aria-label="${esc(t('Zamknij Journal'))}">${I_CLOSE}</button></div></div>
    <div class="lb-stage"><div class="lb-frame is-chart"><div class="lb-chart"></div></div></div>
    <div class="lb-info"><div class="lb-cap"></div><dl class="lb-facts"></dl><div class="bt-jw-pt"></div><div class="bt-jw-lv"></div>
      <div class="bt-jw-f">
        <label class="bt-jr-f"><span class="lbl">${esc(t('Setup'))}</span><input class="sp-in" name="setup" type="text" list="${dl}" maxlength="${SETUP_MAX}" autocomplete="off"><datalist id="${dl}">${setups.map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist></label>
        <label class="bt-jr-f bt-jw-n"><span class="lbl">${esc(t('Notatka'))}</span><textarea class="sp-in" name="notes" rows="3" maxlength="2000"></textarea></label>
      </div>
      <div class="lb-actions"><button type="button" class="btn primary" data-jw="save" title="${esc(t('Zapisz (Ctrl+Enter), Esc zamyka'))}" aria-keyshortcuts="Control+Enter">${esc(t('Zapisz'))}</button><span class="note bt-jw-kbd" aria-hidden="true">${esc(t('Ctrl+Enter zapisuje · Esc zamyka'))}</span><a class="btn lb-link" data-jw="notion" target="_blank" rel="noopener" hidden>${esc(t('Otwórz w Notion'))}</a>${onDelete ? `<button type="button" class="btn ghost bt-jw-del" data-jw="delete">${esc(t('Usuń trade'))}</button>` : ''}
        <span class="note bt-jw-msg" role="status"></span></div></div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const f = (n) => el.querySelector(`[name="${n}"]`);
  let cur = null, pv = null, ed = null, closed = false, seq = 0, noDet = false;
  const list = () => (trades() || []).filter((x) => x && Number.isFinite(x.exitT));
  const idx = () => list().findIndex((x) => x.id === cur?.id);
  const msg = (s) => { $('.bt-jw-msg').textContent = s || ''; };

  // fakt z logu trade'a: „SL na 18 290,25 · 10:14:35” (wyzwolony; cena progu jest w wierszu BE) albo „nie wyzwolone” (uzbrojony do końca trade'a)
  function autoBeFact(x) {
    const e = (Array.isArray(x.log) ? x.log : []).filter((l) => l && l.k === 'be-auto' && l.v && typeof l.v === 'object' && l.v.changed !== false).pop();
    if (e) return t('SL na {sl} · {time}', { sl: pxText(e.v.sl), time: fmtTime(e.at) });
    return x.autoBe && typeof x.autoBe === 'object' && !x.autoBe.done ? t('nie wyzwolone') : null;
  }
  function facts(x) {
    const dur = Number.isFinite(x.exitT) ? x.exitT - x.entryT : null;
    const rows = [
      [t('Wejście'), `${pxText(x.entryPrice)} · ${fmtTime(x.entryT)}`], [t('Wyjście'), `${pxText(x.exitPrice)} · ${fmtTime(x.exitT)}`],
      [t('Czas trwania'), dur != null ? fmtHeld(dur) : null], [t('Instrument'), x.instrument], [t('Kierunek'), x.dir === 'Short' ? t('Short') : t('Long')], [t('Ilość'), String(x.qty)],
      // 1.7-1 (P5): SL w faktach to PIERWSZY postawiony SL (od niego liczy się R); bez SL „bez SL”
      [t('SL (pierwszy) / TP'), `${x.sl0 != null ? pxText(x.sl0) : t('bez SL')} / ${x.tp != null ? pxText(x.tp) : '–'}${x.be ? ' · BE' : ''}`],
      ['R', Number.isFinite(x.r) ? fmtR(x.r) : (x.rUsd === 0 ? `– (${t('ryzyko pierwotne 0')})` : '–'), x.r], ['P&L', Number.isFinite(x.pnl) ? fmtMoney(x.pnl) : '–', x.pnl],
      [t('Prowizja'), x.fee > 0 ? fmtMoney(-x.fee) : null],
      ['MAE / MFE', `${Number.isFinite(x.maeR) ? fmtR(x.maeR) : '–'} / ${Number.isFinite(x.mfeR) ? fmtR(x.mfeR) : '–'}`],
      // 1.7-2: odwrócenie to dwa trade'y; odnośnik do trade'a zamkniętego odwróceniem (do Notion nie idzie)
      [t('Odwrócenie'), x.reverseOf ? `← ${x.reverseOf}` : null],
      // 1.7-3: BE = cena, przy której trade jest bez ryzyka (to samo pole co w dzienniku); fakt Auto BE z chwilą wyzwolenia
      [t('BE (bez ryzyka od ceny)'), Number.isFinite(x.beAt) ? pxText(x.beAt) : null],
      [t('Auto BE'), autoBeFact(x)],
      // gust (runda 2 pakietu 1.7-3): stop na BE wykonany po gorszej cenie (luka) mówi o tym wprost, żeby nie wyglądało, że BE nie zadziałał
      [t('Wyjście z luką pod BE'), (() => { const g = gapUnderBe(x); return g ? t('SL na {sl}, wyjście {exit}', { sl: pxText(g.sl), exit: pxText(g.exit) }) : null; })()],
    ];
    const cl = (v) => (v > 1e-9 ? 'pos' : v < -1e-9 ? 'neg' : '');
    return rows.filter((r) => r[1]).map(([k, v, n]) => `<div><dt>${esc(k)}</dt><dd class="${n != null ? cl(n) : ''}">${esc(v)}</dd></div>`).join('');
  }
  // 1.7-2 (P3): tabela wejść i wyjść trade'a z kilkoma porcjami albo wyjściami: czas, zdarzenie, cena, ilość, powód, wynik porcji (brutto, po średnim koszcie w chwili wyjścia)
  const WHY = () => ({ sl: 'SL', tp: 'TP', manual: t('ręcznie'), partial: t('część'), eod: t('koniec dnia'), reverse: t('odwrócenie') });
  // 1.7-5: numer poziomu drabiny (TP1…) wg kolejności od najbliższego; pojedynczy TP zostaje „TP”
  const tpName = (x, id) => { const ord = tpOrder(x.dir, Array.isArray(x.tps) ? x.tps : []); const i = ord.findIndex((l) => l.id === id); return ord.length > 1 && i >= 0 ? `TP${i + 1}` : 'TP'; };
  // tabela poziomów drabiny (cena, procent, trafiony: czas, ilość, wynik) obok tabeli wejść i wyjść; tylko dla trade'a z kilkoma poziomami
  function levels(x) {
    const tps = Array.isArray(x.tps) ? x.tps.filter((l) => l && typeof l === 'object') : [];
    if (tps.length < 2) return '';
    const ord = tpOrder(x.dir, tps), exits = Array.isArray(x.exits) ? x.exits.filter((e) => e && typeof e === 'object') : [];
    const sg = x.dir === 'Short' ? -1 : 1, m = MULT[x.instrument] || 0, cl = (v) => (v > 1e-9 ? 'pos' : v < -1e-9 ? 'neg' : '');
    const rows = ord.map((l, i) => {
      const e = l.hit ? exits.find((z) => z.tpId === l.id) : null;
      const usd = e ? (e.price - (Number.isFinite(e.basis) ? e.basis : x.entryPrice)) * sg * e.qty * m : null;
      const hitTxt = l.hit ? `${fmtTime(e ? e.t : l.hit.at)} · ${l.hit.qty} @ ${pxText(e ? e.price : l.price)}` : t('nietrafiony');
      return `<tr><td>TP${i + 1}</td><td class="num">${esc(pxText(l.price))}</td><td class="num">${esc(i === ord.length - 1 ? t('reszta') : `${l.pct}%`)}</td><td>${esc(hitTxt)}</td><td class="num ${usd != null ? cl(usd) : ''}">${esc(usd != null ? fmtMoney(usd) : '–')}</td></tr>`;
    }).join('');
    return `<table class="tbl bt-jw-ptt"><thead><tr><th scope="col">${esc(t('Poziom'))}</th><th scope="col" class="num">${esc(t('Cena'))}</th><th scope="col" class="num">${esc(t('Procent'))}</th><th scope="col">${esc(t('Trafiony'))}</th><th scope="col" class="num">${esc(t('Wynik'))}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function portions(x) {
    const fills = fillsOf(x), exits = Array.isArray(x.exits) ? x.exits.filter((e) => e && typeof e === 'object') : [];
    if (fills.length < 2 && exits.length < 2) return '';
    const sg = x.dir === 'Short' ? -1 : 1, m = MULT[x.instrument] || 0, why = WHY();
    const cl = (v) => (v > 1e-9 ? 'pos' : v < -1e-9 ? 'neg' : '');
    const rows = [
      ...fills.map((p, i) => ({ t: p.t, k: 0, s: p.seq, html: `<td>${esc(fmtTime(p.t))}</td><td>${esc(i === 0 ? t('Wejście') : t('Dołóż'))}</td><td class="num">${esc(pxText(p.price))}</td><td class="num">${esc(p.qty)}</td><td></td><td class="num"></td>` })),
      ...exits.map((e) => { const usd = (e.price - (Number.isFinite(e.basis) ? e.basis : x.entryPrice)) * sg * e.qty * m; return { t: e.t, k: 1, s: e.seq, html: `<td>${esc(fmtTime(e.t))}</td><td>${esc(t('Wyjście'))}</td><td class="num">${esc(pxText(e.price))}</td><td class="num">${esc(e.qty)}</td><td>${esc(e.tpId ? tpName(x, e.tpId) : why[e.reason] || e.reason || '')}</td><td class="num ${cl(usd)}">${esc(fmtMoney(usd))}</td>` }; }),
    ].sort((a, b) => a.t - b.t || (Number.isFinite(a.s) && Number.isFinite(b.s) ? a.s - b.s : 0) || a.k - b.k);
    return `<table class="tbl bt-jw-ptt"><thead><tr><th scope="col">${esc(t('Kiedy'))}</th><th scope="col">${esc(t('Zdarzenie'))}</th><th scope="col" class="num">${esc(t('Cena'))}</th><th scope="col" class="num">${esc(t('Ilość'))}</th><th scope="col">${esc(t('Powód'))}</th><th scope="col" class="num">${esc(t('Wynik porcji'))}</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.html}</tr>`).join('')}</tbody></table>`;
  }
  function paintState() {
    if (!cur) return;
    const st = journalState(cur), L = STATE_LABEL();
    const cl = (v) => (v > 1e-9 ? 'pos' : v < -1e-9 ? 'neg' : '');
    $('.lb-cap').innerHTML = `<b>${esc(cur.instrument)} ${esc(cur.dir === 'Short' ? t('Short') : t('Long'))} × ${esc(cur.qty)}</b> <b class="${cl(cur.r)}">${esc(Number.isFinite(cur.r) ? fmtR(cur.r) : '–')}</b> <span class="${cl(cur.pnl)}">${esc(Number.isFinite(cur.pnl) ? fmtMoney(cur.pnl) : '')}</span> <span class="bt-st-j" data-st="${st}" title="${esc(cur.notion?.error || '')}">${esc(L[st])}</span>`;
    const a = $('[data-jw="notion"]'), nid = cur.notion?.id;
    a.hidden = !(nid && cur.notion?.state === 'sent');
    if (nid) a.href = `https://www.notion.so/${String(nid).replace(/-/g, '')}`;
  }
  function paintNav() {
    const i = idx(), n = list().length;
    $('.lb-count').textContent = `${i + 1} / ${n}`;
    $('[data-jw="prev"]').disabled = i <= 0 || !!ed;
    $('[data-jw="next"]').disabled = i < 0 || i >= n - 1 || !!ed;
    const b = $('[data-jw="details"]'), lab = noDet ? t('Pokaż szczegóły trade\'a') : t('Schowaj szczegóły trade\'a');
    el.classList.toggle('no-details', noDet); b.setAttribute('aria-pressed', String(noDet)); b.setAttribute('aria-label', lab); b.title = lab;
  }
  async function dropChart() {
    const p = pv, e = ed;
    pv = null; ed = null;
    try { p?.destroy(); } catch { /* już zniszczony */ }
    if (e) { try { await e.destroy(); } catch { /* już zniszczony */ } }
  }
  const sourceOf = (x) => journalSource({ fetchRange, instrument: x.instrument, maxT: maxTOf(x) });
  function preview(x, extra = {}) {
    const box = $('.lb-chart');
    pv = createPodglad(box, { trade: tradeArgOf(x), drawings: extra.drawings ?? (x.drawings?.d || []), frame: extra.frame, tf: extra.tf, badj: false, source: sourceOf(x), onEdit: () => startEdit(x) });
    return pv;
  }
  async function show(tid) {
    const x = list().find((y) => y.id === tid);
    if (!x || closed) return false;
    const my = ++seq;
    await dropChart();
    if (my !== seq || closed) return false;
    cur = x;
    f('setup').value = x.setup || ''; f('notes').value = x.notes || ''; f('setup').removeAttribute('aria-invalid'); msg('');
    $('.lb-facts').innerHTML = facts(x);
    $('.bt-jw-pt').innerHTML = portions(x);
    $('.bt-jw-lv').innerHTML = levels(x);
    paintState(); paintNav();
    preview(x);
    return true;
  }
  // „Edytuj wykres”: edytor LWC z rysunkami migawki trade'a; zapis rysunków → onDrawings (plik sesji), nigdy rysunki sesji ani Notion bezpośrednio
  async function startEdit(x) {
    const p = pv;
    if (!p || p.editing || p.status() !== 'ok' || ed) return;
    const my = seq;
    if (!(await p.settle())) { msg(t('Nie udało się wczytać świec do edycji.')); return; }
    if (my !== seq || pv !== p || closed) return;
    const st = p.state();
    const frame = { tf: st.tf, fromIndex: st.fromIndex, toIndex: st.toIndex, candles: p.candles(), rolls: [], gaps: [], badj: false, adjust: null, yr: st.yr };
    p.destroy(); pv = null;
    const box = $('.lb-chart');
    try {
      const { createEditor } = await loadEditor();
      const e = await createEditor(box, {
        trade: tradeArgOf(x), tradeId: null, frame, doc: x.drawings && Array.isArray(x.drawings.d) ? x.drawings : { v: 1, d: [] }, source: sourceOf(x), lockTrade: true,
        saveDoc: async (dd) => { onDrawings(x.id, dd); paintState(); return { ok: true }; },
        onDone: (fr) => { ed = null; paintNav(); if (my === seq && !closed) preview(x, { frame: { from: fr.from, to: fr.to, yr: fr.yr }, tf: fr.tf, drawings: fr.doc.d }); },
      });
      if (my !== seq || closed) { await e.destroy(); return; }
      ed = e;
      paintNav();
    } catch (err) {
      console.error('[journal]', err);
      msg(t('Nie udało się uruchomić trybu edycji wykresu.'));
      if (my === seq && !closed) preview(x);
    }
  }
  function save() {
    if (!cur) return false;
    const setup = f('setup').value.trim();
    if (!setup) { msg(t('Wybierz albo wpisz setup')); f('setup').setAttribute('aria-invalid', 'true'); f('setup').focus(); return false; }
    if (!known.includes(setup) && !SETUP_RE.test(setup)) { msg(t('Setup: do 40 znaków, tylko litery, cyfry, spacja i znaki . & + -')); f('setup').setAttribute('aria-invalid', 'true'); f('setup').focus(); return false; }
    onSave(cur.id, { setup, notes: f('notes').value.trim() });
    msg(t('Zapisano.'));
    paintState();
    return true;
  }
  async function close() {
    if (closed) return;
    closed = true;
    globalThis.removeEventListener?.('keydown', onKey, true);
    await dropChart();
    el.remove();
    onClose();
  }
  const step = (d) => { const l = list(), i = idx() + d; if (!ed && i >= 0 && i < l.length) show(l[i].id); };
  // klawisze: Journal ma pierwszeństwo przed skrótami replayu (te są wyłączone, dopóki okno jest otwarte); w polach tylko Escape i Ctrl+Enter
  function onKey(ev) {
    if (closed || !el.isConnected) return;
    // okno pytania otwarte nad Journalem (np. potwierdzenie usunięcia trade'a) dostaje klawisze, w tym Escape, przed Journalem
    if (overlay.current) return;
    const tg = ev.target, field = tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || tg.isContentEditable);
    if (field && el.contains(tg)) {
      if (ev.key === 'Enter' && (tg.name === 'setup' || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); ev.stopImmediatePropagation(); save(); }
      // M (31.10.2026): Esc w polu bez niezapisanych zmian zamyka okno (po Ctrl+Enter wystarczy Esc), ze zmianami tylko zdejmuje fokus
      else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); if (clean()) close(); else tg.blur(); }
      return;
    }
    if (ed) return; // edytor wykresu: klawisze rysunków (Escape, Ctrl+Z, strzałki, Delete)
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); close(); }
    else if (ev.key === 'ArrowLeft' && !ev.shiftKey && !ev.ctrlKey) { ev.preventDefault(); ev.stopImmediatePropagation(); step(-1); }
    else if (ev.key === 'ArrowRight' && !ev.shiftKey && !ev.ctrlKey) { ev.preventDefault(); ev.stopImmediatePropagation(); step(1); }
  }
  globalThis.addEventListener?.('keydown', onKey, true);
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-jw]');
    if (!b || b.disabled) return;
    const a = b.dataset.jw;
    if (a === 'close') close();
    else if (a === 'prev') step(-1);
    else if (a === 'next') step(1);
    else if (a === 'save') save();
    else if (a === 'delete') { if (cur && onDelete && !ed) onDelete(cur.id); }
    else if (a === 'details') { noDet = !noDet; paintNav(); pv?.redraw?.(); }
  });
  f('setup').addEventListener('input', () => { f('setup').removeAttribute('aria-invalid'); msg(''); });
  const clean = () => !cur || (f('setup').value.trim() === (cur.setup || '') && f('notes').value.trim() === (cur.notes || ''));
  const ready = show(id);
  $('.lb-close').focus();
  // M (31.10.2026): fokus od razu tam, gdzie się pisze: setup z szybkiego panelu wpisany, wtedy Notatka; bez setupu pole Setup
  ready.then(() => {
    if (closed) return;
    if (preset && !f('setup').value) f('setup').value = preset;
    (f('setup').value ? f('notes') : f('setup')).focus();
  }).catch(() => {});
  return {
    close, el, ready, show, save,
    tradeId: () => cur?.id ?? null,
    editing: () => !!ed,
    view: () => ed || pv,
    startEdit: () => (cur ? startEdit(cur) : Promise.resolve()),
    refresh: () => paintState(),
  };
}
