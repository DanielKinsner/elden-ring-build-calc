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
  if (!value || value.startsWith('#') || /^(?:mailto:|tel:|data:|javascript:|\/\/)/i.test(value)) return null;
  let bare = value.split('#')[0].split('?')[0];
  if (!bare) return null;
  if (/^https?:/i.test(bare)) {
    const parsed = new URL(bare);
    if (parsed.origin !== CANONICAL_ORIGIN) return null;
    bare = parsed.pathname;
  }
  const candidate = bare.startsWith('/') ? path.resolve(ROOT, '.' + bare) : path.resolve(path.dirname(from), bare);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return 'outside-site';
  try { return fs.statSync(candidate).isDirectory() ? path.join(candidate, 'index.html') : candidate; }
  catch (_) { return candidate; }
}

function checkReference(value, file, kind) {
  const target = localTarget(value, file);
  if (target === 'outside-site') failures.push(`${path.relative(ROOT, file)} ${kind} escapes the static site: ${value}`);
  else if (target && !fs.existsSync(target)) failures.push(`${path.relative(ROOT, file)} has missing ${kind}: ${value}`);
}

function checkLocalReferences(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\.css$/i.test(file)) {
    const urls = /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi;
    let match; while ((match = urls.exec(source))) checkReference(match[2].trim(), file, 'CSS url() reference');
    return;
  }
  const attributes = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let match; while ((match = attributes.exec(source))) checkReference(match[1], file, 'HTML/metadata reference');
  const metas = [...source.matchAll(/<meta\b[^>]*>/gi)].filter(match => /\b(?:property|name)\s*=\s*["'](?:og|twitter):(?!card|title|description|type|site_name|image:width|image:height)[^"']+["']/i.test(match[0]));
  for (const meta of metas) {
    const content = meta[0].match(/\bcontent\s*=\s*["']([^"']+)["']/i);
    if (content) checkReference(content[1], file, 'local metadata reference');
  }
}

function canonicalForPage(file) {
  const source = fs.readFileSync(file, 'utf8');
  const links = [...source.matchAll(/<link\b[^>]*>/gi)].filter(match => /\brel\s*=\s*["']canonical["']/i.test(match[0]));
  if (!links.length) return null;
  if (links.length !== 1) {
    failures.push(`${path.relative(ROOT, file)} must have exactly one rel=canonical link (found ${links.length})`);
    return null;
  }
  const href = links[0][0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
  if (!href) { failures.push(`${path.relative(ROOT, file)} canonical link has no href`); return null; }
  let parsed;
  try { parsed = new URL(href[1]); } catch (_) { failures.push(`${path.relative(ROOT, file)} canonical href is invalid: ${href[1]}`); return null; }
  if (parsed.origin !== CANONICAL_ORIGIN || parsed.search || parsed.hash) failures.push(`${path.relative(ROOT, file)} canonical must be a clean ${CANONICAL_ORIGIN} URL: ${href[1]}`);
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  const expected = relative === 'index.html' ? '/' : '/' + relative.replace(/\/index\.html$/, '/');
  if (parsed.pathname !== expected) failures.push(`${path.relative(ROOT, file)} canonical route ${parsed.pathname} must match authored route ${expected}`);
  return parsed.pathname;
}

function setDifference(left, right) { return [...left].filter(value => !right.has(value)); }

function validateWeaponIconContract() {
  const data = path.join(ROOT, 'data', 'weapons');
  const manifest = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8'));
  const weapons = [].concat(manifest.base || [], manifest.dlc || []).flatMap(file => JSON.parse(fs.readFileSync(path.join(data, file), 'utf8')));
  const ids = weapons.map(weapon => weapon.id);
  if (ids.length !== 448 || new Set(ids).size !== ids.length) failures.push(`weapon icon contract requires 448 unique weapon ids (found ${ids.length}/${new Set(ids).size})`);
  for (const id of ids) {
    const icon = path.join(ROOT, 'assets', 'icons', 'weapons', id + '.png');
    if (!fs.existsSync(icon)) failures.push(`generated Atlas icon is missing for ${id}: assets/icons/weapons/${id}.png`);
  }
  return ids.length;
}

const allFiles = walk(ROOT);
const htmlFiles = allFiles.filter(file => /\.html$/i.test(file));
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
if (!locations.length) failures.push('sitemap.xml contains no <loc> entries');
const sitemapPaths = new Set();
for (const location of locations) {
  let parsed;
  try { parsed = new URL(location); } catch (_) { failures.push(`sitemap has an invalid URL: ${location}`); continue; }
  if (parsed.origin !== CANONICAL_ORIGIN) failures.push(`sitemap URL is not canonical: ${location}`);
  if (parsed.search || parsed.hash) failures.push(`sitemap URL must be a clean local route: ${location}`);
  if (sitemapPaths.has(parsed.pathname)) failures.push(`sitemap route is duplicated: ${parsed.pathname}`);
  sitemapPaths.add(parsed.pathname);
}

const authoredCanonicalPaths = new Set(htmlFiles.map(canonicalForPage).filter(Boolean));
for (const route of setDifference(authoredCanonicalPaths, sitemapPaths)) failures.push(`canonical authored route is missing from sitemap: ${route}`);
for (const route of setDifference(sitemapPaths, authoredCanonicalPaths)) failures.push(`sitemap route has no matching authored rel=canonical page: ${route}`);
for (const file of allFiles.filter(file => /\.(?:html|css)$/i.test(file))) checkLocalReferences(file);
const iconCount = validateWeaponIconContract();

if (failures.length) {
  console.error(`Static-site validation failed with ${failures.length} issue(s):`);
  failures.forEach(failure => console.error('  - ' + failure));
  process.exit(1);
}
console.log(`Static-site validation passed: ${locations.length} sitemap routes exactly match authored canonical links; local HTML/CSS/metadata references and ${iconCount} generated Atlas icons resolve.`);
