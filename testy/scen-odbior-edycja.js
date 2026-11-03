// Scenariusz odbioru 1.7.0 r2 (P1-3): edycja starego wpisu (zapisanego w czasie polskim) NIE wysyła daty i godziny, jeśli ich nie zmieniono; zmieniona godzina idzie w NY.
// Decyzja sesji głównej 3.11.2026: formularz wysyła datę/godzinę tylko po zmianie, inaczej zapis utrwaliłby zegar z dashboardu (np. 04:30 NY ze starego 10:30 Warszawa).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks, fatal, id, id2, startBefore }. Testy: testy/backtest-odbior-strefa.mjs.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(30); } return null; };
  const $ = (s) => document.querySelector(s);
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  const T = window.__thq;
  let fatal = null, id = null, id2 = null, startBefore = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    const raw = (await (await fetch('/api/data')).json()).data.trades;
    const timed = T.model.trades.filter((x) => x.time && !x.name.startsWith('DEMO'));
    const a = timed[0], b = timed[1];
    id = a.id; id2 = b.id;
    startBefore = raw.find((r) => r._id === a.id).date;
    rec('edycja', /\+0[12]:00$/.test(startBefore), `stary wpis ma przesunięcie Warszawy (${startBefore})`);
    // 1) zmiana samej notatki
    T.form.open(a, null);
    await until(() => $('#trade-form #f-time'));
    rec('edycja', $('#f-time').value === a.time, `formularz pokazuje godzinę ${a.time} z dashboardu (NY)`);
    const n = $('#f-notes'); n.value = 'tylko notatka'; fire(n, 'input'); fire(n, 'change');
    $('#f-save').click();
    rec('edycja', !!(await until(() => !$('#trade-form'), 12000)), 'formularz zamknął się po zapisie samej notatki');
    // 2) zmiana godziny innego wpisu
    await sleep(600);
    await T.load(true); await sleep(300);
    T.form.open(T.model.trades.find((x) => x.id === b.id), null);
    await sleep(300);
    await until(() => $('#trade-form #f-time'));
    const t = $('#f-time'); t.value = '08:15'; fire(t, 'input'); fire(t, 'change');
    $('#f-save').click();
    rec('edycja', !!(await until(() => !$('#trade-form'), 12000)), `formularz zamknął się po zmianie godziny (banner: ${$('#f-banner')?.textContent}; błędy: ${[...document.querySelectorAll('.ferr:not([hidden])')].map((e) => e.textContent).join(' | ')})`);
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal, id, id2, startBefore });
})()
