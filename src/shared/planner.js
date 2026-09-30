// What can be cooked with an inventory: dish cards, their status and variations.
//
// A "card" is one dish (or one elixir per effect). Every card has the recipe
// definitions that produce it; each definition is a list of requirement groups
// (one ingredient must fill each group). Candidates are always checked with the
// simulator, because the game picks the first matching recipe in its own order.

import { Cooker, ELIXIR, DUBIOUS, ROCK_HARD, MAX_INGREDIENTS } from './cooking.js';

const JUNK = new Set([DUBIOUS, ROCK_HARD]);
const LIMITS = { baseCombos: 400, evaluated: 25000, extrasPool: 9 };

function* product(lists, index = 0, picked = []) {
  if (index === lists.length) {
    yield picked;
    return;
  }
  for (const v of lists[index]) {
    if (!picked.includes(v)) yield* product(lists, index + 1, [...picked, v]);
  }
}

// multisets of `size` elements from `pool` (sorted, repeats allowed)
function* multisets(pool, size, start = 0, picked = []) {
  if (size === 0) {
    yield picked;
    return;
  }
  for (let i = start; i < pool.length; i++) yield* multisets(pool, size - 1, i, [...picked, pool[i]]);
}

const keyOf = (items) => [...items].sort().join('+');

export class Planner {
  constructor(data) {
    this.data = data;
    this.cooker = new Cooker(data);
    this.items = data.ingredients;
    this.cards = this.buildCards();
  }

  buildCards() {
    const byDish = new Map();
    for (const recipe of this.cooker.recipes) {
      if (!byDish.has(recipe.result)) byDish.set(recipe.result, []);
      byDish.get(recipe.result).push(recipe);
    }
    const cards = [];
    for (const [dish, recipes] of byDish) {
      if (dish === ELIXIR) continue;
      cards.push({ id: dish, dish, effect: null, junk: JUNK.has(dish), recipes: Planner.simplestFirst(recipes) });
    }
    // one elixir card per critter effect
    const elixirRecipes = byDish.get(ELIXIR) || [];
    const effects = new Set(Object.values(this.items).filter((v) => v.tag === 'CookInsect' && v.effect !== 'None').map((v) => v.effect));
    for (const effect of effects) cards.push({ id: `${ELIXIR}:${effect}`, dish: ELIXIR, effect, junk: false, recipes: Planner.simplestFirst(elixirRecipes), elixir: true });
    return cards;
  }

  // fewest requirement groups first, so examples and "how to make it" show the simplest version
  static simplestFirst(recipes) {
    const size = (r) => (r.single ? 1 : r.actors.length + r.tags.length);
    return [...recipes].sort((a, b) => size(a) - size(b) || a.index - b.index);
  }

  // requirement groups of one recipe definition, as lists of candidate actors
  groups(card, recipe) {
    const all = Object.keys(this.items);
    const forElixir = (actor) => !card.elixir || this.items[actor].tag !== 'CookInsect' || this.items[actor].effect === card.effect;
    if (recipe.single) {
      const opts = recipe.actors.length ? recipe.actors.filter((a) => this.items[a]) : all.filter((a) => recipe.tags.includes(this.items[a].tag));
      return [{ single: true, options: opts.filter(forElixir) }];
    }
    const out = recipe.actors.map((g) => ({ options: g.filter((a) => this.items[a]) }));
    for (const g of recipe.tags) out.push({ tags: g, options: all.filter((a) => g.includes(this.items[a].tag)).filter(forElixir) });
    return out;
  }

  producesCard(card, result) {
    return result && result.dish === card.dish && (!card.elixir || result.effect === card.effect);
  }

  /**
   * Status of a card for an inventory ({actor: qty}):
   * { missing: 0 | 1 | 2, example: [actors], need: [actors that would complete it] }
   */
  status(card, inv) {
    let best = { missing: 2, example: null, need: [] };
    const owned = (a) => (inv[a] || 0) > 0;
    for (const recipe of card.recipes) {
      const groups = this.groups(card, recipe);
      const ownedLists = groups.map((g) => g.options.filter(owned).sort((a, b) => inv[b] - inv[a]));
      // everything owned
      if (ownedLists.every((l) => l.length)) {
        let n = 0;
        for (const combo of product(ownedLists)) {
          if (++n > LIMITS.baseCombos) break;
          if (this.producesCard(card, this.cooker.cook(combo))) return { missing: 0, example: combo, need: [] };
        }
      }
      // one group filled with something the player does not have
      if (best.missing > 1) {
        for (let gi = 0; gi < groups.length; gi++) {
          const lists = ownedLists.map((l, i) => (i === gi ? groups[i].options.filter((a) => !owned(a)) : l));
          if (lists.some((l) => !l.length)) continue;
          const need = new Set();
          let example = null;
          let n = 0;
          for (const combo of product(lists)) {
            if (++n > LIMITS.baseCombos) break;
            if (this.producesCard(card, this.cooker.cook(combo))) {
              need.add(combo[gi]);
              example = example || combo;
            }
          }
          if (example) best = { missing: 1, example, need: [...need] };
        }
      }
    }
    return best;
  }

