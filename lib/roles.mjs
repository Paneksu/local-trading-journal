// Role pól i wartości specjalnych. Dashboard nie szuka pól po nazwie wyświetlanej, tylko po roli:
// rola → identyfikator pola w Notion zapisany w config.local.json. Gdy identyfikatora brak (stara instalacja, nowa wersja),
// pole jest wyszukiwane po jednej z znanych nazw (PL lub EN, bez wielkości liter) i identyfikator zostaje zapamiętany.
// Zmiana nazwy pola w Notion przez użytkownika niczego więc nie psuje.
// English: roles map to Notion property IDs stored in config.local.json; unknown IDs are discovered by known PL/EN names.

export const DBS = ['trades', 'konta', 'dziennik', 'finanse'];

// types: dopuszczalne typy pola w Notion (formuła bywa u starszych instalacji), optional: dashboard działa bez tego pola
export const ROLES = {
  trades: {
    title: { types: ['title'], names: ['Trade'] },
    typ: { types: ['select'], names: ['Typ', 'Type'] },
    date: { types: ['date'], names: ['Data', 'Date'] },
    exit: { types: ['date'], names: ['Wyjście', 'Wyjscie', 'Exit'], optional: true },
    instrument: { types: ['select'], names: ['Instrument'], optional: true },
    dir: { types: ['select'], names: ['Kierunek', 'Direction'], optional: true },
    setup: { types: ['select'], names: ['Setup'], optional: true },
    session: { types: ['select'], names: ['Sesja', 'Session'], optional: true },
    r: { types: ['number'], names: ['R'], optional: true },
    pnl: { types: ['number'], names: ['P&L $', 'P&L', 'PnL', 'PnL $'], optional: true },
    // ceny z wykresu (migracja 003); drawings to rysunki z edytora wykresu: nie trafiają do /api/data (patrz normalizePage w data.mjs)
    entryPrice: { types: ['number'], names: ['Cena wejścia', 'Cena wejscia', 'Entry price'], optional: true },
    exitPrice: { types: ['number'], names: ['Cena wyjścia', 'Cena wyjscia', 'Exit price'], optional: true },
    sl: { types: ['number'], names: ['SL', 'Stop loss'], optional: true },
    tp: { types: ['number'], names: ['TP', 'Take profit'], optional: true },
    be: { types: ['number'], names: ['BE', 'Break even'], optional: true }, // migracja 004 (P26, 28.10.2026)
    contract: { types: ['rich_text'], names: ['Kontrakt', 'Contract'], optional: true }, // migracja 005 (P35, 28.10.2026): kod kontraktu, np. ESZ6
    konta: { types: ['relation'], names: ['Konta', 'Accounts'], optional: true },
    chart: { types: ['url'], names: ['Wykres', 'Chart'], optional: true },
    manual: { types: ['select'], names: ['Wynik ręcznie', 'Wynik recznie', 'Manual result'], optional: true },
    reason: { types: ['select'], names: ['Powód', 'Powod', 'Reason'], optional: true },
    notes: { types: ['rich_text'], names: ['Notatki', 'Notes'], optional: true },
    files: { types: ['files'], names: ['Zrzut', 'Screenshot'], optional: true },
    drawings: { types: ['rich_text'], names: ['Rysunki', 'Drawings'], optional: true },
  },
  konta: {
    name: { types: ['title'], names: ['Konto', 'Account'] },
    status: { types: ['select'], names: ['Status'], optional: true },
    firma: { types: ['select'], names: ['Firma', 'Firm', 'Company'], optional: true },
    size: { types: ['number'], names: ['Rozmiar', 'Size'], optional: true },
    // Saldo i Aktywne bywają formułami (stare instalacje): wtedy są tylko do odczytu
    saldo: { types: ['number', 'formula'], names: ['Saldo', 'Balance'], optional: true },
    active: { types: ['formula', 'checkbox'], names: ['Aktywne', 'Active'], optional: true },
    bought: { types: ['date'], names: ['Data zakupu', 'Purchase date'], optional: true },
    notes: { types: ['rich_text'], names: ['Notatki', 'Notes'], optional: true },
    trades: { types: ['relation'], names: ["Trade'y", 'Trade’y', 'Trades'], optional: true },
    pnlSum: { types: ['rollup'], names: ["P&L trade'ów", 'P&L trade’ów', 'Trades P&L'], optional: true },
    finanse: { types: ['relation'], names: ['Wydatki i payouty', 'Expenses and payouts'], optional: true },
  },
  dziennik: {
    name: { types: ['title'], names: ['Dzień', 'Dzien', 'Day'] },
    date: { types: ['date'], names: ['Data', 'Date'], optional: true },
    notes: { types: ['rich_text'], names: ['Notatki', 'Notes'], optional: true },
  },
  finanse: {
    name: { types: ['title'], names: ['Opis', 'Description'] },
    kind: { types: ['select'], names: ['Rodzaj', 'Kind', 'Type'], optional: true },
    amount: { types: ['number'], names: ['Kwota', 'Amount'], optional: true },
    date: { types: ['date'], names: ['Data', 'Date'], optional: true },
    firma: { types: ['select'], names: ['Firma', 'Firm', 'Company'], optional: true },
    konto: { types: ['relation'], names: ['Konto', 'Account'], optional: true },
    spend: { types: ['formula', 'number'], names: ['Wydatek', 'Spent'], optional: true },
    payout: { types: ['formula', 'number'], names: ['Wypłata', 'Wyplata', 'Paid out'], optional: true },
    balance: { types: ['formula', 'number'], names: ['Bilans', 'Net'], optional: true },
  },
};

