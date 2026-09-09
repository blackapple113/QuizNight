'use strict';

const DEFAULTS = window.QUIZZ_CONFIG;
const {create: createStorage, readJson} = window.QuizzStorage;
const {buildBoard, clone, correctChoiceIndex, escapeHtml: esc, formatEstimate, loadPool, parseEstimate, poolStats: getPoolStats, shuffle, validateData} = window.QuizzQuestionBank;
const {CHALLENGE_MULTIPLIERS, applyJudgement, defaultChallengeMultiplier, hasPendingChallenge, normalizeSavedGame, questionPoints} = window.QuizzScoring;

const LS_GAME = 'jeopardy-game-state-v1';
const LS_BOARD_SETTINGS = 'jeopardy-board-settings-v1';
const LS_TIMER = 'quizz-timer-settings-v1';
const LS_RULES = 'quizz-rules-v1';
const LS_THEME = 'quizz-theme-v1';
let timerInterval = null;
const LS_POOL = 'quizz-selected-pool-v1';
const pools = window.QUESTION_POOLS || [];
let activePoolId = null;
let data = null;
let game = null;
let currentQuestion = null;
let scoreEditTeam = null;
let scoreEditReturn = 'board';
let startingTeamTimers = [];
let startingTeamRun = 0;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const screens = ['setupScreen', 'boardScreen', 'questionScreen', 'endScreen'];
function showScreen(id) {screens.forEach(x => $('#' + x).classList.toggle('active', x === id)); $('#resetBtn').classList.toggle('hidden', id === 'setupScreen'); $('#settingsBtn').classList.toggle('hidden', id !== 'setupScreen'); $('#settingsFields').disabled = id !== 'setupScreen'; if (id !== 'questionScreen') clearInterval(timerInterval); window.scrollTo({top: 0, behavior: 'auto'});}
async function selectPool(id) {
  if (settingsLocked()) return;
  const pool = pools.find(p => p.id === id);
  data = null;
  activePoolId = null;
  $('#startBtn').disabled = true;
  $('#poolSelect').disabled = true;
  $('#poolInfo').textContent = 'Fragenpool wird geladen …';
  setupNotice('Fragenpool wird geladen …');
  try {
    if (!pool) throw new Error('Kein Fragenpool in pools/index.js eingetragen.');
    const loaded = await loadPool(pool);
    validateData(loaded, loadBoardSettings(), false);
    data = loaded;
    activePoolId = pool.id;
    $('#poolSelect').value = pool.id;
    storage.setItem(LS_POOL, pool.id);
    renderPoolInfo();
  } catch (error) {
    console.error(error);
    $('#poolInfo').textContent = error.message;
    setupNotice(error.message + ' Bitte die Einstellungen prüfen.');
  } finally {
    $('#poolSelect').disabled = false;
  }
}
const storage = createStorage(showStorageNotice);
function showStorageNotice() {document.querySelector('.footer').textContent = 'Der Browserspeicher ist nicht verfügbar. Der Spielstand bleibt nur bis zum Schließen oder Neuladen dieser Seite erhalten.';}
function normalizeBoardSettings(value = {}) {return {categoriesPerGame: Math.min(6, Math.max(3, Number(value.categoriesPerGame) || DEFAULTS.categoriesPerGame)), questionsPerCategory: Math.min(5, Math.max(2, Number(value.questionsPerCategory) || DEFAULTS.questionsPerCategory))};}
function loadBoardSettings() {try {return normalizeBoardSettings(JSON.parse(storage.getItem(LS_BOARD_SETTINGS) || '{}'))} catch {return normalizeBoardSettings();} }
function saveBoardSettings() {if (settingsLocked()) return; const settings = normalizeBoardSettings({categoriesPerGame: $('#categoryCount').value, questionsPerCategory: $('#questionCount').value}); storage.setItem(LS_BOARD_SETTINGS, JSON.stringify(settings)); renderPoolInfo();}
function settingsLocked() {return !$('#setupScreen').classList.contains('active');}
function setupNotice(message = '') {$('#setupNotice').textContent = message; $('#setupNotice').classList.toggle('hidden', !message);}
function openSettings() {if (settingsLocked()) return; $('#themeSelect').value = document.body.dataset.theme; $('#settingsDialog').showModal();}
function openRules() {
  const rules = game || {mode: selectedMode(), mcMultiplier: Number($('#mcPenalty').value), timerSeconds: $('#timerEnabled').checked ? Number($('#timerSeconds').value) : 0, challengeEnabled: $('#challengeEnabled').checked, challengeMultiplier: Number($('#challengeMultiplier').value), allowNegativeScores: $('#allowNegativeScores').checked};
  const mode = rules.mode === 'mc' ? 'Multiple Choice' : `offene Fragen${rules.mcMultiplier < 1 ? ` mit ${Math.round(rules.mcMultiplier * 100)} % bei MC-Hilfe` : ''}`;
  const timer = rules.timerSeconds > 0 ? `Timer: ${rules.timerSeconds} Sekunden.` : 'Timer: aus.';
  const challenge = rules.challengeEnabled ? `Challenge: ${String(rules.challengeMultiplier).replace('.', ',')}×, negative Punkte ${rules.allowNegativeScores ? 'erlaubt' : 'nicht erlaubt'}.` : 'Challenge: aus.';
  $('#rulesSummary').textContent = `Aktuelle Regeln: ${mode} · ${timer} · ${challenge}`;
  $('#rulesDialog').showModal();
}
function applyTheme(theme) {
  if (![...$('#themeSelect').options].some(option => option.value === theme)) return;
  document.body.dataset.theme = theme;
  $('#themeSelect').value = theme;
}
function loadTimerSettings() {
  try {
    const value = JSON.parse(storage.getItem(LS_TIMER) || '{}');
    return {enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULTS.timerEnabled, seconds: Math.min(600, Math.max(5, Math.round(Number(value?.seconds) || DEFAULTS.timerSeconds)))};
  } catch {return {enabled: DEFAULTS.timerEnabled, seconds: DEFAULTS.timerSeconds};}
}
function saveTimerSettings() {
  if (settingsLocked()) return;
  $('#timerSeconds').disabled = !$('#timerEnabled').checked;
  if (!$('#timerSeconds').checkValidity()) return;
  storage.setItem(LS_TIMER, JSON.stringify({enabled: $('#timerEnabled').checked, seconds: Number($('#timerSeconds').value)}));
}
function startingTeamSettings() {return {enabled: $('#startingTeamSelectionEnabled').checked, mode: $('#startingTeamMode').value === 'random' ? 'random' : 'manual'};}
function saveRules() {
  if (settingsLocked()) return;
  storage.setItem(LS_RULES, JSON.stringify({mode: selectedMode(), mcMultiplier: Number($('#mcPenalty').value), challengeEnabled: $('#challengeEnabled').checked, challengeMultiplier: Number($('#challengeMultiplier').value), allowNegativeScores: $('#allowNegativeScores').checked, startingTeamSelectionEnabled: $('#startingTeamSelectionEnabled').checked, startingTeamMode: $('#startingTeamMode').value}));
  updateModeOptions(); updateChallengeOptions(); updateStartingTeamOptions();
}
function updateModeOptions() {$('#mcPenaltyField').classList.toggle('hidden', selectedMode() !== 'open');}
function updateChallengeOptions() {
  const enabled = $('#challengeEnabled').checked;
  $('#challengeMultiplier').disabled = !enabled;
  $('#allowNegativeScores').disabled = !enabled;
  $('#challengeOptions').classList.toggle('disabled', !enabled);
}
function updateStartingTeamOptions() {
  const enabled = $('#startingTeamSelectionEnabled').checked;
  $('#startingTeamMode').disabled = !enabled;
  $('#startingTeamOptions').classList.toggle('disabled', !enabled);
}
// Persist the deadline across reloads. Returning to the board resets unanswered questions.
function timerRemaining(question) {
  if (!question?._timer) return 0;
  return Math.max(0, question._timer.remainingMs ?? (question._timer.deadline - Date.now()));
}
function startQuestionTimer() {
  clearInterval(timerInterval);
  if (game.timerSeconds > 0 && !currentQuestion._timer) {
    currentQuestion._timer = {deadline: Date.now() + game.timerSeconds * 1000};
    if (currentQuestion._revealed || currentQuestion._choiceSelected) currentQuestion._timer.remainingMs = game.timerSeconds * 1000;
    saveGame();
  }
  renderQuestionTimer();
  if (currentQuestion._timer && currentQuestion._timer.remainingMs == null && timerRemaining(currentQuestion) > 0) {
    timerInterval = setInterval(renderQuestionTimer, 50);
  }
}
function stopQuestionTimer() {
  clearInterval(timerInterval);
  if (currentQuestion?._timer && currentQuestion._timer.remainingMs == null) {
    currentQuestion._timer.remainingMs = timerRemaining(currentQuestion);
  }
  renderQuestionTimer();
}
function renderQuestionTimer() {
  const timer = currentQuestion?._timer;
  $('#questionTimer').classList.toggle('hidden', !timer);
  $('#timerStatus').classList.toggle('hidden', !timer);
  $('#timerDisplay').classList.toggle('hidden', !timer);
  if (!timer) return;
  const ratio = Math.min(1, timerRemaining(currentQuestion) / (game.timerSeconds * 1000));
  $('#timerBar').style.setProperty('--timer-ratio', ratio);
  $('#timerBar').style.setProperty('--timer-start-weight', `${Math.round(ratio * 100)}%`);
  const remaining = Math.ceil(timerRemaining(currentQuestion) / 1000);
  const expired = remaining === 0;
  $('#timerDisplay').textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  $('#questionTimer').classList.toggle('expired', expired);
  $('#timerStatus').classList.toggle('expired', expired);
  const status = expired ? 'Zeit abgelaufen – die Spielleitung entscheidet über die Wertung.' : timer.remainingMs != null ? 'Timer gestoppt' : 'Verbleibende Antwortzeit';
  if ($('#timerStatus').textContent !== status) $('#timerStatus').textContent = status;
  if (expired) {
    clearInterval(timerInterval);
    // Also allow a moderator to reveal and judge an unanswered MC question.
    if (!currentQuestion._choiceSelected && !currentQuestion._revealed) $('#revealBtn').classList.remove('hidden');
  }
}
function saveGame() {if (game) storage.setItem(LS_GAME, JSON.stringify(game));}
function loadGame() {
  return normalizeSavedGame(readJson(storage, LS_GAME), DEFAULTS);
}
function clearGame() {clearInterval(timerInterval); storage.removeItem(LS_GAME); game = null; currentQuestion = null;}
function poolStats() {
  const stats = getPoolStats(data, loadBoardSettings());
  return {cats: stats.categories, eligible: stats.eligible, questions: stats.questions, tiebreakers: stats.tiebreakers};
}
function renderPoolInfo() {if (!data) return; const s = poolStats(), settings = loadBoardSettings(); $('#poolInfo').textContent = `Board: ${settings.categoriesPerGame} Kategorien × ${settings.questionsPerCategory} Fragen · Fragenpool: ${s.questions} Fragen in ${s.cats} Kategorien · ${s.eligible} Kategorien sind dafür vollständig spielbar · ${s.tiebreakers} Tie-Breaker.`; try {validateData(data, settings); $('#startBtn').disabled = false; setupNotice();} catch (error) {$('#startBtn').disabled = true; $('#poolInfo').textContent += ` ${error.message} Bitte die Board-Einstellungen anpassen.`; setupNotice(error.message + ' Bitte die Board-Einstellungen anpassen.');}}
function updateTeamControls() {
  const count = $$('#teamList .team-row').length;
  $('#addTeamBtn').disabled = count >= 5;
  $$('#teamList .team-row button').forEach(btn => btn.disabled = count <= 2);
}
function addTeam(name = '') {
  const list = $('#teamList'), count = $$('#teamList .team-row').length; if (count >= 5) return; const idx = count + 1;
  const row = document.createElement('div'); row.className = 'team-row';
  row.innerHTML = `<input aria-label="Teamname" value="${esc(name || 'Team ' + idx)}"><button class="btn ghost" title="Team entfernen">×</button>`;
  row.querySelector('button').onclick = () => {if ($$('#teamList .team-row').length > 2) {row.remove(); updateTeamControls();} };
  list.insertBefore(row, $('#addTeamControl')); updateTeamControls();
}
function getTeamNames() {return [...$('#teamList').querySelectorAll('input')].map(x => x.value.trim()).filter(Boolean);}
function selectedMode() {return $('input[name="mode"]:checked').value;}
function startGame() {
  if (!data) return;
  if (selectedMode() === 'mc' && data.questions.some(q => !q.choices?.length)) {alert('Dieser Pool enthält Fragen ohne Antwortmöglichkeiten. Bitte den Modus „Offene Fragen“ wählen.'); return;}
  if ($('#timerEnabled').checked && !$('#timerSeconds').checkValidity()) {openSettings(); $('#timerSeconds').reportValidity(); return;}
  saveBoardSettings(); saveTimerSettings();
  const names = getTeamNames(); if (names.length < 2) {alert('Bitte mindestens zwei Teams eintragen.'); return;} if (names.length > 5) {alert('Es sind maximal fünf Teams möglich.'); return;}
  try {const b = buildBoard(data, loadBoardSettings()), startSettings = startingTeamSettings(); game = {version: 4, theme: document.body.dataset.theme, firstQuestionOpened: false, timerSeconds: $('#timerEnabled').checked ? Number($('#timerSeconds').value) : 0, poolId: activePoolId, tiebreakers: clone(data.tiebreakers), mode: selectedMode(), mcMultiplier: Number($('#mcPenalty').value), challengeEnabled: $('#challengeEnabled').checked, challengeMultiplier: Number($('#challengeMultiplier').value), allowNegativeScores: $('#allowNegativeScores').checked, startingTeamPending: startSettings.enabled, startingTeamMode: startSettings.mode, teams: names.map(n => ({name: n, score: 0, doubleOrNothingUsed: false})), activeTeam: 0, categories: b.categories, points: b.points, cells: b.cells, answered: 0, startedAt: Date.now()}; saveGame(); renderBoard(); showScreen('boardScreen'); if (game.startingTeamPending) openStartingTeamDialog();} catch (e) {alert('Spiel kann nicht gestartet werden: ' + e.message);}
}
function hasPendingDoubleOrNothing() {return hasPendingChallenge(game);}
function clearStartingTeamAnimation() {startingTeamRun++; startingTeamTimers.forEach(clearTimeout); startingTeamTimers = [];}
function chooseStartingTeam(index) {
  if (!game?.startingTeamPending || !Number.isInteger(index) || !game.teams[index]) return;
  clearStartingTeamAnimation(); game.activeTeam = index; game.startingTeamPending = false; saveGame(); renderBoard(); $('#startingTeamDialog').close();
}
function renderRandomTeamCards() {$('#randomTeamCards').innerHTML = game.teams.map((team, index) => `<div class="random-team-card" data-random-team="${index}">${esc(team.name)}</div>`).join('');}
function highlightRandomTeam(index, selected = false) {
  $$('#randomTeamCards .random-team-card').forEach(card => card.classList.remove('is-flashing', 'is-selected'));
  const card = $(`#randomTeamCards [data-random-team="${index}"]`);
  if (card) card.classList.add(selected ? 'is-selected' : 'is-flashing');
}
function startRandomTeamSelection() {
  clearStartingTeamAnimation();
  const run = startingTeamRun;
  const teamCount = game?.teams.length || 0;
  if (!teamCount) return;
  const finalIndex = Math.floor(Math.random() * teamCount);
  const steps = Math.max(20, teamCount * 7);
  const weights = Array.from({length: steps}, (_, index) => 1 + 9 * Math.pow(index / (steps - 1), 3));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const startIndex = (finalIndex - (steps - 1) % teamCount + teamCount) % teamCount;
  let elapsed = 0;
  $('#randomTeamStatus').textContent = 'Die Auslosung läuft …';
  weights.forEach((weight, step) => {
    startingTeamTimers.push(setTimeout(() => {if (run === startingTeamRun) highlightRandomTeam((startIndex + step) % teamCount);}, elapsed));
    elapsed += Math.round(weight / totalWeight * 5000);
  });
  startingTeamTimers.push(setTimeout(() => {
    if (run !== startingTeamRun) return;
    highlightRandomTeam(finalIndex, true);
    $('#randomTeamStatus').textContent = `${game.teams[finalIndex].name} beginnt!`;
    startingTeamTimers.push(setTimeout(() => {if (run === startingTeamRun) chooseStartingTeam(finalIndex);}, 1750));
  }, elapsed));
}
function openStartingTeamDialog() {
  if (!game?.startingTeamPending) return;
  clearStartingTeamAnimation();
  const random = game.startingTeamMode === 'random';
  $('#startingTeamDialogIntro').classList.toggle('hidden', random);
  if (!random) $('#startingTeamDialogIntro').textContent = 'Wählt das Team für den ersten Spielzug.';
  $('#manualStartingTeamSelection').classList.toggle('hidden', random);
  $('#randomStartingTeamSelection').classList.toggle('hidden', !random);
  $('#startingTeamDialogActions').classList.toggle('hidden', random);
  $('#startingTeamSelect').innerHTML = game.teams.map((team, index) => `<option value="${index}">${esc(team.name)}</option>`).join('');
  $('#startingTeamSelect').value = game.activeTeam;
  if (random) {renderRandomTeamCards(); $('#randomTeamStatus').textContent = '';}
  if (!$('#startingTeamDialog').open) $('#startingTeamDialog').showModal();
  if (random) requestAnimationFrame(startRandomTeamSelection); else $('#startingTeamSelect').focus();
}
function renderScores() {
  const challengeEnabled = !!game.challengeEnabled;
  $('#scorebar').innerHTML = game.teams.map((t, i) => {
    const active = i === game.activeTeam;
    const pending = game.doubleOrNothingTeam === i;
    const challengeDisabled = !active || t.doubleOrNothingUsed || hasPendingDoubleOrNothing();
    const challengeLabel = pending ? 'Challenge aktiv' : t.doubleOrNothingUsed ? 'Challenge genutzt' : 'Challenge';
    return `<div class="team-score ${active ? 'active' : ''} ${challengeEnabled ? 'has-challenge' : ''} ${t.doubleOrNothingUsed ? 'challenge-used' : ''}"><button type="button" class="team-score-main" data-team="${i}" aria-label="Punkte von ${esc(t.name)} korrigieren"><span class="name">${esc(t.name)}</span><span class="score">${t.score}</span></button>${challengeEnabled ? `<button type="button" class="challenge-btn" data-challenge-team="${i}" aria-label="${challengeLabel} für ${esc(t.name)}" title="${challengeLabel}" ${challengeDisabled ? 'disabled' : ''}><span aria-hidden="true">⚡</span><span class="challenge-label">${challengeLabel}</span></button>` : ''}</div>`;
  }).join('');
  $$('#scorebar .team-score-main').forEach(btn => btn.onclick = () => openScoreDialog(Number(btn.dataset.team), 'board'));
  $$('#scorebar .challenge-btn').forEach(btn => btn.onclick = () => activateDoubleOrNothing(Number(btn.dataset.challengeTeam)));
  if (window.matchMedia('(max-width: 760px)').matches) {
    const activeCard = $('#scorebar .team-score.active');
    requestAnimationFrame(() => {
      if (!activeCard) return;
      const scorebar = $('#scorebar');
      const target = activeCard.offsetLeft - (scorebar.clientWidth - activeCard.clientWidth) / 2;
      scorebar.scrollTo({left: Math.max(0, target), behavior: 'smooth'});
    });
  }
  $('#turnName').textContent = game.teams[game.activeTeam].name;
  $('#progressText').textContent = `${game.answered} / ${game.cells.length} Fragen`;
}
function activateDoubleOrNothing(teamIndex) {
  if (!game?.challengeEnabled || teamIndex !== game.activeTeam || hasPendingDoubleOrNothing() || game.teams[teamIndex].doubleOrNothingUsed) return;
  game.teams[teamIndex].doubleOrNothingUsed = true;
  game.doubleOrNothingTeam = teamIndex;
  saveGame(); renderBoard();
}
function openScoreDialog(teamIndex, returnTo) {
  if (!game || !game.teams[teamIndex]) return;
  scoreEditTeam = teamIndex; scoreEditReturn = returnTo;
  $('#scoreDialogTitle').textContent = `Punkte korrigieren: ${game.teams[teamIndex].name}`;
  $('#scoreInput').value = game.teams[teamIndex].score;
  $('#scoreDialog').showModal();
  $('#scoreInput').focus(); $('#scoreInput').select();
}
function adjustScore(delta) {
  const input = $('#scoreInput'); const current = Number(input.value);
  input.value = (Number.isFinite(current) ? current : 0) + delta;
}
function saveScoreCorrection() {
  const score = Number($('#scoreInput').value);
  if (!Number.isFinite(score)) {alert('Bitte einen gültigen Punktestand eingeben.'); return;}
  game.teams[scoreEditTeam].score = Math.round(score); saveGame(); $('#scoreDialog').close();
  if (scoreEditReturn === 'end') finishGame(); else renderScores();
}
function cellFor(cat, p) {return game.cells.find(c => c.category === cat && Number(c.points) === Number(p));}
function renderBoard() {
  renderScores(); const b = $('#board'); b.innerHTML = '';
  const categoryCount = game.categories.length; b.style.setProperty('--category-count', categoryCount); b.style.setProperty('--board-min-width', (categoryCount * 150 + (categoryCount - 1) * 8) + 'px'); b.style.setProperty('--board-mobile-min-width', (categoryCount * 112 + (categoryCount - 1) * 5) + 'px');
  game.categories.forEach(cat => {const el = document.createElement('div'); el.className = 'category'; el.textContent = cat; b.appendChild(el);});
  game.points.forEach(p => game.categories.forEach(cat => {
    const c = cellFor(cat, p); const btn = document.createElement('button'); btn.className = 'tile' + (c.used ? ' used' : ''); btn.textContent = c.used ? '' : p; btn.disabled = !!c.used; btn.onclick = () => openQuestion(c.id); b.appendChild(btn);
  }));
}
function openQuestion(id) {
  if (game?.startingTeamPending) return;
  currentQuestion = game.cells.find(c => c.id === id && !c.used); if (!currentQuestion) return;
  game.firstQuestionOpened = true;
  game.currentQuestionId = id;
  const doubleOrNothing = game.doubleOrNothingTeam === game.activeTeam;
  const challengePoints = Math.round(Number(currentQuestion.points) * game.challengeMultiplier);
  $('#qCategory').textContent = currentQuestion.category; $('#qPoints').textContent = doubleOrNothing ? `${currentQuestion.points} Punkte · Challenge: ±${challengePoints}` : currentQuestion.points + ' Punkte'; $('#qTeam').textContent = game.teams[game.activeTeam].name;
  const isJ = game.mode === 'jeopardy';
  $('#questionText').textContent = isJ ? currentQuestion.answer : currentQuestion.question;
  $('#answerBox').classList.remove('visible'); $('#answerBox').textContent = isJ ? ('Gesuchte Frage: ' + currentQuestion.question) : ('Antwort: ' + currentQuestion.answer);
  $('#revealBtn').textContent = isJ ? 'Gesuchte Frage zeigen' : 'Lösung zeigen';
  $('#judgeActions').classList.add('hidden'); $('#mcContinueActions').classList.add('hidden'); $('#mcResult').classList.add('hidden'); $('#mcResult').textContent = '';
  $('#preRevealActions').classList.remove('hidden'); $('#helpInfo').classList.add('hidden'); $('#helpInfo').textContent = '';
  const choices = $('#choices'); choices.innerHTML = ''; choices.classList.add('hidden');
  const canHelp = game.mode === 'open' && Array.isArray(currentQuestion.choices) && currentQuestion.choices.length > 1;
  $('#helpBtn').classList.toggle('hidden', !canHelp);
  $('#revealBtn').classList.toggle('hidden', game.mode === 'mc');
  if (game.mode === 'mc' || currentQuestion._helpUsed) showChoices(!!currentQuestion._helpUsed);
  if (currentQuestion._choiceSelected) renderChoiceResult();
  else if (currentQuestion._revealed) renderRevealedAnswer();
  showScreen('questionScreen');
  startQuestionTimer();
  saveGame();
}
function showChoices(asHelp) {
  const ch = $('#choices');
  const correctIndex = correctChoiceIndex(currentQuestion);
  const items = (currentQuestion.choices || []).map((text, index) => ({text, correct: index === correctIndex}));
  ch.innerHTML = '';
  items.forEach((item, i) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'choice'; btn.dataset.correct = item.correct ? 'true' : 'false';
    btn.innerHTML = `<strong>${String.fromCharCode(65 + i)}.</strong> ${esc(item.text)}`;
    btn.onclick = () => selectChoice(btn, item.correct); ch.appendChild(btn);
  });
  ch.classList.remove('hidden');
  if (asHelp) {
    currentQuestion._helpUsed = true;
    const challengeActive = game.doubleOrNothingTeam === game.activeTeam;
    const challengeInfo = challengeActive ? ` Challenge: ±${questionPoints(currentQuestion, game, true)} Punkte.` : '';
    $('#helpInfo').textContent = `MC-Hilfe aktiv: ${Math.round(game.mcMultiplier * 100)} % der Punkte bei richtiger Antwort.${challengeInfo}`;
    $('#helpInfo').classList.remove('hidden'); $('#helpBtn').classList.add('hidden'); saveGame();
  }
}
function selectChoice(selectedBtn, isCorrect) {
  if (!currentQuestion || currentQuestion._choiceSelected || currentQuestion._revealed) return;
  currentQuestion._choiceSelected = true; currentQuestion._choiceCorrect = isCorrect;
  currentQuestion._selectedIndex = [...$('#choices').children].indexOf(selectedBtn);
  stopQuestionTimer(); saveGame(); renderChoiceResult();
}
function renderChoiceResult() {
  const isCorrect = currentQuestion._choiceCorrect;
  const selectedBtn = $('#choices').children[currentQuestion._selectedIndex];
  const buttons = [...$('#choices').querySelectorAll('.choice')];
  buttons.forEach(btn => {
    btn.disabled = true;
    const correct = btn.dataset.correct === 'true';
    if (correct) btn.classList.add('correct');
    else if (btn === selectedBtn) btn.classList.add('wrong');
    else btn.classList.add('unselected');
  });
  $('#answerBox').classList.add('visible');
  $('#preRevealActions').classList.add('hidden'); $('#judgeActions').classList.add('hidden');
  const doubleOrNothing = game.doubleOrNothingTeam === game.activeTeam;
  const points = questionPoints(currentQuestion, game, doubleOrNothing);
  const deduction = game.allowNegativeScores ? points : Math.min(game.teams[game.activeTeam].score, points);
  const result = $('#mcResult'); result.textContent = isCorrect ? `Richtig – +${points} Punkte werden beim Weitergehen übernommen.` : doubleOrNothing ? `Falsch – ${deduction} Punkte werden abgezogen.` : 'Falsch – es werden keine Punkte vergeben.';
  result.className = 'mc-result ' + (isCorrect ? 'correct' : 'wrong');
  $('#mcContinueActions').classList.remove('hidden');
}
function reveal() {
  if (!currentQuestion) return;
  currentQuestion._revealed = true;
  stopQuestionTimer(); saveGame(); renderRevealedAnswer();
}
function renderRevealedAnswer() {
  $('#answerBox').classList.add('visible'); $('#preRevealActions').classList.add('hidden'); $('#judgeActions').classList.remove('hidden');
  const buttons = [...$('#choices').querySelectorAll('.choice')];
  if (buttons.length && !currentQuestion._choiceSelected) {buttons.forEach(btn => {btn.disabled = true; if (btn.dataset.correct === 'true') btn.classList.add('correct'); else btn.classList.add('unselected');});}
}
function backToBoard() {
  clearInterval(timerInterval);
  if (currentQuestion && !currentQuestion._revealed && !currentQuestion._choiceSelected) {
    delete currentQuestion._timer;
  }
  game.currentQuestionId = null; saveGame();
  currentQuestion = null; renderBoard(); showScreen('boardScreen');
}
function acceptMcResult() {
  if (!currentQuestion || !currentQuestion._choiceSelected) return;
  judge(!!currentQuestion._choiceCorrect);
}
function judge(correct) {
  if (!currentQuestion || currentQuestion.used) return;
  stopQuestionTimer(); game.currentQuestionId = null;
  const c = game.cells.find(x => x.id === currentQuestion.id); c.used = true; game.answered++;
  applyJudgement(game, c, correct);
  game.activeTeam = (game.activeTeam + 1) % game.teams.length; saveGame(); currentQuestion = null;
  if (game.answered >= game.cells.length) finishGame(); else {renderBoard(); showScreen('boardScreen');}
}
function finishGame() {
  const sorted = game.teams.map((t, i) => ({...t, index: i})).sort((a, b) => b.score - a.score);
  $('#ranking').innerHTML = sorted.map((t, i) => `<div class="rank"><div class="place">${i + 1}.</div><div class="rname">${esc(t.name)}</div><div class="rank-edit"><span class="rscore">${t.score}</span><button type="button" class="btn ghost compact" data-team="${t.index}">Korrigieren</button></div></div>`).join('');
  $$('#ranking button[data-team]').forEach(btn => btn.onclick = () => openScoreDialog(Number(btn.dataset.team), 'end'));
  const top = sorted[0].score; const tied = sorted.filter(t => t.score === top);
  const prompt = $('#tiebreakerPrompt'); document.body.classList.remove('tiebreaker-open'); $('#tiebreakerOverlay').classList.add('hidden'); $('#tiebreakerArea').classList.remove('evaluated');
  if (tied.length > 1 && !(game.tiebreakers ?? data?.tiebreakers ?? []).length) {$('#winnerText').textContent = `Gleichstand mit ${top} Punkten. Dieser Pool enthält keine Schätzfragen.`; prompt.classList.add('hidden');}
  else if (tied.length > 1) {$('#winnerText').textContent = `Gleichstand mit ${top} Punkten.`; prompt.classList.remove('hidden'); prompt.innerHTML = `<h2>Tie-Breaker</h2><p>${tied.map(t => esc(t.name)).join(', ')} liegen gleichauf.</p><button class="btn accent" id="startTbBtn">Tie-Breaker starten</button>`; $('#startTbBtn').onclick = () => startTiebreaker(tied);}
  else {$('#winnerText').textContent = `${sorted[0].name} gewinnt mit ${sorted[0].score} Punkten.`; prompt.classList.add('hidden');}
  showScreen('endScreen');
}
function startTiebreaker(tied) {
  const available = game.tiebreakers ?? data?.tiebreakers ?? [];
  if (!available.length) return;
  const used = game.usedTiebreakers || []; let pool = available.filter(q => !used.includes(q.id)); if (!pool.length) pool = available;
  const q = clone(shuffle(pool)[0]); game.usedTiebreakers = [...(game.usedTiebreakers || []), q.id]; saveGame();
  const area = $('#tiebreakerArea'); area.classList.remove('evaluated'); $('#tiebreakerOverlay').classList.remove('hidden'); document.body.classList.add('tiebreaker-open'); area.innerHTML = `<h2>Tie-Breaker · Schätzfrage</h2><p class="question-text">${esc(q.question)}</p><div class="tb-guesses">${tied.map(t => `<div class="tb-guess"><label for="tbGuess${t.index}">${esc(t.name)}</label><input id="tbGuess${t.index}" data-team="${t.index}" type="text" inputmode="decimal" placeholder="Schätzung eingeben" autocomplete="off"></div>`).join('')}</div><div class="setup-actions"><button class="btn accent" id="evaluateTbBtn">Schätzungen auswerten</button></div><div id="tbEvaluation"></div>`;
  $('#evaluateTbBtn').onclick = () => evaluateTiebreaker(q, tied);
  area.querySelector('input')?.focus();
}
function evaluateTiebreaker(q, tied) {
  const answer = parseEstimate(q.numericAnswer ?? q.answer);
  if (!Number.isFinite(answer)) {alert('Die Lösung dieser Tie-Breaker-Frage ist nicht als Zahl auswertbar.'); return;}
  const results = [];
  for (const t of tied) {const input = $(`#tbGuess${t.index}`); const guess = parseEstimate(input.value); if (!Number.isFinite(guess)) {alert(`Bitte für ${t.name} eine gültige Schätzung eingeben.`); input.focus(); return;} results.push({...t, guess, difference: Math.abs(guess - answer)});}
  const minimum = Math.min(...results.map(r => r.difference));
  const closest = results.filter(r => Math.abs(r.difference - minimum) < 1e-9);
  results.sort((a, b) => a.difference - b.difference);
  const area = $('#tiebreakerArea'); area.classList.add('evaluated'); area.querySelector('.tb-guesses').classList.add('hidden'); $('#evaluateTbBtn').closest('.setup-actions').classList.add('hidden');
  const evaluation = $('#tbEvaluation');
  evaluation.innerHTML = `<div class="answer-box visible" style="margin:16px 0">Richtige Antwort: ${esc(q.answer)}</div><div class="tb-results">${results.map(r => `<div class="tb-result ${closest.some(c => c.index === r.index) ? 'closest' : ''}"><strong>${esc(r.name)}</strong><span>Schätzung: ${formatEstimate(r.guess)} · Abweichung: ${formatEstimate(r.difference)}</span></div>`).join('')}</div>`;
  $$('#tiebreakerArea input, #evaluateTbBtn').forEach(el => el.disabled = true);
  if (closest.length === 1) {const winner = closest[0]; $('#winnerText').textContent = `${winner.name} gewinnt den Tie-Breaker!`; evaluation.insertAdjacentHTML('beforeend', `<h2 style="margin-top:18px">🏆 ${esc(winner.name)} gewinnt!</h2><p>Dieses Team liegt am nächsten an der richtigen Antwort.</p><div class="setup-actions"><button class="btn accent" id="tbNewGameBtn">Neue Runde</button></div>`); $('#tbNewGameBtn').onclick = resetToSetup; storage.removeItem(LS_GAME);}
  else {evaluation.insertAdjacentHTML('beforeend', `<p class="status" style="margin-top:16px">${closest.map(t => esc(t.name)).join(' und ')} haben die gleiche Abweichung. Eine weitere Schätzfrage entscheidet.</p><div class="setup-actions"><button class="btn accent" id="nextTbBtn">Weitere Schätzfrage</button></div>`); $('#nextTbBtn').onclick = () => startTiebreaker(closest);}
}
function resumeGame() {game = loadGame(); if (!game) return; applyTheme(game.theme || storage.getItem(LS_THEME) || DEFAULTS.theme); if (game.answered >= game.cells.length) finishGame(); else if (game.currentQuestionId && game.cells.some(c => c.id === game.currentQuestionId && !c.used)) openQuestion(game.currentQuestionId); else {renderBoard(); showScreen('boardScreen'); if (game.startingTeamPending) openStartingTeamDialog();} }
function resetToSetup() {clearStartingTeamAnimation(); if ($('#startingTeamDialog').open) $('#startingTeamDialog').close(); document.body.classList.remove('tiebreaker-open'); $('#tiebreakerOverlay').classList.add('hidden'); $('#tiebreakerArea').classList.remove('evaluated'); clearGame(); showScreen('setupScreen'); applyTheme(storage.getItem(LS_THEME) || DEFAULTS.theme); $('#resetBtn').classList.add('hidden'); checkResume();}
function checkResume() {const g = loadGame(); const box = $('#resumeBox'), btn = $('#resumeBtn'); if (g) {box.textContent = `Gespeichertes Spiel gefunden: ${g.teams.map(t => t.name).join(' · ')} · ${g.answered}/${g.cells.length} Fragen gespielt.`; box.classList.remove('hidden'); btn.classList.remove('hidden');} else {box.classList.add('hidden'); btn.classList.add('hidden');} }

