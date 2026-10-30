// Klient Notion API (fetch, ponawianie przy 429). Wspólny dla serwera, instalatora, aktualizacji i kopii zapasowych.
// Notion API client (fetch with retry on 429), shared by the server, setup, update and backup scripts.
import { tr } from './i18n.mjs';

export class NotionError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createNotion({ token, version = '2026-03-11', base = 'https://api.notion.com', t = tr } = {}) {
  async function request(method, pathname, body, form) {
    if (!token) throw new NotionError(t('Brak NOTION_TOKEN w pliku .env.'), 500);
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(base + pathname, {
        method,
        // form (FormData): multipart do POST /v1/file_uploads/{id}/send; nagłówek Content-Type z granicą ustawia fetch sam
        headers: { Authorization: `Bearer ${token}`, 'Notion-Version': version, ...(form ? {} : { 'Content-Type': 'application/json' }) },
        body: form || (body ? JSON.stringify(body) : undefined),
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get('retry-after')) || 1;
        await sleep(wait * 1000 + 100);
        continue;
      }
      if (!res.ok) {
        let msg = '', code;
        try { const j = await res.json(); msg = j.message || ''; code = j.code; } catch { /* brak treści */ }
        if (res.status === 401) msg = t('Notion odrzucił token (401). Token wygasł lub jest błędny: wygeneruj nowy i wpisz w .env.');
        else if (res.status === 403 || res.status === 404) msg = t('Brak dostępu do bazy ({status}). Sprawdź, czy integracja ma dostęp do tej bazy. {msg}', { status: res.status, msg });
        // notionCode: kod błędu Notion (np. conflict_error przy 409), osobne pole, żeby nie mieszać z kodami dashboardu w odpowiedziach (code: 'stale')
        throw Object.assign(new NotionError(msg || t('Notion API: błąd {status}', { status: res.status }), res.status), { notionCode: typeof code === 'string' ? code : undefined });
      }
      return res.json();
    }
    throw new NotionError(t('Notion API: za dużo żądań (429), spróbuj za chwilę.'), 429);
  }
  async function queryAll(dsId) {
    const pages = [];
    let cursor;
    do {
      const data = await request('POST', `/v1/data_sources/${dsId}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      pages.push(...data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return pages;
  }
  return { hasToken: !!token, request, queryAll, upload: (p, form) => request('POST', p, undefined, form), get: (p) => request('GET', p), post: (p, b) => request('POST', p, b), patch: (p, b) => request('PATCH', p, b) };
}
