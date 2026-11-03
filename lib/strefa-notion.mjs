// Poprawa strefy czasu starych wpisów w Notion (1.7.0, odbiór, runda 2). Dziennik zapisywał godziny wpisane w formularzu z time_zone = strefa przeglądarki
// (Europe/Warsaw), a użytkownik wpisuje godziny według czasu Nowego Jorku. FAKT z prawdziwego Notion (jeden odczyt za zgodą użytkownika, 3.11.2026):
// Notion przy odczycie oddaje start Z PRZESUNIĘCIEM („2026-11-02T09:54:00.000+01:00”), a time_zone jest null. Dlatego kandydatem jest wpis z godziną
// i przesunięciem ZGODNYM Z EUROPE/WARSAW w dniu wpisu (+01:00 zimą, +02:00 latem); wpisy z przesunięciem Nowego Jorku (−04:00/−05:00), z innym
// przesunięciem i same daty (bez godziny) zostają bez zmian. Zapis: ta sama godzina zegarowa, time_zone ZAWSZE America/New_York (nie strefa z Ustawień);
// po zapisie Notion odda przesunięcie NY, więc kolejny podgląd nie widzi już tych wpisów (idempotencja z samej konstrukcji).
// Dwie grupy w podglądzie: „zegar” (domyślna: godzina na zegarze zostaje, moment się przesuwa) i „moment” (wpisy DEMO, mające prawdziwy moment zapisany
// w czasie polskim: 15:35+01:00 → 09:35 NY, moment bez zmian). Zmieniane jest WYŁĄCZNIE pole daty wejścia i wyjścia bazy Trade'y.
// Kolejność jest stała: podgląd (tylko odczyt) → kopia zapasowa baz (lib/kopie.mjs) → dopiero zmiany stron, po jednej, z odstępem (limit Notion ok. 3/s);
// błąd jednej strony nie zatrzymuje pozostałych, raport: poprawione/pominięte/błędy; przerwaną poprawę uruchamia się jeszcze raz.
// [U] 3.11.2026 «Popraw strefę na NY (Recommended)» (ta sama godzina na zegarze, oznaczona jako NY; przed zmianą kopia zapasowa bazy)
// [U] 3.11.2026 «Przelicz na NY, ten sam moment (Recommended)» (wpisy DEMO i przesunięte na wykresie, które mają prawdziwy moment zapisany w czasie polskim)
// [U] 2026-11-03 «Odznaczanie w podglądzie (Recommended)» (podgląd pokazuje listę wpisów z wyborem na wpis: ta sama godzina NY / ten sam moment / pomiń; «Ty wiesz, które przeciągałeś»)
// Decyzja sesji głównej 3.11.2026: zgoda wymaga wpisania „TAK” przez człowieka (jak przy przywracaniu kopii), a w czasie poprawy zapis, edycja i usuwanie trade'ów zwracają 409.
import { randomBytes } from 'node:crypto';
import { validTz, wallParts } from '../public/js/strefa.js';
import { DEMO_PREFIX } from './workspace.mjs';

export const TARGET_TZ = 'America/New_York';
export const SOURCE_TZ = 'Europe/Warsaw';
// odstęp między zapisami stron: Notion dopuszcza średnio 3 żądania na sekundę
export const PACE_MS = 400;
// ważność zgody z podglądu (jak przy przywracaniu kopii)
export const PREVIEW_TTL_MS = 10 * 60 * 1000;

export class TzFixError extends Error {
  constructor(message, status = 400, code = 'error') { super(message); this.status = status; this.code = code; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => p[k] ?? '') : s);
const OFFSET_END = /(?:[zZ]|[+-]\d\d:\d\d)$/;