$('#addTeamBtn').onclick = () => addTeam(); $('#startBtn').onclick = startGame; $('#resumeBtn').onclick = resumeGame;
$('#helpBtn').onclick = () => showChoices(true); $('#revealBtn').onclick = reveal; $('#correctBtn').onclick = () => judge(true); $('#wrongBtn').onclick = () => judge(false);
$('#backToBoardBtn').onclick = backToBoard; $('#mcContinueBtn').onclick = acceptMcResult;
$('#newGameBtn').onclick = resetToSetup; $('#resetBtn').onclick = () => $('#confirmDialog').showModal(); $('#cancelResetBtn').onclick = () => $('#confirmDialog').close(); $('#confirmResetBtn').onclick = () => {$('#confirmDialog').close(); resetToSetup();};
$$('[data-score-delta]').forEach(btn => btn.onclick = () => adjustScore(Number(btn.dataset.scoreDelta)));
$('#cancelScoreBtn').onclick = () => $('#scoreDialog').close(); $('#saveScoreBtn').onclick = saveScoreCorrection;
$('#scoreInput').onkeydown = e => {if (e.key === 'Enter') saveScoreCorrection();};
$('#settingsBtn').onclick = openSettings;
$('#rulesBtn').onclick = openRules; $('#closeRulesBtn').onclick = () => $('#rulesDialog').close();
$('#confirmStartingTeamBtn').onclick = () => chooseStartingTeam(Number($('#startingTeamSelect').value));
$('#startingTeamDialog').addEventListener('cancel', event => event.preventDefault());
function closeSettings() {
  if ($('#timerEnabled').checked && !$('#timerSeconds').reportValidity()) return;
  saveBoardSettings(); saveTimerSettings(); saveRules(); $('#settingsDialog').close();
}
$('#closeSettingsBtn').onclick = closeSettings;
$('#settingsDialog').addEventListener('cancel', event => {event.preventDefault(); closeSettings();});
$('#themeSelect').onchange = () => {if (settingsLocked()) return; applyTheme($('#themeSelect').value); storage.setItem(LS_THEME, document.body.dataset.theme);};
$('#categoryCount').onchange = saveBoardSettings; $('#questionCount').onchange = saveBoardSettings;
$('#mcPenalty').onchange = saveRules; $('#challengeEnabled').onchange = saveRules; $('#challengeMultiplier').onchange = saveRules; $('#allowNegativeScores').onchange = saveRules; $('#startingTeamSelectionEnabled').onchange = saveRules; $('#startingTeamMode').onchange = saveRules;
$('#timerEnabled').onchange = saveTimerSettings; $('#timerSeconds').oninput = saveTimerSettings;
$$('input[name="mode"]').forEach(input => input.onchange = saveRules);

