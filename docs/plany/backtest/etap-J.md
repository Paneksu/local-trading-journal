# Etap J: rysunek pozycji jak w TradingView + wejście według rysunku (dodatkowy pakiet 1.5.0)

> Karta = brief sesji głównej z 30.10.2026. Zasady wspólne: `00-wspolne.md`. Stan: `postep.md` (wpis J).

## Cel (słowa użytkownika 30.10.2026)

Słowa użytkownika: «ulepsz jeszcze rysunek pozycji long short tak zeby dzialalo i wygladalo jak na tradingview ale nie usuwujac naszych zadnych roznic ktore aktualnie sa tylko dodajemy to czego brakuje w ustawieniach tego rysunku i ogolnie, oraz w backtescie powinna byc funkcja ze jak mamy zaznaczony dana pozycje rysunek to mozna na podstawie tego wejsc w ta sama pozycje co rysunek, jest takie rozwiazanie w fx replay».

Odpowiedzi użytkownika (klasa trzecia, komentarz `// [U] 30.10.2026 «…»` w miejscu zmiany):
1. Zakres: «Wszędzie» (edytor wykresu trade'ów Live i replay backtestu: ten sam rysunek, jedne ustawienia).
2. Podpisy: «Domyślnie włączone jak TV» (cel i stop: cena, ticki, %, kwota; środek: P&L, ilość, R:R; wyłączalne). Zmienia P27 (28.10.2026: `NO_STATS`, `showPriceLabels: false`). Pozycja z pól trade'a Live: bez liczby kontraktów, więc bez kwot i ilości.
3. Typ zlecenia: «Automatycznie» (wejście = bieżąca cena ± 1 tick → market; inaczej limit albo stop wg strony ceny; SL i TP z rysunku).
4. Wielkość i los rysunku: «Ryzyko sesji, rysunek znika» (`sizeFromRisk` jak panel; po złożeniu zlecenia rysunek usunięty z rysunków sesji).

## TradingView vs my vs dodajemy

Źródło: pomoc TradingView „Long position drawing tool” (43000517002) i „How to use Long and Short Position drawing tools” (43000475660), odczyt 30.10.2026; paczka `lightweight-charts-drawing` 0.6.2 (opcje `positionStats`, `compactStats`, `showStats`, `accountSize`, `riskDisplayMode`, `riskAmount`, `riskPercent`, `lotSize`, `leverage`, `qtyPrecision`).

| TradingView | My przed J | J |
|---|---|---|
| Wejścia: Konto (account size) | brak | dodane (`accountSize`); replay: domyślnie saldo sesji |
| Wejścia: Ryzyko (kwota albo % konta) | brak | dodane (`riskDisplayMode` money/percents, `riskAmount`, `riskPercent`); replay: domyślnie ryzyko sesji |
| Wejścia: Cena wejścia | tylko przeciąganie | dodane pole |
| Wejścia: Poziom zysku / stopu w tickach i cenie | tylko przeciąganie | dodane (ticki i cena, oba sposoby) |
| Wejścia: Wielkość lota (lot size) | brak | pominięte: kontrakt futures = 1, mnożnik z instrumentu (`MULT`) |
| Wejścia: Dźwignia (leverage) | brak | pominięte: wielkość z ryzyka jak panel zleceń; depozyt futures nie jest dźwignią konta |
| Wejścia: Precyzja ilości | brak | pominięte: kontrakty całkowite (`floor`, jak `sizeFromRisk`) |
| Styl: linie (kolor, grubość) | brak w panelu | dodane |
| Styl: kolor i krycie stopu / celu | brak w panelu (tokeny) | dodane (kolor ręczny przestaje iść za motywem, jak H2) |
| Styl: tekst (kolor, rozmiar) | brak | dodane |
| Styl: ceny na osi (price labels) | wyłączone (P27) | dodane, własne etykiety osi w kolorach tokenów (zaznaczona/najechana pozycja) |
| Styl: statystyki (wybór pozycji: cena, %, ticki, kwota; P&L, ilość, R:R) | wyłączone (`NO_STATS`), sam napis R:R | dodane, domyślnie włączone ([U] 2); rysowane przez nas (PL/EN, kwoty z mnożnika kontraktu) |
| Styl: tryb kompaktowy | brak | dodane (`compactStats`) |
| Styl: zawsze pokazuj statystyki | brak | dodane (`showStats`); bez tego jak TV: po zaznaczeniu albo najechaniu |
| Widoczność per interwał | brak | pominięte: żaden nasz rysunek jej nie ma, edytor nie przekazuje interwału paczce |
| Wykres: strefa P&L i strzałka przebiegu ceny | paczka rysuje | bez zmian |
| Wykres: uchwyty wejścia, stopu, celu, prawej krawędzi | paczka | bez zmian (+ nasze BE i wyjście) |
| Wykres: podpisy w trakcie przeciągania | – | statystyki widoczne, bo rysunek jest zaznaczony |
| — | BE (linia, przeciąganie), wyjście (`exitLevel`), R:R bez zaznaczenia, kolory z tokenów i motywu, „Pozycja trade'a” z zapisem, przyciąganie do świecy, blokada pozycji z pól | zostaje bez zmian |

## Kroki

- [x] Brief zapisany jako karta
- [x] Ustalenie, co ma TradingView (tabela wyżej)
- [x] Ustalenie, co ma paczka 0.6.2 (pigułki po angielsku, kwoty bez mnożnika kontraktu, kolory osi na sztywno → rysujemy sami, paczka z `NO_STATS`)
- [x] Testy czerwone `testy/backtest-J-*.mjs` (+ `testy/backtest-J.html`), uruchomione, ✗ zanotowane
- [x] Moduł czysty `public/js/pozycja-staty.js` (statystyki, teksty, zlecenie z rysunku)
- [x] Rysowanie podpisów i etykiet osi (`extrasPrimitive` w wykres.js), komentarze P27 zaktualizowane decyzją [U] 2
- [x] Panel stylu pozycji: Wejścia / Styl / Podpisy (rysunki.js), `STYLE_KEYS`, domyślne konto i ryzyko z sesji w replayu
- [x] Panel zleceń: „Wejdź według rysunku” + skrót `drawEntry` (bt-zlecenia.js, bt-czas.js, ustawienia.js, bt-replay.js)
- [x] i18n (en.json), zielone testy J i `wykresy-*`
- [x] Zrzuty Onyx/Platinum 1920 do `backtest-wyniki/J/`
- [x] Pełny `node testy/run.mjs` → `backtest-wyniki/J.txt`, `node testy/backtest-e2e.mjs` → `J-e2e.txt`
- [x] Commit lokalny, wpis J w `postep.md`
