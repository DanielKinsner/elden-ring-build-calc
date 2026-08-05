/*
 * scripts/fill-weights.js — one-shot: fill missing `weight` fields in data/weapons/**.
 * Sources (downloaded to a local dir, checked in this order — later wins):
 *   1. api-weapons.json / api-shields.json — community ER API (deliton/eldenring-api,
 *      wiki-compiled, base game only) — fallback tier.
 *   2. EquipParamWeapon.param.xml + WeaponName.fmg.xml + WeaponName_dlc01.fmg.xml —
 *      DATAMINED game params v1.16 (hanslhansl/elden-ring-damage-optimizer xml_data/11611000).
 *      Authoritative; overrides the API values. Includes SotE.
 * Never overwrites an existing weight in our data.
 *
 * Usage: node scripts/fill-weights.js <src-dir> [--write]
 * Without --write it only reports what would change.
 */
'use strict';
var fs = require('fs'), path = require('path');

var srcDir = process.argv[2];
var WRITE = process.argv.indexOf('--write') >= 0;
if (!srcDir) { console.error('usage: node scripts/fill-weights.js <src-dir> [--write]'); process.exit(2); }

function norm(name) {
  return String(name).toLowerCase()
    .replace(/[’']/g, '')            // apostrophe variants
    .replace(/[éè]/g, 'e')           // Miséricorde / Épée
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// source map: normalized name -> weight
var srcMap = {};
['api-weapons.json', 'api-shields.json'].forEach(function (f) {
  var p = path.join(srcDir, f);
  if (!fs.existsSync(p)) return;
  var data = JSON.parse(fs.readFileSync(p, 'utf8'));
  (data.data || data).forEach(function (w) {
    if (w.name && w.weight != null) srcMap[norm(w.name)] = w.weight;
  });
});
console.log('API source entries: ' + Object.keys(srcMap).length);

// datamined params override the API tier: id -> name (both FMGs), id -> weight (param rows)
var paramPath = path.join(srcDir, 'EquipParamWeapon.param.xml');
if (fs.existsSync(paramPath)) {
  var names = {};
  ['WeaponName.fmg.xml', 'WeaponName_dlc01.fmg.xml'].forEach(function (f) {
    var p = path.join(srcDir, f);
    if (!fs.existsSync(p)) return;
    var xml = fs.readFileSync(p, 'utf8'), m;
    var re = /<text id="(\d+)">([^<]+)</g;
    while ((m = re.exec(xml))) { if (m[2] !== '[ERROR]') names[m[1]] = m[2]; }
  });
  var paramXml = fs.readFileSync(paramPath, 'utf8'), row;
  var rowRe = /<row id="(\d+)"[^>]*?\bweight="([\d.]+)"/g;
  var paramCount = 0;
  while ((row = rowRe.exec(paramXml))) {
    var name = names[row[1]];
    if (name) { srcMap[norm(name)] = parseFloat(row[2]); paramCount++; }
  }
  console.log('datamined param entries (override tier): ' + paramCount);
}

var dataDir = path.join(__dirname, '..', 'data', 'weapons');
var manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
var filled = 0, already = 0, unmatched = [];

[].concat(manifest.base || [], manifest.dlc || []).forEach(function (f) {
  var p = path.join(dataDir, f);
  var arr = JSON.parse(fs.readFileSync(p, 'utf8'));
  var changed = false;
  arr.forEach(function (w) {
    if (w.weight != null) { already++; return; }
    var hit = srcMap[norm(w.name)];
    if (hit != null) {
      w.weight = hit; filled++; changed = true;
      console.log('  fill ' + w.name + ' = ' + hit);
    } else {
      unmatched.push(f + ' :: ' + w.name);
    }
  });
  if (changed && WRITE) fs.writeFileSync(p, JSON.stringify(arr, null, 2) + '\n');
});

console.log('\nhad weight: ' + already + ' · filled: ' + filled + ' · still missing: ' + unmatched.length);
if (unmatched.length) console.log(unmatched.join('\n'));
if (!WRITE) console.log('\n(dry run — pass --write to apply)');
