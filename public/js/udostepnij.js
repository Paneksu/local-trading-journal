// Okno „Udostępnij”: wybór rodzaju karty (trade, dzień, tydzień, miesiąc, rok), okresu, jednostki, formatu, koloru liczby i tła,
// podgląd na canvasie (ten sam, w pełnej rozdzielczości, skalowany CSS-em) oraz akcje Pobierz PNG / Kopiuj / Udostępnij.
// Dane kart: udostepnij-dane.js, rysowanie: udostepnij-render.js. Wzór okna: confirmDialog w modal.js.
// Zapamiętywane: format, jednostka, kolor liczby i nick w ustawieniach synchronizowanych między urządzeniami (prefs, patrz sanitizeShare);
// tło (motyw / zdjęcie) i samo zdjęcie tylko w localStorage tego urządzenia (zdjęcie jest duże i prywatne, nie trafia do Notion).
// English: the share window (cards as PNG: download, copy, native share).
import { esc, addDays, parseKey, pad, daysInMonth, todayKey, longDate, monthTitle } from './format.js';
import { t } from './i18n.js';
import { overlay, trapTab, toast } from './modal.js';
import { tradeCard, dayCard, weekCard, monthCard, yearCard, weekStart, liveOnly, availableMetrics, METRICS } from './udostepnij-dane.js';
import { renderCard, readTokens, ensureFonts, FORMATS, fileName, range } from './udostepnij-render.js';

export const SHARE_DEFAULTS = { nick: '', format: '9:16', metric: 'R', numberColor: 'result' };
const NICK_MAX = 40;
const PHOTO_KEY = 'thq.share.photo';
const BG_KEY = 'thq.share.bg';
const PHOTO_MAX = 1920;
const KINDS = ['trade', 'day', 'week', 'month', 'year'];

// Ustawienia karty z zewnątrz (localStorage, synchronizacja z innego urządzenia): tylko znane pola i dozwolone wartości.
export function sanitizeShare(o) {
  const s = o && typeof o === 'object' ? o : {};
  return {
    nick: typeof s.nick === 'string' ? s.nick.replace(/\s+/g, ' ').trim().slice(0, NICK_MAX) : SHARE_DEFAULTS.nick,
    format: typeof s.format === 'string' && Object.hasOwn(FORMATS, s.format) ? s.format : SHARE_DEFAULTS.format, // hasOwn, nie `in`: „toString” itp. nie przechodzi
    metric: METRICS.includes(s.metric) ? s.metric : SHARE_DEFAULTS.metric,
    numberColor: s.numberColor === 'neutral' ? 'neutral' : 'result',
  };
}

