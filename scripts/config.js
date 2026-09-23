// Vorgaben für den ersten Start – vor dem Weitergeben der ZIP hier anpassen.
// Alle Optionen aus „Einstellungen“ sind hier abgebildet. Später im
// Einstellungsmenü gespeicherte Werte haben Vorrang.
window.QUIZ_CONFIG = {
  // Spielbrett
  poolId: 'standard',      // ID aus pools/index.js
  categoriesPerGame: 5,    // 3–6; der Pool braucht genügend vollständige Kategorien
  questionsPerCategory: 5, // Rückfall für Pools ohne gespeicherte Punktestufen
  pointValues: [100, 200, 300, 400, 500], // verwendete Punktestufen aus dem Fragenpool
  categoryChoiceEnabled: false, // Kategorien in den Einstellungen gezielt wählen
  categories: [],          // feste Kategorien, Rest wird zufällig gewählt; z. B. ['Film', 'Musik']

  // Fragen & Zeit
  mode: 'open',              // open = offene Fragen | mc = Multiple Choice
  mcMultiplier: 0.5,         // 1 | 0.75 | 0.5 | 0.25 | 0 (Anteil bei MC-Hilfe)
  timerEnabled: true,       // true = Timer an | false = Timer aus
  timerSeconds: 30,          // 5–600 Sekunden je Frage
  mcHelpTimeBonus: 0,        // 0–timerSeconds; zusätzliche Zeit beim Einblenden der MC-Hilfe

  // Punkte & Challenge
  challengeEnabled: true,    // Challenge pro Team und Runde aktivieren
  challengeMultiplier: 2,    // 1.25 | 1.5 | 2 | 2.5 | 3
  challengePenaltyMode: 'base', // base = einfacher Feldwert | multiplied = Multiplikator anwenden
  allowNegativeScores: true, // bei verlorener Challenge unter 0 Punkte erlauben

  // Startendes Team
  startingTeamSelectionEnabled: true, // vor jeder Runde das Startteam bestimmen
  startingTeamMode: 'random', // manual = Auswahl | random = Auslosung

  // Erscheinungsbild
  theme: 'standard',       // standard | oktoberfest | christmas | carnival | nerd
};
