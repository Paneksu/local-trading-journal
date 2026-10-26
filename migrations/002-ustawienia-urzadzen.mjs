// Migracja 002 (wersja 1.1.0): zwinięty blok „Ustawienia dashboardu (nie edytuj)” na końcu strony głównej dziennika.
// Przechowuje ustawienia synchronizowane między urządzeniami i listę urządzeń. Nie rusza żadnej innej treści strony.
// Migration 002: hidden "Dashboard settings" block at the end of the journal home page (settings sync between devices).
export default {
  version: 2,
  description: { pl: 'Blok ustawień synchronizowanych między urządzeniami na stronie głównej', en: 'Settings block (synced between devices) on the home page' },
  ops: [
    { op: 'addPageBlock', db: 'root', block: 'settings' },
  ],
};
