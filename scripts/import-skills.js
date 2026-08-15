#!/usr/bin/env node
'use strict';

/*
 * Build the skill/Ash-of-War event corpus from four independently auditable inputs:
 *   1. App 1.16.1 attack rows (typed motion values, AtkParam bases, stamina/status/poise)
 *   2. Base-game Ash compatibility workbook (weapon + affinity legality)
 *   3. App 1.16 planner params (weapon scaling, reinforcement, correction graphs)
 *   4. ERDB's 1.10 SwordArtsParam export (base-game FP branches)
 *
 * Usage:
 *   node scripts/import-skills.js motion-values.xlsx ash-compat.xlsx planner.xlsx erdb-1.10.zip
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [motionWorkbook, compatibilityWorkbook, plannerWorkbook, erdbZip] = process.argv.slice(2);
if (![motionWorkbook, compatibilityWorkbook, plannerWorkbook, erdbZip].every(file => file && fs.existsSync(file))) {
  console.error('usage: node scripts/import-skills.js motion-values.xlsx ash-compat.xlsx planner.xlsx erdb-1.10.zip');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const extractor = path.join(__dirname, 'extract-xlsx-sheet.js');
function sheet(file, name) {
  return JSON.parse(execFileSync(process.execPath, [extractor, file, name, '--json'], {
    encoding: 'utf8', maxBuffer: 256 * 1024 * 1024
  }));
}
function objects(rows, skip = 1) {
  const header = rows[0] || [];
  return rows.slice(skip).map(row => Object.fromEntries(header.map((key, index) => [key, row[index] == null ? '' : row[index]])));
}
function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function int(value, fallback = 0) { return Math.round(num(value, fallback)); }
function text(value) { return value == null ? '' : String(value).trim(); }
function slug(value) { return text(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function normalize(value) { return text(value).toLowerCase().normalize('NFKD').replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ''); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function loadWeapons() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/weapons/manifest.json'), 'utf8'));
  return [].concat(manifest.base || [], manifest.dlc || []).flatMap(file => JSON.parse(fs.readFileSync(path.join(root, 'data/weapons', file), 'utf8')));
}
function parseCsv(source) {
  return source.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(line => {
    const out = []; let value = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === ';' && !quoted) { out.push(value); value = ''; }
      else value += char;
    }
    out.push(value); return out;
  });
}

const TYPE_FIELD = { physical:'Physics', magic:'Magic', fire:'Fire', lightning:'Thunder', holy:'Dark' };
const STAT_FIELD = { STR:'Strength', DEX:'Dexterity', INT:'Magic', FAI:'Faith', ARC:'Luck' };
const RATE_FIELD = { physical:'physicsAtkRate', magic:'magicAtkRate', fire:'fireAtkRate', lightning:'thunderAtkRate', holy:'darkAtkRate' };
const CORRECT_RATE_FIELD = { STR:'correctStrengthRate', DEX:'correctAgilityRate', INT:'correctMagicRate', FAI:'correctFaithRate', ARC:'correctLuckRate' };
const AFFINITY_PARAM_NAME = { Blood:'Bloody' };

const attackRows = objects(sheet(motionWorkbook, 'Ashes of War Attack Data')).filter(row => text(row.Name));
const compatibilityRows = objects(sheet(compatibilityWorkbook, 'Weapons')).filter(row => text(row['Weapon Name']));
const ashRows = objects(sheet(compatibilityWorkbook, 'Ashes_of_War')).filter(row => text(row.Name));
const equipRows = objects(sheet(plannerWorkbook, 'EquipParamWeapon'), 2).filter(row => num(row.ID, -1) >= 0 && text(row.Name));
const reinforceRows = objects(sheet(plannerWorkbook, 'ReinforceParamWeapon'), 2).filter(row => num(row.ID, -1) >= 0);
const correctionRows = objects(sheet(plannerWorkbook, 'AttackElementCorrectParam'), 2).filter(row => num(row.ID, -1) >= 0);
const graphRows = sheet(plannerWorkbook, 'CalcCorrectGraphEz');
const weapons = loadWeapons();

const swordArtsCsv = execFileSync('unzip', ['-p', erdbZip, 'SwordArtsParam.csv'], { encoding:'utf8', maxBuffer:16*1024*1024 });
const swordArtsRowsRaw = parseCsv(swordArtsCsv);
const swordArtsHeader = swordArtsRowsRaw[0];
const swordArtsRows = swordArtsRowsRaw.slice(1).map(row => Object.fromEntries(swordArtsHeader.map((key, index) => [key, row[index] || ''])));
const swordArtByName = new Map(swordArtsRows.filter(row => text(row['Row Name'])).map(row => [normalize(row['Row Name']), row]));

function fpBranches(name) {
  const row = swordArtByName.get(normalize(name));
  if (!row) return null;
  const out = {};
  [['l2','useMagicPoint_L2'],['r1','useMagicPoint_R1'],['r2','useMagicPoint_R2'],['l1','useMagicPoint_L1']].forEach(([key, field]) => {
    const value = int(row[field], -1); if (value >= 0) out[key] = value;
  });
  return Object.keys(out).length ? out : null;
}

function physicalType(value) {
  const type = text(value).toLowerCase();
  if (type === 'thrust') return 'pierce';
  return ['strike','slash','pierce'].includes(type) ? type : 'physical';
}
function eventFromRow(row, scope) {
  const classMatch = text(row.Name).match(/^\[([^\]]+)\]\s*/);
  const label = text(row.Name).replace(/^\[[^\]]+\]\s*/, '');
  const attackId = String(Math.trunc(num(row.AtkId)));
  const motion = {
    physical:num(row['Phys MV']), magic:num(row['Magic MV']), fire:num(row['Fire MV']),
    lightning:num(row['Ltng MV']), holy:num(row['Holy MV'])
  };
  const base = {
    physical:num(row.AtkPhys), magic:num(row.AtkMag), fire:num(row.AtkFire),
    lightning:num(row.AtkLtng), holy:num(row.AtkHoly)
  };
  const id = slug(label) + (classMatch ? '-' + slug(classMatch[1]) : '') + '-' + attackId;
  return {
    id, label, attackId,
    weaponType: classMatch ? classMatch[1] : null,
    scope,
    motion,
    base,
    statusMotion:num(row['Status MV']),
    weaponBuffMotion:num(row['Weapon Buff MV']),
    poiseMotion:num(row['Poise Dmg MV']),
    poiseBase:num(row.AtkSuperArmor),
    staminaDamageBase:num(row.AtkStam),
    staminaCost:num(row.StaminaCost),
    physicalType:physicalType(row.PhysAtkAttribute),
    correctionId:num(row.overwriteAttackElementCorrectId, -1) >= 0 ? int(row.overwriteAttackElementCorrectId) : null,
    pvpMultiplier:num(row['PvP Dmg Mult'], 1) || 1,
    specialEffects:unique([row.SpEffectId0, row.SpEffectId1, row.SpEffectId2, row.SpEffectId3, row.SpEffectId4, row.SpEffectId5].map(value => int(value, -1)).filter(value => value >= 0))
  };
}

