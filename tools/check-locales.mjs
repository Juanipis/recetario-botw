// Validates src/locales/*.json against en.json (the reference).
//   errors (exit 1): invalid JSON, _meta missing or not matching the file name,
//                    keys that do not exist in en.json, {placeholders} that differ
//   warnings:        keys not translated yet (the app falls back to English)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
  if (k === '_meta') return [];
  const key = prefix ? `${prefix}.${k}` : k;
  return v && typeof v === 'object' ? flatten(v, key) : [[key, v]];
});
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const reference = new Map(flatten(JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'))));
let errors = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const code = path.basename(file, '.json');
  let json;
  try {
    json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    console.log(`✗ ${file}: invalid JSON (${e.message})`);
    errors++;
    continue;
  }
  const problems = [];
  if (json._meta?.code !== code || !json._meta?.name) problems.push('_meta needs "code" equal to the file name and a "name"');
  const keys = new Map(flatten(json));
  for (const [key, value] of keys) {
    if (!reference.has(key)) problems.push(`unknown key "${key}"`);
    else if (placeholders(value) !== placeholders(reference.get(key))) problems.push(`"${key}" must keep the placeholders {${placeholders(reference.get(key))}}`);
  }
  const missing = [...reference.keys()].filter((k) => !keys.has(k));
  errors += problems.length;
  const status = problems.length ? '✗' : '✓';
  console.log(`${status} ${file} (${json._meta?.name || '?'}): ${keys.size}/${reference.size} keys${missing.length ? `, ${missing.length} not translated yet` : ''}`);
  for (const p of problems) console.log(`    error: ${p}`);
  if (missing.length && missing.length <= 15) console.log(`    missing: ${missing.join(', ')}`);
}
process.exit(errors ? 1 : 0);
