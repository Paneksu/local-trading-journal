#!/usr/bin/env node
// Instalator Local Trading Journal: tworzy w Notion gotowy obszar roboczy (strona główna, 4 bazy z relacjami, formułami
// i widokami, opcjonalnie wpisy DEMO) i zapisuje lokalną konfigurację (.env, config.local.json). Zero zależności.
// Installer: creates a ready Notion workspace (home page, 4 databases with relations, formulas and views, optional DEMO
// entries) and writes the local configuration (.env, config.local.json). No dependencies.
//
// Użycie / usage:
//   node setup.mjs                      interaktywnie / interactive
//   node setup.mjs --lang en --token ntn_... --parent <adres strony> --demo --yes
//   node setup.mjs --remove-demo        usuwa (do kosza Notion) tylko wpisy z prefiksem „DEMO · ”
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, platform } from 'node:process';
import { writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`Potrzebny jest Node.js 22 lub nowszy (masz ${process.versions.node}). Pobierz: https://nodejs.org\nNode.js 22 or newer is required (you have ${process.versions.node}). Download: https://nodejs.org`);
  process.exit(1);
}

const { CONFIG_DIR, loadEnv, envSettings, loadConfig, saveConfig, saveEnv, configExists } = await import('./lib/env.mjs');
const { createNotion } = await import('./lib/notion.mjs');
const { createWorkspace, removeDemo, pageIdFromUrl, DEMO_PREFIX } = await import('./lib/workspace.mjs');
const { loadSchemaFile, SCHEMA_VERSION } = await import('./lib/version.mjs');
const { writeShortcut } = await import('./lib/wizard.mjs');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const yes = flag('yes');
let lang = opt('lang') === 'en' ? 'en' : opt('lang') === 'pl' ? 'pl' : null;
const L = (pl, en) => (lang === 'en' ? en : pl);
const rl = stdin.isTTY || !yes ? createInterface({ input: stdin, output: stdout }) : null;
const ask = async (q, def = '') => {
  if (yes || !rl) return def;
  const a = (await rl.question(q)).trim();
  return a || def;
};
const bye = (code = 0) => { rl?.close(); process.exit(code); };
const line = () => console.log('─'.repeat(60));

