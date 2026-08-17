#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalLinks, sitemapLocations, validate } = require('../scripts/validate-static-site');

const ROOT = path.resolve(__dirname, '..');
const excluded = new Set(['node_modules', '.git', '.claude', 'test-results', 'playwright-report']);
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function withFixture(mutate, check) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'er-static-contract-'));
  const watched = ['index.html', 'sitemap.xml'].map(file => path.join(ROOT, file));
  const before = watched.map(digest);
  try {
    fs.cpSync(ROOT, fixture, { recursive:true, filter: source => !excluded.has(path.basename(source)) });
    mutate(fixture);
    check(fixture);
  } finally {
    // Fixture names are generated in the OS temp directory; production files are read-only.
    fs.rmSync(fixture, { recursive:true, force:true, maxRetries:3 });
    assert.deepStrictEqual(watched.map(digest), before, 'static mutations leave the real checkout byte-for-byte unchanged');
  }
}

assert.deepStrictEqual(canonicalLinks('<!-- <link rel="canonical" href="https://elden-ring-build-calc.vercel.app/"> -->'), [], 'commented canonical markup is inactive');
assert.deepStrictEqual(sitemapLocations('<!-- <loc>https://elden-ring-build-calc.vercel.app/</loc> -->'), [], 'commented sitemap locations are inactive');
const reordered = canonicalLinks('<link HREF="https://elden-ring-build-calc.vercel.app/" REL="alternate CANONICAL">');
assert.strictEqual(reordered.length, 1, 'canonical rel token matching is case-insensitive and attribute-order independent');
assert.strictEqual(reordered[0].href, 'https://elden-ring-build-calc.vercel.app/', 'canonical parser retains reordered href attributes');

withFixture((fixture) => {
  const file = path.join(fixture, 'index.html');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(/<link\s+rel="canonical"\s+href="https:\/\/elden-ring-build-calc\.vercel\.app\/">/i, match => `<!-- ${match} -->`));
}, (fixture) => {
  const failures = validate(fixture).failures;
  assert(failures.some(failure => failure === 'sitemap route has no matching authored rel=canonical page: /'), 'commented homepage canonical causes the sitemap/canonical contract to fail');
});
withFixture((fixture) => {
  const file = path.join(fixture, 'sitemap.xml');
  const source = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, source.replace(/<url><loc>https:\/\/elden-ring-build-calc\.vercel\.app\/<\/loc>[\s\S]*?<\/url>/, match => `<!-- ${match} -->`));
}, (fixture) => {
  const failures = validate(fixture).failures;
  assert(failures.some(failure => failure === 'canonical authored route is missing from sitemap: /'), 'commented homepage sitemap entry causes the canonical/sitemap contract to fail');
});

console.log('static-site active-node mutation checks passed in isolated OS-temp fixtures');
