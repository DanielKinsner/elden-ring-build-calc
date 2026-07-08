/*
 * match-icons.js — dry-run matcher: compares our weapon dataset against the wiki.gg icon index
 * (scripts/wiki-icon-index.json) and reports hits/misses without downloading anything.
 * Usage: node scripts/match-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const INDEX_PATH = process.argv[2] || path.resolve(__dirname, 'wiki-icon-index.json');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'weapons', 'manifest.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

// normalize a wiki filename -> bare display name, e.g. "ER_Icon_weapon_Main-gauche.png" -> "main gauche"
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

const byNorm = new Map();
for (const filename of index) {
  byNorm.set(normalize(filename), filename);
}

const files = [].concat(manifest.base, manifest.dlc);
let hit = 0, miss = 0;
const misses = [];
for (const rel of files) {
  const weapons = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'weapons', rel), 'utf8'));
  for (const w of weapons) {
    const n = normalize(w.name);
    if (byNorm.has(n)) hit++;
    else { miss++; misses.push({ id: w.id, name: w.name, type: w.type, file: rel }); }
  }
}
console.log('HIT:', hit, 'MISS:', miss, 'TOTAL:', hit + miss);
console.log(JSON.stringify(misses, null, 1));
