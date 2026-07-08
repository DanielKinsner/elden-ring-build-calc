# 02 — Upgrade Reinforcement (vanilla)

> Scope: **base game.** How base damage and scaling grow as you upgrade a weapon.

## Confirmed facts **[CONFIRMED]**

| Path    | Max level | Base dmg per level | Total at max |
|---------|:---------:|:------------------:|:------------:|
| Regular | +25       | +5.8% of +0 base   | **2.45×**    |
| Somber  | +10       | +14.5% of +0 base  | **2.45×**    |

- Somber weapons gain exactly **2.5×** the per-level base bump of regular weapons
  (14.5 / 5.8 = 2.5), so both reach the same **2.45×** total at max.
- **Scaling values also grow with upgrades** — a weapon commonly goes D/D at +0 → B/B or A/A at
  max in STR/DEX. So both `baseDamage` and `scalingValue` must be reinforced, not just base.
- Confirmed anchor: standard +25 `physicsAtkRate` = 2.45 — this **is** the weapon base-damage
  multiplier the engine targets. (`baseAtkRate` is a *different* param that governs Ash-of-War/skill
  flat damage, not weapon base damage — not applicable here.)
- Verified against wiki upgrade tables: Uchigatana physical 115 (+0) → 148 → 181 → 215 → 248 → 281
  (+25), a flat +33 per 5 levels, ratio 281/115 = 2.443×. Rivers of Blood (somber) 76 (+0) → 131
  (+5) → 186 (+10), ratio 2.447×. Both confirm the 2.45× total and linear per-level growth.

Source: [Upgrades — Fextralife](https://eldenring.wiki.fextralife.com/Upgrades),
[How Weapon Damage is Calculated — Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3476225321).

## Engine strategy — store at MAX, model the rest

The weapon dataset stores each weapon's `baseDamage` and `scalingValue` **at max upgrade**
(+25 / +10). Reasons:

1. Max-upgrade values are what the wiki **Weapons Comparison Tables** publish reliably.
2. Max upgrade is the default comparison point for 95% of build questions.

The engine's default `upgradeLevel` is therefore **max**. When a lower level is requested, it scales
down from max using the reinforcement curves below.

### Base damage reinforcement **[CONFIRMED shape]**

Linear in level. As a fraction of max:

```
regularBaseFrac(level) = (1 + 0.058 × level) / 2.45      // level 0..25
somberBaseFrac(level)  = (1 + 0.145 × level) / 2.45      // level 0..10
```

- `regularBaseFrac(0)  = 0.408`, `regularBaseFrac(25) = 1.0`
- `somberBaseFrac(0)   = 0.408`, `somberBaseFrac(10)  = 1.0`

(i.e. a +0 weapon deals 40.8% of its max base — consistent with the 2.45× total.)

### Scaling reinforcement **[MODELED]**

Scaling grows non-trivially (grade changes on upgrade). Exact per-level `correctRate` values live in
`ReinforceParamWeapon` and will be dumped into `data/reinforcement.json` when available. Until then
the engine models scaling growth as **linear from ~60% of max at +0 to 100% at max** — a close
approximation of the observed D→B/A grade climb:

```
scalingFrac(level) = 0.60 + 0.40 × (level / maxLevel)
```

This is labeled MODELED in the UI. It only affects **non-max** upgrade levels; at max upgrade
(the default) scaling is exact from the dataset.

## Requirements not met

If the build doesn't meet a weapon's attribute requirements, in-game scaling is heavily penalized
(roughly −40% on the deficient scaling). The engine flags `requirementsMet: false` and applies the
penalty so the AR reflects reality. **[CONFIRMED behavior, penalty magnitude MODELED]**
