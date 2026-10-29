// Atrapa SEC EDGAR: company_tickers.json i submissions API w kształcie prawdziwych odpowiedzi (tablice równoległe w filings.recent, pliki dodatkowe w filings.files).
// Dane WYMYŚLONE (CIK, daty i godziny przyjęcia). Sprawdza nagłówek User-Agent jak SEC (brak = 403) i zapisuje każde wywołanie. English: mock of SEC EDGAR with invented data.
export const tickersJson = (map) => Object.fromEntries(Object.entries(map).map(([ticker, cik], i) => [String(i), { cik_str: cik, ticker, title: `${ticker} Inc.` }]));
// filings: [[form, items, acceptanceDateTime ISO UTC]] → blok tablic równoległych
export const block = (filings) => ({
  accessionNumber: filings.map((_, i) => `0000000000-26-${String(i).padStart(6, '0')}`),
  acceptanceDateTime: filings.map((f) => f[2]), form: filings.map((f) => f[0]), items: filings.map((f) => f[1]),
});
export function fakeSec({ tickers = {}, submissions = {}, files = {}, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: String(url), host: u.hostname, path: u.pathname, ua: init.headers?.['User-Agent'], redirect: init.redirect });
    const reply = (code, json) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => json, text: async () => JSON.stringify(json) });
    if (status !== 200) return reply(status, {});
    if (!init.headers?.['User-Agent']) return reply(403, {});
    if (u.hostname === 'www.sec.gov' && u.pathname === '/files/company_tickers.json') return reply(200, tickersJson(tickers));
    if (u.hostname === 'data.sec.gov') {
      const m = /^\/submissions\/CIK(\d{10})\.json$/.exec(u.pathname);
      if (m && submissions[m[1]]) return reply(200, submissions[m[1]]);
      const f = /^\/submissions\/(CIK\d{10}-submissions-\d{3}\.json)$/.exec(u.pathname);
      if (f && files[f[1]]) return reply(200, files[f[1]]);
    }
    return reply(404, {});
  };
  fn.calls = calls;
  return fn;
}
