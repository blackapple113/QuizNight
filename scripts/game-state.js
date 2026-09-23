'use strict';

// Pure game-state operations. Keeping them separate from rendering makes the
// turn flow reusable and straightforward to verify without a browser.
window.QuizGameState = (() => {
  function createGame({board, teamNames, settings, tiebreakers}) {
    return {
      theme: settings.theme,
      poolId: settings.poolId,
      timerSeconds: settings.timerSeconds,
      mcHelpTimeBonus: settings.mcHelpTimeBonus,
      tiebreakers,
      mode: settings.mode,
      mcMultiplier: settings.mcMultiplier,
      challengeEnabled: settings.challengeEnabled,
      challengeMultiplier: settings.challengeMultiplier,
      challengePenaltyMode: settings.challengePenaltyMode,
      allowNegativeScores: settings.allowNegativeScores,
      startingTeamPending: settings.startingTeamSelectionEnabled,
      startingTeamMode: settings.startingTeamMode,
      teams: teamNames.map(name => ({name, score: 0, doubleOrNothingUsed: false})),
      activeTeam: 0,
      categories: board.categories,
      points: board.points,
      cells: board.cells,
      answered: 0,
    };
  }

  function findCell(game, category, points) {
    return game.cells.find(cell => cell.category === category && Number(cell.points) === Number(points));
  }

  function findAvailableQuestion(game, id) {
    return game.cells.find(cell => cell.id === id && !cell.used) || null;
  }

  function markQuestionUsed(game, id) {
    const question = findAvailableQuestion(game, id);
    if (!question) return null;

    question.used = true;
    game.answered += 1;
    game.currentQuestionId = null;
    return question;
  }

  function advanceTurn(game) {
    game.activeTeam = (game.activeTeam + 1) % game.teams.length;
  }

  function isComplete(game) {
    return game.answered >= game.cells.length;
  }

  return {advanceTurn, createGame, findAvailableQuestion, findCell, isComplete, markQuestionUsed};
})();
