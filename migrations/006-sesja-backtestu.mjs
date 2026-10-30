// Migracja 006: pola modułu Backtest (1.5.0) w bazie Trade'y. „Sesja backtestu” (tekst „<nazwa sesji> [<sessionId>/<tradeId>]”, znacznik w nawiasie to klucz
// idempotencji wysyłki z lib/backtest-sync.mjs), „MAE (R)” i „MFE (R)” (najgorsze i najlepsze wychylenie trade'a w R, statystyki wykonania na każdym urządzeniu).
// [U] 30.10.2026 «Tak, dodać pola» (projekt §11, 18a). Wyłącznie dodaje pola; istniejące pola, widoki i trade'y zostają nietknięte. Instalacja, która ma już pole
// o tej roli lub nazwie, pomija krok.
// Migration 006: Backtest session, MAE (R) and MFE (R) fields in Trades. Add-only.
export default {
  version: 6,
  description: { pl: 'Pola „Sesja backtestu”, „MAE (R)” i „MFE (R)” w bazie Trade\'y (moduł Backtest)', en: '"Backtest session", "MAE (R)" and "MFE (R)" fields in Trades (Backtest module)' },
  ops: [
    { op: 'addProperty', db: 'trades', role: 'btSession', spec: { type: 'rich_text', name: { pl: 'Sesja backtestu', en: 'Backtest session' } } },
    { op: 'addProperty', db: 'trades', role: 'btMae', spec: { type: 'number', name: { pl: 'MAE (R)', en: 'MAE (R)' } } },
    { op: 'addProperty', db: 'trades', role: 'btMfe', spec: { type: 'number', name: { pl: 'MFE (R)', en: 'MFE (R)' } } },
  ],
};
