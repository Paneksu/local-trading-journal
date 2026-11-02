// kreator-ladowanie (1.6.1): stan ładowania przycisków kreatora pierwszych kroków. [U] 1.11.2026 «podczas klikania polacz istniejacy dziennik lub dalej w tym kroku dodaj cos w sylu ladowania»
// Przeglądarka (Chrome/Edge headless), żądania /api/setup/* to atrapy w stronie (testy/scen-kreator-ladowanie.js); prawdziwe Notion nie dostaje żądań.
import path from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const src = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  let run = null;
  const page = () => (run ||= (async () => {
    const P = await imp('testy/przegladarka.mjs');
    if (!P.findBrowser()) return null;
    const A = await H.atrapa(4966, { ATRAPA_DEMO: '3' });
    const dir = H.tmp();
    writeFileSync(path.join(dir, 'config.local.json'), JSON.stringify({ lang: 'pl', onboarded: true, defaultsUpgraded: '1.6.0' }));
    const S = await H.server(4967, { NOTION_API_BASE: A.base, THQ_CONFIG_DIR: dir, NOTION_TOKEN: 'secret_atrapa', ...H.IDS, NOTION_ROOT_URL: H.PARENT_URL });
    try {
      const txt = await P.cdpPage(S.base + '/', { width: 1920, height: 1080, timeoutMs: 120_000, until: "window.__thq && document.querySelector('#view .page-head')", extract: src('testy/scen-kreator-ladowanie.js') });
      return JSON.parse(txt);
    } finally { S.stop(); A.stop(); }
  })());
  async function tagged(tag, min) {
    const res = await page();
    if (!res) { const e = new Error('brak Chrome/Edge'); e.skipTest = true; throw e; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
  }
  test('kreator-ladowanie: „Połącz istniejący dziennik” od razu disabled + aria-busy + „Łączę z Notion…”, drugie kliknięcie bez drugiego żądania, po błędzie przycisk wraca', () => tagged('polacz', 7));
  test('kreator-ladowanie: „Utwórz dziennik” pokazuje „Zakładam dziennik…” z aria-busy, jedno żądanie, po błędzie wraca', () => tagged('utworz', 3));
  test('kreator-ladowanie: spinner ma regułę reduced-motion, a źródła używają stanu ładowania we wszystkich krokach z żądaniem', async () => {
    await tagged('styl', 1);
    const s = src('public/js/pierwsze-kroki.js');
    for (const re of [/ba\(kd\.busy\)/, /ba\(tok\.checking\)/, /ba\(cn\.busy\)/, /ba\(mk\.starting/, /ba\(running\)/, /ba\(s\.applying\)/, /ba\(open\.fix\?\.loading\)/]) assert.match(s, re);
    assert.match(src('public/js/ust-zrodla.js'), /aria-busy=\\"true\\"|aria-busy="true"/);
    const en = JSON.parse(src('public/i18n/en.json'));
    assert.ok(en['Zakładam dziennik…'] && en['Łączę z Notion…']);
  });
};
