// Migracja 003: pola cen (wejście, wyjście, SL, TP) i „Rysunki” w bazie Trade'y. Dane dla wykresu świecowego.
// Wyłącznie dodaje pola; istniejące pola, widoki i trade'y zostają nietknięte. Instalacje, które mają już pole o tej roli lub nazwie, pomijają krok.
// „Rysunki” to rich_text zapisywany kawałkami do 2000 znaków (zapis w etapie 9); nie jest wysyłane do przeglądarki w /api/data.
// Migration 003: price fields (entry, exit, SL, TP) and a "Drawings" rich_text property in Trades. Add-only.
export default {
  version: 3,
  description: { pl: 'Pola cen (wejście, wyjście, SL, TP) i „Rysunki” w bazie Trade\'y (wykres świecowy)', en: 'Price fields (entry, exit, SL, TP) and "Drawings" in Trades (candlestick chart)' },
  ops: [
    { op: 'addProperty', db: 'trades', role: 'entryPrice', spec: { type: 'number', name: { pl: 'Cena wejścia', en: 'Entry price' } } },
    { op: 'addProperty', db: 'trades', role: 'exitPrice', spec: { type: 'number', name: { pl: 'Cena wyjścia', en: 'Exit price' } } },
    { op: 'addProperty', db: 'trades', role: 'sl', spec: { type: 'number', name: { pl: 'SL', en: 'SL' } } },
    { op: 'addProperty', db: 'trades', role: 'tp', spec: { type: 'number', name: { pl: 'TP', en: 'TP' } } },
    { op: 'addProperty', db: 'trades', role: 'drawings', spec: { type: 'rich_text', name: { pl: 'Rysunki', en: 'Drawings' } } },
  ],
};
