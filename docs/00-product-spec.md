# 00 — Product Spec (what we're building)

A single-page **Elden Ring build calculator**: set your stats + gear on the left, see live Attack
Rating and comparisons on the right. No build step, framework-agnostic — the engine is a pure
module; the UI just calls it and renders the result.

## Core interaction

Move a stat slider or change a weapon → **everything recomputes instantly.** No "calculate" button.

## Regions / panels

### 1. Character panel (inputs)
- 8 attribute rows: **Vigor, Mind, Endurance, Strength, Dexterity, Intelligence, Faith, Arcane**.
  Each: slider (1–99) + number input, kept in sync. Values 1–99.
- **Two-hand toggle** (multiplies effective STR ×1.5).
- Derived readout: character **Level** and **runes-to-next** (from the stat totals).
- Preset buttons: **Vera Aletheia** (samurai/bleed), plus a few archetypes (Str, Dex, Int, Faith, Arcane/bleed).

### 2. Weapon panel (inputs)
- Weapon **search/picker** (typeahead over the dataset).
- **Affinity** selector (Standard, Heavy, Keen, Quality, Fire, Flame Art, Lightning, Sacred, Magic,
  Cold, Poison, Blood, Occult) — only the ones legal for that weapon.
- **Upgrade level** selector: +0…+25 (regular) or +0…+10 (somber). Auto-switches range by weapon.
- **Requirements** display (STR/DEX/INT/FAI/ARC) — highlight **red** if the current build doesn't meet
  them (unmet reqs tank scaling in-game; we flag it).
- Weight + passive (e.g. "Blood loss (55)").

### 3. Output panel (the payoff)
- **Total AR** — big, prominent number.
- **Per-damage-type breakdown**: physical / magic / fire / lightning / holy — value + bar. Only show
  types the weapon actually deals.
- **Status buildup meters**: bleed, frost, poison, scarlet rot, sleep, madness (only nonzero ones).
- **Per-stat contribution**: how much AR each stat is currently adding (e.g. "DEX: +142").

### 4. Soft-cap analysis (the "see what a stat is worth" feature)
- For each relevant stat: **"+1 point = +X AR"** right now.
- Visually flag when you're **past a soft cap** (diminishing returns) vs. still in the efficient zone.
- This is the thing that makes it more useful than just reading a wiki table.

### 5. Compare mode
- Add multiple weapons to a **comparison tray**.
- Table/cards showing each weapon's AR **for the current build**, ranked. Winner highlighted.
- Answers "which of these is actually better for MY stats," by the numbers.

## Aesthetic direction (for the mockup)
- **Elden Ring vibe**: deep charcoal/black background, **gold** accent (#c9a227-ish), subtle
  parchment texture optional.
- Serif display font for headers/numbers (feels in-world); clean sans for controls/labels.
- Dark by default. High contrast on the big AR number. Bars/meters use the gold + a couple status
  colors (bleed = red, frost = cyan, rot = orange, poison = green, sleep = pale blue, madness = yellow).
- Runic/ornamental dividers welcome but keep it **readable and fast** — it's a tool first.

## Engine API (what the UI calls)

```js
computeAR(build, weapon, { affinity, upgradeLevel, twoHanded }) → {
  totalAR,
  byType:   { physical, magic, fire, lightning, holy },
  byStat:   { STR, DEX, INT, FAI, ARC },        // AR contributed by each
  status:   { bleed, frost, poison, rot, sleep, madness },
  softCaps: { STR: {perPoint, pastSoftCap}, ... },
  requirementsMet: bool,
  unmetReqs: [ ... ]
}
```

The UI never touches the math — feed it stats + gear, render what comes back.
