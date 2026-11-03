// Scenariusz usuwania trade'ów w dzienniku (okno szczegółów i formularz, Cofnij) na prawdziwym dashboardzie testowym z atrapą Notion.
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }. Decyzja 2026-11-02: Cofnij także z Ctrl+Z.
(async () => {
  const checks = [];
  const rec = (cond, msg) => checks.push({ tag: 'usun-dziennik', ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 10000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(40); } return null; };
  const $ = (s) => document.querySelector(s);
  const T = window.__thq;
  const key = (target, init) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  const dlg = () => $('.scrim .modal[role="alertdialog"]');
  const toastEl = () => { const t = document.getElementById('toast'); return t && !t.hidden ? t : null; };
  const has = (id) => T.model.trades.some((x) => x.id === id);
  const serverHas = async (id) => (await (await fetch('/api/data?refresh=1')).json()).data.trades.some((x) => x._id === id);
  const confirmText = async () => { await until(() => dlg()); return (dlg()?.textContent || '').replace(/\s+/g, ' '); };
  let fatal = null;
  try {
    await until(() => T?.model && T.model.trades.length >= 3 && $('#view .page-head'), 20000);
    const trades = T.model.trades.filter((x) => !x.btSession && Number.isFinite(x.r) && Number.isFinite(x.pnl));
    const t = trades[0], id = t.id, n0 = T.model.trades.length;
    // ---------- okno szczegółów ----------
    T.openDetail(T.model.trades, id, null);
    const del = await until(() => { const b = $('.lb-del'); return b && b.offsetParent ? b : null; });
    rec(!!del, 'okno szczegółów ma przycisk „Usuń”');
    if (del) {
      del.scrollIntoView({ block: 'center' });
      const r = del.getBoundingClientRect();
      rec(r.width > 0 && r.right <= window.innerWidth + 1 && r.left >= -1 && (window.innerWidth > 640 || r.height >= 40), `przycisk „Usuń” jest w widoku i da się go dotknąć: ${Math.round(r.width)}×${Math.round(r.height)} przy ${window.innerWidth} px`);
      del.click();
      const txt = await confirmText();
      rec(/Usunąć ten trade\?/.test(txt) && /trafi do kosza w Notion/.test(txt) && /w ciągu 30 dni/.test(txt), `potwierdzenie w dzienniku: kosz Notion i 30 dni: ${txt.slice(0, 260)}`);
      rec((txt.match(/Notion/g) || []).length === 1, `„Notion” raz w potwierdzeniu: ${(txt.match(/Notion/g) || []).length}`);
      rec(/[+−-]?\d+(,\d+)?R/.test(txt) && /\$/.test(txt) && txt.includes(String(t.instrument || '')), `podsumowanie ma R i P&L jak w replayu: ${txt.slice(0, 160)}`);
      dlg().querySelector('[data-cd="no"]').click();
      await sleep(250);
      rec(has(id) && (await serverHas(id)) && !!$('.lb-del')?.offsetParent, 'Anuluj: trade zostaje w dashboardzie, w Notion i okno jest otwarte');
      $('.lb-del').click();
      await confirmText();
      dlg().querySelector('[data-cd="yes"]').click();
      await until(() => !has(id));
      rec(!has(id) && T.model.trades.length === n0 - 1, 'po potwierdzeniu trade znika z dashboardu');
      rec(!$('.lb-del')?.offsetParent, 'okno szczegółów zamknięte po usunięciu');
      rec(!(await serverHas(id)), 'strona trade\'a jest w koszu Notion (zapytanie jej nie zwraca)');
      const tt = await until(() => toastEl());
      // 1.7-1 (runda 4): skrót klawiszowy w „Cofnij” tylko tam, gdzie jest klawiatura; na dotyku i przy ≤ 640 px samo „Cofnij”
  const noKeys = matchMedia('(hover: none), (max-width: 640px)').matches;
  rec(tt && /Trade usunięty/.test(tt.textContent) && (noKeys ? !/Ctrl|⌘/.test(tt.textContent) && /Cofnij/.test(tt.textContent) : /Cofnij \((Ctrl\+Z|⌘Z)\)/.test(tt.textContent)), noKeys ? 'powiadomienie „Trade usunięty · Cofnij” (bez skrótu na dotyku)' : 'powiadomienie „Trade usunięty · Cofnij (Ctrl+Z)”');
      rec(tt && !tt.contains(document.activeElement), 'fokus nie wskakuje na powiadomienie');
      key(document.body, { key: 'z', code: 'KeyZ', ctrlKey: true });
      await until(() => has(id));
      rec(has(id) && (await serverHas(id)), 'Ctrl+Z cofa: trade wraca do dashboardu i do Notion');
      await until(() => /Trade przywrócony/.test(toastEl()?.textContent || ''));
      rec(/Trade przywrócony/.test(toastEl()?.textContent || ''), 'powiadomienie „Trade przywrócony”');
    }
    // ---------- formularz edycji ----------
    await sleep(300);
    const tf = T.model.trades.find((x) => x.id === id) || t;
    T.form.open(tf, null);
    const fdel = await until(() => $('#trade-form [data-f-act="delete"]'));
    rec(!!fdel, 'formularz edycji ma przycisk „Usuń trade”');
    if (fdel) {
      fdel.click();
      await confirmText();
      dlg().querySelector('[data-cd="no"]').click();
      await sleep(250);
      rec(!!$('#trade-form') && has(id), 'Anuluj w potwierdzeniu: formularz zostaje otwarty, trade nietknięty');
      $('#trade-form [data-f-act="delete"]').click();
      await confirmText();
      dlg().querySelector('[data-cd="yes"]').click();
      await until(() => !has(id));
      await until(() => !$('#trade-form'));
      rec(!has(id) && !$('#trade-form'), 'usunięcie z formularza: trade znika, formularz się zamyka');
      rec(!(await serverHas(id)), 'strona w koszu Notion');
      const tt = await until(() => toastEl()?.querySelector('.toast-act'));
      rec(!!tt, 'powiadomienie z Cofnij po usunięciu z formularza');
      toastEl().querySelector('.toast-act').click();
      await until(() => has(id));
      rec(has(id) && (await serverHas(id)), 'Cofnij kliknięciem przywraca trade i stronę');
    }
  } catch (e) { fatal = String((e && e.stack) || e); }
  return JSON.stringify({ checks, fatal });
})()
