#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const releases = JSON.parse(fs.readFileSync(path.join(root, 'data/releases.json'), 'utf8'));
const tales = JSON.parse(fs.readFileSync(path.join(root, 'data/tales.json'), 'utf8'));

function assert(ok, message) {
  if (!ok) throw new Error(message);
  console.log('  ✓ ' + message);
}

assert(releases.schemaVersion === 1, 'release manifest schema is versioned');
const kindling = releases.releases && releases.releases.kindling;
assert(kindling, 'KINDLING release record exists');
assert(['production', 'live'].includes(kindling.status), 'release status is production or live');
assert(typeof kindling.youtubeId === 'string', 'YouTube ID is explicit');
if (kindling.status === 'live') {
  assert(/^[A-Za-z0-9_-]{11}$/.test(kindling.youtubeId), 'live release has a valid 11-character YouTube ID');
  assert(/^\d{4}-\d{2}-\d{2}/.test(kindling.published || ''), 'live release has a publication date');
}
const work = (tales.works || []).find((item) => item.id === 'kindling');
assert(work && work.companion === 'kindling', 'written work points back to its film companion');
assert(work.chapters.length === 9, 'film companion exposes all nine written movements');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
assert(sitemap.includes('/kindling/'), 'sitemap includes the film companion');
console.log('\nRelease manifest passed');
