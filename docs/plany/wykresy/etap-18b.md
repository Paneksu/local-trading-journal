# Etap 18b (warunkowy): przepakowanie MP4 fragmentowanego na zwykły MP4 w czystym JS

Najpierw `00-wspolne.md`. Uruchamiaj TYLKO po słowach użytkownika, że Instagram albo TikTok odrzuciły testowy plik z etapu 18 (P20). Osobne wznowienie pakietu J, nie część domyślnego przebiegu.

## Cel
Funkcja bez bibliotek zamieniająca nagranie MediaRecorder (MP4 fragmentowany: `ftyp, moov(+mvex), moof/mdat…, mfra`) na zwykły MP4 `ftyp, moov(stbl), mdat`, żeby platformy przyjęły plik.

## Przeczytaj
- `public/js/film.js` (etap 18: miejsce, gdzie powstaje `Blob`).
- Wyniki raportu etapu 18: struktura boxów faktycznie nagranego pliku (jeśli jej tam nie ma, odczytaj ją z pliku testowego prostym parserem boxów).
- Nic z sieci i żadnych bibliotek (zakaz `mp4-muxer`, ffmpeg.wasm, npm).

## Utwórz / zmień
`public/js/mp4-plain.js` (czysta funkcja `ArrayBuffer → ArrayBuffer`, Szacunek 150-250 linii), podpięcie w `film.js` tylko dla typu `video/mp4`, `testy/wykresy-18b.mjs`, `public/i18n/en.json` jeśli nowe teksty.

## Zasady
- Zbierz próbki z `moof/traf/trun` (rozmiary, czasy trwania z `tfhd`/`trun`, flagi próbek, przesunięcia kompozycji) i dane z `mdat`; zbuduj jeden `mdat`, a w `moov/trak/mdia/minf/stbl`: `stts`, `stsc`, `stsz`, `stco` (albo `co64`), `stss` (próbki kluczowe), `ctts` gdy są przesunięcia; `stsd` skopiuj bez zmian; usuń `mvex`; zaktualizuj długości w `mvhd`/`tkhd`/`mdhd`. `moov` PRZED `mdat` albo poprawne przesunięcia `stco` po przeliczeniu.
- Wynik odtwarzalny w `<video>`; liczba próbek i długość bez zmian.

## Testy najpierw (`wykresy-18b:`)
Na syntetycznym fMP4 zbudowanym w teście (kilka `moof/mdat`, próbki klatek kluczowych i nie): struktura wyniku `ftyp, moov(stbl), mdat`, brak `moof` i `mfra`; ta sama liczba próbek i długość; `stco` wskazuje poprawnie początek każdej próbki; w przeglądarce headless (etap 6) `<video>` czyta rozmiar i długość ±0,1 s; ponowny upload przechodzi (ręcznie, użytkownik).

## Gotowe, gdy
Testy zielone, plik testowy dla użytkownika gotowy do ponownego uploadu.

## Nie rób
Nie dodawaj zależności ani dźwięku. Nie dotykaj kodu nagrywania poza podpięciem funkcji. Nie rób uploadu na platformy.

## Fakty
- MediaRecorder w Chrome daje MP4 fragmentowany (PRZETESTOWANE z torem audio, 27.10.2026); platformy zwykle przekodowują, ale tego nie sprawdzono (R16, WYWNIOSKOWANE).
- Plan B z planu: przepisanie `moof/trun` na `stbl`, bez biblioteki.
