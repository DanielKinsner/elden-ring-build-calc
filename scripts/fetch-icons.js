/*
 * fetch-icons.js — download weapon icon thumbnails from wiki.gg (Eldenpedia), saved locally
 * keyed by our own weapon `id` slug. Self-hosted on purpose — never hotlinked at runtime.
 *
 * Matches by normalized display name against a pre-built wiki image index (see
 * scripts/build-icon-index.js), since wiki.gg mixes ER_Icon_weapon_/ER_Icon_Weapon_/
 * ER_Icon_shield_/ER_Icon_Shield_ capitalization inconsistently.
 *
 * Usage: node scripts/fetch-icons.js <icon-index.json>
 * Downloads every matched weapon across the whole dataset (skips already-downloaded files),
 * rate-limited to 1 req/sec. Prints a per-type-file summary + a list of unmatched weapons.
 *
 * Source: https://eldenring.wiki.gg — CC BY-SA 4.0 compilation license (see README credit).
 * Non-commercial fan use; game assets are FromSoftware / Bandai Namco property.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RATE_LIMIT_MS = 1000;
const USER_AGENT = 'elden-ring-build-calc icon fetch (contact: dannytownkins@gmail.com)';
const OUT_DIR = path.resolve(__dirname, '..', 'assets', 'icons', 'weapons');
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'weapons');

function normalize(s) {
  return s
    .replace(/^ER_Icon_(weapon|Weapon|shield|Shield)_/, '')
    .replace(/\.png$/i, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function thumbUrl(filename) {
  const enc = encodeURIComponent(filename);
  return `https://eldenring.wiki.gg/images/thumb/${enc}/128px-${enc}`;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const indexPath = process.argv[2];
  if (!indexPath) { console.error('usage: node fetch-icons.js <icon-index.json>'); process.exit(1); }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const byNorm = new Map();
  for (const filename of index) byNorm.set(normalize(filename), filename);

  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'manifest.json'), 'utf8'));
  const files = [].concat(manifest.base, manifest.dlc);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const perFile = {};
  const unmatched = [];
  let downloaded = 0, skippedExisting = 0, failed = 0;

  for (const rel of files) {
    const weapons = JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
    perFile[rel] = { ok: [], failed: [] };
    for (const w of weapons) {
      const dest = path.join(OUT_DIR, w.id + '.png');
      if (fs.existsSync(dest)) { skippedExisting++; perFile[rel].ok.push(w.id); continue; }
      const norm = normalize(w.name);
      const wikiFile = byNorm.get(norm);
      if (!wikiFile) { unmatched.push({ id: w.id, name: w.name, file: rel }); continue; }
      const url = thumbUrl(wikiFile);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(dest, buf);
          downloaded++;
          perFile[rel].ok.push(w.id);
        } else {
          failed++;
          perFile[rel].failed.push({ id: w.id, status: res.status });
        }
      } catch (e) {
        failed++;
        perFile[rel].failed.push({ id: w.id, error: e.message });
      }
      await sleep(RATE_LIMIT_MS);
    }
    console.log(`[${rel}] ok=${perFile[rel].ok.length} failed=${perFile[rel].failed.length}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log('downloaded:', downloaded, 'skippedExisting:', skippedExisting, 'failed:', failed, 'unmatched:', unmatched.length);
  fs.writeFileSync(path.join(__dirname, 'icon-fetch-report.json'), JSON.stringify({ perFile, unmatched }, null, 1));
  console.log('full report: scripts/icon-fetch-report.json');
}

main();
