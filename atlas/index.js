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

  function cardHtml(w) {
    return '<a class="atlas-card" href="./weapon.html?id=' + encodeURIComponent(w.id) + '">' +
      '<div class="atlas-card-thumb" data-id="' + w.id + '">' + esc(w.name.charAt(0)) + '</div>' +
      '<div class="atlas-card-name">' + esc(w.name) + '</div>' +
      '<div class="atlas-card-type">' + esc(w.type) + '</div>' +
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
      html = list.length ? grouped(list) : '<div class="atlas-empty">No weapons match “' + esc(q) + '”.</div>';
    } else {
      list = activeAtk === 'All' ? weapons : weapons.filter(function (w) { return atkOf(w).indexOf(activeAtk) >= 0; });
      html = grouped(list);
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

  renderTabs(); paint();
})();
