/*
 * Elden Ring Build Calculator — engine
 * ------------------------------------
 * Pure, framework-agnostic. Works in the browser (window.ERCalc) and Node (require).
 * The UI never touches the math: feed it a build + weapon, render what comes back.
 *
 * Math + sources: docs/01-damage-formula.md, docs/02-reinforcement.md.
 * Curves/reinforcement constants below mirror data/scaling-curves.json + data/reinforcement.json
 * (kept in sync; those files are the documented source of truth).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATS = ['STR', 'DEX', 'INT', 'FAI', 'ARC'];
  var DAMAGE_TYPES = ['physical', 'magic', 'fire', 'lightning', 'holy'];
  var STATUS_TYPES = ['bleed', 'frost', 'poison', 'rot', 'sleep', 'madness'];

  // --- CalcCorrectGraph saturation curves — EXACT game params (mirror data/scaling-curves.json) ---
  // Each point: {s: stat, g: growth fraction, adj: adjPt exponent governing the segment ABOVE it}.
  // Source: datamined CalcCorrectGraph (graphs 0 physical / 4 elemental / 6 arcane-status).
  var CURVES = {
    physical:       [ {s:1,g:0,adj:1.2}, {s:18,g:0.25,adj:-1.2}, {s:60,g:0.75,adj:1}, {s:80,g:0.9,adj:1}, {s:150,g:1.1,adj:1} ],
    elemental:      [ {s:1,g:0,adj:1},   {s:20,g:0.4,adj:1},     {s:50,g:0.8,adj:1},  {s:80,g:0.95,adj:1}, {s:99,g:1,adj:1} ],
    arcaneStatus:   [ {s:1,g:0,adj:1},   {s:25,g:0.1,adj:1},     {s:45,g:0.75,adj:1}, {s:60,g:0.9,adj:1},  {s:99,g:1,adj:1} ]
  };
  CURVES.arcanePhysical = CURVES.physical; // arcane scaling on physical AR uses the physical graph

  // Which curve each DAMAGE TYPE uses — the game keys CalcCorrectGraph by damage type, not by the
  // scaling stat [CONFIRMED]. So Arcane scaling a weapon's fire/magic/lightning/holy damage (e.g.
  // Rivers of Blood's fire) uses the elemental curve, not the physical one, even though Arcane's
  // effect on *physical* AR does use the physical curve.
  var TYPE_CURVE = { physical: 'physical', magic: 'elemental', fire: 'elemental', lightning: 'elemental', holy: 'elemental' };

  // Which curve represents each stat for DISPLAY (soft-cap chart / breakpoints panel) — a stat can
  // straddle two curves on a split-damage weapon, so this picks the stat's typical/primary one.
  var STAT_CURVE = { STR: 'physical', DEX: 'physical', INT: 'elemental', FAI: 'elemental', ARC: 'arcanePhysical' };

  // Soft-cap breakpoints per curve (the CalcCorrectGraph control points).
  var SOFT_CAPS = { physical: [18, 60, 80], elemental: [20, 50, 80], arcanePhysical: [18, 60, 80], arcaneStatus: [25, 45, 60] };

  var GRADE = [ ['S',175], ['A',140], ['B',90], ['C',60], ['D',25], ['E',1] ];

  // --- Reinforcement (mirror data/reinforcement.json) ---
  var REINFORCE = {
    regular: { maxLevel: 25, basePerLevel: 0.058, scalingMin: 0.60 },
    somber:  { maxLevel: 10, basePerLevel: 0.145, scalingMin: 0.60 }
  };
  var TOTAL_MULT_AT_MAX = 2.45;
  var UNMET_REQ_PENALTY = 0.40; // scaling reduced ~40% on deficient stats
  var TWO_HAND_STR_MULT = 1.5;

  // ---------- helpers ----------

  function clampStat(x) { return Math.max(1, Math.min(99, x)); }

  // CalcCorrectGraph saturation. Returns growth fraction (0..~1.1).
  // Between control points a,b: growth = a.g + (b.g-a.g) * ratio^adj  (adj from lower point a).
  // If adj < 0, the curve is mirrored: 1 - (1-ratio)^(-adj).
  function saturation(curveName, statLevel) {
    var pts = CURVES[curveName];
    var x = clampStat(statLevel);
    if (x <= pts[0].s) return pts[0].g;
    for (var i = 1; i < pts.length; i++) {
      if (x <= pts[i].s) {
        var a = pts[i - 1], b = pts[i];
        var ratio = (x - a.s) / (b.s - a.s);
        var exp = a.adj == null ? 1 : a.adj;
        var r2 = exp >= 0 ? Math.pow(ratio, exp) : 1 - Math.pow(1 - ratio, -exp);
        return a.g + (b.g - a.g) * r2;
      }
    }
    return pts[pts.length - 1].g;
  }

  // Displayed grade letter for a numeric scaling value.
  function gradeFor(scalingValue) {
    if (!scalingValue || scalingValue <= 0) return '-';
    for (var i = 0; i < GRADE.length; i++) if (scalingValue >= GRADE[i][1]) return GRADE[i][0];
    return '-';
  }

  // Reinforcement fractions (of MAX) at a given upgrade level.
  function reinforce(category, level) {
    var r = REINFORCE[category] || REINFORCE.regular;
    var lv = Math.max(0, Math.min(r.maxLevel, level == null ? r.maxLevel : level));
    return {
      baseFrac: (1 + r.basePerLevel * lv) / TOTAL_MULT_AT_MAX,
      scalingFrac: r.scalingMin + (1 - r.scalingMin) * (lv / r.maxLevel),
      level: lv,
      maxLevel: r.maxLevel
    };
  }

  function effectiveStats(build, twoHanded) {
    var e = {};
    for (var i = 0; i < STATS.length; i++) { var k = STATS[i]; e[k] = clampStat(build[k] || 1); }
    if (twoHanded) e.STR = clampStat(Math.floor(e.STR * TWO_HAND_STR_MULT));
    return e;
  }

  // Resolve the weapon's damage/scaling for the chosen affinity variant.
  function resolveVariant(weapon, affinity) {
    if (affinity && weapon.affinities && weapon.affinities[affinity]) {
      var v = weapon.affinities[affinity];
      return {
        base: v.base || weapon.base,
        scaling: v.scaling || weapon.scaling,
        elementScaling: v.elementScaling || weapon.elementScaling,
        status: v.status || weapon.status,
        arcStatusScaling: v.arcStatusScaling != null ? v.arcStatusScaling : weapon.arcStatusScaling
      };
    }
    return {
      base: weapon.base, scaling: weapon.scaling, elementScaling: weapon.elementScaling,
      status: weapon.status, arcStatusScaling: weapon.arcStatusScaling
    };
  }

  // Two-handing counts toward the STR requirement (floor 1.5x) — 14 STR wields a 20-STR
  // weapon two-handed in-game [CONFIRMED]. Other stats always use their raw value.
  function checkRequirements(weapon, build, twoHanded) {
    var unmet = [];
    var reqs = weapon.requirements || {};
    for (var i = 0; i < STATS.length; i++) {
      var k = STATS[i];
      var have = build[k] || 1;
      if (k === 'STR' && twoHanded) have = clampStat(Math.floor(have * TWO_HAND_STR_MULT));
      if ((reqs[k] || 0) > have) unmet.push({ stat: k, need: reqs[k], have: have });
    }
    return unmet;
  }

  // Core: total AR + per-type + per-stat for a resolved variant at given effective stats.
  function rawAR(variant, effStats, rein, deficientStats) {
    var byType = {}, byStat = { STR: 0, DEX: 0, INT: 0, FAI: 0, ARC: 0 }, total = 0;
    for (var t = 0; t < DAMAGE_TYPES.length; t++) {
      var type = DAMAGE_TYPES[t];
      var base0 = (variant.base && variant.base[type]) || 0;
      if (base0 <= 0) continue;
      var b = base0 * rein.baseFrac;
      var typeTotal = b;
      for (var s = 0; s < STATS.length; s++) {
        var stat = STATS[s];
        var sv = ((variant.scaling && variant.scaling[stat]) || 0) * rein.scalingFrac;
        if (sv <= 0) continue;
        // If elementScaling is present, a stat only scales the damage types it's mapped to.
        if (variant.elementScaling && variant.elementScaling[stat] && variant.elementScaling[stat].indexOf(type) < 0) continue;
        var sat = saturation(TYPE_CURVE[type], effStats[stat]);
        var penalty = (deficientStats && deficientStats[stat]) ? (1 - UNMET_REQ_PENALTY) : 1;
        var bonus = b * (sv / 100) * sat * penalty;
        typeTotal += bonus;
        byStat[stat] += bonus;
      }
      byType[type] = typeTotal;
      total += typeTotal;
    }
    return { total: total, byType: byType, byStat: byStat };
  }

  function computeStatus(variant, effStats) {
    var out = {};
    for (var i = 0; i < STATUS_TYPES.length; i++) {
      var st = STATUS_TYPES[i];
      var base = (variant.status && variant.status[st]) || 0;
      if (base <= 0) continue;
      var buildup = base; // status buildup is flat across upgrade levels [CONFIRMED] — only Arcane changes it
      // Arcane boosts bleed/poison buildup, scaled by the weapon's own Arcane scaling value.
      // (Confirmed: Rivers of Blood base 50 → 76 at ARC 61, using its ARC scaling of 59.)
      var arcScale = (variant.scaling && variant.scaling.ARC) || variant.arcStatusScaling || 0;
      if ((st === 'bleed' || st === 'poison') && arcScale > 0) {
        buildup += base * (arcScale / 100) * saturation('arcaneStatus', effStats.ARC);
      }
      out[st] = Math.floor(buildup); // game truncates the displayed buildup
    }
    return out;
  }

  /**
   * computeAR(build, weapon, opts)
   * @param build  {STR,DEX,INT,FAI,ARC, [VIG,MND,END]}  attribute levels 1..99
   * @param weapon dataset entry (values stored at MAX upgrade)
   * @param opts   { affinity?, upgradeLevel?, twoHanded? }
   * @returns {
   *   totalAR, byType, byStat, status,
   *   softCaps: { STR:{perPoint,pastSoftCap}, ... },
   *   grades:   { STR:'D', ... },
   *   upgrade:  { level, maxLevel, category },
   *   requirementsMet, unmetReqs
   * }
   */
  function computeAR(build, weapon, opts) {
    opts = opts || {};
    var category = weapon.category === 'somber' ? 'somber' : 'regular';
    var rein = reinforce(category, opts.upgradeLevel);
    var variant = resolveVariant(weapon, opts.affinity);
    var eff = effectiveStats(build, opts.twoHanded);

    var unmet = checkRequirements(weapon, build, opts.twoHanded);
    var deficient = {};
    for (var i = 0; i < unmet.length; i++) deficient[unmet[i].stat] = true;

    var main = rawAR(variant, eff, rein, deficient);

    // Soft-cap analysis: finite difference per scaling stat (+1 point).
    var softCaps = {};
    for (var s = 0; s < STATS.length; s++) {
      var stat = STATS[s];
      if (((variant.scaling && variant.scaling[stat]) || 0) <= 0) continue;
      var bumped = {}; for (var k in eff) bumped[k] = eff[k];
      bumped[stat] = clampStat(eff[stat] + 1);
      var after = rawAR(variant, bumped, rein, deficient);
      var caps = SOFT_CAPS[STAT_CURVE[stat]];
      var majorSoftCap = caps[caps.length - 2]; // e.g. 60 for physical, 50 for elemental
      softCaps[stat] = {
        perPoint: Math.round((after.total - main.total) * 100) / 100,
        pastSoftCap: eff[stat] >= majorSoftCap,
        softCaps: caps
      };
    }

    var grades = {};
    for (var g = 0; g < STATS.length; g++) {
      var gk = STATS[g];
      grades[gk] = gradeFor(((variant.scaling && variant.scaling[gk]) || 0) * rein.scalingFrac);
    }

    return {
      totalAR: sumFloor(main.byType),   // in-game AR floors each damage type, then sums
      totalARExact: main.total,         // unfloored — for smooth derivatives (soft-cap chart), not display
      byType: floorMap(main.byType),
      byTypeExact: main.byType,         // unfloored per type — buff multipliers apply to this
      byStat: roundMap(main.byStat),
      status: computeStatus(variant, eff),
      softCaps: softCaps,
      grades: grades,
      upgrade: { level: rein.level, maxLevel: rein.maxLevel, category: category },
      requirementsMet: unmet.length === 0,
      unmetReqs: unmet,
      twoHanded: !!opts.twoHanded,
      effectiveStats: eff
    };
  }

  function roundMap(m) { var o = {}; for (var k in m) o[k] = Math.round(m[k]); return o; }
  function floorMap(m) { var o = {}; for (var k in m) o[k] = Math.floor(m[k]); return o; }
  function sumFloor(m) { var s = 0; for (var k in m) s += Math.floor(m[k]); return s; }

  /**
   * softCapCurve(build, weapon, stat, opts)
   * Per-point AR gain for `stat` across its whole range — feeds the soft-cap graph.
   * @returns { stat, softCaps:[...], points:[ {level, ar, perPoint} , ...] }
   *          perPoint[level] = AR(level+1) - AR(level).
   */
  function softCapCurve(build, weapon, stat, opts) {
    opts = opts || {};
    var b = {}; for (var k in build) b[k] = build[k];
    var points = [];
    var prev = null;
    for (var lv = 1; lv <= 99; lv++) {
      b[stat] = lv;
      // use the exact total — flooring per damage type turns the per-point diff into 0/1/2 sawtooth
      var ar = computeAR(b, weapon, opts).totalARExact;
      if (prev !== null) points[points.length - 1].perPoint = Math.round((ar - prev) * 100) / 100;
      points.push({ level: lv, ar: ar, perPoint: 0 });
      prev = ar;
    }
    return { stat: stat, softCaps: (SOFT_CAPS[STAT_CURVE[stat]] || []).slice(), points: points };
  }

  /**
   * suggestWeapons(build, weapons, opts)
   * Rank a weapon list by Attack Rating for the given build (each at its own max upgrade).
   * @param opts { twoHanded?, usableOnly?, limit? }
   * @returns [ { weapon, ar, requirementsMet, byType }, ... ] sorted best-first
   *          (usable weapons ranked above unmet-requirement weapons).
   */
  function suggestWeapons(build, weapons, opts) {
    opts = opts || {};
    var out = [];
    for (var i = 0; i < weapons.length; i++) {
      var w = weapons[i];
      var r = computeAR(build, w, { twoHanded: opts.twoHanded });
      if (opts.usableOnly && !r.requirementsMet) continue;
      out.push({ weapon: w, ar: r.totalAR, requirementsMet: r.requirementsMet, byType: r.byType });
    }
    out.sort(function (a, b) {
      if (a.requirementsMet !== b.requirementsMet) return a.requirementsMet ? -1 : 1;
      return b.ar - a.ar;
    });
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /**
   * computeARBuffed(build, weapon, opts, mods)
   * The buff/talisman layer (data/buffs.json entries are valid mods):
   *   { statBonus?: {STR:5,...} }        — raises attributes BEFORE scaling (soreseals etc.)
   *   { mult?: {all:1.15}|{fire:1.2..} } — multiplies final AR per damage type; stacks multiplicatively across mods
   *   { flat?: {fire:85,...} }           — raw damage added AFTER multipliers (greases — applies even at 0 base)
   *   { statusFlat?: {bleed:30} }        — flat status buildup (blood grease)
   * Returns computeAR's shape (on the stat-boosted build) + a `buffed` block { totalAR, byType, status }.
   */
  function computeARBuffed(build, weapon, opts, mods) {
    mods = mods || [];
    var b = {}; for (var k in build) b[k] = build[k];
    for (var i = 0; i < mods.length; i++) {
      var sb = mods[i].statBonus;
      if (sb) for (var s in sb) b[s] = clampStat((b[s] || 1) + sb[s]);
    }
    var r = computeAR(b, weapon, opts);

    var mult = {}, flat = {}, t;
    for (var d = 0; d < DAMAGE_TYPES.length; d++) { t = DAMAGE_TYPES[d]; mult[t] = 1; flat[t] = 0; }
    var statusFlat = {};
    for (var m = 0; m < mods.length; m++) {
      var mo = mods[m];
      if (mo.mult) for (var d2 = 0; d2 < DAMAGE_TYPES.length; d2++) {
        t = DAMAGE_TYPES[d2];
        // A type-specific value overrides the broad `all` fallback. This matters for effects
        // whose PvP multiplier applies to every component except holy damage.
        var f = mo.mult[t] != null ? mo.mult[t] : mo.mult.all;
        if (f) mult[t] *= f;
      }
      if (mo.flat) for (var ft in mo.flat) flat[ft] = (flat[ft] || 0) + mo.flat[ft];
      if (mo.statusFlat) for (var st in mo.statusFlat) statusFlat[st] = (statusFlat[st] || 0) + mo.statusFlat[st];
    }

    var byType = {}, total = 0;
    for (var d3 = 0; d3 < DAMAGE_TYPES.length; d3++) {
      t = DAMAGE_TYPES[d3];
      var raw = (r.byTypeExact && r.byTypeExact[t]) || 0;
      var v = raw * mult[t] + flat[t];
      if (v <= 0) continue;
      byType[t] = Math.floor(v);
      total += Math.floor(v);
    }
    var status = {};
    for (var sk in r.status) status[sk] = r.status[sk];
    for (var sf in statusFlat) status[sf] = Math.floor((status[sf] || 0) + statusFlat[sf]);

    r.buffed = { totalAR: total, byType: byType, status: status };
    return r;
  }

  // --- Status proc payloads [CONFIRMED wiki.gg + Fextralife, 2026-07] ---
  // bleed: 15% maxHP + 100 (bosses 10.5%); flat is 200 for ARC-scaling somber innate bleed / Blood affinity.
  // frost: 10% + 30 (bosses 7%), then -20% damage negation for 30s.
  // poison: (0.07% maxHP + 7)/s for 90s. rot (weapon-tier): (0.18% maxHP + 15)/s for 90s.
  // sleep: control only. madness: 15% + 100 + FP drain, players only.
  var STATUS_PROC = {
    bleed:   { kind: 'burst', pct: 0.15, bossPct: 0.105, flat: 100, enhancedFlat: 200, label: 'Hemorrhage' },
    frost:   { kind: 'burst', pct: 0.10, bossPct: 0.07, flat: 30, label: 'Frostbite', note: 'then −20% damage negation for 30s' },
    poison:  { kind: 'dot', pctPerSec: 0.0007, flatPerSec: 7, duration: 90, label: 'Poison' },
    rot:     { kind: 'dot', pctPerSec: 0.0018, flatPerSec: 15, duration: 90, label: 'Scarlet Rot' },
    sleep:   { kind: 'control', label: 'Sleep', note: 'staggers — no damage, opens a critical' },
    madness: { kind: 'burst', pct: 0.15, flat: 100, label: 'Madness', note: 'players only; also drains FP' }
  };

  // Blood-affinity / ARC-scaling somber innate-bleed weapons proc with the enhanced 200 flat.
  function hasEnhancedBleed(weapon, affinity) {
    if (affinity === 'Blood') return true;
    var v = resolveVariant(weapon, affinity);
    return weapon.category === 'somber' && ((v.scaling && v.scaling.ARC) || 0) > 0 && ((v.status && v.status.bleed) || 0) > 0;
  }

  /**
   * statusPayload(buildupPerHit, statusType, target)
   * Buildup ≠ payoff: how many hits until the proc, and what the proc is worth.
   * @param target { maxHP, resist, boss, enhanced }  resist = the enemy's buildup threshold
   * @returns { label, kind, buildupPerHit, hitsToProc, procDamage?, dps?, duration?, note }
   */
  function statusPayload(buildupPerHit, statusType, target) {
    var p = STATUS_PROC[statusType];
    if (!p || !buildupPerHit) return null;
    var t = target || {};
    var hp = t.maxHP || 2000, resist = t.resist || 250;
    var out = {
      type: statusType, label: p.label, kind: p.kind, buildupPerHit: buildupPerHit,
      hitsToProc: Math.max(1, Math.ceil(resist / buildupPerHit)), note: p.note || null
    };
    if (p.kind === 'burst') {
      var pct = (t.boss && p.bossPct) ? p.bossPct : p.pct;
      var flat = (t.enhanced && p.enhancedFlat) ? p.enhancedFlat : p.flat;
      out.procDamage = Math.floor(hp * pct + flat);
    } else if (p.kind === 'dot') {
      out.dps = Math.round((hp * p.pctPerSec + p.flatPerSec) * 10) / 10;
      out.duration = p.duration;
      out.procDamage = Math.floor((hp * p.pctPerSec + p.flatPerSec) * p.duration);
    }
    return out;
  }

  /**
   * optimize(build, weapon, opts)
   * Redistribute the build's OFFENSIVE stat points (STR/DEX/INT/FAI/ARC pool stays the same size)
   * to maximize AR for this weapon. Requirements are met first — greedy alone would never climb
   * the unmet-requirement penalty cliff — then points go one at a time to the best marginal gain.
   * @returns { stats: {STR..ARC}, totalAR, before, gained }
   */
  function optimize(build, weapon, opts) {
    opts = opts || {};
    var b = {}; for (var k in build) b[k] = build[k];
    var before = computeAR(build, weapon, opts).totalAR;

    var budget = 0;
    for (var i = 0; i < STATS.length; i++) { budget += clampStat(b[STATS[i]] || 1); b[STATS[i]] = 1; }
    budget -= STATS.length; // points left to spend above the baseline 1s

    // requirements first (two-handing lowers the effective STR need)
    var reqs = weapon.requirements || {};
    for (var r = 0; r < STATS.length; r++) {
      var rk = STATS[r], need = reqs[rk] || 0;
      if (rk === 'STR' && opts.twoHanded) need = Math.ceil(need / TWO_HAND_STR_MULT);
      if (need > b[rk]) { var take = Math.min(need - b[rk], budget); b[rk] += take; budget -= take; }
    }
    // greedy: +1 to whichever stat gains the most AR (exact, unfloored)
    while (budget > 0) {
      var base = computeAR(b, weapon, opts).totalARExact;
      var bestK = null, bestGain = -Infinity;
      for (var s = 0; s < STATS.length; s++) {
        var sk = STATS[s];
        if (b[sk] >= 99) continue;
        b[sk]++;
        var gain = computeAR(b, weapon, opts).totalARExact - base;
        b[sk]--;
        if (gain > bestGain) { bestGain = gain; bestK = sk; }
      }
      if (!bestK) break;
      b[bestK]++; budget--;
    }

    var out = {}; for (var o = 0; o < STATS.length; o++) out[STATS[o]] = b[STATS[o]];
    var after = computeAR(b, weapon, opts).totalAR;
    return { stats: out, totalAR: after, before: before, gained: after - before };
  }

  /**
   * scadutree(level) — Shadow of the Erdtree's Scadutree Blessing (DLC-only, level 0–20).
   * [CONFIRMED datamined formula, cross-checked vs Fextralife's per-level negation table]
   *   damage dealt  ×(1 + 0.05·L)  → ×2.00 at 20
   *   damage taken  ×1/(1 + 0.05·L) → ×0.50 at 20  (shown in-game as rising "damage negation")
   * Applies to the player in the Land of Shadow only; base-game AR is untouched.
   */
  function scadutree(level) {
    var L = Math.max(0, Math.min(20, Math.floor(level || 0)));
    var f = 1 + 0.05 * L;
    return { level: L, attack: f, taken: 1 / f, negationPct: Math.round((1 - 1 / f) * 1000) / 10 };
  }

  // --- Survival: Vigor→HP, Mind→FP, End→stamina/equip load (mirror data/stat-effects.json) ---
  // [CONFIRMED] wiki.gg per-level tables (raw wikitext, 2026-08), anchors cross-checked vs
  // Fextralife (HP 1450/1900/2100 @ VIG 40/60/99; FP 235/350/450 @ MND 40/60/99;
  // stamina 142/158 + load 90.9/120 @ END 40/60). Index 0 = stat level 1.
  var STAT_TABLES = {
    hp: [300,304,312,322,334,347,362,378,396,414,434,455,476,499,522,547,572,598,624,652,680,709,738,769,800,833,870,910,951,994,1037,1081,1125,1170,1216,1262,1308,1355,1402,1450,1476,1503,1529,1555,1581,1606,1631,1656,1680,1704,1727,1750,1772,1793,1814,1834,1853,1871,1887,1900,1906,1912,1918,1924,1930,1936,1942,1948,1954,1959,1965,1971,1977,1982,1988,1993,1999,2004,2010,2015,2020,2026,2031,2036,2041,2046,2051,2056,2060,2065,2070,2074,2078,2082,2086,2090,2094,2097,2100],
    fp: [50,53,56,59,62,66,69,72,75,78,82,85,88,91,95,100,105,110,116,121,126,131,137,142,147,152,158,163,168,173,179,184,189,194,200,207,214,221,228,235,242,248,255,262,268,275,281,287,293,300,305,311,317,322,328,333,338,342,346,350,352,355,357,360,362,365,367,370,373,375,378,380,383,385,388,391,393,396,398,401,403,406,408,411,414,416,419,421,424,426,429,432,434,437,439,442,444,447,450],
    stamina: [80,81,83,85,87,88,90,92,94,96,97,99,101,103,105,106,108,110,111,113,115,116,118,120,121,123,125,126,128,130,131,132,133,135,136,137,138,140,141,142,143,145,146,147,148,150,151,152,153,155,155,155,155,156,156,156,157,157,157,158,158,158,158,159,159,159,160,160,160,161,161,161,162,162,162,162,163,163,163,164,164,164,165,165,165,166,166,166,166,167,167,167,168,168,168,169,169,169,170],
    equipLoad: [45,45,45,45,45,45,45,45,46.6,48.2,49.8,51.4,52.9,54.5,56.1,57.7,59.3,60.9,62.5,64.1,65.6,67.2,68.8,70.4,72,73,74.1,75.2,76.4,77.6,78.9,80.2,81.5,82.8,84.1,85.4,86.8,88.1,89.5,90.9,92.3,93.7,95.1,96.5,97.9,99.4,100.8,102.2,103.7,105.2,106.6,108.1,109.6,111,112.5,114,115.5,117,118.5,120,121,122.1,123.1,124.1,125.1,126.2,127.2,128.2,129.2,130.3,131.3,132.3,133.3,134.4,135.4,136.4,137.4,138.5,139.5,140.5,141.5,142.6,143.6,144.6,145.6,146.7,147.7,148.7,149.7,150.8,151.8,152.8,153.8,154.9,155.9,156.9,157.9,159,160]
  };

  /**
   * statEffects(build, mods)
   * HP / FP / stamina / max equip load for the build's VIG/MND/END. Pass already-boosted
   * stats (soreseals etc. — same as the UI's requirements display); `mods` only contributes
   * per-mod `survival: { hpMult?, fpMult?, staminaMult?, equipLoadMult? }` multipliers
   * (Erdtree's Favor, Great-Jar's Arsenal).
   */
  function statEffects(build, mods) {
    var vig = clampStat(build.VIG || 1), mnd = clampStat(build.MND || 1), end = clampStat(build.END || 1);
    var m = { hp: 1, fp: 1, stamina: 1, equipLoad: 1 };
    for (var i = 0; i < (mods ? mods.length : 0); i++) {
      var s = mods[i].survival;
      if (!s) continue;
      if (s.hpMult) m.hp *= s.hpMult;
      if (s.fpMult) m.fp *= s.fpMult;
      if (s.staminaMult) m.stamina *= s.staminaMult;
      if (s.equipLoadMult) m.equipLoad *= s.equipLoadMult;
    }
    return {
      hp: Math.floor(STAT_TABLES.hp[vig - 1] * m.hp),
      fp: Math.floor(STAT_TABLES.fp[mnd - 1] * m.fp),
      stamina: Math.floor(STAT_TABLES.stamina[end - 1] * m.stamina),
      equipLoad: Math.round(STAT_TABLES.equipLoad[end - 1] * m.equipLoad * 10) / 10
    };
  }

  /**
   * rollState(totalWeight, equipLoad)
   * Roll bracket: light < 30%, medium < 70%, heavy <= 100%, overloaded above. Strict `<`
   * matches the game — exactly 30.0% is already medium [CONFIRMED].
   * headroom = weight you can still add before the NEXT (worse) breakpoint; negative when
   * overloaded (how much to shed to reach heavy).
   */
  function rollState(totalWeight, equipLoad) {
    var ratio = equipLoad > 0 ? totalWeight / equipLoad : 0;
    var state = ratio < 0.3 ? 'light' : ratio < 0.7 ? 'medium' : ratio <= 1.0 ? 'heavy' : 'overloaded';
    var nextBreakpoint = state === 'light' ? 0.3 : state === 'medium' ? 0.7 : 1.0;
    var headroom = Math.round((equipLoad * nextBreakpoint - totalWeight) * 10) / 10;
    return { state: state, ratio: Math.round(ratio * 1000) / 1000, headroom: headroom, nextBreakpoint: nextBreakpoint };
  }

  /**
   * aggregateArmor(pieces)
   * Equipment negation combines multiplicatively: each piece removes a percentage of the
   * damage that remains after the previous piece. Resistances, weight and poise are additive.
   * Empty/null slots are ignored. Returns display-ready one-decimal negation and weight values.
   */
  function aggregateArmor(pieces) {
    var types = ['physical','strike','slash','pierce','magic','fire','lightning','holy'];
    var resistTypes = ['immunity','robustness','focus','vitality'];
    var remaining = {}, resistance = {}, weight = 0, poise = 0;
    types.forEach(function (key) { remaining[key] = 1; });
    resistTypes.forEach(function (key) { resistance[key] = 0; });
    (pieces || []).forEach(function (piece) {
      if (!piece) return;
      weight += +piece.weight || 0;
      poise += +piece.poise || 0;
      types.forEach(function (key) {
        var value = piece.negation && +piece.negation[key] || 0;
        remaining[key] *= 1 - value / 100;
      });
      resistTypes.forEach(function (key) {
        resistance[key] += piece.resistance && +piece.resistance[key] || 0;
      });
    });
    var negation = {};
    types.forEach(function (key) { negation[key] = Math.round((1 - remaining[key]) * 1000) / 10; });
    return { weight: Math.round(weight * 10) / 10, poise: poise, negation: negation, resistance: resistance };
  }

  /**
   * resolveEffects(items, context)
   * Canonical equipment-effect gate. It separates equipped state from active math, records
   * conditional assumptions, and exposes invalid duplicate/conflict groups instead of silently
   * stacking impossible combinations. Items without reviewed math remain honest inventory state.
   */
  function resolveEffects(items, context) {
    context = context || {};
    var conditionState = context.conditions || {};
    var seenIds = {}, seenGroups = {}, conflicts = [], entries = [], mods = [], weight = 0;
    (items || []).forEach(function (raw, slot) {
      if (!raw) return;
      var item = raw.item || raw;
      var id = item.id;
      weight += +item.weight || 0;
      var invalid = null;
      if (seenIds[id] != null) invalid = 'duplicate of slot ' + (seenIds[id] + 1);
      else seenIds[id] = slot;
      if (!invalid && item.conflictGroup) {
        if (seenGroups[item.conflictGroup] != null) invalid = 'conflicts with slot ' + (seenGroups[item.conflictGroup] + 1);
        else seenGroups[item.conflictGroup] = slot;
      }
      if (invalid) conflicts.push({ id: id, slot: slot, reason: invalid });

      var modeled = item.modelStatus === 'modeled' || !!(item.statBonus || item.mult || item.combatMult || item.attack || item.flat || item.statusFlat || item.survival || item.defense || item.resistance || item.utility);
      var conditionActive = true;
      if (item.condition) {
        conditionActive = conditionState[id] != null ? !!conditionState[id] : item.condition.defaultActive !== false;
      }
      var active = !invalid && modeled && conditionActive;
      if (active) mods.push(item);
      entries.push({
        id: id, name: item.name, slot: slot, item: item, active: active,
        modeled: modeled, invalid: invalid, conditional: !!item.condition,
        conditionActive: conditionActive,
        reason: invalid || (!modeled ? 'effect math not modeled yet' : (!conditionActive ? 'condition off' : null))
      });
    });
    return {
      mods: mods,
      entries: entries,
      conflicts: conflicts,
      weight: Math.round(weight * 10) / 10,
      coverage: {
        equipped: entries.length,
        modeled: entries.filter(function (entry) { return entry.modeled; }).length,
        active: entries.filter(function (entry) { return entry.active; }).length
      }
    };
  }

  /**
   * resolveAttackEffects(mods, context)
   * Converts combat-context and move-profile rules into ordinary damage multipliers consumed by
   * computeARBuffed. Equipment remains equipped even when its attack rule does not match; the
   * returned trace makes that distinction visible instead of silently applying every talisman.
   *
   * context: { combatContext:'pve'|'pvp', tags:[], state:{ twoHanded? }, profileId? }
   */
  function resolveAttackEffects(mods, context) {
    context = context || {};
    var combat = context.combatContext === 'pvp' ? 'pvp' : 'pve';
    var tags = context.tags || [];
    var state = context.state || {};
    var out = [], entries = [];

    function add(mod, profile, kind, rule) {
      if (!profile || !Object.keys(profile).length) return;
      out.push({ id: mod.id + ':' + kind, name: mod.name, mult: profile, note: mod.note, sourceEffect: mod.id });
      entries.push({ id: mod.id, name: mod.name, applied: true, kind: kind, mult: profile, rule: rule || null, note: mod.note || null });
    }
    function matches(rule) {
      var requires = rule.requires || [];
      var excludes = rule.excludes || [];
      if (!requires.every(function (tag) { return tags.indexOf(tag) >= 0; })) return false;
      if (excludes.some(function (tag) { return tags.indexOf(tag) >= 0; })) return false;
      var expected = rule.state || {};
      return Object.keys(expected).every(function (key) { return state[key] === expected[key]; });
    }

    (mods || []).forEach(function (mod) {
      if (!mod) return;
      if (mod.combatMult) add(mod, mod.combatMult[combat] || mod.combatMult.pve, 'combat', null);
      if (!Array.isArray(mod.attack) || !mod.attack.length) return;
      var matched = mod.attack.filter(matches);
      if (!matched.length) {
        entries.push({ id: mod.id, name: mod.name, applied: false, kind: 'attack', reason: 'move profile does not match', note: mod.note || null });
        return;
      }
      matched.forEach(function (rule, index) {
        add(mod, rule[combat] || rule.pve, 'attack-' + index, rule);
      });
    });
    return {
      mods: out,
      entries: entries,
      combatContext: combat,
      profileId: context.profileId || null,
      applied: entries.filter(function (entry) { return entry.applied; }).length
    };
  }

  /**
   * aggregateDefense(armorTotal, mods)
   * Applies post-armor incoming-damage multipliers. Positive armor negation and vulnerability
   * effects share one transparent remainder pipeline. Values may go negative when a debuff makes
   * the character take more than unmitigated damage.
   */
  function aggregateDefense(armorTotal, mods, context) {
    context = context === 'pvp' ? 'pvp' : 'pve';
    var types = ['physical','strike','slash','pierce','magic','fire','lightning','holy'];
    var taken = {}, negation = {};
    types.forEach(function (type) { taken[type] = 1 - ((armorTotal && armorTotal.negation && armorTotal.negation[type]) || 0) / 100; });
    (mods || []).forEach(function (mod) {
      var d = mod && mod.defense;
      if (!d) return;
      [d, d[context]].forEach(function (profile) {
        if (!profile) return;
        types.forEach(function (type) {
          if (profile.allTakenMult) taken[type] *= profile.allTakenMult;
          if (type === 'physical' || type === 'strike' || type === 'slash' || type === 'pierce') {
            if (profile.physicalTakenMult) taken[type] *= profile.physicalTakenMult;
          }
          var key = (type === 'physical' ? 'standard' : type) + 'TakenMult';
          if (profile[key]) taken[type] *= profile[key];
        });
      });
    });
    types.forEach(function (type) { negation[type] = Math.round((1 - taken[type]) * 1000) / 10; });
    return { context: context, negation: negation, taken: taken };
  }

  /** Add equipment resistance points after armor. */
  function aggregateResistance(armorTotal, mods) {
    var keys = ['immunity','robustness','focus','vitality'];
    var out = {};
    keys.forEach(function (key) { out[key] = (armorTotal && armorTotal.resistance && +armorTotal.resistance[key]) || 0; });
    (mods || []).forEach(function (mod) {
      keys.forEach(function (key) { out[key] += (mod && mod.resistance && +mod.resistance[key]) || 0; });
    });
    return out;
  }

  /** Aggregate non-AR/non-defense equipment outputs that still belong in a full build. */
  function aggregateUtility(mods) {
    var keys = ['hpRegenPerSec','fpRegenPerSec','staminaRecoveryFlat','memorySlots','virtualDex'];
    var out = {};
    keys.forEach(function (key) { out[key] = 0; });
    (mods || []).forEach(function (mod) {
      keys.forEach(function (key) { out[key] += (mod && mod.utility && +mod.utility[key]) || 0; });
    });
    return out;
  }

  /**
   * computeCatalystSpellBuff(build, catalyst, opts)
   * Exact game-param spell-buff model for casting tools. `curves` is the imported
   * CalcCorrectGraphEz lookup keyed by catalyst.curveId; upgradeRates are normalized
   * ReinforceParamWeapon correction rates (max upgrade = 1).
   */
  function computeCatalystSpellBuff(build, catalyst, opts) {
    opts = opts || {};
    var curves = opts.curves || {};
    var curve = opts.curve || curves[catalyst.curveId] || curves[String(catalyst.curveId)];
    if (!curve || curve.length < 99) throw new Error('missing catalyst curve ' + catalyst.curveId);
    var maxLevel = catalyst.maxLevel || 0;
    var level = Math.max(0, Math.min(maxLevel, opts.upgradeLevel == null ? maxLevel : Math.floor(opts.upgradeLevel)));
    var upgradeRate = (catalyst.upgradeRates && catalyst.upgradeRates[level]);
    if (upgradeRate == null) upgradeRate = maxLevel ? level / maxLevel : 1;
    var byStat = {}, exact = catalyst.baseSpellBuff || 100;
    var effective = effectiveStats(build, opts.twoHanded);
    for (var index = 0; index < STATS.length; index++) {
      var stat = STATS[index];
      var enabled = !catalyst.scalingStats || catalyst.scalingStats[stat] !== false;
      var coefficient = enabled ? ((catalyst.coefficients && catalyst.coefficients[stat]) || 0) : 0;
      var growth = curve[Math.max(0, Math.min(98, (effective[stat] || 1) - 1))] / 100;
      byStat[stat] = coefficient * upgradeRate * growth;
      exact += byStat[stat];
    }
    var unmet = [];
    var requirements = catalyst.requirements || {};
    STATS.forEach(function (stat) {
      var have = stat === 'STR' && opts.twoHanded ? effective.STR : (build[stat] || 1);
      if ((requirements[stat] || 0) > have) unmet.push({ stat: stat, need: requirements[stat], have: have });
    });
    var focused = {};
    STATS.forEach(function (stat) { focused[stat] = Math.floor((catalyst.baseSpellBuff || 100) + byStat[stat]); });
    return {
      catalyst: catalyst,
      spellBuff: Math.floor(exact),
      spellBuffExact: exact,
      byStat: byStat,
      focused: focused,
      upgrade: { level: level, maxLevel: maxLevel },
      requirementsMet: unmet.length === 0,
      unmetReqs: unmet,
      effectiveStats: effective
    };
  }

  function spellRequirements(spell, build) {
    var unmet = [];
    var requirements = spell.requirements || {};
    ['INT', 'FAI', 'ARC'].forEach(function (stat) {
      var have = build[stat] || 1;
      if ((requirements[stat] || 0) > have) unmet.push({ stat: stat, need: requirements[stat], have: have });
    });
    return unmet;
  }

  /**
   * computeSpellOutput(build, spell, catalystResult, opts)
   * Pre-defense spell output from imported attack motion values. It intentionally
   * stops before enemy defense/negation so the UI never presents fake final damage.
   */
  function computeSpellOutput(build, spell, catalystResult, opts) {
    opts = opts || {};
    var variants = spell.variants || [];
    var variant = variants.find(function (item) { return String(item.id) === String(opts.variantId); }) || variants[0] || { damage: {} };
    var catalyst = catalystResult.catalyst || {};
    var catalystAccepts = catalyst.kind === 'universal' || catalyst.kind === spell.type;
    var unmet = spellRequirements(spell, build);
    var spellBuff = catalystResult.spellBuff;
    if (variant.onlyUsesInt) spellBuff = catalystResult.focused.INT;
    if (variant.onlyUsesFaith) spellBuff = catalystResult.focused.FAI;
    if (variant.noScale) spellBuff = 100;

    var bonuses = [];
    if (catalyst.bonus) bonuses.push(catalyst.bonus);
    (opts.bonuses || []).forEach(function (bonus) { if (bonus) bonuses.push(bonus); });
    var category = String(spell.category || '').toLowerCase();
    var categoryMultiplier = 1, matchedBonuses = [];
    bonuses.forEach(function (bonus) {
      var family = String(bonus.family || '').toLowerCase().replace(/sorcery|incantation/g, '').trim();
      if (family && category && (category.indexOf(family) >= 0 || family.indexOf(category) >= 0)) {
        categoryMultiplier *= bonus.multiplier || 1;
        matchedBonuses.push(bonus);
      }
    });

    var byType = {}, total = 0;
    DAMAGE_TYPES.forEach(function (type) {
      var motion = (variant.damage && +variant.damage[type]) || 0;
      var value = Math.floor(motion * spellBuff / 100 * categoryMultiplier);
      if (value) byType[type] = value;
      total += value;
    });
    var heal = variant.healMotion ? Math.floor(variant.healMotion * spellBuff / 100) : 0;
    return {
      spell: spell,
      variant: variant,
      spellBuff: spellBuff,
      byType: byType,
      totalPreDefense: total,
      heal: heal,
      fpCost: Math.ceil((variant.fp == null ? spell.fp : variant.fp) * (catalyst.fpMultiplier || 1)),
      staminaCost: variant.stamina == null ? spell.stamina : variant.stamina,
      categoryMultiplier: categoryMultiplier,
      matchedBonuses: matchedBonuses,
      catalystAccepts: catalystAccepts,
      catalystRequirementsMet: catalystResult.requirementsMet,
      spellRequirementsMet: unmet.length === 0,
      unmetReqs: unmet,
      canCast: catalystAccepts && catalystResult.requirementsMet && unmet.length === 0,
      confidence: total || heal ? 'param-derived pre-defense' : 'utility or unmodeled damage'
    };
  }

  /** Ratio-based defense multiplier used by Elden Ring before percent negation. */
  function defenseMultiplier(rawAttack, defense) {
    rawAttack = Math.max(0, +rawAttack || 0);
    defense = Math.max(0, +defense || 0);
    if (!rawAttack || !defense) return rawAttack ? 1 : 0;
    var ratio = rawAttack / defense;
    if (ratio <= 0.125) return 0.1;
    if (ratio < 1) return 0.1 + Math.pow(ratio - 0.125, 2) / 2.552;
    if (ratio < 2.5) return 0.7 - Math.pow(2.5 - ratio, 2) / 7.5;
    if (ratio < 8) return 0.9 - Math.pow(8 - ratio, 2) / 151.25;
    return 0.9;
  }

  /**
   * Apply one enemy profile and NG cycle to typed pre-defense damage.
   * Every damage type is reduced independently, then floored, matching split-damage behavior.
   */
  function applyEnemyDefense(byType, enemy, opts) {
    opts = opts || {};
    var ng = Math.max(0, Math.min(7, Math.floor(opts.ng || 0)));
    var cycle = enemy && enemy.cycles && (enemy.cycles[ng] || enemy.cycles[0]);
    if (!enemy || !cycle) throw new Error('enemy profile has no NG cycle ' + ng);
    var physicalType = ['strike','slash','pierce'].indexOf(opts.physicalType) >= 0 ? opts.physicalType : 'physical';
    var result = {}, trace = {}, total = 0;
    DAMAGE_TYPES.forEach(function (type) {
      var raw = Math.max(0, +(byType && byType[type]) || 0);
      var enemyType = type === 'physical' ? physicalType : type;
      var defense = +(cycle.defense && cycle.defense[enemyType]) || 0;
      var negation = +(enemy.negation && enemy.negation[enemyType]) || 0;
      var multiplier = defenseMultiplier(raw, defense);
      var final = Math.max(0, Math.floor(raw * multiplier * (1 - negation / 100)));
      if (raw) result[type] = final;
      total += final;
      trace[type] = { raw: raw, defense: defense, defenseMultiplier: multiplier, negation: negation, final: final };
    });
    return { enemy: enemy, ng: ng, cycle: cycle, byType: result, total: total, trace: trace, physicalType: physicalType };
  }

  function statusAgainstEnemy(buildup, enemy, opts) {
    opts = opts || {};
    var ng = Math.max(0, Math.min(7, Math.floor(opts.ng || 0)));
    var cycle = enemy && enemy.cycles && (enemy.cycles[ng] || enemy.cycles[0]);
    if (!enemy || !cycle) throw new Error('enemy profile has no NG cycle ' + ng);
    var aliases = { scarletRot:'rot', blood:'bleed', hemorrhage:'bleed', frostbite:'frost' };
    var out = {};
    Object.keys(buildup || {}).forEach(function (rawType) {
      var type = aliases[rawType] || rawType;
      var perHit = Math.max(0, +buildup[rawType] || 0);
      var threshold = cycle.resistances && cycle.resistances[type];
      out[type] = {
        buildup: perHit,
        threshold: threshold,
        immune: threshold == null,
        hits: threshold == null || !perHit ? null : Math.ceil(threshold / perHit),
        incomingMultiplier: enemy.statusMultipliers && enemy.statusMultipliers[type] != null ? enemy.statusMultipliers[type] : 1
      };
    });
    return out;
  }

  /** Exact standard-attack sequence: motion value and physical attribute per hit. */
  function applyWeaponMove(byType, buildup, move, enemy, opts) {
    opts = opts || {};
    var hits = [], total = 0, preDefense = 0;
    (move.motion || []).forEach(function (motion, index) {
      var raw = {};
      DAMAGE_TYPES.forEach(function (type) { raw[type] = (+byType[type] || 0) * motion / 100; });
      var physicalType = move.physicalTypes && (move.physicalTypes[index] || move.physicalTypes[move.physicalTypes.length - 1]) || 'physical';
      var result = applyEnemyDefense(raw, enemy, { ng:opts.ng, physicalType:physicalType });
      preDefense += DAMAGE_TYPES.reduce(function (sum,type) { return sum + raw[type]; }, 0);
      total += result.total;
      hits.push({ motion:motion, physicalType:physicalType, raw:raw, final:result.byType, total:result.total, trace:result.trace });
    });
    var status = {};
    Object.keys(buildup || {}).forEach(function (type) {
      status[type] = (move.statusMotion || [100]).reduce(function (sum,motion) { return sum + (+buildup[type] || 0) * motion / 100; }, 0);
    });
    return { move:move, hits:hits, preDefense:Math.floor(preDefense), total:total, status:status, statusAgainstEnemy:statusAgainstEnemy(status,enemy,{ng:opts.ng}) };
  }

  /** Exact ranged projectile sequence: weapon AR + ammo base, typed MV and status MV per projectile. */
  function applyRangedAttack(byType, buildup, ammo, profile, enemy, opts) {
    opts = opts || {};
    if (!ammo || !profile || !profile.components || !profile.components.length) throw new Error('ranged attack requires ammo and projectile profile');
    var combined = {}, combinedStatus = {}, hits = [], total = 0, preDefense = 0;
    DAMAGE_TYPES.forEach(function (type) { combined[type] = (+byType[type] || 0) + (+(ammo.base && ammo.base[type]) || 0); });
    Object.keys(buildup || {}).forEach(function (type) { combinedStatus[type] = (+buildup[type] || 0); });
    if (ammo.status && ammo.status.type) combinedStatus[ammo.status.type] = (combinedStatus[ammo.status.type] || 0) + (+ammo.status.buildup || 0);
    profile.components.forEach(function (component) {
      var raw = {};
      DAMAGE_TYPES.forEach(function (type) {
        raw[type] = combined[type] * (+(component.motion && component.motion[type]) || 0) / 100 * (opts.combatContext === 'pvp' ? (+component.pvpMultiplier || 1) : 1);
      });
      var result = applyEnemyDefense(raw, enemy, { ng:opts.ng, physicalType:component.physicalType || ammo.physicalType || 'pierce' });
      preDefense += DAMAGE_TYPES.reduce(function (sum,type) { return sum + raw[type]; }, 0);
      total += result.total;
      hits.push({ label:component.label, motion:component.motion, physicalType:component.physicalType || ammo.physicalType || 'pierce', raw:raw, final:result.byType, total:result.total, trace:result.trace });
    });
    var status = {};
    Object.keys(combinedStatus).forEach(function (type) {
      status[type] = profile.components.reduce(function (sum,component) { return sum + combinedStatus[type] * (+component.statusMotion || 0) / 100; }, 0);
    });
    return { ammo:ammo, profile:profile, combined:combined, hits:hits, preDefense:Math.floor(preDefense), total:total, status:status, statusAgainstEnemy:statusAgainstEnemy(status,enemy,{ng:opts.ng}) };
  }

  /**
   * Exact single skill-event calculation from AtkParam + weapon-param inputs.
   *
   * A skill event can contain two independently scaled pieces:
   *   - the equipped weapon's typed AR multiplied by the event's typed motion value;
   *   - additive AtkParam base damage multiplied by ReinforceParamWeapon.baseAtkRate,
   *     then scaled through AttackElementCorrectParam + CalcCorrectGraph.
   *
   * Rows are events, not guessed full casts. A multi-input or looping Skill therefore
   * remains a selectable list of exact events until its animation sequence is proven.
   */
  function computeSkillEvent(build, byType, buildup, event, weaponParam, scaling, opts) {
    opts = opts || {};
    scaling = scaling || {};
    var stats = effectiveStats(build || {}, !!opts.twoHanded);
    var reinforcementProfiles = scaling.reinforcements || {};
    var levels = weaponParam && reinforcementProfiles[weaponParam.reinforceTypeId];
    var maxLevel = levels && levels.length ? levels.length - 1 : 0;
    var level = Math.max(0, Math.min(maxLevel, opts.upgradeLevel == null ? maxLevel : Math.floor(+opts.upgradeLevel || 0)));
    var reinforcement = levels && levels[level];
    var corrections = scaling.corrections || {};
    var curves = scaling.curves || {};
    var pvpMultiplier = opts.combatContext === 'pvp' ? (+event.pvpMultiplier || 1) : 1;
    var raw = {}, weaponPart = {}, paramPart = {}, trace = {}, complete = true;

    DAMAGE_TYPES.forEach(function (type) {
      var motion = +(event.motion && event.motion[type]) || 0;
      var weaponValue = (+byType[type] || 0) * motion / 100;
      var paramBase = +(event.base && event.base[type]) || 0;
      var paramValue = 0, scalingMultiplier = 0, statTrace = [];
      if (paramBase > 0) {
        if (!weaponParam || !reinforcement) {
          complete = false;
        } else {
          var correctionId = event.correctionId == null ? weaponParam.attackElementCorrectId : event.correctionId;
          var correction = corrections[correctionId] && corrections[correctionId][type];
          var curve = curves[weaponParam.correctTypes && weaponParam.correctTypes[type]];
          if (!correction || !curve) {
            complete = false;
          } else {
            var contributions = [];
            STATS.forEach(function (stat) {
              var rule = correction[stat];
              if (!rule || !rule.enabled) return;
              var influence = rule.influence == null ? 1 : +rule.influence;
              var requirement = +(weaponParam.requirements && weaponParam.requirements[stat]) || 0;
              var contribution;
              if ((stats[stat] || 1) < requirement) {
                contribution = 0.6 * (influence - 1) - 0.4;
              } else {
                var baseScaling = rule.override >= 0 ? +rule.override : +(weaponParam.scaling && weaponParam.scaling[stat]) || 0;
                var levelScaling = +(reinforcement.scaling && reinforcement.scaling[stat]) || 1;
                var graphValue = +(curve[Math.max(1, Math.min(99, stats[stat])) - 1]) || 0;
                contribution = influence - 1 + (baseScaling / 100) * levelScaling * (graphValue / 100) * influence;
                statTrace.push({ stat:stat, level:stats[stat], requirement:requirement, baseScaling:baseScaling, levelScaling:levelScaling, graph:graphValue, contribution:contribution });
              }
              contributions.push(contribution);
            });
            var sum = contributions.reduce(function (total,value) { return total + value; }, 0);
            var lowCap = contributions.length ? Math.min.apply(null, contributions) : 0;
            scalingMultiplier = Math.max(lowCap, sum);
            paramValue = paramBase * (+reinforcement.baseAtkRate || 1) * (1 + scalingMultiplier);
          }
        }
      }
      weaponPart[type] = weaponValue * pvpMultiplier;
      paramPart[type] = paramValue * pvpMultiplier;
      raw[type] = weaponPart[type] + paramPart[type];
      trace[type] = { motion:motion, weapon:weaponPart[type], paramBase:paramBase, param:paramPart[type], scalingMultiplier:scalingMultiplier, stats:statTrace };
    });

    var status = {};
    Object.keys(buildup || {}).forEach(function (type) {
      status[type] = (+buildup[type] || 0) * (+event.statusMotion || 0) / 100;
    });
    var preDefense = DAMAGE_TYPES.reduce(function (sum,type) { return sum + raw[type]; }, 0);
    var result = {
      event:event, level:level, complete:complete, raw:raw, weaponPart:weaponPart, paramPart:paramPart,
      preDefense:Math.floor(preDefense), status:status, trace:trace,
      staminaCost:+event.staminaCost || 0, poiseMotion:+event.poiseMotion || 0,
      poiseBase:+event.poiseBase || 0, staminaDamageBase:+event.staminaDamageBase || 0,
      pvpMultiplier:pvpMultiplier
    };
    if (opts.enemy) {
      var final = applyEnemyDefense(raw, opts.enemy, { ng:opts.ng, physicalType:event.physicalType || 'physical' });
      result.final = final.byType;
      result.total = final.total;
      result.defenseTrace = final.trace;
      result.statusAgainstEnemy = statusAgainstEnemy(status, opts.enemy, { ng:opts.ng });
    }
    return result;
  }

  // Rough character level from attribute totals (Wretch baseline: 8x10 = level 1).
  function characterLevel(build) {
    var keys = ['VIG', 'MND', 'END', 'STR', 'DEX', 'INT', 'FAI', 'ARC'];
    var sum = 0; for (var i = 0; i < keys.length; i++) sum += (build[keys[i]] || 10);
    return Math.max(1, sum - 79);
  }

  return {
    computeAR: computeAR,
    softCapCurve: softCapCurve,
    suggestWeapons: suggestWeapons,
    optimize: optimize,
    computeARBuffed: computeARBuffed,
    statusPayload: statusPayload,
    hasEnhancedBleed: hasEnhancedBleed,
    saturation: saturation,
    gradeFor: gradeFor,
    reinforce: reinforce,
    characterLevel: characterLevel,
    scadutree: scadutree,
    statEffects: statEffects,
    rollState: rollState,
    aggregateArmor: aggregateArmor,
    resolveEffects: resolveEffects,
    resolveAttackEffects: resolveAttackEffects,
    aggregateDefense: aggregateDefense,
    aggregateResistance: aggregateResistance,
    aggregateUtility: aggregateUtility,
    computeCatalystSpellBuff: computeCatalystSpellBuff,
    computeSpellOutput: computeSpellOutput,
    defenseMultiplier: defenseMultiplier,
    applyEnemyDefense: applyEnemyDefense,
    statusAgainstEnemy: statusAgainstEnemy,
    applyWeaponMove: applyWeaponMove,
    applyRangedAttack: applyRangedAttack,
    computeSkillEvent: computeSkillEvent,
    STATS: STATS, DAMAGE_TYPES: DAMAGE_TYPES, STATUS_TYPES: STATUS_TYPES, CURVES: CURVES
  };
});
