// Scenariusz odbioru 1.7.0 „strefa czasu NY” na prawdziwym dashboardzie testowym (atrapa Notion, katalog konfiguracji tymczasowy).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// Testy: testy/backtest-odbior-strefa.mjs, zrzuty: testy/zrzuty-odbior-strefa.mjs (gdy jest most CDP, window.__shot).
// Formularz „Dodaj trade”: etykiety godzin z „NY”, wpis 10:30 i wyjście 11:05, zapis do atrapy; lista trade'ów z nagłówkiem „Data NY”; Ustawienia → Wykresy → Strefa czasu;
// Ustawienia → Kopie i diagnostyka → Strefa starych wpisów: podgląd (liczby, przykład), poprawa po kopii i wynik.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const T = window.__thq;
  let shotId = 0;
  const shot = async (name) => {
    if (typeof window.__shot !== 'function') return;
    const id = ++shotId;
    await sleep(200);
    window.__shot(JSON.stringify({ id, name: `${name}-${document.documentElement.dataset.theme || 'onyx'}-1920` }));
    await until(() => window.__done?.[id], 10000);
  };
  let fatal = null, skipRow, momRow, skipId, momId, skipBefore, momBefore;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    rec('strefa', T.settings.chartTz === '', `domyślne ustawienie strefy jest puste (${JSON.stringify(T.settings.chartTz)})`);
    T.state.view = 'trades'; T.renderAll(); await sleep(300);
    const th = norm($('th [data-act="sort"][data-v="date"]')?.textContent || '');
    rec('lista', /^Data NY/.test(th), `nagłówek kolumny daty z podpisem strefy («${th}»)`);
    await shot('lista-trade-ow');
    T.form.open(null, null);
    await until(() => $('#trade-form #f-time'));
    const lblT = norm($('label[for="f-time"]')?.textContent), lblX = norm($('label[for="f-exitTime"]')?.textContent);
    rec('formularz', /Godzina wejścia NY$/.test(lblT), `etykieta godziny wejścia: «${lblT}»`);
    rec('formularz', /Godzina wyjścia NY$/.test(lblX), `etykieta godziny wyjścia: «${lblX}»`);
    const today = $('#f-date').value;
    rec('formularz', /^\d{4}-\d{2}-\d{2}$/.test(today) || today.length > 5, `data wejścia podpowiedziana: «${today}»`);
    const set = async (sel, v) => { const el = $(sel); el.value = v; fire(el, 'input'); fire(el, 'change'); await sleep(40); };
    await set('#f-name', 'Strefa NY e2e');
    await set('#f-date', '2026-10-30');
    await set('#f-time', '10:30');
    await set('#f-exitDate', '2026-10-30');
    await set('#f-exitTime', '11:05');
    await shot('formularz-ny');
    $('#f-save').click();
    const closed = await until(() => !$('#trade-form'), 12000);
    rec('zapis', !!closed, 'formularz zamknął się po zapisie (bez błędu walidacji)');
    await T.load(true);
    await sleep(300);
    const row = T.model.trades.find((x) => x.name === 'Strefa NY e2e');
    rec('model', !!row, 'nowy trade w modelu po odświeżeniu z atrapy');
    rec('model', row && row.time === '10:30' && row.date === '2026-10-30', `model: ${row?.date} ${row?.time} (oczekiwane 2026-10-30 10:30 w NY)`);
    rec('model', row && row.exitTime === '11:05', `wyjście ${row?.exitTime}`);
    rec('model', row && row.dur === 35, `czas trwania ${row?.dur} min`);
    // stare wpisy z atrapy (strefa Europe/Warsaw) są widoczne w NY jako wcześniejsze godziny (10:30 → 05:30), dlatego jest „Popraw strefę”
    const old = T.model.trades.find((x) => x.time && x.name !== 'Strefa NY e2e' && !x.name.startsWith('DEMO'));
    rec('model', !!old, 'atrapa ma stare wpisy z godziną');

    // Ustawienia → Wykresy: pole Strefa czasu
    T.ust.open('wykresy');
    await until(() => $('#sp-tz'));
    const lab = norm($('label[for="sp-tz"]')?.textContent || '');
    rec('ustawienia', lab === 'Strefa czasu' && $('#sp-tz').value === '' && /Nowy Jork/.test($('#sp-tz').selectedOptions[0].textContent), `pole strefy: «${lab}», domyślna «${$('#sp-tz').selectedOptions[0]?.textContent}»`);
    $('#sp-tz').scrollIntoView({ block: 'center' });
    await shot('ustawienia-strefa-czasu');

    // Ustawienia → Kopie i diagnostyka → Strefa starych wpisów
    T.ust.open('diag');
    await until(() => $('[data-act="tz-preview"]') && !$('[data-act="tz-preview"]').disabled);
    $('#sv-g-strefa').scrollIntoView({ block: 'start' });
    await shot('strefa-starych-wpisow');
    $('[data-act="tz-preview"]').click();
    const pv = await until(() => $('[data-act="tz-apply"]'), 15000);
    rec('poprawa', !!pv, 'podgląd poprawy pokazuje przycisk „Popraw”');
    const pvTxt = norm($('#sv-g-strefa')?.textContent || '');
    rec('poprawa', /Poprawa zmieni strefę w \d+ wpis/.test(pvTxt) && /Przykład: \d{4}-\d\d-\d\d \d\d:\d\d → \d{4}-\d\d-\d\d \d\d:\d\d America\/New_York/.test(pvTxt) && /Ten sam moment przeliczony na NY \(wpisy DEMO\): 2 wpisów/.test(pvTxt), `podgląd: liczba wpisów i przykład («${pvTxt.slice(0, 260)}»)`);
    rec('poprawa', /Bez zmian:/.test(pvTxt), 'podgląd podaje, co zostaje bez zmian (daty bez godziny)');
    $('#sv-g-strefa').scrollIntoView({ block: 'start' });
    // lista wpisów z wyborem na wpis (decyzja 3.11.2026 «Odznaczanie w podglądzie (Recommended)»)
    const nPv = Number((pvTxt.match(/Poprawa zmieni strefę w (\d+) wpis/) || [])[1]);
    const rows = [...document.querySelectorAll('#sv-g-strefa .sv-tz-list tbody tr')];
    rec('lista-wpisow', rows.length === nPv && nPv > 3, `lista ma wiersz na każdy wpis (${rows.length} z ${nPv})`);
    const list = $('#sv-g-strefa .sv-tz-list');
    const cs = list && getComputedStyle(list), th0 = list?.querySelector('thead th');
    rec('lista-wpisow', !!list && (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && getComputedStyle(th0).position === 'sticky', 'lista przewija się, nagłówek przyklejony');
    rec('lista-wpisow', rows.every((r) => /^\d{4}-\d\d-\d\d$/.test(r.cells[0].textContent) && /^\d\d:\d\d [+-]\d\d:\d\d/.test(r.cells[1].textContent) && r.querySelector('select[data-tzc]')), 'wiersz: data, godzina z przesunięciem, wybór');
    const selOf = (r) => r.querySelector('select[data-tzc]');
    const cnt = () => norm($('#sv-tz-cnt')?.textContent || '');
    const nDemo = rows.filter((r) => /^DEMO/.test(r.cells[2].textContent)).length;
    rec('lista-wpisow', nDemo === 2 && rows.filter((r) => /^DEMO/.test(r.cells[2].textContent)).every((r) => selOf(r).value === 'moment') && rows.filter((r) => !/^DEMO/.test(r.cells[2].textContent)).every((r) => selOf(r).value === 'clock'), `domyślnie DEMO „ten sam moment” (${nDemo}), reszta „ta sama godzina NY”`);
    rec('lista-wpisow', cnt() === `Ta sama godzina NY: ${nPv - 2} · Ten sam moment: 2 · Pomiń: 0`, `liczniki grup («${cnt()}»)`);
    // zbiorcze wybory i powrót do domyślnych
    $('[data-act="tz-all"][data-v="skip"]').click(); await sleep(100);
    rec('lista-wpisow', cnt() === `Ta sama godzina NY: 0 · Ten sam moment: 0 · Pomiń: ${nPv}` && [...document.querySelectorAll('#sv-g-strefa select[data-tzc]')].every((x) => x.value === 'skip'), `„pomiń wszystkie” («${cnt()}»)`);
    $('[data-act="tz-all"][data-v="reset"]').click(); await sleep(100);
    rec('lista-wpisow', cnt() === `Ta sama godzina NY: ${nPv - 2} · Ten sam moment: 2 · Pomiń: 0`, 'domyślne przywraca wybory');
    // sortowanie po dacie odwraca kolejność
    const first0 = $('#sv-g-strefa .sv-tz-list tbody tr')?.dataset.tzr;
    $('[data-act="tz-sort"]').click(); await sleep(100);
    rec('lista-wpisow', $('#sv-g-strefa .sv-tz-list tbody tr')?.dataset.tzr !== first0, 'sortowanie po dacie zmienia kolejność');
    $('[data-act="tz-sort"]').click(); await sleep(100);
    // pojedyncze wybory: jeden wpis pomijamy (nie ten, którego godzinę sprawdzamy po poprawie), jeden zwykły dostaje „ten sam moment”
    const rowsNow = [...document.querySelectorAll('#sv-g-strefa .sv-tz-list tbody tr')];
    const plainRows = rowsNow.filter((r) => !/^DEMO/.test(r.cells[2].textContent) && r.dataset.tzr !== old?.id);
    skipRow = plainRows[0]; momRow = plainRows[1];
    for (const [r, v] of [[skipRow, 'skip'], [momRow, 'moment']]) { const x = selOf(r); x.value = v; fire(x, 'change'); }
    await sleep(100);
    rec('lista-wpisow', cnt() === `Ta sama godzina NY: ${nPv - 4} · Ten sam moment: 3 · Pomiń: 1` && skipRow.cells[3].textContent === '–' && momRow.cells[3].textContent !== skipRow.cells[3].textContent, `pojedyncze wybory aktualizują liczniki i kolumnę „Po poprawie” («${cnt()}»)`);
    skipId = skipRow.dataset.tzr; momId = momRow.dataset.tzr;
    skipBefore = T.model.trades.find((x) => x.id === skipId)?.time; momBefore = T.model.trades.find((x) => x.id === momId)?.time;
    list.scrollTop = 40; await sleep(50);
    await shot('strefa-podglad-lista');
    { const x = selOf(skipRow); x.value = 'skip'; }
    await shot('strefa-podglad');
    // zgodę wpisuje człowiek: bez „TAK” przycisk niczego nie wysyła
    $('[data-act="tz-apply"]').click(); await sleep(300);
    rec('poprawa', /Wpisz dokładnie TAK/.test($('#sv-g-strefa')?.textContent || '') && !!$('[data-act="tz-apply"]'), 'bez wpisanego TAK poprawa się nie uruchamia');
    { const c = $('#sv-tz-confirm'); c.value = 'TAK'; fire(c, 'input'); }
    $('[data-act="tz-apply"]').click();
    const done = await until(() => /Poprawiono strefę w \d+ wpis/.test($('#sv-g-strefa')?.textContent || ''), 30000);
    rec('poprawa', !!done, `wynik poprawy: «${norm($('#sv-g-strefa')?.textContent || '').slice(0, 200)}»`);
    rec('poprawa', /Kopia przed zmianą: /.test($('#sv-g-strefa')?.textContent || ''), 'wynik podaje nazwę kopii zapasowej');
    $('#sv-g-strefa').scrollIntoView({ block: 'start' });
    await shot('strefa-wynik');
    // po poprawie dashboard wczytuje dane od nowa: stare wpisy mają godziny z zegara sprzed zmiany strefy (np. 15:37 zamiast 09:37)
    await T.load(true); await sleep(400);
    const after = T.model.trades.find((x) => old && x.id === old.id);
    // wybory z listy: pominięty wpis i wpis „ten sam moment” zachowują moment (godzina w NY bez zmian), a wpisy z „ta sama godzina NY” przesuwają się
    const skipAfter = T.model.trades.find((x) => x.id === skipId)?.time, momAfter = T.model.trades.find((x) => x.id === momId)?.time;
    rec('wybor', !!skipBefore && skipAfter === skipBefore, `pominięty wpis bez zmian (${skipBefore} → ${skipAfter})`);
    rec('wybor', !!momBefore && momAfter === momBefore, `„ten sam moment”: godzina w NY ta sama (${momBefore} → ${momAfter})`);
    rec('wybor', Number((norm($('#sv-g-strefa')?.textContent || '').match(/Poprawiono strefę w (\d+) wpis/) || [])[1]) === nPv - 1, 'poprawiono wszystkie wpisy poza pominiętym');
    rec('poprawa', !!after && !!old && after.time > old.time, `po poprawie godzina starego wpisu to dawna godzina polska na zegarze NY (${old?.time} → ${after?.time})`);
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
