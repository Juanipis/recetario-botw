// Checks the simulator against in-game cooking results collected by savage13
// (tests/fixtures/cooking-results.json, BSD 2-Clause, converted to internal
// item IDs). Needs gamedata/data.json (npm run extract); skipped without it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cooker } from '../src/shared/cooking.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, '../gamedata/data.json');
if (!fs.existsSync(dataFile)) {
  console.log('cooking: no gamedata/data.json (run npm run extract), skipped');
  process.exit(0);
}
const cooker = new Cooker(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
const expected = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/cooking-results.json'), 'utf8'));
const TIMED = ['ResistCold', 'DefenseUp', 'AttackUp', 'Fireproof', 'ResistHot', 'ResistElectric', 'Quietness', 'MovingSpeed'];

let ok = 0;
const fails = [];
for (const known of expected) {
  const r = cooker.cook(known.items);
  const problems = [];
  if (!r) {
    fails.push(`${known.items.join(', ')}: not cookable`);
    continue;
  }
  if (known.dish && r.dish !== known.dish) problems.push(`dish ${r.dish} != ${known.dish}`);
  if (known.recipe !== undefined && r.recipeIndex !== known.recipe) problems.push(`recipe ${r.recipeIndex} != ${known.recipe}`);
  if (known.price !== undefined && r.price !== known.price) problems.push(`price ${r.price} != ${known.price}`);
  if (r.hp !== known.hp) problems.push(`hp ${r.hp} != ${known.hp}`);
  if ((known.effect || 'None') !== (r.effect || 'None')) problems.push(`effect ${r.effect} != ${known.effect}`);
  if (known.effect === 'LifeMaxUp' && (r.potency !== known.potency || r.level !== known.level)) problems.push(`hearty ${r.potency}/${r.level} != ${known.potency}/${known.level}`);
  if (known.effect === 'GutsRecover' && r.stamina !== known.stamina) problems.push(`stamina ${r.stamina} != ${known.stamina}`);
  if (known.effect === 'ExGutsMaxUp' && r.staminaExtra !== known.staminaExtra) problems.push(`stamina extra ${r.staminaExtra} != ${known.staminaExtra}`);
  if (TIMED.includes(known.effect) && (r.potency !== known.potency || r.time !== known.time || r.level !== known.level)) {
    problems.push(`effect ${r.potency}/${r.time}/${r.level} != ${known.potency}/${known.time}/${known.level}`);
  }
  if (problems.length) fails.push(`${known.items.join(', ')} -> ${problems.join('; ')}`);
  else ok += 1;
}
console.log(`cooking: ${ok} ok, ${fails.length} failed`);
for (const f of fails.slice(0, 25)) console.log('  ' + f);
process.exit(fails.length ? 1 : 0);
