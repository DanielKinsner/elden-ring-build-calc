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
- Four true talisman slots backed by all 154 base+DLC items and exact icons: real weight,
  game-param conflict groups, condition switches, positional sharing, and a transparent effect
  trace. One hundred formulas are live, including 62 directly derived from SpEffectParam plus
  a 1.16.1 move-aware attack matrix: jump/heavy/guard-counter/critical/counter-hit/movement,
  skill, DLC skill-family, arrow, two-handed, PvE/PvP, and damage-type exception handling.
- Thirty-three casting tools and all 213 base+DLC spells. Catalyst Spell Buff is calculated from
  reinforcement rates, AttackElementCorrectParam stat gates, and the exact CalcCorrectGraph curve;
  the memory rack enforces slots and exposes spell requirements, variants, FP/stamina cost,
  category bonuses, typed motion values, and param-derived pre-defense output.
- An encounter archive with 3,341 base+DLC enemy/phase profiles across every cycle from NG through
  NG+7: exact HP, typed defense and negation, status thresholds/immunities, and target-specific
  final spell damage. Active-weapon status buildup automatically becomes real hits-to-proc.
- Exact standard-attack data for 419 melee/shield/catalyst weapons and 24,271 selectable moves,
  plus all 65 arrows, great arrows, bolts, and greatbolts for the 29 ranged weapons. One-hand,
  two-hand, movement, critical, and ranged attacks preserve every multi-hit/projectile motion value,
  per-hit physical attribute, and status motion value through the final enemy calculation. Spread
  Crossbow's three bolts are resolved independently.
- Legal skill state for every weapon, including all 91 base-game Ashes of War and 2,422 audited
  attack events. The active armament and affinity constrain the selectable Ash; fixed skills retain
  their own FP branches. Typed weapon motion, AtkParam base damage, reinforcement, stat curves,
  stamina, poise, status motion, PvE/PvP multipliers, and enemy defense remain visible as one-event
  traces instead of being collapsed into an invented full-cast number.
- Active buff layer (Golden Vow and greases) with category override rules.
- A complete 37-tear Flask of Wondrous Physick rack with two unique slots, duration and model
  coverage notes, live activation, and exact/partial math for supported stat, attack, survival,
  defense, resistance, and recovery effects. All six equipable Great Runes share the same state,
  with Rune Arc activation and live math for Godrick, Radahn, and Morgott.
- Status payoff card — hits-to-proc and what the proc is worth (bleed/frost/poison/rot) vs a target HP/resist.
- Soft-cap chart + optimal stat advisor (redistributes your offensive points for max AR).
- "Best Weapons for Your Build" ranking + a compare tray.
- Scadutree Blessing slider — Land-of-Shadow AR and damage negation.
- Versioned full-build state, compact share links, auto-save, old-save migration, and **My Builds**
  named multi-save. The v8 schema preserves equipment, combat, attack-lens, ammunition, catalyst,
  spell-memory, two-tear Physick, Great Rune, and both activation states.

**Weapon Atlas** (`atlas/`) — every weapon, filterable by status/scaling/infusable/DLC, sortable
by AR-for-a-reference-build, weight, or requirements; per-weapon detail pages with acquisition info.

**Guides** (`guides/`) — 21 NPC questlines as checkable trackers with fail-trigger warnings
and NPC portraits, boss cheat-sheet with ☠ felled checkboxes (base + SotE remembrances), all
6 endings with unlock routes, and a full walkthrough (12-stage base route + 9-stage DLC
route, stat targets, Scadutree/fragment tables). A region progress rail (wide screens) tracks
completion by area. The trophy tracker groups all 42 identical PlayStation, Xbox, and Steam
requirements, platform grades/Gamerscore, collectible sets, cleanup notes, and linked boss or
ending routes. Instant search (Ctrl+K / `/`) finds any quest, step, boss, ending, trophy, or
compendium entry in one box. The Compendium tab is a lean, cross-linked reference — every NPC,
boss, and key region in 2–3 sentences. Progress saves locally.

**Tales** (`tales/`) — original fan writing: *Gold and Shadow* (~55k words),
*Kindling: The Story of Melina*, and *The Testament of Ranni*, in a book-style reader with per-chapter read state and a
reading-tools rail (continue reading, recent activity). A Timeline view traces ~25 in-world
events across the setting's history, each linked back to the chapter it's drawn from.

**KINDLING — Archive Film I** (`kindling/`) — the launch-ready cinematic companion for the
first YouTube film. It joins the film to all nine written movements and routes new viewers into
the Build Lab, journey guides, and Tales. Publication is a single manifest change in
`data/releases.json`; see `docs/06-film-release.md` for the exact release switch.

**THE WHOLE DARK MOON — Archive Film II** (`ranni/`) — Ranni's cinematic companion, joining
the final 40,061-word narration master to its prologue, twenty movements, and coda. Film II uses
the same manifest-driven YouTube release switch while retaining the complete written edition.

**GOLD AND SHADOW — Archive Film III** (`gold-and-shadow/`) — the candlelit cinematic companion
to the 55,000-word in-world chronicle. It joins the film poster and chronicler study to the
prologue, fourteen chapters, and two appendices, with the same manifest-driven release switch.

The landing page's **Returning Grace** ledger reads the same device-local state used by the tools:
active/named builds, 109 valid quest steps, 21 boss records, and all 48 Tale chapters. It never
uploads progress; it validates stored IDs against the current manifests and resumes the next unread
chapter, active quest thread, or build without creating a second persistence system.

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

## Verification

The static site has a pinned development-only verification harness. From a clean checkout:

```
npm ci
npm run install:browsers
npm run verify
```

It covers engine/data, releases, compendium references, all 448 acquisition records, sitemap and
local references, desktop/390px browser behavior, save/share compatibility, Film/Tales structure,
HTTP/assets, automated accessibility, and the reproducible mobile performance profile. See
[`docs/verification.md`](docs/verification.md) for individual commands, the optional
`CHROMIUM_PATH` override, the exact measurement profile, and CI scope.

## Structure

```
build/        the calculator page
atlas/        weapon atlas + per-weapon detail pages
guides/       quests / bosses / endings / walkthrough
tales/        fan-writing reader (content as raw .md)
kindling/     Archive Film I companion + YouTube release switch
ranni/        Archive Film II companion + YouTube release switch
src/          engine (pure math, UMD) + data loader
data/         structured datasets (weapons, buffs, quests, …)
docs/         research + reference (the math, with sources)
assets/       css, page scripts, icons, images
tests/        golden regression pins (plain node)
```

Vanilla HTML/CSS/JS — **no build step**. Deploy = `git push` (Vercel).

---

*Sources for all math live in `docs/`. Built with 🖤.*
