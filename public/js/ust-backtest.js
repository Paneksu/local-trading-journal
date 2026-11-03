// N2 (1.6.0): Ustawienia → Backtest. Logika przeniesiona bez zmian z zakładki „Backtest” popovera (pakiet C2, K, M):
// skoki (nazwa, cel, skrót), skróty akcji replayu, szablony filtra dni, domyślna godzina startu, ryzyko i szybkość. Skrót wpisuje się naciśnięciem
// klawisza w polu (Backspace czyści). Kolizja skrótów (z zarezerwowanym, między skokami i akcjami) blokuje zapis: pola się podświetlają,
// w ustawieniach zostaje ostatni poprawny stan.
import { t } from './i18n.js';
import { btDefaults, sanitizeBt, collisions, skrotOf, skrotLabel, SKROT_ACTIONS, CEL_KINDS, BT_SPEEDS, BT_PRESETS } from './bt-czas.js';
import { SESSIONS } from './swiece.js';
import { presetSummary, presetErrors, newPresetId, PRESETS_MAX, PRESET_NAME_MAX, PRESET_SL_UNITS, PRESET_TP_UNITS, PRESET_SIZE_MODES, PRESET_ABE_KINDS } from './bt-presety.js';
import { TPS_MAX, equalPcts, ladderPcts } from './bt-drabinka.js';
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
    buy: t('Kup rynkowo'), sell: t('Sprzedaj rynkowo'), closeAll: t('Zamknij pozycję'), drawEntry: t('Wejdź według rysunku'), be: t('SL na BE'), half: t('Zamknij połowę pozycji'), reverse: t('Odwróć pozycję (zamknie ją i otworzy przeciwną tej samej wielkości)'),
    goDate: t('Skocz do daty… (okno)'), goPrice: t('Skocz do ceny… (okno)'),
  });
  // K (31.10.2026): bez puli dni, [U] 31.10.2026 «Filtr jako skok»
  const btCelLabel = () => ({ time: t('Godzina NY'), session: t('Początek sesji'), news: t('Następny news'), offset: t('Przesunięcie (min)'), nextDay: t('Następny dzień (godzina startu)'), filterDay: t('Następny dzień z filtra') });
  const btSessionName = (id) => ({ asia: t('Azja'), london: t('Londyn'), ny: 'NY' }[id] || id);
  function btCelParam(j, i) {
    const c = j.cel;
    if (c.kind === 'time') return `<input class="sp-in" type="text" data-wd="time" data-wd-tz="NY" data-wd-presety="${BT_PRESETS}" data-btf="cel.at" data-i="${i}" data-fk="btj-${i}-at" value="${esc(c.at)}" aria-label="${L('Godzina NY')}">`;
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
        <div class="bt-sdef"><label class="bt-sa"><span>${L('Godzina startu (NY)')}</span><input class="sp-in" type="text" data-wd="time" data-wd-tz="NY" data-wd-presety="${BT_PRESETS}" data-btd="startTime" data-fk="btd-start" value="${esc(d.startTime)}"></label>
        <div class="bt-sa"><span>${L('Ryzyko na trade')}</span><div class="bt-row"><div class="seg sm" role="group" aria-label="${L('Rodzaj ryzyka')}">${mode('usd', 'USD')}${mode('pct', t('% salda'))}</div><input class="sp-in" type="number" min="0" step="any" data-btd="risk" data-fk="btd-risk" value="${d.risk.value}" aria-label="${L('Wartość ryzyka')}"></div></div>
        <label class="bt-sa"><span>${L('Szybkość odtwarzania')}</span><select class="sp-in sp-sel" data-btd="speed" data-fk="btd-speed">${BT_SPEEDS.map((v) => `<option value="${v}"${v === d.speed ? ' selected' : ''}>${v}×</option>`).join('')}</select></label></div>
        <p class="note bt-smsg" role="status">${esc(btMsg)}</p></div>`, 'domyslne')
      + grp(`${gHead('sv-bt-presets', 'Presety zleceń')}<div class="sp-f">${btPresetsHtml()}</div>`, 'presety')
      + grp(`${gHead('sv-bt-tpl', 'Szablony filtra dni')}<div class="sp-f">${btTemplatesHtml()}</div>${btCopyNote()}`, 'szablony');
  }
  // ---- 1.7-3: Presety zleceń (nazwa, skrót opisu, Edytuj, ×, kolejność ↑/↓ i przeciąganie), edytor z walidacją i powodem przy polu, domyślny offset auto BE ----
  // Presety zapisują się od razu do settings.bt (bez szkicu jak skoki); edytor trzyma szkic pól tekstowych (pEdit) do Zapisz / Anuluj.
  let pEdit = null;
  const unitName = () => ({ pts: t('pkt'), ticks: t('ticki'), rr: 'R:R' });
  const kindName = () => ({ r: 'R', pts: t('pkt'), ticks: t('ticki'), usd: '$' });
  const modeName = () => ({ session: t('Ryzyko sesji'), usd: t('Ryzyko w $'), pct: t('Ryzyko w % salda'), qty: t('Stała ilość') });
  function draftOf(p) {
    // 1.7-5: lista TP (do 4 poziomów: jednostka pkt/ticki/R:R, wartość, procent poza ostatnim = „reszta”); zawsze co najmniej jeden (pusty) wiersz
    const tps = (p?.tps || []).map((x) => ({ unit: x.unit, val: String(x.value), pct: String(x.pct) }));
    return {
      id: p?.id || '', name: p?.name || '', slUnit: p?.sl?.unit || 'pts', slVal: p?.sl ? String(p.sl.value) : '',
      tps: tps.length ? tps : [{ unit: 'rr', val: '', pct: '' }], sizeMode: p?.size?.mode || 'session', sizeVal: p && p.size.mode !== 'session' ? String(p.size.value) : '',
      abeKind: p?.autoBe?.kind || '', abeVal: p?.autoBe ? String(p.autoBe.value) : '', abeOff: p?.autoBe?.offsetTicks ? String(p.autoBe.offsetTicks) : '',
    };
  }
  const posN = (s) => s.trim() !== '' && Number.isFinite(Number(s.replace(',', '.'))) && Number(s.replace(',', '.')) > 0;
  const nOf = (s) => Number(s.replace(',', '.'));
  // szkic → { preset, errors }: błędy pól (liczby) i zależności (presetErrors)
  function presetOfDraft(d, others) {
    const e = {};
    const sl = d.slVal.trim() === '' ? null : posN(d.slVal) ? { unit: d.slUnit, value: nOf(d.slVal) } : (e.sl = t('Wpisz liczbę większą od zera albo zostaw puste (bez SL).'), null);
    let tps = [];
    const trows = d.tps.filter((r) => r.val.trim() !== '');
    if (trows.some((r) => !posN(r.val))) e.tp = t('Wpisz liczbę większą od zera albo zostaw puste (bez TP).');
    else {
      tps = trows.map((r, i) => ({ unit: r.unit, value: nOf(r.val), pct: i < trows.length - 1 ? (r.pct.trim() === '' ? undefined : Number(r.pct)) : 0 }));
      if (tps.length === 1) tps[0].pct = 100;
      else if (tps.length > 1) {
        const pc = ladderPcts(tps);
        if (!pc) e.tp = t('Procenty TP: każdy poziom oprócz ostatniego to liczba całkowita od 1, a suma poza ostatnim musi być mniejsza niż 100.');
        else tps = tps.map((x, i) => ({ ...x, pct: pc[i] }));
      }
    }
    let size;
    if (d.sizeMode === 'session') size = { mode: 'session', value: 0 };
    else if (!posN(d.sizeVal)) { e.size = t('Wpisz liczbę większą od zera.'); size = { mode: d.sizeMode, value: 0 }; } else if (d.sizeMode === 'pct' && nOf(d.sizeVal) > 100) { e.size = t('Ryzyko w % salda: od 0 do 100.'); size = { mode: 'pct', value: 1 }; } else if (d.sizeMode === 'qty' && !Number.isInteger(nOf(d.sizeVal))) { e.size = t('Ilość musi być liczbą całkowitą.'); size = { mode: 'qty', value: 1 }; } else size = { mode: d.sizeMode, value: nOf(d.sizeVal) };
    let autoBe = null;
    if (d.abeKind) {
      const off = d.abeOff.trim() === '' ? 0 : Number(d.abeOff);
      if (!posN(d.abeVal)) e.abe = t('Wpisz próg większy od zera.');
      else if (!Number.isInteger(off) || off < 0 || off > 20) e.abe = t('Offset: liczba ticków od 0 do 20.');
      else autoBe = { kind: d.abeKind, value: nOf(d.abeVal), offsetTicks: off };
    }
    const preset = { id: d.id || 'nowy', name: d.name.trim().slice(0, PRESET_NAME_MAX), sl, tps, size, autoBe };
    return { preset, errors: { ...presetErrors(preset, others), ...e } };
  }
  function btPresetsSet(list) { settings.bt = sanitizeBt({ ...settings.bt, presets: list }); ctx.save(); ctx.opts.onBt(settings.bt); }
  function btPresetEditor(others) {
    const d = pEdit.draft, { errors } = presetOfDraft(d, others), shown = pEdit.tried ? errors : { name: errors.name && d.name !== '' ? errors.name : undefined };
    const opt = (v, l, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
    const err = (k) => (shown[k] ? `<p class="note bt-perr" role="alert">${esc(shown[k])}</p>` : '');
    const inv = (k) => (shown[k] ? ' aria-invalid="true"' : '');
    return `<div class="bt-ped" role="group" aria-label="${L('Edytor presetu')}">
      <label class="bt-sa"><span>${L('Nazwa')}</span><input class="sp-in" type="text" maxlength="${PRESET_NAME_MAX}" data-btp="name" data-fk="btp-name" value="${esc(d.name)}"${inv('name')}></label>${err('name')}
      <div class="bt-sa"><span>SL</span><div class="bt-row"><select class="sp-in sp-sel" data-btp="slUnit" data-fk="btp-slu" aria-label="${L('Jednostka SL')}">${PRESET_SL_UNITS.map((u) => opt(u, unitName()[u], d.slUnit)).join('')}</select><input class="sp-in" type="text" inputmode="decimal" data-btp="slVal" data-fk="btp-slv" value="${esc(d.slVal)}" placeholder="${L('bez SL')}" aria-label="${L('Wartość SL')}"${inv('sl')}></div></div>${err('sl')}
      ${d.tps.map((r, i) => `<div class="bt-sa bt-tpr"><span>TP${d.tps.length > 1 ? i + 1 : ''}</span><div class="bt-row"><select class="sp-in sp-sel" data-btp="tpUnit${i ? `:${i}` : ''}" data-fk="btp-tpu${i}" aria-label="${L('Jednostka TP')}${d.tps.length > 1 ? ` ${i + 1}` : ''}">${PRESET_TP_UNITS.map((u) => opt(u, unitName()[u], r.unit)).join('')}</select><input class="sp-in" type="text" inputmode="decimal" data-btp="tpVal${i ? `:${i}` : ''}" data-fk="btp-tpv${i}" value="${esc(r.val)}" placeholder="${L('bez TP')}" aria-label="${L('Wartość TP')}${d.tps.length > 1 ? ` ${i + 1}` : ''}"${inv('tp')}>${d.tps.length > 1 ? (i < d.tps.length - 1 ? `<input class="sp-in bt-tpr-pct" type="text" inputmode="numeric" data-btp="tpPct${i ? `:${i}` : ''}" data-fk="btp-tpp${i}" value="${esc(r.pct)}" aria-label="${L('Procent wielkości')} ${i + 1}"${inv('tp')}><span class="note">%</span>` : `<span class="note">${L('reszta')}</span>`) : ''}${i > 0 ? `<button type="button" class="icon-btn" data-act="bt-tprm" data-v="${i}" data-fk="btp-tprm${i}" aria-label="${L('Usuń poziom TP')} ${i + 1}" title="${L('Usuń poziom TP')} ${i + 1}">${X_ICON}</button>` : ''}</div></div>`).join('')}${err('tp')}
      ${d.tps.length < TPS_MAX ? `<div class="bt-sjb"><button type="button" class="btn ghost sm" data-act="bt-tpadd" data-fk="btp-tpadd">${L('+ TP')}</button></div>` : ''}
      <div class="bt-sa"><span>${L('Wielkość')}</span><div class="bt-row"><select class="sp-in sp-sel" data-btp="sizeMode" data-fk="btp-szm" aria-label="${L('Sposób liczenia wielkości')}">${PRESET_SIZE_MODES.map((m) => opt(m, modeName()[m], d.sizeMode)).join('')}</select>${d.sizeMode === 'session' ? '' : `<input class="sp-in" type="text" inputmode="decimal" data-btp="sizeVal" data-fk="btp-szv" value="${esc(d.sizeVal)}" aria-label="${L('Wartość wielkości')}"${inv('size')}>`}</div></div>${err('size')}
      <div class="bt-sa"><span>Auto BE</span><div class="bt-row"><select class="sp-in sp-sel" data-btp="abeKind" data-fk="btp-abk" aria-label="${L('Jednostka progu auto BE')}"><option value=""${d.abeKind === '' ? ' selected' : ''}>${L('wyłączony')}</option>${PRESET_ABE_KINDS.map((k) => opt(k, kindName()[k], d.abeKind)).join('')}</select>${d.abeKind ? `<label class="bt-ped-f"><span class="lbl">${L('Próg')}</span><input class="sp-in" type="text" inputmode="decimal" data-btp="abeVal" data-fk="btp-abv" value="${esc(d.abeVal)}" aria-label="${L('Próg auto BE')}"${inv('abe')}></label><label class="bt-ped-f"><span class="lbl">${L('+ ticki')}</span><input class="sp-in" type="text" inputmode="numeric" data-btp="abeOff" data-fk="btp-abo" value="${esc(d.abeOff)}" placeholder="0" aria-label="${L('Offset w tickach')}"${inv('abe')}></label>` : ''}</div></div>${err('abe')}
      <div class="bt-sjb"><button type="button" class="btn sm" data-act="bt-psave" data-fk="btp-save">${L('Zapisz preset')}</button><button type="button" class="btn ghost sm" data-act="bt-pcancel" data-fk="btp-cancel">${L('Anuluj')}</button></div></div>`;
  }
  function btPresetsHtml() {
    const cfg = sanitizeBt(settings.bt), list = cfg.presets;
    const rows = list.map((p, i) => `<div class="bt-pr" data-pi="${i}" draggable="true"><span class="bt-pr-n">${esc(p.name)}</span><span class="bt-pr-s note">${esc(presetSummary(p))}</span>
        <button type="button" class="icon-btn" data-act="bt-pup" data-v="${i}" data-fk="btpr-${i}-up" aria-label="${L('Wyżej')}" title="${L('Wyżej')}"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="icon-btn" data-act="bt-pdown" data-v="${i}" data-fk="btpr-${i}-down" aria-label="${L('Niżej')}" title="${L('Niżej')}"${i === list.length - 1 ? ' disabled' : ''}>↓</button>
        <button type="button" class="btn ghost sm" data-act="bt-pedit" data-v="${i}" data-fk="btpr-${i}-edit">${L('Edytuj')}</button><button type="button" class="icon-btn" data-act="bt-pdel" data-v="${i}" data-fk="btpr-${i}-del" aria-label="${L('Usuń preset')}">${X_ICON}</button></div>`).join('');
    const full = list.length >= PRESETS_MAX;
    const editor = pEdit ? btPresetEditor(list.filter((p) => p.id !== pEdit.draft.id)) : '';
    return `<div class="bt-pl">${rows || `<p class="note">${L('Brak presetów. Dodaj preset tutaj albo zapisz bieżące pola panelu zleceń przyciskiem „Zapisz jako preset…”.')}</p>`}</div>
      ${editor}
      <div class="bt-sjb"><button type="button" class="btn ghost sm" data-act="bt-padd" data-fk="btp-add"${full || pEdit ? ' disabled' : ''}>${L('Dodaj preset')}</button></div>
      ${full ? `<p class="note">${L('Najwyżej {n} presetów.', { n: PRESETS_MAX })}</p>` : ''}
      <label class="bt-sa bt-peo"><span>${L('Auto BE: domyślny offset (ticki)')}</span><input class="sp-in" type="number" min="0" max="20" step="1" data-btd="beOffset" data-fk="btd-beoff" value="${cfg.beOffset}"></label>
      <p class="note">${L('Preset wybierasz chipem pod przyciskami Kup i Sprzedaj. Aktywny preset sprawia, że Kup i Sprzedaj składają pełne zlecenie (SL, TP, wielkość, auto BE) jednym kliknięciem.')}</p>`;
  }
  function btTplSet(list) { settings.bt = sanitizeBt({ ...settings.bt, templates: list }); ctx.save(); ctx.opts.onBt(settings.bt); ctx.rerender(); }
  // Zapis szkicu: tylko bez kolizji skrótów. settings.bt przechodzi sanitizeBt (zły skok odpada), potem zapis i synchronizacja.
  function btCommit() {
    if (collisions(btDraft.skroty, btDraft.jumps).length) { ctx.rerender(); return false; }
    // E2: kopię definicji sesji prowadzi app.js, szkic jej nie cofa; F2: szablony filtra też (zapisuje je kreator)
    settings.bt = sanitizeBt({ ...btClone(btDraft), sessionsCopy: settings.bt?.sessionsCopy || [], templates: settings.bt?.templates || [], presets: settings.bt?.presets || [], activePreset: settings.bt?.activePreset ?? null, goPriceDays: settings.bt?.goPriceDays });
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
    else if (k === 'beOffset') { const v = Number(el.value); if (el.value.trim() !== '' && Number.isInteger(v) && v >= 0 && v <= 20) d.beOffset = v; else btMsg = t('Offset auto BE: liczba ticków od 0 do 20.'); }
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
      case 'bt-padd': pEdit = { draft: draftOf(null), tried: false }; ctx.rerender(); root().querySelector('[data-fk="btp-name"]')?.focus(); return true;
      case 'bt-pedit': { const p = sanitizeBt(settings.bt).presets[Number(v)]; if (p) { pEdit = { draft: draftOf(p), tried: false }; ctx.rerender(); root().querySelector('[data-fk="btp-name"]')?.focus(); } return true; }
      case 'bt-pcancel': pEdit = null; ctx.rerender(); root().querySelector('[data-fk="btp-add"]')?.focus(); return true;
      // 1.7-5: lista TP presetu: + TP dzieli procenty po równo (najwyżej 4), × usuwa wiersz (procent przechodzi na ostatni)
      case 'bt-tpadd': {
        const rows = pEdit.draft.tps;
        if (rows.length < TPS_MAX) { rows.push({ unit: rows[rows.length - 1]?.unit || 'rr', val: '', pct: '' }); const eq = equalPcts(rows.length); rows.forEach((r, i) => { r.pct = String(eq[i]); }); }
        ctx.rerender(); root().querySelector(`[data-fk="btp-tpv${pEdit.draft.tps.length - 1}"]`)?.focus(); return true;
      }
      case 'bt-tprm': { const i = Number(v); if (i > 0) pEdit.draft.tps.splice(i, 1); ctx.rerender(); return true; }
      case 'bt-psave': {
        const list = sanitizeBt(settings.bt).presets, d = pEdit.draft, others = list.filter((p) => p.id !== d.id);
        const { preset, errors } = presetOfDraft(d, others);
        if (Object.keys(errors).length) { pEdit.tried = true; ctx.rerender(); return true; }
        const out = d.id ? list.map((p) => (p.id === d.id ? preset : p)) : [...list, { ...preset, id: newPresetId(list) }];
        pEdit = null; btPresetsSet(out); ctx.rerender(); root().querySelector('[data-fk="btp-add"]')?.focus(); return true;
      }
      case 'bt-pdel': { const list = sanitizeBt(settings.bt).presets; list.splice(Number(v), 1); btPresetsSet(list); ctx.rerender(); return true; }
      case 'bt-pup': case 'bt-pdown': {
        const list = sanitizeBt(settings.bt).presets, i = Number(v), j = act === 'bt-pup' ? i - 1 : i + 1;
        if (list[i] && list[j]) { [list[i], list[j]] = [list[j], list[i]]; btPresetsSet(list); ctx.rerender(); root().querySelector(`[data-fk="btpr-${j}-${act === 'bt-pup' ? 'up' : 'down'}"]`)?.focus(); }
        return true;
      }
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
    if (ev.target.matches('[data-btp]') && pEdit) {
      const k = ev.target.dataset.btp, d = pEdit.draft;
      const lm = /^(tpUnit|tpVal|tpPct)(?::(\d))?$/.exec(k);
      if (lm) { const r = d.tps[Number(lm[2] || 0)]; if (r) r[{ tpUnit: 'unit', tpVal: 'val', tpPct: 'pct' }[lm[1]]] = ev.target.value; } else d[k] = ev.target.value;
      // zmiana rodzaju wielkości albo progu zeruje wartość, żeby nie zostały liczby z innego trybu
      if (k === 'sizeMode' && ev.target.value === 'session') d.sizeVal = '';
      ctx.rerender();
      return true;
    }
    if (ev.target.matches('[data-btf]')) { btField(ev.target); return true; }
    if (ev.target.matches('[data-btd]')) { btDefault(ev.target); return true; }
    return false;
  }
  // przeciąganie kolejności presetów (HTML5): upuszczenie na wiersz wstawia przeciągany preset w jego miejsce; ↑/↓ robią to samo z klawiatury
  let dragFrom = null;
  function onDrag(ev) {
    const row = ev.target.closest?.('.bt-pr');
    if (!row) return false;
    const i = Number(row.dataset.pi);
    if (ev.type === 'dragstart') { dragFrom = i; ev.dataTransfer?.setData('text/plain', String(i)); if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'; return true; }
    if (ev.type === 'dragover' && dragFrom != null) { ev.preventDefault(); return true; }
    if (ev.type === 'drop' && dragFrom != null) {
      ev.preventDefault();
      const list = sanitizeBt(settings.bt).presets;
      if (list[dragFrom] && list[i] && dragFrom !== i) { const [m] = list.splice(dragFrom, 1); list.splice(i, 0, m); btPresetsSet(list); ctx.rerender(); }
      dragFrom = null;
      return true;
    }
    if (ev.type === 'dragend') { dragFrom = null; return true; }
    return false;
  }
  return { id: 'backtest', html: btHtml, handle, onInput: () => false, onChange, onKeyDown, onDrag, onEscape: () => false, leave() { btDraft = null; btMsg = ''; pEdit = null; } };
}
