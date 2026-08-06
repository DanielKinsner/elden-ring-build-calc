# Data provenance

Machine-readable datasets should identify their game version and upstream revision in the file.
This index records transformation and verification notes that do not belong in runtime payloads.

## Armor (`armor.json`)

- Game version: 1.16
- Upstream factual corpus: <https://github.com/jerpdoesgames/EldenRingArmorOptimizer>
- Upstream revision: `2ad5e0ee88209855531a8b3ec4bf5d68bb1b0105`
- Transformation: `scripts/import-armor.js`
- Imported fields: name, game item ID, set ID, slot, weight, poise, eight negations, four
  resistances. No optimizer implementation or UI code is copied.
- Verification: piece counts and one four-piece aggregate are pinned in `tests/engine.test.js`.
- Next provenance upgrade: reproduce the corpus directly from regulation 1.16.1 with WitchyBND
  and Paramdex, then diff every record against this snapshot.
