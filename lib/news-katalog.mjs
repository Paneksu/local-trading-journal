// Newsy makro USD (pakiet A): katalog zdarzeń jako DANE. Tu są tabele, godziny, wagi i profile świąt; logika siedzi w news-sources.mjs.
// Źródła i stan wag: docs/plany/newsy-zrodla.md (etap 0, 29.10.2026). Wagi to stan na 2026; waga i godzina mogą zależeć od daty
// (pole jako tablica { from: 'RRRR-MM-DD', v: wartość }, obowiązuje ostatni wpis z from <= dzień), a pakiet B wypełnia przedziały tam, gdzie FF się zmieniał.
// Godziny w czasie Nowego Jorku (ET, z czasem letnim); przeliczenie na UTC robi news.mjs.
// Żadnych danych z ForexFactory: nazwy zdarzeń to nazwy rodzajów zdarzeń (fakty), nie kopia kalendarza.
// English: US macro news catalogue as data (release ids, hours, weights, FOMC table, holiday profiles).

export const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'; // jedyny dozwolony adres FF (feed udostępniony przez FF); stron forexfactory.com nie pobieramy
export const FRED_BASE = 'https://api.stlouisfed.org';
// Oficjalne archiwa Fed (JSON, od 2006, z godziną w polu d): przemówienia i zeznania. Zastąpiły RSS (RSS miał tylko ostatnie ~15 pozycji).
export const FED_ARCHIVE_BASE = 'https://www.federalreserve.gov';
export const FED_ARCHIVE_PATHS = { speech: '/json/ne-speeches.json', testimony: '/json/ne-testimony.json' };
export const HISTORY_FROM = '2010-01-01';
export const FRED_ATTRIBUTION = 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.';

// Wartość zależna od daty: skalar albo tablica [{ from, v }] (rosnąco po from).
export function pick(spec, day) {
  if (!Array.isArray(spec)) return spec;
  let v = spec[0].v;
  for (const s of spec) if (s.from <= day) v = s.v;
  return v;
}

// GDP (rid 53): prawdziwe publikacje wypadają w końcu miesiąca (dzień >= 22, w grudniu >= 18: trzecia estymata przed świętami); wcześniejsze daty w miesiącu to aktualizacje
// tablic i roczne rewizje. Wyjątki po shutdownach (2013, 2019, 2025-26) w include: omijają filtr i wybór „pierwsza data miesiąca”; exclude: pojedyncza dodatkowa data, która przeszłaby filtr (24.09.2021; prawdziwa trzecia estymata 30.09).
export const GDP_CURATE = { rule: 'gdp', minDay: 22, decMinDay: 18, include: ['2013-11-07', '2013-12-05', '2026-02-20', '2026-03-13', '2026-04-09'], exclude: ['2021-09-24'] };

