// Scenariusz N5 na prawdziwym dashboardzie testowym (atrapa Notion, katalog tymczasowy bez kopii).
// Wyrażenie wykonywane przez testy/przegladarka.mjs (cdpPage, extract): zwraca JSON { checks: [{ tag, ok, msg }], fatal }.
// Zmianę „zrobioną w Notion” po kopii (R = 77 w jednym wpisie) robi test w Node na atrapie, gdy w backups/ pojawi się kopia ręczna.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(40); } return null; };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const sp = () => $('.sp');
  const txt = (s) => ($(s)?.textContent || '').replace(/\s+/g, ' ').trim();
  const posts = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    if ((o.method || 'GET') === 'POST') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } posts.push({ url: String(u), body }); }
    return of(u, o);
  };
  const T = window.__thq;
  const noHScroll = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && (!sp() || sp().scrollWidth <= sp().clientWidth + 1);
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 15000);
    location.hash = '#ustawienia/diag/kopie';
    const g = await until(() => $('.sp #sv-g-kopie .sv-bk-empty'), 10000);
    rec('lista', g && /Nie ma jeszcze kopii/.test(g.textContent), `pusta lista z opisem (${g?.textContent})`);
    rec('lista', /niczego nie usuwa/.test(txt('.sp #sv-g-kopie')), 'opis: przywracanie niczego nie usuwa');
    // kopia teraz
    $('.sp [data-act="bk-create"]').click();
    const row = await until(() => $('.sp .sv-bk[data-name]'), 20000);
    rec('lista', row && posts.some((p) => /\/api\/backups\/create$/.test(p.url)), 'kopia teraz: nowy wiersz po zadaniu w tle');
    const rt = row?.textContent.replace(/\s+/g, ' ') || '';
    rec('lista', /ręczna/.test(rt) && /Trade'y \d+/.test(rt) && /(KB|MB| B)/.test(rt) && /wersja \d+\.\d+\.\d+/.test(rt), `wiersz: powód, liczby, rozmiar, wersja (${rt})`);
    rec('lista', !$$('.sp #sv-g-kopie button').some((b) => /Usuń/.test(b.textContent)), 'brak przycisku usuwania kopii (decyzja 7)');
    rec('lista', noHScroll(), `bez poziomego przewijania (${innerWidth} px)`);

    // zmiana „w Notion” po kopii: robi ją test w Node (atrapa), gdy w backups/ pojawi się kopia ręczna; strona czeka, aż dane ją pokażą
    const r77 = async () => { try { const d = await (await of('/api/data?refresh=1', { cache: 'no-store' })).json(); return d.data.trades.some((x) => x.r === 77); } catch { return false; } };
    rec('przywroc', await until(r77, 20000), 'zmiana w Notion po kopii widoczna w danych');
    // podgląd
    $('.sp .sv-bk [data-act="bk-preview"]').click();
    const pv = await until(() => $('.sp .sv-bk-pv [data-fk="bk-confirm"]'), 20000);
    const pt = txt('.sp .sv-bk-pv');
    rec('przywroc', pv && /zmieni 1 wpis/.test(pt) && /Przywróci pola w 1 wpisie/.test(pt), `podgląd: liczby wpisów i pól (${pt.slice(0, 200)})`);
    rec('przywroc', /Wpisy dodane po tej kopii zostają/.test(pt) && /kopię obecnego stanu/.test(pt), 'podgląd: co zostaje i kopia bezpieczeństwa');
    rec('przywroc', !posts.some((p) => /\/api\/backups\/restore$/.test(p.url)), 'podgląd bez żądania zapisu');
    // złe słowo
    pv.value = 'tak'; pv.dispatchEvent(new Event('input', { bubbles: true }));
    $('.sp [data-act="bk-restore"]').click();
    await sleep(200);
    rec('przywroc', !posts.some((p) => /\/api\/backups\/restore$/.test(p.url)) && /Wpisz dokładnie TAK/.test(txt('.sp .sv-bk-pv')), 'złe słowo: komunikat, bez żądania');
    // TAK
    const inp = $('.sp .sv-bk-pv [data-fk="bk-confirm"]');
    inp.value = 'TAK'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    $('.sp [data-act="bk-restore"]').click();
    const done = await until(() => /Przywrócono 1 wpis/.test(txt('.sp #sv-g-kopie')) && $('.sp #sv-g-kopie'), 30000);
    rec('przywroc', done && posts.some((p) => /\/api\/backups\/restore$/.test(p.url) && p.body.confirm === 'TAK'), `przywrócenie po „TAK” (${txt('.sp #sv-g-kopie').slice(0, 300)})`);
    rec('przywroc', /Kopia stanu sprzed przywrócenia/.test(txt('.sp #sv-g-kopie')) && $$('.sp .sv-bk[data-name]').length === 2 && /przed przywróceniem/.test(txt('.sp .sv-bk[data-name]')), 'wynik z kopią bezpieczeństwa na górze listy');
    rec('przywroc', !(await r77()), 'wartość wróciła w Notion (atrapa)');
    rec('przywroc', noHScroll(), `bez poziomego przewijania po przywróceniu (${innerWidth} px)`);
  } catch (e) { fatal = String(e?.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
