'use strict';

window.QuizzPoolFormat = (() => {
  function stripTrailingCommas(text) {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (inString) {
        result += character;
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        result += character;
        continue;
      }
      if (character === ',') {
        let nextIndex = index + 1;
        while (/\s/.test(text[nextIndex] || '')) nextIndex++;
        if (text[nextIndex] === '}' || text[nextIndex] === ']') continue;
      }
      result += character;
    }
    return result;
  }

  function extractPoolObject(text) {
    const markerIndex = text.indexOf('window.QUESTIONS_DATA');
    const assignmentIndex = markerIndex >= 0 ? text.indexOf('=', markerIndex) : -1;
    const start = text.indexOf('{', assignmentIndex >= 0 ? assignmentIndex : 0);
    if (start < 0) throw new Error('Die Zuweisung an window.QUESTIONS_DATA wurde nicht gefunden.');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth++;
      else if (character === '}' && --depth === 0) return text.slice(start, index + 1);
    }
    throw new Error('Das Pool-Objekt ist nicht vollständig geschlossen.');
  }

  function parse(text) {
    const cleanText = String(text).replace(/^\uFEFF/, '').trim();
    try {return JSON.parse(cleanText);}
    catch {
      const objectText = stripTrailingCommas(extractPoolObject(cleanText));
      try {return JSON.parse(objectText);}
      catch (error) {throw new Error(`Das questions.js-Objekt konnte nicht gelesen werden: ${error.message}`);}
    }
  }

  function toJavaScript(data) {
    return `'use strict';\n\nwindow.QUESTIONS_DATA = ${JSON.stringify(data, null, 2)};\n`;
  }

  function toJson(data) {
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  return {parse, toJavaScript, toJson};
})();
