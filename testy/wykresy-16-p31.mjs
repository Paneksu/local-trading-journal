// wykresy-16: P31 (28.10.2026). Słowa użytkownika: «dla miniatur poprawka, jest taka ze jak trade jest krotki to powinno byc mniej swiec z boku,
// rysunek pozycji na wykresie powinien zawsze zajmowac okolo 80-90% niezaleznie od jego szerokosci». Test sprawdza zachowanie: położenie linii wejścia
// i wyjścia w narysowanym SVG miniatury dla trade'ów od jednej świecy do kilku godzin (świece jak z serwera: zakres z miniPlan).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export default ({ test, assert, ROOT }) => {
  const lib = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
  const E = Date.UTC(2026, 9, 26, 13, 50) / 1000;
  const W = 96;
  const barsFor = (P, plan) => { const s = P.tfSec(plan.tf); const out = []; for (let t = plan.from; t < plan.to; t += s) { const i = (t - E) / s; out.push([t, 5000 + i * 0.25, 5001 + i * 0.25, 4999.5 + i * 0.25, 5000.5 + i * 0.25, 5]); } return out; };
  const xOf = (svg, cls) => Number(new RegExp(`class="lvl-t ${cls}" x1="(-?[0-9.]+)"`).exec(svg)?.[1]);
  async function frame(spanSec) {
    const P = await lib('public/js/podglad.js');
    const plan = P.miniPlan(E, E + spanSec);
    const trade = { at: E * 1000, exitAt: (E + spanSec) * 1000, instrument: 'ES', entryPrice: 5000, exitPrice: 5001, sl: 4999, tp: 5002, be: null };
    const svg = P.miniSvg(trade, { tf: plan.tf, bars: barsFor(P, plan) }, { w: W, h: 30 });
    return { svg, tf: plan.tf, a: xOf(svg, 'entry'), b: xOf(svg, 'exit') };
  }

  test('wykresy-16: P31 pozycja zajmuje 80-90% szerokości miniatury niezależnie od długości trade\'a (5 min, 13 min, 100 min, 3 h, 2 dni)', async () => {
    for (const [name, span] of [['5 min', 300], ['13 min (wzór P29)', 13 * 60], ['100 min', 6000], ['3 h', 3 * 3600], ['2 dni', 2 * 86400]]) {
      const f = await frame(span);
      const share = (f.b - f.a) / W;
      assert.ok(share >= 0.8 && share <= 0.9, `${name} na ${f.tf}: pozycja ${(share * 100).toFixed(1)}% szerokości (wejście x=${f.a}, wyjście x=${f.b})`);
      assert.ok(f.a > 0 && f.b < W, `${name}: wejście i wyjście w kadrze`);
    }
  });

  test('wykresy-16: P31 krótki trade ma mniej świec z boku niż stałe 3 (margines proporcjonalny): lewy margines 5 min ≈ 0,4 świecy, nie 3', async () => {
    const f = await frame(300);
    const bar = (W - 2) / (300 / 60 + 2 * 300 / 60 * (1 / 0.85 - 1) / 2 + 0); // szerokość świecy 1m w tym kadrze
    const marginBars = (f.a - 1) / bar;
    assert.ok(marginBars < 1, `margines po lewej ${marginBars.toFixed(2)} świecy`);
  });

  test('wykresy-16: P31 trade w jednej świecy stoi pośrodku (nie przy prawej krawędzi), trade bez wyjścia ma kadr jak dotąd, podgląd w lightboxie nie używa kadru miniatury', async () => {
    const P = await lib('public/js/podglad.js');
    const one = await frame(20);
    const mid = (one.a + one.b) / 2;
    assert.ok(Math.abs(mid - W / 2) <= 2, `środek pozycji ${mid} vs ${W / 2}`);
    const plan = P.miniPlan(E, null);
    assert.deepEqual(plan, { tf: '1m', from: E - 180, to: E + 12 * 60 + 240 }, 'bez wyjścia: plan jak w P29');
    const trade = { at: E * 1000, exitAt: null, instrument: 'ES', entryPrice: 5000, sl: 4999, tp: 5002 };
    const svg = P.miniSvg(trade, { tf: '1m', bars: barsFor(P, plan) }, { w: W, h: 30 });
    assert.ok(svg && Math.abs(xOf(svg, 'entry') - (1 + (94 / 19) * 3.5)) < 1.5, 'bez wyjścia: wejście po 3 świecach z 19 (kadr jak w P29)');
    const src = readFileSync(path.join(ROOT, 'public/js/podglad.js'), 'utf8');
    const outside = src.slice(0, src.indexOf('// ---- miniatury')) + src.slice(src.indexOf('// ---- koniec miniatur'));
    assert.doesNotMatch(outside, /miniWindow|MINI_POS/, 'kadr miniatury tylko w sekcji miniatur, nie w podglądzie');
  });
};
