// Scenariusz N2 na prawdziwym dashboardzie testowym (atrapa Notion, katalog konfiguracji tymczasowy, bez kluczy Databento/FRED/Finnhub).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal, w }.
// Testy: testy/backtest-N2-ustawienia.mjs. Szerokość ≥ 1024: nawigacja, pola w sekcjach, zapis, diagnostyka; < 1024: lista sekcji i układ 375 px.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sp = () => $('.sp');
  const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const narrow = innerWidth < 1024;
  // zapis żądań POST (adres, treść, nagłówki) i atrapy restartu / zatrzymania (nigdy nie dochodzą do serwera)
  const posts = [];
  const stub = { restart: false, shutdown: false };
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const url = String(u);
    if ((o.method || 'GET') === 'POST') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } posts.push({ url, body, headers: o.headers || {} }); }
    if (stub.restart && /\/api\/restart$/.test(url)) return new Response(JSON.stringify({ restarting: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (stub.restart && /\/api\/health$/.test(url)) return new Response(JSON.stringify({ ok: true, version: 'x', started: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (stub.shutdown && /\/api\/shutdown$/.test(url)) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return of(u, o);
  };
  const T = window.__thq;
  const openSec = async (id) => { T.ust.open(id); return until(() => sp() && sp().querySelector(`[data-fk="tab-${id}"][aria-selected="true"]`) && sp().querySelector('.sv-body')); };
  const noHScroll = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && (!sp() || sp().scrollWidth <= sp().clientWidth + 1);
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    try { localStorage.removeItem('thq.ust.sekcja.v1'); } catch { /* brak */ }

    if (!narrow) {
      // ---------- szkielet ----------
      $('#gear').click();
      await until(() => sp());
      const ids = $$('.sp [role="tab"]').map((b) => b.dataset.v);
      rec('nawigacja', JSON.stringify(ids) === JSON.stringify(['konto', 'zrodla', 'dysk', 'wyglad', 'wykresy', 'backtest', 'diag']), `7 sekcji w kolejności §4.2: ${ids.join(', ')}`);
      const labels = $$('.sp [role="tab"]').map((b) => b.textContent.trim());
      rec('nawigacja', labels.join('|') === 'Konto i Notion|Źródła danych|Dane na dysku|Wygląd|Wykresy|Backtest|Kopie i diagnostyka', `nazwy sekcji: ${labels.join(' | ')}`);
      const r = sp().getBoundingClientRect(), nav = $('.sv-nav').getBoundingClientRect(), main = $('.sv-main').getBoundingClientRect();
      rec('nawigacja', r.width >= innerWidth - 20 && r.top >= 36 && r.top <= 60, `pełny widok pod paskiem: ${Math.round(r.width)}×${Math.round(r.height)} od y=${Math.round(r.top)}`);
      rec('nawigacja', nav.right <= main.left + 1 && nav.width >= 180 && nav.width <= 300, `nawigacja po lewej (${Math.round(nav.width)} px), treść po prawej`);
      rec('nawigacja', /^#ustawienia\/konto$/.test(location.hash) && $('[data-fk="tab-konto"]').getAttribute('aria-selected') === 'true', `pierwsze otwarcie: Konto i Notion, adres ${location.hash}`);
      rec('nawigacja', document.activeElement?.dataset?.fk === 'tab-konto', 'fokus na wybranej sekcji');
      $('[data-fk="tab-wykresy"]').click();
      await until(() => $('.sp .pvc'));
      rec('nawigacja', location.hash === '#ustawienia/wykresy' && document.activeElement?.dataset?.fk === 'tab-wykresy', `klik w sekcję zmienia adres (${location.hash}) i fokus`);
      esc();
      await until(() => !sp());
      rec('nawigacja', !sp() && !/^#ustawienia/.test(location.hash) && $('#gear').getAttribute('aria-expanded') === 'false', 'Esc zamyka widok i czyści adres');
      $('#gear').click();
      await until(() => sp());
      rec('nawigacja', $('[data-fk="tab-wykresy"]')?.getAttribute('aria-selected') === 'true', 'koło zębate otwiera ostatnio używaną sekcję (Wykresy)');
      esc(); await until(() => !sp());
      // aliasy starych zakładek
      T.ust.toggle('ogolne'); await until(() => sp());
      rec('nawigacja', $('[data-fk="tab-wyglad"]')?.getAttribute('aria-selected') === 'true', 'stara zakładka „ogolne” → Wygląd');
      T.ust.handle('sp-tab', 'urzadzenia');
      rec('nawigacja', $('[data-fk="tab-konto"]')?.getAttribute('aria-selected') === 'true', 'stara zakładka „urzadzenia” → Konto i Notion');
      esc(); await until(() => !sp());
      // głęboki link z grupą
      location.hash = '#ustawienia/zrodla/databento';
      const key = await until(() => $('.sp #sp-dbkey'));
      rec('nawigacja', key && document.activeElement === key, 'głęboki link #ustawienia/zrodla/databento: sekcja Źródła danych, fokus w kluczu Databento');
      esc(); await until(() => !sp());

      // ---------- każde pole w swojej sekcji ----------
      const FIELDS = {
        konto: ['[data-act="sync-toggle"]', '[data-act="dv-add"]', '[data-act="ob-open"]', '[data-act="ob-token"]', '.sv-conn [data-act="diag-test"][data-v="notion"]'],
        // N4 (1.6.0): klucze i stan źródeł w Źródłach danych, wygląd newsów i earningsów (przełączniki, wagi, klasy, ręczne wyjątki) w Wykresach
        zrodla: ['#sp-dbkey', '[data-act="ch-key-save"]', '[data-act="ch-nq1s"]', '#sv-g-databento .sp-kvs', '#sp-fredkey', '[data-act="news-key-save"]', '#sp-fhkey', '[data-act="earn-key-save"]', '[data-act="zr-cr-edit"]', '[data-act="zr-lim-edit"]', '[data-act="zr-imp-quote"]'],
        dysk: ['[data-act="diag-open"][data-v="data"]', '#sv-g-dane .sv-pathv'],
        wyglad: ['[data-act="palette"][data-v="color"]', '[data-act="palette"][data-v="wlasna"]', '[data-act="pal-reset"]', '#be-r', '#be-usd', '[data-act="be-reset"][data-v="beR"]', '[data-act="be-reset"][data-v="beUsd"]', '[data-act="sp-lang"][data-v="pl"]', '[data-act="sp-lang"][data-v="en"]', '#sp-nick'],
        wykresy: ['.pvc', '[data-act="ch-style"][data-v="line"]', '[data-act="ch-mini-style"]', '[data-act="ch-colors"][data-v="custom"]', '[data-chk="grid"]', '[data-chk="entry"]', '[data-chk="exit"]', '[data-chk="sl"]', '[data-chk="tp"]', '[data-act="ch-reset"][data-v="look"]',
          '[data-chk="sessions"]', '[data-chk="sess-asia"]', '[data-chk="sess-london"]', '[data-chk="sess-ny"]', '[data-ovt="asia.from"]', '[data-ovt="asia.to"]', '[data-ovt="london.from"]', '[data-ovt="london.to"]', '[data-ovt="ny.from"]', '[data-ovt="ny.to"]', '[data-chk="pdhl"]', '[data-act="ch-reset"][data-v="overlays"]',
          '[data-chk="shareChart"]', '[data-act="ch-share-style"]', '[data-act="ch-share-draw"]', '[data-chk="equity"]', '[data-act="ch-film-format"]', '[data-act="ch-film-seconds"]', '[data-range="filmDim"]', '[data-act="ch-reset"][data-v="cards"]',
          '#sp-tz', '#sp-badj', '[data-act="ch-reset"][data-v="time"]', '[data-act="sp-dock"][data-v="pop"]', '[data-act="sp-dock"][data-v="pin"]',
          '[data-chk="news"]', '[data-chk^="newsImp-"]', '[data-chk="earnings"]', '[data-chk^="earnCls-"]', '#sp-earn-sym', '[data-act="earn-class-add"]'],
        backtest: ['.bt-sj', '[data-act="bt-add"]', '[data-act="bt-reset"]', '[data-bts^="skroty:"]', '[data-btd="startTime"]', '[data-btd="risk"]', '[data-btd="speed"]', '[data-act="bt-risk-mode"]', '.bt-serr'],
        diag: ['[data-act="sp-upd"]', '[data-act="upd-check-now"]', '[data-act="diag-restart"]', '[data-act="diag-stop"]', '[data-act="diag-log"]', '[data-act="diag-test"][data-v="all"]', '#ch-g-lic', '#sv-g-log [data-act="diag-open"][data-v="logs"]'],
      };
      const where = {};
      for (const id of Object.keys(FIELDS)) {
        await openSec(id);
        await sleep(id === 'zrodla' || id === 'konto' ? 400 : 80);
        for (const sel of Object.values(FIELDS).flat()) if (sp().querySelector(sel)) (where[sel] ||= []).push(id);
        rec('pola', noHScroll(), `${id}: bez poziomego przewijania (1920)`);
      }
      for (const [id, sels] of Object.entries(FIELDS)) {
        const bad = sels.filter((s) => (where[s] || []).join() !== id);
        rec('pola', !bad.length, `${id}: ${sels.length} pól tylko w tej sekcji${bad.length ? `; źle: ${bad.map((s) => `${s} → ${(where[s] || ['brak']).join('+')}`).join('; ')}` : ''}`);
      }

      // ---------- zapis bez zmian: localStorage, blok ustawień (POST /api/sync), config.local.json (POST /api/config) ----------
      await openSec('wyglad');
      $('.sp [data-act="palette"]:not([aria-pressed="true"])').click();
      const pal = T.settings.palette;
      const beR = $('.sp #be-r'); beR.value = '0.2'; fire(beR, 'input');
      const nick = $('.sp #sp-nick'); nick.value = 'test-n2'; fire(nick, 'input');
      await openSec('wykresy');
      $('.sp [data-act="ch-style"][data-v="line"]').click();
      await sleep(50);
      const tz = $('.sp #sp-tz'); tz.value = [...tz.options].find((o) => o.value && o.value !== tz.value)?.value || ''; fire(tz, 'change');
      const tzv = T.settings.chartTz;
      const grid = $('.sp [data-chk="grid"]'); grid.checked = !grid.checked; fire(grid, 'change');
      const gridv = T.settings.chart.grid;
      $('.sp [data-act="sp-dock"][data-v="pin"]').click();
      // N4: przełącznik newsów w Wykresach (sekcja już otwarta)
      const nw = $('.sp [data-chk="news"]'); nw.checked = !nw.checked; fire(nw, 'change');
      const newsv = T.settings.chart.overlays.news;
      await openSec('backtest');
      const spd = $('.sp [data-btd="speed"]'); spd.value = '300'; fire(spd, 'change');
      let ls = {}; try { ls = JSON.parse(localStorage.getItem('thq.settings.v1') || '{}'); } catch { /* brak */ }
      rec('zapis', ls.palette === pal && ls.beR === 0.2 && ls.share?.nick === 'test-n2' && ls.chart?.style === 'line' && ls.chartTz === tzv && ls.chart?.grid === gridv && ls.chart?.overlays?.news === newsv && ls.bt?.speed === 300,
        `localStorage: palette ${ls.palette}, beR ${ls.beR}, nick ${ls.share?.nick}, styl ${ls.chart?.style}, strefa ${ls.chartTz}, siatka ${ls.chart?.grid}, newsy ${ls.chart?.overlays?.news}, szybkość ${ls.bt?.speed}`);
      rec('zapis', localStorage.getItem('thq.chart.styleDock.v1') === 'pin', 'ustawienia rysunku: thq.chart.styleDock.v1 = pin');
      const sync = await until(() => posts.filter((p) => /\/api\/sync$/.test(p.url)).pop(), 6000);
      const s = sync?.body?.settings || {};
      rec('zapis', sync && s.palette === pal && s.beR === 0.2 && s.share?.nick === 'test-n2' && s.chart?.style === 'line' && s.chartTz === tzv && s.chart?.overlays?.news === newsv && s.bt?.speed === 300,
        `blok ustawień w Notion (POST /api/sync): ${sync ? JSON.stringify({ p: s.palette, b: s.beR, n: s.share?.nick, st: s.chart?.style, tz: s.chartTz, nw: s.chart?.overlays?.news, sp: s.bt?.speed }) : 'brak wysyłki'}`);
      const blob = JSON.stringify(sync?.body || {});
      rec('zapis', !/databento|hasDatabentoKey|chartCostLimit|chartCredit|"token"/i.test(blob), 'blok ustawień bez kluczy, limitów i kredytu');
      await openSec('zrodla');
      const nq = $('.sp [data-act="ch-nq1s"]'); const nqv = !nq.checked; nq.checked = nqv; fire(nq, 'change');
      // N4: włączenie okna 1s NQ czeka na potwierdzenie kosztu
      if (nqv) (await until(() => $('.sp [data-act="zr-nq-ok"]')))?.click();
      await openSec('diag');
      const upd = $('.sp [data-act="sp-upd"]'); const updv = !upd.checked; upd.checked = updv; fire(upd, 'change');
      await openSec('konto'); await sleep(300);
      const sy = $('.sp [data-act="sync-toggle"]'); const syv = !sy.checked; sy.checked = syv; fire(sy, 'change');
      await sleep(400);
      const cfg = posts.filter((p) => /\/api\/config$/.test(p.url)).map((p) => p.body);
      rec('zapis', cfg.some((b) => b.chartNq1sDaily === nqv) && cfg.some((b) => b.updateCheck === updv) && cfg.some((b) => b.syncEnabled === syv), `config.local.json (POST /api/config): ${JSON.stringify(cfg)}`);
      // przywrócenie synchronizacji (atrapa: dalsze zapisy dalej trafiają do bloku)
      const sy2 = await until(() => $('.sp [data-act="sync-toggle"]')); sy2.checked = !syv; fire(sy2, 'change');
      // klucz Databento: zły format odrzuca serwer, wartość nie ląduje w localStorage ani w bloku
      await openSec('zrodla');
      const k = $('.sp #sp-dbkey'); k.value = 'zly klucz!'; $('.sp [data-act="ch-key-save"]').click();
      const msg = await until(() => { const n = $('.sp #sp-dbkey-d .warnb'); return n && !/Sprawdzam/.test(n.textContent) ? n : null; }, 6000);
      rec('zapis', msg && $('.sp #sp-dbkey')?.value === 'zly klucz!' && !/zly klucz/.test(localStorage.getItem('thq.settings.v1') || ''), `zły klucz Databento: komunikat (${msg?.textContent.trim().slice(0, 80)}), wartość zostaje tylko w polu`);
      $('.sp #sp-dbkey').value = '';

      // ---------- diagnostyka ----------
      await openSec('diag');
      const rows = await until(() => { const r = $$('.sp .sv-cr'); return r.length === 5 && !/Sprawdzam/.test(r[0].textContent) ? r : null; }, 6000);
      const txt = (s) => rows?.find((r) => r.dataset.src === s)?.textContent.replace(/\s+/g, ' ').trim() || '';
      rec('diag', rows && /Notion/.test(txt('notion')) && /Databento/.test(txt('databento')) && /FRED/.test(txt('fred')) && /Finnhub/.test(txt('finnhub')) && /GitHub/.test(txt('github')), 'stan połączeń: Notion, Databento, FRED, Finnhub, GitHub');
      rec('diag', /Brak klucza/.test(txt('databento')) && /opcjonalny/.test(txt('fred')) && /Skonfigurowany/.test(txt('notion')), `bez sieci: Notion skonfigurowany, Databento bez klucza, FRED opcjonalny (${txt('notion')} | ${txt('databento')} | ${txt('fred')})`);
      $('.sp [data-act="diag-test"][data-v="all"]').click();
      const ok = await until(() => /Działa/.test(txt2('notion')) ? true : null, 8000);
      function txt2(s) { return $(`.sp .sv-cr[data-src="${s}"]`)?.textContent.replace(/\s+/g, ' ') || ''; }
      rec('diag', ok && /Atrapa Workspace/.test(txt2('notion')) && /bazy: 4 z 4/.test(txt2('notion')), `„Sprawdź wszystko”: Notion działa (${txt2('notion').trim().slice(0, 120)})`);
      const tests = posts.filter((p) => /\/api\/diag\/test$/.test(p.url));
      rec('diag', tests.length >= 2 && tests.every((p) => p.headers['X-THQ'] === '1'), `POST /api/diag/test z nagłówkiem X-THQ (${tests.map((p) => p.body?.source).join(', ')})`);
      rec('diag', /Błąd|Brak połączenia/.test(txt2('github')), `GitHub w teście bez sieci: ${txt2('github').trim().slice(0, 100)}`);
      rec('diag', $('.sp [data-act="diag-restart"]') && $('.sp [data-act="diag-stop"]') && $('.sp [data-act="diag-restart"]').offsetParent && $('.sp [data-act="diag-stop"]').offsetParent, 'przyciski „Uruchom ponownie” i „Zatrzymaj serwer” zawsze widoczne');
      rec('diag', /\d+\.\d+\.\d+/.test($('.sp .sv-g#sv-g-serwer')?.textContent || '') && /127\.0\.0\.1/.test($('.sp .sv-g#sv-g-serwer')?.textContent || ''), 'serwer: wersja i adres');
      rec('diag', /Wersja \d/.test($('.sp .sv-nf')?.textContent || ''), 'wersja w stopce nawigacji');
      $('.sp [data-act="diag-log"]').click();
      const pre = await until(() => $('.sp .sv-log') || $('.sp #sv-g-log .note'), 6000);
      rec('diag', pre && /JustJournal|Port|dashboard/i.test($('.sp #sv-g-log').textContent), `log: ${($('.sp .sv-log')?.textContent || $('.sp #sv-g-log').textContent).slice(0, 100)}`);
      $('.sp [data-act="diag-open"][data-v="logs"]').click();
      const om = await until(() => /Ścieżka|Otwarto|nie istnieje/.test($('.sp #sv-g-log')?.textContent || '') ? true : null, 4000);
      rec('diag', om && posts.some((p) => /\/api\/diag\/open$/.test(p.url) && p.body?.which === 'logs'), '„Otwórz folder” → POST /api/diag/open { which: logs } i ścieżka na ekranie');
      // restart: żądanie POST /api/restart (atrapa odpowiedzi), strona czeka na nowy start serwera
      stub.restart = true;
      $('.sp [data-act="diag-restart"]').click();
      const w = await until(() => /Czekam, aż serwer wstanie/.test($('.sp #sv-g-serwer')?.textContent || '') && posts.some((p) => /\/api\/restart$/.test(p.url)) ? true : null, 4000);
      rec('diag', w && posts.some((p) => /\/api\/restart$/.test(p.url) && p.headers['X-THQ'] === '1'), `restart: POST /api/restart z X-THQ i komunikat o czekaniu (${w ? 'komunikat' : ($('.sp #sv-g-serwer')?.textContent || '').replace(/\s+/g, ' ').slice(0, 300)}; żądania: ${posts.map((p) => p.url.replace(/^.*\/api/, '')).join(' ')})`);
      // zatrzymanie: potwierdzenie, POST /api/shutdown (atrapa odpowiedzi), ekran „Dashboard zatrzymany”
      stub.shutdown = true;
      $('.sp [data-act="diag-stop"]').click();
      const dlg = await until(() => $('.modal[role="alertdialog"]'));
      dlg?.querySelector('[data-cd="yes"]').click();
      const stopped = await until(() => $('.stopped'), 4000);
      rec('diag', dlg && stopped && posts.some((p) => /\/api\/shutdown$/.test(p.url)), 'zatrzymanie: okno potwierdzenia, POST /api/shutdown, ekran „Dashboard zatrzymany”');
    } else {
      // ---------- 375 px: lista sekcji, potem sekcja z „‹ Ustawienia” ----------
      $('#gear').click();
      await until(() => sp());
      rec('mobile', sp().dataset.m === 'list' && $('.sv-nav').offsetParent && !$('.sv-main').offsetParent, 'koło zębate: lista sekcji (bez treści)');
      rec('mobile', $$('.sp .sv-nd').filter((e) => e.offsetParent).length === 7, 'lista z opisem każdej sekcji');
      rec('mobile', noHScroll(), 'lista bez poziomego przewijania');
      const r0 = sp().getBoundingClientRect();
      rec('mobile', r0.width <= innerWidth + 0.5 && r0.left >= -0.5, `widok mieści się w szerokości (${Math.round(r0.width)} px)`);
      for (const id of ['konto', 'zrodla', 'dysk', 'wyglad', 'wykresy', 'backtest', 'diag']) {
        if (sp().dataset.m !== 'list') { $('.sp [data-act="sp-back"]').click(); await until(() => sp().dataset.m === 'list'); }
        $(`.sp [data-fk="tab-${id}"]`).click();
        await until(() => sp().dataset.m === 'sec' && $('.sp .sv-body'));
        await sleep(id === 'zrodla' || id === 'konto' || id === 'diag' ? 350 : 60);
        const vis = $('.sv-main').offsetParent && !$('.sv-nav').offsetParent;
        const wide = $$('.sp .sv-body *').filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.getClientRects().length && getComputedStyle(e).position !== 'absolute').map((e) => e.className || e.tagName).slice(0, 3);
        rec('mobile', vis && noHScroll() && !wide.length, `${id}: treść bez listy, bez poziomego przewijania${wide.length ? ` (szersze: ${wide.join(', ')})` : ''}`);
        rec('mobile', document.activeElement?.dataset?.fk === 'sp-back', `${id}: fokus na „‹ Ustawienia”`);
      }
      $('.sp [data-act="sp-back"]').click();
      await until(() => sp().dataset.m === 'list');
      rec('mobile', $('.sv-nav').offsetParent && document.activeElement?.dataset?.fk === 'tab-diag', '„‹ Ustawienia” wraca do listy z fokusem na ostatniej sekcji');
      esc(); await until(() => !sp());
      location.hash = '#ustawienia/zrodla/databento';
      await until(() => sp() && $('.sp #sp-dbkey'));
      rec('mobile', sp().dataset.m === 'sec' && $('.sp #sp-dbkey').offsetParent, 'głęboki link na telefonie otwiera od razu sekcję, nie listę');
      esc();
    }
  } catch (e) { fatal = String(e && e.stack || e); }
  return JSON.stringify({ checks, fatal, w: innerWidth });
})()
