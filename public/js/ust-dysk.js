// N3 (1.6.0): Ustawienia → Dane na dysku: gdzie dashboard trzyma pobrane świece, sesje backtestu, newsy, earningsy, rysunki i kopie baz.
// Przegląd z GET /api/disk (tylko dysk, bez sieci): katalog danych z wolnym miejscem, świece per instrument i warstwa (1m, 1s, kontrakty) z zakresem dat
// i rozmiarem, sesje (i ile z nich nie ma kopii definicji w Notion), newsy i earningsy, rysunki czekające na wysyłkę, kopie baz (bez usuwania).
// Usuwanie warstwy świec: potwierdzenie wpisaniem nazwy („NQ 1m”). Przeniesienie katalogu: sprawdzenie → kopia z postępem → sprawdzenie sum →
// „Przełącz i uruchom ponownie” (mechanizm restartu z N2). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.2–4.4.
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 6: przenoszenie katalogu danych: kopia → sprawdzenie → przełączenie → restart, stary katalog zostaje)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 7: usuwanie świec z UI tak, kopii baz nie)
import { t, locale } from './i18n.js';
import { esc, L, gHead, grp, fmtBytes, docLink, kv, getJson, postJson } from './ust-wspolne.js';
import { docUrl } from './ust-zrodla.js';

// poniżej tego progu wolne miejsce jest oznaczone ostrzeżeniem (§4.5: Gotowość, „wolne miejsce na dysku < 2 GB”)
export const LOW_FREE_BYTES = 2 * 1024 ** 3;
const ROW_LABEL = { '1m': 'Minutówki (1m)', '1s': 'Sekundówki (1s)', kontrakty: 'Kontrakty (okna rolli)' };
// „Otwórz folder” dla poprzedniego katalogu danych (ścieżkę zna tylko serwer)
const PREV = 'prev';
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);

