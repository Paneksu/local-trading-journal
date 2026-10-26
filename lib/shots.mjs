// Dodawanie zrzutu ekranu do trade'a z dashboardu: Notion File Upload API (tryb single_part), potem blok obrazu na końcu strony trade'a.
// Dlaczego blok, a nie pole „Zrzut”: zapis pola typu files zastępuje całą tablicę, a pliki wgrane w Notion (type: file) mają tylko
// tymczasowe adresy, których dokumentacja nie opisuje jako bezpiecznych do ponownego wysłania. Blok nie rusza istniejących zrzutów.
// Docs: https://developers.notion.com/guides/data-apis/uploading-small-files (create → send → attach), page-property-values (files replace the full list).
// Adding a screenshot to a trade from the dashboard: File Upload API, then an image block appended to the trade page (never touches the "Screenshot" property).
import { createHash } from 'node:crypto';
import { NotionError } from './notion.mjs';
import { ValidationError, sameId } from './writes.mjs';

const MAX_BYTES = 10 * 1024 * 1024; // Notion single_part przyjmuje do 20 MB, a darmowy plan do 5 MB: faktyczny limit to min(10 MB, limit przestrzeni)
// Limit ciała żądania (JSON z base64): 10 MB po zakodowaniu + zapas na pola
export const SHOT_BODY_LIMIT = Math.ceil(MAX_BYTES / 3) * 4 + 4096;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const LIMIT_TTL = 10 * 60_000;
const MAX_PARALLEL = 2;

// Rozpoznanie typu po pierwszych bajtach: deklarowany Content-Type z przeglądarki bywa pusty albo błędny (np. wklejony zrzut).
function sniffImage(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('latin1', 0, 6))) return 'image/gif';
  return null;
}

// Typ wynika z bajtów pliku (deklaracja jest tylko wskazówką); niedozwolone bajty = odmowa.
function parseShotInput(input, max, t) {
  const bad = (m) => new ValidationError({ shot: m }, m);
  const mb = Math.max(1, Math.floor(max / 1048576));
  const big = () => bad(t('Plik jest za duży: najwyżej {mb} MB.', { mb }));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad(t('Nieprawidłowe dane zrzutu.'));
  const b64 = typeof input.data === 'string' ? input.data : '';
  if (!b64) throw bad(t('Plik jest pusty.'));
  if (b64.length > Math.ceil(max / 3) * 4 + 4) throw big();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) throw bad(t('Nieprawidłowe dane zrzutu.'));
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw bad(t('Plik jest pusty.'));
  if (buf.length > max) throw big();
  const type = sniffImage(buf);
  if (!type) throw bad(t('Dozwolone są tylko obrazy PNG, JPEG, WebP i GIF.'));
  return { type, buf };
}

export function createShots({ notion, sources, data, t }) {
  const inflight = new Set();
  let limit = { at: 0, bytes: MAX_BYTES };
  let running = 0;
  const waiting = [];
  // Najwyżej MAX_PARALLEL wysyłek naraz (każda trzyma plik w pamięci i obciąża limit żądań Notion)
  async function slot() {
    if (running >= MAX_PARALLEL) await new Promise((r) => waiting.push(r));
    running++;
  }
  const release = () => { running--; waiting.shift()?.(); };

  // Limit pliku w tej przestrzeni roboczej: GET /v1/users/me → bot.workspace_limits.max_file_upload_size_in_bytes (cache 10 min)
  async function maxBytes() {
    if (Date.now() - limit.at < LIMIT_TTL) return limit.bytes;
    let bytes = MAX_BYTES;
    try {
      const me = await notion.get('/v1/users/me');
      const w = Number(me?.bot?.workspace_limits?.max_file_upload_size_in_bytes);
      if (Number.isFinite(w) && w > 0) bytes = Math.min(MAX_BYTES, w);
    } catch (e) { console.error('[shots] nie udało się odczytać limitu pliku:', e.message); }
    limit = { at: Date.now(), bytes };
    return bytes;
  }

  const denied = (e) => (e instanceof NotionError && e.status === 403
    ? new NotionError(t('Notion nie pozwala dodać zrzutu do tej strony. Włącz integracji uprawnienie „Insert content” (Notion → Ustawienia → Połączenia → Twoja integracja → Capabilities) i spróbuj ponownie.'), 403, 'no_insert')
    : e);

  async function add(pageId, input) {
    const { type, buf } = parseShotInput(input, await maxBytes(), t);
    const key = `${pageId}:${createHash('sha1').update(buf).digest('hex')}`;
    if (inflight.has(key)) throw new NotionError(t('Ten zrzut jest już wysyłany. Poczekaj chwilę.'), 409, 'busy');
    inflight.add(key);
    await slot();
    try {
      if (!sources.trades) throw new NotionError(t('Brak identyfikatora bazy w pliku .env ({db}).', { db: 'trades' }), 500);
      const page = await notion.get(`/v1/pages/${pageId}`);
      if (page.archived || page.in_trash) throw new NotionError(t('Ten wpis jest w koszu Notion. Przywróć go w Notion albo odśwież dane.'), 409);
      if (!sameId(page.parent?.data_source_id, sources.trades)) throw new NotionError(t('Ten wpis nie należy do właściwej bazy.'), 403);
      const editedBefore = page.last_edited_time;
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const filename = `zrzut-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${EXT[type]}`;
      let fu;
      try { fu = await notion.post('/v1/file_uploads', { mode: 'single_part', filename, content_type: type }); } catch (e) { throw denied(e); }
      if (!fu?.id) throw new NotionError(t('Notion nie utworzył miejsca na plik. Spróbuj ponownie.'), 502);
      const form = new FormData();
      form.append('file', new Blob([buf], { type }), filename);
      await notion.upload(`/v1/file_uploads/${fu.id}/send`, form);
      try { await notion.patch(`/v1/blocks/${pageId}/children`, { children: [{ object: 'block', type: 'image', image: { type: 'file_upload', file_upload: { id: fu.id } } }] }); } catch (e) { throw denied(e); }
      // Od tej chwili zrzut JEST w Notion: błąd odświeżenia podglądu nie może zwrócić błędu (ponowienie zrobiłoby duplikat)
      data.invalidate();
      try {
        const entry = await data.refreshImgEntry(pageId);
        // index: pozycja nowego zrzutu w /api/img (ostatni plik z Notion; snapshot TradingView idzie po plikach)
        // edited: nowy znacznik strony; editedMatched: formularz nie miał wcześniej innej wersji niż Notion (wtedy wolno mu przejąć znacznik, bez fałszywego 409)
        return { ok: true, id: pageId, imgs: entry.files.length + (entry.tv ? 1 : 0), index: entry.files.length - 1, edited: entry.edited, editedMatched: !input.edited || input.edited === editedBefore };
      } catch (e) {
        console.error('[shots] zrzut dodany, odświeżenie podglądu nieudane:', e.message);
        return { ok: true, id: pageId, warning: t('Zrzut został dodany w Notion, ale nie udało się odświeżyć podglądu. Odśwież dane przyciskiem w pasku statusu.'), editedMatched: false };
      }
    } finally {
      release();
      inflight.delete(key);
    }
  }
  return { add };
}
