// backtest-N2: szkielet pełnego widoku Ustawień (pakiet N2, 1.6.0). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.1–4.3, §6; lista pól przed/po: docs/plany/backtest/etap-N1-N2.md.
// [U] 31.10.2026 «modul ustawien zreworkuj na o wiele zrozumialszy i czyterlniejszy i dopracowny»
// Prawdziwy dashboard testowy z atrapą Notion (Chrome/Edge headless, scenariusz testy/scen-N2.js) w 1920 i 375 px; moduły sekcji ust-*.js; sanitizeSettings bez zmian.
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const MODS = ['ust-konto.js', 'ust-zrodla.js', 'ust-dysk.js', 'ust-wyglad.js', 'ust-wykresy.js', 'ust-backtest.js', 'ust-diag.js'];
  const runs = {};
  function pageResult(narrow) {
    runs[narrow] ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const A = await H.atrapa(narrow ? 4891 : 4889);
      const S = await H.server(narrow ? 4892 : 4890, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp(), NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
      try {
        const opt = narrow ? { width: 375, height: 812, mobile: true } : { width: 1920, height: 1080 };
        const txt = await P.cdpPage(`${S.base}/`, { ...opt, timeoutMs: 180_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-N2.js') });
        return JSON.parse(txt);
      } finally { S.stop(); A.stop(); }
    })();
    return runs[narrow];
  }
  async function tagged(tag, min, narrow = false) {
    const res = await pageResult(narrow);
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
  }

  test('backtest-N2: ustawienia.js to szkielet, sekcje w osobnych modułach ust-*.js (N3 i N4 pracują w osobnych plikach)', async () => {
    const u = src('public/js/ustawienia.js');
    for (const m of MODS) assert.ok(u.includes(`from './${m}'`), `ustawienia.js importuje ${m}`);
    const files = readdirSync(path.join(ROOT, 'public/js')).filter((f) => /^ust-.*\.js$/.test(f));
    // ust-strefa.js (odbiór 1.7.0) to podmoduł sekcji „Kopie i diagnostyka” (importuje go ust-diag.js), nie osobna sekcja
    assert.ok(src('public/js/ust-diag.js').includes("from './ust-strefa.js'"), 'ust-diag.js importuje ust-strefa.js');
    assert.deepEqual(files.filter((f) => f !== 'ust-wspolne.js' && f !== 'ust-strefa.js').sort(), [...MODS].sort());
    const U = await imp('public/js/ustawienia.js');
    assert.deepEqual(U.SECTIONS.map((s) => s.id), ['konto', 'zrodla', 'dysk', 'wyglad', 'wykresy', 'backtest', 'diag']);
    assert.equal(U.sectionOf('ogolne'), 'wyglad'); assert.equal(U.sectionOf('urzadzenia'), 'konto'); assert.equal(U.sectionOf('dane'), 'wyglad'); assert.equal(U.sectionOf('be'), 'wyglad');
    assert.equal(U.sectionOf('wykresy'), 'wykresy'); assert.equal(U.sectionOf('backtest'), 'backtest'); assert.equal(U.sectionOf('../x'), null);
    // sekrety tylko w Konto i Źródła danych (§4.2): pola haseł i zapis kluczy nie trafiają do innych modułów
    for (const m of MODS) {
      const s = src(`public/js/${m}`);
      const secret = /type="password"|onDatabentoKey|onNewsKey|newsSettingsHtml|earnSettingsHtml/.test(s);
      assert.equal(secret, m === 'ust-zrodla.js', `${m}: sekrety ${secret ? 'są' : 'nie ma'}`);
    }
  });

  test('backtest-N2: i18n: każdy tekst L(…) i t(…) w ustawienia.js i ust-*.js ma tłumaczenie EN', () => {
    const en = JSON.parse(src('public/i18n/en.json'));
    const missing = [];
    for (const f of ['ustawienia.js', 'ust-wspolne.js', ...MODS]) {
      const s = src(`public/js/${f}`);
      for (const m of s.matchAll(/\b(?:L|t|t\.p)\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) { const k = m[2].replace(/\\(['"\\])/g, '$1'); if (!(k in en)) missing.push(`${f}: ${k}`); }
      for (const m of s.matchAll(/\b(?:gHead|chk|kv|docLink|pathRow)\(\s*[^,()]*,\s*(?:[^,()]*,\s*)?'([^']+)'/g)) if (!(m[1] in en) && !/^(sv-|ch-g|grid|entry|exit|sl|tp|sessions|pdhl|shareChart|equity|filmBw)/.test(m[1])) missing.push(`${f}: ${m[1]}`);
    }
    for (const s of (src('public/js/ustawienia.js').match(/(?:label|short|desc): '([^']+)'/g) || [])) { const k = s.replace(/^(?:label|short|desc): '/, '').slice(0, -1); if (!(k in en)) missing.push(`SECTIONS: ${k}`); }
    // N3: lista „co leży w folderze” zastąpiona tabelą świec; nazwy warstw (ROW_LABEL) przez L(…)
    const rl = /ROW_LABEL = \{([^}]+)\}/.exec(src('public/js/ust-dysk.js'))?.[1] || '';
    for (const m of rl.matchAll(/: '([^']+)'/g)) if (!(m[1] in en)) missing.push(`ust-dysk.js: ${m[1]}`);
    assert.deepEqual([...new Set(missing)], []);
  });

  test('backtest-N2: sanitizeSettings: każde pole ustawień synchronizowanych przechodzi bez zmian, sekrety, limity i kredyt odpadają', async () => {
    const { sanitizeSettings } = await imp('lib/sync.mjs');
    const { sanitizeChart } = await imp('public/js/styl-wykresu.js');
    const { sanitizeBt } = await imp('public/js/bt-czas.js');
    const { defaultCustom } = await imp('public/js/palety.js');
    const { sanitizeShare } = await imp('public/js/udostepnij.js');
    // te same klucze co collect() w app.js (blok ustawień w Notion)
    const collect = { palette: 'mono', custom: defaultCustom(), customSeeded: true, beR: 0.2, beUsd: 5, share: { ...sanitizeShare(), nick: 'n2' }, chartTz: 'Europe/Warsaw', chartBadj: false, chart: sanitizeChart({ style: 'line', grid: false }), theme: 'platinum', lang: 'en', updateCheck: false, bt: sanitizeBt({ speed: 300 }) };
    assert.match(src('public/js/app.js'), /collect: \(\) => \(\{ palette: settings\.palette, custom: settings\.custom, customSeeded: settings\.customSeeded, beR: settings\.beR, beUsd: settings\.beUsd, share: settings\.share, chartTz: settings\.chartTz, chartBadj: settings\.chartBadj, chart: settings\.chart, theme: getTheme\(\), lang: langOverride \|\| getLang\(\), updateCheck: meta\.updateCheck !== false, bt: settings\.bt \}\)/, 'collect() bez zmian');
    assert.deepEqual(sanitizeSettings(collect), JSON.parse(JSON.stringify(collect)), 'żadne pole nie odpada');
    const dirty = sanitizeSettings({ ...collect, databentoKey: 'x', apiKey: 'x', chartCostLimitUsd: 5, chartCredit: {}, token: 't', chart: { ...collect.chart, chartDailyLimitUsd: 9 } });
    for (const k of ['databentoKey', 'apiKey', 'chartCostLimitUsd', 'chartCredit', 'token']) assert.ok(!(k in dirty), k);
    assert.ok(!('chartDailyLimitUsd' in dirty.chart));
  });

  test('backtest-N2: pełny widok: 7 sekcji po lewej, pod paskiem, głębokie linki, ostatnia sekcja, stare zakładki jako aliasy, Esc czyści adres', () => tagged('nawigacja', 12));
  test('backtest-N2: każde pole popovera 1.5.0 istnieje i jest tylko w swojej sekcji (lista pól przed/po), 1920 bez poziomego przewijania', () => tagged('pola', 14));
  test('backtest-N2: pola zapisują się tak samo: localStorage, blok ustawień (POST /api/sync bez sekretów), config.local.json; zły klucz zostaje tylko w polu', () => tagged('zapis', 6));
  test('backtest-N2: Kopie i diagnostyka: stan połączeń, „Sprawdź wszystko”, serwer z wersją i adresem, restart i zatrzymanie zawsze widoczne i podpięte, log, „Otwórz folder”', () => tagged('diag', 11));
  test('backtest-N2: 375 px: lista sekcji z opisami, sekcja z „‹ Ustawienia”, bez poziomego przewijania w żadnej sekcji, głęboki link od razu w sekcji', () => tagged('mobile', 19, true));
};
