# Hygiene Opener + Defense/Survival Panel — Implementation Plan

> **For agentic workers:** Single-agent plan — execute tasks 1→6 in order in one session
> (superpowers:executing-plans style, inline). No subagent fan-out needed. Steps use
> checkbox (`- [ ]`) syntax for tracking. Commit at the end of every task; push at the end.

**Goal:** Lock the engine's verified math behind a golden test file, refresh the README,
fill missing weapon weights, then ship the Survival panel (HP / FP / stamina / equip-load
bar with roll breakpoints) on the build page.

**Architecture:** Everything follows the repo's fixed pattern — pure math goes in
`src/engine.js` (UMD, `window.ERCalc` + Node `require`), datamined tables go in `data/*.json`,
UI wiring goes in `assets/build.js` + `build/index.html`, styling in `assets/app.css`.
No build step, no dependencies, plain ES5-style JS to match the existing files.

**Tech stack:** Vanilla HTML/CSS/JS + Node (stdlib only) for tests/scripts.

**Spec:** `docs/superpowers/specs/2026-08-05-hygiene-plus-defense-design.md` (approved).

## Global constraints

- **No frameworks, no npm, no build step.** Tests and scripts run with bare `node`.
- **Match the existing code style:** `var`, function statements, ES5-ish — see `src/engine.js`.
- **Data honesty rule:** every numeric table is `[CONFIRMED]` only if it comes from a
  datamined dump or two independent sources (wiki.gg + Fextralife) agree. Otherwise mark it.
- **Old share links must keep working** — new URL params are additive with safe defaults.
- **Pull origin before every commit** (Dan runs Codex in parallel on this repo).
- Windows machine; the repo path contains spaces — always quote paths in shell commands.

---

### Task 1: Golden test harness

**Files:**
- Create: `tests/engine.test.js`
- Modify: `README.md` (one line, in Task 2 anyway — just make the test file exist and pass here)

**Interfaces:**
- Consumes: `require('../src/engine.js')` (UMD export works in Node already).
- Produces: `node tests/engine.test.js` → prints per-check ✓/✗, exits 0/1. Later tasks append checks to this file.

**The philosophy:** these are *regression pins*, not new validation. For the six library
builds the expected AR values are **frozen from what the engine outputs today**, because
those outputs were already hand-verified in-game (commit `885a57f` "all engine-validated").
For formula pins (scadutree, status procs) the expected values are computed from the
documented formulas independently.

- [ ] **Step 1: Write the harness.** Structure:

```js
/* tests/engine.test.js — golden regression pins. Run: node tests/engine.test.js */
'use strict';
var fs = require('fs'), path = require('path');
var ERCalc = require('../src/engine.js');

var failures = 0, passes = 0;
function check(name, actual, expected) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passes++; console.log('  ✓ ' + name); }
  else { failures++; console.log('  ✗ ' + name + '\n      expected ' + JSON.stringify(expected) + '\n      got      ' + JSON.stringify(actual)); }
}
function approx(name, actual, expected, eps) {
  var ok = Math.abs(actual - expected) <= (eps || 0.001);
  if (ok) { passes++; console.log('  ✓ ' + name); }
  else { failures++; console.log('  ✗ ' + name + ' — expected ~' + expected + ', got ' + actual); }
}

// load all weapons from disk (mirrors ERData.loadWeapons flatten: each entry gets id/source)
function loadWeapons() {
  var out = [];
  ['base', 'dlc'].forEach(function (src) {
    var dir = path.join(__dirname, '..', 'data', 'weapons', src);
    fs.readdirSync(dir).forEach(function (f) {
      if (!/\.json$/.test(f)) return;
      var arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      (arr.weapons || arr).forEach(function (w) { w.source = src; out.push(w); });
    });
  });
  return out;
}
```
**First open one weapon file** (e.g. `data/weapons/base/katanas.json`) and mirror its actual
top-level shape in `loadWeapons` — cross-check against `src/data-loader.js` so tests and site
load identically. Adjust the sketch if the file is `{ "weapons": [...] }` vs a bare array.

