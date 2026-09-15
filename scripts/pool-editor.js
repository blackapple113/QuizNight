'use strict';

(() => {
  const DRAFT_INDEX_KEY = 'quizz.poolEditor.drafts';
  const DRAFT_KEY_PREFIX = 'quizz.poolEditor.draft.';
  const HISTORY_LIMIT = 80;
  const collator = new Intl.Collator('de', {numeric: true, sensitivity: 'base'});
  const pools = window.QUESTION_POOLS || [];
  const bank = window.QuizzQuestionBank;
  const poolFormat = window.QuizzPoolFormat;
  const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
  const storage = window.QuizzStorage.create(() => showMessage('Lokale Entwürfe sind in diesem Browser nicht verfügbar. Exporte funktionieren weiterhin.'));

  const state = {
    data: null,
    sourceLabel: '',
    fileHandle: null,
    draftId: '',
    entryType: 'questions',
    selectedIndex: null,
    selection: new Set(),
    filteredIndices: [],
    history: [],
    historyIndex: -1,
    cleanSnapshot: '',
    validation: emptyValidation(),
    pendingHistoryTimer: 0,
    pendingDraftTimer: 0,
    extraFieldsValid: true,
    renderingForm: false,
  };

  function emptyValidation() {
    return {issues: [], coverage: {categories: [], points: [], counts: new Map()}, errors: 0, warnings: 0, duplicates: 0};
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return bank.escapeHtml(value);
  }

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('de-DE')
      .replace(/[^a-z0-9äöüß]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function slug(value) {
    return normalize(value).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, '-').replace(/^-|-$/g, '') || 'pool';
  }

  function parseNumber(value) {
    const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (!normalized) return NaN;
    return Number(normalized);
  }

  function parsePointLevels(value) {
    return [...new Set(String(value ?? '').split(/[,;\s]+/).map(Number).filter(number => Number.isFinite(number) && number > 0))];
  }

  function formatDate(value) {
    try {return new Intl.DateTimeFormat('de-DE', {dateStyle: 'short', timeStyle: 'short'}).format(new Date(value));}
    catch {return 'unbekannter Zeitpunkt';}
  }

  function serializeData(data = state.data) {
    return JSON.stringify(data);
  }

  function isDirty() {
    return Boolean(state.data && serializeData() !== state.cleanSnapshot);
  }

  function currentEntries() {
    return state.data?.[state.entryType] || [];
  }

  function currentEntry() {
    if (!Number.isInteger(state.selectedIndex)) return null;
    return currentEntries()[state.selectedIndex] || null;
  }

  function getCategories() {
    if (!state.data) return [];
    return [...new Set(state.data.questions.map(question => String(question.category || '').trim()).filter(Boolean))].sort(collator.compare);
  }

  function getPointLevels() {
    if (!state.data) return [];
    const configured = Array.isArray(state.data.config?.points) ? state.data.config.points.map(Number).filter(Number.isFinite) : [];
    const used = state.data.questions.map(question => Number(question.points)).filter(Number.isFinite);
    return [...new Set([...configured, ...used])].sort((left, right) => left - right);
  }

  function showMessage(message, success = false) {
    elements.editorMessage.textContent = message;
    elements.editorMessage.classList.remove('hidden', 'success');
    if (success) elements.editorMessage.classList.add('success');
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => elements.editorMessage.classList.add('hidden'), 6000);
  }

  function confirmReplace() {
    return !isDirty() || window.confirm('Der aktuelle Pool enthält Änderungen. Möchtest du ihn wirklich schließen? Der lokale Entwurf bleibt erhalten.');
  }

  function normalizePool(rawData, fallbackName = 'Eigener Pool') {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) throw new Error('Die Datei enthält kein gültiges Pool-Objekt.');
    const data = clone(rawData);
    if (!Array.isArray(data.questions)) throw new Error('Im Pool fehlt das Array „questions“.');
    if (!Array.isArray(data.tiebreakers)) data.tiebreakers = [];
    if (!data.config || typeof data.config !== 'object' || Array.isArray(data.config)) data.config = {};
    if (!Array.isArray(data.config.points)) {
      data.config.points = [...new Set(data.questions.map(question => Number(question.points)).filter(Number.isFinite))].sort((a, b) => a - b);
    }
    if (!Number.isFinite(Number(data.config.defaultMcHelpMultiplier))) data.config.defaultMcHelpMultiplier = 0.5;
    data.name = String(data.name || fallbackName);
    data.poolId = String(data.poolId || slug(data.name));
    return data;
  }

  function loadPoolData(rawData, options = {}) {
    const data = normalizePool(rawData, options.fallbackName);
    state.data = data;
    state.sourceLabel = options.sourceLabel || data.name;
    state.fileHandle = options.fileHandle || null;
    state.draftId = slug(data.poolId || data.name);
    state.entryType = 'questions';
    state.selectedIndex = data.questions.length ? 0 : null;
    state.selection.clear();
    state.extraFieldsValid = true;
    state.history = [serializeData(data)];
    state.historyIndex = 0;
    state.cleanSnapshot = serializeData(data);
    resetFilters();
    elements.editorWorkspace.classList.remove('hidden');
    renderAll();
    const draft = readDraft(state.draftId);
    if (draft && serializeData(draft.data) !== state.cleanSnapshot) {
      showMessage(`Für diesen Pool gibt es einen lokalen Entwurf vom ${formatDate(draft.savedAt)}. Du kannst ihn oben unter „Lokale Entwürfe“ laden.`);
    }
  }

  function resetFilters() {
    elements.searchInput.value = '';
    elements.categoryFilter.value = '';
    elements.pointsFilter.value = '';
    elements.issueFilter.value = '';
    elements.sortSelect.value = 'category-points';
  }

  function pushHistory() {
    if (!state.data) return;
    const snapshot = serializeData();
    if (state.history[state.historyIndex] === snapshot) return;
    state.history.splice(state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.historyIndex = state.history.length - 1;
    renderHistoryButtons();
  }

  function flushPendingHistory() {
    if (!state.pendingHistoryTimer) return;
    window.clearTimeout(state.pendingHistoryTimer);
    state.pendingHistoryTimer = 0;
    pushHistory();
  }

  function scheduleHistory() {
    window.clearTimeout(state.pendingHistoryTimer);
    state.pendingHistoryTimer = window.setTimeout(() => {
      state.pendingHistoryTimer = 0;
      pushHistory();
      refreshDerivedViews();
    }, 450);
    renderSaveState();
    scheduleDraftSave();
  }

  function commitMutation(mutator) {
    flushPendingHistory();
    mutator();
    pushHistory();
    refreshDerivedViews();
    renderForm();
    scheduleDraftSave();
  }

  function restoreHistory(index) {
    if (index < 0 || index >= state.history.length) return;
    state.historyIndex = index;
    state.data = JSON.parse(state.history[index]);
    state.selection.clear();
    const entries = currentEntries();
    if (state.selectedIndex != null && state.selectedIndex >= entries.length) state.selectedIndex = entries.length ? entries.length - 1 : null;
    state.extraFieldsValid = true;
    renderAll();
    scheduleDraftSave();
  }

  function undo() {
    flushPendingHistory();
    restoreHistory(state.historyIndex - 1);
  }

  function redo() {
    flushPendingHistory();
    restoreHistory(state.historyIndex + 1);
  }

  function renderHistoryButtons() {
    elements.undoBtn.disabled = state.historyIndex <= 0;
    elements.redoBtn.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1;
  }

  function renderSaveState(savedMessage = '') {
    elements.saveState.classList.remove('dirty', 'saved');
    if (!state.data) {
      elements.saveState.textContent = 'Kein Pool geladen';
      return;
    }
    if (savedMessage) {
      elements.saveState.textContent = savedMessage;
      elements.saveState.classList.add('saved');
    } else if (isDirty()) {
      elements.saveState.textContent = 'Ungespeicherte Änderungen · Entwurf wird lokal gesichert';
      elements.saveState.classList.add('dirty');
    } else {
      elements.saveState.textContent = state.fileHandle ? `Geladen · ${state.fileHandle.name}` : `Geladen · ${state.sourceLabel}`;
    }
  }

  function renderAll() {
    if (!state.data) return;
    state.validation = validatePool(state.data);
    renderMetadata();
    renderFilters();
    renderStats();
    renderTabs();
    renderList();
    renderBulkPanel();
    renderForm();
    renderValidationDialog();
    renderHistoryButtons();
    renderSaveState();
    renderFileActions();
  }

  function refreshDerivedViews() {
    if (!state.data) return;
    state.validation = validatePool(state.data);
    renderFilters();
    renderStats();
    renderList();
    renderBulkPanel();
    renderCurrentIssues();
    renderValidationDialog();
    renderHistoryButtons();
    renderSaveState();
  }

  function renderMetadata() {
    elements.poolNameInput.value = state.data.name || '';
    elements.poolIdInput.value = state.data.poolId || '';
    elements.pointLevelsInput.value = (state.data.config?.points || []).join(', ');
    elements.mcMultiplierInput.value = state.data.config?.defaultMcHelpMultiplier ?? 0.5;
    elements.sourceDescription.textContent = state.fileHandle
      ? `Direkt geöffnet: ${state.fileHandle.name}`
      : `Quelle: ${state.sourceLabel}`;
  }

  function updateMetadata() {
    if (!state.data) return;
    state.data.name = elements.poolNameInput.value.trim();
    state.data.poolId = elements.poolIdInput.value.trim();
    state.data.config.points = parsePointLevels(elements.pointLevelsInput.value);
    const multiplier = parseNumber(elements.mcMultiplierInput.value);
    state.data.config.defaultMcHelpMultiplier = Number.isFinite(multiplier) ? multiplier : elements.mcMultiplierInput.value;
    state.draftId = slug(state.data.poolId || state.data.name);
    scheduleHistory();
  }

  function renderStats() {
    const stats = [
      [state.data.questions.length, 'Fragen', ''],
      [getCategories().length, 'Kategorien', ''],
      [state.data.tiebreakers.length, 'Tie-Breaker', ''],
      [state.validation.errors, 'Fehler', state.validation.errors ? 'error' : ''],
      [state.validation.warnings, 'Hinweise', state.validation.warnings ? 'warning' : ''],
    ];
    elements.statsGrid.innerHTML = stats.map(([value, label, className]) => `<div class="stat-card ${className}"><strong>${value}</strong><span>${label}</span></div>`).join('');
    elements.questionCount.textContent = `(${state.data.questions.length})`;
    elements.tiebreakerCount.textContent = `(${state.data.tiebreakers.length})`;
  }

  function renderFilters() {
    const categories = getCategories();
    const points = getPointLevels();
    const selectedCategory = elements.categoryFilter.value;
    const selectedPoints = elements.pointsFilter.value;
    elements.categoryFilter.innerHTML = `<option value="">Alle Kategorien</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
    elements.pointsFilter.innerHTML = `<option value="">Alle Stufen</option>${points.map(value => `<option value="${value}">${value}</option>`).join('')}`;
    if (categories.includes(selectedCategory)) elements.categoryFilter.value = selectedCategory;
    if (points.map(String).includes(selectedPoints)) elements.pointsFilter.value = selectedPoints;
    elements.categorySuggestions.innerHTML = categories.map(category => `<option value="${escapeHtml(category)}"></option>`).join('');
    elements.pointSuggestions.innerHTML = points.map(value => `<option value="${value}"></option>`).join('');
    elements.oldCategorySelect.innerHTML = categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
  }

  function renderTabs() {
    document.querySelectorAll('.entry-tab').forEach(tab => {
      const active = tab.dataset.entryType === state.entryType;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    const questionsActive = state.entryType === 'questions';
    elements.categoryFilterField.classList.toggle('hidden', !questionsActive);
    elements.pointsFilterField.classList.toggle('hidden', !questionsActive);
    elements.questionBulkFields.classList.toggle('hidden', !questionsActive);
    elements.addEntryBtn.textContent = questionsActive ? '+ Frage' : '+ Tie-Breaker';
  }

  function issueMap() {
    const map = new Map();
    state.validation.issues.forEach(issue => {
      if (!issue.type || !Number.isInteger(issue.index)) return;
      const key = `${issue.type}:${issue.index}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(issue);
    });
    return map;
  }

  function filteredEntryIndices() {
    const entries = currentEntries();
    const query = normalize(elements.searchInput.value);
    const category = elements.categoryFilter.value;
    const points = elements.pointsFilter.value;
    const issueFilter = elements.issueFilter.value;
    const issues = issueMap();
    const rows = entries.map((entry, index) => ({entry, index})).filter(({entry, index}) => {
      if (query) {
        const searchable = normalize([entry.id, entry.category, entry.points, entry.question, entry.answer, ...(entry.choices || [])].join(' '));
        if (!searchable.includes(query)) return false;
      }
      if (state.entryType === 'questions' && category && entry.category !== category) return false;
      if (state.entryType === 'questions' && points && String(entry.points) !== points) return false;
      const entryIssues = issues.get(`${state.entryType}:${index}`) || [];
      if (issueFilter === 'problem' && !entryIssues.length) return false;
      if (issueFilter === 'error' && !entryIssues.some(issue => issue.level === 'error')) return false;
      if (issueFilter === 'duplicate' && !entryIssues.some(issue => issue.code === 'duplicate')) return false;
      return true;
    });
    const sort = elements.sortSelect.value;
    rows.sort((left, right) => {
      if (sort === 'id') return collator.compare(left.entry.id || '', right.entry.id || '');
      if (sort === 'question') return collator.compare(left.entry.question || '', right.entry.question || '');
      if (sort === 'points-category') return (Number(left.entry.points) || 0) - (Number(right.entry.points) || 0) || collator.compare(left.entry.category || '', right.entry.category || '');
      return collator.compare(left.entry.category || '', right.entry.category || '') || (Number(left.entry.points) || 0) - (Number(right.entry.points) || 0) || collator.compare(left.entry.id || '', right.entry.id || '');
    });
    return rows.map(row => row.index);
  }

  function renderList() {
    const entries = currentEntries();
    const issues = issueMap();
    state.filteredIndices = filteredEntryIndices();
    elements.entryList.innerHTML = state.filteredIndices.map(index => {
      const entry = entries[index];
      const entryIssues = issues.get(`${state.entryType}:${index}`) || [];
      const errors = entryIssues.filter(issue => issue.level === 'error').length;
      const meta = state.entryType === 'questions' ? `${escapeHtml(entry.category || 'Ohne Kategorie')} · ${escapeHtml(entry.points || '–')} Punkte` : 'Tie-Breaker';
      return `<div class="entry-card${state.selectedIndex === index ? ' active' : ''}" data-entry-index="${index}" role="option" aria-selected="${state.selectedIndex === index}" tabindex="0">
        <input class="entry-select" type="checkbox" data-select-index="${index}" ${state.selection.has(index) ? 'checked' : ''} aria-label="Eintrag auswählen" />
        <div class="entry-card-content">
          <div class="entry-card-meta"><span>${meta}</span><span>${escapeHtml(entry.id || 'Ohne ID')}</span></div>
          <div class="entry-card-question">${escapeHtml(entry.question || 'Leere Frage')}</div>
          <div class="entry-card-answer">Antwort: ${escapeHtml(entry.answer || '–')}</div>
        </div>
        ${entryIssues.length ? `<span class="issue-badge${errors ? ' error' : ''}" title="${entryIssues.length} Prüfhinweis(e)">${entryIssues.length}</span>` : ''}
      </div>`;
    }).join('');
    elements.emptyList.classList.toggle('hidden', Boolean(state.filteredIndices.length));
    const allVisibleSelected = state.filteredIndices.length && state.filteredIndices.every(index => state.selection.has(index));
    const someVisibleSelected = state.filteredIndices.some(index => state.selection.has(index));
    elements.selectVisibleCheckbox.checked = Boolean(allVisibleSelected);
    elements.selectVisibleCheckbox.indeterminate = someVisibleSelected && !allVisibleSelected;
  }

  function renderBulkPanel() {
    elements.bulkPanel.classList.toggle('hidden', !state.selection.size);
    elements.bulkCount.textContent = `${state.selection.size} ausgewählt`;
  }

  function setEntryType(type) {
    if (!updateSelectedFromForm()) return;
    flushPendingHistory();
    state.entryType = type;
    state.selectedIndex = state.data[type].length ? 0 : null;
    state.selection.clear();
    elements.categoryFilter.value = '';
    elements.pointsFilter.value = '';
    renderTabs();
    renderList();
    renderBulkPanel();
    renderForm();
  }

  function selectEntry(index) {
    if (!updateSelectedFromForm()) return;
    flushPendingHistory();
    state.selectedIndex = index;
    state.extraFieldsValid = true;
    renderList();
    renderForm();
  }

  function extraFields(entry) {
    const known = state.entryType === 'questions'
      ? new Set(['id', 'category', 'points', 'question', 'answer', 'choices', 'correctChoiceIndex', 'sourceUrl'])
      : new Set(['id', 'question', 'answer', 'numericAnswer', 'choices', 'sourceUrl']);
    return Object.fromEntries(Object.entries(entry).filter(([key]) => !known.has(key)));
  }

  function renderForm() {
    const entry = currentEntry();
    elements.formPlaceholder.classList.toggle('hidden', Boolean(entry));
    elements.entryForm.classList.toggle('hidden', !entry);
    if (!entry) return;
    state.renderingForm = true;
    const question = state.entryType === 'questions';
    document.querySelectorAll('.question-only').forEach(element => element.classList.toggle('hidden', !question));
    document.querySelectorAll('.tiebreaker-only').forEach(element => element.classList.toggle('hidden', question));
    elements.formEyebrow.textContent = question ? 'Frage' : 'Tie-Breaker';
    elements.formTitle.textContent = entry.question ? entry.question.slice(0, 68) : (question ? 'Neue Frage' : 'Neuer Tie-Breaker');
    elements.entryIdInput.value = entry.id || '';
    elements.entryCategoryInput.value = entry.category || '';
    elements.entryPointsInput.value = entry.points ?? '';
    elements.entryQuestionInput.value = entry.question || '';
    elements.entryAnswerInput.value = entry.answer || '';
    elements.numericAnswerInput.value = entry.numericAnswer ?? '';
    elements.sourceUrlInput.value = entry.sourceUrl || '';
    elements.extraFieldsInput.value = JSON.stringify(extraFields(entry), null, 2);
    elements.extraFieldsError.classList.add('hidden');
    state.extraFieldsValid = true;
    renderChoices(entry);
    renderCurrentIssues();
    state.renderingForm = false;
  }

  function renderChoices(entry) {
    const choices = Array.isArray(entry.choices) ? entry.choices : [];
    const correctIndex = Number.isInteger(entry.correctChoiceIndex) ? entry.correctChoiceIndex : bank.correctChoiceIndex(entry);
    const question = state.entryType === 'questions';
    elements.choiceEditorList.innerHTML = choices.map((choice, index) => `<div class="choice-editor-row" data-choice-row="${index}">
      ${question ? `<input type="radio" name="correctChoice" value="${index}" ${correctIndex === index ? 'checked' : ''} aria-label="Antwort ${index + 1} ist richtig" />` : '<span></span>'}
      <span class="choice-editor-index">${String.fromCharCode(65 + index)}</span>
      <input type="text" value="${escapeHtml(choice)}" data-choice-input="${index}" aria-label="Antwortmöglichkeit ${index + 1}" />
      <span class="choice-row-actions">
        <button type="button" data-choice-action="up" data-choice-index="${index}" title="Nach oben" aria-label="Antwort nach oben" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-choice-action="down" data-choice-index="${index}" title="Nach unten" aria-label="Antwort nach unten" ${index === choices.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" data-choice-action="remove" data-choice-index="${index}" title="Entfernen" aria-label="Antwort entfernen">×</button>
      </span>
    </div>`).join('');
  }

  function updateSelectedFromForm() {
    if (state.renderingForm || !currentEntry()) return true;
    let extras;
    try {
      extras = JSON.parse(elements.extraFieldsInput.value || '{}');
      if (!extras || typeof extras !== 'object' || Array.isArray(extras)) throw new Error('Erwartet wird ein JSON-Objekt in geschweiften Klammern.');
      state.extraFieldsValid = true;
      elements.extraFieldsError.classList.add('hidden');
    } catch (error) {
      state.extraFieldsValid = false;
      elements.extraFieldsError.textContent = `Zusatzfelder konnten nicht übernommen werden: ${error.message}`;
      elements.extraFieldsError.classList.remove('hidden');
      renderSaveState();
      return false;
    }
    const choices = [...elements.choiceEditorList.querySelectorAll('[data-choice-input]')].map(input => input.value.trim());
    const updated = {
      ...extras,
      id: elements.entryIdInput.value.trim(),
      question: elements.entryQuestionInput.value.trim(),
      answer: elements.entryAnswerInput.value.trim(),
      choices,
    };
    const sourceUrl = elements.sourceUrlInput.value.trim();
    if (sourceUrl) updated.sourceUrl = sourceUrl;
    if (state.entryType === 'questions') {
      updated.category = elements.entryCategoryInput.value.trim();
      const points = Number(elements.entryPointsInput.value);
      updated.points = Number.isFinite(points) && elements.entryPointsInput.value !== '' ? points : elements.entryPointsInput.value;
      const selectedChoice = elements.choiceEditorList.querySelector('input[name="correctChoice"]:checked');
      updated.correctChoiceIndex = selectedChoice ? Number(selectedChoice.value) : -1;
    } else {
      const numeric = bank.parseEstimate(elements.numericAnswerInput.value);
      updated.numericAnswer = Number.isFinite(numeric) ? numeric : elements.numericAnswerInput.value.trim();
    }
    currentEntries()[state.selectedIndex] = updated;
    return true;
  }

  function handleFormInput() {
    if (state.renderingForm) return;
    if (!updateSelectedFromForm()) return;
    scheduleHistory();
  }

  function changeChoice(action, index) {
    if (!updateSelectedFromForm()) return;
    commitMutation(() => {
      const entry = currentEntry();
      const choices = entry.choices || [];
      let correctIndex = Number(entry.correctChoiceIndex);
      if (action === 'remove') {
        choices.splice(index, 1);
        if (correctIndex === index) correctIndex = choices.length ? Math.min(index, choices.length - 1) : -1;
        else if (correctIndex > index) correctIndex--;
      } else {
        const target = action === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= choices.length) return;
        [choices[index], choices[target]] = [choices[target], choices[index]];
        if (correctIndex === index) correctIndex = target;
        else if (correctIndex === target) correctIndex = index;
      }
      if (state.entryType === 'questions') entry.correctChoiceIndex = correctIndex;
    });
  }

  function generateId(type, category = '', points = '') {
    const prefix = slug(state.data.poolId || state.data.name);
    const middle = type === 'questions' ? `${slug(category)}-${points || 'frage'}` : 'tb';
    const existing = new Set([...state.data.questions, ...state.data.tiebreakers].map(entry => entry.id));
    let sequence = 1;
    let id;
    do {id = `${prefix}-${middle}-${String(sequence++).padStart(3, '0')}`;} while (existing.has(id));
    return id;
  }

  function addEntry() {
    flushPendingHistory();
    const type = state.entryType;
    commitMutation(() => {
      if (type === 'questions') {
        const category = elements.categoryFilter.value || getCategories()[0] || 'Neue Kategorie';
        const points = Number(elements.pointsFilter.value) || getPointLevels()[0] || 100;
        state.data.questions.push({
          id: generateId('questions', category, points),
          category,
          points,
          question: '',
          answer: '',
          choices: ['', '', '', ''],
          correctChoiceIndex: 0,
        });
      } else {
        state.data.tiebreakers.push({id: generateId('tiebreakers'), question: '', answer: '', numericAnswer: 0, choices: []});
      }
      state.selectedIndex = state.data[type].length - 1;
      state.selection.clear();
      elements.searchInput.value = '';
      elements.issueFilter.value = '';
    });
    elements.entryQuestionInput.focus();
  }

  function duplicateEntry() {
    if (!updateSelectedFromForm()) return;
    const originalIndex = state.selectedIndex;
    commitMutation(() => {
      const original = currentEntries()[originalIndex];
      const copy = clone(original);
      copy.id = generateId(state.entryType, copy.category, copy.points);
      currentEntries().splice(originalIndex + 1, 0, copy);
      state.selectedIndex = originalIndex + 1;
      state.selection.clear();
    });
  }

  function deleteCurrentEntry() {
    const entry = currentEntry();
    if (!entry || !window.confirm(`„${entry.question || entry.id || 'Dieser Eintrag'}“ wirklich löschen?`)) return;
    commitMutation(() => {
      currentEntries().splice(state.selectedIndex, 1);
      state.selectedIndex = currentEntries().length ? Math.min(state.selectedIndex, currentEntries().length - 1) : null;
      state.selection.clear();
    });
  }

  function applyBulkChanges() {
    const category = elements.bulkCategoryInput.value.trim();
    const points = Number(elements.bulkPointsInput.value);
    if (!category && !(Number.isFinite(points) && points > 0)) {
      showMessage('Gib eine Kategorie oder eine gültige Punktzahl für die Auswahl ein.');
      return;
    }
    commitMutation(() => {
      [...state.selection].forEach(index => {
        const entry = currentEntries()[index];
        if (!entry || state.entryType !== 'questions') return;
        if (category) entry.category = category;
        if (Number.isFinite(points) && points > 0) entry.points = points;
      });
      elements.bulkCategoryInput.value = '';
      elements.bulkPointsInput.value = '';
    });
  }

  function deleteBulkSelection() {
    if (!state.selection.size || !window.confirm(`${state.selection.size} ausgewählte Einträge wirklich löschen?`)) return;
    commitMutation(() => {
      [...state.selection].sort((left, right) => right - left).forEach(index => currentEntries().splice(index, 1));
      state.selection.clear();
      state.selectedIndex = currentEntries().length ? 0 : null;
    });
  }

  function renameCategory(event) {
    event.preventDefault();
    const oldName = elements.oldCategorySelect.value;
    const newName = elements.newCategoryInput.value.trim();
    if (!oldName || !newName || oldName === newName) return;
    commitMutation(() => {
      state.data.questions.forEach(question => {
        if (question.category === oldName) question.category = newName;
      });
    });
    elements.renameCategoryDialog.close();
    showMessage(`Kategorie „${oldName}“ wurde in „${newName}“ umbenannt.`, true);
  }

  function addIssue(result, issue) {
    result.issues.push(issue);
    if (issue.level === 'error') result.errors++;
    else result.warnings++;
    if (issue.code === 'duplicate') result.duplicates++;
  }

  function validateUrl(value) {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {return false;}
  }

  function wordSet(value) {
    return new Set(normalize(value).split(' ').filter(word => word.length > 2));
  }

  function jaccard(left, right) {
    let intersection = 0;
    left.forEach(word => {if (right.has(word)) intersection++;});
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
  }

  function validatePool(data) {
    const result = emptyValidation();
    const pointLevels = Array.isArray(data.config?.points) ? data.config.points : [];
    if (!String(data.name || '').trim()) addIssue(result, {level: 'error', code: 'metadata', message: 'Der Pool benötigt einen Namen.', label: 'Pool-Einstellungen'});
    if (!String(data.poolId || '').trim()) addIssue(result, {level: 'error', code: 'metadata', message: 'Der Pool benötigt eine Pool-ID.', label: 'Pool-Einstellungen'});
    if (!pointLevels.length || pointLevels.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0) || new Set(pointLevels.map(Number)).size !== pointLevels.length) {
      addIssue(result, {level: 'error', code: 'metadata', message: 'Die Punktestufen müssen eindeutige positive Zahlen sein.', label: 'Pool-Einstellungen'});
    }
    const multiplier = Number(data.config?.defaultMcHelpMultiplier);
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) {
      addIssue(result, {level: 'error', code: 'metadata', message: 'Der Standardfaktor für die MC-Hilfe muss zwischen 0 und 1 liegen.', label: 'Pool-Einstellungen'});
    }

    const allEntries = [
      ...data.questions.map((entry, index) => ({entry, type: 'questions', index})),
      ...data.tiebreakers.map((entry, index) => ({entry, type: 'tiebreakers', index})),
    ];
    const idGroups = new Map();
    allEntries.forEach(reference => {
      const id = String(reference.entry.id || '').trim();
      if (!id) {
        addIssue(result, {...reference, level: 'error', code: 'required', message: 'Die ID fehlt.', label: reference.entry.question || 'Eintrag ohne ID'});
        return;
      }
      if (!idGroups.has(id)) idGroups.set(id, []);
      idGroups.get(id).push(reference);
    });
    idGroups.forEach((references, id) => {
      if (references.length < 2) return;
      references.forEach(reference => addIssue(result, {...reference, level: 'error', code: 'duplicate', message: `Die ID „${id}“ wird mehrfach verwendet.`, label: reference.entry.question || id}));
    });

    data.questions.forEach((question, index) => {
      const reference = {type: 'questions', index, label: question.question || question.id || `Frage ${index + 1}`};
      if (!String(question.category || '').trim()) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Die Kategorie fehlt.'});
      if (!Number.isFinite(Number(question.points)) || Number(question.points) <= 0) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Die Punktzahl muss eine positive Zahl sein.'});
      else if (pointLevels.length && !pointLevels.map(Number).includes(Number(question.points))) addIssue(result, {...reference, level: 'warning', code: 'points', message: `Die Punktestufe ${question.points} ist nicht in den Pool-Einstellungen aufgeführt.`});
      if (!String(question.question || '').trim()) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Der Fragetext fehlt.'});
      if (!String(question.answer || '').trim()) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Die Antwort fehlt.'});
      if (question.sourceUrl && !validateUrl(question.sourceUrl)) addIssue(result, {...reference, level: 'warning', code: 'source', message: 'Die Quellen-URL ist ungültig.'});
      if (!Array.isArray(question.choices) || !question.choices.length) {
        addIssue(result, {...reference, level: 'warning', code: 'choices', message: 'Es sind keine Antwortmöglichkeiten für Multiple Choice hinterlegt.'});
      } else {
        if (question.choices.length < 2) addIssue(result, {...reference, level: 'error', code: 'choices', message: 'Multiple Choice benötigt mindestens zwei Antwortmöglichkeiten.'});
        if (question.choices.some(choice => !String(choice || '').trim())) addIssue(result, {...reference, level: 'error', code: 'choices', message: 'Mindestens eine Antwortmöglichkeit ist leer.'});
        const normalizedChoices = question.choices.map(normalize);
        if (new Set(normalizedChoices).size !== normalizedChoices.length) addIssue(result, {...reference, level: 'error', code: 'duplicate', message: 'Antwortmöglichkeiten kommen mehrfach vor.'});
        const correctIndex = Number(question.correctChoiceIndex);
        if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= question.choices.length) {
          addIssue(result, {...reference, level: 'error', code: 'choices', message: 'Die richtige Antwortmöglichkeit ist nicht gültig markiert.'});
        } else {
          const correctChoice = normalize(question.choices[correctIndex]);
          const answer = normalize(question.answer);
          if (answer && correctChoice && answer !== correctChoice && !answer.includes(correctChoice) && !correctChoice.includes(answer)) {
            addIssue(result, {...reference, level: 'warning', code: 'answer', message: 'Die markierte MC-Antwort weicht von der offenen Lösung ab.'});
          }
        }
      }
    });

    data.tiebreakers.forEach((question, index) => {
      const reference = {type: 'tiebreakers', index, label: question.question || question.id || `Tie-Breaker ${index + 1}`};
      if (!String(question.question || '').trim()) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Der Fragetext fehlt.'});
      if (!String(question.answer || '').trim()) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Die angezeigte Antwort fehlt.'});
      if (!Number.isFinite(bank.parseEstimate(question.numericAnswer))) addIssue(result, {...reference, level: 'error', code: 'required', message: 'Die numerische Lösung fehlt oder ist ungültig.'});
      if (question.sourceUrl && !validateUrl(question.sourceUrl)) addIssue(result, {...reference, level: 'warning', code: 'source', message: 'Die Quellen-URL ist ungültig.'});
    });

    const exactQuestions = new Map();
    allEntries.forEach(reference => {
      const normalizedQuestion = normalize(reference.entry.question);
      if (!normalizedQuestion) return;
      if (!exactQuestions.has(normalizedQuestion)) exactQuestions.set(normalizedQuestion, []);
      exactQuestions.get(normalizedQuestion).push(reference);
    });
    exactQuestions.forEach(references => {
      if (references.length < 2) return;
      references.forEach(reference => addIssue(result, {...reference, level: 'warning', code: 'duplicate', message: 'Dieser Fragetext kommt mehrfach oder nahezu identisch vor.', label: reference.entry.question || reference.entry.id}));
    });

    const duplicatePairs = new Set();
    const comparisonGroups = new Map();
    data.questions.forEach((question, index) => {
      const key = normalize(question.category) || '__unknown__';
      if (!comparisonGroups.has(key)) comparisonGroups.set(key, []);
      comparisonGroups.get(key).push({question, index, words: wordSet(question.question)});
    });
    comparisonGroups.forEach(group => {
      for (let left = 0; left < group.length; left++) {
        for (let right = left + 1; right < group.length; right++) {
          const first = group[left];
          const second = group[right];
          if (first.words.size < 5 || second.words.size < 5 || normalize(first.question.question) === normalize(second.question.question)) continue;
          if (jaccard(first.words, second.words) < 0.86) continue;
          [first, second].forEach(item => {
            const key = `questions:${item.index}`;
            if (duplicatePairs.has(key)) return;
            duplicatePairs.add(key);
            addIssue(result, {type: 'questions', index: item.index, level: 'warning', code: 'duplicate', message: 'Der Wortlaut ähnelt einer anderen Frage derselben Kategorie stark.', label: item.question.question || item.question.id});
          });
        }
      }
    });

    const categories = [...new Set(data.questions.map(question => String(question.category || '').trim()).filter(Boolean))].sort(collator.compare);
    const coveragePoints = pointLevels.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
    const counts = new Map();
    data.questions.forEach(question => {
      const key = JSON.stringify([question.category, Number(question.points)]);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    result.coverage = {categories, points: coveragePoints, counts};
    const missingCells = categories.reduce((total, category) => total + coveragePoints.filter(points => !counts.get(JSON.stringify([category, points]))).length, 0);
    if (missingCells) addIssue(result, {level: 'warning', code: 'coverage', message: `${missingCells} Kombination(en) aus Kategorie und Punktestufe enthalten keine Frage.`, label: 'Pool-Abdeckung'});
    return result;
  }

  function renderCurrentIssues() {
    const entry = currentEntry();
    if (!entry) return;
    const issues = state.validation.issues.filter(issue => issue.type === state.entryType && issue.index === state.selectedIndex);
    elements.currentIssues.classList.toggle('hidden', !issues.length);
    elements.currentIssues.innerHTML = issues.length
      ? `<strong>${issues.length} Prüfhinweis${issues.length === 1 ? '' : 'e'}</strong>${issues.map(issue => `<p class="${issue.level}">${issue.level === 'error' ? 'Fehler' : 'Hinweis'}: ${escapeHtml(issue.message)}</p>`).join('')}`
      : '';
  }

  function renderValidationDialog() {
    if (!state.data) return;
    const {issues, errors, warnings, coverage} = state.validation;
    elements.validationSummary.textContent = errors || warnings
      ? `${errors} Fehler und ${warnings} Hinweise gefunden.`
      : 'Der Pool hat die automatische Prüfung ohne Hinweise bestanden.';
    elements.issueList.innerHTML = issues.length ? issues.map((issue, issueIndex) => {
      const content = `<span class="issue-level">${issue.level === 'error' ? '!' : 'i'}</span><span class="issue-copy"><strong>${escapeHtml(issue.message)}</strong><span>${escapeHtml(issue.label || 'Allgemeiner Pool-Hinweis')}</span></span>`;
      return issue.type && Number.isInteger(issue.index)
        ? `<button class="issue-item ${issue.level}" type="button" data-issue-index="${issueIndex}">${content}</button>`
        : `<div class="issue-item ${issue.level}">${content}</div>`;
    }).join('') : '<div class="validation-empty">Keine Fehler oder Hinweise gefunden.</div>';

    if (!coverage.categories.length || !coverage.points.length) {
      elements.coverageTable.innerHTML = '<div class="validation-empty">Noch keine Abdeckung verfügbar.</div>';
      return;
    }
    elements.coverageTable.innerHTML = `<table class="coverage-table"><thead><tr><th>Kategorie</th>${coverage.points.map(points => `<th>${points}</th>`).join('')}<th>Gesamt</th></tr></thead><tbody>${coverage.categories.map(category => {
      let total = 0;
      const cells = coverage.points.map(points => {
        const count = coverage.counts.get(JSON.stringify([category, points])) || 0;
        total += count;
        return `<td class="${count === 0 ? 'missing' : count < 2 ? 'low' : ''}">${count}</td>`;
      }).join('');
      return `<tr><td>${escapeHtml(category)}</td>${cells}<td>${total}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function draftIndex() {
    const value = window.QuizzStorage.readJson(storage, DRAFT_INDEX_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function draftStorageKey(id) {
    return `${DRAFT_KEY_PREFIX}${encodeURIComponent(id)}`;
  }

  function readDraft(id) {
    if (!id) return null;
    return window.QuizzStorage.readJson(storage, draftStorageKey(id), null);
  }

  function refreshDrafts() {
    const selected = elements.draftSelect.value;
    const drafts = draftIndex().map(id => readDraft(id)).filter(Boolean).sort((left, right) => new Date(right.savedAt) - new Date(left.savedAt));
    elements.draftSelect.innerHTML = drafts.length
      ? `<option value="">Entwurf auswählen …</option>${drafts.map(draft => `<option value="${escapeHtml(draft.id)}">${escapeHtml(draft.name || draft.poolId || 'Unbenannter Pool')} · ${formatDate(draft.savedAt)}</option>`).join('')}`
      : '<option value="">Keine Entwürfe</option>';
    if (drafts.some(draft => draft.id === selected)) elements.draftSelect.value = selected;
    const hasSelection = Boolean(elements.draftSelect.value);
    elements.loadDraftBtn.disabled = !hasSelection;
    elements.deleteDraftBtn.disabled = !hasSelection;
  }

  function scheduleDraftSave() {
    if (!state.data || !isDirty()) return;
    window.clearTimeout(state.pendingDraftTimer);
    state.pendingDraftTimer = window.setTimeout(saveDraftNow, 750);
  }

  function saveDraftNow() {
    state.pendingDraftTimer = 0;
    if (!state.data || !isDirty()) return;
    const id = state.draftId || slug(state.data.poolId || state.data.name);
    const draft = {
      id,
      name: state.data.name,
      poolId: state.data.poolId,
      sourceLabel: state.sourceLabel,
      savedAt: new Date().toISOString(),
      data: state.data,
    };
    storage.setItem(draftStorageKey(id), JSON.stringify(draft));
    const index = draftIndex().filter(existingId => existingId !== id);
    index.unshift(id);
    storage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index.slice(0, 20)));
    refreshDrafts();
  }

  function loadSelectedDraft() {
    const draft = readDraft(elements.draftSelect.value);
    if (!draft || !confirmReplace()) return;
    loadPoolData(draft.data, {sourceLabel: `Lokaler Entwurf vom ${formatDate(draft.savedAt)}`, fallbackName: draft.name});
    state.draftId = draft.id;
    state.cleanSnapshot = '';
    renderSaveState();
    showMessage('Lokaler Entwurf wurde wiederhergestellt.', true);
  }

  function deleteSelectedDraft() {
    const id = elements.draftSelect.value;
    const draft = readDraft(id);
    if (!id || !draft || !window.confirm(`Den lokalen Entwurf „${draft.name || draft.poolId || id}“ löschen?`)) return;
    storage.removeItem(draftStorageKey(id));
    storage.setItem(DRAFT_INDEX_KEY, JSON.stringify(draftIndex().filter(existingId => existingId !== id)));
    refreshDrafts();
    showMessage('Lokaler Entwurf wurde gelöscht.', true);
  }

  async function loadRegisteredPool(initial = false) {
    if (!initial && !confirmReplace()) return;
    const pool = pools.find(candidate => candidate.id === elements.registeredPoolSelect.value);
    if (!pool) return;
    elements.loadRegisteredBtn.disabled = true;
    try {
      const data = await bank.loadPool(pool);
      if (!data) throw new Error('Die Pool-Datei hat keine Daten bereitgestellt.');
      loadPoolData(data, {sourceLabel: pool.src, fallbackName: pool.name});
    } catch (error) {
      showMessage(error.message);
    } finally {
      elements.loadRegisteredBtn.disabled = false;
    }
  }

  async function loadFile(file, fileHandle = null) {
    if (!file || !confirmReplace()) return;
    try {
      const data = poolFormat.parse(await file.text());
      loadPoolData(data, {sourceLabel: file.name, fileHandle, fallbackName: file.name.replace(/\.(json|js)$/i, '')});
      showMessage(`„${file.name}“ wurde geladen.`, true);
    } catch (error) {
      showMessage(`Die Datei konnte nicht importiert werden: ${error.message}`);
    }
  }

  async function openFileDirectly() {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{description: 'Quizz-Fragenpool', accept: {'application/json': ['.json'], 'text/javascript': ['.js']}}],
      });
      await loadFile(await handle.getFile(), handle);
    } catch (error) {
      if (error.name !== 'AbortError') showMessage(`Die Datei konnte nicht geöffnet werden: ${error.message}`);
    }
  }

  function newPool() {
    if (!confirmReplace()) return;
    loadPoolData({
      name: 'Neuer Fragenpool',
      poolId: 'neuer-pool',
      config: {points: [100, 200, 300, 400, 500], defaultMcHelpMultiplier: 0.5},
      questions: [],
      tiebreakers: [],
    }, {sourceLabel: 'Neuer Pool'});
    addEntry();
  }

  function prepareSave() {
    if (!state.data) return false;
    if (!updateSelectedFromForm() || !state.extraFieldsValid) {
      showMessage('Die zusätzlichen Felder enthalten ungültiges JSON. Bitte korrigiere sie vor dem Speichern.');
      return false;
    }
    flushPendingHistory();
    state.validation = validatePool(state.data);
    refreshDerivedViews();
    if (state.validation.errors && !window.confirm(`Der Pool enthält noch ${state.validation.errors} Fehler. Trotzdem speichern bzw. exportieren?`)) {
      elements.validationDialog.showModal();
      return false;
    }
    return true;
  }

  function markSaved(message) {
    state.cleanSnapshot = serializeData();
    renderSaveState(message);
    showMessage(message, true);
  }

  function downloadPool(format) {
    if (!prepareSave()) return;
    const isJson = format === 'json';
    const content = isJson ? poolFormat.toJson(state.data) : poolFormat.toJavaScript(state.data);
    const blob = new Blob([content], {type: isJson ? 'application/json;charset=utf-8' : 'text/javascript;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = isJson ? `${slug(state.data.poolId)}.json` : 'questions.js';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    markSaved(`${link.download} wurde zum Download bereitgestellt`);
  }

  async function writeToHandle(handle) {
    if (!prepareSave()) return false;
    const isJson = handle.name.toLocaleLowerCase('de-DE').endsWith('.json');
    const writable = await handle.createWritable();
    await writable.write(isJson ? poolFormat.toJson(state.data) : poolFormat.toJavaScript(state.data));
    await writable.close();
    state.fileHandle = handle;
    state.sourceLabel = handle.name;
    renderFileActions();
    markSaved(`${handle.name} wurde gespeichert`);
    return true;
  }

  async function saveDirectly() {
    if (!state.fileHandle) return;
    try {await writeToHandle(state.fileHandle);}
    catch (error) {showMessage(`Die Datei konnte nicht gespeichert werden: ${error.message}`);}
  }

  async function saveAs() {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'questions.js',
        types: [{description: 'Quizz-Pool für das Spiel', accept: {'text/javascript': ['.js']}}],
      });
      await writeToHandle(handle);
    } catch (error) {
      if (error.name !== 'AbortError') showMessage(`Die Datei konnte nicht gespeichert werden: ${error.message}`);
    }
  }

  function renderFileActions() {
    const fileAccessAvailable = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
    elements.openFileBtn.classList.toggle('hidden', !fileAccessAvailable);
    elements.saveAsBtn.classList.toggle('hidden', !fileAccessAvailable || !state.data);
    elements.saveFileBtn.classList.toggle('hidden', !state.fileHandle || typeof state.fileHandle.createWritable !== 'function');
  }

  function handleKeyboardShortcuts(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier) return;
    const key = event.key.toLocaleLowerCase('de-DE');
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (key === 'y') {
      event.preventDefault();
      redo();
    } else if (key === 's' && state.data) {
      event.preventDefault();
      if (state.fileHandle) saveDirectly();
      else if (typeof window.showSaveFilePicker === 'function') saveAs();
      else downloadPool('js');
    } else if (key === 'f' && state.data) {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }
  }

  function bindEvents() {
    elements.loadRegisteredBtn.addEventListener('click', () => loadRegisteredPool());
    elements.importBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', () => {
      loadFile(elements.fileInput.files[0]);
      elements.fileInput.value = '';
    });
    elements.openFileBtn.addEventListener('click', openFileDirectly);
    elements.newPoolBtn.addEventListener('click', newPool);
    elements.undoBtn.addEventListener('click', undo);
    elements.redoBtn.addEventListener('click', redo);
    elements.exportJsBtn.addEventListener('click', () => downloadPool('js'));
    elements.exportJsonBtn.addEventListener('click', () => downloadPool('json'));
    elements.saveFileBtn.addEventListener('click', saveDirectly);
    elements.saveAsBtn.addEventListener('click', saveAs);

    [elements.poolNameInput, elements.poolIdInput, elements.pointLevelsInput, elements.mcMultiplierInput].forEach(input => input.addEventListener('input', updateMetadata));
    document.querySelectorAll('.entry-tab').forEach(tab => tab.addEventListener('click', () => setEntryType(tab.dataset.entryType)));
    elements.searchInput.addEventListener('input', renderList);
    [elements.categoryFilter, elements.pointsFilter, elements.issueFilter, elements.sortSelect].forEach(filter => filter.addEventListener('change', renderList));

    elements.entryList.addEventListener('click', event => {
      const checkbox = event.target.closest('[data-select-index]');
      if (checkbox) {
        const index = Number(checkbox.dataset.selectIndex);
        if (checkbox.checked) state.selection.add(index);
        else state.selection.delete(index);
        renderBulkPanel();
        const allVisibleSelected = state.filteredIndices.length && state.filteredIndices.every(visibleIndex => state.selection.has(visibleIndex));
        elements.selectVisibleCheckbox.checked = Boolean(allVisibleSelected);
        elements.selectVisibleCheckbox.indeterminate = !allVisibleSelected && state.filteredIndices.some(visibleIndex => state.selection.has(visibleIndex));
        return;
      }
      const card = event.target.closest('[data-entry-index]');
      if (card) selectEntry(Number(card.dataset.entryIndex));
    });
    elements.entryList.addEventListener('keydown', event => {
      const card = event.target.closest('[data-entry-index]');
      if (card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        selectEntry(Number(card.dataset.entryIndex));
      }
    });
    elements.selectVisibleCheckbox.addEventListener('change', () => {
      state.filteredIndices.forEach(index => {
        if (elements.selectVisibleCheckbox.checked) state.selection.add(index);
        else state.selection.delete(index);
      });
      renderList();
      renderBulkPanel();
    });
    elements.addEntryBtn.addEventListener('click', addEntry);
    elements.applyBulkBtn.addEventListener('click', applyBulkChanges);
    elements.deleteBulkBtn.addEventListener('click', deleteBulkSelection);

    elements.entryForm.addEventListener('input', event => {
      if (event.target.closest('button')) return;
      handleFormInput();
    });
    elements.entryForm.addEventListener('change', event => {
      if (event.target.matches('input[type="radio"]')) handleFormInput();
    });
    elements.choiceEditorList.addEventListener('click', event => {
      const button = event.target.closest('[data-choice-action]');
      if (button) changeChoice(button.dataset.choiceAction, Number(button.dataset.choiceIndex));
    });
    elements.addChoiceBtn.addEventListener('click', () => {
      if (!updateSelectedFromForm()) return;
      commitMutation(() => {
        const entry = currentEntry();
        if (!Array.isArray(entry.choices)) entry.choices = [];
        entry.choices.push('');
        if (state.entryType === 'questions' && entry.correctChoiceIndex < 0) entry.correctChoiceIndex = 0;
      });
    });
    elements.duplicateEntryBtn.addEventListener('click', duplicateEntry);
    elements.deleteEntryBtn.addEventListener('click', deleteCurrentEntry);

    elements.renameCategoryBtn.addEventListener('click', () => {
      renderFilters();
      if (!getCategories().length) return showMessage('Der Pool enthält noch keine Kategorien.');
      elements.newCategoryInput.value = elements.oldCategorySelect.value;
      elements.renameCategoryDialog.showModal();
      elements.newCategoryInput.select();
    });
    elements.renameCategoryForm.addEventListener('submit', renameCategory);
    elements.showValidationBtn.addEventListener('click', () => {
      updateSelectedFromForm();
      refreshDerivedViews();
      elements.validationDialog.showModal();
    });
    elements.issueList.addEventListener('click', event => {
      const button = event.target.closest('[data-issue-index]');
      if (!button) return;
      const issue = state.validation.issues[Number(button.dataset.issueIndex)];
      if (!issue?.type) return;
      state.entryType = issue.type;
      state.selectedIndex = issue.index;
      state.selection.clear();
      renderTabs();
      renderList();
      renderForm();
      elements.validationDialog.close();
    });
    document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => elements[button.dataset.closeDialog].close()));

    elements.draftSelect.addEventListener('change', () => {
      const enabled = Boolean(elements.draftSelect.value);
      elements.loadDraftBtn.disabled = !enabled;
      elements.deleteDraftBtn.disabled = !enabled;
    });
    elements.loadDraftBtn.addEventListener('click', loadSelectedDraft);
    elements.deleteDraftBtn.addEventListener('click', deleteSelectedDraft);
    window.addEventListener('keydown', handleKeyboardShortcuts);
    window.addEventListener('beforeunload', event => {
      saveDraftNow();
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  function init() {
    elements.registeredPoolSelect.innerHTML = pools.map(pool => `<option value="${escapeHtml(pool.id)}">${escapeHtml(pool.name)}</option>`).join('');
    bindEvents();
    refreshDrafts();
    renderFileActions();
    if (pools.length) loadRegisteredPool(true);
    else newPool();
  }

  init();
})();
