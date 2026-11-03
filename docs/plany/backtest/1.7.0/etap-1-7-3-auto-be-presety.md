# Etap 1.7-3: auto-BE i nazwane presety zleceń

> Gałąź `feat/1.7-auto-be` od `feat/1.7-dokladanie` (po 1.7-2). Zasady: `00-wspolne.md`, `ZASADY-AGENTOW.md`. Model: `model-pozycji-1-7.md` (§2.5 `AutoBe`, §3.4 BE, §3.5 próg, §4 `advance` krok 4, §6.3 ustawienia). Wzór: research §1.1 („Auto breakeven”), §1.7 („One-click”, „Presety”), §2.3, §5.4. Ślad: `postep.md`, sekcja „1.7-3”. Model wykonawcy: Opus (silnik) + Sonnet możliwy dla Ustawień. Review: `code-reviewer`.

## Słowa użytkownika

- Kolejność pakietów z 1.11.2026: „3 Auto-BE i presety (próg w cenie/tickach/$/R; nazwane presety pod Kup/Sprzedaj jednym kliknięciem)”.
- P2 «Tak, w 1.7.0 po auto-BE»: kilka TP przychodzi w 1.7-5, więc presety mają już listę `tps` (tu z jednym elementem).
- `L-audyt` (31.10.2026): «Przyjmuję wszystkie». Auto-BE, prawy klik i presety były na liście rzeczy „nie sprzecznych, bez pytania”.

## Przeczytaj

`model-pozycji-1-7.md` §2.5, §3.4–3.5, §4, §6.3; research §1.1 wiersz „Auto breakeven”, §1.7 „One-click” i „Presety”, §5.4; `public/js/bt-zlecenia.js` 39–130 (pamięć SL/TP, pola panelu); `public/js/bt-czas.js` 238–300 (`btDefaults`, `sanitizeBt`, budżety kopii i szablonów); `public/js/ustawienia.js` (zakładka Backtest).

## Cel

1. **Auto-BE:** po osiągnięciu progu (cena, ticki, $, R; opcjonalnie BE + N ticków) silnik sam przesuwa SL na poziom BE od następnej świecy. Ustawiany w bilecie, w presecie i na otwartej pozycji, widoczny na wykresie jako znacznik progu.
2. **Presety:** nazwane zestawy (SL, TP, wielkość, auto-BE), wybierane chipem pod Kup/Sprzedaj. Aktywny preset sprawia, że Kup/Sprzedaj składa pełne zlecenie jednym kliknięciem (jak FX Replay „Scalper mode”).

## Jak to robi FX Replay (research)

| Element | FX Replay | Dowód | My |
|---|---|---|---|
| Wyzwalacz auto-BE | New Chart: Price, Ticks, Money, Risk/reward; wymaga SL | DOK [F1], [F5], [F24] | cena, ticki, pkt, $, R. SL wymagany tylko dla R (§krawędzie) |
| BE + offset | NIEZNANE | — | `offsetTicks` (domyślnie 0), wartość domyślna w Ustawieniach |
| Kolejność w świecy | NIEZNANE | — | SL w świecy wyzwolenia działa na starym poziomie; nowy od następnej świecy (research §5.4) |
| Presety | wiele, jeden aktywny; pola: strona, typ, SL (ticki/%), TP (jeden lub kilka: ticki/RR/%), wielkość (% ryzyka / stałe ryzyko), auto-BE, tagi, strategia | DOK [F5] | SL i TP w pkt/tickach (TP też R:R), wielkość (ryzyko sesji / $ / % / stała ilość), auto-BE. Bez strony (są dwa przyciski), typu, tagów i strategii (decyzje J2/J6) |
| One-click | aktywny preset „On”: Buy/Sell składa zlecenie z SL, TP, wielkością, auto-BE | DOK [F4], [F5] | to samo |

## Zachowanie UI

