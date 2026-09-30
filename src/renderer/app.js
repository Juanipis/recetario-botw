import { Planner } from '../shared/planner.js';
import { ELIXIR, DUBIOUS, ROCK_HARD, MAX_INGREDIENTS, maxLevel } from '../shared/cooking.js';
import { t, setLanguage, loadLocales, availableLanguages } from './i18n.js';

const api = window.recetario;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const TAG_CATEGORY = {
  CookFruit: 'fruit', CookMushroom: 'mushroom', CookPlant: 'plant', CookMeat: 'meat', CookFish: 'fish',
  CookInsect: 'critter', CookEnemy: 'monster', CookOre: 'mineral', CookSpice: 'other',
};
const CATEGORY_ORDER = ['fruit', 'mushroom', 'plant', 'meat', 'fish', 'critter', 'monster', 'mineral', 'other', 'roast'];
const EFFECT_ICON_KEY = { MovingSpeed: 'AllSpeed' };
// symbol and color per effect, used on cards, the pot, variations and ingredients
const EFFECT_STYLE = {
  LifeMaxUp: { icon: '💛', color: '#f5c542' },
  GutsRecover: { icon: '🟢', color: '#7fe07a' },
  ExGutsMaxUp: { icon: '🟡', color: '#e8d25a' },
  ResistHot: { icon: '❄️', color: '#86d4ff' },
  ResistCold: { icon: '🌶️', color: '#ff8f45' },
  ResistElectric: { icon: '⚡', color: '#f5de4a' },
  Fireproof: { icon: '🔥', color: '#ff6a3d' },
  MovingSpeed: { icon: '💨', color: '#6fe3c8' },
  AttackUp: { icon: '⚔️', color: '#ff6b78' },
  DefenseUp: { icon: '🛡️', color: '#80a8ff' },
  Quietness: { icon: '🌙', color: '#b890ff' },
};
const EFFECT_ORDER = Object.keys(EFFECT_STYLE);
// "francés" / "French"... in the app's language
function languageName(code) {
  try {
    const name = new Intl.DisplayNames([S.settings.uiLanguage || 'en'], { type: 'language' }).of(code);
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code;
  }
}

const S = {
  settings: null,
  platform: '',
  data: null,
  planner: null,
  save: null,
  inv: {},
  pot: [],
  invTab: 'all',
  invSearch: '',
  recipeSearch: '',
  recipeKind: 'all',
  recipeFilter: 'missing1',
  focus: null,
  statuses: new Map(),
  cardActors: new Map(),
  summaries: new Map(), // card id -> what it does with the current inventory
  generic: new Map(), // card id -> what it does in general (independent of the save)
  summaryRun: 0,
  recipeEffect: 'all',
  recipeSort: 'name',
  detail: null,
  settingsOpen: false,
};

// ---------------------------------------------------------------- texts & icons

function L() {
  const s = S.data.strings;
  return s[S.settings.gameLanguage] || s[S.settings.uiLanguage] || s.en || s.es || Object.values(s)[0];
}
const itemName = (a) => L().items[a]?.name || S.data.strings.es?.items[a]?.name || a;
const itemDesc = (a) => L().items[a]?.desc || '';

function dishName(dish, effect) {
  const d = L().dishes[dish];
  const base = d?.name || dish;
  if (!effect || effect === 'None') return base;
  const e = L().effects[effect] || {};
  const word = (d?.grammar && e[`Name_${d.grammar}`]) || e.Name || '';
  if (!word.trim()) return base;
  // Spanish/French put the adjective after the dish, English before
  return word.endsWith(' ') ? `${word}${base}` : `${base}${word.startsWith(' ') ? word : ` ${word}`}`;
}
const effectName = (effect) => L().effects[effect]?.status || effect;
function effectDesc(effect, level, elixir) {
  const e = L().effects[effect] || {};
  const key = elixir ? 'MedicineDesc' : 'Desc';
  const suffix = level >= 3 ? '_03' : level === 2 ? '_02' : '';
  return (e[key + suffix] || e[key] || '').trim();
}
function icon(actor) {
  const f = S.data.icons[actor];
  return f ? `app://bundle/icons/${encodeURIComponent(f)}` : '';
}
function dishIcon(dish, effect) {
  if (dish === ELIXIR && effect && effect !== 'None') {
    const key = `${ELIXIR}_${EFFECT_ICON_KEY[effect] || effect}`;
    if (S.data.icons[key]) return icon(key);
  }
  return icon(dish);
}
const category = (a) => (S.data.ingredients[a].roast ? 'roast' : TAG_CATEGORY[S.data.ingredients[a].tag] || 'other');

function heartsText(hp) {
  const full = Math.floor(hp / 4);
  const frac = ['', '¼', '½', '¾'][hp % 4];
  return full ? `${full}${frac}` : frac || '0';
}
const levelMarks = (level, effect) => {
  const max = maxLevel(effect);
  return max > 1 ? `<span class="level" title="${t('level')} ${level}">${'◆'.repeat(level)}${'◇'.repeat(Math.max(0, max - level))}</span>` : '';
};

