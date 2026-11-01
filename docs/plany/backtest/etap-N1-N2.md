# Etap N1 i N2: pierwsze kroki (puste stany, instalator) i szkielet pełnego widoku Ustawień z Diagnostyką

> Gałąź `feat/backtest-ciagly` (po K, L, M; 5c6e993). Zasady: `00-wspolne.md`, `CONTRIBUTING.md`. Specyfikacja: `R:/PROJEKTY/trading-hq-wt/backtest-wyniki/N-pierwsze-kroki-ustawienia.md` (audyt, §4.2 architektura informacji, §4.3 makiety, §4.6 test połączenia, §5 bezpieczeństwo, §6 pakiety, „Decyzje użytkownika (31.10.2026)”). Ślad: `postep.md`, sekcje „N1” i „N2”. Wydanie: 1.6.0 (wszystkie pakiety N razem, [U] «Wszystko razem w 1.6.0»).

## Słowa użytkownika (31.10.2026)

- «oraz zaktualizuj wyglad pierwszych krokow w journalu oraz modul ustawien zreworkuj na o wiele zrozumialszy i czyterlniejszy i dopracowny. dodaj miejsca gdzie mozna sterowac polaczeniami zrodel plikow np dla historii swiec i gdzie beda zapiosywane, po prostu rzeczy ktore dla osoby bez ai beda ciezkie do polaczenia. przemysl cale to»
- Na 9 rekomendacji: «Przyjmuję wszystkie». W kodzie: `// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja N: …)` w osobnym wierszu.
- Wydanie: «Wszystko razem w 1.6.0».

Decyzje dotyczące N1 i N2: 1 (klucze w UI zostają, zapis tylko do `.env`), 5 (bez zmiany portu w UI: komunikat przy zajętym porcie), 9 (restart i zatrzymanie serwera zawsze widoczne w diagnostyce). Decyzja 3 (usunięcie stanu kredytu właściciela z kodu) należy do N4: w N1/N2 kod kredytu bez zmian.

## Kroki

- [x] N0: karta (ten plik), lista pól Ustawień przed zmianą (niżej)
- [x] N1-t: testy N1 czerwone przed kodem (`backtest-wyniki/N1-czerwone.txt`)
- [x] N1-a: baner DEMO nad Statystykami (Usuń je / Dodaj pierwszy trade), znika po usunięciu
- [x] N1-b: pusty stan wykresu bez klucza: „Połącz Databento” → `#ustawienia/zrodla/databento`
- [x] N1-c: Backtest bez świec: lista sesji i kreator mówią, skąd wziąć świece, „Połącz Databento” → `#ustawienia/zrodla/databento`
- [x] N1-d: `Dashboard.vbs` i `start.sh`: zajęty port → komunikat zamiast otwierania cudzego serwera (sprawdzenie `/api/ping` z `app: trading-hq`); serwer przy `EADDRINUSE` pisze, czy port zajmuje dashboard, czy inny program
- [x] N1-e: krok „Ustawienia” przewodnika przepisany pod nowe sekcje
- [x] N1-f: teksty PL (humanizer, pl-copy, bez długich pauz), EN w `en.json`; testy zielone; commit N1
- [x] N2-t: testy N2 czerwone przed kodem (`backtest-wyniki/N2-czerwone.txt`)
- [x] N2-a: serwer: `lib/diag.mjs` (`GET /api/diag`, `POST /api/diag/test`, `GET /api/diag/log`, `POST /api/diag/open`), `candles.testKey()`, `/api/health` z `started`, restart blokowany także w trakcie tworzenia dziennika
- [x] N2-b: `ustawienia.js` jako szkielet pełnego widoku (nawigacja po lewej, 7 sekcji, `#ustawienia/<sekcja>[/<grupa>]`, ostatnia sekcja), sekcje w osobnych modułach `ust-*.js`
- [x] N2-c: przeniesienie wszystkich grup bez zmiany logiki (lista pól przed/po niżej, test pól)
- [x] N2-d: sekcja „Kopie i diagnostyka”: stan połączeń, „Sprawdź”, aktualizacje, kopie (dzisiejszy stan + instrukcja), serwer (wersja, Node, adres, restart, zatrzymanie), log bez sekretów, „Otwórz folder”, licencje
- [x] N2-e: 375 px: lista sekcji → sekcja z „‹ Ustawienia”, bez poziomego przewijania
- [x] N2-f: pełne testy (`N2.txt`), e2e (`N2-e2e.txt`), zrzuty `backtest-wyniki/N2/`, `postep.md`, commit N2