const rowNameAliases = {
  'flameoftheredmanes':'flameofredmanes'
};
const ashNames = ashRows.map(row => text(row.Name));
const ashesByNormalized = ashNames.map(name => ({ name, key:rowNameAliases[normalize(name)] || normalize(name) })).sort((a,b) => b.key.length - a.key.length);
const genericEvents = new Map(ashNames.map(name => [name, []]));
attackRows.filter(row => !text(row['Unique Skill Weapon'])).forEach(row => {
  const stripped = text(row.Name).replace(/^\[[^\]]+\]\s*/, '');
  const key = normalize(stripped);
  const ash = ashesByNormalized.find(item => key.startsWith(item.key));
  if (ash) genericEvents.get(ash.name).push(eventFromRow(row, 'ash'));
});

const ashMetadata = new Map(ashRows.map(row => {
  const name = text(row.Name);
  const affinities = ['Standard','Heavy','Keen','Quality','Fire','Flame Art','Lightning','Sacred','Magic','Cold','Poison','Blood','Occult'].filter(affinity => int(row[affinity === 'Blood' ? 'Blood' : affinity]) === 1);
  const weaponTypes = Object.keys(row).filter(key => !['Name','Standard','Heavy','Keen','Quality','Fire','Flame Art','Lightning','Sacred','Magic','Cold','Poison','Blood','Occult','NONE'].includes(key) && int(row[key]) === 1);
  return [name, { affinities, weaponTypes }];
}));

