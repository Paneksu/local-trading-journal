// Synchronizacja ustawień między urządzeniami przez Notion: na stronie głównej dziennika jest zwinięty blok
// „Ustawienia dashboardu (nie edytuj)” z blokiem kodu JSON. Dashboard zapisuje go po zmianie ustawień i czyta przy starcie
// oraz przy auto-odświeżeniu. Konflikt rozstrzyga ostatni zapis (updatedAt). Token NIGDY nie trafia do Notion.
// Settings sync through a hidden JSON code block on the journal home page; last write wins; the token is never stored there.
const pageIdFromUrl = (u) => { const m = String(u || '').replace(/-/g, '').match(/([0-9a-f]{32})(?![0-9a-f])/i); return m ? m[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5').toLowerCase() : null; };

export const SETTINGS_TITLE = { pl: 'Ustawienia dashboardu (nie edytuj)', en: 'Dashboard settings (do not edit)' };
export const SETTINGS_VERSION = 1;
const TITLES = Object.values(SETTINGS_TITLE).map((s) => s.toLowerCase());
const plain = (arr) => (arr || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
const chunks = (s) => (s.match(/[\s\S]{1,1900}/g) || ['']).map((c) => ({ type: 'text', text: { content: c } }));
const SECRET_KEY = /token|secret|password|haslo|hasło|pin|key|databento|chartcost|chartdaily|chartcredit|chartspen/i; // etap 14 (R21): klucz Databento, limity kosztu, dzienne wydatki i kredyt nigdy w ustawieniach ani w Notion

// Identyfikator zapisany w ustawieniach w Notion: NIE zmieniamy przy zmianie nazwy na JustJournal (zmiana = utrata ustawień u istniejących użytkowników). / Stored id, kept on purpose after the JustJournal rename.
export const emptyData = () => ({ app: 'local-trading-journal', settingsVersion: SETTINGS_VERSION, updatedAt: null, deviceId: null, settings: {}, devices: {} });

// usuwa z ustawień wszystko, co wygląda na sekret, i ogranicza rozmiar
export function sanitizeSettings(v, depth = 0) {
  if (depth > 6 || v == null) return null; // security HIJ, N2 (29.10.2026): za granicą głębokości nic nie przechodzi (wcześniej surowy obiekt bez filtra kluczy)
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => sanitizeSettings(x, depth + 1));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEY.test(k)).slice(0, 100).map(([k, x]) => [k, sanitizeSettings(x, depth + 1)]));
  if (typeof v === 'string') return v.slice(0, 500);
  return typeof v === 'number' || typeof v === 'boolean' ? v : null;
}

export function settingsBlock(lang, data = emptyData()) {
  return {
    object: 'block', type: 'toggle',
    toggle: {
      rich_text: [{ type: 'text', text: { content: SETTINGS_TITLE[lang === 'en' ? 'en' : 'pl'] }, annotations: { color: 'gray' } }],
      children: [{ object: 'block', type: 'code', code: { language: 'json', rich_text: chunks(JSON.stringify(data, null, 1)) } }],
    },
  };
}

