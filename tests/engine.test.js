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

/* ---- survival: stat tables [CONFIRMED wiki.gg + Fextralife 2026-08] + roll brackets ---- */
console.log('survival:');
check('HP @ VIG 40', ERCalc.statEffects({ VIG: 40 }).hp, 1450);
check('HP @ VIG 60', ERCalc.statEffects({ VIG: 60 }).hp, 1900);
check('HP @ VIG 99', ERCalc.statEffects({ VIG: 99 }).hp, 2100);
check('FP @ MND 40', ERCalc.statEffects({ MND: 40 }).fp, 235);
check('FP @ MND 60', ERCalc.statEffects({ MND: 60 }).fp, 350);
check('FP @ MND 99', ERCalc.statEffects({ MND: 99 }).fp, 450);
check('stamina @ END 20/40/60', [20, 40, 60].map(function (e) { return ERCalc.statEffects({ END: e }).stamina; }), [113, 142, 158]);
check('equip load @ END 20/40/60', [20, 40, 60].map(function (e) { return ERCalc.statEffects({ END: e }).equipLoad; }), [64.1, 90.9, 120]);
check('stats clamp (VIG 0 → level 1)', ERCalc.statEffects({}).hp, 300);

check('29.9/100 light', ERCalc.rollState(29.9, 100).state, 'light');
check('30/100 medium (strict <)', ERCalc.rollState(30, 100).state, 'medium');
check('69.9/100 medium', ERCalc.rollState(69.9, 100).state, 'medium');
check('70/100 heavy', ERCalc.rollState(70, 100).state, 'heavy');
check('100/100 heavy', ERCalc.rollState(100, 100).state, 'heavy');
check('100.1/100 overloaded', ERCalc.rollState(100.1, 100).state, 'overloaded');
check('overloaded headroom negative', ERCalc.rollState(110, 100).headroom, -10);
check('medium headroom to 70%', ERCalc.rollState(30, 100).headroom, 40);

/* ---- armor: v1.16 corpus shape + multiplicative negation / additive resistance ---- */
console.log('armor:');
var armorFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'armor.json'), 'utf8'));
var armor = armorFile.items;
check('armor corpus version', armorFile.gameVersion, '1.16');
check('armor corpus loads (700+)', armor.length >= 700, true);
check('armor slot counts', [
  armor.filter(function (x) { return x.slot === 'head'; }).length,
  armor.filter(function (x) { return x.slot === 'body'; }).length,
  armor.filter(function (x) { return x.slot === 'arms'; }).length,
  armor.filter(function (x) { return x.slot === 'legs'; }).length
], [207,245,119,133]);
var ironScale = ['40000','40100','40200','40300'].map(function (id) {
  return armor.find(function (x) { return x.id === id; });
});
var armorTotal = ERCalc.aggregateArmor(ironScale);
check('four-piece weight / poise', [armorTotal.weight, armorTotal.poise], [21,39]);
check('four-piece physical negation is multiplicative', armorTotal.negation.physical, 23.5);
check('four-piece elemental negation', [armorTotal.negation.magic, armorTotal.negation.fire, armorTotal.negation.lightning, armorTotal.negation.holy], [15.8,20.2,13.3,16.5]);
check('four-piece resistances are additive', armorTotal.resistance, { immunity:61, robustness:108, focus:36, vitality:40 });
check('empty armor is neutral', ERCalc.aggregateArmor([]), {
  weight:0, poise:0,
  negation:{ physical:0, strike:0, slash:0, pierce:0, magic:0, fire:0, lightning:0, holy:0 },
  resistance:{ immunity:0, robustness:0, focus:0, vitality:0 }
});

// soreseal path: caller passes boosted stats (same as AR flow)
check('boosted VIG 35+5 === VIG 40', ERCalc.statEffects({ VIG: 40 }).hp, ERCalc.statEffects({ VIG: 35 + 5 }).hp);
// Great-Jar's Arsenal: x1.19 equip load on top of the table
check('Great-Jar @ END 20', ERCalc.statEffects({ END: 20 }, [{ survival: { equipLoadMult: 1.19 } }]).equipLoad, Math.round(64.1 * 1.19 * 10) / 10);
// Erdtree's Favor +2 does not change AR (no mult/statBonus fields)
var efMod = { survival: { hpMult: 1.04, staminaMult: 1.10, equipLoadMult: 1.08 } };
check('Erdtree Favor leaves AR alone', ERCalc.computeARBuffed(vera, rob, { twoHanded: true }, [efMod]).buffed.totalAR, fr.totalAR);
check('Erdtree Favor HP @ VIG 60', ERCalc.statEffects({ VIG: 60 }, [efMod]).hp, Math.floor(1900 * 1.04));

