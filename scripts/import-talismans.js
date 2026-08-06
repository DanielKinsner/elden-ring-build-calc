#!/usr/bin/env node
'use strict';

/*
 * Build the complete talisman inventory from traceable sources.
 *
 * - Names, DLC membership, icons, display effects, and DLC weights:
 *   Eldenpedia (eldenring.wiki.gg), CC BY-SA 4.0.
 * - Base-game row IDs, weights, and accessory conflict groups:
 *   ERDB's game-param export (EquipParamAccessory, game 1.10).
 * - Calculation fields:
 *   merged from the hand-reviewed models in data/buffs.json.
 *
 * The importer intentionally does not infer numeric math from prose. An item without a
 * reviewed model remains selectable and weighted, while the UI labels its math coverage.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WIKI = 'https://eldenring.wiki.gg';
const LIST_URL = WIKI + '/wiki/Talismans';
const ERDB_ZIP = process.env.ERDB_GAMEDATA_ZIP || path.join(os.tmpdir(), 'erdb-gamedata-1.10.0.zip');
const ERDB_ZIP_URL = 'https://raw.githubusercontent.com/EldenRingDatabase/erdb/e2028a6e044b920a471388fb4e1c468b31b64350/src/erdb/data/gamedata/1.10.0.zip';
const OUT = path.join(ROOT, 'data', 'talismans.json');
const ICON_DIR = path.join(ROOT, 'assets', 'icons', 'talismans');

// Only use overrides when the primary wiki infobox is genuinely blank or malformed.
// Each value is cross-checked against a second public source and stays visible in
// the generated provenance instead of being silently invented in code.
const SOURCE_OVERRIDES = {
  'fine-crucible-feather-talisman': {
    weight: 0.6,
    effect: 'Improves backsteps but increases damage taken at all times',
    source: 'https://eldenring.wiki.fextralife.com/Fine+Crucible+Feather+Talisman',
    reason: 'Eldenpedia infobox fields are blank'
  }
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function slugify(name) {
  return decodeHtml(name)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanWikitext(value) {
  return decodeHtml(String(value || ''))
    .replace(/<br\s*\/?\s*>/gi, ' · ')
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInfoboxField(raw, field) {
  const start = raw.search(/\{\{Infobox(?:_| )Item\b/i);
  if (start < 0) return null;
  // Infoboxes use both `Infobox_Item` and `Infobox Item`, plus both compact and
  // multiline layouts. Parse top-level template fields so pipes inside links or
  // nested templates never truncate a value.
  const box = raw.slice(start, start + 12000);
  const segments = [];
  let templateDepth = 0;
  let linkDepth = 0;
  let segmentStart = null;
  for (let index = 0; index < box.length - 1; index++) {
    const pair = box.slice(index, index + 2);
    if (pair === '{{') {
      templateDepth++;
      index++;
      continue;
    }
    if (pair === '}}') {
      if (templateDepth === 1 && segmentStart != null) segments.push(box.slice(segmentStart, index));
      templateDepth--;
      index++;
      if (templateDepth <= 0) break;
      continue;
    }
    if (pair === '[[') {
      linkDepth++;
      index++;
      continue;
    }
    if (pair === ']]') {
      linkDepth = Math.max(0, linkDepth - 1);
      index++;
      continue;
    }
    if (box[index] === '|' && templateDepth === 1 && linkDepth === 0) {
      if (segmentStart != null) segments.push(box.slice(segmentStart, index));
      segmentStart = index + 1;
    }
  }
  for (const segment of segments) {
    const match = segment.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([\s\S]*)$/);
    if (match && match[1].toLowerCase() === field.toLowerCase()) return match[2].trim();
  }
  return null;
}

function readBaseParamRows() {
  if (!fs.existsSync(ERDB_ZIP)) return new Map();
  const csv = execFileSync('unzip', ['-p', ERDB_ZIP, 'EquipParamAccessory.csv'], { encoding: 'utf8' });
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift().split(';');
  const at = (name) => header.indexOf(name);
  const byName = new Map();
  lines.forEach((line) => {
    const cells = line.split(';');
    const name = cells[at('Row Name')];
    if (!name || name.startsWith('[ERROR]')) return;
    byName.set(name, {
      rowId: Number(cells[at('Row ID')]),
      weight: Number(cells[at('weight')]),
      conflictGroup: Number(cells[at('accessoryGroup')]) || null,
      effectId: Number(cells[at('refId')]) || null,
      iconId: Number(cells[at('iconId')]) || null
    });
  });
  return byName;
}

function readSpEffectRows() {
  if (!fs.existsSync(ERDB_ZIP)) return new Map();
  const csv = execFileSync('unzip', ['-p', ERDB_ZIP, 'SpEffectParam.csv'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift().split(';');
  const rows = new Map();
  lines.forEach((line) => {
    const cells = line.split(';');
    const row = {};
    header.forEach((key, index) => { row[key] = cells[index]; });
    rows.set(Number(cells[0]), row);
  });
  return rows;
}

const PARAM_CONDITIONS = {
  'blue-feathered-branchsword': { id: 'low-hp', label: 'Below 20% HP', defaultActive: false },
  'ritual-shield-talisman': { id: 'full-hp', label: 'Full HP', defaultActive: true },
  'crucible-scale-talisman': { id: 'incoming-critical', label: 'Incoming critical hit', defaultActive: false }
};

function deriveParamModel(id, effectId, effects) {
  const row = effects.get(effectId);
  if (!row) return null;
  const value = (key, fallback) => {
    const n = Number(row[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const model = {};
  const note = [];
  const survival = {};
  const survivalFields = [
    ['maxHpRate', 'hpMult', 'HP'],
    ['maxMpRate', 'fpMult', 'FP'],
    ['maxStaminaRate', 'staminaMult', 'stamina'],
    ['equipWeightChangeRate', 'equipLoadMult', 'equip load']
  ];
  survivalFields.forEach(([field, key, label]) => {
    const rate = value(field, field === 'equipWeightChangeRate' ? 0 : 1);
    if (rate > 0 && Math.abs(rate - 1) > 0.00001) {
      survival[key] = rate;
      note.push(label + ' ×' + rate.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
    }
  });
  if (Object.keys(survival).length) model.survival = survival;

  const defense = {};
  const genericFields = [
    ['neutralDamageCutRate', 'standardTakenMult'],
    ['blowDamageCutRate', 'strikeTakenMult'],
    ['slashDamageCutRate', 'slashTakenMult'],
    ['thrustDamageCutRate', 'pierceTakenMult'],
    ['magicDamageCutRate', 'magicTakenMult'],
    ['fireDamageCutRate', 'fireTakenMult'],
    ['thunderDamageCutRate', 'lightningTakenMult'],
    ['darkDamageCutRate', 'holyTakenMult']
  ];
  const genericRates = genericFields.map(([field, key]) => ({ key, rate: value(field, 1) }));
  const changedGeneric = genericRates.filter((entry) => entry.rate > 0 && Math.abs(entry.rate - 1) > 0.00001);
  if (changedGeneric.length === genericRates.length && changedGeneric.every((entry) => Math.abs(entry.rate - changedGeneric[0].rate) < 0.00001)) {
    defense.allTakenMult = changedGeneric[0].rate;
  } else {
    changedGeneric.forEach((entry) => { defense[entry.key] = entry.rate; });
  }
  const contextTypes = [
    ['Physics', 'physicalTakenMult', 'physical'],
    ['Magic', 'magicTakenMult', 'magic'],
    ['Fire', 'fireTakenMult', 'fire'],
    ['Thunder', 'lightningTakenMult', 'lightning'],
    ['Dark', 'holyTakenMult', 'holy']
  ];
  const pve = {}, pvp = {};
  contextTypes.forEach(([suffix, key]) => {
    const enemy = value('defEnemyDmgCorrectRate_' + suffix, 1);
    const player = value('defPlayerDmgCorrectRate_' + suffix, 1);
    if (enemy > 0 && Math.abs(enemy - 1) > 0.00001) pve[key] = enemy;
    if (player > 0 && Math.abs(player - 1) > 0.00001) pvp[key] = player;
  });
  if (Object.keys(pve).length) defense.pve = pve;
  if (Object.keys(pvp).length) defense.pvp = pvp;
  if (Object.keys(defense).length) {
    model.defense = defense;
    const pvePairs = Object.entries(pve);
    const pvpPairs = Object.entries(pvp);
    if (pvePairs.length === 1) note.push('PvE ' + pvePairs[0][0].replace('TakenMult', '') + ' taken ×' + pvePairs[0][1]);
    if (pvpPairs.length === 1) note.push('PvP ' + pvpPairs[0][0].replace('TakenMult', '') + ' taken ×' + pvpPairs[0][1]);
  }

  const resistance = {};
  const immunity = Math.max(value('changePoisonResistPoint', 0), value('changeDiseaseResistPoint', 0));
  const robustness = Math.max(value('changeBloodResistPoint', 0), value('changeFreezeResistPoint', 0));
  const focus = Math.max(value('changeSleepResistPoint', 0), value('changeMadnessResistPoint', 0));
  const vitality = value('changeCurseResistPoint', 0);
  if (immunity) resistance.immunity = immunity;
  if (robustness) resistance.robustness = robustness;
  if (focus) resistance.focus = focus;
  if (vitality) resistance.vitality = vitality;
  if (Object.keys(resistance).length) {
    model.resistance = resistance;
    note.push(Object.entries(resistance).map(([key, amount]) => '+' + amount + ' ' + key).join(' · '));
  }

  const utility = {};
  const staminaRecovery = value('staminaRecoverChangeSpeed', 0);
  const memorySlots = value('changeMagicSlot', 0);
  const virtualDex = value('dexterityCancelSystemOnlyAddDexterity', 0);
  const hpChange = value('changeHpPoint', 0);
  const interval = value('motionInterval', 0);
  if (staminaRecovery) utility.staminaRecoveryFlat = staminaRecovery;
  if (memorySlots) utility.memorySlots = memorySlots;
  if (virtualDex) utility.virtualDex = virtualDex;
  if (hpChange < 0 && interval > 0) utility.hpRegenPerSec = Math.abs(hpChange) / interval;
  if (Object.keys(utility).length) {
    model.utility = utility;
    if (utility.hpRegenPerSec) note.push('+' + utility.hpRegenPerSec + ' HP/s');
    if (utility.staminaRecoveryFlat) note.push('+' + utility.staminaRecoveryFlat + ' stamina/s');
    if (utility.memorySlots) note.push('+' + utility.memorySlots + ' memory slots');
    if (utility.virtualDex) note.push('+' + utility.virtualDex + ' virtual DEX casting speed');
  }
  if (PARAM_CONDITIONS[id] && (model.defense || model.survival || model.utility)) model.condition = PARAM_CONDITIONS[id];
  if (!Object.keys(model).length) return null;
  model.paramDerived = true;
  model.paramEffectId = effectId;
  if (note.length) model.paramNote = note.join(' · ');
  return model;
}

function existingModels() {
  const buffs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'buffs.json'), 'utf8'));
  const map = new Map();
  (buffs.talismans || []).forEach((item) => {
    map.set(item.id, item);
    map.set('name:' + item.name, item);
  });
  return map;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'TarnishedArchiveDataImporter/1.0 (non-commercial fan project)' } });
  if (!res.ok) throw new Error('fetch ' + url + ' -> ' + res.status);
  return res.text();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function downloadIcon(url, target) {
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) return;
  const res = await fetch(url, { headers: { 'user-agent': 'TarnishedArchiveDataImporter/1.0 (non-commercial fan project)' } });
  if (!res.ok) throw new Error('icon ' + url + ' -> ' + res.status);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

async function ensureErdbZip() {
  if (fs.existsSync(ERDB_ZIP) && fs.statSync(ERDB_ZIP).size > 10000) return;
  const res = await fetch(ERDB_ZIP_URL, { headers: { 'user-agent': 'TarnishedArchiveDataImporter/1.0' } });
  if (!res.ok) throw new Error('ERDB gamedata ' + ERDB_ZIP_URL + ' -> ' + res.status);
  fs.writeFileSync(ERDB_ZIP, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  await ensureErdbZip();
  const html = await fetchText(LIST_URL);
  const blocks = html.match(/<li class="gallerybox"[\s\S]*?<\/li>/g) || [];
  const entries = [];
  const seen = new Set();
  blocks.forEach((block) => {
    const link = block.match(/<div class="thumb"[\s\S]*?<a href="([^"]+)" title="([^"]+)"/);
    const image = block.match(/<div class="thumb"[\s\S]*?<img[^>]+src="([^"]+)"/);
    if (!link || !image || !/^\/wiki\//.test(link[1])) return;
    const name = decodeHtml(link[2]);
    if (seen.has(name)) return;
    seen.add(name);
    entries.push({
      name,
      pagePath: decodeHtml(link[1]),
      imageUrl: new URL(decodeHtml(image[1]), WIKI).href,
      source: /alt="SOTE"/.test(block) ? 'dlc' : 'base'
    });
  });
  if (entries.length < 110) throw new Error('expected 110+ talismans, found ' + entries.length);

  const params = readBaseParamRows();
  const effects = readSpEffectRows();
  const models = existingModels();
  fs.mkdirSync(ICON_DIR, { recursive: true });

  const items = await mapLimit(entries, 6, async (entry, index) => {
    const raw = await fetchText(WIKI + entry.pagePath + '?action=raw');
    const id = slugify(entry.name);
    const param = params.get(entry.name) || null;
    const reviewed = models.get(id) || models.get('name:' + entry.name) || null;
    const derived = param ? deriveParamModel(id, param.effectId, effects) : null;
    const sourceOverride = SOURCE_OVERRIDES[id] || null;
    const wikiWeight = Number(getInfoboxField(raw, 'weight'));
    const itemEffect = cleanWikitext(getInfoboxField(raw, 'item_effect')) || (sourceOverride && sourceOverride.effect) || 'See item description';
    const iconFile = path.join(ICON_DIR, id + '.png');
    await downloadIcon(entry.imageUrl, iconFile);

    const item = {
      id,
      name: entry.name,
      source: entry.source,
      weight: param ? param.weight : (sourceOverride && sourceOverride.weight != null ? sourceOverride.weight : (Number.isFinite(wikiWeight) ? wikiWeight : 0)),
      effect: itemEffect,
      icon: 'assets/icons/talismans/' + id + '.png',
      wiki: WIKI + entry.pagePath,
      param: param ? {
        rowId: param.rowId,
        effectId: param.effectId,
        iconId: param.iconId,
        conflictGroup: param.conflictGroup
      } : null,
      conflictGroup: param && param.conflictGroup ? 'param-' + param.conflictGroup : null,
      modelStatus: reviewed || derived ? 'modeled' : 'inventory'
    };
    if (sourceOverride) item.sourceOverride = {
      source: sourceOverride.source,
      reason: sourceOverride.reason,
      fields: ['weight', 'effect']
    };
    if (derived) {
      ['survival', 'defense', 'resistance', 'utility', 'condition'].forEach((key) => {
        if (derived[key] != null) item[key] = derived[key];
      });
      item.paramModel = { effectId: derived.paramEffectId, fields: Object.keys(derived).filter((key) => !/^param/.test(key)) };
      if (derived.paramNote) item.mathNote = derived.paramNote;
    }
    if (reviewed && reviewed.id !== id) item.legacyIds = [reviewed.id];
    if (reviewed) {
      ['statBonus', 'mult', 'flat', 'statusFlat', 'condition', 'note', 'confirmed'].forEach((key) => {
        if (reviewed[key] != null) item[key] = reviewed[key];
      });
      if (!derived || !derived.survival) if (reviewed.survival != null) item.survival = reviewed.survival;
      if (!derived || !derived.defense) if (reviewed.defense != null) item.defense = reviewed.defense;
    }
    process.stdout.write('\r' + String(index + 1).padStart(3) + '/' + entries.length + ' ' + entry.name.slice(0, 42).padEnd(42));
    return item;
  });

  items.sort((a, b) => a.name.localeCompare(b.name));
  const payload = {
    schemaVersion: 2,
    gameVersion: '1.16',
    generatedAt: new Date().toISOString(),
    sources: [
      {
        name: 'Eldenpedia talisman catalog',
        url: LIST_URL,
        license: 'CC BY-SA 4.0',
        fields: ['name', 'source', 'weight (DLC)', 'effect', 'icon', 'wiki']
      },
      {
        name: 'ERDB EquipParamAccessory 1.10',
        url: 'https://github.com/EldenRingDatabase/erdb',
        revision: 'e2028a6',
        fields: ['rowId', 'weight (base)', 'effectId', 'iconId', 'conflictGroup']
      },
      {
        name: 'ERDB SpEffectParam 1.10 direct effect fields',
        url: 'https://github.com/EldenRingDatabase/erdb',
        revision: 'e2028a6',
        fields: ['survival multipliers', 'PvE/PvP damage multipliers', 'resistance points', 'regeneration', 'memory slots', 'virtual casting dexterity']
      },
      {
        name: 'Tarnished Archive reviewed effect models',
        path: 'data/buffs.json',
        fields: ['statBonus', 'mult', 'survival', 'conditions']
      },
      {
        name: 'Fextralife Fine Crucible Feather cross-check',
        url: SOURCE_OVERRIDES['fine-crucible-feather-talisman'].source,
        fields: ['weight', 'effect'],
        reason: SOURCE_OVERRIDES['fine-crucible-feather-talisman'].reason
      }
    ],
    coverage: {
      inventory: items.length,
      modeled: items.filter((item) => item.modelStatus === 'modeled').length,
      base: items.filter((item) => item.source === 'base').length,
      dlc: items.filter((item) => item.source === 'dlc').length
    },
    items
  };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  process.stdout.write('\nWrote ' + items.length + ' talismans and icons to ' + path.relative(ROOT, OUT) + '\n');
}

main().catch((error) => {
  console.error('\n' + error.stack);
  process.exit(1);
});
