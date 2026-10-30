// backtest-C2 (poprawki po review): kursor w środku świecy, pozycja między dniami, zapisy, klawisz repeat, 409. Strona robocza testy/backtest-handel.html?part=poprawki.
// Dane wyłącznie syntetyczne, serwer testowy.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export default ({ test, H, assert, ROOT }) => {
  const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

  // ---- strona robocza testy/backtest-handel.html?part=poprawki: jeden przebieg, wynik dzielony przez testy ----
  let pageRun = null;
  async function pageResult() {
    pageRun ||= (async () => {
      const P = await imp('testy/przegladarka.mjs');
      if (!P.findBrowser()) return null;
      const { syntheticDay } = await imp('testy/bt-dane-syntetyczne.mjs');
      const dir = H.tmp();
      // dzień 13 przed 12: zapis dnia 13 nadpisuje 1m kontekstu, więc dzień 12 piszemy na końcu
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-13', seed: 8 });
      await syntheticDay(path.join(dir, 'chart-data'), { instrument: 'NQ', day: '2024-03-12', seed: 3 });
      const S = await H.server(4889, { THQ_TEST_PAGES: '1', THQ_CONFIG_DIR: dir });
      try {
        const txt = await P.cdpPage(`${S.base}/__testy/backtest-handel.html?part=poprawki`, { width: 1920, height: 1080, timeoutMs: 150_000 });
        return JSON.parse(txt);
      } finally { S.stop(); }
    })();
    return pageRun;
  }
  async function tagged(tag, min) {
    const res = await pageResult();
    if (!res) { console.log('  (pominięty: brak Chrome/Edge)'); return; }
    assert.ok(!res.fatal, res.fatal);
    const mine = res.checks.filter((c) => c.tag === tag);
    assert.ok(mine.length >= min, `${tag}: strona wykonała sprawdzenia (${mine.length})`);
    assert.deepEqual(mine.filter((c) => !c.ok).map((c) => c.msg), [], `${tag}: nieudane sprawdzenia`);
    assert.deepEqual(res.checks.filter((c) => c.tag === 'błąd strony').map((c) => c.msg), [], 'bez błędów strony');
    return res;
  }

  test('backtest-C2: MAE/MFE i wejście bez świecy w budowie (kursor w środku świecy)', () => tagged('wyrownanie', 3));
  test('backtest-C2: pozycja nie przechodzi na następny dzień', () => tagged('dzien', 4));
  test('backtest-C2: zamknięcie to jeden zapis, pagehide przy zapisie w toku', () => tagged('zapis', 4));
  test('backtest-C2: przytrzymany klawisz nie mnoży zleceń', () => tagged('powtorzenie', 3));
  test('backtest-C2: 409 zatrzymuje handel z komunikatem', () => tagged('stale', 2));
  test('backtest-C2: zapis sesji z ciałem null albo bez id to 400, nie 500', async () => {
    const S = await H.server(4890, { THQ_CONFIG_DIR: H.tmp() });
    try {
      for (const body of ['null', '[]', '{}', '{"id":"bt-abcdef","doc":null}']) {
        const r = await fetch(S.base + '/api/backtest/session/save', { method: 'POST', headers: { Origin: S.base, 'Content-Type': 'application/json', 'X-THQ': '1' }, body });
        assert.equal(r.status, 400, 'ciało ' + body + ' → ' + r.status);
      }
    } finally { S.stop(); }
  });
  test('backtest-C2: sanitizeBt odrzuca skróty zarezerwowane i zdublowane (synchronizacja)', async () => {
    const { sanitizeBt, btDefaults, collisions } = await imp('public/js/bt-czas.js');
    const d = btDefaults();
    const bt = sanitizeBt({ ...d, skroty: { ...d.skroty, play: 'Escape', buy: 'Q' }, jumps: [...d.jumps, { id: 'x1', name: 'a', cel: { kind: 'offset', sec: 60 }, skrot: 'Q' }, { id: 'x2', name: 'b', cel: { kind: 'offset', sec: 60 }, skrot: 'ArrowLeft' }] });
    assert.deepEqual(collisions(bt.skroty, bt.jumps), [], 'po sanitizeBt brak kolizji');
    assert.equal(bt.skroty.play, '', 'Escape (zarezerwowany) wyczyszczony');
    assert.equal(bt.skroty.buy, 'Q', 'pierwszy z dwóch równych zostaje');
    assert.equal(bt.jumps.find((j) => j.id === 'x1').skrot, '', 'drugi z dwóch równych wyczyszczony');
    assert.equal(bt.jumps.find((j) => j.id === 'x2').skrot, '');
  });
};