// ---- FRED: wydania, z których bierzemy daty publikacji (release_id sprawdzone w etapie 0) ----
// split: jedno wydanie FRED to kilka rodzajów publikacji (GDP: pierwsza, druga, trzecia estymata; Uniwersytet Michigan: wstępny i końcowy odczyt).
// when: który rodzaj publikacji niesie dane zdarzenie (decyzja gustu etapu 0: rodzaj wnioskowany z kolejności w cyklu, nie z FRED).
// curate: FRED w liście dat wydania ma też daty dodatkowe (aktualizacje roczne, rewizje sezonowe), np. dwie daty NFP w jednym miesiącu. Plik z wydaniem trzyma SUROWE daty FRED,
// a to czyszczenie jest tu, w danych, żeby dało się je poprawić bez ponownego pobierania. Wzorce zmierzone 29.10.2026 na 10 wydaniach (liczby dat zgadzają się z liczbą miesięcy bez publikacji
// odwołanych przez shutdowny): NFP/UR/AHE: pierwsza data miesiąca; CPI i PPI: w lutym ostatnia (wcześniejsza to aktualizacja sezonowa), w pozostałych miesiącach wszystkie
// (PPI 01.2026 ma dwie prawdziwe daty po shutdownie); Retail Sales: odrzuć dodatkową datę po 22. dniu (roczna rewizja) gdy w miesiącu jest wcześniejsza; ECI: w styczniu i kwietniu ostatnia (wcześniejsza to rewizja sezonowa); GDP: patrz GDP_CURATE.
// Pakiet B (29.10.2026): wagi `imp` niżej to wartość domyślna; waga zależna od daty dla zdarzeń obejrzanych na próbie FF jest w news-wagi.mjs (FF_WEIGHTS) i wygrywa z domyślną.
// Godzina może zależeć od daty (tablica { from, v }) albo być ustawiona na pojedynczym zdarzeniu (pole time). Nowe wydania 27, 97, 95, 13, 188, 25, 54 (Personal Spending), CPI y/y
// bazowy: zdarzenia, które FF w próbie oznacza na czerwono albo pomarańczowo (docs/plany/newsy-zgodnosc.md).
const UOM_TIME = [{ from: '2010-01-01', v: '09:55' }, { from: '2015-01-01', v: '10:00' }]; // FF: 9:55 do 03.2014, 10:00 od 04.2015 (granica w środku przerwy próby, WYWNIOSKOWANE)
export const FRED_RELEASES = [
  { rid: 50, label: 'Employment Situation', time: '08:30', curate: { rule: 'perMonth', keep: 'first' }, events: [
    { name: 'Non-Farm Employment Change', imp: 'high' }, { name: 'Unemployment Rate', imp: 'high' }, { name: 'Average Hourly Earnings m/m', imp: 'high' }] },
  { rid: 10, label: 'Consumer Price Index', time: '08:30', curate: { rule: 'perMonth', keep: 'last', months: [2] }, events: [
    { name: 'CPI m/m', imp: 'high' }, { name: 'CPI y/y', imp: 'high' }, { name: 'Core CPI m/m', imp: 'high' }, { name: 'Core CPI y/y', imp: 'high' }] },
  { rid: 54, label: 'Personal Income and Outlays', time: '08:30', events: [{ name: 'Core PCE Price Index m/m', imp: 'high' }, { name: 'Personal Spending m/m', imp: 'medium' }] },
  { rid: 53, label: 'Gross Domestic Product', time: '08:30', split: 'gdp', curate: GDP_CURATE, events: [
    { name: 'Advance GDP q/q', imp: 'high', when: 'advance' }, { name: 'Advance GDP Price Index q/q', imp: 'medium', when: 'advance' },
    { name: 'Prelim GDP q/q', imp: 'medium', when: 'second' }, { name: 'Final GDP q/q', imp: 'low', when: 'third' }] },
  { rid: 9, label: 'Advance Monthly Sales for Retail and Food Services', time: '08:30', curate: { rule: 'dropLate', minDay: 22, otherMaxDay: 20 }, events: [
    { name: 'Retail Sales m/m', imp: 'high' }, { name: 'Core Retail Sales m/m', imp: 'high' }] },
  { rid: 46, label: 'Producer Price Index', time: '08:30', curate: { rule: 'perMonth', keep: 'last', months: [2] }, events: [{ name: 'PPI m/m', imp: 'medium' }, { name: 'Core PPI m/m', imp: 'medium' }] },
  { rid: 192, label: 'Job Openings and Labor Turnover Survey', time: '10:00', events: [{ name: 'JOLTS Job Openings', imp: 'medium' }] },
  // Surveys of Consumers: FRED ma jedną datę na miesiąc badania i to jest odczyt końcowy (zwykle ostatni piątek; czasem 1.-2. dzień następnego miesiąca albo ok. 20. grudnia).
  // Pakiet B: dawna reguła „dzień >= 21” gubiła odczyty końcowe z początku miesiąca (FF ma je, np. 1.10.2010). Odczyt wstępny: piątek tygodnia „końcowy - 14 dni” (umichPrelim),
  // zgodny z FF na każdym obejrzanym miesiącu.
  { rid: 91, label: 'Surveys of Consumers', time: UOM_TIME, split: 'umich', events: [
    { name: 'Prelim UoM Consumer Sentiment', imp: 'medium', when: 'prelim' }, { name: 'Revised UoM Consumer Sentiment', imp: 'low', when: 'final' }] },
  { rid: 11, label: 'Employment Cost Index', time: '08:30', curate: { rule: 'perMonth', keep: 'last', months: [1, 4] }, events: [{ name: 'Employment Cost Index q/q', imp: 'medium' }] },
  { rid: 51, label: 'U.S. International Trade in Goods and Services', time: '08:30', events: [{ name: 'Trade Balance', imp: 'low' }] },
  // pakiet B: nowe wydania (daty z FRED, ten sam generator). New Residential Construction: pierwsza data miesiąca (druga to aktualizacja serii).
  { rid: 27, label: 'New Residential Construction', time: '08:30', curate: { rule: 'perMonth', keep: 'first' }, events: [{ name: 'Building Permits', imp: 'medium' }, { name: 'Housing Starts', imp: 'medium' }] },
  { rid: 97, label: 'New Residential Sales', time: '10:00', curate: { rule: 'perMonth', keep: 'first' }, events: [{ name: 'New Home Sales', imp: 'medium' }] },
  // M3: raport wstępny o dobrach trwałych pod koniec miesiąca (dzień >= 18); data z początku miesiąca to pełny raport (Factory Orders, nie w katalogu).
  { rid: 95, label: "Manufacturer's Shipments, Inventories, and Orders (M3) Survey", time: '08:30', curate: { rule: 'lateFirst', minDay: 18 }, events: [
    { name: 'Core Durable Goods Orders m/m', imp: 'medium' }, { name: 'Durable Goods Orders m/m', imp: 'medium' }] },
  { rid: 13, label: 'G.17 Industrial Production and Capacity Utilization', time: '09:15', curate: { rule: 'perMonth', keep: 'first' }, events: [
    { name: 'Industrial Production m/m', imp: 'medium' }, { name: 'Capacity Utilization Rate', imp: 'medium' }] },
  { rid: 188, label: 'U.S. Import and Export Price Indexes', time: '08:30', curate: { rule: 'perMonth', keep: 'first' }, events: [{ name: 'Import Prices m/m', imp: 'medium' }] },
  { rid: 25, label: 'Manufacturing and Trade Inventories and Sales', time: '10:00', curate: { rule: 'perMonth', keep: 'first' }, events: [{ name: 'Business Inventories m/m', imp: 'medium' }] },
];
export const FRED_RIDS = FRED_RELEASES.map((r) => r.rid);
// GDP: rodzaj publikacji z miesiąca (styczeń/kwiecień/lipiec/październik = pierwsza, +1 = druga, +2 = trzecia). Wyjątki (opóźnienia przez shutdown) jako dane: data → rodzaj.
export const GDP_OVERRIDES = {
  '2013-11-07': 'advance', '2013-12-05': 'second', // shutdown 10.2013
  '2019-02-28': 'advance', '2019-03-28': 'third', // shutdown 12.2018-01.2019: pierwsza estymata IV kw. 2018 dopiero 28.02
  '2025-12-23': 'advance', '2026-01-22': 'second', '2026-02-20': 'advance', '2026-03-13': 'second', '2026-04-09': 'third', // shutdown 10-11.2025 i nadrabianie harmonogramu
};

