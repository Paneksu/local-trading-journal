// Zasiew trade'ów po BE do zrzutów i testu ręcznej kontroli (po-be-04): realistyczne poziomy, SL 20 pkt, TP 2 do 3R, trzy setupy.
// Używa go strona robocza testy/po-be-04-zrzuty.html (scena seed, na prawdziwych świecach NQ z kopii) i test po-be-04 (ścieżka syntetyczna, wynik policzony ręcznie).
// Plik nazywa się bt-*.js, bo dashboard testowy (THQ_TEST_PAGES=1) podaje stronom roboczym tylko takie moduły.
export const ENTRY = 18297.5;
// [setup, kierunek, SL w punktach, TP w wielokrotności R]
export const SEED = [
  ['Breakout', 'Long', 20, 2], ['Breakout', 'Long', 20, 2.5], ['Breakout', 'Long', 20, 3], ['Breakout', 'Short', 20, 2],
  ['Pullback', 'Long', 20, 2], ['Pullback', 'Long', 20, 3], ['Pullback', 'Short', 20, 2.5], ['Pullback', 'Short', 20, 3],
  ['Reversal', 'Long', 20, 2], ['Reversal', 'Long', 20, 2.5], ['Reversal', 'Short', 20, 2], ['Reversal', 'Short', 20, 3],
];
// trade zamknięty stopem na BE (be, beAt, r w marginesie), wejście E, wyjście X (sekundy), pierwotny SL (sl0) i TP z zasiewu
export function seedTrades(E, X, entry = ENTRY) {
  return SEED.map(([setup, dir, slPts, tpR], i) => {
    const long = dir === 'Long';
    return {
      id: `t${i + 1}`, instrument: 'NQ', dir, qty: 1, entryT: E, exitT: X, entryPrice: entry, exitPrice: entry,
      sl0: long ? entry - slPts : entry + slPts, sl: entry, tp: long ? entry + slPts * tpR : entry - slPts * tpR, be: true, beAt: entry,
      r: 0.02, pnl: 20, rUsd: 200, fee: 2.5, maeR: -0.2, mfeR: 0.9, day: '2024-03-12', setup, journal: 'done',
      exits: [{ t: X, reason: 'sl', price: entry, qty: 1 }], log: [],
    };
  });
}
// R bez BE ręcznie: TP daje |tp - wejście| / |wejście - sl0|, SL daje -1 (ta sama reguła co rWithoutBe w po-be.js, tu policzona od zera)
export const expectedR = (tr, status) => (status === 'sl' ? -1 : Math.abs(tr.tp - tr.entryPrice) / Math.abs(tr.entryPrice - tr.sl0));
