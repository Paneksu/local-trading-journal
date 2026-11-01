// backtest-N1: pierwsze kroki, puste stany i instalator (pakiet N1, 1.6.0). Specyfikacja: backtest-wyniki/N-pierwsze-kroki-ustawienia.md §4.5, §6.
// [U] 31.10.2026 «oraz zaktualizuj wyglad pierwszych krokow w journalu [...] po prostu rzeczy ktore dla osoby bez ai beda ciezkie do polaczenia»
// Atrapa Notion (ATRAPA_DEMO=3), katalog konfiguracji bez świec i bez klucza Databento. Port 4321 nietykalny: testy używają 487x.
import path from 'node:path';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  let run = null;
  function pageResult() {
    run ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const A = await H.atrapa(4873, { ATRAPA_DEMO: '3' });
      const S = await H.server(4874, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: H.tmp(), NOTION_TOKEN: 'x', ...H.IDS });
      try {
        const txt = await P.cdpPage(`${S.base}/`, { width: 1920, height: 1080, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-N1.js') });
        return JSON.parse(txt);
      } finally { S.stop(); A.stop(); }
    })();
    return run;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
  }

  test('backtest-N1: Dashboard.vbs i start.sh: zajęty port to komunikat, nie przeglądarka na cudzym serwerze', () => {
    const vbs = src('Dashboard.vbs'), sh = src('start.sh');
    // VBS: przeglądarka otwiera się tylko po odpowiedzi /api/ping z trading-hq; inny program na porcie = komunikat
    assert.match(vbs, /\/api\/ping/); assert.match(vbs, /trading-hq/);
    assert.match(vbs, /zajmuje inny program/, 'komunikat po polsku');
    assert.match(vbs, /another program/i, 'komunikat po angielsku');
    assert.match(vbs, /dashboard\.log/, 'gdy serwer nie wstał: odesłanie do logu');
    const openLine = vbs.split(/\r?\n/).findIndex((l) => /^\s*sh\.Run url/.test(l));
    assert.ok(openLine > 0, 'otwarcie przeglądarki jest w skrypcie');
    const before = vbs.split(/\r?\n/).slice(0, openLine).join('\n');
    assert.match(before, /If\s+[^\n]*<>\s*1[^\n]*Then[\s\S]*WScript\.Quit/i, 'przed otwarciem przeglądarki: koniec, gdy na porcie nie ma dashboardu');
    // start.sh: ten sam podział (2 = inny program, 1 = nic), bez open_url w tych gałęziach
    assert.match(sh, /zajmuje inny program/); assert.match(sh, /another program/i);
    assert.match(sh, /app===?'trading-hq'/);
    assert.ok(!/if alive; then open_url/.test(sh), 'start.sh nie otwiera adresu bez sprawdzenia, czyj jest serwer');
  });

  test('backtest-N1: serwer przy zajętym porcie odróżnia drugi dashboard od innego programu', async () => {
    // inny program na porcie: serwer kończy się kodem 1 i mówi to wprost
    const foreign = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('inny serwer'); });
    await new Promise((r) => foreign.listen(4871, '127.0.0.1', r));
    try {
      const r = await H.run(path.join(ROOT, 'server.mjs'), [], H.cleanEnv({ PORT: '4871', THQ_CONFIG_DIR: H.tmp() }));
      assert.equal(r.code, 1, r.out + r.err);
      assert.match(r.out + r.err, /another program|inny program/i);
    } finally { foreign.close(); }
    // drugi start obok działającego dashboardu: jak dotąd kod 0 („już działa”)
    const S = await H.server(4872, { THQ_CONFIG_DIR: H.tmp() });
    try {
      const r = await H.run(path.join(ROOT, 'server.mjs'), [], H.cleanEnv({ PORT: '4872', THQ_CONFIG_DIR: H.tmp() }));
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /already running/i);
    } finally { S.stop(); }
  });

  test('backtest-N1: baner DEMO nad Statystykami; „Usuń dane DEMO” z potwierdzeniem przenosi wpisy do kosza i chowa baner', () => tagged('demo', 6));
  test('backtest-N1: wykres bez klucza: „Połącz Databento” otwiera Ustawienia → Źródła danych (głęboki link), Esc czyści adres', () => tagged('wykres', 5));
  test('backtest-N1: adres #ustawienia/zrodla/databento otwiera Ustawienia przy kluczu Databento', () => tagged('link', 1));
  test('backtest-N1: Backtest bez świec: lista i kreator mówią, skąd wziąć świece, z linkiem do Źródeł danych', () => tagged('backtest', 5));

  test('backtest-N1: przewodnik: krok „Ustawienia” opisuje nowe sekcje (źródła danych, dane na dysku, diagnostyka), tekst bez długich pauz, EN w słowniku', () => {
    const g = src('public/js/przewodnik.js');
    const step = g.slice(g.indexOf("{ title: 'Ustawienia'"), g.indexOf("{ title: 'Gotowe."));
    assert.ok(step.length > 40, 'krok Ustawienia istnieje');
    assert.ok(!/margines BE, paleta kolorów, język i aktualizacje/.test(step), 'stary opis usunięty');
    for (const w of [/[Źź]ródła danych/, /[Dd]ane na dysku/, /[Dd]iagnostyk/]) assert.match(step, w);
    assert.ok(!/[—–]/.test(step.replace(/\d–\d/g, '')), 'bez długich pauz');
    const en = JSON.parse(src('public/i18n/en.json'));
    const text = step.match(/text: '((?:\\'|[^'])*)'/)[1].replace(/\\'/g, "'");
    assert.ok(text in en, 'tłumaczenie EN kroku');
  });
};
