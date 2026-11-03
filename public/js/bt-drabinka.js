// Drabinka TP 1.7-5 „Kilka TP z procentem wielkości”: czyste funkcje (bez DOM, bez I/O, działają w przeglądarce i w Node) wspólne dla silnika, biletu, presetów, wykresu i szuflady.
// Model: docs/plany/backtest/1.7.0/model-pozycji-1-7.md §2.4 (`tps`), karta etap-1-7-5-kilka-tp.md (reguła ilości).
// [U] 1.11.2026 «Tak, w 1.7.0 po auto-BE» (P2): kilka TP z procentem wielkości; do Notion jeden trade z wynikiem łącznym (średnia cena wyjścia).
// Poziom: { id: 'tp1'…'tp4', price, pct, hit: null | { at, qty } }. Poziomy trafione stoją w liście na początku (w kolejności trafień), nietrafione po nich od najbliższego do najdalszego.
// Numer poziomu (TP1, TP2…) to jego miejsce w tej kolejności, `id` jest stały, a procent idzie za `id`. Ostatni nietrafiony (najdalszy) jest „resztą”: jego procent to 100 − suma pozostałych
// poziomów (także trafionych), więc suma procentów drabiny zawsze wynosi 100.
// Reguła ilości (karta, rdzeń pakietu): poziom zamyka round(otwarta · pct / Σ pct nietrafionych), najmniej 1, najwyżej otwarta (połówka w górę); ostatni nietrafiony zamyka całą resztę.
// Suma ilości planu zawsze równa się ilości pozycji; poziom, któremu nic nie zostało (np. 1 kontrakt na 2 poziomy), ma ilość 0 i nie działa.
// English: TP ladder helpers: ordering, percent normalisation, validation (max 4 levels), quantity rule and edit operations shared by the engine and the UI.

export const TPS_MAX = 4;

export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const far = (dir, price) => (dir === 'Short' ? -price : price);
// tablica obiektów (plik sesji z przeglądarki bywa nietypowy): elementy, które nie są obiektami, odpadają; nie-tablica to pusta lista
export const objs = (x) => (Array.isArray(x) ? x.filter((e) => e && typeof e === 'object') : []);
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

// kolejność drabiny: trafione na początku (w kolejności trafień), potem nietrafione od najbliższego ceny wejścia do najdalszego
export function tpOrder(dir, tps) {
  const list = objs(tps);
  const hit = list.filter((x) => x.hit).sort((a, b) => (a.hit.at ?? 0) - (b.hit.at ?? 0) || far(dir, a.price) - far(dir, b.price));
  const open = list.filter((x) => !x.hit).sort((a, b) => far(dir, a.price) - far(dir, b.price));
  return [...hit, ...open];
}

// najdalszy poziom drabiny (także trafiony): cena „ostatniego celu” do lustra `tp` i do Notion; null bez poziomów
export function farthestTp(dir, tps) {
  let best = null;
  for (const x of objs(tps)) if (isNum(x.price) && (best == null || far(dir, x.price) > far(dir, best))) best = x.price;
  return best;
}

// podział po równo: floor(total / n) na poziom, reszta na ostatnim (3 → 33, 33, 34)
export function equalPcts(n, total = 100) {
  if (!(n >= 1)) return [];
  const base = Math.floor(total / n), out = Array(n).fill(base);
  out[n - 1] += total - base * n;
  return out;
}

// Procenty listy poziomów nietrafionych (posortowanych od najbliższego): nie-ostatnie całkowite ≥ 1, ostatni = rest − suma pozostałych (≥ 1). rest = 100 − Σ procentów trafionych.
// Brak procentów (undefined/null) u któregokolwiek nie-ostatniego = podział po równo. → { pcts } albo { bad: true }.
function pctsOf(items, rest) {
  const n = items.length;
  if (n === 0) return { pcts: [] };
  if (n === 1) return rest >= 1 ? { pcts: [rest] } : { bad: true };
  const raw = items.slice(0, -1).map((x) => (x.pct === undefined || x.pct === null ? null : num(x.pct)));
  let pcts;
  if (raw.some((v) => v === null)) pcts = equalPcts(n, rest);
  else {
    if (raw.some((v) => !Number.isInteger(v) || v < 1)) return { bad: true };
    const sum = raw.reduce((a, b) => a + b, 0);
    pcts = [...raw, rest - sum];
  }
  return pcts.every((v) => Number.isInteger(v) && v >= 1) ? { pcts } : { bad: true };
}

// Procenty poziomów (w kolejności od najbliższego, np. z presetu) po normalizacji: lista liczb albo null przy błędnym procencie (patrz pctsOf). rest = ile procent dzielą poziomy (domyślnie 100).
export function ladderPcts(items, rest = 100) {
  const pc = pctsOf(objs(items), rest);
  return pc.bad ? null : pc.pcts;
}

