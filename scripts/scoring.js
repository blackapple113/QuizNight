'use strict';

window.QuizzScoring = (() => {
  const CHALLENGE_MULTIPLIERS = [1.25, 1.5, 2, 2.5, 3];
  function defaultChallengeMultiplier(defaults) {return CHALLENGE_MULTIPLIERS.includes(Number(defaults.challengeMultiplier)) ? Number(defaults.challengeMultiplier) : 2;}
  function hasPendingChallenge(game) {return Number.isInteger(game?.doubleOrNothingTeam);}
  function questionPoints(question, game, challengeActive) {
    const basePoints = question._helpUsed ? Math.round(Number(question.points) * game.mcMultiplier) : Number(question.points);
    return challengeActive ? Math.round(basePoints * game.challengeMultiplier) : basePoints;
  }
  function applyJudgement(game, question, correct) {
    const challengeActive = game.doubleOrNothingTeam === game.activeTeam;
    const points = questionPoints(question, game, challengeActive);
    const team = game.teams[game.activeTeam];
    if (correct) team.score += points;
    else if (challengeActive) team.score = game.allowNegativeScores ? team.score - points : Math.max(0, team.score - points);
    if (challengeActive) delete game.doubleOrNothingTeam;
    return {challengeActive, points};
  }
  function normalizeSavedGame(savedGame, defaults) {
    if (!savedGame) return null;
    savedGame.teams?.forEach(team => {team.doubleOrNothingUsed = !!team.doubleOrNothingUsed;});
    savedGame.challengeEnabled = typeof savedGame.challengeEnabled === 'boolean' ? savedGame.challengeEnabled : (defaults.challengeEnabled ?? true);
    savedGame.challengeMultiplier = CHALLENGE_MULTIPLIERS.includes(Number(savedGame.challengeMultiplier)) ? Number(savedGame.challengeMultiplier) : defaultChallengeMultiplier(defaults);
    savedGame.allowNegativeScores = typeof savedGame.allowNegativeScores === 'boolean' ? savedGame.allowNegativeScores : (defaults.allowNegativeScores ?? true);
    if (!Number.isInteger(savedGame.doubleOrNothingTeam) || !savedGame.teams?.[savedGame.doubleOrNothingTeam]) delete savedGame.doubleOrNothingTeam;
    return savedGame;
  }
  return {CHALLENGE_MULTIPLIERS, applyJudgement, defaultChallengeMultiplier, hasPendingChallenge, normalizeSavedGame, questionPoints};
})();
