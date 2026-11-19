// Ember Isle — the gta6-01 entry program (Node 22, standard library only).
//
// The game lives in this directory's game/ folder as plain static files that
// a desktop browser loads offline: game/index.html plus its ES modules and
// the vendored Three.js file, with no network request at all. This program
// hands the game in by copying game/ and screenshots/ next to this file into
// /output and writing /output/dossier.json — the summary the judge reads —
// using the vendored make.fun library. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output, so a local run looks like:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), shotsDir, { recursive: true });
}

// The caps are the scorer's own (reference/gate.json): text_max_bytes is the
// only one that shapes the dossier's bytes; the rest refuse an entry the
// scorer would refuse — more than 4 screenshots or one over 256 KiB, more
// than 993 entries in game/ or 48 MiB of game files in all, or a path under
// game/ over 1000 bytes. game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json included.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`dossier written to ${join(outputDir, 'dossier.json')}`);
