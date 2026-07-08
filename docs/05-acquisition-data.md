# 05 — Weapon acquisition data (for "suggested weapons" detail pages)

Powers the clickable detail page: **where a weapon drops, the map region, the source
mob, how to kill it, and nearby Sites of Grace.**

Kept **separate** from stats (`data/acquisition/…`) so a weapon's combat data and its
"how to get it" data evolve independently.

## Schema

Keyed by weapon `id` (matches the weapon dataset):

```jsonc
{
  "uchigatana": {
    "location": "Deathtouched Catacombs — chest at the end (also the Samurai starting weapon)",
    "region": "Limgrave",
    "mapPin": { "x": 0.42, "y": 0.55 },        // optional: % coords on the region map
    "source": { "type": "chest", "name": "Deathtouched Catacombs" },
    "tactics": [
      "Catacombs has no boss for the chest — sprint past the imps",
      "Watch the guillotine traps in the final hall"
    ],
    "nearbyGraces": [
      "Stormhill Shack",
      "Saintsbridge",
      "Summonwater Village Outskirts"
    ],
    "_verify": true                              // until location/graces confirmed
  }
}
```

- `source.type`: `boss | enemy | chest | npc | merchant | drop`
- `tactics`: short bullets — how to beat the source mob / reach the drop.
- `nearbyGraces`: up to 3 named Sites of Grace close to the pickup.

## Sourcing

Primary source: the **bundled offline Elden Ring guide skill**
(`~/.claude/skills/elden-ring/references/`) — it has per-region routes, boss tactics,
key-item locations, and grace data. Cross-checked against Fextralife weapon "Where to find"
sections. Anything unconfirmed carries `"_verify": true` until locked.

## Map images (v2)

`mapPin` is optional and unused until we add region map images. v1 renders **region name +
directions text**; v2 can drop a pin on a real region map. Region map assets go in
`assets/maps/<region>.jpg` and are referenced by the region name.
