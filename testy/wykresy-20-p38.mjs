// wykresy-20: P38 (28.10.2026). Słowa użytkownika: «okej wedle naszej rozmowy  BADJ domyslnie wlaczony w ustawieniach przelacznik».
// Ustalenia rozmowy: użytkownik handluje ICT i potrzebuje poprawnej struktury HTF sprzed rolli, więc B-ADJ jest domyślnie włączony; liczy się względem kontraktu trade'a
// (jego ceny są prawdziwe, więc wejście, SL, TP, BE i rysunki trafiają co do ticka), starsze kontrakty idą o sumę luk do niego, nowsze w drugą stronę;
// bez trade'a kotwicą jest najnowszy kontrakt. B-ADJ działa także w trybie edycji; przycisk na wykresie przełącza widok tylko chwilowo.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const qOf = (y, m) => y * 4 + (m / 3 - 1);

  test('wykresy-20: P38 adjustOffsets z kotwicą: kontrakt kotwicy 0, starsze o sumę luk do niego, nowsze w drugą stronę; bez kotwicy jak dotąd (najnowszy 0)', async () => {
    const K = await lib('public/js/kontrakty.js');
    const H6 = qOf(2026, 3), g = { [H6]: 5500, [H6 + 1]: 5150 }; // luka przy przejściu na H6 i na M6
    const none = K.adjustOffsets(g);
    assert.equal(none(H6 + 1), 0); assert.equal(none(H6), 5150); assert.equal(none(H6 - 1), 10650, 'bez kotwicy: jak przed P38');
    const a = K.adjustOffsets(g, H6);
    assert.equal(a(H6), 0, 'kontrakt kotwicy bez przesunięcia'); assert.equal(a(H6 - 1), 5500, 'starszy: luka do kotwicy'); assert.equal(a(H6 - 2), 5500, 'starszy bez własnej luki');
    assert.equal(a(H6 + 1), -5150, 'nowszy: w drugą stronę'); assert.equal(a(H6 + 5), -5150);
    const b = K.adjustOffsets(g, H6 - 1);
    assert.equal(b(H6 - 1), 0); assert.equal(b(H6), -5500); assert.equal(b(H6 + 1), -10650);
  });

  // syntetyczny roll NQM4 → NQU4 (czerwiec 2024): M4 ~18000, U4 ~18055 (luka 55,00), warstwa U4 od 3 dni przed rollem
  async function rollStore() {
    const C = await lib('lib/candles-store.mjs');
    const S = await lib('public/js/swiece.js');
    const K = await lib('public/js/kontrakty.js');
    const M4 = qOf(2024, 6), U4 = M4 + 1;
    const T = K.rollAtFn()(M4); // roll rynku (reguła zapasowa: bez pomiaru obrotu)
    const TV = T + 2 * 86400; // przełączenie .v.0
    const A = T - 8 * 86400, B = T + 4 * 86400, P = T - 3 * 86400;
    const bars = (a, b, px) => { const out = []; for (let t = a; t < b; t += 900) if (S.sessionBounds(t)) out.push([t, px, px + 25, px - 25, px, 10]); return out; };
    const dir = H.tmp(), o = { baseDir: dir };
    C.writeRange('NQ', '1m', A, TV, bars(A, TV, 1800000), { rolls: [] }, o);
    C.writeRange('NQ', '1m', TV, B, bars(TV, B, 1805500), { rolls: [{ t: TV, label: 'x' }] }, o);
    C.writeRange('NQ', '1m-NQU2024', P, TV, bars(P, TV, 1805500), {}, o);
    C.writeAux('contracts-nq', { resolvedTo: '2024-07-01', v0: [[TV - 40 * 86400, M4], [TV, U4]], names: { [M4]: { name: 'NQM4', id: '1' }, [U4]: { name: 'NQU4', id: '2' } } }, o);
    const { createCandles } = await lib('lib/candles.mjs');
    const R = createCandles({ getKey: () => '', getConfig: () => ({}), baseDir: dir, now: () => Date.UTC(2024, 7, 1) });
    return { R, T, A, B, M4, U4 };
  }
  const at = (n) => ({ from: String(n.from), to: String(n.to) });

  test('wykresy-20: P38 trade w starszym kontrakcie (NQM4, 2024): z B-ADJ wejście trafia w świecę (kotwica = kontrakt trade\'a), nowszy kontrakt przeliczony o lukę, bez B-ADJ bez zmian', async () => {
    const { R, T, A, B } = await rollStore();
    const entry = T - 4 * 86400 + 15 * 3600; // w sesji NQM4 przed rollem
    const q = { instrument: 'NQ', ...at({ from: A, to: B }), tf: '1m', tfrom: String(entry), tto: String(entry + 600) };
    const plain = R.read(q), adj = R.read({ ...q, adjust: '1' });
    const inBar = (r, price) => { const b = r.bars.find((x) => x[0] <= entry && entry < x[0] + 60) || r.bars.filter((x) => x[0] <= entry).pop(); return b && b[3] <= price && price <= b[2]; };
    assert.ok(inBar(plain, 18000), 'sanity: bez B-ADJ wejście w cenie NQM4 trafia');
    assert.ok(inBar(adj, 18000), 'z B-ADJ wejście w cenie kontraktu trade\'a nadal trafia (przed P38: świece NQM4 przesunięte o +55)');
    assert.equal(adj.contract.code, 'NQM4');
    assert.equal(adj.adjust.anchor, 'NQM4', 'serwer mówi, jaki kontrakt jest kotwicą');
    const lastOld = adj.bars.filter((b) => b[0] < T).pop(), firstNew = adj.bars.find((b) => b[0] >= T);
    assert.equal(lastOld[4], 18000, 'kontrakt trade\'a: ceny prawdziwe');
    assert.equal(firstNew[4], 18000, 'NQU4 przeliczony do ceny NQM4 (18055 − 55): ciągłość na rollu');
    const rawNew = plain.bars.find((b) => b[0] >= T);
    assert.equal(rawNew[4], 18055, 'bez B-ADJ NQU4 w swojej cenie');
  });

  test('wykresy-20: P38 trade w nowszym kontrakcie (NQU4): stary kontrakt przesunięty o +lukę, kontrakt trade\'a prawdziwy; bez trade\'a kotwica = najnowszy kontrakt (jak dotąd)', async () => {
    const { R, T, A, B } = await rollStore();
    const entry = T + 86400 + 15 * 3600; // po rollu: kontrakt wg reguły NQU4
    const q = { instrument: 'NQ', ...at({ from: A, to: B }), tf: '1m', adjust: '1' };
    const withTrade = R.read({ ...q, tfrom: String(entry), tto: String(entry + 600) });
    assert.equal(withTrade.adjust.anchor, 'NQU4');
    assert.equal(withTrade.bars.filter((b) => b[0] < T).pop()[4], 18055, 'NQM4 przesunięty do NQU4');
    assert.equal(withTrade.bars.find((b) => b[0] >= T)[4], 18055, 'NQU4 prawdziwy');
    const noTrade = R.read(q);
    assert.equal(noTrade.adjust.anchor, null, 'bez trade\'a brak kotwicy trade\'a');
    assert.equal(noTrade.bars.filter((b) => b[0] < T).pop()[4], 18055, 'bez trade\'a: najnowszy kontrakt (jak przed P38)');
    // kotwica starszego kontraktu w trade'ie po rollu (pole „Kontrakt” = NQM4 w sesji po rollu): NQM4 prawdziwy, NQU4 −luka
    const forced = R.read({ ...q, tfrom: String(entry), tto: String(entry + 600), contract: 'NQM4' });
    assert.equal(forced.adjust.anchor, 'NQM4');
    const inWin = forced.bars.filter((b) => b[0] >= entry - 3600 && b[0] < entry + 3600);
    assert.ok(inWin.every((b) => b[4] === 18000), `okno trade'a w kontrakcie z pola: ${JSON.stringify(inWin[0])}`);
  });

  test('wykresy-20: P38 zapis w edycji przy B-ADJ wł. daje te same ceny co przy wył. (ceny z osi = kontrakt trade\'a; świece służą tylko do przyciągnięcia czasu)', async () => {
    const { R, T, A, B } = await rollStore();
    const Rz = await lib('public/js/rysunki.js');
    const entry = T - 4 * 86400 + 15 * 3600, exit = entry + 600;
    const q = { instrument: 'NQ', ...at({ from: A, to: B }), tf: '1m', tfrom: String(entry), tto: String(exit) };
    const plain = R.read(q).bars, adj = R.read({ ...q, adjust: '1' }).bars;
    const trade = { at: entry * 1000, exitAt: exit * 1000, entryPrice: 18000, exitPrice: 18020, sl: 17980, tp: 18020, be: null, r: 1 };
    const d = { kind: 'long-position', points: [{ time: entry, price: 18000 }, { time: exit + 3600, price: 18000 }], style: { stopLevel: 20, profitLevel: 40, exitLevel: 30 } };
    let planA, planB;
    try {
      planA = Rz.planTradeSave(trade, d, { candles: plain, step: 60 });
      planB = Rz.planTradeSave(trade, d, { candles: adj, step: 60 });
    } catch (e) { assert.fail('planTradeSave: ' + e.message); }
    assert.deepEqual(planB, planA, 'ten sam plan zapisu z B-ADJ i bez');
    assert.ok(plain.find((b) => b[0] === entry - (entry % 60)) && adj.find((b) => b[0] === entry - (entry % 60)), 'świeca wejścia jest w obu seriach');
  });

  test('wykresy-20: P38 front: B-ADJ domyślnie włączony z Ustawień, przełącznik w Ustawieniach, ostrzeżenie o przeliczeniu do kontraktu trade\'a, edytor bez blokady', async () => {
    const P = await lib('public/js/podglad.js');
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
    try {
      assert.equal(P.loadBadj(), true, 'domyślnie WŁĄCZONY');
      P.setBadjDefault(false); assert.equal(P.loadBadj(), false);
      P.setBadjDefault(true); assert.equal(P.loadBadj(), true);
      assert.equal(mem.size, 0, 'przycisk i ustawienie nie zapisują się w localStorage wykresu (przełącznik na wykresie jest chwilowy)');
    } finally { delete globalThis.localStorage; }
    const w = P.badjWarning({ missing: ['ESM4 → ESU4'] });
    assert.match(w, /przeliczone do kontraktu trade'a/); assert.match(w, /pasują do świec/); assert.match(w, /Bez luki.*ESM4 → ESU4/, 'luka czerwca 2014 jak dotąd');
    assert.doesNotMatch(w, /mogą nie pasować/);
    const app = src('public/js/app.js'), ust = src('public/js/ustawienia.js'), wyk = src('public/js/wykres.js');
    assert.match(app, /chartBadj: true/, 'ustawienie domyślnie włączone'); assert.match(app, /collect:[^\n]*chartBadj: settings\.chartBadj/, 'synchronizowane między urządzeniami');
    assert.match(ust, /id="sp-badj"[^>]*\$\{settings\.chartBadj !== false \? 'checked'/, 'przełącznik w Ustawieniach (domyślnie zaznaczony)');
    assert.doesNotMatch(wyk, /bj\.disabled = true;(?![^\n]*kotwicy)/, 'edytor nie blokuje B-ADJ bez powodu');
    assert.match(wyk, /setBadj\(!badj\)/, 'przycisk B-ADJ działa w edytorze');
  });
};
