#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('./browser-lifecycle');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';
const ORIGIN = process.env.ER_SITE_ORIGIN || new URL(BASE).origin;
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'weapons', 'manifest.json'), 'utf8'));
const iconPaths = [].concat(manifest.base || [], manifest.dlc || []).flatMap(file => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'weapons', file), 'utf8'))).map(weapon => '/assets/icons/weapons/' + encodeURIComponent(weapon.id) + '.png');

function assert(value, message) {
  if (!value) throw new Error(message);
  console.log('  ✓ ' + message);
}

async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:EXECUTABLE });
  const failures = [];
  try {
    const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === ORIGIN && response.status() >= 400) failures.push(`${response.status()} ${url.pathname}`);
    });
    page.on('pageerror', error => failures.push('page error: ' + error.message));
    for (const route of routes) {
      await page.goto(new URL(route, ORIGIN).toString(), { waitUntil:'networkidle' });
      assert(await page.locator('body').count() === 1, `canonical route ${route} renders a document`);
      const desktop = await page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
      assert(desktop.scroll <= desktop.inner, `canonical route ${route} has no 1280px horizontal overflow`);
    }
    await page.goto(new URL('/build/', ORIGIN).toString(), { waitUntil:'networkidle' });
    await page.locator('#stats .stat').first().waitFor();
    for (const label of ['Character', 'Loadout', 'Damage', 'Defense', 'Magic', 'Encounter', 'Advanced / Trace']) {
      await page.getByRole('tab', { name:label, exact:true }).click();
      assert(await page.getByRole('tab', { name:label, exact:true }).getAttribute('aria-selected') === 'true', `Build ${label} view remains reachable`);
      const desktop = await page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:window.innerWidth }));
      assert(desktop.scroll <= desktop.inner, `Build ${label} view has no 1280px horizontal overflow`);
    }
    const iconFailures = await page.evaluate(async (paths) => {
      const responses = await Promise.all(paths.map(async path => {
        try { const response = await fetch(path, { cache:'no-store' }); return response.ok ? null : `${response.status} ${path}`; }
        catch (error) { return `${path}: ${error.message}`; }
      }));
      return responses.filter(Boolean);
    }, iconPaths);
    assert(iconFailures.length === 0, `all ${iconPaths.length} generated Atlas icon URLs return HTTP success${iconFailures.length ? ': ' + iconFailures.slice(0, 8).join(', ') : ''}`);
    assert(failures.length === 0, 'all local browser requests return below HTTP 400 and raise no page errors');
    console.log('Browser local-asset and HTTP validation passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack); process.exit(1); });
