'use strict';

window.QuizzPoolSchema = (() => {
  const VERSION = 1;
  const POOL_KEYS = ['schemaVersion', 'name', 'poolId', 'config', 'questions', 'tiebreakers'];
  const CONFIG_KEYS = ['points'];
  const QUESTION_KEYS = ['id', 'category', 'points', 'question', 'answer', 'choices', 'correctChoiceIndex'];
  const TIEBREAKER_KEYS = ['id', 'question', 'answer', 'numericAnswer'];
  const QUESTION_ID_PATTERN = /^q-\d{6}$/;
  const TIEBREAKER_ID_PATTERN = /^tb-\d{4}$/;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function normalizeText(value) {
    return String(value ?? '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
  }

  function slug(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('de-DE')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'pool';
  }

  function parseNumericAnswer(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const match = String(value ?? '').trim().match(/[-+]?\d[\d.,\s]*/);
    if (!match) return NaN;
    let normalized = match[0].replace(/\s/g, '');
    const dot = normalized.includes('.');
    const comma = normalized.includes(',');
    if (dot && comma) {
      normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
    } else if (comma) normalized = normalized.replace(',', '.');
    else if (dot && /^[-+]?\d{1,3}(\.\d{3})+$/.test(normalized)) normalized = normalized.replace(/\./g, '');
    return Number(normalized);
  }

  function addError(errors, path, message, details = {}) {
    errors.push({path, message, ...details});
  }

  function validateExactKeys(value, allowedKeys, path, errors, details = {}) {
    if (!isObject(value)) {
      addError(errors, path, 'Muss ein Objekt sein.', details);
      return false;
    }
    Object.keys(value).filter(key => !allowedKeys.includes(key)).forEach(key => {
      addError(errors, `${path}.${key}`, `Das Feld „${key}“ ist im Pool-Standard V${VERSION} nicht erlaubt.`, {...details, code: 'unknown-field'});
    });
    return true;
  }

  function validateRequiredString(value, path, errors, details) {
    if (typeof value !== 'string' || value.trim() !== value || !value) addError(errors, path, 'Muss eine nicht-leere Zeichenkette ohne äußere Leerzeichen sein.', details);
  }

  function validate(data, options = {}) {
    const errors = [];
    if (!validateExactKeys(data, POOL_KEYS, '$', errors)) return {valid: false, errors};
    if (data.schemaVersion !== VERSION) addError(errors, '$.schemaVersion', `Muss exakt ${VERSION} sein.`, {code: 'schema-version'});
    validateRequiredString(data.name, '$.name', errors, {code: 'metadata'});
    validateRequiredString(data.poolId, '$.poolId', errors, {code: 'metadata'});
    if (typeof data.poolId === 'string' && !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(data.poolId)) {
      addError(errors, '$.poolId', 'Darf nur Kleinbuchstaben, Ziffern, Bindestriche und Unterstriche enthalten.', {code: 'metadata'});
    }
    if (options.expectedPool?.id && data.poolId !== options.expectedPool.id) {
      addError(errors, '$.poolId', `Muss zum Eintrag in pools/index.js passen: „${options.expectedPool.id}“.`, {code: 'metadata'});
    }
    if (options.expectedPool?.name && data.name !== options.expectedPool.name) {
      addError(errors, '$.name', `Muss zum Eintrag in pools/index.js passen: „${options.expectedPool.name}“.`, {code: 'metadata'});
    }

    let points = [];
    if (validateExactKeys(data.config, CONFIG_KEYS, '$.config', errors, {code: 'config'})) {
      if (!Array.isArray(data.config.points) || data.config.points.length < 2) {
        addError(errors, '$.config.points', 'Muss mindestens zwei Punktestufen enthalten.', {code: 'config'});
      } else {
        points = data.config.points;
        if (points.some(point => typeof point !== 'number' || !Number.isFinite(point) || point <= 0)) {
          addError(errors, '$.config.points', 'Punktestufen müssen positive endliche Zahlen sein.', {code: 'config'});
        }
        if (new Set(points).size !== points.length) addError(errors, '$.config.points', 'Punktestufen müssen eindeutig sein.', {code: 'config'});
        if (points.some((point, index) => index && point <= points[index - 1])) addError(errors, '$.config.points', 'Punktestufen müssen aufsteigend sortiert sein.', {code: 'config'});
      }
    }

    const seenIds = new Set();
    if (!Array.isArray(data.questions) || !data.questions.length) {
      addError(errors, '$.questions', 'Muss mindestens eine Frage enthalten.', {code: 'questions'});
    } else {
      data.questions.forEach((question, index) => {
        const path = `$.questions[${index}]`;
        const details = {type: 'questions', index, label: question?.question || question?.id || `Frage ${index + 1}`};
        if (!validateExactKeys(question, QUESTION_KEYS, path, errors, details)) return;
        validateRequiredString(question.id, `${path}.id`, errors, {...details, code: 'id'});
        if (typeof question.id === 'string' && !QUESTION_ID_PATTERN.test(question.id)) addError(errors, `${path}.id`, 'Muss dem stabilen Format q-000001 entsprechen.', {...details, code: 'id'});
        if (seenIds.has(question.id)) addError(errors, `${path}.id`, `Die ID „${question.id}“ wird mehrfach verwendet.`, {...details, code: 'duplicate'});
        seenIds.add(question.id);
        validateRequiredString(question.category, `${path}.category`, errors, {...details, code: 'required'});
        validateRequiredString(question.question, `${path}.question`, errors, {...details, code: 'required'});
        validateRequiredString(question.answer, `${path}.answer`, errors, {...details, code: 'required'});
        if (typeof question.points !== 'number' || !Number.isFinite(question.points) || !points.includes(question.points)) {
          addError(errors, `${path}.points`, 'Muss eine in config.points definierte Punktestufe sein.', {...details, code: 'points'});
        }
        if (!Array.isArray(question.choices) || question.choices.length !== 4) {
          addError(errors, `${path}.choices`, 'Muss exakt vier Antwortmöglichkeiten enthalten.', {...details, code: 'choices'});
        } else {
          question.choices.forEach((choice, choiceIndex) => validateRequiredString(choice, `${path}.choices[${choiceIndex}]`, errors, {...details, code: 'choices'}));
          const normalizedChoices = question.choices.map(normalizeText);
          if (new Set(normalizedChoices).size !== normalizedChoices.length) addError(errors, `${path}.choices`, 'Antwortmöglichkeiten müssen eindeutig sein.', {...details, code: 'duplicate'});
        }
        if (!Number.isInteger(question.correctChoiceIndex) || question.correctChoiceIndex < 0 || question.correctChoiceIndex > 3) {
          addError(errors, `${path}.correctChoiceIndex`, 'Muss ein ganzzahliger Index von 0 bis 3 sein.', {...details, code: 'choices'});
        }
      });
    }

    if (!Array.isArray(data.tiebreakers)) {
      addError(errors, '$.tiebreakers', 'Muss ein Array sein.', {code: 'tiebreakers'});
    } else {
      data.tiebreakers.forEach((question, index) => {
        const path = `$.tiebreakers[${index}]`;
        const details = {type: 'tiebreakers', index, label: question?.question || question?.id || `Tie-Breaker ${index + 1}`};
        if (!validateExactKeys(question, TIEBREAKER_KEYS, path, errors, details)) return;
        validateRequiredString(question.id, `${path}.id`, errors, {...details, code: 'id'});
        if (typeof question.id === 'string' && !TIEBREAKER_ID_PATTERN.test(question.id)) addError(errors, `${path}.id`, 'Muss dem stabilen Format tb-0001 entsprechen.', {...details, code: 'id'});
        if (seenIds.has(question.id)) addError(errors, `${path}.id`, `Die ID „${question.id}“ wird mehrfach verwendet.`, {...details, code: 'duplicate'});
        seenIds.add(question.id);
        validateRequiredString(question.question, `${path}.question`, errors, {...details, code: 'required'});
        validateRequiredString(question.answer, `${path}.answer`, errors, {...details, code: 'required'});
        if (typeof question.numericAnswer !== 'number' || !Number.isFinite(question.numericAnswer)) {
          addError(errors, `${path}.numericAnswer`, 'Muss eine endliche Zahl sein.', {...details, code: 'required'});
        }
      });
    }
    return {valid: errors.length === 0, errors};
  }

  function assertValid(data, options = {}) {
    const result = validate(data, options);
    if (result.valid) return true;
    const first = result.errors[0];
    const remaining = result.errors.length - 1;
    throw new Error(`Ungültiger Fragenpool nach Standard V${VERSION}: ${first.path} ${first.message}${remaining ? ` (${remaining} weitere Fehler)` : ''}`);
  }

  function nextId(entries, prefix, width) {
    const pattern = new RegExp(`^${prefix}-(\\d{${width}})$`);
    const used = new Set(entries.map(entry => entry.id));
    const highest = entries.reduce((maximum, entry) => {
      const match = String(entry.id || '').match(pattern);
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0);
    let number = highest + 1;
    let id;
    do {id = `${prefix}-${String(number++).padStart(width, '0')}`;} while (used.has(id));
    return id;
  }

  function migrate(rawData, options = {}) {
    if (!isObject(rawData)) throw new Error('Die Datei enthält kein Pool-Objekt.');
    const raw = clone(rawData);
    const questions = Array.isArray(raw.questions) ? raw.questions : [];
    const tiebreakers = Array.isArray(raw.tiebreakers) ? raw.tiebreakers : [];
    const validQuestionIds = questions.length > 0 && questions.every((question, index) => QUESTION_ID_PATTERN.test(question?.id) && questions.findIndex(candidate => candidate?.id === question.id) === index);
    const validTiebreakerIds = tiebreakers.every((question, index) => TIEBREAKER_ID_PATTERN.test(question?.id) && tiebreakers.findIndex(candidate => candidate?.id === question.id) === index);
    const configuredPoints = Array.isArray(raw.config?.points) ? raw.config.points.map(Number).filter(point => Number.isFinite(point) && point > 0) : [];
    const usedPoints = questions.map(question => Number(question?.points)).filter(point => Number.isFinite(point) && point > 0);
    const points = [...new Set(configuredPoints.length ? configuredPoints : usedPoints)].sort((left, right) => left - right);
    const name = String(options.name || raw.name || 'Eigener Pool').trim();
    const poolId = String(options.poolId || raw.poolId || slug(name)).trim();
    return {
      schemaVersion: VERSION,
      name,
      poolId,
      config: {points},
      questions: questions.map((question, index) => {
        const choices = Array.isArray(question?.choices) ? question.choices.map(choice => String(choice ?? '').trim()) : [];
        let correctChoiceIndex = Number(question?.correctChoiceIndex);
        if (!Number.isInteger(correctChoiceIndex) || correctChoiceIndex < 0 || correctChoiceIndex >= choices.length) {
          const expected = normalizeText(question?.correctChoice ?? question?.answer);
          correctChoiceIndex = choices.findIndex(choice => normalizeText(choice) === expected);
        }
        return {
          id: validQuestionIds ? question.id : `q-${String(index + 1).padStart(6, '0')}`,
          category: String(question?.category ?? '').trim(),
          points: Number(question?.points),
          question: String(question?.question ?? '').trim(),
          answer: String(question?.answer ?? '').trim(),
          choices,
          correctChoiceIndex,
        };
      }),
      tiebreakers: tiebreakers.map((question, index) => ({
        id: validTiebreakerIds ? question.id : `tb-${String(index + 1).padStart(4, '0')}`,
        question: String(question?.question ?? '').trim(),
        answer: String(question?.answer ?? '').trim(),
        numericAnswer: parseNumericAnswer(question?.numericAnswer ?? question?.answer),
      })),
    };
  }

  return {
    CONFIG_KEYS,
    POOL_KEYS,
    QUESTION_KEYS,
    TIEBREAKER_KEYS,
    VERSION,
    assertValid,
    migrate,
    nextQuestionId: questions => nextId(questions, 'q', 6),
    nextTiebreakerId: tiebreakers => nextId(tiebreakers, 'tb', 4),
    validate,
  };
})();