// Opcje wyborów, na których opiera się logika dashboardu. Wewnętrznie używamy stałych znaczników (token), a nazwy z Notion
// (po polsku, angielsku albo własne) są mapowane na token i z powrotem. Opcje spoza tej listy przechodzą bez zmian.
export const OPTION_ROLES = {
  'trades.typ': {
    Live: ['Live'],
    Backtest: ['Backtest'],
    'Niewzięty': ['Niewzięty', 'Niewziety', 'Not taken', 'Paper', 'Missed'],
  },
  'konta.status': {
    Challenge: ['Challenge'],
    Weryfikacja: ['Weryfikacja', 'Verification'],
    Funded: ['Funded'],
    Przegrane: ['Przegrane', 'Lost', 'Failed'],
    'Zamknięte': ['Zamknięte', 'Zamkniete', 'Closed'],
  },
  'finanse.kind': {
    'Zakup challenge': ['Zakup challenge', 'Challenge purchase', 'Purchase'],
    Reset: ['Reset'],
    'Aktywacja / opłata': ['Aktywacja / opłata', 'Aktywacja / oplata', 'Activation / fee', 'Activation'],
    Payout: ['Payout'],
  },
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Wyszukuje pola bazy po zapisanym identyfikatorze, a gdy go brak, po znanych nazwach.
// schemaProps: properties z odpowiedzi GET /v1/data_sources/:id (klucz = aktualna nazwa, wartość ma id i type).
// Zwraca { map: rola → { id, name, type }, learned: rola → id (nowo zapamiętane), missing: [role wymagane, których brak] }.
export function resolveRoles(db, schemaProps, saved = {}) {
  const defs = ROLES[db] || {};
  const entries = Object.entries(schemaProps || {}).map(([name, p]) => ({ name, id: p.id || name, type: p.type }));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const used = new Set();
  const map = {}, learned = {}, missing = [];
  for (const [role, def] of Object.entries(defs)) {
    let hit = null;
    const sid = saved[role];
    if (sid && byId.has(sid) && def.types.includes(byId.get(sid).type) && !used.has(sid)) hit = byId.get(sid);
    if (!hit && def.types[0] === 'title') hit = entries.find((e) => e.type === 'title') || null; // tytuł jest w bazie zawsze jeden
    if (!hit) {
      for (const n of def.names) {
        const h = entries.find((e) => norm(e.name) === norm(n) && def.types.includes(e.type) && !used.has(e.id));
        if (h) { hit = h; break; }
      }
    }
    if (hit) {
      used.add(hit.id);
      map[role] = hit;
      if (saved[role] !== hit.id) learned[role] = hit.id;
    } else if (!def.optional) missing.push(role);
  }
  return { map, learned, missing };
}

// Mapa opcji dla roli z tokenami: actual → token (przy odczycie) i token → actual (przy zapisie).
// saved: nadpisania zapisane w config.local.json (token → nazwa w Notion).
export function resolveOptionMap(key, optionNames, saved = {}) {
  const defs = OPTION_ROLES[key];
  if (!defs) return null;
  const toToken = new Map(), toName = new Map();
  for (const [token, aliases] of Object.entries(defs)) {
    let actual = saved[token] && optionNames.includes(saved[token]) ? saved[token] : null;
    if (!actual) actual = optionNames.find((n) => aliases.some((a) => norm(a) === norm(n))) || null;
    if (actual) { toToken.set(actual, token); toName.set(token, actual); }
  }
  return { toToken, toName };
}
