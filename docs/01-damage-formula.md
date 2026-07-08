# 01 — Elden Ring Damage Formula (vanilla / base game)

> Scope: **base game only.** Shadow of the Erdtree (DLC) additions — Scadutree Blessing,
> Revered Spirit Ash, DLC weapon curves — live in `docs/03-dlc-differences.md` and are never
> mixed into these numbers.

This is the math the calculator's engine implements. Every claim is tagged:

- **[CONFIRMED]** — sourced from datamined game params / community reverse-engineering.
- **[MODELED]** — reconstructed/interpolated from confirmed anchor points; accurate for
  comparison, may differ from in-game by a few points.

---

## 1. Attack Rating (AR) — the top-level formula

A weapon's total Attack Rating is the sum, over each of the 5 damage types, of the upgraded base
damage plus every stat's scaling bonus for that type. **[CONFIRMED]**

```
AR = Σ_type ( baseDamage[type]  +  Σ_stat  scalingBonus[type][stat] )
```

Damage types: `physical`, `magic`, `fire`, `lightning`, `holy`.
Scaling stats: `STR`, `DEX`, `INT`, `FAI`, `ARC`.

This is the "attack power" number shown on the equipment screen (before motion values,
defenses, and negation — those come later, see `docs/04-mitigation.md`).

---

## 2. Scaling bonus per stat

For a given damage type and a given stat: **[CONFIRMED]** (formula structure)

```
scalingBonus[type][stat] = baseDamage[type]
                         × (scalingValue[stat] / 100)
                         × (saturation[stat](statLevel) / 100)
```

- `baseDamage[type]` — the weapon's upgraded base damage for that type (see §4).
- `scalingValue[stat]` — the weapon's scaling *value* for that stat (see §3). This is the raw
  number behind the displayed letter grade.
- `saturation[stat](statLevel)` — the "attribute bonus %" from the CalcCorrectGraph curve at
  the character's stat level (see §5).

A stat only contributes to a damage type if the weapon has both nonzero base for that type and
nonzero scaling for that stat.

### Worked example (confirms the formula) **[CONFIRMED]**

Magic Dagger, 20 INT: base Magic = 124.25, INT scaling value ≈ 123.2 (displays "B"),
INT saturation at 20 = 40%.

```
bonus = 124.25 × (123.2/100) × (40/100) = 61.23 magic
total magic = 124.25 + 61.23 = 185.48   ✓ matches the in-game value
```

Source: Steam guide "How Weapon Damage is Calculated."

---

## 3. Scaling grade → scaling value **[CONFIRMED]**

The letter grade shown in-game is just a display bucket over the underlying `scalingValue`
(from `MenuValueTableParam`):

| Grade | Scaling value |
|:-----:|:-------------:|
| S     | 175 +         |
| A     | 140 – 174     |
| B     | 90 – 139      |
| C     | 60 – 89       |
| D     | 25 – 59       |
| E     | 1 – 24        |
| –     | 0             |

So the engine stores each weapon's **numeric scaling value** per stat (not just the letter) and
derives the grade for display. A "D" is a wide band (25–59); storing the number matters for
accurate AR.

`scalingValue = Correction:Attribute × Correction%:Attribute` — but for our purposes we take the
per-weapon `scalingValue` at each upgrade level directly from the dataset.

---

## 4. Base damage & upgrade reinforcement

Each weapon has a base damage per type at +0. Upgrading multiplies both base damage **and**
scaling values by per-level reinforcement multipliers, which differ by upgrade path:

- **Regular weapons**: +0 → +25 (25 levels). Upgraded with Smithing Stones.
- **Somber weapons**: +0 → +10 (10 levels). Upgraded with Somber Smithing Stones.

The full reinforcement multiplier tables (base-damage rate and scaling rate per level) are in
`docs/02-reinforcement.md`. **[CONFIRMED]** anchor: standard +25 `physicsAtkRate` = 2.45×.

---

## 5. CalcCorrectGraph — the saturation ("attribute bonus %") curves

