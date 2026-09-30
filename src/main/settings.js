// Persistent settings in <userData>/config.json

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  savePath: '', // folder with the slots, one slot folder or a game_data.sav
  slot: 'auto', // 'auto' = most recently saved slot
  autoRefresh: true,
  pollSeconds: 3,
  uiLanguage: '', // a code from src/locales; empty = pick from the system language on first run
  gameLanguage: '', // names from the game (languages of the user's copy); empty = same as uiLanguage
  showRecipes: 'missing1', // canMake | missing1 | all
  variationSort: 'price', // price | hearts | time | fewer
  maxVariations: 60,
  hideJunk: true, // Dubious Food / Rock-Hard Food
  theme: 'sheikah', // sheikah | parchment | system
  iconSize: 56,
  gameDataPath: '', // empty = bundled gamedata
};

export class Settings {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.values = { ...DEFAULTS };
    try {
      Object.assign(this.values, JSON.parse(fs.readFileSync(this.file, 'utf8')));
    } catch {
      // first run or unreadable: defaults
    }
  }

  get firstRun() {
    return !fs.existsSync(this.file);
  }

  update(partial) {
    for (const [k, v] of Object.entries(partial)) if (k in DEFAULTS) this.values[k] = v;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.values, null, 2));
    return this.values;
  }
}
