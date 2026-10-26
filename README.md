# Local Trading Journal

**Polski** · [English](README.en.md)

Dziennik tradingowy w Notion i lokalny dashboard statystyk, który działa tylko na Twoim komputerze. Trade'y, konta prop i wydatki wpisujesz w Notion albo w dashboardzie, a dashboard liczy win rate, profit factor, drawdown, rozkład R, statystyki godzin wejścia i wiele więcej. Bez kont w chmurze, bez zależności npm i bez kroku build.

![Dashboard, motyw Onyx](docs/img/dashboard-en-onyx.png)

| Platinum, po polsku | Zakładka Prop | Telefon |
|---|---|---|
| ![Platinum](docs/img/dashboard-pl-platinum.png) | ![Prop](docs/img/prop-en-onyx.png) | ![Telefon](docs/img/mobile-en-onyx.png) |

Zrzuty pochodzą z atrapy z przykładowymi danymi.

## Spis treści

- [Co dostajesz](#co-dostajesz)
- [Wymagania](#wymagania)
- [Instalacja krok po kroku](#instalacja-krok-po-kroku)
- [Pierwsze kroki](#pierwsze-kroki)
- [Poradnik krok po kroku](#poradnik-krok-po-kroku)
- [Uruchamianie](#uruchamianie)
- [Aktualizacja](#aktualizacja)
- [Wiele urządzeń](#wiele-urządzeń)
- [Kopia i przywracanie](#kopia-i-przywracanie)
- [Zasady liczenia](#zasady-liczenia)
- [FAQ](#faq)
- [Bezpieczeństwo i połączenia sieciowe](#bezpieczeństwo-i-połączenia-sieciowe)
- [Logo firm prop](#logo-firm-prop)
- [Pliki projektu](#pliki-projektu)

## Co dostajesz

- **W Notion:** stronę „Dziennik tradingowy” z czterema bazami połączonymi relacjami: Trade'y, Konta, Dziennik, Wydatki i payouty. Mają gotowe pola, opcje, formuły (saldo konta, bilans wpisów) i widoki (Live, Backtest, Paper, galeria zrzutów, kalendarze).
- **Na komputerze:** dashboard pod adresem http://127.0.0.1:4321:
  - KPI z porównaniem do poprzedniego okresu, krzywa kapitału i wykres spadków, kalendarz P&L, heatmapa dni;
  - rozbicia: setup, instrument, sesja, dzień tygodnia, kierunek, godzina wejścia (każdy trade w swojej minucie), czas trwania, kolejny trade w dniu, rozkład R;
  - zakładki Trade'y (tabela z sortowaniem), Prop (konta, payouty, ROI, bilans) i Galeria zrzutów;
  - dodawanie i edycja trade'ów, kont i wpisów finansowych, z zapisem prosto do Notion;
  - motywy Onyx i Platinum, palety danych (także dla daltonistów), język polski i angielski;
  - moduł aktualizacji i „Pierwsze kroki” (sprawdzenie instalacji i przewodnik).

## Wymagania

- [Node.js](https://nodejs.org) w wersji **22 lub nowszej**. Skrypty startowe sprawdzają wersję i mówią, co zrobić.
- Konto Notion (wystarczy darmowe).
- Opcjonalnie [git](https://git-scm.com), jeśli chcesz aktualizować przez `git pull`.
- Windows, macOS albo Linux.

## Instalacja krok po kroku

### 1. Pobierz aplikację

Wybierz jedną drogę:
- **git (zalecane):** `git clone https://github.com/Paneksu/local-trading-journal.git`
- **ZIP:** na stronie [Releases](https://github.com/Paneksu/local-trading-journal/releases) pobierz „Source code (zip)” z najnowszego wydania i rozpakuj w dowolnym katalogu.

### 2. Uruchom instalator

- Windows: dwuklik na **`Instaluj.cmd`**. Jeśli nie masz Node.js, instalator zaproponuje instalację przez `winget` (wystarczy wpisać „t”). Przy pierwszym uruchomieniu Windows może pokazać ostrzeżenie SmartScreen: „Więcej informacji” → „Uruchom mimo to”.
- macOS / Linux: w terminalu w katalogu aplikacji `./install.sh` (albo `sh install.sh`).

Instalator tworzy skrót „Local Trading Journal” na pulpicie, uruchamia dashboard w tle i otwiera w przeglądarce kreator „Pierwsze kroki”. Dalej robisz trzy rzeczy:

1. **Język** jest wykryty z przeglądarki; zmienisz go jednym kliknięciem. Od niego zależą nazwy baz i pól w Notion.
2. **Token:** przycisk „Utwórz integrację w Notion” otwiera stronę integracji. Utwórz integrację typu Internal (nazwę skopiujesz jednym kliknięciem), skopiuj „Internal Integration Secret” i wklej go w kreatorze. Kreator sprawdza go od razu i zapisuje lokalnie w `.env`.
3. **Dostęp:** w Notion na dowolnej stronie (np. pustej „Trading”) wybierz „•••” → „Connections” → swoją integrację. Kreator sam zauważy stronę w ciągu kilku sekund, bez wklejania adresów.

Potem jeden przycisk „Utwórz dziennik” zakłada stronę główną, cztery bazy z relacjami, formułami i widokami oraz (domyślnie) kilka wpisów z prefiksem „DEMO · ”, żeby od razu zobaczyć wykresy. Postęp widać etapami; jeśli coś przerwie tworzenie, „Ponów” zaczyna od miejsca przerwania, bez duplikatów. Na koniec kreator sprawdza całą instalację i proponuje krótki przewodnik.

Jeśli udostępniona strona zawiera już dziennik (reinstalacja albo drugi komputer), kreator zaproponuje „Połącz istniejący dziennik” zamiast tworzenia nowego.

Każdy ręczny krok ma w kreatorze link „Pokaż krok po kroku” z ilustracjami (patrz [Poradnik krok po kroku](#poradnik-krok-po-kroku)).

Wpisy DEMO usuniesz przyciskiem w „Pierwszych krokach” albo poleceniem `node setup.mjs --remove-demo` (pyta o potwierdzenie i przenosi do kosza Notion tylko wpisy zaczynające się od „DEMO · ”).

**Instalacja w terminalu (zapasowo):** `Instaluj.cmd --cli` albo `./install.sh --cli` prowadzi przez te same kroki w konsoli (z wklejeniem linku do strony). Bez pytań, np. do skryptów: `node setup.mjs --lang pl --token ntn_… --parent <link do strony> --demo --yes`.

### Alternatywa: duplikuj szablon

Jeśli wolisz klikać w Notion: otwórz [szablon Notion (PL)](https://abalone-tendency-4c7.notion.site/Local-Trading-Journal-szablon-PL-405afccce4f181969df0edd4a6d86631) i wybierz „Duplicate”. Potem:
1. utwórz integrację jak w kroku 2 i dodaj ją do zduplikowanej strony („•••” → „Connections”);
2. utwórz w katalogu aplikacji plik `.env`:
   ```
   NOTION_TOKEN=ntn_…
   DS_TRADES=…
   DS_KONTA=…
   DS_DZIENNIK=…
   DS_FINANSE=…
   NOTION_ROOT_URL=https://www.notion.so/…
   ```
   Identyfikator źródła danych każdej bazy skopiujesz w Notion: menu bazy „•••” → „Manage data sources” → „Copy data source ID”.
3. uruchom dashboard. Pola zostaną rozpoznane po nazwach (po polsku i po angielsku) i zapamiętane.

### Widoki ręcznie

Instalator tworzy widoki przez API Notion. Jeśli Notion któregoś nie przyjmie, instalator wypisze go na końcu, a „Pierwsze kroki” pokażą go jako uwagę. Dodasz go w trzech kliknięciach: nad tabelą bazy „+” (obok nazw widoków) → wybierz typ (Table, Gallery albo Calendar) → nazwij widok. Dla galerii w „Layout” ustaw „Card preview: Zrzut”, dla kalendarza „Show calendar by: Data”, dla widoków Live / Backtest / Paper dodaj filtr „Typ is …”.

## Pierwsze kroki

Przy pierwszym uruchomieniu dashboard otwiera „Pierwsze kroki”. Są też zawsze dostępne w Ustawieniach (koło zębate) i pod „?” w pasku statusu.

- **Gotowość:** lista kontrolna: Node, klucz Notion, dostęp do strony, cztery bazy z liczbą wpisów, zgodność pól, widoki, uprawnienia do zapisu, ochrona serwera, aktualizacje i wpisy DEMO. Przy każdym problemie jest krótka instrukcja naprawy. „Napraw wszystko” jednym przyciskiem stosuje wszystkie bezpieczne naprawy (brakujące pola, opcje i widoki, ponowne rozpoznanie pól, skrót do Notion), a najpierw pokazuje, co zostanie dodane. Zły token albo brak dostępu przenoszą do właściwego kroku kreatora. Szybkie sprawdzenie uruchamia się w tle przy każdym starcie; przy problemie w pasku statusu pojawia się „Wymaga uwagi”. Sprawdzenia wyłącznie czytają; próba zapisu wysyła żądanie, które Notion odrzuca walidacją, więc nic nie powstaje.
- **Jak działa dziennik:** przewodnik w kilku krokach po prawdziwym interfejsie, na przykładowych danych w pamięci przeglądarki. W tym trybie nic nie trafia do Notion, a po wyjściu wracają Twoje dane i filtry.

![Pierwsze kroki: gotowość](docs/img/pierwsze-kroki-gotowosc.png)
![Pierwsze kroki: przewodnik](docs/img/pierwsze-kroki-przewodnik.png)

## Poradnik krok po kroku

Te same kadry pokazuje kreator pod linkiem „Pokaż krok po kroku”. To ilustracje odtworzone na podstawie prawdziwych ekranów; układ w Notion i w systemie może się nieznacznie różnić.

<details>
<summary><b>Instalacja Node.js na Windows</b></summary>

1. Kliknij prawym przyciskiem przycisk Start i wybierz Terminal.

   <img src="docs/img/poradnik/node-windows/01-pl.webp" alt="Menu przycisku Start otwarte prawym przyciskiem, zaznaczona pozycja Terminal." width="600">

2. Wpisz polecenie winget install OpenJS.NodeJS.LTS i naciśnij Enter.

   <img src="docs/img/poradnik/node-windows/02-pl.webp" alt="Okno Terminala z wpisanym poleceniem winget install OpenJS.NodeJS.LTS." width="600">

3. Poczekaj na komunikat o udanej instalacji. Jeśli system zapyta o zgodę, kliknij Tak.

   <img src="docs/img/poradnik/node-windows/03-pl.webp" alt="Terminal pokazuje pobieranie Node.js i komunikat o udanej instalacji." width="600">

4. Bez konsoli: wejdź na nodejs.org/en/download i pobierz Windows Installer (.msi) w wersji LTS.

   <img src="docs/img/poradnik/node-windows/04-pl.webp" alt="Strona pobierania nodejs.org z przyciskiem Windows Installer (.msi)." width="600">

5. Uruchom pobrany plik i klikaj Next, zostawiając domyślne ustawienia. Na końcu kliknij Finish.

   <img src="docs/img/poradnik/node-windows/05-pl.webp" alt="Pierwsze okno instalatora Node.js z przyciskiem Next." width="600">

6. Otwórz nowy Terminal i wpisz node -v. Wersja 22 lub wyższa jest w porządku.

   <img src="docs/img/poradnik/node-windows/06-pl.webp" alt="Terminal pokazuje wynik polecenia node -v z wersją 24." width="600">

   _Strona nodejs.org jest po angielsku, w obu wersjach poradnika wygląda tak samo._

</details>

<details>
<summary><b>Instalacja Node.js na macOS</b></summary>

1. Wejdź na nodejs.org/en/download i pobierz macOS Installer (.pkg) w wersji LTS.

   <img src="docs/img/poradnik/node-macos/01-pl.webp" alt="Strona pobierania nodejs.org z przyciskiem macOS Installer (.pkg)." width="600">

2. Otwórz pobrany plik .pkg i klikaj Kontynuuj, a przy licencji Zgadzam się.

   <img src="docs/img/poradnik/node-macos/02-pl.webp" alt="Okno instalatora Node.js w macOS z przyciskiem Kontynuuj." width="600">

3. Gdy zobaczysz komunikat o udanej instalacji, kliknij Zamknij.

   <img src="docs/img/poradnik/node-macos/03-pl.webp" alt="Podsumowanie instalatora macOS: instalacja zakończona pomyślnie." width="600">

4. Masz Homebrew? Zamiast instalatora wpisz w Terminalu brew install node.

   <img src="docs/img/poradnik/node-macos/04-pl.webp" alt="Terminal macOS z poleceniem brew install node i jego wynikiem." width="600">

5. Sprawdź wersję poleceniem node -v. Wersja 22 lub wyższa jest w porządku.

   <img src="docs/img/poradnik/node-macos/05-pl.webp" alt="Terminal macOS pokazuje wynik node -v z wersją 24." width="600">

   _Strona nodejs.org jest po angielsku, w obu wersjach poradnika wygląda tak samo._

</details>

<details>
<summary><b>Pierwsze uruchomienie Instaluj.cmd (SmartScreen)</b></summary>

1. Otwórz rozpakowany folder aplikacji i kliknij dwukrotnie Instaluj.cmd.

   <img src="docs/img/poradnik/smartscreen/01-pl.webp" alt="Eksplorator plików w folderze local-trading-journal, zaznaczony plik Instaluj.cmd." width="600">

2. Jeśli pojawi się niebieskie okno Windows, kliknij Więcej informacji.

   <img src="docs/img/poradnik/smartscreen/02-pl.webp" alt="Okno Microsoft Defender SmartScreen z linkiem Więcej informacji." width="600">

3. Sprawdź, że aplikacja to Instaluj.cmd, i kliknij Uruchom mimo to.

   <img src="docs/img/poradnik/smartscreen/03-pl.webp" alt="Rozwinięte okno SmartScreen z nazwą Instaluj.cmd i przyciskiem Uruchom mimo to." width="600">

4. Otworzy się okno instalatora. Wpisz 1 (polski) albo 2 (angielski) i naciśnij Enter.

   <img src="docs/img/poradnik/smartscreen/04-pl.webp" alt="Czarne okno konsoli z nagłówkiem Local Trading Journal setup i pytaniem o język." width="600">

   _Na części komputerów zamiast niebieskiego okna pojawia się ostrzeżenie o zabezpieczeniach z przyciskiem Uruchom. Wtedy kliknij Uruchom._

</details>

<details>
<summary><b>Uruchomienie install.sh na macOS i Linuksie</b></summary>

1. W Terminalu przejdź do folderu aplikacji, nadaj prawo uruchomienia i uruchom instalator.

   <img src="docs/img/poradnik/macos-open/01-pl.webp" alt="Terminal z poleceniami cd, chmod +x install.sh i ./install.sh." width="600">

2. Instalator startuje w tym samym oknie. Wpisz 1 (polski) albo 2 (angielski) i naciśnij Enter.

   <img src="docs/img/poradnik/macos-open/02-pl.webp" alt="Terminal z nagłówkiem Local Trading Journal setup i pytaniem o język." width="600">

3. Bez wpisywania poleceń: kliknij install.sh prawym przyciskiem, wybierz Otwórz za pomocą i Terminal.

   <img src="docs/img/poradnik/macos-open/03-pl.webp" alt="Finder z menu kontekstowym pliku install.sh i podmenu Otwórz za pomocą, zaznaczony Terminal." width="600">

4. Jeśli macOS ostrzeże o nieznanym deweloperze, kliknij Otwórz.

   <img src="docs/img/poradnik/macos-open/04-pl.webp" alt="Okno ostrzeżenia macOS o niezweryfikowanym deweloperze pliku install.sh z przyciskiem Otwórz." width="600">

5. Nowszy macOS nie pokazuje przycisku Otwórz. Wtedy w Ustawieniach systemowych, w Prywatności i ochronie, kliknij Otwórz mimo to.

   <img src="docs/img/poradnik/macos-open/05-pl.webp" alt="Ustawienia systemowe, Prywatność i ochrona, komunikat o zablokowaniu install.sh z przyciskiem Otwórz mimo to." width="600">

   _W Linuksie wpisujesz te same trzy polecenia w swoim terminalu._

</details>

<details>
<summary><b>Utworzenie integracji w Notion</b></summary>

1. Wejdź na notion.so/profile/integrations i kliknij New integration.

   <img src="docs/img/poradnik/notion-integracja/01-pl.webp" alt="Strona Integrations w Notion z przyciskiem New integration." width="600">

2. Wpisz nazwę Local Trading Journal, wybierz swój obszar roboczy i typ Internal, potem kliknij Save.

   <img src="docs/img/poradnik/notion-integracja/02-pl.webp" alt="Formularz nowej integracji: nazwa, obszar roboczy, typ Internal i przycisk Save." width="600">

3. Po zapisaniu kliknij Configure integration settings.

   <img src="docs/img/poradnik/notion-integracja/03-pl.webp" alt="Okno z potwierdzeniem utworzenia integracji i przyciskiem Configure integration settings." width="600">

4. W Capabilities zostaw zaznaczone Read content, Update content i Insert content, potem kliknij Save.

   <img src="docs/img/poradnik/notion-integracja/04-pl.webp" alt="Ustawienia integracji: zaznaczone uprawnienia Read, Update i Insert content oraz przycisk Save." width="600">

   _Notion nie ma polskiej wersji interfejsu, dlatego napisy są po angielsku. Układ jest taki sam._

</details>

<details>
<summary><b>Skopiowanie klucza integracji</b></summary>

1. Na liście integracji kliknij Local Trading Journal.

   <img src="docs/img/poradnik/notion-token/01-pl.webp" alt="Lista integracji Notion z kartą Local Trading Journal." width="600">

2. Przy Internal Integration Secret kliknij Copy. Jeśli przycisku nie widać, najpierw kliknij Show.

   <img src="docs/img/poradnik/notion-token/02-pl.webp" alt="Pole Internal Integration Secret z ukrytym kluczem i przyciskiem Copy." width="600">

3. W oknie instalatora kliknij prawym przyciskiem albo naciśnij Ctrl+V, żeby wkleić klucz, i naciśnij Enter.

   <img src="docs/img/poradnik/notion-token/03-pl.webp" alt="Okno instalatora z instrukcją kroku 1 i pytaniem o klucz integracji." width="600">

   _Notion nie ma polskiej wersji interfejsu, dlatego napisy są po angielsku. Układ jest taki sam._

</details>

<details>
<summary><b>Udostępnienie strony integracji</b></summary>

1. Otwórz w Notion pustą stronę na dziennik (np. Trading) i kliknij ••• w prawym górnym rogu.

   <img src="docs/img/poradnik/notion-polaczenia/01-pl.webp" alt="Pusta strona Trading w Notion, wskazany przycisk z trzema kropkami." width="600">

2. W menu najedź na Connections.

   <img src="docs/img/poradnik/notion-polaczenia/02-pl.webp" alt="Menu strony Notion z zaznaczoną pozycją Connections." width="600">

3. Wpisz Local, wybierz Local Trading Journal z listy.

   <img src="docs/img/poradnik/notion-polaczenia/03-pl.webp" alt="Podmenu Connections z wyszukiwarką i integracją Local Trading Journal." width="600">

4. Potwierdź przyciskiem Confirm. Integracja dostaje dostęp tylko do tej strony i jej podstron.

   <img src="docs/img/poradnik/notion-polaczenia/04-pl.webp" alt="Okno potwierdzenia dostępu integracji Local Trading Journal do strony Trading." width="600">

5. Skopiuj link do strony: kliknij Share, a potem Copy link.

   <img src="docs/img/poradnik/notion-polaczenia/05-pl.webp" alt="Okno Share strony Notion z przyciskiem Copy link." width="600">

6. Wklej link w oknie instalatora i naciśnij Enter. Instalator utworzy w tej stronie dziennik.

   <img src="docs/img/poradnik/notion-polaczenia/06-pl.webp" alt="Okno instalatora z instrukcją kroku 2 i pytaniem o link do strony." width="600">

   _Notion nie ma polskiej wersji interfejsu, dlatego napisy są po angielsku. Układ jest taki sam._

</details>

<details>
<summary><b>Zmiana tokenu Notion</b></summary>

1. Otwórz Ustawienia (koło zębate), zakładka Ogólne, i kliknij Zmień token.

   <img src="docs/img/poradnik/token-zmiana/01-pl.webp" alt="Ustawienia dashboardu, zakładka Ogólne, wskazany przycisk Zmień token." width="600">

2. Potwierdź. Stary token zostanie zastąpiony dopiero wtedy, gdy nowy zadziała.

   <img src="docs/img/poradnik/token-zmiana/02-pl.webp" alt="Okno potwierdzenia Zmienić token Notion, wskazany przycisk Zmień token." width="600">

3. Wklej nowy token w pole. Sprawdzenie startuje samo, bez dodatkowego przycisku.

   <img src="docs/img/poradnik/token-zmiana/03-pl.webp" alt="Krok Token w Pierwszych krokach z polem Wklej token." width="600">

</details>

## Uruchamianie

- **Windows:** `Dashboard.vbs` (bez okna konsoli; logi w `dashboard.log`) albo `Dashboard.cmd` (z oknem konsoli, do diagnozy). Skrót na pulpicie z ikoną: `powershell -ExecutionPolicy Bypass -File narzedzia\utworz-skrot.ps1`.
- **macOS / Linux:** `./start.sh` (w tle, logi w `dashboard.log`) albo `./start.sh --foreground`.
- Adres: http://127.0.0.1:4321. Jeśli dashboard już działa, skrypty tylko otwierają przeglądarkę.
- Zatrzymanie: przycisk „Zatrzymaj serwer” w prawym dolnym rogu.

## Aktualizacja

Każda aktualizacja robi po kolei: **kopia** czterech baz do `backups/<data>/` → **pobranie** nowej wersji → **migracje** schematu Notion (tylko dodające) → **restart**. Nigdy nie nadpisuje `.env`, `config.local.json`, `backups/` ani `public/img/firmy/custom/`, a ustawienia w przeglądarce (paleta, marginesy, filtry, motyw) zostają.

Dwie drogi:
1. **Z dashboardu:** gdy jest nowa wersja, w pasku statusu pojawia się „Nowa wersja X”. Okno aktualizacji pokazuje listę zmian, plan zmian w Notion (co zostanie dodane; nic nie jest usuwane) i postęp kolejnych etapów. Po restarcie strona przeładowuje się sama. Przy błędzie widzisz opis, ścieżkę kopii i polecenie do terminala.
2. **Ręcznie:** `Aktualizuj.cmd` (Windows) albo `./update.sh`. Podgląd bez żadnych zmian: `node update.mjs --dry-run`.

Skąd nowa wersja:
- instalacja z **git**: `git pull --ff-only`. Gdy w katalogu są lokalne zmiany w kodzie, aktualizacja odmawia i mówi, co zrobić;
- instalacja z **ZIP**: archiwum ostatniego wydania z `codeload.github.com`, podmieniane tylko wtedy, gdy zgadza się suma plików podana w wydaniu.

Migracje dodają wyłącznie nowe pola, opcje i widoki. Nie usuwają, nie zmieniają typów, nie zmieniają nazw pól z danymi i nie dotykają wartości we wpisach. Zasady: [CONTRIBUTING.md](CONTRIBUTING.md).

Sprawdzanie aktualizacji wyłączysz w Ustawieniach → Ogólne.

## Wiele urządzeń

Dane są w Notion, więc każde urządzenie widzi te same trade'y, konta i wpisy. Na nowe urządzenie przenosisz tylko konfigurację.

**Z kodem przeniesienia (zalecane, trzy ruchy):**
1. Na pierwszym urządzeniu: Ustawienia → „Dodaj kolejne urządzenie”. Dashboard pokazuje kod przeniesienia i osobno 6-cyfrowy PIN. Kod jest ważny 15 minut. Możesz go skopiować albo zapisać jako plik `.ltj`.
2. Na nowym urządzeniu pobierz aplikację i uruchom `Instaluj.cmd` albo `./install.sh`. W kreatorze wybierz „Mam już dziennik na innym urządzeniu”.
3. Wklej kod (albo upuść plik `.ltj`), wpisz PIN i kliknij „Dalej”. Token, strona główna, mapowanie pól, własne logo i ustawienia są na miejscu.

**Bez kodu:** wybierz „Mam dziennik w Notion, ale bez dashboardu”, wklej ten sam token (Notion → integracja → „Show”) i udostępnij stronę dziennika; kreator sam go znajdzie. Ustawienia i tak dociągną się z Notion.

**Synchronizacja ustawień:** paleta (osobno dla Onyx i Platinum), marginesy BE, język, motyw i sprawdzanie aktualizacji są zapisywane w zwiniętym bloku „Ustawienia dashboardu (nie edytuj)” na końcu strony głównej w Notion, bez tokenu. Dashboard zapisuje je 2 s po zmianie i czyta przy starcie oraz przy automatycznym odświeżaniu; przy konflikcie wygrywa ostatnia zmiana. Filtry (typ, okres, konta, setup) zostają osobno na każdym urządzeniu, bo to wygoda lokalna. Wyłącznik: Ustawienia → „Synchronizuj ustawienia między urządzeniami”. Istniejące instalacje dostają blok przy aktualizacji do 1.1.0 (migracja dodaje go na końcu strony i nie rusza innej treści).

**Lista urządzeń** (Ustawienia): nazwa (domyślnie nazwa komputera), ostatnio widziane, zmiana nazwy. Usunięcie urządzenia: token jest wspólny dla wszystkich urządzeń, więc wygeneruj nowy token w Notion (integracja → odśwież secret) i wklej go na urządzeniach, które mają zostać („Zmień token”). Pozostałe tracą dostęp.

**Zabezpieczenia i ograniczenia:**
- Kod zawiera token do Twojego Notion. Jest zaszyfrowany (AES-256-GCM, klucz z PIN-u przez PBKDF2-SHA256, 210 000 iteracji, losowa sól), ale 6-cyfrowy PIN chroni tylko krótko. Dlatego kod wygasa po 15 minutach, działa jeden raz, a po 5 złych PIN-ach jest blokowany. Nie wysyłaj kodu przez czat ani e-mail: przenieś go sam, np. plikiem `.ltj` na pendrive.
- PIN jest losowany kryptograficznie i pokazywany osobno. Kod i PIN nie trafiają do logów ani do pamięci przeglądarki.
- Eksport i import mają tę samą ochronę co zapis: tylko 127.0.0.1, Host i Origin dashboardu, nagłówek `X-THQ`.
- Własne logo z `public/img/firmy/custom/` przenoszą się, jeśli są małe (do 60 KB każde, 150 KB razem); większe dashboard wypisze jako pominięte.

## Kopia i przywracanie

- Kopia powstaje przy każdej aktualizacji w `backups/<data>/` (JSON: schemat i wszystkie wpisy z wartościami pól). Katalog jest w `.gitignore`.
- Przywracanie: `node restore.mjs` pokazuje **tylko podgląd** (co zostanie przywrócone z najnowszej kopii). `node restore.mjs --apply` zapisuje po wpisaniu „TAK”. Inną kopię wskażesz ścieżką: `node restore.mjs backups/2026-10-26T10-00-00Z`.
- Przywracanie przywraca wartości pól, wyjmuje wpisy z kosza i odtwarza brakujące. Niczego nie usuwa: wpisy dodane po kopii zostają. Pliki wgrane do Notion (zrzuty) nie są w kopii, bo ich adresy wygasają po godzinie.

## Zasady liczenia

- **Win / Loss / BE:** najpierw pole „Wynik ręcznie”, potem R z marginesem BE (domyślnie ±0,1R), a gdy R jest puste, P&L $ z osobnym marginesem (domyślnie 0 $). Marginesy ustawisz w Ustawieniach.
- Win rate = wygrane / (wygrane + straty); BE nie wlicza się do mianownika.
- Profit factor = suma zysków / suma strat (na R, a dla Live także na $).
- Max drawdown z krzywej skumulowanej R, od najwyższego szczytu.
- Porównanie z poprzednim okresem: okres tej samej długości tuż przed wybranym.
- Typy: Live, Backtest, Paper (dobre setupy, których nie wziąłeś; R hipotetyczne). Live nigdy nie zawiera Paper; przełącznik „+ paper” dolicza je do rozbić i krzywej.
- Wpisy bez R, P&L i wyniku oraz z kierunkiem NO TRADE nie są liczone jako trade'y.
- Godzina wejścia to pole „Data” z godziną, czas trwania to różnica między „Data” a „Wyjście”. Dzień i godzina liczone są w czasie lokalnym przeglądarki.
- Sumy i statystyki liczone są z surowych pól, nie z formuł Notion.

## FAQ

**Czy mogę zmienić nazwę pola albo bazy w Notion?** Tak. Dashboard szuka pól po identyfikatorach zapisanych w `config.local.json`, więc zmiana nazwy niczego nie psuje. Nie zmieniaj typu pola (np. liczba na tekst).

**Mogę dodać własne pola i opcje?** Tak. Dashboard ich nie używa, ale aktualizacje ich nie ruszają. Nowe opcje (setup, instrument, sesja, firma) od razu pojawiają się w formularzach.

**Dlaczego w Notion jest „Niewzięty”, a w dashboardzie „Paper”?** W polskiej instalacji opcja nazywa się „Niewzięty”. Dashboard rozpoznaje ją po roli i wszędzie pokazuje jako „Paper”.

**Jak usunąć trade?** W Notion. Dashboard celowo nie usuwa, bo tego nie da się bezpiecznie cofnąć. Formularz edycji ma link „Otwórz w Notion”.

**Klucz Notion przestał działać (401).** Wygeneruj nowy klucz integracji, wpisz go w `.env` (`NOTION_TOKEN=…`) i uruchom dashboard ponownie. „Pierwsze kroki” pokażą, czy działa.

**Mam kilka komputerów.** Zainstaluj aplikację na każdym i skopiuj `.env` oraz `config.local.json`. Dane są w Notion, więc wszędzie widać to samo.

**Dlaczego nie ma przycisku „Połącz z Notion” bez kopiowania tokenu?** Logowanie przez OAuth Notion wymaga tajnego klucza aplikacji (client secret). Takiego klucza nie da się bezpiecznie trzymać w publicznym repozytorium ani w aplikacji instalowanej lokalnie: każdy mógłby go odczytać. Bezpiecznie dałoby się to zrobić tylko przez osobny serwer pośredniczący, więc na razie zostaje token integracji wewnętrznej. To możliwość na przyszłość.

**Jak zmienić token?** Ustawienia → Ogólne → „Zmień token”. Kreator sprawdzi nowy token, zanim go zapisze.

**Port 4321 jest zajęty.** Ustaw inny: `PORT=4400 node server.mjs` (Windows: `set PORT=4400` w `Dashboard.cmd`).

**Mój dashboard nie pokazuje „Pierwszych kroków” po aktualizacji.** Tak ma być: pokazują się same tylko przy nowej instalacji albo gdy sprawdzenie wykryje błąd. Otworzysz je z Ustawień.

## Bezpieczeństwo i połączenia sieciowe

- **Klucz Notion zostaje lokalnie** w `.env`. Nigdy nie trafia do przeglądarki, logów ani repozytorium (`.env` jest w `.gitignore`).
- **Serwer słucha tylko na 127.0.0.1**, więc nie jest dostępny z innych urządzeń w sieci.
- **Zapis chroniony przed CSRF:** każde żądanie zapisu, aktualizacji i zatrzymania musi mieć Host i Origin dashboardu, własny nagłówek `X-THQ` i `Content-Type: application/json`. Obca strona otwarta w przeglądarce nie zapisze niczego po cichu. Serwer waliduje wszystkie dane sam.
- **Połączenia:** serwer łączy się z Notion API oraz, jako jedyne połączenie poza Notion, z publicznym API GitHub raz na dobę (sprawdzenie nowej wersji, bez żadnych Twoich danych; wyłącznik w Ustawieniach). Aktualizacja pobiera archiwum z `codeload.github.com`. Dodatkowo przeglądarka pobiera fonty z Fontshare i Google Fonts (bez internetu działa na fontach systemowych), a podgląd zrzutu z linku TradingView pobiera obraz z serwera TradingView.

## Logo firm prop

Logo w `public/img/firmy/` są znakami towarowymi ich właścicieli i służą wyłącznie do identyfikacji firm. Nie są objęte licencją MIT. Pozostałe firmy mają monogram.

| Plik | Firma | Źródło (pobrane 26.10.2026, przeskalowane do 96×96 WebP) |
|---|---|---|
| `lucid.webp` | Lucid Trading | https://lucidtrading.com/wp-content/uploads/2025/09/luciddarkmode-2-4.png.webp |
| `alpha.webp` | Alpha Futures | https://alpha-futures.com/images/webclip-192.png |
| `apex.webp` | Apex Trader Funding | https://apextraderfunding.com/app/uploads/cropped-APEX_FAV-192x192.png |

Katalog `public/img/firmy/custom/` jest Twój: aktualizacje go nie ruszają.

## Pliki projektu

| Ścieżka | Co to jest |
|---|---|
| `server.mjs` | lokalny serwer: odczyt i zapis Notion, ochrona zapisu, aktualizacje, sprawdzenie gotowości |
| `setup.mjs`, `update.mjs`, `restore.mjs` | instalacja, aktualizacja, przywracanie |
| `Instaluj.cmd`, `Aktualizuj.cmd`, `Dashboard.vbs`, `Dashboard.cmd` | pliki startowe Windows |
| `install.sh`, `update.sh`, `start.sh` | pliki startowe macOS / Linux |
| `schema/notion-schema.json` | jedno źródło prawdy o stronie, bazach, polach, formułach i widokach Notion |
| `migrations/` | migracje schematu (tylko dodające) |
| `lib/` | klient Notion, role pól, odczyt i zapis, kopie, migracje, aktualizator |
| `public/` | interfejs (HTML, CSS, moduły JS, słowniki `i18n/`) |
| `testy/` | atrapa Notion API i testy: `node testy/run.mjs` |
| `narzedzia/` | `suma-wydania.mjs` (suma wydania), `schemat.mjs` (podgląd pól bazy), `utworz-skrot.ps1` |

### Testy

`node testy/run.mjs` uruchamia wszystkie testy na atrapie Notion (`testy/atrapa-notion.mjs`) i fałszywym serwerze wydań: instalacja PL i EN, istniejąca instalacja, kopia i przywracanie, aktualizacja ZIP i git, moduł aktualizacji z restartem, gotowość i naprawa schematu, tłumaczenia. Żaden test nie łączy się z prawdziwym Notion ani GitHubem. Dashboard na samej atrapie: `node testy/start-test.mjs` (http://127.0.0.1:4331).

## Licencja

[MIT](LICENSE) © Paneksu. Logo firm prop: patrz wyżej.
