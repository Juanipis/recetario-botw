// Removes the unpacked macOS apps electron-builder leaves in dist/mac*/ (the zips
// stay), so Spotlight and "Open With" do not list extra copies of the app.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export function cleanDist() {
  if (!fs.existsSync(dist)) return;
  for (const dir of fs.readdirSync(dist).filter((d) => /^mac(-\w+)?$/.test(d))) {
    const full = path.join(dist, dir);
    for (const app of fs.readdirSync(full).filter((f) => f.endsWith('.app'))) {
      if (process.platform === 'darwin' && fs.existsSync(LSREGISTER)) spawnSync(LSREGISTER, ['-u', path.join(full, app)]);
    }
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`removed dist/${dir}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) cleanDist();
