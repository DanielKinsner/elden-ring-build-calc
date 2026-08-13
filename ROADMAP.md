# Elden Ring Build Calculator — feature roadmap

A backlog of *directions* for the next build session. The fixed parts are the **data contracts** and
the **already-built engine** (below). Everything else is an invitation — reorder, reinterpret, improve.
North star: **one build object, every meaningful Elden Ring outcome — the site a serious player
keeps open on a second monitor.** See `docs/04-full-build-platform.md` for the active architecture.

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

### T3. Buffs & consumables toggles  ✅ DONE (2026-07)
Shipped as `computeARBuffed()` + `data/buffs.json` (categories: aura/body/grease/physick, one active per
category; PvE values; `confirmed:false` = community number shown with ≈). Remaining ideas: more buffs
(Bloodboil Aromatic, Howl of Shabriri, exalted flesh), PvP values toggle.
Toggle Golden Vow, Flame Grant Me Strength, greases (Blood Grease etc.), Physick tears → recompute.
Most are **multiplicative % on final damage** (some add flat element/status). **Where:** a post-AR
multiplier layer in `computeAR` (or a wrapper), + a "Buffs" section in `build/`. **Research:** wiki buff
values + **stacking rules** (which buffs are additive vs multiplicative with each other — this is the
tricky part; the community damage calcs document it). Model each buff as `{ id, type: 'mult'|'flatElement'|'status', value, stacksWith }`.

