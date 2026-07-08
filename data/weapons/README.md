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

`scaling` stores the **numeric scaling value** (not the letter) — Fextralife shows both, e.g.
"Dex C (82)". The engine derives the display letter via the grade thresholds. Storing the number
matters: a "D" spans 25–59.

## Source & honesty

Weapon stats are **game facts** (FromSoftware's `EquipParamWeapon`), the same numbers on the wiki.
Primary source: **Fextralife** individual weapon pages (they list base damage, numeric scaling
values, status, and requirements at each upgrade level). Cross-checked against
[eldenring.tclark.io](https://eldenring.tclark.io/) where values look off.

We transcribe **facts into our own schema** — we don't copy anyone's dataset file or code. Any
value that couldn't be cleanly verified is flagged `"_verify": true` on that weapon until confirmed,
rather than shipped as if certain.
