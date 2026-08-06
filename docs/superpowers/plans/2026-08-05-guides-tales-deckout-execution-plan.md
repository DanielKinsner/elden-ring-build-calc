# Guides + Tales Deck-Out — Execution Plan (for Sonnet)

**What this is:** a decision-complete plan to take the Guides and Tales sections from their
2026-08-05 dashboard layout (commits `71c8f00`, `b88b88d`) to the fully "decked out" version:
NPC/boss portraits (scraped), a guides-wide search, a region-progress right rail, a Tales
timeline, a lean compendium, and a recent-activity/reading-tools rail. Planned 2026-08-05 in a
live session with Dan; all owner decisions below are already made.

**Drift rule:** if this plan contradicts current code or data reality, verify reality, follow
reality, and note the discrepancy in your deviation log — do **not** improvise a new decision.

**Executor:** a competent model (Sonnet) working in this repo on `main`. Dan runs Codex in
parallel sometimes: `git pull --ff-only` before every commit.

---

## Decisions locked (D-table)

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | Portraits are scraped from **eldenring.wiki.gg** via the MediaWiki API (same source + CC BY-SA 4.0 license as the existing weapon icons). | New dirs `assets/icons/npcs/`, `assets/icons/bosses/`; footer attribution extended. |
| D2 | **Reminders are CUT.** The mockup's "Set Reminder" is not built in any form. | Parking lot. Do not add notification code. |
| D3 | **Compendium: lean.** ~45 short entries (2–3 sentences each): every quest NPC, every boss in `bosses.json`, ~12 places. Auto-linked to quest tracker, boss cards, and tale chapters. Spoiler-light (route facts ok; story twists behind the existing `⚠` pattern). | New guides tab "Compendium" + `data/compendium.json`. Taste-gated at Checkpoint 3. |
| D4 | **Timeline: Sonnet drafts, Dan approves.** ~20 in-world era events sourced from **Dan's own Gold and Shadow chapters** (each event links to its chapter). Wording is drafted by the executor but does NOT ship until Dan reads it. | `data/timeline.json` + a Timeline view in Tales. Push is gated at Checkpoint 2. |
| D5 | No invented features beyond this plan: no search-server, no accounts, no "NPCs you've met" beyond the derivable stat (questline started = met). | Everything runs client-side on the static site. |
| D6 | Tale-card **cover art is owner-supplied later**. Code renders `assets/tales/<workId>.jpg` if present, silently skips if absent. Do not generate or scrape art. | Owner lane item; executor only adds the conditional `<img>`. |
| D7 | Region progress derives from a new per-quest `region` field (primary region), assigned by deterministic rule R1 below. No per-step regions (109 hand-edits not worth it). | One field added per quest in `data/quests.json`; step ids and existing shape untouched. |
| D8 | All new UI follows the existing patterns: ES5-style vanilla JS, string-built HTML, `assets/app.css` for styles, hash-routed tabs, localStorage stores are **additive only** (never rename or restructure existing keys `er-guides`, `er-tales`, `er-build`, `er-my-builds`). | Old saves keep working, share links keep working. |

**Rule R1 (region assignment):** take the FIRST location token of the quest's existing
`cluster` string, map it to a canonical region via this table, and store it as `region`:

Canonical regions (use exactly these strings): `Limgrave`, `Weeping Peninsula`, `Liurnia`,
`Caelid`, `Altus Plateau`, `Mt. Gelmir / Volcano Manor`, `Leyndell`, `Mountaintops`,
`Consecrated Snowfield`, `Haligtree`, `Underground` (Siofra/Nokron/Deeproot/Ainsel),
`Roundtable Hold`, `Land of Shadow` (DLC). Mapping examples: "LIMGRAVE" → Limgrave;
"THREE SISTERS" / "CARIA" → Liurnia; "STORMVEIL" → Limgrave; "VOLCANO MANOR" → Mt. Gelmir /
Volcano Manor; "ROUNDTABLE HOLD" → Roundtable Hold; "NOKRON" / "DEEPROOT" / "SIOFRA" →
Underground. If a token is ambiguous, use the region where the quest **starts** per its step 1
text. Record any judgment calls in the deviation log.

