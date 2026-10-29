// Atrapa FRED fred/release/dates: odpowiada listą dat dla release_id, sprawdza klucz w zapytaniu (jak prawdziwy serwer: zły klucz = 400).
// Klucz testowy jest sztuczny. English: mock of the FRED release-dates endpoint with a fake key.
export const FAKE_KEY = 'testkey0123456789abcdef0123456789';

// dates: { [rid]: ['RRRR-MM-DD', …] }; brak wpisu = pusta lista. Zwraca fetch z licznikiem wywołań (fn.calls).
export function fakeFred(dates, { key = FAKE_KEY, status = 200 } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: String(url), host: u.hostname, path: u.pathname, rid: Number(u.searchParams.get('release_id')), headers: init.headers || {}, redirect: init.redirect });
    if (status !== 200) { const b = { error_code: status, error_message: `Bad Request. api_key ${u.searchParams.get('api_key')} rejected` }; return { ok: false, status, headers: { get: () => null }, json: async () => b, text: async () => JSON.stringify(b) }; }
    if (u.searchParams.get('api_key') !== key) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error_code: 400, error_message: 'Bad Request. The value for variable api_key is not registered.' }), text: async () => JSON.stringify({ error_code: 400, error_message: 'Bad Request. The value for variable api_key is not registered.' }) };
    const list = dates[Number(u.searchParams.get('release_id'))] || [];
    const body = { release_dates: list.map((d) => ({ release_id: Number(u.searchParams.get('release_id')), date: d })) };
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  fn.calls = calls;
  return fn;
}
