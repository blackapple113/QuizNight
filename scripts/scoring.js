'use strict';

window.QuizScoring = (() => {
  const CHALLENGE_MULTIPLIERS = [1.25, 1.5, 2, 2.5, 3];
  function defaultChallengeMultiplier(defaults) {return CHALLENGE_MULTIPLIERS.includes(Number(defaults.challengeMultiplier)) ? Number(defaults.challengeMultiplier) : 2;}
  function hasPendingChallenge(game) {return Number.isInteger(game?.doubleOrNothingTeam);}
  function baseQuestionPoints(question, game) {return question._helpUsed ? Math.round(Number(question.points) * game.mcMultiplier) : Number(question.points);}
  function questionPoints(question, game, challengeActive) {
    const basePoints = baseQuestionPoints(question, game);
    return challengeActive ? Math.round(basePoints * game.challengeMultiplier) : basePoints;
  }
  function challengePenaltyPoints(question, game) {
    const basePoints = baseQuestionPoints(question, game);
    return game.challengePenaltyMode === 'base' ? basePoints : Math.round(basePoints * game.challengeMultiplier);
  }
  function applyJudgement(game, question, correct) {
    const challengeActive = game.doubleOrNothingTeam === game.activeTeam;
    const points = questionPoints(question, game, challengeActive);
    const penalty = challengeActive ? challengePenaltyPoints(question, game) : 0;
    const team = game.teams[game.activeTeam];
    if (correct) team.score += points;
    else if (challengeActive) team.score = game.allowNegativeScores ? team.score - penalty : Math.max(0, team.score - penalty);
    if (challengeActive) delete game.doubleOrNothingTeam;
  }
  function normalizeSavedGame(savedGame, defaults) {
    if (!savedGame) return null;
    savedGame.teams?.forEach(team => {team.doubleOrNothingUsed = !!team.doubleOrNothingUsed;});
    savedGame.challengeEnabled = typeof savedGame.challengeEnabled === 'boolean' ? savedGame.challengeEnabled : (defaults.challengeEnabled ?? true);
    savedGame.challengeMultiplier = CHALLENGE_MULTIPLIERS.includes(Number(savedGame.challengeMultiplier)) ? Number(savedGame.challengeMultiplier) : defaultChallengeMultiplier(defaults);
    savedGame.challengePenaltyMode = ['base', 'multiplied'].includes(savedGame.challengePenaltyMode) ? savedGame.challengePenaltyMode : 'multiplied';
    savedGame.allowNegativeScores = typeof savedGame.allowNegativeScores === 'boolean' ? savedGame.allowNegativeScores : (defaults.allowNegativeScores ?? true);
    if (!Number.isInteger(savedGame.doubleOrNothingTeam) || !savedGame.teams?.[savedGame.doubleOrNothingTeam]) delete savedGame.doubleOrNothingTeam;
    return savedGame;
  }
  return {CHALLENGE_MULTIPLIERS, applyJudgement, challengePenaltyPoints, defaultChallengeMultiplier, hasPendingChallenge, normalizeSavedGame, questionPoints};
})();