### A. Auto-BE w bilecie
- W rozwijanej części panelu („Więcej”): przełącznik `Auto BE`, wybór jednostki `R | pkt | ticki | $ | cena` (`.seg`), pole wartości, pole `+ ticków` (offset, domyślnie z Ustawień, start 0).
- Domyślnie wyłączone. Stan zapamiętany na instrument razem z SL/TP (`thq.bt.ord.v1`, pole `abe`).
- Podgląd zlecenia dopisuje `· auto BE przy 18 330,00`. Dla `R` próg liczony z SL panelu. Dla `$` z wielkości. Dla `cena` wartość wprost.
- Jednostka `R` bez SL w panelu: nieaktywna z podpowiedzią „Auto BE w R wymaga SL”.

### B. Auto-BE na otwartej pozycji
- **Znacznik progu:** cienka kropkowana linia `--be` na cenie progu. Mała plakietka po prawej `aBE 18 330,00`. Przy 375 px tylko znacznik osi „aBE” bez plakietki. Nie przeciąga się (decyzja gustu). Po wyzwoleniu znika.
- **Edycja:** w panelu × (sekcja pod częściami): `Auto BE: przy +1,0R (18 330,00) · BE+0t [Zmień] [Wyłącz]`. „Zmień” rozwija te same pola co w bilecie. W szufladzie kolumna „Auto BE” (1920 px) z tym samym tekstem i menu.
- **Wyzwolenie:**
  - zdarzenie silnika `be-auto`;
  - SL przechodzi na poziom BE (+ offset) od następnej świecy;
  - komunikat `aria-live` „Auto BE: SL na 18 290,25 (10:14:35 NY)”;
  - plakietka SL zmienia się w „BE”;
  - wpis w `log` i w faktach Journala.

### C. Presety pod Kup/Sprzedaj
- Rząd chipów pod przyciskami: `Brak`, potem presety w kolejności z Ustawień. Aktywny chip ma `aria-pressed="true"` i obrys w `--fg` (chip, nie podkładka pod tekstem statycznym: przycisk). Przy 375 px rząd przewija się poziomo w obrębie panelu (jak ulubione interwały).
- Klik chipa aktywuje preset:
  - pola panelu (SL, TP, wielkość, auto-BE) dostają wartości presetu;
  - nad polami notka „z presetu Scalp”;
  - Kup/Sprzedaj składa od razu.
- Edycja pola przy aktywnym presecie odłącza preset (notka „Scalp · zmienione”, chip zostaje zaznaczony, kolejne kliknięcie chipa przywraca jego wartości).
- `Brak` = dzisiejsze zachowanie (pamięć SL/TP na instrument).
- Aktywny preset zapamiętany w ustawieniach (`bt.activePreset`), wspólny dla wszystkich instrumentów (decyzja gustu). Wartości w pkt i tickach działają na każdym instrumencie.
- „Zapisz jako preset…” w panelu: pyta o nazwę (pole w małym oknie, do 24 znaków) i zapisuje bieżące pola.
- Przy otwartej pozycji aktywny preset daje dokładkę z wielkością presetu (SL/TP pozycji bez zmian: reguła 1.7-2). Odwrócenie bierze SL/TP z presetu (1.7-2 §B).
- Skrót klawiszowy wyboru presetu: brak w 1.7.0 (klawisze 1–5 należą do skoków).

### D. Ustawienia → Backtest → „Presety zleceń”
- Lista: nazwa, skrót opisu (`SL 10 pkt · TP 2R · ryzyko sesji · auto BE 1R`), „Edytuj”, „×”, przeciąganie kolejności (i przyciski ↑/↓ dla klawiatury).
- Edytor (siatka jak skoki w N/final P2-6):
  - Nazwa;
  - SL (jednostka pkt/ticki, wartość, puste = bez SL);
  - TP (jednostka pkt/ticki/R:R, wartość; jeden wiersz, w 1.7-5 „+ TP”);
  - Wielkość (ryzyko sesji / $ / % salda / stała ilość);
  - Auto BE (wyłączone / jednostka / wartość / offset).
- Walidacja z powodem przy polu:
  - TP w R:R wymaga SL;
  - wielkość z ryzyka wymaga SL;
  - nazwa niepusta i unikalna.
- Najwyżej 20 presetów (`PRESETS_MAX`). Budżet znaków jak szablony filtra (`TEMPLATES_BUDGET` 30 000); nadmiar odrzucany z notką.
- Osobne pole „Auto BE: domyślny offset (ticki)” = `bt.beOffset`.

## Krawędzie (każda ma test)