// ---- reguły bez FRED (daty z reguły, oznaczone basis: 'rule'; źródło słabsze, w FF-tygodniu wygrywa feed) ----
export const RULE_EVENTS = {
  ismManufacturing: { name: 'ISM Manufacturing PMI', imp: 'high', time: '10:00' }, // 1. dzień roboczy miesiąca
  ismServices: { name: 'ISM Services PMI', imp: 'high', time: '10:00' }, // 3. dzień roboczy
  adp: { name: 'ADP Non-Farm Employment Change', imp: 'high', time: '08:15' }, // środa przed publikacją NFP (daty NFP z FRED)
  consumerConfidence: { name: 'CB Consumer Confidence', imp: 'medium', time: '10:00' }, // ostatni wtorek miesiąca
  claims: { name: 'Unemployment Claims', imp: 'medium', time: '08:30' }, // czwartek, w święto środa
  // pakiet B (reguły sprawdzone na próbie FF, docs/plany/newsy-zgodnosc.md):
  philly: { name: 'Philly Fed Manufacturing Index', imp: 'medium', time: [{ from: '2010-01-01', v: '10:00' }, { from: '2016-01-01', v: '08:30' }] }, // 3. czwartek miesiąca, także w styczniu (FRED rid 351 ma w styczniu dwie daty: 2. czwartek to osobna publikacja, indeks wychodzi w 3.; w dzień wolny tydzień później); FF 10:00 do 07.2015, 8:30 od 11.2016
  empire: { name: 'Empire State Manufacturing Index', imp: 'medium', time: '08:30' }, // 15. dzień miesiąca albo następny dzień roboczy (zgodne ze wszystkimi 154 datami FRED rid 321 od 2014)
  chicago: { name: 'Chicago PMI', imp: 'medium', time: '09:45' }, // ostatni dzień roboczy miesiąca (bez Good Friday)
  crude: { name: 'Crude Oil Inventories', imp: 'low', time: '10:30', delayedTime: '11:00' }, // środa 10:30; święto w poniedziałek albo w środę: czwartek 11:00, święto we wtorek: piątek 11:00 (piątkowe święto poprzedniego tygodnia nic nie zmienia)
  election: { name: 'Presidential Election', imp: 'high' }, // cały dzień: wtorek po pierwszym poniedziałku listopada co 4 lata (2012, 2016, 2020, 2024)
};
// ISM: od 2018 styczniowy odczyt przemysłu w 2. dniu roboczym (usługi 2 dni robocze później); wcześniej 1. dzień roboczy. Próba FF: 01.2012 i 01.2013 w 1. dniu, 01.2025 w 2.
// Rok przejścia WYWNIOSKOWANY (harmonogramy ISM), sprawdzony tylko na końcach przedziału.
export const ISM_JANUARY_SECOND_FROM = 2018;