export function createDysk(ctx) {
  let disk = null, loadErr = '';
  // usuwanie: { key: 'NQ|1m', busy, msg: { text, error } }
  let del = null, delMsg = null;
  // przenoszenie: wynik sprawdzenia, komunikat, stan z serwera (move.phase …)
  let check = null, moveMsg = null, pollTimer = 0;
  // poprawki po review N1–N4 (P2-2): „Kopiuj” wyłączony na czas żądania (podwójne kliknięcie nie wysyła drugiej kopii)
  let moving = false;
  const path = (k) => ctx.diag()?.paths?.[k] || '';
  const root = () => ctx.root();
  const openBtn = (which, label = 'Otwórz folder') => `<button type="button" class="btn sm" data-act="diag-open" data-v="${which}" data-fk="open-${which}">${L(label)}</button>`;
  const pathRow = (label, p, which) => `<div class="sv-path"><span class="lbl">${L(label)}</span><code class="sv-pathv">${p ? esc(p) : '…'}</code>${which ? openBtn(which) : ''}</div>`;
  const msgHtml = (m) => (m ? `<p class="note" role="status"><span class="${m.error ? 'warnb' : 'okb'}">${esc(m.text)}</span></p>` : '');
  const when = (iso) => (iso ? new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '-');

  function folderHtml() {
    const d = disk, free = d?.free;
    const low = free && free.freeBytes < LOW_FREE_BYTES;
    const msg = ctx.openMsg();
    return `${gHead('sv-dysk-data', 'Katalog danych')}
      <p class="note sv-gd">${L('Pobrane świece i sesje backtestu zostają tylko na tym komputerze. Aktualizacja ich nie rusza, a kopia przy aktualizacji ich nie obejmuje.')}</p>
      ${pathRow('Folder', d?.dataDir || path('data'), 'data')}
      ${d?.missing ? `<p class="note sv-warn">${esc(t('Folder danych z ustawień jest niedostępny (odłączony dysk?): {path}. Dashboard używa folderu domyślnego, dopóki tamten nie wróci.', { path: d.missing }))}</p>` : ''}
      <div class="sp-f sp-kvs">${kv('Pobrane świece na dysku', esc(fmtBytes(d ? d.candles.reduce((a, r) => a + r.bytes, 0) : null)))}${kv('Zajęte przez dane', esc(fmtBytes(d?.bytes ?? null)))}
        ${kv('Wolne na dysku', free ? `${low ? `<span class="sv-low">${esc(fmtBytes(free.freeBytes))}</span>` : esc(fmtBytes(free.freeBytes))}` : '-')}</div>
      ${low ? `<p class="note sv-warn">${L('Na dysku zostało mniej niż 2 GB. Przenieś dane na inny dysk albo usuń niepotrzebne warstwy świec.')}</p>` : ''}
      ${d?.prev ? `${pathRow('Poprzedni folder', d.prev, PREV)}<p class="note">${L('Został po przeniesieniu. Gdy nowy folder działa, możesz go usunąć sam.')}</p>` : ''}
      ${msg ? `<p class="note" role="status">${esc(msg)}</p>` : ''}
      ${loadErr ? `<p class="note sv-warn">${esc(loadErr)}</p>` : ''}`;
  }

  function candlesHtml() {
    const rows = disk?.candles || [];
    const meta = ctx.getMeta() || {};
    const body = !disk ? `<p class="note">${L('Sprawdzam…')}</p>` : !rows.length
      ? `<p class="note">${L('Nie ma jeszcze pobranych świec. Połącz Databento w Źródłach danych, a wykres trade\'a pobierze je po kliknięciu.')} <a class="sv-doc" href="#ustawienia/zrodla/databento">${L('Źródła danych')}</a></p>`
      : `<table class="sv-tbl"><thead><tr><th scope="col">${L('Instrument')}</th><th scope="col">${L('Warstwa')}</th><th scope="col">${L('Od')}</th><th scope="col">${L('Do')}</th><th scope="col" class="num">${L('Rozmiar')}</th><th scope="col"><span class="sr">${L('Akcje')}</span></th></tr></thead>
        <tbody>${rows.map((r) => {
          const key = `${r.symbol}|${r.layer}`, name = `${r.symbol} ${r.layer}`;
          return `<tr${del?.key === key ? ' class="on"' : ''}><td><b>${esc(r.symbol)}</b></td><td>${L(ROW_LABEL[r.layer])}</td><td data-to="${esc(r.to)}" data-size="${esc(fmtBytes(r.bytes))}">${esc(r.from)}</td><td>${esc(r.to)}</td><td class="num">${esc(fmtBytes(r.bytes))}</td>
            <td class="act"><button type="button" class="btn ghost sm" data-act="dysk-del" data-v="${esc(key)}" data-fk="dysk-del-${esc(key)}" aria-label="${esc(t('Usuń warstwę {name}', { name }))}">${L('Usuń…')}</button></td></tr>`;
        }).join('')}</tbody></table>`;
    let confirm = '';
    if (del) {
      const [sym, layer] = del.key.split('|'), r = rows.find((x) => x.symbol === sym && x.layer === layer), name = `${sym} ${layer}`;
      if (r) {
        const auto = sym === 'NQ' && (layer === '1s' || layer === 'kontrakty') && meta.chartNq1sDaily === true;
        confirm = `<div class="sv-confirm" role="group" aria-labelledby="sv-del-h"><p id="sv-del-h"><b>${esc(t('Usunąć {name}?', { name }))}</b> ${esc(t('Zwolni {size} ({files} plików dni, {from} – {to}).', { size: fmtBytes(r.bytes), files: r.files, from: r.from, to: r.to }))}</p>
          <p class="note">${L('Ponowne pobranie tych świec jest płatne (Databento wycenia je przed pobraniem). Okna tej warstwy wypadną też z kolejki pobierania.')}${auto ? ` ${L('Codzienne okno 1s NQ jest włączone, więc kolejka pobierze ponownie ostatnie 7 dni (ok. 0,14 USD).')}` : ''}</p>
          <label class="lbl" for="sv-del-confirm">${esc(t('Wpisz {name}, aby potwierdzić', { name }))}</label>
          <div class="sp-keyrow"><input id="sv-del-confirm" class="sp-in" type="text" autocomplete="off" spellcheck="false" maxlength="20" data-fk="dysk-del-in" placeholder="${esc(name)}">
            <button type="button" class="btn primary danger sm" data-act="dysk-del-ok" data-fk="dysk-del-ok"${del.busy ? ' disabled' : ''}>${del.busy ? L('Usuwam…') : L('Usuń warstwę')}</button>
            <button type="button" class="btn ghost sm" data-act="dysk-del-no" data-fk="dysk-del-no">${L('Anuluj')}</button></div>${msgHtml(del.msg)}</div>`;
      }
    }
    return `<div class="sv-gh">${gHead('sv-dysk-swiece', 'Świece')}${disk?.candles?.length ? openBtn('candles') : ''}</div>
      <p class="note sv-gd">${L('Świece z Databento w warstwach: minutówki (historia), sekundówki (okna wokół trade\'ów i 9:30–11:00 NY) i kontrakty (okna wokół zmiany kontraktu). 24 bajty na świecę.')}</p>
      ${body}${confirm}${msgHtml(delMsg)}
      <p class="note">${docLink(docUrl(ctx.diag()?.repoUrl, 'candles'), 'Instrukcja: magazyn świec')}</p>`;
  }

  function sessionsHtml() {
    const s = disk?.sessions, c = ctx.opts.btCopyInfo();
    const note = c?.skipped ? `<p class="note sv-warn">${esc(t('Sesje bez kopii definicji w Notion (limit 30 000 znaków): {n}. Są zapisane tylko w tym folderze.', { n: c.skipped }))}</p>`
      : `<p class="note">${L('Definicje sesji mają kopię w synchronizacji ustawień, a zamknięte trade\'y trafiają do bazy Trade\'y w Notion. Pełny stan sesji (kursor, zlecenia, rysunki) jest tylko w tym folderze.')}</p>`;
    return `<div class="sv-gh">${gHead('sv-dysk-sesje', 'Sesje backtestu')}${s?.count ? openBtn('sessions') : ''}</div>
      <div class="sp-f sp-kvs">${kv('Sesje', esc(s ? String(s.count) : '…'))}${kv('Rozmiar', esc(fmtBytes(s?.bytes ?? null)))}</div>${note}`;
  }

  function otherHtml() {
    const d = disk;
    const at = (x) => (x?.updatedAt ? t('{size}, odświeżone {at}', { size: fmtBytes(x.bytes), at: when(x.updatedAt) }) : fmtBytes(x?.bytes ?? null));
    const dr = d?.drawings;
    return `${gHead('sv-dysk-inne', 'Newsy, earningsy i rysunki')}
      <div class="sp-f sp-kvs">${kv('Newsy makro', esc(d ? at(d.news) : '…'))}${kv('Earningsy', esc(d ? at(d.earnings) : '…'))}
        ${kv('Rysunki czekające na wysyłkę do Notion', esc(!dr ? '…' : dr.pending ? String(dr.pending) : t('0, wszystkie wysłane')))}</div>
      ${dr?.pending ? `<p class="note">${L('Rysunki wyślą się same, gdy Notion znów odpowie. Do tego czasu są tylko w tym folderze.')}</p>` : ''}`;
  }

  function backupsHtml() {
    const b = disk?.backups;
    return `<div class="sv-gh">${gHead('sv-dysk-kopie', 'Kopie baz Notion')}${b?.count ? openBtn('backups') : ''}</div>
      <div class="sp-f sp-kvs">${kv('Kopie', esc(b ? String(b.count) : '…'))}${kv('Rozmiar', esc(fmtBytes(b?.bytes ?? null)))}${kv('Najnowsza', esc(b?.latest || '-'))}</div>
      <p class="note">${L('Kopie powstają przy każdej aktualizacji, w folderze backups/ obok aplikacji. Dashboard ich nie usuwa; jeśli potrzebujesz miejsca, usuń najstarsze sam w folderze.')} <a class="sv-doc" href="#ustawienia/diag/kopie">${L('Kopia teraz i przywracanie')}</a></p>`;
  }

  function moveHtml() {
    const m = disk?.move || { phase: 'idle' }, r = ctx.restartState();
    let state = '';
    if (m.phase === 'copy' || m.phase === 'verify') {
      const copying = m.phase === 'copy', p = copying ? pct(m.bytes, m.totalBytes) : pct(m.verified, m.total);
      const line = copying ? t('Kopiuję: {done} z {total} plików ({bytes} z {all})', { done: m.done, total: m.total, bytes: fmtBytes(m.bytes), all: fmtBytes(m.totalBytes) }) : t('Sprawdzam kopię: {done} z {total} plików', { done: m.verified, total: m.total });
      state = `<div class="sv-prog"><div class="sv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(line)}"><i style="width:${p}%"></i></div>
        <p class="note" aria-live="polite">${esc(line)}</p><div class="upd-actions"><button type="button" class="btn ghost sm" data-act="dysk-move-cancel" data-fk="dysk-move-cancel">${L('Anuluj')}</button></div></div>`;
    } else if (m.phase === 'ready' || m.phase === 'switching' || r.waiting) {
      state = `<div class="sv-confirm"><p><b>${esc(t('Kopia sprawdzona: {n} plików, {size}.', { n: m.total, size: fmtBytes(m.totalBytes) }))}</b></p>
        <p class="note">${esc(t('Dashboard zapisze nowy folder ({path}) w config.local.json i uruchomi się ponownie. Stary folder zostaje.', { path: m.target }))}</p>
        <div class="upd-actions"><button type="button" class="btn sm" data-act="dysk-move-switch" data-fk="dysk-move-switch"${r.waiting ? ' disabled' : ''}>${r.waiting ? L('Uruchamiam ponownie…') : L('Przełącz i uruchom ponownie')}</button>${m.phase === 'ready' && !r.waiting ? `<button type="button" class="btn ghost sm" data-act="dysk-move-cancel" data-fk="dysk-move-cancel">${L('Anuluj i usuń kopię')}</button>` : ''}</div>
        ${m.phase === 'ready' ? `<p class="note">${L('Do przełączenia albo anulowania dashboard nie pobiera ani nie usuwa świec, żeby nowy folder był pełną kopią.')}</p>` : ''}
        ${r.error ? `<p class="note sv-warn">${esc(r.error)}</p>` : ''}</div>`;
    } else {
      const ck = check;
      state = `<label class="lbl" for="sv-move-path">${L('Nowy folder danych')}</label>
        <div class="sp-keyrow"><input id="sv-move-path" class="sp-in sp-key" type="text" autocomplete="off" spellcheck="false" maxlength="400" data-fk="dysk-move-path" placeholder="${esc(t('np. D:\\JustJournal\\dane'))}">
          <button type="button" class="btn sm" data-act="dysk-move-check" data-fk="dysk-move-check"${ck?.busy ? ' disabled' : ''}>${ck?.busy ? L('Sprawdzam…') : L('Sprawdź')}</button></div>
        ${ck?.ok ? `<div class="sv-confirm"><p>${esc(t('Folder {path}: potrzeba {need}, wolne {free}.', { path: ck.target, need: fmtBytes(ck.needBytes), free: fmtBytes(ck.freeBytes) }))}</p>
          ${ck.enough ? `<div class="upd-actions"><button type="button" class="btn sm" data-act="dysk-move-start" data-fk="dysk-move-start"${moving ? ' disabled' : ''}>${esc(t('Kopiuj {n} plików', { n: ck.files }))}</button></div>` : `<p class="note sv-warn">${L('Za mało miejsca w tym folderze.')}</p>`}</div>` : ''}
        ${m.phase === 'error' ? `<p class="note sv-warn">${esc(t('Kopia się nie udała: {msg} Częściowa kopia została usunięta, dane zostały na miejscu.', { msg: m.error || '' }))}</p>` : ''}
        ${m.phase === 'cancelled' ? `<p class="note">${L('Przenoszenie anulowane. Częściowa kopia została usunięta, dane zostały na miejscu.')}</p>` : ''}`;
    }
    return `${gHead('sv-dysk-move', 'Przenieś katalog danych')}
      <p class="note sv-gd">${L('Świece mogą zająć kilkaset MB. Możesz przenieść dane na inny dysk: dashboard skopiuje je, sprawdzi kopię plik po pliku, przełączy się na nowy folder i uruchomi ponownie. Stary folder zostaje, usuniesz go sam.')}</p>
      <div class="sp-f">${state}${msgHtml(moveMsg)}</div>`;
  }

  function html() {
    return grp(folderHtml(), 'dane') + grp(candlesHtml(), 'swiece') + grp(sessionsHtml(), 'sesje') + grp(otherHtml(), 'inne') + grp(backupsHtml(), 'kopie') + grp(moveHtml(), 'przenies')
      + grp(`${gHead('sv-dysk-cfg', 'Konfiguracja i log')}
      <p class="note sv-gd">${L('Plik .env (token i klucze), config.local.json (ustawienia tego komputera) i dashboard.log leżą w folderze aplikacji. Nie wysyłaj nikomu pliku .env.')}</p>
      ${pathRow('Folder', path('config'), 'logs')}`, 'konfiguracja');
  }

  async function load() {
    try { disk = await getJson('/api/disk'); loadErr = ''; } catch (e) { loadErr = e.message; }
    if (ctx.isActive('dysk')) ctx.rerender();
    schedulePoll();
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    const ph = disk?.move?.phase;
    if ((ph === 'copy' || ph === 'verify') && ctx.isActive('dysk')) pollTimer = setTimeout(load, 700);
  }

  async function deleteRow() {
    const [symbol, layer] = del.key.split('|');
    const typed = root()?.querySelector('#sv-del-confirm')?.value.trim() || '';
    if (typed !== `${symbol} ${layer}`) { del.msg = { text: t('Wpisz dokładnie: {name}', { name: `${symbol} ${layer}` }), error: true }; ctx.rerender(); return; }
    del.busy = true; del.msg = null; ctx.rerender();
    try {
      const r = await postJson('/api/disk/candles/delete', { symbol, layer, confirm: typed });
      delMsg = { text: t('Usunięto {name}, zwolniono {size}.', { name: `${symbol} ${layer}`, size: fmtBytes(r.bytes) }), error: false };
      del = null;
    } catch (e) { del.busy = false; del.msg = { text: e.message, error: true }; }
    await load();
  }
  async function moveCheck() {
    const target = root()?.querySelector('#sv-move-path')?.value.trim() || '';
    check = { busy: true }; moveMsg = null; ctx.rerender();
    try { check = { ...(await postJson('/api/disk/move', { target, dryRun: true })), ok: true }; }
    catch (e) { check = null; moveMsg = { text: e.message, error: true }; }
    ctx.rerender();
  }
  async function moveStart() {
    if (!check?.ok || moving) return;
    moving = true; moveMsg = null; ctx.rerender();
    try { await postJson('/api/disk/move', { target: check.target, confirm: true }); check = null; }
    catch (e) { moveMsg = { text: e.message, error: true }; }
    finally { moving = false; }
    await load();
  }
  async function moveCancel() {
    try { await postJson('/api/disk/move/cancel', {}); } catch (e) { moveMsg = { text: e.message, error: true }; }
    await load();
  }
  function moveSwitch() {
    ctx.restartVia(async () => {
      try { return await postJson('/api/disk/move/switch', {}); } catch (e) { await load(); throw e; }
    });
  }

  function handle(act, v) {
    switch (act) {
      case 'dysk-del': del = { key: String(v), busy: false, msg: null }; delMsg = null; ctx.rerender(); root()?.querySelector('#sv-del-confirm')?.focus(); return true;
      case 'dysk-del-no': { const k = del?.key; del = null; ctx.rerender(); if (k) root()?.querySelector(`[data-fk="dysk-del-${k}"]`)?.focus(); return true; }
      case 'dysk-del-ok': if (del && !del.busy) deleteRow(); return true;
      case 'dysk-move-check': moveCheck(); return true;
      case 'dysk-move-start': moveStart(); return true;
      case 'dysk-move-cancel': moveCancel(); return true;
      case 'dysk-move-switch': moveSwitch(); return true;
      default: return false;
    }
  }
  // Enter w polu potwierdzenia albo ścieżki = przycisk obok
  function onInput() { return false; }
  function onEscape() { if (del) { del = null; ctx.rerender(); return true; } return false; }
  return {
    id: 'dysk', html, handle, onInput, onChange: () => false, onEscape,
    enter() { load(); }, leave() { clearTimeout(pollTimer); },
    keepTyped: ['#sv-del-confirm', '#sv-move-path'],
  };
}