function statsHtml(r, { crit = true } = {}) {
  const parts = [];
  if (r.effect === 'LifeMaxUp') parts.push(effectChip('LifeMaxUp', { extraHearts: r.level }));
  else if (r.hp > 0) parts.push(`<span class="heart" title="${r.hp / 4} ${t('hearts')}">❤ ${heartsText(r.hp)}</span>`);
  if (r.effect && r.effect !== 'None' && r.effect !== 'LifeMaxUp') {
    parts.push(effectChip(r.effect, { level: r.level, timeSec: r.timeSec, stamina: r.stamina ?? r.staminaExtra }));
  }
  parts.push(`<span class="rupee" title="${t('price')}">◈ ${r.price}</span>`);
  if (crit && r.crit && r.critRate) {
    const opts = [];
    if (r.crit.hp !== undefined && r.effect !== 'LifeMaxUp') opts.push(`❤ ${heartsText(r.crit.hp)}`);
    if (r.effect === 'LifeMaxUp') opts.push(`❤ + ${r.crit.level} ${t('extraHearts')}`);
    else if (r.crit.level !== undefined && r.effect !== 'None' && r.crit.level !== r.level) opts.push(`${t('level')} ${r.crit.level}`);
    if (r.crit.time) opts.push(`⏱ ${r.crit.time}`);
    if (r.crit.stamina !== undefined) opts.push(`+${r.crit.stamina} ${t('wheels')}`);
    if (r.crit.staminaExtra !== undefined) opts.push(`+${r.crit.staminaExtra} ${t('wheels')}`);
    if (opts.length) parts.push(`<span class="crit" title="${t('crit')}">✦ ${t('crit')} ${r.critRate}%: ${opts.join(' / ')}</span>`);
  }
  return `<div class="stats">${parts.join('')}</div>`;
}

function comboHtml(items, missing = []) {
  const counts = new Map();
  for (const a of items) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts]
    .map(([a, n]) => `<span class="ing ${missing.includes(a) ? 'lack' : ''}" data-tip="${a}"><img src="${icon(a)}" alt="">${n > 1 ? `×${n}` : ''}</span>`)
    .join('');
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------------------------------------------------------------- data

function setSave(save) {
  S.save = save;
  S.inv = {};
  if (!save.error) {
    for (const { actor, qty } of save.items) if (S.data.ingredients[actor] && qty > 0) S.inv[actor] = (S.inv[actor] || 0) + qty;
  }
  S.statuses = new Map(S.planner.cards.map((c) => [c.id, S.planner.status(c, S.inv)]));
  computeSummaries();
}

function buildCardActors() {
  for (const card of S.planner.cards) {
    const set = new Set();
    for (const r of card.recipes) for (const g of S.planner.groups(card, r)) g.options.forEach((a) => set.add(a));
    S.cardActors.set(card.id, set);
  }
}

// ---------------------------------------------------------------- top bar

function timeAgo(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString(S.settings.uiLanguage, { hour: '2-digit', minute: '2-digit' });
}

function renderTopbar() {
  const s = S.save;
  let chip;
  if (!s || s.error) {
    chip = `<span class="chip" data-action="settings"><span class="dot"></span>${esc(s?.error === 'read' ? `${t('readError')}: ${t(`errors.${s.code}`, s.vars)}` : t('noSave'))}</span>`;
  } else {
    const hours = s.playTime ? `${Math.floor(s.playTime / 3600)} h ${Math.floor((s.playTime % 3600) / 60)} min ${t('played')}` : '';
    const bits = [`<b>${t('slot')} ${esc(s.slot)}</b>`, `${t('savedAt')} ${timeAgo(s.mtime)}`, hours, s.rupees !== undefined ? `${s.rupees} ${t('rupees')}` : '', s.platform === 'switch' ? t('switchUntested') : 'Wii U'];
    chip = `<span class="chip" data-action="settings" title="${esc(s.file)}"><span class="dot ${S.settings.autoRefresh ? 'live' : ''}" title="${S.settings.autoRefresh ? t('autoOn') : t('autoOff')}"></span>${bits.filter(Boolean).join(' · ')}</span>`;
  }
  $('#topbar').className = `topbar ${S.platform === 'darwin' ? 'mac' : ''}`;
  $('#topbar').innerHTML = `
    <div class="brand"><img src="${S.data ? dishIcon(ELIXIR, 'LifeMaxUp') : ''}" alt=""><div>${t('appName')}<small>Breath of the Wild</small></div></div>
    ${chip}
    <div class="spacer"></div>
    <button class="btn" data-action="reload" id="reload-btn"><span class="ico">⟳</span>${t('reload')}</button>
    <button class="btn" data-action="settings"><span class="ico">⚙</span>${t('settings')}</button>`;
}

// ---------------------------------------------------------------- inventory

function renderInventoryShell() {
  $('#inventory').innerHTML = `
    <div class="panel-head">
      <h2>${t('inventory')}</h2>
      <span class="hint">${t('inventoryHint')}</span>
      <div class="spacer"></div>
      <input class="search" id="inv-search" type="search" placeholder="${t('searchIngredients')}" value="${esc(S.invSearch)}">
    </div>
    <div class="tabs" id="inv-tabs"></div>
    <div class="inv-grid" id="inv-grid"></div>`;
}

