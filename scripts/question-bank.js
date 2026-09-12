'use strict';

window.QuizzQuestionBank = (() => {
  function clone(value) {return JSON.parse(JSON.stringify(value));}
  function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }
  function escapeHtml(value) {return String(value ?? '').replace(/[&<>'"]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[character]));}
  function normalizeChoice(value) {return String(value ?? '').trim().toLocaleLowerCase('de-DE').replace(/[.,:;!?()]/g, '').replace(/\s+/g, ' ');}
  function correctChoiceIndex(question) {
    const choices = question.choices || [];
    if (Number.isInteger(question.correctChoiceIndex) && question.correctChoiceIndex >= 0 && question.correctChoiceIndex < choices.length) return question.correctChoiceIndex;
    if (typeof question.correctChoice === 'string') {
      const index = choices.findIndex(choice => normalizeChoice(choice) === normalizeChoice(question.correctChoice));
      if (index >= 0) return index;
    }
    return choices.findIndex(choice => normalizeChoice(choice) === normalizeChoice(question.answer));
  }
  function parseEstimate(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const match = String(value ?? '').trim().match(/[-+]?\d[\d.,\s]*/); if (!match) return NaN;
    let normalized = match[0].replace(/\s/g, ''); const dot = normalized.includes('.'), comma = normalized.includes(',');
    if (dot && comma) {
      if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) normalized = normalized.replace(/\./g, '').replace(',', '.');
      else normalized = normalized.replace(/,/g, '');
    } else if (comma) normalized = normalized.replace(',', '.');
    else if (dot && /^[-+]?\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, '');
    return Number(normalized);
  }
  function formatEstimate(value) {return new Intl.NumberFormat('de-DE', {maximumFractionDigits: 6}).format(value);}
  function selectedPoints(data, questionsPerCategory) {return (data.config?.points || [100, 200, 300, 400, 500]).slice(0, questionsPerCategory);}
  function eligibleCategories(data, points) {
    return [...new Set(data.questions.map(question => question.category))].filter(category => points.every(pointsValue => data.questions.some(question => question.category === category && Number(question.points) === Number(pointsValue))));
  }
  function validateData(data, settings, checkBoard = true) {
    if (!data || !Array.isArray(data.questions) || !Array.isArray(data.tiebreakers)) throw new Error('questions und tiebreakers müssen Arrays sein.');
    const ids = new Set();
    for (const question of data.questions) {
      if (!question || !question.id || ids.has(question.id) || !question.category || !question.question || !question.answer || !Number.isFinite(Number(question.points))) throw new Error('Eine Frage hat fehlende Pflichtfelder oder eine doppelte ID.');
      ids.add(question.id);
      if (question.choices != null && (!Array.isArray(question.choices) || question.choices.length < 2 || correctChoiceIndex(question) < 0)) throw new Error(`Ungültige Antwortmöglichkeiten bei Frage ${question.id}.`);
    }
    for (const question of data.tiebreakers) {
      if (!question || !question.id || !question.question || !Number.isFinite(parseEstimate(question.numericAnswer ?? question.answer))) throw new Error('Eine Schätzfrage hat fehlende Pflichtfelder oder keine numerische Lösung.');
    }
    const allPoints = data.config?.points ?? [100, 200, 300, 400, 500];
    if (!Array.isArray(allPoints) || !allPoints.length || allPoints.some(points => !Number.isFinite(points) || points <= 0) || new Set(allPoints).size !== allPoints.length) throw new Error('Die Punktstufen müssen eindeutige positive Zahlen sein.');
    if (!checkBoard) return true;
    if (allPoints.length < settings.questionsPerCategory) throw new Error(`Für ${settings.questionsPerCategory} Fragen je Kategorie fehlen Punktstufen im Fragenpool.`);
    const points = selectedPoints(data, settings.questionsPerCategory);
    const categories = eligibleCategories(data, points);
    if (categories.length < settings.categoriesPerGame) throw new Error(`Zu wenige vollständige Kategorien. Benötigt: ${settings.categoriesPerGame}, vorhanden: ${categories.length}.`);
    return true;
  }
  function poolStats(data, settings) {
    const points = selectedPoints(data, settings.questionsPerCategory);
    return {categories: new Set(data.questions.map(question => question.category)).size, eligible: eligibleCategories(data, points).length, questions: data.questions.length, tiebreakers: data.tiebreakers.length};
  }
  function buildBoard(data, settings) {
    validateData(data, settings);
    const points = selectedPoints(data, settings.questionsPerCategory);
    const categories = shuffle(eligibleCategories(data, points)).slice(0, settings.categoriesPerGame);
    const cells = [];
    categories.forEach(category => points.forEach(pointsValue => {
      const pool = data.questions.filter(question => question.category === category && Number(question.points) === Number(pointsValue));
      cells.push({...clone(shuffle(pool)[0]), used: false});
    }));
    return {categories, points, cells};
  }
  function loadPool(pool) {
    return new Promise((resolve, reject) => {
      window.QUESTIONS_DATA = undefined;
      const script = document.createElement('script');
      script.src = pool.src;
      script.onload = () => {script.remove(); resolve(window.QUESTIONS_DATA);};
      script.onerror = () => {script.remove(); reject(new Error(`Der Fragenpool „${pool.name}“ konnte nicht geladen werden. Bitte die Datei ${pool.src} prüfen.`));};
      document.head.appendChild(script);
    });
  }
  return {buildBoard, clone, correctChoiceIndex, escapeHtml, formatEstimate, loadPool, parseEstimate, poolStats, selectedPoints, shuffle, validateData};
})();
