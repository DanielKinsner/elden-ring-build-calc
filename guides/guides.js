/* guides.js — quest tracker (T9) + boss & endings guides (T10). Progress lives in localStorage. */
(async function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var content = $('guideContent');

  var data = await ERData.loadGuides('../data/');
  var QUESTS = data.quests, BOSSES = data.bosses, ENDINGS = data.endings, PROG = data.progression;

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

  /* ---- tabs (hash-routed so links can target a tab) ---- */
  var TABS = { quests: renderQuests, walkthrough: renderWalkthrough, bosses: renderBosses, endings: renderEndings };
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
      store.open[questToOpen] = 1; save();
      TABS[name]();
      var el = document.getElementById('quest-' + questToOpen);
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
  function renderQuests() {
    var all = overallProgress();
    var html = '<p class="guide-sub">Check off steps as you play — progress is saved in this browser. ' +
      '<b class="guide-overall">' + all.done + '/' + all.total + '</b> steps done across all questlines.</p>';
    html += '<div class="guide-rules"><span class="guide-rules-title">⚠ Survival rules</span><ul>' +
      QUESTS.generalRules.map(function (r) { return '<li>' + verifyTag(r) + '</li>'; }).join('') + '</ul></div>';
    html += QUESTS.quests.map(function (q) {
      var p = questProgress(q);
      var open = !!store.open[q.id];
      var pct = p.total ? Math.round(100 * p.done / p.total) : 0;
      var complete = p.done === p.total;
      return '<div class="quest-card' + (open ? ' open' : '') + (complete ? ' complete' : '') + '" id="quest-' + q.id + '">' +
        '<button class="quest-head" data-quest="' + q.id + '" aria-expanded="' + open + '">' +
          '<span class="quest-caret">' + (open ? '▾' : '▸') + '</span>' +
          '<span class="quest-title"><span class="quest-name">' + esc(q.name) + (q.major ? ' <span class="quest-major">MAJOR</span>' : '') + '</span>' +
          '<span class="quest-cluster">' + esc(q.cluster) + '</span></span>' +
          '<span class="quest-count' + (complete ? ' done' : '') + '">' + (complete ? '✓ ' : '') + p.done + '/' + p.total + '</span>' +
        '</button>' +
        '<div class="quest-progress"><i style="width:' + pct + '%"></i></div>' +
        (open ?
          '<div class="quest-body">' +
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
            '<button class="quest-reset" data-reset="' + q.id + '">Reset progress</button>' +
          '</div>' : '') +
      '</div>';
    }).join('');
    content.innerHTML = html;

    Array.prototype.forEach.call(content.querySelectorAll('.quest-head'), function (h) {
      h.addEventListener('click', function () {
        var id = h.dataset.quest;
        if (store.open[id]) delete store.open[id]; else store.open[id] = 1;
        save(); renderQuests();
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
    return '<label class="quest-step' + (on ? ' done' : '') + '">' +
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
    var html = '<p class="guide-sub">' + esc(PROG.intro) + ' <b class="guide-overall">' + done + '/' + PROG.steps.length + '</b> route steps done.</p>';
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
  function chipList(cls, label, items) {
    if (!items || !items.length) return '';
    return '<div class="boss-row"><span class="k">' + label + '</span><span class="boss-chips">' +
      items.map(function (x) { return '<span class="boss-chip ' + cls + '">' + verifyTag(x) + '</span>'; }).join('') + '</span></div>';
  }
  function bossCard(b) {
    var felled = !!store.bosses[b.id];
    return '<div class="boss-card' + (felled ? ' felled' : '') + '">' +
      '<div class="boss-head"><span class="boss-name">' + esc(b.name) + '</span>' +
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
    content.innerHTML =
      '<p class="guide-sub">Cheat-sheet for the required path, the big optional fights, and the DLC remembrances. Tick ☠ when a boss falls. ⚠ Endgame boss names below.</p>' +
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
      '<p class="guide-sub">How each ending unlocks — spoiler-light: the route, not what happens.</p>' +
      '<div class="guide-rules"><span class="guide-rules-title">How endings work</span><ul>' +
        ENDINGS.howItWorks.map(function (t) { return '<li>' + verifyTag(t) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="ending-list">' +
      ENDINGS.endings.map(function (e) {
        return '<div class="ending-card' + (e.kind === 'override' ? ' danger' : '') + '">' +
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

  setTab((location.hash || '#quests').slice(1));
})();
