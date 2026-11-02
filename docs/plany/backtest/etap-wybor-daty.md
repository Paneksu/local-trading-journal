# Wybierak daty i godziny (1.6.1)

> Słowa użytkownika (1.11.2026): «stworz w naszym stylu design okna ustawiania czasu i daty, ma byc proste w uzytku najlepiej».
> Zasady wspólne: `00-wspolne.md` (tokeny, `t()` + `en.json`, 1920 bez przewijania, 375 bez poziomego). Gałąź `feat/wybor-daty` od `fix/kreator-ladowanie`.

## Komponent

- `public/js/wybor-daty-logika.js`: czysta logika (Node i przeglądarka): odczyt wpisanej daty PL `dd.mm.rrrr` / EN `mm/dd/yyyy` / ISO, nazwy miesięcy, rok dwucyfrowy i brak roku przy zatwierdzeniu, min/max, ruch klawiaturą (APG), siatka 6 tygodni od poniedziałku, kroki godziny z przeniesieniem i zawinięciem doby.
- `public/js/wybor-daty.js`: pole `input[data-wd="date|time"]` podłącza się samo (MutationObserver). `el.value` dalej zwraca `RRRR-MM-DD` / `GG:MM`, `el.value = …` ustawia, FormData dostaje ten sam format (zdarzenie `formdata`). Zdarzenia: `input` przy zmianie wartości, `change` po zatwierdzeniu (wybór, Enter, wyjście z pola). Okno w warstwie górnej (`popover="manual"`), w drzewie obok pola (klik w oknie jest „w środku” Ustawień i formularzy). ARIA: pole `combobox` + `aria-haspopup="dialog"`, okno `dialog`, siatka `grid` z `aria-selected`, `aria-current="date"`, `aria-disabled` i powodem w `title`; godzina: dwa `spinbutton`. Na ≤ 1023 px arkusz od dołu z celami 44 px.
- Atrybuty: `min`, `max`, `data-wd-tz="NY"`, `data-wd-presety`, `data-wd-pusty` („Wyczyść”), `data-wd-poza` (powód dla dni spoza zakresu); `setDayRule(el, fn)` dla dni bez danych.
- Style: `public/features.css` (sekcja „wybierak daty i godziny”), tylko tokeny motywu, ruch wyłączany przy `prefers-reduced-motion`.

## Pola podmienione (wszystkie natywne `type="date"` / `type="time"` w `public/js`)

- [x] Kreator sesji backtestu: „Data startu” (`bt-kreator.js`, `name="from"`): min/max z zakresu danych, dni bez świec i weekendy przekreślone z powodem.
- [x] Kreator sesji backtestu: „Godzina startu (NY)” (`name="startTime"`): etykieta NY, presety 09:00 / 09:30 / 10:00 / 11:00.
- [x] Filtr dni (kreator, warunek „Zakres dat”): „Od” i „Do” (`bt-filtr-widok.js`, `data-p="from|to"`), mogą być puste.
- [x] Ustawienia → Backtest → Domyślne wartości: „Godzina startu (NY)” (`ust-backtest.js`, `data-btd="startTime"`), NY i presety.
- [x] Ustawienia → Backtest → Skoki: wartość skoku „Godzina NY” (`data-btf="cel.at"`), NY i presety.
- [x] Ustawienia → Źródła danych → Kredyt Databento: „Ważny do” (`ust-zrodla.js`, `#sv-cr-exp`); ten sam znacznik w kreatorze pierwszych kroków (krok Dane rynkowe).
- [x] Ustawienia → Źródła danych → Import historii: „Od” i „Do” (`#sv-imp1m-from|to`, `#sv-imp1s-from|to`), min zostaje.
- [x] Ustawienia → Wykresy → Nakładki: godziny sesji Azja / Londyn / NY, początek i koniec (`ust-wykresy.js`, `data-ovt`), etykieta NY.
- [x] Okno nakładek na wykresie (podgląd trade'a): godziny sesji (`podglad.js`, `data-ovk="sess.*"`), etykieta NY; walidacja `GG:MM` przez `data-wd` zamiast `type`.
- [x] Formularz trade'a: „Data wejścia”, „Godzina wejścia”, „Data wyjścia”, „Godzina wyjścia” (`form.js`), godziny i data wyjścia mogą być puste.
- [x] Prop: „Data zakupu” konta i „Data” wpisu finansów (`prop.js`).
- [x] Kalendarz newsów: „Wybierz dzień” (`kalendarz.js`, `data-cal-date`), min/max jak dotąd.
- [x] Statystyki / Trade'y: wybór okresu to własny kalendarz zakresu (`period.js`) od 1.x, natywnego pola nie ma; bez zmian.
- [x] Replay: skoku do konkretnej daty ani godziny w replayu nie ma (skoki są w Ustawieniach → Backtest → Skoki, podmienione wyżej); nic do podmiany.

## Testy

- [x] `testy/backtest-wybor-daty.mjs`: logika w Node (PL/EN, ISO, nazwy miesięcy, rok dwucyfrowy, luty przestępny, przełom roku, siatka od poniedziałku, min/max, godzina), źródła bez natywnych pól, komponent na `testy/wybor-daty.html` (wartość, zdarzenia, FormData, klawiatura i ARIA, zakres i dni wyłączone, godzina, 375 px, EN) i podmienione pola na dashboardzie testowym (`testy/scen-wybor-daty.js`): każde zapisuje tę samą wartość co natywne pole.
- [x] Testy zastąpione: `testy/nakladki-p32.html` i `testy/wykresy-e2e-p32.mjs` liczyły `input[type="time"]` w oknie nakładek; teraz `input[data-wd="time"]` (ta sama liczba pól).
- [x] Pełny przebieg `node testy/run.mjs` i e2e backtestu zielone (`backtest-wyniki/wybor-daty.txt`, `wybor-daty-e2e.txt`).
- [x] Zrzuty Onyx i Platinum, 1920 i 375: `backtest-wyniki/wybor-daty/`.