const skills = ashNames.map(name => {
  const meta = ashMetadata.get(name);
  const events = genericEvents.get(name);
  return {
    id:slug(name), name, source:'base', kind:'ash', fp:fpBranches(name),
    legalAffinities:meta.affinities, legalWeaponTypes:meta.weaponTypes,
    events,
    modeled:events.length > 0,
    note:events.length ? null : 'Utility, buff, movement, parry, or ranged behavior is not represented by a direct attack event yet.'
  };
});
const skillByName = new Map(skills.map(skill => [skill.name, skill]));

const compatByWeaponAffinity = new Map();
compatibilityRows.forEach(row => {
  const rawAffinity = text(row.Affinity);
  const affinity = rawAffinity === '-' ? 'Standard' : rawAffinity === 'Bloody' ? 'Blood' : rawAffinity;
  const allowed = Object.keys(row).filter(key => /^Ash of War \d+$/.test(key)).map(key => text(row[key])).filter(value => value && value !== '-');
  compatByWeaponAffinity.set(normalize(row['Weapon Name']) + '|' + affinity, {
    defaultSkill:text(row['Default Ash of War']), allowed:unique(allowed), canApply:text(row['Can Apply Ash of War']) === 'Yes'
  });
});

const fixedAttackGroups = new Map();
attackRows.filter(row => text(row['Unique Skill Weapon'])).forEach(row => {
  const group = text(row['Unique Skill Weapon']);
  if (!fixedAttackGroups.has(group)) fixedAttackGroups.set(group, []);
  fixedAttackGroups.get(group).push(eventFromRow(row, 'fixed'));
});
const fixedAliases = new Map();
fixedAttackGroups.forEach((events, group) => {
  let names = [group];
  if (group === '(Nightrider / Chainlink) Flail') names = ['Nightrider Flail','Chainlink Flail'];
  if (group === 'Staff of the Avatar / Rotten Staff') names = ['Staff of the Avatar','Rotten Staff'];
  names.forEach(name => fixedAliases.set(normalize(name), { group, events }));
});

const equipByName = new Map(equipRows.map(row => [normalize(row.Name), row]));
function equipRowFor(weapon, affinity) {
  const prefix = affinity === 'Standard' ? '' : (AFFINITY_PARAM_NAME[affinity] || affinity) + ' ';
  return equipByName.get(normalize(prefix + weapon.name)) || null;
}
function paramProfile(row) {
  if (!row) return null;
  return {
    id:String(Math.trunc(num(row.ID))),
    reinforceTypeId:int(row.reinforceTypeId),
    requirements:{ STR:int(row.properStrength), DEX:int(row.properAgility), INT:int(row.properMagic), FAI:int(row.properFaith), ARC:int(row.properLuck) },
    scaling:{ STR:num(row.correctStrength), DEX:num(row.correctAgility), INT:num(row.correctMagic), FAI:num(row.correctFaith), ARC:num(row.correctLuck) },
    correctTypes:{ physical:int(row.correctType_Physics), magic:int(row.correctType_Magic), fire:int(row.correctType_Fire), lightning:int(row.correctType_Thunder), holy:int(row.correctType_Dark) },
    attackElementCorrectId:int(row.attackElementCorrectId)
  };
}