### T4. Status effective-damage (bleed proc)  ✅ DONE (2026-07)
`statusPayload()` + payoff card (target HP / resist / boss). Formulas verified: bleed 15%+100 (boss 10.5%,
enhanced flat 200 on ARC-somber/Blood weapons), frost 10%+30 (boss 7%), poison (0.07%+7)/s·90s,
weapon-rot (0.18%+15)/s·90s. Remaining: per-enemy threshold presets (datamine).
Buildup ≠ payoff. Show **hits-to-proc** (target threshold ÷ per-hit buildup) and **proc damage**
(hemorrhage deals a % of the target's max HP + flat). **Where:** new `statusPayload()` in `engine.js`,
surfaced on `build/`. **Research:** the exact bleed/frost/rot proc formulas (% max HP + flat) and common
enemy status thresholds — wiki. Let the user pick a target HP or use a default.

### T5. Talismans  ✅ EQUIPMENT COMPLETE / 100 FORMULAS LIVE
All 154 base+DLC talismans now live in `data/talismans.json` with four positional equipment slots,
exact icons, weight, base-game param conflict groups, conditional state, persistence/sharing, and a
transparent resolver. One hundred reviewed formulas now feed AR/survival/defense. The attack lens
adds move-aware PvE/PvP rules for core attacks, movement attacks, skills, DLC attack families,
arrows, two-handing, and known damage-type exceptions. Remaining items stay honest `inventory`
coverage until their output domain exists or their activation math is verified.

### T6. Optimal stat advisor  ✅ DONE (2026-07) — `engine.optimize()` greedy redistribution + Apply UI
Given a **level budget**, distribute points to maximize AR for the selected weapon. `softCapCurve()`
already gives per-point value per stat — greedily spend points into the highest-value stat until the
budget is gone (respecting reqs + soft caps). **Where:** `engine.js` (new `optimize(build, weapon, level)`)
+ a button on `build/`. **Research:** none — it's an optimization over existing functions.

---

## Tier 3 — data expansions

### T7. Catalysts + spell scaling (the missing weapon class) ✅ CORE COMPLETE (2026-08-05)
Shipped all 33 casting tools and 213 base+DLC spells from the CryptidTracker planner's regulation-derived
tables. `computeCatalystSpellBuff()` uses exact reinforcement rates, AttackElementCorrectParam stat gates,
per-stat coefficients, and CalcCorrectGraph curves. `computeSpellOutput()` applies the selected spell
variant's typed motion values, catalyst category bonuses, focused INT/FAI scaling, no-scale rules,
requirements, and FP/stamina costs. The Memory & Casting UI has a 10-slot spell rack, school filters,
active variant analysis, full persistence, and compact sharing. Output is deliberately labeled
**pre-defense** until the enemy/context pipeline lands. Remaining: exact spell/catalyst icons, non-damage
utility formulas, multi-hit sequencing, weapon-catalyst integration, and final post-defense damage.

### T8. Region maps (phased — this is the "hard" one, so don't start at v3)
The acquisition schema already has `mapPin: {x, y}` (% coords). 
- **v1 (done):** region name + directions text on detail pages.
- **v2:** static region map image + a CSS-positioned pin at `mapPin`. Assets → `assets/maps/<region>.jpg`.
- **v3 (hard, maybe never):** interactive pan/zoom map.
**Research:** region map images (source/licensing) + fill `mapPin` per weapon (hand-place against the map).

---

## Tier 4 — a Guides section (the sleeper hit — reuse the offline ER knowledge)

### T9. Questline tracker  ✅ DONE (2026-08)
Shipped as `guides/` (Quest Tracker tab): 21 questlines / 109 steps from `data/quests.json`, checkbox
progress in localStorage (`er-guides`, keyed by stable step ids so data edits don't corrupt saves),
fail-triggers inline, MAJOR badges, per-quest reset. Transcribed from the offline ER skill's `quests.md`
(which IS installed on the office PC — the earlier "not installed" note was machine-specific).
Interactive checklists for the big NPC quests (Ranni, Fia, Varré, Sellen, etc.) with **the "don't do
this" fail-triggers** inline (e.g. "never give Ranni Seluvis's Potion"). Progress saved in localStorage.
**Where:** a new `guides/` section. **Research:** the offline skill's `quests.md` is already structured
exactly for this (start / steps / moves / reward / ⚠️ missables) — transcribe it into `data/quests.json`.

### T10. Boss guide + Endings guide  ✅ DONE (2026-08)
Shipped as the Bosses + Endings tabs of `guides/`: 10 required + 4 key optional bosses
(weak/resist/immune chips, bring list, tips, Great Runes) from `data/bosses.json`; all 6 endings with
unlock routes, point-of-no-return warnings, and links into the quest tracker from `data/endings.json`.
'(verify)' markers in the data render as the site's standard UNVERIFIED tag. Remaining ideas: DLC
bosses (wiki research), per-boss checkboxes ("beaten"), drops/runes columns.
Boss weaknesses/tactics/drops; the 6 endings + how to get each. **Research:** offline skill `bosses.md` +
`quests.md` ending notes. → `data/bosses.json`, `data/endings.json`.

---

## Tier 5 — sharing / saving
### T11. URL build-share + localStorage save + build library  ✅ DONE (2026-07)
Build lives in the URL (`?b=…&w=…&a=…&u=…&h=…&l=…&bf=<buffs>&tl=<talismans>`), auto-saves to
localStorage, 🔗 Share copies the link. Six curated meta builds shipped in `presets.json` (`library:true`).
**Remaining:** named multi-save UI (save several of your own builds).
**Named multi-save shipped 2026-08** (💾 Save → `er-my-builds`, chips + dropdown optgroup) — T11 fully closed.
Encode a build into `?build=<compact>` (stats + weapon + affinity + upgrade + level + buffs) → shareable
link. "Save Build" writes to localStorage; a small curated **meta build library** ships as `data/build-library.json`.
**Where:** `assets/build.js` (serialize/deserialize state). **Research:** none — pure front-end.

---

## Shipped beyond the roadmap (2026-08)
- **Tales section** (`tales/`) — original fan writing on the site: *Gold and Shadow* (~55k words,
  17 chapters), *Kindling: The Story of Melina* (~5.2k words, 9 movements), and *The Testament of Ranni*
  (~39.6k words, 22 movements). Library shelf w/ continue-reading,
  book-typography reader (drop caps, scroll progress, ←/→ keys, contents), per-chapter read state
  (`er-tales`). Content lives as raw `.md` in `tales/content/` — updating the book = copying files.
- **Walkthrough tab** in `guides/` — full base route (12 stages, 13 checkable steps, stat targets,
  readiness checks, gotchas) from `data/progression.json`, plus a **Shadow of the Erdtree** leg
  (entry reqs, Scadutree Blessing explainer, 9-stage DLC route).
- **DLC remembrance bosses** — 7 SotE bosses in `data/bosses.json` (resist claims tagged `(verify)`
  where community-sourced).
- **☠ Felled checkboxes** on every boss card, with per-group counters.
- **My Builds** — named multi-save on the build page (`er-my-builds`); closes the T11 remainder.
- **Scadutree Blessing system** — `ERCalc.scadutree(L)` (dealt ×(1+0.05·L), taken reciprocal —
  matches the published per-level negation table), ☾ slider on the build page (Land-of-Shadow AR,
  in the share URL as `&st=`), full blessing/fragment-cost table + Revered Spirit Ash notes in the
  guides Walkthrough (`data/scadutree.json`).

## Shipped 2026-08-05 — hygiene pass + the defense half
- **Golden test harness** — `node tests/engine.test.js`, 60 regression pins (library-build
  ARs frozen from in-game-verified output, 2H reqs, flooring, scadutree, status procs,
  buff layer, survival tables, roll brackets). Run it after touching `src/engine.js` or data.
- **README refresh** — describes the shipped site, not the 2026-06 plan.
- **Weight fill** — all 448 weapons now carry `weight` (datamined EquipParamWeapon v1.16).
- **Survival panel** (`build/`) — `ERCalc.statEffects()` (Vigor→HP, Mind→FP, End→stamina/
  equip load; tables in `data/stat-effects.json`, wiki.gg + Fextralife cross-checked) +
  `ERCalc.rollState()` (light/med/heavy/overloaded + headroom). Equip-load bar with
  breakpoint ticks, "+X weight before …" / "+N END for …" hints, manual armor-&-gear
  weight input (`&gw=` in share URLs). Erdtree's Favor +2 + Great-Jar's Arsenal talismans
  (new per-mod `survival` multiplier field, invisible to the AR layer).
- **Full-build v2 foundation + armor** — 704-piece 1.16 armor corpus with provenance,
  four searchable equipment slots, `ERCalc.aggregateArmor()` (multiplicative negation;
  additive weight/poise/resistances), live defense summaries, real armor weight in roll state,
  old-save migration, and compact `&ar=` share state. Engine suite: 60/60.
- **Six-slot armament rack** — three right-hand + three left-hand slots, searchable empty-slot
  equip flow, active-slot analysis, independent affinity/reinforcement state, all-slot equip-load
  contribution, compact `&rh=` / `&lh=` / `&as=` share state, and legacy-link migration.
- **True talisman rack + effect resolver** — four positional slots backed by the complete 154-item
  base+DLC catalog and exact item icons; real weight; base-game param conflict groups; conditional
  assumption switches; positional URL/local-save persistence; post-armor defense modifiers; and a
  visible effect trace that distinguishes applied math from inventory-only coverage. One hundred
  reviewed effect models are live, including a move-aware 1.16.1 PvE/PvP attack lens. Remaining
  talisman formulas must move from `inventory` to `modeled` only after their output domain and
  activation context are verified.
- **Reusable browser QA** — `node tests/ui.smoke.js` exercises talisman selection, conditional AR,
  conflict blocking, save/share reload, desktop rendering, 390px overflow, and browser errors.
- **Site identity polish** — original rune favicon now ships across every page; the lingering
  browser-tab 404 is closed.

## Shipped 2026-08 — guides/tales deck-out
- **NPC + boss portraits** — scraped from wiki.gg via `scripts/fetch-portraits.js` (Infobox
  `image=` param + `imageinfo` API, since `pageimages` isn't enabled on that wiki), 42/42
  fetched. Rendered in the quest list/detail and boss cards, with a letter-avatar fallback
  for any id missing from `assets/icons/{npcs,bosses}/manifest.json`.
- **Region progress rail** (`guides/`, ≥1280px) — steps-done/total per canonical region,
  an active-questline shortlist, and a static legend, beside the existing two-column quest
  tracker. Quests carry a new `region` field (`data/quests.json`), assigned by a documented
  rule (first cluster token → canonical region table).
- **Instant search** (`guides/`, Ctrl+K / `/`) — client-side index over quest names, every
  quest step, boss names, ending names, walkthrough steps, and compendium entries; grouped
  dropdown results, keyboard nav, Esc/click-away to close.
- **Tales timeline** (`tales/#timeline`) — 25 in-world events across 7 eras, drawn directly
  from *Gold and Shadow*'s own chapters (the book is the canon here, not the wiki), each
  linked to its source chapter; Dan-approved wording (`data/timeline.json`).
- **Lean compendium** (`guides/`, fifth tab) — 55 entries (21 NPCs, 21 bosses, 13 places),
  2–3 sentences each, cross-linked to the quest tracker, boss cards, and Tales chapters
  (`data/compendium.json`; `scripts/check-refs.js` verifies every reference resolves).
- **Tales reading-tools rail** (`tales/`, ≥1100px) — continue-reading per work, last-5
  recent activity with relative time, and explore links (Timeline / Compendium / Quest
  Tracker). `er-tales` read entries now carry a first-read timestamp (`{t}`); legacy bare
  `1` entries from before this change still count as read and are never rewritten.
- **Optional tale cover art** — drop `assets/tales/<workId>.jpg` in and the shelf card grows
  a 96px cover; absent, the layout is unchanged (owner-supplied art — not scraped or generated).

## Active full-build expansion (architecture: `docs/04-full-build-platform.md`)
- **Ash of War compatibility/state:** attach a legal Ash to each infusable armament and expose
  skill damage/FP/poise context without muddying the weapon's base analysis.
- **Talisman formula completion:** 100/154 models are live. Remaining work is primarily outputs
  that need their own domain (guard stamina, poise damage, flask restoration, discovery/runes,
  casting/spell costs) plus Blue Dancer and Verdigris load curves.
- **Catalysts + spell loadout:** memory slots, FP/stamina costs, requirements, catalyst-aware
  spell buff and spell damage. **Core shipped; enemy defense and advanced spell behaviors remain.**
- **Physick + Great Rune + complete effect stack:** transparent ordering and conflicts.
- **Enemy/context pipeline:** **PvE core shipped** with 3,341 profiles, defense, negation, status
  thresholds/immunities, phase variants, and NG–NG+7. Exact standard weapon attacks also shipped
  for 419 weapons / 24,271 moves, including multi-hit motion/status values and physical attributes.
  Standard ranged ammo is also shipped for all 65 ammunition items and all 29 ranged weapons,
  including exact three-projectile Spread Crossbow damage/status sequencing. Remaining: ranged
  weapon-skill projectiles, Ashes of War, player/PvP targets, phase chaining, and DLC
  blessing context.
- **Build optimizer + comparison:** offense/defense/weight targets over the same canonical state.

## Backlog — deferred deliberately
- **Poise breakpoint explanations and attack-specific hyperarmor context.**
- **Per-boss enemy data** (`data/enemies.json`: HP, status thresholds, negations) → makes
  the status payoff card boss-specific ("4 hits to proc bleed on Malenia").
- **T8 maps** remains a large parallel content lift; T7's core catalyst/spell system has shipped.
- More buffs (Bloodboil Aromatic, Howl of Shabriri, Exalted Flesh), PvP-values toggle,
  enemy status thresholds.
- **Reminders / notifications** — cut from the guides/tales deck-out scope (D2, 2026-08-05,
  the mockup's "Set Reminder"); not built in any form, no notification code added.
- **Per-step regions** and richer region maps — the deck-out shipped one primary region per
  quest (T8 above is the separate, bigger "interactive map" idea; unrelated to this note).

## Suggested order
1. ~~T1 + T2~~ ✅  2. ~~T3 + T4~~ ✅  3. ~~T5, T6, T11~~ ✅  4. ~~T9 + T10~~ ✅ — Tiers 1, 2, 4, 5 shipped.
5. **Six armament slots → true talisman/effect slots → catalyst/spell core → PvE encounter core → exact standard weapon motion values → standard ammunition** ✅ → **Ashes/ranged skills → complete talisman/spell/status formulas**, then
   optimizer/community publishing. T8 maps remains a parallel content project.

## Known data gaps (surfaced 2026-07)
- ~~170/448 weapons have no `weight`~~ **Filled 2026-08** from the datamined EquipParamWeapon
  v1.16 dump (`scripts/fill-weights.js`; 5 values spot-checked vs wiki.gg — exact match).
