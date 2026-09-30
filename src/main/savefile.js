// Reader for BotW's game_data.sav (Wii U big-endian and Switch little-endian).
//
// The file is a flat list of (u32 crc32(flag name), u32 value) pairs starting
// at 0x0C. String arrays such as PorchItem store 4 characters per entry, 16
// entries per string64 (0x80 bytes per element).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const crc = (s) => zlib.crc32(Buffer.from(s, 'latin1')) >>> 0;
const HASH = {
  items: crc('PorchItem'),
  quantities: crc('PorchItem_Value1'),
  rupees: crc('CurrentRupee'),
  playTime: 0x73c29681, // seconds played; the flag name is not known
};
const MAX_ITEMS = 420;

// errors carry a code the page translates (errors.<code> in src/locales)
export class SaveError extends Error {
  constructor(code, vars = {}) {
    super(code);
    this.code = code;
    this.vars = vars;
  }
}
const STRING64 = 0x80;

function findHash(buf, readU32, hash) {
  for (let off = 0x0c; off + 8 <= buf.length; off += 8) {
    if (readU32(off) === hash) return off;
  }
  return -1;
}

export function parseSave(buf) {
  if (buf.length < 0x100 || buf.readUInt32BE(4) !== 0xffffffff) throw new SaveError('notBotwSave');
  // the platform is whichever byte order finds the inventory
  let readU32 = (o) => buf.readUInt32BE(o);
  let readI32 = (o) => buf.readInt32BE(o);
  let platform = 'wiiu';
  let itemsOff = findHash(buf, readU32, HASH.items);
  if (itemsOff < 0) {
    readU32 = (o) => buf.readUInt32LE(o);
    readI32 = (o) => buf.readInt32LE(o);
    platform = 'switch';
    itemsOff = findHash(buf, readU32, HASH.items);
  }
  if (itemsOff < 0) throw new SaveError('noInventory');
  const qtyOff = findHash(buf, readU32, HASH.quantities);
  const value = (hash) => {
    const o = findHash(buf, readU32, hash);
    return o < 0 ? undefined : readU32(o + 4);
  };

  const items = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    let name = '';
    for (let j = 0; j < 16; j++) {
      const o = itemsOff + 4 + i * STRING64 + j * 8;
      const chunk = platform === 'wiiu' ? buf.subarray(o, o + 4) : Buffer.from(buf.subarray(o, o + 4)).reverse();
      name += chunk.toString('latin1');
    }
    name = name.split('\0')[0];
    if (!name) break;
    const qty = qtyOff < 0 ? 1 : readI32(qtyOff + 4 + i * 8);
    items.push({ actor: name, qty });
  }
  return {
    platform,
    header: readU32(0),
    items,
    rupees: value(HASH.rupees),
    playTime: value(HASH.playTime),
  };
}

// A save location can be the game_data.sav itself, one slot folder, or the
// folder with the slots (0..5 on Wii U). Returns the slots found, newest first.
export function listSlots(location) {
  if (!location || !fs.existsSync(location)) return [];
  const stat = fs.statSync(location);
  const slotOf = (file, label) => ({ label, file, mtime: fs.statSync(file).mtimeMs });
  if (stat.isFile()) return [slotOf(location, path.basename(path.dirname(location)))];
  const direct = path.join(location, 'game_data.sav');
  if (fs.existsSync(direct)) return [slotOf(direct, path.basename(location))];
  const slots = [];
  for (const entry of fs.readdirSync(location, { withFileTypes: true })) {
    const f = path.join(location, entry.name, 'game_data.sav');
    if (entry.isDirectory() && fs.existsSync(f)) slots.push(slotOf(f, entry.name));
  }
  return slots.sort((a, b) => b.mtime - a.mtime);
}

export function readSaveLocation(location, slot = 'auto') {
  const slots = listSlots(location);
  if (!slots.length) throw new SaveError('noSaveFound');
  const chosen = slot === 'auto' ? slots[0] : slots.find((s) => s.label === String(slot));
  if (!chosen) throw new SaveError('slotMissing', { slot });
  const save = parseSave(fs.readFileSync(chosen.file));
  return { ...save, slot: chosen.label, file: chosen.file, mtime: chosen.mtime, slots: slots.map(({ label, mtime }) => ({ label, mtime })) };
}
