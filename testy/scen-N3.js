// Scenariusz N3 na prawdziwym dashboardzie testowym (atrapa Notion, katalog danych tymczasowy z syntetycznymi świecami).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// window.__N3_TARGET: ścieżka celu przeniesienia (katalog tymczasowy). Restart po przełączeniu ma atrapę odpowiedzi (nic nie trafia do serwera).
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(40); } return null; };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sp = () => $('.sp');
  const posts = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const url = String(u);
    if ((o.method || 'GET') === 'POST') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } posts.push({ url, body }); }
    // przełączenie katalogu restartowałoby serwer testowy: atrapa odpowiedzi i zdrowia
    if (/\/api\/disk\/move\/switch$/.test(url)) return new Response(JSON.stringify({ ok: true, restarting: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (window.__n3switched && /\/api\/health$/.test(url)) return new Response(JSON.stringify({ ok: true, started: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return of(u, o);
  };
  const T = window.__thq;
  const narrow = innerWidth < 1024;
  const noHScroll = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && (!sp() || sp().scrollWidth <= sp().clientWidth + 1);
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    location.hash = '#ustawienia/dysk';
    await until(() => sp() && $('.sp .sv-tbl tbody tr'), 10000);
    const cellText = (el) => [...el.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' ');
    const rows = $$('.sp .sv-tbl tbody tr').map(cellText);
    rec('tabela', rows.length === 4 && /^ES Minutówki \(1m\)/.test(rows[0]) && /NQ Kontrakty/.test(rows[3]), `4 wiersze świec: ${rows.join(' | ')}`);
    rec('tabela', /2024-03-11.*2024-03-13.*720 B/.test(rows[1]), `NQ 1m: zakres dat i rozmiar (${rows[1]})`);
    const kvs = $$('.sp #sv-g-dane .sp-kv').map(cellText).join(' | ');
    rec('tabela', /Wolne na dysku \d/.test(kvs) && /Zajęte przez dane/.test(kvs), `katalog: zajęte i wolne miejsce (${kvs})`);
    rec('tabela', $$('.sp #sv-g-sesje .sp-kv').map(cellText).includes('Sesje 2'), 'sesje: liczba');
    rec('tabela', $$('.sp #sv-g-inne .sp-kv').map(cellText).includes('Rysunki czekające na wysyłkę do Notion 1'), 'rysunki w kolejce: 1');
    rec('tabela', !$('.sp #sv-g-kopie [data-act="dysk-del"]') && !$$('.sp #sv-g-kopie button').some((b) => /Usuń/.test(b.textContent)), 'kopie baz bez przycisku usuwania (decyzja 7)');
    rec('tabela', noHScroll(), `bez poziomego przewijania (${innerWidth} px)`);
    if (narrow) {
      const tr = $('.sp .sv-tbl tbody tr'), th = $('.sp .sv-tbl thead');
      rec('tabela', getComputedStyle(th).display === 'none' && getComputedStyle(tr).display === 'grid', 'na telefonie tabela jako lista');
    }

    // ---------- usuwanie warstwy ----------
    $('.sp [data-act="dysk-del"][data-v="NQ|1s"]').click();
    const inp = await until(() => $('.sp #sv-del-confirm'));
    rec('usun', inp && document.activeElement === inp && /Usunąć NQ 1s\?/.test($('.sp .sv-confirm').textContent), 'okno potwierdzenia z nazwą i fokusem w polu');
    inp.value = 'NQ 1m'; $('.sp [data-act="dysk-del-ok"]').click();
    await until(() => $('.sp .sv-confirm .warnb'));
    rec('usun', /Wpisz dokładnie: NQ 1s/.test($('.sp .sv-confirm .warnb')?.textContent || '') && !posts.some((p) => /candles\/delete/.test(p.url)), 'zła nazwa: komunikat, bez żądania');
    $('.sp #sv-del-confirm').value = 'NQ 1s'; $('.sp [data-act="dysk-del-ok"]').click();
    await until(() => $$('.sp .sv-tbl tbody tr').length === 3);
    rec('usun', $$('.sp .sv-tbl tbody tr').length === 3 && /Usunięto NQ 1s/.test($('.sp #sv-g-swiece').textContent), 'warstwa usunięta, komunikat');
    rec('usun', posts.some((p) => /candles\/delete/.test(p.url) && p.body?.confirm === 'NQ 1s'), 'żądanie z potwierdzeniem');

    // ---------- przenoszenie ----------
    const path = $('.sp #sv-move-path');
    path.value = 'wzgledna\\sciezka'; $('.sp [data-act="dysk-move-check"]').click();
    await until(() => $('.sp #sv-g-przenies .warnb'));
    rec('przenies', /pełną ścieżkę/.test($('.sp #sv-g-przenies .warnb')?.textContent || ''), `zła ścieżka: ${$('.sp #sv-g-przenies .warnb')?.textContent}`);
    $('.sp #sv-move-path').value = window.__N3_TARGET; $('.sp [data-act="dysk-move-check"]').click();
    const start = await until(() => $('.sp [data-act="dysk-move-start"]'));
    rec('przenies', start && /potrzeba .*wolne/.test($('.sp #sv-g-przenies .sv-confirm').textContent), `sprawdzenie: ${$('.sp #sv-g-przenies .sv-confirm')?.textContent.trim().slice(0, 120)}`);
    start.click();
    const sw = await until(() => $('.sp [data-act="dysk-move-switch"]'), 15000);
    rec('przenies', sw && /Kopia sprawdzona/.test($('.sp #sv-g-przenies').textContent), 'kopia i sprawdzenie zakończone, przycisk przełączenia');
    rec('przenies', noHScroll(), 'bez poziomego przewijania po kopii');
    window.__n3switched = true;
    sw.click();
    await until(() => posts.some((p) => /move\/switch/.test(p.url)));
    rec('przenies', posts.some((p) => /move\/switch/.test(p.url)), 'przełączenie wysłane (restart: atrapa)');
    window.__n3shot = true;
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal, w: innerWidth });
})()
