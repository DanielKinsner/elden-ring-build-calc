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

  // --- CalcCorrectGraph saturation curves (mirror data/scaling-curves.json) ---
  var CURVES = {
    physical:       [ {s:1,p:0}, {s:10,p:11.65}, {s:15,p:19.80}, {s:20,p:25}, {s:60,p:75}, {s:80,p:90}, {s:99,p:100} ],
    elemental:      [ {s:1,p:0}, {s:20,p:40}, {s:50,p:80}, {s:80,p:100}, {s:99,p:100} ],
    arcanePhysical: [ {s:1,p:0}, {s:20,p:25}, {s:55,p:75}, {s:80,p:90}, {s:99,p:100} ],
    arcaneStatus:   [ {s:1,p:0}, {s:45,p:100}, {s:99,p:115} ]
  };

  // Which curve each stat uses for weapon-attack scaling.
  var STAT_CURVE = { STR: 'physical', DEX: 'physical', INT: 'elemental', FAI: 'elemental', ARC: 'arcanePhysical' };

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

  // Piecewise-linear saturation. Returns fraction (0..~1.15).
  function saturation(curveName, statLevel) {
    var pts = CURVES[curveName];
    var x = clampStat(statLevel);
    if (x <= pts[0].s) return pts[0].p / 100;
    for (var i = 1; i < pts.length; i++) {
      if (x <= pts[i].s) {
        var a = pts[i - 1], b = pts[i];
        var t = (x - a.s) / (b.s - a.s);
        return (a.p + t * (b.p - a.p)) / 100;
      }
    }
    return pts[pts.length - 1].p / 100;
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
        status: v.status || weapon.status,
        arcStatusScaling: v.arcStatusScaling != null ? v.arcStatusScaling : weapon.arcStatusScaling
      };
    }
    return {
      base: weapon.base, scaling: weapon.scaling, status: weapon.status,
      arcStatusScaling: weapon.arcStatusScaling
    };
  }

  function checkRequirements(weapon, build) {
    var unmet = [];
    var reqs = weapon.requirements || {};
    for (var i = 0; i < STATS.length; i++) {
      var k = STATS[i];
      if ((reqs[k] || 0) > (build[k] || 1)) unmet.push({ stat: k, need: reqs[k], have: build[k] || 1 });
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
        var sat = saturation(STAT_CURVE[stat], effStats[stat]);
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

  function computeStatus(variant, effStats, rein) {
    var out = {};
    for (var i = 0; i < STATUS_TYPES.length; i++) {
      var st = STATUS_TYPES[i];
      var base = (variant.status && variant.status[st]) || 0;
      if (base <= 0) continue;
      var buildup = base * rein.baseFrac; // status reinforces ~like base [MODELED]
      // Arcane boosts bleed/poison buildup on arcane-scaling weapons.
      if ((st === 'bleed' || st === 'poison') && variant.arcStatusScaling > 0) {
        buildup += base * (variant.arcStatusScaling / 100) * saturation('arcaneStatus', effStats.ARC);
      }
      out[st] = Math.round(buildup);
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

    var unmet = checkRequirements(weapon, build);
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
      var curve = CURVES[STAT_CURVE[stat]];
      var lastSoftCap = curve[curve.length - 2].s; // second-to-last control point
      softCaps[stat] = {
        perPoint: Math.round((after.total - main.total) * 100) / 100,
        pastSoftCap: eff[stat] >= lastSoftCap
      };
    }

    var grades = {};
    for (var g = 0; g < STATS.length; g++) {
      var gk = STATS[g];
      grades[gk] = gradeFor(((variant.scaling && variant.scaling[gk]) || 0) * rein.scalingFrac);
    }

    return {
      totalAR: Math.round(main.total),
      byType: roundMap(main.byType),
      byStat: roundMap(main.byStat),
      status: computeStatus(variant, eff, rein),
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

  // Rough character level from attribute totals (Wretch baseline: 8x10 = level 1).
  function characterLevel(build) {
    var keys = ['VIG', 'MND', 'END', 'STR', 'DEX', 'INT', 'FAI', 'ARC'];
    var sum = 0; for (var i = 0; i < keys.length; i++) sum += (build[keys[i]] || 10);
    return Math.max(1, sum - 79);
  }

  return {
    computeAR: computeAR,
    saturation: saturation,
    gradeFor: gradeFor,
    reinforce: reinforce,
    characterLevel: characterLevel,
    STATS: STATS, DAMAGE_TYPES: DAMAGE_TYPES, STATUS_TYPES: STATUS_TYPES, CURVES: CURVES
  };
});