// przesunięcie z końca tekstu daty w minutach (Z = 0) albo null
export function offsetMinutes(s) {
  const m = /([+-])(\d\d):(\d\d)$/.exec(String(s));
  if (m) return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return /[zZ]$/.test(String(s)) ? 0 : null;
}
// przesunięcie strefy w minutach w chwili ms (z czasem letnim)
export function zoneOffsetMinutes(ms, tz) {
  const w = wallParts(ms, tz), [y, mo, d] = w.date.split('-').map(Number), [h, mi] = w.time.split(':').map(Number);
  return (Date.UTC(y, mo - 1, d, h, mi, Number(w.sec)) - Math.floor(ms / 1000) * 1000) / 60000;
}
const wallStr = (ms, tz) => { const w = wallParts(ms, tz); return `${w.date}T${w.time}:${w.sec}`; };
// zegar „RRRR-MM-DDTGG:MM:SS” zapisu z przesunięciem (to zegar strefy zapisu) albo bez przesunięcia
const clockOf = (s) => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s));
  return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}` : null;
};

// Jedna wartość daty (start albo end): { action: 'change', clock, from } albo { action: 'skip', why }.
// why: 'none' (brak), 'no-time' (sama data), 'same' (już NY), 'no-zone' (godzina bez przesunięcia i strefy), 'other' (przesunięcie innej strefy), 'bad' (nieczytelna).
function planValue(value, zone, moment) {
  const s = String(value || '');
  if (s.length <= 10) return { action: 'skip', why: s ? 'no-time' : 'none' };
  const clock = clockOf(s);
  if (!clock) return { action: 'skip', why: 'bad' };
  if (!OFFSET_END.test(s)) {
    // start bez przesunięcia: sens ma tylko z time_zone (kształt, którego Notion przy odczycie nie oddaje, ale zapis go przyjmuje)
    if (zone === TARGET_TZ) return { action: 'skip', why: 'same' };
    if (zone === SOURCE_TZ) return { action: 'change', clock, from: SOURCE_TZ };
    return { action: 'skip', why: zone ? 'other' : 'no-zone' };
  }
  const ms = Date.parse(s), off = offsetMinutes(s);
  if (!Number.isFinite(ms) || off == null) return { action: 'skip', why: 'bad' };
  if (off === zoneOffsetMinutes(ms, TARGET_TZ)) return { action: 'skip', why: 'same' };
  if (off !== zoneOffsetMinutes(ms, SOURCE_TZ)) return { action: 'skip', why: 'other' };
  // przesunięcie zgodne z Warszawą: grupa „moment” przelicza ten sam moment na zegar NY, grupa „zegar” zostawia zegar Warszawy
  return { action: 'change', clock: moment ? wallStr(ms, TARGET_TZ) : clock, from: SOURCE_TZ };
}

// Decyzja dla pola daty: { action: 'change', group, clock, endClock, from } albo { action: 'skip', why }. moment = true dla wpisów z prawdziwym momentem w czasie polskim.
export function planField(date, { moment = false } = {}) {
  if (!date || typeof date.start !== 'string') return { action: 'skip', why: 'none' };
  const zone = typeof date.time_zone === 'string' ? date.time_zone : '';
  const st = planValue(date.start, zone, moment);
  if (st.action !== 'change') return st;
  let endClock = null;
  if (typeof date.end === 'string' && date.end) {
    if (date.end.length <= 10) endClock = date.end;
    else {
      const en = planValue(date.end, zone, moment);
      if (en.action !== 'change') return { action: 'skip', why: 'bad' };
      endClock = en.clock;
    }
  }
  return { action: 'change', group: moment ? 'moment' : 'clock', clock: st.clock, endClock, from: st.from };
}

const titleOf = (page) => {
  const tp = Object.values(page.properties || {}).find((p) => p.type === 'title');
  return (tp?.title || []).map((x) => x.plain_text ?? x.text?.content ?? '').join('');
};

// Plan na liście stron: { pages: [{ id, title, instrument, group, fields }], total, fields, groups: { clock: {pages, fields}, moment: {...} }, byReason, example }
// Każde pole niesie oba warianty zapisu: `clock` („ta sama godzina w NY”) i `momentClock` („ten sam moment”); `group` strony to jej domyślny wybór (DEMO: moment).
// roles: { date: nazwa pola wejścia, exit?: nazwa pola wyjścia, instrument?: nazwa pola instrumentu }
export const CHOICES = ['clock', 'moment', 'skip'];
export function planPages(pages, roles) {
  const out = { pages: [], total: 0, fields: 0, groups: { clock: { pages: 0, fields: 0 }, moment: { pages: 0, fields: 0 } }, byReason: { same: 0, 'no-time': 0, 'no-zone': 0, other: 0, bad: 0, none: 0 }, example: null };
  for (const page of pages) {
    if (page.archived || page.in_trash) continue;
    out.total++;
    const title = titleOf(page), moment = title.startsWith(DEMO_PREFIX), fields = [];
    for (const role of ['date', 'exit']) {
      const name = roles[role];
      if (!name) continue;
      const p = page.properties?.[name];
      if (!p || p.type !== 'date') continue;
      const d = planField(p.date, { moment: false });
      if (d.action === 'change') {
        const m = planField(p.date, { moment: true });
        fields.push({ role, name, clock: d.clock, endClock: d.endClock, momentClock: m.clock, momentEnd: m.endClock, from: d.from, was: String(p.date.start).slice(0, 16), wasFull: String(p.date.start) });
      } else out.byReason[d.why]++;
    }
    if (fields.length) {
      const group = moment ? 'moment' : 'clock';
      const inst = roles.instrument ? page.properties?.[roles.instrument]?.select?.name || '' : '';
      out.pages.push({ id: page.id, title, instrument: inst, group, fields });
      out.fields += fields.length;
      out.groups[group].pages++; out.groups[group].fields += fields.length;
      if (!out.example || (group === 'clock' && out.example.group !== 'clock')) out.example = { group, from: fields[0].was.replace('T', ' '), to: fields[0].clock.slice(0, 16).replace('T', ' '), zone: TARGET_TZ };
    }
  }
  return out;
}

// Wybór dla strony: nadpisanie z żądania albo domyślny (DEMO: moment, reszta: clock)
export const choiceOf = (page, choices = {}) => (CHOICES.includes(choices[page.id]) ? choices[page.id] : page.group);
// Skrót planu z podglądu (strony, domyślna grupa, pola, godziny i końce zakresów): zmiana danych w Notion po podglądzie unieważnia zgodę.
// Wybory użytkownika NIE wchodzą do klucza: powstają po podglądzie i przychodzą w tym samym żądaniu co wpisane „TAK” (jedna zgoda: podgląd → wybory → TAK),
// a serwer przyjmuje je tylko dla id z podglądu i tylko z białej listy wartości.
export function planKey(plan) {
  return plan.pages.map((p) => { return `${p.id}:${p.group}:${p.fields.map((f) => `${f.role}=${f.clock}~${f.endClock || ''}|${f.momentClock}~${f.momentEnd || ''}@${f.from}`).join(',')}`; }).join('|');
}

// Odpowiedź dla przeglądarki: liczby, przykład i PEŁNA lista wpisów (id strony, tytuł, instrument, daty z przesunięciem, oba warianty godziny, domyślny wybór)
export function summarize(plan) {
  const items = plan.pages.map((p) => ({ id: p.id, title: String(p.title).slice(0, 200), instrument: String(p.instrument || '').slice(0, 40), group: p.group, fields: p.fields.map((f) => ({ role: f.role, was: f.was.replace('T', ' '), offset: String(f.wasFull).slice(-6), to: f.clock.slice(0, 16).replace('T', ' '), toMoment: f.momentClock.slice(0, 16).replace('T', ' ') })) }));
  return {
    tz: TARGET_TZ, total: plan.total, pages: plan.pages.length, fields: plan.fields, groups: plan.groups,
    skipped: { same: plan.byReason.same, noTime: plan.byReason['no-time'], noZone: plan.byReason['no-zone'], other: plan.byReason.other, bad: plan.byReason.bad },
    example: plan.example, items,
  };
}

// Zapis planu: po jednej stronie, z odstępem; strona z wyborem „pomiń” nie jest dotykana; błąd strony trafia do raportu i nie zatrzymuje reszty.
// Start idzie BEZ przesunięcia z time_zone (zegar w tej strefie).
export async function applyPlan(notion, plan, { pace = PACE_MS, onProgress = () => {}, choices = {} } = {}) {
  const report = { changed: 0, fields: 0, errors: [], byChoice: { clock: 0, moment: 0, skip: 0 } };
  let first = true;
  for (const page of plan.pages) {
    const mode = choiceOf(page, choices);
    report.byChoice[mode]++;
    if (mode === 'skip') continue;
    if (!first && pace > 0) await sleep(pace);
    first = false;
    const properties = {};
    for (const f of page.fields) {
      const start = mode === 'moment' ? f.momentClock : f.clock, end = mode === 'moment' ? f.momentEnd : f.endClock;
      properties[f.name] = { date: { start, end: end || null, time_zone: TARGET_TZ } };
    }
    try {
      await notion.patch(`/v1/pages/${page.id}`, { properties });
      report.changed++;
      report.fields += page.fields.length;
    } catch (e) {
      report.errors.push({ title: String(page.title).slice(0, 200), message: String(e?.message || e).slice(0, 200) });
    }
    onProgress(report.changed + report.errors.length);
  }
  return report;
}

// Zadanie z podglądem i zgodą: jedno naraz. loadRoles(): { date, exit } nazwy pól bazy Trade'y; copy(extra): kopia zapasowa baz (nazwa kopii);
// writesInFlight(): liczba zapisów trade'ów przyjętych przez serwer i jeszcze niezakończonych (apply odmawia, gdy > 0);
// isBusy(): powód cudzej blokady albo null; onDone(): po zapisie (odświeżenie danych dashboardu). busy() służy serwerowi do 409 przy zapisie trade'ów.
export function createTzFix({ notion, sources, loadRoles, copy, isBusy = () => null, writesInFlight = () => 0, lang = () => 'pl', t = fmt, onDone = () => {}, scrub = (s) => s, log = (m) => console.log(m), now = () => Date.now(), pace = PACE_MS }) {
  const idle = () => ({ running: false, kind: null, step: null, done: 0, total: 0, result: null, error: null, startedAt: null, finishedAt: null });
  let job = idle();
  let previewed = null;
  const word = () => (lang() === 'en' ? 'YES' : 'TAK');
  const busy = () => (job.running ? t('Trwa poprawianie strefy czasu wpisów w Notion. Spróbuj po zakończeniu.') : null);

  function guard() {
    if (job.running) throw new TzFixError(busy(), 409, 'running');
    const other = isBusy();
    if (other) throw new TzFixError(other, 409, 'running');
    if (writesInFlight() > 0) throw new TzFixError(t('Trwa zapis wpisu w dzienniku. Spróbuj za chwilę.'), 409, 'running');
    if (!sources.trades || notion.hasToken === false) throw new TzFixError(t('Dashboard nie jest połączony z Notion. Najpierw połącz dziennik w pierwszych krokach.'), 409, 'not-configured');
  }
  // cel jest stały (America/New_York, słowa użytkownika «Popraw strefę na NY»): inna strefa z żądania jest odrzucana
  const checkZone = (tz) => {
    if (tz != null && tz !== '' && tz !== TARGET_TZ) throw new TzFixError(t('Poprawa ustawia zawsze strefę America/New_York.'), 400, 'bad-zone');
  };
  function start(kind, fn) {
    job = { ...idle(), running: true, kind, startedAt: new Date().toISOString() };
    Promise.resolve().then(fn).then((result) => {
      job = { ...job, running: false, step: null, result, finishedAt: new Date().toISOString() };
    }, (e) => {
      job = { ...job, running: false, error: { message: scrub(e?.message || t('Nie udało się.')), code: e?.code || null }, finishedAt: new Date().toISOString() };
      log(`[tz-fix] ${kind} failed: ${scrub(e?.message || '')}`);
    });
    return { started: true, kind };
  }
  async function plan() {
    const roles = await loadRoles();
    if (!roles?.date) throw new TzFixError(t('W bazie Trade\'y nie znaleziono pola daty.'), 409, 'no-date-field');
    return planPages(await notion.queryAll(sources.trades), roles);
  }

  async function preview(tz) {
    checkZone(tz);
    guard();
    previewed = null;
    return start('preview', async () => {
      job.step = 'plan';
      const p = await plan();
      const token = randomBytes(16).toString('hex');
      previewed = { token, key: planKey(p), at: now(), ids: new Set(p.pages.map((x) => x.id)) };
      return { token, expiresInSec: Math.round(PREVIEW_TTL_MS / 1000), word: word(), ...summarize(p) };
    });
  }
  // choices: { [id strony z planu podglądu]: 'clock' | 'moment' | 'skip' }; id spoza planu albo inna wartość = 400 (bad-choice)
  async function apply(tz, confirm, token, choices = {}) {
    // zgoda z podglądu jest jednorazowa: przepada przy każdej próbie, także odrzuconej
    const pv = previewed;
    previewed = null;
    checkZone(tz);
    if (confirm !== word()) throw new TzFixError(t('Wpisz dokładnie {word}, aby poprawić.', { word: word() }), 400, 'confirm-required');
    guard();
    if (!pv) throw new TzFixError(t('Najpierw otwórz podgląd poprawy strefy.'), 409, 'preview-required');
    if (typeof token !== 'string' || token !== pv.token || now() - pv.at > PREVIEW_TTL_MS) throw new TzFixError(t('Podgląd jest nieaktualny. Otwórz podgląd poprawy jeszcze raz.'), 409, 'preview-required');
    // wybory per wpis tylko dla stron z planu pokazanego w podglądzie
    if (choices == null || typeof choices !== 'object' || Array.isArray(choices)) throw new TzFixError(t('Nieprawidłowy wybór wpisów.'), 400, 'bad-choice');
    const keys = Object.keys(choices);
    if (keys.some((k) => !pv.ids.has(k) || !CHOICES.includes(choices[k]))) throw new TzFixError(t('Nieprawidłowy wybór wpisów.'), 400, 'bad-choice');
    const own = Object.fromEntries(keys.map((k) => [k, choices[k]]));
    return start('apply', async () => {
      job.step = 'plan';
      const p = await plan();
      // zgoda dotyczy planu z podglądu (domyślne wybory); zmiana danych w Notion po podglądzie unieważnia ją
      if (planKey(p) !== pv.key) throw new TzFixError(t('Dane w Notion zmieniły się od podglądu. Otwórz podgląd poprawy jeszcze raz.'), 409, 'plan-changed');
      const todo = p.pages.filter((x) => choiceOf(x, own) !== 'skip');
      if (!todo.length) return { changed: 0, fields: 0, errors: [], backup: null, byChoice: { clock: 0, moment: 0, skip: p.pages.length }, ...summarize(p) };
      // kopia zapasowa baz PRZED pierwszą zmianą; bez kopii nie zmieniamy niczego
      job.step = 'backup';
      const backup = await copy({ reason: 'before-tz-fix' });
      job.step = 'apply'; job.done = 0; job.total = todo.length;
      let report;
      try {
        report = await applyPlan(notion, p, { pace, choices: own, onProgress: (n) => { job.done = n; } });
      } finally {
        onDone();
      }
      log(`[tz-fix] ${report.changed} pages changed, ${report.errors.length} errors, choices ${JSON.stringify(report.byChoice)} (backup ${backup}).`);
      return { ...report, backup, ...summarize(p) };
    });
  }
  return { preview, apply, status: () => ({ ...job }), busy };
}
