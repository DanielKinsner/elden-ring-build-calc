#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT: DEFAULT_ROOT } = require('./static-server');

const CANONICAL_ORIGIN = 'https://elden-ring-build-calc.vercel.app';
const ignored = new Set(['node_modules', '.git', '.claude']);

function stripComments(source) { return source.replace(/<!--[\s\S]*?-->/g, ''); }

function attributes(tag) {
  const values = {};
  const expression = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = expression.exec(tag); // opening element name
  while ((match = expression.exec(tag))) values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return values;
}

function activeTags(source, name) {
  return [...stripComments(source).matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))];
}

function canonicalLinks(source) {
  return activeTags(source, 'link').map(match => attributes(match[0])).filter(attrs => (attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
}

function sitemapLocations(source) {
  return [...stripComments(source).matchAll(/<loc\b[^>]*>\s*([\s\S]*?)\s*<\/loc\s*>/gi)].map(match => match[1]);
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function localTarget(value, from, root) {
  if (!value || value.startsWith('#') || /^(?:mailto:|tel:|data:|javascript:|\/\/)/i.test(value)) return null;
  let bare = value.split('#')[0].split('?')[0];
  if (!bare) return null;
  if (/^https?:/i.test(bare)) {
    const parsed = new URL(bare);
    if (parsed.origin !== CANONICAL_ORIGIN) return null;
    bare = parsed.pathname;
  }
  const candidate = bare.startsWith('/') ? path.resolve(root, '.' + bare) : path.resolve(path.dirname(from), bare);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return 'outside-site';
  try { return fs.statSync(candidate).isDirectory() ? path.join(candidate, 'index.html') : candidate; }
  catch (_) { return candidate; }
}

function validate(root = DEFAULT_ROOT) {
  const failures = [];
  function failure(message) { failures.push(message); }
  function checkReference(value, file, kind) {
    const target = localTarget(value, file, root);
    if (target === 'outside-site') failure(`${path.relative(root, file)} ${kind} escapes the static site: ${value}`);
    else if (target && !fs.existsSync(target)) failure(`${path.relative(root, file)} has missing ${kind}: ${value}`);
  }
  function checkLocalReferences(file) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    if (/\.css$/i.test(file)) {
      const urls = /url\(\s*(['"]?)([^'"\)]+)\1\s*\)/gi;
      let match; while ((match = urls.exec(source))) checkReference(match[2].trim(), file, 'CSS url() reference');
      return;
    }
    for (const tag of activeTags(source, '[a-z][a-z0-9-]*')) {
      const attrs = attributes(tag[0]);
      for (const key of ['href', 'src']) if (attrs[key]) checkReference(attrs[key], file, 'HTML reference');
      const metadata = (attrs.property || attrs.name || '').toLowerCase();
      if (/^(?:og|twitter):(?!card$|title$|description$|type$|site_name$|image:width$|image:height$)/.test(metadata) && attrs.content) checkReference(attrs.content, file, 'local metadata reference');
    }
  }
  function canonicalForPage(file) {
    const links = canonicalLinks(fs.readFileSync(file, 'utf8'));
    if (!links.length) return null;
    if (links.length !== 1) { failure(`${path.relative(root, file)} must have exactly one rel=canonical link (found ${links.length})`); return null; }
    if (!links[0].href) { failure(`${path.relative(root, file)} canonical link has no href`); return null; }
    let parsed;
    try { parsed = new URL(links[0].href); } catch (_) { failure(`${path.relative(root, file)} canonical href is invalid: ${links[0].href}`); return null; }
    if (parsed.origin !== CANONICAL_ORIGIN || parsed.search || parsed.hash) failure(`${path.relative(root, file)} canonical must be a clean ${CANONICAL_ORIGIN} URL: ${links[0].href}`);
    const relative = path.relative(root, file).replace(/\\/g, '/');
    const expected = relative === 'index.html' ? '/' : '/' + relative.replace(/\/index\.html$/, '/');
    if (parsed.pathname !== expected) failure(`${path.relative(root, file)} canonical route ${parsed.pathname} must match authored route ${expected}`);
    return parsed.pathname;
  }
  function setDifference(left, right) { return [...left].filter(value => !right.has(value)); }
  function validateWeaponIconContract() {
    const data = path.join(root, 'data', 'weapons');
    const manifest = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8'));
    const weapons = [].concat(manifest.base || [], manifest.dlc || []).flatMap(file => JSON.parse(fs.readFileSync(path.join(data, file), 'utf8')));
    const ids = weapons.map(weapon => weapon.id);
    if (ids.length !== 448 || new Set(ids).size !== ids.length) failure(`weapon icon contract requires 448 unique weapon ids (found ${ids.length}/${new Set(ids).size})`);
    for (const id of ids) if (!fs.existsSync(path.join(root, 'assets', 'icons', 'weapons', id + '.png'))) failure(`generated Atlas icon is missing for ${id}: assets/icons/weapons/${id}.png`);
    return ids.length;
  }

  const allFiles = walk(root);
  const htmlFiles = allFiles.filter(file => /\.html$/i.test(file));
  const locations = sitemapLocations(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'));
  if (!locations.length) failure('sitemap.xml contains no active <loc> entries');
  const sitemapPaths = new Set();
  for (const location of locations) {
    let parsed;
    try { parsed = new URL(location); } catch (_) { failure(`sitemap has an invalid URL: ${location}`); continue; }
    if (parsed.origin !== CANONICAL_ORIGIN) failure(`sitemap URL is not canonical: ${location}`);
    if (parsed.search || parsed.hash) failure(`sitemap URL must be a clean local route: ${location}`);
    if (sitemapPaths.has(parsed.pathname)) failure(`sitemap route is duplicated: ${parsed.pathname}`);
    sitemapPaths.add(parsed.pathname);
  }
  const authoredCanonicalPaths = new Set(htmlFiles.map(canonicalForPage).filter(Boolean));
  for (const route of setDifference(authoredCanonicalPaths, sitemapPaths)) failure(`canonical authored route is missing from sitemap: ${route}`);
  for (const route of setDifference(sitemapPaths, authoredCanonicalPaths)) failure(`sitemap route has no matching authored rel=canonical page: ${route}`);
  for (const file of allFiles.filter(file => /\.(?:html|css)$/i.test(file))) checkLocalReferences(file);
  const iconCount = validateWeaponIconContract();
  return { failures, locations, iconCount };
}

if (require.main === module) {
  const result = validate();
  if (result.failures.length) {
    console.error(`Static-site validation failed with ${result.failures.length} issue(s):`);
    result.failures.forEach(failure => console.error('  - ' + failure));
    process.exit(1);
  }
  console.log(`Static-site validation passed: ${result.locations.length} active sitemap routes exactly match authored canonical links; local HTML/CSS/metadata references and ${result.iconCount} generated Atlas icons resolve.`);
}

module.exports = { stripComments, attributes, canonicalLinks, sitemapLocations, validate };
