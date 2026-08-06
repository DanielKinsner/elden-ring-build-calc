#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const workbook = process.argv[2];
if (!workbook || !fs.existsSync(workbook)) {
  console.error('usage: node scripts/import-ammo.js /path/to/motion-values.xlsx');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const extractor = path.join(__dirname, 'extract-xlsx-sheet.js');
function sheet(name) {
  return JSON.parse(execFileSync(process.execPath, [extractor, workbook, name, '--json'], { encoding:'utf8', maxBuffer:64*1024*1024 }));
}
function slug(value) { return String(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function number(value) { return value == null || value === '' ? 0 : +value || 0; }
function statusKey(value) {
  return ({ Bleed:'bleed', Frost:'frost', Poison:'poison', Rot:'rot', Sleep:'sleep', Madness:'madness' })[value] || null;
}

const ammoRows = sheet('AmmoData');
const attackRows = sheet('Ammo Attack Data');
const attackHeaders = attackRows[0];
const attackIndex = new Map(attackRows.slice(1).filter(row => row[1]).map(row => [String(row[1]), row]));
function attackValue(row, name) { return row && row[attackHeaders.indexOf(name)]; }
function component(row, label) {
  if (!row) return null;
  return {
    label:label,
    attackId:String(attackValue(row, 'AtkId')).replace(/\.0$/, ''),
    motion:{
      physical:number(attackValue(row, 'Phys MV')),
      magic:number(attackValue(row, 'Magic MV')),
      fire:number(attackValue(row, 'Fire MV')),
      lightning:number(attackValue(row, 'Ltng MV')),
      holy:number(attackValue(row, 'Holy MV'))
    },
    statusMotion:number(attackValue(row, 'Status MV')),
    physicalType:String(attackValue(row, 'PhysAtkAttribute') || 'Pierce').toLowerCase().replace('standard','physical').replace('thrust','pierce'),
    staminaCost:number(attackValue(row, 'StaminaCost')),
    poiseMotion:number(attackValue(row, 'Poise Dmg MV')),
    pvpMultiplier:number(attackValue(row, 'PvP Dmg Mult')) || 1
  };
}

const items = ammoRows.slice(1).filter(row => row[1]).map(row => {
  const name = String(row[1]);
  const direct = component(attackIndex.get('[Default] ' + name), 'Projectile');
  if (!direct) throw new Error('missing default projectile for ' + name);
  const spread = [1,2,3].map(index => component(attackIndex.get('[Spread Crossbow] ' + name + ' [' + index + ']'), 'Bolt ' + index)).filter(Boolean);
  const type = String(row[0]);
  const status = statusKey(row[16]);
  return {
    id:slug(name),
    sourceId:String(Math.trunc(Number(row[2]))),
    name:name,
    type:type,
    base:{ physical:number(row[3]), magic:number(row[4]), fire:number(row[5]), lightning:number(row[6]), holy:number(row[7]) },
    staminaDamage:number(row[8]),
    poiseDamage:number(row[9]),
    physicalType:String(row[10] || 'Pierce').toLowerCase().replace('standard','physical').replace('thrust','pierce'),
    status:status ? { type:status, buildup:number(row[17]), effect:String(row[18] || '') } : null,
    profiles:{
      standard:{ id:'standard', label:'Standard projectile', components:[direct] },
      spread:spread.length ? { id:'spread', label:'Spread shot', components:spread } : null
    }
  };
});

const out = {
  schemaVersion:1,
  source:{
    name:'ER - Motion Values and Attack Data',
    url:'https://docs.google.com/spreadsheets/d/1j4bpTbsnp5Xsgw9TP2xv6d8R4qk0ErpE9r_5LGIDraU/edit',
    gameVersion:'App 1.16.1',
    retrieved:'2026-08-06'
  },
  compatibility:{ Bow:'Arrow', 'Light Bow':'Arrow', Greatbow:'Great Arrow', Crossbow:'Bolt', Ballista:'Greatbolt' },
  coverage:{
    ammo:items.length,
    arrows:items.filter(item => item.type === 'Arrow').length,
    greatArrows:items.filter(item => item.type === 'Great Arrow').length,
    bolts:items.filter(item => item.type === 'Bolt').length,
    greatbolts:items.filter(item => item.type === 'Greatbolt').length,
    spreadProfiles:items.filter(item => item.profiles.spread).length
  },
  items:items
};

if (items.length !== 65 || new Set(items.map(item => item.id)).size !== items.length) throw new Error('ammo coverage audit failed');
if (items.some(item => !item.profiles.standard.components.length)) throw new Error('ammo projectile coverage audit failed');
fs.writeFileSync(path.join(root, 'data/ammo.json'), JSON.stringify(out));
console.log('ammo: ' + items.length + ' records, ' + out.coverage.spreadProfiles + ' exact Spread Crossbow profiles');
