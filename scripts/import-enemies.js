#!/usr/bin/env node
'use strict';

// Import the public PvE Enemy Health / Defense workbook into one compact,
// cycle-aware runtime dataset. No spreadsheet dependency is required.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const workbook = process.argv[2];
if (!workbook || !fs.existsSync(workbook)) {
  console.error('usage: node scripts/import-enemies.js /path/to/pve-defense.xlsx');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const extractor = path.join(__dirname, 'extract-xlsx-sheet.js');
const sheets = ['NG', 'NG+','NG+2','NG+3','NG+4','NG+5','NG+6','NG+7'];
const DAMAGE = ['physical','strike','slash','pierce','magic','fire','lightning','holy'];
const STATUS = ['poison','rot','bleed','frost','sleep','madness','deathblight'];

function readSheet(name) {
  return JSON.parse(execFileSync(process.execPath, [extractor, workbook, name, '--json'], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  }));
}

function number(value) {
  if (value == null || value === '' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function threshold(value) {
  return String(value).toLowerCase() === 'immune' ? null : number(value);
}

function slug(value) {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hash(value) {
  let out = 2166136261;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return (out >>> 0).toString(36);
}

function objectFrom(row, start, keys, transform) {
  const out = {};
  keys.forEach((key, index) => { out[key] = transform(row[start + index]); });
  return out;
}

const rowsByCycle = sheets.map(readSheet).map(rows => rows.slice(2).filter(row => row[0] && row[1]));
const keyOf = row => [row[0], row[1], row[2]].join('|');
const maps = rowsByCycle.map(rows => new Map(rows.map(row => [keyOf(row), row])));
const baseRows = rowsByCycle[0];

for (let cycle = 1; cycle < maps.length; cycle++) {
  if (maps[cycle].size !== maps[0].size) throw new Error(`cycle ${cycle} row count mismatch`);
  for (const key of maps[0].keys()) if (!maps[cycle].has(key)) throw new Error(`cycle ${cycle} missing ${key}`);
}

const items = baseRows.map(base => {
  const sourceKey = keyOf(base);
  const cleanName = String(base[1]).replace(/\s+/g, ' ').trim();
  const displayName = cleanName.replace(/\s*\[Boss\]/g, '').trim();
  const rawLocation = String(base[0]).trim();
  const isDlc = /^\[DLC\]\s*/.test(rawLocation);
  const id = `${slug(displayName).slice(0, 54)}-${hash(sourceKey)}`;
  const cycles = maps.map((map, ng) => {
    const row = map.get(sourceKey);
    return {
      ng,
      hp: number(row[4]),
      defense: objectFrom(row, 7, DAMAGE, number),
      resistances: objectFrom(row, 25, STATUS, threshold)
    };
  });
  return {
    id,
    sourceId: String(base[2]),
    name: displayName,
    variant: cleanName === displayName ? null : cleanName,
    location: rawLocation.replace(/^\[DLC\]\s*/, ''),
    boss: /\[Boss\]/.test(cleanName),
    dlc: isDlc,
    negation: objectFrom(base, 16, DAMAGE, number),
    statusMultipliers: objectFrom(base, 33, ['bleed','frost','sleep','madness','hpBurn'], value => number(value) == null ? 1 : number(value)),
    poise: { base: number(base[40]), incomingMultiplier: number(base[41]), effective: number(base[42]), regenDelay: number(base[43]) },
    cycles
  };
});

const ids = new Set(items.map(item => item.id));
if (items.length !== 3341 || ids.size !== items.length) throw new Error(`enemy catalog audit failed: ${items.length}/${ids.size}`);
if (items.some(item => item.cycles.length !== 8 || item.cycles.some(cycle => cycle.hp == null))) throw new Error('incomplete NG-cycle data');

const out = {
  schemaVersion: 1,
  source: {
    name: 'Elden Ring PvE Enemy Health / Defense Data',
    url: 'https://docs.google.com/spreadsheets/d/1BVwmKqB8pvuyJkSTGYOM2kAJxFMQ0jVsc6aKYz_Upes/edit',
    gameVersion: 'App 1.16 / Calibration 1.16',
    retrieved: '2026-08-05'
  },
  coverage: {
    profiles: items.length,
    bosses: items.filter(item => item.boss).length,
    dlc: items.filter(item => item.dlc).length,
    cycles: 8
  },
  items
};

fs.writeFileSync(path.join(root, 'data/enemies.json'), JSON.stringify(out));
console.log(`enemies: ${out.coverage.profiles} (${out.coverage.bosses} boss profiles, ${out.coverage.dlc} DLC) × ${out.coverage.cycles} cycles`);
