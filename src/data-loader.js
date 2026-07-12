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

  return { loadWeapons: loadWeapons, loadPresets: loadPresets, loadBuffs: loadBuffs };
});
