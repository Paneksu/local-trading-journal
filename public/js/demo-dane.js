// Dane przykładowe dla przewodnika „Jak działa dziennik”. Ten sam kształt co odpowiedź /api/data (pola po rolach, kolory opcji, typy pól),
// generowane w przeglądarce z ustalonym ziarnem, więc każdy przewodnik wygląda tak samo. Nic nie trafia do Notion.
// English: deterministic demo dataset in the /api/data shape, generated in the browser for the guided tour.

const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
const opts = (names) => Object.fromEntries(names.map((n, i) => [n, COLORS[(i + 5) % COLORS.length]]));
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function demoPayload(lang = 'pl') {
  const en = lang === 'en';
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const id = (() => { let n = 0; return () => { n++; const h = n.toString(16).padStart(12, '0'); return `dddddddd-0000-4000-8000-${h}`; }; })();
  const sessions = en ? ['Asia', 'London', 'New York'] : ['Azja', 'Londyn', 'Nowy Jork'];
  const setups = ['Breakout', 'Pullback', 'Reversal', 'Range'];
  const instruments = ['NQ', 'ES', 'EURUSD', 'XAUUSD'];
  const reasons = en ? ['End of day', 'Off plan', 'Away'] : ['Koniec dnia', 'Poza planem', 'Nie było mnie'];
  const notes = en
    ? ['Waited for the candle close, entered on the retest.', 'Too early, no confirmation.', 'Clean setup, held to target.', '']
    : ['Czekałem na zamknięcie świecy, wejście po reteście.', 'Za wcześnie, bez potwierdzenia.', 'Czysty układ, trzymałem do celu.', ''];
  const sel = (name, colors) => (name ? { name, color: colors[name] || 'default' } : null);

  const colors = {
    trades: {
      typ: { Live: 'green', Backtest: 'purple', 'Niewzięty': 'gray' },
      instrument: opts(instruments), dir: { Long: 'green', Short: 'red', 'NO TRADE': 'gray' }, setup: opts(setups), session: opts(sessions),
      manual: { '✅ Win': 'green', '❌ Loss': 'red', '➖ BE': 'gray' }, reason: opts(reasons),
    },
    konta: { status: { Challenge: 'blue', Weryfikacja: 'yellow', Funded: 'green', Przegrane: 'red', 'Zamknięte': 'gray' }, firma: { 'Lucid Trading': 'blue', 'Alpha Futures': 'green', 'Apex Trader Funding': 'orange', Topstep: 'yellow', Inna: 'gray' } },
    dziennik: {},
    finanse: { kind: { 'Zakup challenge': 'blue', Reset: 'orange', 'Aktywacja / opłata': 'yellow', Payout: 'green' }, firma: { 'Lucid Trading': 'blue', 'Alpha Futures': 'green', 'Apex Trader Funding': 'orange', Topstep: 'yellow', Inna: 'gray' } },
  };
  const fields = {
    trades: { title: 'title', typ: 'select', date: 'date', exit: 'date', instrument: 'select', dir: 'select', setup: 'select', session: 'select', r: 'number', pnl: 'number', konta: 'relation', chart: 'url', manual: 'select', reason: 'select', notes: 'rich_text', files: 'files' },
    konta: { name: 'title', status: 'select', firma: 'select', size: 'number', saldo: 'number', active: 'formula', bought: 'date', notes: 'rich_text' },
    dziennik: { name: 'title' },
    finanse: { name: 'title', kind: 'select', amount: 'number', date: 'date', firma: 'select', konto: 'relation' },
  };
  const now = new Date();
  const stamp = (d) => d.toISOString();
  const page = (o, created = now) => ({ _id: id(), _url: '', _created: stamp(created), _edited: stamp(created), ...o });

  const konta = [
    page({ name: 'Lucid 50k #1', status: sel('Funded', colors.konta.status), firma: sel('Lucid Trading', colors.konta.firma), size: 50000, saldo: 52340, active: true, bought: '2026-06-02', notes: '' }),
    page({ name: 'Alpha 100k #1', status: sel('Challenge', colors.konta.status), firma: sel('Alpha Futures', colors.konta.firma), size: 100000, saldo: 98870, active: true, bought: '2026-08-14', notes: '' }),
    page({ name: 'Apex 50k #1', status: sel('Przegrane', colors.konta.status), firma: sel('Apex Trader Funding', colors.konta.firma), size: 50000, saldo: 0, active: false, bought: '2026-05-10', notes: '' }),
  ];
  const fin = (date, kind, firma, amount, k) => page({ name: `${kind} ${firma}`, kind: sel(kind, colors.finanse.kind), amount, date, firma: sel(firma, colors.finanse.firma), konto: [konta[k]._id] });
  const finanse = [
    fin('2026-05-10', 'Zakup challenge', 'Apex Trader Funding', 167, 2), fin('2026-06-02', 'Zakup challenge', 'Lucid Trading', 140, 0),
    fin('2026-06-20', 'Aktywacja / opłata', 'Lucid Trading', 80, 0), fin('2026-07-18', 'Payout', 'Lucid Trading', 1150, 0),
    fin('2026-08-14', 'Zakup challenge', 'Alpha Futures', 299, 1), fin('2026-08-29', 'Payout', 'Lucid Trading', 900, 0),
    fin('2026-09-12', 'Reset', 'Alpha Futures', 99, 1), fin('2026-10-03', 'Payout', 'Lucid Trading', 1400, 0),
  ];

  const trades = [];
  const iso = (key, min) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, Math.floor(min / 60), min % 60).toISOString(); };
  for (let back = 0; back < 120; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    const wd = day.getDay();
    if (wd === 0 || wd === 6 || rnd() < 0.25) continue;
    const key = keyOf(day);
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const k = rnd();
      const typ = k < 0.62 ? 'Live' : k < 0.86 ? 'Backtest' : 'Niewzięty';
      const win = rnd() < (i === 0 ? 0.6 : 0.45);
      const r = win ? Math.round((0.6 + rnd() * 2.4) * 10) / 10 : rnd() < 0.12 ? 0 : -Math.round((0.5 + rnd() * 0.6) * 10) / 10;
      const minute = rnd() < 0.85 ? 15 * 60 + 30 + Math.floor(rnd() * 120) : 9 * 60 + Math.floor(rnd() * 300);
      const dur = 3 + Math.floor(rnd() * (win ? 60 : 30));
      const instrument = pick(instruments), dir = pick(['Long', 'Short']), setup = pick(setups);
      trades.push(page({
        title: rnd() < 0.5 ? `${instrument} ${dir.toLowerCase()} ${setup}` : '',
        typ: sel(typ, colors.trades.typ), date: iso(key, minute + i * 25), exit: typ === 'Niewzięty' ? null : iso(key, minute + i * 25 + dur),
        instrument: sel(instrument, colors.trades.instrument), dir: sel(dir, colors.trades.dir), setup: sel(setup, colors.trades.setup),
        session: sel(minute < 14 * 60 ? sessions[1] : sessions[2], colors.trades.session),
        r, pnl: typ === 'Live' ? Math.round(r * 240) : null, konta: typ === 'Live' ? [konta[rnd() < 0.7 ? 0 : 1]._id] : [], chart: null,
        manual: null, reason: typ === 'Niewzięty' ? sel(pick(reasons), colors.trades.reason) : null, notes: pick(notes), _imgs: 0,
      }, new Date(`${key}T12:${pad(10 + i)}:00`)));
    }
  }
  return { fetchedAt: now.toISOString(), notionUrl: '', data: { trades, konta, dziennik: [], finanse }, colors, fields, requiredMissing: {}, demo: true };
}

