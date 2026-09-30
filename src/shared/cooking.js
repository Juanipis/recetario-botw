/*
 * BotW cooking simulator.
 *
 * Port of savage13's "BotW Cooking Simulator" (https://github.com/savage13/cooking,
 * BSD 2-Clause, see LICENSE-THIRD-PARTY.md) adapted to work on internal actor
 * names and on the data extracted from the user's own game (tools/extract_gamedata.py).
 *
 * Works both in the renderer (ES module) and in Node (tests).
 */

// Potency thresholds for effect levels 2 and 3 (from savage13, not in CookData)
const THRESHOLD = {
  AttackUp: [5, 7],
  DefenseUp: [5, 7],
  ResistCold: [6, 999],
  ResistHot: [6, 999],
  ResistElectric: [4, 6],
  Fireproof: [7, 999],
  MovingSpeed: [5, 7],
  Quietness: [6, 9],
  LifeMaxUp: [999, 999],
  GutsRecover: [999, 999],
  ExGutsMaxUp: [999, 999],
  None: [999, 999],
};
const TIMED_EFFECTS = ['MovingSpeed', 'AttackUp', 'ResistCold', 'ResistHot', 'DefenseUp', 'ResistElectric', 'Fireproof', 'Quietness'];
const GUTS_RECOVER = [0.0, 0.2, 0.4, 0.8, 1.0, 1.4, 1.6, 1.8, 2.2, 2.4, 2.8, 3.0];
const EX_GUTS = [[0, 0.0], [1, 0.2], [4, 0.4], [6, 0.6], [8, 0.8], [10, 1.0], [12, 1.2], [14, 1.4], [16, 1.6], [18, 1.8], [20, 2.0]];
const CRIT_STAMINA = 0.4;
export const MAX_INGREDIENTS = 5;
export const ELIXIR = 'Item_Cook_C_17';
export const DUBIOUS = 'Item_Cook_O_01';
export const ROCK_HARD = 'Item_Cook_O_02';
export const FAIRY_TONIC = 'Item_Cook_C_16';
const MONSTER_EXTRACT = 'Item_Material_08';

// highest level an effect can reach when cooked
export function maxLevel(effect) {
  const th = THRESHOLD[effect] || THRESHOLD.None;
  return th[1] < 999 ? 3 : th[0] < 999 ? 2 : 1;
}

const unique = (list) => [...new Set(list)];
const inter = (a, b) => a.filter((v) => b.includes(v));

class Recipe {
  constructor(def, index) {
    this.result = def.result;
    this.actors = def.actors;
    this.tags = def.tags;
    this.hb = def.hb || 0;
    this.single = def.single;
    this.index = index;
  }

  matches(items, tags) {
    if (this.single && unique(items).length !== 1) return false;
    let itemsT = [...items];
    let tagsT = [...tags];
    [itemsT, tagsT] = this.single ? this.matchSingleActors(itemsT, tagsT) : this.matchActors(itemsT, tagsT);
    if (!itemsT) return false;
    itemsT = this.single ? this.matchSingleTags(itemsT, tagsT) : this.matchTags(itemsT, tagsT);
    if (!itemsT) return false;
    return this.single ? itemsT.length === 0 : true;
  }

  static removeAll(itemsT, tagsT, value, byTag) {
    const list = byTag ? tagsT : itemsT;
    let k = list.indexOf(value);
    while (k !== -1) {
      itemsT.splice(k, 1);
      tagsT.splice(k, 1);
      k = list.indexOf(value);
    }
  }

  matchSingleActors(itemsT, tagsT) {
    if (this.actors.length === 0) return [itemsT, tagsT];
    const v = inter(this.actors, itemsT);
    if (!v.length) return [undefined, undefined];
    Recipe.removeAll(itemsT, tagsT, v[0], false);
    return [itemsT, tagsT];
  }

  matchSingleTags(itemsT, tagsT) {
    if (this.tags.length === 0) return itemsT;
    const v = inter(this.tags, tagsT);
    if (!v.length) return undefined;
    Recipe.removeAll(itemsT, tagsT, v[0], true);
    return itemsT;
  }

  matchActors(itemsT, tagsT) {
    for (const group of this.actors) {
      const v = inter(group, itemsT);
      if (!v.length) return [undefined, undefined];
      Recipe.removeAll(itemsT, tagsT, v[0], false);
    }
    return [itemsT, tagsT];
  }

