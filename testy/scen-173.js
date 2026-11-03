// Scenariusz 1.7-3 na prawdziwym dashboardzie testowym (atrapa Notion po migracjach, katalog konfiguracji tymczasowy, bez kluczy Databento/FRED/Finnhub).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// Testy: testy/backtest-173-strona.mjs. Ustawienia → Backtest → Presety zleceń (lista, edytor z walidacją, kolejność, usunięcie aktywnego, offset auto BE, blok ustawień w Notion)
// oraz dziennik: pole „BE” w formularzu trade'a z opisem i linia BE na rysunku pozycji.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sp = () => $('.sp');
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const posts = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    if ((o.method || 'GET') === 'POST') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } posts.push({ url: String(u), body }); }
    return of(u, o);
  };
  const T = window.__thq;
  const setIn = async (sel, v) => { const el = $(`.sp ${sel}`); el.value = v; fire(el, 'change'); await sleep(60); return el; };
  const click = async (sel) => { const el = $(`.sp ${sel}`); el.click(); await sleep(80); };
  const rows = () => $$('.sp .bt-pr');
  const names = () => rows().map((r) => r.querySelector('.bt-pr-n').textContent);
  const errs = () => $$('.sp .bt-perr').map((e) => norm(e.textContent));
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    try { localStorage.removeItem('thq.ust.sekcja.v1'); } catch { /* brak */ }
    T.ust.open('backtest');
    await until(() => sp() && sp().querySelector('[data-fk="tab-backtest"][aria-selected="true"]') && $('#sv-g-presety'));

    // ---------- lista ----------
    const g = $('#sv-g-presety');
    rec('lista', !!g && /Presety zleceń/.test(g.querySelector('h3').textContent), 'grupa „Presety zleceń” w Ustawieniach → Backtest');
    rec('lista', g.querySelector('.bt-pl .note')?.textContent.startsWith('Brak presetów'), 'pusta lista ma wskazówkę');
    rec('lista', !$('.sp [data-act="bt-padd"]').disabled, 'Dodaj preset aktywny');
    rec('lista', $('.sp [data-btd="beOffset"]').value === '0' && /domyślny offset/.test(g.textContent), 'osobne pole „Auto BE: domyślny offset (ticki)” = 0');
    // zapis presetu z innego miejsca (panel zleceń) nie ginie po edycji innego pola Ustawień: btCommit bierze presety z ustawień, nie ze szkicu
    T.settings.bt = { ...T.settings.bt, presets: [{ id: 'pwstep', name: 'Z panelu', sl: { unit: 'pts', value: 8 }, tps: [], size: { mode: 'qty', value: 1 }, autoBe: null }] };
    const spd = $('.sp [data-btd="speed"]'); spd.value = '300'; fire(spd, 'change'); await sleep(80);
    rec('lista', T.settings.bt.presets.length === 1 && T.settings.bt.presets[0].id === 'pwstep' && T.settings.bt.speed === 300, 'edycja szybkości nie nadpisuje presetów zapisanych w panelu zleceń (stary szkic)');
    rec('lista', names().join('|') === 'Z panelu' && norm(rows()[0].querySelector('.bt-pr-s').textContent).startsWith('SL 8 pkt'), `lista pokazuje preset z panelu: «${rows()[0]?.querySelector('.bt-pr-s').textContent}»`);
    // posprzątanie przed scenariuszem edytora
    await click('[data-act="bt-pdel"]');
    rec('lista', T.settings.bt.presets.length === 0 && rows().length === 0, '× usuwa preset z listy i z ustawień');

    // ---------- edytor z walidacją przy polu ----------
    await click('[data-act="bt-padd"]');
    // wyrównanie: nazwa, selekty i pola wartości w wspólnych kolumnach, pola Auto BE z widocznymi podpisami „Próg” i „+ ticki”
    rec('edytor', (() => { const L = (s) => Math.round($(`.sp ${s}`).getBoundingClientRect().left); return L('[data-btp="name"]') === L('[data-btp="slUnit"]') && L('[data-btp="slUnit"]') === L('[data-btp="tpUnit"]') && L('[data-btp="tpUnit"]') === L('[data-btp="sizeMode"]') && L('[data-btp="sizeMode"]') === L('[data-btp="abeKind"]') && L('[data-btp="slVal"]') === L('[data-btp="tpVal"]'); })(), 'lewa krawędź pól edytora wyrównana');
    await setIn('[data-btp="abeKind"]', 'pts');
    rec('edytor', $$('.sp .bt-ped .lbl').map((e) => norm(e.textContent)).join('|') === 'Próg|+ ticki', `podpisy pól auto BE: ${$$('.sp .bt-ped .lbl').map((e) => norm(e.textContent)).join('|')}`);
    await click('[data-act="bt-pcancel"]'); await click('[data-act="bt-padd"]');
    rec('edytor', !!$('.sp .bt-ped') && document.activeElement?.dataset?.fk === 'btp-name' && $('.sp [data-act="bt-padd"]').disabled, 'edytor otwarty, fokus w nazwie, Dodaj preset nieaktywny w trakcie edycji');
    await click('[data-act="bt-psave"]');
    rec('edytor', errs().includes('Wpisz nazwę presetu.') && T.settings.bt.presets.length === 0, `pusta nazwa: ${errs().join(' | ')}`);
    rec('edytor', $('.sp [data-btp="name"]').getAttribute('aria-invalid') === 'true', 'pole nazwy oznaczone aria-invalid');
    await setIn('[data-btp="name"]', 'Runner');
    // bez SL: TP w R:R, wielkość z ryzyka i auto BE w R mają powody przy swoich polach
    await setIn('[data-btp="tpVal"]', '3');
    await setIn('[data-btp="abeKind"]', 'r');
    await setIn('[data-btp="abeVal"]', '1');
    await click('[data-act="bt-psave"]');
    rec('edytor', errs().includes('TP w R:R wymaga SL.') && errs().includes('Wielkość z ryzyka wymaga SL.') && errs().includes('Auto BE w R wymaga SL.'), `bez SL: ${errs().join(' | ')}`);
    rec('edytor', T.settings.bt.presets.length === 0, 'preset z błędami nie zapisuje się');
    await setIn('[data-btp="slVal"]', '15');
    rec('edytor', errs().length === 0, `po wpisaniu SL błędów brak (${errs().join(' | ')})`);
    // zła liczba SL, zła ilość, zły offset
    await setIn('[data-btp="slVal"]', 'abc');
    rec('edytor', errs().includes('Wpisz liczbę większą od zera albo zostaw puste (bez SL).'), `zła liczba SL: ${errs().join(' | ')}`);
    await setIn('[data-btp="slVal"]', '15');
    await setIn('[data-btp="sizeMode"]', 'qty');
    await setIn('[data-btp="sizeVal"]', '2.5');
    rec('edytor', errs().includes('Ilość musi być liczbą całkowitą.'), `ilość 2,5: ${errs().join(' | ')}`);
    await setIn('[data-btp="sizeVal"]', '2');
    await setIn('[data-btp="abeOff"]', '25');
    rec('edytor', errs().includes('Offset: liczba ticków od 0 do 20.'), `offset 25: ${errs().join(' | ')}`);
    await setIn('[data-btp="abeOff"]', '2');
    rec('edytor', errs().length === 0, `wszystko poprawne (${errs().join(' | ')})`);
    await click('[data-act="bt-psave"]');
    const p0 = T.settings.bt.presets[0];
    rec('edytor', T.settings.bt.presets.length === 1 && p0.name === 'Runner' && JSON.stringify(p0.sl) === '{"unit":"pts","value":15}' && JSON.stringify(p0.tps) === '[{"unit":"rr","value":3,"pct":100}]' && JSON.stringify(p0.size) === '{"mode":"qty","value":2}' && JSON.stringify(p0.autoBe) === '{"kind":"r","value":1,"offsetTicks":2}', `zapisany preset: ${JSON.stringify(p0)}`);
    rec('edytor', !$('.sp .bt-ped') && names().join('|') === 'Runner', 'edytor zamknięty, preset na liście');
    rec('edytor', norm(rows()[0].querySelector('.bt-pr-s').textContent) === 'SL 15 pkt · TP 3R · 2 kontrakty · auto BE 1R +2t', `skrót opisu: «${rows()[0].querySelector('.bt-pr-s').textContent}»`);
    // edycja istniejącego: Edytuj otwiera wartości, nazwa zajęta przez inny preset daje powód
    await click('[data-act="bt-padd"]');
    await setIn('[data-btp="name"]', 'runner');
    await setIn('[data-btp="slVal"]', '10');
    await setIn('[data-btp="sizeMode"]', 'session');
    await click('[data-act="bt-psave"]');
    rec('edytor', errs().includes('Preset o tej nazwie już jest.') && T.settings.bt.presets.length === 1, `duplikat nazwy: ${errs().join(' | ')}`);
    await setIn('[data-btp="name"]', 'Scalp');
    await setIn('[data-btp="tpUnit"]', 'rr'); await setIn('[data-btp="tpVal"]', '2');
    await click('[data-act="bt-psave"]');
    rec('edytor', T.settings.bt.presets.length === 2 && T.settings.bt.presets[1].name === 'Scalp' && T.settings.bt.presets[1].autoBe === null && T.settings.bt.presets[1].size.mode === 'session', `drugi preset: ${JSON.stringify(T.settings.bt.presets[1])}`);
    rec('edytor', norm(rows()[1].querySelector('.bt-pr-s').textContent) === 'SL 10 pkt · TP 2R · ryzyko sesji', `skrót opisu: «${rows()[1].querySelector('.bt-pr-s').textContent}»`);
    await click('[data-act="bt-pedit"][data-v="0"]');
    rec('edytor', $('.sp [data-btp="name"]').value === 'Runner' && $('.sp [data-btp="slVal"]').value === '15' && $('.sp [data-btp="abeKind"]').value === 'r' && $('.sp [data-btp="abeOff"]').value === '2', 'Edytuj wypełnia pola wartościami presetu');
    await setIn('[data-btp="slVal"]', '12');
    await click('[data-act="bt-psave"]');
    rec('edytor', T.settings.bt.presets[0].sl.value === 12 && T.settings.bt.presets[0].id === p0.id && T.settings.bt.presets.length === 2, 'zapis edycji zachowuje id i liczbę presetów');
    await click('[data-act="bt-padd"]'); await click('[data-act="bt-pcancel"]');
    rec('edytor', !$('.sp .bt-ped') && T.settings.bt.presets.length === 2, 'Anuluj zamyka edytor bez zmian');

    // ---------- kolejność: ↑/↓ z klawiatury i przeciąganie ----------
    await click('[data-act="bt-padd"]');
    await setIn('[data-btp="name"]', 'Swing'); await setIn('[data-btp="slVal"]', '40'); await setIn('[data-btp="slUnit"]', 'ticks'); await setIn('[data-btp="sizeMode"]', 'usd'); await setIn('[data-btp="sizeVal"]', '250');
    await click('[data-act="bt-psave"]');
    rec('kolejnosc', names().join('|') === 'Runner|Scalp|Swing' && norm(rows()[2].querySelector('.bt-pr-s').textContent) === 'SL 40 ticki · ryzyko 250 $', `trzy presety: ${names().join('|')} («${rows()[2]?.querySelector('.bt-pr-s').textContent}»)`);
    rec('kolejnosc', $('.sp [data-act="bt-pup"][data-v="0"]').disabled && $('.sp [data-act="bt-pdown"][data-v="2"]').disabled, '↑ na pierwszym i ↓ na ostatnim nieaktywne');
    await click('[data-act="bt-pdown"][data-v="0"]');
    rec('kolejnosc', names().join('|') === 'Scalp|Runner|Swing' && T.settings.bt.presets.map((x) => x.name).join('|') === 'Scalp|Runner|Swing' && document.activeElement?.dataset?.fk === 'btpr-1-down', `↓ przesuwa w ustawieniach, fokus idzie za przyciskiem (${document.activeElement?.dataset?.fk})`);
    await click('[data-act="bt-pup"][data-v="2"]');
    rec('kolejnosc', names().join('|') === 'Scalp|Swing|Runner', `↑ na trzecim: ${names().join('|')}`);
    // przeciąganie: wiersz 3 (Runner) na miejsce wiersza 1
    const dt = new DataTransfer();
    const ev = (type, el) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    ev('dragstart', rows()[2]); ev('dragover', rows()[0]); ev('drop', rows()[0]); ev('dragend', rows()[2]); await sleep(100);
    rec('kolejnosc', names().join('|') === 'Runner|Scalp|Swing' && T.settings.bt.presets.map((x) => x.name).join('|') === 'Runner|Scalp|Swing', `przeciągnięcie wiersza 3 na 1: ${names().join('|')}`);
    rec('kolejnosc', rows().every((r) => r.getAttribute('draggable') === 'true'), 'wiersze można przeciągać');

    // ---------- aktywny preset i blok ustawień w Notion ----------
    T.settings.bt = { ...T.settings.bt, activePreset: T.settings.bt.presets[1].id };
    const activeId = T.settings.bt.activePreset;
    await click('[data-act="bt-pdel"][data-v="1"]');
    rec('aktywny', T.settings.bt.activePreset === null && T.settings.bt.presets.length === 2, 'usunięcie aktywnego presetu przywraca „Brak” (activePreset null)');
    const sync = await until(() => posts.filter((p) => /\/api\/sync$/.test(p.url) && (p.body?.settings?.bt?.presets || []).length === 2).pop(), 6000);
    const sb = sync?.body?.settings?.bt;
    rec('aktywny', !!sb && JSON.stringify(sb.presets) === JSON.stringify(T.settings.bt.presets), `blok ustawień w Notion (POST /api/sync) niesie presety bez wycięcia (${(sb?.presets || []).map((x) => x.name).join(', ')})`);
    rec('aktywny', !!sb && sb.presets[1].size.mode === 'usd' && sb.presets[1].sl.unit === 'ticks' && !/"key"|hotkey/.test(JSON.stringify(sb.presets)), 'pola presetów (jednostki, tryby) przeszły sanitizeSettings, bez kluczy sekretów');

    // ---------- offset auto BE ----------
    await setIn('[data-btd="beOffset"]', '3');
    rec('offset', T.settings.bt.beOffset === 3, `offset 3 zapisany (${T.settings.bt.beOffset})`);
    await setIn('[data-btd="beOffset"]', '25');
    rec('offset', T.settings.bt.beOffset === 3 && /od 0 do 20/.test($('.sp .bt-smsg')?.textContent || ''), `offset 25 odrzucony z powodem («${$('.sp .bt-smsg')?.textContent}»), zostaje ${T.settings.bt.beOffset}`);
    rec('offset', T.settings.bt.presets.length === 2, 'zmiana offsetu nie rusza presetów');
    T.ust.close?.();
    await sleep(100);

    // ---------- dziennik: pole „BE” w formularzu trade'a i linia BE na rysunku pozycji ----------
    const add = $('[data-act="add-trade"]');
    if (add) { add.click(); await until(() => $('#f-entryPrice')); }
    const beIn = $('#f-be');
    rec('dziennik', !!beIn && beIn.getBoundingClientRect().width > 20 && beIn.offsetParent !== null, 'formularz trade\'a ma widoczne pole „BE” (migracja 004)');
    const lbl = $('.fld[data-f="be"] label');
    rec('dziennik', lbl?.textContent.trim() === 'BE', `etykieta pola: «${lbl?.textContent.trim()}»`);
    const hint = $('.fld[data-f="be"] .fhint');
    rec('dziennik', !!hint && norm(hint.textContent) === 'Cena, przy której trade jest bez ryzyka' && beIn?.getAttribute('aria-describedby')?.split(' ').includes(hint.id), `opis pola: «${hint?.textContent}» (powiązany aria-describedby: ${beIn?.getAttribute('aria-describedby')})`);
    // linia BE na rysunku pozycji (ta sama geometria co w Journalu Backtestu)
    const G = await import('/js/geometria.js');
    const s = { x: (i) => i * 10, y: (p) => 1000 - p, spacing: 10, decimal: ',', canvasMeasure: () => 50 };
    const ex = G.positionExtras({ style: { beLevel: 1.5 } }, s, { x1: 0, x2: 200, entry: 100, dir: 1, stop: 1, profit: 3, yE: 900, yT: 897 });
    const line = ex.find((x) => x.role === 'be'), label = ex.find((x) => x.role === 'be-label');
    rec('dziennik', !!line && line.price === 101.5 && line.y1 === 898.5 && line.x2 - line.x1 === 200, `linia BE na szerokości pozycji, cena ${line?.price}`);
    // wąska pozycja (trade 1–2 świece): linia BE ma co najmniej 40 px, a podpis stoi przy jej LEWYM końcu (runda 4: prawy koniec leży pod plakietką progu BE)
    const ex2 = G.positionExtras({ style: { beLevel: 1.5 } }, s, { x1: 100, x2: 110, entry: 100, dir: 1, stop: 1, profit: 3, yE: 900, yT: 897 });
    const l2 = ex2.find((x) => x.role === 'be'), lb2 = ex2.find((x) => x.role === 'be-label');
    rec('dziennik', l2.x2 - l2.x1 >= 40 && lb2.x === 100 + 3 && lb2.anchor === 'start', `wąska pozycja: linia BE ${l2.x2 - l2.x1} px, podpis x ${lb2.x} (${lb2.anchor})`);
    rec('dziennik', !!label && label.text === 'BE' && label.anchor === 'end' && label.y < line.y1, `podpis „BE” nad linią po prawej («${label?.text}», ${label?.anchor})`);
  } catch (e) { fatal = String(e && e.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