---

## Lanes

**Owner lane (Dan; date-gated):**
- O1. Grade portrait quality at Checkpoint 1 (are the scraped images good enough to keep?).
- O2. Approve timeline wording at Checkpoint 2 (his book, his voice).
- O3. Skim compendium tone/spoiler level at Checkpoint 3.
- O4. (whenever) Supply tale cover art as `assets/tales/gold-and-shadow.jpg`, `assets/tales/kindling.jpg`.

**Executor lane:** everything else. Slices S5 and S6 END at their checkpoints (commit locally,
do not push) — all other slices commit AND push.

---

## Current state (verified 2026-08-05 — re-verify with `git log --oneline -5`)

- `guides/guides.js` (~300 lines): hash-routed tabs (`quests|walkthrough|bosses|endings`), a
  `hero(title, sub, pct, stats)` + `ring(pct)` helper, two-column quest tracker (`.qt-layout`,
  `.qt-item` list buttons, `#qtDetail` pane, `#qtFilter` input, `questFilter` JS var), store
  `er-guides = { steps:{}, open:{}, bosses:{}, sel }`.
- `tales/tales.js`: shelf with hero + per-book ring/meta (own local `ring()` helper), reader on
  `read.html`, store `er-tales = { <workId>: { chapter, read:{} } }`, minimal-markdown renderer.
- `data/quests.json`: `{ generalRules:[], quests:[{ id, name, major?, cluster, tagline, reward,
  endingUnlock?, warnings:[], steps:[{id, text}] }] }` — 21 quests, 109 steps.
- `data/bosses.json`: `{ universalTips:[], bosses:[{ id, name, required?, dlc?, location,
  greatRune?, weak, resists, immune, bring, tips }] }` — 21 bosses.
- `data/tales.json`: `{ works:[{ id, title, subtitle, words, blurb, spoilers, dir,
  chapters:[{id, num, title, tease, file}] }] }` — 2 works, 18 chapters.
- Tests: `node tests/engine.test.js` (52 pins) — must stay green after every slice; it does not
  cover guides/tales JS, so browser verification below is the real gate for UI slices.
- Dev server: `.claude/launch.json` → `python -m http.server 8420` (or `preview_start`
  name `static-server` if browser tools are available).

**Verification floor, not ceiling:** each slice lists its checks; if your diff grows beyond the
predicted footprint, grow the checks with it (e.g. touching `data/*.json` ⇒ JSON.parse-loop
every touched file; touching anything the calculator loads ⇒ run the calculator page once).

---

## Slices

### S1 — Portrait scraper (`scripts/fetch-portraits.js`)

**Goal:** one PNG per questline NPC and per boss, from wiki.gg, sized for 80px display.

1. Create `scripts/fetch-portraits.js` (plain Node, no deps — use `https.get`; follow one
   redirect). CLI: `node scripts/fetch-portraits.js [--only npcs|bosses]`.
2. Inside the script, hard-code two maps (id → wiki page title). Build them like this:
   - NPCs: for each quest in `data/quests.json`, the page title is the NPC's name as wiki.gg
     titles it — usually the quest name minus epithets, e.g. `ranni` → `Ranni_the_Witch`? **No
     — verify each**: query `https://eldenring.wiki.gg/api.php?action=query&titles=<guess>&redirects=1&format=json`
     and accept when the API resolves a page. Try, in order: full quest name, first word(s)
     before the comma, name without parenthetical. Log any that fail all three; leave them out
     of the map and note them in the deviation log.
   - Bosses: same with each boss `name` from `data/bosses.json` (strip anything after " ("),
     e.g. `Starscourge Radahn`.
3. For each resolved page, fetch
   `api.php?action=query&titles=<title>&prop=pageimages&format=json&pithumbsize=160`
   → `thumbnail.source` → download to `assets/icons/npcs/<questId>.png` or
   `assets/icons/bosses/<bossId>.png`. Skip files that already exist (idempotent). 250ms delay
   between requests; set a User-Agent header naming the repo URL.
