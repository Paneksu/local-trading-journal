# Etap 18: filmy z wykresem i wynikiem (pakiet J, Opus)

Najpierw `00-wspolne.md`. Po pakiecie: `code-reviewer` (karty, filmy, Ustawienia; plus kontrola, że klucz Databento nie trafia do bloku synchronizacji, a film tła nigdzie nie wychodzi).

## Cel
W oknie Udostępnij segment `.seg` „Obraz | Film”. Film MP4 (WebM jako zapas), BEZ DŹWIĘKU (P21): animowana karta (wykres rysuje się, licznik wyniku rośnie, tabela wchodzi) na tle motywu, zdjęcia albo filmu z dysku użytkownika.

## Przeczytaj
- `public/js/udostepnij-render.js`: `grep -n`; 187-197 (`paintBackground`, `SCRIM`), 229-255 (`heroSize`, `shadowOnly`, `drawHero`), 328-340 (`renderCard`), 343-409 (`drawLayout`), `fmtMetric` 52, `fileName` 410.
- `public/js/udostepnij.js`: 96-135 (`createShare`, `open`), 164-250 (`build`, `draw`, `seg`), 253-300 (`download`, `copy`, `share`, `onFile`); `public/js/modal.js` (`toast`).
- `testy/udostepnij-podglad.html` (wzór dla `testy/film-podglad.html`), `public/js/geometria.js` (`markerStyle`: tło filmu → `'video'` = pigułki).
- Karty z etapów 16-17 (krzywa, wykres trade'a) już istnieją.

## Utwórz / zmień
- `public/js/film.js` (nagrywanie: `<video>` tła, pętla klatek, `MediaRecorder`; NIE rysuje), `public/js/udostepnij-render.js` (`renderCard(canvas, { …, at })`: czas w s od startu, `at: Infinity` = obecny PNG piksel w piksel; `easeOutCubic`, `OffscreenCanvas` na warstwy statyczne), `public/js/udostepnij.js` (UI filmu), `testy/film-podglad.html`, `public/i18n/en.json`, `testy/wykresy-18.mjs`.

## Oś czasu (decyzje gustu, `at` w sekundach)
0-1,0 tło, nagłówek (symbol, kierunek, data) wchodzi w 0,3 s | 1,0-3,0 wykres rysuje się od lewej (świece kolejno, linia przez `clip`), krzywa kapitału tak samo, licznik wyniku 0 → wartość (`fmtMetric`) | 2,6-3,4 tabela wiersz po wierszu (przezroczystość + przesunięcie 24 px, co 80 ms) | 3,0-3,4 znaczniki wejścia/wyjścia | 3,4-koniec wszystko stoi, tło gra dalej; podpis „JustJournal × nick” od początku. Bez wykresu (EURUSD, brak świec): film bez pasa wykresu.

## Opcje na start (P17: minimum)
Format 9:16 (1080×1920) i 16:9 (1920×1080); jakość 1080p/720p (720p = skala 2/3 tego samego układu); długość 6/10/15 s (domyślnie 10; krótszy film tła zapętla się); tło Motyw/Zdjęcie/Film (`<input type="file" accept="video/*">`, `URL.createObjectURL`, element `<video muted>`; NIGDY `fetch`/XHR/`localStorage`, nie zapamiętywany między otwarciami); czarno-białe (`ctx.filter = 'grayscale(1)'`, wykryj wsparcie `'filter' in ctx` + próba na 1 px, przy braku ukryj przełącznik) i suwak przyciemnienia (domyślnie `SCRIM 0.6`). Notka pod wyborem pliku: „Film zostaje na tym urządzeniu. Używaj tylko nagrań, do których masz prawa (także muzyki).” Domyślne z `settings.chart` (etap 14). Bez rozmycia, bez 4:5/1:1, bez dźwięku.

## Nagrywanie
`canvas.captureStream(60)` (bez toru audio, zero `AudioContext`/`createMediaElementSource`), `MediaRecorder` z pierwszym wspieranym typem (`isTypeSupported`): `video/mp4;codecs=avc1.640028`, `video/mp4`, potem WebM VP9/VP8 z notką „Instagram i TikTok wolą MP4: nagraj w Chrome albo Edge”. Bitrate 12 Mb/s (1080p), 6 Mb/s (720p) (Szacunek). Pomiar czasu klatki (średnia, p95); gdy p95 > 14 ms nagrywanie samo przechodzi na 30 kl./s z etykietą „30 kl./s”. Warstwy statyczne w `OffscreenCanvas` (nagłówek, podpis, tabela po wejściu, cień liczby raz). Pasek postępu „Nagrywanie 4 / 10 s, nie przełączaj karty” i „Anuluj”; ukrycie karty = ostrzeżenie/przerwanie. Wynik: „Pobierz MP4”, na telefonie „Udostępnij” (`navigator.canShare({ files })`), „Kopiuj” ukryte dla filmu; nazwa jak `fileName()` z `.mp4`/`.webm`.

## Testy najpierw (`wykresy-18:`)
- Oś czasu: stan elementów dla `at` = 0, 1, 2, 3,4, ∞; licznik monotoniczny i kończy na dokładnej wartości; `at: ∞` = PNG piksel w piksel (skrót z etapu 16 jako baza).
- Wybór typu nagrania (`isTypeSupported`: MP4 → WebM z notką); strumień ma 0 torów audio; w kodzie brak `AudioContext`; film tła nie trafia do `fetch`/`XMLHttpRequest`/`localStorage` (atrapa `fetch` + grep).
- Przeglądarka headless (etap 6): 2 s nagrania 1080×1920 daje plik, który `<video>` odczytuje z właściwym rozmiarem i długością ±0,1 s (jeśli `--virtual-time-budget` psuje MediaRecorder, uruchom w czasie rzeczywistym; brak przeglądarki: „pominięty”); pomiar czasu klatki do raportu.
- Ręcznie (zrzuty ≤ 4 + 1 nagranie testowe 2 s, nie zrzut): czarno-białe, przyciemnienie, zapętlenie, „Anuluj”, ostrzeżenie przy ukryciu karty.

## Gotowe, gdy
Testy zielone; plik testowy MP4 gotowy do ręcznego uploadu. Pytanie P20 w raporcie: czy użytkownik wrzuci 1 testowy MP4 (prywatnie/szkic) na Instagram i TikTok; odrzucenie → etap 18b.

## Nie rób
Nie dodawaj WebCodecs, muxera, `mp4-muxer` ani dźwięku. Nie wysyłaj filmu tła nigdzie. Nie rób uploadu na platformy (konta użytkownika).

## Fakty (27.10.2026, PRZETESTOWANE)
Edge 156 headless: `isTypeSupported` true dla `video/mp4`, `avc1.42E01E`, `avc1.640028`, WebM VP9/VP8. Chromium 151: 2 s 1080×1920 → `video/mp4;codecs=avc1.640028`, 1,9 MB, `ftyp/isom`, `<video>` czyta 1080×1920 i 2,01 s. Z torem audio wynik był MP4 fragmentowanym (`ftyp, moov, moof/mdat ×4, mfra`); bez audio zapewne podobnie (WYWNIOSKOWANE). MP4 w Chrome od ok. 126 (WYWNIOSKOWANE); Safari MP4 natywnie, Firefox raczej WebM. Karta przeglądarki musi być widoczna (rAF staje w tle). Przyjęcie fMP4 przez IG/TikTok: nieznane (P20, WYWNIOSKOWANE).