// Normalizacja drabiny wczytanej z pliku sesji (runda 2, bezpieczeństwo P3-1): silnik ufa drabinie już leżącej w księdze, więc przy wczytaniu zostaje z niej tylko to, co przeszłoby walidację.
// Poziom bez poprawnej ceny odpada, zostaje najwyżej TPS_MAX poziomów (trafione i najbliższe), `id` spoza tp1…tp9 albo powtórzone dostaje wolny, procenty nietrafionych idą przez ladderPcts
// (tekst „50” staje się liczbą, procent błędny albo zero = podział po równo, ostatni = reszta). Dla poprawnej drabiny wynik jest identyczny z wejściem (idempotentne).
export function sanitizeTps(dir, tps) {
  const cut = tpOrder(dir, objs(tps).map((x) => ({ ...x, price: num(x.price) })).filter((x) => isNum(x.price))).slice(0, TPS_MAX);
  const used = new Set();
  const withId = cut.map((x) => {
    if (typeof x.id === 'string' && /^tp[1-9]$/.test(x.id) && !used.has(x.id)) { used.add(x.id); return { ...x }; }
    return { ...x, id: null };
  });
  for (const x of withId) if (!x.id) { let k = 1; while (used.has(`tp${k}`)) k++; x.id = `tp${k}`; used.add(x.id); }
  const hits = withId.filter((x) => x.hit && typeof x.hit === 'object').map((x) => ({ ...x, pct: isNum(num(x.pct)) ? num(x.pct) : 0 }));
  const unhit = withId.filter((x) => !(x.hit && typeof x.hit === 'object')).map((x) => ({ ...x, hit: null }));
  if (unhit.length) {
    const rest = Math.max(unhit.length, Math.round(100 - hits.reduce((a, h) => a + h.pct, 0)));
    const pcts = ladderPcts(unhit, rest) || equalPcts(unhit.length, rest);
    unhit.forEach((x, i) => { x.pct = pcts[i]; });
  }
  return tpOrder(dir, [...hits, ...unhit]);
}

// Walidacja i normalizacja drabiny. input: lista poziomów { id?, price, pct? } (poziomy trafione w wejściu są ignorowane: decydują `hits` z pozycji), opts: { hits, ref, round }.
// ref = cena odniesienia (bieżąca dla pozycji, cena zlecenia dla zlecenia): każdy nietrafiony poziom musi leżeć po stronie zysku. → { tps } (trafione + nietrafione, id nadane, procenty dopełnione)
// albo { bad: 'bad-tp' | 'tps-max' | 'tps-dup' | 'tps-pct' }.
export function checkTps(dir, input, { hits = [], ref = NaN, round = (x) => x } = {}) {
  if (!Array.isArray(input)) return { bad: 'bad-tp' };
  const hitList = objs(hits).map((x) => ({ ...x }));
  const hitIds = new Set(hitList.map((x) => x.id));
  const items = [];
  for (const x of input) {
    if (!x || typeof x !== 'object') return { bad: 'bad-tp' };
    if (x.id != null && hitIds.has(x.id)) continue;
    const price = round(x.price);
    if (!isNum(price)) return { bad: 'bad-tp' };
    if (Number.isFinite(ref) && !(dir === 'Short' ? price < ref : price > ref)) {
      // runda 2 (P3-2): odrzucenie niesie poziom, którego dotyczy (numer po posortowaniu od najbliższego, jego cenę i cenę odniesienia), żeby komunikat mógł go nazwać
      const nearer = input.filter((y) => y && typeof y === 'object' && !(y.id != null && hitIds.has(y.id)) && isNum(round(y.price)) && far(dir, round(y.price)) < far(dir, price)).length;
      return { bad: 'bad-tp', level: hitList.length + nearer + 1, price, ref };
    }
    items.push({ id: typeof x.id === 'string' && /^tp[1-9]$/.test(x.id) ? x.id : null, price, pct: x.pct });
  }
  if (hitList.length + items.length > TPS_MAX) return { bad: 'tps-max' };
  // id: podane i niepowtarzalne zostają, reszta dostaje pierwsze wolne tpN (kolejność wejścia)
  const used = new Set(hitIds);
  for (const it of items) { if (it.id && used.has(it.id)) it.id = null; if (it.id) used.add(it.id); }
  for (const it of items) { if (!it.id) { let k = 1; while (used.has(`tp${k}`)) k++; it.id = `tp${k}`; used.add(it.id); } }
  items.sort((a, b) => far(dir, a.price) - far(dir, b.price));
  for (let i = 1; i < items.length; i++) if (items[i].price === items[i - 1].price) return { bad: 'tps-dup' };
  const rest = 100 - hitList.reduce((a, h) => a + (isNum(h.pct) ? h.pct : 0), 0);
  const pc = pctsOf(items, rest);
  if (pc.bad) return { bad: 'tps-pct' };
  return { tps: [...hitList, ...items.map((x, i) => ({ id: x.id, price: x.price, pct: pc.pcts[i], hit: null }))] };
}

