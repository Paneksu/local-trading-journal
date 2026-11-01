// Scenariusz N4 na prawdziwym dashboardzie testowym (atrapa Notion, atrapa Databento, atrapy FRED i Finnhub, katalog tymczasowy, świeża instalacja).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// window.__N4 = { dbKey, fredKey }: fałszywe klucze przyjmowane przez atrapy.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(40); } return null; };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sp = () => $('.sp');
  const txt = (s) => ($(s)?.textContent || '').replace(/\s+/g, ' ').trim();
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const posts = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    if ((o.method || 'GET') === 'POST') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } posts.push({ url: String(u), body }); }
    return of(u, o);
  };
  const K = window.__N4;
  const T = window.__thq;
  const narrow = innerWidth < 1024;
  const noHScroll = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && (!sp() || sp().scrollWidth <= sp().clientWidth + 1);
  const leak = () => { const ls = JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]))); return [K.dbKey, K.fredKey].some((k) => ls.includes(k) || ls.includes(k.slice(0, 12))); };
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    location.hash = '#ustawienia/zrodla';
    await until(() => sp() && /Bez klucza/.test(txt('.sp #sv-g-databento .sv-src')) && /nie wpisany/.test(txt('.sp #sv-g-databento .sp-kvs')), 10000);
    rec('start', /Bez klucza/.test(txt('.sp #sv-g-databento .sv-src')), `Databento bez klucza: ${txt('.sp #sv-g-databento .sv-src')}`);
    rec('start', /nie jest wpisany/.test(txt('.sp #sv-g-kredyt')) && $('.sp #sv-g-kredyt .sv-warn'), 'nowa instalacja: kredyt nie wpisany, ostrzeżenie');
    rec('start', $('.sp [data-act="ch-nq1s"]') && !$('.sp [data-act="ch-nq1s"]').checked, 'okno 1s NQ wyłączone w nowej instalacji');
    rec('start', /Najpierw zapisz klucz Databento/.test(txt('.sp #sv-g-import')) && $('.sp [data-act="zr-imp-quote"]').disabled, 'import zablokowany bez klucza');
    rec('start', !$('.sp #sv-g-zrodla [data-chk="news"]') && !$('.sp [data-chk="news"]') && !$('.sp #sp-earn-sym'), 'wygląd newsów i earningsów nie w Źródłach danych');
    rec('start', noHScroll(), `bez poziomego przewijania (${innerWidth} px)`);

    // ---------- klucz Databento ----------
    $('.sp #sp-dbkey').value = K.dbKey; $('.sp [data-act="ch-key-save"]').click();
    await until(() => /kończy się na …cdef/.test(txt('.sp #sv-g-databento .sv-src')), 8000);
    rec('klucz', /kończy się na …cdef/.test(txt('.sp #sv-g-databento .sv-src')) && $('.sp #sp-dbkey').value === '', `maska 4 znaków, pole puste: ${txt('.sp #sv-g-databento .sv-src')}`);
    rec('klucz', posts.some((p) => /\/api\/sources\/key$/.test(p.url) && p.body?.source === 'databento'), 'zapis przez /api/sources/key');
    rec('klucz', !(document.body.innerHTML.includes(K.dbKey)), 'pełny klucz nigdzie na stronie');
    $('.sp [data-fk="zr-test-databento"]').click();
    await until(() => /Klucz działa/.test(txt('.sp #sv-g-databento .sv-src')), 8000);
    rec('klucz', /Klucz działa/.test(txt('.sp #sv-g-databento .sv-src')) && $('.sp #sv-g-databento .sv-dot[data-st="ok"]'), `Testuj: ${txt('.sp #sv-g-databento .sv-src')}`);
    // ---------- klucz FRED: zapis i usunięcie ----------
    $('.sp #sp-fredkey').value = K.fredKey; $('.sp [data-act="news-key-save"]').click();
    await until(() => /kończy się na/.test(txt('.sp #sv-g-newsy .sv-src')), 8000);
    rec('klucz', txt('.sp #sv-g-newsy .sv-src').includes(`…${K.fredKey.slice(-4)}`), `FRED zapisany: ${txt('.sp #sv-g-newsy .sv-src')}`);
    $('.sp [data-act="zr-key-del"][data-v="fred"]').click();
    await until(() => $('.sp [data-act="zr-key-del-ok"]'));
    rec('klucz', /Usunąć klucz FRED\?/.test(txt('.sp #sv-g-newsy .sv-confirm')), 'usunięcie z potwierdzeniem');
    $('.sp [data-act="zr-key-del-ok"]').click();
    await until(() => /Bez klucza \(opcjonalny\)/.test(txt('.sp #sv-g-newsy .sv-src')), 8000);
    rec('klucz', /Bez klucza \(opcjonalny\)/.test(txt('.sp #sv-g-newsy .sv-src')) && posts.some((p) => p.body?.source === 'fred' && p.body?.remove === true), 'klucz FRED usunięty');
    rec('klucz', !leak(), 'klucze nie trafiają do localStorage');
    rec('klucz', !posts.filter((p) => /\/api\/sync$/.test(p.url)).some((p) => [K.dbKey, K.fredKey].some((k) => JSON.stringify(p.body).includes(k))), 'klucze nie trafiają do bloku ustawień w Notion');

    // ---------- kredyt ----------
    $('.sp [data-act="zr-cr-edit"]').click();
    await until(() => $('.sp #sv-cr-start'));
    $('.sp #sv-cr-start').value = '100'; $('.sp #sv-cr-spent').value = '0.5'; $('.sp #sv-cr-exp').value = '2031-05-01';
    $('.sp [data-act="zr-cr-next"]').click();
    await until(() => $('.sp [data-act="zr-cr-save"]'));
    rec('kredyt', /zostaje 99,50 z 100,00 USD, ważny do 2031-05-01/.test(txt('.sp #sv-g-kredyt .sv-confirm')) && !posts.some((p) => /candles\/limit/.test(p.url)), `potwierdzenie przed zapisem: ${txt('.sp #sv-g-kredyt .sv-confirm').slice(0, 90)}`);
    $('.sp [data-act="zr-cr-save"]').click();
    await until(() => /99,50 z 100,00 USD, ważny do 2031-05-01/.test(txt('.sp #sv-g-kredyt .sp-kvs')), 8000);
    const crPost = posts.find((p) => /candles\/limit/.test(p.url));
    rec('kredyt', crPost?.body?.confirm === true && crPost.body.creditStartUsd === 100 && crPost.body.creditSpentUsd === 0.5, `kredyt zapisany z confirm: ${JSON.stringify(crPost?.body)}`);
    rec('kredyt', $('.sp #sv-g-kredyt .sv-bar[role="progressbar"]'), 'pasek pozostałego kredytu');
    // ---------- limity: podniesienie z potwierdzeniem, obniżenie bez ----------
    $('.sp [data-act="zr-lim-edit"]').click();
    await until(() => $('.sp #sv-lim-one'));
    $('.sp #sv-lim-one').value = '2'; $('.sp #sv-lim-day').value = '3';
    const nLim = posts.filter((p) => /candles\/limit/.test(p.url)).length;
    $('.sp [data-act="zr-lim-next"]').click();
    await until(() => $('.sp [data-act="zr-lim-save"]'));
    rec('limity', /Podnosisz limit na jedno pobranie z 1,00 do 2,00 USD/.test(txt('.sp #sv-g-kredyt .sv-confirm')) && posts.filter((p) => /candles\/limit/.test(p.url)).length === nLim, `podniesienie: ${txt('.sp #sv-g-kredyt .sv-confirm').slice(0, 90)}`);
    $('.sp [data-act="zr-lim-save"]').click();
    await until(() => /Limit na jedno pobranie 2,00 USD/.test($$('.sp #sv-g-kredyt .sp-kv').map((k) => [...k.children].map((c) => c.textContent.trim()).join(' ')).join(' | ')), 8000);
    rec('limity', posts.some((p) => /candles\/limit/.test(p.url) && p.body?.maxCostUsd === 2), 'limit 2 USD zapisany');
    $('.sp [data-act="zr-lim-edit"]').click();
    await until(() => $('.sp #sv-lim-one'));
    $('.sp #sv-lim-one').value = '1';
    $('.sp [data-act="zr-lim-next"]').click();
    await until(() => posts.some((p) => /candles\/limit/.test(p.url) && p.body?.maxCostUsd === 1), 6000);
    rec('limity', posts.some((p) => /candles\/limit/.test(p.url) && p.body?.maxCostUsd === 1) && !$('.sp [data-act="zr-lim-save"]'), 'obniżenie bez potwierdzenia');
    // ---------- okno 1s NQ: włączenie z potwierdzeniem kosztu ----------
    const nq = $('.sp [data-act="ch-nq1s"]'); nq.checked = true; fire(nq, 'change');
    await until(() => $('.sp [data-act="zr-nq-ok"]'));
    rec('automat', /0,02 USD/.test(txt('.sp #sv-g-automat .sv-confirm')) && !posts.some((p) => /\/api\/config$/.test(p.url) && p.body?.chartNq1sDaily === true), 'włączenie czeka na potwierdzenie kosztu');
    $('.sp [data-act="zr-nq-ok"]').click();
    await until(() => posts.some((p) => /\/api\/config$/.test(p.url) && p.body?.chartNq1sDaily === true), 6000);
    rec('automat', posts.some((p) => /\/api\/config$/.test(p.url) && p.body?.chartNq1sDaily === true), 'okno 1s NQ włączone po potwierdzeniu');
    rec('automat', /Kolejka pobierania/.test(txt('.sp #sv-g-automat')) && /Kolejka jest pusta|Czeka/.test(txt('.sp #sv-g-automat')), 'kolejka z opisem stanu');

    // ---------- import 1m: wycena → wpisanie kwoty → pobranie ----------
    await until(() => !$('.sp [data-act="zr-imp-quote"][data-v="1m"]').disabled, 6000);
    const from = $('.sp #sv-imp1m-from'); from.value = '2024-03-11'; fire(from, 'change');
    const to = $('.sp #sv-imp1m-to'); to.value = '2024-03-12'; fire(to, 'change');
    $('.sp [data-act="zr-imp-quote"][data-v="1m"]').click();
    await until(() => $('.sp #sv-imp1m-ok'), 15000);
    rec('import', /Wycena: 0,01 USD za NQ 2024-03-11 – 2024-03-12 \(zakresów do pobrania: \d+\)/.test(txt('.sp #sv-g-import .sv-confirm')), `wycena: ${txt('.sp #sv-g-import .sv-confirm').slice(0, 120)}`);
    rec('import', posts.some((p) => /candles\/import$/.test(p.url) && p.body?.dryRun === true), 'wycena przez dryRun (bezpłatna)');
    $('.sp #sv-imp1m-ok').value = '0,02'; $('.sp [data-act="zr-imp-go"][data-v="1m"]').click();
    await until(() => /Wpisz dokładnie kwotę 0,01/.test(txt('.sp #sv-g-import')));
    rec('import', /Wpisz dokładnie kwotę 0,01/.test(txt('.sp #sv-g-import')) && !posts.some((p) => /candles\/import$/.test(p.url) && p.body?.confirmedCostUsd !== undefined), 'zła kwota: bez pobrania');
    $('.sp #sv-imp1m-ok').value = '0,01'; $('.sp [data-act="zr-imp-go"][data-v="1m"]').click();
    await until(() => posts.some((p) => /candles\/import$/.test(p.url) && p.body?.confirmedCostUsd !== undefined), 6000);
    const go = posts.find((p) => /candles\/import$/.test(p.url) && p.body?.confirmedCostUsd !== undefined);
    rec('import', go && go.body.dryRun === undefined && go.body.instrument === 'NQ' && go.body.confirmedCostUsd > 0 && go.body.limitsOverrideUsd === undefined, `pobranie z potwierdzoną wyceną: ${JSON.stringify(go?.body)}`);
    await until(() => /Import ruszył|Pobieram/.test(txt('.sp #sv-g-import')), 8000);
    rec('import', /Import ruszył|Pobieram/.test(txt('.sp #sv-g-import')), `stan importu: ${txt('.sp #sv-g-import').slice(0, 160)}`);
    // ---------- okna 1s: wycena z budżetem ----------
    await until(() => !$('.sp [data-act="zr-imp-quote"][data-v="1s"]').disabled, 10000);
    const f1 = $('.sp #sv-imp1s-from'); f1.value = '2024-03-11'; fire(f1, 'change');
    const t1 = $('.sp #sv-imp1s-to'); t1.value = '2024-03-12'; fire(t1, 'change');
    $('.sp [data-act="zr-imp-quote"][data-v="1s"]').click();
    await until(() => $('.sp #sv-imp1s-ok'), 15000);
    rec('import', /Wycena: [\d,]+ USD za okna NQ 2024-03-11 – 2024-03-12 \(dni z oknem: 2,/.test(txt('.sp #sv-g-import')) && /Budżet importu okien 1s: wydano 0,00 z 36 USD/.test(txt('.sp #sv-g-import')), `wycena okien 1s: ${(txt('.sp #sv-g-import').match(/Wycena: [^.]*\./g) || []).join(' | ')}`);
    rec('import', noHScroll(), 'bez poziomego przewijania po wycenach');

    // ---------- rozcięcie: wygląd newsów i earningsów w Wykresach ----------
    location.hash = '#ustawienia/wykresy/newsy';
    await until(() => $('.sp #sv-g-newsy [data-chk="news"]'));
    rec('rozciecie', $('.sp #sv-g-newsy [data-chk="news"]') && $('.sp [data-chk^="newsImp-"]') && $('.sp #sv-g-earningsy [data-chk="earnings"]') && $('.sp #sp-earn-sym') && !$('.sp #sp-fredkey'), 'Wykresy: newsy i earningsy bez kluczy');
    rec('rozciecie', noHScroll(), 'Wykresy bez poziomego przewijania');
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal, w: innerWidth });
})()
