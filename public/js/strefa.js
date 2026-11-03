// Strefa czasu aplikacji: jedno źródło prawdy dla godzin wpisywanych i pokazywanych w dzienniku, kalendarzu, na wykresach i w Backteście.
// Moduł czysty (działa w przeglądarce i w Node), bez importów.
// [U] 3.11.2026 «mala poprawka do notion i do journalingu, ja wpisuje godziny wedle nowojorskiego czasu nie polskiego»
// [U] 3.11.2026 «Wszędzie, z opisem „NY” (Recommended)» (godziny w czasie NY w formularzu, listach, kalendarzu, na osi wykresu, w historii i Journalu; strefa do zmiany w Ustawieniach, domyślnie NY)
// Ustawienie leży w settings.chartTz (nazwa z P26 zostaje, bo jest już synchronizowana przez Notion): pusta wartość = strefa domyślna, czyli Nowy Jork.
export const DEFAULT_TZ = 'America/New_York';

export function validTz(z) {
  if (typeof z !== 'string' || !z || z.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: z }); return true; } catch { return false; }
}

let current = DEFAULT_TZ;
export function setAppTz(z) { current = validTz(z) ? z : DEFAULT_TZ; }
export const appTz = () => current;

const fmts = new Map();
function partsFmt(tz) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fmts.set(tz, f);
  }
  return f;
}
// Data i godzina chwili `ms` (milisekundy UTC) na zegarze strefy `tz`: { date: 'RRRR-MM-DD', time: 'GG:MM', sec: 'SS' }.
export function wallParts(ms, tz = current) {
  const p = {};
  for (const x of partsFmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, sec: p.second };
}
export const dayKeyIn = (ms, tz = current) => wallParts(ms, tz).date;

// Skrót strefy przy godzinach: „NY” dla Nowego Jorku, „UTC” albo „UTC+1” dla pozostałych (przesunięcie z chwili `ms`).
export function tzShort(tz = current, ms = Date.now()) {
  if (tz === DEFAULT_TZ) return 'NY';
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  try {
    const v = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date(ms)).find((x) => x.type === 'timeZoneName')?.value || 'GMT';
    const m = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(v);
    if (!m || !m[1]) return 'UTC';
    const h = Number(m[2]), min = Number(m[3]);
    return `UTC${m[1] === '-' ? '−' : '+'}${h}${min ? `:${String(min).padStart(2, '0')}` : ''}`;
  } catch { return 'UTC'; }
}

// Przesunięcie strefy względem UTC w milisekundach w chwili `ms` (z czasem letnim).
function offsetMs(ms, tz) {
  const p = {};
  for (const x of partsFmt(tz).formatToParts(new Date(Math.floor(ms / 1000) * 1000))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// Odwrotność wallParts: chwila (ms UTC), w której zegar strefy `tz` pokazuje datę `date` ('RRRR-MM-DD') i godzinę `time` ('GG:MM' albo 'GG:MM:SS').
// Godzina z przerwy zmiany czasu (wiosna, np. 02:30 NY 8.03.2026) cofa się o godzinę (01:30); godzina z nakładki jesiennej to pierwsze wystąpienie.
export function wallToMs(date, time = '00:00', tz = current) {
  const [y, mo, d] = String(date).split('-').map(Number);
  const [hh, mm = 0, ss = 0] = String(time).split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const first = asUtc - offsetMs(asUtc, tz);
  return asUtc - offsetMs(first, tz);
}
