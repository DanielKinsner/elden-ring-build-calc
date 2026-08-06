#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const workbook = process.argv[2];
if (!workbook || !fs.existsSync(workbook)) {
  console.error('usage: node scripts/import-weapon-moves.js /path/to/motion-values.xlsx');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const extractor = path.join(__dirname, 'extract-xlsx-sheet.js');
function sheet(name) {
  return JSON.parse(execFileSync(process.execPath, [extractor, workbook, name, '--json'], { encoding:'utf8', maxBuffer:64*1024*1024 }));
}
function normalize(value) { return String(value).toLowerCase().normalize('NFKD').replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ''); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function hits(value) {
  if (value == null || value === '') return [];
  const source = String(value).split(/\s+\(/)[0];
  return (source.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(value => value > 0);
}
function physicalTypes(value, count) {
  const values = String(value || 'Standard').split('+').map(item => item.trim().toLowerCase()).filter(Boolean).map(item => {
    if (item === 'standard') return 'physical';
    if (item === 'thrust') return 'pierce';
    return ['strike','slash','pierce'].includes(item) ? item : 'physical';
  });
  if (!values.length) values.push('physical');
  while (values.length < count) values.push(values[values.length - 1]);
  return values.slice(0, count);
}
function loadWeapons() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'data/weapons/manifest.json'),'utf8'));
  return [].concat(manifest.base || [], manifest.dlc || []).flatMap(file => JSON.parse(fs.readFileSync(path.join(root,'data/weapons',file),'utf8')));
}

const motion = sheet('Motion Values');
const status = sheet('Status MVs');
const attributes = sheet('Physical AtkAttribute');
const headers = motion[0];
const indexRows = rows => new Map(rows.slice(2).filter(row => row[0] && row[1]).map(row => [normalize(row[1]), row]));
const motionRows = indexRows(motion), statusRows = indexRows(status), attributeRows = indexRows(attributes);
const weapons = loadWeapons();

const items = weapons.map(weapon => {
  const key = normalize(weapon.name), row = motionRows.get(key), statusRow = statusRows.get(key), attrRow = attributeRows.get(key);
  if (!row || !statusRow || !attrRow) throw new Error(`missing move data for ${weapon.name}`);
  const moves = [];
  for (let column = 2; column < headers.length; column++) {
    const label = String(headers[column] || '').trim();
    if (!label) continue;
    const motionHits = hits(row[column]);
    if (!motionHits.length) continue;
    const statusHits = hits(statusRow[column]);
    moves.push({
      id:slug(label),
      label,
      motion:motionHits,
      totalMotion:Math.round(motionHits.reduce((sum,value)=>sum+value,0)*100)/100,
      statusMotion:statusHits.length ? statusHits : [100],
      physicalTypes:physicalTypes(attrRow[column],motionHits.length),
      note:String(row[column]).includes('(') ? String(row[column]).slice(String(row[column]).indexOf('(')+1).replace(/\)\s*$/,'') : null
    });
  }
  return { weaponId:weapon.id, weaponName:weapon.name, weaponClass:row[0], moves };
});

const out = {
  schemaVersion:1,
  source:{
    name:'ER - Motion Values and Attack Data',
    url:'https://docs.google.com/spreadsheets/d/1j4bpTbsnp5Xsgw9TP2xv6d8R4qk0ErpE9r_5LGIDraU/edit',
    gameVersion:'App 1.16.1',
    retrieved:'2026-08-06'
  },
  coverage:{ weapons:items.length, weaponsWithMoves:items.filter(item=>item.moves.length).length, moves:items.reduce((sum,item)=>sum+item.moves.length,0) },
  items
};
if (items.length !== 448 || new Set(items.map(item=>item.weaponId)).size !== items.length) throw new Error('weapon move coverage audit failed');
fs.writeFileSync(path.join(root,'data/weapon-moves.json'),JSON.stringify(out));
console.log(`weapon moves: ${out.coverage.weaponsWithMoves}/${out.coverage.weapons} weapons, ${out.coverage.moves} selectable attacks`);
