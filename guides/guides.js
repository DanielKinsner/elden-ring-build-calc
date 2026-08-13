/* guides.js — quest tracker (T9) + boss & endings guides (T10). Progress lives in localStorage. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var content = $('guideContent');

  var data = await ERData.loadGuides('../data/');
  var QUESTS = data.quests, BOSSES = data.bosses, ENDINGS = data.endings, PROG = data.progression, SCADU = data.scadutree;

  /* ---- portrait manifests: { <id>: "<filename>" }, scraped by scripts/fetch-portraits.js.
     Missing id = letter-in-a-box fallback (partial coverage ships fine). ---- */
  async function loadManifest(url) {
    try { var r = await fetch(url); return r.ok ? r.json() : {}; } catch (e) { return {}; }
  }
  var portraitManifests = await Promise.all([
    loadManifest('../assets/icons/npcs/manifest.json'),
    loadManifest('../assets/icons/bosses/manifest.json')
  ]);
  var NPC_PORTRAITS = portraitManifests[0], BOSS_PORTRAITS = portraitManifests[1];

  /* ---- compendium: lean NPC/boss/place reference, cross-linked everywhere ---- */
  var COMPENDIUM = (await (async function () {
    try { var r = await fetch('../data/compendium.json'); return r.ok ? r.json() : { entries: [] }; } catch (e) { return { entries: [] }; }
  })()).entries;
  var TALES_CHAPTERS = {}; // chapterId -> { workId, num, title }
  (await (async function () {
    try { var r = await fetch('../data/tales.json'); return r.ok ? r.json() : { works: [] }; } catch (e) { return { works: [] }; }
  })()).works.forEach(function (w) {
    w.chapters.forEach(function (c) { TALES_CHAPTERS[c.id] = { workId: w.id, num: c.num, title: c.title }; });
  });
  function avatar(manifest, dir, id, name, baseCls, modCls) {
    var extra = modCls ? ' ' + modCls : '';
    var file = manifest[id];
    if (file) return '<img class="' + baseCls + extra + '" src="../assets/icons/' + dir + '/' + esc(file) + '" alt="">';
    var letter = esc((name || '?').trim().charAt(0).toUpperCase() || '?');
    return '<span class="' + baseCls + ' ' + baseCls + '-letter' + extra + '">' + letter + '</span>';
  }

  /* ---- progress store: { steps: {stepId:1}, open: {questId:1} } ---- */
  var LS_KEY = 'er-guides';
  var store = (function () {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') || {}; } catch (e) { return {}; }
  })();
  store.steps = store.steps || {};
  store.open = store.open || {};
  store.bosses = store.bosses || {};
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  /* '(verify)' in guide text = community claim not re-confirmed in-game; render as the site's unverified tag */
  function verifyTag(s) { return esc(s).replace(/\s*\(verify[^)]*\)/gi, ' <span class="unverified-tag">unverified</span>'); }

  /* ---- hero header: title + progress ring + stat strip ---- */
  function ring(pct) {
    var r = 26, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle class="ring-bg" cx="32" cy="32" r="' + r + '"/>' +
      '<circle class="ring-fg" cx="32" cy="32" r="' + r + '" stroke-dasharray="' + (c * pct / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 32 32)"/>' +
      '<text x="32" y="34">' + pct + '%</text>' +
      '<text class="ring-cap" x="32" y="44">DONE</text></svg>';
  }
  function hero(title, sub, pct, stats) {
    return '<div class="hero-head">' +
      '<div class="hero-lead"><div class="hero-eyebrow">Guides</div>' +
      '<h1 class="hero-title">' + title + '</h1>' +
      '<p class="hero-sub">' + sub + '</p></div>' +
      '<div class="hero-stats">' + (pct == null ? '' : ring(pct)) +
      '<div class="hero-stat-list">' + stats.map(function (s) {
        return '<div class="hero-stat"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>';
      }).join('') + '</div></div></div>';
  }
  function rulesDetails(title, items, open) {
    return '<details class="guide-rules guide-rules-details"' + (open ? ' open' : '') + '><summary><span class="guide-rules-title">' + title + '</span></summary><ul>' +
      items.map(function (r) { return '<li>' + verifyTag(r) + '</li>'; }).join('') + '</ul></details>';
  }

  /* ---- tabs (hash-routed so links can target a tab) ---- */
  var TABS = { quests: renderQuests, walkthrough: renderWalkthrough, bosses: renderBosses, endings: renderEndings, compendium: renderCompendium };
  var tabBtns = Array.prototype.slice.call(document.querySelectorAll('#guideTabs .atlas-tab'));
  function setTab(name, questToOpen) {
    if (!TABS[name]) name = 'quests';
    tabBtns.forEach(function (b) {
      var on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    TABS[name]();
    if (questToOpen) {
      store.sel = questToOpen; save();
      TABS[name]();
      var el = document.getElementById('qtDetail');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  tabBtns.forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });

  /* ---- quest tracker ---- */
  function questProgress(q) {
    var done = q.steps.filter(function (s) { return store.steps[s.id]; }).length;
    return { done: done, total: q.steps.length };
  }
  function overallProgress() {
    var done = 0, total = 0;
    QUESTS.quests.forEach(function (q) { var p = questProgress(q); done += p.done; total += p.total; });
    return { done: done, total: total };
  }
  var questFilter = ''; // survives rerenders (not persisted)
  function selectedQuest() {
    var q = QUESTS.quests.find(function (x) { return x.id === store.sel; });
    if (q) return q;
    // default: first started-but-unfinished questline, else the first
    return QUESTS.quests.find(function (x) {
      var p = questProgress(x); return p.done > 0 && p.done < p.total;
    }) || QUESTS.quests[0];
  }
  function questDetail(q) {
    var p = questProgress(q);
    return '<div class="qt-detail-head">' +
        avatar(NPC_PORTRAITS, 'npcs', q.id, q.name, 'qt-avatar', 'qt-avatar-detail') +
        '<span class="qt-detail-name">' + esc(q.name) + '</span>' +
        (q.major ? '<span class="quest-major">MAJOR</span>' : '') +
        '<span class="qt-detail-cluster">' + esc(q.cluster) + '</span>' +
        '<span class="quest-count' + (p.done === p.total ? ' done' : '') + '" style="margin-left:auto">' + p.done + '/' + p.total + '</span>' +
      '</div>' +
      '<div class="quest-progress"><i style="width:' + (p.total ? Math.round(100 * p.done / p.total) : 0) + '%"></i></div>' +
      '<p class="quest-tagline">' + esc(q.tagline) + '</p>' +
      '<p class="quest-reward"><span class="k">Reward</span> ' + verifyTag(q.reward) +
        (q.endingUnlock ? ' · <a href="#endings" class="quest-ending-link" data-ending="' + q.endingUnlock + '">ending route</a>' : '') + '</p>' +
      '<div class="quest-steps">' +
        q.steps.map(function (s, i) {
          var on = !!store.steps[s.id];
          return '<label class="quest-step' + (on ? ' done' : '') + '">' +
            '<input type="checkbox" data-step="' + s.id + '"' + (on ? ' checked' : '') + '>' +
            '<span class="quest-step-num">' + (i + 1) + '</span>' +
            '<span class="quest-step-text">' + verifyTag(s.text) + '</span></label>';
        }).join('') +
      '</div>' +
      (q.warnings && q.warnings.length ?
        '<div class="quest-warnings">' + q.warnings.map(function (w) {
          return '<div class="quest-warning">⚠ ' + verifyTag(w) + '</div>';
        }).join('') + '</div>' : '') +
      '<button class="quest-reset" data-reset="' + q.id + '">Reset progress</button>';
  }
  /* ---- right rail (>=1280px): region progress, active questlines, legend ---- */
  function questRail(sel) {
    var byRegion = {};
    QUESTS.quests.forEach(function (q) {
      var p = questProgress(q);
      var r = byRegion[q.region] || (byRegion[q.region] = { done: 0, total: 0 });
      r.done += p.done; r.total += p.total;
    });
    var regions = Object.keys(byRegion).map(function (name) {
      return { name: name, done: byRegion[name].done, total: byRegion[name].total };
    }).sort(function (a, b) { return b.total - a.total; });

    var active = QUESTS.quests.filter(function (q) {
      var p = questProgress(q);
      return p.done > 0 && p.done < p.total;
    });

    var html = '<div class="qt-rail">';
    html += '<div class="qt-rail-section"><h4 class="qt-rail-title">Progress by region</h4>' +
      regions.map(function (r) {
        var pct = r.total ? Math.round(100 * r.done / r.total) : 0;
        return '<div class="qt-rail-region"><span class="qt-rail-region-row"><span>' + esc(r.name) + '</span>' +
          '<span class="qt-rail-region-count">' + r.done + '/' + r.total + '</span></span>' +
          '<span class="quest-progress"><i style="width:' + pct + '%"></i></span></div>';
      }).join('') + '</div>';

    html += '<div class="qt-rail-section"><h4 class="qt-rail-title">Active questlines</h4>' +
      (active.length ? active.map(function (q) {
        var p = questProgress(q);
        return '<button class="qt-rail-active' + (q.id === sel.id ? ' sel' : '') + '" data-quest="' + q.id + '">' +
          '<span class="qt-rail-active-name">' + esc(q.name) + '</span>' +
          '<span class="qt-rail-active-count">' + p.done + '/' + p.total + '</span></button>';
      }).join('') : '<p class="qt-rail-empty">None in progress — pick a questline to start.</p>') + '</div>';

    html += '<div class="qt-rail-section"><h4 class="qt-rail-title">Legend</h4><ul class="qt-rail-legend">' +
      '<li><span class="quest-major">MAJOR</span> major branching questline</li>' +
      '<li><span class="qt-legend-done">✓</span> complete</li>' +
      '<li><span class="qt-legend-warn">⚠</span> fail-trigger — read before acting</li>' +
      '</ul></div>';

    return html + '</div>';
  }
  function renderQuests() {
    var all = overallProgress();
    var started = 0, completed = 0;
    QUESTS.quests.forEach(function (q) {
      var p = questProgress(q);
      if (p.done === p.total) completed++;
      else if (p.done > 0) started++;
    });
    var pct = all.total ? Math.round(100 * all.done / all.total) : 0;
    var sel = selectedQuest();

    var html = hero('Quest Tracker',
      'Track the NPC questlines across the Lands Between — steps, rewards, and the fail-triggers that lock you out. Saved in this browser.',
      pct, [
        ['Active questlines', started],
        ['Completed', completed],
        ['Steps completed', all.done + ' / ' + all.total],
        ['NPCs met', (started + completed) + ' / ' + QUESTS.quests.length]
      ]);
    html += rulesDetails('⚠ Survival rules', QUESTS.generalRules, false);
    html += '<div class="qt-layout"><div class="qt-list">' +
      '<input class="qt-filter" id="qtFilter" type="search" placeholder="Filter questlines…" value="' + esc(questFilter) + '">' +
      QUESTS.quests.map(function (q) {
        var p = questProgress(q);
        var complete = p.done === p.total;
        var qPct = p.total ? Math.round(100 * p.done / p.total) : 0;
        return '<button class="qt-item' + (q.id === sel.id ? ' sel' : '') + (complete ? ' complete' : '') + '" data-quest="' + q.id + '" data-name="' + esc((q.name + ' ' + q.cluster).toLowerCase()) + '">' +
          '<span class="qt-item-row">' +
          avatar(NPC_PORTRAITS, 'npcs', q.id, q.name, 'qt-avatar') +
          '<span class="qt-item-body">' +
          '<span class="qt-item-top"><span class="qt-item-name">' + esc(q.name) + '</span>' +
            (q.major ? '<span class="quest-major">MAJOR</span>' : '') +
            '<span class="qt-item-count' + (complete ? ' done' : '') + '">' + (complete ? '✓ ' : '') + p.done + '/' + p.total + '</span></span>' +
          '<span class="qt-item-cluster">' + esc(q.cluster) + '</span>' +
          '<span class="quest-progress"><i style="width:' + qPct + '%"></i></span>' +
          '</span></span>' +
        '</button>';
      }).join('') +
      '</div><div class="qt-detail" id="qtDetail">' + questDetail(sel) + '</div>' +
      questRail(sel) +
      '</div>';
    content.innerHTML = html;

    function applyFilter() {
      var f = questFilter.trim().toLowerCase();
      Array.prototype.forEach.call(content.querySelectorAll('.qt-item'), function (el) {
        el.style.display = !f || el.dataset.name.indexOf(f) >= 0 ? '' : 'none';
      });
    }
    applyFilter();
    $('qtFilter').addEventListener('input', function () { questFilter = this.value; applyFilter(); });
    Array.prototype.forEach.call(content.querySelectorAll('.qt-item, .qt-rail-active'), function (h) {
      h.addEventListener('click', function () {
        store.sel = h.dataset.quest; save(); renderQuests();
        if (window.matchMedia('(max-width: 900px)').matches) {
          document.getElementById('qtDetail').scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      });
    });
    Array.prototype.forEach.call(content.querySelectorAll('input[data-step]'), function (c) {
      c.addEventListener('change', function () {
        if (c.checked) store.steps[c.dataset.step] = 1; else delete store.steps[c.dataset.step];
        save(); renderQuests();
      });
    });
    Array.prototype.forEach.call(content.querySelectorAll('.quest-reset'), function (b) {
      b.addEventListener('click', function () {
        var q = QUESTS.quests.find(function (x) { return x.id === b.dataset.reset; });
        if (q) q.steps.forEach(function (s) { delete store.steps[s.id]; });
        save(); renderQuests();
      });
    });
    Array.prototype.forEach.call(content.querySelectorAll('.quest-ending-link'), function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); setTab('endings'); });
    });
  }

  /* ---- story walkthrough ---- */
  function checklistRow(s, i) {
    var on = !!store.steps[s.id];
    return '<label class="quest-step' + (on ? ' done' : '') + '" id="rstep-' + s.id + '">' +
      '<input type="checkbox" data-step="' + s.id + '"' + (on ? ' checked' : '') + '>' +
      '<span class="quest-step-num">' + (i + 1) + '</span>' +
      '<span class="quest-step-text">' + verifyTag(s.text) + '</span></label>';
  }
  function rulesBox(title, items) {
    return '<div class="guide-rules"><span class="guide-rules-title">' + title + '</span><ul>' +
      items.map(function (r) { return '<li>' + verifyTag(r) + '</li>'; }).join('') + '</ul></div>';
  }
  function renderWalkthrough() {
    var done = PROG.steps.filter(function (s) { return store.steps[s.id]; }).length;
    var html = hero('Walkthrough',
      esc(PROG.intro),
      Math.round(100 * done / PROG.steps.length), [
        ['Route steps done', done + ' / ' + PROG.steps.length],
        ['Base-game stages', PROG.route.length],
        ['DLC stages', PROG.dlc.route.length]
      ]);
    html += '<h3 class="guide-h3">The route at a glance <span class="guide-h3-sub">levels are comfort ranges, not requirements</span></h3>';
    html += '<div class="route-scroll"><table class="route-table"><thead><tr><th>#</th><th>Region</th><th>Boss → payoff</th><th>≈ Level</th><th>Weapon</th></tr></thead><tbody>' +
      PROG.route.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.region) + '</b> <small>' + esc(r.type) + '</small></td>' +
          '<td>' + esc(r.boss) + '</td><td>' + esc(r.level) + '</td><td>' + esc(r.weapon) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="guide-note">' + esc(PROG.routeNote) + '</p>';
    html += '<h3 class="guide-h3">Step by step <span class="guide-h3-sub">check them off — saved in this browser</span></h3>';
    html += '<div class="quest-steps walk-steps">' + PROG.steps.map(checklistRow).join('') + '</div>';
    html += rulesBox('◈ What to level', PROG.statTargets);
    html += rulesBox('◈ Am I ready to move on?', PROG.readiness);
    html += rulesBox('◈ Power-ups to grab everywhere', PROG.powerUps);
    html += rulesBox('⚠ Gotchas & missables', PROG.gotchas);
    html += rulesBox('◈ Optional side-branches', PROG.sideBranches);
    html += '<h3 class="guide-h3">' + esc(PROG.dlc.title) + '</h3>';
    html += rulesBox('◈ Getting in', PROG.dlc.entry);
    html += rulesBox('◈ Scadutree Blessing — the DLC’s real leveling', PROG.dlc.scadutree);
    /* the blessing table: costs from data, multipliers from the engine */
    var cum = 0;
    html += '<div class="route-scroll"><table class="route-table scadu-table"><thead><tr>' +
      '<th>Blessing</th><th>Fragments</th><th>Total spent</th><th>Damage dealt</th><th>Damage taken</th></tr></thead><tbody>' +
      SCADU.costs.map(function (cost, i) {
        var lvl = i + 1; cum += cost;
        var sc = ERCalc.scadutree(lvl);
        return '<tr><td>' + lvl + '</td><td>' + cost + '</td><td>' + cum + '</td>' +
          '<td>×' + sc.attack.toFixed(2) + '</td><td>−' + sc.negationPct + '%</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="guide-note">' + esc(SCADU.costNote) + ' Try your blessing level on the <a href="../build/">calculator</a> — the ☾ slider under the AR dial shows your Land-of-Shadow damage.</p>';
    html += rulesBox('◈ ' + SCADU.revered.title, SCADU.revered.notes);
    html += rulesBox('◈ Where fragments hide', SCADU.whereToFind);
    html += '<div class="route-scroll"><table class="route-table"><thead><tr><th>#</th><th>Region</th><th>Boss</th><th>Note</th></tr></thead><tbody>' +
      PROG.dlc.route.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.region) + '</b></td><td>' + esc(r.boss) + '</td><td>' + esc(r.note) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    content.innerHTML = html;
    Array.prototype.forEach.call(content.querySelectorAll('input[data-step]'), function (c) {
      c.addEventListener('change', function () {
        if (c.checked) store.steps[c.dataset.step] = 1; else delete store.steps[c.dataset.step];
        save(); renderWalkthrough();
      });
    });
  }

  /* ---- boss guide ---- */
  /* a "Weak" chip that leads with a status name becomes a link into the Atlas,
     pre-filtered to weapons that build that status (atlas reads ?status=&sort=) */
  var STATUS_LINK = { 'scarlet rot': 'rot', bleed: 'bleed', frost: 'frost', poison: 'poison', rot: 'rot', sleep: 'sleep', madness: 'madness' };
  function statusLink(x) {
    var m = /^(scarlet rot|bleed|frost|poison|rot|sleep|madness)\b/i.exec(String(x));
    return m ? STATUS_LINK[m[1].toLowerCase()] : null;
  }
  function chipList(cls, label, items) {
    if (!items || !items.length) return '';
    return '<div class="boss-row"><span class="k">' + label + '</span><span class="boss-chips">' +
      items.map(function (x) {
        var st = cls === 'weak' ? statusLink(x) : null;
        if (st) return '<a class="boss-chip ' + cls + ' boss-chip-link" href="../atlas/?status=' + st + '&sort=ar" title="Open the Weapon Atlas — weapons that build ' + st + ', ranked by AR">' + verifyTag(x) + ' ⚔</a>';
        return '<span class="boss-chip ' + cls + '">' + verifyTag(x) + '</span>';
      }).join('') + '</span></div>';
  }
  function bossCard(b) {
    var felled = !!store.bosses[b.id];
    return '<div class="boss-card' + (felled ? ' felled' : '') + '" id="boss-' + b.id + '">' +
      '<div class="boss-head">' +
        '<span class="boss-head-main">' +
        avatar(BOSS_PORTRAITS, 'bosses', b.id, b.name, 'boss-thumb') +
        '<span class="boss-name">' + esc(b.name) + '</span>' +
        '</span>' +
        '<span class="boss-badges">' +
        (b.dlc ? '<span class="boss-opt boss-dlc">DLC</span>' : (b.required ? '<span class="boss-req">REQUIRED</span>' : '<span class="boss-opt">OPTIONAL</span>')) +
        '<label class="boss-felled" title="Mark beaten"><input type="checkbox" data-boss="' + b.id + '"' + (felled ? ' checked' : '') + '> ☠</label>' +
        '</span></div>' +
      '<div class="boss-loc">' + esc(b.location) + '</div>' +
      (b.greatRune ? '<div class="boss-rune">◈ ' + verifyTag(b.greatRune) + '</div>' : '') +
      chipList('weak', 'Weak', b.weak) +
      chipList('resist', 'Resists', b.resists) +
      chipList('immune', 'Immune', b.immune) +
      '<div class="boss-row"><span class="k">Bring</span><ul class="boss-list">' +
        b.bring.map(function (x) { return '<li>' + verifyTag(x) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="boss-row"><span class="k">Tips</span><ul class="boss-list">' +
        b.tips.map(function (x) { return '<li>' + verifyTag(x) + '</li>'; }).join('') + '</ul></div>' +
    '</div>';
  }
  function renderBosses() {
    var req = BOSSES.bosses.filter(function (b) { return b.required; });
    var opt = BOSSES.bosses.filter(function (b) { return !b.required && !b.dlc; });
    var dlc = BOSSES.bosses.filter(function (b) { return b.dlc; });
    function felledCount(list) {
      var n = list.filter(function (b) { return store.bosses[b.id]; }).length;
      return n ? ' <span class="guide-h3-sub">' + n + '/' + list.length + ' felled</span>' : '';
    }
    var felledAll = BOSSES.bosses.filter(function (b) { return store.bosses[b.id]; }).length;
    content.innerHTML =
      hero('Bosses',
        'Cheat-sheet for the required path, the big optional fights, and the DLC remembrances. Tick ☠ when a boss falls. ⚠ Endgame boss names below.',
        Math.round(100 * felledAll / BOSSES.bosses.length), [
          ['Felled', felledAll + ' / ' + BOSSES.bosses.length],
          ['Required', req.filter(function (b) { return store.bosses[b.id]; }).length + ' / ' + req.length],
          ['DLC remembrances', dlc.filter(function (b) { return store.bosses[b.id]; }).length + ' / ' + dlc.length]
        ]) +
      '<div class="guide-rules"><span class="guide-rules-title">◈ Bring to ANY boss</span><ul>' +
        BOSSES.universalTips.map(function (t) { return '<li>' + verifyTag(t) + '</li>'; }).join('') + '</ul></div>' +
      '<h3 class="guide-h3">Required bosses <span class="guide-h3-sub">in rough encounter order</span>' + felledCount(req) + '</h3>' +
      '<div class="boss-grid">' + req.map(bossCard).join('') + '</div>' +
      '<h3 class="guide-h3">Key optional bosses' + felledCount(opt) + '</h3>' +
      '<div class="boss-grid">' + opt.map(bossCard).join('') + '</div>' +
      '<h3 class="guide-h3">Shadow of the Erdtree <span class="guide-h3-sub">remembrance bosses — Scadutree Blessing beats levels</span>' + felledCount(dlc) + '</h3>' +
      '<div class="boss-grid">' + dlc.map(bossCard).join('') + '</div>';
    Array.prototype.forEach.call(content.querySelectorAll('input[data-boss]'), function (c) {
      c.addEventListener('change', function () {
        if (c.checked) store.bosses[c.dataset.boss] = 1; else delete store.bosses[c.dataset.boss];
        save(); renderBosses();
      });
    });
  }

  /* ---- endings guide ---- */
  function renderEndings() {
    var KIND = { 'default': 'No quest needed', 'mending-rune': 'Mending Rune', 'npc-summon': 'NPC summon', 'override': 'Overrides all others' };
    content.innerHTML =
      hero('Endings',
        'How each ending unlocks — spoiler-light: the route, not what happens.',
        null, [
          ['Endings', ENDINGS.endings.length],
          ['Need a questline', ENDINGS.endings.filter(function (e) { return e.questId; }).length],
          ['Available by default', ENDINGS.endings.filter(function (e) { return e.kind === 'default'; }).length]
        ]) +
      '<div class="guide-rules"><span class="guide-rules-title">How endings work</span><ul>' +
        ENDINGS.howItWorks.map(function (t) { return '<li>' + verifyTag(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="ending-list">' +
      ENDINGS.endings.map(function (e) {
        return '<div class="ending-card' + (e.kind === 'override' ? ' danger' : '') + '" id="ending-' + e.id + '">' +
          '<div class="ending-head"><span class="ending-name">' + esc(e.name) + '</span>' +
            '<span class="ending-kind">' + (KIND[e.kind] || esc(e.kind)) + '</span></div>' +
          '<p class="ending-how">' + verifyTag(e.how) + '</p>' +
          (e.pointOfNoReturn ? '<p class="ending-ponr">⚠ ' + verifyTag(e.pointOfNoReturn) + '</p>' : '') +
          (e.questId ? '<a class="ending-quest-link" href="#quests" data-quest="' + e.questId + '">Track this questline →</a>' : '') +
        '</div>';
      }).join('') + '</div>';
    Array.prototype.forEach.call(content.querySelectorAll('.ending-quest-link'), function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); setTab('quests', a.dataset.quest); });
    });
  }

  /* ---- compendium: lean NPC/boss/place reference, cross-linked to tracker/bosses/tales ---- */
  var compendiumFilter = 'all'; // survives rerenders (not persisted)
  function compendiumLinks(e) {
    var links = [];
    if (e.type === 'npc' && e.questId) links.push('<a href="#quests" class="comp-link" data-quest="' + e.questId + '">Track questline →</a>');
    if (e.type === 'boss' && e.bossId) links.push('<a href="#bosses" class="comp-link" data-boss="' + e.bossId + '">Boss card →</a>');
    if (e.chapters && e.chapters[0]) {
      var ch = TALES_CHAPTERS[e.chapters[0]];
      if (ch) {
        links.push('<a href="../tales/read.html?work=' + ch.workId + '&ch=' + e.chapters[0] + '" class="comp-link">In the Tales: ' +
          esc(ch.num ? ch.num + '. ' + ch.title : ch.title) + ' →</a>');
      }
    }
    return links;
  }
  function compendiumCard(e) {
    var portraitHtml = e.type === 'npc' ? avatar(NPC_PORTRAITS, 'npcs', e.questId, e.name, 'qt-avatar') :
      e.type === 'boss' ? avatar(BOSS_PORTRAITS, 'bosses', e.bossId, e.name, 'boss-thumb') :
      '<span class="qt-avatar qt-avatar-letter">' + esc((e.name || '?').charAt(0).toUpperCase()) + '</span>';
    var links = compendiumLinks(e);
    return '<div class="comp-card" id="compendium-' + e.id + '" data-type="' + e.type + '">' +
      '<div class="comp-card-head">' + portraitHtml +
        '<span class="comp-card-name">' + esc(e.name) + '</span>' +
        '<span class="comp-type-badge comp-type-' + e.type + '">' + e.type.toUpperCase() + '</span>' +
      '</div>' +
      '<p class="comp-text">' + esc(e.text) + '</p>' +
      (links.length ? '<div class="comp-links">' + links.join('') + '</div>' : '') +
    '</div>';
  }
  function renderCompendium() {
    var counts = { npc: 0, boss: 0, place: 0 };
    COMPENDIUM.forEach(function (e) { if (counts[e.type] != null) counts[e.type]++; });
    var shown = compendiumFilter === 'all' ? COMPENDIUM : COMPENDIUM.filter(function (e) { return e.type === compendiumFilter; });
    content.innerHTML =
      hero('Compendium',
        'Every quest NPC, every boss, and the regions between them — route facts only, cross-linked to the tracker and the Tales.',
        null, [
          ['Entries', COMPENDIUM.length],
          ['NPCs', counts.npc],
          ['Bosses', counts.boss],
          ['Places', counts.place]
        ]) +
      '<div class="comp-filters">' +
        ['all', 'npc', 'boss', 'place'].map(function (f) {
          var label = f === 'all' ? 'All' : f === 'npc' ? 'NPCs' : f === 'boss' ? 'Bosses' : 'Places';
          return '<button class="atlas-tab' + (compendiumFilter === f ? ' active' : '') + '" data-filter="' + f + '">' + label + '</button>';
        }).join('') +
      '</div>' +
      '<div class="comp-grid">' + shown.map(compendiumCard).join('') + '</div>';

    Array.prototype.forEach.call(content.querySelectorAll('.comp-filters [data-filter]'), function (b) {
      b.addEventListener('click', function () { compendiumFilter = b.dataset.filter; renderCompendium(); });
    });
    Array.prototype.forEach.call(content.querySelectorAll('.comp-link[data-quest]'), function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); setTab('quests', a.dataset.quest); });
    });
    Array.prototype.forEach.call(content.querySelectorAll('.comp-link[data-boss]'), function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault(); setTab('bosses');
        var el = document.getElementById('boss-' + a.dataset.boss);
        if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }

  /* ---- instant search: quests, steps, bosses, endings, route (Ctrl+K, /) ---- */
  var SEARCH_INDEX = (function () {
    var idx = [];
    QUESTS.quests.forEach(function (q) {
      idx.push({ group: 'Quests', label: q.name, sub: q.cluster, questId: q.id });
      q.steps.forEach(function (s) {
        idx.push({ group: 'Steps', label: s.text, sub: q.name, questId: q.id });
      });
    });
    BOSSES.bosses.forEach(function (b) {
      idx.push({ group: 'Bosses', label: b.name, sub: b.location, bossId: b.id });
    });
    ENDINGS.endings.forEach(function (e) {
      idx.push({ group: 'Endings', label: e.name, sub: e.how, endingId: e.id });
    });
    PROG.steps.forEach(function (s) {
      idx.push({ group: 'Route', label: s.text, sub: 'Walkthrough', stepId: s.id });
    });
    COMPENDIUM.forEach(function (e) {
      idx.push({ group: 'Compendium', label: e.name, sub: e.type === 'npc' ? 'NPC' : e.type === 'boss' ? 'Boss' : 'Place', compendiumId: e.id });
    });
    return idx;
  })();

  var searchInput = $('guideSearch'), searchResults = $('guideSearchResults');
  var searchActive = -1, searchItems = [], searchHits = [];

  function searchMatches(q) {
    q = q.toLowerCase().trim();
    if (!q) return [];
    return SEARCH_INDEX.filter(function (e) { return e.label.toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
  }
  function renderSearchResults(hits) {
    searchActive = -1;
    if (!hits.length) {
      searchResults.innerHTML = '<div class="guide-search-empty">No matches.</div>';
    } else {
      var html = '', lastGroup = null;
      hits.forEach(function (h, i) {
        if (h.group !== lastGroup) { html += '<div class="guide-search-group">' + h.group + '</div>'; lastGroup = h.group; }
        html += '<button type="button" class="guide-search-item" role="option" id="gsr-' + i + '" data-i="' + i + '">' +
          esc(h.label) + (h.sub ? '<span class="sub">' + esc(h.sub) + '</span>' : '') + '</button>';
      });
      searchResults.innerHTML = html;
    }
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    searchItems = Array.prototype.slice.call(searchResults.querySelectorAll('.guide-search-item'));
  }
  function closeSearch() {
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
    searchActive = -1;
  }
  function setActiveResult(i) {
    searchItems.forEach(function (el, idx) { el.classList.toggle('active', idx === i); });
    searchActive = i;
    if (i >= 0 && searchItems[i]) {
      searchInput.setAttribute('aria-activedescendant', searchItems[i].id);
      searchItems[i].scrollIntoView({ block: 'nearest' });
    } else {
      searchInput.removeAttribute('aria-activedescendant');
    }
  }
  function pickSearchResult(hit) {
    closeSearch();
    searchInput.value = '';
    searchInput.blur();
    if (hit.group === 'Quests' || hit.group === 'Steps') {
      setTab('quests', hit.questId);
    } else if (hit.group === 'Bosses') {
      setTab('bosses');
      var bEl = document.getElementById('boss-' + hit.bossId);
      if (bEl) bEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (hit.group === 'Endings') {
      setTab('endings');
      var eEl = document.getElementById('ending-' + hit.endingId);
      if (eEl) eEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (hit.group === 'Route') {
      setTab('walkthrough');
      var rEl = document.getElementById('rstep-' + hit.stepId);
      if (rEl) rEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (hit.group === 'Compendium') {
      compendiumFilter = 'all'; // guarantee the target card is actually rendered
      setTab('compendium');
      var cEl = document.getElementById('compendium-' + hit.compendiumId);
      if (cEl) cEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  searchInput.addEventListener('input', function () {
    if (!this.value.trim()) { searchHits = []; closeSearch(); return; }
    searchHits = searchMatches(this.value);
    renderSearchResults(searchHits);
  });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSearch(); searchInput.blur(); return; }
    if (searchResults.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveResult(Math.min(searchActive + 1, searchItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveResult(Math.max(searchActive - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var i = searchActive >= 0 ? searchActive : 0;
      if (searchHits[i]) pickSearchResult(searchHits[i]);
    }
  });
  searchResults.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep input focused through the click
  searchResults.addEventListener('click', function (e) {
    var btn = e.target.closest('.guide-search-item'); if (!btn) return;
    var hit = searchHits[+btn.dataset.i];
    if (hit) pickSearchResult(hit);
  });
  document.addEventListener('click', function (e) {
    if (!searchResults.hidden && !e.target.closest('.guide-search-wrap')) closeSearch();
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '/') { e.preventDefault(); searchInput.focus(); }
    else if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); searchInput.focus(); }
  });

  var initHash = (location.hash || '#quests').slice(1);
  if (initHash.indexOf('boss-') === 0) {
    // deep link to a single boss card (weapon pages link here): open the tab, then scroll
    setTab('bosses');
    var bossEl = document.getElementById(initHash);
    if (bossEl) bossEl.scrollIntoView({ block: 'start' });
  } else {
    setTab(initHash);
  }
})();
