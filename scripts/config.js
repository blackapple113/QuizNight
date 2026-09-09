// Vorgaben für den ersten Start – vor dem Weitergeben der ZIP hier anpassen.
// Später im Einstellungsmenü gespeicherte Werte haben Vorrang.
window.QUIZZ_CONFIG = {
  theme: 'standard',       // standard | oktoberfest | christmas | carnival
  poolId: 'standard',      // ID aus pools/index.js
  mode: 'open',              // open = offene Fragen | mc = Multiple Choice
  mcMultiplier: 0.5,         // 1 | 0.75 | 0.5 | 0.25 | 0 (Anteil bei MC-Hilfe)
  challengeEnabled: true,    // Challenge pro Team und Runde aktivieren
  challengeMultiplier: 2,    // 1.25 | 1.5 | 2 | 2.5 | 3
  allowNegativeScores: true, // bei verlorener Challenge unter 0 Punkte erlauben
  categoriesPerGame: 5,      // 3–6; der Pool braucht genügend vollständige Kategorien
  questionsPerCategory: 5,   // 2–5
  timerEnabled: false,       // true = Timer an | false = Timer aus
  timerSeconds: 30,          // 5–600 Sekunden je Frage
};
