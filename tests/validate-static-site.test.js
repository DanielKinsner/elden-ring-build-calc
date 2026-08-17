#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { canonicalLinks, sitemapLocations, validate } = require('../scripts/validate-static-site');

const ROOT = path.resolve(__dirname, '..');

function withMutation(file, mutate, check) {
  const original = fs.readFileSync(file, 'utf8');
  try { fs.writeFileSync(file, mutate(original)); check(); }
  finally { fs.writeFileSync(file, original); }
}

assert.deepStrictEqual(canonicalLinks('<!-- <link rel="canonical" href="https://elden-ring-build-calc.vercel.app/"> -->'), [], 'commented canonical markup is inactive');
assert.deepStrictEqual(sitemapLocations('<!-- <loc>https://elden-ring-build-calc.vercel.app/</loc> -->'), [], 'commented sitemap locations are inactive');
const reordered = canonicalLinks('<link HREF="https://elden-ring-build-calc.vercel.app/" REL="alternate CANONICAL">');
assert.strictEqual(reordered.length, 1, 'canonical rel token matching is case-insensitive and attribute-order independent');
assert.strictEqual(reordered[0].href, 'https://elden-ring-build-calc.vercel.app/', 'canonical parser retains reordered href attributes');

withMutation(path.join(ROOT, 'index.html'), source => source.replace(/<link\s+rel="canonical"\s+href="https:\/\/elden-ring-build-calc\.vercel\.app\/">/i, match => `<!-- ${match} -->`), () => {
  const failures = validate(ROOT).failures;
  assert(failures.some(failure => failure === 'sitemap route has no matching authored rel=canonical page: /'), 'commented homepage canonical causes the sitemap/canonical contract to fail');
});
withMutation(path.join(ROOT, 'sitemap.xml'), source => source.replace(/<url><loc>https:\/\/elden-ring-build-calc\.vercel\.app\/<\/loc>[\s\S]*?<\/url>/, match => `<!-- ${match} -->`), () => {
  const failures = validate(ROOT).failures;
  assert(failures.some(failure => failure === 'canonical authored route is missing from sitemap: /'), 'commented homepage sitemap entry causes the canonical/sitemap contract to fail');
});

console.log('static-site active-node mutation checks passed');
