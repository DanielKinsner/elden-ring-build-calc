#!/usr/bin/env node
'use strict';

/*
 * Import catalysts and spells from CryptidTracker's public Elden Ring build planner.
 *
 * Usage:
 *   node scripts/import-magic.js /path/to/er-build-planner.xlsx
 *
 * The workbook exposes the same game-param inputs used by its App/Calibration 1.16
 * calculator. We preserve those inputs and their provenance; runtime math remains in
 * src/engine.js so every output can be explained and regression-tested.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const XLSX = process.argv[2];
if (!XLSX) {
  console.error('usage: import-magic.js <er-build-planner.xlsx>');
  process.exit(2);
}

const SOURCE = {
  name: "CryptidTracker Elden Ring Build Planner",
  url: 'https://docs.google.com/spreadsheets/d/19Op36P7gdVMkPzFQX6OsjZcfyUjdGOj7Cjk9qFAVj-U/edit',
  plannerVersion: '1.19.1',
  gameVersion: 'App 1.16 / Calibration 1.16',
  retrieved: '2026-08-05'
};

function sheet(name) {
  const raw = execFileSync(process.execPath, [path.join(__dirname, 'extract-xlsx-sheet.js'), XLSX, name, '--json'], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  });
  return JSON.parse(raw);
}

function objects(rows) {
  const header = rows[0] || [];
  return rows.slice(1).map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] == null ? '' : row[index]])));
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
}

function int(value, fallback) { return Math.round(num(value, fallback)); }
function cleanId(value) { return String(Math.round(num(value))).replace(/\.0$/, ''); }
function slug(value) {
  return String(value || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function nonempty(value) { return value == null ? '' : String(value).trim(); }

const weaponRows = objects(sheet('WeaponData'));
const catalystRows = objects(sheet('OptimalCatalystCalcData')).filter((row) => nonempty(row.Catalyst));
const reinforceRows = objects(sheet('ReinforceParamWeapon'));
const elementCorrectionRows = objects(sheet('AttackElementCorrectParam'));
const magicRows = objects(sheet('MagicData')).filter((row) => nonempty(row.Type) && nonempty(row.Name));
const graphRows = sheet('CalcCorrectGraphEz');

const weaponByName = new Map();
weaponRows.forEach((row) => {
  if (nonempty(row.Weapon) && !weaponByName.has(row.Weapon)) weaponByName.set(row.Weapon, row);
});

const reinforceById = new Map();
reinforceRows.forEach((row) => {
  const id = int(row.ID, -1);
  if (id >= 0) reinforceById.set(id, row);
});

const elementCorrectionById = new Map();
elementCorrectionRows.forEach((row) => {
  const id = int(row.ID, -1);
  if (id >= 0) elementCorrectionById.set(id, row);
});

const graphHeader = graphRows[0] || [];
const graphById = new Map();
graphRows.slice(1).forEach((row) => {
  const id = int(row[0], -1);
  if (id < 0) return;
  const values = [];
  for (let stat = 1; stat <= 99; stat++) {
    const column = graphHeader.findIndex((value) => int(value, -1) === stat);
    values.push(num(row[column]));
  }
  graphById.set(id, values);
});

const maxRateByType = new Map();
catalystRows.forEach((row) => {
  const type = int(row.reinforceTypeId);
  const maxLevel = int(row['Reinforcement Level']);
  const rateRow = reinforceById.get(type + maxLevel);
  maxRateByType.set(type, num(rateRow && rateRow.correctMagicRate, 1));
});

const usedCurves = new Set();
const catalysts = catalystRows.map((row) => {
  const name = nonempty(row.Catalyst);
  const weapon = weaponByName.get(name) || {};
  const maxLevel = int(row['Reinforcement Level']);
  const reinforceTypeId = int(row.reinforceTypeId);
  const maxRate = maxRateByType.get(reinforceTypeId) || 1;
  const upgradeRates = [];
  for (let level = 0; level <= maxLevel; level++) {
    const rate = num((reinforceById.get(reinforceTypeId + level) || {}).correctMagicRate, level === maxLevel ? maxRate : 1);
    upgradeRates.push(rate / maxRate);
  }
  const curveId = int(row.correctType_Magic || row.correctType_Physics);
  const elementCorrection = elementCorrectionById.get(int(row.attackElementCorrectId)) || {};
  const scalingStats = {
    STR: int(elementCorrection.isStrengthCorrect_byMagic) === 1,
    DEX: int(elementCorrection.isDexterityCorrect_byMagic) === 1,
    INT: int(elementCorrection.isMagicCorrect_byMagic) === 1,
    FAI: int(elementCorrection.isFaithCorrect_byMagic) === 1,
    ARC: int(elementCorrection.isLuckCorrect_byMagic) === 1
  };
  usedCurves.add(curveId);
  const kind = int(row.enableMagic) && int(row.enableMiracle) ? 'universal' : int(row.enableMagic) ? 'sorcery' : 'incantation';
  const bonusRaw = nonempty(weapon.castingBonusRate);
  const bonusNumber = Number(bonusRaw);
  const item = {
    id: slug(name),
    gameId: cleanId(row.ID),
    name,
    kind,
    weaponClass: nonempty(weapon['Weapon Class']) || (kind === 'incantation' ? 'Sacred Seal' : 'Glintstone Staff'),
    source: num(row.ID) >= 34500000 || name === 'Maternal Staff' || name === 'Staff of the Great Beyond' || name === 'Carian Sorcery Sword' ? 'dlc' : 'base',
    weight: num(weapon.weight),
    maxLevel,
    reinforceTypeId,
    baseSpellBuff: num(row['Base SB'], 100),
    curveId,
    coefficients: {
      STR: num(row.correctStrength), DEX: num(row.correctAgility), INT: num(row.correctMagic),
      FAI: num(row.correctFaith), ARC: num(row.correctLuck)
    },
    scalingStats,
    requirements: {
      STR: int(row.properStrength), DEX: int(row.properAgility), INT: int(row.properMagic),
      FAI: int(row.properFaith), ARC: int(row.properLuck)
    },
    upgradeRates: upgradeRates.map((value) => Math.round(value * 1000000) / 1000000),
    bonus: nonempty(weapon.castingBonusType) && Number.isFinite(bonusNumber) ? {
      family: nonempty(weapon.castingBonusType), multiplier: bonusNumber
    } : null,
    fpMultiplier: name === "Azur's Glintstone Staff" ? 1.2 : name === "Lusat's Glintstone Staff" ? 1.5 : 1,
    provenance: { source: SOURCE.url, sheets: ['WeaponData', 'OptimalCatalystCalcData', 'ReinforceParamWeapon', 'AttackElementCorrectParam', 'CalcCorrectGraphEz'] },
    audit: { sourceDefaultSpellBuff: num(row['spell buff']) }
  };
  const defaults = { STR: 14, DEX: 13, INT: 9, FAI: 9, ARC: 7 };
  const curve = graphById.get(curveId);
  item.audit.recomputedDefaultSpellBuff = item.baseSpellBuff + Object.keys(item.coefficients).reduce((total, stat) => {
    if (!item.scalingStats[stat]) return total;
    return total + item.coefficients[stat] * (curve[defaults[stat] - 1] / 100);
  }, 0);
  return item;
}).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

const curves = {};
[...usedCurves].sort((a, b) => a - b).forEach((id) => {
  if (!graphById.has(id)) throw new Error('missing catalyst correction curve ' + id);
  curves[id] = graphById.get(id);
});

const spellsById = new Map();
magicRows.forEach((row) => {
  const gameId = cleanId(row.ID);
  if (!spellsById.has(gameId)) {
    spellsById.set(gameId, {
      id: slug(row.Name),
      gameId,
      name: nonempty(row.Name),
      type: row.Type === 'Incantation' ? 'incantation' : 'sorcery',
      source: num(row.ID) >= 20000 ? 'dlc' : 'base',
      slots: Math.max(1, int(row.slotLength, 1)),
      fp: int(row.mp),
      chargedFp: int(row.mp_charge),
      stamina: int(row.stamina),
      chargedStamina: int(row.stamina_charge),
      requirements: { INT: int(row.requirementIntellect), FAI: int(row.requirementFaith), ARC: int(row.requirementLuck) },
      effect: nonempty(row.Effect),
      duration: num(row.Duration) || null,
      radius: num(row.Radius) || null,
      category: nonempty(row['Category Name 1']) || nonempty(row['Category Name 2']) || null,
      categoryDisplay: nonempty(row.MagicCategoryCombined) || null,
      variants: [],
      provenance: { source: SOURCE.url, sheet: 'MagicData' }
    });
  }
  const spell = spellsById.get(gameId);
  const damage = {
    physical: num(row.PhysAtk), magic: num(row.MagicAtk), fire: num(row.FireAtk),
    lightning: num(row.LtngAtk), holy: num(row.HolyAtk)
  };
  const statusType = nonempty(row['Status Type']).toLowerCase();
  const statusAmount = num(row['Status Buildup']);
  spell.variants.push({
    id: cleanId(row.AtkID || row.ID),
    name: nonempty(row['Display Name']) || spell.name,
    damage,
    healMotion: num(row['Heal Add']),
    noScale: int(row['No Scale']) === 1,
    onlyUsesInt: int(row['Only Uses Int']) === 1,
    onlyUsesFaith: int(row['Only Uses Faith']) === 1,
    charged: /charged/i.test(nonempty(row['Display Name'])) || /charged/i.test(nonempty(row.AtkCategoryCombined)),
    fp: /charged/i.test(nonempty(row['Display Name'])) && spell.chargedFp ? spell.chargedFp : spell.fp,
    stamina: int(row['stamina cost'], spell.stamina),
    attackCategory: nonempty(row.AtkCategoryCombined) || null,
    status: statusType && statusAmount ? { type: statusType, amount: statusAmount } : null
  });
});

const spells = [...spellsById.values()].map((spell) => {
  const seen = new Set();
  spell.variants = spell.variants.filter((variant) => {
    const key = JSON.stringify([variant.name, variant.damage, variant.healMotion, variant.status]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return spell;
}).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

function assert(condition, message) { if (!condition) throw new Error(message); }
assert(catalysts.length === 33, 'expected 33 casting tools, got ' + catalysts.length);
assert(spells.length === 213, 'expected 213 unique spells, got ' + spells.length);
assert(catalysts.every((item) => item.upgradeRates.length === item.maxLevel + 1), 'catalyst upgrade-rate coverage is incomplete');
assert(spells.every((item) => item.variants.length > 0), 'spell variant coverage is incomplete');
assert(catalysts.every((item) => Math.abs(item.audit.sourceDefaultSpellBuff - item.audit.recomputedDefaultSpellBuff) < 0.001), 'catalyst formula audit failed against source workbook');

fs.writeFileSync(path.join(ROOT, 'data', 'catalysts.json'), JSON.stringify({ schemaVersion: 1, source: SOURCE, curves, coverage: { total: catalysts.length, base: catalysts.filter((x) => x.source === 'base').length, dlc: catalysts.filter((x) => x.source === 'dlc').length }, items: catalysts }, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'data', 'spells.json'), JSON.stringify({ schemaVersion: 1, source: SOURCE, coverage: { total: spells.length, sorceries: spells.filter((x) => x.type === 'sorcery').length, incantations: spells.filter((x) => x.type === 'incantation').length, variants: spells.reduce((sum, x) => sum + x.variants.length, 0) }, items: spells }, null, 2) + '\n');

console.log('catalysts:', catalysts.length, '(' + catalysts.filter((x) => x.source === 'dlc').length + ' DLC)');
console.log('spells:', spells.length, '(' + spells.reduce((sum, x) => sum + x.variants.length, 0) + ' unique variants)');
console.log('curves:', [...usedCurves].sort((a, b) => a - b).join(', '));
