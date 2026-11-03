// backtest-odbior-pomocnicze: odbiór 1.7.0, runda 4 (P2-1 przeglądu kodu): pomocniki testów (H.atrapa, H.atrapaDb, H.server, H.waitHttp) nie rozmawiają z cudzym procesem.
// Tło: pełny przebieg padał, bo port 4610 zajmował obcy serwer odpowiadający 404 na każdą ścieżkę, a waitHttp uznawał każdą odpowiedź poniżej 500 za gotowość atrapy.
// Pokrycie: zajęty port jest pomijany (następny wolny) albo kończy się jasnym błędem; gotowość wymaga znacznika własnego procesu i żywego procesu potomnego.
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

export default ({ test, H, assert }) => {
  // cudzy serwer jak ten z incydentu: słucha na 0.0.0.0, na każdą ścieżkę 404, liczy żądania
  const foreign = (port) => new Promise((ok, fail) => {
    const hits = { n: 0 };
    const srv = http.createServer((req, res) => { hits.n++; res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 — nie znaleziono'); });
    srv.once('error', fail);
    srv.listen(port, '0.0.0.0', () => ok({ hits, close: () => new Promise((r) => srv.close(r)) }));
  });
  const freeBase = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

  test('backtest-odbior-pomocnicze: atrapa Notion, atrapa Databento i serwer na zajętym porcie biorą następny wolny i nigdy nie rozmawiają z cudzym serwerem', async () => {
    const port = await freeBase();
    const F = await foreign(port);
    let A, D, S;
    try {
      assert.equal(await H.portBusy(port), true, 'cudzy serwer widoczny jako zajęty port');
      A = await H.atrapa(port);
      assert.notEqual(A.port, port, 'atrapa omija zajęty port');
      const log = await A.get('/__test/log');
      assert.ok(Array.isArray(log), 'odpowiada własna atrapa (lista zdarzeń), nie cudze 404');
      D = await H.atrapaDb(port);
      assert.ok(D.port !== port && D.port !== A.port, 'atrapa Databento też bierze inny port');
      assert.ok(await D.log() != null, "odpowiada własna atrapa Databento");
      S = await H.server(port, { THQ_CONFIG_DIR: H.tmp() });
      assert.ok(S.port !== port && S.port !== A.port && S.port !== D.port, 'serwer też');
      const ping = await (await fetch(`${S.base}/api/ping`)).json();
      assert.equal(ping.app, 'trading-hq');
      assert.equal(F.hits.n, 0, 'cudzy serwer nie dostał ani jednego żądania');
    } finally { A?.stop(); D?.stop(); S?.stop(); await F.close(); }
  });

  test('backtest-odbior-pomocnicze: waitHttp odrzuca cudzy serwer bez znacznika i proces, który padł; przyjmuje tylko własny', async () => {
    const port = await freeBase();
    const F = await foreign(port);
    try {
      const url = `http://127.0.0.1:${port}/__test/log`;
      const read = (r) => r.headers.get('x-test-nonce');
      // proces potomny, który od razu pada (jak atrapa, której port zajął ktoś inny): jasny błąd z jego wyjścia, a nie „gotowe”
      const dead = H.start(process.execPath, ['-e', "console.error('EADDRINUSE'); process.exit(1)"], H.cleanEnv());
      await assert.rejects(() => H.waitHttp(url, 5000, { proc: dead, nonce: 'abc', read }), /obcy proces|zakończył się|EADDRINUSE/);
      // proces żyje, ale odpowiada cudzy serwer bez znacznika: też odmowa (po krótkim czasie), nigdy „gotowe”
      const alive = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore', windowsHide: true });
      alive.err = ''; alive.exited = false; alive.on('exit', () => { alive.exited = true; });
      try { await assert.rejects(() => H.waitHttp(url, 1500, { proc: alive, nonce: 'abc', read }), /obcy proces|Nie odpowiada/); } finally { alive.kill(); }
      // własny serwer ze znacznikiem: gotowe
      const own = http.createServer((req, res) => { res.writeHead(200, { 'X-Test-Nonce': 'abc' }); res.end('[]'); });
      const op = await freeBase();
      await new Promise((ok) => own.listen(op, '127.0.0.1', ok));
      try { assert.equal(await H.waitHttp(`http://127.0.0.1:${op}/__test/log`, 3000, { nonce: 'abc', read }), true); } finally { own.close(); }
    } finally { await F.close(); }
  });

  test('backtest-odbior-pomocnicze: własny proces po kill() jest dokańczany przed sprawdzeniem portu: ponowny start na tym samym porcie dostaje ten port, bez ostrzeżenia o obcym procesie', async () => {
    const port = await freeBase();
    const A = await H.atrapa(port);
    assert.equal(A.port, port);
    A.stop();
    // od razu na tym samym porcie (jak testy, które zatrzymują i uruchamiają serwer): port wolny po zakończeniu własnego procesu, bez przesunięcia na inny
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a.join(' ')); };
    let B;
    try { B = await H.atrapa(port); } finally { console.warn = orig; B?.stop(); }
    assert.equal(B.port, port, 'ten sam port po zakończeniu własnego procesu');
    assert.deepEqual(warns, [], 'bez ostrzeżenia o obcym procesie');
  });
};