/* ---- Physick + Great Runes: complete loadout catalog and supported live effects ---- */
console.log('Physick and Great Runes:');
var rites = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'rites.json'), 'utf8'));
check('complete unique rite catalog', [rites.physick.length, rites.greatRunes.length, new Set(rites.physick.map(function (x) { return x.id; })).size, new Set(rites.greatRunes.map(function (x) { return x.id; })).size], [37,6,37,6]);
function rite(id) { return rites.physick.concat(rites.greatRunes).find(function (item) { return item.id === id; }); }
var godrick = rite('godricks-great-rune');
check('Godrick applies all eight attributes', Object.keys(godrick.statBonus).map(function (key) { return godrick.statBonus[key]; }), [5,5,5,5,5,5,5,5]);
check('Godrick changes live weapon output', ERCalc.computeARBuffed(vera, rob, { twoHanded:true }, [godrick]).buffed.totalAR > fr.totalAR, true);
var radahn = rite('radahns-great-rune'), unrunedSurvival = ERCalc.statEffects(vera), runedSurvival = ERCalc.statEffects(vera, [radahn]);
check('Radahn raises all three survival pools 15%', [runedSurvival.hp,runedSurvival.fp,runedSurvival.stamina], [Math.floor(unrunedSurvival.hp*1.15),Math.floor(unrunedSurvival.fp*1.15),Math.floor(unrunedSurvival.stamina*1.15)]);
check('Morgott raises maximum HP 25%', ERCalc.statEffects(vera, [rite('morgotts-great-rune')]).hp, Math.floor(unrunedSurvival.hp * 1.25));
check('Winged Crystal Tear multiplies equip load 5.5×', ERCalc.statEffects(vera, [rite('winged-crystal-tear')]).equipLoad, Math.round(unrunedSurvival.equipLoad * 5.5 * 10) / 10);
check('Opaline Hardtear switches PvE/PvP negation', [ERCalc.aggregateDefense(null,[rite('opaline-hardtear')],'pve').negation.physical,ERCalc.aggregateDefense(null,[rite('opaline-hardtear')],'pvp').negation.physical], [15,10]);
check('Speckled Hardtear adds all four resistances', ERCalc.aggregateResistance(null,[rite('speckled-hardtear')]), {immunity:90,robustness:90,focus:90,vitality:90});
var flamePve = ERCalc.resolveAttackEffects([rite('flame-shrouding-tear')], { combatContext:'pve', profileId:'neutral', tags:[], state:{} });
var flamePvp = ERCalc.resolveAttackEffects([rite('flame-shrouding-tear')], { combatContext:'pvp', profileId:'neutral', tags:[], state:{} });
check('shrouding tear preserves separate PvE/PvP values', [flamePve.mods[0].mult.fire,flamePvp.mods[0].mult.fire], [1.2,1.125]);

