# Local Trading Journal

[Polski](README.md) · **English**

A trading journal in Notion plus a local statistics dashboard that runs only on your computer. Log trades, prop accounts and expenses in Notion or in the dashboard; the dashboard calculates win rate, profit factor, drawdown, R distribution, entry time statistics and much more. No cloud accounts, no npm dependencies, no build step.

![Dashboard, Onyx theme](docs/img/dashboard-en-onyx.png)

| Platinum, Polish UI | Prop tab | Phone |
|---|---|---|
| ![Platinum](docs/img/dashboard-pl-platinum.png) | ![Prop](docs/img/prop-en-onyx.png) | ![Phone](docs/img/mobile-en-onyx.png) |

Screenshots come from the mock with sample data.

## Contents

- [What you get](#what-you-get)
- [Requirements](#requirements)
- [Installation step by step](#installation-step-by-step)
- [Getting started](#getting-started)
- [Step-by-step guide](#step-by-step-guide)
- [Running](#running)
- [Updating](#updating)
- [Backup and restore](#backup-and-restore)
- [How numbers are calculated](#how-numbers-are-calculated)
- [FAQ](#faq)
- [Security and network connections](#security-and-network-connections)
- [Prop firm logos](#prop-firm-logos)
- [Project files](#project-files)

## What you get

- **In Notion:** a "Trading Journal" page with four related databases: Trades, Accounts, Journal, Expenses and payouts. They come with properties, options, formulas (account balance, entry net) and views (Live, Backtest, Paper, screenshot gallery, calendars).
- **On your computer:** a dashboard at http://127.0.0.1:4321:
  - KPIs compared with the previous period, equity curve and drawdown chart, P&L calendar, day heatmap;
  - breakdowns: setup, instrument, session, weekday, direction, entry time (each trade at its minute), duration, nth trade of the day, R distribution;
  - Trades (sortable table), Prop (accounts, payouts, ROI, balance) and Gallery tabs;
  - add and edit trades, accounts and finance entries, saved straight to Notion;
  - Onyx and Platinum themes, data palettes (including colour-blind friendly), Polish and English;
  - an update module and "Getting started" (installation check and a guided tour).

## Requirements

- [Node.js](https://nodejs.org) **22 or newer**. The launch scripts check the version and tell you what to do.
- A Notion account (the free plan is enough).
- Optionally [git](https://git-scm.com) if you want to update with `git pull`.
- Windows, macOS or Linux.

## Installation step by step

### 1. Download the app

Pick one:
- **git (recommended):** `git clone https://github.com/Paneksu/local-trading-journal.git`
- **ZIP:** on the [Releases](https://github.com/Paneksu/local-trading-journal/releases) page download "Source code (zip)" of the latest release and unpack it anywhere.

### 2. Run the installer

- Windows: double-click **`Instaluj.cmd`**. Without Node.js the installer offers to install it with `winget` (type "y"). On the first run Windows may show a SmartScreen warning: "More info" → "Run anyway".
- macOS / Linux: in a terminal inside the app folder run `./install.sh` (or `sh install.sh`).

The installer creates a "Local Trading Journal" desktop shortcut, starts the dashboard in the background and opens the "Getting started" wizard in your browser. Then you do three things:

1. **Language** is detected from the browser; change it with one click. It sets the database and property names in Notion.
2. **Token:** the "Create the integration in Notion" button opens the integrations page. Create an Internal integration (copy the name with one click), copy the "Internal Integration Secret" and paste it into the wizard. The wizard checks it right away and stores it locally in `.env`.
3. **Access:** in Notion, on any page (e.g. an empty "Trading" page) choose "•••" → "Connections" → your integration. The wizard notices the page within seconds, no links to paste.

Then a single "Create the journal" button builds the home page, the four databases with relations, formulas and views and (by default) a few entries prefixed "DEMO · " so the charts have something to show. Progress is shown stage by stage; if something interrupts it, "Retry" continues where it stopped, without duplicates. Finally the wizard checks the whole installation and offers a short guided tour.

If the shared page already holds a journal (reinstall or a second computer), the wizard offers "Connect the existing journal" instead of creating a new one.

Every manual step in the wizard has a "Show step by step" link with illustrations (see [Step-by-step guide](#step-by-step-guide)).

Remove the DEMO entries with the button in "Getting started" or with `node setup.mjs --remove-demo` (asks for confirmation and moves only entries starting with "DEMO · " to the Notion trash).

**Terminal install (fallback):** `Instaluj.cmd --cli` or `./install.sh --cli` walks through the same steps in the console (pasting the page link). Unattended, e.g. for scripts: `node setup.mjs --lang en --token ntn_… --parent <page link> --demo --yes`.

### Alternative: duplicate the template

If you prefer clicking in Notion: open [the Notion template (EN)](https://abalone-tendency-4c7.notion.site/Local-Trading-Journal-template-EN-405afccce4f181d394ccf12f1c92abec) and choose "Duplicate". Then:
1. create the integration as in step 2 and add it to the duplicated page ("•••" → "Connections");
2. create a `.env` file in the app folder:
   ```
   NOTION_TOKEN=ntn_…
   DS_TRADES=…
   DS_KONTA=…
   DS_DZIENNIK=…
   DS_FINANSE=…
   NOTION_ROOT_URL=https://www.notion.so/…
   ```
   Copy each database's data source ID in Notion: the database "•••" menu → "Manage data sources" → "Copy data source ID". (`DS_KONTA` is Accounts, `DS_DZIENNIK` is Journal, `DS_FINANSE` is Expenses and payouts.)
3. start the dashboard. Properties are recognised by name (English or Polish) and remembered.

### Views by hand

The installer creates views through the Notion API. If Notion rejects one, the installer lists it at the end and "Getting started" shows it as a warning. Adding it takes three clicks: "+" next to the view names above the database → pick the type (Table, Gallery or Calendar) → name it. For the gallery set "Layout" → "Card preview: Screenshot", for the calendar "Show calendar by: Date", for Live / Backtest / Paper add a filter "Type is …".

## Getting started

On the first run the dashboard opens "Getting started". It is always available from Settings (the gear) and from "?" in the status bar.

- **Readiness:** a checklist: Node, Notion key, page access, the four databases with entry counts, property mapping, views, write permissions, server protection, updates and DEMO entries. Every problem comes with short fix instructions. "Fix everything" applies all safe repairs with one button (missing properties, options and views, re-mapping properties, the Notion shortcut) after showing what will be added. A bad token or missing access takes you to the right wizard step. A quick check runs in the background on every start; if something is wrong, "Needs attention" appears in the status bar. Checks only read; the write check sends a request that Notion rejects at validation, so nothing is created.
- **How the journal works:** a short guided tour of the real interface on sample data kept in browser memory. Nothing reaches Notion in this mode, and your data and filters come back when you leave.

![Getting started: readiness](docs/img/pierwsze-kroki-gotowosc.png)
![Getting started: tour](docs/img/pierwsze-kroki-przewodnik.png)

## Step-by-step guide

The wizard shows the same frames under "Show step by step". They are illustrations recreated from the real screens; the layout in Notion and in your system may differ slightly.

<details>
<summary><b>Installing Node.js on Windows</b></summary>

1. Right-click the Start button and choose Terminal.

   <img src="docs/img/poradnik/node-windows/01-en.webp" alt="The Start button context menu with Terminal highlighted." width="600">

2. Type winget install OpenJS.NodeJS.LTS and press Enter.

   <img src="docs/img/poradnik/node-windows/02-en.webp" alt="Terminal window with the command winget install OpenJS.NodeJS.LTS typed in." width="600">

3. Wait for the success message. If Windows asks for permission, click Yes.

   <img src="docs/img/poradnik/node-windows/03-en.webp" alt="Terminal showing the Node.js download and the success message." width="600">

4. Without the console: go to nodejs.org/en/download and download the Windows Installer (.msi), LTS version.

   <img src="docs/img/poradnik/node-windows/04-en.webp" alt="The nodejs.org download page with the Windows Installer (.msi) button." width="600">

5. Run the downloaded file and click Next, keeping the default settings. Click Finish at the end.

   <img src="docs/img/poradnik/node-windows/05-en.webp" alt="The first Node.js Setup window with the Next button." width="600">

6. Open a new Terminal and type node -v. Version 22 or higher is fine.

   <img src="docs/img/poradnik/node-windows/06-en.webp" alt="Terminal showing node -v returning version 24." width="600">

</details>

<details>
<summary><b>Installing Node.js on macOS</b></summary>

1. Go to nodejs.org/en/download and download the macOS Installer (.pkg), LTS version.

   <img src="docs/img/poradnik/node-macos/01-en.webp" alt="The nodejs.org download page with the macOS Installer (.pkg) button." width="600">

2. Open the downloaded .pkg file and click Continue, then Agree at the license step.

   <img src="docs/img/poradnik/node-macos/02-en.webp" alt="The macOS Node.js installer window with the Continue button." width="600">

3. When you see the success message, click Close.

   <img src="docs/img/poradnik/node-macos/03-en.webp" alt="macOS installer summary: the installation was completed successfully." width="600">

4. Using Homebrew? Instead of the installer, type brew install node in Terminal.

   <img src="docs/img/poradnik/node-macos/04-en.webp" alt="macOS Terminal with brew install node and its output." width="600">

5. Check the version with node -v. Version 22 or higher is fine.

   <img src="docs/img/poradnik/node-macos/05-en.webp" alt="macOS Terminal showing node -v returning version 24." width="600">

</details>

<details>
<summary><b>First run of Instaluj.cmd (SmartScreen)</b></summary>

1. Open the unpacked app folder and double-click Instaluj.cmd.

   <img src="docs/img/poradnik/smartscreen/01-en.webp" alt="File Explorer in the local-trading-journal folder with Instaluj.cmd selected." width="600">

2. If a blue Windows window appears, click More info.

   <img src="docs/img/poradnik/smartscreen/02-en.webp" alt="The Microsoft Defender SmartScreen window with the More info link." width="600">

3. Check that the app is Instaluj.cmd and click Run anyway.

   <img src="docs/img/poradnik/smartscreen/03-en.webp" alt="The expanded SmartScreen window showing Instaluj.cmd and the Run anyway button." width="600">

4. The installer window opens. Type 1 (Polish) or 2 (English) and press Enter.

   <img src="docs/img/poradnik/smartscreen/04-en.webp" alt="Black console window with the Local Trading Journal setup header and the language question." width="600">

</details>

<details>
<summary><b>Running install.sh on macOS and Linux</b></summary>

1. In Terminal, go to the app folder, make the script executable and run the installer.

   <img src="docs/img/poradnik/macos-open/01-en.webp" alt="Terminal with the cd, chmod +x install.sh and ./install.sh commands." width="600">

2. The installer starts in the same window. Type 1 (Polish) or 2 (English) and press Enter.

   <img src="docs/img/poradnik/macos-open/02-en.webp" alt="Terminal with the Local Trading Journal setup header and the language question." width="600">

3. Without typing commands: right-click install.sh, choose Open With and then Terminal.

   <img src="docs/img/poradnik/macos-open/03-en.webp" alt="Finder with the install.sh context menu and the Open With submenu, Terminal highlighted." width="600">

4. If macOS warns about an unidentified developer, click Open.

   <img src="docs/img/poradnik/macos-open/04-en.webp" alt="macOS warning about an unverified developer of install.sh with the Open button." width="600">

5. Newer macOS shows no Open button. Then in System Settings, under Privacy & Security, click Open Anyway.

   <img src="docs/img/poradnik/macos-open/05-en.webp" alt="System Settings, Privacy & Security, message that install.sh was blocked with the Open Anyway button." width="600">

</details>

<details>
<summary><b>Creating a Notion integration</b></summary>

1. Go to notion.so/profile/integrations and click New integration.

   <img src="docs/img/poradnik/notion-integracja/01-en.webp" alt="The Notion Integrations page with the New integration button." width="600">

2. Enter the name Local Trading Journal, pick your workspace and the Internal type, then click Save.

   <img src="docs/img/poradnik/notion-integracja/02-en.webp" alt="New integration form: name, workspace, Internal type and the Save button." width="600">

3. After saving, click Configure integration settings.

   <img src="docs/img/poradnik/notion-integracja/03-en.webp" alt="Confirmation that the integration was created, with the Configure integration settings button." width="600">

4. Under Capabilities keep Read content, Update content and Insert content checked, then click Save.

   <img src="docs/img/poradnik/notion-integracja/04-en.webp" alt="Integration settings: Read, Update and Insert content checked, and the Save button." width="600">

</details>

<details>
<summary><b>Copying the integration secret</b></summary>

1. In the integrations list, click Local Trading Journal.

   <img src="docs/img/poradnik/notion-token/01-en.webp" alt="The Notion integrations list with the Local Trading Journal card." width="600">

2. Next to Internal Integration Secret, click Copy. If you do not see it, click Show first.

   <img src="docs/img/poradnik/notion-token/02-en.webp" alt="The Internal Integration Secret field with a hidden key and the Copy button." width="600">

3. In the installer window, right-click or press Ctrl+V to paste the key, then press Enter.

   <img src="docs/img/poradnik/notion-token/03-en.webp" alt="Installer window with step 1 instructions and the prompt for the integration secret." width="600">

</details>

<details>
<summary><b>Sharing a page with the integration</b></summary>

1. Open an empty Notion page for the journal (e.g. Trading) and click ••• in the top right corner.

   <img src="docs/img/poradnik/notion-polaczenia/01-en.webp" alt="An empty Trading page in Notion with the three-dot button pointed out." width="600">

2. In the menu, hover over Connections.

   <img src="docs/img/poradnik/notion-polaczenia/02-en.webp" alt="The Notion page menu with Connections highlighted." width="600">

3. Type Local and choose Local Trading Journal from the list.

   <img src="docs/img/poradnik/notion-polaczenia/03-en.webp" alt="The Connections submenu with search and the Local Trading Journal integration." width="600">

4. Click Confirm. The integration gets access only to this page and its sub-pages.

   <img src="docs/img/poradnik/notion-polaczenia/04-en.webp" alt="Confirmation dialog for Local Trading Journal access to the Trading page." width="600">

5. Copy the page link: click Share, then Copy link.

   <img src="docs/img/poradnik/notion-polaczenia/05-en.webp" alt="The Notion Share panel with the Copy link button." width="600">

6. Paste the link into the installer window and press Enter. The installer creates the journal inside that page.

   <img src="docs/img/poradnik/notion-polaczenia/06-en.webp" alt="Installer window with step 2 instructions and the prompt for the page link." width="600">

</details>

<details>
<summary><b>Changing the Notion token</b></summary>

1. Open Settings (the gear icon), the General tab, and click Change token.

   <img src="docs/img/poradnik/token-zmiana/01-en.webp" alt="Dashboard settings, General tab, with the Change token button pointed out." width="600">

2. Confirm. The old token is replaced only once the new one works.

   <img src="docs/img/poradnik/token-zmiana/02-en.webp" alt="The Change the Notion token confirmation with the Change token button pointed out." width="600">

3. Paste the new token into the field. The check starts by itself, no extra button.

   <img src="docs/img/poradnik/token-zmiana/03-en.webp" alt="The Token step in Getting started with the Paste the token field." width="600">

</details>

## Running

- **Windows:** `Dashboard.vbs` (no console window; logs in `dashboard.log`) or `Dashboard.cmd` (with a console window, for troubleshooting). Desktop shortcut with an icon: `powershell -ExecutionPolicy Bypass -File narzedzia\utworz-skrot.ps1`.
- **macOS / Linux:** `./start.sh` (in the background, logs in `dashboard.log`) or `./start.sh --foreground`.
- Address: http://127.0.0.1:4321. If the dashboard is already running, the scripts just open the browser.
- Stop: the "Stop server" button in the bottom right corner.

## Updating

Every update does, in order: **backup** of the four databases to `backups/<date>/` → **download** of the new version → Notion schema **migrations** (add only) → **restart**. It never overwrites `.env`, `config.local.json`, `backups/` or `public/img/firmy/custom/`, and browser settings (palette, margins, filters, theme) stay.

Two ways:
1. **From the dashboard:** when a new version exists, "New version X" appears in the status bar. The update window shows the release notes, the Notion plan (what will be added; nothing is removed) and the progress of each stage. After the restart the page reloads by itself. On error you get a description, the backup path and a command for the terminal.
2. **By hand:** `Aktualizuj.cmd` (Windows) or `./update.sh`. Preview without any changes: `node update.mjs --dry-run`.

Where the new version comes from:
- **git** install: `git pull --ff-only`. If the app folder has local code changes, the update refuses and explains what to do;
- **ZIP** install: the latest release archive from `codeload.github.com`, applied only when the file checksum published in the release matches.

Migrations only add new properties, options and views. They never delete, change types, rename properties that hold data or touch entry values. Rules: [CONTRIBUTING.md](CONTRIBUTING.md).

Turn update checks off in Settings → General.

## Backup and restore

- A backup is made on every update in `backups/<date>/` (JSON: schema and all entries with their values). The folder is in `.gitignore`.
- Restore: `node restore.mjs` shows a **preview only** (what would be restored from the latest backup). `node restore.mjs --apply` writes after you type "YES". Pick another backup by path: `node restore.mjs backups/2026-10-26T10-00-00Z`.
- Restore puts field values back, takes entries out of the trash and recreates missing ones. It deletes nothing: entries added after the backup stay. Files uploaded to Notion (screenshots) are not in the backup because their URLs expire after an hour.

## How numbers are calculated

- **Win / Loss / BE:** "Manual result" first, then R with the BE margin (default ±0.1R), and if R is empty, P&L $ with its own margin (default $0). Set the margins in Settings.
- Win rate = wins / (wins + losses); BE is not in the denominator.
- Profit factor = gross profit / gross loss (in R, and for Live also in $).
- Max drawdown from the cumulative R curve, from the highest peak.
- Comparison with the previous period: the same length right before the selected one.
- Types: Live, Backtest, Paper (good setups you did not take; hypothetical R). Live never includes Paper; the "+ paper" switch adds them to breakdowns and the curve.
- Entries without R, P&L and result, and those with direction NO TRADE, are not counted as trades.
- Entry time is the "Date" property with a time; duration is the difference between "Date" and "Exit". Day and hour use the browser's local time.
- Totals and statistics are calculated from raw properties, not from Notion formulas.

## FAQ

**Can I rename a property or database in Notion?** Yes. The dashboard finds properties by IDs stored in `config.local.json`, so renaming breaks nothing. Do not change a property's type (e.g. number to text).

**Can I add my own properties and options?** Yes. The dashboard does not use them and updates leave them alone. New options (setup, instrument, session, firm) show up in the forms right away.

**How do I delete a trade?** In Notion. The dashboard deliberately does not delete, because that cannot be undone safely. The edit form has an "Open in Notion" link.

**My Notion key stopped working (401).** Generate a new integration secret, put it in `.env` (`NOTION_TOKEN=…`) and restart the dashboard. "Getting started" shows whether it works.

**I use several computers.** Install the app on each and copy `.env` and `config.local.json`. The data lives in Notion, so you see the same everywhere.

**Why is there no "Connect with Notion" button that skips copying a token?** Notion OAuth requires an app secret (client secret). Such a secret cannot be kept safely in a public repository or in an app installed locally: anyone could read it. Doing it safely would need a separate relay server, so for now the internal integration token stays. It is a possible future option.

**How do I change the token?** Settings → General → "Change token". The wizard checks the new token before saving it.

**Port 4321 is taken.** Use another one: `PORT=4400 node server.mjs` (Windows: `set PORT=4400` in `Dashboard.cmd`).

## Security and network connections

- **The Notion key stays local** in `.env`. It never reaches the browser, the logs or the repository (`.env` is in `.gitignore`).
- **The server listens on 127.0.0.1 only**, so other devices on your network cannot reach it.
- **Writes are CSRF-protected:** every write, update and stop request needs the dashboard's Host and Origin, a custom `X-THQ` header and `Content-Type: application/json`. A foreign page open in your browser cannot write anything silently. The server validates all data itself.
- **Connections:** the server talks to the Notion API and, as its only connection besides Notion, to the public GitHub API once a day (new version check, none of your data is sent; switch it off in Settings). An update downloads the archive from `codeload.github.com`. In addition the browser loads fonts from Fontshare and Google Fonts (without internet it falls back to system fonts), and a TradingView link preview loads the image from TradingView.

## Prop firm logos

Logos in `public/img/firmy/` are trademarks of their owners and are used only to identify the firms. They are not covered by the MIT license. Other firms get a monogram.

| File | Firm | Source (downloaded 2026-10-26, resized to 96×96 WebP) |
|---|---|---|
| `lucid.webp` | Lucid Trading | https://lucidtrading.com/wp-content/uploads/2025/09/luciddarkmode-2-4.png.webp |
| `alpha.webp` | Alpha Futures | https://alpha-futures.com/images/webclip-192.png |
| `apex.webp` | Apex Trader Funding | https://apextraderfunding.com/app/uploads/cropped-APEX_FAV-192x192.png |

The `public/img/firmy/custom/` folder is yours: updates never touch it.

## Project files

| Path | What it is |
|---|---|
| `server.mjs` | local server: Notion read and write, write protection, updates, readiness check |
| `setup.mjs`, `update.mjs`, `restore.mjs` | install, update, restore |
| `Instaluj.cmd`, `Aktualizuj.cmd`, `Dashboard.vbs`, `Dashboard.cmd` | Windows launchers |
| `install.sh`, `update.sh`, `start.sh` | macOS / Linux launchers |
| `schema/notion-schema.json` | single source of truth for the Notion page, databases, properties, formulas and views |
| `migrations/` | schema migrations (add only) |
| `lib/` | Notion client, property roles, read and write, backups, migrations, updater |
| `public/` | the interface (HTML, CSS, JS modules, `i18n/` dictionaries) |
| `testy/` | Notion API mock and tests: `node testy/run.mjs` |
| `narzedzia/` | `suma-wydania.mjs` (release checksum), `schemat.mjs` (database property dump), `utworz-skrot.ps1` |

### Tests

`node testy/run.mjs` runs every test against the Notion mock (`testy/atrapa-notion.mjs`) and a fake release server: PL and EN install, existing install, backup and restore, ZIP and git update, update module with restart, readiness and schema repair, translations. No test talks to the real Notion or GitHub. The dashboard on the mock alone: `node testy/start-test.mjs` (http://127.0.0.1:4331).

## License

[MIT](LICENSE) © Paneksu. Prop firm logos: see above.
