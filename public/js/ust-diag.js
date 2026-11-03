// N2 (1.6.0): Ustawienia → Kopie i diagnostyka: stan połączeń (Notion, Databento, FRED, Finnhub, GitHub) z „Sprawdź”, aktualizacje,
// kopie baz Notion (N5: lista, kopia teraz, podgląd przywracania, przywrócenie po wpisaniu „TAK”), serwer (wersja, Node, adres, restart, zatrzymanie),
// ostatnie linie dashboard.log bez sekretów i licencje. Stan bez sieci: GET /api/diag; test: POST /api/diag/test (ochrona zapisu).
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 9: restart i zatrzymanie serwera zawsze widoczne w diagnostyce)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwania kopii baz z UI nie ma)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 8: przywracanie Notion z kopii z UI po wpisaniu „TAK”)
import { t, locale } from './i18n.js';
import { esc, L, gHead, grp, dot, fmtBytes, docLink, getJson, postJson } from './ust-wspolne.js';
import { docUrl } from './ust-zrodla.js';
import { createTzSec } from './ust-strefa.js';

const NAMES = { notion: 'Notion', databento: 'Databento', fred: 'FRED', finnhub: 'Finnhub', github: 'GitHub' };
const OPTIONAL = new Set(['fred', 'finnhub']);

export function connState(s, c) {
  if (!c) return { st: 'wait', text: t('Sprawdzam…') };
  if (!c.configured) {
    if (s === 'github') return { st: 'off', text: t('Sprawdzanie aktualizacji wyłączone') };
    if (s === 'notion') return { st: 'bad', text: t('Nie połączono') };
    return { st: 'off', text: OPTIONAL.has(s) ? t('Brak klucza (opcjonalny)') : t('Brak klucza') };
  }
  const l = c.last;
  if (!l) return { st: 'wait', text: t('Skonfigurowany, nie sprawdzono') };
  if (l.ok === true) return { st: 'ok', text: t('Działa') };
  if (l.ok === null) return { st: 'wait', text: t('Czeka na pierwsze pobranie') };
  return { st: 'bad', text: t('Błąd') };
}
// Nazwy baz w liście kopii i powody kopii (manifest.reason; kopie z aktualizacji nie mają powodu)
const DB_LABEL = { trades: "Trade'y", konta: 'Konta', dziennik: 'Dziennik', finanse: 'Wydatki i payouty' };
const WHY = { update: 'przy aktualizacji', manual: 'ręczna', 'before-restore': 'przed przywróceniem', 'before-tz-fix': 'przed poprawą strefy czasu' };
const ago = (sec) => (sec < 3600 ? t('{n} min', { n: Math.max(1, Math.round(sec / 60)) }) : sec < 86400 ? t('{n} godz.', { n: Math.round(sec / 3600) }) : t('{n} dni', { n: Math.round(sec / 86400) }));