// ---- FOMC ----
// Data = ostatni dzień posiedzenia (decyzja); po dwukropku data Minutes (rok wynika z kolejności: wcześniejsza data niż decyzja = rok następny).
// Brak daty Minutes (pusty wpis) = decyzja + 21 dni (reguła Fed; daty jeszcze nieogłoszone). Źródło: federalreserve.gov (fomchistorical2010-2020, fomccalendars), etap 0.
const FOMC_RAW = {
  2010: '01-27:02-17 03-16:04-06 04-28:05-19 06-23:07-14 08-10:08-31 09-21:10-12 11-03:11-23 12-14:01-04',
  2011: '01-26:02-16 03-15:04-05 04-27:05-18 06-22:07-12 08-09:08-30 09-21:10-12 11-02:11-22 12-13:01-03',
  2012: '01-25:02-15 03-13:04-03 04-25:05-16 06-20:07-11 08-01:08-22 09-13:10-04 10-24:11-14 12-12:01-03',
  2013: '01-30:02-20 03-20:04-10 05-01:05-22 06-19:07-10 07-31:08-21 09-18:10-09 10-30:11-20 12-18:01-08',
  2014: '01-29:02-19 03-19:04-09 04-30:05-21 06-18:07-09 07-30:08-20 09-17:10-08 10-29:11-19 12-17:01-07',
  2015: '01-28:02-18 03-18:04-08 04-29:05-20 06-17:07-08 07-29:08-19 09-17:10-08 10-28:11-18 12-16:01-06',
  2016: '01-27:02-17 03-16:04-06 04-27:05-18 06-15:07-06 07-27:08-17 09-21:10-12 11-02:11-23 12-14:01-04',
  2017: '02-01:02-22 03-15:04-05 05-03:05-24 06-14:07-05 07-26:08-16 09-20:10-11 11-01:11-22 12-13:01-03',
  2018: '01-31:02-21 03-21:04-11 05-02:05-23 06-13:07-05 08-01:08-22 09-26:10-17 11-08:11-29 12-19:01-09',
  2019: '01-30:02-20 03-20:04-10 05-01:05-22 06-19:07-10 07-31:08-21 09-18:10-09 10-30:11-20 12-11:01-03',
  2020: '01-29:02-19 04-29:05-20 06-10:07-01 07-29:08-19 09-16:10-07 11-05:11-25 12-16:01-06', // marcowe posiedzenie 17-18.03 odwołane (zastąpione nadzwyczajnymi, niżej)
  2021: '01-27:02-17 03-17:04-07 04-28:05-19 06-16:07-07 07-28:08-18 09-22:10-13 11-03:11-24 12-15:01-05',
  2022: '01-26:02-16 03-16:04-06 05-04:05-25 06-15:07-06 07-27:08-17 09-21:10-12 11-02:11-23 12-14:01-04',
  2023: '02-01:02-22 03-22:04-12 05-03:05-24 06-14:07-05 07-26:08-16 09-20:10-11 11-01:11-21 12-13:01-03',
  2024: '01-31:02-21 03-20:04-10 05-01:05-22 06-12:07-03 07-31:08-21 09-18:10-09 11-07:11-26 12-18:01-08',
  2025: '01-29:02-19 03-19:04-09 05-07:05-28 06-18:07-09 07-30:08-20 09-17:10-08 10-29:11-19 12-10:12-30',
  2026: '01-28:02-18 03-18:04-08 04-29:05-20 06-17:07-08 07-29:08-19 09-16:10-07 10-28: 12-09:',
  2027: '01-27: 03-17: 04-28: 06-09: 07-28: 09-15: 10-27: 12-08:', // kalendarz Fed „tentative until confirmed at the meeting immediately preceding it”
};
export const FOMC_LAST_CONFIRMED_YEAR = 2026;
export const FOMC_MEETINGS = Object.entries(FOMC_RAW).flatMap(([y, row]) => row.trim().split(/\s+/).map((tok) => {
  const [d, m] = tok.split(':');
  return { decision: `${y}-${d}`, minutesMonthDay: m || null, tentative: Number(y) > FOMC_LAST_CONFIRMED_YEAR };
}));
// Posiedzenia nadzwyczajne 2020 (decyzja o stopie + oświadczenie). 03.03 10:00 ET potwierdzone komunikatem Fed; 15.03 (niedziela wieczorem) i 23.03 (rano) godziny WYWNIOSKOWANE.
// Pakiet B: FF (03.2020) ma 3.03 10:00 i 15.03 17:00 (stopa, oświadczenie) z konferencją 11:00 i 18:30; 23.03 8:00 to u FF „Fed Announcement” (bez decyzji o stopie), więc tu go nie ma.
export const FOMC_EMERGENCY = [
  { day: '2020-03-03', time: '10:00', press: '11:00', tentative: false },
  { day: '2020-03-15', time: '17:00', press: '18:30', tentative: false },
];
// Posiedzenia z konferencją prasową i projekcjami (SEP) poza regułą „marzec/czerwiec/wrzesień/grudzień” (2011-2012, kwartalne konferencje zaczęły się 27.04.2011).
export const FOMC_PRESS_EARLY = ['2011-04-27', '2011-06-22', '2011-11-02', '2012-01-25', '2012-04-25', '2012-06-20', '2012-09-13', '2012-12-12'];
export const FOMC_PRESS_ALL_FROM = '2019-01-01'; // od 2019 konferencja po każdym posiedzeniu
export const FOMC_PRESS_FIRST = '2011-04-27';
// Godziny (ET): oświadczenie 14:15 do 2012, w dni z konferencją 27.04.2011-12.12.2012 o 12:30, od posiedzenia 20.03.2013 o 14:00; konferencja 14:15 do 2012 i 14:30 od 2013; Minutes 14:00.
// Projekcje (SEP) 2011-2012: 14:00 (FF na 04.2011, 01.2012, 04.2012, 09.2012; pakiet B 29.10.2026), od 2013 razem z oświadczeniem o 14:00.
export const FOMC_TIMES = {
  statementOld: '14:15', statementPressEarly: '12:30', statementFrom: '2013-03-20', statementNew: '14:00',
  pressOld: '14:15', pressNewFrom: '2013-01-01', pressNew: '14:30', minutes: '14:00', projectionsEarly: '14:00',
};
export const FOMC_NAMES = { rate: 'Federal Funds Rate', statement: 'FOMC Statement', press: 'FOMC Press Conference', projections: 'FOMC Economic Projections', minutes: 'FOMC Meeting Minutes' };

