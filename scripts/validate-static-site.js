#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./static-server');

const CANONICAL_ORIGIN = 'https://elden-ring-build-calc.vercel.app';
const ignored = new Set(['node_modules', '.git', '.claude']);
const failures = [];

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function localTarget(value, from) {
  if (!value || value.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(value)) return null;
  const bare = value.split('#')[0].split('?')[0];
  if (!bare) return null;
  const candidate = bare.startsWith('/') ? path.resolve(ROOT, '.' + bare) : path.resolve(path.dirname(from), bare);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return 'outside-site';
  try { return fs.statSync(candidate).isDirectory() ? path.join(candidate, 'index.html') : candidate; }
  catch (_) { return candidate; }
}

function checkLocalReferences(file) {
  const source = fs.readFileSync(file, 'utf8');
  const expression = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = expression.exec(source))) {
    const target = localTarget(match[1], file);
    if (target === 'outside-site') failures.push(`${path.relative(ROOT, file)} references outside the static site: ${match[1]}`);
    else if (target && !fs.existsSync(target)) failures.push(`${path.relative(ROOT, file)} has missing local reference: ${match[1]}`);
  }
}

const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
if (!locations.length) failures.push('sitemap.xml contains no <loc> entries');
const sitemapPaths = new Set();
for (const location of locations) {
  let parsed;
  try { parsed = new URL(location); } catch (_) { failures.push(`sitemap has an invalid URL: ${location}`); continue; }
  if (parsed.origin !== CANONICAL_ORIGIN) failures.push(`sitemap URL is not canonical: ${location}`);
  if (parsed.search || parsed.hash) failures.push(`sitemap URL must be a clean local route: ${location}`);
  const route = parsed.pathname;
  if (sitemapPaths.has(route)) failures.push(`sitemap route is duplicated: ${route}`);
  sitemapPaths.add(route);
  const page = path.resolve(ROOT, '.' + route, 'index.html');
  if (!fs.existsSync(page)) failures.push(`sitemap route has no local index page: ${route}`);
}

for (const file of walk(ROOT).filter(file => /\.(?:html|css)$/i.test(file))) checkLocalReferences(file);

if (failures.length) {
  console.error(`Static-site validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error('  - ' + failure));
  process.exit(1);
}
console.log(`Static-site validation passed: ${locations.length} canonical sitemap routes and local HTML/CSS references resolve.`);