  /**
   * Distinct cookable combinations for a card, simulated.
   * mode 'owned': only what the inventory has (respecting quantities);
   * mode 'missing': exactly one ingredient the player lacks.
   */
  variations(card, inv, { mode = 'owned', sort = 'price', max = 60, budget = LIMITS.evaluated } = {}) {
    const owned = (a) => (inv[a] || 0) > 0;
    const seen = new Map();
    let evaluated = 0;
    const fits = (combo) => {
      const count = {};
      for (const a of combo) count[a] = (count[a] || 0) + 1;
      let lacking = 0;
      for (const [a, n] of Object.entries(count)) {
        if ((inv[a] || 0) < n) lacking += owned(a) ? 99 : 1; // too few of something owned = impossible
      }
      return mode === 'owned' ? lacking === 0 : lacking === 1;
    };
    const tryCombo = (combo) => {
      if (combo.length > MAX_INGREDIENTS || evaluated > budget) return;
      const key = keyOf(combo);
      if (seen.has(key) || !fits(combo)) return;
      evaluated++;
      const r = this.cooker.cook(combo);
      if (this.producesCard(card, r)) seen.set(key, { ...r, missing: combo.filter((a) => !owned(a)) });
    };

    for (const recipe of card.recipes) {
      const groups = this.groups(card, recipe);
      const lists = groups.map((g) => (mode === 'owned' ? g.options.filter(owned) : g.options));
      if (lists.some((l) => !l.length)) continue;
      // extras: owned ingredients that fit the recipe's groups, most useful first
      const extras = [...new Set(lists.flat().filter(owned))]
        .sort((a, b) => this.usefulness(b) - this.usefulness(a))
        .slice(0, LIMITS.extrasPool);
      let bases = 0;
      for (const base of product(lists)) {
        if (++bases > LIMITS.baseCombos || evaluated > budget) break;
        if (mode === 'missing' && base.filter((a) => !owned(a)).length !== 1) continue;
        const pool = [...new Set([...base.filter(owned), ...extras])];
        for (let add = 0; add <= MAX_INGREDIENTS - base.length; add++) {
          if (groups.some((g) => g.single)) {
            tryCombo(Array(base.length + add).fill(base[0]));
            continue;
          }
          for (const extra of multisets(pool, add)) tryCombo([...base, ...extra]);
        }
      }
    }
    const list = [...seen.values()];
    const metric = {
      price: (r) => r.price,
      hearts: (r) => (r.effect === 'LifeMaxUp' ? 1000 + r.level : r.hp),
      time: (r) => (r.level || 0) * 10000 + (r.timeSec || 0) + (r.stamina || 0) * 100 + (r.staminaExtra || 0) * 100,
      fewer: (r) => -r.items.length * 1000 + r.price / 1000,
    }[sort] || ((r) => r.price);
    list.sort((a, b) => metric(b) - metric(a) || a.items.length - b.items.length);
    return { total: list.length, list: list.slice(0, max), truncated: evaluated > budget };
  }

