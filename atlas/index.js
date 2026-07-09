/* index.js — browsable weapon grid for the atlas, with weapon-type tabs. */
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
  function typeRank(t) { var i = TYPE_ORDER.indexOf(t); return i < 0 ? 999 : i; }

  // ordered list of types actually present in the dataset
  var TYPES = weapons.reduce(function (a, w) { if (a.indexOf(w.type) < 0) a.push(w.type); return a; }, [])
    .sort(function (a, b) { var d = typeRank(a) - typeRank(b); return d || a.localeCompare(b); });

  var activeType = TYPES[0] || 'All'; // default to first type — no giant scroll on load
  var search = $('atlasSearch');

  function cardHtml(w) {
    return '<a class="atlas-card" href="./weapon.html?id=' + encodeURIComponent(w.id) + '">' +
      '<div class="atlas-card-thumb" data-id="' + w.id + '">' + esc(w.name.charAt(0)) + '</div>' +
      '<div class="atlas-card-name">' + esc(w.name) + '</div>' +
      '<div class="atlas-card-type">' + esc(w.type) + '</div>' +
      '</a>';
  }
  function byName(a, b) { return a.name.localeCompare(b.name); }

  function renderTabs() {
    var tabs = ['All'].concat(TYPES);
    $('atlasTabs').innerHTML = tabs.map(function (t) {
      return '<button class="atlas-tab' + (t === activeType ? ' active' : '') + '" data-type="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
  }

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
    var grid = $('atlasGrid'), html;
    if (q) {
      // search spans everything, grouped, and ignores the active tab
      var hits = weapons.filter(function (w) { return w.name.toLowerCase().indexOf(q) >= 0 || w.type.toLowerCase().indexOf(q) >= 0; });
      html = hits.length ? grouped(hits) : '<div class="atlas-empty">No weapons match “' + esc(q) + '”.</div>';
    } else if (activeType === 'All') {
      html = grouped(weapons);
    } else {
      html = weapons.filter(function (w) { return w.type === activeType; }).sort(byName).map(cardHtml).join('');
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
    activeType = b.getAttribute('data-type');
    search.value = '';
    renderTabs(); paint();
  });
  search.addEventListener('input', paint);

  renderTabs(); paint();
})();
