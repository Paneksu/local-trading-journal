// N2 (1.6.0): Ustawienia → Backtest. Logika przeniesiona bez zmian z zakładki „Backtest” popovera (pakiet C2, K, M):
// skoki (nazwa, cel, skrót), skróty akcji replayu, szablony filtra dni, domyślna godzina startu, ryzyko i szybkość. Skrót wpisuje się naciśnięciem
// klawisza w polu (Backspace czyści). Kolizja skrótów (z zarezerwowanym, między skokami i akcjami) blokuje zapis: pola się podświetlają,
// w ustawieniach zostaje ostatni poprawny stan.
import { t } from './i18n.js';
import { btDefaults, sanitizeBt, collisions, skrotOf, skrotLabel, SKROT_ACTIONS, CEL_KINDS, BT_SPEEDS } from './bt-czas.js';
import { SESSIONS } from './swiece.js';
import { esc, L, X_ICON, gHead, grp } from './ust-wspolne.js';

const btClone = (x) => JSON.parse(JSON.stringify(x));

// final (ocena wyglądu P3): skrót w polu jak na klawiaturze („Shift + →” zamiast „Shift+ArrowRight”); zapis w ustawieniach bez zmian
const skrotShow = (s) => skrotLabel(s).replace(/\+(?!$)/g, ' + ');
export function createBacktestSec(ctx) {
  const { settings } = ctx;
  // szkic edycji; do settings.bt trafia tylko szkic bez kolizji skrótów
  let btDraft = null, btMsg = '';
  const root = () => ctx.root();
  const btActionLabel = () => ({
    play: t('Odtwarzaj / pauza'), stepFwd: t('Krok w przód'), stepBack: t('Krok wstecz'), jump: t('Skok wybrany w menu (przycisk Skocz)'), speedUp: t('Szybciej'), speedDown: t('Wolniej'),
    buy: t('Kup rynkowo'), sell: t('Sprzedaj rynkowo'), closeAll: t('Zamknij pozycję'), drawEntry: t('Wejdź według rysunku'), be: t('SL na BE'), half: t('Zamknij połowę pozycji'),
  });
  // K (31.10.2026): bez puli dni, [U] 31.10.2026 «Filtr jako skok»
  const btCelLabel = () => ({ time: t('Godzina NY'), session: t('Początek sesji'), news: t('Następny news'), offset: t('Przesunięcie (min)'), nextDay: t('Następny dzień (godzina startu)'), filterDay: t('Następny dzień z filtra') });
  const btSessionName = (id) => ({ asia: t('Azja'), london: t('Londyn'), ny: 'NY' }[id] || id);
  function btCelParam(j, i) {
    const c = j.cel;
    if (c.kind === 'time') return `<input class="sp-in" type="time" data-btf="cel.at" data-i="${i}" data-fk="btj-${i}-at" value="${esc(c.at)}" aria-label="${L('Godzina NY')}">`;
    if (c.kind === 'session') return `<select class="sp-in sp-sel" data-btf="cel.id" data-i="${i}" data-fk="btj-${i}-id" aria-label="${L('Początek sesji')}">${SESSIONS.map((x) => `<option value="${x.id}"${x.id === c.id ? ' selected' : ''}>${esc(btSessionName(x.id))}</option>`).join('')}</select>`;
    if (c.kind === 'news') return `<select class="sp-in sp-sel" data-btf="cel.minImp" data-i="${i}" data-fk="btj-${i}-imp" aria-label="${L('Waga newsa')}"><option value="high"${c.minImp === 'high' ? ' selected' : ''}>${L('wysoka')}</option><option value="medium"${c.minImp === 'medium' ? ' selected' : ''}>${L('średnia i wysoka')}</option></select>`;
    if (c.kind === 'offset') return `<input class="sp-in" type="number" min="1" max="600" step="1" data-btf="cel.min" data-i="${i}" data-fk="btj-${i}-min" value="${Math.round(c.sec / 60)}" aria-label="${L('Przesunięcie (min)')}">`;
    return '';
  }
  // F2: szablony filtra dni zapisane w kreatorze (bt.templates = [{ name, filterJ }]); tu tylko zmiana nazwy i usunięcie, bez szkicu (kreator też je zapisuje)
  function btTemplatesHtml() {
    const list = sanitizeBt(settings.bt).templates;
    if (!list.length) return `<p class="note">${L('Szablony zapisujesz w kreatorze sesji, w sekcji Filtr dni (zaawansowane).')}</p>`;
    return `<div class="bt-tpl">${list.map((e, i) => `<div class="bt-tpl-r"><input class="sp-in" type="text" maxlength="60" data-btt="${i}" data-fk="btt-${i}" value="${esc(e.name)}" aria-label="${L('Nazwa szablonu')}"><button type="button" class="icon-btn" data-act="bt-tdel" data-v="${i}" data-fk="btt-${i}-del" aria-label="${L('Usuń szablon')}">${X_ICON}</button></div>`).join('')}</div>`;
  }
  // E2: część sesji nie mieści się w kopii definicji w bloku ustawień: te sesje zostają tylko na tym komputerze
  function btCopyNote() {
    const c = ctx.opts.btCopyInfo();
    return c?.skipped ? `<p class="note bt-scopy">${esc(t('Sesje backtestu poza kopią w synchronizacji ustawień (limit 30 000 znaków): {n}. Te sesje są zapisane tylko na tym komputerze.', { n: c.skipped }))}</p>` : '';
  }
  function btHtml() {
    btDraft ||= btClone(sanitizeBt(settings.bt));
    const d = btDraft, cols = collisions(d.skroty, d.jumps), bad = new Set(cols.flatMap((c) => [c.a, c.b]));
    const inv = (id) => (bad.has(id) ? ' aria-invalid="true"' : '');
    const kinds = btCelLabel(), acts = btActionLabel();
    // final (ocena wyglądu P2-6): nazwa skoku jako tytuł wiersza (pole bez ramki do kliknięcia), nad polami widoczne etykiety Rodzaj, Wartość, Skrót
    const rows = d.jumps.map((j, i) => { const param = btCelParam(j, i); return `<div class="bt-sj" data-i="${i}">
        <input class="sp-in" type="text" maxlength="60" data-btf="name" data-i="${i}" data-fk="btj-${i}-name" value="${esc(j.name)}" aria-label="${L('Nazwa skoku')}" title="${L('Nazwa skoku (kliknij, aby zmienić)')}">
        <span class="lbl bt-sjl-k" aria-hidden="true">${L('Rodzaj')}</span><span class="lbl bt-sjl-v" aria-hidden="true">${param ? L('Wartość') : ''}</span>
        <select class="sp-in sp-sel" data-btf="cel.kind" data-i="${i}" data-fk="btj-${i}-kind" aria-label="${L('Cel skoku')}">${CEL_KINDS.map((k) => `<option value="${k}"${k === j.cel.kind ? ' selected' : ''}>${esc(kinds[k])}</option>`).join('')}</select>
        ${param || '<span class="bt-sj-nov" aria-hidden="true"></span>'}
        <span class="lbl bt-sjk" aria-hidden="true">${L('Skrót')}</span><input class="sp-in bt-skrot" type="text" readonly title="${esc(skrotShow(j.skrot))}" data-bts="jump:${esc(j.id)}" data-i="${i}" data-fk="btj-${i}-skrot" value="${esc(skrotShow(j.skrot))}" placeholder="${L('skrót')}" aria-label="${L('Skrót skoku')}"${inv('jump:' + j.id)}>
        <button type="button" class="icon-btn" data-act="bt-del" data-v="${i}" data-fk="btj-${i}-del" aria-label="${L('Usuń skok')}">${X_ICON}</button></div>`; }).join('');
    const actRows = SKROT_ACTIONS.map((a) => `<label class="bt-sa"><span>${esc(acts[a] || a)}</span><input class="sp-in bt-skrot" type="text" readonly title="${esc(skrotShow(d.skroty[a]))}" data-bts="skroty:${a}" data-fk="bta-${a}" value="${esc(skrotShow(d.skroty[a]))}" placeholder="${L('skrót')}" aria-label="${esc(acts[a] || a)}"${inv(a)}></label>`).join('');
    const mode = (m, l) => `<button type="button" data-act="bt-risk-mode" data-v="${m}" data-fk="btd-mode-${m}" aria-pressed="${d.risk.mode === m}">${esc(l)}</button>`;
    return grp(`${gHead('sv-bt-jumps', 'Skoki')}<div class="sp-f">
        <div class="bt-sjl">${rows || `<p class="note">${L('Brak skoków.')}</p>`}</div>
        <div class="bt-sjb"><button type="button" class="btn ghost sm" data-act="bt-add" data-fk="bt-add">${L('Dodaj skok')}</button><button type="button" class="btn ghost sm" data-act="bt-reset" data-fk="bt-reset">${L('Przywróć domyślne')}</button></div>
        <p class="note">${L('Skok jest pod przyciskiem „Skocz” przy pasku replayu i pod własnym skrótem. Skrót wpisujesz, naciskając klawisze w polu; Backspace czyści.')}</p></div>`, 'skoki')
      + grp(`${gHead('sv-bt-keys', 'Skróty akcji')}<div class="sp-f"><div class="bt-sal">${actRows}</div></div>
      <p class="note bt-serr" role="alert"${cols.length ? '' : ' hidden'}>${L('Skróty kolidują ze sobą albo z klawiszami wykresu (Escape, strzałki, Ctrl+Z, +, −, Enter). Zmiana nie została zapisana.')}</p>`, 'skroty')
      + grp(`${gHead('sv-bt-def', 'Domyślne wartości nowej sesji')}<div class="sp-f">
        <div class="bt-sdef"><label class="bt-sa"><span>${L('Godzina startu (NY)')}</span><input class="sp-in" type="time" data-btd="startTime" data-fk="btd-start" value="${esc(d.startTime)}"></label>
        <div class="bt-sa"><span>${L('Ryzyko na trade')}</span><div class="bt-row"><div class="seg sm" role="group" aria-label="${L('Rodzaj ryzyka')}">${mode('usd', 'USD')}${mode('pct', t('% salda'))}</div><input class="sp-in" type="number" min="0" step="any" data-btd="risk" data-fk="btd-risk" value="${d.risk.value}" aria-label="${L('Wartość ryzyka')}"></div></div>
        <label class="bt-sa"><span>${L('Szybkość odtwarzania')}</span><select class="sp-in sp-sel" data-btd="speed" data-fk="btd-speed">${BT_SPEEDS.map((v) => `<option value="${v}"${v === d.speed ? ' selected' : ''}>${v}×</option>`).join('')}</select></label></div>
        <p class="note bt-smsg" role="status">${esc(btMsg)}</p></div>`, 'domyslne')
      + grp(`${gHead('sv-bt-tpl', 'Szablony filtra dni')}<div class="sp-f">${btTemplatesHtml()}</div>${btCopyNote()}`, 'szablony');
  }
  function btTplSet(list) { settings.bt = sanitizeBt({ ...settings.bt, templates: list }); ctx.save(); ctx.opts.onBt(settings.bt); ctx.rerender(); }
  // Zapis szkicu: tylko bez kolizji skrótów. settings.bt przechodzi sanitizeBt (zły skok odpada), potem zapis i synchronizacja.
  function btCommit() {
    if (collisions(btDraft.skroty, btDraft.jumps).length) { ctx.rerender(); return false; }
    // E2: kopię definicji sesji prowadzi app.js, szkic jej nie cofa; F2: szablony filtra też (zapisuje je kreator)
    settings.bt = sanitizeBt({ ...btClone(btDraft), sessionsCopy: settings.bt?.sessionsCopy || [], templates: settings.bt?.templates || [] });
    ctx.save(); ctx.opts.onBt(settings.bt);
    ctx.rerender();
    return true;
  }
  function btField(el) {
    const d = btDraft, f = el.dataset.btf, i = Number(el.dataset.i), j = d.jumps[i];
    if (!j) return;
    btMsg = '';
    if (f === 'name') j.name = el.value.trim().slice(0, 60) || j.name;
    else if (f === 'cel.kind') j.cel = ({ time: { kind: 'time', at: '09:30' }, session: { kind: 'session', id: 'ny' }, news: { kind: 'news', minImp: 'high' }, offset: { kind: 'offset', sec: 900 }, nextDay: { kind: 'nextDay' }, filterDay: { kind: 'filterDay' } })[el.value] || j.cel;
    else if (f === 'cel.at') { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(el.value)) j.cel.at = el.value; else btMsg = t('Podaj godzinę w formacie GG:MM.'); }
    else if (f === 'cel.id') j.cel.id = el.value;
    else if (f === 'cel.minImp') j.cel.minImp = el.value === 'medium' ? 'medium' : 'high';
    else if (f === 'cel.min') { const m = Math.round(Number(el.value)); if (m >= 1 && m <= 600) j.cel.sec = m * 60; else btMsg = t('Przesunięcie: od 1 do 600 minut.'); }
    btCommit();
  }
  function btDefault(el) {
    const d = btDraft, k = el.dataset.btd;
    btMsg = '';
    if (k === 'startTime') { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(el.value) && el.value < '16:00') d.startTime = el.value; else btMsg = t('Godzina startu: od 00:00 do 15:59 NY.'); }
    else if (k === 'risk') { const v = Number(el.value); if (v > 0 && !(d.risk.mode === 'pct' && v > 100)) d.risk.value = v; else btMsg = d.risk.mode === 'pct' ? t('Ryzyko w % salda: od 0 do 100.') : t('Ryzyko musi być większe od zera.'); }
    else if (k === 'speed') d.speed = Number(el.value);
    btCommit();
  }
  // Pole skrótu: naciśnięty klawisz zamienia się w tekst skrótu (skrotOf). Tab i Escape zostają (nawigacja i zamknięcie okna).
  function onKeyDown(ev) {
    const el = ev.target;
    if (!el?.matches?.('[data-bts]') || !btDraft) return;
    if (ev.key === 'Tab' || ev.key === 'Escape') return;
    ev.preventDefault();
    const [grpName, id] = el.dataset.bts.split(':');
    const value = ev.key === 'Backspace' || ev.key === 'Delete' ? '' : skrotOf(ev);
    // sam modyfikator
    if (value === '' && ev.key !== 'Backspace' && ev.key !== 'Delete') return;
    if (grpName === 'skroty') btDraft.skroty[id] = value;
    else { const j = btDraft.jumps.find((x) => x.id === id); if (j) j.skrot = value; }
    btMsg = '';
    btCommit();
  }
  function handle(act, v) {
    switch (act) {
      case 'bt-add': btDraft.jumps.push({ id: 'j' + Date.now().toString(36), name: t('Nowy skok'), cel: { kind: 'offset', sec: 300 }, skrot: '' }); btCommit(); root().querySelector('[data-fk="bt-add"]')?.focus(); return true;
      case 'bt-tdel': { const list = sanitizeBt(settings.bt).templates; list.splice(Number(v), 1); btTplSet(list); return true; }
      case 'bt-del': btDraft.jumps.splice(Number(v), 1); btCommit(); return true;
      case 'bt-reset': { const dflt = btDefaults(); btDraft.jumps = dflt.jumps; btCommit(); return true; }
      case 'bt-risk-mode': if (btDraft.risk.mode !== v) { btDraft.risk.mode = v === 'pct' ? 'pct' : 'usd'; if (v === 'pct' && btDraft.risk.value > 100) btDraft.risk.value = 1; } btCommit(); return true;
      default: return false;
    }
  }
  function onChange(ev) {
    if (ev.target.matches('[data-btt]')) {
      const list = sanitizeBt(settings.bt).templates, i = Number(ev.target.dataset.btt), name = ev.target.value.trim().slice(0, 60);
      if (list[i] && name && !list.some((e, k) => k !== i && e.name === name)) { list[i].name = name; btTplSet(list); } else ctx.rerender();
      return true;
    }
    if (ev.target.matches('[data-btf]')) { btField(ev.target); return true; }
    if (ev.target.matches('[data-btd]')) { btDefault(ev.target); return true; }
    return false;
  }
  return { id: 'backtest', html: btHtml, handle, onInput: () => false, onChange, onKeyDown, onEscape: () => false, leave() { btDraft = null; btMsg = ''; } };
}
