// `npm run extract [-- --base … --update … --dlc …]`: runs tools/extract_gamedata.py
// with the first Python that has oead and Pillow (a local .venv first).
// Without arguments it reads the folders from extract.local.json (not committed):
//   { "base": "…/content", "update": "…/content", "dlc": "…/content" }
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const candidates = [
  path.join(root, '.venv', win ? 'Scripts/python.exe' : 'bin/python'),
  ...(win ? ['py', 'python'] : ['python3.12', 'python3.11', 'python3', 'python']),
];

const python = candidates.find((py) => {
  if (py.includes(path.sep) && !fs.existsSync(py)) return false;
  return spawnSync(py, ['-c', 'import oead, PIL'], { stdio: 'ignore' }).status === 0;
});
if (!python) {
  console.error('No Python with oead and Pillow found. Create the environment with:');
  console.error(win ? '  py -3.12 -m venv .venv && .venv\\Scripts\\pip install -r tools/requirements.txt'
    : '  python3.12 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt');
  process.exit(1);
}

let args = process.argv.slice(2);
const local = path.join(root, 'extract.local.json');
if (!args.length && fs.existsSync(local)) {
  const cfg = JSON.parse(fs.readFileSync(local, 'utf8'));
  args = ['base', 'update', 'dlc'].filter((k) => cfg[k]).flatMap((k) => [`--${k}`, cfg[k]]);
}
if (!args.length) {
  console.error('Tell me where the game folders are, either as arguments:');
  console.error('  npm run extract -- --base <content> --update <content> --dlc <content>');
  console.error('or in extract.local.json: { "base": "…", "update": "…", "dlc": "…" }');
  process.exit(1);
}
const result = spawnSync(python, [path.join(root, 'tools', 'extract_gamedata.py'), ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
