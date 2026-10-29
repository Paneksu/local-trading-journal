// Earningsy spółek (pakiet A2): katalog jako DANE. Lista S&P 100 (tickery i nazwy w przybliżonej kolejności kapitalizacji, to kolejność zapasowa), klasy 1-2 (stałe),
// adresy źródeł. Klasy 3-4 wylicza earnings.mjs z kapitalizacji (Finnhub stock/profile2, odświeżane raz na kwartał) albo, bez niej, z kolejności poniżej.
// Skład sprawdzony 29.10.2026 z publicznym źródłem (SP100_VERIFIED). Względem pierwszej wersji z pamięci: wyszło 9 spółek (HON, CL, TGT, NKE, PYPL, SPG, MET, AIG, CHTR),
// weszło 7 (AMAT, LRCX, PANW, ANET, GEV, DELL, SNDK), BK zmienił ticker na BNY.
// Skład S&P 100 zmienia się kilka razy w roku; lista jest w repo i do poprawienia (ręczne dopisanie spółki: config.local.json → earningsExtra).
// English: earnings catalogue as data: S&P 100 list, fixed class 1-2 tickers, source addresses.

export const EDGAR_DATA_BASE = 'https://data.sec.gov'; // submissions API
export const EDGAR_WWW_BASE = 'https://www.sec.gov'; // company_tickers.json
export const FINNHUB_BASE = 'https://finnhub.io';
export const HISTORY_FROM = '2010-01-01';

// Klasa 1 (czerwona) i 2 (pomarańczowa): decyzja użytkownika 29.10.2026 («Akceptuję 4 klasy»), lista stała.
export const CLASS1 = Object.freeze(['NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO']);
export const CLASS2 = Object.freeze(['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'NFLX', 'ORCL', 'AMD', 'BRK.B', 'LLY', 'UNH', 'WMT', 'COST', 'XOM', 'V', 'MA']);
export const TOP_N = 50; // klasa 3 = spółki spoza klas 1-2 do łącznej liczby 50 wg kapitalizacji (czyli 25), reszta to klasa 4
// Weryfikacja listy: Wikipedia „S&P 100”, tabela Components (stan na 21.09.2026 wg pliku holdingów iShares OEF, który strona cytuje). GOOG pominięty celowo.
export const SP100_VERIFIED = Object.freeze({ date: '2026-10-29', source: 'Wikipedia: S&P 100, tabela Components (stan na 21.09.2026, wg iShares OEF)', url: 'https://en.wikipedia.org/wiki/S%26P_100', note: 'GOOG pominięty (te same wyniki co GOOGL)' });
// Ręczne mapowanie ticker → CIK dla spółek, których nie ma pod tym tickerem w SEC company_tickers.json (używane, gdy mapa SEC go nie zna).
export const CIK_OVERRIDES = Object.freeze({ BNY: '0001390777' }); // The Bank of New York Mellon (dawny ticker BK)
export const CLASS_NAMES = Object.freeze({ 1: 'red', 2: 'orange', 3: 'yellow', 4: 'grey' });

// [ticker, nazwa] w przybliżonej kolejności kapitalizacji (zapasowej). GOOG (druga klasa akcji Alphabet) pominięty: te same wyniki co GOOGL. BRK.B w zapisie z kropką (SEC: BRK-B, mapowanie w earnings-sources).
export const SP100 = Object.freeze([
  ['NVDA', 'NVIDIA'], ['MSFT', 'Microsoft'], ['AAPL', 'Apple'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'], ['META', 'Meta Platforms'],
  ['AVGO', 'Broadcom'], ['TSLA', 'Tesla'], ['BRK.B', 'Berkshire Hathaway'], ['LLY', 'Eli Lilly'], ['JPM', 'JPMorgan Chase'], ['V', 'Visa'],
  ['WMT', 'Walmart'], ['XOM', 'Exxon Mobil'], ['MA', 'Mastercard'], ['ORCL', 'Oracle'], ['NFLX', 'Netflix'], ['COST', 'Costco'],
  ['JNJ', 'Johnson & Johnson'], ['HD', 'Home Depot'], ['PLTR', 'Palantir'], ['PG', 'Procter & Gamble'], ['BAC', 'Bank of America'], ['ABBV', 'AbbVie'],
  ['UNH', 'UnitedHealth'], ['CRM', 'Salesforce'], ['CSCO', 'Cisco'], ['KO', 'Coca-Cola'], ['WFC', 'Wells Fargo'], ['AMD', 'AMD'],
  ['IBM', 'IBM'], ['MS', 'Morgan Stanley'], ['GE', 'GE Aerospace'], ['CVX', 'Chevron'], ['MCD', "McDonald's"], ['ABT', 'Abbott'],
  ['LIN', 'Linde'], ['NOW', 'ServiceNow'], ['TMUS', 'T-Mobile US'], ['PM', 'Philip Morris'], ['T', 'AT&T'], ['DIS', 'Disney'],
  ['ACN', 'Accenture'], ['AXP', 'American Express'], ['ISRG', 'Intuitive Surgical'], ['MRK', 'Merck'], ['INTU', 'Intuit'], ['GS', 'Goldman Sachs'],
  ['VZ', 'Verizon'], ['UBER', 'Uber'], ['QCOM', 'Qualcomm'], ['BKNG', 'Booking Holdings'], ['RTX', 'RTX'], ['CAT', 'Caterpillar'],
  ['TXN', 'Texas Instruments'], ['PEP', 'PepsiCo'], ['BLK', 'BlackRock'], ['AMGN', 'Amgen'], ['SCHW', 'Charles Schwab'], ['NEE', 'NextEra Energy'],
  ['TMO', 'Thermo Fisher'], ['BA', 'Boeing'], ['ADBE', 'Adobe'], ['C', 'Citigroup'], ['PFE', 'Pfizer'], ['DHR', 'Danaher'],
  ['UNP', 'Union Pacific'], ['GILD', 'Gilead'], ['AMT', 'American Tower'], ['INTC', 'Intel'], ['MU', 'Micron'], ['AMAT', 'Applied Materials'],
  ['LRCX', 'Lam Research'], ['PANW', 'Palo Alto Networks'], ['ANET', 'Arista Networks'], ['GEV', 'GE Vernova'], ['LOW', "Lowe's"], ['DE', 'Deere'],
  ['COP', 'ConocoPhillips'], ['LMT', 'Lockheed Martin'], ['MDT', 'Medtronic'], ['SBUX', 'Starbucks'], ['MMM', '3M'], ['BMY', 'Bristol-Myers Squibb'],
  ['CMCSA', 'Comcast'], ['MDLZ', 'Mondelez'], ['GD', 'General Dynamics'], ['MO', 'Altria'], ['SO', 'Southern Company'], ['DUK', 'Duke Energy'],
  ['CVS', 'CVS Health'], ['USB', 'U.S. Bancorp'], ['FDX', 'FedEx'], ['EMR', 'Emerson'], ['UPS', 'UPS'], ['COF', 'Capital One'],
  ['GM', 'General Motors'], ['DELL', 'Dell Technologies'], ['SNDK', 'Sandisk'], ['BNY', 'BNY'],
]);