const weaponSkills = {};
const weaponParams = {};
const missingParams = [];
weapons.forEach(weapon => {
  const affinities = ['Standard'].concat(Object.keys(weapon.affinities || {}));
  const profiles = {};
  affinities.forEach(affinity => {
    const row = equipRowFor(weapon, affinity);
    if (row) profiles[affinity] = paramProfile(row); else missingParams.push(weapon.id + '|' + affinity);
  });
  if (Object.keys(profiles).length) weaponParams[weapon.id] = profiles;

  const compat = {};
  affinities.forEach(affinity => {
    const record = compatByWeaponAffinity.get(normalize(weapon.name) + '|' + affinity);
    if (record) compat[affinity] = record;
  });
  const fixed = fixedAliases.get(normalize(weapon.name));
  const standardCompat = compat.Standard;
  if (weapon.infusable && Object.keys(compat).length) {
    weaponSkills[weapon.id] = { mode:'configurable', affinities:compat, sourceVersion:'1.10' };
  } else if (!weapon.infusable && (fixed || standardCompat)) {
    const skillName = standardCompat && standardCompat.defaultSkill && standardCompat.defaultSkill !== '-' ? standardCompat.defaultSkill : 'Fixed skill';
    weaponSkills[weapon.id] = {
      mode:'fixed', skillName, skillId:skillByName.has(skillName) ? slug(skillName) : null,
      fp:fpBranches(skillName), events:fixed ? fixed.events : [], sourceVersion:fixed ? '1.16.1' : '1.10'
    };
  } else {
    weaponSkills[weapon.id] = { mode:'unavailable', reason:weapon.source === 'dlc' && weapon.infusable ? 'DLC Ash compatibility is not present in the audited base-game compatibility source.' : 'No audited skill mapping is available.' };
  }
});

const usedReinforcementTypes = new Set();
const usedCorrectionIds = new Set();
const usedCurveIds = new Set();
Object.values(weaponParams).forEach(profiles => Object.values(profiles).forEach(profile => {
  usedReinforcementTypes.add(profile.reinforceTypeId);
  usedCorrectionIds.add(profile.attackElementCorrectId);
  Object.values(profile.correctTypes).forEach(id => usedCurveIds.add(id));
}));
skills.forEach(skill => skill.events.forEach(event => { if (event.correctionId != null) usedCorrectionIds.add(event.correctionId); }));
Object.values(weaponSkills).forEach(record => (record.events || []).forEach(event => { if (event.correctionId != null) usedCorrectionIds.add(event.correctionId); }));

const reinforceById = new Map(reinforceRows.map(row => [int(row.ID), row]));
const reinforcements = {};
usedReinforcementTypes.forEach(typeId => {
  const levels = [];
  for (let level = 0; level <= 25; level++) {
    const row = reinforceById.get(typeId + level); if (!row) break;
    levels.push({
      baseAtkRate:num(row.baseAtkRate, 1),
      damage:Object.fromEntries(Object.keys(TYPE_FIELD).map(type => [type, num(row[RATE_FIELD[type]], 1)])),
      scaling:Object.fromEntries(Object.keys(STAT_FIELD).map(stat => [stat, num(row[CORRECT_RATE_FIELD[stat]], 1)]))
    });
  }
  reinforcements[typeId] = levels;
});

const correctionById = new Map(correctionRows.map(row => [int(row.ID), row]));
const corrections = {};
usedCorrectionIds.forEach(id => {
  const row = correctionById.get(id); if (!row) return;
  const types = {};
  Object.keys(TYPE_FIELD).forEach(type => {
    const ingameType = TYPE_FIELD[type];
    const stats = {};
    Object.keys(STAT_FIELD).forEach(stat => {
      const ingameStat = STAT_FIELD[stat];
      stats[stat] = {
        enabled:int(row['is' + ingameStat + 'Correct_by' + ingameType]) === 1,
        override:num(row['overwrite' + ingameStat + 'CorrectRate_by' + ingameType], -1),
        influence:num(row['Influence' + ingameStat + 'CorrectRate_by' + ingameType], 100) / 100
      };
    });
    types[type] = stats;
  });
  corrections[id] = types;
});