4. If the API or images are blocked (403/429 persisting after one retry with 2s backoff): stop
   the script cleanly, report which ids were fetched vs blocked. **Intent of the fallback:** the
   UI (S2) letter-falls-back per image, so partial coverage ships fine — do not stall the whole
   plan on a few missing portraits.
5. Run it. Report a table: fetched / already-had / unresolved.

**Verify:** every downloaded file is a valid image > 1KB (check first bytes are PNG/JPEG magic;
the API may serve .jpg — keep the real extension and record it in the manifest below). Write
`assets/icons/npcs/manifest.json` `{ "<id>": "<filename>" }` (and same for bosses) so the UI
never guesses extensions.
**Commit (and push):** `feat(assets): NPC + boss portraits scraped from wiki.gg (CC BY-SA 4.0) + fetch script`

### S2 — Wire portraits into the UI

1. `guides/guides.js`: in the quest list items (`.qt-item`) and the detail head, render
   `<img class="qt-avatar" src="../assets/icons/npcs/<file>" alt="">` using the manifest
   (fetch it once alongside `loadGuides`); if the id is missing from the manifest, render the
   existing letter-in-a-box style instead (`<span class="qt-avatar qt-avatar-letter">R</span>`).
   Same for boss cards (`.boss-head` gains a 44px thumb).
2. CSS in `assets/app.css`: `.qt-avatar { width:40px; height:40px; border-radius:8px;
   object-fit:cover; border:1px solid var(--line-2); }` — letter variant uses `display:grid;
   place-items:center; background:var(--panel-2); color:var(--gold-dim); font-family:var(--serif)`.
   Detail-pane avatar 56px. Boss thumb 44px.
3. Extend both guides + tales footers' attribution line: portraits/images via eldenring.wiki.gg,
   CC BY-SA 4.0 (the weapon-icon line already exists — extend it, don't duplicate).

**Verify:** guides page in browser — avatars render in list, detail, boss cards; kill one file
locally and confirm the letter fallback appears; 375px width no horizontal overflow;
`node tests/engine.test.js` green.
**Commit (and push):** `feat(guides): NPC portraits in quest list/detail + boss card thumbs (letter fallback)`

### ⛔ CHECKPOINT 1 (after S2) — stop and report
Post: portrait coverage table, screenshots or a URL list of spot-check pages, deviation log so
far. Dan grades portrait quality (O1). **Do not start S3 until he answers.** If he rejects some
portraits, delete those files (fallback covers them) and continue.

### S3 — Region field + right rail (guides, ≥1280px)

1. `data/quests.json`: add `"region": "<canonical>"` to each of the 21 quests per rule R1.
   Nothing else in the file changes. JSON.parse-loop verify.
2. `guides/guides.js` quest tab: on viewports ≥1280px add a third column (`.qt-rail`, ~230px):
   - **Progress by region:** for each canonical region present, steps-done/steps-total across
     its quests, with the existing `.quest-progress` bar. Sort by total desc.
   - **Active questlines:** quests with 0 < done < total, name + n/N, click = select (same
     handler as list items).
   - **Legend:** MAJOR badge, ✓ complete, ⚠ fail-trigger — three static rows.
   - Hero stat strip gains `['NPCs met', started + completed + ' / ' + QUESTS.quests.length]`
     (a questline with ≥1 step done = met; derivable, honest).
3. CSS: `.qt-layout` becomes `minmax(280px,340px) minmax(0,1fr)` with a
   `@media (min-width:1280px) { grid-template-columns: minmax(280px,320px) minmax(0,1fr) 230px; }`
   and `.qt-rail { display:none }` below 1280px.

**Verify:** at 1440px three columns + rail contents correct against hand-computed numbers for
at least 2 regions; at 1000px rail hidden, two columns; at 375px stacked; region field parses;
tests green.
**Commit (and push):** `feat(guides): region progress + active questlines + legend rail (wide screens); quests carry a primary region`

### S4 — Guides search (Ctrl+K / `/`)

1. A search input in the guides tab bar row (right-aligned, placeholder "Search guides… /").
   Focus shortcuts: `/` and `Ctrl+K` (ignore when typing in an input).
2. Build the index client-side at load (no libs): entries
   `{ label, sub, tab, questId?|bossKind?|endingId?|stepText }` covering: quest names, every
   quest step text, boss names, ending names, walkthrough step texts. Simple case-insensitive
   substring match, max 12 results, grouped headers (Quests / Steps / Bosses / Endings / Route).
3. Result click: `setTab(tab, questId?)` — for steps, select the owning quest and scroll the
   detail pane; for bosses/endings, switch tab and `scrollIntoView` the card (give boss cards
   `id="boss-<id>"`, endings `id="ending-<id>"`). Dropdown closes on Esc / click-away.
4. Keyboard: ↑/↓ move highlight, Enter opens. ARIA: `role="listbox"`/`option`.

**Verify:** search "ranni" → quest + steps hits; "malenia" → boss hit lands on the card;
"frenzied" → ending hit; Esc closes; `/` focuses; mobile (375px) input stays usable (it may
wrap under the tabs); tests green.
**Commit (and push):** `feat(guides): instant search across quests/steps/bosses/endings/route (Ctrl+K, /)`

### S5 — Tales timeline (draft ⇒ Dan approves ⇒ push)

1. `data/timeline.json`: `{ "_readme": "<source note>", "eras": [{ "id", "name", "blurb" }],
   "events": [{ "id", "era", "title", "text", "chapter": "<chapterId>", "workId": "gold-and-shadow" }] }`.
   Draft ~20 events by READING Dan's chapters in `tales/content/gold-and-shadow/` (they are the
   canon for this feature — not the wiki). Eras follow the book's own arc (roughly: The World
   Before Gold → The Golden Age → The Shattering → The Interregnum → The Tarnished → The Land
   of Shadow — derive the real set from the chapter titles). Each event ≤ 40 words, in the
   book's register, zero new lore claims — every sentence must be traceable to a chapter.