export function createDiagSec(ctx) {
  // N5: stan kopii z GET /api/backups (lista, zadanie, słowo potwierdzenia), otwarty podgląd { name, err }, komunikat wyniku, znacznik obsłużonego zadania
  let bk = null, bkErr = '', bkTimer = 0, pv = null, bkMsg = null, seenAt = null;
  // 1.7.0 (odbiór): poprawa strefy czasu starych wpisów w Notion
  const tzs = createTzSec(ctx);
  const when = (iso, name) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(+d) ? new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) : name;
  };
  const byName = (n) => bk?.items?.find((x) => x.name === n);
  function connHtml() {
    const d = ctx.diag(), busy = ctx.testing();
    const rows = Object.keys(NAMES).map((s) => {
      const c = d?.connections?.[s], { st, text } = connState(s, c), l = c?.last;
      return `<li class="sv-cr" data-src="${s}">${dot(st)}<b>${NAMES[s]}</b><span class="sv-cs">${esc(text)}</span>
        <span class="sv-cd note">${l?.detail ? esc(l.detail) : ''}</span>
        <button type="button" class="btn sm" data-act="diag-test" data-v="${s}" data-fk="diag-test-${s}"${c?.configured && !busy.has(s) ? '' : ' disabled'}>${busy.has(s) ? L('Sprawdzam…') : L('Sprawdź')}</button></li>`;
    }).join('');
    const ov = d?.overrides?.length ? `<p class="note sv-warn">${esc(t('Zmienne środowiska kierują połączenia na inne adresy (tryb testowy): {list}', { list: d.overrides.join(', ') }))}</p>` : '';
    return `<div class="sv-gh">${gHead('sv-diag-conn', 'Stan połączeń')}<button type="button" class="btn sm" data-act="diag-test" data-v="all" data-fk="diag-test-all"${busy.size ? ' disabled' : ''}>${L('Sprawdź wszystko')}</button></div>
      <p class="note sv-gd">${L('Sprawdzenie jest bezpłatne: Databento wycenia minutę danych, FRED i Finnhub odpowiadają na jedno zapytanie. Klucze nigdy nie trafiają do przeglądarki.')}</p>
      <ul class="sv-conns">${rows}</ul>${ov}`;
  }
  function updatesHtml() {
    const m = ctx.getMeta() || {};
    return `${gHead('sv-diag-upd', 'Aktualizacje')}
      <div class="sp-f"><label class="check"><input type="checkbox" data-act="sp-upd" data-fk="upd" ${m.updateCheck !== false ? 'checked' : ''}> ${L('Sprawdzaj aktualizacje')}</label>
      <p class="note">${L('Raz na dobę serwer pyta publiczne API GitHub o najnowsze wydanie. To jedyne połączenie poza Notion; nie wysyła żadnych danych.')}</p></div>
      ${ctx.opts.updateHtml()}`;
  }
  function bkRowHtml(b) {
    const counts = Object.entries(b.counts || {}).map(([db, n]) => `${t(DB_LABEL[db] || db)} ${n}`).join(' · ');
    const meta = [b.unreadable ? t('opis kopii nieczytelny') : counts, fmtBytes(b.bytes), b.appVersion ? t('wersja {v}', { v: b.appVersion }) : ''].filter(Boolean).join(' · ');
    // final (bezp. P3-1): kopia innego dziennika bez przycisku podglądu, z powodem
    const foreign = b.otherJournal ? `<span class="sv-bk-meta sv-st" data-st="warn">${dot('warn')}${L('Z innego dziennika: nie da się jej tu przywrócić')}</span>` : '';
    const open = pv?.name === b.name;
    const busy = !!bk?.job?.running;
    return `<li class="sv-bk${open ? ' on' : ''}" data-name="${esc(b.name)}"><div class="sv-bk-row">
        <div class="sv-bk-txt"><span class="sv-bk-h"><b>${esc(when(b.createdAt, b.name))}</b><span class="sv-bk-why" data-why="${esc(b.reason)}">${L(WHY[b.reason] || WHY.update)}</span></span><span class="sv-bk-meta">${esc(meta)}</span>${foreign}</div>
        ${b.unreadable || b.otherJournal ? '' : `<button type="button" class="btn sm" data-act="bk-preview" data-v="${esc(b.name)}" data-fk="bk-pv-${esc(b.name)}"${busy || open ? ' disabled' : ''}>${L('Podgląd przywracania')}</button>`}</div>
      ${open ? previewHtml(b) : ''}</li>`;
  }
  // Podgląd: co się zmieni (liczby wpisów i pól), potem potwierdzenie słowem; w trakcie przywracania postęp
  function previewHtml(b) {
    const j = bk?.job || {}, mine = j.name === b.name;
    const close = `<button type="button" class="btn ghost sm" data-act="bk-close" data-fk="bk-close">${L('Zamknij')}</button>`;
    const err = pv.err ? `<p class="note sv-warn" role="alert">${esc(pv.err)}</p>` : '';
    if (mine && j.kind === 'restore' && j.running) {
      const p = j.step === 'apply' && j.total ? Math.round((j.done / j.total) * 100) : 0;
      const line = j.step === 'apply' ? t('Przywracam: {done} z {total} wpisów', { done: j.done, total: j.total }) : j.step === 'backup' ? t('Zapisuję kopię obecnego stanu…') : t('Porównuję kopię z Notion…');
      return `<div class="sv-confirm sv-bk-pv"><div class="sv-prog"><div class="sv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(line)}"><i style="width:${p}%"></i></div><p class="note" aria-live="polite">${esc(line)}</p></div>
        <p class="note">${L('Nie zamykaj dashboardu do końca przywracania.')}</p></div>`;
    }
    const ready = mine && j.kind === 'preview' && !j.running && j.result;
    if (!ready) {
      if (mine && j.kind === 'preview' && j.error) return `<div class="sv-confirm sv-bk-pv"><p class="note sv-warn" role="alert">${esc(t('Podgląd się nie udał: {msg}', { msg: j.error.message }))}</p><div class="upd-actions">${close}</div></div>`;
      if (pv.err) return `<div class="sv-confirm sv-bk-pv">${err}<div class="upd-actions">${close}</div></div>`;
      return `<div class="sv-confirm sv-bk-pv"><p class="note" role="status"><span class="spin" aria-hidden="true"></span> ${L('Porównuję kopię z tym, co jest teraz w Notion. To tylko odczyt.')}</p></div>`;
    }
    const r = j.result, s = r.summary;
    if (!s.pages) return `<div class="sv-confirm sv-bk-pv"><p><b>${L('Notion jest zgodny z tą kopią. Nie ma czego przywracać.')}</b></p><div class="upd-actions">${close}</div></div>`;
    const lines = [];
    if (s.update) lines.push(`${t.p('Przywróci pola w {n} wpisach.', s.update)} ${t('Pól do przywrócenia: {f}.', { f: s.fields })}`);
    if (s.untrash) lines.push(t.p('Wyjmie z kosza Notion {n} wpisów.', s.untrash));
    if (s.recreate) lines.push(t.p('Odtworzy {n} usuniętych wpisów jako nowe (bez relacji z innych baz).', s.recreate));
    // final (P2-2): wpisy odtworzone wcześniej z tej kopii (np. przed przerwaniem) dostają aktualizację, nie drugi raz to samo
    if (s.already) lines.push(t('Odtworzone już wcześniej z tej kopii: {n}. Zostaną zaktualizowane, nie utworzone drugi raz.', { n: s.already }));
    lines.push(t('Bez zmian: {n}. Wpisy dodane po tej kopii zostają.', { n: s.unchanged }));
    const act = { untrash: t('wyjmie z kosza'), recreate: t('odtworzy jako nowy') };
    const desc = (it) => (it.action === 'update' ? t('pola: {list}', { list: it.fields.join(', ') }) : act[it.action]) + (it.already ? ` · ${t('odtworzony wcześniej')}` : '');
    const items = r.items.map((it) => `<li><b>${esc(t(DB_LABEL[it.db] || it.db))}</b><span>${esc(it.title || t('(bez nazwy)'))}</span><span class="note">${esc(desc(it))}</span></li>`).join('');
    const w = bk?.word || 'TAK';
    return `<div class="sv-confirm sv-bk-pv" role="group" aria-labelledby="sv-bk-pv-h"><p id="sv-bk-pv-h"><b>${esc(t.p('Przywrócenie z tej kopii zmieni {n} wpisów.', s.pages))}</b></p>
      <ul class="sv-bk-sum">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <details class="sv-bk-items"><summary>${esc(t.p('Pokaż wpisy ({n})', s.pages))}</summary><ul>${items}</ul>${r.more ? `<p class="note">${esc(t('…i {n} kolejnych.', { n: r.more }))}</p>` : ''}</details>
      <p class="note">${L('Przed zapisem dashboard zrobi kopię obecnego stanu: zmiany pól i wyjęcie z kosza cofniesz przywróceniem z tej kopii. Wpisy odtworzone jako nowe usuwa się ręcznie w Notion. Przywracanie niczego nie usuwa i nie zmienia pól w bazach.')}</p>
      <label class="lbl" for="sv-bk-confirm">${esc(t('Wpisz {word}, aby przywrócić', { word: w }))}</label>
      <div class="sp-keyrow"><input id="sv-bk-confirm" class="sp-in" type="text" autocomplete="off" spellcheck="false" maxlength="8" data-fk="bk-confirm" placeholder="${esc(w)}">
        <button type="button" class="btn primary danger sm" data-act="bk-restore" data-v="${esc(b.name)}" data-fk="bk-restore"${bk?.job?.running ? ' disabled' : ''}>${L('Przywróć z tej kopii')}</button>${close}</div>${err}</div>`;
  }
  function backupsHtml() {
    const d = ctx.diag(), items = bk?.items || [], j = bk?.job;
    const creating = j?.running && j.kind === 'create';
    const msg = bkMsg ? `<p class="note sv-bk-msg${bkMsg.error ? ' sv-warn' : ''}" role="${bkMsg.error ? 'alert' : 'status'}">${bkMsg.error ? '' : dot('ok')}${esc(bkMsg.text)}</p>` : '';
    const prog = creating ? `<div class="sv-prog"><div class="sv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${j.total || 4}" aria-valuenow="${j.done}" aria-label="${L('Postęp kopii')}"><i style="width:${j.total ? Math.round((j.done / j.total) * 100) : 5}%"></i></div>
      <p class="note" aria-live="polite">${esc(t('Zapisuję kopię: baza {done} z {total}…', { done: Math.max(1, j.done), total: j.total || 4 }))}</p></div>` : '';
    const list = !bk ? `<p class="note">${bkErr ? esc(bkErr) : L('Sprawdzam…')}</p>`
      : items.length ? `<ul class="sv-bks">${items.map(bkRowHtml).join('')}</ul>`
        : `<p class="note sv-bk-empty">${L('Nie ma jeszcze kopii. Pierwsza powstanie przy aktualizacji albo po kliknięciu „Utwórz kopię teraz”.')}</p>`;
    return `<div class="sv-gh">${gHead('sv-diag-bak', 'Kopie baz Notion')}<button type="button" class="btn sm" data-act="bk-create" data-fk="bk-create"${j?.running || !bk ? ' disabled' : ''}>${creating ? L('Zapisuję kopię…') : L('Utwórz kopię teraz')}</button></div>
      <p class="note sv-gd">${L('Kopia to zapis schematu i wszystkich wpisów czterech baz z Notion w folderze backups/ na tym komputerze. Powstaje sama przed każdą aktualizacją. Przywracanie niczego nie usuwa: przywraca wartości pól, wyjmuje wpisy z kosza i odtwarza brakujące.')}</p>
      <div class="sv-path"><span class="lbl">${L('Folder')}</span><code class="sv-pathv">${esc(bk?.dir || d?.paths?.backups || '…')}</code>${items.length ? `<button type="button" class="btn sm" data-act="diag-open" data-v="backups" data-fk="open-backups">${L('Otwórz folder')}</button>` : ''}</div>
      ${prog}${msg}${list}
      <p class="note">${L('Starych kopii dashboard nie usuwa. Gdy potrzebujesz miejsca, usuń najstarsze foldery sam.')} ${docLink(docUrl(d?.repoUrl, 'backup'), 'Instrukcja: kopia i przywracanie')}</p>`;
  }

  // ---------- kopie: dane i akcje ----------
  async function loadBk() {
    try { bk = await getJson('/api/backups'); bkErr = ''; } catch (e) { bkErr = e.message; }
    const j = bk?.job;
    // zadanie skończyło się: wynik kopii albo przywrócenia jako komunikat (raz na zadanie)
    if (j && !j.running && j.finishedAt && j.finishedAt !== seenAt) {
      seenAt = j.finishedAt;
      if (j.kind === 'create') bkMsg = j.error ? { text: t('Kopia się nie udała: {msg}', { msg: j.error.message }), error: true } : { text: t('Kopia zapisana.') };
      if (j.kind === 'restore') {
        if (j.error) {
          bkMsg = { text: t('Przywracanie przerwane: {msg}. Wpisy przywrócone do tej chwili zostają, a kopia sprzed przywrócenia jest na liście.', { msg: j.error.message }), error: true };
          // final (P2-2): część wpisów zapisana: dashboard wczytuje dane od nowa
          if (j.done > 0) ctx.opts.onRestored?.();
        }
        else {
          const sf = j.result.safety ? byName(j.result.safety) : null;
          bkMsg = { text: j.result.restored ? `${t.p('Przywrócono {n} wpisów.', j.result.restored)} ${t('Kopia stanu sprzed przywrócenia: {when}.', { when: when(sf?.createdAt, j.result.safety) })}` : t('Nic do przywrócenia: Notion był zgodny z kopią.') };
          ctx.opts.onRestored?.();
        }
        pv = null;
      }
    }
    if (ctx.isActive('diag')) ctx.rerender();
    clearTimeout(bkTimer);
    if (j?.running && ctx.isActive('diag')) bkTimer = setTimeout(loadBk, 500);
  }
  async function bkStart(url, body, onErr) {
    try { await postJson(url, body); } catch (e) { onErr(e.message); }
    await loadBk();
  }
  function handle(act, v) {
    switch (act) {
      case 'bk-create': bkMsg = null; pv = null; bkStart('/api/backups/create', {}, (m) => { bkMsg = { text: m, error: true }; }); return true;
      case 'bk-preview': bkMsg = null; pv = { name: v, err: '' }; ctx.rerender(); bkStart('/api/backups/preview', { name: v }, (m) => { pv = { name: v, err: m }; }); return true;
      case 'bk-close': { const n = pv?.name || ''; pv = null; ctx.rerender(); ctx.root()?.querySelector(`[data-fk="bk-pv-${CSS.escape(n)}"]`)?.focus(); return true; }
      case 'bk-restore': {
        const typed = ctx.root()?.querySelector('#sv-bk-confirm')?.value.trim() || '', w = bk?.word || 'TAK';
        if (typed !== w) { pv = { ...pv, err: t('Wpisz dokładnie {word}.', { word: w }) }; ctx.rerender(); ctx.root()?.querySelector('#sv-bk-confirm')?.focus(); return true; }
        pv = { ...pv, err: '' };
        // final (P2-2, bezp. P3-2): znacznik z wyniku podglądu (jednorazowy, ważny kilka minut)
        const token = bk?.job?.kind === 'preview' && bk.job.name === v ? bk.job.result?.token : '';
        bkStart('/api/backups/restore', { name: v, confirm: typed, token }, (m) => { pv = { ...pv, err: m }; });
        return true;
      }
      default: return tzs.handle(act, v);
    }
  }
  function serverHtml() {
    const d = ctx.diag(), r = ctx.restartState();
    const kv = (k, v) => `<div class="sp-kv"><span>${L(k)}</span><b>${v}</b></div>`;
    return `${gHead('sv-diag-srv', 'Serwer')}
      <div class="sp-f sp-kvs">${kv('Wersja', esc(d?.version || ctx.getMeta()?.version || '-'))}${kv('Adres', esc(d?.address || '-'))}${kv('Node.js', esc(d?.node || '-'))}${kv('Działa od', d ? esc(ago(d.uptimeSec)) : '-')}</div>
      <div class="upd-actions"><button type="button" class="btn sm" data-act="diag-restart" data-fk="diag-restart"${r.waiting ? ' disabled' : ''}>${r.waiting ? L('Uruchamiam ponownie…') : L('Uruchom ponownie')}</button><button type="button" class="btn ghost sm" data-act="diag-stop" data-fk="diag-stop">${L('Zatrzymaj serwer')}</button></div>
      ${r.error ? `<p class="ferr" role="alert">${esc(r.error)}</p>` : r.waiting ? `<p class="note" role="status">${L('Czekam, aż serwer wstanie. Strona odświeży się sama.')}</p>` : ''}
      <p class="note">${L('Ponowne uruchomienie przydaje się, gdy coś przestało odpowiadać. Zatrzymanie wyłącza dashboard do czasu uruchomienia skrótem JustJournal, Dashboard.vbs albo start.sh.')}</p>`;
  }
  function logHtml() {
    const d = ctx.diag(), lg = ctx.logState();
    const size = d?.log?.exists ? fmtBytes(d.log.bytes) : t('brak pliku');
    const body = lg?.error ? `<p class="ferr">${esc(lg.error)}</p>` : lg?.lines ? (lg.lines.length ? `<pre class="sv-log" tabindex="0" aria-label="${L('Ostatnie linie logu')}">${esc(lg.lines.join('\n'))}</pre>` : `<p class="note">${L('Log jest pusty.')}</p>`) : '';
    const msg = ctx.openMsg();
    return `${gHead('sv-diag-log', 'Log serwera')}
      <div class="sv-path"><span class="lbl">dashboard.log</span><code class="sv-pathv">${esc(size)}</code></div>
      <div class="upd-actions"><button type="button" class="btn sm" data-act="diag-log" data-fk="diag-log">${lg?.lines ? L('Odśwież') : L('Pokaż ostatnie linie')}</button>${lg?.lines?.length ? `<button type="button" class="btn ghost sm" data-act="diag-log-copy" data-fk="diag-log-copy">${L('Kopiuj')}</button>` : ''}<button type="button" class="btn ghost sm" data-act="diag-open" data-v="logs" data-fk="open-logs">${L('Otwórz folder')}</button></div>
      ${msg ? `<p class="note" role="status">${esc(msg)}</p>` : ''}${lg?.copied ? `<p class="note" role="status">${L('Skopiowano do schowka.')}</p>` : ''}
      ${body}
      <p class="note">${L('Tokeny i klucze są w logu zamaskowane. Log możesz dołączyć do zgłoszenia problemu.')}</p>`;
  }
  function licencje() {
    return `${gHead('ch-g-lic', 'Licencje')}
      <div class="sp-f sp-lic"><p class="note">TradingView Lightweight Charts™, Copyright © 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noopener">https://www.tradingview.com/</a> (Apache-2.0).</p>
        <p class="note">${L('Narzędzia rysowania: lightweight-charts-drawing 0.6.2 (MIT).')}</p>
        <p class="note">${L('Świece pochodzą z Databento (dane CME Group) i służą do użytku własnego w dzienniku. Udostępniając wykres publicznie, odpowiadasz za prawa do danych według licencji Databento i CME.')}</p>
        <p class="note">${L('Filmy tła wybierasz z dysku przy każdym nagraniu. Zostają w tej przeglądarce (nie trafiają do Notion ani do synchronizacji ustawień), a gotowy film nie ma dźwięku. Używaj tylko nagrań, do których masz prawa (obraz i muzyka).')}</p></div>`;
  }
  function html() {
    // poprawki po review N1–N4: nieczytelny config.local.json został odłożony; ustawienia tego komputera zaczęły się od nowa
    const bad = ctx.diag()?.configCorrupt;
    const corrupt = bad ? `<section class="card sv-g" id="sv-g-konfig"><h3 class="sp-g">${L('Plik konfiguracji był uszkodzony')}</h3>
      <p class="note sv-warn">${esc(t('Plik config.local.json nie był poprawnym JSON-em. Dashboard odłożył go jako {name} w folderze aplikacji i zaczął z ustawieniami domyślnymi: kredyt Databento nie jest wpisany, limity są domyślne. Wpisz je ponownie w Źródłach danych albo przepisz z kopii.', { name: bad }))}</p></section>` : '';
    return corrupt + grp(connHtml(), 'polaczenia') + grp(serverHtml(), 'serwer') + grp(logHtml(), 'log') + grp(updatesHtml(), 'aktualizacje') + grp(backupsHtml(), 'kopie') + grp(tzs.html(), 'strefa') + grp(licencje(), 'licencje');
  }
  function onChange(ev) {
    if (tzs.onChange(ev)) return true;
    if (ev.target.matches('[data-act="sp-upd"]')) { ctx.opts.onConfig({ updateCheck: ev.target.checked }); return true; }
    return false;
  }
  function onEscape() {
    if (pv && !bk?.job?.running) { pv = null; ctx.rerender(); return true; }
    return false;
  }
  return {
    id: 'diag', html, handle, onInput: () => false, onChange, onEscape,
    enter() { loadBk(); tzs.enter(); }, leave() { clearTimeout(bkTimer); tzs.leave(); },
    keepTyped: ['#sv-bk-confirm', '#sv-tz-confirm'],
  };
}
