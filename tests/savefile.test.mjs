// Save reader tests: a synthetic save in both byte orders (always), plus a real
// save if one is given as argument or in RECETARIO_SAVE.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { parseSave, readSaveLocation, SaveError } from '../src/main/savefile.js';

const crc = (s) => zlib.crc32(Buffer.from(s, 'latin1')) >>> 0;

// builds a minimal game_data.sav: header, 0xFFFFFFFF, then (hash, value) pairs
function syntheticSave(items, littleEndian) {
  const entries = [[crc('CurrentRupee'), 573]];
  for (let i = 0; i < 420; i++) {
    const name = (items[i]?.[0] || '').padEnd(64, '\0');
    for (let j = 0; j < 16; j++) entries.push([crc('PorchItem'), Buffer.from(name.slice(j * 4, j * 4 + 4), 'latin1')]);
  }
  for (let i = 0; i < 420; i++) entries.push([crc('PorchItem_Value1'), items[i]?.[1] ?? 0]);
  const buf = Buffer.alloc(0x0c + entries.length * 8);
  buf.writeUInt32BE(0x471b, 0);
  buf.writeUInt32BE(0xffffffff, 4);
  entries.forEach(([hash, value], k) => {
    const off = 0x0c + k * 8;
    if (littleEndian) buf.writeUInt32LE(hash, off);
    else buf.writeUInt32BE(hash, off);
    if (Buffer.isBuffer(value)) {
      (littleEndian ? Buffer.from(value).reverse() : value).copy(buf, off + 4);
    } else if (littleEndian) buf.writeInt32LE(value, off + 4);
    else buf.writeInt32BE(value, off + 4);
  });
  return buf;
}

const items = [['Item_Fruit_A', 14], ['Animal_Insect_X', 3], ['Armor_001_Upper', -1]];
for (const le of [false, true]) {
  const save = parseSave(syntheticSave(items, le));
  assert.equal(save.platform, le ? 'switch' : 'wiiu');
  assert.deepEqual(save.items.map((i) => [i.actor, i.qty]), items);
  assert.equal(save.rupees, 573);
}
assert.throws(() => parseSave(Buffer.alloc(0x200)), (e) => e instanceof SaveError && e.code === 'notBotwSave');
console.log('savefile: synthetic Wii U and Switch saves ok');

const location = process.argv[2] || process.env.RECETARIO_SAVE;
if (location) {
  const s = readSaveLocation(location);
  const bad = s.items.filter((i) => !/^[A-Za-z0-9_]+$/.test(i.actor) || i.qty < -1); // armor reports -1
  console.log(`savefile: ${s.platform}, slot ${s.slot}, ${s.items.length} items, ${s.rupees} rupees, ${(s.playTime / 3600).toFixed(1)} h`);
  assert.equal(bad.length, 0, `odd items: ${JSON.stringify(bad.slice(0, 5))}`);
}
