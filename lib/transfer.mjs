// „Kolejne urządzenie”: zaszyfrowany kod przeniesienia konfiguracji (token, strona główna, bazy, mapowanie pól, własne logo).
// AES-256-GCM, klucz z 6-cyfrowego PIN-u przez PBKDF2-SHA256 (210 000 iteracji, losowa sól w pakiecie).
// Nagłówek (wersja, identyfikator, ważność) jest uwierzytelniony jako AAD, więc podmiana daty ważności psuje odszyfrowanie.
// Transfer code: AES-256-GCM with a key derived from a 6-digit PIN (PBKDF2-SHA256, 210k iterations), 15-minute validity.
import { randomBytes, randomInt, randomUUID, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';

export const ITERATIONS = 210_000;
export const VALID_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 5;
const PREFIX = 'LTJ1.';
const b64u = (b) => Buffer.from(b).toString('base64url');

export function newPin() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }

export function sealPackage(payload, { now = Date.now(), pin = newPin() } = {}) {
  const header = { v: 1, id: randomUUID(), exp: now + VALID_MS };
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(pin, salt, ITERATIONS, 32, 'sha256');
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(JSON.stringify(header)));
  const ct = Buffer.concat([c.update(JSON.stringify({ ...payload, id: header.id, exp: header.exp }), 'utf8'), c.final()]);
  const body = { h: header, s: b64u(salt), i: b64u(iv), c: b64u(ct), t: b64u(c.getAuthTag()) };
  return { code: PREFIX + b64u(JSON.stringify(body)), pin, id: header.id, expiresAt: new Date(header.exp).toISOString() };
}

export class TransferError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

// Odczyt nagłówka bez PIN-u (identyfikator do licznika prób, ważność do szybkiej odmowy).
export function peekPackage(code) {
  const s = String(code || '').trim().replace(/\s+/g, '');
  if (!s.startsWith(PREFIX)) throw new TransferError('bad-code', 400);
  let body;
  try { body = JSON.parse(Buffer.from(s.slice(PREFIX.length), 'base64url').toString('utf8')); } catch { throw new TransferError('bad-code', 400); }
  if (!body?.h?.id || !body.s || !body.i || !body.c || !body.t || body.h.v !== 1) throw new TransferError('bad-code', 400);
  return body;
}

export function openPackage(code, pin, { now = Date.now() } = {}) {
  const body = peekPackage(code);
  if (!/^\d{6}$/.test(String(pin || ''))) throw new TransferError('bad-pin', 400);
  if (!(body.h.exp > now)) throw new TransferError('expired', 410);
  const key = pbkdf2Sync(String(pin), Buffer.from(body.s, 'base64url'), ITERATIONS, 32, 'sha256');
  let data;
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(body.i, 'base64url'));
    d.setAAD(Buffer.from(JSON.stringify(body.h)));
    d.setAuthTag(Buffer.from(body.t, 'base64url'));
    data = JSON.parse(Buffer.concat([d.update(Buffer.from(body.c, 'base64url')), d.final()]).toString('utf8'));
  } catch { throw new TransferError('bad-pin', 400); }
  if (data.id !== body.h.id || !(data.exp > now)) throw new TransferError('expired', 410);
  return data;
}
