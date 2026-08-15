# Film release switch

`data/releases.json` is the source of truth for Archive films. The KINDLING companion page is complete before publication and deliberately shows an in-production state until its YouTube record is made live.

## Publish KINDLING

Change only the `kindling` release record:

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

The switch automatically replaces the production frame with a privacy-enhanced YouTube embed, changes both watch calls to action, updates the homepage ribbon, and emits `VideoObject` structured data.

Before pushing `main`:

```sh
node scripts/check-releases.js
node scripts/check-refs.js
node tests/engine.test.js
```

After Vercel reports Ready, open `/kindling/`, play the embed, check the homepage ribbon, and test the YouTube description link in a private browser window.
