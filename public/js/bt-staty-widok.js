// Widok statystyk backtestu (1.5.0, pakiet G): nagłówek z krzywą kapitału w R, „Gdzie mam przewagę” (przełącznik rozbicia, wiersze poniżej MIN_N przygaszone),
// „Wykonanie” (MAE/MFE, R zostawione na stole, seria strat) i „Backtest kontra Live”. Zakres: ta sesja / wybrane sesje / wszystkie Backtest.
// Liczy bt-staty.js; tu tylko pobranie danych (pliki sesji, trade'y z Notion, cechy dni) i rysowanie na tokenach dashboardu (drawEquity, drawColumns, .seg, .tile, .card).
// [U] 30.10.2026 §13: «statystyki powinny dawać prawdziwą wartość … zrozumiałe i przejrzyste». Każda liczba ma jednozdaniowe wyjaśnienie, a przy N < MIN_N widać wprost, że to za mało.
// Nie ma tu Sharpe'a, Sortino ani wariantów profit factor (nie-cel [S]): nie zmieniają żadnej decyzji dla próby kilkudziesięciu trade'ów.
// English: backtest statistics view: R equity, edge table with a minimum-sample warning, execution (MAE/MFE) and backtest vs live.
import { t } from './i18n.js';
import { esc, fmtR, fmtPct, cls, shortDate, DAYS_TITLE, num } from './format.js';
import { drawEquity, drawColumns } from './charts.js';
import { dayTags } from './bt-filtr.js';
import { MIN_N, BY, hiddenCount, summary, equityR, edgeTable, execution, compareLive, mergeBacktest, pickSessions, sessionsOf, NO_SETUP, NO_DAYTYPE, NO_HOUR, HOUR_BEFORE, HOUR_AFTER } from './bt-staty.js';

const BY_LABEL = () => ({ setup: t('Setup'), wd: t('Dzień tygodnia'), hour: t('Godzina wejścia'), dayType: t('Typ dnia'), dir: t('Kierunek') });
const rcls = (x) => (x > 1e-9 ? 'pos' : x < -1e-9 ? 'neg' : '');
const R = (x) => (x == null ? '–' : fmtR(x));

function keyLabel(by, key) {
  if (by === 'wd') return DAYS_TITLE[key - 1] || String(key);
  if (by === 'hour') {
    if (key === HOUR_BEFORE) return t('przed 9:30');
    if (key === HOUR_AFTER) return t('po 16:00');
    if (key === NO_HOUR) return t('brak godziny');
    const [h, m] = key.split(':').map(Number), e = h * 60 + m + 15;
    return `${key}–${Math.floor(e / 60)}:${String(e % 60).padStart(2, '0')}`;
  }
  if (key === NO_SETUP) return t('bez setupu');
  if (key === NO_DAYTYPE) return t('brak danych o dniu');
  return String(key);
}

// Cechy dni z lokalnego indeksu (/api/backtest/days): typ dnia liczony w chwili otwarcia widoku, także dla trade'ów z Notion i starych wpisów (18a.7).
async function defaultFeatures(client, days) {
  const ds = days.filter(Boolean).sort();
  if (!ds.length) return new Map();
  const r = await client.days({ instruments: ['NQ'], from: ds[0], to: ds[ds.length - 1], mkt: false }); // review G #6: typ dnia nie używa cech rynku, więc serwer ich nie liczy
  return new Map((r.days || []).map((f) => [f.day, f]));
}

