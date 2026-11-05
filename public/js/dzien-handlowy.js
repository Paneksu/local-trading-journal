// Dzień handlowy CME w strefie America/New_York: czyste liczenie granic, bez DOM-u i bez i18n.
// Importuje je i przeglądarka (newsy.js, po-be.js), i serwer, więc ten plik nie może niczego dotykać poza Intl.
// Zakres liczony przez strefę (Intl), nie stałym offsetem, więc dni zmiany czasu mają 22 h (marzec) i 24 h (listopad) zamiast 23 h.
// English: CME trading-day boundaries in New York time; pure, shared by browser and server.
const ET_ZONE = 'America/New_York';
const etParts = new Intl.DateTimeFormat('en-US', { timeZone: ET_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function etOffsetAt(u) {
  const p = Object.fromEntries(etParts.formatToParts(new Date(u * 1000)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) / 1000 - u;
}
// Chwila UTC dla godziny hh:00 czasu Nowego Jorku w dniu o numerze dayNum (dni od 1970-01-01); godziny 18 i 17 nie wpadają w przerwę zmiany czasu (2:00).
function etWallToUtc(dayNum, hh) {
  const wall = dayNum * 86400 + hh * 3600;
  let u = wall;
  for (let i = 0; i < 3; i++) u = wall - etOffsetAt(u);
  return u;
}
// day: 'RRRR-MM-DD' (data w ET). Zwraca { from, to } w sekundach UTC: 18:00 ET dnia poprzedniego do 17:00 ET danego dnia.
export function tradingDayRange(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day));
  if (!m) return null;
  const n = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000;
  return { from: etWallToUtc(n - 1, 18), to: etWallToUtc(n, 17) };
}
// Najbliższe 17:00 ET ściśle po chwili sec (sekundy UTC), z pominięciem soboty i niedzieli:
// piątek po 17:00 ET, sobota i niedziela do 18:00 ET dają poniedziałek 17:00 ET. Dla chwili 17:00:00 ET wynik to 17:00 następnego dnia.
export function tradingDayEnd(sec) {
  const day = Math.floor((sec + etOffsetAt(sec)) / 86400);
  let n = sec < etWallToUtc(day, 17) ? day : day + 1;
  // 1970-01-01 to czwartek: (n + 4) % 7 daje 0 = niedziela, 6 = sobota
  while ((n + 4) % 7 === 0 || (n + 4) % 7 === 6) n++;
  return etWallToUtc(n, 17);
}
