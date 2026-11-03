// Zapis do Notion: dodawanie i edycja trade'ów, kont prop firm i wpisów finansowych. Serwer waliduje wszystko sam:
// opcje wyborów ze schematu bazy, liczby, daty, adresy, relacje do znanych kont. Pola z formułą lub rollupem są tylko do odczytu.
// Trwałego kasowania nie ma. [U] 2026-11-01 «Archiwum Notion + Cofnij»: usunięcie trade'a to przeniesienie jego strony do archiwum (kosza) Notion i da się je cofnąć (trashTradePage).
// Writes to Notion: add / edit trades, prop accounts and finance entries, validated on the server. No permanent delete: a trade page only moves to the Notion archive (trash) and can be restored.
import { DEFAULT_TZ, validTz, dayKeyIn } from '../public/js/strefa.js';
import { NotionError } from './notion.mjs';
import { contractProblem } from '../public/js/kontrakty.js';

export class ValidationError extends Error {
  constructor(fields, message = 'Popraw zaznaczone pola.') { super(message); this.fields = fields; this.status = 400; this.msgKey = true; }
}
export const PAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const FIRMA_RE = /^[\p{L}\p{N} .&'’+\-]{1,40}$/u;
export const validDate = (s) => {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
export const sameId = (a, b) => String(a || '').replace(/-/g, '').toLowerCase() === String(b || '').replace(/-/g, '').toLowerCase();
const isPayoutKind = (n) => /payout|wypłat/i.test(n || '');
// domyślna data zakupu to dzień w strefie aplikacji (domyślnie NY), tak samo jak dzień nowego trade'a w formularzu; serwer nie zna ustawienia z przeglądarki, więc strefa domyślna
const todayLocalKey = () => dayKeyIn(Date.now(), DEFAULT_TZ);

// zestaw walidatorów pól działających na rolach (a nie na nazwach z Notion)
function kit(input, sch, err, props, t) {
  const has = (role, type) => sch.roles[role]?.type === type;
  const pname = (role) => sch.roles[role].name;
  const tokens = (role) => (sch.optionNames[role] || []).map((n) => sch.optMaps[role]?.toToken.get(n) ?? n);
  const actual = (role, tok) => sch.optMaps[role]?.toName.get(tok) ?? tok;
  const given = (k) => Object.prototype.hasOwnProperty.call(input, k);
  const str = (v) => (v == null ? '' : String(v));
  return {
    has, given, str, tokens,
    title(key, role, { max = 200, required = false } = {}) {
      if (!given(key) && !required) return;
      const v = str(input[key]).trim();
      if (required && !v) err[key] = t('Wpisz nazwę.');
      else if (v.length > max) err[key] = t('Najwyżej {max} znaków.', { max });
      else if (has(role, 'title')) props[pname(role)] = { title: v ? [{ text: { content: v } }] : [] };
    },
    select(key, role, { required = false, allowNew = false } = {}) {
      if (!given(key) && !required) return;
      const v = str(input[key]).trim();
      if (!v) { if (required) err[key] = t('Wybierz wartość.'); else if (has(role, 'select')) props[pname(role)] = { select: null }; return; }
      if (!has(role, 'select')) return;
      const list = tokens(role);
      if (list.includes(v)) props[pname(role)] = { select: { name: actual(role, v) } };
      else if (allowNew && FIRMA_RE.test(v)) props[pname(role)] = { select: { name: v } };
      else err[key] = t('Wybierz jedną z opcji z bazy Notion ({opts}).', { opts: list.join(', ') || t('brak opcji') });
    },
    number(key, role, { min = -1e9, max = 1e9, required = false, label = '' } = {}) {
      if (!given(key) && !required) return;
      const raw = input[key];
      const lab = label || t('Wartość');
      if (raw === null || raw === '' || raw === undefined) { if (required) err[key] = t('{label}: wpisz liczbę.', { label: lab }); else if (has(role, 'number')) props[pname(role)] = { number: null }; return; }
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.').replace('−', '-'));
      if (!Number.isFinite(n) || n < min || n > max) err[key] = t('{label}: wpisz liczbę od {min} do {max}.', { label: lab, min, max });
      else if (has(role, 'number')) props[pname(role)] = { number: n };
    },
    dateOnly(key, role, { required = false, label = '' } = {}) {
      if (!given(key) && !required) return;
      const v = str(input[key]).trim();
      const lab = label || t('Data');
      if (!v) { if (required) err[key] = t('{label}: podaj datę.', { label: lab }); else if (has(role, 'date')) props[pname(role)] = { date: null }; return; }
      if (!validDate(v)) err[key] = t('{label}: wybierz datę z kalendarza.', { label: lab });
      else if (has(role, 'date')) props[pname(role)] = { date: { start: v } };
    },
    text(key, role, max = 2000) {
      if (!given(key) || !has(role, 'rich_text')) return;
      const v = str(input[key]);
      if (v.length > max) err[key] = t('Najwyżej {max} znaków.', { max });
      else props[pname(role)] = { rich_text: v ? (v.match(/[\s\S]{1,1900}/g) || []).map((c) => ({ text: { content: c } })) : [] };
    },
    relationOne(key, role, known) {
      if (!given(key) || !has(role, 'relation')) return;
      const v = str(input[key]).trim();
      if (!v) { props[pname(role)] = { relation: [] }; return; }
      if (!PAGE_ID_RE.test(v) || !known.some((k) => sameId(k, v))) err[key] = t('Wybrane konto nie istnieje w bazie Konta. Odśwież dane i spróbuj ponownie.');
      else props[pname(role)] = { relation: [{ id: v }] };
    },
  };
}

// Pole dodane migracją, którego instalacja jeszcze nie ma: komunikat z prośbą o aktualizację (jak przy „Kontrakt”).
const noFieldMsg = (t, name) => t('W bazie Trade\'y nie ma jeszcze pola „{name}”. Uruchom aktualizację (Aktualizuj.cmd albo update.sh), która je doda.', { name });
// final (ocena wyglądu P2-3): kilka brakujących pól to jeden komunikat z listą (ten sam tekst przy każdym polu, wysyłka pokazuje go raz)
const noFieldsMsg = (t, names) => (names.length === 1 ? noFieldMsg(t, names[0]) : t('W bazie Trade\'y brakuje pól: {list}. Uruchom aktualizację (Aktualizuj.cmd albo update.sh), która je doda.', { list: names.join(', ') }));

// allowNew: role wyborów, w których nowa wartość tworzy opcję przy zapisie strony (Notion dodaje ją sam). Tylko wysyłka backtestu (lib/backtest-sync.mjs):
// trasa /api/trades nie podaje tej opcji, więc zachowanie trade'ów Live się nie zmienia.
export function buildTradeProps(input, sch, kontaIds, { creating, page = null, allowNew = [] }, t) {
  const err = {}, props = {};
  const k = kit(input, sch, err, props, t);
  k.title('name', 'title');
  k.select('typ', 'typ', { required: creating });
  for (const [key, role] of [['instrument', 'instrument'], ['dir', 'dir'], ['setup', 'setup'], ['session', 'session'], ['reason', 'reason']]) k.select(key, role, { allowNew: allowNew.includes(role) });
  const missing = [];
  // Backtest (migracja 006, [U] 30.10.2026 «Tak, dodać pola»): znacznik sesji „<nazwa> [<sessionId>/<tradeId>]” do 200 znaków oraz MAE/MFE w R; null pomija pole.
  if (k.given('btSession')) {
    const v = k.str(input.btSession);
    if (v.length > 200) err.btSession = t('Najwyżej {max} znaków.', { max: 200 });
    else if (k.has('btSession', 'rich_text')) props[sch.roles.btSession.name] = { rich_text: v ? [{ text: { content: v } }] : [] };
    else if (v) missing.push(['btSession', t('Sesja backtestu')]);
  }
  for (const [key, name] of [['btMae', 'MAE (R)'], ['btMfe', 'MFE (R)']]) {
    if (!k.given(key) || input[key] === null || input[key] === undefined || input[key] === '') continue;
    if (k.has(key, 'number')) k.number(key, key, { min: -1e6, max: 1e6, label: name });
    else missing.push([key, name]);
  }
  if (missing.length) { const m = noFieldsMsg(t, missing.map(([, n]) => n)); for (const [key] of missing) err[key] = m; }
  k.number('r', 'r', { min: -1e7, max: 1e7, label: 'R' });
  k.number('pnl', 'pnl', { min: -1e7, max: 1e7, label: 'P&L $' });
  // ceny z wykresu: dodatnie (ES/NQ, kontrakty terminowe), puste = wyczyszczenie pola; bez pola w bazie (przed migracją 003) pomijane
  for (const [key, role, label] of [['entryPrice', 'entryPrice', 'Cena wejścia'], ['exitPrice', 'exitPrice', 'Cena wyjścia'], ['sl', 'sl', 'SL'], ['tp', 'tp', 'TP'], ['be', 'be', 'BE']]) k.number(key, role, { min: 0, max: 1e7, label: t(label) });
  // P35 (28.10.2026), słowa użytkownika: «Tak, pole „Kontrakt”»: kod kontraktu (np. ESZ6, MNQH7), opcjonalny; zapis wielkimi literami.
  // Walidacja: kod miesiąca FGHJKMNQUVXZ, ES/NQ/MES/MNQ tylko kwartalne i zgodne z instrumentem (gdy instrument jest w tym samym żądaniu).
  if (k.given('contract')) {
    const v = k.str(input.contract).trim().toUpperCase();
    // Instrument: z tego samego żądania, a przy samym PATCH „contract” z zapisanej strony (przegląd P35 D2: NQZ5 nie może trafić do trade'a ES).
    const stored = page && sch.roles.instrument ? page.properties?.[sch.roles.instrument.name]?.select?.name : '';
    const instr = k.given('instrument') ? k.str(input.instrument) : (stored ? (sch.optMaps.instrument?.toToken.get(stored) ?? stored) : '');
    const pr = contractProblem(v, instr);
    if (pr) err.contract = t(pr.key, pr.vars);
    else if (k.has('contract', 'rich_text')) props[sch.roles.contract.name] = { rich_text: v ? [{ text: { content: v } }] : [] };
    else if (v) err.contract = t('W bazie Trade\'y nie ma jeszcze pola „Kontrakt”. Uruchom aktualizację (Aktualizuj.cmd albo update.sh), która je doda.');
  }
  if (k.given('konta') && k.has('konta', 'relation')) {
    const arr = Array.isArray(input.konta) ? input.konta.map(k.str) : null;
    if (!arr || arr.length > 10 || arr.some((id) => !PAGE_ID_RE.test(id))) err.konta = t('Nieprawidłowa lista kont.');
    else if (arr.some((id) => !kontaIds.some((x) => sameId(x, id)))) err.konta = t('Wybrane konto nie istnieje w bazie Konta. Odśwież dane i spróbuj ponownie.');
    else props[sch.roles.konta.name] = { relation: arr.map((id) => ({ id })) };
  }
  if (k.given('chart') && k.has('chart', 'url')) {
    const v = k.str(input.chart).trim();
    if (!v) props[sch.roles.chart.name] = { url: null };
    else {
      let u = null;
      try { u = new URL(v); } catch { /* błąd niżej */ }
      if (!u || !/^https?:$/.test(u.protocol) || v.length > 1900) err.chart = t('Wklej pełny adres zaczynający się od https://, np. link do zrzutu z TradingView.');
      else props[sch.roles.chart.name] = { url: u.href };
    }
  }
  k.text('notes', 'notes', 8000);
  // daty: wejście w polu „Data” (z godziną albo bez), wyjście w osobnym polu
  // [U] 3.11.2026 «ja wpisuje godziny wedle nowojorskiego czasu nie polskiego»: bez strefy w żądaniu (albo ze złą) godzina jest czasem Nowego Jorku
  let tz = k.str(input.tz).trim() || DEFAULT_TZ;
  if (!validTz(tz)) tz = DEFAULT_TZ;
  const date = k.str(input.date).trim(), time = k.str(input.time).trim();
  const exitDate = k.str(input.exitDate).trim(), exitTime = k.str(input.exitTime).trim();
  if (k.given('date') || creating) {
    if (!date) err.date = t('Podaj datę wejścia.');
    else if (!validDate(date)) err.date = t('Data wejścia ma nieprawidłowy format. Wybierz ją z kalendarza.');
    else if (time && !TIME_RE.test(time)) err.time = t('Godzina wejścia ma format GG:MM, np. 15:35.');
    else if (k.has('date', 'date')) props[sch.roles.date.name] = { date: time ? { start: `${date}T${time}:00`, time_zone: tz } : { start: date } };
  }
  if (k.given('exitTime') || k.given('exitDate')) {
    if (!exitTime && !exitDate) {
      if (k.has('exit', 'date')) props[sch.roles.exit.name] = { date: null };
    } else if (!k.has('exit', 'date')) {
      err.exitTime = t('W bazie Trade\'y nie ma jeszcze pola „Wyjście”. Uruchom aktualizację (Aktualizuj.cmd albo update.sh), która je doda.');
    } else if (!exitTime) {
      err.exitTime = t('Podaj godzinę wyjścia (GG:MM) albo wyczyść datę wyjścia.');
    } else if (!TIME_RE.test(exitTime)) {
      err.exitTime = t('Godzina wyjścia ma format GG:MM, np. 16:20.');
    } else {
      const ed = exitDate || date;
      if (!validDate(ed)) err.exitDate = t('Data wyjścia ma nieprawidłowy format.');
      else if (time && `${ed}T${exitTime}` < `${date}T${time}`) err.exitTime = t('Wyjście jest przed wejściem. Jeśli trade trwał przez północ, ustaw datę wyjścia na następny dzień.');
      else props[sch.roles.exit.name] = { date: { start: `${ed}T${exitTime}:00`, time_zone: tz } };
    }
  }
  if (Object.keys(err).length) throw new ValidationError(err);
  return props;
}

export function buildKontoProps(input, sch, ctx, t) {
  const err = {}, props = {};
  const k = kit(input, sch, err, props, t);
  k.title('name', 'name', { max: 120, required: ctx.creating });
  k.select('firma', 'firma', { allowNew: input.firmaNew === true });
  k.select('status', 'status');
  k.number('size', 'size', { min: 0, max: 1e8, label: t('Rozmiar') });
  k.dateOnly('bought', 'bought', { label: t('Data zakupu') });
  k.text('notes', 'notes', 8000);
  if (k.has('saldo', 'number')) k.number('saldo', 'saldo', { min: -1e8, max: 1e8, label: t('Saldo') });
  else if (k.given('saldo')) err.saldo = t('Saldo tego konta liczy się formułą w Notion, więc nie da się go zmienić z dashboardu.');
  if (Object.keys(err).length) throw new ValidationError(err);
  return props;
}

export function buildFinanseProps(input, sch, ctx, t) {
  const err = {}, props = {};
  const k = kit(input, sch, err, props, t);
  k.title('name', 'name');
  k.select('kind', 'kind', { required: ctx.creating });
  k.number('amount', 'amount', { min: 0, max: 1e8, required: ctx.creating, label: t('Kwota') });
  k.dateOnly('date', 'date', { required: ctx.creating, label: t('Data') });
  k.select('firma', 'firma', { allowNew: input.firmaNew === true });
  k.relationOne('konto', 'konto', ctx.kontaIds);
  if (Object.keys(err).length) throw new ValidationError(err);
  return props;
}

export function createWriter({ notion, sources, data, t }) {
  const knownKontaIds = async () => {
    const p = data.cachedPayload() || (await data.getPayload(false));
    return (p.data.konta || []).map((k) => k._id);
  };

  // Wspólny zapis strony: tworzenie (POST) albo edycja (PATCH) z kontrolą, że strona należy do właściwej bazy,
  // i z wykrywaniem zmian zrobionych w Notion po ostatnim odświeżeniu dashboardu (409, code: 'stale').
  async function writePage(db, id, input, build) {
    const ds = sources[db];
    if (!ds) throw new NotionError(t('Brak identyfikatora bazy w pliku .env ({db}).', { db }), 500);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError({}, 'Nieprawidłowe dane formularza.');
    const [sch, kontaIds] = await Promise.all([data.loadSchema(db), knownKontaIds()]);
    if (id) {
      const page = await notion.get(`/v1/pages/${id}`);
      if (page.archived || page.in_trash) throw new NotionError(t('Ten wpis jest w koszu Notion. Przywróć go w Notion albo odśwież dane.'), 409);
      if (!sameId(page.parent?.data_source_id, ds)) throw new NotionError(t('Ten wpis nie należy do właściwej bazy.'), 403);
      if (input.edited && input.edited !== page.last_edited_time) {
        throw new NotionError(t('Ten wpis zmieniono w Notion po ostatnim odświeżeniu. Wczytaj zmiany i edytuj jeszcze raz, żeby ich nie nadpisać.'), 409, 'stale');
      }
      const props = build(input, sch, { creating: false, kontaIds, page }, t);
      const out = await notion.patch(`/v1/pages/${id}`, { properties: props });
      data.invalidate();
      return { ok: true, id: out.id, url: out.url, ...(out.last_edited_time ? { edited: out.last_edited_time } : {}) }; // P27: edytor wykresu zapisuje ceny więcej niż raz
    }
    const props = build(input, sch, { creating: true, kontaIds }, t);
    const out = await notion.post('/v1/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
    data.invalidate();
    return { ok: true, id: out.id, url: out.url };
  }

  const saveTrade = (input, id) => writePage('trades', id, input, (inp, sch, ctx, tt) => buildTradeProps(inp, sch, ctx.kontaIds, { creating: ctx.creating, page: ctx.page }, tt));

  // Konto: przy tworzeniu z kosztem (cost > 0) powstaje też wpis „Zakup challenge” w bazie Wydatki i payouty (relacja Konto),
  // żeby ROI się zgadzało. Najpierw sprawdzamy wpis finansowy, dopiero potem tworzymy konto, więc błąd walidacji nie zostawia pół roboty.
  async function saveKonto(input, id) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError({}, 'Nieprawidłowe dane formularza.');
    let finProps = null;
    if (!id && input.cost !== undefined && input.cost !== null && input.cost !== '') {
      const cost = Number(String(input.cost).replace(',', '.'));
      if (!Number.isFinite(cost) || cost < 0 || cost > 1e7) throw new ValidationError({ cost: t('Koszt zakupu: wpisz kwotę w dolarach, np. 147.') });
      if (cost > 0) {
        if (!sources.finanse) throw new NotionError(t('Brak DS_FINANSE w pliku .env, więc nie utworzę wpisu kosztu.'), 500);
        const fsch = await data.loadSchema('finanse');
        if (!fsch.optMaps.kind?.toName.get('Zakup challenge')) throw new ValidationError({ cost: t('W bazie Wydatki i payouty nie ma rodzaju zakupu (np. „Zakup challenge”). Zostaw koszt pusty i dodaj wpis ręcznie.') });
        try {
          finProps = buildFinanseProps({ name: t('Zakup {name}', { name: String(input.name || '').trim() }), kind: 'Zakup challenge', amount: cost, date: input.bought || todayLocalKey(), firma: input.firma, firmaNew: input.firmaNew }, fsch, { creating: true, kontaIds: [] }, t);
        } catch (e) {
          if (e instanceof ValidationError) throw new ValidationError({ cost: t('Koszt zakupu: {msg}', { msg: Object.values(e.fields)[0] }) });
          throw e;
        }
      }
    }
    const out = await writePage('konta', id, input, buildKontoProps);
    if (finProps) {
      try {
        const fsch = data.schemaOf('finanse');
        if (fsch.roles.konto?.type === 'relation') finProps[fsch.roles.konto.name] = { relation: [{ id: out.id }] };
        await notion.post('/v1/pages', { parent: { type: 'data_source_id', data_source_id: sources.finanse }, properties: finProps });
        data.invalidate();
      } catch (e) {
        return { ...out, warning: t('Konto zapisane, ale nie udało się utworzyć wpisu kosztu zakupu: {msg} Dodaj go ręcznie przyciskiem „Wydatek”.', { msg: e.message }) };
      }
    }
    return out;
  }

  // Wpis finansowy; przy payoucie opcjonalnie odejmuje kwotę od salda konta (tylko gdy Saldo jest polem liczbowym, nie formułą).
  async function saveFinanse(input, id) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError({}, 'Nieprawidłowe dane formularza.');
    const deduct = !id && input.deductSaldo === true;
    if (deduct) {
      const ksch = await data.loadSchema('konta');
      if (ksch.roles.saldo?.type !== 'number') throw new ValidationError({ deductSaldo: t('Saldo tego konta liczy się formułą w Notion, więc nie da się go zmienić z dashboardu.') });
      if (!isPayoutKind(input.kind)) throw new ValidationError({ deductSaldo: t('Saldo odejmuje się tylko przy payoucie.') });
      if (!input.konto) throw new ValidationError({ deductSaldo: t('Wybierz konto, od którego saldo ma zostać pomniejszone.') });
    }
    const out = await writePage('finanse', id, input, buildFinanseProps);
    if (deduct) {
      try {
        const ksch = data.schemaOf('konta');
        const konto = await notion.get(`/v1/pages/${input.konto}`);
        const cur = konto.properties?.[ksch.roles.saldo.name]?.number;
        if (typeof cur !== 'number') throw new Error(t('Saldo konta jest puste.'));
        await notion.patch(`/v1/pages/${input.konto}`, { properties: { [ksch.roles.saldo.name]: { number: Math.round((cur - Number(String(input.amount).replace(',', '.'))) * 100) / 100 } } });
        data.invalidate();
      } catch (e) {
        return { ...out, warning: t('Wpis zapisany, ale nie udało się zmniejszyć salda konta: {msg}', { msg: e.message }) };
      }
    }
    return out;
  }

  // Backtest (E2): nowa strona trade'a z modułu Backtest. Nowy setup albo instrument (np. MNQ) tworzy opcję przy zapisie strony, bez migracji.
  // Poza trasą /api/:baza (server.mjs woła tylko trades/konta/finanse), więc ta opcja nie dotyczy zapisu trade'ów Live.
  const backtestTrade = (input) => writePage('trades', null, input, (inp, sch, ctx, tt) => buildTradeProps(inp, sch, ctx.kontaIds, { creating: true, allowNew: ['setup', 'instrument'] }, tt));
  // Poprawki po review E2 (#2): opis (setup, notatka) zmieniony po wysyłce aktualizuje istniejącą stronę trade'a backtestu (bez kontroli „edited”: plik sesji jest źródłem prawdy).
  const backtestUpdate = (input, id) => writePage('trades', id, input, (inp, sch, ctx, tt) => buildTradeProps(inp, sch, ctx.kontaIds, { creating: false, page: ctx.page, allowNew: ['setup'] }, tt));

  // [U] 2026-11-01 «Archiwum Notion + Cofnij» (usuwanie trade'ów w dzienniku i w backteście): strona trade'a trafia do archiwum Notion (in_trash), NIE jest kasowana na stałe,
  // a Cofnij ustawia in_trash z powrotem na false. Strona musi należeć do bazy Trade'y (inaczej 403), identyfikator przechodzi PAGE_ID_RE. Ponowne usunięcie strony,
  // która już jest w archiwum, kończy się sukcesem (already), więc podwójne kliknięcie niczego nie psuje. Każdy błąd Notion wraca jako NotionError z jasnym komunikatem
  // i kodem (notion-offline, notion-missing, notion-denied, notion-error): po błędzie strona zostaje taka, jaka była, a wywołujący nie zmienia nic u siebie.
  // guard(tekstPolaSesjiBacktestu, strona) może odmówić (np. trade należy do sesji backtestu); jego wyjątki przechodzą bez zmian.
  const scrubToken = (s) => String(s ?? '').replace(/(Bearer\s+|secret_|ntn_)[A-Za-z0-9_.-]+/gi, '[token]').replace(/token=\S+/gi, 'token=[token]');
  const trashFail = (e, trashed) => {
    const what = trashed ? t('trade nie został usunięty') : t('trade nie wrócił z archiwum Notion');
    // wyjątek spoza klienta Notion (np. zwykły Error): ogólny komunikat, treść tylko w logu i bez tokenu (poprawka po audycie 2.11.2026)
    const net = e instanceof TypeError || e?.name === 'TimeoutError' || e?.name === 'AbortError';
    if (!(e instanceof NotionError) && !net) {
      console.error('[write] archiwizacja strony trade\'a:', scrubToken(e?.message ?? e));
      return new NotionError(t('Notion zwrócił nieoczekiwany błąd, więc {what}. Szczegóły są w logu dashboardu.', { what }), 500, 'notion-error');
    }
    if (e instanceof NotionError && ![401, 403, 404, 429].includes(e.status) && e.status < 500) console.error('[write] Notion odrzucił zmianę strony trade\'a:', e.status, scrubToken(e.message));
    const s = e instanceof NotionError ? e.status : 0;
    if (s === 404) return new NotionError(t('Notion nie znalazł strony tego trade\'a (usunięto ją na stałe albo integracja nie ma do niej dostępu), więc {what}.', { what }), 404, 'notion-missing');
    if (s === 401) return new NotionError(t('Token Notion wygasł lub jest błędny, więc {what}. Wygeneruj nowy i wpisz go w pliku .env.', { what }), 502, 'notion-denied');
    if (s === 403) return new NotionError(t('Integracja Notion nie ma uprawnień do zmiany tej strony, więc {what}. Sprawdź jej dostęp do bazy Trade\'y.', { what }), 403, 'notion-denied');
    if (s === 0 || s === 429 || s >= 500) return new NotionError(t('Nie udało się połączyć z Notion, więc {what}. Sprawdź połączenie i spróbuj ponownie.', { what }), 503, 'notion-offline');
    return new NotionError(t('Notion odrzucił zmianę (błąd {status}), więc {what}.', { status: s, what }), s, 'notion-error');
  };
  async function trashTradePage(id, trashed = true, { guard = null } = {}) {
    const ds = sources.trades;
    if (!ds) throw new NotionError(t('Brak identyfikatora bazy w pliku .env ({db}).', { db: 'trades' }), 500);
    if (typeof id !== 'string' || !PAGE_ID_RE.test(id)) throw new ValidationError({}, 'Nieprawidłowy identyfikator wpisu.');
    let page;
    try { page = await notion.get(`/v1/pages/${id}`); } catch (e) { throw trashFail(e, trashed); }
    if (!sameId(page.parent?.data_source_id, ds)) throw new NotionError(t('Ten wpis nie należy do właściwej bazy.'), 403, 'foreign');
    if (guard) {
      // fail-closed: bez odczytu schematu nie wiadomo, czy trade należy do sesji backtestu, więc odmawiamy zamiast przepuszczać pusty tekst
      let sch;
      try { sch = await data.loadSchema('trades'); } catch (e) {
        console.error('[write] schemat bazy Trade\'y nieczytelny przy sprawdzaniu blokady backtestu:', scrubToken(e?.message ?? e));
        throw new NotionError(t('Nie mogę sprawdzić, czy ten trade należy do sesji backtestu, więc {what}. Sprawdź połączenie z Notion i spróbuj ponownie.', { what: trashed ? t('trade nie został usunięty') : t('trade nie wrócił z archiwum Notion') }), 503, 'notion-offline');
      }
      const prop = sch?.roles?.btSession ? page.properties?.[sch.roles.btSession.name] : null;
      guard((prop?.rich_text || []).map((x) => x.plain_text ?? x.text?.content ?? '').join(''), page);
    }
    if (!!(page.archived || page.in_trash) === trashed) return { ok: true, id: page.id, already: true };
    try { await notion.patch(`/v1/pages/${id}`, { in_trash: trashed }); } catch (e) { throw trashFail(e, trashed); }
    data.invalidate();
    return { ok: true, id: page.id, already: false };
  }

  return { trades: saveTrade, konta: saveKonto, finanse: saveFinanse, backtestTrade, backtestUpdate, trashTradePage };
}
