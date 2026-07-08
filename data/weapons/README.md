# Weapon dataset

Structured weapon data the engine consumes. **All values stored at MAX upgrade** (+25 regular /
+10 somber), Standard affinity unless a variant is specified.

## Partitioning

```
base/   vanilla weapons only
dlc/    Shadow of the Erdtree weapons only  (source: "dlc")
```

Files are grouped by weapon type (`katanas.json`, `straight-swords.json`, …). Each file is a JSON
array of weapon objects.

## Schema

```jsonc
{
  "id": "uchigatana",              // slug, unique
  "name": "Uchigatana",
  "type": "Katana",
  "source": "base",                // "base" | "dlc"
  "category": "regular",           // "regular" (+25) | "somber" (+10)
  "infusable": true,               // can take Ashes of War / affinities
  "requirements": { "STR": 11, "DEX": 15 },
  "weight": 5.5,
  "passive": "Blood loss (45)",    // human-readable
  "base":    { "physical": 281, "magic": 0, "fire": 0, "lightning": 0, "holy": 0 },
  "scaling": { "STR": 54, "DEX": 82, "INT": 0, "FAI": 0, "ARC": 0 },  // numeric scaling VALUES at max
  "status":  { "bleed": 45, "frost": 0, "poison": 0, "rot": 0, "sleep": 0, "madness": 0 },
  "arcStatusScaling": 0            // >0 if ARC boosts this weapon's bleed/poison buildup
}
```

`scaling` stores the **numeric scaling value** (not the letter). The engine derives the display
letter via the grade thresholds. Storing the number matters: a "D" spans 25–59.

`elementScaling` (optional) maps each stat to the damage types it scales — e.g. Rivers of Blood's
`ARC` scales `["physical","fire"]` but `DEX` scales only `["physical"]`. When present, the engine
only applies a stat's scaling to its listed types (correct for split-damage weapons). Omitted for
single-damage-type weapons, where it's unnecessary (the engine defaults to the weapon's one type).

## Source

Weapon stats are **game facts** — FromSoftware's `EquipParamWeapon` base damage, `attributeScaling`
coefficients, `ReinforceParamWeapon` upgrade multipliers, `AttackElementCorrectParam` (which stat
scales which type), and status `SpEffectParams`. These are computed to **max upgrade**
(base ×2.45, scaling × the reinforce multiplier) directly from the datamined game regulation, the
same underlying data the wikis display. Weights merged from the community ER API. This is our own
schema derived from the game's own numbers — validated against Fextralife (Uchigatana +25 = 281
physical, Dex C(82); Rivers of Blood +10 = 186/186 phys/fire).