/* ---- talisman equipment: positional state, conditional gates, conflicts, defense ---- */
console.log('talisman effects:');
var talismanFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'talismans.json'), 'utf8'));
var talismans = talismanFile.items;
var attackProfileFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'attack-profiles.json'), 'utf8'));
var attackProfiles = attackProfileFile.profiles;
function tali(id) { return talismans.find(function (x) { return x.id === id; }); }
check('complete talisman catalog and modeled coverage', [talismans.length, talismanFile.coverage.base, talismanFile.coverage.dlc, talismanFile.coverage.modeled], [154,115,39,100]);
check('all param models trace to their accessory effect ID', talismans.filter(function (x) { return x.paramModel; }).every(function (x) {
  return x.param && x.param.effectId === x.paramModel.effectId && Array.isArray(x.paramModel.fields) && x.paramModel.fields.length > 0;
}), true);
check('all talismans have positive weight', talismans.every(function (x) { return typeof x.weight === 'number' && x.weight > 0; }), true);
check('all talismans have concrete display effects', talismans.every(function (x) {
  return typeof x.effect === 'string' && x.effect.length > 2 && x.effect !== 'See item description' &&
    x.effect.charAt(0) !== '|' && !/\[\[|\]\]|\{\{|\}\}/.test(x.effect);
}), true);
check('attack profile catalog is unique and versioned', [new Set(attackProfiles.map(function (x) { return x.id; })).size, attackProfiles.length, attackProfileFile.gameVersion], [attackProfiles.length,20,'1.16.1']);
var profileTags = new Set([].concat.apply([], attackProfiles.map(function (profile) { return profile.tags; })));
var attackRules = [].concat.apply([], talismans.filter(function (item) { return Array.isArray(item.attack); }).map(function (item) { return item.attack; }));
check('every attack-rule tag exists in a selectable profile', attackRules.every(function (rule) {
  return (rule.requires || []).concat(rule.excludes || []).every(function (tag) { return profileTags.has(tag); });
}), true);
check('every attack rule has numeric PvE/PvP math', attackRules.every(function (rule) {
  return ['pve','pvp'].every(function (context) { return rule[context] && Object.keys(rule[context]).every(function (key) { return typeof rule[context][key] === 'number' && rule[context][key] > 0; }); });
}), true);
var ritual = tali('ritual-sword-talisman');
var jar = tali('great-jars-arsenal');
var resolvedOn = ERCalc.resolveEffects([ritual, null, jar, null], { conditions: { 'ritual-sword-talisman': true } });
check('positional resolver preserves equipped slots', resolvedOn.entries.map(function (x) { return x.slot; }), [0,2]);
check('conditional + unconditional effects active', resolvedOn.coverage.active, 2);
check('talisman weight sums', resolvedOn.weight, Math.round((ritual.weight + jar.weight) * 10) / 10);
var resolvedOff = ERCalc.resolveEffects([ritual], { conditions: { 'ritual-sword-talisman': false } });
check('conditional effect can be disabled', [resolvedOff.mods.length, resolvedOff.entries[0].reason], [0,'condition off']);
var crimson0 = tali('crimson-amber-medallion'), crimson1 = tali('crimson-amber-medallion-1');
var conflicted = ERCalc.resolveEffects([crimson0, crimson1]);
check('game-param accessory group blocks variants', conflicted.conflicts.length, 1);
var defense = ERCalc.aggregateDefense({ negation: { physical:20,strike:20,slash:20,pierce:20,magic:10,fire:10,lightning:10,holy:10 } }, [
  { defense: { allTakenMult: 1.15 } },
  { defense: { allTakenMult: 0.9 } }
]);
check('post-armor vulnerability + protection order', [defense.negation.physical, defense.negation.magic], [17.2,6.9]);
var crimsonMedallion = tali('crimson-amber-medallion');
check('param-derived Crimson Amber HP', ERCalc.statEffects({ VIG:40,MND:1,END:1 }, [crimsonMedallion]).hp, Math.floor(1450 * 1.06));
var dragoncrest = tali('dragoncrest-greatshield-talisman');
check('Dragoncrest context changes PvE/PvP physical negation', [
  ERCalc.aggregateDefense({ negation:{} }, [dragoncrest], 'pve').negation.physical,
  ERCalc.aggregateDefense({ negation:{} }, [dragoncrest], 'pvp').negation.physical
], [20,5]);
var horn = tali('immunizing-horn-charm');
check('horn charm adds immunity after armor', ERCalc.aggregateResistance({ resistance:{ immunity:42,robustness:0,focus:0,vitality:0 } }, [horn]).immunity, 132);
var turtle = tali('green-turtle-talisman'), moon = tali('moon-of-nokstella');
check('utility effects aggregate', ERCalc.aggregateUtility([turtle, moon]), { hpRegenPerSec:0,fpRegenPerSec:0,staminaRecoveryFlat:8,memorySlots:2,virtualDex:0 });
var blueFeather = tali('blue-feathered-branchsword');
check('event-specific defense defaults off', ERCalc.resolveEffects([blueFeather]).mods.length, 0);
check('event-specific defense can be enabled', ERCalc.resolveEffects([blueFeather], { conditions:{ 'blue-feathered-branchsword':true } }).mods.length, 1);
var claw = tali('claw-talisman'), twoHandSword = tali('two-handed-sword-talisman'), alexander = tali('shard-of-alexander');
var jumpEffects = ERCalc.resolveAttackEffects([claw, twoHandSword, alexander], {
  combatContext:'pve', profileId:'jump', tags:['weapon','jump'], state:{ twoHanded:true }
});
check('jump lens matches jump + two-handed rules only', [jumpEffects.applied, jumpEffects.mods.map(function (x) { return x.sourceEffect; })], [2,['claw-talisman','two-handed-sword-talisman']]);
var pvpJump = ERCalc.resolveAttackEffects([claw], { combatContext:'pvp', tags:['weapon','jump'], state:{ twoHanded:false } });
check('attack lens selects separate PvP multiplier', pvpJump.mods[0].mult.all, 1.075);
var skillEffects = ERCalc.resolveAttackEffects([claw, alexander], { combatContext:'pve', tags:['skill'], state:{ twoHanded:true } });
check('skill lens rejects jump and applies skill modifier', [skillEffects.entries[0].applied, skillEffects.entries[1].applied], [false,true]);
var magicScorpion = tali('magic-scorpion-charm');
check('combat-wide talisman selects its PvP profile', ERCalc.resolveAttackEffects([magicScorpion], { combatContext:'pvp', tags:['weapon'], state:{} }).mods[0].mult.magic, 1.08);
var holyWeapon = weapons.find(function (weapon) { return ERCalc.computeAR(vera, weapon, { twoHanded:true }).byType.holy > 0 && ERCalc.computeAR(vera, weapon, { twoHanded:true }).byType.physical > 0; });
var holyBase = ERCalc.computeAR(vera, holyWeapon, { twoHanded:true });
var holyPvp = ERCalc.computeARBuffed(vera, holyWeapon, { twoHanded:true }, [{ mult:{ all:1.2, holy:1 } }]);
check('damage-type override beats broad all multiplier', [holyPvp.buffed.byType.holy, holyPvp.buffed.byType.physical], [holyBase.byType.holy,Math.floor(holyBase.byTypeExact.physical * 1.2)]);

