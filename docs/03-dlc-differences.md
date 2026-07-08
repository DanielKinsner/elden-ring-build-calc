# 03 — Shadow of the Erdtree (DLC) — what's different

> This file exists so DLC-only systems **never contaminate vanilla numbers.** The base scaling
> math (formula, grade→value, CalcCorrectGraph curves, reinforcement) is **unchanged** by the DLC.
> What the DLC adds is a *separate* multiplier layer plus new weapons.

## TL;DR

- **Base damage / scaling / AR formula: identical to vanilla.** No soft-cap or CalcCorrectGraph
  changes. A weapon's AR at a given build+upgrade is the same number in both.
- The DLC adds two **region-locked multiplier systems** (Land of Shadow only): **Scadutree Blessing**
  (your damage & negation) and **Revered Spirit Ash** (summons only).
- 8 new weapon **types**, each with normal vanilla-style scaling — they just go in the DLC dataset.

## 1. Scadutree Blessing **[CONFIRMED system, per-level MODELED]**

A separate **final-damage multiplier** that applies **only inside the Realm of Shadow**. Leveled with
Scadutree Fragments at Sites of Grace. Levels **0–20**, soft cap at **12**.

Per-interval weapon-damage increase (Game8, patch 1.12.2):

| Interval | Dmg increase |
|----------|:------------:|
| 0 → 1    | 10.03%       |
| 1 → 2    | 9.12%        |
| 2 → 5    | ~4.04%/lvl   |
| 5 → 6    | 5.47%        |
| 6 → 7    | 5.31%        |
| 7 → 10   | ~3.22%/lvl   |
| 10 → 11  | 6.08%        |
| 11 → 12  | 5.73%        |
| 12 → 20  | ~1.29%/lvl   |

Compounded, these reach roughly **~2.05× damage at level 20** (≈ doubles). Big jumps at 0–2, 5–7,
10–12; heavy diminishing returns after 12. Damage **negation** follows a similar curve (~4.7%/level
early). Exact per-level values for 13–20 are graph-only on the source, so those are modeled.

### How the engine treats it
- **Separate, optional layer.** `computeAR()` returns the vanilla AR. A DLC helper
  `applyScadutree(damage, blessingLevel)` multiplies the *final* damage — never the AR, never the
  scaling. Off by default. UI can expose a Scadutree level input flagged "DLC / Land of Shadow only."

## 2. Revered Spirit Ash **[CONFIRMED]**

Same idea but for **summons** (Spirit Ashes + Torrent). Levels **0–10**, Land of Shadow only. Boosts
summon damage/defense. **Not part of weapon AR** — out of scope for the calculator's core, noted for
completeness. Won't be modeled unless we add a summon module later.

## 3. New weapon types **[CONFIRMED]**

8 types exclusive to the DLC — they use **normal vanilla scaling**, so they just live in the DLC
dataset partition (`data/weapons/dlc/`), never mixed with base-game files:

1. Light Greatswords
2. Great Katanas
3. Reverse-hand Swords (Backhand Blades)
4. Throwing Weapons (Throwing Blades)
5. Perfume Bottles
6. Thrusting Shields
7. Hand-to-Hand Arts (Dryleaf Arts)
8. Beast Claws

## Partitioning rule (enforced)

```
data/weapons/base/…   ← vanilla weapons only
data/weapons/dlc/…    ← DLC weapons only
data/scaling-curves.json      ← shared (unchanged by DLC)
data/scadutree.json           ← DLC multiplier layer, isolated
```

A `source: "base" | "dlc"` tag on every weapon lets the UI filter (e.g. "hide DLC"). Scadutree is
opt-in and clearly labeled so a vanilla build's numbers are never silently inflated.

## Sources

- [Scadutree Blessing Scaling (1.12.2) — Game8](https://game8.co/games/Elden-Ring/archives/459934)
- [About the Scadutree Blessing — Fextralife](https://eldenring.wiki.fextralife.com/About+the+Scadutree+Blessing)
- [Revered Spirit Ash — Fextralife](https://eldenring.wiki.fextralife.com/Revered+Spirit+Ash)
- [All DLC Weapons and New Weapon Types — Game8](https://game8.co/games/Elden-Ring/archives/457048)