async function initialize() {
  $(`input[name="mode"][value="${DEFAULTS.mode}"]`).checked = true;
  $('#mcPenalty').value = DEFAULTS.mcMultiplier;
  $('#challengeEnabled').checked = DEFAULTS.challengeEnabled ?? true;
  $('#challengeMultiplier').value = defaultChallengeMultiplier(DEFAULTS);
  $('#allowNegativeScores').checked = DEFAULTS.allowNegativeScores ?? true;
  $('#startingTeamSelectionEnabled').checked = DEFAULTS.startingTeamSelectionEnabled ?? true;
  $('#startingTeamMode').value = DEFAULTS.startingTeamMode === 'random' ? 'random' : 'manual';
  try {
    const rules = JSON.parse(storage.getItem(LS_RULES) || '{}');
    if (['open', 'mc'].includes(rules.mode)) $(`input[name="mode"][value="${rules.mode}"]`).checked = true;
    if ([1, 0.75, 0.5, 0.25, 0].includes(rules.mcMultiplier)) $('#mcPenalty').value = rules.mcMultiplier;
    if (typeof rules.challengeEnabled === 'boolean') $('#challengeEnabled').checked = rules.challengeEnabled;
    if (CHALLENGE_MULTIPLIERS.includes(Number(rules.challengeMultiplier))) $('#challengeMultiplier').value = rules.challengeMultiplier;
    if (typeof rules.allowNegativeScores === 'boolean') $('#allowNegativeScores').checked = rules.allowNegativeScores;
    if (typeof rules.startingTeamSelectionEnabled === 'boolean') $('#startingTeamSelectionEnabled').checked = rules.startingTeamSelectionEnabled;
    if (['manual', 'random'].includes(rules.startingTeamMode)) $('#startingTeamMode').value = rules.startingTeamMode;
  } catch {}
  const settings = loadBoardSettings();
  $('#categoryCount').value = settings.categoriesPerGame; $('#questionCount').value = settings.questionsPerCategory;
  const timer = loadTimerSettings();
  $('#timerEnabled').checked = timer.enabled; $('#timerSeconds').value = timer.seconds; $('#timerSeconds').disabled = !timer.enabled;
  applyTheme(storage.getItem(LS_THEME) || DEFAULTS.theme);
  updateModeOptions(); updateChallengeOptions(); updateStartingTeamOptions();
  addTeam('Team 1'); addTeam('Team 2');
  const select = $('#poolSelect');
  pools.forEach(pool => {
    const option = document.createElement('option');
    option.value = pool.id; option.textContent = pool.name; select.appendChild(option);
  });
  const savedId = storage.getItem(LS_POOL);
  select.value = pools.some(p => p.id === savedId) ? savedId : (pools.find(pool => pool.id === DEFAULTS.poolId)?.id ?? pools[0]?.id ?? '');
  select.onchange = () => selectPool(select.value);
  checkResume();
  await selectPool(select.value);
}
initialize();
