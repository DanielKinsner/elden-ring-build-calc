# Elden Ring Build Calculator — feature roadmap

A backlog of *directions* for the next build session. The fixed parts are the **data contracts** and
the **already-built engine** (below). Everything else is an invitation — reorder, reinterpret, improve.
North star: **the site a serious build player keeps open on a second monitor.**

## Codebase map (where things live)
- `src/engine.js` — the math. Pure UMD module (`window.ERCalc` / `require`). **All calc logic goes here.**
- `src/data-loader.js` — `ERData.loadWeapons()` / `loadPresets()` (fetch + flatten).
- `data/weapons/{base,dlc}/*.json` — weapon stats at max upgrade (per category). Infusable weapons carry an `affinities` map.
- `data/acquisition/<id>.json` — per-weapon drop/location/tactics/graces/lore (one file per weapon).
- `data/scaling-curves.json`, `data/reinforcement.json`, `data/presets.json` — the datamined constants + presets.
- `build/index.html` + `assets/build.js` — the calculator page.
- `atlas/index.html` + `atlas/index.js` (grid, tabbed by attack type) + `atlas/weapon.html` + `atlas/weapon.js` (detail pages).
- `assets/app.css` — all styling.
- No build step. Static HTML/CSS/JS. Deploy = `git push` (Vercel) or `vercel deploy --prod`.

## Already built — REUSE, don't rebuild
`ERCalc` (in `src/engine.js`) already exposes:
- **`computeAR(build, weapon, {affinity, upgradeLevel, twoHanded})`** → `{ totalAR, byType, byStat, status, softCaps, grades, upgrade, requirementsMet, unmetReqs }`. AR is floored per damage type to match the game (`totalARExact` is the unfloored total, used for smooth soft-cap derivatives); Arcane scales bleed/poison via the weapon's ARC value; two-handing counts 1.5× STR toward the STR requirement.
- **`suggestWeapons(build, weapons, {twoHanded, usableOnly, limit})`** → weapons ranked by AR for a build, usable-first. **← the "suggested weapons" feature is ALREADY this function. It just needs a UI.**
- **`softCapCurve(build, weapon, stat, opts)`** → per-point AR gain across 1→99 (powers the soft-cap graph AND an optimal-stat advisor).
- `characterLevel`, `saturation`, `gradeFor`, `reinforce`, plus `STATS / DAMAGE_TYPES / STATUS_TYPES / CURVES`.

