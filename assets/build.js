/* build.js — wires the engine + data to the build page UI. */
(async function () {
  'use strict';
  var STATS = ['VIG','MND','END','STR','DEX','INT','FAI','ARC'];
  var STAT_LABEL = { VIG:'Vigor', MND:'Mind', END:'Endurance', STR:'Strength', DEX:'Dexterity', INT:'Intelligence', FAI:'Faith', ARC:'Arcane' };
  var SCALING = ['STR','DEX','INT','FAI','ARC'];
  var STATUS = [['bleed','Bleed'],['frost','Frost'],['poison','Poison'],['rot','Scarlet Rot'],['sleep','Sleep'],['madness','Madness']];
  var $ = function (id) { return document.getElementById(id); };

  var weapons = await ERData.loadWeapons('../data/');
  var presets = await ERData.loadPresets('../data/');

  var build = { VIG:60, MND:20, END:30, STR:24, DEX:58, INT:9, FAI:15, ARC:40 };
  var twoHanded = true, upgradeLevel = null, focusStat = 'DEX', showDlc = true, affinity = 'Standard';
  function pool(){ return showDlc ? weapons : weapons.filter(function(w){ return w.source !== 'dlc'; }); }
  var current = weapons.find(function (w){ return w.id === 'rivers-of-blood'; }) || weapons[0];
  var compareIds = [];

  /* ---- stat sliders ---- */
  $('stats').innerHTML = STATS.map(function (k) {
    return '<div class="stat"><img class="stat-icon" src="../assets/icons/stats/'+k.toLowerCase()+'.png" alt=""><span class="name">'+STAT_LABEL[k]+'</span>' +
      '<input type="range" min="1" max="99" value="'+build[k]+'" data-k="'+k+'">' +
      '<input class="box" type="number" min="1" max="99" value="'+build[k]+'" data-box="'+k+'"></div>';
  }).join('');
  $('stats').addEventListener('input', function (e) {
    var k = e.target.getAttribute('data-k') || e.target.getAttribute('data-box'); if (!k) return;
    var val = Math.max(1, Math.min(99, +e.target.value || 1));
    build[k] = val; syncStat(k); activePresetIndex = -1; syncActivePreset(); render();
  });
  function syncStat(k) {
    var r = $('stats').querySelector('[data-k="'+k+'"]'); var b = $('stats').querySelector('[data-box="'+k+'"]');
    if (r) r.value = build[k]; if (b) b.value = build[k];
  }

  $('twoHand').addEventListener('change', function () { twoHanded = this.checked; activePresetIndex = -1; syncActivePreset(); render(); });
  $('twoHand').checked = twoHanded;
  $('showDlc').addEventListener('change', function () { showDlc = this.checked; });

  /* ---- presets (dropdown + buttons) ---- */
  var activePresetIndex = presets.findIndex(function (p) { return p.loadout && p.loadout.weaponId === current.id; });
  $('presetSelect').innerHTML = '<option value="">Load build…</option>' + presets.map(function (p, i) { return '<option value="'+i+'">'+p.name+'</option>'; }).join('');
  $('presetSelect').addEventListener('change', function () { if (this.value !== '') applyPreset(presets[+this.value]); });
  $('presetBtns').innerHTML = presets.map(function (p, i) { return '<button data-p="'+i+'">'+p.name+'</button>'; }).join('');
  $('presetBtns').addEventListener('click', function (e) { var i = e.target.getAttribute('data-p'); if (i !== null) applyPreset(presets[+i]); });
  function syncActivePreset() {
    $('presetSelect').value = activePresetIndex >= 0 ? activePresetIndex : '';
    Array.prototype.forEach.call($('presetBtns').children, function (btn, i) {
      btn.classList.toggle('active', i === activePresetIndex);
    });
  }
  function applyPreset(p) {
    activePresetIndex = presets.indexOf(p);
    STATS.forEach(function (k) { build[k] = p.stats[k]; syncStat(k); });
    twoHanded = !!p.twoHanded; $('twoHand').checked = twoHanded;
    if (p.loadout) {
      var w = weapons.find(function (x){ return x.id === p.loadout.weaponId; });
      if (w) { current = w; fillUpgrade(); fillAffinity(); }
      upgradeLevel = p.loadout.upgradeLevel; if (upgradeLevel != null) $('upgrade').value = upgradeLevel;
      var wantAff = p.loadout.affinity;
      if (wantAff && (wantAff === 'Standard' || (current.affinities && current.affinities[wantAff]))) {
        affinity = wantAff; $('affinity').value = wantAff;
      }
    }
    syncActivePreset();
    render();
  }

  /* ---- weapon search ---- */
  var search = $('weaponSearch'), list = $('weaponList');
  search.addEventListener('input', function () {
    var q = this.value.toLowerCase().trim();
    if (!q) { list.hidden = true; return; }
    var hits = pool().filter(function (w){ return w.name.toLowerCase().indexOf(q) >= 0 || w.type.toLowerCase().indexOf(q) >= 0; }).slice(0, 12);
    list.innerHTML = hits.map(function (w){ return '<div data-id="'+w.id+'">'+w.name+' <span style="color:var(--dim)">· '+w.type+'</span></div>'; }).join('') || '<div style="color:var(--dim)">no matches</div>';
    list.hidden = false;
  });
  list.addEventListener('click', function (e) {
    var id = e.target.closest('[data-id]'); if (!id) return;
    current = weapons.find(function (w){ return w.id === id.getAttribute('data-id'); });
    upgradeLevel = null; search.value = ''; list.hidden = true; fillUpgrade(); fillAffinity();
    activePresetIndex = -1; syncActivePreset(); render();
  });

  /* ---- affinity + upgrade ---- */
  function fillAffinity() {
    var opts = ['Standard'];
    if (current.infusable && current.affinities) opts = opts.concat(Object.keys(current.affinities));
    $('affinity').innerHTML = opts.map(function (a){ return '<option>'+a+'</option>'; }).join('');
    $('affinity').disabled = opts.length < 2;
    affinity = 'Standard'; $('affinity').value = 'Standard';
  }
  $('affinity').addEventListener('change', function () { affinity = this.value; activePresetIndex = -1; syncActivePreset(); render(); });
  function fillUpgrade() {
    var max = current.category === 'somber' ? 10 : 25;
    $('upgrade').innerHTML = '';
    for (var i = 0; i <= max; i++) { var o = document.createElement('option'); o.value = i; o.textContent = '+'+i; $('upgrade').appendChild(o); }
    $('upgrade').value = max;
    upgradeLevel = null;
  }
  $('upgrade').addEventListener('change', function () { upgradeLevel = +this.value; activePresetIndex = -1; syncActivePreset(); render(); });

  /* ---- per-stat click to focus soft-cap ---- */
  $('byStat').addEventListener('click', function (e) {
    var row = e.target.closest('[data-stat]'); if (!row) return;
    focusStat = row.getAttribute('data-stat'); render();
  });

  function bar(v, max) { var p = max ? Math.max(0, Math.min(100, v / max * 100)) : 0; return '<div class="bar"><i style="width:'+p+'%"></i></div>'; }

  function setWeaponThumb(weapon) {
    var thumb = $('weaponThumb');
    thumb.textContent = weapon.name.charAt(0);
    thumb.classList.remove('has-img');
    var img = new Image();
    img.onload = function () { thumb.innerHTML = ''; thumb.appendChild(img); thumb.classList.add('has-img'); };
    img.src = '../assets/icons/weapons/' + weapon.id + '.png';
    img.alt = weapon.name;
  }

  function render() {
    var r = ERCalc.computeAR(build, current, { upgradeLevel: upgradeLevel, twoHanded: twoHanded, affinity: affinity });

    $('level').textContent = ERCalc.characterLevel(build);
    $('statTotal').textContent = STATS.reduce(function (s,k){ return s + build[k]; }, 0);
    $('weaponName').textContent = current.name;
    $('weaponType').textContent = current.type + (current.category === 'somber' ? ' · Somber' : '');
    setWeaponThumb(current);
    $('weaponAtlasLink').href = '../atlas/weapon.html?id=' + encodeURIComponent(current.id);
    $('weight').textContent = current.weight != null ? current.weight : '—';
    $('passive').textContent = current.passive || 'None';

    // requirements
    var reqs = current.requirements || {};
    $('reqs').innerHTML = Object.keys(reqs).map(function (k) {
      var have = build[k] || 1, ok = have >= reqs[k];
      return '<span class="'+(ok?'met':'unmet')+'">'+k+' '+reqs[k]+' ('+have+')</span>';
    }).join('') || '<span style="color:var(--dim)">none</span>';

    // AR
    $('ar').textContent = r.totalAR;

    // damage types
    var types = ['physical','magic','fire','lightning','holy'];
    var maxT = Math.max.apply(null, types.map(function (t){ return r.byType[t] || 0; }).concat([1]));
    $('byType').innerHTML = types.map(function (t) {
      var v = r.byType[t] || 0, pct = r.totalAR ? Math.round(v / r.totalAR * 100) : 0;
      return '<div class="trow '+t+'"><span class="lbl">'+t+'</span>'+bar(v,maxT)+'<span class="amt">'+v+' <small style="color:var(--dim)">'+pct+'%</small></span></div>';
    }).join('');

    // status
    $('status').innerHTML = STATUS.map(function (s) {
      var v = (r.status && r.status[s[0]]) || 0;
      return '<div class="srow'+(v?'':' off')+'"><img class="status-icon" src="../assets/icons/status/'+s[0]+'.png" alt=""><span class="lbl" style="color:var(--dim)">'+s[1]+'</span>'+bar(v,120)+'<span class="amt">'+v+'</span></div>';
    }).join('');

    // per-stat contribution + grades (all 8 stats — VIG/MND/END never scale weapon AR, shown for completeness)
    var topStat = null, topV = -1;
    SCALING.forEach(function (k) { if ((r.byStat[k] || 0) > topV) { topV = r.byStat[k] || 0; topStat = k; } });
    $('byStat').innerHTML = STATS.map(function (k) {
      var v = r.byStat[k] || 0;
      var scales = SCALING.indexOf(k) >= 0;
      var grade = scales ? '<span class="grade">'+r.grades[k]+'</span>' : '';
      var cls = 'crow' + (v ? '' : ' zero') + (scales && k === topStat && v > 0 ? ' top' : '');
      var clickable = scales ? ' data-stat="'+k+'" style="cursor:pointer"' : '';
      return '<div class="'+cls+'"'+clickable+'><span class="lbl"><b>'+STAT_LABEL[k]+'</b>'+grade+'</span><span class="amt">+'+v+'</span></div>';
    }).join('');

    renderSoftCap(r);
    renderBreakpoints(r);
    renderCompare();
  }

  /* ---- compare tray: live-ranks added weapons for the CURRENT build ---- */
  var compareBar = document.createElement('div');
  compareBar.className = 'compare-bar'; compareBar.hidden = true;
  document.body.appendChild(compareBar);
  function renderCompare() {
    if (!compareIds.length) { compareBar.hidden = true; return; }
    compareBar.hidden = false;
    var rows = compareIds.map(function (id) {
      var w = weapons.find(function (x){ return x.id === id; });
      var res = ERCalc.computeAR(build, w, { twoHanded: twoHanded });
      return { w: w, ar: res.totalAR, met: res.requirementsMet };
    }).sort(function (a, b){ return b.ar - a.ar; });
    var best = rows[0] ? rows[0].ar : 0;
    compareBar.innerHTML =
      '<div class="cmp-title">Compare · your build</div>' +
      '<div class="cmp-cards">' + rows.map(function (x) {
        return '<div class="cmp-card'+(x.ar===best?' win':'')+(x.met?'':' bad')+'" data-rm="'+x.w.id+'">' +
          '<span class="cmp-x" title="remove">×</span>' +
          '<div class="cmp-name">'+x.w.name+'</div>' +
          '<div class="cmp-ar">'+x.ar+(x.met?'':' ⚠')+'</div></div>';
      }).join('') + '</div>' +
      '<button class="cmp-clear">clear</button>';
  }
  compareBar.addEventListener('click', function (e) {
    if (e.target.classList.contains('cmp-clear')) { compareIds = []; renderCompare(); return; }
    var card = e.target.closest('[data-rm]');
    if (card && e.target.classList.contains('cmp-x')) {
      compareIds = compareIds.filter(function (id){ return id !== card.getAttribute('data-rm'); });
      renderCompare();
    }
  });

  function renderSoftCap(r) {
    // ensure focusStat actually scales; else pick best contributor
    if (!r.softCaps[focusStat]) {
      var best = null, bestV = -1;
      SCALING.forEach(function (k){ if (r.byStat[k] > bestV){ bestV = r.byStat[k]; best = k; } });
      focusStat = best || 'STR';
    }
    var sc = r.softCaps[focusStat] || { perPoint: 0, pastSoftCap: false, softCaps: [] };
    $('softcapHeader').innerHTML =
      '<div class="stat-name">'+STAT_LABEL[focusStat]+' ('+build[focusStat]+')</div>' +
      '<div class="per">+1 '+focusStat+' = +'+sc.perPoint+' AR</div>' +
      '<div class="zone '+(sc.pastSoftCap?'past':'eff')+'">'+(sc.pastSoftCap?'⚠ past soft cap — returns diminish':'✔ efficient zone')+'</div>';
    drawChart(focusStat, sc.softCaps || []);
  }

  function drawChart(stat, softCaps) {
    var curve = ERCalc.softCapCurve(build, current, stat, { upgradeLevel: upgradeLevel, twoHanded: twoHanded, affinity: affinity });
    var pts = curve.points; // {level, perPoint}
    var W = 300, H = 170, padL = 30, padR = 8, padT = 12, padB = 28;
    var maxP = Math.max.apply(null, pts.map(function (p){ return p.perPoint; }).concat([0.1]));
    function x(lv){ return padL + (lv - 1) / 98 * (W - padL - padR); }
    function y(v){ return H - padB - (v / maxP) * (H - padT - padB); }

    var major = softCaps.length ? softCaps[softCaps.length-2] || softCaps[0] : 99;

    var svg = '';

    // Y-axis gridlines + labels (0 .. maxP in 4 steps)
    for (var g = 0; g <= 4; g++) {
      var gv = maxP * g / 4, gy = y(gv);
      svg += '<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="var(--line-2)" stroke-width="1"/>';
      svg += '<text x="'+(padL-4)+'" y="'+(gy+3)+'" fill="var(--dim)" font-size="7" text-anchor="end">'+gv.toFixed(1)+'</text>';
    }
    svg += '<text x="'+(padL-4)+'" y="'+(padT-2)+'" fill="var(--dim)" font-size="6.5" text-anchor="end" letter-spacing="0.5">AR/PT</text>';

    // soft-cap markers (dashed green line + "Soft Cap" label on the major one)
    softCaps.forEach(function (c) {
      var isMajor = c === major;
      svg += '<line x1="'+x(c)+'" y1="'+padT+'" x2="'+x(c)+'" y2="'+(H-padB)+'" stroke="var(--green)" stroke-dasharray="3 3" stroke-width="'+(isMajor?1.4:1)+'" opacity="'+(isMajor?0.9:0.5)+'"/>';
      svg += '<text x="'+x(c)+'" y="'+(H-padB+10)+'" fill="var(--dim)" font-size="7" text-anchor="middle">'+c+'</text>';
      if (isMajor) svg += '<text x="'+x(c)+'" y="'+(padT-3)+'" fill="var(--green)" font-size="7" text-anchor="middle">Soft Cap</text>';
    });

    // efficient zone shading (before the major cap — where a stat point is still cheap)
    svg += '<rect x="'+x(1)+'" y="'+padT+'" width="'+(x(major)-x(1))+'" height="'+(H-padT-padB)+'" fill="var(--green)" opacity="0.09"/>';

    // curve: solid up to the major soft cap, dashed past it (diminishing-returns zone)
    var solidPts = pts.filter(function (p){ return p.level <= major; });
    var dashedPts = pts.filter(function (p){ return p.level >= major; });
    function pathFor(list) { return list.map(function (p, i){ return (i?'L':'M') + x(p.level).toFixed(1) + ' ' + y(p.perPoint).toFixed(1); }).join(' '); }
    if (solidPts.length) svg += '<path d="'+pathFor(solidPts)+'" fill="none" stroke="var(--gold-2)" stroke-width="2"/>';
    if (dashedPts.length) svg += '<path d="'+pathFor(dashedPts)+'" fill="none" stroke="var(--gold-2)" stroke-width="2" stroke-dasharray="5 3" opacity="0.75"/>';

    // current position
    var cur = pts[build[stat]-1];
    if (cur) svg += '<circle cx="'+x(cur.level)+'" cy="'+y(cur.perPoint)+'" r="3.5" fill="var(--gold-2)" stroke="#241d10" stroke-width="1"/>';

    // X-axis labels + title
    [1, 99].concat(softCaps).forEach(function (lv) {
      if (lv === 1 || lv === 99) svg += '<text x="'+x(lv)+'" y="'+(H-padB+10)+'" fill="var(--dim)" font-size="7" text-anchor="'+(lv===1?'start':'end')+'">'+lv+'</text>';
    });
    svg += '<text x="'+((padL+W-padR)/2)+'" y="'+(H-4)+'" fill="var(--dim)" font-size="7.5" text-anchor="middle" letter-spacing="1">'+STAT_LABEL[stat].toUpperCase()+'</text>';

    $('softcapChart').innerHTML = svg;
  }

  function renderBreakpoints(r) {
    $('breakpoints').innerHTML = SCALING.filter(function (k){ return r.softCaps[k]; }).map(function (k) {
      var sc = r.softCaps[k];
      var caps = sc.softCaps || [];
      var major = caps.length ? (caps[caps.length - 2] || caps[0]) : null;
      var met = sc.pastSoftCap;
      return '<div class="brow"><span class="lbl">'+STAT_LABEL[k]+'</span><span class="caps">'+
        (met ? '<span class="check">✓</span> ' : '') + major + ' <small>(Soft Cap)</small></span></div>';
    }).join('');
  }

  $('addCompare').addEventListener('click', function () {
    if (compareIds.indexOf(current.id) < 0) compareIds.push(current.id);
    renderCompare();
    var self = this; self.textContent = current.name + ' added ✓';
    setTimeout(function(){ self.textContent = 'Add to Compare'; }, 1200);
  });

  fillAffinity(); fillUpgrade(); syncActivePreset(); render();
})();
