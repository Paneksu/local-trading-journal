# Pakiety wykonania modułu wykresów (1.3.0)

Każdy pakiet = nowy agent z czystym kontekstem. Czyta `00-wspolne.md`, karty swoich etapów i pliki z kart. Bez równoległości (jeden worktree, wspólne testy). Poprawki po review: wznowienie TEGO SAMEGO agenta przez SendMessage. Po każdym pakiecie lokalny commit na `feat/wykresy`, bez push (P22). Pytania do użytkownika zbiera sesja główna z raportu pakietu.

| Pakiet | Etapy | Model | Zrzuty | Review po pakiecie | Przykładowy opis commita |
|---|---|---|---|---|---|
| K0 | podział planu na karty (ten katalog) | Sonnet | 0 | brak | `dodaje plan modułu wykresów i karty etapów` |
| A | 0, 1, 2 | Sonnet | 0 | brak | `dodaje biblioteki wykresów, agregację świec i magazyn świec` |
| B | 3, 4 | Sonnet | 0 | `code-reviewer` + `security-auditor` (klucz, sieć, pieniądze, `guardWrite`) | `dodaje klienta Databento i API świec` |
| C | 5 | Sonnet | 0 | brak | `dodaje migrację 003 i pola cen oraz rysunków` |
| D | 6, 7 | Opus | do 4 | brak | `dodaje geometrię rysunków i podgląd wykresu` |
| E | 8, 9 | Sonnet | do 4 | brak | `dodaje tryb edycji wykresu i zapis rysunków w Notion` |
| F | 10, 11 | Sonnet | do 4 | `code-reviewer` (UI) | `dodaje nakładki sesji i miniatury wykresów` |
| H | 14, 15 | Sonnet | do 4 | brak | `dodaje ustawienia wykresów i styl linii zamknięć` |
| I | 16, 17 | Opus | do 4 | brak | `dodaje krzywą kapitału i wykres trade'a w kartach` |
| J | 18 (+18b osobno) | Opus | do 4 + 1 nagranie testowe 2 s | `code-reviewer` (karty, filmy, Ustawienia; klucz poza blokiem sync, film tła nie wychodzi) | `dodaje filmy z wykresem i wynikiem` |
| G | 12 | Haiku | 0 | brak | `przygotowuje wydanie 1.3.0` (tylko na polecenie wydania) |

Kolejność: K0 → A → B → C → D → E → F → H → I → J → (G). Etap 13 (replay) poza zakresem.

## Reguły przebiegu
- Zrzuty tylko w D, E, F, H, I, J: najwyżej 4 na pakiet (1920 i 375 px, Onyx i Platinum), JPEG na `R:/PROJEKTY/trading-hq-wt/wykresy-wyniki/`.
- Review czyta diff pakietu (`git diff <poprzedni commit>..HEAD`), nie całe pliki. Review po B ma `security-auditor`: klucz Databento nigdzie poza `.env` i nagłówkiem do `hist.databento.com`, `get_cost` przed `get_range`, symbole tylko `ES.v.0`/`NQ.v.0`, trasy tylko przez `guardWrite`.
- Etap 17 w pakiecie I wykonuje się zawsze (P15 rozstrzygnięte, nie ma już oczekiwania na użytkownika).
- Etap 18b: osobne wznowienie J, tylko po słowach użytkownika, że IG/TikTok odrzuciły testowy MP4 (P20).
- Pytania zebrane w raportach, które sesja główna zadaje użytkownikowi: P23 (ręczne `get_dataset_range` i `get_cost`, raport B), ręczny test rysunków na prawdziwym Notion (R11, przed wydaniem), upload testowego MP4 (P20, raport J), polecenie wydania (G).
- Szacunek kosztu (Szacunek z planu): ok. 0,3 mln tokenów na agenta; K0 + A-F ≈ 1,5-2 mln, H-J ≈ 0,6-0,9 mln.
