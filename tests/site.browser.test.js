#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';
const ORIGIN = process.env.ER_SITE_ORIGIN || new URL(BASE).origin;
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);

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
    }
    await page.goto(new URL('/build/', ORIGIN).toString(), { waitUntil:'networkidle' });
    await page.locator('#stats .stat').first().waitFor();
    for (const label of ['Character', 'Loadout', 'Damage', 'Defense', 'Magic', 'Encounter', 'Advanced / Trace']) {
      await page.getByRole('tab', { name:label, exact:true }).click();
      assert(await page.getByRole('tab', { name:label, exact:true }).getAttribute('aria-selected') === 'true', `Build ${label} view remains reachable`);
    }
    assert(failures.length === 0, 'all local browser requests return below HTTP 400 and raise no page errors');
    console.log('Browser local-asset and HTTP validation passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack); process.exit(1); });
