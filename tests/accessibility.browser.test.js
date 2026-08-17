'use strict';

/* Focused production-browser accessibility regression checks for Build Lab and Atlas. */
const assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.ER_SITE_URL || 'http://127.0.0.1:4173/';

function ok(value, message) { assert(value, message); console.log('  ✓ ' + message); }
async function dimensions(page) { return page.evaluate(() => ({ scroll:document.documentElement.scrollWidth, inner:innerWidth })); }
async function keyActivate(page, locator, label) {
  await locator.focus();
  ok(await locator.evaluate((element) => document.activeElement === element), 'keyboard focus reaches ' + label);
  await page.keyboard.press('Enter');
}
async function functionalContrast(page) {
  return page.evaluate(() => {
    const channel = (color) => (color.match(/\d+(?:\.\d+)?/g) || []).slice(0, 3).map(Number);
    const linear = (value) => { value /= 255; return value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4); };
    const luminance = (rgb) => .2126 * linear(rgb[0]) + .7152 * linear(rgb[1]) + .0722 * linear(rgb[2]);
    const contrast = (foreground, background) => {
      const a = luminance(channel(foreground)), b = luminance(background);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    return ['.weapon-atlas-link', '.ar-label', '.buff-cat'].map((selector) => {
      const element = document.querySelector(selector);
      return { selector, color:getComputedStyle(element).color, ratio:contrast(getComputedStyle(element).color, [17, 14, 10]) };
    });
  });
}

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
    ok(await desktop.getByRole('link', { name:/Open Weapon Atlas/ }).count() > 0, 'icon-only navigation has an explicit durable name');
    ok(await desktop.locator('[role=tab]').evaluateAll((tabs) => tabs.every((tab) => tab.id && tab.getAttribute('aria-controls') && document.getElementById(tab.getAttribute('aria-controls')))), 'Build tabs point to real tabpanels');
    ok(await desktop.locator('[role=tabpanel]').evaluateAll((panels) => panels.every((panel) => panel.id && panel.getAttribute('aria-labelledby') && document.getElementById(panel.getAttribute('aria-labelledby')))), 'Build tabpanels point back to their tabs');
    await desktop.locator('#build-view-tab-character').focus(); await desktop.keyboard.press('ArrowRight');
    ok(await desktop.evaluate(() => document.activeElement.id === 'build-view-tab-loadout' && document.querySelector('[role=tab][aria-selected=true]').id === 'build-view-tab-loadout'), 'Build view navigation supports ArrowRight');
    ok(await desktop.locator('.rack-slot-main').evaluateAll((items) => items.length === 6 && items.every((item) => item.tagName === 'BUTTON' && item.getAttribute('aria-label'))), 'generated rack controls are real named buttons');

    const emptyLeft = desktop.locator('.rack-slot-main[data-rack-hand="left"][data-rack-index="0"]');
    await keyActivate(desktop, emptyLeft, 'an empty armament rack slot');
    await desktop.getByRole('tab', { name:'Damage' }).waitFor({ state:'visible' });
    await desktop.waitForFunction(() => document.activeElement === document.querySelector('#weaponSearch'));
    await desktop.locator('#weaponSearch').fill('Longsword');
    const longsword = desktop.getByRole('button', { name:'Equip Longsword', exact:true });
    await longsword.waitFor();
    await keyActivate(desktop, longsword, 'a generated weapon search result');
    ok(await desktop.locator('#weaponName').textContent() === 'Longsword', 'keyboard activates generated weapon picker choices');
    await desktop.getByRole('tab', { name:'Loadout' }).click();
    await keyActivate(desktop, desktop.locator('.rack-slot-main[data-rack-hand="right"][data-rack-index="0"]'), 'an occupied armament rack slot');
    const rack = desktop.locator('.rack-slot', { has:desktop.locator('.rack-clear[data-rack-hand="left"][data-rack-index="0"]') });
    const main = rack.locator('.rack-slot-main');
    const rackBox = await rack.boundingBox(), mainBox = await main.boundingBox();
    ok(mainBox.width >= rackBox.width - 2 && mainBox.height >= rackBox.height - 2, 'armament main button covers the full rack rectangle');
    const unequip = desktop.getByRole('button', { name:'Unequip Longsword from Left Hand 1', exact:true });
    await keyActivate(desktop, unequip, 'the named Unequip action');
    ok(await desktop.locator('.rack-slot-main[data-rack-hand="left"][data-rack-index="0"]').getAttribute('aria-label') === 'Left Hand 1: empty', 'keyboard Unequip clears the selected armament');

    console.log('  … checking generated analysis, suggestions, and actions');
    await desktop.getByRole('tab', { name:'Advanced / Trace' }).click();
    console.log('  … Advanced view selected');
    const statChoice = desktop.locator('#byStat button[data-stat]').first();
    const statName = (await statChoice.getAttribute('aria-label')).replace('View ', '').replace(' soft-cap analysis', '');
    console.log('  … ' + statName + ' choice resolved');
    await keyActivate(desktop, statChoice, 'a generated stat-analysis choice');
    console.log('  … ' + statName + ' choice activated');
    ok((await desktop.locator('#softcapHeader').textContent()).indexOf(statName) >= 0, 'keyboard activates generated stat-analysis choices');
    await desktop.getByRole('tab', { name:'Damage' }).click();
    const suggestion = desktop.locator('#suggest .sug-select').first();
    const suggestionName = (await suggestion.getAttribute('aria-label')).replace('Equip suggested weapon ', '');
    await keyActivate(desktop, suggestion, 'a suggested weapon choice');
    ok(await desktop.locator('#weaponName').textContent() === suggestionName, 'keyboard activates suggested weapon choices');
    ok(await desktop.getByRole('link', { name:'Open ' + suggestionName + ' in Weapon Atlas', exact:true }).count() === 1, 'suggested Weapon Atlas link has a weapon-specific name');

    await desktop.getByRole('tab', { name:'Advanced / Trace' }).click();
    await desktop.locator('#addCompare').click();
    const removeCompare = desktop.getByRole('button', { name:'Remove ' + suggestionName + ' from comparison', exact:true });
    await removeCompare.waitFor();
    await keyActivate(desktop, removeCompare, 'a named comparison removal action');
    ok(!(await desktop.locator('.compare-bar').evaluate((bar) => bar.classList.contains('show'))), 'keyboard comparison removal changes live state');

    desktop.once('dialog', (dialog) => dialog.accept('Keyboard a11y save'));
    await keyActivate(desktop, desktop.getByRole('button', { name:'Save', exact:true }), 'the Save action');
    await desktop.getByRole('tab', { name:'Character' }).click();
    const deleteSave = desktop.getByRole('button', { name:'Delete saved build Keyboard a11y save', exact:true });
    await deleteSave.waitFor();
    desktop.once('dialog', (dialog) => dialog.accept());
    await keyActivate(desktop, deleteSave, 'a named saved-build delete action');
    ok(await desktop.getByRole('button', { name:'Delete saved build Keyboard a11y save', exact:true }).count() === 0, 'saved-build delete is a separate named keyboard action');

    const focusStyle = await desktop.locator('#stat-vig-number').evaluate((element) => { element.focus(); const style = getComputedStyle(element); return { outline:style.outlineStyle, width:parseFloat(style.outlineWidth) }; });
    ok(focusStyle.outline !== 'none' && focusStyle.width >= 2, 'Build number inputs receive a keyboard-visible focus treatment');
    const contrast = await functionalContrast(desktop);
    ok(contrast.every((item) => item.ratio >= 4.5), 'functional Build text clears 4.5:1 contrast on its rendered dark surface');

    console.log('  … checking Build mobile geometry and motion');
    const mobile = await browser.newPage({ viewport:{ width:390, height:844 } });
    await mobile.goto(new URL('build/', BASE).toString(), { waitUntil:'domcontentloaded' }); await mobile.locator('#stats .stat').first().waitFor();
    const buildSize = await dimensions(mobile);
    ok(buildSize.scroll <= buildSize.inner, '390px Build has no horizontal overflow');
    ok(await mobile.locator('#summarySave, #build-view-tab-character, #stat-vig-number').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 40)), 'critical Build mobile controls meet the 40px target');
    await mobile.locator('#stat-vig-number').focus(); await mobile.keyboard.press('Tab');
    ok(await mobile.evaluate(() => { const item = document.activeElement, box = item.getBoundingClientRect(); return item.matches('a,button,input,select,textarea') && !item.closest('[hidden]') && box.width > 0 && box.height > 0; }), '390px Build keyboard walk keeps focus on a visible interactive control');
    await mobile.emulateMedia({ reducedMotion:'reduce' }); await mobile.reload({ waitUntil:'domcontentloaded' }); await mobile.locator('#stats .stat').first().waitFor();
    ok(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches && Number.parseFloat(getComputedStyle(document.querySelector('.build-page .panel')).animationDuration) <= .001 && Number.parseFloat(getComputedStyle(document.querySelector('.rack-slot')).transitionDuration) <= .001), 'Build suppresses animation and transition motion');

    console.log('  … checking Atlas semantics, geometry, and motion');
    await desktop.goto(new URL('atlas/', BASE).toString(), { waitUntil:'domcontentloaded' }); await desktop.locator('.atlas-card').first().waitFor();
    ok(await desktop.locator('h1').count() === 1 && await desktop.locator('h1').textContent() === 'Weapon Atlas', 'Atlas has exactly one correct h1');
    ok(await desktop.locator('h2.atlas-type-header').count() > 0 && await desktop.locator('#atlasSearch').getAttribute('aria-label') === 'Search weapons', 'Atlas generated sections are h2 headings and its search is named');
    ok(await desktop.locator('.atlas-chip').evaluateAll((chips) => chips.every((chip) => chip.hasAttribute('aria-pressed'))), 'Atlas filter controls expose toggle state');
    const atlasTabs = desktop.locator('.atlas-tab');
    ok(await atlasTabs.evaluateAll((tabs) => tabs.every((tab) => tab.getAttribute('aria-pressed') === 'true' || tab.getAttribute('aria-pressed') === 'false')), 'Atlas attack filters expose pressed state');
    await keyActivate(desktop, atlasTabs.nth(1), 'an Atlas attack filter');
    ok(await atlasTabs.nth(1).getAttribute('aria-pressed') === 'true', 'keyboard activation updates Atlas attack-filter state');
    ok(await desktop.locator('.atlas-tab').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height < 40)), 'Atlas desktop filters retain compact desktop geometry');

    await mobile.emulateMedia({ reducedMotion:'no-preference' }); await mobile.goto(new URL('atlas/', BASE).toString(), { waitUntil:'domcontentloaded' }); await mobile.locator('.atlas-card').first().waitFor();
    const atlasSize = await dimensions(mobile);
    ok(atlasSize.scroll <= atlasSize.inner, '390px Atlas has no horizontal overflow');
    ok(await mobile.locator('#atlasSearch, .atlas-tab, .atlas-chip').evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 40)), 'critical Atlas mobile controls meet the 40px target');
    await mobile.locator('#atlasSearch').focus(); await mobile.keyboard.press('Tab');
    ok(await mobile.evaluate(() => { const item = document.activeElement, box = item.getBoundingClientRect(); return item.matches('a,button,input,select,textarea') && !item.closest('[hidden]') && box.width > 0 && box.height > 0; }), '390px Atlas keyboard walk keeps focus on a visible interactive control');
    await mobile.emulateMedia({ reducedMotion:'reduce' }); await mobile.reload({ waitUntil:'domcontentloaded' }); await mobile.locator('.atlas-card').first().waitFor();
    ok(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches && Number.parseFloat(getComputedStyle(document.querySelector('.atlas-card')).transitionDuration) <= .001), 'Atlas suppresses transition motion');
    console.log('\nAccessibility browser assertions passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