export function mountStats(host, { client, getTrades = () => [], sessionId = null, onBack = null, loadFeatures = null } = {}) {
  const st = { scope: sessionId ? 'this' : 'all', picked: null, by: 'setup' };
  let all = [], live = [], feats = new Map(), featsOk = true, err = null, ro = null, raf = 0, dead = false, equity = [], cols = null;
  let fullLoaded = false, failedN = 0, hiddenN = 0;

  const scoped = () => {
    if (st.scope === 'this') return pickSessions(all, [sessionId]);
    if (st.scope === 'picked') return pickSessions(all, [...(st.picked || [])]);
    return all;
  };
  const tagsOf = (tr) => { const f = feats.get(tr.day); return f ? dayTags(f, t) : []; };

  // Review G #6: zakres „Ta sesja” czyta tylko plik tej jednej sesji, a pozostałe zakresy dopiero przy pierwszym wejściu w nie; serwer oddaje samo źródło statystyk (bez rysunków),
  // a sesje z błędem odczytu są liczone i zgłaszane, nie gubione po cichu.
  async function build(ids) {
    const r = await client.statsSource({ ids });
    const list = r.sessions || [];
    failedN = (r.failed || []).length;
    hiddenN = hiddenCount(list);
    const notion = getTrades() || [];
    all = mergeBacktest(notion, list);
    live = notion.filter((x) => x.typ === 'Live' && x.counted !== false && Number.isFinite(x.r)).map((x) => ({ ...x, day: x.date }));
    fullLoaded = ids == null;
    const days = [...new Set(all.map((x) => x.day))];
    try { feats = await (loadFeatures ? loadFeatures(days) : defaultFeatures(client, days)); featsOk = true; } catch { feats = new Map(); featsOk = false; }
  }
  async function load() {
    await build(sessionId ? [sessionId] : null);
    st.picked = new Set(sessionId ? [sessionId] : sessionsOf(all).map((s) => s.id));
    if (sessionId && !all.some((x) => x.session === sessionId)) { st.scope = 'all'; await build(null); } // sesja bez zamkniętych trade'ów: pokaż całość, nie pustkę
  }
  async function ensureFull() {
    if (fullLoaded) return;
    host.setAttribute('aria-busy', 'true');
    try { await build(null); } catch (e) { err = e; } finally { host.removeAttribute('aria-busy'); }
  }

  // ---- fragmenty HTML ----
  const tile = (label, val, sub, c = '') => `<div class="tile"><span class="lbl">${esc(label)}</span><span class="val ${c}">${val}</span><span class="sub">${esc(sub)}</span></div>`;

  function scopeHtml() {
    const sess = sessionsOf(all);
    const b = (k, label, dis = false) => `<button type="button" data-st="scope:${k}" aria-pressed="${st.scope === k}"${dis ? ' disabled' : ''}>${esc(label)}</button>`;
    const pick = st.scope === 'picked'
      ? `<div class="bt-st-pick" role="group" aria-label="${esc(t('Wybierz sesje'))}">${sess.map((s) => `<label class="check"><input type="checkbox" data-st-pick="${esc(s.id ?? '')}"${st.picked?.has(s.id) ? ' checked' : ''}><span>${esc(s.id ? (s.name || s.id) : t('Bez sesji'))} · ${esc(String(s.n))}</span></label>`).join('')}</div>`
      : '';
    return `<div class="bt-st-scope"><div class="seg" role="group" aria-label="${esc(t('Zakres statystyk'))}">${b('this', t('Ta sesja'), !sessionId)}${b('picked', t('Wybrane sesje'))}${b('all', t('Wszystkie Backtest'))}</div>${pick}</div>`;
  }

  function headHtml(ts) {
    const s = summary(ts);
    const few = s.few
      ? `<p class="note bt-st-few" role="status">${esc(t("To dopiero {n} z {min} trade'ów. Poniżej {min} wynik łatwo jest przypadkiem: traktuj liczby jako szkic, nie jako wniosek.", { n: s.n, min: MIN_N }))}</p>`
      : '';
    return `<div class="tiles bt-st-tiles">
      ${tile(t("Trade'y"), esc(String(s.n)), `${t.p('{n} wygranych', s.wins)} · ${t.p('{n} strat', s.losses)} · ${s.be} BE`)}
      ${tile(t('Skuteczność'), esc(fmtPct(s.wr, 0)), t('wygrane z rozstrzygniętych, BE poza liczeniem'))}
      ${tile(t('Średnio na trade'), `<span class="${rcls(s.avgR)}">${esc(R(s.avgR))}</span>`, t('na 1R ryzyka'))}
      ${tile(t('Wynik'), `<span class="${rcls(s.sumR)}">${esc(R(s.sumR))}</span>`, t('suma R wszystkich trade\'ów'))}
    </div>${few}`;
  }

  const block = (title, ctl, inner) => `<section class="sec"><div class="sec-h"><h2>${esc(title)}</h2>${ctl || ''}</div><div class="card bt-st-card">${inner}</div></section>`;

  function equityHtml() {
    return block(t('Krzywa kapitału w R'), '', `<p class="note">${esc(t('Narastający wynik trade po trade\'cie w jednostkach ryzyka. Stromo w górę = zysk, w dół = obsunięcie.'))}</p><div class="bt-st-eq" data-eq></div>`);
  }

  function edgeHtml(ts) {
    const rows = edgeTable(ts, st.by, { tagsOf });
    const ok = rows.filter((r) => !r.few && r.key !== NO_DAYTYPE);
    let verdict;
    if (!ts.length) verdict = '';
    else if (!ok.length) verdict = t("Żaden wiersz nie ma jeszcze {min} trade'ów. Liczby pokazują, co się zdarzyło, ale nie dają podstaw do wyboru, który wiersz jest lepszy. Zbierz więcej dni.", { min: MIN_N });
    else if (ok.length === 1) verdict = t("Tylko jeden wiersz ma co najmniej {min} trade'ów, więc nie ma z czym go porównać. Reszta to za mało danych.", { min: MIN_N });
    else {
      const best = [...ok].sort((a, b) => b.avgR - a.avgR)[0], worst = [...ok].sort((a, b) => a.avgR - b.avgR)[0];
      verdict = t('Wśród wierszy z co najmniej {min} trade\'ami: najlepszy to {best} ({bavg} na trade, n = {bn}), najsłabszy to {worst} ({wavg} na trade, n = {wn}).', {
        min: MIN_N, best: keyLabel(st.by, best.key), bavg: R(best.avgR), bn: best.n, worst: keyLabel(st.by, worst.key), wavg: R(worst.avgR), wn: worst.n,
      });
    }
    const seg = `<div class="seg" role="group" aria-label="${esc(t('Rozbicie'))}">${BY.map((k) => `<button type="button" data-st="by:${k}" aria-pressed="${st.by === k}">${esc(BY_LABEL()[k])}</button>`).join('')}</div>`;
    const dayNote = st.by === 'dayType'
      ? `<p class="note">${esc(t('Trade liczy się w każdym typie dnia, który opisuje jego dzień (np. CPI i OPEX naraz), więc suma wierszy może przekroczyć liczbę trade\'ów.'))}${featsOk ? '' : ' ' + esc(t('Cechy dni są niedostępne, więc typ dnia jest pusty.'))}</p>`
      : '';
    const body = rows.length ? rows.map((r) => `<tr class="${r.few ? 'bt-few' : ''}"><td>${esc(keyLabel(st.by, r.key))}${r.few ? ` <span class="bt-few-tag note">${esc(t('za mało danych'))}</span>` : ''}</td><td class="num">${esc(String(r.n))}</td><td class="num">${esc(fmtPct(r.wr, 0))}</td><td class="num ${rcls(r.avgR)}">${esc(R(r.avgR))}</td><td class="num ${rcls(r.sumR)}">${esc(R(r.sumR))}</td></tr>`).join('')
      : `<tr><td colspan="5" class="note">${esc(t('Brak trade\'ów.'))}</td></tr>`;
    return block(t('Gdzie mam przewagę'), seg, `<p class="note">${esc(t('Wiersze z mniej niż {min} trade\'ami są przygaszone: to za mało, żeby mówić o przewadze.', { min: MIN_N }))}</p>${dayNote}
      <div class="bt-st-tw"><table class="bt-tab bt-st-tab"><thead><tr><th>${esc(BY_LABEL()[st.by])}</th><th class="num">${esc(t("Trade'y"))}</th><th class="num">${esc(t('Skuteczność'))}</th><th class="num">${esc(t('Średnio R'))}</th><th class="num">${esc(t('Suma R'))}</th></tr></thead><tbody>${body}</tbody></table></div>
      ${verdict ? `<p class="bt-st-verdict">${esc(verdict)}</p>` : ''}`);
  }

  function execHtml(ts) {
    const e = execution(ts);
    const cover = `<p class="note">${esc(t("Liczone z trade'ów, które mają zapisane MAE i MFE: {w} z {n}. Pominięte: {x} (Live i najstarsze wpisy backtestu ich nie mają).", { w: e.withData, n: ts.length, x: e.without }))}</p>`;
    if (!e.withData) return block(t('Wykonanie'), '', cover);
    // H2 (ocena wyglądu #11): ten sam wzór co kafle nagłówka; długie objaśnienie w title
    const kv = (k, v, d, long) => `<div class="tile" title="${esc(long)}"><span class="lbl">${esc(k)}</span><span class="val">${v}</span><span class="sub">${esc(d)}</span></div>`;
    const few = e.withData < MIN_N ? `<p class="note bt-st-few" role="status">${esc(t("Mniej niż {min} trade'ów z MAE i MFE: średnie mogą się mocno zmienić.", { min: MIN_N }))}</p>` : '';
    const p80 = e.maeP80 != null
      ? `<p class="bt-st-verdict">${esc(t('{p}% zwycięzców nie spadło głębiej niż −{x} R (wygranych z danymi: {n}).', { p: 80, x: num(e.maeP80, 1), n: e.nWinners }))}</p>`
      : '';
    return block(t('Wykonanie'), '', `${cover}${few}<div class="tiles bt-st-ex">
      ${kv(t('Średnie MAE'), esc(R(e.avgMae)), t('pod prąd, średnio'), t('o tyle średnio cena szła pod prąd, zanim trade się skończył'))}
      ${kv(t('Średnie MFE'), esc(R(e.avgMfe)), t('w dobrą stronę, średnio'), t('o tyle średnio cena szła w dobrą stronę'))}
      ${kv(t('R zostawione po BE'), esc(R(e.leftOnTable.be)), t("trade'ów: {n}", { n: e.leftOnTable.nBe }), t("suma (MFE − wynik) po przesunięciu stopa na wejście; trade'ów: {n}", { n: e.leftOnTable.nBe }))}
      ${kv(t('R zostawione przy wczesnym wyjściu'), esc(R(e.leftOnTable.early)), t("trade'ów: {n}", { n: e.leftOnTable.nEarly }), t("suma (MFE − wynik) dla wygranych zamkniętych ręcznie albo częściowo; trade'ów: {n}", { n: e.leftOnTable.nEarly }))}
      ${kv(t('Najdłuższa seria strat'), esc(String(e.maxLossStreak)), t('strat z rzędu'), t('strat z rzędu; BE przerywa serię'))}
    </div>
    <h4 class="bt-st-h4">${esc(t('Jak głęboko szła cena pod prąd w wygranych trade\'ach (MAE)'))}</h4><div class="bt-st-mae" data-mae></div>${p80}`);
  }

  function liveHtml(ts) {
    const rows = compareLive(ts, live);
    if (!rows.length) return block(t('Backtest kontra Live'), '', `<p class="note">${esc(t("Brak setupu, który ma trade'y i w backtestcie, i w Live (z wynikiem w R). Porównanie pojawi się, gdy ta sama nazwa setupu wystąpi po obu stronach."))}</p>`);
    const cell = (s) => `<td class="num${s.few ? ' bt-few' : ''}">${esc(String(s.n))}</td><td class="num ${rcls(s.avgR)}${s.few ? ' bt-few' : ''}">${esc(R(s.avgR))}</td><td class="num${s.few ? ' bt-few' : ''}">${esc(fmtPct(s.wr, 0))}</td>`;
    return block(t('Backtest kontra Live'), '', `<p class="note">${esc(t('Ten sam setup obok siebie, w R. Wiersze z mniej niż {min} trade\'ami po którejś ze stron są przygaszone.', { min: MIN_N }))}</p>
      <div class="bt-st-tw"><table class="bt-tab bt-st-tab"><thead><tr><th rowspan="2">${esc(t('Setup'))}</th><th colspan="3" class="bt-st-grp">${esc(t('Backtest'))}</th><th colspan="3" class="bt-st-grp">${esc(t('Live'))}</th></tr>
      <tr><th class="num">${esc(t("Trade'y"))}</th><th class="num">${esc(t('Średnio R'))}</th><th class="num">${esc(t('Skuteczność'))}</th><th class="num">${esc(t("Trade'y"))}</th><th class="num">${esc(t('Średnio R'))}</th><th class="num">${esc(t('Skuteczność'))}</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.bt.few || r.live.few ? 'bt-few' : ''}"><td>${esc(r.setup)}${r.bt.few || r.live.few ? ` <span class="bt-few-tag note">${esc(t('za mało danych'))}</span>` : ''}</td>${cell(r.bt)}${cell(r.live)}</tr>`).join('')}</tbody></table></div>`);
  }

  function paint() {
    if (dead) return;
    const ts = scoped();
    const notes = [failedN ? t.p('Pominięto {n} sesji z powodu błędu odczytu. Liczby ich nie obejmują.', failedN) : '', hiddenN ? t.p("Ukryto {n} trade'ów z dnia w toku (kolejność losowa: data zostaje ukryta do końca dnia).", hiddenN) : ''].filter(Boolean);
    // H2 (ocena wyglądu #9): ten sam tytuł i podtytuł zakresu niezależnie od drogi wejścia (lista, „Sesja ukończona”)
    const scopeName = st.scope === 'this' ? (sessionsOf(all).find((x) => x.id === sessionId)?.name || t('Ta sesja')) : st.scope === 'picked' ? t('Wybrane sesje') : t('Wszystkie Backtest');
    // H2 #9: nagłówek strony jak „Statystyki” dashboardu (h1 + podtytuł zakresu, .page-head)
    const top = `<header class="page-head bt-st-head"><div><h1>${esc(t('Statystyki backtestu'))}</h1><p class="page-sub bt-st-sub">${esc(scopeName)} · ${esc(t.p("{n} trade'ów", ts.length))}</p></div>${onBack ? `<div class="sec-ctl"><button type="button" class="btn" data-st="back">${esc(t('Wróć do sesji'))}</button></div>` : ''}</header>${scopeHtml()}${notes.map((x) => `<p class="note bt-st-notice" role="status">${esc(x)}</p>`).join('')}`;
    if (err) { host.innerHTML = `${top}<div class="card empty err"><h3>${esc(t('Nie udało się policzyć statystyk'))}</h3><p>${esc(t('Sprawdź, czy dashboard działa.'))}</p></div>`; return; }
    if (!ts.length) {
      host.innerHTML = `${top}<div class="card empty"><h3>${esc(t("Brak ukończonych trade'ów w tym zakresie"))}</h3><p>${esc(t("Statystyki pojawią się po zamknięciu pierwszego trade'a w replayu."))}</p></div>`;
      return;
    }
    host.innerHTML = `${top}${headHtml(ts)}${equityHtml()}${edgeHtml(ts)}${execHtml(ts)}${liveHtml(ts)}`;
    equity = equityR(ts);
    cols = execution(ts);
    draw();
  }

  function draw() {
    const eq = host.querySelector('[data-eq]');
    if (eq && equity.length) {
      const pts = equity.map((p, i) => {
        if (p.start) return { ...p, xl: t('Start'), tip: `<b>${esc(t('Start'))}</b><br><span class="t-muted">0</span>` };
        const x = p.t;
        return { ...p, xl: shortDate(x.day || x.date), tip: `<b>#${i} · ${esc(shortDate(x.day || x.date))} ${esc(x.time || '')}</b><br><span class="t-muted">${esc([x.instrument, x.dir, x.setup].filter(Boolean).join(' · '))}</span><br>${esc(t('Trade'))}: <b class="${cls(p.v)}">${esc(R(p.v))}</b><br>${esc(t('Narastająco'))}: <b class="${cls(p.cum)}">${esc(R(p.cum))}</b>` };
      });
      drawEquity(eq, pts, { fmtY: (v) => fmtR(v), label: t('Krzywa kapitału w R'), id: 'btst-eq' });
    }
    const mae = host.querySelector('[data-mae]');
    if (mae && cols) {
      const items = cols.maeWinners.map((b) => ({
        label: `−${num(b.bin + 0.1, 1)}`, v: b.n, kind: 'pos', aria: `${num(b.bin, 1)}–${num(b.bin + 0.1, 1)} R: ${b.n}`,
        tip: `<b>−${num(b.bin, 1)} … −${num(b.bin + 0.1, 1)} R</b><br>${esc(t.p('{n} wygranych', b.n))}`,
      }));
      drawColumns(mae, items, { fmtY: (v) => String(v), label: t('Rozkład MAE wygranych trade\'ów'), yInt: true, height: 200 });
    }
  }

  async function onClick(ev) {
    const b = ev.target.closest('[data-st]');
    if (!b || b.disabled || !host.contains(b)) return;
    const [k, v] = b.dataset.st.split(':');
    if (k === 'back') { onBack?.(); return; }
    if (k === 'scope') { st.scope = v; if (v !== 'this') await ensureFull(); }
    else if (k === 'by') st.by = v;
    paint();
    host.querySelector('[data-st="' + b.dataset.st + '"]')?.focus(); // render zastępuje DOM: fokus wraca na ten sam przycisk
  }
  function onChange(ev) {
    const c = ev.target.closest('[data-st-pick]');
    if (!c) return;
    const id = c.dataset.stPick || null;
    if (c.checked) st.picked.add(id); else st.picked.delete(id);
    paint();
    host.querySelector('[data-st-pick="' + (id ?? '') + '"]')?.focus();
  }
  host.addEventListener('click', onClick);
  host.addEventListener('change', onChange);
  if (typeof ResizeObserver === 'function') {
    let w = host.clientWidth;
    ro = new ResizeObserver(() => { if (host.clientWidth === w) return; w = host.clientWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!dead && host.querySelector('[data-eq]')) draw(); }); });
    ro.observe(host);
  }

  host.setAttribute('aria-busy', 'true');
  host.innerHTML = `<header class="page-head bt-st-head"><div><h1>${esc(t('Statystyki backtestu'))}</h1></div></header><p class="note">${esc(t('Liczę…'))}</p>`;
  const ready = load().catch((e) => { err = e; }).then(() => { host.removeAttribute('aria-busy'); paint(); });
  return {
    ready,
    state: () => ({ ...st, picked: [...(st.picked || [])] }),
    setScope: (s) => { st.scope = s; paint(); },
    trades: () => scoped(),
    destroy() { dead = true; host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); ro?.disconnect(); cancelAnimationFrame(raf); host.innerHTML = ''; },
  };
}
