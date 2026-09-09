'use strict';

// Der Adapter fällt auf Speicher im Arbeitsspeicher zurück, falls localStorage gesperrt ist.
window.QuizzStorage = (() => {
  function create(onUnavailable) {
    const memory = new Map();
    return {
      getItem(key) {
        if (memory.has(key)) return memory.get(key);
        try {return localStorage.getItem(key);} catch {return null;}
      },
      setItem(key, value) {
        memory.set(key, value);
        try {localStorage.setItem(key, value);} catch {onUnavailable?.();}
      },
      removeItem(key) {
        memory.set(key, null);
        try {localStorage.removeItem(key);} catch {onUnavailable?.();}
      },
    };
  }

  function readJson(storage, key, fallback = null) {
    try {return JSON.parse(storage.getItem(key) || 'null') ?? fallback;} catch {return fallback;}
  }

  return {create, readJson};
})();