/* ---- magic: catalyst CalcCorrectGraph spell buff + param-derived spell motion values ---- */
console.log('magic:');
var catalystFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalysts.json'), 'utf8'));
var spellFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'spells.json'), 'utf8'));
var catalysts = catalystFile.items, spells = spellFile.items;
function catalyst(name) { return catalysts.find(function (item) { return item.name === name; }); }
function spell(name) { return spells.find(function (item) { return item.name === name; }); }
check('complete casting-tool and spell catalogs', [catalysts.length, spells.length, spellFile.coverage.variants], [33,213,463]);
check('every catalyst formula reproduces the source workbook default', catalysts.every(function (item) {
  return Math.abs(item.audit.sourceDefaultSpellBuff - item.audit.recomputedDefaultSpellBuff) < 0.001;
}), true);
var astrologer = catalyst("Astrologer's Staff");
var int80 = { STR:7,DEX:1,INT:80,FAI:1,ARC:1 };
var astroMax = ERCalc.computeCatalystSpellBuff(int80, astrologer, { curves:catalystFile.curves, upgradeLevel:25 });
var astroZero = ERCalc.computeCatalystSpellBuff(int80, astrologer, { curves:catalystFile.curves, upgradeLevel:0 });
check("Astrologer's Staff +25 @ 80 INT", astroMax.spellBuff, 340);
check("Astrologer's Staff +0 @ 80 INT", astroZero.spellBuff, 180);
check('catalyst requirement failure is explicit', ERCalc.computeCatalystSpellBuff({STR:1,DEX:1,INT:9,FAI:1,ARC:1}, astrologer, { curves:catalystFile.curves }).unmetReqs, [{stat:'STR',need:7,have:1},{stat:'INT',need:16,have:9}]);
var comet = spell('Comet');
var cometOutput = ERCalc.computeSpellOutput(int80, comet, astroMax, { variantId:comet.variants.find(function (item) { return item.name === 'Comet'; }).id });
check('Comet pre-defense magic output uses 292 motion value', [cometOutput.spellBuff,cometOutput.byType.magic,cometOutput.fpCost], [340,992,24]);
check('spell requirements and catalyst school are validated', [cometOutput.spellRequirementsMet,cometOutput.catalystAccepts,cometOutput.canCast], [true,true,true]);
var finger = catalyst('Finger Seal');
var fingerResult = ERCalc.computeCatalystSpellBuff({STR:10,DEX:10,INT:80,FAI:80,ARC:10}, finger, { curves:catalystFile.curves });
check('seal cannot cast sorcery', ERCalc.computeSpellOutput(int80, comet, fingerResult).catalystAccepts, false);
var azur = catalyst("Azur's Glintstone Staff");
var azurResult = ERCalc.computeCatalystSpellBuff({STR:10,DEX:10,INT:80,FAI:10,ARC:10}, azur, { curves:catalystFile.curves });
check("Azur's staff applies its exact FP penalty", ERCalc.computeSpellOutput({STR:10,DEX:10,INT:80,FAI:10,ARC:10}, comet, azurResult).fpCost, Math.ceil(24 * 1.2));