function renderInventory() {
  const owned = Object.keys(S.inv).sort((a, b) => S.data.ingredients[a].sortKey - S.data.ingredients[b].sortKey);
  const counts = { all: owned.length };
  for (const a of owned) counts[category(a)] = (counts[category(a)] || 0) + 1;
  $('#inv-tabs').innerHTML = ['all', ...CATEGORY_ORDER.filter((c) => counts[c])]
    .map((c) => `<button class="tab ${S.invTab === c ? 'on' : ''}" data-action="inv-tab" data-tab="${c}">${c === 'all' ? t('all') : t(`categories.${c}`)}<span class="n">${counts[c]}</span></button>`)
    .join('');
  const q = norm(S.invSearch);
  const shown = owned.filter((a) => (S.invTab === 'all' || category(a) === S.invTab) && (!q || norm(itemName(a)).includes(q)));
  $('#inv-grid').innerHTML = shown.length
    ? shown.map((a) => {
      const fx = EFFECT_STYLE[S.data.ingredients[a].effect];
      return `<div class="slot ${S.focus === a ? 'focus' : ''}" data-action="add" data-actor="${a}" data-tip="${a}"><img src="${icon(a)}" alt="" loading="lazy">${fx ? `<span class="fx-badge" style="--fx:${fx.color}">${fx.icon}</span>` : ''}<span class="qty">${S.inv[a]}</span></div>`;
    }).join('')
    : `<div class="empty">${S.save?.error ? t('noSaveTitle') : t('nothingHere')}</div>`;
}

// ---------------------------------------------------------------- pot

function renderPot() {
  const used = {};
  for (const a of S.pot) used[a] = (used[a] || 0) + 1;
  const slots = Array.from({ length: MAX_INGREDIENTS }, (_, i) => {
    const a = S.pot[i];
    if (!a) return '<div class="pot-slot empty"></div>';
    const short = used[a] > (S.inv[a] || 0);
    return `<div class="pot-slot ${short ? 'short' : ''}" data-action="pot-remove" data-index="${i}" data-tip="${a}"><img src="${icon(a)}" alt=""></div>`;
  }).join('');
  let body = `<div class="pot-empty">${t('potEmpty')}</div>`;
  if (S.pot.length) {
    const r = S.planner.cooker.cook(S.pot);
    const notes = [];
    if (r.dish === DUBIOUS) notes.push(`<div class="warn">${t('dubiousWarn')}</div>`);
    if (r.monsterExtract) notes.push(`<div class="warn">${t('monsterRandom')}</div>`);
    if (Object.entries(used).some(([a, n]) => n > (S.inv[a] || 0))) notes.push(`<div class="warn">${t('potNotEnough')}</div>`);
    const desc = r.dish === ELIXIR ? effectDesc(r.effect, r.level, true) : L().dishes[r.dish]?.desc;
    body = `<div class="result ${r.dish === DUBIOUS || r.dish === ROCK_HARD ? 'bad' : ''}">
      <img src="${dishIcon(r.dish, r.effect)}" alt="">
      <div><h3>${esc(dishName(r.dish, r.effect))}</h3>${statsHtml(r)}${notes.join('')}</div>
    </div>
    <p class="desc">${esc(desc || '')}</p>`;
  }
  $('#pot').innerHTML = `
    <div class="panel-head"><h2>${t('pot')}</h2><div class="spacer"></div>${S.pot.length ? `<button class="btn small" data-action="pot-clear">${t('potClear')}</button>` : ''}</div>
    <div class="pot-slots">${slots}</div>
    ${body}`;
}

function addToPot(actor) {
  if (S.pot.length >= MAX_INGREDIENTS) S.pot.shift();
  S.pot.push(actor);
  renderPot();
}

// ---------------------------------------------------------------- recipes

function renderRecipesShell() {
  $('#recipes').innerHTML = `
    <div class="panel-head"><h2>${t('recipes')}</h2><span class="hint" id="recipe-count"></span></div>
    <div class="toolbar">
      <input class="search" id="recipe-search" type="search" placeholder="${t('searchRecipes')}" value="${esc(S.recipeSearch)}">
      <div class="seg" id="recipe-filter"></div>
      <div class="seg" id="recipe-kind"></div>
      <select class="select" id="recipe-sort" title="${t('sortBy')}"></select>
      <span id="focus-banner"></span>
    </div>
    <div class="fx-legend" id="recipe-effects"></div>
    <div class="cards" id="recipe-cards"></div>`;
}

function visibleCards() {
  const maxMissing = { canMake: 0, missing1: 1, all: 2 }[S.recipeFilter] ?? 1;
  const q = norm(S.recipeSearch);
  return S.planner.cards
    .filter((c) => !(c.junk && S.settings.hideJunk))
    .filter((c) => S.recipeKind === 'all' || (S.recipeKind === 'elixir') === Boolean(c.elixir))
    .filter((c) => S.statuses.get(c.id).missing <= maxMissing)
    .filter((c) => !S.focus || S.cardActors.get(c.id).has(S.focus))
    .filter((c) => !q || norm(dishName(c.dish, c.effect)).includes(q) || [...S.cardActors.get(c.id)].some((a) => norm(itemName(a)).includes(q)))
    .filter((c) => {
      if (S.recipeEffect === 'all') return true;
      const s = cardSummary(c);
      if (!s) return true; // not computed yet
      return S.recipeEffect === 'none' ? !Object.keys(s.effects).length : S.recipeEffect in s.effects;
    })
    .sort((a, b) => {
      const byStatus = S.statuses.get(a.id).missing - S.statuses.get(b.id).missing;
      const byName = dishName(a.dish, a.effect).localeCompare(dishName(b.dish, b.effect));
      if (S.recipeSort === 'name') return byStatus || byName;
      const sa = cardSummary(a);
      const sb = cardSummary(b);
      const metric = (s) => (!s ? -1 : S.recipeSort === 'hearts' ? s.hpMax + (s.effects.LifeMaxUp?.extraHearts || 0) * 4 : s.priceMax);
      return byStatus || metric(sb) - metric(sa) || byName;
    });
}