  matchTags(itemsT, tagsT) {
    for (const group of this.tags) {
      // like the game (and savage13): the last alternative of the group that matches wins
      let item;
      for (const alt of group) {
        const k = tagsT.indexOf(alt);
        if (k !== -1) item = itemsT[k];
      }
      if (!item) return undefined;
      Recipe.removeAll(itemsT, tagsT, item, false);
    }
    return itemsT;
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class Cooker {
  constructor(data) {
    this.data = data;
    this.items = data.ingredients;
    this.system = data.system;
    this.recipes = data.recipes.map((r, i) => new Recipe(r, i));
    this.singles = this.recipes.filter((r) => r.single);
    this.multis = this.recipes.filter((r) => !r.single);
  }

  // Seconds an ingredient adds to the effect duration. The game gives every
  // ingredient a flat 30 s whatever its CureItem.EffectiveTime says (Silent
  // Princess has 1200 frames, most spices 0, all cook as 30 s in the in-game
  // results of tests/fixtures); only Monster Extract adds nothing.
  ingredientSeconds(actor) {
    return actor === (this.system.MEA || MONSTER_EXTRACT) ? 0 : 30;
  }

  findRecipe(items) {
    const tags = items.map((a) => this.items[a].tag);
    for (const r of this.singles) if (r.matches(items, tags)) return r;
    for (const r of this.multis) if (r.matches(items, tags)) return r;
    return undefined;
  }

  effectInfo(effect) {
    return this.system.effects[effect];
  }

  /**
   * items: array of actor names (1..5, repeats allowed).
   * Returns the dish the game would produce with hearts (hp in quarter hearts),
   * effect, level, duration, price and the critical-cooking variant.
   */
  cook(items) {
    if (!items.length || items.length > MAX_INGREDIENTS || items.some((a) => !this.items[a])) return undefined;
    const recipe = this.findRecipe(items);
    let result = recipe ? recipe.result : DUBIOUS;
    const vals = items.map((a) => this.items[a]);

    let time = 0;
    let potency = 0;
    let hp = 0;
    let sell = 0;
    let buy = 0;
    const effects = [];
    for (const [i, v] of vals.entries()) {
      const hasEffect = v.effect && v.effect !== 'None';
      if (hasEffect) {
        time += this.effectInfo(v.effect)?.BT || 0;
        potency += v.potency;
        effects.push(v.effect);
      }
      time += this.ingredientSeconds(items[i]);
      hp += v.hp;
      if (v.lowPrice) {
        sell += 1;
        buy += 1;
      } else {
        sell += v.sell || 0;
        buy += v.buy || 0;
      }
    }
    hp *= this.system.LRMR || 2;
    const uniq = unique(effects);
    let effect = uniq.length === 1 ? uniq[0] : 'None';
    if (result === ELIXIR && effect === 'None') result = DUBIOUS;

    // price: float32 math like the game, rounded up to tens, capped by buying price, min 2
    const scale = Math.fround(this.system.NMMR[items.length - 1]);
    const scaled = Math.fround(Math.fround(sell) * scale);
    let price = Math.ceil(Math.floor(scaled) / 10) * 10;
    price = Math.max(Math.min(price, buy), 2);

    time += vals.reduce((acc, v) => acc + (v.timeBoost || 0), 0);
    hp += unique(items).reduce((acc, a) => acc + (this.items[a].hpBoost || 0), 0);
    const critRate = Math.max(...vals.map((v) => v.critRate || 0)) + this.system.NMSSR[unique(items).length - 1];
    hp += recipe ? recipe.hb : 0;

    const base = { dish: result, recipeIndex: recipe ? recipe.index : -1, items: [...items] };
    if (result === ROCK_HARD) {
      return { ...base, recipeIndex: unique(items).length === 1 ? recipe.index : recipe.index, hp: 1, hearts: 0.25, price: 2, effect: 'None', critRate: 0, alwaysSame: true };
    }
    if (result === DUBIOUS) {
      const raw = vals.reduce((acc, v) => acc + v.hp, 0);
      const dhp = Math.max(raw > 0 ? raw : 4, 4);
      return { ...base, hp: dhp, hearts: dhp / 4, price: 2, effect: 'None', critRate: 0, alwaysSame: true };
    }
    if (result === FAIRY_TONIC) {
      effect = 'None';
      price = 2;
    }

    const th = THRESHOLD[effect] || THRESHOLD.None;
    const level = potency >= th[1] ? 3 : potency >= th[0] ? 2 : 1;
    const out = {
      ...base,
      hp,
      hearts: hp / 4,
      price,
      effect,
      potency,
      level,
      critRate: Math.min(critRate, 100),
      monsterExtract: items.includes(MONSTER_EXTRACT),
      crit: { hp: hp + (this.effectInfo('LifeRecover')?.SSA || 12), level: Math.min(level + 1, 3) },
    };
    if (TIMED_EFFECTS.includes(effect)) {
      out.timeSec = Math.min(30 * 60, time);
      out.time = formatTime(out.timeSec);
      out.crit.timeSec = Math.min(30 * 60, time + (this.system.SSAET || 300));
      out.crit.time = formatTime(out.crit.timeSec);
    }
    if (effect === 'None') {
      delete out.potency;
      delete out.level;
      delete out.crit.level;
    }
    if (effect === 'LifeMaxUp') {
      out.hp = 0;
      out.hearts = 0;
      out.level = Math.floor(potency / 4); // extra yellow hearts, fully heals
      out.crit = { level: out.level + 1 };
    }
    if (effect === 'GutsRecover') {
      out.stamina = GUTS_RECOVER[Math.min(potency, GUTS_RECOVER.length - 1)];
      out.crit.stamina = Math.min(out.stamina + CRIT_STAMINA, 3.0);
      delete out.level;
      delete out.crit.level;
    }
    if (effect === 'ExGutsMaxUp') {
      out.staminaExtra = EX_GUTS.filter(([pts]) => pts <= Math.min(20, potency)).pop()[1];
      out.crit.staminaExtra = Math.min(out.staminaExtra + CRIT_STAMINA, 2.0);
      delete out.level;
      delete out.crit.level;
    }
    if (result === FAIRY_TONIC && out.monsterExtract) {
      out.hp = out.crit.hp;
      out.hearts = out.hp / 4;
    }
    out.hp = Math.min(out.hp, 120);
    out.hearts = out.hp / 4;
    if (out.crit.hp !== undefined) out.crit.hp = Math.min(out.crit.hp, 120);
    return out;
  }
}