/* ---- encounter context: exact enemy NG cycles, defense, negation, status thresholds ---- */
console.log('enemy context:');
var enemyFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'enemies.json'), 'utf8'));
var enemies = enemyFile.items;
check('complete enemy and NG-cycle catalog', [enemies.length,enemyFile.coverage.cycles], [3341,8]);
check('enemy profile ids are unique', new Set(enemies.map(function (item) { return item.id; })).size, enemies.length);
var malenia = enemies.find(function (item) { return item.name === 'Malenia, Blade of Miquella' && item.boss; });
check('Malenia NG and NG+7 profiles', [malenia.cycles[0].hp,malenia.cycles[7].defense.magic], [18473,192]);
check('defense curve low breakpoint', Math.round(ERCalc.defenseMultiplier(12.5,100) * 1000) / 1000, 0.1);
check('defense curve 1× breakpoint', Math.round(ERCalc.defenseMultiplier(100,100) * 1000) / 1000, 0.4);
check('defense curve 2.5× breakpoint', Math.round(ERCalc.defenseMultiplier(250,100) * 1000) / 1000, 0.7);
check('defense curve 8× breakpoint', Math.round(ERCalc.defenseMultiplier(800,100) * 1000) / 1000, 0.9);
var cometVsMalenia = ERCalc.applyEnemyDefense({ magic:992 }, malenia, { ng:0 });
check('Comet final damage vs NG Malenia', [cometVsMalenia.total,cometVsMalenia.trace.magic.defense], [714,123]);
var maleniaStatus = ERCalc.statusAgainstEnemy({ bleed:67, frost:0 }, malenia, { ng:0 });
check('enemy threshold drives bleed hits-to-proc', [maleniaStatus.bleed.threshold,maleniaStatus.bleed.hits], [420,7]);
check('zero buildup never fabricates a proc', [maleniaStatus.frost.hits,maleniaStatus.frost.immune], [null,false]);

console.log('weapon motion values:');
var moveFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'weapon-moves.json'), 'utf8'));
check('motion catalog covers every weapon explicitly', [moveFile.items.length,moveFile.coverage.weaponsWithMoves,moveFile.coverage.moves], [448,419,24271]);
var riversMoves = moveFile.items.find(function (item) { return item.weaponId === 'rivers-of-blood'; });
var riversJump = riversMoves.moves.find(function (move) { return move.id === '2h-jumping-r2'; });
check('Rivers of Blood exact jumping heavy data', [riversJump.motion,riversJump.statusMotion,riversJump.physicalTypes], [[135],[100],['slash']]);
var riversBase = ERCalc.computeAR(vera, rob, { upgradeLevel:10, twoHanded:true });
var riversVsMalenia = ERCalc.applyWeaponMove(riversBase.byType,riversBase.status,riversJump,malenia,{ng:0});
check('exact jumping heavy final damage and status vs Malenia', [riversVsMalenia.preDefense,riversVsMalenia.total,riversVsMalenia.statusAgainstEnemy.bleed.hits], [869,629,7]);
var bloodhound = moveFile.items.find(function (item) { return item.weaponId === 'bloodhound-s-fang'; });
var bloodhoundMulti = bloodhound.moves.find(function (move) { return move.id === '1h-charged-r2-2'; });
check('multi-hit moves preserve every independent motion value', bloodhoundMulti.motion, [75,115]);

