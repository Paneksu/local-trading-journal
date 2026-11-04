// wykresy-34: P57 (przegląd 4.11.2026), kontrolka minutówek ES i NQ w przeglądarce (Chrome/Edge headless, scenariusz testy/scen-p57.js) zamiast regexów na źródle.
// Atrapa Notion i Databento, katalog tymczasowy z dwiema warstwami 1m (NQ z ostatnich dni, ES sprzed lat), bez klucza Databento.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

export default ({ test, H, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  let cached = null;
  function pageResult() {
    cached ||= (async () => {
      const P = await lib('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const S0 = await lib('lib/candles-store.mjs');
      const dir = H.tmp();
      const base = path.join(dir, 'chart-data');
      const day = Math.floor(Date.now() / 86400000) * 86400;
      const bar = (t) => [[t, 500000, 500100, 499900, 500050, 10]];
      // NQ: dwa dni w ostatnich 10 dniach; ES: dwa dni z 2020 roku
      for (const k of [10, 11]) S0.writeRange('NQ', '1m', day - k * 86400 + 50400, day - k * 86400 + 50460, bar(day - k * 86400 + 50400), {}, { baseDir: base });
      for (const d of ['2020-03-10', '2020-03-11']) { const t = Date.parse(d + 'T14:00:00Z') / 1000; S0.writeRange('ES', '1m', t, t + 60, bar(t), {}, { baseDir: base }); }
      const A = await H.atrapa(5710);
      const D = await H.atrapaDb(5711);
      const S = await H.server(5712, { NOTION_API_BASE: A.base, DATABENTO_API_BASE: D.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
      try {
        const txt = await P.cdpPage(S.base + '/', { width: 1920, height: 1080, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: readFileSync(path.join(ROOT, 'testy', 'scen-p57.js'), 'utf8') });
        return JSON.parse(txt);
      } finally { S.stop(); A.stop(); D.stop(); }
    })();
    return cached;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, tag + ': strona wykonała sprawdzenia (' + mine.length + ')');
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], tag + ': nieudane sprawdzenia');
  }
  test('wykresy-34: P57 ekran: potwierdzenie kosztu minutówek bez POST przed potwierdzeniem, kwota do ok. 0,80 USD, zdanie o braku klucza', async () => { await tagged('start', 1); await tagged('potwierdzenie', 4); });
  test('wykresy-34: P57 ekran: Anuluj odznacza pole i oddaje fokus (1s i 1m) bez zapisu', async () => { await tagged('anuluj', 3); });
  test('wykresy-34: P57 ekran: Włącz zapisuje true bez mignięcia pola, meta i sources mają stan, wyłączenie zapisuje false', async () => { await tagged('wlacz', 5); await tagged('wylacz', 2); });
  test('wykresy-34: P57 ekran: ostrzeżenie o ponownym pobraniu przy usuwaniu warstwy 1m tylko dla danych z ostatnich 92 dni, zdanie „plików dni: N”', async () => { await tagged('dysk', 3); });
};