- [ ] **Step 2: Add the check groups.**

```js
var weapons = loadWeapons();
function byId(id) { return weapons.find(function (w) { return w.id === id; }); }

console.log('library builds (frozen 2026-08-05, previously verified in-game):');
var presets = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'presets.json'), 'utf8'));
(presets.presets || presets).filter(function (p) { return p.library || p.loadout; }).forEach(function (p) {
  var w = byId(p.loadout.weaponId);
  var r = ERCalc.computeAR(p.stats, w, { twoHanded: !!p.twoHanded, affinity: p.loadout.affinity, upgradeLevel: p.loadout.upgradeLevel });
  check(p.name + ' AR', r.totalAR, /* FROZEN — see step 3 */ 0);
});

console.log('two-handing:');
// 14 STR wields a 20-STR weapon two-handed [CONFIRMED in-game]
var anyStr20; // find a weapon with requirements.STR === 20 (e.g. a greatsword) via weapons.find
// check requirementsMet true at STR 14 twoHanded:true, false at twoHanded:false

console.log('flooring invariant:');
// for one split-damage weapon: totalAR === sum of floored byType values, totalAR <= totalARExact

console.log('scadutree:');
check('scadutree(0)', ERCalc.scadutree(0).attack, 1);
check('scadutree(10)', ERCalc.scadutree(10).attack, 1.5);
approx('scadutree(10) taken', ERCalc.scadutree(10).taken, 1 / 1.5);
check('scadutree(20)', ERCalc.scadutree(20).attack, 2);
check('scadutree(25) clamps', ERCalc.scadutree(25).level, 20);

console.log('status payloads (formula pins, wiki-confirmed 2026-07):');
var t = { maxHP: 2000, resist: 250 };
check('bleed 100/hit → 3 hits', ERCalc.statusPayload(100, 'bleed', t).hitsToProc, 3);
check('bleed proc 2000HP', ERCalc.statusPayload(100, 'bleed', t).procDamage, 400);            // 2000*0.15+100
check('bleed boss+enhanced', ERCalc.statusPayload(100, 'bleed', { maxHP: 2000, resist: 250, boss: true, enhanced: true }).procDamage, 410); // 2000*0.105+200
check('frost proc', ERCalc.statusPayload(100, 'frost', t).procDamage, 230);                    // 2000*0.10+30

console.log('buff layer:');
// computeARBuffed with [{mult:{all:1.2}}] on one weapon: buffed.totalAR ===
// sum over types of floor(byTypeExact[t] * 1.2)  — compute both sides in the test

console.log('\n' + passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Freeze the library-build numbers.** Run the file once with placeholder `0`
  expectations, copy each printed "got" AR into the `check` calls as the frozen expected value
  (a small table `var FROZEN = { 'Moonveil …': 123, … }` keyed by preset name is cleanest).
  Sanity-gate before freezing: the Vera Aletheia preset (Rivers of Blood +10, 2H) should land
  in the high-600s AR; if any number looks absurd (0, NaN, 10000), stop and investigate.
- [ ] **Step 4: Run `node tests/engine.test.js` — all pass, exit 0.**
- [ ] **Step 5: Commit** (`git pull --ff-only` first): `test: golden regression pins for engine math (library builds, 2H reqs, flooring, scadutree, status procs, buff layer)`

### Task 2: README refresh

**Files:** Modify: `README.md`

- [ ] **Step 1: Rewrite the stale parts.** Keep the tone and the **Accuracy & honesty**
  section verbatim. Replace the "Goals" + "Status" sections with a "What's here" list that
  matches reality: build calculator (live AR, buffs/talismans, status payoff card, optimizer,
  Scadutree slider, share links, My Builds), weapon atlas + per-weapon detail pages, guides
  (21 quest trackers, boss sheet w/ felled checkboxes, endings, full walkthrough incl. SotE),
  tales (Dan's fan writing). Add: live on Vercel, no build step (`git push` deploys), and a
  **Tests** line: `node tests/engine.test.js`. Fix the `Structure` block (it omits `atlas/`,
  `build/`, `guides/`, `tales/`, `assets/`, `tests/`).
- [ ] **Step 2: Commit:** `docs: README reflects the shipped site (calculator, atlas, guides, tales, tests)`

### Task 3: Weight data fill

**Files:**
- Create: `scripts/fill-weights.js` (one-shot, kept for provenance like `scripts/match-icons.js`)
- Modify: the `data/weapons/{base,dlc}/*.json` files that have weightless entries
- Modify: `ROADMAP.md` (delete the "Known data gaps" weight entry when done)

- [ ] **Step 1: Count the gap first:** a 5-line node script over all weapon JSONs printing
  entries with `weight == null` (expect ~170).
- [ ] **Step 2: Source the weights.** Primary: ThomasJClark's datamined regulation JSON
  (search GitHub for `ThomasJClark elden-ring-weapon-calculator` — the `regulation-vanilla.js/json`
  data ships in that repo; weapons carry `weight`). Download once into the scratchpad (NOT the
  repo), match by normalized weapon name. Fallback if the dump can't be fetched: wiki.gg
  per-category weapon tables list weight — transcribe just the missing entries.
- [ ] **Step 3: `scripts/fill-weights.js`** reads the dump + every weapon JSON, fills ONLY
  missing `weight` fields (never overwrite existing ones), writes files back preserving
  2-space indent, prints a `filled / still-missing` report with the unmatched names.
  Hand-resolve unmatched names (spelling variants like "Miséricorde").
- [ ] **Step 4: Spot-check 5 filled values against wiki.gg** (pick across categories/DLC).
  Run `node tests/engine.test.js` (must still pass — weights don't affect AR, this catches
  accidental JSON corruption). Also `node -e` a JSON.parse loop over all touched files.
- [ ] **Step 5: Commit:** `data: fill missing weight for ~170 weapons from the regulation dump (atlas sort + upcoming equip-load math)` — and remove the ROADMAP "Known data gaps" entry in the same commit.

### Task 4: Engine — `statEffects` + `rollState` + `data/stat-effects.json`

**Files:**
- Create: `data/stat-effects.json`
- Modify: `src/engine.js` (new functions + exports), `data/buffs.json` (2 talismans)
- Test: extend `tests/engine.test.js`

**Interfaces (later tasks rely on these exact shapes):**
- `ERCalc.statEffects(build, mods?)` → `{ hp, fp, stamina, equipLoad }` — `build` uses
  `VIG/MND/END` (1–99, clamped); `mods` is the same array shape `collectMods()` produces,
  reading optional per-mod `survival: { hpMult?, fpMult?, staminaMult?, equipLoadMult? }`
  (statBonus mods are NOT applied here — the caller passes already-boosted stats, exactly
  like build.js's existing `boosted` object).
- `ERCalc.rollState(totalWeight, equipLoad)` → `{ state: 'light'|'medium'|'heavy'|'overloaded', ratio, headroom, nextBreakpoint }`
  — `headroom` = weight you can still add before the NEXT (worse) breakpoint; for
  `overloaded` it's negative (how much to shed to reach heavy).

- [ ] **Step 1: Build `data/stat-effects.json`.** Three 99-entry arrays (index 0 = stat
  level 1) for HP (Vigor), FP (Mind), stamina (End) + one for max equip load (End).
  **Transcribe from wiki.gg's Vigor / Mind / Endurance pages and cross-check ≥3 rows per
  table against Fextralife** — two sources agreeing = `[CONFIRMED]` in the file's `_readme`.
  Hard anchors that MUST hold (stop and re-source if they don't): HP at Vigor 40 = **1450**,
  Vigor 60 = **1900**, Vigor 99 = **2100**; FP at Mind 99 = **450**. Structure:

```json
{
  "_readme": "Per-level stat tables, index 0 = level 1. [CONFIRMED] wiki.gg cross-checked vs Fextralife, 2026-08. Sources: <urls>",
  "hp":        [300, "…97 more"],
  "fp":        [40,  "…97 more"],
  "stamina":   [80,  "…97 more"],
  "equipLoad": [45.0, "…97 more"]
}
```
  (The leading literals above are placeholders — use the transcribed values.)

- [ ] **Step 2: Engine functions.** engine.js mirrors data files as inline constants (the
  established pattern — see CURVES). Paste the four arrays as `var STAT_TABLES = {...}` with
  the same mirror comment, and add:

```js
// --- Survival: Vigor→HP, Mind→FP, End→stamina/equip load (mirror data/stat-effects.json) ---
function statEffects(build, mods) {
  var vig = clampStat(build.VIG || 1), mnd = clampStat(build.MND || 1), end = clampStat(build.END || 1);
  var m = { hp: 1, fp: 1, stamina: 1, equipLoad: 1 };
  (mods || []).forEach(function (mo) {
    var s = mo.survival; if (!s) return;
    if (s.hpMult) m.hp *= s.hpMult;
    if (s.fpMult) m.fp *= s.fpMult;
    if (s.staminaMult) m.stamina *= s.staminaMult;
    if (s.equipLoadMult) m.equipLoad *= s.equipLoadMult;
  });
  return {
    hp: Math.floor(STAT_TABLES.hp[vig - 1] * m.hp),
    fp: Math.floor(STAT_TABLES.fp[mnd - 1] * m.fp),
    stamina: Math.floor(STAT_TABLES.stamina[end - 1] * m.stamina),
    equipLoad: Math.round(STAT_TABLES.equipLoad[end - 1] * m.equipLoad * 10) / 10
  };
}

// Roll state: light < 30%, medium < 70%, heavy <= 100%, overloaded above. Strict `<`
// matches the game: exactly 30.0% is medium, 69.99% is still medium [CONFIRMED].
function rollState(totalWeight, equipLoad) {
  var ratio = equipLoad > 0 ? totalWeight / equipLoad : 0;
  var state = ratio < 0.3 ? 'light' : ratio < 0.7 ? 'medium' : ratio <= 1.0 ? 'heavy' : 'overloaded';
  var nextBreakpoint = state === 'light' ? 0.3 : state === 'medium' ? 0.7 : 1.0;
  var headroom = Math.round((equipLoad * nextBreakpoint - totalWeight) * 10) / 10;
  return { state: state, ratio: Math.round(ratio * 1000) / 1000, headroom: headroom, nextBreakpoint: nextBreakpoint };
}
```
  Export both in the return block (`statEffects: statEffects, rollState: rollState`).
- [ ] **Step 3: Talismans in `data/buffs.json`.** Append to `talismans` (verify the exact
  percentages on wiki.gg before writing; the ones below are the community-documented values):

```json
{ "id": "erdtrees-favor-2", "name": "Erdtree's Favor +2",
  "survival": { "hpMult": 1.04, "staminaMult": 1.096, "equipLoadMult": 1.08 },
  "note": "+4% HP · +9.6% stamina · +8% equip load", "confirmed": true },
{ "id": "great-jars-arsenal", "name": "Great-Jar's Arsenal",
  "survival": { "equipLoadMult": 1.19 },
  "note": "+19% max equip load", "confirmed": true }
```
  These have no `mult`/`statBonus`, so `computeARBuffed` ignores them (verify: AR unchanged
  when equipped — the existing buff loops only read fields they know).
- [ ] **Step 4: Tests.** Append a `console.log('survival:')` group to `tests/engine.test.js`:
  HP at VIG 40/60/99 = 1450/1900/2100; FP at MND 99 = 450; stamina + equipLoad at END 20/40/60
  frozen from the transcribed table (spot-verified vs Fextralife in Step 1);
  `rollState` boundaries — construct exact ratios: `rollState(29.9, 100).state === 'light'`,
  `rollState(30, 100).state === 'medium'`, `rollState(69.9, 100).state === 'medium'`,
  `rollState(70, 100).state === 'heavy'`, `rollState(100, 100).state === 'heavy'`,
  `rollState(100.1, 100).state === 'overloaded'` (negative headroom);
  Soreseal path (caller boosts stats: statEffects on VIG 35+5 === statEffects on VIG 40);
  Great-Jar's Arsenal: `statEffects({END:20}, [{survival:{equipLoadMult:1.19}}]).equipLoad`
  equals `round(table[19] * 1.19, 1)`.
- [ ] **Step 5: Run tests (all pass), commit:** `feat(engine): statEffects + rollState — the survival half (HP/FP/stamina/equip load, roll breakpoints) [CONFIRMED tables]`

### Task 5: Survival panel UI

**Files:** Modify: `build/index.html`, `assets/build.js`, `assets/app.css`

**Interfaces:** Consumes `ERCalc.statEffects(boosted, mods)` + `ERCalc.rollState(w, load)`
from Task 4. New persisted field: `gearWeight` (number, default 0) — URL param `gw`.

- [ ] **Step 1: Markup.** In `build/index.html`, add a Survival card **directly under the
  stats card** (match the existing card markup pattern — copy a sibling card's classes):
  ids `survHP`, `survFP`, `survStam`, `survLoadBar`, `survLoadText`, `survRollState`,
  `survHeadroom`, and a labeled number input `gearWeight` (`min="0" step="0.1" value="0"`,
  label "Armor & other gear weight" with a hint that weapon weight is auto-counted).
- [ ] **Step 2: State plumbing in `assets/build.js`** (five small touches, mirror how
  `scaduLevel` flows):
  - top: `var gearWeight = 0;`
  - BOOT parse: `gw: +q.get('gw') || 0` in the URL branch; after BOOT apply:
    `if (BOOT.gearWeight >= 0) gearWeight = +BOOT.gearWeight || 0;` (localStorage path)
    and for the URL path map `o.gw` → the same field name `gearWeight` in the BOOT object.
  - `captureState()`: add `gearWeight: gearWeight`.
  - `doPersist()`: `if (gearWeight) q.set('gw', gearWeight);`
  - `applyState()`: `gearWeight = +o.gearWeight || 0; $('gearWeight').value = gearWeight;`
  - listener: `$('gearWeight').addEventListener('input', function () { gearWeight = Math.max(0, +this.value || 0); render(); });`
- [ ] **Step 3: `renderSurvival(mods, boosted)`** called from `render()` (which already
  computes `mods` and `boosted` — pass them in):

```js
function renderSurvival(mods, boosted) {
  var se = ERCalc.statEffects(boosted, mods);
  var weaponW = current.weight != null ? current.weight : 0;
  var totalW = Math.round((weaponW + gearWeight) * 10) / 10;
  var rs = ERCalc.rollState(totalW, se.equipLoad);
  $('survHP').textContent = se.hp; $('survFP').textContent = se.fp; $('survStam').textContent = se.stamina;
  $('survLoadText').innerHTML = totalW + ' / ' + se.equipLoad +
    (current.weight == null ? ' <span class="unverified" title="weapon weight unknown">?</span>' : '');
  // bar with breakpoint ticks at 30% / 70% / 100%
  $('survLoadBar').innerHTML =
    '<div class="loadbar ' + rs.state + '"><i style="width:' + Math.min(100, rs.ratio * 100) + '%"></i>' +
    '<s style="left:30%"></s><s style="left:70%"></s></div>';
  var ROLL_LABEL = { light: 'Light roll', medium: 'Medium roll', heavy: 'Heavy roll', overloaded: 'Overloaded — can’t roll' };
  $('survRollState').textContent = ROLL_LABEL[rs.state];
  $('survRollState').className = 'roll-state ' + rs.state;
  $('survHeadroom').textContent =
    rs.state === 'overloaded' ? 'drop ' + Math.abs(rs.headroom) + ' weight for heavy roll'
      : '+' + rs.headroom + ' weight headroom before ' + (rs.nextBreakpoint === 0.3 ? 'medium roll' : rs.nextBreakpoint === 0.7 ? 'heavy roll' : 'overloaded');
}
```
  Also compute the "or N more Endurance" hint when within reach: loop `end+1 … min(99, end+15)`
  over `ERCalc.statEffects({VIG:1,MND:1,END:e}, mods).equipLoad` until the current `totalW`
  fits the *previous* (better) bracket; if found, append ` · or ${e - END} more END for ${betterRoll}`.
  Skip the hint entirely for light roll (nothing better exists).
- [ ] **Step 4: CSS** in `assets/app.css`: `.loadbar` (reuse the existing `.bar` look, add
  breakpoint tick marks `s { position:absolute; … 1px lines }`), state colors — `light`
  green / `medium` gold / `heavy` orange / `overloaded` red (use the existing CSS variables
  `--green`, `--gold-2`, etc. — check `:root` for the red/orange ones before inventing new).
- [ ] **Step 5: Hand-verify in the browser** (preview_start or open the page): the spec's
  done-criteria list — Vigor 60 → 1900 HP; Endurance drag moves the bar; weapon switch moves
  total weight; gear weight survives reload AND a share-link round-trip in a fresh tab;
  Soreseal bumps HP; Erdtree's Favor +2 / Great-Jar's Arsenal move equip load but NOT AR.
  Also confirm a **375px-wide viewport** doesn't overflow horizontally (recent bug class).
- [ ] **Step 6: Commit:** `feat(build): Survival panel — HP/FP/stamina + equip-load bar w/ roll breakpoints & headroom; gear-weight input (&gw= in share URL)`

### Task 6: Close out

**Files:** Modify: `ROADMAP.md`

- [ ] **Step 1: ROADMAP update.** Add the Survival panel to "Shipped beyond the roadmap"
  (with the test-harness + README + weight-fill notes), and add the deferred list from the
  spec as explicit backlog entries: armor picker + negation, poise breakpoints,
  `data/enemies.json` per-boss data, casters (T7), maps (T8), more buffs / PvP toggle.
- [ ] **Step 2: Full check:** `node tests/engine.test.js` green; open build page once more.
- [ ] **Step 3: Commit + push everything:** `docs(roadmap): survival panel + hygiene pass shipped; deferred items logged`. Verify `git status` clean and `git push` succeeded.
- [ ] **Step 4: Report to Dan** with the hand-test script (the 6 done-criteria clicks from
  the spec) so he can verify on his machine.

---

## Self-review notes (done at planning time)

- Spec coverage: 1A→Task 1, 1B→Task 2, 1C→Task 3, Part 2 engine→Task 4, UI/state→Task 5,
  deferred/ROADMAP→Task 6. Edge cases from the spec: zero gear weight (Task 5 default),
  overloaded copy (Task 5 Step 3), missing weapon weight `?` tag (Task 5 Step 3),
  old links (additive `gw` param, Task 5 Step 2). ✔
- Names used consistently: `statEffects`, `rollState`, `survival` mod field, `gearWeight`
  state var, `gw` URL param, `data/stat-effects.json`. ✔
- Known risk: the FP-at-Mind and stamina/equip-load anchor values are deliberately NOT
  hard-coded in this plan (only Vigor 40/60/99 and FP@99 are asserted) — the executor
  transcribes and double-checks from two sources. If wiki.gg and Fextralife disagree on a
  row, prefer wiki.gg and mark the row in `_readme`.