console.log('ranged ammunition:');
var ammoFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ammo.json'), 'utf8'));
check('complete ammunition catalog by compatible type', [ammoFile.items.length,ammoFile.coverage.arrows,ammoFile.coverage.greatArrows,ammoFile.coverage.bolts,ammoFile.coverage.greatbolts], [65,32,8,20,5]);
var arrow = ammoFile.items.find(function (item) { return item.name === 'Arrow'; });
var longbow = weapons.find(function (weapon) { return weapon.name === 'Longbow'; });
var longbowBase = ERCalc.computeAR(vera, longbow, { twoHanded:true });
var longbowShot = ERCalc.applyRangedAttack(longbowBase.byType, longbowBase.status, arrow, arrow.profiles.standard, malenia, { ng:0 });
check('Longbow + Arrow combines exact typed base before enemy defense', [longbowBase.totalAR,longbowShot.preDefense,longbowShot.total,longbowShot.hits.length], [281,326,208,1]);
var bloodBolt = ammoFile.items.find(function (item) { return item.name === 'Bloodbone Bolt'; });
var spread = weapons.find(function (weapon) { return weapon.name === 'Spread Crossbow'; });
var spreadBase = ERCalc.computeAR(vera, spread, { twoHanded:true });
var spreadShot = ERCalc.applyRangedAttack(spreadBase.byType, spreadBase.status, bloodBolt, bloodBolt.profiles.spread, malenia, { ng:0 });
check('Spread Crossbow preserves three independently defended projectiles', [spreadShot.preDefense,spreadShot.total,spreadShot.hits.map(function (hit) { return hit.total; })], [675,387,[129,129,129]]);
check('Spread Crossbow applies exact 80% status motion per projectile', [spreadShot.status.bleed,spreadShot.statusAgainstEnemy.bleed.hits], [120,4]);

console.log('weapon skills and Ashes of War:');
var skillFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'skills.json'), 'utf8'));
check('skill corpus preserves complete base Ash inventory and exact attack-event coverage', [skillFile.coverage.ashes,skillFile.coverage.ashesWithAttackEvents,skillFile.coverage.genericAttackEvents,skillFile.coverage.fixedAttackEvents], [91,64,1361,1061]);
check('every weapon has an explicit skill-state record', Object.keys(skillFile.weaponSkills).length, weapons.length);
check('all modeled skill events retain stable unique attack IDs within their skill', skillFile.skills.every(function (skill) {
  return new Set(skill.events.map(function (event) { return event.id; })).size === skill.events.length;
}), true);
var skillLongsword = weapons.find(function (weapon) { return weapon.name === 'Longsword'; });
var skillBuild = { STR:20,DEX:20,INT:10,FAI:10,ARC:80 };
var bloodLongsword = ERCalc.computeAR(skillBuild, skillLongsword, { affinity:'Blood',upgradeLevel:25 });
var bloodySlash = skillFile.skills.find(function (skill) { return skill.name === 'Bloody Slash'; }).events.find(function (event) { return event.label === 'Bloody Slash'; });
var bloodyResult = ERCalc.computeSkillEvent(skillBuild,bloodLongsword.byType,bloodLongsword.status,bloodySlash,skillFile.scaling.weaponParams[skillLongsword.id].Blood,skillFile.scaling,{upgradeLevel:25,enemy:malenia,ng:0});
check('Bloody Slash uses baseAtkRate + Arcane correction before enemy defense', [bloodyResult.complete,bloodyResult.preDefense,bloodyResult.total,Math.round(bloodyResult.trace.physical.scalingMultiplier*100000)/100000], [true,1708,1383,0.32625]);
var lionsClaw = skillFile.skills.find(function (skill) { return skill.name === "Lion's Claw"; }).events.find(function (event) { return event.label === "Lion's Claw"; });
var lionResult = ERCalc.computeSkillEvent(skillBuild,bloodLongsword.byType,bloodLongsword.status,lionsClaw,skillFile.scaling.weaponParams[skillLongsword.id].Blood,skillFile.scaling,{upgradeLevel:25});
check("Lion's Claw keeps weapon MV and status MV separate", [lionResult.preDefense,lionResult.status.bleed,lionResult.poiseMotion,lionResult.staminaCost], [974,80,600,45]);
var riversSkill = skillFile.weaponSkills['rivers-of-blood'];
check('fixed unique skill carries FP branches and exact event catalog', [riversSkill.skillName,riversSkill.fp,riversSkill.events.length], ['Corpse Piler',{l2:17,r2:9},18]);

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
