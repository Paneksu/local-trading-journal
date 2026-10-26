// Dodawanie zrzutu ekranu do trade'a: wybór pliku (na telefonie galeria lub aparat), przeciągnij i upuść, wklejenie ze schowka (Ctrl+V).
// Wysyłka: POST /api/trades/:id/shots z JSON { type, data: base64 } (ochrona zapisu: Origin, X-THQ, JSON). Serwer sprawdza typ po bajtach i rozmiar.
// Adding a screenshot to a trade: file picker, drag and drop, clipboard paste; the server validates type and size again.
import { t } from './i18n.js';
import { esc } from './format.js';
import { toast, guide } from './modal.js';

const SHOT_MAX_BYTES = 10 * 1024 * 1024; // górna granica jak na serwerze (lib/shots.mjs); serwer może mieć niższą (limit przestrzeni Notion) i wtedy odmawia z komunikatem
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// Wstępna kontrola w przeglądarce to tylko wygoda (szybki komunikat bez wysyłania 10 MB); decyduje serwer.
function checkShot(file) {
  // pusty type (wklejony zrzut w niektórych przeglądarkach) przechodzi: serwer rozpoznaje typ po bajtach
  if (!file || (file.type && !TYPES.includes(String(file.type).toLowerCase()))) return t('Dozwolone są tylko obrazy PNG, JPEG, WebP i GIF.');
  if (file.size === 0) return t('Plik jest pusty.');
  if (file.size > SHOT_MAX_BYTES) return t('Plik jest za duży: najwyżej 10 MB.');
  return '';
}

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
  r.onerror = () => reject(new Error(t('Nie udało się odczytać pliku.')));
  r.readAsDataURL(file);
});

// onState({ phase: 'send' | 'notion', pct }) — XMLHttpRequest, bo fetch nie pokazuje postępu wysyłania.
async function uploadShot(tradeId, file, { edited = '', onState = () => {} } = {}) {
  const bad = checkShot(file);
  if (bad) throw new Error(bad);
  const data = await toBase64(file);
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/api/trades/${encodeURIComponent(tradeId)}/shots`);
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('X-THQ', '1');
    x.timeout = 120_000;
    x.upload.onprogress = (e) => { if (e.lengthComputable) onState({ phase: e.loaded >= e.total ? 'notion' : 'send', pct: Math.round((e.loaded / e.total) * 100) }); };
    x.upload.onload = () => onState({ phase: 'notion', pct: 100 });
    x.onload = () => {
      let j = {};
      try { j = JSON.parse(x.responseText); } catch { /* brak treści */ }
      if (x.status >= 200 && x.status < 300) resolve(j);
      else reject(new Error(j.error || t('Nie udało się dodać zrzutu (błąd {status}).', { status: x.status })));
    };
    x.onerror = () => reject(new Error(t('Nie mogę połączyć się z lokalnym serwerem. Uruchom dashboard ponownie i spróbuj jeszcze raz.')));
    x.ontimeout = () => reject(new Error(t('Wysyłanie trwało zbyt długo. Sprawdź połączenie i spróbuj jeszcze raz.')));
    x.send(JSON.stringify({ type: String(file.type || '').toLowerCase(), data, edited }));
  });
}

// Pierwszy obraz ze schowka (zrzut z Win+Shift+S, Cmd+Shift+4 z Ctrl) albo z upuszczonych plików.
const imageFrom = (list) => [...(list || [])].find((f) => f && String(f.type).startsWith('image/')) || null;
const hasFiles = (dt) => !!dt && [...(dt.types || [])].includes('Files');

export const statusHtml = () => '<div class="shot-st" role="status" aria-live="polite" hidden><progress max="100" value="0"></progress><span></span></div>';
export const buttonHtml = (label) => `<button type="button" class="btn shot-add">${esc(label)}</button><input type="file" class="shot-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden tabindex="-1">`;

// root: element zawierający przycisk, input i pasek stanu; zone: obszar upuszczania; isActive: czy wklejanie ma teraz działać.
// getTrade: () => { id, edited } bieżącego trade'a; onUploaded(res): po sukcesie (odświeżenie danych i miniatury).
export function bindShots({ root, zone, isActive, getTrade, onUploaded }) {
  const btn = root.querySelector('.shot-add'), input = root.querySelector('.shot-file'), st = root.querySelector('.shot-st');
  const bar = st.querySelector('progress'), msg = st.querySelector('span');
  let busy = false, hideTimer = 0;
  const show = (text, { error = false, pct = null } = {}) => {
    clearTimeout(hideTimer);
    st.hidden = false;
    st.classList.toggle('err', error);
    bar.hidden = pct == null;
    if (pct != null) bar.value = pct;
    msg.textContent = text;
  };
  async function handle(file) {
    if (guide.on) { toast(t('Tryb przewodnika: zrzut nie jest wysyłany do Notion.')); return; }
    const tr = getTrade();
    if (!tr || busy) return;
    const bad = checkShot(file);
    if (bad) { show(bad, { error: true }); toast(bad, { error: true }); return; }
    busy = true;
    btn.disabled = true;
    show(t('Wysyłam…'), { pct: 0 });
    try {
      const res = await uploadShot(tr.id, file, {
        edited: tr.edited,
        onState: ({ phase, pct }) => show(phase === 'notion' ? t('Zapisuję w Notion…') : t('Wysyłam… {pct}%', { pct }), { pct }),
      });
      show(res.warning || t('Dodano zrzut.'), { pct: 100 });
      hideTimer = setTimeout(() => { st.hidden = true; }, res.warning ? 8000 : 2500);
      toast(res.warning || t('Dodano zrzut do trade\'a.'));
      await onUploaded(res);
    } catch (e) {
      show(e.message, { error: true });
      toast(e.message, { error: true });
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { const f = imageFrom(input.files) || input.files?.[0]; input.value = ''; if (f) handle(f); });
  // upuszczenie: tylko pliki; dragover musi być anulowany, inaczej przeglądarka otworzy obraz w karcie
  zone.addEventListener('dragover', (e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); zone.classList.add('shot-drop'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('shot-drop'); });
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('shot-drop');
    if (!hasFiles(e.dataTransfer)) return;
    e.preventDefault();
    const f = imageFrom(e.dataTransfer.files);
    if (f) handle(f); else { const m = t('Dozwolone są tylko obrazy PNG, JPEG, WebP i GIF.'); show(m, { error: true }); toast(m, { error: true }); }
  });
  // wklejenie: tylko gdy w schowku jest obraz (zwykły tekst wkleja się jak zawsze, także do pól formularza)
  const onPaste = (e) => {
    if (!isActive()) return;
    const f = imageFrom(e.clipboardData?.files) || imageFrom([...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()));
    if (!f) return;
    e.preventDefault();
    handle(f);
  };
  document.addEventListener('paste', onPaste);
  return { unbind: () => document.removeEventListener('paste', onPaste), busy: () => busy };
}
