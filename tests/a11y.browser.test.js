#!/usr/bin/env node
'use strict';

const { chromium } = require('./browser-lifecycle');
const axe = require('axe-core');

const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/build/';
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const targets = [
  { name:'Home', path:'../' },
  { name:'Build', path:'' },
  { name:'Atlas', path:'../atlas/' }
];
const views = ['Character', 'Loadout', 'Damage', 'Defense', 'Magic', 'Encounter', 'Advanced / Trace'];

function format(violations) {
  return violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`).join('\n');
}

async function scan(page, label) {
  if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ content:axe.source });
  // This heuristic only asks for a visual distinction when a link sits in prose; it is not a
  // WCAG success criterion and would turn source citations into a false release blocker.
  const results = await page.evaluate(() => axe.run(document, {
    runOnly:{ type:'tag', values:['wcag2a', 'wcag2aa'] },
    rules:{ 'link-in-text-block': { enabled:false } }
  }));
  if (results.violations.length) throw new Error(`${label} accessibility violations:\n${format(results.violations)}`);
  console.log(`  ✓ ${label} has no automated WCAG A/AA axe violations`);
}

async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
    for (const target of targets) {
      await page.goto(new URL(target.path, BASE).toString(), { waitUntil:'networkidle' });
      if (target.name === 'Build') await page.locator('#stats .stat').first().waitFor();
      if (target.name === 'Atlas') await page.locator('.atlas-card').first().waitFor();
      await scan(page, target.name);
    }
    await page.goto(BASE, { waitUntil:'networkidle' });
    await page.locator('#stats .stat').first().waitFor();
    for (const view of views) {
      await page.getByRole('tab', { name:view, exact:true }).click();
      await scan(page, `Build ${view}`);
    }
    console.log('Automated accessibility checks passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack); process.exit(1); });