## Mapa sekcji (§4.2)

| # | Sekcja (`id`) | Zawartość w N2 (tylko to, co już istnieje + diagnostyka) | Pełna wersja |
|---|---|---|---|
| 1 | Konto i Notion (`konto`) | Połączenie z Notion (stan z `/api/diag`, „Sprawdź”), dziennik (link do Notion, schemat baz), pierwsze kroki („Otwórz pierwsze kroki”, „Zmień token”), dane DEMO (liczba, „Usuń”), urządzenia (synchronizacja, lista, „Dodaj kolejne urządzenie”) | N6 |
| 2 | Źródła danych (`zrodla`) | Grupa Databento (klucz, limity i kredyt do podglądu, codzienne okno 1s NQ), grupy Newsy (FRED) i Earningsy (Finnhub) w całości, odnośnik do instrukcji importu historii | N4 (Testuj/Usuń, limity z UI, import, rozcięcie newsów) |
| 3 | Dane na dysku (`dysk`) | Katalog danych (ścieżka, rozmiar `chart-data/`, „Otwórz folder”), co w nim leży, odnośnik do instrukcji | N3 |
| 4 | Wygląd (`wyglad`) | Język, paleta danych, wynik BE (marginesy), nick do podpisu | — |
| 5 | Wykresy (`wykresy`) | Podgląd, wygląd wykresu, nakładki, karty i filmy, czas i ceny, ustawienia rysunku | — |
| 6 | Backtest (`backtest`) | Bez zmian (skoki, skróty, szablony, domyślne wartości, notka o kopii) | — |
| 7 | Kopie i diagnostyka (`diag`) | Stan połączeń, aktualizacje, kopie Notion (dzisiejszy stan, instrukcja), serwer, log, licencje | N5 (kopie z UI) |

Stare identyfikatory zakładek działają jako aliasy: `dane`, `be`, `ogolne` → `wyglad`; `urzadzenia` → `konto`; `wykresy` → `wykresy`; `backtest` → `backtest`.

## Lista pól Ustawień: przed (popover 1.5.0) → po (pełny widok)

Zapis: **LS** = `localStorage` `thq.settings.v1`, **Notion** = blok ustawień (przez `sanitizeSettings`), **cfg** = `config.local.json` (`POST /api/config`), **.env** = przez serwer, **LS-dock** = `thq.chart.styleDock.v1`. Zapis każdego pola bez zmian (ta sama funkcja, ten sam klucz).

