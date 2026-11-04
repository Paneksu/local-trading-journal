// Scenariusz P57 (przegląd 4.11.2026) na prawdziwym dashboardzie testowym (atrapa Notion i Databento, katalog tymczasowy, bez klucza Databento):
// przełącznik minutówek ES i NQ w Ustawienia → Źródła danych (potwierdzenie kosztu, brak POST przed potwierdzeniem, Anuluj z fokusem, zapis true i false,
// bez mignięcia pola), zdanie o brakującym kluczu w potwierdzeniu obu przełączników, ostrzeżenie w Dane na dysku tylko dla warstw z ostatnich 92 dni.
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 6000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const posts = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => { if ((o.method || 'GET') === 'POST' && /api.config/.test(String(u))) posts.push(JSON.parse(o.body)); return of(u, o); };
  const cfgPosts = (k) => posts.filter((p) => k in p);
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && window.__thq?.model, 15000);
    location.hash = '#ustawienia/zrodla';
    const cb = () => $('.sp [data-act="ch-1m"]');
    const nq = () => $('.sp [data-act="ch-nq1s"]');
    await until(() => cb() && nq(), 10000);
    rec('start', cb() && !cb().checked, 'jest kontrolka minutówek, odznaczona');

    // ---------- 1s: zdanie o braku klucza, Anuluj z fokusem ----------
    nq().checked = true; fire(nq(), 'change');
    await until(() => $('.sp [data-act="zr-nq-ok"]'));
    rec('anuluj', /zapisaniu klucza Databento/.test($('.sp #sv-nq-c')?.closest('.sv-confirm')?.textContent || '') && !cfgPosts('chartNq1sDaily').length, 'potwierdzenie 1s mówi o braku klucza, zero POST');
    $('.sp [data-act="zr-nq-no"]').click();
    await until(() => !$('.sp [data-act="zr-nq-ok"]'));
    rec('anuluj', !nq().checked && document.activeElement === nq(), 'Anuluj (1s): pole odznaczone, fokus wraca na pole');

    // ---------- 1m: potwierdzenie, Anuluj ----------
    cb().checked = true; fire(cb(), 'change');
    await until(() => $('.sp [data-act="zr-1m-ok"]'));
    const conf = $('.sp #sv-1m-c')?.closest('.sv-confirm')?.textContent.replace(/\s+/g, ' ') || '';
    rec('potwierdzenie', !!$('.sp [data-act="zr-1m-ok"]') && !cfgPosts('chart1mDaily').length, 'potwierdzenie widoczne, zero POST przed potwierdzeniem');
    rec('potwierdzenie', /0,80 USD/.test(conf) && /92 dni/.test(conf) && !/zmierzona/i.test(conf), 'kwota: ' + conf.slice(0, 200));
    rec('potwierdzenie', /zapisaniu klucza Databento/.test(conf), 'bez klucza potwierdzenie mówi, czego brakuje');
    rec('potwierdzenie', cb().checked, 'pole zaznaczone w trakcie potwierdzenia');
    $('.sp [data-act="zr-1m-no"]').click();
    await until(() => !$('.sp [data-act="zr-1m-ok"]'));
    rec('anuluj', !cb().checked && !cfgPosts('chart1mDaily').length && document.activeElement === cb(), 'Anuluj (1m): odznaczone, zero POST, fokus na polu');

    // ---------- 1m: włączenie ----------
    cb().checked = true; fire(cb(), 'change');
    await until(() => $('.sp [data-act="zr-1m-ok"]'));
    $('.sp [data-act="zr-1m-ok"]').click();
    const samples = [];
    for (let i = 0; i < 20; i++) { samples.push(cb()?.checked ? 1 : 0); await sleep(25); }
    await until(() => cfgPosts('chart1mDaily').some((p) => p.chart1mDaily === true));
    await sleep(500);
    rec('wlacz', cfgPosts('chart1mDaily').some((p) => p.chart1mDaily === true) && cb().checked && !$('.sp [data-act="zr-1m-ok"]'), 'POST true, pole zaznaczone, bez potwierdzenia');
    rec('wlacz', samples.every((x) => x === 1), 'bez mignięcia pola: ' + samples.join(''));
    const meta = await (await of('/api/meta')).json();
    rec('wlacz', meta.chart1mDaily === true, 'meta.chart1mDaily = true');
    const srcs = await (await of('/api/sources')).json();
    rec('wlacz', srcs.databento?.min1Daily === true, 'sources.databento.min1Daily = ' + srcs.databento?.min1Daily);
    location.hash = '#ustawienia/wyglad'; await sleep(300); location.hash = '#ustawienia/zrodla'; await until(cb); await sleep(300);
    rec('wlacz', cb().checked, 'po przejściu między zakładkami dalej zaznaczone');

    // ---------- Dane na dysku: ostrzeżenie tylko dla świeżych warstw ----------
    location.hash = '#ustawienia/dysk';
    await until(() => $('.sp .sv-tbl tbody tr'), 10000);
    const del = async (key) => { $(`.sp [data-act="dysk-del"][data-v="${key}"]`).click(); await until(() => $('.sp .sv-confirm')); const t = $('.sp .sv-confirm').textContent.replace(/\s+/g, ' '); $('.sp [data-act="dysk-del-no"]').click(); await until(() => !$('.sp .sv-confirm')); return t; };
    const fresh = await del('NQ|1m'), old = await del('ES|1m');
    rec('dysk', /Automatyczne minutówki są włączone/.test(fresh) && /0,80 USD/.test(fresh), 'NQ 1m (dane z ostatnich dni): ostrzeżenie o ponownym pobraniu');
    rec('dysk', !/Automatyczne minutówki/.test(old), 'ES 1m (dane sprzed lat): bez ostrzeżenia');
    rec('dysk', /plików dni: \d/.test(fresh) && !/\d plików dni/.test(fresh), 'zdanie o plikach: „plików dni: N”: ' + fresh.slice(0, 120));

    // ---------- wyłączenie ----------
    location.hash = '#ustawienia/zrodla'; await until(cb); await sleep(300);
    posts.length = 0;
    cb().checked = false; fire(cb(), 'change');
    await until(() => cfgPosts('chart1mDaily').some((p) => p.chart1mDaily === false));
    await sleep(500);
    rec('wylacz', cfgPosts('chart1mDaily').some((p) => p.chart1mDaily === false) && !cb().checked && !$('.sp [data-act="zr-1m-ok"]'), 'POST false, pole odznaczone, bez pytania');
    const meta2 = await (await of('/api/meta')).json();
    rec('wylacz', meta2.chart1mDaily === false, 'meta.chart1mDaily = false');
  } catch (e) { fatal = String(e && e.message || e); }
  return JSON.stringify({ checks, fatal });
})()
