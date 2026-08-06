# Elden Ring Build Calculator

A real-time build & weapon companion for Elden Ring. Enter your stats and gear, watch your
Attack Rating update live, and compare weapons head-to-head **by the actual numbers** —
plus a full weapon atlas, quest/boss/walkthrough guides, and original fan writing.

Built for players who want to *see* what a stat point is actually worth — where their soft caps
are, which weapon wins on their build, and how bleed/status buildup scales.

## What's here

**Full Build Lab** (`build/`)
- Live AR with full damage-type breakdown, all 8 stats, weapon + affinity + upgrade + two-hand.
- Six right/left-hand armament slots with per-slot weapon, reinforcement and affinity state;
  switch the active slot to analyze it while every equipped armament contributes weight.
- Four-slot armor loadout backed by 704 game-versioned pieces; live armor weight, poise, eight
  multiplicatively combined damage-negation values, four resistances, equip load, and roll state.
- Buffs & talismans layer (Golden Vow, greases, soreseals, scorpions… — one per category, 4 talisman slots).
- Status payoff card — hits-to-proc and what the proc is worth (bleed/frost/poison/rot) vs a target HP/resist.
- Soft-cap chart + optimal stat advisor (redistributes your offensive points for max AR).
- "Best Weapons for Your Build" ranking + a compare tray.
- Scadutree Blessing slider — Land-of-Shadow AR and damage negation.
- Versioned full-build state, compact share links, auto-save, old-save migration, and **My Builds**
  named multi-save. The v2 schema reserves spells, physick, and Great Rune for the next slices.

**Weapon Atlas** (`atlas/`) — every weapon, filterable by status/scaling/infusable/DLC, sortable
by AR-for-a-reference-build, weight, or requirements; per-weapon detail pages with acquisition info.

**Guides** (`guides/`) — 21 NPC questlines as checkable trackers with fail-trigger warnings
and NPC portraits, boss cheat-sheet with ☠ felled checkboxes (base + SotE remembrances), all
6 endings with unlock routes, and a full walkthrough (12-stage base route + 9-stage DLC
route, stat targets, Scadutree/fragment tables). A region progress rail (wide screens) tracks
completion by area. Instant search (Ctrl+K / `/`) finds any quest, step, boss, ending, or
compendium entry in one box. The Compendium tab is a lean, cross-linked reference — every NPC,
boss, and key region in 2–3 sentences. Progress saves locally.

**Tales** (`tales/`) — original fan writing: *Gold and Shadow* (~55k words) and
*Kindling: The Testament of Melina*, in a book-style reader with per-chapter read state and a
reading-tools rail (continue reading, recent activity). A Timeline view traces ~25 in-world
events across the setting's history, each linked back to the chapter it's drawn from.

## Accuracy & honesty

This calculator uses the **documented Elden Ring damage model** — the real formula
(`base + Σ scaling bonus`), the published grade→scaling-value thresholds, the CalcCorrectGraph
saturation curves anchored to confirmed data points, and per-path reinforcement multipliers.

Where a value is **modeled/interpolated** rather than a confirmed game-param dump, it's labeled
as such — in the docs and in the UI. AR is dead-on for **comparison and stat-effect**; absolute
values may differ from in-game by a few points due to calc-correct nuance. We don't fake precision
we don't have.

**Base game (vanilla) and Shadow of the Erdtree (DLC) math are kept in separate reference files**
so DLC-only systems (Scadutree Blessing, new weapons) never contaminate vanilla numbers.

## Tests

Golden regression pins for the engine (verified library-build ARs, two-handing rules,
flooring, Scadutree, status procs, the buff layer, survival, and armor aggregation):

```
node tests/engine.test.js
```

Run it after touching `src/engine.js` or the weapon data. No frameworks, no dependencies.

## Structure

```
build/        the calculator page
atlas/        weapon atlas + per-weapon detail pages
guides/       quests / bosses / endings / walkthrough
tales/        fan-writing reader (content as raw .md)
src/          engine (pure math, UMD) + data loader
data/         structured datasets (weapons, buffs, quests, …)
docs/         research + reference (the math, with sources)
assets/       css, page scripts, icons, images
tests/        golden regression pins (plain node)
```

Vanilla HTML/CSS/JS — **no build step**. Deploy = `git push` (Vercel).

---

*Sources for all math live in `docs/`. Built with 🖤.*