2. UI: a third view in Tales. Add a small nav row on the shelf (`Tales · Timeline`) —
   hash-routed like guides (`#timeline` on `tales/index.html`; no new HTML file). Vertical
   spine (CSS: a left border with dot markers), era headers, event cards with a
   "Read: <chapter num & title> →" link to `read.html?work=...&ch=...`. Chapters the reader has
   finished get the `read` styling (green tick) via `er-tales`.
3. Spoiler gate: the timeline view opens with the same `⚠ Full spoilers` line as the shelf.

**Verify:** every `chapter` id in timeline.json exists in `data/tales.json`; every event's era
exists; links navigate; no overflow at 375px; tests green.
**Commit LOCALLY — DO NOT PUSH.**

### ⛔ CHECKPOINT 2 (after S5) — stop and report
Tell Dan the timeline is readable at `http://localhost:8420/tales/#timeline` (or paste the
events as text if he's remote). He approves/edits wording (O2). Push only after approval —
if he edits, amend content, re-verify, then push:
`feat(tales): in-world timeline drawn from Gold and Shadow, chapter-linked (Dan-approved)`

### S6 — Compendium (lean) (draft ⇒ Dan skims ⇒ push)

1. `data/compendium.json`: `{ "entries": [{ "id", "name", "type": "npc"|"boss"|"place",
   "text": "<2-3 sentences>", "questId"?, "bossId"?, "region"?, "chapters": ["<chapterId>", …] }] }`.
   Coverage: all 21 quest NPCs, all 21 bosses, ~12 places (the canonical regions from R1 make a
   fine backbone). Text: role + where found + why they matter to a player — **route facts, not
   story twists**; anything twist-adjacent phrased like the endings tab does ("their quest
   decides an ending") without naming the twist. Draft NPC/place text from wiki.gg facts
   (reworded, CC BY-SA courtesy), boss text can compress the existing `bosses.json` fields.
   `chapters`: grep `tales/content/` for each entry's name; list chapters that mention it
   (cap 4, first-mentions preferred).
2. UI: fifth guides tab "Compendium". Filter chips (All / NPCs / Bosses / Places) + the S4
   search index gains compendium entries. Cards: portrait (S1 manifests; letter fallback),
   name, type badge, text, link row → "Track questline" / "Boss card" / "In the Tales: Ch. N"
   (links use the S4 anchor ids and the reader URLs).
3. Hero for the tab: `['Entries', n]`, `['NPCs', n]`, `['Bosses', n]`, `['Places', n]`, no ring.

**Verify:** every questId/bossId/chapter reference resolves against its source file (write a
10-line node check inline, run it, keep it in `scripts/check-refs.js` for reuse); tab renders;
links land; 375px clean; tests green.
**Commit LOCALLY — DO NOT PUSH.**

### ⛔ CHECKPOINT 3 (after S6) — stop and report
Dan skims tone + spoiler level (O3). Then push:
`feat(guides): lean compendium — every NPC/boss + key places, cross-linked to tracker, boss cards, and the Tales`

### S7 — Tales reading tools + recent activity

1. `er-tales` store: when a chapter is marked read in the reader, also store `ts: Date.now()`
   per chapter (`st.read[c.id] = 1` becomes `{ t: Date.now() }` — **migration:** treat existing
   value `1` as "read, unknown time"; never rewrite old entries; all read-checks become
   truthiness checks — sweep every `st.read[...]` usage in `tales.js`).
2. Shelf right rail on ≥1100px (`.tales-rail`): **Continue reading** (per work: next unread
   chapter link), **Recent activity** (last 5 read chapters with relative time — "2 h ago",
   "3 d ago"; if none: "Start a tale to see your progress here."), **Explore** (links: Timeline,
   Compendium (guides#compendium), Quest Tracker). Below 1100px the rail simply doesn't render.
3. Tale cards: if `assets/tales/<workId>.jpg` exists (test with an `Image` onload, same pattern
   as `setWeaponThumb` in `assets/build.js`), render it as a 96px cover left of the card body;
   absent → current layout unchanged (D6).

**Verify:** read a chapter, return to shelf → recent activity shows it with a sane relative
time; old `er-tales` data from before this slice still counts as read (test by hand-writing a
legacy `1` into localStorage); drop any jpg into `assets/tales/` named per a work id and
confirm the cover renders, remove it, confirm clean fallback; 375px clean; tests green.
**Commit (and push):** `feat(tales): reading-tools rail — continue reading, recent activity, explore links; optional cover art slots`

### S8 — Close-out

1. `ROADMAP.md`: log everything shipped under a "2026-08 deck-out" heading; move D2 (reminders)
   to the backlog parking note.
2. `README.md`: one sentence each for search, compendium, timeline under "What's here".
3. Full pass: `node tests/engine.test.js`; open build, atlas, guides (all 5 tabs), tales
   (shelf + timeline + one chapter) once each; `git status` clean; push.
4. Post the full **deviation log** (see below) and a hand-test script for Dan (6–8 clicks).

**Commit (and push):** `docs: roadmap + README — guides/tales deck-out shipped`

---

## Do-not-touch (absolute)

- `src/engine.js` math and `tests/engine.test.js` frozen values — nothing in this plan needs them.
- `data/weapons/**`, `data/presets.json`, `data/buffs.json`, `data/stat-effects.json`.
- `tales/content/**` — Dan's writing. Read it; never edit it.
- Existing localStorage keys' existing fields (additive only per D8). Step ids in `quests.json`.
- The calculator and atlas pages entirely (except the shared `assets/app.css`, where you only append).
- No build step, no npm, no frameworks, no external CDNs.

## Stop-and-ask triggers (the ONLY reasons to contact Dan)

1. Checkpoints 1–3 (mandatory stops defined above).
2. wiki.gg blocks scraping entirely (zero images retrievable) — ask before trying any other source.
3. Anything would require editing a file on the do-not-touch list.
4. You believe a D-decision is wrong on the evidence — present the evidence, don't act on it.

Everything else: execute without asking.

## Deviation log (required)

At every checkpoint and at close-out, report: where the plan was unclear or wrong and what you
did; every R1 judgment call; every wiki title that needed manual resolution; every ripple
beyond a slice's predicted footprint. Silent deviations are the failure mode this section exists
to prevent.

## Parking lot (explicitly NOT in scope)

- Reminders/notifications (D2). Accounts, sync, backend anything.
- Per-step regions; region maps (that's ROADMAP T8).
- Compendium "go big" long-form entries; generated or scraped cover art (D6).
- Any calculator/atlas feature work.
