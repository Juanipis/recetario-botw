// Translation lookup shared by the main process and the page.
//
// Locales live in src/locales/<code>.json (see CONTRIBUTING.md). Keys can be
// nested ("errors.slotMissing") and texts can use {placeholders}. A key missing
// in the chosen language falls back to English, then Spanish, then the key.

export const FALLBACKS = ['en', 'es'];

export class Translator {
  constructor(locales = {}) {
    this.locales = locales; // { code: json }
    this.code = 'en';
  }

  setLanguage(code) {
    this.code = this.locales[code] ? code : FALLBACKS.find((c) => this.locales[c]) || code;
  }

  lookup(code, key) {
    let node = this.locales[code];
    for (const part of key.split('.')) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[part];
    }
    return node;
  }

  t(key, vars) {
    let value;
    for (const code of [this.code, ...FALLBACKS]) {
      value = this.lookup(code, key);
      if (value !== undefined) break;
    }
    if (value === undefined) return key;
    if (typeof value !== 'string' || !vars) return value;
    return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }

  // [{ code, name }] of the loaded locales, for the language selector
  available() {
    return Object.entries(this.locales)
      .map(([code, json]) => ({ code, name: json._meta?.name || code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

// best locale for a system language tag like "es-CO" or "en_US"
export function pickLanguage(systemTag, available) {
  const tag = String(systemTag || '').toLowerCase().replace('_', '-');
  return available.find((c) => c === tag) || available.find((c) => tag.startsWith(`${c}-`) || tag === c)
    || available.find((c) => c === tag.split('-')[0]) || (available.includes('en') ? 'en' : available[0]);
}