This is the diminishing-returns curve: how much of a weapon's scaling you actually realize at a
given stat level. Elden Ring stores these as `CalcCorrectGraph` lookup tables.

### Confirmed anchor points **[CONFIRMED]**

- **Physical curve** (STR & DEX, `CalcCorrectGraph 0`): 10 STR → **11.65%**, 15 DEX → **19.80%**
- **Elemental curve** (INT / FAI on magic/fire/lightning/holy, `CalcCorrectGraph 4`):
  20 INT → **40%**

### Confirmed soft-cap breakpoints **[CONFIRMED]**

Diminishing-returns kicks in at these stat values (for weapon **attack power**):

| Curve                    | Soft caps        |
|--------------------------|------------------|
| STR / DEX (physical AR)  | 20, 60, 80       |
| INT / FAI (elemental AR) | 20, 50, 80       |
| ARC (physical AR)        | 20, 55, 80       |
| ARC (status buildup)     | ~45 (plateau)    |

Two-handing multiplies effective STR by **1.5×** (35 STR → 52.5 effective). **[CONFIRMED]**
Hard cap for all stats is 99.

### Modeled curves used by the engine **[MODELED]**

The engine reconstructs each curve as piecewise interpolation between control points, anchored to
the confirmed data above. Percent = "attribute bonus %" (the saturation term in §2).

**Physical (STR/DEX)** — anchored to 10→11.65, 15→19.80, soft caps 20/60/80:

| stat | 1 | 20 | 60 | 80 | 99  |
|------|---|----|----|----|-----|
| %    | 0 | 25 | 75 | 90 | 100 |

**Elemental (INT/FAI)** — anchored to 20→40, soft caps 20/50/80:

| stat | 1 | 20 | 50 | 80  | 99  |
|------|---|----|----|-----|-----|
| %    | 0 | 40 | 80 | 100 | 100 |

**Arcane (physical AR)** — soft caps 20/55/80, physical-like shape:

| stat | 1 | 20 | 55 | 80 | 99  |
|------|---|----|----|----|-----|
| %    | 0 | 25 | 75 | 90 | 100 |

Interpolation is monotonic between control points. These reproduce the confirmed anchors within
~1–2% and preserve the real soft-cap shape. Exact per-point game-param values (when we dump the
full CalcCorrectGraph) will replace these in `data/scaling-curves.json` without touching the
engine — the curves are **data, not code.**

---

## 6. Status buildup (bleed / frost / poison / rot / sleep / madness)

Status buildup is a **flat per-weapon value that does not change with upgrade level**
**[CONFIRMED]** — e.g. Uchigatana's Blood loss is 45 at +0 *and* +25; only the **ARC** stat
increases bleed/poison buildup, plateauing around 45–60 ARC (soft caps 25/45/60).

Engine model **[CONFIRMED]**:

```
statusBuildup = baseStatus
              + (baseStatus × arcStatusScaling × arcStatusSaturation(ARC))
```

`arcStatusSaturation` uses the arcane-status curve (soft caps 25/45/60, plateauing by ARC 60).
Only weapons with arcane-scaled status (e.g. Rivers of Blood, blood-affinity infusions) get the
ARC term. Neither term reinforces with upgrade level — upgrading a weapon changes its base damage
and scaling, never its passive status buildup.

---

## Sources

- [How Weapon Damage is Calculated — Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=3476225321) — formula, grade→value thresholds, CalcCorrectGraph anchor points, reinforcement `physicsAtkRate`.
- [Stat Breakpoints aka "Soft Caps" — Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2765060616) — soft-cap breakpoint locations, two-hand STR multiplier.
- [Stats — Elden Ring Wiki (Fextralife)](https://eldenring.wiki.fextralife.com/Stats) — stat definitions and soft-cap summary.
- [Calculating Damage — Elden Ring Wiki (Fextralife)](https://eldenring.wiki.fextralife.com/Calculating+Damage) — mitigation / defense side (used later).
- Cross-check target: [eldenring.tclark.io](https://eldenring.tclark.io/) — community calculator for validating engine output.
