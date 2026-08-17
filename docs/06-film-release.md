# Film release switch

`data/releases.json` is the source of truth for Archive films. Each companion page is complete before publication and deliberately shows an in-production state until its YouTube record is made live.

## Publish a film

Change only the relevant release record (`kindling` for Film I or `ranni` for Film II):

```json
{
  "status": "live",
  "youtubeId": "THE_11_CHAR_ID",
  "published": "2026-08-14",
  "duration": "PT18M42S"
}
```

- `youtubeId` must be exactly the 11-character ID, not a full URL.
- `published` is an ISO date or timestamp.
- `duration` is optional Schema.org/ISO 8601 duration metadata.

The switch automatically replaces that film's production frame with a privacy-enhanced YouTube embed, changes its primary call to action, and emits `VideoObject` structured data. KINDLING also updates the Film I homepage ribbon.

Before pushing `main`:

```sh
node scripts/check-releases.js
node scripts/check-refs.js
node tests/engine.test.js
```

After Vercel reports Ready, open the changed companion (`/kindling/` or `/ranni/`), play the embed, and test the YouTube description link in a private browser window. For Film I, also check the homepage ribbon.