function renderRecipes() {
  const seg = (id, action, value, options) => {
    $(id).innerHTML = options.map(([v, label]) => `<button class="${value === v ? 'on' : ''}" data-action="${action}" data-value="${v}">${label}</button>`).join('');
  };
  seg('#recipe-filter', 'filter', S.recipeFilter, [['canMake', t('filterCanMake')], ['missing1', t('filterMissing1')], ['all', t('filterAll')]]);
  seg('#recipe-kind', 'kind', S.recipeKind, [['all', t('kindAll')], ['food', t('kindFood')], ['elixir', t('kindElixir')]]);
  const option = (v, cur, label) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const legend = (value, style, label) => `<button class="fxchip legend ${S.recipeEffect === value ? 'on' : ''}" style="--fx:${style}" data-action="fx-filter" data-value="${value}">${label}</button>`;
  $('#recipe-effects').innerHTML = `<span class="hint">${t('effectFilter')}:</span>`
    + legend('all', 'var(--accent)', t('effectFilterAll'))
    + EFFECT_ORDER.map((e) => legend(e, EFFECT_STYLE[e].color, `<span class="fxicon">${EFFECT_STYLE[e].icon}</span>${esc(effectName(e))}`)).join('')
    + legend('none', 'var(--muted)', t('effectFilterNone'));
  $('#recipe-sort').innerHTML = [['name', t('sortName')], ['hearts', t('sortHearts')], ['price', t('sortPrice')]].map(([v, l]) => option(v, S.recipeSort, `${t('sortBy')}: ${l}`)).join('');
  $('#focus-banner').innerHTML = S.focus
    ? `<span class="focus-banner"><img src="${icon(S.focus)}" alt="">${t('usingIngredient')} ${esc(itemName(S.focus))}<button class="btn small ghost" data-action="clear-focus">✕</button></span>`
    : '';
  const cards = visibleCards();
  const ok = cards.filter((c) => S.statuses.get(c.id).missing === 0).length;
  $('#recipe-count').textContent = `${ok} / ${cards.length}`;
  $('#recipe-cards').innerHTML = cards.length ? cards.map(cardHtml).join('') : `<div class="empty">${t('nothingHere')}</div>`;
}

function cardHtml(c) {
  const st = S.statuses.get(c.id);
  let status;
  if (st.missing === 0) {
    status = `<div class="status ok">✓ ${t('canMake')}<span class="need-icons">${[...new Set(st.example)].map((a) => `<img src="${icon(a)}" alt="" data-tip="${a}">`).join('')}</span></div>`;
  } else if (st.missing === 1) {
    const first = st.need[0];
    status = `<div class="status m1">${t('missingOne')}: ${esc(itemName(first))}${st.need.length > 1 ? ` (+${st.need.length - 1})` : ''}
      <span class="need-icons">${st.need.slice(0, 6).map((a) => `<img src="${icon(a)}" alt="" data-tip="${a}">`).join('')}</span></div>`;
  } else {
    status = `<div class="status m2">${t('missingMany')}</div>`;
  }
  const cls = st.missing === 0 ? '' : st.missing === 1 ? 'missing1' : 'missing2';
  return `<div class="card ${cls}" data-action="open-card" data-card="${esc(c.id)}">
    <img src="${dishIcon(c.dish, c.effect)}" alt="" loading="lazy">
    <div class="card-body"><h3>${esc(dishName(c.dish, c.effect))}</h3>
      <div class="card-fx" data-fx="${esc(c.id)}">${summaryHtml(c)}</div>
      ${status}</div>
  </div>`;
}

// what the card's dish does: owned summary if the player can make it, general otherwise
function cardSummary(c) {
  return S.statuses.get(c.id)?.missing === 0 ? S.summaries.get(c.id) : S.generic.get(c.id);
}

// "3× Mariposa chimenea + 1× Lagarto humero"
function comboText(items) {
  const counts = new Map();
  for (const a of items) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts].map(([a, n]) => `${n}× ${itemName(a)}`).join(' + ');
}

function effectChip(effect, info, { compact = false } = {}) {
  const style = EFFECT_STYLE[effect] || { icon: '✦', color: 'var(--accent)' };
  let detail = '';
  if (effect === 'LifeMaxUp') detail = `+${info.extraHearts} ❤ ${t('extraHearts')}`;
  else if (effect === 'GutsRecover' || effect === 'ExGutsMaxUp') detail = info.stamina ? `+${info.stamina} ${t('wheels')}` : '';
  else {
    if (info.level) detail += levelMarks(info.level, effect);
    if (info.timeSec) detail += ` ⏱ ${Math.floor(info.timeSec / 60)}:${String(info.timeSec % 60).padStart(2, '0')}`;
  }
  if (compact && effect === 'LifeMaxUp') detail = `+${info.extraHearts} ❤`;
  else if (compact && info.level) {
    // cards: only the filled level marks and the time, the rest goes in the tooltip
    const time = info.timeSec ? ` ${Math.floor(info.timeSec / 60)}:${String(info.timeSec % 60).padStart(2, '0')}` : '';
    detail = `${maxLevel(effect) > 1 ? `<span class="level">${'◆'.repeat(info.level)}</span>` : ''}${time}`;
  }
  const numbers = [info.level ? `${t('level')} ${info.level}` : '', info.timeSec ? detail.split('⏱')[1]?.trim() : '', info.extraHearts ? `+${info.extraHearts} ❤` : '', info.stamina ? `+${info.stamina} ${t('wheels')}` : ''].filter(Boolean).join(' · ');
  const tip = `${effectName(effect)}${numbers ? ` · ${numbers}` : ''}${info.items ? `\n${comboText(info.items)}` : ''}`;
  return `<span class="fxchip ${compact ? 'compact' : ''}" style="--fx:${style.color}" title="${esc(tip)}"><span class="fxicon">${style.icon}</span>${compact ? '' : `<b>${esc(effectName(effect))}</b>`}${detail ? ` <span class="fxdetail">${detail}</span>` : ''}</span>`;
}