1. **Próg R bez SL:** nie da się ustawić (UI i silnik: `bad-autobe`). Po usunięciu SL (P6) auto-BE w R zostaje uzbrojone, bo `rUsd` już jest.
2. **Wyzwolenie bez SL** (np. jednostka pkt, SL usunięty): ustawia SL na BE. Jeśli w następnej świecy cena jest już po złej stronie, stop wykona się na otwarciu tej świecy (reguła luki, zachowawczo). Bez dodatkowej walidacji strony (automat).
3. **SL już lepszy niż BE** (np. przesunięty w zysk): wyzwolenie niczego nie zmienia (nigdy nie pogarsza SL), `done = true`, bez komunikatu o zmianie.
4. **Świeca wyzwolenia dotyka też starego SL:** SL wykonuje się po starym poziomie (najpierw SL, potem próg).
5. **Świeca wyzwolenia dotyka TP:** TP wykonuje się normalnie. Auto-BE dotyczy reszty pozycji.
6. **Świeca wejścia:** progu nie sprawdzamy (spójnie z „w świecy wejścia tylko SL”, zachowawczo). W oknie 1s różnica to 1 s.
7. **Dokładka przed wyzwoleniem:** próg przeliczony od nowej średniej (§3.5 modelu). Po wyzwoleniu dokładka nie przesuwa SL (plakietka pokazuje „SL”, bo poziom ≠ nowe BE).
8. **Wyjście częściowe przed wyzwoleniem:** próg `$` przeliczony od nowej otwartej ilości, inne jednostki bez zmian.
9. **Offset:** BE+2t dla Long = poziom BE + 0,50. Przy offsecie ≠ 0 `be = false`, a plakietka pokazuje „BE+2t”. Do Notion `be` idzie tylko przy SL dokładnie na poziomie BE (decyzja gustu: statystyka „po BE” bez zmian).
10. **Cofnięty kursor** (przeglądanie): silnik nie przetwarza świec (znak wodny), więc auto-BE nie wyzwala się drugi raz.
11. **Preset z TP w R:R przy SL 0:** odrzucony w edytorze.
12. **Preset z wielkością z ryzyka i SL dającym 0 kontraktów:** Kup nieaktywny z komunikatem „Ryzyko za małe na ten SL” i przyciskiem „Użyj 1 kontraktu” (jak final P2-5).
13. **Synchronizacja ustawień z drugim urządzeniem:** presety przechodzą `sanitizeSettings` (klucze bez `key`/`hotkey`). Zły wpis jest odrzucany przez `sanitizeBt` bez psucia pozostałych.
14. **Preset usunięty, gdy jest aktywny:** aktywny wraca na `Brak`.

## Zmiany modelu danych i migracja

- Pozycja i zlecenie: `autoBe` (model §2.5) już w kształcie od 1.7-1. Tu zaczyna działać.
- Silnik:
  - `modifyPosition(…, { autoBe })`, gdzie `autoBe: null` wyłącza;
  - `advance` krok 4;
  - zdarzenie `be-auto`;
  - funkcja `autoBePrice(pos)` (czysta, dla znacznika i podglądu).
- Ustawienia `bt`:
  - `presets: Preset[]`;
  - `activePreset: id|null`;
  - `beOffset: 0..20`.
  - `Preset = { id, name, sl: { unit: 'pts'|'ticks', value } | null, tps: [{ unit: 'pts'|'ticks'|'rr', value, pct: 100 }], size: { mode: 'session'|'usd'|'pct'|'qty', value }, autoBe: { kind, value, offsetTicks } | null }`.
  - Wszystko przez `sanitizeBt` (liczby skończone i w zakresach, nazwa do 24 znaków, najwyżej 20).
- Pamięć panelu `thq.bt.ord.v1`: dochodzi pole `abe` (stary zapis bez niego = wyłączone).
- Sesje 1.6.x: bez zmian (brak `autoBe` = wyłączone).

## Notion

- Pola trade'a bez zmian. `be` jak w modelu §3.4.
- Presety jadą w bloku ustawień w Notion (istniejący mechanizm synchronizacji ustawień). To nie jest zmiana schematu bazy trade'ów, tylko nowy klucz w JSON bloku. Rozmiar: budżet 30 000 znaków.
- Zdarzenie auto-BE nie idzie do Notion (brak pola, pytanie P-N1).

