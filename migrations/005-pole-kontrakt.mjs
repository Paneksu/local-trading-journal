// Migracja 005: pole tekstowe „Kontrakt” (kod kontraktu terminowego, np. ESZ6, MNQH7) w bazie Trade'y. Wykres trade'a rysuje świece tego kontraktu w sesjach trade'a.
// P35 (28.10.2026), słowa użytkownika: «Tak, pole „Kontrakt”». Puste pole = kontrakt wg daty trade'a (roll rynku).
// Wyłącznie dodaje pole; istniejące pola, widoki i trade'y zostają nietknięte. Instalacja, która ma już pole o tej roli lub nazwie, pomija krok.
// Migration 005: a "Contract" text property (futures contract code, e.g. ESZ6) in Trades. Add-only.
export default {
  version: 5,
  description: { pl: 'Pole „Kontrakt” (kod kontraktu, np. ESZ6) w bazie Trade\'y (wykres świecowy)', en: '"Contract" field (contract code, e.g. ESZ6) in Trades (candlestick chart)' },
  ops: [
    { op: 'addProperty', db: 'trades', role: 'contract', spec: { type: 'rich_text', name: { pl: 'Kontrakt', en: 'Contract' } } },
  ],
};