function summaryHtml(c) {
  const s = cardSummary(c);
  if (!s) return `<span class="hint">${t('computing')}</span>`;
  const bits = [];
  if (s.hpMax > 0) bits.push(`<span class="heart">❤ ${s.hpMin === s.hpMax ? heartsText(s.hpMax) : `${heartsText(s.hpMin)}–${heartsText(s.hpMax)}`}</span>`);
  if (s.priceMax) bits.push(`<span class="rupee">◈ ${t('upTo')} ${s.priceMax}</span>`);
  const effects = EFFECT_ORDER.filter((e) => s.effects[e]);
  const chips = effects.map((e) => effectChip(e, s.effects[e], { compact: true }));
  if (!effects.length) chips.push(`<span class="fxchip compact plain">${t('effectNone')}</span>`);
  return `<div class="card-stats">${bits.join('<span class="sep">·</span>')}</div><div class="fx-chips">${chips.join('')}</div>`;
}

// summaries are computed in small chunks after each load so the window never freezes
function computeSummaries() {
  const run = ++S.summaryRun;
  S.summaries = new Map();
  const queue = [...S.planner.cards].sort((a, b) => S.statuses.get(a.id).missing - S.statuses.get(b.id).missing);
  const step = () => {
    if (run !== S.summaryRun) return; // a newer load started
    const started = performance.now();
    while (queue.length && performance.now() - started < 12) {
      const c = queue.shift();
      if (S.statuses.get(c.id).missing === 0) S.summaries.set(c.id, S.planner.summary(c, S.inv));
      else if (!S.generic.has(c.id)) S.generic.set(c.id, S.planner.summary(c, S.planner.everything));
      const el = document.querySelector(`[data-fx="${CSS.escape(c.id)}"]`);
      if (el) el.innerHTML = summaryHtml(c);
    }
    if (queue.length) setTimeout(step, 0);
    else if (S.recipeEffect !== 'all' || S.recipeSort !== 'name') renderRecipes();
  };
  setTimeout(step, 0);
}

// ---------------------------------------------------------------- detail

function openDetail(id) {
  S.detail = { id, sort: S.settings.variationSort, shown: Number(S.settings.maxVariations) || 60, shownMissing: 12 };
  renderDetail();
}

// what fills a requirement group: the category for tag groups, the item for single-option groups
function groupLabel(card, g) {
  let label;
  if (g.tags?.length) {
    label = [...new Set(g.tags.map((tag) => TAG_CATEGORY[tag]).filter(Boolean))].map((c) => t(`categories.${c}`)).join(' / ') || t('oneOf');
    if (card.elixir && g.tags.includes('CookInsect')) label += ` · ${effectName(card.effect)}`;
  } else {
    label = g.options.length === 1 ? itemName(g.options[0]) : t('oneOf');
  }
  return g.single ? `${label} (×1-5)` : label;
}

function requirementsHtml(card) {
  const seen = new Set();
  const variants = [];
  for (const recipe of card.recipes) {
    const groups = S.planner.groups(card, recipe);
    const sig = groups.map((g) => [...g.options].sort().join(',')).sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const rows = groups.map((g) => {
      const opts = [...g.options].sort((a, b) => (S.inv[b] || 0) - (S.inv[a] || 0) || S.data.ingredients[a].sortKey - S.data.ingredients[b].sortKey);
      const shown = opts.slice(0, 36);
      return `<div class="req-group"><span class="label">${esc(groupLabel(card, g))}</span><div class="opt-list">${shown
        .map((a) => `<span class="opt ${S.inv[a] ? '' : 'no'}" data-tip="${a}"><img src="${icon(a)}" alt="">${S.inv[a] ? `<span class="qty">${S.inv[a]}</span>` : ''}</span>`)
        .join('')}${opts.length > shown.length ? `<span class="more">+${opts.length - shown.length}</span>` : ''}</div></div>`;
    });
    variants.push(`<div class="req-variant" data-or="${t('orElse')}">${rows.join('')}</div>`);
  }
  return `<div class="req">${variants.slice(0, 6).join('')}</div>`;
}

