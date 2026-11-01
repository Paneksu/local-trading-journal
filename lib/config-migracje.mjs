// N4 (1.6.0): jednorazowe uzupełnienie config.local.json przy starcie serwera, gdy zmieniają się wartości domyślne.
// Do 1.5.0 codzienne okno 1s NQ było włączone, dopóki ktoś go nie wyłączył; od 1.6.0 nowa instalacja ma je wyłączone. Instalacja istniejąca
// (plik konfiguracji był przed startem) bez jawnego chartNq1sDaily dostaje true, więc po aktualizacji działa jak dotąd. Bez wpisanego kredytu
// Databento okno i tak niczego nie pobierze (strażnik kredytu, no-credit).
// Kredytu migracja nie wpisuje nikomu: nowa i istniejąca instalacja bez chartCredit widzi „kredyt nie wpisany”, a płatne pobieranie czeka,
// aż użytkownik wpisze stan z portalu Databento w Ustawieniach → Źródła danych.
// [U] 31.10.2026 «Wpisz tylko u mnie» (migracja w kodzie nie wpisuje nikomu kwot kredytu; stan właściciela poza kodem)
// [U] 31.10.2026 «Przyjmuję wszystkie» (decyzja 4: codzienne okno 1s NQ domyślnie wyłączone w nowych instalacjach, u obecnych zostaje włączone)
// Znacznik defaultsUpgraded: każdy kolejny start nic nie zmienia (także na świeżej instalacji, która przy drugim starcie ma już plik konfiguracji).

export const DEFAULTS_MARK = '1.6.0';

// cfg: obiekt config.local.json (zmieniany w miejscu). firstRun: pliku konfiguracji nie było przed startem (albo był nieczytelny i został odłożony).
// Zwraca listę zapisanych kluczy (pusta = nic poza znacznikiem).
export function upgradeDefaults(cfg, { firstRun }) {
  if (cfg.defaultsUpgraded) return [];
  const changed = [];
  if (!firstRun && typeof cfg.chartNq1sDaily !== 'boolean') { cfg.chartNq1sDaily = true; changed.push('chartNq1sDaily'); }
  cfg.defaultsUpgraded = DEFAULTS_MARK;
  return changed;
}