async function children(notion, id) {
  const out = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await notion.get(`/v1/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    out.push(...(r.results || []));
    if (!r.has_more) break;
    cursor = r.next_cursor;
  }
  return out;
}

export const rootIdOf = (config, rootUrl) => config.rootPageId || pageIdFromUrl(rootUrl);

// { toggleId, codeId, data } albo null, gdy bloku nie ma. saved: identyfikatory zapamiętane w config.local.json,
// dzięki którym blok jest rozpoznawany także po zmianie nazwy; bez nich po nazwie PL albo EN.
export async function findSettings(notion, rootId, saved = null) {
  if (!rootId) return null;
  const top = await children(notion, rootId);
  const toggle = (saved?.toggleId && top.find((b) => b.id === saved.toggleId && b.type === 'toggle'))
    || top.find((b) => b.type === 'toggle' && TITLES.includes(plain(b.toggle?.rich_text).trim().toLowerCase()));
  if (!toggle) return null;
  const code = (await children(notion, toggle.id)).find((b) => b.type === 'code');
  if (!code) return { toggleId: toggle.id, codeId: null, data: null };
  let data = null;
  try { data = JSON.parse(plain(code.code?.rich_text)); } catch { data = null; }
  if (!data || data.app !== 'local-trading-journal') data = emptyData();
  data.devices = data.devices && typeof data.devices === 'object' ? data.devices : {};
  return { toggleId: toggle.id, codeId: code.id, data };
}

// Migracja / naprawa: dopisuje blok na końcu strony głównej, jeśli go nie ma. Nie rusza innej treści strony.
export async function ensureSettingsBlock(notion, rootId, lang, { dryRun = false, saved = null } = {}) {
  const name = SETTINGS_TITLE[lang === 'en' ? 'en' : 'pl'];
  if (!rootId) return { kind: 'block', name, detail: 'brak strony głównej (NOTION_ROOT_URL) / no home page', status: 'conflict' };
  const found = await findSettings(notion, rootId, saved);
  if (found?.codeId) return { kind: 'block', name, detail: 'settings', status: 'skip' };
  if (dryRun) return { kind: 'block', name, detail: 'settings', status: 'add' };
  if (found?.toggleId) await notion.patch(`/v1/blocks/${found.toggleId}/children`, { children: settingsBlock(lang).toggle.children });
  else await notion.patch(`/v1/blocks/${rootId}/children`, { children: [settingsBlock(lang)] });
  return { kind: 'block', name, detail: 'settings', status: 'add' };
}

export async function writeSettings(notion, codeId, data) {
  return notion.patch(`/v1/blocks/${codeId}`, { code: { language: 'json', rich_text: chunks(JSON.stringify(data, null, 1)) } });
}

const same = (a, b) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
const SEEN_EVERY = 6 * 3600_000;

// Logika po stronie serwera. getCtx() → { notion, config, rootUrl, now }.
export function createSync(getCtx, persist) {
  let cache = null; // { at, found }
  async function load(force) {
    const { notion, config, rootUrl, now } = getCtx();
    if (!force && cache && now() - cache.at < 10_000) return cache.found;
    const found = await findSettings(notion, rootIdOf(config, rootUrl), config.settingsBlock);
    if (found?.codeId && (config.settingsBlock?.codeId !== found.codeId || config.settingsBlock?.toggleId !== found.toggleId)) {
      config.settingsBlock = { toggleId: found.toggleId, codeId: found.codeId };
      persist?.();
    }
    cache = { at: now(), found };
    return found;
  }
  const deviceEntry = (config, now) => ({ name: config.deviceName || 'device', lastSeen: new Date(now()).toISOString() });

  async function pull({ force = false } = {}) {
    const { notion, config, now } = getCtx();
    const base = { enabled: config.syncEnabled !== false, deviceId: config.deviceId, deviceName: config.deviceName };
    if (config.syncEnabled === false) return { ...base, remote: null };
    let found;
    try { found = await load(force); } catch (e) { return { ...base, remote: null, error: e.message }; }
    if (!found?.codeId) return { ...base, remote: null, error: 'no-block' };
    const d = found.data;
    // „ostatnio widziane” najwyżej co 6 h na urządzenie: jedyny zapis przy odczycie, nie tworzy pętli między dashboardami
    const me = d.devices[config.deviceId];
    if (!me || now() - Date.parse(me.lastSeen || 0) > SEEN_EVERY || me.name !== config.deviceName) {
      try {
        const fresh = await load(true); // świeży odczyt, żeby nie nadpisać ustawień zapisanych przed chwilą na innym urządzeniu
        fresh.data.devices[config.deviceId] = deviceEntry(config, now);
        await writeSettings(notion, fresh.codeId, fresh.data);
        found = fresh;
      } catch { /* następnym razem */ }
    }
    const d2 = found.data;
    if (d2 !== d) return { ...base, remote: d2.updatedAt ? { settings: d2.settings, updatedAt: d2.updatedAt, deviceId: d2.deviceId } : null };
    return { ...base, remote: d.updatedAt ? { settings: d.settings, updatedAt: d.updatedAt, deviceId: d.deviceId } : null };
  }

  async function push(settings, updatedAt) {
    const { notion, config, now } = getCtx();
    if (config.syncEnabled === false) return { ok: true, written: false, reason: 'disabled' };
    const ts = Date.parse(updatedAt);
    if (!Number.isFinite(ts)) throw Object.assign(new Error('updatedAt'), { status: 400 });
    const found = await load(true);
    if (!found?.codeId) return { ok: true, written: false, reason: 'no-block' };
    const d = found.data;
    const clean = sanitizeSettings(settings || {});
    if (d.updatedAt && Date.parse(d.updatedAt) >= ts) return { ok: true, written: false, reason: 'older', remoteUpdatedAt: d.updatedAt };
    if (same(d.settings, clean)) return { ok: true, written: false, reason: 'same', remoteUpdatedAt: d.updatedAt };
    Object.assign(d, { settings: clean, updatedAt: new Date(Math.min(ts, now() + 60_000)).toISOString(), deviceId: config.deviceId });
    d.devices[config.deviceId] = deviceEntry(config, now);
    await writeSettings(notion, found.codeId, d);
    cache = { at: now(), found };
    persist?.();
    return { ok: true, written: true, remoteUpdatedAt: d.updatedAt };
  }

  async function devices() {
    const { config } = getCtx();
    const found = await load(true).catch(() => null); // lista otwierana rzadko (Ustawienia): zawsze świeża
    const list = Object.entries(found?.data?.devices || {}).map(([id, v]) => ({ id, name: v.name, lastSeen: v.lastSeen, current: id === config.deviceId }));
    if (!list.some((x) => x.current)) list.push({ id: config.deviceId, name: config.deviceName, lastSeen: null, current: true });
    list.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
    return { current: config.deviceId, devices: list, block: !!found?.codeId };
  }

  async function rename(id, name) {
    const { notion, config, now } = getCtx();
    if (id === config.deviceId) { config.deviceName = name; persist?.(); }
    const found = await load(true);
    if (!found?.codeId) return { ok: true, written: false };
    if (!found.data.devices[id]) found.data.devices[id] = deviceEntry(config, now);
    found.data.devices[id].name = name;
    await writeSettings(notion, found.codeId, found.data);
    return { ok: true, written: true };
  }

  return { pull, push, devices, rename, invalidate: () => { cache = null; } };
}
