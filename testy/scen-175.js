// Scenariusz 1.7-5 na prawdziwym dashboardzie testowym (atrapa Notion po migracjach, katalog konfiguracji tymczasowy, bez kluczy Databento/FRED/Finnhub).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// Testy: testy/backtest-175-strona.mjs. Ustawienia → Backtest → Presety zleceń z listą TP: „+ TP” dzieli procenty po równo, ostatni poziom to „reszta”, walidacja kolejności i procentów przy polu,
// usuwanie poziomu, limit 4, zapis do ustawień z procentami i opis „TP 1R 50% / 3R” na liście.
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
  const T = window.__thq;
  const setIn = async (sel, v) => { const el = $(`.sp ${sel}`); el.value = v; fire(el, 'change'); await sleep(70); return el; };
  const click = async (sel) => { const el = $(`.sp ${sel}`); el.click(); await sleep(90); };
  const rows = () => $$('.sp .bt-tpr');
  const errs = () => $$('.sp .bt-perr').map((e) => norm(e.textContent));
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    try { localStorage.removeItem('thq.ust.sekcja.v1'); } catch { /* brak */ }
    T.ust.open('backtest');
    await until(() => sp() && sp().querySelector('[data-fk="tab-backtest"][aria-selected="true"]') && $('#sv-g-presety'));
    // posprzątanie: lista bez presetów
    T.settings.bt = { ...T.settings.bt, presets: [] };
    T.ust.open('backtest'); await sleep(150);

    await click('[data-act="bt-padd"]');
    rec('edytor', rows().length === 1 && !!$('.sp [data-btp="tpUnit"]') && !!$('.sp [data-act="bt-tpadd"]') && !$('.sp [data-btp="tpPct"]'), `nowy preset: jeden wiersz TP, + TP widoczne, bez pola procentu (wierszy ${rows().length})`);
    await setIn('[data-btp="name"]', 'Drabina');
    await setIn('[data-btp="slVal"]', '10');
    await setIn('[data-btp="tpVal"]', '1');
    await click('[data-act="bt-tpadd"]');
    rec('edytor', rows().length === 2 && $('.sp [data-btp="tpPct"]').value === '50' && norm(rows()[1].textContent).includes('reszta') && $('.sp [data-btp="tpUnit:1"]').value === $('.sp [data-btp="tpUnit"]').value, `+ TP: dwa wiersze, procent TP1 ${$('.sp [data-btp="tpPct"]')?.value}%, ostatni „reszta”, jednostka z poprzedniego`);
    await setIn('[data-btp="tpVal:1"]', '3');
    await click('[data-act="bt-tpadd"]');
    rec('edytor', rows().length === 3 && $('.sp [data-btp="tpPct"]').value === '33' && $('.sp [data-btp="tpPct:1"]').value === '33', `trzeci wiersz: procenty ${$('.sp [data-btp="tpPct"]')?.value}/${$('.sp [data-btp="tpPct:1"]')?.value}/reszta`);
    // usunięcie środkowego wiersza oddaje jego procent ostatniemu (zostaje TP1 33%, ostatni resztą)
    await setIn('[data-btp="tpVal:2"]', '6');
    await click('[data-act="bt-tprm"][data-v="1"]');
    rec('edytor', rows().length === 2 && $('.sp [data-btp="tpVal"]').value === '1' && $('.sp [data-btp="tpVal:1"]').value === '6', `po usunięciu TP2: wartości ${$('.sp [data-btp="tpVal"]')?.value}/${$('.sp [data-btp="tpVal:1"]')?.value}`);
    await setIn('[data-btp="tpPct"]', '50');
    rec('edytor', !$('.sp [data-act="bt-tprm"][data-v="0"]'), 'pierwszy wiersz nie ma ×');
    // walidacja z powodem przy polu: TP2 bliżej niż TP1 (0,5R < 1R), potem procent 100 (suma ≥ 100)
    await setIn('[data-btp="tpVal:1"]', '0.5');
    await click('[data-act="bt-psave"]');
    rec('edytor', errs().some((e) => e === 'TP2 bliżej niż TP1.') && $('.sp [data-btp="tpVal"]').getAttribute('aria-invalid') === 'true', `TP2 bliżej niż TP1: ${errs().join(' | ')}`);
    await setIn('[data-btp="tpVal:1"]', '6');
    await setIn('[data-btp="tpPct"]', '100');
    await click('[data-act="bt-psave"]');
    rec('edytor', errs().some((e) => /^Procenty TP/.test(e)) && !!$('.sp .bt-ped'), `procent 100: ${errs().join(' | ')}`);
    await setIn('[data-btp="tpPct"]', '50');
    // limit 4: cztery wiersze, + TP znika
    await click('[data-act="bt-tpadd"]'); await setIn('[data-btp="tpVal:2"]', '8');
    await click('[data-act="bt-tpadd"]'); await setIn('[data-btp="tpVal:3"]', '10');
    rec('edytor', rows().length === 4 && !$('.sp [data-act="bt-tpadd"]'), `cztery wiersze, przycisk + TP ukryty (wierszy ${rows().length})`);
    // z powrotem do dwóch (6R reszta, 1R 50%) i zapis
    await click('[data-act="bt-tprm"][data-v="3"]'); await click('[data-act="bt-tprm"][data-v="2"]');
    await setIn('[data-btp="tpPct"]', '50');
    await click('[data-act="bt-psave"]');
    const p = T.settings.bt.presets[0];
    rec('edytor', T.settings.bt.presets.length === 1 && p.tps.length === 2 && p.tps[0].pct === 50 && p.tps[1].pct === 50 && p.tps[0].value === 1 && p.tps[1].value === 6 && p.tps.every((x) => x.unit === 'rr'), `zapis do ustawień: ${JSON.stringify(p?.tps)}`);
    rec('edytor', !$('.sp .bt-ped'), 'edytor zamknięty po zapisie');
    const sum = norm($('.sp .bt-pr .bt-pr-s')?.textContent || '');
    rec('edytor', sum.includes('TP 1R 50% / 6R'), `opis na liście: «${sum}»`);
    // ponowne otwarcie: wiersze z presetu
    await click('[data-act="bt-pedit"]');
    rec('edytor', rows().length === 2 && $('.sp [data-btp="tpVal"]').value === '1' && $('.sp [data-btp="tpPct"]').value === '50' && $('.sp [data-btp="tpVal:1"]').value === '6', 'edycja wypełnia wiersze z presetu');
    await click('[data-act="bt-pcancel"]');
    await click('[data-act="bt-pdel"]');
  } catch (e) { fatal = String(e && e.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
