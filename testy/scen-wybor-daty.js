// Scenariusz wybor-daty (1.6.1) na dashboardzie testowym (atrapa Notion z danymi DEMO, świece syntetyczne NQ 11, 12 i 14 marca 2024, katalog tymczasowy).
// Każde podmienione pole obsługiwane jak przez użytkownika (kalendarz, wpisanie z klawiatury, presety godzin), a sprawdzana jest wartość, która trafia do zapisu:
// ma być taka sama jak z natywnego pola (RRRR-MM-DD, GG:MM). Wyrażenie dla testy/przegladarka.mjs (cdpPage, extract): JSON { checks, fatal }.
(async () => {
  const checks = [];
  const rec = (tag, cond, msg) => checks.push({ tag, ok: !!cond, msg });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(40); } return null; };
  const $ = (s) => document.querySelector(s);
  const T = window.__thq;
  const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const shown = (el) => NATIVE.get.call(el);
  const type = (el, txt) => { el.focus(); NATIVE.set.call(el, txt); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); };
  const key = (el, k, o = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const pop = () => document.querySelector('.wd-pop');
  // headless bez fokusu okna nie wysyła blur przy el.blur(): zdarzenie jak przy wyjściu z pola Tabem
  const leave = (el) => { const had = document.activeElement === el; el.blur(); if (had && !document.hasFocus()) el.dispatchEvent(new FocusEvent('blur', { relatedTarget: null })); };
  const sent = [];
  const of = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const m = (o.method || 'GET').toUpperCase();
    if (m !== 'GET') { let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch { body = o.body; } sent.push({ url: String(u), method: m, body }); }
    return of(u, o);
  };
  const lastTo = (re) => [...sent].reverse().find((p) => re.test(p.url));
  // dzień w kalendarzu: okno z pola, przejście do miesiąca strzałkami i klik w komórkę
  async function pickDay(el, iso) {
    el.closest('.wd').querySelector('.wd-ico').click();
    await until(() => pop());
    for (let i = 0; i < 400 && !pop().querySelector(`td[data-iso="${iso}"]:not(.off)`); i++) {
      const shownMonth = pop().querySelector('td:not(.off)').dataset.iso.slice(0, 7);
      pop().querySelector(`[data-wa="m"][data-v="${shownMonth < iso.slice(0, 7) ? 1 : -1}"]`).click();
    }
    pop().querySelector(`td[data-iso="${iso}"]`).click();
  }
  async function pickTime(el, hm, { preset = false } = {}) {
    el.closest('.wd').querySelector('.wd-ico').click();
    await until(() => pop());
    if (preset) pop().querySelector(`[data-wa="pre"][data-v="${hm}"]`).click();
    else { const [h, m] = hm.split(':'); const sp = pop().querySelector('[role="spinbutton"][data-p="h"]'); sp.focus(); key(sp, h[0]); key(sp, h[1]); const sm = pop().querySelector('[role="spinbutton"][data-p="m"]'); key(sm, m[0]); key(sm, m[1]); }
    pop().querySelector('[data-wa="done"]').click();
  }
  let fatal = null;
  try {
    await until(() => $('#view .page-head') && T?.model, 20000);
    await until(() => document.querySelector('input[data-wd]') || true, 100);

    // ---------- formularz trade'a ----------
    T.form.open(null, $('[data-act="add-trade"]'));
    await until(() => $('#f-date')?.closest('.wd'));
    const fd = $('#f-date'), ft = $('#f-time'), fxd = $('#f-exitDate'), fxt = $('#f-exitTime');
    rec('trade', fd && ft && fxd && fxt && [fd, ft, fxd, fxt].every((x) => x.closest('.wd')), 'cztery pola formularza mają wybierak');
    rec('trade', /^\d{4}-\d{2}-\d{2}$/.test(fd.value) && /^\d{2}\.\d{2}\.\d{4}$/.test(shown(fd)), `data wejścia: wartość ${fd.value}, w polu ${shown(fd)}`);
    await pickDay(fd, '2026-10-15');
    type(ft, '9:35'); leave(ft);
    type(fxd, '15.10.2026'); leave(fxd);
    await pickTime(fxt, '10:05');
    rec('trade', fd.value === '2026-10-15' && ft.value === '09:35' && fxd.value === '2026-10-15' && fxt.value === '10:05', `wartości pól: ${fd.value} ${ft.value} ${fxd.value} ${fxt.value}`);
    $('.modal [data-seg="typ"] button')?.click();
    const nm = $('#f-name'); if (nm) nm.value = 'Test wybieraka';
    $('#f-save').click();
    await until(() => lastTo(/\/api\/trades$/), 8000);
    const tp = lastTo(/\/api\/trades$/)?.body;
    rec('trade', tp && tp.date === '2026-10-15' && tp.time === '09:35' && tp.exitDate === '2026-10-15' && tp.exitTime === '10:05', `zapis trade'a: ${JSON.stringify(tp && { date: tp.date, time: tp.time, exitDate: tp.exitDate, exitTime: tp.exitTime })}`);
    await until(() => !$('#f-form'), 6000);
    // edycja: pola wracają z zapisu w tym samym formacie, puste godziny zostają puste
    T.form.open(null, $('[data-act="add-trade"]'));
    await until(() => $('#f-exitTime')?.closest('.wd'));
    rec('trade', $('#f-time').value === '' && $('#f-exitDate').value === '' && shown($('#f-exitDate')) === '', 'nowy trade: puste godzina i data wyjścia zostają puste');
    $('#f-time').closest('.wd').querySelector('.wd-ico').click(); await until(() => pop());
    rec('trade', pop() && !pop().querySelector('.wd-ztag') && pop().querySelector('[data-wa="clear"]'), 'godzina trade\'a bez etykiety NY, z „Wyczyść”');
    key(document.activeElement, 'Escape');
    rec('trade', !pop() && $('#f-form'), 'Escape zamyka tylko wybierak, formularz zostaje');
    $('[data-f-act="close"]')?.click();
    await sleep(100);
    if ($('[data-f-act="discard"]')) $('[data-f-act="discard"]').click();
    await until(() => !$('#f-form'), 4000);

    // ---------- Prop: konto (data zakupu) i wydatek (data) ----------
    T.prop.openKontoForm(null, document.body);
    await until(() => $('#f-bought')?.closest('.wd'));
    await pickDay($('#f-bought'), '2026-09-03');
    rec('prop', $('#f-bought').value === '2026-09-03', `data zakupu: ${$('#f-bought').value}`);
    const fn = $('#f-name'); if (fn) { fn.value = 'Konto testowe'; fn.dispatchEvent(new Event('input', { bubbles: true })); }
    $('#f-firma button')?.click();
    const sz = $('#f-size'); if (sz) sz.value = '50000';
    $('#f-save').click();
    await until(() => lastTo(/\/api\/konta$/), 6000);
    const kb = lastTo(/\/api\/konta$/)?.body;
    rec('prop', kb?.bought === '2026-09-03', `zapis konta: bought=${kb?.bought}`);
    await until(() => !$('#f-form'), 4000);
    if ($('#f-form')) { $('[data-f-act="close"]')?.click(); await sleep(100); $('[data-f-act="discard"]')?.click(); }
    T.prop.openFinanseForm(null, {}, document.body);
    await until(() => $('#f-date')?.closest('.wd'));
    type($('#f-date'), '2.10.2026'); key($('#f-date'), 'Enter');
    rec('prop', $('#f-date').value === '2026-10-02', `data wydatku: ${$('#f-date').value}`);
    $('[data-f-act="close"]')?.click(); await sleep(100); $('[data-f-act="discard"]')?.click();
    await until(() => !$('#f-form'), 4000);

    // ---------- Kalendarz: wybór dnia ----------
    $('[data-act="view"][data-v="calendar"]')?.click();
    await until(() => $('[data-cal-date]')?.closest('.wd'), 8000);
    const cd = $('[data-cal-date]');
    const r0 = $('.cal-range')?.textContent;
    await pickDay(cd, '2026-09-10');
    await sleep(100);
    rec('kalendarz', cd.value === '2026-09-10' && $('.cal-range')?.textContent !== r0, `dzień kalendarza: ${cd.value}, zakres ${r0} → ${$('.cal-range')?.textContent}`);
    rec('kalendarz', /7 wrz – 13 wrz 2026/.test($('.cal-range')?.textContent || ''), `nagłówek zakresu: tydzień z 10 września: ${$('.cal-range')?.textContent}`);

    // ---------- Ustawienia → Backtest: godzina startu i skok „do godziny” ----------
    location.hash = '#ustawienia/backtest';
    await until(() => $('.sp [data-btd="startTime"]')?.closest('.wd'), 8000);
    const st = $('.sp [data-btd="startTime"]');
    rec('ust-bt', st.closest('.wd').querySelector('.wd-tz')?.textContent === 'NY', 'godzina startu z etykietą NY');
    await pickTime(st, '09:30', { preset: true });
    await until(() => T.settings.bt?.startTime === '09:30');
    rec('ust-bt', T.settings.bt?.startTime === '09:30', `ustawienie godziny startu: ${T.settings.bt?.startTime}`);
    const at = $('.sp [data-btf="cel.at"]');
    const i = at?.dataset.i;
    if (at) { type(at, '10:15'); leave(at); }
    await until(() => T.settings.bt?.jumps?.[i]?.cel?.at === '10:15');
    rec('ust-bt', at && T.settings.bt.jumps[i].cel.at === '10:15' && $(`.sp [data-btf="cel.at"][data-i="${i}"]`)?.closest('.wd'), `skok do godziny: ${JSON.stringify(T.settings.bt?.jumps?.[i]?.cel)}`);

    // ---------- Ustawienia → Wykresy: godziny sesji ----------
    T.ust.open('wykresy');
    await until(() => $('.sp [data-ovt="london.from"]')?.closest('.wd'), 8000);
    const lf = $('.sp [data-ovt="london.from"]');
    type(lf, '3:00'); leave(lf);
    await until(() => T.settings.chart?.overlays?.sess?.london?.from === '03:00');
    rec('ust-inne', T.settings.chart?.overlays?.sess?.london?.from === '03:00' && $('.sp [data-ovt="london.from"]').closest('.wd').querySelector('.wd-tz'), `godzina sesji Londyn: ${T.settings.chart?.overlays?.sess?.london?.from}`);

    // ---------- Ustawienia → Źródła danych: kredyt „Ważny do” ----------
    T.ust.open('zrodla');
    await until(() => $('.sp [data-act="zr-cr-edit"]'), 10000);
    $('.sp [data-act="zr-cr-edit"]')?.click();
    await until(() => $('.sp #sv-cr-exp')?.closest('.wd'));
    $('.sp #sv-cr-start').value = '100'; $('.sp #sv-cr-spent').value = '0';
    await pickDay($('.sp #sv-cr-exp'), '2027-01-31');
    rec('ust-inne', $('.sp #sv-cr-exp').value === '2027-01-31', `pole „Ważny do”: ${$('.sp #sv-cr-exp')?.value}`);
    $('.sp [data-act="zr-cr-next"]').click();
    await until(() => $('.sp [data-act="zr-cr-save"]'));
    $('.sp [data-act="zr-cr-save"]')?.click();
    await until(() => lastTo(/candles\/limit/), 8000);
    rec('ust-inne', lastTo(/candles\/limit/)?.body?.creditExpires === '2027-01-31', `zapis kredytu: creditExpires=${lastTo(/candles\/limit/)?.body?.creditExpires}`);
    T.ust.close?.();
    location.hash = '';
    await sleep(100);

    // ---------- kreator sesji: data startu (dni z danymi), godzina NY, filtr dni ----------
    $('[data-act="view"][data-v="backtest"]')?.click();
    await until(() => $('[data-bt="new"]:not([disabled])'), 15000);
    $('[data-bt="new"]').click();
    await until(() => $('.bt-form [name="from"]')?.closest('.wd'), 8000);
    const fr = $('.bt-form [name="from"]'), stt = $('.bt-form [name="startTime"]');
    await until(() => fr.min && fr.max, 8000);
    rec('kreator', fr.min === '2024-03-06' && fr.max === '2024-03-14' && fr.value >= fr.min && fr.value <= fr.max, `zakres danych w polu: ${fr.min} – ${fr.max}, domyślnie ${fr.value}`);
    fr.closest('.wd').querySelector('.wd-ico').click();
    await until(() => pop()?.querySelector('td[data-iso="2024-03-06"][aria-disabled="true"]'), 8000);
    const wed = pop()?.querySelector('td[data-iso="2024-03-06"]'), sat = pop()?.querySelector('td[data-iso="2024-03-09"]'), mon = pop()?.querySelector('td[data-iso="2024-03-13"]'), early = pop()?.querySelector('td[data-iso="2024-03-05"]');
    rec('kreator', wed?.title === 'Brak świec w tym dniu' && sat?.title === 'Weekend: giełda zamknięta' && /Poza zakresem danych/.test(early?.title || '') && !mon?.hasAttribute('aria-disabled'), `dni bez danych z powodem: 6.03 „${wed?.title}”, 9.03 „${sat?.title}”, 5.03 „${early?.title}”, 13.03 z danymi`);
    const before = fr.value; sat?.click();
    rec('kreator', pop() && fr.value === before, 'dzień bez danych nie daje się wybrać');
    pop().querySelector('td[data-iso="2024-03-12"]').click();
    rec('kreator', fr.value === '2024-03-12' && shown(fr) === '12.03.2024', `data startu: ${fr.value}`);
    rec('kreator', stt.closest('.wd').querySelector('.wd-tz')?.textContent === 'NY', 'godzina startu z etykietą NY');
    await pickTime(stt, '09:30', { preset: true });
    rec('kreator', stt.value === '09:30', `godzina startu z presetu: ${stt.value}`);
    // filtr dni: zakres dat w warunku
    $('.bt-adv > summary').click();
    await until(() => $('.bt-fadd'), 8000);
    const add = $('.bt-fadd'); add.value = 'dateRange'; add.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => $('.bt-fcond [data-p="from"]')?.closest('.wd'), 4000);
    const ff = $('.bt-fcond [data-p="from"]'), ftt = $('.bt-fcond [data-p="to"]');
    // 1.6.1: pole „Od” w filtrze ma min = data startu sesji (12.03.2024), więc wcześniejsza data jest przycinana do niej
    type(ff, '11.03.2024'); leave(ff);
    await pickDay(ftt, '2024-03-14');
    rec('filtr', ff.value === '2024-03-12' && ftt.value === '2024-03-14', `zakres w filtrze: ${ff.value} – ${ftt.value}`);
    const name = $('.bt-form [name="name"]'); name.value = 'Wybierak test';
    await until(() => !$('.bt-form [data-bt="create"]').disabled, 8000);
    $('.bt-form [data-bt="create"]').click();
    await until(() => lastTo(/\/api\/backtest\/session\/save/), 10000);
    const sb = lastTo(/\/api\/backtest\/session\/save/)?.body;
    const def = (sb?.doc || sb)?.def;
    rec('kreator', def?.from === '2024-03-12' && def?.startTime === '09:30', `sesja zapisana: from=${def?.from}, startTime=${def?.startTime}`);
    const dr = JSON.stringify(def?.filter || {});
    rec('filtr', /"from":"2024-03-12"/.test(dr) && /"to":"2024-03-14"/.test(dr), `filtr w sesji: ${dr.slice(0, 160)}`);
  } catch (e) { fatal = String(e && e.stack || e); }
  return JSON.stringify({ checks, fatal });
})()
