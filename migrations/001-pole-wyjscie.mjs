// Migracja 001: pole „Wyjście” (data z godziną) w bazie Trade'y. Z różnicy Data → Wyjście dashboard liczy czas trwania.
// Zastępuje dawny skrypt narzedzia/dodaj-pole-wyjscie.mjs. Instalacje, które mają już to pole, pomijają ją bez zmian.
// Migration 001: adds the "Exit" date property to Trades (used for trade duration).
export default {
  version: 1,
  description: { pl: 'Pole „Wyjście” w bazie Trade\'y (czas trwania trade\'a)', en: 'Exit date property in Trades (trade duration)' },
  ops: [
    { op: 'addProperty', db: 'trades', role: 'exit', spec: { type: 'date', name: { pl: 'Wyjście', en: 'Exit' } } },
  ],
};