// Ilość, którą zamyka bieżący poziom: pcts = procenty poziomów nietrafionych od bieżącego (pierwszy) do ostatniego. Ostatni zamyka całą otwartą ilość.
export function tpQtyAt(openQty, pcts) {
  const open = Math.max(0, Math.floor(openQty) || 0);
  if (!Array.isArray(pcts) || pcts.length <= 1) return open;
  // runda 2 (bezpieczeństwo P3-1): procent spoza całkowitych ≥ 1 (uszkodzona księga) = cała reszta na bieżącym poziomie, zamiast NaN w ilości
  if (!pcts.every((v) => Number.isInteger(v) && v >= 1)) return open;
  const sum = pcts.reduce((a, b) => a + b, 0);
  const q = Math.round((open * pcts[0]) / sum + 1e-9);
  return Math.min(open, Math.max(1, q));
}

// Plan drabiny dla pozycji albo zlecenia ({ dir, tps, openQty | qty }): wiersze { id, rank, price, pct, qty, last, hit }. Dla nietrafionych qty to ilość, którą poziom zamknie przy kolejnych
// trafieniach (od bieżącej otwartej ilości, kolejno od najbliższego); to ta sama funkcja, której używa silnik, więc plakietka i wykonanie zawsze się zgadzają.
export function tpPlan(x) {
  if (!x || !Array.isArray(x.tps)) return [];
  const ordered = tpOrder(x.dir, x.tps), unhit = ordered.filter((l) => !l.hit);
  let open = isNum(x.openQty) ? x.openQty : isNum(x.qty) ? x.qty : 0, ui = 0;
  return ordered.map((l, i) => {
    if (l.hit) return { id: l.id, rank: i + 1, price: l.price, pct: l.pct, qty: l.hit.qty ?? 0, last: false, hit: l.hit };
    const q = tpQtyAt(open, unhit.slice(ui).map((u) => u.pct));
    const row = { id: l.id, rank: i + 1, price: l.price, pct: l.pct, qty: q, last: ui === unhit.length - 1, hit: null };
    open -= q; ui++;
    return row;
  });
}

// Operacje edycji drabiny dla UI: tps = pełna lista pozycji (z trafionymi), op ∈ { t: 'add', price } | { t: 'rm', id } | { t: 'price', id, price } | { t: 'pct', id, pct }.
// → lista nietrafionych poziomów { id | null, price, pct } gotowa dla silnika (modifyPosition { tps }), posortowana od najbliższego, ostatni z resztą; null, gdy dodanie przekroczyłoby limit 4.
// Dodanie dzieli procenty po równo (nietrafione dzielą to, co zostało po trafionych), usunięcie oddaje procent ostatniemu, zmiana ceny nie rusza procentów (idą za id), procent ostatniego jest resztą.
export function ladderApply(dir, tps, op) {
  const all = objs(tps), hits = all.filter((x) => x.hit);
  const rest = 100 - hits.reduce((a, h) => a + (isNum(h.pct) ? h.pct : 0), 0);
  let list = tpOrder(dir, all).filter((x) => !x.hit).map((x) => ({ id: x.id, price: x.price, pct: x.pct }));
  if (op.t === 'add') {
    if (hits.length + list.length >= TPS_MAX) return null;
    list.push({ id: null, price: op.price, pct: null });
    list.sort((a, b) => far(dir, a.price) - far(dir, b.price));
    const eq = equalPcts(list.length, rest);
    list.forEach((x, i) => { x.pct = eq[i]; });
  } else if (op.t === 'rm') list = list.filter((x) => x.id !== op.id);
  else if (op.t === 'price') { list = list.map((x) => (x.id === op.id ? { ...x, price: op.price } : x)); list.sort((a, b) => far(dir, a.price) - far(dir, b.price)); } else if (op.t === 'pct') {
    const lastId = list.length ? list[list.length - 1].id : null;
    if (op.id !== lastId) list = list.map((x) => (x.id === op.id ? { ...x, pct: op.pct } : x));
  }
  // ostatni poziom dostaje resztę (jedyny poziom: całe rest)
  if (list.length) {
    const sum = list.slice(0, -1).reduce((a, x) => a + (isNum(num(x.pct)) ? num(x.pct) : 0), 0);
    list[list.length - 1] = { ...list[list.length - 1], pct: rest - sum };
  }
  return list;
}
