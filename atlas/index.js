/* index.js — browsable weapon atlas, tabbed by ATTACK TYPE (Slash/Pierce/Strike/Standard/Ranged).
   Attack type is derived from weapon type (the real per-weapon atkAttribute isn't in our data
   sources, but weapon type determines it for effectively all weapons — katanas slash/pierce,
   hammers strike, etc.). Within a tab, weapons are grouped by their weapon type. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var weapons = await ERData.loadWeapons('../data/');

  var TYPE_ORDER = ['Dagger', 'Straight Sword', 'Greatsword', 'Colossal Sword', 'Thrusting Sword',
    'Heavy Thrusting Sword', 'Curved Sword', 'Curved Greatsword', 'Katana', 'Great Katana', 'Twinblade',
    'Axe', 'Greataxe', 'Hammer', 'Great Hammer', 'Flail', 'Spear', 'Great Spear', 'Halberd', 'Reaper',
    'Whip', 'Fist', 'Hand-to-Hand', 'Claw', 'Beast Claw', 'Backhand Blade', 'Light Greatsword',
    'Perfume Bottle', 'Colossal Weapon', 'Throwing Blade', 'Light Bow', 'Bow', 'Greatbow', 'Crossbow',
    'Ballista', 'Torch', 'Small Shield', 'Medium Shield', 'Greatshield', 'Thrusting Shield'];

  // weapon type -> physical attack type(s)
  var ATK = {
    'Dagger': ['Slash', 'Pierce'], 'Straight Sword': ['Standard', 'Pierce'], 'Greatsword': ['Standard'],
    'Colossal Sword': ['Standard', 'Strike'], 'Thrusting Sword': ['Pierce'], 'Heavy Thrusting Sword': ['Pierce'],
    'Curved Sword': ['Slash'], 'Curved Greatsword': ['Slash'], 'Katana': ['Slash', 'Pierce'], 'Great Katana': ['Slash'],
    'Twinblade': ['Standard', 'Slash'], 'Axe': ['Slash', 'Standard'], 'Greataxe': ['Standard', 'Slash'],
    'Hammer': ['Strike'], 'Great Hammer': ['Strike'], 'Flail': ['Strike'], 'Spear': ['Pierce'], 'Great Spear': ['Pierce'],
    'Halberd': ['Standard', 'Pierce'], 'Reaper': ['Slash'], 'Whip': ['Slash'], 'Fist': ['Strike'], 'Hand-to-Hand': ['Strike'],
    'Claw': ['Slash', 'Pierce'], 'Beast Claw': ['Slash', 'Strike'], 'Backhand Blade': ['Slash'],
    'Light Greatsword': ['Pierce', 'Standard'], 'Perfume Bottle': ['Strike'], 'Colossal Weapon': ['Strike', 'Standard'],
    'Throwing Blade': ['Pierce'], 'Light Bow': ['Ranged'], 'Bow': ['Ranged'], 'Greatbow': ['Ranged'],
    'Crossbow': ['Ranged'], 'Ballista': ['Ranged'], 'Torch': ['Strike'],
    'Small Shield': ['Strike'], 'Medium Shield': ['Strike'], 'Greatshield': ['Strike'], 'Thrusting Shield': ['Pierce']
  };
  var ATK_ORDER = ['Standard', 'Slash', 'Pierce', 'Strike', 'Ranged'];
  function atkOf(w) { return ATK[w.type] || ['Standard']; }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
  function typeRank(t) { var i = TYPE_ORDER.indexOf(t); return i < 0 ? 999 : i; }
  function byName(a, b) { return a.name.localeCompare(b.name); }

  // which attack types are actually represented
  var ATK_PRESENT = ATK_ORDER.filter(function (a) { return weapons.some(function (w) { return atkOf(w).indexOf(a) >= 0; }); });
  var activeAtk = 'All';
  var search = $('atlasSearch');

  /* ---- filters + sort (T2) ---- */
  var STATUS_KEYS = [['bleed','Bleed'],['frost','Frost'],['poison','Poison'],['rot','Rot'],['sleep','Sleep'],['madness','Madness']];
  var SCALE_KEYS = ['STR','DEX','INT','FAI','ARC'];
  var GOOD_GRADES = ['S','A','B','C']; // "scales in X" = grade C or better at max upgrade
  var fStatus = {}, fScale = {}, fInfusable = false, fSource = null; // fSource: null | 'base' | 'dlc'
  var sortBy = 'type';

  // AR at a neutral reference build (all scaling stats 60 ≈ the soft caps), computed once.
  var REF_BUILD = { STR: 60, DEX: 60, INT: 60, FAI: 60, ARC: 60 };
  var refAR = {};
  weapons.forEach(function (w) { refAR[w.id] = ERCalc.computeAR(REF_BUILD, w, {}).totalAR; });
  function reqTotal(w) {
    var r = w.requirements || {}, t = 0;
    for (var k in r) t += r[k];
    return t;
  }

  function passesFilters(w) {
    var anyStatus = Object.keys(fStatus).some(function (k) { return fStatus[k]; });
    if (anyStatus && !STATUS_KEYS.some(function (s) { return fStatus[s[0]] && w.status && w.status[s[0]] > 0; })) return false;
    var anyScale = Object.keys(fScale).some(function (k) { return fScale[k]; });
    if (anyScale && !SCALE_KEYS.some(function (k) { return fScale[k] && GOOD_GRADES.indexOf(ERCalc.gradeFor((w.scaling || {})[k] || 0)) >= 0; })) return false;
    if (fInfusable && !w.infusable) return false;
    if (fSource && w.source !== fSource) return false;
    return true;
  }

  function chip(key, label, on, group) {
    return '<button class="atlas-chip' + (on ? ' on' : '') + '" data-chip="' + group + ':' + key + '">' + label + '</button>';
  }
  function renderFilters() {
    $('atlasFilters').innerHTML =
      STATUS_KEYS.map(function (s) { return chip(s[0], s[1], fStatus[s[0]], 'status'); }).join('') +
      '<span class="atlas-chip-sep"></span>' +
      SCALE_KEYS.map(function (k) { return chip(k, k, fScale[k], 'scale'); }).join('') +
      '<span class="atlas-chip-sep"></span>' +
      chip('infusable', 'Infusable', fInfusable, 'flag') +
      chip('base', 'Base', fSource === 'base', 'source') +
      chip('dlc', 'DLC', fSource === 'dlc', 'source');
  }
  $('atlasFilters').addEventListener('click', function (e) {
    var b = e.target.closest('[data-chip]'); if (!b) return;
    var parts = b.getAttribute('data-chip').split(':'), group = parts[0], key = parts[1];
    if (group === 'status') fStatus[key] = !fStatus[key];
    else if (group === 'scale') fScale[key] = !fScale[key];
    else if (group === 'flag') fInfusable = !fInfusable;
    else if (group === 'source') fSource = fSource === key ? null : key;
    renderFilters(); paint();
  });
  $('atlasSort').addEventListener('change', function () { sortBy = this.value; paint(); });

  function badgeFor(w) {
    if (sortBy === 'ar') return refAR[w.id] + ' AR';
    if (sortBy === 'weight') return w.weight != null ? w.weight + ' wt' : '— wt';
    if (sortBy === 'req') { var t = reqTotal(w); return t ? t + ' req' : 'no req'; }
    return null;
  }

  function cardHtml(w) {
    var badge = badgeFor(w);
    return '<a class="atlas-card" href="./weapon.html?id=' + encodeURIComponent(w.id) + '">' +
      '<div class="atlas-card-thumb" data-id="' + w.id + '">' + esc(w.name.charAt(0)) + '</div>' +
      '<div class="atlas-card-name">' + esc(w.name) + '</div>' +
      '<div class="atlas-card-type">' + esc(w.type) + '</div>' +
      (badge ? '<div class="atlas-card-badge">' + badge + '</div>' : '') +
      '</a>';
  }

  function renderTabs() {
    var tabs = ['All'].concat(ATK_PRESENT);
    $('atlasTabs').innerHTML = tabs.map(function (t) {
      return '<button class="atlas-tab' + (t === activeAtk ? ' active' : '') + '" data-atk="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
  }

  // group a list by weapon type (headers), in natural order
  function grouped(list) {
    var groups = {};
    list.forEach(function (w) { (groups[w.type] = groups[w.type] || []).push(w); });
    return Object.keys(groups).sort(function (a, b) { var d = typeRank(a) - typeRank(b); return d || a.localeCompare(b); })
      .map(function (t) {
        return '<div class="atlas-type-header">' + esc(t) + '<span class="count">' + groups[t].length + '</span></div>' +
          groups[t].sort(byName).map(cardHtml).join('');
      }).join('');
  }

  function paint() {
    var q = search.value.toLowerCase().trim();
    var grid = $('atlasGrid'), list, html;
    if (q) {
      list = weapons.filter(function (w) { return w.name.toLowerCase().indexOf(q) >= 0 || w.type.toLowerCase().indexOf(q) >= 0; });
    } else {
      list = activeAtk === 'All' ? weapons : weapons.filter(function (w) { return atkOf(w).indexOf(activeAtk) >= 0; });
    }
    list = list.filter(passesFilters);
    if (!list.length) {
      html = '<div class="atlas-empty">No weapons match' + (q ? ' “' + esc(q) + '”' : ' these filters') + '.</div>';
    } else if (sortBy === 'type') {
      html = grouped(list);
    } else {
      var sorted = list.slice().sort(function (a, b) {
        if (sortBy === 'ar') return refAR[b.id] - refAR[a.id];
        if (sortBy === 'weight') return (a.weight != null ? a.weight : 1e9) - (b.weight != null ? b.weight : 1e9);
        return reqTotal(a) - reqTotal(b);
      });
      html = '<div class="atlas-type-header">' + { ar: 'By Attack Rating — all stats 60, max upgrade', weight: 'Lightest first', req: 'Lowest stat requirements first' }[sortBy] +
        '<span class="count">' + sorted.length + '</span></div>' + sorted.map(cardHtml).join('');
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.atlas-card-thumb').forEach(function (el) {
      var img = new Image();
      img.onload = function () { el.innerHTML = ''; el.appendChild(img); el.classList.add('has-img'); };
      img.src = '../assets/icons/weapons/' + el.getAttribute('data-id') + '.png';
    });
  }

  $('atlasTabs').addEventListener('click', function (e) {
    var b = e.target.closest('.atlas-tab'); if (!b) return;
    activeAtk = b.getAttribute('data-atk'); search.value = '';
    renderTabs(); paint();
  });
  search.addEventListener('input', paint);

  renderTabs(); renderFilters(); paint();
})();