## How to research / source data
- **Weapon stats, scaling coefficients, reinforcement, calc-correct curves:** the datamined game regulation (community JSON, e.g. ThomasJClark's `regulation-vanilla` dump). This is the source of truth for anything numeric. Base game vs DLC kept separate.
- **Buffs, talismans, greases, physick, bleed-proc formula, spell scaling:** wiki.gg (CC BY-SA — rewrite, don't copy) + Fextralife, cross-checked. Community damage-calc source (tclark.io / hanslhansl optimizer) for validating formulas.
- **Quests, bosses, endings, graces:** the bundled **offline Elden Ring guide skill** at `~/.claude/skills/elden-ring/references/` (region files, `quests.md`, `bosses.md`, `key-items.md`). Base game only; DLC needs the wiki.
- **Rule:** tag every value `[CONFIRMED]` (datamined) or `[MODELED]` (interpolated), like the existing `docs/`. Validate against a real in-game number before shipping (that's how the AR/bleed fixes were verified).

---

## Tier 1 — quick wins (data + logic already exist)

### T1. "Best Weapons for Your Build" panel  ✅ DONE (2026-07)
`suggestWeapons()` already returns the ranked list. Add a panel/tab on `build/` that calls it with the
current build and renders the top ~15 (name, type, AR, ✓/⚠ usable, click → atlas detail). Respect the
DLC toggle and two-hand. **Where:** `assets/build.js` render loop + a new panel in `build/index.html`.
**Research:** none — pure UI on an existing function.

### T2. Atlas filters + sort  ✅ DONE (2026-07)
Add filter chips to `atlas/`: by **status** (bleed/frost/poison/rot/sleep/madness), by **scaling stat**
(STR/DEX/INT/FAI/ARC ≥ a grade), by **infusable**, by **base/DLC**. Add sort (AR-at-a-reference-build /
weight / requirement). All data is already on each weapon object. **Where:** `atlas/index.js` (filter the
list before grouping). **Research:** none.

---

## Tier 2 — calculator depth (makes the numbers match how people build)

### T3. Buffs & consumables toggles  ⭐
Toggle Golden Vow, Flame Grant Me Strength, greases (Blood Grease etc.), Physick tears → recompute.
Most are **multiplicative % on final damage** (some add flat element/status). **Where:** a post-AR
multiplier layer in `computeAR` (or a wrapper), + a "Buffs" section in `build/`. **Research:** wiki buff
values + **stacking rules** (which buffs are additive vs multiplicative with each other — this is the
tricky part; the community damage calcs document it). Model each buff as `{ id, type: 'mult'|'flatElement'|'status', value, stacksWith }`.

### T4. Status effective-damage (bleed proc)  ⭐
Buildup ≠ payoff. Show **hits-to-proc** (target threshold ÷ per-hit buildup) and **proc damage**
(hemorrhage deals a % of the target's max HP + flat). **Where:** new `statusPayload()` in `engine.js`,
surfaced on `build/`. **Research:** the exact bleed/frost/rot proc formulas (% max HP + flat) and common
enemy status thresholds — wiki. Let the user pick a target HP or use a default.

### T5. Talismans
Two kinds: **stat-boost** (Radagon's Soreseal etc.) → bump effective stats before calc; **damage-%**
(Ritual Sword, Rotten Winged Sword Insignia, Shard of Alexander) → multipliers (some conditional: "at
full HP", "after a skill"). **Where:** a talisman picker in `build/` feeding into the buff layer (T3).
**Research:** wiki talisman effects → `data/talismans.json` (`{ id, name, statBonus?, damageMult?, condition? }`).

### T6. Optimal stat advisor
Given a **level budget**, distribute points to maximize AR for the selected weapon. `softCapCurve()`
already gives per-point value per stat — greedily spend points into the highest-value stat until the
budget is gone (respecting reqs + soft caps). **Where:** `engine.js` (new `optimize(build, weapon, level)`)
+ a button on `build/`. **Research:** none — it's an optimization over existing functions.

---

## Tier 3 — data expansions

### T7. Catalysts + spell scaling (the missing weapon class)
Staves + Sacred Seals. Their damage is **Sorcery Scaling / Incantation Scaling** (a different stat than
weapon AR) applied to a spell's base. Add catalysts to the dataset + a spell-power calc + a spell picker.
**Where:** `data/weapons/` (catalyst category) + a `spellPower()` in `engine.js` + optionally `data/spells.json`.
**Research:** datamine the staff/seal scaling (same regulation source; catalysts use their own calc-correct)
+ spell base motion values from the wiki. Biggest data lift here — scope it as its own project.

### T8. Region maps (phased — this is the "hard" one, so don't start at v3)
The acquisition schema already has `mapPin: {x, y}` (% coords). 
- **v1 (done):** region name + directions text on detail pages.
- **v2:** static region map image + a CSS-positioned pin at `mapPin`. Assets → `assets/maps/<region>.jpg`.
- **v3 (hard, maybe never):** interactive pan/zoom map.
**Research:** region map images (source/licensing) + fill `mapPin` per weapon (hand-place against the map).

---

## Tier 4 — a Guides section (the sleeper hit — reuse the offline ER knowledge)

### T9. Questline tracker
Interactive checklists for the big NPC quests (Ranni, Fia, Varré, Sellen, etc.) with **the "don't do
this" fail-triggers** inline (e.g. "never give Ranni Seluvis's Potion"). Progress saved in localStorage.
**Where:** a new `guides/` section. **Research:** the offline skill's `quests.md` is already structured
exactly for this (start / steps / moves / reward / ⚠️ missables) — transcribe it into `data/quests.json`.

### T10. Boss guide + Endings guide
Boss weaknesses/tactics/drops; the 6 endings + how to get each. **Research:** offline skill `bosses.md` +
`quests.md` ending notes. → `data/bosses.json`, `data/endings.json`.

---

## Tier 5 — sharing / saving
### T11. URL build-share + localStorage save + build library  🟡 MOSTLY DONE (2026-07)
Shipped: the build lives in the URL (`?b=VIG.MND.END.STR.DEX.INT.FAI.ARC&w=<id>&a=<affinity>&u=<upgrade>&h=0|1&l=<level>`),
auto-saves to localStorage (survives refresh), and a 🔗 Share button copies the link. **Remaining:** the
curated meta build library (`data/build-library.json`) + a named multi-save UI.
Encode a build into `?build=<compact>` (stats + weapon + affinity + upgrade + level + buffs) → shareable
link. "Save Build" writes to localStorage; a small curated **meta build library** ships as `data/build-library.json`.
**Where:** `assets/build.js` (serialize/deserialize state). **Research:** none — pure front-end.

---

## Suggested order
1. ~~**T1 + T2** (free wins — suggested-weapons panel + atlas filters).~~ ✅ shipped, plus T11's share/save core.
2. **T3 + T4** (buffs + bleed payoff — the biggest "makes it real for a bleed build" jump). **← next up**
3. **T9** (questline tracker — high value, data already sourced in the offline skill).
4. **T5, T6** (talismans, stat advisor) + T11's remaining build library.
5. **T7, T8** (catalysts, maps — the big lifts, last).

## Known data gaps (surfaced 2026-07)
- 170/448 weapons have no `weight` — they sort last under the atlas "Lightest" sort. Fill from the regulation dump.
