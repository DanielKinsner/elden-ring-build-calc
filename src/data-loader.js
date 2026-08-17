/*
 * data-loader.js — fetch + flatten the weapon dataset (browser + Node).
 * Optional convenience for the UI. Reads data/weapons/manifest.json, fetches each
 * listed file, returns one flat array of weapons (each tagged with its `source`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // basePath: where the /data dir is served from (default relative "data/").
  async function loadWeapons(basePath) {
    basePath = basePath || 'data/';
    var manifest = await fetchJSON(basePath + 'weapons/manifest.json');
    var files = [].concat(manifest.base || [], manifest.dlc || []);
    var all = [];
    for (var i = 0; i < files.length; i++) {
      var arr = await fetchJSON(basePath + 'weapons/' + files[i]);
      if (Array.isArray(arr)) all = all.concat(arr);
    }
    return all;
  }

  async function loadPresets(basePath) {
    basePath = basePath || 'data/';
    var p = await fetchJSON(basePath + 'presets.json');
    return p.presets || [];
  }

  async function loadBuffs(basePath) {
    basePath = basePath || 'data/';
    return fetchJSON(basePath + 'buffs.json'); // { categories, buffs, talismans }
  }

  async function loadRites(basePath) {
    basePath = basePath || 'data/';
    return fetchJSON(basePath + 'rites.json');
  }

  async function loadArmor(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'armor.json');
    return data.items || [];
  }

  async function loadTalismans(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'talismans.json');
    return data.items || [];
  }

  async function loadAttackProfiles(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'attack-profiles.json');
    return data.profiles || [];
  }

  async function loadMagic(basePath) {
    basePath = basePath || 'data/';
    var parts = await Promise.all([
      fetchJSON(basePath + 'catalysts.json'),
      fetchJSON(basePath + 'spells.json')
    ]);
    return {
      catalysts: parts[0].items || [],
      curves: parts[0].curves || {},
      spells: parts[1].items || [],
      coverage: { catalysts: parts[0].coverage || {}, spells: parts[1].coverage || {} },
      source: parts[0].source || parts[1].source || null
    };
  }

  async function loadEnemies(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'enemies.json');
    return { items: data.items || [], coverage: data.coverage || {}, source: data.source || null };
  }

  async function loadWeaponMoves(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'weapon-moves.json');
    return { items:data.items || [], coverage:data.coverage || {}, source:data.source || null };
  }

  async function loadAmmo(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'ammo.json');
    return { items:data.items || [], compatibility:data.compatibility || {}, coverage:data.coverage || {}, source:data.source || null };
  }

  async function loadSkills(basePath) {
    basePath = basePath || 'data/';
    var data = await fetchJSON(basePath + 'skills.json');
    return {
      items:data.skills || [], weaponSkills:data.weaponSkills || {}, scaling:data.scaling || {},
      coverage:data.coverage || {}, source:data.source || null
    };
  }

  // Guides data: the complete tracker/reference bundle used by the Guides page.
  async function loadGuides(basePath) {
    basePath = basePath || 'data/';
    var parts = await Promise.all([
      fetchJSON(basePath + 'quests.json'),
      fetchJSON(basePath + 'bosses.json'),
      fetchJSON(basePath + 'endings.json'),
      fetchJSON(basePath + 'progression.json'),
      fetchJSON(basePath + 'scadutree.json'),
      fetchJSON(basePath + 'trophies.json')
    ]);
    return { quests: parts[0], bosses: parts[1], endings: parts[2], progression: parts[3], scadutree: parts[4], trophies: parts[5] };
  }

  async function fetchJSON(url) {
    if (typeof fetch === 'function') {
      var res = await fetch(url);
      if (!res.ok) throw new Error('fetch ' + url + ' -> ' + res.status);
      return res.json();
    }
    // Node fallback
    var fs = require('fs'), path = require('path');
    return JSON.parse(fs.readFileSync(path.resolve(url), 'utf8'));
  }

  return { loadWeapons: loadWeapons, loadPresets: loadPresets, loadBuffs: loadBuffs, loadRites:loadRites, loadArmor: loadArmor, loadTalismans: loadTalismans, loadAttackProfiles: loadAttackProfiles, loadMagic: loadMagic, loadEnemies: loadEnemies, loadWeaponMoves:loadWeaponMoves, loadAmmo:loadAmmo, loadSkills:loadSkills, loadGuides: loadGuides };
});