// "What it gives and how": per effect, the combination (with quantities) that gives the most of it
function givesHtml(card) {
  const canMake = S.statuses.get(card.id).missing === 0;
  if (!S.generic.has(card.id)) S.generic.set(card.id, S.planner.summary(card, S.planner.everything));
  const general = S.generic.get(card.id);
  const mine = canMake ? S.summaries.get(card.id) || S.planner.summary(card, S.inv) : null;
  const row = (label, info, lacking) => {
    const missing = info.items.filter((a) => !S.inv[a]);
    return `<div class="give ${lacking ? 'lacking' : ''}">
      <div class="give-what">${label}</div>
      <div class="give-combo">${comboNamesHtml(info.items, missing)}</div>
      <button class="btn small" data-action="to-pot" data-items="${info.items.join(',')}">${t('toPot')}</button>
    </div>`;
  };
  const rows = [];
  const other = [];
  for (const e of EFFECT_ORDER) {
    if (mine?.effects[e]) rows.push(row(effectChip(e, mine.effects[e]), mine.effects[e], false));
    else if (general.effects[e]) other.push(row(effectChip(e, general.effects[e]), general.effects[e], true));
  }
  const source = mine || general;
  if (source.best.hearts?.hp > 0) rows.push(row(`<span class="heart">❤ ${heartsText(source.best.hearts.hp)}</span> <span class="hint">${t('mostHearts')}</span>`, source.best.hearts, !mine));
  if (source.best.price) rows.push(row(`<span class="rupee">◈ ${source.best.price.price}</span> <span class="hint">${t('mostValuable')}</span>`, source.best.price, !mine));
  if (!rows.length && !other.length) return '';
  return `<h4>${t('whatItGives')}</h4><div class="gives">${rows.join('')}</div>
    ${other.length ? `<div class="count-line">${t('notInInventory')}</div><div class="gives">${other.join('')}</div>` : ''}`;
}

function comboNamesHtml(items, missing = []) {
  const counts = new Map();
  for (const a of items) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts]
    .map(([a, n]) => `<span class="ing named ${missing.includes(a) ? 'lack' : ''}" data-tip="${a}"><img src="${icon(a)}" alt=""><b>${n}×</b> ${esc(itemName(a))}</span>`)
    .join('<span class="plus">+</span>');
}

function variationRows(list) {
  return list
    .map((r) => `<div class="var ${r.missing.length ? 'missing' : ''}">
      <div class="combo">${comboHtml(r.items, r.missing)}</div>
      ${statsHtml(r)}
      <button class="btn small" data-action="to-pot" data-items="${r.items.join(',')}">${t('toPot')}</button>
    </div>`)
    .join('');
}

function renderDetail() {
  const d = S.detail;
  if (!d) {
    $('#modal-root').innerHTML = '';
    return;
  }
  const card = S.planner.cards.find((c) => c.id === d.id);
  const st = S.statuses.get(card.id);
  const desc = card.elixir ? effectDesc(card.effect, 1, true) : L().dishes[card.dish]?.desc;
  const owned = S.planner.variations(card, S.inv, { mode: 'owned', sort: d.sort, max: d.shown });
  const lacking = S.planner.variations(card, S.inv, { mode: 'missing', sort: d.sort, max: d.shownMissing });
  const sorts = [['price', t('sortPrice')], ['hearts', t('sortHearts')], ['time', t('sortTime')], ['fewer', t('sortFewer')]];
  $('#modal-root').innerHTML = `
    <div class="overlay" data-action="close-overlay">
      <div class="modal" role="dialog">
        <div class="modal-head">
          <img src="${dishIcon(card.dish, card.effect)}" alt="">
          <div>
            <h2>${esc(dishName(card.dish, card.effect))}</h2>
            <div class="status ${st.missing === 0 ? 'ok' : st.missing === 1 ? 'm1' : 'm2'}" style="font-weight:600">${st.missing === 0 ? `✓ ${t('canMake')}` : st.missing === 1 ? `${t('missingOne')}: ${esc(st.need.map(itemName).slice(0, 4).join(', '))}` : t('missingMany')}</div>
            <p class="desc">${esc(desc || '')}</p>
          </div>
          <button class="btn ghost" data-action="close-modal" title="${t('close')}">✕</button>
        </div>
        ${givesHtml(card)}
        <h4>${t('howToMake')}</h4>
        ${requirementsHtml(card)}
        <h4>${t('variations')}</h4>
        <div class="toolbar"><div class="seg">${sorts.map(([v, label]) => `<button class="${d.sort === v ? 'on' : ''}" data-action="var-sort" data-value="${v}">${label}</button>`).join('')}</div>
          <span class="count-line">${owned.total}${owned.truncated ? '+' : ''} ${t('combinations')}</span></div>
        <div class="var-list">${owned.list.length ? variationRows(owned.list) : `<div class="empty">${t('noVariations')}</div>`}</div>
        ${owned.total > owned.list.length ? `<div style="text-align:center;margin-top:10px"><button class="btn small" data-action="show-more">${t('showMore')}</button></div>` : ''}
        ${lacking.total ? `<h4>${t('variationsMissing')}</h4>
          <div class="var-list">${variationRows(lacking.list)}</div>
          ${lacking.total > lacking.list.length ? `<div style="text-align:center;margin-top:10px"><button class="btn small" data-action="show-more-missing">${t('showMore')}</button></div>` : ''}` : ''}
      </div>
    </div>`;
}

// ---------------------------------------------------------------- settings

function openSettings() {
  S.settingsOpen = true;
  renderSettings();
}