function openUrl(url) {
  if (flag('no-open') || process.env.THQ_NO_OPEN) return;
  try {
    const p = platform === 'win32' ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
      : spawn(platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.on('error', () => {});
    p.unref();
  } catch { /* brak przeglądarki: adres jest wypisany wyżej */ }
}

// ---------- tryb: usuwanie wpisów DEMO ----------
if (flag('remove-demo')) {
  lang = lang || loadConfig().lang;
  const S = envSettings(loadEnv());
  if (!S.token || !S.sources.trades) { console.error(L('Brak konfiguracji (.env). Najpierw uruchom instalację.', 'No configuration (.env). Run the setup first.')); bye(1); }
  const notion = createNotion({ token: S.token, version: S.version, base: S.base });
  const plan = await removeDemo(notion, S.sources, { dryRun: true });
  if (!plan.n) { console.log(L(`Nie ma wpisów z prefiksem „${DEMO_PREFIX}”.`, `There are no entries starting with "${DEMO_PREFIX}".`)); bye(0); }
  console.log(L(`Wpisy DEMO do przeniesienia do kosza Notion (${plan.n}):`, `DEMO entries to move to the Notion trash (${plan.n}):`));
  for (const f of plan.found) console.log(`  · ${f.db}: ${f.title}`);
  const ok = yes || /^(t|tak|y|yes)$/i.test(await ask(L('Przenieść je do kosza? Inne wpisy zostają bez zmian. [t/N] ', 'Move them to the trash? Other entries stay untouched. [y/N] ')));
  if (!ok) { console.log(L('Nic nie zmieniono.', 'Nothing changed.')); bye(0); }
  const out = await removeDemo(notion, S.sources);
  console.log(L(`Przeniesiono do kosza: ${out.n}. W razie pomyłki przywrócisz je z kosza w Notion (30 dni).`, `Moved to trash: ${out.n}. You can restore them from the Notion trash (30 days).`));
  bye(0);
}

// ---------- instalacja ----------
// Instalacja odbywa się w przeglądarce (kreator „Pierwsze kroki”); terminal to ścieżka zapasowa: --cli albo flagi z wartościami.
if (!flag('cli') && !yes && !opt('token') && !opt('parent')) {
  console.log('Instalacja odbywa się w przeglądarce: Instaluj.cmd (Windows) albo ./install.sh, potem kreator na http://127.0.0.1:4321.');
  console.log('Setup runs in the browser: Instaluj.cmd (Windows) or ./install.sh, then the wizard at http://127.0.0.1:4321.');
  console.log('Tryb terminalowy / terminal mode: node setup.mjs --cli');
  bye(0);
}
line();
console.log('Local Trading Journal · setup');
line();
if (!lang) {
  const a = await ask('Język / Language: [1] Polski  [2] English  (1/2): ', '1');
  lang = a === '2' || /^en/i.test(a) ? 'en' : 'pl';
}
const env0 = loadEnv();
if ((configExists() && loadConfig().databases) || env0.DS_TRADES) {
  if (!flag('force')) {
    console.log(L(
      `Ta instalacja jest już skonfigurowana (${path.join(CONFIG_DIR, '.env')}).\nAktualizacja: Aktualizuj.cmd albo ./update.sh. Nowy, osobny obszar w Notion: node setup.mjs --force (stare bazy zostają bez zmian).`,
      `This installation is already configured (${path.join(CONFIG_DIR, '.env')}).\nTo update: Aktualizuj.cmd or ./update.sh. For a new, separate Notion workspace: node setup.mjs --force (old databases stay untouched).`,
    ));
    bye(0);
  }
}

console.log(L(`
KROK 1 z 3: integracja Notion (klucz dostępu)
  1. Otwórz https://www.notion.so/profile/integrations i kliknij „New integration”.
  2. Nazwa: np. „Trading Journal”, typ: Internal, wybierz swój obszar roboczy, zapisz.
  3. W „Capabilities” zostaw zaznaczone: Read content, Update content, Insert content.
  4. Skopiuj „Internal Integration Secret” (zaczyna się od ntn_).
  Klucz zostaje tylko na tym komputerze, w pliku .env.`, `
STEP 1 of 3: Notion integration (access key)
  1. Open https://www.notion.so/profile/integrations and click "New integration".
  2. Name: e.g. "Trading Journal", type: Internal, pick your workspace, save.
  3. Under "Capabilities" keep: Read content, Update content, Insert content.
  4. Copy the "Internal Integration Secret" (starts with ntn_).
  The key stays on this computer only, in the .env file.`));
let token = opt('token') || '';
const base = process.env.NOTION_API_BASE || 'https://api.notion.com';
const version = '2026-03-11';
let notion;
for (let tries = 0; ; tries++) {
  if (!token) token = await ask(L('\nWklej klucz integracji: ', '\nPaste the integration secret: '));
  notion = createNotion({ token, version, base });
  try { await notion.get('/v1/users/me'); break; } catch (e) {
    console.log(L(`Notion nie przyjął klucza: ${e.message}`, `Notion rejected the key: ${e.message}`));
    token = '';
    if (yes || tries >= 4) bye(1);
  }
}
console.log(L('Klucz działa.', 'The key works.'));

console.log(L(`
KROK 2 z 3: strona w Notion, w której powstanie dziennik
  1. Utwórz w Notion pustą stronę (np. „Trading”) albo wybierz istniejącą.
  2. Na tej stronie: menu „•••” w prawym górnym rogu → „Connections” → „Add connection” → wybierz swoją integrację.
  3. Skopiuj link do strony: „Share” → „Copy link” (albo adres z paska przeglądarki).
  Instalator utworzy w niej podstronę „Dziennik tradingowy” z czterema bazami. Niczego obok nie zmienia.`, `
STEP 2 of 3: the Notion page that will hold the journal
  1. Create an empty page in Notion (e.g. "Trading") or pick an existing one.
  2. On that page: the "•••" menu in the top right → "Connections" → "Add connection" → choose your integration.
  3. Copy the page link: "Share" → "Copy link" (or the address from the browser bar).
  The installer creates a "Trading Journal" sub-page with four databases inside it. Nothing else is changed.`));
let parentId = pageIdFromUrl(opt('parent') || '');
for (let tries = 0; ; tries++) {
  if (!parentId) parentId = pageIdFromUrl(await ask(L('\nWklej link do strony: ', '\nPaste the page link: ')));
  if (!parentId) { console.log(L('W tym linku nie ma identyfikatora strony (32 znaki 0-9a-f).', 'This link has no page ID (32 characters 0-9a-f).')); }
  else {
    try { await notion.get(`/v1/pages/${parentId}`); break; } catch (e) {
      console.log(e.status === 404
        ? L('Integracja nie widzi tej strony. Dodaj ją w „•••” → „Connections” na tej stronie i spróbuj jeszcze raz.', 'The integration cannot see this page. Add it under "•••" → "Connections" on that page and try again.')
        : e.message);
    }
  }
  parentId = null;
  if (yes || tries >= 4) bye(1);
}

console.log(L('\nKROK 3 z 3: przykładowe dane', '\nSTEP 3 of 3: sample data'));
let demo = flag('demo') ? true : flag('no-demo') ? false : null;
if (demo === null) demo = /^(t|tak|y|yes)$/i.test(await ask(L('Dodać kilka przykładowych wpisów z prefiksem „DEMO · ”? Usuniesz je potem poleceniem node setup.mjs --remove-demo. [t/N] ', 'Add a few sample entries prefixed "DEMO · "? Remove them later with node setup.mjs --remove-demo. [y/N] '), 'n'));

line();
console.log(L('Tworzę obszar roboczy w Notion…', 'Creating the Notion workspace…'));
const labels = { page: L('strona', 'page'), database: L('baza', 'database'), formula: L('formuła', 'formula'), view: L('widok', 'view'), demo: L('wpisy', 'entries') };
let result;
try {
  // postęp zapisywany w config.local.json: przerwaną instalację wznowi ponowne uruchomienie z tą samą stroną
  const pcfg = loadConfig();
  if (!pcfg.setupProgress || pcfg.setupProgress.parentPageId !== parentId || pcfg.setupProgress.lang !== lang) pcfg.setupProgress = {};
  result = await createWorkspace(notion, { schema: loadSchemaFile(), parentPageId: parentId, lang, demo, state: pcfg.setupProgress, save: () => saveConfig(pcfg), log: (k, s) => { if (s) console.log(`  + ${labels[k] || k}: ${s}`); } });
} catch (e) {
  console.error(L(`\nNie udało się dokończyć: ${e.message}\nTo, co już powstało w Notion, możesz usunąć ręcznie (podstrona „Dziennik tradingowy”) i uruchomić instalator ponownie.`, `\nCould not finish: ${e.message}\nYou can delete what was already created in Notion (the "Trading Journal" sub-page) and run the installer again.`));
  bye(1);
}

saveEnv({
  NOTION_TOKEN: token, NOTION_VERSION: version,
  DS_TRADES: result.dsIds.trades, DS_KONTA: result.dsIds.konta, DS_DZIENNIK: result.dsIds.dziennik, DS_FINANSE: result.dsIds.finanse,
  NOTION_ROOT_URL: result.rootUrl,
});
const cfg = loadConfig();
Object.assign(cfg, { schemaVersion: SCHEMA_VERSION, lang, updateCheck: cfg.updateCheck !== false, fields: result.fields, options: {}, databases: result.dbIds, views: result.views, rootPageId: result.rootPageId, onboarded: false });
delete cfg.legacy; delete cfg.setupProgress;
saveConfig(cfg);
// skrót do strony w Notion (plik lokalny, w .gitignore)
const shortcut = path.join(CONFIG_DIR, L('Otwórz journal w Notion.url', 'Open journal in Notion.url'));
writeFileSync(shortcut, `[InternetShortcut]\r\nURL=${result.rootUrl}\r\n`, 'utf8');

line();
console.log(L('Gotowe. Twój dziennik w Notion:', 'Done. Your journal in Notion:'));
console.log(`  ${result.rootUrl}`);
if (result.skippedViews.length) {
  console.log(L('\nTych widoków API Notion nie utworzyło (dodasz je ręcznie, patrz README → „Widoki ręcznie”):', '\nNotion API did not create these views (add them by hand, see README → "Views by hand"):'));
  for (const v of result.skippedViews) console.log(`  · ${v.name} (${v.type}): ${v.reason}`);
}
console.log(L('\nStart dashboardu:', '\nStart the dashboard:'));
console.log(platform === 'win32' ? L('  dwuklik na Dashboard.vbs (albo Dashboard.cmd z oknem konsoli)', '  double-click Dashboard.vbs (or Dashboard.cmd with a console window)') : '  ./start.sh');
console.log('  http://127.0.0.1:4321');
if (existsSync(shortcut)) console.log(L(`\nSkrót do Notion: ${path.basename(shortcut)}`, `\nNotion shortcut: ${path.basename(shortcut)}`));
openUrl(result.rootUrl);
bye(0);
