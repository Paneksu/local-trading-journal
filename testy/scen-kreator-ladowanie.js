// Scenariusz „kreator-ladowanie” (1.6.1): stan ładowania przycisków w kreatorze pierwszych kroków. Wszystkie żądania /api/setup/* to atrapy w przeglądarce.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  const T = window.__thq;
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const calls = { connect: 0, create: 0 };
  let gate = null, mode = 'ok';
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const url = String(u);
    if (url.endsWith('/api/setup/pages')) return reply(200, { pages: [{ id: 'p-journal', title: 'Dziennik', journal: true }, { id: 'p-new', title: 'Pusta strona', journal: false }] });
    if (url.endsWith('/api/setup/connect')) {
      calls.connect++;
      await new Promise((r) => { gate = r; });
      return mode === 'ok' ? reply(200, { lang: 'pl' }) : reply(500, { error: 'Notion nie odpowiada' });
    }
    if (url.endsWith('/api/setup/create')) {
      calls.create++;
      await new Promise((r) => { gate = r; });
      return mode === 'ok' ? reply(200, {}) : reply(500, { error: 'Nie udało się założyć', code: 'fail' });
    }
    if (url.endsWith('/api/setup/status')) return reply(200, { running: true, steps: [] });
    return of(u, o);
  };
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.ob, 15000);
    T.ob.show({ at: 'strona' });
    await until(() => $('.ob [data-ob="choose"]') && !$('.ob [data-ob="choose"]').disabled);
    const btn = () => $('.ob [data-ob="choose"]');
    rec('polacz', /Połącz istniejący dziennik/.test(btn()?.textContent) && !btn().disabled && btn().getAttribute('aria-busy') !== 'true', `przycisk gotowy: ${btn()?.textContent}`);
    // pierwsze kliknięcie: od razu stan ładowania
    btn().click();
    await sleep(0);
    rec('polacz', btn().disabled && btn().getAttribute('aria-busy') === 'true' && /Łączę z Notion/.test(btn().textContent) && btn().querySelector('.spin'), `po kliknięciu: disabled=${btn().disabled}, aria-busy=${btn().getAttribute('aria-busy')}, tekst=${btn().textContent}`);
    rec('polacz', getComputedStyle(btn().querySelector('.spin')).display !== 'none', 'spinner widoczny');
    btn().click(); btn().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(60);
    rec('polacz', calls.connect === 1, `drugie kliknięcie nie wysyła drugiego żądania (żądań: ${calls.connect})`);
    rec('polacz', !$('.ob [data-ob="back"]'), '„Wstecz” ukryte w trakcie łączenia');
    // błąd: przycisk wraca
    mode = 'err'; gate(); gate = null;
    await until(() => btn() && !btn().disabled);
    rec('polacz', btn() && !btn().disabled && btn().getAttribute('aria-busy') !== 'true' && /Połącz istniejący dziennik/.test(btn().textContent), `po błędzie przycisk wraca: ${btn()?.textContent}`);
    rec('polacz', /Notion nie odpowiada/.test($('.ob .pg-zone')?.textContent || ''), 'komunikat błędu widoczny');
    // ponowne kliknięcie po błędzie wysyła nowe żądanie
    mode = 'ok'; btn().click();
    await until(() => calls.connect === 2);
    rec('polacz', calls.connect === 2 && btn().disabled, 'po błędzie można kliknąć ponownie');
    gate && gate(); gate = null;
    await until(() => !$('.ob [data-ob="choose"]'), 5000);

    // ---------- „Utwórz dziennik” ----------
    T.ob.show({ at: 'dziennik' });
    await until(() => $('.ob [data-ob="build"]'));
    const b = () => $('.ob [data-ob="build"]');
    mode = 'err'; b().click(); await sleep(0);
    rec('utworz', b() && b().disabled && b().getAttribute('aria-busy') === 'true' && /Zakładam dziennik/.test(b().textContent) && b().querySelector('.spin'), `po kliknięciu: ${b()?.textContent}, aria-busy=${b()?.getAttribute('aria-busy')}`);
    b().click(); await sleep(60);
    rec('utworz', calls.create === 1, `jedno żądanie /api/setup/create (${calls.create})`);
    gate(); gate = null;
    await until(() => b() && !b().disabled);
    rec('utworz', b() && !b().disabled && b().getAttribute('aria-busy') !== 'true', 'po błędzie przycisk wraca');

    // ---------- reduced-motion i style ----------
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    rec('styl', css.includes('prefers-reduced-motion') && /\.busy \.spin[^}]*2\.4s[^}]*!important/.test(css.replace(/\s+/g, ' ')), 'spinner ma regułę reduced-motion');
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
