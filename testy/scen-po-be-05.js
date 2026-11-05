// Scenariusz po-be-05 na prawdziwym dashboardzie testowym (atrapa Notion i Databento, katalog tymczasowy, bez klucza Databento):
// przełącznik dobierania świec do wyniku po BE w Ustawienia → Źródła danych: potwierdzenie kosztu, brak POST przed potwierdzeniem, Anuluj z fokusem, zapis true i false, wydana kwota.
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
  const cfgPosts = () => posts.filter((p) => 'chartAfterBe' in p);
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && window.__thq?.model, 15000);
    // trzy trade'y Live wybite na BE, z różnych dni, bez świec w magazynie: wiersze prawdziwego widoku Trade'y
    // trzy kolejne dni robocze (czwartek, środa, wtorek) w południe UTC, ok. 10 dni wstecz: żadnych weekendów, a pora dnia nie przesuwa wyjścia za koniec dnia handlowego
    const thu = new Date(Date.now() - 10 * 86400000); thu.setUTCHours(12, 0, 0, 0);
    while (thu.getUTCDay() !== 4) thu.setTime(thu.getTime() - 86400000);
    const dayAgo = (k) => thu.getTime() - k * 86400000;
    const live = window.__thq.model.trades.filter((x) => x.typ === 'Live').slice(0, 3);
    live.forEach((x, k) => Object.assign(x, { be: 1, r: 0, dir: 'Long', instrument: 'ES', contract: '', entryPrice: 5025, sl: 5000, tp: 5100, at: dayAgo(k), dur: 30, counted: true }));
    const view = async (v) => { $(`[data-act="view"][data-v="${v}"]`).click(); await sleep(150); };
    await view('trades');
    const reasonTitle = () => [...document.querySelectorAll('[data-abe-cell] .abe[title]')].map((e) => e.title).find((x) => /Dobieranie świec|klucza Databento/.test(x));
    await until(reasonTitle, 8000);
    rec('powod', /Dobieranie świec jest wyłączone/.test(reasonTitle() || ''), 'wyłączone: podpowiedź przy trade\'zie: ' + reasonTitle());
    location.hash = '#ustawienia/zrodla';
    const cb = () => $('.sp [data-act="ch-after-be"]');
    await until(cb, 10000);
    rec('start', cb() && !cb().checked, 'jest kontrolka, odznaczona');
    rec('start', /0,005 USD/.test(cb().closest('label').textContent), 'etykieta z ceną: ' + cb().closest('label').textContent);
    await until(() => /Zablokowane pozycje/.test($('.sp').textContent), 6000);
    rec('zablokowane', /Zablokowane pozycje dobierania do wyniku po BE: 1/.test($('.sp').textContent), 'kolejka opisuje zablokowane pozycje po BE');
    const delTxt = async (key) => { location.hash = '#ustawienia/dysk'; await until(() => $(`.sp [data-act="dysk-del"][data-v="${key}"]`), 10000); $(`.sp [data-act="dysk-del"][data-v="${key}"]`).click(); await until(() => $('.sp .sv-confirm')); const t = $('.sp .sv-confirm').textContent.replace(/\s+/g, ' '); $('.sp [data-act="dysk-del-no"]').click(); await until(() => !$('.sp .sv-confirm')); location.hash = '#ustawienia/zrodla'; await until(cb, 10000); await sleep(200); return t; };
    rec('dysk', !/wyniku po BE/.test(await delTxt('NQ|1m')), 'wyłączone: bez ostrzeżenia o dobieraniu');

    cb().checked = true; fire(cb(), 'change');
    await until(() => $('.sp [data-act="zr-abe-ok"]'));
    const conf = $('.sp #sv-abe-c')?.closest('.sv-confirm')?.textContent.replace(/\s+/g, ' ') || '';
    rec('potwierdzenie', !!$('.sp [data-act="zr-abe-ok"]') && !cfgPosts().length, 'potwierdzenie widoczne, zero POST przed potwierdzeniem');
    rec('potwierdzenie', /0,005 USD/.test(conf) && /Live/.test(conf) && /limitach i kredycie/.test(conf), 'koszt i zakres: ' + conf.slice(0, 240));
    rec('potwierdzenie', /zapisaniu klucza Databento/.test(conf), 'bez klucza potwierdzenie mówi, czego brakuje');
    await until(() => !$('.sp [data-act="zr-abe-ok"]')?.disabled);
    const conf2 = $('.sp #sv-abe-c')?.closest('.sv-confirm')?.textContent.replace(/\s+/g, ' ') || '';
    rec('szacunek', /Dni handlowe bez świec: 3\./.test(conf2) && /ok\. 0,015 USD/.test(conf2), 'szacunek z trzech dni: ' + conf2.slice(0, 500));
    rec('szacunek', /zaległości ok\. 0,015 USD/.test($('.sp [data-act="zr-abe-ok"]').textContent), 'kwota na przycisku: ' + $('.sp [data-act="zr-abe-ok"]').textContent);
    rec('szacunek', /szacun/i.test(conf2) && /20 pozycji/.test(conf2), 'słowo szacunek i porcje: ' + conf2.slice(0, 500));
    rec('potwierdzenie', document.activeElement === $('.sp [data-act="zr-abe-ok"]'), 'fokus na przycisku potwierdzenia');
    $('.sp [data-act="zr-abe-no"]').click();
    await until(() => !$('.sp [data-act="zr-abe-ok"]'));
    rec('anuluj', !cb().checked && !cfgPosts().length && document.activeElement === cb(), 'Anuluj: odznaczone, zero POST, fokus na polu');

    cb().checked = true; fire(cb(), 'change');
    await until(() => $('.sp [data-act="zr-abe-ok"]') && !$('.sp [data-act="zr-abe-ok"]').disabled);
    $('.sp [data-act="zr-abe-ok"]').click();
    const samples = [];
    for (let i = 0; i < 20; i++) { samples.push(cb()?.checked ? 1 : 0); await sleep(25); }
    await until(() => cfgPosts().some((p) => p.chartAfterBe === true));
    await sleep(500);
    rec('wlacz', cfgPosts().some((p) => p.chartAfterBe === true) && cb().checked && !$('.sp [data-act="zr-abe-ok"]'), 'POST true, pole zaznaczone, bez potwierdzenia');
    rec('wlacz', samples.every((x) => x === 1), 'bez mignięcia pola: ' + samples.join(''));
    const meta = await (await of('/api/meta')).json();
    rec('wlacz', meta.chartAfterBe === true && meta.chart1mDaily === false, 'meta: po BE włączone, minutówki nie');
    const srcs = await (await of('/api/sources')).json();
    rec('wlacz', srcs.databento?.afterBe === true && srcs.databento?.afterBeSpentUsd === 0, 'sources: ' + JSON.stringify([srcs.databento?.afterBe, srcs.databento?.afterBeSpentUsd]));
    rec('wlacz', /Wydano dotąd: 0,00 USD/.test(cb().closest('.sp-f').textContent), 'wydana kwota: ' + cb().closest('.sp-f').textContent.replace(/\s+/g, ' ').slice(0, 300));

    rec('dysk', /Dobieranie świec do wyniku po BE jest włączone/.test(await delTxt('NQ|1m')), 'włączone: ostrzeżenie o ponownym pobraniu');

    // po włączeniu, bez klucza: podpowiedź mówi o kluczu (stan z /api/sources przy wejściu na widok)
    location.hash = '';
    window.__thq.ust?.close?.();
    await sleep(200);
    // N2 (runda poprawek 1): bez zmiany widoku, sama zmiana konfiguracji odświeża podpowiedź (wcześniej zostawało „wyłączone” do następnego wejścia na widok)
    await until(() => /klucza Databento/.test(reasonTitle() || ''), 4000);
    rec('powod', /klucza Databento/.test(reasonTitle() || ''), 'po włączeniu i powrocie, bez zmiany widoku: ' + reasonTitle());
    await view('stats'); await view('trades');
    await until(() => /klucza Databento/.test(reasonTitle() || ''), 8000);
    rec('powod', /klucza Databento/.test(reasonTitle() || ''), 'włączone bez klucza: ' + reasonTitle());
    location.hash = '#ustawienia/zrodla';
    await until(cb, 10000); await sleep(300);

    posts.length = 0;
    cb().checked = false; fire(cb(), 'change');
    await until(() => cfgPosts().some((p) => p.chartAfterBe === false));
    await sleep(500);
    rec('wylacz', cfgPosts().some((p) => p.chartAfterBe === false) && !cb().checked && !$('.sp [data-act="zr-abe-ok"]'), 'POST false, pole odznaczone, bez pytania');
    const meta2 = await (await of('/api/meta')).json();
    rec('wylacz', meta2.chartAfterBe === false, 'meta.chartAfterBe = false');
  } catch (e) { fatal = String(e && e.message || e); }
  return JSON.stringify({ checks, fatal });
})()