const graphHeader = graphRows[0] || [];
const curves = {};
graphRows.slice(1).forEach(row => {
  const id = int(row[0], -1); if (!usedCurveIds.has(id)) return;
  const values = [];
  for (let stat = 1; stat <= 99; stat++) {
    const column = graphHeader.findIndex(value => int(value, -1) === stat);
    values.push(num(row[column]));
  }
  curves[id] = values;
});

function assert(condition, message) { if (!condition) throw new Error(message); }
const allEvents = skills.flatMap(skill => skill.events).concat(Object.values(weaponSkills).flatMap(record => record.events || []));
assert(skills.length === 91, 'expected 91 base-game Ashes, got ' + skills.length);
assert(new Set(skills.map(skill => skill.id)).size === skills.length, 'duplicate skill IDs');
assert(allEvents.length > 1500, 'skill event coverage unexpectedly low: ' + allEvents.length);
assert(Object.keys(weaponSkills).length === weapons.length, 'weapon skill-state coverage incomplete');
assert(Object.keys(weaponParams).length >= 440, 'weapon param mapping unexpectedly low: ' + Object.keys(weaponParams).length);
assert(Object.values(weaponParams).every(profiles => Object.values(profiles).every(profile => reinforcements[profile.reinforceTypeId] && reinforcements[profile.reinforceTypeId].length)), 'missing reinforcement profile');

const out = {
  schemaVersion:1,
  source:{
    attacks:{ name:'ER - Motion Values and Attack Data', url:'https://docs.google.com/spreadsheets/d/1j4bpTbsnp5Xsgw9TP2xv6d8R4qk0ErpE9r_5LGIDraU/edit', gameVersion:'App 1.16.1', retrieved:'2026-08-06' },
    compatibility:{ name:'Elden Ring Compatible Ash of War Sheet', url:'https://docs.google.com/spreadsheets/d/1BTwjJaSX8iEK7TjUi0TbCY34apgH_028_a_j2XcITqY/edit', gameVersion:'1.10 base game', retrieved:'2026-08-06' },
    params:{ name:'CryptidTracker Elden Ring Build Planner', url:'https://docs.google.com/spreadsheets/d/19Op36P7gdVMkPzFQX6OsjZcfyUjdGOj7Cjk9qFAVj-U/edit', gameVersion:'App 1.16 / Calibration 1.16', retrieved:'2026-08-06' },
    fp:{ name:'EldenRingDatabase/erdb SwordArtsParam', url:'https://github.com/EldenRingDatabase/erdb', gameVersion:'1.10', retrieved:'2026-08-06' }
  },
  coverage:{
    ashes:skills.length,
    ashesWithAttackEvents:skills.filter(skill => skill.events.length).length,
    genericAttackEvents:skills.reduce((sum, skill) => sum + skill.events.length, 0),
    weapons:weapons.length,
    configurableWeapons:Object.values(weaponSkills).filter(record => record.mode === 'configurable').length,
    fixedWeapons:Object.values(weaponSkills).filter(record => record.mode === 'fixed').length,
    fixedAttackEvents:Object.values(weaponSkills).reduce((sum, record) => sum + (record.events || []).length, 0),
    weaponParamProfiles:Object.values(weaponParams).reduce((sum, profiles) => sum + Object.keys(profiles).length, 0),
    missingParamProfiles:missingParams.length
  },
  skills,
  weaponSkills,
  scaling:{ weaponParams, reinforcements, corrections, curves }
};

fs.writeFileSync(path.join(root, 'data/skills.json'), JSON.stringify(out));
console.log('skills:', out.coverage.ashes, '(' + out.coverage.ashesWithAttackEvents + ' with direct attack events)');
console.log('events:', out.coverage.genericAttackEvents, 'generic +', out.coverage.fixedAttackEvents, 'fixed');
console.log('weapon state:', out.coverage.configurableWeapons, 'configurable +', out.coverage.fixedWeapons, 'fixed');
console.log('param profiles:', out.coverage.weaponParamProfiles, '(' + out.coverage.missingParamProfiles + ' missing)');
