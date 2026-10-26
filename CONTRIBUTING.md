# Współtworzenie / Contributing

[Polski](#polski) · [English](#english)

## Polski

### Najważniejsza zasada: aktualizacja nie może zabrać danych

Użytkownicy trzymają w Notion swoje trade'y, konta i wydatki. Każda zmiana schematu Notion w nowej wersji trafia do nich przez migrację, więc migracje są **tylko addytywne i idempotentne**.

Dozwolone operacje (jedyne, które przyjmuje `lib/migrate.mjs`):

| Operacja | Co robi |
|---|---|
| `addProperty` | dodaje pole, jeśli nie ma go jeszcze pod żadną znaną nazwą |
| `addOption` | dodaje opcję do pola wyboru, wysyłając wszystkie dotychczasowe opcje plus nową |
| `addView` | dodaje widok bazy, jeśli nie ma widoku o tej nazwie |
| `addPageBlock` | dopisuje znany blok (obecnie tylko `settings`) na końcu strony głównej, jeśli go nie ma; nie rusza innej treści strony |

Zakazane: usuwanie pól, opcji i widoków, zmiana typu pola, zmiana nazwy pola z danymi, nadpisywanie wartości we wpisach, relacje dwustronne w migracjach (zmieniają drugą bazę).

Zasadę pilnują trzy rzeczy:
1. `validateMigration` odrzuca każdą operację spoza listy, zanim cokolwiek trafi do Notion.
2. `patchDataSource` (jedyna funkcja zapisu schematu) odmawia usunięcia, zmiany typu, zmiany nazwy i zabrania opcji.
3. Test `node testy/run.mjs migracje` sprawdza wszystkie pliki w `migrations/`, a atrapa Notion zapisuje każdą zakazaną próbę (`/__test/violations`).

### Jak dodać migrację

1. Dodaj zmianę do `schema/notion-schema.json` (nowe instalacje) i podbij `schemaVersion`.
2. Utwórz `migrations/NNN-krotki-opis.mjs`, gdzie `NNN` = nowa `schemaVersion`:
   ```js
   export default {
     version: 2,
     description: { pl: 'Pole „Ocena” w bazie Trade\'y', en: 'Rating property in Trades' },
     ops: [
       { op: 'addProperty', db: 'trades', role: 'rating', spec: { type: 'number', name: { pl: 'Ocena', en: 'Rating' } } },
       { op: 'addOption', db: 'trades', role: 'setup', option: { name: 'Breaker', color: 'pink' } },
       { op: 'addView', db: 'trades', view: { key: 'rating', type: 'table', name: { pl: 'Wg oceny', en: 'By rating' } } },
     ],
   };
   ```
3. Sprawdź podgląd: `node update.mjs --migrate-only --dry-run` (na atrapie: `NOTION_API_BASE=http://127.0.0.1:4399`).
4. Uruchom `node testy/run.mjs`.

Migracja jest opisem stanu docelowego, a nie listą kroków: druga i każda kolejna próba nic nie zmienia.

### Tłumaczenia

Teksty interfejsu i serwera idą przez `t('polski tekst')`. Tłumaczenie dopisz do `public/i18n/en.json`, a formy mnogie (`t.p`) do obu słowników jako `{ one, few, many, other }`. Test `node testy/run.mjs i18n` wypisuje brakujące klucze.

### Wydanie nowej wersji

1. Podbij `version` w `package.json` (semver) i dopisz sekcję w `CHANGELOG.md` (PL i EN).
2. `node testy/run.mjs` musi przejść.
3. Commit, tag i wypchnięcie: `git tag v1.1.0 && git push origin main --tags`.
4. Policz sumę drzewa plików z tagu: `node narzedzia/suma-wydania.mjs v1.1.0`.
5. Utwórz wydanie na GitHubie z tego tagu. W treści: lista zmian z `CHANGELOG.md` i na końcu linia z sumą, np.
   ```
   tree-sha256: 3f5a…
   ```
Instalacje z ZIP pobierają archiwum wyłącznie z `codeload.github.com` (HTTPS) i podmieniają pliki tylko wtedy, gdy suma drzewa się zgadza. Wydanie bez tej linii jest odrzucane. Suma jest liczona z treści plików (końce linii sprowadzone do LF), więc nie zależy od kompresji archiwum.

### Zasady kodu

- Zero zależności npm, bez kroku build, Node 22+.
- Wygląd tylko z istniejących tokenów w `public/styles.css` (motywy Onyx i Platinum).
- Każda zmiana działa przy 1920×1080 bez przewijania okna i przy 375 px bez poziomego przewijania.
- Testy wyłącznie na atrapie (`testy/atrapa-notion.mjs`), nigdy na prawdziwym Notion.

## English

### The rule that matters most: an update must never take data away

Users keep their trades, accounts and expenses in Notion. Every Notion schema change reaches them through a migration, so migrations are **additive and idempotent only**.

Allowed operations (the only ones `lib/migrate.mjs` accepts): `addProperty`, `addOption` (sends all existing options plus the new one), `addView`, `addPageBlock` (appends a known block, currently only `settings`, to the end of the home page if missing).

Forbidden: deleting properties, options or views, changing a property type, renaming a property that holds data, overwriting values, two-way relations in migrations.

Enforced by `validateMigration`, by `patchDataSource` (the only schema writer) and by the test suite (`node testy/run.mjs migracje`); the Notion mock records every forbidden attempt.

### Adding a migration

Add the change to `schema/notion-schema.json` and bump `schemaVersion`, then create `migrations/NNN-short-name.mjs` (see the example above), preview it with `node update.mjs --migrate-only --dry-run` and run `node testy/run.mjs`.

### Translations

UI and server strings go through `t('Polish source text')`; add the English text to `public/i18n/en.json` (plural forms to both dictionaries).

### Releasing

1. Bump `version` in `package.json`, add a `CHANGELOG.md` section (PL and EN), run the tests.
2. Tag and push: `git tag v1.1.0 && git push origin main --tags`.
3. `node narzedzia/suma-wydania.mjs v1.1.0` prints `tree-sha256: …`.
4. Create the GitHub release from the tag and put that line at the end of the release notes.

ZIP installs download the archive only from `codeload.github.com` over HTTPS and replace files only when the tree hash matches; releases without the line are rejected.
