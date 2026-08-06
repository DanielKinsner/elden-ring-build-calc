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

## Attack profiles (`attack-profiles.json`)

- Game version: 1.16.1; schema version 1.
- Move families and talisman multipliers are transcribed from the public
  [Elden Ring Miscellaneous Data spreadsheet](https://docs.google.com/spreadsheets/d/14FEyr8Nf4e3qjiLltlSsD8cnVU6pgZ8jZbADkR68rdg/edit),
  sheet `Effects - Talismans`, downloaded and checked on 2026-08-05.
- `scripts/extract-xlsx-sheet.js` is a dependency-free OOXML worksheet reader used to audit the
  public workbook locally; it does not become a runtime dependency.
- Rules record required/excluded move tags, optional equipment state, separate PvE/PvP profiles,
  and damage-type overrides. The UI calls this an **Attack Lens** because it applies matched
  equipment multipliers to AR; it does not mislabel that intermediate value as final hit damage
  before motion values and enemy defense are implemented.
- Verification pins profile/tag integrity, numeric context profiles, type-specific override order,
  move matching, share/local-save restoration, desktop interaction, and 390px overflow.

## Catalysts and spells (`catalysts.json`, `spells.json`)

- Game version target: App 1.16 / Calibration 1.16; schema version 1.
- Upstream: [CryptidTracker's Elden Ring Build Planner v1.19.1](https://docs.google.com/spreadsheets/d/19Op36P7gdVMkPzFQX6OsjZcfyUjdGOj7Cjk9qFAVj-U/edit),
  retrieved 2026-08-05. The planner states that its data does not require an update for 1.16 and
  includes Shadow of the Erdtree catalysts and spells.
- Transformation: `node scripts/import-magic.js /path/to/build-planner.xlsx`. The importer reads
  `OptimalCatalystCalcData`, `MagicData`, `MagicApData`, `WeaponData`,
  `AttackElementCorrectParam`, `CalcCorrectGraphEz`, and `ReinforceParamWeapon` directly from OOXML.
- Catalog: 33 casting tools (including six DLC tools), 213 spells (84 sorceries and 129
  incantations), and 463 deduplicated output variants.
- Catalyst formulas preserve the source's enabled-stat gates, per-stat maximum coefficients,
  curve IDs, requirements, exact reinforcement rates, category bonus, and FP multiplier. Spell
  variants preserve typed motion values, healing motion, focused-stat/no-scale rules, charged state,
  FP/stamina costs, and status metadata.
- Verification: the importer independently recomputes every source default Spell Buff and rejects
  any mismatch over 0.001. Engine tests pin catalog counts, every catalyst audit value, upgrade
  scaling, requirements, school compatibility, Comet output, and catalyst FP/category modifiers.
  Browser tests pin selection, 80-INT Spell Buff, Comet output, memory use, URL persistence, reload,
  desktop/mobile layout, and console errors.
- Current boundary: damage/healing is param-derived **pre-defense** output. Enemy defense and
  negation, multi-projectile sequencing, situational world effects, and utility-only spell behavior
  require the encounter pipeline and remain explicitly unmodeled.

## Enemy profiles (`enemies.json`)

- Game version target: App 1.16 / Calibration 1.16; schema version 1.
- Upstream: [Elden Ring PvE Enemy Health / Defense Data](https://docs.google.com/spreadsheets/d/1BVwmKqB8pvuyJkSTGYOM2kAJxFMQ0jVsc6aKYz_Upes/edit),
  retrieved 2026-08-05. The workbook is a regulation-derived public reference used by the current
  community calculation lineage.
- Transformation: `node scripts/import-enemies.js /path/to/pve-defense.xlsx`. It joins the eight
  `NG` through `NG+7` sheets by location, name, and source ID, strips presentation-only fields,
  normalizes immunities to `null`, and emits stable hashed IDs.
- Catalog: 3,341 enemy/location/phase profiles, including 238 boss-tagged profiles and 1,015 DLC
  profiles. Each profile carries eight exact journey rows for HP, typed defense, and seven status
  thresholds plus invariant typed negation, incoming status multipliers, and poise metadata.
- Final damage uses the community-verified Elden Ring ratio curve on each damage type independently,
  then applies that type's percent negation and floors the result. Split damage is never run through
  one combined defense value. Standard weapon moves, ranged projectiles, and spells each carry their
  selected exact motion data into this pipeline.
- Verification pins full counts, unique IDs, complete journeys, Malenia's NG/NG+7 rows, all four
  defense-curve boundaries, final Comet damage, status thresholds, hits-to-proc, URL persistence,
  reload, desktop/mobile layout, and console errors.

## Standard weapon moves (`weapon-moves.json`)

- Game version: App 1.16.1; schema version 1.
- Upstream: [ER – Motion Values and Attack Data](https://docs.google.com/spreadsheets/d/1j4bpTbsnp5Xsgw9TP2xv6d8R4qk0ErpE9r_5LGIDraU/edit),
  retrieved 2026-08-06. The workbook exposes regulation-derived attack behavior data and is also
  linked by the CryptidTracker damage calculator.
- Transformation: `node scripts/import-weapon-moves.js /path/to/motion-values.xlsx`. The importer
  joins `Motion Values`, `Status MVs`, and `Physical AtkAttribute` by normalized weapon name, then
  maps all 448 site weapons by stable weapon ID.
- Coverage: all 448 weapons have an explicit record; 419 ordinary-melee/shield/catalyst records
  contain 24,271 selectable standard attacks. Twenty-nine bow/crossbow/greatbow records remain empty
  by design because ranged damage belongs to the workbook's separate ammo/bullet sheets.
- Multi-hit strings remain ordered arrays rather than summed values. Each hit carries its own damage
  motion value and physical attack attribute through defense; status buildup uses the move's separate
  status-motion sequence. Conditional parenthetical notes remain attached to the move.
- Verification pins complete weapon mapping, move count, Rivers of Blood's jumping-heavy damage,
  status and slash attribute, Bloodhound's Fang multi-hit preservation, exact final damage against
  Malenia, move-to-talisman-lens synchronization, URL persistence, reload, mobile layout, and browser errors.

## Ammunition and standard ranged projectiles (`ammo.json`)

- Game version: App 1.16.1; schema version 1.
- Upstream: the `AmmoData` and `Ammo Attack Data` sheets in
  [ER – Motion Values and Attack Data](https://docs.google.com/spreadsheets/d/1j4bpTbsnp5Xsgw9TP2xv6d8R4qk0ErpE9r_5LGIDraU/edit),
  retrieved 2026-08-06.
- Transformation: `node scripts/import-ammo.js /path/to/motion-values.xlsx`. The importer preserves
  typed ammo base attack, physical attribute, stamina/poise values, status type, buildup, effect text,
  and each projectile's typed damage and status motion values.
- Coverage: all 65 ammunition items — 32 arrows, eight great arrows, 20 bolts, and five greatbolts —
  with exact compatibility for bows, light bows, greatbows, crossbows, and ballistae. Spread Crossbow
  uses its three separate projectile rows; each bolt passes through defense independently and applies
  its own 80% status motion. Pulley Crossbow reports a parameter-exact per-bolt value until burst-event
  sequencing is represented explicitly.
- Verification pins full counts, exact compatibility filters, Longbow + Arrow typed combination,
  Spread Crossbow per-projectile damage, status motion, enemy hits-to-proc, URL persistence, reload,
  390px layout, and browser errors.