| Pole (selektor) | Przed | Po | Zapis |
|---|---|---|---|
| Karty palet `[data-act="palette"]` (5) | Kolory | Wygląd | LS + Notion (`palette`, `custom`, `customSeeded`) |
| Własna paleta: motyw `[data-act="pal-edit-theme"]`, kolor `[data-act="sw-open"]`, próbki `sw-pick`, HEX `.hexin`, dowolny `sw-any`/`.anycolor`, `ct-fix` | Kolory | Wygląd | LS + Notion (`custom`) |
| „Przywróć domyślne (Kolor)” `pal-reset` | Kolory | Wygląd | LS + Notion |
| Margines BE (R) `#be-r` + `be-reset beR` | Wynik BE | Wygląd | LS + Notion (`beR`) |
| Margines BE ($) `#be-usd` + `be-reset beUsd` | Wynik BE | Wygląd | LS + Notion (`beUsd`) |
| Styl wykresu `ch-style`, styl miniatur `ch-mini-style`, kolory świec `ch-colors`, motyw `ch-edit-theme`, `.cc-c`/`.cc-h` (up, down), `ch-fix` | Wykresy | Wykresy | LS + Notion (`chart`) |
| Siatka, poziomy `[data-chk="grid|entry|exit|sl|tp"]`, `ch-reset look` | Wykresy | Wykresy | LS + Notion (`chart`) |
| Nakładki `[data-chk="sessions|pdhl|sess-*"]`, godziny `[data-ovt]` (6), `ch-reset overlays` | Wykresy | Wykresy | LS + Notion (`chart.overlays`) |
| Newsy: `[data-chk="news|newsImp-*"]`, `#sp-fredkey` + `news-key-save` | Wykresy | Źródła danych | overlays: LS + Notion; klucz: .env (`/api/news/key`) |
| Earningsy: `[data-chk="earnings|earnCls-*"]`, `#sp-fhkey` + `earn-key-save`, `#sp-earn-sym`/`#sp-earn-cls` + `earn-class-add`, `earn-class-del` | Wykresy | Źródła danych | overlays: LS + Notion; klucz: .env; klasy: cfg (`/api/earnings/classes`) |
| Karty: `[data-chk="shareChart|equity|filmBw"]`, `ch-share-style`, `ch-share-draw`, `ch-film-format`, `ch-film-seconds`, `[data-range="filmDim"]`, `ch-reset cards` | Wykresy | Wykresy | LS + Notion (`chart`) |
| Strefa `#sp-tz`, B-ADJ `#sp-badj`, `ch-reset time` | Wykresy | Wykresy | LS + Notion (`chartTz`, `chartBadj`) |
| Klucz Databento `#sp-dbkey` + `ch-key-save` | Wykresy | Źródła danych | .env (`/api/candles/key`) |
| Limity, wydano dziś, kredyt (tylko odczyt, `.sp-kv`) | Wykresy | Źródła danych | — (z `/api/meta`) |
| Pobrane świece na dysku (tylko odczyt) | Wykresy | Dane na dysku | — (z `/api/candles/size`) |
| Codzienne okno 1s NQ `[data-act="ch-nq1s"]` | Wykresy | Źródła danych | cfg (`chartNq1sDaily`) |
| Licencje (tekst) | Wykresy | Kopie i diagnostyka | — |
| Skoki, skróty akcji, szablony, domyślne wartości sesji, notka o kopii | Backtest | Backtest | LS + Notion (`bt`) |
| Język `sp-lang` | Ogólne | Wygląd | cfg + LS |
| Nick `#sp-nick` | Ogólne | Wygląd | LS + Notion (`share.nick`) |
| Ustawienia rysunku `sp-dock` | Ogólne | Wykresy | LS-dock |
| Sprawdzaj aktualizacje `[data-act="sp-upd"]` | Ogólne | Kopie i diagnostyka | cfg (`updateCheck`) |
| Aktualizacje (`upd-check-now`, `upd-open`) | Ogólne | Kopie i diagnostyka | cfg (`skipVersion`) |
| Pierwsze kroki (`ob-open`, `ob-token`) | Ogólne | Konto i Notion | token: .env |
| Schemat baz N (tekst) | Ogólne | Konto i Notion | — |
| Synchronizacja `[data-act="sync-toggle"]`, urządzenia (`dv-*`) | Urządzenia | Konto i Notion | cfg (`syncEnabled`, `deviceName`), Notion |

Nowe w N2 (tylko odczyt albo akcje serwera, bez nowych pól ustawień): stan połączeń, „Sprawdź” (`POST /api/diag/test`), log, „Otwórz folder” (`POST /api/diag/open`), „Uruchom ponownie” (`/api/restart`), „Zatrzymaj” (`/api/shutdown`), liczba wpisów DEMO z „Usuń”.

## Decyzje gustu (N1, N2)

Wypisane w `postep.md` (sekcje „N1” i „N2”).