  /**
   * What a dish does, for the recipe cards: range of hearts, best price and, per
   * effect, the best level/duration/extra reachable. `inv` limits it to what the
   * player carries; pass planner.everything for what the dish can give in general.
   * Targeted rather than exhaustive: every candidate alone, then the pot filled
   * with the strongest ingredient of each effect, the most healing and the most
   * valuable one, which is where the maxima are.
   */
  summary(card, inv) {
    const owned = (a) => (inv[a] || 0) > 0;
    // best: { hearts, price } combos; effects[e] = the combo giving the most of e (with its numbers)
    const out = { count: 0, hpMin: Infinity, hpMax: 0, priceMax: 0, effects: {}, plain: false, best: {} };
    const seen = new Set();
    // on ties prefer fewer and cheaper ingredients (do not burn rare monster parts for nothing)
    const value = (items) => items.reduce((acc, a) => acc + (this.items[a].sell || 0), 0);
    const fewer = (r, cur) => r.items.length < cur.items.length || (r.items.length === cur.items.length && value(r.items) < value(cur.items));
    const add = (r) => {
      out.count++;
      if (!out.best.price || r.price > out.best.price.price || (r.price === out.best.price.price && fewer(r, out.best.price))) out.best.price = r;
      out.priceMax = out.best.price.price;
      if (r.effect === 'LifeMaxUp') {
        const cur = out.effects.LifeMaxUp;
        if (!cur || r.level > cur.extraHearts || (r.level === cur.extraHearts && fewer(r, cur))) {
          out.effects.LifeMaxUp = { extraHearts: r.level, items: r.items, price: r.price };
        }
        return;
      }
      out.hpMin = Math.min(out.hpMin, r.hp);
      if (!out.best.hearts || r.hp > out.best.hearts.hp || (r.hp === out.best.hearts.hp && fewer(r, out.best.hearts))) out.best.hearts = r;
      out.hpMax = out.best.hearts.hp;
      if (!r.effect || r.effect === 'None') {
        out.plain = true;
        return;
      }
      const e = { level: r.level || 0, timeSec: r.timeSec || 0, stamina: r.stamina ?? r.staminaExtra ?? 0, hp: r.hp, price: r.price, items: r.items };
      const cur = out.effects[r.effect];
      const rank = (x) => [x.level, x.timeSec, x.stamina, -x.items.length, -value(x.items)];
      const better = !cur || rank(e).some((v, i) => v !== rank(cur)[i] && rank(e).slice(0, i).every((w, j) => w === rank(cur)[j]) && v > rank(cur)[i]);
      if (better) out.effects[r.effect] = e;
    };
    const tryCombo = (combo) => {
      const key = keyOf(combo);
      if (seen.has(key) || combo.length > MAX_INGREDIENTS) return;
      seen.add(key);
      const count = {};
      for (const a of combo) count[a] = (count[a] || 0) + 1;
      if (Object.entries(count).some(([a, n]) => (inv[a] || 0) < n)) return;
      const r = this.cooker.cook(combo);
      if (this.producesCard(card, r)) add(r);
    };
    // fills the free slots with `actor` as far as the inventory allows
    const fill = (base, actor) => {
      const combo = [...base];
      while (combo.length < MAX_INGREDIENTS && combo.filter((a) => a === actor).length < (inv[actor] || 0)) combo.push(actor);
      return combo;
    };
    for (const recipe of card.recipes) {
      const groups = this.groups(card, recipe);
      const lists = groups.map((g) => g.options.filter(owned));
      if (lists.some((l) => !l.length)) continue;
      const candidates = [...new Set(lists.flat())];
      const best = (score) => [...candidates].sort((a, b) => score(b) - score(a))[0];
      const strongest = {};
      for (const a of candidates) {
        const e = this.items[a].effect;
        if (e && e !== 'None' && (!strongest[e] || this.items[a].potency > this.items[strongest[e]].potency)) strongest[e] = a;
      }
      const fillers = [...new Set([...Object.values(strongest), best((a) => this.items[a].hp), best((a) => this.items[a].sell)])];
      // greedy: the most valuable / most healing ingredients that fit, as many as owned
      const greedy = (base, score) => {
        const combo = [...base];
        for (const a of [...candidates].sort((x, y) => score(y) - score(x))) {
          while (combo.length < MAX_INGREDIENTS && combo.filter((c) => c === a).length < (inv[a] || 0)) combo.push(a);
        }
        return combo;
      };
      let n = 0;
      for (const base of product(lists)) {
        if (++n > LIMITS.baseCombos) break;
        tryCombo(base);
        tryCombo(greedy(base, (a) => this.items[a].sell));
        tryCombo(greedy(base, (a) => this.items[a].hp));
        if (groups.some((g) => g.single)) {
          tryCombo(fill(base, base[0]));
          continue;
        }
        for (const a of new Set([...base, ...fillers])) tryCombo(fill(base, a));
      }
    }
    if (out.hpMin === Infinity) out.hpMin = 0;
    return out;
  }

  // an inventory with 5 of every ingredient, for general summaries
  get everything() {
    this._everything ||= Object.fromEntries(Object.keys(this.items).map((a) => [a, MAX_INGREDIENTS]));
    return this._everything;
  }

  usefulness(actor) {
    const v = this.items[actor];
    return (v.potency || 0) * 8 + (v.hp || 0) + (v.timeBoost || 0) / 10 + (v.sell || 0) / 5;
  }
}