// ---- przemówienia i zeznania przewodniczącego Fed ----
// Przewodniczącego bierzemy z tytułu mówcy w archiwum (pole s: „Chair …”, „Chairman …”; „Vice Chair …” i „Governor” odpadają). Pole d to czas ET (sprawdzone 29.10.2026 na
// trzech przykładach: Jackson Hole 26.08.2022 10:00, 27.08.2020 9:10, zeznanie 11.02.2025 10:00); pakiet B: przemówienia zostają z flagą unverified (godzina z archiwum bywa godziną publikacji tekstu), zeznania o TESTIMONY_TIME.
// FED_CHAIRS to zapas na wypadek pozycji bez tytułu przy nazwisku; w normalnym przebiegu nieużywany.
// ---- terminarze (pakiet B2, 29.10.2026; słowa użytkownika «Dokładamy reguły + terminarze (Recommended)») ----
// TIC: daty publikacji z tabeli Skarbu USA (home.treasury.gov, „TIC Press Releases -- by topic”), plik data/news/usd-terminarze.json. Godzina: FF 9:00 do 03.2014, 16:00 od 04.2015.
// Komunikaty Fed poza posiedzeniami („Fed Announcement”): archiwum JSON komunikatów prasowych Fed (ne-press.json), kategoria Monetary Policy bez komunikatów rutynowych
// (FED_ROUTINE) i bez komunikatów z dnia decyzji FOMC (FF wlicza je w FOMC); godzina z archiwum. Na próbie: 13/13 dni FF trafione, 12/13 co do minuty, 5 komunikatów, których FF nie ma.
export const TIC_EVENT = { name: 'TIC Long-Term Purchases', imp: 'medium', time: [{ from: '2010-01-01', v: '09:00' }, { from: '2015-01-01', v: '16:00' }] };
export const FED_ANNOUNCEMENT = { name: 'Fed Announcement', imp: 'high' };
export const FED_PRESS_PATH = '/json/ne-press.json';
export const TIC_SCHEDULE_URL = 'https://home.treasury.gov/data/treasury-international-capital-tic-system/tic-press-releases-by-topic';
export const FED_ROUTINE = /minutes|discount rate|term deposit|approves|tentative meeting schedule|economic projections|^(federal reserve issues )?fomc statement( of longer-run goals.*)?$|fed listens|publishes|releases|quarterly|interim final rule|time changes|inadvertently|supplemented|task force|encouraged|statement on longer-run|policy normalization principles|plans to begin winding down|term auction facility|results of auction|meeting schedule|tdf test|test operation|schedule of margins|monetary policy report|review (of )?(its )?(monetary policy )?strateg|periodic review|frequently asked questions|public comment|public feedback|public information|trading activity|revised pricing/i;
// Nie dokładamy (reguła kalendarzowa < 90% trafień w dzień na próbie 28 miesięcy): Existing Home Sales (najlepsza reguła 43%), Pending Home Sales (38%),
// wstępne PMI S&P Global (68%); raport walutowy Skarbu: archiwum podaje tylko miesiąc raportu, bez dnia. Szczegóły: docs/plany/newsy-zgodnosc.md.
export const TESTIMONY_TIME = '10:00'; // pakiet B: godzina przesłuchania wg FF (6 z 8 zeznań w próbie)
export const FED_CHAIRS = [
  { name: 'Bernanke', from: '2006-02-01', to: '2014-01-31' },
  { name: 'Yellen', from: '2014-02-01', to: '2018-02-04' },
  { name: 'Powell', from: '2018-02-05', to: '2026-05-15' },
  { name: 'Warsh', from: '2026-05-16', to: '2099-12-31' },
];