const svgI = (body, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICO = {
  close: svgI('<path d="M6 6l12 12M18 6 6 18"/>', 18),
  download: svgI('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', 14),
  copy: svgI('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>', 14),
  share: svgI('<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>', 14),
};

// ---------- okresy ----------
const clampDay = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
// clip (tylko tydzień): zakres przycięty do dni, które sumuje komórka „Tydz.” w kalendarzu (patrz weekCard).
function periodOf(kind, a, clip = null) {
  const { y, m } = parseKey(a);
  if (kind === 'week') { const from = weekStart(a), to = addDays(from, 6); return clip ? { from: clip.from > from ? clip.from : from, to: clip.to < to ? clip.to : to } : { from, to }; }
  if (kind === 'month') return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` };
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: a, to: a };
}
function stepAnchor(kind, a, dir) {
  const { y, m, d } = parseKey(a);
  if (kind === 'day') return addDays(a, dir);
  if (kind === 'week') return addDays(a, 7 * dir);
  if (kind === 'month') { const n = y * 12 + (m - 1) + dir; return clampDay(Math.floor(n / 12), (n % 12) + 1, d); }
  return clampDay(y + dir, m, d);
}
function periodLabel(kind, a, clip = null) {
  const { y, m } = parseKey(a);
  if (kind === 'day') return longDate(a);
  if (kind === 'month') { const mt = monthTitle(y, m); return mt[0].toUpperCase() + mt.slice(1); }
  if (kind === 'year') return String(y);
  const { from, to } = periodOf('week', a, clip);
  const body = range(from, to); // ta sama etykieta zakresu co na karcie (udostepnij-render.js)
  return `${body[0].toUpperCase()}${body.slice(1)} ${parseKey(to).y}`;
}

// ---------- zdjęcie ----------
// Zdjęcie użytkownika zmniejszamy do 1920 px na dłuższym boku i zapisujemy jako JPEG (mały wpis w localStorage).
async function downscale(file) {
  let src, w, h;
  if (window.createImageBitmap) {
    src = await createImageBitmap(file);
    w = src.width; h = src.height;
  } else {
    const url = URL.createObjectURL(file);
    try {
      src = new Image(); src.src = url; await src.decode();
      w = src.naturalWidth; h = src.naturalHeight;
    } finally { URL.revokeObjectURL(url); }
  }
  const k = Math.min(1, PHOTO_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); // przezroczyste PNG-i na czarnym, bo JPEG nie ma kanału alfa
  x.drawImage(src, 0, 0, c.width, c.height);
  src.close?.();
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', 0.86) };
}
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } }

const blobOf = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));

// getModel(): { trades, konta } (znormalizowane, jak w statystykach); prefs: obiekt z ustawień (mutowany); save(): zapis ustawień;
// onClose(): np. odroczone przerysowanie widoku po zamknięciu okna.
export function createShare({ getModel, prefs, save, onClose = () => {} }) {
  let photo = null;          // canvas / obraz do narysowania
  let photoLoaded = false;   // czy próbowaliśmy już odczytać zdjęcie z localStorage
  let fontsP = null;
  let opening = false;       // blokada podwójnego otwarcia w czasie await restorePhoto()

  async function restorePhoto() {
    if (photoLoaded) return;
    photoLoaded = true;
    const url = lsGet(PHOTO_KEY);
    if (!url) return;
    try { const im = new Image(); im.src = url; await im.decode(); photo = im; } catch { photo = null; lsSet(PHOTO_KEY, null); }
  }

  // opts: { tradeId?, kind?, anchor? (dowolny dzień okresu), clip? ({ from, to }, tylko dla tygodnia), opener? }
  // getModel() zwraca trades = trade'y po filtrach widoku (konta, setupy, wyszukiwarka: baseTrades() w app.js) i allTrades = wszystkie
  // (karta pojedynczego trade'a). Decyzja 26.10.2026, słowa użytkownika «To samo co komórka»: karty okresów biorą te same filtry co kalendarz
  // i statystyki (odwraca wcześniejszą decyzję gustu „okno ignoruje filtry”); filtered = czy jakikolwiek filtr jest aktywny (notka w oknie).
  async function open(opts = {}) {
    if (opening || overlay.current?.share) return;
    const model = getModel();
    if (!model) return;
    opening = true;
    try { await restorePhoto(); } finally { opening = false; } // dalej do przypisania overlay.current nie ma już await
    const everyTrade = model.allTrades || model.trades;
    const live = liveOnly(model.trades);
    const dates = live.map((x) => x.date).sort();
    const firstDay = dates[0] || null, lastLive = dates[dates.length - 1] || null;
    const trade = opts.tradeId ? everyTrade.find((x) => x.id === opts.tradeId) : null;
    const st = {
      kind: trade ? 'trade' : KINDS.includes(opts.kind) ? opts.kind : 'week',
      anchor: opts.anchor || (trade && trade.typ === 'Live' ? trade.date : lastLive) || todayKey(),
      clip: opts.kind === 'week' && opts.clip?.from && opts.clip?.to ? { from: opts.clip.from, to: opts.clip.to } : null,
      bg: lsGet(BG_KEY) === 'photo' && photo ? 'photo' : 'theme',
    };
    const prev = overlay.current;
    const opener = opts.opener || document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'scrim sh-scrim';
    wrap.innerHTML = `<div class="modal sh" role="dialog" aria-modal="true" aria-labelledby="sh-t" tabindex="-1">
      <div class="mh"><h2 id="sh-t">${esc(t('Udostępnij'))}</h2><button type="button" class="icon-btn" data-sh="close" data-fk="close" aria-label="${esc(t('Zamknij'))}">${ICO.close}</button></div>
      <div class="mb sh-body">
        <div class="sh-prev"><div class="sh-stage"><canvas id="sh-cv" role="img" aria-label=""></canvas><p class="sh-empty" id="sh-empty" hidden></p></div></div>
        <div class="sh-ctl" id="sh-ctl"></div>
      </div>
      <div class="mf"><span class="fmsg" id="sh-msg" role="status" aria-live="polite"></span><span class="grow"></span>
        <button type="button" class="btn" data-sh="copy" data-fk="copy" hidden>${ICO.copy}${esc(t('Kopiuj'))}</button>
        <button type="button" class="btn" data-sh="share" data-fk="share" hidden>${ICO.share}${esc(t('Udostępnij'))}</button>
        <button type="button" class="btn primary" data-sh="download" data-fk="download">${ICO.download}${esc(t('Pobierz PNG'))}</button></div>
      <input type="file" id="sh-file" accept="image/*" hidden></div>`;
    document.body.appendChild(wrap);
    const hadLock = document.documentElement.classList.contains('lb-lock');
    document.documentElement.classList.add('lb-lock');
    const dlg = wrap.firstElementChild;
    const $ = (s) => dlg.querySelector(s);
    const cv = $('#sh-cv');

    const canCopy = !!(navigator.clipboard?.write && window.ClipboardItem && window.isSecureContext);
    const canShareFiles = () => {
      try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })); } catch { return false; }
    };
    $('[data-sh="copy"]').hidden = !canCopy;
    $('[data-sh="share"]').hidden = !canShareFiles();

    let seq = 0;
    let cur = null; // { card, metric, name, info, blob }: blob liczony w draw(), żeby share/pobieranie nie czekały na toBlob (Safari wymaga gestu)

    // ----- dane karty dla bieżącego wyboru -----
    function build() {
      const m = getModel();
      const trades = m.trades, konta = m.konta;
      const make = (metric) => {
        if (st.kind === 'trade') { const x = (m.allTrades || m.trades).find((q) => q.id === opts.tradeId); return x ? tradeCard(x, konta) : null; }
        const { y, m: mo } = parseKey(st.anchor);
        if (st.kind === 'day') return dayCard(trades, konta, st.anchor, metric);
        if (st.kind === 'week') return weekCard(trades, konta, st.anchor, metric, st.clip);
        if (st.kind === 'month') return monthCard(trades, konta, y, mo, metric);
        return yearCard(trades, konta, y, metric);
      };
      const c0 = make('R');
      if (!c0) return { card: null, avail: [], metric: prefs.metric, empty: t('Nie znaleziono tego trade’a') };
      const avail = availableMetrics(c0);
      if (st.kind === 'trade') return { card: c0, avail, metric: avail.includes(prefs.metric) ? prefs.metric : avail[0] || 'R', empty: avail.length ? null : t('Ten trade nie ma wyniku do pokazania') };
      if (!c0.n) return { card: c0, avail, metric: prefs.metric, empty: t("Brak trade'ów Live w tym okresie") };
      const metric = avail.includes(prefs.metric) ? prefs.metric : avail[0] || 'R';
      return { card: metric === 'R' ? c0 : make(metric), avail, metric, empty: avail.length ? null : t('Brak wyniku do pokazania w tym okresie') };
    }

    // ----- elementy sterujące -----
    const seg = (label, key, items, attr) => `<div class="sh-f"><span class="lbl" id="sh-l-${key}">${esc(label)}</span>
      <div class="seg sm full" role="group" aria-labelledby="sh-l-${key}">${items.map((i) => `<button type="button" data-sh="${attr}" data-v="${esc(i.v)}" data-fk="${attr}-${esc(i.v)}" aria-pressed="${!!i.on}"${i.dis ? ` disabled aria-disabled="true"` : ''}${i.title ? ` title="${esc(i.title)}"` : ''}>${esc(i.label)}</button>`).join('')}</div></div>`;
    const filtered = !!getModel()?.filtered;
    function ctlHtml(b) {
      const kinds = [['trade', t('Trade')], ['day', t('Dzień')], ['week', t('Tydzień')], ['month', t('Miesiąc')], ['year', t('Cały rok')]].filter(([k]) => k !== 'trade' || opts.tradeId);
      let h = `<div class="sh-f"><span class="lbl" id="sh-l-kind">${esc(t('Rodzaj karty'))}</span>
        <div class="seg full" role="group" aria-labelledby="sh-l-kind">${kinds.map(([k, l]) => `<button type="button" data-sh="kind" data-v="${k}" data-fk="kind-${k}" aria-pressed="${st.kind === k}">${esc(l)}</button>`).join('')}</div></div>`;
      if (st.kind !== 'trade') {
        const p = periodOf(st.kind, st.anchor, st.clip);
        const canPrev = firstDay != null && p.from > firstDay, canNext = p.to < (lastLive && lastLive > todayKey() ? lastLive : todayKey());
        h += `<div class="sh-f"><span class="lbl" id="sh-l-per">${esc(t('Okres'))}</span>
          <div class="sh-per" role="group" aria-labelledby="sh-l-per"><button type="button" class="icon-btn" data-sh="prev" data-fk="prev" aria-label="${esc(t('Poprzedni okres'))}"${canPrev ? '' : ' disabled'}>‹</button>
          <span class="sh-per-t" aria-live="polite">${esc(periodLabel(st.kind, st.anchor, st.clip))}</span>
          <button type="button" class="icon-btn" data-sh="next" data-fk="next" aria-label="${esc(t('Następny okres'))}"${canNext ? '' : ' disabled'}>›</button></div></div>`;
        if (filtered) h += `<p class="note" id="sh-filt">${esc(t('Karta uwzględnia filtry widoku: konta, setupy i wyszukiwarkę.'))}</p>`;
      }
      const why = { R: t('Brak wyniku w R'), $: t('Ta karta nie ma wyniku w $'), '%': t('Brak rozmiaru konta przy tych trade’ach, więc nie da się policzyć % konta') };
      h += seg(t('Jednostka'), 'metric', METRICS.map((u) => { const ok = b.avail.includes(u); return { v: u, label: u, on: b.metric === u, dis: !ok, title: ok ? '' : why[u] }; }), 'metric');
      const off = METRICS.filter((u) => !b.avail.includes(u));
      if (b.card && !b.empty && off.length) h += `<p class="note" id="sh-metric-note">${off.map((u) => esc(why[u])).join(' ')}</p>`;
      h += seg(t('Format'), 'format', Object.keys(FORMATS).map((f) => ({ v: f, label: f, on: prefs.format === f })), 'format');
      h += seg(t('Kolor liczby'), 'ncolor', [{ v: 'result', label: t('Wynik'), on: prefs.numberColor === 'result' }, { v: 'neutral', label: t('Neutralny'), on: prefs.numberColor === 'neutral' }], 'ncolor');
      h += seg(t('Tło'), 'bg', [{ v: 'theme', label: t('Motyw'), on: st.bg === 'theme' }, { v: 'photo', label: t('Zdjęcie'), on: st.bg === 'photo' }], 'bg');
      if (st.bg === 'photo') {
        h += `<div class="sh-ph"><button type="button" class="btn sm" data-sh="pick" data-fk="pick">${esc(photo ? t('Zmień zdjęcie') : t('Wybierz zdjęcie'))}</button>${photo ? `<button type="button" class="btn ghost sm" data-sh="rmphoto" data-fk="rmphoto">${esc(t('Usuń'))}</button>` : ''}</div>
          <p class="note">${esc(t('Zdjęcie zostaje tylko w tej przeglądarce. Napisy czytają się najlepiej na spokojnym zdjęciu, bez jasnych plam pod tekstem.'))}</p>`;
      }
      return h;
    }

    function setMsg(s) { $('#sh-msg').textContent = s || ''; }
    function setButtons(on) { for (const b of dlg.querySelectorAll('[data-sh="download"],[data-sh="copy"],[data-sh="share"]')) b.disabled = !on; }

    async function draw() {
      const my = ++seq;
      const b = build();
      cur = null;
      { const [fw, fh] = FORMATS[prefs.format] || FORMATS['9:16']; $('.sh-prev').style.setProperty('--sh-ar', String(fw / fh)); } // proporcja podglądu na wąskich ekranach (features.css)
      const ctl = $('#sh-ctl');
      const fk = document.activeElement && ctl.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
      ctl.innerHTML = ctlHtml(b);
      if (fk) (ctl.querySelector(`[data-fk="${fk}"]:not(:disabled)`) || dlg).focus();
      const empty = $('#sh-empty');
      const showEmpty = (msg) => { cv.hidden = true; empty.hidden = false; empty.textContent = msg; setButtons(false); setMsg(''); };
      if (b.empty) { showEmpty(b.empty); return; }
      empty.hidden = true; cv.hidden = false;
      try {
        fontsP ||= ensureFonts();
        await fontsP;
        if (my !== seq) return;
        const photoOn = st.bg === 'photo' && photo;
        const info = renderCard(cv, { kind: st.kind, format: prefs.format, metric: b.metric, numberColor: prefs.numberColor, data: b.card, photo: photoOn ? photo : null, nick: prefs.nick, tokens: readTokens() });
        cv.setAttribute('aria-label', `${t('Podgląd karty')}: ${st.kind === 'trade' ? '' : periodLabel(st.kind, st.anchor, st.clip)} ${info.width}×${info.height}`.replace(/\s+/g, ' ').trim());
        const blob = await blobOf(cv);
        if (my !== seq) return;
        cur = { card: b.card, metric: b.metric, name: fileName(st.kind, b.card, prefs.format), info, blob };
        setButtons(true);
        setMsg(`${info.width}×${info.height} px`);
      } catch (e) {
        if (my !== seq) return;
        cur = null;
        console.error('[udostepnij]', e);
        showEmpty(t('Nie udało się narysować karty.'));
      }
    }
    const redraw = () => { draw().catch(() => {}); };

    // ----- akcje -----
    async function download() {
      if (!cur) return;
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(cur.blob); a.download = cur.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(t('Zapisano plik {name}', { name: cur.name }));
      } catch { toast(t('Nie udało się zapisać obrazu.'), { error: true }); }
    }
    async function copy() {
      if (!cur) return;
      try {
        // blob jest już policzony w draw(), więc zapis do schowka idzie od razu w geście kliknięcia (Safari)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': cur.blob })]);
        toast(t('Skopiowano obraz do schowka'));
      } catch { toast(t('Nie udało się skopiować obrazu do schowka.'), { error: true }); }
    }
    async function share() {
      if (!cur) return;
      try {
        const file = new File([cur.blob], cur.name, { type: 'image/png' }); // bez await przed share(): Safari wymaga gestu użytkownika
        await navigator.share({ files: [file], title: 'JustJournal' });
        toast(t('Udostępniono'));
      } catch (e) { if (e?.name !== 'AbortError') toast(t('Nie udało się udostępnić obrazu.'), { error: true }); }
    }
    async function onFile(file) {
      if (!file) return;
      try {
        const r = await downscale(file);
        photo = r.canvas; st.bg = 'photo';
        const ok = lsSet(PHOTO_KEY, r.dataUrl);
        lsSet(BG_KEY, 'photo');
        if (!ok) toast(t('Zdjęcie działa do zamknięcia okna, ale nie udało się go zapamiętać w tej przeglądarce.'));
      } catch { toast(t('Nie udało się wczytać tego pliku jako zdjęcia.'), { error: true }); }
      redraw();
    }

    function setPref(key, v) { if (prefs[key] === v) return; prefs[key] = v; save(); }
    function click(ev) {
      const b = ev.target.closest('[data-sh]');
      if (ev.target === wrap) return done();
      if (!b || b.disabled) return;
      const v = b.dataset.v;
      switch (b.dataset.sh) {
        case 'close': done(); return;
        case 'kind': st.kind = v; st.clip = null; redraw(); return;
        case 'prev': case 'next': st.clip = null; st.anchor = stepAnchor(st.kind, st.anchor, b.dataset.sh === 'next' ? 1 : -1); redraw(); return;
        case 'metric': setPref('metric', v); redraw(); return;
        case 'format': setPref('format', v); redraw(); return;
        case 'ncolor': setPref('numberColor', v); redraw(); return;
        case 'bg':
          if (v === 'photo' && !photo) { $('#sh-file').click(); return; }
          st.bg = v; lsSet(BG_KEY, v); redraw(); return;
        case 'pick': $('#sh-file').click(); return;
        case 'rmphoto': photo = null; st.bg = 'theme'; lsSet(PHOTO_KEY, null); lsSet(BG_KEY, 'theme'); redraw(); return;
        case 'download': download(); return;
        case 'copy': copy(); return;
        case 'share': share(); return;
        default:
      }
    }
    wrap.addEventListener('click', click);
    $('#sh-file').addEventListener('change', (ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; onFile(f); });

    function done() {
      seq++;
      wrap.remove();
      overlay.current = prev;
      if (!hadLock) document.documentElement.classList.remove('lb-lock');
      if (opener && document.contains(opener)) opener.focus();
      onClose();
    }
    overlay.current = { share: true, onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); done(); } else trapTab(ev, dlg); } };
    await draw();
    ($('[data-fk="kind-' + st.kind + '"]') || dlg).focus();
  }

  return { open, isOpen: () => !!overlay.current?.share };
}
