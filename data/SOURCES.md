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

## Talismans (`talismans.json`)

- Game version target: 1.16; schema version 2.
- Catalog: 154 talismans (115 base game, 39 Shadow of the Erdtree).
- Base-game row IDs, weights, effect IDs, icon IDs, and incompatibility groups come from
  ERDB's `EquipParamAccessory.csv` export for game 1.10 at revision `e2028a6`.
- Sixty-two base-game calculation models are derived only from a reviewed allowlist of direct
  `SpEffectParam.csv` fields at the same revision: max-resource/load multipliers, separate
  enemy/player damage correction rates, resistance points, HP/stamina regeneration, memory
  slots, and virtual casting Dexterity. Event-specific rows carry explicit condition switches.
- Current names, DLC membership, display effects, DLC weights, item-page links, and 120px exact
  item icons come from <https://eldenring.wiki.gg/wiki/Talismans> (CC BY-SA 4.0).
- The Fine Crucible Feather Talisman's wiki.gg infobox has blank weight/effect fields. Its 0.6
  weight and display effect are explicitly cross-checked against
  <https://eldenring.wiki.fextralife.com/Fine+Crucible+Feather+Talisman>; the generated row
  carries a `sourceOverride` object so the exception cannot become invisible provenance debt.
- Transformation: `scripts/import-talismans.js`. It is deterministic except for `generatedAt`
  and accepts both underscore/space plus single-line/multiline wiki infobox variants. It
  deliberately refuses to infer numeric formulas from prose.
- Hand-reviewed attack/stat calculation fields are merged from `data/buffs.json`; param-derived
  survival/defense fields win when both sources cover the same effect. `modelStatus: inventory` means
  the item is fully selectable, weighted, conflict-checked, saved, and shared, but its gameplay
  effect is not yet allowed into calculations.
- Verification: full counts, unique IDs/icons, positive weights, concrete display effects,
  positional state, conditional gates, param-derived conflicts, PvE/PvP defense variants,
  resistance/utility aggregation, and defense ordering are pinned in tests.