// ---- dni wolne ----
// Profil = parametry reguły. saturday: 'friday' (święto w sobotę przesuwa się na piątek) albo 'none'; sunday: 'monday' albo 'none'.
// juneteenth: pierwszy rok obowiązywania (federalnie 2021, pierwsza obserwacja 18.06.2021; NYSE od 2022). mourning: dni żałoby narodowej. extra: zamknięcia jednorazowe.
export const MOURNING_DAYS = ['2018-12-05', '2025-01-09']; // G. H. W. Bush (NYSE i urzędy zamknięte), J. Carter (NYSE zamknięta, biuro federalne zamknięte)
export const HOLIDAY_PROFILES = {
  // Rezerwy Fed: Columbus i Veterans tak, Good Friday nie, święto w sobotę NIE przesuwa się na piątek (Reserve Banks otwarte). Domyślny do pakietu B; od pakietu B domyślny jest 'ff'.
  fed: { columbus: true, veterans: true, juneteenth: 2021, goodFriday: false, saturday: 'none', sunday: 'monday', newYearSaturday: 'none', mourning: true, extra: [] },
  // Rząd federalny (5 U.S.C. 6103): jak Fed, ale sobota przesuwa się na piątek (także Nowy Rok: 31.12).
  federal: { columbus: true, veterans: true, juneteenth: 2021, goodFriday: false, saturday: 'friday', sunday: 'monday', newYearSaturday: 'friday', mourning: true, extra: [] },
  // NYSE (używany WYŁĄCZNIE do OPEX; osobny od profilu Bank Holiday): bez Columbus i Veterans, z Good Friday, Juneteenth od 2022, Nowy Rok w sobotę bez dnia wolnego, huragan Sandy.
  nyse: { columbus: false, veterans: false, juneteenth: 2022, goodFriday: true, saturday: 'friday', sunday: 'monday', newYearSaturday: 'none', mourning: true, extra: ['2012-10-29', '2012-10-30'] },
  // Jak ForexFactory (pakiet B, 29.10.2026, decyzja D3 «Zgodność z FF»; dni kontrolne w docs/plany/newsy-zgodnosc.md): Columbus i Veterans tak, Good Friday nie,
  // Juneteenth od 2022 (FF nie oznaczył 18.06.2021), bez dni żałoby (5.12.2018 i 9.01.2025 bez Bank Holiday). Sobota: 4 lipca i Boże Narodzenie przesuwają się na piątek
  // od 2011 (3.07.2015, 3.07.2020, 24.12.2021 tak; 24.12.2010 nie; między 2011 a 07.2015 żadne z tych świąt nie wypadło w sobotę, więc granica nie zmienia żadnego dnia),
  // Veterans Day i Nowy Rok w sobotę nie (10.11.2017, 31.12.2010, 31.12.2021 bez Bank Holiday). Juneteenth w sobotę (pierwszy raz 2027): jak 4 lipca (decyzja gustu, niesprawdzalne).
  ff: { columbus: true, veterans: true, juneteenth: 2022, goodFriday: false, saturday: 'friday', saturdayFrom: 2011, saturdayNone: ['Veterans Day'], sunday: 'monday', newYearSaturday: 'none', mourning: false, extra: [] },
};
export const DEFAULT_HOLIDAY_PROFILE = 'ff';
export const HOLIDAY_NAME = 'Bank Holiday';
