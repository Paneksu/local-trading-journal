// Scenariusz N6 na prawdziwym dashboardzie testowym (atrapa Notion z 3 wpisami DEMO, atrapa Databento, skonfigurowana instalacja bez kluczy rynkowych).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// window.__N6 = { dbKey, expires }: fałszywy klucz przyjmowany przez atrapę Databento i data wygaśnięcia kredytu do wpisania.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(40); } return null; };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const txt = (s) => ($(s)?.textContent || '').replace(/\s+/g, ' ').trim();
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const posts = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    if ((o.method || 'GET') === 'POST') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } posts.push({ url: String(u), body }); }
    return of(u, o);
  };
  const K = window.__N6;
  const T = window.__thq;
  const noHScroll = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && (!$('.ob-body') || $('.ob-body').scrollWidth <= $('.ob-body').clientWidth + 1);
  const stepNow = () => txt('.ob-steps li.on');
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    // ---------- przebiegi ----------
    const m = await import('/js/pierwsze-kroki.js');
    const f = (o) => m.flowFor(o);
    rec('przebieg', eq(f({ configured: false, hasToken: false, path: 'nowy' }), ['witaj', 'token', 'strona', 'dziennik', 'dane', 'gotowosc', 'gotowe']), `nowy: ${f({ configured: false, hasToken: false, path: 'nowy' })}`);
    rec('przebieg', eq(f({ configured: false, hasToken: true, path: 'polacz' }), ['witaj', 'strona', 'dane', 'gotowosc', 'gotowe']), `połącz z tokenem: ${f({ configured: false, hasToken: true, path: 'polacz' })}`);
    rec('przebieg', eq(f({ configured: false, hasToken: false, path: 'kod' }), ['witaj', 'kod', 'dane', 'gotowosc', 'gotowe']), `kod: ${f({ configured: false, hasToken: false, path: 'kod' })}`);
    rec('przebieg', eq(f({ configured: true }), ['witaj', 'gotowosc', 'gotowe']), `skonfigurowana: ${f({ configured: true })}`);

    // ---------- Gotowość ----------
    T.ob.show({ at: 'gotowosc' });
    await until(() => $$('.ob .ck-grp').length === 4 && !$('.ob .st-run'), 20000);
    const groups = $$('.ob .ck-grp');
    rec('gotowosc', eq(groups.map((g) => g.dataset.grp), ['komputer', 'notion', 'rynek', 'aktualizacje']) && /Ten komputer/.test(groups[0]?.textContent) && /Dane rynkowe/.test(groups[2]?.textContent), `4 grupy: ${groups.map((g) => g.dataset.grp)}`);
    const st = (g) => (g.querySelector('.ck-grp-h .ck-st')?.className.match(/st-(\w+)/) || [])[1];
    // Aktualizacje mają jeden punkt, więc bez szczegółów; pozostałe: zielone zwinięte, z uwagą rozwinięte
    rec('gotowosc', groups.every((g) => { const s = st(g), d = g.querySelector('details'); return d ? (s === 'ok' || s === 'info' ? !d.open : d.open) : g.dataset.grp === 'aktualizacje'; }), `zielone zwinięte, z uwagą rozwinięte: ${groups.map((g) => `${g.dataset.grp}=${st(g)}/${g.querySelector('details')?.open}`)}`);
    const rynek = groups[2];
    rec('gotowosc', st(rynek) === 'info' && /Bez klucza Databento/.test(rynek.textContent) && rynek.querySelector('[data-ob="goto-dane"]'), `dane rynkowe bez klucza: informacja i przycisk (${rynek?.textContent.replace(/\s+/g, ' ').slice(0, 160)})`);
    rec('gotowosc', noHScroll(), `Gotowość bez poziomego przewijania (${innerWidth} px)`);
    await sleep(2000);
    rec('gotowosc', /Gotowość/.test(stepNow()) && $('.ob'), `po 2 s nadal Gotowość (bez automatycznego przejścia): ${stepNow()}`);

    // ---------- Dane rynkowe ----------
    rynek.querySelector('[data-ob="goto-dane"]').click();
    await until(() => $('.ob #sp-dbkey') && /nie jest wpisany/.test(txt('.ob-body')));
    rec('dane', /Dane rynkowe/.test(stepNow()) && $('.ob #sp-fredkey') && $('.ob #sp-fhkey'), `krok Dane rynkowe z kartami Databento, FRED, Finnhub (${stepNow()})`);
    rec('dane', /nie jest wpisany/.test(txt('.ob-body')) && /USD/.test(txt('.ob-body')) && /Pomiń ten krok/.test(txt('.ob-foot')), 'kredyt nie wpisany, koszty w USD, „Pomiń ten krok”');
    rec('dane', noHScroll(), `Dane rynkowe bez poziomego przewijania (${innerWidth} px)`);
    const key = $('.ob #sp-dbkey'); key.value = K.dbKey; fire(key, 'input');
    $('.ob [data-act="ch-key-save"]').click();
    await until(() => /Klucz sprawdzony i zapisany/.test(txt('.ob-body')), 15000);
    rec('dane', /Klucz sprawdzony i zapisany/.test(txt('.ob-body')) && posts.some((p) => /\/api\/sources\/key$/.test(p.url) && p.body.source === 'databento'), 'klucz zapisany po sprawdzeniu');
    rec('dane', !JSON.stringify({ ...localStorage }).includes(K.dbKey) && !$('.ob #sp-dbkey').value, 'klucz nie w localStorage i nie w polu');
    $('.ob [data-act="diag-test"][data-v="databento"]').click();
    await until(() => /Klucz działa/.test(txt('.ob-body')), 15000);
    rec('dane', /Klucz działa/.test(txt('.ob-body')), '„Testuj” pokazuje, że klucz działa');
    // kredyt: wpis z potwierdzeniem
    $('.ob [data-act="zr-cr-edit"]').click();
    await until(() => $('.ob #sv-cr-start'));
    $('.ob #sv-cr-start').value = '40'; $('.ob #sv-cr-spent').value = '0'; $('.ob #sv-cr-exp').value = K.expires;
    $('.ob [data-act="zr-cr-next"]').click();
    await until(() => $('.ob [data-act="zr-cr-save"]'));
    $('.ob [data-act="zr-cr-save"]').click();
    await until(() => /40,00/.test(txt('.ob-body')) && !$('.ob [data-act="zr-cr-save"]'), 10000);
    rec('dane', posts.some((p) => /\/api\/candles\/limit$/.test(p.url) && p.body.confirm === true && p.body.creditStartUsd === 40), 'stan kredytu zapisany z potwierdzeniem');
    // okno 1s NQ: włączenie z potwierdzeniem kosztu
    const nq = $('.ob [data-act="ch-nq1s"]');
    rec('dane', nq && !nq.checked, 'okno 1s NQ domyślnie wyłączone (decyzja 4)');
    nq.checked = true; fire(nq, 'change');
    await until(() => $('.ob [data-act="zr-nq-ok"]'));
    rec('dane', /0,02 USD/.test(txt('.ob-body')), 'koszt okna 1s przed włączeniem');
    $('.ob [data-act="zr-nq-ok"]').click();
    await until(() => posts.some((p) => /\/api\/config$/.test(p.url) && p.body.chartNq1sDaily === true));
    await until(() => !$('.ob [data-act="zr-nq-ok"]') && $('.ob [data-act="ch-nq1s"]')?.checked);
    rec('dane', $('.ob [data-act="ch-nq1s"]')?.checked && /Dalej/.test(txt('.ob-foot [data-ob="next"]')), 'okno 1s włączone, główny przycisk „Dalej”');

    // ---------- Gotowość po danych rynkowych ----------
    $('.ob [data-ob="next"]').click();
    await until(() => /Gotowość/.test(stepNow()) && $$('.ob .ck-grp').length === 4 && !$('.ob .st-run'), 20000);
    const r2 = $$('.ob .ck-grp')[2];
    rec('gotowosc', st(r2) === 'ok' && /Databento/.test(r2.textContent), `dane rynkowe po kluczu i kredycie: ok (${st(r2)})`);

    // ---------- Gotowe ----------
    $('.ob [data-ob="next"]').click();
    await until(() => /Gotowe/.test(stepNow()));
    rec('gotowe', /Dziennik działa/.test(txt('.ob-body')), `ekran Gotowe (${txt('.ob-body').slice(0, 120)})`);
    rec('gotowe', $('.ob [data-ob="guide"]') && $('.ob [data-ob="add-trade"]') && $('.ob [data-ob="finish"]'), 'przewodnik, pierwszy trade, przejście do dashboardu');
    rec('gotowe', $('.ob [data-ob="demo-preview"]') && /DEMO/.test(txt('.ob-body')), 'usunięcie danych DEMO (atrapa ma wpisy DEMO)');
    rec('gotowe', noHScroll(), `Gotowe bez poziomego przewijania (${innerWidth} px)`);
    await sleep(2000);
    rec('gotowe', $('.ob') && /Gotowe/.test(stepNow()), 'po 2 s ekran Gotowe nadal otwarty');
    $('.ob [data-ob="add-trade"]').click();
    await until(() => !$('.ob') && $('.scrim'));
    rec('gotowe', !$('.ob') && $('.scrim'), 'Dodaj pierwszy trade: kreator zamknięty, formularz otwarty');
    rec('gotowe', posts.some((p) => /\/api\/config$/.test(p.url) && p.body.onboarded === true), 'pierwsze kroki oznaczone jako zakończone');
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
