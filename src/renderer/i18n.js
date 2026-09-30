// Page side of the translations: loads every locale the main process lists.
import { Translator } from '../shared/i18n.js';

const translator = new Translator();

export async function loadLocales(codes) {
  const loaded = await Promise.all(codes.map(async (code) => {
    const res = await fetch(`app://bundle/locales/${encodeURIComponent(code)}.json`);
    return [code, await res.json()];
  }));
  translator.locales = Object.fromEntries(loaded);
}

export function setLanguage(code) {
  translator.setLanguage(code);
}

export function t(key, vars) {
  return translator.t(key, vars);
}

export function availableLanguages() {
  return translator.available();
}
