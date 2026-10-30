# Etap D2: rysunek „callout” we wszystkich wykresach

Model: **Sonnet**. Review po pakiecie: brak. Najpierw `00-wspolne.md`.

## Cel
Nowe narzędzie rysowania callout (§14): dymek z tekstem i grot ogona przypięty do czasu i ceny, oba punkty przeciągane, styl jak inne rysunki z tekstem. Działa wszędzie: edytor (Live i replay), podgląd SVG (`geometria.shapes`), miniatury, karty i filmy Udostępnij.

## Fakt sprawdzony przy pisaniu planu (30.10.2026, PRZETESTOWANE grepem)
Paczka 0.6.2 ma rodzaj `callout`: `public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js:409` — `{ kind: "callout", pointCount: 2, textEditable: true, defaults: { color: "#0097a7", width: 2, textColor: "#ffffff", fontSize: 14, backgroundColor: "#0097a7", transparency: 50, wordWrap: false, wordWrapWidth: 200 } }`, renderer od linii 2235 i 5398 (punkt 1 = szerokość zawijania, min. 100), kotwica tekstu 6556. Decyzja [B]: **używamy rodzaju z paczki**, bez własnego. Domyślne kolory paczki nadpisuje `styleFor` tokenami (bez literałów w naszym kodzie).

## Przeczytaj
- `public/vendor/lightweight-charts-drawing/lightweight-charts-drawing.es.js` 405-412, 2230-2260, 5395-5420, 6550-6560 (tylko te zakresy).
- `public/js/rysunki.js` 69-130 (`ICONS`, `TOOL_LABEL`, `TOOLS`, `styleFor`, `STYLE_KEYS`), 256-278 (`panelFor`), 570-580 (`textGrp`).
- `public/js/geometria.js` 130-180 (`KINDS`, `textPart`, początek `shapes`), 273-281 (przypadek `text`: wzór), 330-364 (`TEXT_KINDS`, `textSlot`, `drawingShapes`).
- `lib/drawings.mjs` 36-50 (`parseDoc` przez `parseDrawings` paczki).
- `testy/zgodnosc-rysunkow.html` (wzór porównania paczka vs SVG), `testy/wykresy-06.mjs` 110-125.

## Pliki
- Zmień: `public/js/rysunki.js` (`TOOLS`, `ICONS`, `TOOL_LABEL`, `styleFor`, `panelFor`), `public/js/geometria.js` (`KINDS`, `shapes` przypadek `callout`, `TEXT_KINDS` jeśli edycja w miejscu tego wymaga), `public/styles.css` albo `public/features.css` (klasa części SVG, jeśli potrzebna), `testy/zgodnosc-rysunkow.html` (dodany callout), `public/i18n/en.json`.
- Utwórz: `testy/backtest-D2-callout.mjs`.

## Interfejsy
- Consumes: `parseDrawings` paczki, `textPart(…)` z `geometria.js:160`, `drawingShapes(list, s)`.
- Produces: `TOOLS` zawiera `'callout'` (po `'text'`); `KINDS` zawiera `'callout'`; `shapes({ kind: 'callout', points: [grot, dymek], style }, s) → { parts: [{ t: 'path', cls: 'drw-callout' …}, { t: 'text', cls: 'drw-text' … }] }`; `panelFor('callout') → ['callout']` (tło, ramka, tekst, rozmiar, pogrubienie).

## Zadanie 1: walidacja i geometria
- [x] **Testy** `testy/backtest-D2-callout.mjs`:
  - `backtest-D2: parseDoc przyjmuje callout` — `parseDoc({ v:1, at, d:[callout] })` bez błędu; callout z 1 punktem → błąd „Nieprawidłowe dane rysunków.”
  - `backtest-D2: geometria calloutu` — `shapes(callout, s)`: część `path` (prostokąt z zaokrągleniem + ogon zwężający się do grota), grot dokładnie w `(s.x(t0), s.y(p0))`, tekst w środku dymku, kolory z `style` (tło, ramka, tekst), pogrubienie przez `fontWeight`.
  - `backtest-D2: callout w drawingShapes` — lista z calloutem daje kształty (podgląd, miniatury i karty używają tej funkcji).
  - `backtest-D2: pamięć stylu` — `pickStyle` zachowuje `backgroundColor`, `textColor`, `fontSize`, `bold`, `color` dla calloutu (`STYLE_KEYS`); `styleFor('callout', c)` bierze kolory z tokenów `c`.
  - `backtest-D2: zgodność z paczką` — `testy/zgodnosc-rysunkow.html` rozszerzona o callout: położenie grota i środka dymku SVG vs paczka ≤ 2 px (uruchamia `wykresy-06`).
- [x] `node testy/run.mjs backtest-D2` → FAIL; zaimplementuj; testy zielone.

## Zadanie 2: narzędzie w edytorze
- [x] **Test** (ten sam plik, strona `testy/edytor-wykresu.html` albo `backtest-uklady.html`): `backtest-D2: narzędzie callout` — przycisk z ikoną i etykietą „Callout” na pasku; dwa kliknięcia tworzą rysunek; dwuklik otwiera edycję tekstu w miejscu (Enter zapisuje, Esc anuluje); przeciągnięcie grota zmienia tylko punkt grota.
- [x] Zaimplementuj ikonę (SVG `currentColor`), etykietę przez `t('Callout')`, panel stylu `callout`.
- [x] Pełny przebieg; commit `dodaje rysunek callout`; wpis w `postep.md`. Zrzuty: najwyżej 2 (callout w edytorze i w podglądzie SVG, Onyx i Platinum).

## Gotowe, gdy
Callout rysuje się, edytuje i zapisuje w edytorze Live i w replayu, wygląda tak samo w podglądzie SVG i w karcie Udostępnij; `backtest-D2:` i `wykresy-06` zielone.

## Nie rób
Zasada „bez zaokrąglonych podkładek pod tekstem” nie dotyczy calloutu (§14), ale nie dotyczy też niczego więcej: nie dodawaj podkładek innym rysunkom.
