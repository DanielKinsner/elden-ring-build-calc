/*
 * tests/engine.test.js — golden regression pins for the engine math.
 * Run: node tests/engine.test.js   (no deps, no framework — exit 0 = green)
 *
 * These are REGRESSION pins, not fresh validation: the library-build AR values are
 * frozen from engine output that was previously hand-verified in-game (commit 885a57f);
 * formula pins (scadutree, status procs) are computed independently from the documented
 * formulas in docs/01-damage-formula.md and the wiki-confirmed proc numbers.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ERCalc = require('../src/engine.js');

var failures = 0, passes = 0;
function check(name, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passes++; console.log('  ✓ ' + name); }
  else {
    failures++;
    console.log('  ✗ ' + name + '\n      expected ' + JSON.stringify(expected) + '\n      got      ' + JSON.stringify(actual));
  }
}
function approx(name, actual, expected, eps) {
  var ok = Math.abs(actual - expected) <= (eps == null ? 0.001 : eps);
  if (ok) { passes++; console.log('  ✓ ' + name); }
  else { failures++; console.log('  ✗ ' + name + ' — expected ~' + expected + ', got ' + actual); }
}

// Load all weapons from disk exactly like src/data-loader.js does (manifest -> bare arrays;
// each entry already carries its own `source` field in the data).
function loadWeapons() {
  var dataDir = path.join(__dirname, '..', 'data', 'weapons');
  var manifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'manifest.json'), 'utf8'));
  var files = [].concat(manifest.base || [], manifest.dlc || []);
  var all = [];
  files.forEach(function (f) {
    var arr = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    if (Array.isArray(arr)) all = all.concat(arr);
  });
  return all;
}

var weapons = loadWeapons();
function byId(id) { return weapons.find(function (w) { return w.id === id; }); }

check('weapon dataset loads (400+)', weapons.length > 400, true);

/* ---- library builds: AR frozen 2026-08-05 from previously in-game-verified output ---- */
console.log('library builds:');
var FROZEN_AR = {
  'Vera Aletheia': 644,
  'Quality': 583,
  'Dex Faith': 651,
  'Arcane Bleed': 649,
  'Moonveil Assassin': 659,
  'Blasphemous Faith': 735,
  'Colossal Crusher': 928,
  'Scarlet Bloom': 624,
  'Blood Lord': 679,
  'Dark Moon Mage': 750
};
var presetFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'presets.json'), 'utf8'));
var presets = (presetFile.presets || presetFile).filter(function (p) { return p.loadout && p.loadout.weaponId; });
presets.forEach(function (p) {
  var w = byId(p.loadout.weaponId);
  if (!w) { failures++; console.log('  ✗ preset weapon missing: ' + p.loadout.weaponId); return; }
  var r = ERCalc.computeAR(p.stats, w, {
    twoHanded: !!p.twoHanded,
    affinity: p.loadout.affinity,
    upgradeLevel: p.loadout.upgradeLevel
  });
  if (FROZEN_AR[p.name] == null) { console.log('  ○ FREEZE ME: "' + p.name + '": ' + r.totalAR + ','); failures++; return; }
  check(p.name + ' AR', r.totalAR, FROZEN_AR[p.name]);
});

/* ---- two-handing: 14 STR wields a 20-STR weapon two-handed [CONFIRMED in-game] ---- */
console.log('two-handing:');
var str20 = weapons.find(function (w) { return w.requirements && w.requirements.STR === 20; });
check('found a STR-20 weapon (' + (str20 && str20.id) + ')', !!str20, true);
if (str20) {
  var b14 = { STR: 14, DEX: 99, INT: 99, FAI: 99, ARC: 99 }; // other reqs safely met
  check('14 STR + 2H meets STR 20', ERCalc.computeAR(b14, str20, { twoHanded: true }).unmetReqs.some(function (u) { return u.stat === 'STR'; }), false);
  check('14 STR + 1H fails STR 20', ERCalc.computeAR(b14, str20, { twoHanded: false }).unmetReqs.some(function (u) { return u.stat === 'STR'; }), true);
}

/* ---- flooring invariant: totalAR = sum of per-type floors, <= exact total ---- */
console.log('flooring:');
var rob = byId('rivers-of-blood');
var vera = { VIG: 60, MND: 20, END: 30, STR: 24, DEX: 58, INT: 9, FAI: 15, ARC: 40 };
var fr = ERCalc.computeAR(vera, rob, { twoHanded: true });
var floorSum = 0;
for (var ft in fr.byType) floorSum += fr.byType[ft];
check('totalAR === sum(floored byType)', fr.totalAR, floorSum);
check('totalAR <= totalARExact', fr.totalAR <= fr.totalARExact, true);

/* ---- scadutree: dealt x(1+0.05L), taken reciprocal, clamped 0-20 ---- */
console.log('scadutree:');
check('L0 attack', ERCalc.scadutree(0).attack, 1);
check('L10 attack', ERCalc.scadutree(10).attack, 1.5);
approx('L10 taken', ERCalc.scadutree(10).taken, 1 / 1.5);
check('L20 attack', ERCalc.scadutree(20).attack, 2);
check('L20 taken', ERCalc.scadutree(20).taken, 0.5);
check('L25 clamps to 20', ERCalc.scadutree(25).level, 20);
check('L-3 clamps to 0', ERCalc.scadutree(-3).level, 0);

/* ---- status proc payloads [CONFIRMED wiki.gg + Fextralife 2026-07] ---- */
console.log('status payloads:');
var tgt = { maxHP: 2000, resist: 250 };
check('bleed 100/hit → 3 hits', ERCalc.statusPayload(100, 'bleed', tgt).hitsToProc, 3);
check('bleed proc @2000HP = 400', ERCalc.statusPayload(100, 'bleed', tgt).procDamage, 400);          // 2000*0.15+100
check('bleed boss+enhanced = 410', ERCalc.statusPayload(100, 'bleed', { maxHP: 2000, resist: 250, boss: true, enhanced: true }).procDamage, 410); // 2000*0.105+200
check('frost proc @2000HP = 230', ERCalc.statusPayload(100, 'frost', tgt).procDamage, 230);          // 2000*0.10+30
check('poison total = 756', ERCalc.statusPayload(100, 'poison', tgt).procDamage, 756);               // (2000*0.0007+7)*90
check('rot dps = 18.6', ERCalc.statusPayload(100, 'rot', tgt).dps, 18.6);                            // 2000*0.0018+15

/* ---- buff layer: mult applies per-type on the exact values, then floors ---- */
console.log('buff layer:');
var buffed = ERCalc.computeARBuffed(vera, rob, { twoHanded: true }, [{ mult: { all: 1.2 } }]);
var expect = 0;
for (var bt in buffed.byTypeExact) { var v = buffed.byTypeExact[bt] * 1.2; if (v > 0) expect += Math.floor(v); }
check('x1.2 all-type buff', buffed.buffed.totalAR, expect);
var soreseal = ERCalc.computeARBuffed(vera, rob, { twoHanded: true }, [{ statBonus: { STR: 5, DEX: 5 } }]);
check('soreseal raises AR', soreseal.totalAR > fr.totalAR, true);

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
