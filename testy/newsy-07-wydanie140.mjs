// newsy-07: dokumentacja i wydanie 1.4.0 (pakiet E, 30.10.2026). CHANGELOG ma wpis 1.4.0 w PL i EN, pierwszy wpis zgadza się z package.json (od 1.4.1 nie musi to być 1.4.0),
// README PL i EN mają sekcję o newsach makro i kalendarzu z kluczami, atrybucją FRED, brakiem powiązania z ForexFactory i znanym ograniczeniem 1.3.0,
// a „Bezpieczeństwo i połączenia sieciowe” wymienia nowe hosty. Dokumentacja bez długich pauz (—).
import path from 'node:path';
import { readFileSync } from 'node:fs';

const FRED_NOTE = 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.';
const HOSTS = ['api.stlouisfed.org', 'nfs.faireconomy.media', 'www.federalreserve.gov', 'finnhub.io'];

export default ({ test, assert, ROOT }) => {
  const read = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  const sec = (s, h) => { const i = s.indexOf(h); assert.ok(i >= 0, `brak sekcji ${h}`); const j = s.indexOf('\n## ', i + 3); return s.slice(i, j < 0 ? undefined : j); };
  const entry140 = () => { const c = read('CHANGELOG.md'); const i = c.indexOf('## [1.4.0]'); return c.slice(i, c.indexOf('\n## [', i + 5)); };

  test('newsy-07: CHANGELOG ma wpis [1.4.0] · 2026-10-30 z PL i EN, a pierwszy wpis ma wersję z package.json', () => {
    const c = read('CHANGELOG.md');
    const first = /^## \[([^\]]+)\] · (\S+)$/m.exec(c);
    assert.match(c, /^## \[1\.4\.0\] · 2026-10-30$/m);
    assert.equal(JSON.parse(read('package.json')).version, first[1]);
    const body = entry140();
    assert.match(body, /\n### PL\n/);
    assert.match(body, /\n### EN\n/);
  });

  test('newsy-07: wpis 1.4.0 wymienia nowe hosty, atrybucję FRED, znane ograniczenie 1.3.0 i nie ma długich pauz', () => {
    const body = entry140();
    for (const h of HOSTS) assert.ok(body.includes('`' + h + '`'), h);
    assert.ok(body.includes(FRED_NOTE));
    assert.match(body, /Zaktualizuj wszystkie urządzenia do 1\.4\.0/);
    assert.match(body, /Update all devices to 1\.4\.0/);
    assert.ok(!body.includes('—'), 'długa pauza w CHANGELOG 1.4.0');
  });

  test('newsy-07: README PL i EN mają sekcję o newsach i kalendarzu (klucze, atrybucja, ForexFactory) i nowe hosty w sekcji bezpieczeństwa', () => {
    const p = read('README.md'), e = read('README.en.md');
    const sp = sec(p, '## Newsy makro i kalendarz'), se = sec(e, '## Macro news and calendar');
    for (const s of [sp, se]) {
      assert.match(s, /FRED_API_KEY/);
      assert.match(s, /FINNHUB_API_KEY/);
      assert.ok(s.includes(FRED_NOTE));
      assert.match(s, /ForexFactory \(Fair Economy\)/);
      assert.match(s, /1\.3\.0/);
    }
    assert.match(p, /\[Newsy makro i kalendarz\]\(#newsy-makro-i-kalendarz\)/);
    assert.match(e, /\[Macro news and calendar\]\(#macro-news-and-calendar\)/);
    const bp = sec(p, '## Bezpieczeństwo i połączenia sieciowe'), be = sec(e, '## Security and network connections');
    for (const h of HOSTS) { assert.ok(bp.includes(h), 'PL ' + h); assert.ok(be.includes(h), 'EN ' + h); }
  });
};
