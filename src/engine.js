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
    saturation: saturation,
    gradeFor: gradeFor,
    reinforce: reinforce,
    characterLevel: characterLevel,
    STATS: STATS, DAMAGE_TYPES: DAMAGE_TYPES, STATUS_TYPES: STATUS_TYPES, CURVES: CURVES
  };
});
