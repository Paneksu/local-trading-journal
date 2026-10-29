// Atrapa feedu tygodnia w kształcie nfs.faireconomy.media/ff_calendar_thisweek.json: tablica { title, country, date (ISO z offsetem ET), impact, forecast, previous }.
// Nazwy zdarzeń są WYMYŚLONE (zasada newsów: dane ForexFactory nigdy w repozytorium ani w testach). Wagi i kształt jak w feedzie.
// English: mock of the weekly calendar feed; event names are invented, only the shape is real.
export const item = (title, date, impact = 'High', country = 'USD') => ({ title, country, date, impact, forecast: '1.2%', previous: '0.9%' });

// Tydzień 25-31.10.2026 (USA na czasie letnim, offset -04:00; zmiana na zimowy dopiero 1.11).
export function weekOct2026() {
  return [
    item('Zorblat Index m/m', '2026-10-27T08:30:00-04:00', 'High'),
    item('Wibbly Output q/q', '2026-10-27T10:00:00-04:00', 'Medium'),
    item('Kwarkle Stocks', '2026-10-28T10:30:00-04:00', 'Low'),
    item('Frobnicate Rate', '2026-10-28T14:00:00-04:00', 'High'),
    item('Plonk Chair Speaks', '2026-10-29T00:00:00-04:00', 'High'), // godzina nieznana (Tentative): północ ET
    item('Grundle Holiday', '2026-10-30T00:00:00-04:00', 'Holiday'),
    item('Zorblat Index m/m', '2026-10-27T05:00:00-04:00', 'High', 'EUR'), // inna waluta: pomijana
    item('Snorf Balance', '2026-10-31T08:30:00-04:00', 'Low', 'CAD'),
  ];
}
// Tydzień 8-14.03.2026: zmiana czasu w USA w niedzielę 8.03 o 2:00, więc poniedziałek jest już na -04:00, a niedziela jeszcze na -05:00.
export function weekMar2026() {
  return [
    item('Zorblat Index m/m', '2026-03-10T08:30:00-04:00', 'High'),
    item('Wibbly Output q/q', '2026-03-12T08:30:00-04:00', 'Medium'),
  ];
}

// Fałszywe fetch: lista odpowiedzi w kolejności; zapisuje każde wywołanie (adres i nagłówki), żeby test mógł policzyć zapytania.
export function fakeFetch(replies) {
  const calls = [];
  const queue = [...replies];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {}, redirect: init.redirect });
    const r = queue.length > 1 ? queue.shift() : queue[0];
    if (r instanceof Error) throw r;
    const headers = new Map(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, headers: { get: (k) => headers.get(String(k).toLowerCase()) ?? null }, json: async () => r.json, text: async () => r.text ?? JSON.stringify(r.json) };
  };
  fn.calls = calls;
  return fn;
}