function renderSettings() {
  if (!S.settingsOpen) return;
  const st = S.settings;
  const slots = S.save?.slots || [];
  const opt = (value, current, label) => `<option value="${esc(value)}" ${String(current) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
  $('#modal-root').innerHTML = `
    <div class="overlay" data-action="close-overlay">
      <div class="modal" role="dialog" style="max-width:820px">
        <div class="modal-head" style="grid-template-columns:1fr auto"><h2>${t('settingsTitle')}</h2><button class="btn ghost" data-action="close-modal">✕</button></div>
        <div class="form">
          <section>
            <h3>${t('sectionSave')}</h3>
            <div class="row"><label>${t('savePath')}</label><input type="text" id="set-savePath" value="${esc(st.savePath)}" spellcheck="false"></div>
            <div class="row"><label></label>
              <button class="btn small" data-action="choose-folder">${t('chooseFolder')}</button>
              <button class="btn small" data-action="choose-file">${t('chooseFile')}</button>
              ${S.save?.file ? `<button class="btn small" data-action="reveal">${t('reveal')}</button>` : ''}
            </div>
            <div class="row"><label></label><span class="hint">${t('savePathHint')}</span></div>
            <div class="row"><label>${t('slot')}</label>
              <select data-setting="slot">${opt('auto', st.slot, t('slotAuto'))}${slots.map((s) => opt(s.label, st.slot, `${t('slot')} ${s.label} · ${new Date(s.mtime).toLocaleString(st.uiLanguage)}`)).join('')}</select></div>
            <div class="row"><label>${t('autoRefresh')}</label><input type="checkbox" data-setting="autoRefresh" ${st.autoRefresh ? 'checked' : ''}>
              <span class="hint">${t('every')}</span><input type="number" min="1" max="60" data-setting="pollSeconds" value="${st.pollSeconds}"><span class="hint">${t('seconds')}</span></div>
          </section>
          <section>
            <h3>${t('sectionView')}</h3>
            <div class="row"><label>${t('uiLanguage')}</label><select data-setting="uiLanguage">${availableLanguages().map((l) => opt(l.code, st.uiLanguage, l.name)).join('')}</select>
              ${S.homepage ? `<a class="hint" href="${esc(S.homepage)}/blob/main/CONTRIBUTING.md" target="_blank">${t('contribute')}</a>` : ''}</div>
            <div class="row"><label>${t('gameLanguage')}</label><select data-setting="gameLanguage">${Object.keys(S.data?.strings || {}).map((k) => opt(k, st.gameLanguage || (S.data.strings[st.uiLanguage] ? st.uiLanguage : 'en'), languageName(k))).join('')}</select></div>
            <div class="row"><label>${t('theme')}</label><select data-setting="theme">${opt('sheikah', st.theme, t('themeSheikah'))}${opt('parchment', st.theme, t('themeParchment'))}${opt('system', st.theme, t('themeSystem'))}</select></div>
            <div class="row"><label>${t('iconSize')}</label><input type="range" min="40" max="80" step="4" data-setting="iconSize" value="${st.iconSize}"></div>
            <div class="row"><label>${t('showRecipes')}</label><select data-setting="showRecipes">${opt('canMake', st.showRecipes, t('filterCanMake'))}${opt('missing1', st.showRecipes, t('filterMissing1'))}${opt('all', st.showRecipes, t('filterAll'))}</select></div>
            <div class="row"><label>${t('maxVariations')}</label><select data-setting="maxVariations">${[30, 60, 120, 250].map((n) => opt(n, st.maxVariations, n)).join('')}</select></div>
            <div class="row"><label>${t('hideJunk')}</label><input type="checkbox" data-setting="hideJunk" ${st.hideJunk ? 'checked' : ''}></div>
          </section>
          <section>
            <h3>${t('sectionData')}</h3>
            <div class="row"><label>${t('gameData')}</label><input type="text" value="${esc(st.gameDataPath || t('gameDataDefault'))}" readonly>
              <button class="btn small" data-action="choose-gamedata">${t('chooseGameData')}</button>
              ${st.gameDataPath ? `<button class="btn small" data-action="reset-gamedata">↺</button>` : ''}</div>
          </section>
        </div>
      </div>
    </div>`;
}

async function updateSettings(partial) {
  S.settings = await api.setSettings(partial);
  applyAppearance();
  if ('savePath' in partial || 'slot' in partial) await reloadSave(false);
  if ('gameDataPath' in partial) return location.reload();
  renderAll();
}

// ---------------------------------------------------------------- app

function applyAppearance() {
  setLanguage(S.settings.uiLanguage);
  document.documentElement.lang = S.settings.uiLanguage;
  document.title = t('appName');
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = S.settings.theme === 'system' ? (dark ? 'sheikah' : 'parchment') : S.settings.theme;
  document.body.style.setProperty('--icon', `${S.settings.iconSize}px`);
}

function renderAll() {
  renderTopbar();
  renderInventoryShell();
  renderInventory();
  renderPot();
  renderRecipesShell();
  renderRecipes();
  $('#footer').textContent = t('footer');
  if (S.settingsOpen) renderSettings();
  else renderDetail();
}

async function reloadSave(announce = true) {
  const btn = $('#reload-btn');
  btn?.classList.add('spin');
  setSave(await api.reload());
  renderAll();
  setTimeout(() => btn?.classList.remove('spin'), 600);
  if (announce && !S.save.error) toast(`${t('reloaded')} · ${t('slot')} ${S.save.slot} · ${timeAgo(S.save.mtime)}`);
}

function closeModal() {
  S.detail = null;
  S.settingsOpen = false;
  $('#modal-root').innerHTML = '';
}

function showTooltip(target, x, y) {
  const a = target.dataset.tip;
  const v = S.data.ingredients[a];
  const tip = $('#tooltip');
  if (!v) {
    tip.hidden = true;
    return;
  }
  const bits = [];
  if (v.hp) bits.push(`<span class="heart">❤ ${heartsText(v.hp)}</span>`);
  if (v.effect && v.effect !== 'None') bits.push(`<span class="effect-pill">${esc(effectName(v.effect))} +${v.potency}</span>`);
  if (v.timeBoost) bits.push(`<span>⏱ +${v.timeBoost}s</span>`);
  bits.push(`<span class="rupee">◈ ${v.sell}</span>`);
  tip.innerHTML = `<h5>${esc(itemName(a))}${S.inv[a] ? ` <span class="hint">×${S.inv[a]}</span>` : ''}</h5><div class="desc">${esc(itemDesc(a))}</div><div class="stats">${bits.join('')}</div>`;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(x + 14, window.innerWidth - r.width - 10)}px`;
  tip.style.top = `${Math.min(y + 16, window.innerHeight - r.height - 10)}px`;
}

