/* index.js — browsable weapon grid for the atlas landing page, grouped by weapon type. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var weapons = await ERData.loadWeapons('../data/');

  // Natural Elden Ring weapon-type progression (unknown types fall to the end, alphabetical).
  var TYPE_ORDER = ['Dagger', 'Straight Sword', 'Greatsword', 'Colossal Sword', 'Thrusting Sword',
    'Heavy Thrusting Sword', 'Curved Sword', 'Curved Greatsword', 'Katana', 'Great Katana', 'Twinblade',
    'Axe', 'Greataxe', 'Hammer', 'Great Hammer', 'Flail', 'Spear', 'Great Spear', 'Halberd', 'Reaper',
    'Whip', 'Fist', 'Hand-to-Hand', 'Claw', 'Beast Claw', 'Backhand Blade', 'Light Greatsword',
    'Perfume Bottle', 'Colossal Weapon', 'Throwing Blade', 'Light Bow', 'Bow', 'Greatbow', 'Crossbow',
    'Ballista', 'Torch', 'Small Shield', 'Medium Shield', 'Greatshield', 'Thrusting Shield'];

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  function cardHtml(w) {
    return '<a class="atlas-card" href="./weapon.html?id=' + encodeURIComponent(w.id) + '">' +
      '<div class="atlas-card-thumb" data-id="' + w.id + '">' + esc(w.name.charAt(0)) + '</div>' +
      '<div class="atlas-card-name">' + esc(w.name) + '</div>' +
      '<div class="atlas-card-type">' + esc(w.type) + '</div>' +
      '</a>';
  }

  function groupByType(list) {
    var groups = {};
    list.forEach(function (w) { (groups[w.type] = groups[w.type] || []).push(w); });
    return Object.keys(groups).sort(function (a, b) {
      var ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
      if (ia < 0 && ib < 0) return a.localeCompare(b);
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }).map(function (t) {
      return { type: t, items: groups[t].sort(function (a, b) { return a.name.localeCompare(b.name); }) };
    });
  }

  function render(list) {
    var grid = $('atlasGrid');
    var html = groupByType(list).map(function (g) {
      return '<div class="atlas-type-header">' + esc(g.type) + '<span class="count">' + g.items.length + '</span></div>' +
        g.items.map(cardHtml).join('');
    }).join('');
    grid.innerHTML = html || '<div class="atlas-empty">No weapons match.</div>';
    grid.querySelectorAll('.atlas-card-thumb').forEach(function (el) {
      var img = new Image();
      img.onload = function () { el.innerHTML = ''; el.appendChild(img); el.classList.add('has-img'); };
      img.src = '../assets/icons/weapons/' + el.getAttribute('data-id') + '.png';
    });
  }

  $('atlasSearch').addEventListener('input', function () {
    var q = this.value.toLowerCase().trim();
    render(!q ? weapons : weapons.filter(function (w) { return w.name.toLowerCase().indexOf(q) >= 0 || w.type.toLowerCase().indexOf(q) >= 0; }));
  });

  render(weapons);
})();
