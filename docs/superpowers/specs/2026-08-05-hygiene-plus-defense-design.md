# Design: Hygiene opener + Defense half of builds

**Date:** 2026-08-05 · **Status:** approved by Dan (brainstorm session)
**Shape:** two-part session — a small hygiene pass, then one big feature (the defense/survival
half of a build). Casters (T7), maps (T8), per-boss enemy data, and the armor picker are
explicitly deferred (see "Deferred" below).

---

## Part 1 — Hygiene opener

### A. Golden test harness
- New `tests/engine.test.js`, run with `node tests/engine.test.js`. **No frameworks, no deps,
  no build step** — plain Node asserts, matching the repo's zero-tooling style. Exit code 0 on
  pass; non-zero with a readable diff on failure.
- Locks in ~20 **golden values that were already hand-verified in-game** (do not invent new
  expectations — copy the numbers the engine produces today ONLY where they were previously
  validated against the game or a published table):
  - `computeAR` totals for the six library builds in `data/presets.json` (Moonveil,
    Blasphemous, Giant-Crusher, Malenia, Mohgwyn, DMGS).
  - Two-handing counts 1.5× STR toward the STR requirement.
  - Per-damage-type flooring (`totalAR` vs `totalARExact`).
  - `scadutree(L)` dealt/taken multipliers at L=0, 10, 20 (matches published negation table).
  - One `statusPayload` case each for bleed (incl. boss + enhanced-flat variants) and frost.
  - `computeARBuffed` with one known buff+talisman stack.
- Loads weapon JSON from disk with `fs` (the data loader uses `fetch`; tests read files
  directly — small local shim, not a change to `src/data-loader.js`).
- README gets a one-line "Tests: `node tests/engine.test.js`" note.

### B. README refresh
- Replace the stale "🚧 research docs first" Status section with what actually exists:
  calculator (AR, buffs, talismans, status payoff, optimizer, scadutree, share links,
  My Builds), weapon atlas + detail pages, guides (quests / bosses / endings / walkthrough
  incl. SotE), tales. Keep the Accuracy & Honesty section as-is — it's the site's best trait.
- Mention the live deploy (Vercel) and the no-build-step rule.

### C. Weight data fill
- Fill `weight` for the ~170/448 weapons missing it in `data/weapons/{base,dlc}/*.json`,
  from the datamined regulation dump (ThomasJClark `regulation-vanilla` community JSON —
  the repo's established source of truth). Tag source per the `[CONFIRMED]` convention.
- Spot-check ≥5 filled values against the wiki before shipping.
- This is a **prerequisite for Part 2** (equip-load math needs weapon weight), not just
  atlas-sort polish. Remove the "Known data gaps" ROADMAP entry once done.

---

## Part 2 — Defense half of builds ("Survival" panel)

### What the user sees
A new **Survival panel** on `build/index.html`. Moving Vigor / Mind / Endurance live-updates:
- **HP, FP, Stamina** numbers.
- An **equip-load bar** (current total weight vs max equip load) with the roll breakpoints
  marked (light < 30%, medium < 70%, heavy ≤ 100%, overloaded > 100%).
- A **headroom line**, e.g. *"+4.2 weight headroom before medium roll"* or
  *"2 more Endurance for light roll"* — whichever crossing is nearest/actionable.

### Engine (all in `src/engine.js`, pure functions)
- `ERCalc.statEffects(build)` → `{ hp, fp, stamina, equipLoad }` from the published
  per-level tables (Vigor→HP, Mind→FP, Endurance→stamina + equip load). Tables live in
  **`data/stat-effects.json`**, every value `[CONFIRMED]` (these are fixed datamined tables,
  identical for all builds — no interpolation needed).
- `ERCalc.rollState(totalWeight, equipLoad)` → `{ state, ratio, headroomToNext,
  enduranceForPrev }` using breakpoints 29.9% / 69.9% / 99.9% (strictly-under semantics
  per the game).
- Stat-boost talismans already in `data/buffs.json` (Soreseal etc.) feed `statEffects`
  exactly as they feed AR (effective stats, not base). Add the equip-load/HP talismans to
  `data/buffs.json`: **Erdtree's Favor (+0/+1/+2), Great-Jar's Arsenal** (and their values
  from the wiki, `confirmed:false` → ≈ mark if not datamined).

### Weight model (phase 1 — no armor picker)
- Total weight = **current weapon (auto, from weapon data; respects the Part 1C fill)** +
  a manual **"armor & other gear" number input** (step 0.1, default 0).
- The manual field is the deliberate YAGNI cut: an armor picker is a ~600-piece dataset and
  is deferred, logged in ROADMAP.

### State / sharing
- Gear weight rides the share URL as `&gw=`, is persisted in localStorage with the rest of
  the build, and is included in My Builds saves. Absent param = 0 (old links stay valid).

### Tests (extend the Part 1 harness)
- Golden values from the published tables: HP at Vigor 40/60/99 (Vigor 60 → **1900 HP**),
  FP at Mind 40, stamina + equip load at Endurance 20/40/60.
- `rollState` boundary cases: exactly 29.9%/30.0% and 69.9%/70.0%; overloaded > 100%.
- One case with Soreseal equipped (effective-stat feed) and one with Erdtree's Favor
  (equip-load bonus applied after stat tables).

### Done-criteria (hand-test script for Dan)
1. Open the build page, set Vigor 60 → Survival panel shows **1900 HP**.
2. Drag Endurance → equip-load bar and max-load number move live.
3. Switch weapons → total weight and the headroom line update.
4. Set gear weight, reload the page → value survives; copy a share link into a fresh
   tab → same state.
5. Equip Radagon's Soreseal → HP/stamina reflect the boosted stats.
6. `node tests/engine.test.js` prints all-pass, exit 0.

### Edge cases (decided)
- **Empty/zero:** gear weight defaults to 0; panel always renders (a fists-only build is valid).
- **Overloaded:** bar goes red, state reads "Overloaded — can't roll"; headroom line inverts
  ("drop 3.1 weight for heavy roll").
- **Missing weapon weight:** after Part 1C there should be none; if one slips through, treat
  as 0 and show the standard UNVERIFIED tag next to total weight.
- **Old saves/links:** no `gw` param → 0, everything else untouched.

---

## Deferred (logged to ROADMAP, not built now)
- Armor picker + damage negation numbers.
- Poise breakpoints.
- Per-boss enemy data (`data/enemies.json`) for status/defense.
- Casters — staves/seals/spells (T7). Maps v2 (T8).
- More buffs (Bloodboil, Shabriri), PvP-values toggle, enemy status thresholds.

## Order of work
1A tests → 1B README → 1C weight fill → 2 engine (`stat-effects.json`, `statEffects`,
`rollState`) → 2 UI (Survival panel) → 2 state/share → extend tests → ROADMAP update.
