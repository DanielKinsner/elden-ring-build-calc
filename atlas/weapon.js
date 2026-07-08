/* weapon.js — wires a single weapon's data + acquisition info to the atlas detail page. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('detailRoot');

  var id = new URLSearchParams(location.search).get('id');
  if (!id) { renderError('No weapon specified.', 'Pick a weapon from the <a href="./">Weapon Atlas</a>.'); return; }

  var weapons = await ERData.loadWeapons('../data/');
  var weapon = weapons.find(function (w) { return w.id === id; });
  if (!weapon) { renderError('Weapon not found.', '"' + id + '" doesn\'t match any weapon in the dataset.'); return; }

  var acquisition = null;
  try {
    var res = await fetch('../data/acquisition/' + id + '.json');
    if (res.ok) acquisition = await res.json();
  } catch (e) { /* network/parse failure — treat as undocumented */ }

  render(weapon, acquisition);

  function renderError(title, body) {
    root.innerHTML = '<section class="panel"><h2>' + title + '</h2><p style="color:var(--dim)">' + body + '</p></section>';
  }

  function verified(field) {
    return !(acquisition && acquisition._verify && acquisition._verify.indexOf(field) >= 0);
  }

  function unverifiedTag(field) {
    return verified(field) ? '' : ' <span class="unverified-tag" title="Not yet confirmed against a second source">unconfirmed</span>';
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  function render(w, acq) {
    document.title = w.name + ' · Weapon Atlas';

    var reqs = w.requirements || {};
    var reqsHtml = Object.keys(reqs).map(function (k) { return '<span>' + k + ' ' + reqs[k] + '</span>'; }).join('') || '<span style="color:var(--dim)">none</span>';

    var identityHtml =
      '<section class="panel weapon-identity">' +
      '  <div class="weapon-thumb-lg" id="weaponThumbLg">' + esc(w.name.charAt(0)) + '</div>' +
      '  <div>' +
      '    <h1 class="weapon-title">' + esc(w.name) + '</h1>' +
      '    <div class="weapon-sub">' + esc(w.type) + (w.category === 'somber' ? ' · Somber' : '') + (w.source === 'dlc' ? ' · Shadow of the Erdtree' : '') + '</div>' +
      '    <div class="reqs mt6">' + reqsHtml + '</div>' +
      '    <div class="k mt6">Weight <span class="v">' + (w.weight != null ? w.weight : '—') + '</span> &nbsp;·&nbsp; Passive <span class="v">' + esc(w.passive || 'None') + '</span></div>' +
      '    <a class="cta ghost mt6" href="../build/">Try this weapon in the calculator →</a>' +
      '  </div>' +
      '</section>';

    var acqHtml;
    if (!acq) {
      acqHtml =
        '<section class="panel">' +
        '  <h2>Where to Find</h2>' +
        '  <p style="color:var(--dim)">Not yet documented for this weapon — check back soon, or see the ' +
        '  <a href="https://eldenring.wiki.gg" target="_blank" rel="noopener">wiki</a> in the meantime.</p>' +
        '</section>';
    } else {
      var tactics = (acq.tactics || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      var graces = (acq.nearbyGraces || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('');
      var source = acq.source ? (esc(acq.source.name || '') + (acq.source.type ? ' <span class="k">(' + esc(acq.source.type) + ')</span>' : '')) : '—';
      acqHtml =
        '<section class="panel">' +
        '  <h2>Where to Find</h2>' +
        '  <div class="k">Region</div><div class="v">' + esc(acq.region || '—') + unverifiedTag('region') + '</div>' +
        '  <div class="k mt6">Location</div><div class="v">' + esc(acq.location || '—') + unverifiedTag('location') + '</div>' +
        '  <div class="k mt6">Source</div><div class="v">' + source + unverifiedTag('source') + '</div>' +
        (tactics ? '  <div class="k mt6">Tactics</div><ul class="atlas-list">' + tactics + '</ul>' : '') +
        (graces ? '  <div class="k mt6">Nearby Sites of Grace</div><ul class="atlas-list">' + graces + '</ul>' + unverifiedTag('nearbyGraces') : '') +
        '</section>';
    }

    var buildsHtml = '';
    if (acq && acq.builds && acq.builds.length) {
      buildsHtml =
        '<section class="panel">' +
        '  <h2>High-End Builds</h2>' +
        '  <div class="build-list">' + acq.builds.map(function (b) {
          return '<div class="build-card"><div class="build-name">' + esc(b.name) + '</div>' +
            '<div class="build-stat">' + esc(b.statFocus || '') + '</div>' +
            '<div class="build-why">' + esc(b.why || '') + '</div></div>';
        }).join('') + '</div>' +
        '</section>';
    }

    var loreHtml = '';
    if (acq && acq.lore) {
      loreHtml =
        '<section class="panel">' +
        '  <h2>Lore</h2>' +
        '  <p class="lore-text">' + esc(acq.lore) + unverifiedTag('lore') + '</p>' +
        '</section>';
    }

    root.innerHTML = identityHtml + acqHtml + buildsHtml + loreHtml;

    var thumb = $('weaponThumbLg');
    var img = new Image();
    img.onload = function () { thumb.innerHTML = ''; thumb.appendChild(img); thumb.classList.add('has-img'); };
    img.onerror = function () { /* keep letter-tile fallback already rendered */ };
    img.src = '../assets/icons/weapons/' + w.id + '.png';
    img.alt = w.name;
  }
})();
