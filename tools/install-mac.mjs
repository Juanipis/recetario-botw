// `npm run install:mac`: builds the app for this Mac's architecture, installs it
// in /Applications (or ~/Applications if that is not writable) and removes the
// build copy, so only one "Recetario BotW" exists.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanDist } from './clean-dist.mjs';

if (process.platform !== 'darwin') {
  console.error('install:mac only works on macOS');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const build = spawnSync('npx', ['electron-builder', '--mac', 'dir', `--${arch}`], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const outDir = path.join(root, 'dist', arch === 'arm64' ? 'mac-arm64' : 'mac');
const app = fs.readdirSync(outDir).find((f) => f.endsWith('.app'));
let target = path.join('/Applications', app);
try {
  fs.accessSync('/Applications', fs.constants.W_OK);
} catch {
  target = path.join(os.homedir(), 'Applications', app);
  fs.mkdirSync(path.dirname(target), { recursive: true });
}
if (spawnSync('pgrep', ['-f', `${target}/Contents/MacOS`]).status === 0) {
  console.error(`${app} is running: quit it and try again`);
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
const copy = spawnSync('ditto', [path.join(outDir, app), target], { stdio: 'inherit' });
if (copy.status !== 0) process.exit(copy.status ?? 1);
cleanDist();
console.log(`installed ${target}`);
