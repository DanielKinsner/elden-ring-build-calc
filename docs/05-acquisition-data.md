# 05 — Weapon acquisition data (for weapon detail pages)

Powers the clickable detail page: **where a weapon drops, the source mob, how to kill it,
nearby Sites of Grace, high-end builds it fits, and its lore.**

Kept **separate** from stats (`data/weapons/…`) so a weapon's combat data and its
"how to get it" data evolve independently.

## Schema

**One file per weapon**, named by its `id` (matches the weapon dataset): `data/acquisition/<id>.json`.
One bare object per file — no outer id-keyed wrapper. This means documenting one weapon is one
file, which is one commit: no shared file for two agents/sessions to collide on.

```jsonc
// data/acquisition/uchigatana.json
{
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
  "lore": "A curved blade favored by the ashen warriors of a distant land — distilled from the
    weapon's in-game description, not pasted verbatim.",
  "builds": [
    { "name": "Bloody Samurai", "why": "Bleed proc + innate bloodloss passive", "statFocus": "DEX / ARC" },
    { "name": "Quality Katana", "why": "Even STR/DEX split via Quality affinity", "statFocus": "STR / DEX" }
  ],
  "_verify": ["nearbyGraces"]                  // list of fields not yet confirmed; [] once locked
}
```

- `source.type`: `boss | enemy | chest | npc | merchant | drop`
- `tactics`: short bullets — how to beat the source mob / reach the drop.
- `nearbyGraces`: up to 3 named Sites of Grace close to the pickup.
- `lore`: 1–3 sentences, **distilled/rewritten in our own words** from the in-game description —
  never bulk-copy wiki prose verbatim (see Sourcing/licensing below).
- `builds`: short list of archetypes this weapon is good in — a first pass can be derived from the
  weapon's own scaling/passive/requirements (already in `data/weapons/`), then curated by hand.
- `_verify`: an **array of field names** that are still unconfirmed (empty array once fully locked).
  Per-field rather than one boolean, so a confirmed `location` isn't held hostage by an
  unconfirmed `nearbyGraces`.

A missing file for a weapon `id` just means "not yet documented" — the detail page renders a
friendly placeholder rather than erroring (see `atlas/weapon.js`).

## Sourcing

- **Lore**: base-game weapons — the community fan API's `description` field (game's own text);
  DLC weapons — the wiki description. Distill to 1–3 sentences, don't paste verbatim.
- **Location / source mob / region**: Fextralife "Where to Find" + wiki.gg "Acquisition" sections,
  cross-checked against each other. Where they disagree, keep the field in `_verify` and note it.
- **Tactics**: wiki kill-tips + the **bundled offline Elden Ring guide skill**
  (`~/.claude/skills/elden-ring/references/`) for boss tactics (base game only).
- **Nearby graces**: the offline guide skill's per-region grace lists (base game) + wiki location
  text (DLC — the offline skill doesn't cover Shadow of the Erdtree). This is the hardest field to
  source automatically; expect it to stay in `_verify` longest.
- **Builds**: derived first-pass from the weapon's own scaling grades/passive/requirements, then
  hand-curated for "actually meta" accuracy.

Licensing note: Fextralife content is proprietary and wiki.gg content is CC BY-SA — **rewrite, don't
copy**. In-game description text (lore) is a FromSoftware game fact surfaced by every source; still
trim/rewrite it for the page rather than pasting a wiki's exact formatting.

## Map images (v2)

`mapPin` is optional and unused until we add region map images. v1 renders **region name +
directions text**; v2 can drop a pin on a real region map. Region map assets go in
`assets/maps/<region>.jpg` and are referenced by the region name.

## Validation

`scripts/validate-acquisition.js` checks referential integrity: every `data/acquisition/<id>.json`
corresponds to a real weapon `id`, `source.type` is one of the enum values, `nearbyGraces` has at
most 3 entries, and `_verify` (if present) only names real schema fields.
