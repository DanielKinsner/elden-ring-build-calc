/*
 * validate-acquisition.js — referential integrity check for data/acquisition/*.json
 * against the weapon dataset (data/weapons/). See docs/05-acquisition-data.md.
 *
 * Usage: node scripts/validate-acquisition.js
 * Exits nonzero (and lists errors) if anything fails.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const ACQ_DIR = path.join(DATA_DIR, 'acquisition');
const SOURCE_TYPES = ['boss', 'enemy', 'chest', 'npc', 'merchant', 'drop'];
const SCHEMA_FIELDS = ['location', 'region', 'mapPin', 'source', 'tactics', 'nearbyGraces', 'lore', 'builds'];

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'weapons', 'manifest.json'), 'utf8'));
  const weaponIds = new Set();
  for (const rel of [].concat(manifest.base, manifest.dlc)) {
    const weapons = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'weapons', rel), 'utf8'));
    for (const w of weapons) weaponIds.add(w.id);
  }

  const errors = [];
  if (!fs.existsSync(ACQ_DIR)) { console.log('No data/acquisition/ directory yet — nothing to validate.'); return; }
  const files = fs.readdirSync(ACQ_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    const full = path.join(ACQ_DIR, file);
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      errors.push(`${file}: invalid JSON — ${e.message}`);
      continue;
    }
    if (!weaponIds.has(id)) errors.push(`${file}: id "${id}" does not match any weapon in data/weapons/`);
    if (entry.source && entry.source.type && SOURCE_TYPES.indexOf(entry.source.type) < 0) {
      errors.push(`${file}: source.type "${entry.source.type}" not in [${SOURCE_TYPES.join(', ')}]`);
    }
    if (entry.nearbyGraces && entry.nearbyGraces.length > 3) {
      errors.push(`${file}: nearbyGraces has ${entry.nearbyGraces.length} entries, max is 3`);
    }
    if (entry._verify) {
      for (const f of entry._verify) {
        if (SCHEMA_FIELDS.indexOf(f) < 0) errors.push(`${file}: _verify names unknown field "${f}"`);
      }
    }
  }

  console.log(`Checked ${files.length} acquisition file(s) against ${weaponIds.size} weapons.`);
  if (errors.length) {
    console.error('\nERRORS:');
    errors.forEach(e => console.error(' - ' + e));
    process.exit(1);
  }
  console.log('OK — no referential integrity errors.');
}

main();
