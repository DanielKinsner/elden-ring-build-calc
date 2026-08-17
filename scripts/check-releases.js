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
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
[
  { id:'gold-and-shadow', label:'Film III', chapters:17 },
  { id:'kindling', label:'KINDLING', chapters:9 },
  { id:'ranni', label:'Film II', chapters:22 }
].forEach((film) => {
  const release = releases.releases && releases.releases[film.id];
  assert(release, film.label + ' release record exists');
  assert(['production', 'live'].includes(release.status), film.label + ' status is production or live');
  assert(typeof release.youtubeId === 'string', film.label + ' YouTube ID is explicit');
  if (release.status === 'live') {
    assert(/^[A-Za-z0-9_-]{11}$/.test(release.youtubeId), film.label + ' live release has a valid 11-character YouTube ID');
    assert(/^\d{4}-\d{2}-\d{2}/.test(release.published || ''), film.label + ' live release has a publication date');
  }
  const work = (tales.works || []).find((item) => item.id === film.id);
  assert(work && work.companion === film.id, film.label + ' written work points back to its film companion');
  assert(work.chapters.length === film.chapters, film.label + ' companion exposes all written sections');
  assert(sitemap.includes('/' + film.id + '/'), 'sitemap includes ' + film.label);
});
console.log('\nRelease manifest passed');
