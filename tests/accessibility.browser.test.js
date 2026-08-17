'use strict';

/* Focused Build/Atlas accessibility checks. Task 4 pins the Playwright runtime;
 * this file follows the existing configurable browser-test adapter. */
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/';

function ok(value, message) { assert(value, message); console.log('  ✓ ' + message); }
async function dimensions(page) { return page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:innerWidth })); }

(async function main() {
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH || undefined });
  try {
    const desktop = await browser.newPage({ viewport:{ width:1280, height:900 } });
    await desktop.goto(new URL('build/', BASE).toString(), { waitUntil:'domcontentloaded' });
    await desktop.locator('#stats .stat').first().waitFor();
    ok(await desktop.locator('h1').count() === 1 && await desktop.locator('h1').textContent() === 'Full Build Lab', 'Build has exactly one correct h1');
    ok(await desktop.locator('h2').count() > 4, 'Build retains h2 sections beneath its h1');
    const stats = await desktop.locator('#stats .stat').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('input')).map((input) => ({ id:input.id, name:input.name, label:input.getAttribute('aria-label') }))));
    ok(stats.length === 8 && stats.every((pair) => pair.length === 2 && pair.every((input) => input.id && input.name && input.label) && pair[0].label !== pair[1].label), 'stat range and number inputs have durable distinct names');
    ok(await desktop.locator('input[type=search]').evaluateAll((inputs) => inputs.every((input) => input.getAttribute('aria-label'))), 'all Build searches have accessible names');
    ok(await desktop.locator('button,a').evaluateAll((items) => items.filter((item) => !item.closest('[hidden]')).every((item) => (item.getAttribute('aria-label') || item.textContent).trim())), 'visible Build actions have accessible names');
    ok(await desktop.locator('[role=tab]').evaluateAll((tabs) => tabs.every((tab) => tab.id && tab.getAttribute('aria-controls') && document.getElementById(tab.getAttribute('aria-controls')))), 'Build tabs point to real tabpanels');
    ok(await desktop.locator('[role=tabpanel]').evaluateAll((panels) => panels.every((panel) => panel.id && panel.getAttribute('aria-labelledby') && document.getElementById(panel.getAttribute('aria-labelledby')))), 'Build tabpanels point back to their tabs');
    await desktop.locator('#build-view-tab-character').focus(); await desktop.keyboard.press('ArrowRight');
    ok(await desktop.evaluate(() => document.activeElement.id === 'build-view-tab-loadout' && document.querySelector('[role=tab][aria-selected=true]').id === 'build-view-tab-loadout'), 'Build view navigation supports ArrowRight');
    ok(await desktop.locator('.rack-slot-main').evaluateAll((items) => items.length === 6 && items.every((item) => item.tagName === 'BUTTON' && item.getAttribute('aria-label'))), 'generated rack controls are real named buttons');

    const mobile = await browser.newPage({ viewport:{ width:390, height:844 } });
    await mobile.goto(new URL('build/', BASE).toString(), { waitUntil:'domcontentloaded' }); await mobile.locator('#stats .stat').first().waitFor();
    const buildSize = await dimensions(mobile);
    ok(buildSize.scroll <= buildSize.inner, '390px Build has no horizontal overflow');
    ok(await mobile.locator('#summarySave, #build-view-tab-character, #stat-vig-number').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 40)), 'critical Build mobile controls meet the 40px target');
    await mobile.emulateMedia({ reducedMotion:'reduce' }); await mobile.reload({ waitUntil:'domcontentloaded' }); await mobile.locator('#stats .stat').first().waitFor();
    ok(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches && Number.parseFloat(getComputedStyle(document.querySelector('.build-page .panel')).animationDuration) <= .001 && Number.parseFloat(getComputedStyle(document.querySelector('.rack-slot')).transitionDuration) <= .001), 'Build suppresses animation and transition motion');

    await desktop.goto(new URL('atlas/', BASE).toString(), { waitUntil:'domcontentloaded' }); await desktop.locator('.atlas-card').first().waitFor();
    ok(await desktop.locator('h1').count() === 1 && await desktop.locator('h1').textContent() === 'Weapon Atlas', 'Atlas has exactly one correct h1');
    ok(await desktop.locator('h2.atlas-type-header').count() > 0 && await desktop.locator('#atlasSearch').getAttribute('aria-label') === 'Search weapons', 'Atlas generated sections are h2 headings and its search is named');
    ok(await desktop.locator('.atlas-chip').evaluateAll((chips) => chips.every((chip) => chip.hasAttribute('aria-pressed'))), 'Atlas filter controls expose toggle state');
    await mobile.emulateMedia({ reducedMotion:'no-preference' }); await mobile.goto(new URL('atlas/', BASE).toString(), { waitUntil:'domcontentloaded' }); await mobile.locator('.atlas-card').first().waitFor();
    const atlasSize = await dimensions(mobile);
    ok(atlasSize.scroll <= atlasSize.inner, '390px Atlas has no horizontal overflow');
    ok(await mobile.locator('#atlasSearch, .atlas-tab, .atlas-chip').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 40)), 'critical Atlas mobile controls meet the 40px target');
    console.log('\nAccessibility browser assertions passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