function bindEvents() {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'close-overlay' && e.target !== el) return; // clicks inside the modal
    switch (action) {
      case 'reload': return reloadSave();
      case 'settings': return openSettings();
      case 'close-modal':
      case 'close-overlay': return closeModal();
      case 'inv-tab': S.invTab = el.dataset.tab; return renderInventory();
      case 'add':
        if (e.altKey || e.metaKey) {
          S.focus = S.focus === el.dataset.actor ? null : el.dataset.actor;
          renderInventory();
          return renderRecipes();
        }
        return addToPot(el.dataset.actor);
      case 'pot-remove': S.pot.splice(Number(el.dataset.index), 1); return renderPot();
      case 'pot-clear': S.pot = []; return renderPot();
      case 'filter': S.recipeFilter = el.dataset.value; return renderRecipes();
      case 'fx-filter': S.recipeEffect = S.recipeEffect === el.dataset.value ? 'all' : el.dataset.value; return renderRecipes();
      case 'kind': S.recipeKind = el.dataset.value; return renderRecipes();
      case 'clear-focus': S.focus = null; renderInventory(); return renderRecipes();
      case 'open-card': return openDetail(el.dataset.card);
      case 'var-sort': S.detail.sort = el.dataset.value; return renderDetail();
      case 'show-more': S.detail.shown *= 2; return renderDetail();
      case 'show-more-missing': S.detail.shownMissing *= 3; return renderDetail();
      case 'to-pot':
        S.pot = el.dataset.items.split(',');
        closeModal();
        renderPot();
        return $('#pot').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      case 'choose-folder':
      case 'choose-file': {
        const p = await api.chooseSave(action === 'choose-file' ? 'file' : 'folder');
        if (p) await updateSettings({ savePath: p, slot: 'auto' });
        return;
      }
      case 'reveal': return api.reveal();
      case 'choose-gamedata': {
        const p = await api.chooseGameData();
        if (p) await updateSettings({ gameDataPath: p });
        return;
      }
      case 'reset-gamedata': return updateSettings({ gameDataPath: '' });
      default:
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'inv-search') {
      S.invSearch = e.target.value;
      renderInventory();
    } else if (e.target.id === 'recipe-search') {
      S.recipeSearch = e.target.value;
      renderRecipes();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'recipe-sort') {
      S.recipeSort = e.target.value;
      return renderRecipes();
    }
    const key = e.target.dataset.setting;
    if (key) {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' || e.target.type === 'range' || key === 'maxVariations' ? Number(e.target.value) : e.target.value;
      updateSettings({ [key]: v });
    } else if (e.target.id === 'set-savePath') {
      updateSettings({ savePath: e.target.value.trim(), slot: 'auto' });
    }
  });
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) showTooltip(el, e.clientX, e.clientY);
    else $('#tooltip').hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      $('#recipe-search')?.focus();
    }
  });
  api.onSaveChanged((save) => {
    setSave(save);
    renderAll();
    if (!save.error) toast(`${t('reloaded')} · ${t('slot')} ${save.slot} · ${timeAgo(save.mtime)}`);
  });
  api.onMenu((action) => {
    if (action === 'reload') reloadSave();
    if (action === 'settings') openSettings();
    if (action === 'choose') api.chooseSave('folder').then((p) => p && updateSettings({ savePath: p, slot: 'auto' }));
  });
}

function renderBlocker(title, body, code) {
  $('#main').innerHTML = `<div class="panel blocker"><h2>${esc(title)}</h2><p>${esc(body)}</p>${code ? `<pre>${esc(code)}</pre>` : ''}
    <button class="btn" data-action="choose-gamedata">${t('chooseGameData')}</button></div>`;
}

async function boot() {
  const state = await api.getState();
  await loadLocales(state.locales);
  S.settings = state.settings;
  S.platform = state.platform;
  S.homepage = state.homepage;
  S.recipeFilter = S.settings.showRecipes;
  applyAppearance();
  bindEvents();
  if (!state.hasGameData) {
    renderTopbar();
    return renderBlocker(t('noDataTitle'), t('noDataBody'), `pip install -r tools/requirements.txt\nnpm run extract\n\n# ${state.gameDataDir}`);
  }
  S.data = await (await fetch('app://bundle/gamedata/data.json')).json();
  S.planner = new Planner(S.data);
  buildCardActors();
  setSave(state.save);
  renderAll();
  if (state.save.error === 'noPath') openSettings();
  if (state.demo) runDemo(state.demo);
}

// used by RECETARIO_DEMO for screenshots
function runDemo(demo) {
  if (demo.filter) S.recipeFilter = demo.filter;
  if (demo.kind) S.recipeKind = demo.kind;
  if (demo.effect) S.recipeEffect = demo.effect;
  if (demo.pot) S.pot = demo.pot;
  if (demo.focus) S.focus = demo.focus;
  renderAll();
  if (demo.open) openDetail(demo.open);
  if (demo.settings) openSettings();
  if (demo.scroll) setTimeout(() => $(demo.scroll)?.scrollIntoView(), 50);
}

boot();
