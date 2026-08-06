# Full-build platform architecture

**Date:** 2026-08-05  
**Status:** active implementation  
**Product promise:** one build object, every meaningful Elden Ring outcome.

## Why this is bigger than a calculator

The site is becoming a build laboratory. A player should be able to reproduce an in-game
character once, then understand its offense, defense, casting, status, mobility, active effects,
progression requirements, and alternatives without rebuilding it in separate tools.

The experience should remain calm and legible. Motion communicates causality: changed values
flash softly, bars travel to their new state, equipment slots acknowledge selection, and panels
reveal detail only when it is useful. Motion never delays input and respects reduced-motion.

## Canonical build schema (v5)

```json
{
  "schemaVersion": 5,
  "name": "Vera Aletheia",
  "combatContext": "pve",
  "attackProfile": "jump",
  "classId": null,
  "level": 175,
  "stats": { "VIG": 60, "MND": 20, "END": 30, "STR": 24, "DEX": 58, "INT": 9, "FAI": 15, "ARC": 40 },
  "loadout": {
    "rightHand": [{ "weaponId": "rivers-of-blood", "affinity": "Standard", "upgrade": 10 }, null, null],
    "leftHand": [null, null, null],
    "armor": { "head": null, "body": null, "arms": null, "legs": null },
    "talismans": [],
    "magic": { "catalystId": "astrologers-staff", "upgrade": 25, "memorySlots": 10 },
    "spells": [{ "spellId": "comet", "variantId": "40210" }],
    "physick": [],
    "greatRune": null
  },
  "context": { "twoHanded": true, "scadutree": 0, "enemyId": null, "ngCycle": 0 },
  "activeEffects": []
}
```

Saved v1/v2 builds and old URLs remain valid. The browser migrates missing fields to defaults.

## Calculation domains

1. **Character:** starting class, rune level, attributes, HP, FP, stamina, equip load.
2. **Armaments:** six equipped slots, active hand state, upgrade, affinity, Ash of War,
   requirements, AR, status, guard, poise damage, casting scaling.
3. **Armor:** four slots, total weight, poise, eight multiplicatively combined damage-negation
   values, and four additive resistances.
4. **Talismans and effects:** four slots, conflicts, stat/survival/damage modifiers, stacking
   groups, PvE/PvP variants.
5. **Magic:** memory slots, sorcery/incantation requirements and costs, catalyst-aware spell
   buff and spell damage.
6. **Encounter context:** enemy defenses, absorptions, status thresholds, phase, NG cycle,
   DLC blessing, and a transparent damage pipeline.

## Interface system

- A persistent build summary anchors level, active armament, equip load, roll state, poise,
  and save/share status.
- **Loadout** is the home view: character on the left, equipment in the center, outcomes on
  the right. Damage, Defense, Magic, and Effects become focused analysis views fed by the same
  state—not separate calculators.
- Equipment slots are tactile objects with an icon/monogram, name, weight/cost, and a clear
  empty state. Selection uses a fast searchable sheet rather than enormous native selects.
- Gold indicates active or improved state; green means requirements or targets are met; red is
  reserved for a real failure. Decorative gold never impersonates success.
- Original generated art is reserved for atmospheric hero fields, archetype plates, and Tales
  covers. Exact equipment uses traceable game/community iconography, never synthetic replicas.

## Data and provenance policy

The canonical source is extracted game parameters. Human-maintained tables are useful for
cross-checks and acquisition prose, not silent truth. Every dataset records game version, source
URL, source revision where possible, transformation method, and last verification date.

Current research anchors:

- ERDB parser/schema: <https://github.com/EldenRingDatabase/erdb>
- Paramdex param definitions: <https://github.com/soulsmods/Paramdex>
- WitchyBND extraction tooling: <https://github.com/ividyon/WitchyBND>
- Regulation archive: <https://www.nexusmods.com/eldenring/mods/4262>
- Armor corpus/optimizer: <https://github.com/jerpdoesgames/EldenRingArmorOptimizer>
- Tarnished feature benchmark: <https://www.tarnished.dev/>
- Emilia inventory planner: <https://er-inventory.nyasu.business/>
- Erdtree Forge benchmark: <https://erdtreeforge.com/>
- Damage optimizer lineage: <https://github.com/hanslhansl/elden-ring-damage-optimizer>
- Curated tool/data index: <https://github.com/sovietspaceship/awesome-elden-ring>
- Current patch archive: <https://eldenring.wiki.gg/wiki/Patch_Notes>

## Delivery sequence

1. Canonical v2 state + armor/defense vertical slice.
2. Six armament slots + active-hand damage analysis + Ash compatibility.
3. True talisman slots/weights/conflicts + physick + Great Rune.
4. Catalysts, memory slots, spells, and spell damage.
5. Enemy/context pipeline + PvE/PvP + NG cycle.
6. Build optimizer, comparisons, archetypes, community publishing/import, and progression links.

Each slice ships with provenance, engine tests, responsive checks, keyboard support, and old-save
migration. Breadth without trusted math does not count as completion.

## Implementation status

- **Shipped:** canonical v3 state, four armor slots, defense aggregation, armor-aware roll state.
- **Shipped:** six armament slots, active-slot switching, independent affinity/reinforcement,
  all-armament equip weight, compact sharing, and legacy migration.
- **Shipped:** four true talisman slots, the full 154-item base+DLC inventory, exact icons,
  equip weight, param-derived conflicts, conditional assumption state, positional sharing,
  transparent effect coverage, and incoming-damage modifier ordering. One hundred talisman
  models currently affect live calculations: 62 derive from direct ERDB SpEffectParam fields.
  The 1.16.1 attack lens raises total live coverage to 100 with move-aware PvE/PvP multipliers,
  two-handed state, and type-specific exceptions. All other items are explicitly inventory-only
  rather than receiving inferred math.
- **Shipped:** catalyst and spell core: 33 casting tools, all 213 base+DLC spells and 463 unique
  output variants, exact CalcCorrectGraph scaling, reinforcement, requirements, category bonuses,
  memory slots, FP/stamina costs, typed pre-defense output, responsive selection, persistence,
  sharing, and v4 migration. The output boundary is explicit: enemy defense/negation and advanced
  multi-hit/utility behaviors are not silently estimated.
- **Shipped:** PvE encounter core with 3,341 enemy/phase/location profiles, 238 boss profiles,
  base+DLC coverage, all eight journeys from NG through NG+7, exact HP, typed defense and negation,
  status thresholds/immunities, ratio-based defense math, split-damage flooring, target-specific
  final spell damage, and weapon status hits-to-proc. Encounter state persists and shares with builds.
- **Next:** exact weapon attack motion values and physical attack-type selection, player/PvP targets,
  then remaining talisman/spell outputs that depend on guard, poise, flask, loot, and encounter domains.
