// Entry point for the make.fun program/v1 submission: copies game/ and
// screenshots/ into the output directory and writes dossier.json with the
// kit's buildDossier — the summary the judge reads. Run from the repository
// root as:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);

// A short report for the builder: file counts and sizes.
let gameFiles = 0;
let gameBytes = 0;
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else {
      gameFiles += 1;
      gameBytes += statSync(path).size;
    }
  }
})(join(out, 'game'));
const shots = readdirSync(join(out, 'screenshots')).filter((name) => !name.startsWith('.'));
let shotBytes = 0;
for (const name of shots) shotBytes += statSync(join(out, 'screenshots', name)).size;
console.log(`dossier written: ${gameFiles} game files, ${gameBytes} bytes; ${shots.length} screenshots, ${shotBytes} bytes`);