## Pliki

- Zmień:
  - `public/js/bt-wypelnienia.js`: `advance` krok 4, `autoBePrice`, walidacja `autoBe`;
  - `public/js/bt-zlecenia.js`: pola auto-BE, chipy presetów, „Zapisz jako preset…”, pamięć `abe`;
  - `public/js/bt-czas.js`: `btDefaults`, `sanitizeBt`, `PRESETS_MAX`;
  - `public/js/ustawienia.js`: sekcja „Presety zleceń”, offset;
  - `public/js/app.js`: zapis `presets`/`activePreset` przez `saveSettings`;
  - `public/js/bt-wykres.js`: znacznik progu;
  - `public/js/bt-szuflada.js`: kolumna „Auto BE”;
  - `public/js/bt-replay.js`: zdarzenie `be-auto`, komunikat;
  - `public/js/bt-journal-okno.js`: fakt „Auto BE 10:14:35”;
  - `public/features.css`;
  - `public/i18n/en.json`;
  - `docs/plany/backtest/00-wspolne.md` (sekcja Ustawienia);
  - `postep.md`.
- Utwórz:
  - `testy/backtest-173-auto-be.mjs`;
  - `testy/backtest-173-presety.mjs`;
  - `testy/backtest-173-strona.mjs`;
  - `testy/backtest-173.html` (`?part=bilet|pozycja|presety|ustawienia|375`).

## Testy napisane najpierw (ślad → `backtest-wyniki/173-czerwone.txt`)

Node:
- `backtest-173: auto BE w R, pkt, tickach, $ i cenie: próg w cenie (autoBePrice)`
- `backtest-173: wyzwolenie przesuwa SL od następnej świecy; w świecy wyzwolenia działa stary SL`
- `backtest-173: świeca wejścia nie wyzwala progu`
- `backtest-173: SL lepszy niż BE nie jest pogarszany`
- `backtest-173: auto BE bez SL (pkt) ustawia SL; następna świeca z luką wykonuje stop po open`
- `backtest-173: próg R bez SL odrzucony; po usunięciu SL zostaje uzbrojony`
- `backtest-173: dokładka przelicza próg; po wyzwoleniu nie przesuwa SL`
- `backtest-173: offset BE+2t; be w trade tylko bez offsetu`
- `backtest-173: znak wodny: cofnięcie i ponowny przebieg nie dają drugiego be-auto`
- `backtest-173: sanitizeBt presetów (zakresy, nazwy, limit 20, budżet, zły wpis nie psuje reszty)`
- `backtest-173: preset → zlecenie (SL/TP w pkt, tickach i R:R, wielkość z czterech trybów)`
- `backtest-173: presety przechodzą sanitizeSettings bez wycięcia`

Strona:
- `bilet: auto BE z jednostkami, podgląd progu, R bez SL nieaktywne`
- `pozycja: znacznik aBE, edycja i wyłączenie w panelu ×, wyzwolenie z komunikatem i plakietką BE`
- `chipy presetów: aktywacja wypełnia pola, Kup jednym kliknięciem z SL/TP/auto BE, edycja odłącza`
- `Zapisz jako preset… z panelu`
- `Ustawienia: lista, edytor z walidacją, kolejność klawiaturą, usunięcie aktywnego`
- `375: chipy przewijane w panelu, bez poziomego przewijania strony`

e2e: preset „Runner” (SL 15 pkt, TP 3R, auto BE 1R) na kopii świec NQ 1s. Wejście jednym kliknięciem, wyzwolenie auto-BE, wyjście po BE: trade z `be: true`, `r` 0 ± prowizja. Odtwarzanie 100× z uzbrojonym auto-BE: 0 klatek > 34 ms.

## Kryteria odbioru

- `backtest-173:` zielone, pełny przebieg i e2e zielone.
- Scenariusz „wejście z SL, TP i auto-BE” = 1 kliknięcie przy aktywnym presecie (dziś: SL i TP z pamięci, bez auto-BE).
- Zrzuty: bilet z auto-BE, pozycja ze znacznikiem, chipy (1920/375), Ustawienia → Presety. Oba motywy.

