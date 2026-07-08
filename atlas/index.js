/* index.js — browsable weapon grid for the atlas landing page. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var weapons = await ERData.loadWeapons('../data/');
  weapons.sort(function (a, b) { return a.name.localeCompare(b.name); });

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  function cardHtml(w) {
    return '<a class="atlas-card" href="./weapon.html?id=' + encodeURIComponent(w.id) + '">' +
      '<div class="atlas-card-thumb" data-id="' + w.id + '">' + esc(w.name.charAt(0)) + '</div>' +
      '<div class="atlas-card-name">' + esc(w.name) + '</div>' +
      '<div class="atlas-card-type">' + esc(w.type) + '</div>' +
      '</a>';
  }

  function render(list) {
    var grid = $('atlasGrid');
    grid.innerHTML = list.map(cardHtml).join('');
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