// Zapis z formularza w trybie przewodnika: zmienia tylko dane w pamięci (te same pola co serwer, w uproszczeniu).
export function applyDemoWrite(payload, kind, id, body) {
  const c = payload.colors;
  const sel = (db, role, v) => (v ? { name: v, color: c[db]?.[role]?.[v] || 'default' } : null);
  const num = (v) => (v === null || v === '' || v === undefined ? null : Number(String(v).replace(',', '.')));
  const now = new Date().toISOString();
  const list = payload.data[kind];
  let row = id ? list.find((x) => x._id === id) : null;
  if (!row) { row = { _id: `dddddddd-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`, _url: '', _created: now }; list.push(row); }
  row._edited = now;
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (kind === 'trades') {
    const dt = (d, tm) => (d ? (tm ? new Date(`${d}T${tm}:00`).toISOString() : d) : null);
    if (has('name')) row.title = body.name;
    if (has('typ')) row.typ = sel('trades', 'typ', body.typ);
    if (has('date')) row.date = dt(body.date, body.time);
    if (has('exitTime')) row.exit = body.exitTime ? dt(body.exitDate || body.date, body.exitTime) : null;
    for (const r of ['instrument', 'dir', 'setup', 'session', 'reason']) if (has(r)) row[r] = sel('trades', r, body[r]);
    if (has('r')) row.r = num(body.r);
    if (has('pnl')) row.pnl = num(body.pnl);
    if (has('konta')) row.konta = body.konta || [];
    if (has('chart')) row.chart = body.chart || null;
    if (has('notes')) row.notes = body.notes;
    row._imgs = 0;
  } else if (kind === 'konta') {
    if (has('name')) row.name = body.name;
    if (has('firma')) row.firma = sel('konta', 'firma', body.firma);
    if (has('status')) row.status = sel('konta', 'status', body.status);
    if (has('size')) row.size = num(body.size);
    if (has('saldo')) row.saldo = num(body.saldo);
    if (has('bought')) row.bought = body.bought || null;
    if (has('notes')) row.notes = body.notes;
    row.active = ['Challenge', 'Weryfikacja', 'Funded'].includes(row.status?.name);
  } else if (kind === 'finanse') {
    if (has('name')) row.name = body.name;
    if (has('kind')) row.kind = sel('finanse', 'kind', body.kind);
    if (has('amount')) row.amount = num(body.amount);
    if (has('date')) row.date = body.date;
    if (has('firma')) row.firma = sel('finanse', 'firma', body.firma);
    if (has('konto')) row.konto = body.konto ? [body.konto] : [];
  }
  return { ok: true, id: row._id, url: '' };
}
