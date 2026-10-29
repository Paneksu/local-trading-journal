// wykresy-32: dokumentacja i wydanie 1.3.0 (etap 12, pakiet G, 29.10.2026). README PL i EN opisują moduł wykresów (połączenie z Databento,
// film tła, licencja danych), CHANGELOG ma wpis 1.3.0 w PL i EN, package.json ma wersję 1.3.0, a słownik EN obejmuje wszystkie klucze PL.
import path from 'node:path';
import { readFileSync } from 'node:fs';

export default ({ test, assert, ROOT }) => {
  const read = (f) => readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  const pl = () => read('README.md'), en = () => read('README.en.md');

  test('wykresy-32: i18n: każdy klucz pl.json ma tłumaczenie w en.json tego samego rodzaju (tekst albo formy liczby mnogiej)', () => {
    const P = JSON.parse(read('public/i18n/pl.json')), E = JSON.parse(read('public/i18n/en.json'));
    const missing = Object.keys(P).filter((k) => !k.startsWith('$') && !(k in E));
    assert.deepEqual(missing, [], 'klucze PL bez EN');
    const kind = Object.keys(P).filter((k) => !k.startsWith('$') && typeof P[k] !== typeof E[k]);
    assert.deepEqual(kind, [], 'liczba mnoga w PL, a zwykły tekst w EN (albo odwrotnie)');
    const empty = Object.entries(E).filter(([k, v]) => !k.startsWith('$') && (typeof v === 'string' ? !v.trim() : !v || !Object.values(v).every((x) => typeof x === 'string' && x.trim())));
    assert.deepEqual(empty.map(([k]) => k), [], 'puste tłumaczenia EN');
  });

  test('wykresy-32: README PL i EN wymieniają hist.databento.com w „Bezpieczeństwo i połączenia sieciowe”', () => {
    const sec = (s, h) => { const i = s.indexOf(h); assert.ok(i >= 0, `brak sekcji ${h}`); const j = s.indexOf('\n## ', i + 3); return s.slice(i, j < 0 ? undefined : j); };
    assert.match(sec(pl(), '## Bezpieczeństwo i połączenia sieciowe'), /hist\.databento\.com/);
    assert.match(sec(en(), '## Security and network connections'), /hist\.databento\.com/);
  });

  test('wykresy-32: README PL i EN mają notkę o filmach tła (zostają lokalnie, prawa do filmu i muzyki) i o licencji danych CME', () => {
    const p = pl(), e = en();
    assert.match(p, /Film i zdjęcie tła zostają lokalnie/);
    assert.match(p, /Prawa do filmu i muzyki są po Twojej stronie/);
    assert.match(e, /background video and photo stay local/);
    assert.match(e, /Rights to the video and the music are yours/);
    assert.match(p, /tylko do własnego użytku w dzienniku, nie do redystrybucji/);
    assert.match(e, /for your own use in the journal only, not for redistribution/);
    for (const s of [p, e]) {
      assert.match(s, /TradingView Lightweight Charts™/);
      assert.match(s, /Apache-2\.0/);
      assert.match(s, /https:\/\/www\.tradingview\.com\//);
      assert.match(s, /`chart-data\/`/);
      assert.match(s, /narzedzia\/import-okien-1s\.mjs/);
      assert.match(s, /DATABENTO_API_KEY/);
    }
  });

  test('wykresy-32: CHANGELOG zaczyna się wpisem [1.3.0] · 2026-10-29 z PL i EN, a package.json ma tę samą wersję', () => {
    const c = read('CHANGELOG.md');
    const first = /^## \[([^\]]+)\] · (\S+)$/m.exec(c);
    assert.deepEqual([first[1], first[2]], ['1.3.0', '2026-10-29']);
    const body = c.slice(first.index, c.indexOf('\n## [', first.index + 5));
    assert.match(body, /\n### PL\n/);
    assert.match(body, /\n### EN\n/);
    assert.match(body, /hist\.databento\.com/);
    assert.equal(JSON.parse(read('package.json')).version, '1.3.0');
  });

  test('wykresy-32: dokumentacja 1.3.0 bez długich pauz (—)', () => {
    const c = read('CHANGELOG.md');
    const i = c.indexOf('## [1.3.0]');
    assert.ok(!c.slice(i, c.indexOf('\n## [', i + 5)).includes('—'), 'CHANGELOG 1.3.0');
    assert.ok(!pl().includes('—'), 'README.md');
    assert.ok(!en().includes('—'), 'README.en.md');
  });
};
