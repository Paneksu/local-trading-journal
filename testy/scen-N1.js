// Scenariusz N1 na prawdziwym dashboardzie testowym (atrapa Notion z ATRAPA_DEMO=3, katalog konfiguracji bez świec i bez klucza Databento).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// Testy: testy/backtest-N1-puste.mjs. Sprawdza baner DEMO (usuwanie przez okno potwierdzenia), pusty stan wykresu bez klucza
// i Backtestu bez świec z głębokim linkiem do Ustawień → Źródła danych.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  let fatal = null;
  try {
    const T = window.__thq;
    // ---------- baner DEMO ----------
    await until(() => $('#view .page-head') && T.model);
    const ban = await until(() => $('.demo-ban'));
    rec('demo', ban, 'baner DEMO nad Statystykami');
    rec('demo', ban && /DEMO/.test(ban.textContent) && /3/.test(ban.textContent), `baner podaje liczbę wpisów DEMO: ${ban?.textContent.trim().slice(0, 140)}`);
    rec('demo', ban?.querySelector('[data-act="demo-remove"]') && ban?.querySelector('[data-act="add-trade"]'), 'przyciski „Usuń dane DEMO” i „Dodaj pierwszy trade”');
    const head = $('#view .page-head');
    rec('demo', ban && head && (head.compareDocumentPosition(ban) & Node.DOCUMENT_POSITION_FOLLOWING), 'baner pod nagłówkiem Statystyk');
    ban?.querySelector('[data-act="demo-remove"]').click();
    const dlg = await until(() => $('.modal[role="alertdialog"]'));
    rec('demo', dlg && /3/.test(dlg.textContent) && /kosz/i.test(dlg.textContent), `okno potwierdzenia z liczbą i koszem Notion: ${dlg?.textContent.trim().slice(0, 160)}`);
    dlg?.querySelector('[data-cd="yes"]').click();
    const gone = await until(() => T.model && !T.model.trades.some((x) => String(x.name || '').startsWith('DEMO · ')) && !$('.demo-ban'), 12000);
    rec('demo', gone, 'po usunięciu wpisy DEMO znikają z danych, a baner z ekranu');

    // ---------- wykres bez klucza Databento ----------
    const tr = T.model.trades.find((x) => (x.instrument === 'NQ' || x.instrument === 'ES') && x.time && x.typ === 'Live');
    if (tr) {
      T.openDetail([tr], tr.id, document.body);
      const btn = await until(() => [...document.querySelectorAll('[data-swc="settings"]')].find((b) => b.offsetParent), 12000);
      rec('wykres', btn && /Połącz Databento/.test(btn.textContent), `pusty stan wykresu: przycisk „Połącz Databento” (${btn?.textContent.trim()})`);
      const box = btn?.closest('.swc-state, .swc-st, div');
      rec('wykres', box && /własnym kluczem/.test(box.textContent), `pusty stan mówi, skąd są świece: ${box?.textContent.trim().slice(0, 160)}`);
      btn?.click();
      const key = await until(() => $('.sp #sp-dbkey'));
      rec('wykres', key && !document.querySelector('.lb.open, .lb[aria-hidden="false"]'), 'przycisk otwiera Ustawienia z polem klucza Databento i zamyka podgląd');
      rec('wykres', /^#ustawienia\/zrodla/.test(location.hash), `głęboki link w adresie: ${location.hash}`);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await until(() => !$('.sp'));
      rec('wykres', !$('.sp') && !/^#ustawienia/.test(location.hash), 'Esc zamyka Ustawienia i czyści adres');
    } else rec('wykres', false, 'brak trade\'a NQ/ES z godziną w atrapie');

    // ---------- głęboki link wpisany w adres ----------
    location.hash = '#ustawienia/zrodla/databento';
    const k2 = await until(() => $('.sp #sp-dbkey'));
    rec('link', k2, 'adres #ustawienia/zrodla/databento otwiera Ustawienia z kluczem Databento');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => !$('.sp'));

    // ---------- Backtest bez świec ----------
    document.querySelector('[data-act="view"][data-v="backtest"]')?.click();
    const empty = await until(() => $('.bt-view .bt-nodata'), 12000);
    rec('backtest', empty && /świec/.test(empty.textContent), `lista sesji bez świec: ${empty?.textContent.trim().slice(0, 200)}`);
    const a = empty?.querySelector('a[href="#ustawienia/zrodla/databento"]');
    rec('backtest', a && /Połącz Databento/.test(a.textContent), 'link „Połącz Databento” do Ustawień → Źródła danych');
    rec('backtest', empty?.querySelector('a[href="#ustawienia/zrodla/import"]'), 'link do instrukcji importu historii');
    a?.click();
    rec('backtest', await until(() => $('.sp #sp-dbkey')), 'klik w link otwiera Ustawienia z kluczem Databento');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => !$('.sp'));
    // final (ocena wyglądu P3, zastępuje „kreator: brak świec z linkiem”): bez świec „Nowa sesja” jest nieaktywna, a powodem jest karta z linkiem
    const nb = await until(() => document.querySelector('.bt-view .sec-h [data-bt="new"]'));
    const why = nb && document.getElementById(nb.getAttribute('aria-describedby') || '-');
    rec('backtest', nb?.disabled && why && /świec/.test(why.textContent) && /Źródła danych/.test(nb.title), `„Nowa sesja” nieaktywna z powodem (${nb?.disabled}, ${why?.textContent.slice(0, 40)})`);
  } catch (e) { fatal = String(e && e.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