## Ryzyka

- **Kolejność w świecy** (BE „ratujący” trade w świecy wyzwolenia): zasada zachowawcza i test 2.
- **Rozmiar bloku ustawień w Notion:** limit presetów i budżet znaków; test `sanitizeSettings`.
- **Mylenie BE+offset z BE w statystykach:** `be` tylko bez offsetu (krawędź 9).

## Decyzje gustu

- Jednostka „pkt” dodana obok cen, ticków, $ i R (futures liczą w punktach).
- SL wymagany tylko dla progu w R (FX Replay wymaga SL zawsze).
- Znacznik progu bez przeciągania.
- Aktywny preset wspólny dla instrumentów, wybierany chipem. Brak skrótu wyboru presetu.
- Preset bez strony, typu, tagów i strategii.
- Limit 20 presetów, nazwa do 24 znaków.

## Kroki

- [x] 1: testy (czerwone, ślad)
- [x] 2: silnik auto-BE + `autoBePrice`
- [x] 3: bilet, pozycja (znacznik, panel ×, szuflada), komunikat
- [x] 4: presety: `sanitizeBt`, chipy, „Zapisz jako preset…”, Ustawienia
- [x] 5: pełne testy, e2e, zrzuty, `00-wspolne.md`, `postep.md`, commit lokalny (gałąź `feat/1.7.0-p3`; wpis „1.7-3” w `postep.md` opisuje odstępstwa od karty)

## Dopisek 2.11.2026: próg BE ustawiany na pozycji (słowa użytkownika)

Słowa użytkownika (2.11.2026, ze zrzutami ręcznie narysowanej linii „be” w zysku i SL przesuniętego na wejście): «czy bedzie taka funkcja zrobiona ze da sie ustawic cene w proficie gdzie automatycznie bedzioe przechodzic na be, tak jak na zdjeciach ale tam zrobilem to manualnie a chodzi o to zeby bylo mozliwe dodania takiego miejsca na pozycji gdzie stanie sie nastepujaca czynnosc, na backtestingu jak i na normalnym journalingu powinno byc miejsce do wpisania gdzie trade jest juz bez ryzyka»

Co z tego wynika dla pakietu 3 (zastępuje sprzeczne punkty powyżej):
1. **Próg dodaje się na pozycji, nie tylko w bilecie i panelu ×.** Przy linii wejścia obok `+SL` i `+TP` jest `+BE` (próg auto-BE). Klik stawia próg domyślnie na +1R (bez SL: w połowie drogi do TP, a bez TP: +10 pkt), potem przeciąga się go jak SL/TP z odczytem ceny, pkt, $ i R. Znacznik progu **przeciąga się** (zastępuje „Nie przeciąga się (decyzja gustu)” z sekcji B). Usuwanie `×` z Cofnij, jak SL/TP.
2. **Wygląd jak na zrzutach użytkownika:** linia progu na szerokości pozycji, podpis „BE” nad linią po prawej, bez podkładki. Po wyzwoleniu linia progu znika, a plakietka SL zmienia się w „BE” na poziomie wejścia (jak trzeci zrzut).
3. **Notion, pole „BE” (migracja 004, P26/P27):** w dzienniku to pole już znaczy „cena w zysku, przy której trade staje się bez ryzyka” (rysunek pozycji: `style.beLevel` = odległość od wejścia w stronę zysku, linia „BE”). Backtest ma wysyłać tam **tę samą treść**: cenę progu auto-BE, który się wyzwolił; przy ręcznym BE: cenę bieżącą w chwili przesunięcia SL na BE. Pakiet 1 wysyła dziś cenę wejścia, gdy `be` — do poprawy w pakiecie 3 (i test). Bez zmiany schematu (P-N1 dalej obowiązuje). Zastępuje G-3.4 w tej części.
4. **Okno Journal trade'a z backtestu** pokazuje linię BE na pozycji tak jak dziennik (ta sama geometria `positionExtras`).
5. **Dziennik (zwykły journaling):** pole „BE” w formularzu i linia BE na rysunku pozycji już są (P26/P27). Pakiet 3 sprawdza tylko, że oba miejsca są widoczne i opisane („BE: cena, przy której trade jest bez ryzyka”), bez nowych pól.
