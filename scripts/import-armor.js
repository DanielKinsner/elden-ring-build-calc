#!/usr/bin/env node
/*
 * Convert the community-maintained 1.16 armor corpus into this project's
 * data-only schema. No optimizer code is copied. Usage:
 *   node scripts/import-armor.js /path/to/EldenRingArmorOptimizer/armor/data/armor.js
 */
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');
var input = process.argv[2];
if (!input) throw new Error('Pass the source armor.js path');

var source = fs.readFileSync(input, 'utf8').replace(/^const armor\s*=\s*/, 'globalThis.armor = ');
var sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
if (!Array.isArray(sandbox.armor)) throw new Error('Source did not expose an armor array');

var slots = { 1: 'head', 2: 'body', 3: 'arms', 4: 'legs' };
var fields = ['physical', 'strike', 'slash', 'pierce', 'magic', 'fire', 'lightning', 'holy'];
var resists = ['immunity', 'robustness', 'focus', 'vitality'];
var items = sandbox.armor.map(function (item) {
  var out = {
    id: String(item.itemID), name: item.name, setId: item.setID,
    slot: slots[item.slotType], weight: item.weight, poise: item.poise,
    negation: {}, resistance: {}
  };
  fields.forEach(function (key) { out.negation[key] = item[key]; });
  resists.forEach(function (key) { out.resistance[key] = item[key]; });
  return out;
}).filter(function (item) { return item.slot; });

var output = {
  schemaVersion: 1,
  gameVersion: '1.16',
  generatedAt: '2026-08-05',
  provenance: {
    source: 'EldenRingArmorOptimizer armor data',
    url: 'https://github.com/jerpdoesgames/EldenRingArmorOptimizer',
    sourceCommit: '2ad5e0ee88209855531a8b3ec4bf5d68bb1b0105',
    note: 'Factual equipment values transformed into the local schema; no optimizer code copied.'
  },
  items: items
};

var outputPath = path.join(__dirname, '..', 'data', 'armor.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log('Wrote ' + items.length + ' armor pieces to ' + outputPath);
