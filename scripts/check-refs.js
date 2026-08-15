/*
 * check-refs.js — verify data/compendium.json's cross-references actually resolve:
 * questId -> data/quests.json, bossId -> data/bosses.json, chapters[] -> data/tales.json.
 * Exits non-zero on any dangling reference. Usage: node scripts/check-refs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');

const compendium = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'compendium.json'), 'utf8'));
const quests = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'quests.json'), 'utf8'));
const bosses = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'bosses.json'), 'utf8'));
const tales = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'tales.json'), 'utf8'));

const questIds = new Set(quests.quests.map(q => q.id));
const bossIds = new Set(bosses.bosses.map(b => b.id));
const chapterIds = new Set(tales.works.flatMap(w => w.chapters.map(c => w.id + ':' + c.id)));

const errors = [];
const ids = new Set();
const TYPES = new Set(['npc', 'boss', 'place']);

compendium.entries.forEach((e, i) => {
  const where = e.id || '#' + i;
  if (!e.id) errors.push(where + ': missing id');
  if (ids.has(e.id)) errors.push(where + ': duplicate id');
  ids.add(e.id);
  if (!TYPES.has(e.type)) errors.push(where + ': bad type "' + e.type + '"');
  if (!e.name) errors.push(where + ': missing name');
  if (!e.text) errors.push(where + ': missing text');
  if (e.questId && !questIds.has(e.questId)) errors.push(where + ': questId "' + e.questId + '" not in quests.json');
  if (e.bossId && !bossIds.has(e.bossId)) errors.push(where + ': bossId "' + e.bossId + '" not in bosses.json');
  (e.chapters || []).forEach(ch => {
    if (!ch.includes(':')) errors.push(where + ': chapter "' + ch + '" is unscoped; use workId:chapterId');
    else if (!chapterIds.has(ch)) errors.push(where + ': chapter "' + ch + '" not in tales.json');
  });
});

const counts = { npc: 0, boss: 0, place: 0 };
compendium.entries.forEach(e => { if (TYPES.has(e.type)) counts[e.type]++; });
console.log('entries:', compendium.entries.length, counts);

if (errors.length) {
  console.error('\n' + errors.length + ' reference error(s):');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('all references resolve.');
