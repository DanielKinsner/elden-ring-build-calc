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
  var buffData = await ERData.loadBuffs('../data/');
  var armor = await ERData.loadArmor('../data/');
  var talismans = await ERData.loadTalismans('../data/');
  var attackProfiles = await ERData.loadAttackProfiles('../data/');
  var attackProfileById = {};
  attackProfiles.forEach(function (profile) { attackProfileById[profile.id] = profile; });
  var armorById = {};
  armor.forEach(function (item) { armorById[item.id] = item; });
  var talismanById = {};
  talismans.forEach(function (item) {
    talismanById[item.id] = item;
    (item.legacyIds || []).forEach(function (id) { talismanById[id] = item; });
  });
  var ARMOR_SLOTS = [
    { id: 'head', label: 'Head', mark: '♜' },
    { id: 'body', label: 'Body', mark: '♢' },
    { id: 'arms', label: 'Arms', mark: '⌁' },
    { id: 'legs', label: 'Legs', mark: '⋔' }
  ];

  var build = { VIG:60, MND:20, END:30, STR:24, DEX:58, INT:9, FAI:15, ARC:40 };
  var twoHanded = true, upgradeLevel = null, focusStat = 'DEX', showDlc = true, affinity = 'Standard';
  var combatContext = 'pve';
  var attackProfileId = 'neutral';
  var scaduLevel = 0; // Scadutree Blessing 0–20 (Land of Shadow only)
  var gearWeight = 0; // armor & other gear weight (weapon weight is auto-counted)
  function pool(){ return showDlc ? weapons : weapons.filter(function(w){ return w.source !== 'dlc'; }); }
  var current = weapons.find(function (w){ return w.id === 'rivers-of-blood'; }) || weapons[0];
  var selectedArmor = { head: null, body: null, arms: null, legs: null };
  var compareIds = [];
  var activeSlot = { hand: 'right', index: 0 }, weaponTarget = null;

  function normalizeArmament(raw) {
    if (!raw) return null;
    var weaponId = raw.weaponId || raw.id;
    if (!weaponId || !weapons.some(function (w) { return w.id === weaponId; })) return null;
    return {
      weaponId: weaponId,
      affinity: raw.affinity || 'Standard',
      upgrade: raw.upgrade != null ? +raw.upgrade : raw.upgradeLevel != null ? +raw.upgradeLevel : null
    };
  }
  function decodeArmaments(value) {
    var out = [null,null,null];
    (value || '').split(',').slice(0, 3).forEach(function (token, i) {
      if (!token || token === '-') return;
      var parts = token.split('~');
      out[i] = normalizeArmament({ weaponId: parts[0], affinity: parts[1] || 'Standard', upgrade: parts[2] === '' || parts[2] == null ? null : +parts[2] });
    });
    return out;
  }
  function encodeArmaments(slots) {
    return slots.map(function (slot) { return slot ? [slot.weaponId, slot.affinity || 'Standard', slot.upgrade == null ? '' : slot.upgrade].join('~') : '-'; }).join(',');
  }

  /* ---- build share/restore (T11): URL params win, then localStorage, then defaults ----
     ?b=VIG.MND.END.STR.DEX.INT.FAI.ARC&w=<id>&a=<affinity>&u=<upgrade>&h=0|1&l=<level> */
  var BOOT = (function () {
    var q = new URLSearchParams(location.search);
    if (q.get('b') || q.get('w')) {
      var s = (q.get('b') || '').split('.').map(Number);
      var armorParts = (q.get('ar') || '').split('.');
      var o = { stats: {}, weapon: q.get('w'), affinity: q.get('a'), upgrade: q.get('u'), twoHanded: q.get('h') !== '0', level: +q.get('l') || null,
                buffs: (q.get('bf') || '').split(',').filter(Boolean), talis: (q.get('tl') || '').split(',').filter(Boolean), scadu: +q.get('st') || 0,
                gearWeight: +q.get('gw') || 0, armor: {}, activeSlot: q.get('as') || 'r0', combatContext: q.get('ctx') === 'pvp' ? 'pvp' : 'pve', attackProfile: q.get('mv') || 'neutral' };
      if (q.get('rh') || q.get('lh')) o.loadout = { rightHand: decodeArmaments(q.get('rh')), leftHand: decodeArmaments(q.get('lh')) };
      ARMOR_SLOTS.forEach(function (slot, i) { if (armorParts[i] && armorParts[i] !== '-') o.armor[slot.id] = armorParts[i]; });
      STATS.forEach(function (k, i) { if (s[i] >= 1 && s[i] <= 99) o.stats[k] = s[i]; });
      return o;
    }
    try { return JSON.parse(localStorage.getItem('er-build') || 'null'); } catch (e) { return null; }
  })();
  if (BOOT) {
    if (BOOT.stats) STATS.forEach(function (k) { if (BOOT.stats[k] >= 1) build[k] = Math.min(99, BOOT.stats[k]); });
    if (BOOT.twoHanded != null) twoHanded = !!BOOT.twoHanded;
    if (BOOT.combatContext === 'pvp') combatContext = 'pvp';
    if (attackProfileById[BOOT.attackProfile]) attackProfileId = BOOT.attackProfile;
    var bootW = BOOT.weapon && weapons.find(function (w) { return w.id === BOOT.weapon; });
    if (bootW) current = bootW;
    if (BOOT.scadu) scaduLevel = Math.max(0, Math.min(20, +BOOT.scadu || 0));
    if (BOOT.gearWeight) gearWeight = Math.max(0, +BOOT.gearWeight || 0);
    var bootArmor = BOOT.armor || (BOOT.loadout && BOOT.loadout.armor) || {};
    ARMOR_SLOTS.forEach(function (slot, i) {
      var id = Array.isArray(bootArmor) ? bootArmor[i] : bootArmor[slot.id];
      if (id != null && armorById[String(id)] && armorById[String(id)].slot === slot.id) selectedArmor[slot.id] = String(id);
    });
  }
  var armaments = { right: [null,null,null], left: [null,null,null] };
  if (BOOT && BOOT.loadout && (BOOT.loadout.rightHand || BOOT.loadout.leftHand)) {
    armaments.right = (BOOT.loadout.rightHand || []).slice(0, 3).map(normalizeArmament);
    armaments.left = (BOOT.loadout.leftHand || []).slice(0, 3).map(normalizeArmament);
    while (armaments.right.length < 3) armaments.right.push(null);
    while (armaments.left.length < 3) armaments.left.push(null);
  }
  if (!armaments.right.some(Boolean) && !armaments.left.some(Boolean)) {
    armaments.right[0] = { weaponId: current.id, affinity: (BOOT && BOOT.affinity) || 'Standard', upgrade: BOOT && BOOT.upgrade != null && BOOT.upgrade !== '' ? +BOOT.upgrade : null };
  }
  if (BOOT && /^([rl])[0-2]$/.test(BOOT.activeSlot || '')) activeSlot = { hand: BOOT.activeSlot.charAt(0) === 'l' ? 'left' : 'right', index: +BOOT.activeSlot.charAt(1) };
  if (!armaments[activeSlot.hand][activeSlot.index]) {
    ['right','left'].some(function (hand) {
      var i = armaments[hand].findIndex(Boolean);
      if (i >= 0) { activeSlot = { hand: hand, index: i }; return true; }
      return false;
    });
  }
  var initialArmament = armaments[activeSlot.hand][activeSlot.index];
  if (initialArmament) {
    current = weapons.find(function (w) { return w.id === initialArmament.weaponId; }) || current;
    affinity = initialArmament.affinity || 'Standard';
    upgradeLevel = initialArmament.upgrade;
  }

  /* ---- buffs + true talisman equipment ---- */
  var TALI_MAX = 4;
  var activeBuffs = {}, selectedTalismans = [null,null,null,null], taliConditionState = {};
  if (BOOT && BOOT.buffs) BOOT.buffs.forEach(function (id) { if (buffData.buffs.some(function (b) { return b.id === id; })) activeBuffs[id] = true; });
  function buffById(id) { return buffData.buffs.find(function (b) { return b.id === id; }); }
  function taliById(id) { return talismanById[id] || null; }
  function normalizeTalisman(raw) {
    if (!raw || raw === '-') return null;
    var parts = typeof raw === 'string' ? raw.split('~') : null;
    var id = parts ? parts[0] : raw.talismanId || raw.id;
    var item = taliById(id);
    if (!item) return null;
    id = item.id;
    var conditionActive = parts && parts[1] != null ? parts[1] !== '0' : raw.conditionActive;
    if (conditionActive == null && item.condition) conditionActive = item.condition.defaultActive !== false;
    if (item.condition) taliConditionState[id] = conditionActive !== false;
    return { talismanId: id, conditionActive: conditionActive !== false };
  }
  function encodeTalismans(slots) {
    return slots.map(function (slot) {
      if (!slot) return '-';
      var item = taliById(slot.talismanId);
      return item && item.condition ? slot.talismanId + '~' + (taliConditionState[slot.talismanId] === false ? '0' : '1') : slot.talismanId;
    }).join(',');
  }
  var bootTalismans = BOOT && BOOT.loadout && BOOT.loadout.talismans ? BOOT.loadout.talismans : BOOT && BOOT.talis ? BOOT.talis : [];
  selectedTalismans = (bootTalismans || []).slice(0, TALI_MAX).map(normalizeTalisman);
  while (selectedTalismans.length < TALI_MAX) selectedTalismans.push(null);
  function equippedTalismanItems() {
    return selectedTalismans.map(function (slot) { return slot && taliById(slot.talismanId); });
  }
  function resolveTalismanEffects() {
    return ERCalc.resolveEffects(equippedTalismanItems(), { conditions: taliConditionState });
  }
  function collectMods(taliEffects) {
    var mods = [];
    for (var b in activeBuffs) if (activeBuffs[b]) { var bb = buffById(b); if (bb) mods.push(bb); }
    mods = mods.concat((taliEffects || resolveTalismanEffects()).mods);
    return mods;
  }
  function renderBuffGroups() {
    $('buffGroups').innerHTML = buffData.categories.map(function (cat) {
      var chips = buffData.buffs.filter(function (b) { return b.category === cat.id; }).map(function (b) {
        return '<button class="buff-chip' + (activeBuffs[b.id] ? ' on' : '') + (b.confirmed ? '' : ' approx') + '" data-buff="' + b.id + '" title="' + (b.note || b.name) + (b.confirmed ? '' : ' — community value') + '">' + b.name + '</button>';
      }).join('');
      return '<div class="buff-group"><span class="buff-cat">' + cat.name + '</span><div class="buff-chip-row">' + chips + '</div></div>';
    }).join('');
  }
  $('buffGroups').addEventListener('click', function (e) {
    var el = e.target.closest('[data-buff]'); if (!el) return;
    var bid = el.getAttribute('data-buff');
    var buff = buffById(bid), was = activeBuffs[bid];
    buffData.buffs.forEach(function (b) { if (b.category === buff.category) delete activeBuffs[b.id]; }); // one per category
    if (!was) activeBuffs[bid] = true;
    renderBuffGroups(); render();
  });

  var persistT;
  function persist() { clearTimeout(persistT); persistT = setTimeout(doPersist, 250); }
  function saveActiveArmament() {
    if (!armaments[activeSlot.hand][activeSlot.index]) return;
    armaments[activeSlot.hand][activeSlot.index] = { weaponId: current.id, affinity: affinity, upgrade: upgradeLevel };
  }
  function captureState() {
    saveActiveArmament();
    var bf = Object.keys(activeBuffs).filter(function (k) { return activeBuffs[k]; });
    var tl = selectedTalismans.map(function (slot) { return slot && Object.assign({}, slot, { conditionActive: taliConditionState[slot.talismanId] !== false }); });
    var armorState = {};
    ARMOR_SLOTS.forEach(function (slot) { armorState[slot.id] = selectedArmor[slot.id]; });
    var state = { schemaVersion: 4, stats: {}, weapon: current.id, affinity: affinity, upgrade: upgradeLevel, twoHanded: twoHanded, level: +$('level').value || null, buffs: bf, talis: tl.filter(Boolean).map(function (slot) { return slot.talismanId; }), scadu: scaduLevel, gearWeight: gearWeight, armor: armorState, activeSlot: (activeSlot.hand === 'left' ? 'l' : 'r') + activeSlot.index, combatContext: combatContext, attackProfile: attackProfileId };
    state.loadout = { rightHand: armaments.right.map(function (x) { return x && Object.assign({}, x); }), leftHand: armaments.left.map(function (x) { return x && Object.assign({}, x); }), armor: armorState, talismans: tl, spells: [], physick: [], greatRune: null };
    STATS.forEach(function (k) { state.stats[k] = build[k]; });
    return state;
  }
  function doPersist() {
    var state = captureState(), bf = state.buffs, tl = state.loadout.talismans;
    try { localStorage.setItem('er-build', JSON.stringify(state)); } catch (e) {}
    var q = new URLSearchParams();
    q.set('b', STATS.map(function (k) { return build[k]; }).join('.'));
    q.set('w', current.id);
    if (affinity && affinity !== 'Standard') q.set('a', affinity);
    if (upgradeLevel != null) q.set('u', upgradeLevel);
    if (!twoHanded) q.set('h', '0');
    if (+$('level').value) q.set('l', $('level').value);
    if (bf.length) q.set('bf', bf.join(','));
    if (tl.some(Boolean)) q.set('tl', encodeTalismans(tl));
    if (scaduLevel) q.set('st', scaduLevel);
    if (gearWeight) q.set('gw', gearWeight);
    if (combatContext === 'pvp') q.set('ctx', 'pvp');
    if (attackProfileId !== 'neutral') q.set('mv', attackProfileId);
    if (ARMOR_SLOTS.some(function (slot) { return selectedArmor[slot.id]; })) {
      q.set('ar', ARMOR_SLOTS.map(function (slot) { return selectedArmor[slot.id] || '-'; }).join('.'));
    }
    q.set('rh', encodeArmaments(armaments.right));
    q.set('lh', encodeArmaments(armaments.left));
    if (state.activeSlot !== 'r0') q.set('as', state.activeSlot);
    history.replaceState(null, '', location.pathname + '?' + q);
  }

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
  $('combatContext').value = combatContext;
  $('combatContext').addEventListener('change', function () { combatContext = this.value === 'pvp' ? 'pvp' : 'pve'; render(); });

  /* ---- attack lens: move-specific talisman and PvP math ---- */
  (function renderAttackProfileOptions() {
    var groups = [], byGroup = {};
    attackProfiles.forEach(function (profile) {
      if (!byGroup[profile.group]) { byGroup[profile.group] = []; groups.push(profile.group); }
      byGroup[profile.group].push(profile);
    });
    $('attackProfile').innerHTML = groups.map(function (group) {
      return '<optgroup label="' + escText(group) + '">' + byGroup[group].map(function (profile) {
        return '<option value="' + profile.id + '">' + escText(profile.label) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    $('attackProfile').value = attackProfileId;
  })();
  $('attackProfile').addEventListener('change', function () {
    attackProfileId = attackProfileById[this.value] ? this.value : 'neutral';
    render();
  });

  /* ---- Scadutree Blessing slider ---- */
  function syncScadu() { $('scaduRange').value = scaduLevel; $('scaduNum').value = scaduLevel; }
  function onScadu(e) {
    scaduLevel = Math.max(0, Math.min(20, Math.floor(+e.target.value || 0)));
    syncScadu(); render();
  }
  $('scaduRange').addEventListener('input', onScadu);
  $('scaduNum').addEventListener('input', onScadu);
  syncScadu();
  $('showDlc').addEventListener('change', function () { showDlc = this.checked; render(); });

  /* ---- Survival: gear-weight input ---- */
  $('gearWeight').addEventListener('input', function () {
    gearWeight = Math.max(0, +this.value || 0);
    render();
  });
  $('gearWeight').value = gearWeight;

  /* ---- armor loadout: four slots + searchable picker ---- */
  var armorPickerSlot = null;
  function equippedArmorPieces() {
    return ARMOR_SLOTS.map(function (slot) { return selectedArmor[slot.id] && armorById[selectedArmor[slot.id]]; }).filter(Boolean);
  }
  function renderArmorSlots() {
    $('armorSlots').innerHTML = ARMOR_SLOTS.map(function (slot) {
      var item = selectedArmor[slot.id] && armorById[selectedArmor[slot.id]];
      return '<button type="button" class="armor-slot' + (item ? ' equipped' : '') + '" data-armor-slot="' + slot.id + '">' +
        '<span class="armor-slot-mark">' + slot.mark + '</span><span class="armor-slot-copy"><small>' + slot.label + '</small><b>' +
        (item ? escText(item.name) : 'Empty slot') + '</b></span><span class="armor-slot-weight">' + (item ? item.weight.toFixed(1) : '—') + '</span></button>';
    }).join('');
  }
  function renderArmorList(query) {
    var q = (query || '').toLowerCase().trim();
    var hits = armor.filter(function (item) {
      return item.slot === armorPickerSlot && (!q || item.name.toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 60);
    $('armorList').innerHTML = '<button type="button" class="armor-result empty" data-armor-id=""><span>Remove armor</span><small>0.0 weight</small></button>' +
      hits.map(function (item) {
        return '<button type="button" class="armor-result" data-armor-id="' + item.id + '"><span>' + escText(item.name) + '</span>' +
          '<small>' + item.weight.toFixed(1) + ' wt · ' + item.poise + ' poise</small></button>';
      }).join('') + (hits.length === 60 ? '<div class="picker-more">Keep typing to narrow 60+ results</div>' : '');
  }
  function openArmorPicker(slot) {
    armorPickerSlot = slot;
    var meta = ARMOR_SLOTS.find(function (x) { return x.id === slot; });
    $('armorPickerTitle').textContent = meta.label + ' armor';
    $('armorSearch').value = '';
    $('armorPicker').hidden = false;
    renderArmorList('');
    setTimeout(function () { $('armorSearch').focus(); }, 0);
  }
  function closeArmorPicker() { $('armorPicker').hidden = true; armorPickerSlot = null; }
  $('armorSlots').addEventListener('click', function (e) {
    var button = e.target.closest('[data-armor-slot]');
    if (button) openArmorPicker(button.getAttribute('data-armor-slot'));
  });
  $('armorSearch').addEventListener('input', function () { renderArmorList(this.value); });
  $('armorList').addEventListener('click', function (e) {
    var button = e.target.closest('[data-armor-id]');
    if (!button || !armorPickerSlot) return;
    var id = button.getAttribute('data-armor-id');
    selectedArmor[armorPickerSlot] = id || null;
    closeArmorPicker();
    render();
  });
  $('armorPickerClose').addEventListener('click', closeArmorPicker);

  /* ---- six-slot armament rack ---- */
  function slotLabel(hand, index) { return (hand === 'right' ? 'Right' : 'Left') + ' Hand ' + (index + 1); }
  function slotMatches(a, b) { return a && b && a.hand === b.hand && a.index === b.index; }
  function equippedArmamentPieces() {
    return armaments.right.concat(armaments.left).map(function (slot) {
      return slot && weapons.find(function (w) { return w.id === slot.weaponId; });
    }).filter(Boolean);
  }
  function renderArmamentRack() {
    var rows = [['right','Right Hand'],['left','Left Hand']];
    $('armamentRack').innerHTML = rows.map(function (row) {
      return '<div class="rack-row"><span class="rack-hand">' + row[1] + '</span><div class="rack-slots">' +
        armaments[row[0]].map(function (slot, index) {
          var weapon = slot && weapons.find(function (w) { return w.id === slot.weaponId; });
          var pos = { hand: row[0], index: index };
          var active = slotMatches(pos, activeSlot), target = slotMatches(pos, weaponTarget);
          var img = weapon ? ' style="--slot-img:url(\'../assets/icons/weapons/' + weapon.id + '.png\')"' : '';
          return '<button type="button" class="rack-slot' + (active ? ' active' : '') + (target ? ' target' : '') + (weapon ? ' filled' : '') + '" data-rack-hand="' + row[0] + '" data-rack-index="' + index + '"' + img + ' aria-label="' + slotLabel(row[0], index) + (weapon ? ': ' + escText(weapon.name) : ': empty') + '">' +
            '<span class="rack-index">' + (index + 1) + '</span><span class="rack-icon"></span><span class="rack-copy"><small>' + (active ? 'Active' : target ? 'Choose weapon' : slotLabel(row[0], index)) + '</small><b>' + (weapon ? escText(weapon.name) : 'Empty') + '</b>' +
            (weapon ? '<em>' + weapon.weight.toFixed(1) + ' wt' + (slot.upgrade != null ? ' · +' + slot.upgrade : ' · max') + '</em>' : '<em>select to equip</em>') + '</span>' +
            (weapon && !active ? '<span class="rack-clear" data-rack-clear="1" title="Unequip">×</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }).join('');
    $('activeSlotLabel').textContent = slotLabel(activeSlot.hand, activeSlot.index) + ' active';
    $('rackHint').textContent = weaponTarget ? 'Searching for ' + slotLabel(weaponTarget.hand, weaponTarget.index) + ' — choose a weapon below.' : 'All equipped armaments count toward load. Select one to analyze it.';
    $('rackHint').classList.toggle('choosing', !!weaponTarget);
  }
  function switchActiveArmament(hand, index) {
    var slot = armaments[hand][index];
    if (!slot) {
      weaponTarget = { hand: hand, index: index };
      renderArmamentRack();
      $('weaponSearch').placeholder = 'Equip ' + slotLabel(hand, index) + '…';
      $('weaponSearch').focus();
      return;
    }
    saveActiveArmament();
    activeSlot = { hand: hand, index: index };
    weaponTarget = null;
    current = weapons.find(function (w) { return w.id === slot.weaponId; }) || current;
    fillAffinity(); fillUpgrade();
    if (slot.affinity && (slot.affinity === 'Standard' || (current.affinities && current.affinities[slot.affinity]))) { affinity = slot.affinity; $('affinity').value = affinity; }
    if (slot.upgrade != null) { upgradeLevel = slot.upgrade; $('upgrade').value = slot.upgrade; }
    $('weaponSearch').placeholder = 'Search weapons…';
    render();
  }
  $('armamentRack').addEventListener('click', function (e) {
    var button = e.target.closest('[data-rack-hand]'); if (!button) return;
    var hand = button.getAttribute('data-rack-hand'), index = +button.getAttribute('data-rack-index');
    if (e.target.closest('[data-rack-clear]')) {
      armaments[hand][index] = null;
      if (slotMatches(weaponTarget, { hand: hand, index: index })) weaponTarget = null;
      render(); return;
    }
    switchActiveArmament(hand, index);
  });

  /* ---- four-slot talisman rack + complete catalog picker ---- */
  var talismanPickerSlot = null;
  function talismanConflict(item, targetSlot) {
    for (var i = 0; i < selectedTalismans.length; i++) {
      if (i === targetSlot || !selectedTalismans[i]) continue;
      var other = taliById(selectedTalismans[i].talismanId);
      if (!other) continue;
      if (other.id === item.id) return 'already equipped in slot ' + (i + 1);
      if (item.conflictGroup && other.conflictGroup === item.conflictGroup) return 'conflicts with ' + other.name;
    }
    return null;
  }
  function renderTalismanRack(resolution) {
    resolution = resolution || resolveTalismanEffects();
    $('talismanRack').innerHTML = selectedTalismans.map(function (slot, index) {
      var item = slot && taliById(slot.talismanId);
      var entry = resolution.entries.find(function (x) { return x.slot === index; });
      var icon = item ? '<img src="../' + item.icon + '" alt="">' : '<span>◇</span>';
      var condition = item && item.condition ? '<label class="tali-condition' + (taliConditionState[item.id] === false ? ' off' : '') + '">' +
        '<input type="checkbox" data-tali-condition="' + index + '"' + (taliConditionState[item.id] === false ? '' : ' checked') + '> ' + escText(item.condition.label) + '</label>' : '';
      var state = entry && entry.invalid ? ' invalid' : entry && !entry.modeled ? ' inventory-only' : item ? ' equipped' : '';
      return '<div class="tali-slot' + state + '">' +
        '<button type="button" class="tali-slot-main" data-tali-slot="' + index + '" aria-label="Talisman slot ' + (index + 1) + (item ? ': ' + escText(item.name) : ': empty') + '">' +
          '<span class="tali-gem">' + icon + '</span><span class="tali-copy"><small>Slot ' + (index + 1) + '</small><b>' + (item ? escText(item.name) : 'Empty talisman') + '</b>' +
          '<em>' + (item ? item.weight.toFixed(1) + ' wt · ' + (entry && entry.modeled ? 'math linked' : 'inventory linked') : 'select to equip') + '</em></span></button>' +
        (item ? '<button type="button" class="tali-clear" data-tali-clear="' + index + '" aria-label="Unequip ' + escText(item.name) + '">×</button>' : '') + condition + '</div>';
    }).join('');
    $('talismanWeight').textContent = resolution.weight.toFixed(1) + ' weight';
    $('talismanHint').textContent = resolution.conflicts.length
      ? 'Impossible combination: ' + resolution.conflicts[0].reason + '.'
      : resolution.coverage.equipped
        ? resolution.coverage.modeled + '/' + resolution.coverage.equipped + ' equipped effects have reviewed math. The attack lens decides which move-specific rules apply.'
        : 'All four slots feed the same calculation stack and equip load.';
    $('talismanHint').classList.toggle('invalid', resolution.conflicts.length > 0);
  }
  function renderTalismanList(query) {
    var q = (query || '').toLowerCase().trim();
    var hits = talismans.filter(function (item) {
      return !q || item.name.toLowerCase().indexOf(q) >= 0 || item.effect.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 70);
    $('talismanList').innerHTML = '<button type="button" class="talisman-result empty" data-talisman-id=""><span class="tali-result-icon">◇</span><span><b>Remove talisman</b><small>0.0 weight</small></span></button>' +
      hits.map(function (item) {
        var conflict = talismanConflict(item, talismanPickerSlot);
        return '<button type="button" class="talisman-result' + (conflict ? ' conflict' : '') + '" data-talisman-id="' + item.id + '"' + (conflict ? ' disabled' : '') + '>' +
          '<span class="tali-result-icon"><img src="../' + item.icon + '" alt=""></span><span><b>' + escText(item.name) + (item.source === 'dlc' ? ' <i>DLC</i>' : '') + '</b>' +
          '<small>' + escText(conflict || item.effect) + '</small></span><em>' + item.weight.toFixed(1) + '</em></button>';
      }).join('') + (hits.length === 70 ? '<div class="picker-more">Keep typing to narrow 70+ results</div>' : '');
  }
  function openTalismanPicker(index) {
    talismanPickerSlot = index;
    $('talismanPickerTitle').textContent = 'Talisman slot ' + (index + 1);
    $('talismanSearch').value = '';
    $('talismanPicker').hidden = false;
    renderTalismanList('');
    setTimeout(function () { $('talismanSearch').focus(); }, 0);
  }
  function closeTalismanPicker() { $('talismanPicker').hidden = true; talismanPickerSlot = null; }
  $('talismanRack').addEventListener('click', function (e) {
    var condition = e.target.closest('[data-tali-condition]');
    if (condition) {
      var conditionSlot = +condition.getAttribute('data-tali-condition');
      var conditionItem = selectedTalismans[conditionSlot] && taliById(selectedTalismans[conditionSlot].talismanId);
      if (conditionItem) {
        taliConditionState[conditionItem.id] = condition.checked;
        selectedTalismans[conditionSlot].conditionActive = condition.checked;
        render();
      }
      return;
    }
    var clear = e.target.closest('[data-tali-clear]');
    if (clear) {
      var clearSlot = +clear.getAttribute('data-tali-clear');
      var previous = selectedTalismans[clearSlot];
      if (previous) delete taliConditionState[previous.talismanId];
      selectedTalismans[clearSlot] = null;
      render(); return;
    }
    var button = e.target.closest('[data-tali-slot]');
    if (button) openTalismanPicker(+button.getAttribute('data-tali-slot'));
  });
  $('talismanSearch').addEventListener('input', function () { renderTalismanList(this.value); });
  $('talismanList').addEventListener('click', function (e) {
    var button = e.target.closest('[data-talisman-id]');
    if (!button || talismanPickerSlot == null) return;
    var id = button.getAttribute('data-talisman-id');
    if (!id) selectedTalismans[talismanPickerSlot] = null;
    else {
      var item = taliById(id);
      if (!item || talismanConflict(item, talismanPickerSlot)) return;
      var conditionActive = !item.condition || item.condition.defaultActive !== false;
      selectedTalismans[talismanPickerSlot] = { talismanId: id, conditionActive: conditionActive };
      if (item.condition) taliConditionState[id] = conditionActive;
    }
    closeTalismanPicker(); render();
  });
  $('talismanPickerClose').addEventListener('click', closeTalismanPicker);

  function talismanMathText(item) {
    var parts = [];
    var statNames = Object.keys(item.statBonus || {});
    if (statNames.length) parts.push(statNames.map(function (key) { return '+' + item.statBonus[key] + ' ' + key; }).join('/'));
    Object.keys(item.mult || {}).forEach(function (key) {
      parts.push('+' + Math.round((item.mult[key] - 1) * 1000) / 10 + '% ' + (key === 'all' ? 'attack' : key));
    });
    var survivalLabels = { hpMult:'HP', fpMult:'FP', staminaMult:'stamina', equipLoadMult:'equip load' };
    Object.keys(item.survival || {}).forEach(function (key) {
      parts.push((item.survival[key] >= 1 ? '+' : '') + (Math.round((item.survival[key] - 1) * 1000) / 10) + '% ' + survivalLabels[key]);
    });
    var profile = Object.assign({}, item.defense || {}, item.defense && item.defense[combatContext] || {});
    delete profile.pve; delete profile.pvp;
    var damageKeys = ['physicalTakenMult','magicTakenMult','fireTakenMult','lightningTakenMult','holyTakenMult'];
    var values = damageKeys.filter(function (key) { return profile[key] != null; }).map(function (key) { return profile[key]; });
    if (values.length === 5 && values.every(function (value) { return value === values[0]; })) {
      profile.allTakenMult = values[0]; damageKeys.forEach(function (key) { delete profile[key]; });
    } else if (values.length === 4 && profile.physicalTakenMult == null && values.every(function (value) { return value === values[0]; })) {
      var elementRate = values[0]; ['magicTakenMult','fireTakenMult','lightningTakenMult','holyTakenMult'].forEach(function (key) { delete profile[key]; });
      parts.push((elementRate <= 1 ? '−' : '+') + Math.abs(Math.round((1 - elementRate) * 1000) / 10) + '% non-physical taken (' + combatContext.toUpperCase() + ')');
    }
    var defenseLabels = { allTakenMult:'all damage', physicalTakenMult:'physical', standardTakenMult:'standard', strikeTakenMult:'strike', slashTakenMult:'slash', pierceTakenMult:'pierce', magicTakenMult:'magic', fireTakenMult:'fire', lightningTakenMult:'lightning', holyTakenMult:'holy' };
    Object.keys(defenseLabels).forEach(function (key) {
      if (profile[key] == null) return;
      var delta = Math.round((1 - profile[key]) * 1000) / 10;
      parts.push((delta >= 0 ? '−' : '+') + Math.abs(delta) + '% ' + defenseLabels[key] + ' taken' + (item.defense && (item.defense.pve || item.defense.pvp) ? ' (' + combatContext.toUpperCase() + ')' : ''));
    });
    Object.keys(item.resistance || {}).forEach(function (key) { parts.push('+' + item.resistance[key] + ' ' + key); });
    var utilityLabels = { hpRegenPerSec:'HP/s', fpRegenPerSec:'FP/s', staminaRecoveryFlat:'stamina/s', memorySlots:'memory slots', virtualDex:'virtual DEX' };
    Object.keys(item.utility || {}).forEach(function (key) { parts.push('+' + item.utility[key] + ' ' + utilityLabels[key]); });
    return parts.join(' · ') || item.note || item.effect;
  }

  function renderEffectStack(taliEffects, attackEffects) {
    var buffs = Object.keys(activeBuffs).filter(function (id) { return activeBuffs[id]; }).map(buffById).filter(Boolean);
    var rows = buffs.map(function (item) {
      return '<div class="effect-row active"><span class="effect-mark">✦</span><span><b>' + escText(item.name) + '</b><small>' + escText(item.note || 'Active buff') + '</small></span><em>APPLIED</em></div>';
    });
    var attackById = {};
    (attackEffects.entries || []).forEach(function (entry) { attackById[entry.id] = entry; });
    taliEffects.entries.forEach(function (entry) {
      var item = entry.item;
      var attackEntry = attackById[item.id];
      var profileMiss = entry.active && item.attack && (!attackEntry || !attackEntry.applied);
      var status = entry.invalid ? 'INVALID' : !entry.modeled ? 'WEIGHT ONLY' : !entry.active ? 'CONDITION OFF' : profileMiss ? 'MOVE MISMATCH' : 'APPLIED';
      rows.push('<div class="effect-row' + (entry.active && !profileMiss ? ' active' : '') + (profileMiss ? ' waiting' : '') + (entry.invalid ? ' invalid' : '') + '">' +
        '<span class="effect-mark"><img src="../' + item.icon + '" alt=""></span><span><b>' + escText(item.name) + '</b><small>' + escText(talismanMathText(item)) +
        (item.condition ? ' · ' + escText(item.condition.label) : '') + '</small></span><em>' + status + '</em></div>');
    });
    $('effectStack').innerHTML = rows.length
      ? '<div class="effect-stack-head"><span>Calculation order</span><b>' + attackEffects.applied + ' move modifier' + (attackEffects.applied === 1 ? '' : 's') + ' applied</b></div>' + rows.join('')
      : '<div class="effect-empty">No active modifiers. Your output is raw equipment and attributes.</div>';
  }

  /* ---- presets (dropdown + buttons) ---- */
  var activePresetIndex = presets.findIndex(function (p) { return p.loadout && p.loadout.weaponId === current.id; });
  $('presetSelect').innerHTML = '<option value="">Load build…</option>' + presets.map(function (p, i) { return '<option value="'+i+'">'+p.name+'</option>'; }).join('');
  $('presetSelect').addEventListener('change', function () {
    if (this.value === '') return;
    if (this.value.charAt(0) === 'm') { var m = myBuilds[+this.value.slice(1)]; if (m) applyState(m.state); return; }
    applyPreset(presets[+this.value]);
  });
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
    armaments = { right: [null,null,null], left: [null,null,null] };
    activeSlot = { hand: 'right', index: 0 }; weaponTarget = null;
    STATS.forEach(function (k) { build[k] = p.stats[k]; syncStat(k); });
    $('level').value = ERCalc.characterLevel(p.stats); // sensible starting level; user can override
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
    armaments.right[0] = { weaponId: current.id, affinity: affinity, upgrade: upgradeLevel };
    syncActivePreset();
    render();
  }

  /* ---- My Builds: named multi-save (T11 remainder) ---- */
  var MYB_KEY = 'er-my-builds';
  var myBuilds = (function () { try { return JSON.parse(localStorage.getItem(MYB_KEY) || '[]') || []; } catch (e) { return []; } })();
  function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function saveMyBuilds() { try { localStorage.setItem(MYB_KEY, JSON.stringify(myBuilds)); } catch (e) {} }
  function applyState(o) {
    if (o.stats) STATS.forEach(function (k) { if (o.stats[k] >= 1) { build[k] = Math.min(99, o.stats[k]); syncStat(k); } });
    twoHanded = o.twoHanded !== false; $('twoHand').checked = twoHanded;
    combatContext = o.combatContext === 'pvp' ? 'pvp' : 'pve'; $('combatContext').value = combatContext;
    attackProfileId = attackProfileById[o.attackProfile] ? o.attackProfile : 'neutral'; $('attackProfile').value = attackProfileId;
    var w = o.weapon && weapons.find(function (x) { return x.id === o.weapon; });
    if (w) { current = w; fillUpgrade(); fillAffinity(); }
    if (o.upgrade != null) { upgradeLevel = o.upgrade; $('upgrade').value = o.upgrade; }
    if (o.affinity && (o.affinity === 'Standard' || (current.affinities && current.affinities[o.affinity]))) { affinity = o.affinity; $('affinity').value = o.affinity; }
    if (o.level) $('level').value = o.level;
    activeBuffs = {};
    (o.buffs || []).forEach(function (id) { if (buffData.buffs.some(function (b) { return b.id === id; })) activeBuffs[id] = true; });
    taliConditionState = {};
    var savedTalismans = o.loadout && o.loadout.talismans ? o.loadout.talismans : o.talis || [];
    selectedTalismans = savedTalismans.slice(0, TALI_MAX).map(normalizeTalisman);
    while (selectedTalismans.length < TALI_MAX) selectedTalismans.push(null);
    scaduLevel = Math.max(0, Math.min(20, +o.scadu || 0)); syncScadu();
    gearWeight = Math.max(0, +o.gearWeight || 0); $('gearWeight').value = gearWeight;
    var savedArmor = o.armor || (o.loadout && o.loadout.armor) || {};
    ARMOR_SLOTS.forEach(function (slot, i) {
      var id = Array.isArray(savedArmor) ? savedArmor[i] : savedArmor[slot.id];
      selectedArmor[slot.id] = id != null && armorById[String(id)] && armorById[String(id)].slot === slot.id ? String(id) : null;
    });
    armaments = { right: [null,null,null], left: [null,null,null] };
    if (o.loadout && (o.loadout.rightHand || o.loadout.leftHand)) {
      armaments.right = (o.loadout.rightHand || []).slice(0, 3).map(normalizeArmament);
      armaments.left = (o.loadout.leftHand || []).slice(0, 3).map(normalizeArmament);
      while (armaments.right.length < 3) armaments.right.push(null);
      while (armaments.left.length < 3) armaments.left.push(null);
    }
    if (!armaments.right.some(Boolean) && !armaments.left.some(Boolean)) armaments.right[0] = { weaponId: current.id, affinity: affinity, upgrade: upgradeLevel };
    activeSlot = { hand: 'right', index: 0 };
    if (/^([rl])[0-2]$/.test(o.activeSlot || '')) activeSlot = { hand: o.activeSlot.charAt(0) === 'l' ? 'left' : 'right', index: +o.activeSlot.charAt(1) };
    if (!armaments[activeSlot.hand][activeSlot.index]) {
      ['right','left'].some(function (hand) { var i = armaments[hand].findIndex(Boolean); if (i >= 0) { activeSlot = { hand: hand, index: i }; return true; } return false; });
    }
    var restored = armaments[activeSlot.hand][activeSlot.index];
    if (restored) {
      current = weapons.find(function (x) { return x.id === restored.weaponId; }) || current;
      fillUpgrade(); fillAffinity();
      if (restored.affinity && (restored.affinity === 'Standard' || (current.affinities && current.affinities[restored.affinity]))) { affinity = restored.affinity; $('affinity').value = affinity; }
      if (restored.upgrade != null) { upgradeLevel = restored.upgrade; $('upgrade').value = restored.upgrade; }
    }
    weaponTarget = null; $('weaponSearch').placeholder = 'Search weapons…';
    renderBuffGroups();
    activePresetIndex = -1; syncActivePreset();
    render();
  }
  function renderMyBuilds() {
    $('myBuildsHead').hidden = myBuilds.length === 0;
    $('myBuilds').innerHTML = myBuilds.map(function (m, i) {
      return '<button data-m="' + i + '" title="Load this build">' + escText(m.name) +
        ' <span class="myb-x" data-x="' + i + '" title="Delete this build">×</span></button>';
    }).join('');
    var sel = $('presetSelect'), og = sel.querySelector('optgroup');
    if (og) og.remove();
    if (myBuilds.length) {
      var g = document.createElement('optgroup'); g.label = 'My Builds';
      myBuilds.forEach(function (m, i) {
        var o = document.createElement('option'); o.value = 'm' + i; o.textContent = m.name; g.appendChild(o);
      });
      sel.appendChild(g);
    }
  }
  $('saveBuild').addEventListener('click', function () {
    var self = this;
    var suggestion = current.name + ' ' + (twoHanded ? '2H' : '1H');
    var name = window.prompt('Name this build:', suggestion);
    if (!name || !(name = name.trim())) return;
    var existing = myBuilds.findIndex(function (m) { return m.name.toLowerCase() === name.toLowerCase(); });
    var entry = { name: name, state: captureState() };
    if (existing >= 0) myBuilds[existing] = entry; else myBuilds.push(entry);
    saveMyBuilds(); renderMyBuilds();
    self.textContent = 'Saved ✓'; setTimeout(function () { self.textContent = '💾 Save'; }, 1400);
  });
  $('myBuilds').addEventListener('click', function (e) {
    var x = e.target.closest('[data-x]');
    if (x) {
      var i = +x.getAttribute('data-x');
      if (window.confirm('Delete "' + myBuilds[i].name + '"?')) { myBuilds.splice(i, 1); saveMyBuilds(); renderMyBuilds(); }
      return;
    }
    var b = e.target.closest('[data-m]');
    if (b) applyState(myBuilds[+b.getAttribute('data-m')].state);
  });
  renderMyBuilds();

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
    saveActiveArmament();
    var target = weaponTarget || activeSlot;
    current = weapons.find(function (w){ return w.id === id.getAttribute('data-id'); });
    activeSlot = { hand: target.hand, index: target.index };
    armaments[activeSlot.hand][activeSlot.index] = { weaponId: current.id, affinity: 'Standard', upgrade: null };
    weaponTarget = null;
    upgradeLevel = null; search.value = ''; list.hidden = true; fillUpgrade(); fillAffinity();
    search.placeholder = 'Search weapons…';
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
    saveActiveArmament();
    renderArmamentRack();
    var taliEffects = resolveTalismanEffects();
    renderTalismanRack(taliEffects);
    var baseMods = collectMods(taliEffects);
    var attackProfile = attackProfileById[attackProfileId] || attackProfileById.neutral;
    var attackEffects = ERCalc.resolveAttackEffects(baseMods, {
      combatContext: combatContext,
      profileId: attackProfile.id,
      tags: attackProfile.tags,
      state: { twoHanded: twoHanded }
    });
    var mods = baseMods.concat(attackEffects.mods);
    var r = ERCalc.computeARBuffed(build, current, { upgradeLevel: upgradeLevel, twoHanded: twoHanded, affinity: affinity }, mods);
    // stats after talisman bonuses — requirements + display should agree with the engine
    var boosted = {}; STATS.forEach(function (k) { boosted[k] = build[k]; });
    baseMods.forEach(function (m) { if (m.statBonus) for (var s in m.statBonus) if (boosted[s] != null) boosted[s] = Math.min(99, boosted[s] + m.statBonus[s]); });

    $('statTotal').textContent = STATS.reduce(function (s,k){ return s + build[k]; }, 0);
    $('weaponName').textContent = current.name;
    $('weaponType').textContent = current.type + (current.category === 'somber' ? ' · Somber' : '');
    setWeaponThumb(current);
    $('weaponAtlasLink').href = '../atlas/weapon.html?id=' + encodeURIComponent(current.id);
    $('weight').textContent = current.weight != null ? current.weight : '—';
    $('passive').textContent = current.passive || 'None';

    // requirements — mirror the engine: 2H counts 1.5x STR; talisman stat bonuses count too
    var reqs = current.requirements || {};
    $('reqs').innerHTML = Object.keys(reqs).map(function (k) {
      var have = (k === 'STR' && twoHanded) ? Math.min(99, Math.floor((boosted.STR || 1) * 1.5)) : (boosted[k] || 1);
      var ok = have >= reqs[k];
      var note = (k === 'STR' && twoHanded && ok && (boosted[k] || 1) < reqs[k]) ? ' 2H' : '';
      return '<span class="'+(ok?'met':'unmet')+'">'+k+' '+reqs[k]+' ('+have+note+')</span>';
    }).join('') || '<span style="color:var(--dim)">none</span>';

    // AR — buffed number front and center; unbuffed baseline shown when modifiers act
    var shownAR = r.buffed.totalAR, shownTypes = r.buffed.byType, shownStatus = r.buffed.status;
    $('ar').textContent = shownAR;
    $('attackProfile').value = attackProfile.id;
    $('attackLensName').textContent = attackProfile.short || attackProfile.label;
    $('arLabel').textContent = attackProfile.id === 'neutral' ? 'Total Attack Rating' : 'Profiled Attack Rating';
    var baseAR = mods.length ? ERCalc.computeAR(build, current, { upgradeLevel: upgradeLevel, twoHanded: twoHanded, affinity: affinity }).totalAR : shownAR;
    var delta = shownAR - baseAR;
    $('arBase').textContent = shownAR !== baseAR ? 'neutral ' + baseAR + '  ·  ' + (delta >= 0 ? '+' : '') + delta : 'neutral equipment output';
    $('attackLensState').textContent = attackEffects.applied ? attackEffects.applied + ' matched modifier' + (attackEffects.applied === 1 ? '' : 's') : 'no move-specific modifier matched';
    $('attackLensState').classList.toggle('live', attackEffects.applied > 0);

    // Scadutree Blessing (Land of Shadow only) — post-everything multiplier on the shown AR
    var sc = ERCalc.scadutree(scaduLevel);
    $('scaduOut').innerHTML = sc.level > 0
      ? 'Land of Shadow: <b>' + Math.floor(shownAR * sc.attack) + '</b> AR <small>(×' + sc.attack.toFixed(2) + ' dealt · −' + sc.negationPct + '% taken)</small>'
      : '';

    // damage types
    var types = ['physical','magic','fire','lightning','holy'];
    var maxT = Math.max.apply(null, types.map(function (t){ return shownTypes[t] || 0; }).concat([1]));
    $('byType').innerHTML = types.map(function (t) {
      var v = shownTypes[t] || 0, pct = shownAR ? Math.round(v / shownAR * 100) : 0;
      return '<div class="trow '+t+'"><span class="lbl">'+t+'</span>'+bar(v,maxT)+'<span class="amt">'+v+' <small style="color:var(--dim)">'+pct+'%</small></span></div>';
    }).join('');

    // status
    $('status').innerHTML = STATUS.map(function (s) {
      var v = (shownStatus && shownStatus[s[0]]) || 0;
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

    renderEffectStack(taliEffects, attackEffects);
    renderSurvival(baseMods, boosted, taliEffects);
    renderPayoff(r);
    renderSoftCap(r);
    renderBreakpoints(r);
    renderCompare();
    renderSuggestions();
    persist();
  }

  /* ---- Survival panel: HP/FP/stamina + equip load vs roll breakpoints ---- */
  var ROLL_LABEL = { light: 'Light roll', medium: 'Medium roll', heavy: 'Heavy roll', overloaded: 'Overloaded — can’t roll' };
  function renderSurvival(mods, boosted, taliEffects) {
    var se = ERCalc.statEffects(boosted, mods);
    var equippedWeapons = equippedArmamentPieces();
    var weaponW = equippedWeapons.reduce(function (sum, weapon) { return sum + (+weapon.weight || 0); }, 0);
    var armorTotal = ERCalc.aggregateArmor(equippedArmorPieces());
    var totalW = Math.round((weaponW + armorTotal.weight + (taliEffects ? taliEffects.weight : 0) + gearWeight) * 10) / 10;
    var rs = ERCalc.rollState(totalW, se.equipLoad);
    $('survHP').textContent = se.hp;
    $('survFP').textContent = se.fp;
    $('survStam').textContent = se.stamina;
    var utility = ERCalc.aggregateUtility(mods);
    var utilityPills = [];
    if (utility.hpRegenPerSec) utilityPills.push('+' + utility.hpRegenPerSec + ' HP/s');
    if (utility.fpRegenPerSec) utilityPills.push('+' + utility.fpRegenPerSec + ' FP/s');
    if (utility.staminaRecoveryFlat) utilityPills.push('+' + utility.staminaRecoveryFlat + ' stamina/s');
    if (utility.memorySlots) utilityPills.push('+' + utility.memorySlots + ' memory slots');
    if (utility.virtualDex) utilityPills.push('+' + utility.virtualDex + ' virtual DEX casting speed');
    $('survUtility').hidden = !utilityPills.length;
    $('survUtility').innerHTML = utilityPills.map(function (label) { return '<span>' + label + '</span>'; }).join('');
    $('survLoadText').innerHTML = totalW + ' / ' + se.equipLoad +
      (equippedWeapons.some(function (weapon) { return weapon.weight == null; }) ? ' <span class="unverified" title="an equipped weapon weight is unknown — not counted">?</span>' : '');
    $('survLoadBar').innerHTML =
      '<div class="loadbar ' + rs.state + '"><i style="width:' + Math.min(100, rs.ratio * 100) + '%"></i>' +
      '<s style="left:30%"></s><s style="left:70%"></s></div>';
    $('survRollState').textContent = ROLL_LABEL[rs.state];
    $('survRollState').className = 'roll-state ' + rs.state;

    var msg;
    if (rs.state === 'overloaded') {
      msg = 'drop ' + Math.abs(rs.headroom) + ' weight for heavy roll';
    } else {
      var nextName = rs.nextBreakpoint === 0.3 ? 'medium roll' : rs.nextBreakpoint === 0.7 ? 'heavy roll' : 'overloaded';
      msg = '+' + rs.headroom + ' weight headroom before ' + nextName;
    }
    // "or N more Endurance" — how many END points would lift this load into the better bracket
    if (rs.state !== 'light') {
      var betterCap = rs.state === 'medium' ? 0.3 : rs.state === 'heavy' ? 0.7 : 1.0;
      var betterName = rs.state === 'medium' ? 'light roll' : rs.state === 'heavy' ? 'medium roll' : 'heavy roll';
      var endNow = Math.min(99, boosted.END || 1);
      for (var e = endNow + 1; e <= Math.min(99, endNow + 15); e++) {
        var b2 = { VIG: 1, MND: 1, END: e };
        if (totalW / ERCalc.statEffects(b2, mods).equipLoad < betterCap) {
          msg += ' · or +' + (e - endNow) + ' END for ' + betterName;
          break;
        }
      }
    }
    $('survHeadroom').textContent = msg;
    renderArmorSlots();
    $('armorWeight').textContent = armorTotal.weight.toFixed(1);
    $('armorPoise').textContent = armorTotal.poise;
    $('poiseNote').textContent = armorTotal.poise < 51 ? (51 - armorTotal.poise) + ' to 51' : armorTotal.poise < 101 ? (101 - armorTotal.poise) + ' to 101' : '101+ tier';
    var finalDefense = ERCalc.aggregateDefense(armorTotal, mods, combatContext);
    $('defenseContextLabel').textContent = combatContext === 'pvp' ? 'PvP' : 'PvE';
    var defenseTypes = [['physical','Physical'],['strike','Strike'],['slash','Slash'],['pierce','Pierce'],['magic','Magic'],['fire','Fire'],['lightning','Lightning'],['holy','Holy']];
    $('armorNegation').innerHTML = defenseTypes.map(function (entry) {
      var value = finalDefense.negation[entry[0]];
      return '<div class="defense-row"><span>' + entry[1] + '</span><div class="defense-bar"><i style="width:' + Math.max(0, Math.min(100, value * 2.5)) + '%"></i></div><b>' + value.toFixed(1) + '</b></div>';
    }).join('');
    var resistTypes = [['immunity','Immunity'],['robustness','Robustness'],['focus','Focus'],['vitality','Vitality']];
    var finalResistance = ERCalc.aggregateResistance(armorTotal, mods);
    $('armorResistance').innerHTML = resistTypes.map(function (entry) {
      return '<div><span>' + entry[1] + '</span><b>' + finalResistance[entry[0]] + '</b></div>';
    }).join('');
  }

  /* ---- status payoff (T4): hits-to-proc + what the proc is worth ---- */
  function renderPayoff(r) {
    var stMap = (r.buffed && r.buffed.status) || r.status;
    var active = STATUS.filter(function (s) { return (stMap && stMap[s[0]]) > 0; });
    $('payoffBlock').hidden = !active.length;
    if (!active.length) return;
    var target = {
      maxHP: +$('targetHP').value || 2000,
      resist: +$('targetResist').value || 250,
      boss: $('targetBoss').checked,
      enhanced: ERCalc.hasEnhancedBleed(current, affinity)
    };
    $('payoff').innerHTML = active.map(function (s) {
      var p = ERCalc.statusPayload(stMap[s[0]], s[0], target);
      if (!p) return '';
      var payoff;
      if (p.kind === 'burst') payoff = '<b>' + p.procDamage + '</b> dmg on proc';
      else if (p.kind === 'dot') payoff = '<b>' + p.procDamage + '</b> dmg over ' + p.duration + 's <small>(' + p.dps + '/s)</small>';
      else payoff = 'crowd control';
      return '<div class="payoff-row">' +
        '<img class="status-icon" src="../assets/icons/status/' + s[0] + '.png" alt="">' +
        '<span class="payoff-name">' + p.label + '</span>' +
        '<span class="payoff-hits">' + p.hitsToProc + ' hit' + (p.hitsToProc > 1 ? 's' : '') + ' to proc</span>' +
        '<span class="payoff-dmg">' + payoff + '</span>' +
        (p.note ? '<span class="payoff-note">' + p.note + '</span>' : '') +
        '</div>';
    }).join('');
  }
  ['targetHP', 'targetResist', 'targetBoss'].forEach(function (id) {
    $(id).addEventListener('input', function () { render(); });
  });

  /* ---- suggested weapons (T1): rank the whole pool for the current build ---- */
  function renderSuggestions() {
    var ranked = ERCalc.suggestWeapons(build, pool(), { twoHanded: twoHanded, limit: 15 });
    var best = ranked.length ? ranked[0].ar : 0;
    $('suggest').innerHTML = ranked.map(function (x, i) {
      var w = x.weapon;
      var pct = best ? Math.max(4, Math.round(x.ar / best * 100)) : 0;
      return '<div class="sug-row'+(w.id === current.id ? ' current' : '')+(x.requirementsMet ? '' : ' bad')+'" data-id="'+w.id+'">' +
        '<span class="sug-rank">'+(i+1)+'</span>' +
        '<span class="sug-name">'+w.name+(x.requirementsMet ? '' : ' <span class="sug-warn" title="requirements not met">⚠</span>')+
          '<small>'+w.type+(w.source === 'dlc' ? ' · DLC' : '')+'</small></span>' +
        '<span class="sug-bar"><i style="width:'+pct+'%"></i></span>' +
        '<span class="sug-ar">'+x.ar+'</span>' +
        '<a class="sug-atlas" href="../atlas/weapon.html?id='+encodeURIComponent(w.id)+'" title="Atlas: where to find it">➜</a></div>';
    }).join('') || '<div style="color:var(--dim)">No weapons available.</div>';
  }
  $('suggest').addEventListener('click', function (e) {
    if (e.target.closest('.sug-atlas')) return; // let the atlas link navigate
    var row = e.target.closest('[data-id]'); if (!row) return;
    current = weapons.find(function (w){ return w.id === row.getAttribute('data-id'); });
    armaments[activeSlot.hand][activeSlot.index] = { weaponId: current.id, affinity: 'Standard', upgrade: null };
    upgradeLevel = null; fillUpgrade(); fillAffinity();
    activePresetIndex = -1; syncActivePreset(); render();
    document.querySelector('.weapon-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---- compare tray: live-ranks added weapons for the CURRENT build ---- */
  var compareBar = document.createElement('div');
  compareBar.className = 'compare-bar';
  document.body.appendChild(compareBar);
  function renderCompare() {
    if (!compareIds.length) { compareBar.classList.remove('show'); return; }
    compareBar.classList.add('show');
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

  /* ---- stat advisor (T6) ---- */
  var lastOpt = null;
  $('optimizeBtn').addEventListener('click', function () {
    lastOpt = ERCalc.optimize(build, current, { twoHanded: twoHanded, affinity: affinity, upgradeLevel: upgradeLevel });
    var o = lastOpt;
    var rows = SCALING.map(function (k) {
      var cur = build[k], sug = o.stats[k];
      var cls = sug > cur ? 'up' : sug < cur ? 'down' : 'same';
      var arrow = sug > cur ? '▲' : sug < cur ? '▼' : '·';
      return '<div class="opt-row"><span class="lbl">'+STAT_LABEL[k]+'</span>' +
        '<span class="vals"><span class="cur">'+cur+'</span> → <b class="'+cls+'">'+sug+'</b> <i class="'+cls+'">'+arrow+'</i></span></div>';
    }).join('');
    $('optResult').innerHTML = o.gained > 0
      ? rows + '<div class="opt-gain">+'+o.gained+' AR <small>('+o.before+' → '+o.totalAR+')</small></div>' +
        '<button class="opt-apply" id="optApply">Apply This Spread</button>'
      : '<div class="opt-gain even">Your spread is already optimal for this weapon — '+o.before+' AR</div>';
    $('optResult').hidden = false;
  });
  $('optResult').addEventListener('click', function (e) {
    if (e.target.id !== 'optApply' || !lastOpt) return;
    SCALING.forEach(function (k) { build[k] = lastOpt.stats[k]; syncStat(k); });
    $('optResult').hidden = true;
    activePresetIndex = -1; syncActivePreset(); render();
  });

  $('addCompare').addEventListener('click', function () {
    if (compareIds.indexOf(current.id) < 0) compareIds.push(current.id);
    renderCompare();
    var self = this; self.textContent = current.name + ' added ✓';
    setTimeout(function(){ self.textContent = 'Add to Compare'; }, 1200);
  });

  $('shareBuild').addEventListener('click', function () {
    var self = this;
    doPersist(); // make sure the URL is current before copying
    function ok() { self.textContent = 'Copied ✓'; setTimeout(function () { self.textContent = '🔗 Share'; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(ok, function () { window.prompt('Copy this build link:', location.href); });
    } else {
      window.prompt('Copy this build link:', location.href);
    }
  });
  $('level').addEventListener('input', persist);

  $('level').value = (BOOT && BOOT.level) || ERCalc.characterLevel(build); // starting reference; level is manual + independent
  fillAffinity(); fillUpgrade();
  if (BOOT || initialArmament) { // affinity/upgrade must be applied after the selects are (re)filled
    var desiredAffinity = (initialArmament && initialArmament.affinity) || (BOOT && BOOT.affinity);
    var desiredUpgrade = initialArmament && initialArmament.upgrade != null ? initialArmament.upgrade : BOOT && BOOT.upgrade;
    if (desiredAffinity && (desiredAffinity === 'Standard' || (current.affinities && current.affinities[desiredAffinity]))) {
      affinity = desiredAffinity; $('affinity').value = affinity;
    }
    if (desiredUpgrade != null && desiredUpgrade !== '' && !isNaN(+desiredUpgrade)) {
      upgradeLevel = +desiredUpgrade; $('upgrade').value = upgradeLevel;
    }
  }
  renderBuffGroups(); syncActivePreset(); render();
})();
