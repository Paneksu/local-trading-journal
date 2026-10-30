// Stan wysyłki trade'a backtestu do Notion (1.5.0, E2 i poprawki po review), czyste funkcje wspólne dla przeglądarki (bt-replay.js, bt-journal.js)
// i serwera (lib/backtest-sync.mjs). Bez importów: serwer ładuje ten plik bez modułów przeglądarki.
// trade.notion = { id, state: 'pending'|'sent'|'error', error, edited, postAt } należy do serwera; trade.jEdited (czas ostatniego opisu w panelu) należy do przeglądarki.
// English: shared helpers for the Notion sync state of a backtest trade.

// Setup, którego jeszcze nie ma w opcjach Notion, tworzy nową opcję tylko wg tej reguły (= FIRMA_RE w lib/writes.mjs, test backtest-E2 sprawdza zgodność).
export const SETUP_RE = /^[\p{L}\p{N} .&'’+\-]{1,40}$/u;
export const SETUP_MAX = 40;
// Po zerwanym POST strony (klient nie wie, czy powstała) nowa strona dopiero po tym czasie, żeby wyszukanie po znaczniku zdążyło ją zobaczyć (review E2 #6).
export const RECREATE_MS = 30_000;

const num = (v) => Number(v) || 0;
// opis zmieniony po ostatniej wysyłce (albo po błędzie) → trzeba wysłać jeszcze raz
export const editedAfter = (tr) => num(tr?.jEdited) > num(tr?.notion?.edited);
export const needsUpdate = (tr) => tr?.notion?.state === 'sent' && !!tr.notion.id && editedAfter(tr);
export const isUnsent = (tr) => !!tr && (tr.notion?.state !== 'sent' || needsUpdate(tr));
// Lista „do uzupełnienia”: trade'y bez opisu oraz z błędem wysyłki (do poprawy opisu i ponownej wysyłki)
export const listOf = (session) => (session?.trades || []).filter((x) => x && (x.journal === 'todo' || x.notion?.state === 'error'));
