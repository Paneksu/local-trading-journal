// Atrapa Finnhub: calendar/earnings (okno dat; opcjonalne ucięcie do ostatnich `limit` wierszy, jak prawdziwy serwer przy 1500) i stock/profile2.
// Klucz sprawdzany w nagłówku X-Finnhub-Token (zły = 401). Dane WYMYŚLONE. English: mock of Finnhub with invented data.
export const FAKE_FH_KEY = 'fhtest0123456789abcdef0123456789abcdef01';
export function fakeFinnhub({ rows = [], caps = {}, key = FAKE_FH_KEY, limit = Infinity, status = 200, headers = {} } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: String(url), host: u.hostname, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: init.headers || {}, redirect: init.redirect });
    const reply = (code, json, h = {}) => ({ ok: code < 400, status: code, headers: { get: (k) => h[String(k).toLowerCase()] ?? null }, json: async () => json, text: async () => JSON.stringify(json) });
    if (status !== 200) return reply(status, { error: `rejected ${init.headers?.['X-Finnhub-Token']}` }, headers);
    if (init.headers?.['X-Finnhub-Token'] !== key) return reply(401, { error: 'Invalid API key' });
    if (u.pathname === '/api/v1/calendar/earnings') {
      const a = u.searchParams.get('from'), b = u.searchParams.get('to');
      const list = rows.filter((r) => r.date >= a && r.date <= b).sort((x, y) => (x.date < y.date ? -1 : 1));
      return reply(200, { earningsCalendar: list.slice(-limit) });
    }
    if (u.pathname === '/api/v1/stock/profile2') {
      const s = u.searchParams.get('symbol');
      return reply(200, s in caps ? { ticker: s, marketCapitalization: caps[s] } : {});
    }
    return reply(404, {});
  };
  fn.calls = calls;
  return fn;
}
