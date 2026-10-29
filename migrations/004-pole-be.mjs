// Migracja 004: pole liczbowe „BE” (cena przesunięcia stopa na break even) w bazie Trade'y. Linia BE na pozycji w wykresie świecowym.
// P26 (28.10.2026), słowa użytkownika: «dodaj punkt BE, widoczny na pozycji», wybór: «Nowe pole „BE” (cena)».
// Wyłącznie dodaje pole; istniejące pola, widoki i trade'y zostają nietknięte. Instalacja, która ma już pole o tej roli lub nazwie, pomija krok.
// Migration 004: a "BE" number property (break-even price) in Trades. Add-only.
export default {
  version: 4,
  description: { pl: 'Pole „BE” (cena break even) w bazie Trade\'y (wykres świecowy)', en: '"BE" field (break-even price) in Trades (candlestick chart)' },
  ops: [
    { op: 'addProperty', db: 'trades', role: 'be', spec: { type: 'number', name: { pl: 'BE', en: 'BE' } } },
  ],
};
